use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use reqwest_cookie_store::CookieStoreMutex;
use scraper::{Html, Selector};

use crate::config::AppConfig;
use crate::error::{AppError, Result, with_retry};

/// HTTP 客户端封装，支持 cookie 管理和重试
#[derive(Clone)]
pub struct HttpClient {
    client: Client,
    #[allow(dead_code)]
    cookie_store: Arc<CookieStoreMutex>,
    config: Arc<AppConfig>,
}

impl HttpClient {
    /// 创建新的 HTTP 客户端（优化版本）
    pub fn new(config: Arc<AppConfig>) -> Result<Self> {
        let cookie_store = Arc::new(CookieStoreMutex::new(
            reqwest_cookie_store::CookieStore::default(),
        ));

        let client = Client::builder()
            .timeout(config.request_timeout)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36")
            .cookie_provider(Arc::clone(&cookie_store))
            // 启用 gzip 和 brotli 压缩（减少传输数据量）
            .gzip(true)
            .brotli(true)
            // 连接池配置（性能优化）
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            // TCP 优化
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            // 连接超时
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| AppError::Config(format!("创建 HTTP 客户端失败: {}", e)))?;

        Ok(Self {
            client,
            cookie_store,
            config,
        })
    }

    /// 获取登录页面并提取 salt
    pub async fn get_salt(&self) -> Result<String> {
        let url = format!("{}loginExt.action", self.config.base_url);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(AppError::Fetch {
                message: format!("获取登录页面失败，状态码: {}", response.status()),
            });
        }

        let html = response.text().await?;
        let document = Html::parse_document(&html);

        // 查找包含 salt 的 script 标签
        let script_selector = Selector::parse("script").map_err(|e| {
            AppError::Other(format!("解析 script 选择器失败: {:?}", e))
        })?;

        for script in document.select(&script_selector) {
            if let Some(text) = script.text().next()
                && let Some(salt) = extract_salt_from_script(text) {
                    return Ok(salt);
                }
        }

        Err(AppError::SaltExtractionFailed)
    }

    /// 登录教务系统
    pub async fn login(&self, username: &str, password: &str) -> Result<()> {
        use sha1::{Digest, Sha1};

        // 获取 salt
        let salt = with_retry(
            &self.config.retry_config,
            || async { self.get_salt().await },
            "获取 salt",
        )
        .await?;

        // 与原版一致：获取 salt 后等待 1 秒
        tokio::time::sleep(Duration::from_secs(1)).await;

        // 计算密码哈希
        let password_with_salt = format!("{}-{}", salt, password);
        let mut hasher = Sha1::new();
        hasher.update(password_with_salt.as_bytes());
        let hashed_password = hex::encode(hasher.finalize());

        // 发送登录请求
        let url = format!("{}loginExt.action", self.config.base_url);
        let params = [
            ("username", username),
            ("password", &hashed_password),
        ];

        let response = self
            .client
            .post(&url)
            .form(&params)
            .send()
            .await?;

        // 检查登录是否成功（通过重定向判断）
        let final_url = response.url().to_string();
        if final_url.contains("homeExt.action") {
            tracing::debug!("登录成功");
            Ok(())
        } else {
            tracing::error!("登录失败，URL: {}", final_url);
            Err(AppError::LoginFailed {
                reason: "登录失败，未重定向到主页。请检查用户名或密码。".to_string(),
            })
        }
    }

    /// 查询空闲教室
    pub async fn search_free_classrooms(
        &self,
        date: &str,
        time_begin: u8,
        time_end: u8,
    ) -> Result<Vec<RawClassroomEntry>> {
        let url = format!(
            "{}classroom/apply/free!search.action",
            self.config.base_url
        );

        let params = [
            ("classroom.building.id", ""),
            ("cycleTime.dateBegin", date),
            ("cycleTime.dateEnd", date),
            ("timeBegin", &time_begin.to_string()),
            ("timeEnd", &time_end.to_string()),
            ("pageSize", "1000"),
            ("classroom.type.id", ""),
            ("classroom.campus.id", ""),
            ("seats", ""),
            ("classroom.name", ""),
            ("cycleTime.cycleCount", "1"),
            ("cycleTime.cycleType", "1"),
            ("roomApplyTimeType", "0"),
        ];

        let response = self.client.post(&url).form(&params).send().await?;

        if !response.status().is_success() {
            return Err(AppError::Fetch {
                message: format!(
                    "查询空闲教室失败，状态码: {}",
                    response.status()
                ),
            });
        }

        let html = response.text().await?;
        self.parse_classroom_html(&html)
    }

    /// 解析教室查询返回的 HTML
    fn parse_classroom_html(&self, html: &str) -> Result<Vec<RawClassroomEntry>> {
        let document = Html::parse_document(html);
        let mut results = Vec::new();

        // 查找表格
        let table_selector = Selector::parse("table.gridtable").map_err(|e| {
            AppError::Other(format!("解析表格选择器失败: {:?}", e))
        })?;

        let table = match document.select(&table_selector).next() {
            Some(t) => t,
            None => {
                tracing::warn!("未找到结果表格");
                return Ok(results);
            }
        };

        // 获取表头
        let th_selector = Selector::parse("thead th").map_err(|e| {
            AppError::Other(format!("解析表头选择器失败: {:?}", e))
        })?;

        let headers: Vec<String> = table
            .select(&th_selector)
            .map(|th| th.text().collect::<String>().trim().to_string())
            .collect();

        // 获取数据行
        let tr_selector = Selector::parse("tbody tr").map_err(|e| {
            AppError::Other(format!("解析行选择器失败: {:?}", e))
        })?;

        let td_selector = Selector::parse("td").map_err(|e| {
            AppError::Other(format!("解析单元格选择器失败: {:?}", e))
        })?;

        for row in table.select(&tr_selector) {
            let mut entry = serde_json::Map::new();

            for (j, cell) in row.select(&td_selector).enumerate() {
                let header = headers
                    .get(j)
                    .cloned()
                    .unwrap_or_else(|| format!("column{}", j + 1));
                let value = cell.text().collect::<String>().trim().to_string();
                entry.insert(header, serde_json::Value::String(value));
            }

            if !entry.is_empty() {
                results.push(RawClassroomEntry(entry));
            }
        }

        Ok(results)
    }

    /// 延迟一段时间
    pub async fn delay(&self) {
        tokio::time::sleep(self.config.request_delay).await;
    }
}

/// 原始教室条目（从 HTML 解析）
#[derive(Debug, Clone)]
pub struct RawClassroomEntry(pub serde_json::Map<String, serde_json::Value>);

impl RawClassroomEntry {
    /// 获取字段值
    pub fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|v| v.as_str())
    }

    /// 转换为 RawClassroomData
    pub fn to_raw_classroom_data(&self, time_slot: String) -> Result<crate::models::RawClassroomData> {
        let building = self.get("教学楼").unwrap_or("").to_string();
        let name = self.get("名称").unwrap_or("").to_string();
        let capacity = self.get("容量").unwrap_or("0").to_string();
        let equipment_config = self.get("教室设备配置").unwrap_or("").to_string();
        let campus = self.get("校区").map(|s| s.to_string());
        let sequence_number = self.get("序号").map(|s| s.to_string());

        Ok(crate::models::RawClassroomData {
            building,
            name,
            capacity,
            equipment_config,
            campus,
            sequence_number,
            time_slot: Some(time_slot),
            extra: HashMap::new(),
        })
    }
}

use std::collections::HashMap;

/// 从 script 文本中提取 salt
fn extract_salt_from_script(text: &str) -> Option<String> {
    // 匹配模式: CryptoJS.SHA1('salt_value-' + form['password'].value)
    let re = regex::Regex::new(r"CryptoJS\.SHA1\('([^']+)-' \+ form\['password'\]\.value\)").ok()?;

    re.captures(text)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_salt() {
        let script = r#"
            var password = CryptoJS.SHA1('abc123-' + form['password'].value);
        "#;
        let salt = extract_salt_from_script(script);
        assert_eq!(salt, Some("abc123".to_string()));
    }

    #[test]
    fn test_extract_salt_no_match() {
        let script = r#"var x = 1;"#;
        let salt = extract_salt_from_script(script);
        assert_eq!(salt, None);
    }

    #[test]
    fn test_raw_classroom_entry() {
        let mut map = serde_json::Map::new();
        map.insert("教学楼".to_string(), serde_json::Value::String("工学馆".to_string()));
        map.insert("名称".to_string(), serde_json::Value::String("101".to_string()));
        map.insert("容量".to_string(), serde_json::Value::String("60".to_string()));
        map.insert("教室设备配置".to_string(), serde_json::Value::String("普通教室".to_string()));

        let entry = RawClassroomEntry(map);
        assert_eq!(entry.get("教学楼"), Some("工学馆"));
        assert_eq!(entry.get("名称"), Some("101"));

        let data = entry.to_raw_classroom_data("1-2".to_string()).unwrap();
        assert_eq!(data.building, "工学馆");
        assert_eq!(data.time_slot, Some("1-2".to_string()));
    }
}

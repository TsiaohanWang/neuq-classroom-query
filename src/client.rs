use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use reqwest_cookie_store::CookieStoreMutex;
use scraper::{Html, Selector};

use crate::config::AppConfig;
use crate::error::{AppError, Result, with_retry};
use crate::webvpn::WebvpnSession;

/// HTTP 客户端封装，支持 cookie 管理和重试
#[derive(Clone)]
pub struct HttpClient {
    client: Client,
    #[allow(dead_code)]
    cookie_store: Arc<CookieStoreMutex>,
    config: Arc<AppConfig>,
    /// WebVPN 会话（未启用时所有方法自动退化为直连）
    webvpn: Arc<WebvpnSession>,
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

        let webvpn = Arc::new(WebvpnSession::new(client.clone(), Arc::clone(&config)));

        Ok(Self {
            client,
            cookie_store,
            config,
            webvpn,
        })
    }

    /// 确保 WebVPN 已登录（幂等，未启用时为空操作）
    async fn ensure_webvpn_login(&self) -> Result<()> {
        self.webvpn.ensure_login().await
    }

    /// 将教务系统 URL 转换为实际请求 URL（未启用 WebVPN 时原样返回）
    fn proxied(&self, url: &str) -> Result<String> {
        self.webvpn.proxied(url)
    }

    /// 检测响应是否被重定向回 WebVPN 登录页；是则重新登录并返回 true
    ///
    /// 用于长时间运行中 WebVPN 会话过期的自动恢复（调用方应重试请求）。
    async fn recover_webvpn_session_if_kicked(&self, html: &str) -> Result<bool> {
        self.webvpn.recover_if_kicked(html).await
    }

    /// 获取登录页面并提取 salt
    pub async fn get_salt(&self) -> Result<String> {
        self.ensure_webvpn_login().await?;

        let url = self.proxied(&format!("{}loginExt.action", self.config.base_url))?;

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(AppError::Fetch {
                message: format!("获取登录页面失败，状态码: {}", response.status()),
            });
        }

        let html = response.text().await?;

        // WebVPN 会话失效自动恢复：被重定向回登录页则重登录后重试一次
        let html = if self.recover_webvpn_session_if_kicked(&html).await? {
            let response = self.client.get(&url).send().await?;
            if !response.status().is_success() {
                return Err(AppError::Fetch {
                    message: format!("获取登录页面失败，状态码: {}", response.status()),
                });
            }
            response.text().await?
        } else {
            html
        };

        let document = Html::parse_document(&html);

        // 查找包含 salt 的 script 标签
        let script_selector = Selector::parse("script")
            .map_err(|e| AppError::Other(format!("解析 script 选择器失败: {:?}", e)))?;

        for script in document.select(&script_selector) {
            if let Some(text) = script.text().next()
                && let Some(salt) = extract_salt_from_script(text)
            {
                return Ok(salt);
            }
        }

        Err(AppError::SaltExtractionFailed)
    }

    /// 登录教务系统
    pub async fn login(&self, username: &str, password: &str) -> Result<()> {
        use sha1::{Digest, Sha1};

        self.ensure_webvpn_login().await?;

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
        let url = self.proxied(&format!("{}loginExt.action", self.config.base_url))?;
        let params = [("username", username), ("password", &hashed_password)];

        let response = self.client.post(&url).form(&params).send().await?;

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
        self.ensure_webvpn_login().await?;

        let url = self.proxied(&format!(
            "{}classroom/apply/free!search.action",
            self.config.base_url
        ))?;

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
                message: format!("查询空闲教室失败，状态码: {}", response.status()),
            });
        }

        let mut html = response.text().await?;

        // WebVPN 会话失效自动恢复：被重定向回登录页则重登录后重试一次
        if self.recover_webvpn_session_if_kicked(&html).await? {
            let response = self.client.post(&url).form(&params).send().await?;
            if !response.status().is_success() {
                return Err(AppError::Fetch {
                    message: format!("查询空闲教室失败，状态码: {}", response.status()),
                });
            }
            html = response.text().await?;
        }

        // 二次防护：仍被重定向到登录页时绝不能当作“空结果”处理，
        // 否则会把缺失时段误写成合法的空数据
        if WebvpnSession::is_login_page(&html) {
            return Err(AppError::Fetch {
                message: "响应被重定向到 WebVPN 登录页，会话恢复失败".to_string(),
            });
        }

        self.parse_classroom_html(&html)
    }

    /// 解析教室查询返回的 HTML
    ///
    /// 注意：响应中必须有 `gridtable` 结果表格；缺失说明响应异常
    /// （会话失效的登录页、服务端错误页等），返回错误而非空结果，
    /// 以免把异常响应误写成合法的“无空闲教室”数据。
    /// 表格存在但没有数据行，才是合法的空结果。
    fn parse_classroom_html(&self, html: &str) -> Result<Vec<RawClassroomEntry>> {
        let document = Html::parse_document(html);
        let mut results = Vec::new();

        // 查找表格；未找到说明响应异常，不能静默当作空结果
        let table_selector = Selector::parse("table.gridtable")
            .map_err(|e| AppError::Other(format!("解析表格选择器失败: {:?}", e)))?;

        let table = match document.select(&table_selector).next() {
            Some(t) => t,
            None => {
                // 附带响应特征，便于诊断异常响应的来源
                let snippet = html_snippet(&html);
                return Err(AppError::Fetch {
                    message: format!("响应中未找到结果表格（可能是登录页或错误页），响应特征: {}", snippet),
                });
            }
        };

        // 获取表头
        let th_selector = Selector::parse("thead th")
            .map_err(|e| AppError::Other(format!("解析表头选择器失败: {:?}", e)))?;

        let headers: Vec<String> = table
            .select(&th_selector)
            .map(|th| th.text().collect::<String>().trim().to_string())
            .collect();

        // 获取数据行
        let tr_selector = Selector::parse("tbody tr")
            .map_err(|e| AppError::Other(format!("解析行选择器失败: {:?}", e)))?;

        let td_selector = Selector::parse("td")
            .map_err(|e| AppError::Other(format!("解析单元格选择器失败: {:?}", e)))?;

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

/// 提取 HTML 响应的特征摘要（标题 + 去除标签后的前 150 字符）
fn html_snippet(html: &str) -> String {
    let title = regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>")
        .ok()
        .and_then(|re| re.captures(html))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim())
        .unwrap_or("");

    let text_re = regex::Regex::new(r"(?s)<[^>]*>")
        .ok()
        .map(|re| re.replace_all(html, " ").to_string())
        .unwrap_or_default();
    let text: String = text_re
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(150)
        .collect();

    if title.is_empty() && text.is_empty() {
        return "（空响应）".to_string();
    }
    format!("title='{}' 正文='{}'", title, text)
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
    pub fn to_raw_classroom_data(
        &self,
        time_slot: String,
    ) -> Result<crate::models::RawClassroomData> {
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
    let re =
        regex::Regex::new(r"CryptoJS\.SHA1\('([^']+)-' \+ form\['password'\]\.value\)").ok()?;

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
        map.insert(
            "教学楼".to_string(),
            serde_json::Value::String("工学馆".to_string()),
        );
        map.insert(
            "名称".to_string(),
            serde_json::Value::String("101".to_string()),
        );
        map.insert(
            "容量".to_string(),
            serde_json::Value::String("60".to_string()),
        );
        map.insert(
            "教室设备配置".to_string(),
            serde_json::Value::String("普通教室".to_string()),
        );

        let entry = RawClassroomEntry(map);
        assert_eq!(entry.get("教学楼"), Some("工学馆"));
        assert_eq!(entry.get("名称"), Some("101"));

        let data = entry.to_raw_classroom_data("1-2".to_string()).unwrap();
        assert_eq!(data.building, "工学馆");
        assert_eq!(data.time_slot, Some("1-2".to_string()));
    }
}

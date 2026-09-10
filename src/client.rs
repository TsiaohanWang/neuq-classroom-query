use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use reqwest::header::{ORIGIN, REFERER};
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
    /// WebVPN 会话初始化守卫（仅初始化一次）
    webvpn_init: Arc<tokio::sync::OnceCell<()>>,
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
            webvpn_init: Arc::new(tokio::sync::OnceCell::new()),
        })
    }

    /// 将教务系统 URL 转换为实际请求 URL（未启用 WebVPN 时原样返回）
    fn proxied(&self, url: &str) -> Result<String> {
        if self.config.webvpn_enabled {
            crate::webvpn::build_resource_url(&self.config.webvpn_base_url, url)
        } else {
            Ok(url.to_string())
        }
    }

    /// 确保 WebVPN 已登录（幂等，整个客户端生命周期内仅登录一次）
    async fn ensure_webvpn_login(&self) -> Result<()> {
        if !self.config.webvpn_enabled {
            return Ok(());
        }
        self.webvpn_init
            .get_or_try_init(|| async { self.webvpn_login().await.map(|_| ()) })
            .await?;
        Ok(())
    }

    /// 登录学校 WebVPN（深澜 srun wengine 系统）
    async fn webvpn_login(&self) -> Result<()> {
        match self.config.webvpn_auth_type.as_str() {
            "cas" => self.webvpn_login_cas().await,
            "local" => self.webvpn_login_local().await,
            other => Err(AppError::Config(format!(
                "未知的 WEBVPN_AUTH_TYPE: '{}'（可选值：cas / local）",
                other
            ))),
        }
    }

    /// 确保已通过指纹检查（伪造 FingerprintJS 指纹）
    async fn ensure_webvpn_fingerprint(&self) -> Result<()> {
        let base = self.config.webvpn_base_url.trim_end_matches('/');
        let fp = crate::webvpn::fake_fingerprint();
        let fp_url = format!("{}/set-fingerprint?fingerprint={}", base, fp);
        self.client.get(&fp_url).send().await?;
        Ok(())
    }

    /// 通过统一身份认证（CAS，金智 authserver）登录 WebVPN
    async fn webvpn_login_cas(&self) -> Result<()> {
        let base = self.config.webvpn_base_url.trim_end_matches('/');
        let login_url = format!("{}/login?cas_login=true", base);

        // 请求登录页；若被重定向到指纹检查页则伪造指纹后重取
        let mut response = self.client.get(&login_url).send().await?;
        let mut action = response.url().to_string();
        let mut html = response.text().await?;
        if html.contains("/set-fingerprint") {
            tracing::debug!("WebVPN 需要浏览器指纹，伪造 fingerprint 后重试");
            self.ensure_webvpn_fingerprint().await?;
            response = self.client.get(&login_url).send().await?;
            action = response.url().to_string();
            html = response.text().await?;
        }

        // 若已经处于登录态（例如 cookie 仍有效），会直接进入门户页
        if !html.contains("casLoginForm") {
            tracing::info!("WebVPN 会话仍然有效，无需重新登录");
            return Ok(());
        }

        // 表单 action 即当前页面 URL（经过 WebVPN 代理的 authserver 登录地址）

        // 解析金智 authserver 登录页参数
        let salt = extract_hidden_or_js(&html, "pwdDefaultEncryptSalt")
            .ok_or_else(|| AppError::Fetch {
                message: "统一身份认证登录页解析失败：未找到密码加密盐".to_string(),
            })?;
        let lt = extract_hidden_input(&html, "lt").ok_or_else(|| AppError::Fetch {
            message: "统一身份认证登录页解析失败：未找到 lt".to_string(),
        })?;
        let execution = extract_hidden_input(&html, "execution")
            .ok_or_else(|| AppError::Fetch {
                message: "统一身份认证登录页解析失败：未找到 execution".to_string(),
            })?;

        let encrypted_password =
            crate::webvpn::encrypt_cas_password(&self.config.webvpn_password, &salt)?;

        let params = [
            ("username", self.config.webvpn_username.as_str()),
            ("password", encrypted_password.as_str()),
            ("lt", lt.as_str()),
            ("dllt", "userNamePasswordLogin"),
            ("execution", execution.as_str()),
            ("_eventId", "submit"),
            ("rmShown", "1"),
        ];

        let response = self
            .client
            .post(&action)
            .header(REFERER, &action)
            .header(ORIGIN, base)
            .form(&params)
            .send()
            .await?;

        let final_url = response.url().to_string();
        let body = response.text().await?;

        // 失败时 authserver 会重新渲染登录页；成功时会重定向回 WebVPN 门户
        if final_url.contains("authserver") || body.contains("casLoginForm") {
            let reason = extract_cas_error(&body).unwrap_or_else(|| {
                "未知原因（可能用户名或密码错误，或需要验证码）".to_string()
            });
            return Err(AppError::LoginFailed {
                reason: format!("统一身份认证（CAS）登录失败: {}", reason),
            });
        }

        tracing::info!("WebVPN 登录成功（统一身份认证）");
        Ok(())
    }

    /// 通过 WebVPN 本地账号登录（深澜 /do-login 接口）
    async fn webvpn_login_local(&self) -> Result<()> {
        let base = self.config.webvpn_base_url.trim_end_matches('/');
        let login_url = format!("{}/login", base);

        let response = self.client.get(&login_url).send().await?;
        let mut html = response.text().await?;

        if html.contains("/set-fingerprint") {
            tracing::debug!("WebVPN 需要浏览器指纹，伪造 fingerprint 后重试");
            self.ensure_webvpn_fingerprint().await?;
            let response = self.client.get(&login_url).send().await?;
            html = response.text().await?;
        }

        let csrf = extract_csrf(&html).ok_or_else(|| AppError::Fetch {
            message: "WebVPN 登录页解析失败：未找到 _csrf 字段".to_string(),
        })?;

        #[derive(serde::Deserialize)]
        struct DoLoginResponse {
            success: bool,
            #[serde(default)]
            url: String,
            #[serde(default)]
            error: String,
            #[serde(default)]
            message: String,
        }

        let params = [
            ("_csrf", csrf.as_str()),
            ("auth_type", "local"),
            ("username", self.config.webvpn_username.as_str()),
            ("password", self.config.webvpn_password.as_str()),
            ("needCaptcha", "false"),
        ];

        let response = self
            .client
            .post(format!("{}/do-login", base))
            .header(REFERER, &login_url)
            .header(ORIGIN, base)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(AppError::Fetch {
                message: format!("WebVPN 登录请求失败，状态码: {}", response.status()),
            });
        }

        let resp: DoLoginResponse = response.json().await?;
        if !resp.success {
            // 频率限制是瞬时的，冷却后再走可重试错误，由重试机制退避后重试
            if resp.error == "TOO_MANY_ATTEMPTS" || resp.message.contains("稍后") {
                tracing::warn!("WebVPN 登录被限流，冷却 30s 后重试");
                tokio::time::sleep(Duration::from_secs(30)).await;
                return Err(AppError::Fetch {
                    message: format!(
                        "WebVPN 登录被限流（同一 IP 短时间内登录过多）: {}",
                        resp.message
                    ),
                });
            }
            return Err(AppError::LoginFailed {
                reason: format!(
                    "WebVPN 登录失败: {} ({})。注意 WebVPN 通常使用统一身份认证密码，可能与教务系统密码不同。",
                    resp.message, resp.error
                ),
            });
        }

        // 登录成功后访问跳转目标以完成会话建立
        if !resp.url.is_empty() {
            let finish_url = if resp.url.starts_with("http") {
                resp.url.clone()
            } else {
                format!("{}{}", base, resp.url)
            };
            self.client.get(&finish_url).send().await?;
        }

        tracing::info!("WebVPN 登录成功");
        Ok(())
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

        let html = response.text().await?;
        self.parse_classroom_html(&html)
    }

    /// 解析教室查询返回的 HTML
    fn parse_classroom_html(&self, html: &str) -> Result<Vec<RawClassroomEntry>> {
        let document = Html::parse_document(html);
        let mut results = Vec::new();

        // 查找表格
        let table_selector = Selector::parse("table.gridtable")
            .map_err(|e| AppError::Other(format!("解析表格选择器失败: {:?}", e)))?;

        let table = match document.select(&table_selector).next() {
            Some(t) => t,
            None => {
                tracing::warn!("未找到结果表格");
                return Ok(results);
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

/// 从 WebVPN 登录页 HTML 中提取 _csrf 隐藏字段
fn extract_csrf(html: &str) -> Option<String> {
    let re = regex::Regex::new(r#"name="_csrf"\s+value="([^"]+)""#).ok()?;
    re.captures(html)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// 从 HTML 提取隐藏 input 的 value：`<input type="hidden" name="xxx" value="yyy">`
fn extract_hidden_input(html: &str, name: &str) -> Option<String> {
    let re = regex::Regex::new(&format!(
        r#"name="{}"\s+value="([^"]+)""#,
        regex::escape(name)
    ))
    .ok()?;
    re.captures(html)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// 提取金智 authserver 页面中的密码加密盐：兼容隐藏字段（name=/id=）与 JS 变量两种形式
fn extract_hidden_or_js(html: &str, name: &str) -> Option<String> {
    let patterns = [
        format!(r#"name="{}"\s+value="([^"]+)""#, regex::escape(name)),
        format!(r#"id="{}"\s+value="([^"]+)""#, regex::escape(name)),
        format!(r#"{}\s*=\s*"([^"]+)""#, regex::escape(name)),
    ];
    for p in patterns {
        if let Ok(re) = regex::Regex::new(&p) {
            if let Some(caps) = re.captures(html) {
                if let Some(m) = caps.get(1) {
                    return Some(m.as_str().to_string());
                }
            }
        }
    }
    None
}

/// 从金智 authserver 错误页提取错误提示（显示在 `<span id="msg" class="errMsg">` 中）
fn extract_cas_error(html: &str) -> Option<String> {
    let patterns = [
        r#"<span[^>]*id="msg"[^>]*>\s*([^<]+?)\s*</span>"#,
        r#"<span[^>]*class="errMsg"[^>]*>\s*([^<]+?)\s*</span>"#,
        r#"id="errorMsg"[^>]*>\s*([^<]+?)\s*</span>"#,
    ];
    for p in patterns {
        if let Ok(re) = regex::Regex::new(p) {
            if let Some(caps) = re.captures(html) {
                if let Some(m) = caps.get(1) {
                    let msg = m.as_str().trim().to_string();
                    if !msg.is_empty() {
                        return Some(msg);
                    }
                }
            }
        }
    }
    None
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
    fn test_extract_csrf() {
        let html = r#"<input type="hidden" name="_csrf" value="Fqm3fH5gZ1FoBTB8j8iHppzNKGU6MTc4OTAwMDY3MjY4MTE3NjU4OA">"#;
        assert_eq!(
            extract_csrf(html),
            Some("Fqm3fH5gZ1FoBTB8j8iHppzNKGU6MTc4OTAwMDY3MjY4MTE3NjU4OA".to_string())
        );
    }

    #[test]
    fn test_extract_csrf_no_match() {
        assert_eq!(extract_csrf("<html></html>"), None);
    }

    #[test]
    fn test_extract_hidden_input() {
        let html = r#"<input type="hidden" name="lt" value="LT-1234-abc-cas"/>
                     <input type="hidden" name="execution" value="e1s1"/>"#;
        assert_eq!(extract_hidden_input(html, "lt"), Some("LT-1234-abc-cas".to_string()));
        assert_eq!(extract_hidden_input(html, "execution"), Some("e1s1".to_string()));
        assert_eq!(extract_hidden_input(html, "missing"), None);
    }

    #[test]
    fn test_extract_hidden_or_js() {
        // 隐藏字段形式（authserver 登录页实际结构）
        let html = r#"<input type="hidden" id="pwdDefaultEncryptSalt" value="nLAFHyKA4h2cJe3r"/>"#;
        assert_eq!(
            extract_hidden_or_js(html, "pwdDefaultEncryptSalt"),
            Some("nLAFHyKA4h2cJe3r".to_string())
        );
        // JS 变量形式（兼容）
        let js = r#"    var pwdDefaultEncryptSalt = "nLAFHyKA4h2cJe3r";"#;
        assert_eq!(
            extract_hidden_or_js(js, "pwdDefaultEncryptSalt"),
            Some("nLAFHyKA4h2cJe3r".to_string())
        );
    }

    #[test]
    fn test_extract_cas_error() {
        // 实测学校 authserver 错误页结构
        let html = r#"<span id="msg" class="errMsg">请输入验证码</span>"#;
        assert_eq!(extract_cas_error(html), Some("请输入验证码".to_string()));

        let html2 = r#"<span id="msg" class="errMsg">
            用户名或密码不正确，您还有 4 次机会
        </span>"#;
        assert_eq!(
            extract_cas_error(html2),
            Some("用户名或密码不正确，您还有 4 次机会".to_string())
        );

        assert_eq!(extract_cas_error("<html></html>"), None);
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

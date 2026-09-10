//! WebVPN 会话管理
//!
//! 负责登录学校 WebVPN（深澜 srun wengine 系统）并维护会话状态：
//!
//! - **CAS 模式**（默认）：通过统一身份认证（金智 authserver）登录，
//!   密码使用登录页携带的随机盐按 [`crate::webvpn::crypto`] 中的算法加密
//! - **local 模式**：使用 WebVPN 本地账号，密码经 `/do-login` 表单提交
//!
//! 会话失效（长时间运行后被网关踢回登录页）时可通过 [`WebvpnSession::recover`]
//! 重新登录。

use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{ORIGIN, REFERER};
use reqwest::Client;

use crate::config::AppConfig;
use crate::error::{AppError, Result};

/// WebVPN 会话
pub struct WebvpnSession {
    client: Client,
    config: Arc<AppConfig>,
    /// 登录状态（true = 已登录）
    logged_in: tokio::sync::Mutex<bool>,
}

impl WebvpnSession {
    /// 创建会话（共享底层 HTTP 客户端，cookie 与主客户端互通）
    pub fn new(client: Client, config: Arc<AppConfig>) -> Self {
        Self {
            client,
            config,
            logged_in: tokio::sync::Mutex::new(false),
        }
    }

    /// 是否启用 WebVPN
    pub fn enabled(&self) -> bool {
        self.config.webvpn_enabled
    }

    /// 确保已登录（幂等，已登录则直接返回）
    pub async fn ensure_login(&self) -> Result<()> {
        if !self.enabled() {
            return Ok(());
        }
        let mut logged = self.logged_in.lock().await;
        if !*logged {
            self.login().await?;
            *logged = true;
        }
        Ok(())
    }

    /// 会话失效后重置登录状态，下次 [`ensure_login`] 会重新登录
    pub async fn invalidate(&self) {
        *self.logged_in.lock().await = false;
    }

    /// 检测页面是否为 WebVPN 登录页（会话失效时教务系统请求会被重定向至此）
    pub fn is_login_page(html: &str) -> bool {
        html.contains("/do-login") || html.contains("/set-fingerprint")
    }

    /// 会话恢复：若页面是 WebVPN 登录页则重新登录并返回 true（调用方应重试请求）
    pub async fn recover_if_kicked(&self, html: &str) -> Result<bool> {
        if !self.enabled() || !Self::is_login_page(html) {
            return Ok(false);
        }
        tracing::warn!("检测到 WebVPN 会话失效，尝试重新登录");
        self.invalidate().await;
        self.ensure_login().await?;
        Ok(true)
    }

    /// 将教务系统 URL 转换为经 WebVPN 代理的 URL（未启用时原样返回）
    pub fn proxied(&self, url: &str) -> Result<String> {
        if !self.enabled() {
            return Ok(url.to_string());
        }
        crate::webvpn::build_resource_url(&self.config.webvpn_base_url, url)
    }

    /// 登录 WebVPN（按配置的认证方式分发）
    async fn login(&self) -> Result<()> {
        match self.config.webvpn_auth_type.as_str() {
            "cas" => self.login_cas().await,
            "local" => self.login_local().await,
            other => Err(AppError::Config(format!(
                "未知的 WEBVPN_AUTH_TYPE: '{}'（可选值：cas / local）",
                other
            ))),
        }
    }

    /// 确保已通过指纹检查（伪造 FingerprintJS 指纹）
    async fn ensure_fingerprint(&self) -> Result<()> {
        let base = self.base_url();
        let fp = crate::webvpn::fake_fingerprint();
        let fp_url = format!("{}/set-fingerprint?fingerprint={}", base, fp);
        self.client.get(&fp_url).send().await?;
        Ok(())
    }

    fn base_url(&self) -> String {
        self.config.webvpn_base_url.trim_end_matches('/').to_string()
    }

    /// 通过统一身份认证（CAS，金智 authserver）登录 WebVPN
    async fn login_cas(&self) -> Result<()> {
        let base = self.base_url();
        let login_url = format!("{}/login?cas_login=true", base);

        // 请求登录页；若被重定向到指纹检查页则伪造指纹后重取
        let mut response = self.client.get(&login_url).send().await?;
        let mut action = response.url().to_string();
        let mut html = response.text().await?;
        if html.contains("/set-fingerprint") {
            tracing::debug!("WebVPN 需要浏览器指纹，伪造 fingerprint 后重试");
            self.ensure_fingerprint().await?;
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
        let salt = extract_hidden_or_js(&html, "pwdDefaultEncryptSalt").ok_or_else(|| {
            AppError::Fetch {
                message: "统一身份认证登录页解析失败：未找到密码加密盐".to_string(),
            }
        })?;
        let lt = extract_hidden_input(&html, "lt").ok_or_else(|| AppError::Fetch {
            message: "统一身份认证登录页解析失败：未找到 lt".to_string(),
        })?;
        let execution = extract_hidden_input(&html, "execution").ok_or_else(|| {
            AppError::Fetch {
                message: "统一身份认证登录页解析失败：未找到 execution".to_string(),
            }
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
            .header(ORIGIN, &base)
            .form(&params)
            .send()
            .await?;

        let final_url = response.url().to_string();
        let body = response.text().await?;

        // 失败时 authserver 会重新渲染登录页；成功时会重定向回 WebVPN 门户
        if final_url.contains("authserver") || body.contains("casLoginForm") {
            let mut reason = extract_cas_error(&body).unwrap_or_else(|| {
                "未知原因（可能用户名或密码错误，或需要验证码）".to_string()
            });
            if reason.contains("验证码") {
                reason.push_str(
                    "（IP 短时间内登录失败次数过多，请稍后重试或更换网络环境）",
                );
            }
            return Err(AppError::LoginFailed {
                reason: format!("统一身份认证（CAS）登录失败: {}", reason),
            });
        }

        tracing::info!("WebVPN 登录成功（统一身份认证）");
        Ok(())
    }

    /// 通过 WebVPN 本地账号登录（深澜 /do-login 接口）
    async fn login_local(&self) -> Result<()> {
        let base = self.base_url();
        let login_url = format!("{}/login", base);

        let response = self.client.get(&login_url).send().await?;
        let mut html = response.text().await?;

        if html.contains("/set-fingerprint") {
            tracing::debug!("WebVPN 需要浏览器指纹，伪造 fingerprint 后重试");
            self.ensure_fingerprint().await?;
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
            .header(ORIGIN, &base)
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
                    "WebVPN 本地账号登录失败: {} ({})。WebVPN 本地账号与统一身份认证账号可能不是同一套，\
                     若不确定请使用默认的 cas 认证方式。",
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
        if let Some(re) = regex::Regex::new(&p).ok()
            && let Some(caps) = re.captures(html)
            && let Some(m) = caps.get(1)
        {
            return Some(m.as_str().to_string());
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
        if let Some(re) = regex::Regex::new(p).ok()
            && let Some(caps) = re.captures(html)
            && let Some(m) = caps.get(1)
        {
            let msg = m.as_str().trim().to_string();
            if !msg.is_empty() {
                return Some(msg);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_is_login_page() {
        assert!(WebvpnSession::is_login_page("<form action='/do-login'>"));
        assert!(WebvpnSession::is_login_page("/set-fingerprint?fingerprint=x"));
        assert!(!WebvpnSession::is_login_page("<html>教学elli空教室查询</html>"));
    }
}

use std::sync::Arc;
use std::time::Duration;

use reqwest::Client;
use reqwest_cookie_store::CookieStoreMutex;
use scraper::{Html, Selector};

use crate::config::AppConfig;
use crate::error::{AppError, Result, with_retry};
use crate::parser::RawClassroomEntry;
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
                && let Some(salt) = crate::parser::extract_salt_from_script(text)
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

        crate::parser::parse_classroom_html(&html)
    }

    /// 延迟一段时间
    pub async fn delay(&self) {
        tokio::time::sleep(self.config.request_delay).await;
    }
}


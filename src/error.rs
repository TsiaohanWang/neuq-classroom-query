use std::time::Duration;

/// 应用程序结果类型别名
pub type Result<T> = std::result::Result<T, AppError>;

/// 应用程序错误类型
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// 网络请求错误
    #[error("网络请求失败: {0}")]
    Network(#[from] reqwest::Error),

    /// HTTP 中间件错误
    #[error("HTTP 中间件错误: {0}")]
    Middleware(#[from] reqwest_middleware::Error),

    /// JSON 序列化/反序列化错误
    #[error("JSON 解析错误: {0}")]
    Json(#[from] serde_json::Error),

    /// IO 错误
    #[error("文件操作失败: {0}")]
    Io(#[from] std::io::Error),

    /// 正则表达式错误
    #[error("正则表达式错误: {0}")]
    Regex(#[from] regex::Error),

    /// 日期时间解析错误
    #[error("日期时间解析错误: {0}")]
    Chrono(#[from] chrono::ParseError),

    /// TOML 解析错误
    #[error("TOML 解析错误: {0}")]
    Toml(#[from] toml::de::Error),

    /// 登录失败
    #[error("登录失败: {reason}")]
    LoginFailed { reason: String },

    /// 数据校验错误
    #[error("数据校验失败: {0}")]
    Validation(String),

    /// 配置错误
    #[error("配置错误: {0}")]
    Config(String),

    /// 数据抓取错误
    #[error("数据抓取失败: {message}")]
    Fetch { message: String },

    /// 数据处理错误
    #[error("数据处理失败: {message}")]
    Process { message: String },

    /// HTML 生成错误
    #[error("HTML 生成失败: {message}")]
    Generate { message: String },

    /// 超过最大重试次数
    #[error("操作失败，已重试 {attempts} 次: {last_error}")]
    MaxRetriesExceeded {
        attempts: u32,
        last_error: String,
    },

    /// 环境变量缺失
    #[error("环境变量 {name} 未设置")]
    EnvVarMissing { name: String },

    /// Salt 提取失败
    #[error("无法从登录页面提取 salt 值")]
    SaltExtractionFailed,

    /// 其他错误
    #[error("{0}")]
    Other(String),
}

/// 重试策略配置
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// 最大重试次数
    pub max_retries: u32,
    /// 初始延迟时间
    pub initial_delay: Duration,
    /// 最大延迟时间
    pub max_delay: Duration,
    /// 退避因子
    pub backoff_factor: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_factor: 2.0,
        }
    }
}

impl RetryConfig {
    /// 计算第 n 次重试的延迟时间（指数退避 + 随机抖动）
    pub fn delay_for_attempt(&self, attempt: u32) -> Duration {
        let base_delay = self.initial_delay.as_secs_f64()
            * self.backoff_factor.powi(attempt as i32);
        let capped_delay = base_delay.min(self.max_delay.as_secs_f64());

        // 添加随机抖动 (±25%)
        let jitter = rand::random::<f64>() * 0.5 - 0.25;
        let final_delay = capped_delay * (1.0 + jitter);

        Duration::from_secs_f64(final_delay.max(0.1))
    }
}

/// 判断错误是否可重试
pub fn is_retryable_error(err: &AppError) -> bool {
    match err {
        AppError::Network(e) => {
            // 网络超时、连接错误等可重试
            e.is_timeout()
                || e.is_connect()
                || e.is_request()
        }
        AppError::Middleware(_) => true,
        AppError::Fetch { .. } => true,
        _ => false,
    }
}

/// 带重试的异步操作执行器
pub async fn with_retry<F, Fut, T>(
    config: &RetryConfig,
    mut operation: F,
    operation_name: &str,
) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut last_error = None;

    for attempt in 0..=config.max_retries {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(err) => {
                if attempt < config.max_retries && is_retryable_error(&err) {
                    let delay = config.delay_for_attempt(attempt);
                    tracing::warn!(
                        "{} 第 {} 次尝试失败: {}，将在 {:?} 后重试",
                        operation_name,
                        attempt + 1,
                        err,
                        delay
                    );
                    last_error = Some(err);
                    tokio::time::sleep(delay).await;
                } else {
                    return Err(err);
                }
            }
        }
    }

    Err(AppError::MaxRetriesExceeded {
        attempts: config.max_retries + 1,
        last_error: last_error
            .map(|e| e.to_string())
            .unwrap_or_else(|| "未知错误".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retry_config_delay() {
        let config = RetryConfig {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_factor: 2.0,
        };

        let delay = config.delay_for_attempt(0);
        assert!(delay.as_secs_f64() > 0.0);
        assert!(delay.as_secs_f64() < 5.0); // 第一次应该很短

        let delay = config.delay_for_attempt(2);
        assert!(delay.as_secs_f64() > 1.0);
    }

    #[test]
    fn test_is_retryable_error() {
        let network_err = AppError::Other("test".to_string());
        assert!(!is_retryable_error(&network_err));

        let fetch_err = AppError::Fetch {
            message: "test".to_string(),
        };
        assert!(is_retryable_error(&fetch_err));
    }
}

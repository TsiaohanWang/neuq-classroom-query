use std::sync::Arc;
use std::time::Duration;

use tokio::fs;

use crate::client::HttpClient;
use crate::config::{AppConfig, TIME_SLOTS};
use crate::error::{Result, with_retry};
use crate::models::RawClassroomData;

const MAX_EMPTY_RETRIES: u8 = 2;

/// WebVPN 模式下各天任务登录的错峰间隔（秒）。
/// WebVPN 网关对同一 IP 短时间内的登录次数有限制（TOO_MANY_ATTEMPTS），
/// 并行登录会触发限流，因此每天任务依次错开启动。
const WEBVPN_LOGIN_STAGGER_SECS: u64 = 15;

/// 数据抓取器
pub struct Fetcher {
    config: Arc<AppConfig>,
}

impl Fetcher {
    pub fn new(config: Arc<AppConfig>) -> Result<Self> {
        Ok(Self { config })
    }

    /// 执行完整的数据抓取流程
    /// 每天使用独立客户端（独立 session），7 天并行抓取
    pub async fn fetch_all(&self) -> Result<()> {
        tracing::info!("--- 数据抓取开始 ---");

        // 为每天创建独立客户端并并行抓取
        let mut handles = Vec::new();

        for day_offset in 0..self.config.total_days {
            let config = Arc::clone(&self.config);

            let handle = tokio::spawn(async move {
                // WebVPN 模式下错峰启动，避免同一 IP 并行登录触发网关限流
                if config.webvpn_enabled && day_offset > 0 {
                    let stagger = day_offset as u64 * WEBVPN_LOGIN_STAGGER_SECS;
                    tracing::info!(
                        "Day {} 错峰等待 {}s 后开始 WebVPN 登录",
                        day_offset,
                        stagger
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(stagger)).await;
                }

                // 每个任务创建独立的客户端（独立 session）
                let client = HttpClient::new(Arc::clone(&config))?;

                // 独立登录
                with_retry(
                    &config.retry_config,
                    || async { client.login(&config.username, &config.password).await },
                    &format!("Day {} 登录", day_offset),
                )
                .await?;

                tracing::info!("Day {} 登录成功，开始抓取", day_offset);

                // 串行抓取该天的所有时段（同一 session 内必须串行）
                fetch_day_data(client, config, day_offset).await
            });

            handles.push(handle);
        }

        // 等待所有天完成
        let mut day_failures: Vec<(u8, String)> = Vec::new();
        for (day_offset, handle) in handles.into_iter().enumerate() {
            match handle.await {
                Ok(Ok(failed)) if failed.is_empty() => {}
                Ok(Ok(failed)) => {
                    // 整天完成但部分时段缺数据（fetch_day_data 内已记录详情）
                    day_failures.push((
                        day_offset as u8,
                        format!("部分时段无数据: {}", failed.join(", ")),
                    ));
                }
                Ok(Err(e)) => day_failures.push((day_offset as u8, e.to_string())),
                Err(e) => day_failures.push((
                    day_offset as u8,
                    crate::error::AppError::Other(format!("任务 panic: {}", e)).to_string(),
                )),
            }
        }

        if !day_failures.is_empty() {
            let details: Vec<String> = day_failures
                .iter()
                .map(|(day, err)| format!("Day {}: {}", day, err))
                .collect();
            tracing::error!(
                "以下整天抓取失败（保留原状，不影响其余天数据）: {}",
                details.join("; ")
            );
        }

        // 可用性保障：只要本次运行有任意一天成功抓到数据，就继续后续处理流程，
        // 避免教务系统偶发故障（如 HTTP 500）导致整个站点构建失败；
        // 只有所有天全部失败时才返回错误。
        let any_data = self.has_any_fresh_data().await;
        if !any_data {
            let error_msg = day_failures
                .iter()
                .map(|(_, err)| err.clone())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(crate::error::AppError::Fetch {
                message: format!("全部数据抓取失败: {}", error_msg),
            });
        }

        tracing::info!("✔ 数据抓取完成");
        Ok(())
    }

    /// 检查输出目录中是否存在本次抓取产生的数据文件
    async fn has_any_fresh_data(&self) -> bool {
        for day in 0..self.config.total_days {
            let day_dir = self.config.output_dir.join(format!("output-day-{}", day));
            if let Ok(mut entries) = fs::read_dir(&day_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("classroom_results_") && name.ends_with(".json") {
                        return true;
                    }
                }
            }
        }
        false
    }
}

/// 带随机抖动的请求间隔（多天并行时错开请求，降低教务系统瞬时压力）
async fn sleep_with_jitter(base: Duration) {
    let jitter = rand::random::<u64>() % 1000;
    tokio::time::sleep(base + Duration::from_millis(jitter)).await;
}

/// 抓取单个时段并保存结果，返回是否获取到数据
async fn fetch_and_save_slot(
    client: &HttpClient,
    day_offset: u8,
    date_str: &str,
    slot: &crate::config::TimeSlot,
    output_dir: &std::path::Path,
) -> Result<bool> {
    let classrooms = client
        .search_free_classrooms(date_str, slot.begin, slot.end)
        .await?;

    if classrooms.is_empty() {
        return Ok(false);
    }

    let raw_data: Vec<RawClassroomData> = classrooms
        .iter()
        .map(|entry| entry.to_raw_classroom_data(slot.file_suffix.to_string()))
        .collect::<Result<Vec<_>>>()?;

    crate::models::validate_batch(&raw_data, &format!("时段 {}", slot.file_suffix))?;

    let file_path = output_dir.join(format!("classroom_results_{}.json", slot.file_suffix));
    let json = serde_json::to_string_pretty(&raw_data)?;
    fs::write(&file_path, json).await?;

    tracing::info!(
        "Day {} {} 保存 {} 条",
        day_offset,
        slot.file_suffix,
        raw_data.len()
    );
    Ok(true)
}

/// 抓取单天数据，带空结果重试队列
///
/// 首轮串行抓取所有时段，若某时段返回空结果（WARN），将其加入重试队列。
/// 首轮结束后，对队列中的时段逐一重试（最多 MAX_EMPTY_RETRIES 次）。
/// 若重试仍失败，记录最终 WARN。
async fn fetch_day_data(
    client: HttpClient,
    config: Arc<AppConfig>,
    day_offset: u8,
) -> Result<Vec<String>> {
    let date_str = get_beijing_date_string(day_offset as i64);

    let output_dir = config.output_dir.join(format!("output-day-{}", day_offset));
    fs::create_dir_all(&output_dir).await?;

    // 首轮：串行抓取所有时段，收集空结果
    let mut failed_slots: Vec<&crate::config::TimeSlot> = Vec::new();

    for slot in TIME_SLOTS {
        sleep_with_jitter(config.request_delay).await;

        match with_retry(
            &config.retry_config,
            || async {
                fetch_and_save_slot(&client, day_offset, &date_str, slot, &output_dir).await
            },
            &format!("Day {} 时段 {}-{}", day_offset, slot.begin, slot.end),
        )
        .await
        {
            Ok(true) => {}
            Ok(false) => {
                tracing::warn!(
                    "Day {} {} 首轮未找到结果表格，稍后重试",
                    day_offset,
                    slot.file_suffix
                );
                failed_slots.push(slot);
            }
            Err(e) => {
                // 单时段失败不阻断同天其余时段的抓取（教务系统偶发 500 等）
                tracing::error!(
                    "Day {} {} 多次重试后仍失败，跳过该时段: {}",
                    day_offset,
                    slot.file_suffix,
                    e
                );
                failed_slots.push(slot);
            }
        }
    }

    // 重试队列
    for attempt in 1..=MAX_EMPTY_RETRIES {
        if failed_slots.is_empty() {
            break;
        }

        tracing::info!(
            "Day {} 重试第 {} 轮，剩余 {} 个时段",
            day_offset,
            attempt,
            failed_slots.len()
        );

        let mut still_failed: Vec<&crate::config::TimeSlot> = Vec::new();

        for slot in &failed_slots {
            sleep_with_jitter(config.request_delay).await;

            match with_retry(
                &config.retry_config,
                || async {
                    fetch_and_save_slot(&client, day_offset, &date_str, slot, &output_dir).await
                },
                &format!(
                    "Day {} 时段 {}-{} (重试{})",
                    day_offset, slot.begin, slot.end, attempt
                ),
            )
            .await
            {
                Ok(true) => {
                    tracing::info!("Day {} {} 重试成功", day_offset, slot.file_suffix);
                }
                Ok(false) => {
                    still_failed.push(slot);
                }
                Err(e) => {
                    // 单时段失败不阻断同天其余时段的抓取
                    tracing::error!(
                        "Day {} {} (重试{}) 多次重试后仍失败: {}",
                        day_offset,
                        slot.file_suffix,
                        attempt,
                        e
                    );
                    still_failed.push(slot);
                }
            }
        }

        failed_slots = still_failed;
    }

    // 记录最终失败的时段
    let failed_names: Vec<String> = failed_slots
        .iter()
        .map(|s| s.file_suffix.to_string())
        .collect();
    if !failed_names.is_empty() {
        tracing::error!(
            "Day {} 以下时段最终无数据（本次发布将缺失这些时段）: {}",
            day_offset,
            failed_names.join(", ")
        );
    }

    tracing::info!("Day {} 完成", day_offset);
    Ok(failed_names)
}

/// 获取指定偏移量的北京日期字符串
pub fn get_beijing_date_string(day_offset: i64) -> String {
    use chrono::FixedOffset;

    let beijing_offset = FixedOffset::east_opt(8 * 3600).unwrap();
    let now = chrono::Utc::now().with_timezone(&beijing_offset);
    let target = now + chrono::Duration::days(day_offset);
    target.format("%Y-%m-%d").to_string()
}

/// 解析日期字符串
pub fn parse_date_string(date_str: &str) -> Option<chrono::NaiveDate> {
    chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .ok()
        .or_else(|| chrono::NaiveDate::parse_from_str(date_str, "%Y/%m/%d").ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_beijing_date_string() {
        let date = get_beijing_date_string(0);
        assert!(date.contains("-"));

        let date_future = get_beijing_date_string(1);
        assert!(date_future.contains("-"));
    }

    #[test]
    fn test_parse_date_string() {
        let date = parse_date_string("2024/01/15");
        assert!(date.is_some());
        assert_eq!(date.unwrap().to_string(), "2024-01-15");

        let invalid = parse_date_string("invalid");
        assert!(invalid.is_none());
    }
}

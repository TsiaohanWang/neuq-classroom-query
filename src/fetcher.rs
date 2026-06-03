use std::sync::Arc;

use tokio::fs;

use crate::client::HttpClient;
use crate::config::{AppConfig, TIME_SLOTS};
use crate::error::{Result, with_retry};
use crate::models::RawClassroomData;

const MAX_EMPTY_RETRIES: u8 = 2;

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
                // 每个任务创建独立的客户端（独立 session）
                let client = HttpClient::new(Arc::clone(&config))?;

                // 独立登录
                with_retry(
                    &config.retry_config,
                    || async {
                        client
                            .login(&config.username, &config.password)
                            .await
                    },
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
        let mut errors = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => errors.push(e),
                Err(e) => errors.push(crate::error::AppError::Other(format!("任务 panic: {}", e))),
            }
        }

        if !errors.is_empty() {
            let error_msg = errors.iter().map(|e| e.to_string()).collect::<Vec<_>>().join("; ");
            return Err(crate::error::AppError::Fetch {
                message: format!("部分数据抓取失败: {}", error_msg),
            });
        }

        tracing::info!("✔ 数据抓取完成");
        Ok(())
    }
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

    tracing::info!("Day {} {} 保存 {} 条", day_offset, slot.file_suffix, raw_data.len());
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
) -> Result<()> {
    let date_str = get_beijing_date_string(day_offset as i64);

    let output_dir = config.output_dir.join(format!("output-day-{}", day_offset));
    fs::create_dir_all(&output_dir).await?;

    // 首轮：串行抓取所有时段，收集空结果
    let mut failed_slots: Vec<&crate::config::TimeSlot> = Vec::new();

    for slot in TIME_SLOTS {
        tokio::time::sleep(config.request_delay).await;

        match with_retry(
            &config.retry_config,
            || async { fetch_and_save_slot(&client, day_offset, &date_str, slot, &output_dir).await },
            &format!("Day {} 时段 {}-{}", day_offset, slot.begin, slot.end),
        )
        .await
        {
            Ok(true) => {}
            Ok(false) => {
                tracing::warn!("Day {} {} 首轮未找到结果表格，稍后重试", day_offset, slot.file_suffix);
                failed_slots.push(slot);
            }
            Err(e) => return Err(e),
        }
    }

    // 重试队列
    for attempt in 1..=MAX_EMPTY_RETRIES {
        if failed_slots.is_empty() {
            break;
        }

        tracing::info!(
            "Day {} 重试第 {} 轮，剩余 {} 个时段",
            day_offset, attempt, failed_slots.len()
        );

        let mut still_failed: Vec<&crate::config::TimeSlot> = Vec::new();

        for slot in &failed_slots {
            tokio::time::sleep(config.request_delay).await;

            match with_retry(
                &config.retry_config,
                || async { fetch_and_save_slot(&client, day_offset, &date_str, slot, &output_dir).await },
                &format!("Day {} 时段 {}-{} (重试{})", day_offset, slot.begin, slot.end, attempt),
            )
            .await
            {
                Ok(true) => {
                    tracing::info!("Day {} {} 重试成功", day_offset, slot.file_suffix);
                }
                Ok(false) => {
                    still_failed.push(slot);
                }
                Err(e) => return Err(e),
            }
        }

        failed_slots = still_failed;
    }

    // 记录最终失败的时段
    if !failed_slots.is_empty() {
        let names: Vec<&str> = failed_slots.iter().map(|s| s.file_suffix).collect();
        tracing::warn!(
            "Day {} 以下时段经 {} 次重试仍无数据: {}",
            day_offset,
            MAX_EMPTY_RETRIES,
            names.join(", ")
        );
    }

    tracing::info!("Day {} 完成", day_offset);
    Ok(())
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
    chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()
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

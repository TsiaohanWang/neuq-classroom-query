use std::sync::Arc;
use std::time::Duration;

use tokio::fs;

use crate::client::HttpClient;
use crate::config::{AppConfig, TIME_SLOTS};
use crate::error::{AppError, Result, with_retry};
use crate::models::RawClassroomData;

/// 时段失败后稍后重试的最大轮数
const MAX_RETRY_ROUNDS: u8 = 2;

/// 数据抓取器
pub struct Fetcher {
    config: Arc<AppConfig>,
}

impl Fetcher {
    pub fn new(config: Arc<AppConfig>) -> Result<Self> {
        Ok(Self { config })
    }

    /// 执行完整的数据抓取流程
    ///
    /// 使用单个会话串行抓取所有天的所有时段。教务系统 eams 会踢掉同账号的
    /// 重复登录会话（响应"本次会话已经被过期（可能是由于重复登录）"），
    /// 多会话并行抓取会互相干扰，因此这里只登录一次、全程串行。
    ///
    /// 严格策略：任一时段经过时段级重试与稍后重试队列后仍失败，
    /// 即中止整个构建（错误汇总全部失败时段），绝不发布过时或缺失时段的数据。
    pub async fn fetch_all(&self) -> Result<()> {
        tracing::info!("--- 数据抓取开始 ---");
        let config = Arc::clone(&self.config);

        let client = HttpClient::new(Arc::clone(&config))?;

        // 登录一次教务系统（内含 WebVPN 会话建立，如启用）
        with_retry(
            &config.retry_config,
            || async { client.login(&config.username, &config.password).await },
            "登录教务系统",
        )
        .await?;
        tracing::info!("登录成功，开始串行抓取");

        let mut failures: Vec<String> = Vec::new();
        let mut last_login = std::time::Instant::now();

        for day_offset in 0..config.total_days {
            // 长时间运行中 eams 会话可能过期：距上次登录过久则先重新登录
            if day_offset > 0 && last_login.elapsed() > Duration::from_secs(15 * 60) {
                tracing::info!("距上次登录较久，重新登录教务系统后继续");
                with_retry(
                    &config.retry_config,
                    || async { client.login(&config.username, &config.password).await },
                    "重新登录教务系统",
                )
                .await?;
                last_login = std::time::Instant::now();
            }

            if let Err(e) = fetch_day_data(&client, Arc::clone(&config), day_offset).await {
                failures.push(format!("Day {}: {}", day_offset, e));
            }
        }

        if !failures.is_empty() {
            return Err(AppError::Fetch {
                message: format!(
                    "部分数据抓取失败（为避免发布过时/缺失时段，已中止构建）: {}",
                    failures.join("; ")
                ),
            });
        }

        tracing::info!("✔ 数据抓取完成（全部时段均有数据）");
        Ok(())
    }

}

/// 带随机抖动的请求间隔（避免对教务系统形成固定节奏的请求，降低瞬时压力）
async fn sleep_with_jitter(base: Duration) {
    let jitter = rand::random::<u64>() % 1000;
    tokio::time::sleep(base + Duration::from_millis(jitter)).await;
}

/// 抓取单个时段并保存结果
///
/// 空结果（该时段确实无空闲教室）也会写入空数据文件，
/// 确保时段数据完整不缺失；只有请求/解析失败才返回错误。
async fn fetch_and_save_slot(
    client: &HttpClient,
    day_offset: u8,
    date_str: &str,
    slot: &crate::config::TimeSlot,
    output_dir: &std::path::Path,
) -> Result<()> {
    let classrooms = client
        .search_free_classrooms(date_str, slot.begin, slot.end)
        .await?;

    let raw_data: Vec<RawClassroomData> = classrooms
        .iter()
        .map(|entry| entry.to_raw_classroom_data(slot.file_suffix.to_string()))
        .collect::<Result<Vec<_>>>()?;

    crate::models::validate_batch(&raw_data, &format!("时段 {}", slot.file_suffix))?;

    let file_path = output_dir.join(format!("classroom_results_{}.json", slot.file_suffix));
    let json = serde_json::to_string_pretty(&raw_data)?;
    fs::write(&file_path, json).await?;

    if raw_data.is_empty() {
        tracing::info!(
            "Day {} {} 无空闲教室（已写入空数据）",
            day_offset,
            slot.file_suffix
        );
    } else {
        tracing::info!(
            "Day {} {} 保存 {} 条",
            day_offset,
            slot.file_suffix,
            raw_data.len()
        );
    }
    Ok(())
}

/// 抓取单天数据，带稍后重试队列
///
/// 首轮串行抓取所有时段，失败的时段（含空结果异常、HTTP 错误）
/// 加入重试队列，首轮结束后稍后逐一重试（最多 MAX_RETRY_ROUNDS 轮）。
/// 重试耗尽仍失败的时段：清理其残留的过时数据文件，
/// 并返回错误（由 fetch_all 汇总后中止整个构建）。
async fn fetch_day_data(
    client: &HttpClient,
    config: Arc<AppConfig>,
    day_offset: u8,
) -> Result<Vec<String>> {
    let date_str = get_beijing_date_string(day_offset as i64);

    let output_dir = config.output_dir.join(format!("output-day-{}", day_offset));
    fs::create_dir_all(&output_dir).await?;

    // 首轮：串行抓取所有时段，收集待重试的时段
    let mut failed_slots: Vec<&crate::config::TimeSlot> = Vec::new();

    for slot in TIME_SLOTS {
        sleep_with_jitter(config.request_delay).await;

        if let Err(e) = with_retry(
            &config.retry_config,
            || async {
                fetch_and_save_slot(client, day_offset, &date_str, slot, &output_dir).await
            },
            &format!("Day {} 时段 {}-{}", day_offset, slot.begin, slot.end),
        )
        .await
        {
            // 单时段失败不阻断同天其余时段的抓取，加入稍后重试队列
            tracing::error!(
                "Day {} {} 首轮失败，加入稍后重试队列: {}",
                day_offset,
                slot.file_suffix,
                e
            );
            failed_slots.push(slot);
        }
    }

    // 重试队列
    for attempt in 1..=MAX_RETRY_ROUNDS {
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
                    fetch_and_save_slot(client, day_offset, &date_str, slot, &output_dir).await
                },
                &format!(
                    "Day {} 时段 {}-{} (重试{})",
                    day_offset, slot.begin, slot.end, attempt
                ),
            )
            .await
            {
                Ok(()) => {
                    tracing::info!("Day {} {} 重试成功", day_offset, slot.file_suffix);
                }
                Err(e) => {
                    tracing::error!(
                        "Day {} {} (重试{}) 仍失败: {}",
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

    // 重试耗尽仍有失败时段：清理其可能残留的过时数据文件，
    // 并返回错误中止构建（绝不发布过时/缺失的时段）
    if !failed_slots.is_empty() {
        let failed_names: Vec<String> = failed_slots
            .iter()
            .map(|s| s.file_suffix.to_string())
            .collect();

        for slot in &failed_slots {
            let file_path =
                output_dir.join(format!("classroom_results_{}.json", slot.file_suffix));
            if fs::try_exists(&file_path).await.unwrap_or(false) {
                tracing::warn!(
                    "Day {} 删除时段 {} 的过时数据文件，避免发布过时数据",
                    day_offset,
                    slot.file_suffix
                );
                fs::remove_file(&file_path).await?;
            }
        }

        tracing::error!(
            "Day {} 以下时段重试耗尽仍失败: {}",
            day_offset,
            failed_names.join(", ")
        );
        return Err(AppError::Fetch {
            message: format!(
                "Day {} 以下时段重试耗尽仍失败: {}",
                day_offset,
                failed_names.join(", ")
            ),
        });
    }

    tracing::info!("Day {} 完成（全部时段均有数据）", day_offset);
    Ok(Vec::new())
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

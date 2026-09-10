use chrono::Datelike;

use tokio::fs;

use crate::error::Result;
use crate::models::{EventData, QuoteData};

impl super::Generator {
    pub(super) async fn load_events(&self) -> Result<Vec<EventData>> {
        let events_path = self.config.assets_dir.join("calendar").join("neuq_events.json");
        if events_path.exists() {
            let content = fs::read_to_string(&events_path).await?;
            let events: Vec<EventData> = serde_json::from_str(&content)?;
            tracing::debug!("事件: {} 条", events.len());
            Ok(events)
        } else {
            tracing::warn!("未找到事件文件");
            Ok(Vec::new())
        }
    }

    pub(super) async fn load_quotes(&self) -> Result<Vec<QuoteData>> {
        let quotes_path = self.config.assets_dir.join("quotes").join("quotes.json");
        if quotes_path.exists() {
            let content = fs::read_to_string(&quotes_path).await?;
            let quotes: Vec<QuoteData> = serde_json::from_str(&content)?;
            tracing::debug!("格言: {} 条", quotes.len());
            Ok(quotes)
        } else {
            tracing::warn!("未找到格言文件");
            Ok(Vec::new())
        }
    }

    pub(super) fn get_emergency_content(&self, events: &[EventData], quotes: &[QuoteData]) -> String {
        let beijing_offset = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
        let today = chrono::Utc::now().with_timezone(&beijing_offset).format("%Y-%m-%d").to_string();
        let active_events: Vec<&EventData> = events
            .iter()
            .filter(|event| {
                if let (Some(start), Some(end)) = (
                    crate::fetcher::parse_date_string(&event.start),
                    crate::fetcher::parse_date_string(&event.end),
                ) && let Some(today_date) = crate::fetcher::parse_date_string(&today)
                {
                    let activity_start = start - chrono::Duration::days(1);
                    return today_date >= activity_start && today_date <= end;
                }
                false
            })
            .collect();

        if !active_events.is_empty() {
            active_events.iter().map(|e| e.content.as_str()).collect::<Vec<_>>().join("")
        } else if !quotes.is_empty() {
            let quote_index = self.select_quote_index(quotes.len());
            let quote = &quotes[quote_index];
            match &quote.translation {
                Some(translation) if !translation.is_empty() => {
                    let escaped = translation
                        .replace('&', "&amp;")
                        .replace('"', "&quot;")
                        .replace('\'', "&#39;")
                        .replace('<', "&lt;")
                        .replace('>', "&gt;");
                    format!(
                        "<span title=\"{}\">{}</span>",
                        escaped, quote.content
                    )
                }
                _ => quote.content.clone(),
            }
        } else {
            "<p>今日暂无重要事件通知。</p>".to_string()
        }
    }

    fn select_quote_index(&self, total_quotes: usize) -> usize {
        let beijing_offset = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
        let beijing_now = chrono::Utc::now().with_timezone(&beijing_offset);
        let base_index = (beijing_now.num_days_from_ce() % total_quotes as i32) as i64;

        // 以天为基，向邻近 ±3 天扰动，避免同一基日总是选中同一条
        let offset: i64 = rand::Rng::gen_range(&mut rand::thread_rng(), -3i64..=3);
        ((base_index + offset + total_quotes as i64) % total_quotes as i64) as usize
    }
}

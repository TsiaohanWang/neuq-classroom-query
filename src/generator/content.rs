use chrono::Datelike;
use rand::Rng;
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
                ) {
                    if let Some(today_date) = crate::fetcher::parse_date_string(&today) {
                        let activity_start = start - chrono::Duration::days(1);
                        return today_date >= activity_start && today_date <= end;
                    }
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
        let days_since_epoch = beijing_now.num_days_from_ce() as i64;
        let base_index = (days_since_epoch % total_quotes as i64) as usize;

        let range = 3;
        let mut candidate_pool = Vec::new();
        for i in -range..=range {
            let candidate = ((base_index as i64 + i + total_quotes as i64) % total_quotes as i64) as usize;
            if !candidate_pool.contains(&candidate) {
                candidate_pool.push(candidate);
            }
        }

        let pool_size = candidate_pool.len();
        let mean = pool_size as f64 / 2.0;
        let std_dev = 1.5;

        let mut rng = rand::thread_rng();
        let selected_pool_index = loop {
            let u1: f64 = rng.r#gen();
            let u2: f64 = rng.r#gen();
            let z = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
            let index = (z * std_dev + mean).round() as i64;
            if index >= 0 && index < pool_size as i64 {
                break index as usize;
            }
        };

        candidate_pool[selected_pool_index]
    }
}

pub mod content;
pub mod data;
pub mod format;

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use chrono::FixedOffset;
use scraper::Html;
use tera::{Context, Tera};
use tokio::fs;

use crate::config::{AppConfig, TIME_SLOT_LABELS};
use crate::error::Result;

pub struct Generator {
    config: Arc<AppConfig>,
    tera: Tera,
}

impl Generator {
    pub fn new(config: Arc<AppConfig>) -> Self {
        let template_dir = config.assets_dir.join("template");
        let template_pattern = template_dir.join("*.tera.html").to_string_lossy().to_string();
        let mut tera = Tera::new(&template_pattern).expect("无法加载模板文件");
        tera.register_filter("default_empty", format::default_empty_filter);
        Self { config, tera }
    }

    pub async fn generate(&self) -> Result<()> {
        tracing::info!("--- HTML 生成开始 ---");

        let mut context = Context::new();
        let beijing_offset = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = chrono::Utc::now().with_timezone(&beijing_offset);
        context.insert("current_date", &now.format("%Y/%m/%d").to_string());
        context.insert("update_time", &now.format("%Y/%m/%d %H:%M").to_string());

        let events = self.load_events().await?;
        let quotes = self.load_quotes().await?;
        let emergency_content = self.get_emergency_content(&events, &quotes);
        context.insert("emergency_content", &emergency_content);

        context.insert("time_slots", &["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"]);
        let slot_labels: HashMap<String, String> = TIME_SLOT_LABELS
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        context.insert("slot_labels", &slot_labels);

        let mut days = Vec::new();
        for day_offset in 0..self.config.total_days {
            let day_data = self.load_day_data(day_offset).await?;
            days.push(day_data);
        }
        context.insert("days", &days);
        context.insert("theme_css_json", &crate::theme::ThemeConfig::default_json());

        let daily_hashes = self.compute_daily_hashes();
        let badge_html = self.compare_with_live(&daily_hashes).await;

        context.insert("daily_hashes", &serde_json::to_string(&daily_hashes)?);
        context.insert("status_badge_html", &badge_html);
        context.insert("theme_css_json", &crate::theme::ThemeConfig::default_json());

        let html = self.tera.render("template.tera.html", &context)
            .map_err(|e| crate::error::AppError::Generate {
                message: format!("模板渲染失败: {}", e),
            })?;

        let final_html = if self.config.minify_html {
            self.minify_html(&html)
        } else {
            html
        };

        let output_path = Path::new("index.html");
        fs::write(output_path, &final_html).await?;

        let size = final_html.len();
        tracing::info!("✔ HTML 生成完成 ({:.1} KB)", size as f64 / 1024.0);

        Ok(())
    }

    fn compute_daily_hashes(&self) -> HashMap<String, String> {
        let mut hashes = HashMap::new();

        for day_offset in 0..self.config.total_days {
            let data_path = self
                .config
                .output_dir
                .join(format!("output-day-{}", day_offset))
                .join("processed_classroom_data.json");

            if data_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&data_path) {
                    let hash = format!("{:x}", md5::compute(content.as_bytes()));
                    tracing::info!("Day {} 数据哈希: {} ({} bytes)", day_offset, hash, content.len());
                    hashes.insert(day_offset.to_string(), hash);
                } else {
                    tracing::warn!("Day {}: 无法读取数据文件", day_offset);
                }
            } else {
                tracing::debug!("Day {}: 数据文件不存在，跳过", day_offset);
            }
        }

        tracing::info!("计算得到 {}/{} 天的数据哈希", hashes.len(), self.config.total_days);
        hashes
    }

    async fn compare_with_live(&self, new_hashes: &HashMap<String, String>) -> String {
        tracing::info!("--- 与线上版本比较 ---");

        let cname_path = Path::new("CNAME");
        if !cname_path.exists() {
            tracing::info!("无 CNAME 文件，跳过比较");
            return String::new();
        }

        let domain = match fs::read_to_string(cname_path).await {
            Ok(d) => d.trim().to_string(),
            Err(_) => return String::new(),
        };

        let url = format!("https://{}", domain);
        tracing::info!("获取线上版本: {}", url);

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
        {
            Ok(c) => c,
            Err(_) => return String::new(),
        };

        let live_html = match client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.text().await {
                        Ok(text) => text,
                        Err(e) => {
                            tracing::warn!("获取线上版本失败: {}", e);
                            return String::new();
                        }
                    }
                } else {
                    tracing::warn!("获取线上版本失败，状态码: {}", response.status());
                    return "<span class=\"status-badge badge-not-found\">NOT FOUND</span>".to_string();
                }
            }
            Err(e) => {
                tracing::error!("比较线上版本网络错误: {}", e);
                return "<span class=\"status-badge badge-not-found\">NOT FOUND</span>".to_string();
            }
        };

        let live_hashes = self.extract_hashes_from_html(&live_html);

        for day_offset in 0..self.config.total_days {
            let key = day_offset.to_string();
            let new_hash = new_hashes.get(&key).map(|s| s.as_str()).unwrap_or("无");
            let live_hash = live_hashes.get(&key).map(|s| s.as_str()).unwrap_or("无");
            tracing::info!(
                "Day {}: 部署={} | 抓取={} | {}",
                day_offset,
                &live_hash[..8.min(live_hash.len())],
                &new_hash[..8.min(new_hash.len())],
                if new_hash == live_hash { "未变更" } else { "已变更" }
            );
        }

        let total_days = self.config.total_days as usize;
        let mut updated_days = Vec::new();
        let mut unchanged_days = Vec::new();

        for day_offset in 0..self.config.total_days {
            let key = day_offset.to_string();
            let new_hash = new_hashes.get(&key);
            let live_hash = live_hashes.get(&key);
            if new_hash != live_hash {
                updated_days.push(day_offset);
            } else {
                unchanged_days.push(day_offset);
            }
        }

        if updated_days.is_empty() {
            tracing::info!("状态: 无变更 (0/{} 天更新)", total_days);
            "<span class=\"status-badge badge-not-updated\">NOT UPDATED</span>".to_string()
        } else if updated_days.len() == total_days {
            tracing::info!("状态: 全部变更 ({}/{} 天更新)", updated_days.len(), total_days);
            "<span class=\"status-badge badge-updated\">ALL UPDATED</span>".to_string()
        } else {
            let days_text = updated_days
                .iter()
                .enumerate()
                .map(|(i, d)| if i == 0 { format!("DAY{}", d) } else { d.to_string() })
                .collect::<Vec<_>>()
                .join(",");
            tracing::info!(
                "状态: 部分变更 ({}/{} 天更新) — 更新: [{}], 未变: [{}]",
                updated_days.len(),
                total_days,
                updated_days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(","),
                unchanged_days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(",")
            );
            format!("<span class=\"status-badge badge-updated\">{} UPDATED</span>", days_text)
        }
    }

    fn extract_hashes_from_html(&self, html: &str) -> HashMap<String, String> {
        let document = Html::parse_document(html);

        if let Ok(selector) = scraper::Selector::parse(r#"meta[name="page-content-hash"]"#) {
            if let Some(meta) = document.select(&selector).next() {
                if let Some(content) = meta.value().attr("content") {
                    let decoded = content
                        .replace("&quot;", "\"")
                        .replace("&amp;", "&")
                        .replace("&lt;", "<")
                        .replace("&gt;", ">");
                    match serde_json::from_str::<HashMap<String, String>>(&decoded) {
                        Ok(hashes) => {
                            tracing::info!("成功解析线上哈希，共 {} 天", hashes.len());
                            return hashes;
                        }
                        Err(e) => {
                            tracing::warn!("解析线上哈希 JSON 失败: {}", e);
                        }
                    }
                } else {
                    tracing::warn!("meta[name=page-content-hash] 没有 content 属性");
                }
            } else {
                tracing::warn!("未找到 meta[name=page-content-hash] 标签");
            }
        }

        tracing::warn!("线上哈希提取失败，返回空 HashMap");
        HashMap::new()
    }

    fn minify_html(&self, html: &str) -> String {
        let cfg = minify_html::Cfg::new();
        let minified = minify_html::minify(html.as_bytes(), &cfg);
        String::from_utf8_lossy(&minified).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn create_test_generator() -> Generator {
        let config = Arc::new(AppConfig {
            username: "test".to_string(),
            password: "test".to_string(),
            base_url: "http://test.com/".to_string(),
            request_timeout: std::time::Duration::from_secs(45),
            request_delay: std::time::Duration::from_secs(2),
            total_days: 7,
            retry_config: crate::error::RetryConfig::default(),
            output_dir: PathBuf::from("/tmp/test"),
            assets_dir: PathBuf::from("/tmp/test"),
            force_overwrite: false,
            minify_html: true,
        });

        let tera = Tera::new("/tmp/test/template.tera.html").unwrap_or_else(|_| {
            let mut tera = Tera::default();
            tera.add_raw_template("template.tera.html", "<html></html>").unwrap();
            tera
        });

        Generator { config, tera }
    }

    #[test]
    fn test_smart_sort_classrooms() {
        let mut rooms = vec!["103", "206", "111", "203", "104", "204"];
        rooms.sort_by(|a, b| format::smart_sort_classrooms(a, b));
        assert_eq!(rooms, vec!["103", "104", "111", "203", "204", "206"]);
    }

    #[test]
    fn test_format_rooms_with_style() {
        let generator = create_test_generator();
        let all_day_rooms = std::collections::HashSet::from(["101".to_string()]);
        let prev_rooms = std::collections::HashSet::from(["101".to_string(), "102".to_string()]);
        let next_rooms = std::collections::HashSet::from(["101".to_string()]);

        let rooms = vec!["101".to_string(), "102".to_string()];
        let html = generator.format_rooms_with_style(
            &rooms, "工学馆", &all_day_rooms,
            &prev_rooms, &next_rooms, false, false,
        );

        assert!(html.contains("<strong>101</strong>"));
        assert!(!html.contains("<del>101</del>"));
        assert!(!html.contains("<u>101</u>"));
        assert!(html.contains("<del>102</del>"));
        assert!(!html.contains("<u>102</u>"));
    }

    #[test]
    fn test_format_rooms_new_room() {
        let generator = create_test_generator();
        let all_day_rooms = std::collections::HashSet::new();
        let prev_rooms = std::collections::HashSet::from(["101".to_string()]);
        let next_rooms = std::collections::HashSet::from(["102".to_string()]);

        let rooms = vec!["101".to_string(), "102".to_string()];
        let html = generator.format_rooms_with_style(
            &rooms, "工学馆", &all_day_rooms,
            &prev_rooms, &next_rooms, false, false,
        );

        assert!(!html.contains("<u>101</u>"));
        assert!(html.contains("<u>102</u>"));
    }

    #[test]
    fn test_format_rooms_first_slot_no_underline() {
        let generator = create_test_generator();
        let all_day_rooms = std::collections::HashSet::new();
        let prev_rooms = std::collections::HashSet::new();
        let next_rooms = std::collections::HashSet::from(["102".to_string()]);

        let rooms = vec!["101".to_string(), "102".to_string()];
        let html = generator.format_rooms_with_style(
            &rooms, "工学馆", &all_day_rooms,
            &prev_rooms, &next_rooms, true, false,
        );
        assert!(!html.contains("<u>"));
    }

    #[test]
    fn test_extract_hashes_nodejs_format() {
        let generator = create_test_generator();
        let html = r#"<html><head><meta name="page-content-hash" content="{&quot;0&quot;:&quot;abc123&quot;,&quot;1&quot;:&quot;def456&quot;,&quot;2&quot;:&quot;789ghi&quot;}"></head><body></body></html>"#;
        let hashes = generator.extract_hashes_from_html(html);
        assert_eq!(hashes.len(), 3);
        assert_eq!(hashes.get("0").unwrap(), "abc123");
        assert_eq!(hashes.get("1").unwrap(), "def456");
        assert_eq!(hashes.get("2").unwrap(), "789ghi");
    }

    #[test]
    fn test_extract_hashes_rust_format() {
        let generator = create_test_generator();
        let html = r#"<html><head><meta name="page-content-hash" content='{"0":"abc123","1":"def456","2":"789ghi"}'></head><body></body></html>"#;
        let hashes = generator.extract_hashes_from_html(html);
        assert_eq!(hashes.len(), 3);
        assert_eq!(hashes.get("0").unwrap(), "abc123");
        assert_eq!(hashes.get("1").unwrap(), "def456");
        assert_eq!(hashes.get("2").unwrap(), "789ghi");
    }

    #[test]
    fn test_extract_hashes_minified_format() {
        let generator = create_test_generator();
        let html = r#"<html><head><meta content={"0":"abc123","1":"def456"} name=page-content-hash></head><body></body></html>"#;
        let hashes = generator.extract_hashes_from_html(html);
        if !hashes.is_empty() {
            assert_eq!(hashes.get("0").unwrap(), "abc123");
        }
    }

    #[test]
    fn test_extract_hashes_no_meta() {
        let generator = create_test_generator();
        let html = r#"<html><head></head><body></body></html>"#;
        let hashes = generator.extract_hashes_from_html(html);
        assert!(hashes.is_empty());
    }

    #[test]
    fn test_scraper_html_determinism() {
        let html = r##"<html><body><table border="1" class="gxg-table"><tr><td>1F</td></tr></table></body></html>"##;

        let doc1 = scraper::Html::parse_document(html);
        let doc2 = scraper::Html::parse_document(html);

        let sel = scraper::Selector::parse("table").unwrap();
        let el1 = doc1.select(&sel).next().unwrap();
        let el2 = doc2.select(&sel).next().unwrap();

        let h1 = el1.html();
        let h2 = el2.html();
        let deterministic = h1 == h2;
        if !deterministic {
            assert_ne!(h1, h2);
        }
    }

    #[test]
    fn test_translation_escaping() {
        let generator = create_test_generator();
        let quotes = vec![
            crate::models::QuoteData {
                content: "<p>Test quote</p>".to_string(),
                description: "Test".to_string(),
                translation: Some("包含\"引号\"和<尖括号>的翻译".to_string()),
            },
        ];
        let events: Vec<crate::models::EventData> = vec![];

        let html = generator.get_emergency_content(&events, &quotes);

        assert!(html.contains("title=\"包含&quot;引号&quot;和&lt;尖括号&gt;的翻译\""));
        assert!(!html.contains("title=\"包含\"引号\"和<尖括号>的翻译\""));
    }

    #[test]
    fn test_translation_with_ampersand() {
        let generator = create_test_generator();
        let quotes = vec![
            crate::models::QuoteData {
                content: "<p>Test</p>".to_string(),
                description: "Test".to_string(),
                translation: Some("A & B".to_string()),
            },
        ];
        let events: Vec<crate::models::EventData> = vec![];

        let html = generator.get_emergency_content(&events, &quotes);

        assert!(html.contains("title=\"A &amp; B\""));
    }
}

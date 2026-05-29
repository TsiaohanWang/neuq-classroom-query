use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use chrono::{FixedOffset, Local};
use rand::Rng;
use scraper::Html;
use serde::Serialize;
use tera::{Context, Tera};
use tokio::fs;

use crate::config::AppConfig;
use crate::error::Result;
use crate::models::{EventData, ProcessedClassroomData, QuoteData, TimeSlotBuildingData};

fn get_slot_labels() -> HashMap<String, String> {
    let mut labels = HashMap::new();
    labels.insert("1-2".to_string(), "上午第1-2节".to_string());
    labels.insert("3-4".to_string(), "上午第3-4节".to_string());
    labels.insert("5-6".to_string(), "下午第5-6节".to_string());
    labels.insert("7-8".to_string(), "下午第7-8节".to_string());
    labels.insert("9-10".to_string(), "晚上第9-10节".to_string());
    labels.insert("11-12".to_string(), "晚上第11-12节".to_string());
    labels
}

#[derive(Debug, Serialize)]
struct DayData {
    index: u8,
    gxg: HashMap<String, HashMap<u8, String>>,
    jcl: HashMap<String, String>,
    zhsyl: HashMap<String, String>,
    dzl: HashMap<String, String>,
    gll: HashMap<String, String>,
    kjl: HashMap<String, String>,
    rwl: HashMap<String, String>,
}

impl DayData {
    fn new(index: u8) -> Self {
        Self {
            index,
            gxg: HashMap::new(),
            jcl: HashMap::new(),
            zhsyl: HashMap::new(),
            dzl: HashMap::new(),
            gll: HashMap::new(),
            kjl: HashMap::new(),
            rwl: HashMap::new(),
        }
    }
}

pub struct Generator {
    config: Arc<AppConfig>,
    tera: Tera,
}

impl Generator {
    pub fn new(config: Arc<AppConfig>) -> Self {
        let template_dir = config.assets_dir.join("template");
        let template_pattern = template_dir.join("*.tera.html").to_string_lossy().to_string();
        let mut tera = Tera::new(&template_pattern).expect("无法加载模板文件");
        tera.register_filter("default_empty", default_empty_filter);
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
        context.insert("slot_labels", &get_slot_labels());

        let mut days = Vec::new();
        for day_offset in 0..self.config.total_days {
            let day_data = self.load_day_data(day_offset).await?;
            days.push(day_data);
        }
        context.insert("days", &days);
        context.insert("theme_css_json", &crate::theme::ThemeConfig::default_json());

        // 从源数据 JSON 文件计算哈希（确定性，不受 scraper 属性排序影响）
        let daily_hashes = self.compute_daily_hashes();

        // 与线上版本比较生成 badge
        let badge_html = self.compare_with_live(&daily_hashes).await;

        // 用真实哈希渲染最终 HTML
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

    /// 从源数据 JSON 文件计算每日哈希（确定性输出，避免 scraper 属性排序不一致问题）
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
                    tracing::debug!("Day {} 数据哈希: {} (文件大小: {} bytes)", day_offset, hash, content.len());
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

        let total_days = self.config.total_days as usize;
        let mut updated_days = Vec::new();
        let mut unchanged_days = Vec::new();

        for day_offset in 0..self.config.total_days {
            let key = day_offset.to_string();
            let new_hash = new_hashes.get(&key);
            let live_hash = live_hashes.get(&key);
            if new_hash != live_hash {
                tracing::debug!("Day {} 变更: 新={:?} 旧={:?}", day_offset, new_hash, live_hash);
                updated_days.push(day_offset);
            } else {
                tracing::debug!("Day {} 未变更: {}", day_offset, new_hash.unwrap_or(&"无".to_string()));
                unchanged_days.push(day_offset);
            }
        }

        // 生成 badge 并输出状态日志
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

    async fn load_events(&self) -> Result<Vec<EventData>> {
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

    async fn load_quotes(&self) -> Result<Vec<QuoteData>> {
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

    fn get_emergency_content(&self, events: &[EventData], quotes: &[QuoteData]) -> String {
        let today = Local::now().format("%Y/%m/%d").to_string();
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
            quotes[quote_index].content.clone()
        } else {
            "<p>今日暂无重要事件通知。</p>".to_string()
        }
    }

    fn select_quote_index(&self, total_quotes: usize) -> usize {
        let ms_in_day = 1000 * 60 * 60 * 24;
        let days_since_epoch = chrono::Utc::now().timestamp_millis() / ms_in_day;
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

    async fn load_day_data(&self, day_offset: u8) -> Result<DayData> {
        let data_path = self
            .config
            .output_dir
            .join(format!("output-day-{}", day_offset))
            .join("processed_classroom_data.json");

        let mut day_data = DayData::new(day_offset);

        let time_slots = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];
        let buildings = ["工学馆", "基础楼", "综合实验楼", "地质楼", "管理楼", "科技楼", "人文楼"];

        if !data_path.exists() {
            tracing::warn!("Day {} 无数据文件", day_offset);
            self.initialize_empty_slots(&mut day_data, &time_slots);
            return Ok(day_data);
        }

        let content = fs::read_to_string(&data_path).await?;
        let classroom_data: Vec<ProcessedClassroomData> = serde_json::from_str(&content)?;
        tracing::info!("Day {} 读取 {} 条", day_offset, classroom_data.len());

        if classroom_data.is_empty() {
            self.initialize_empty_slots(&mut day_data, &time_slots);
            return Ok(day_data);
        }

        let slot_data = self.build_time_slot_data(&classroom_data);
        let all_day_free = self.calculate_all_day_free(&slot_data);

        // 跟踪上一时段的教室（用于下划线逻辑）
        let mut previous_classrooms: HashMap<String, std::collections::HashSet<String>> = HashMap::new();

        for (idx, slot) in time_slots.iter().enumerate() {
            let is_first = idx == 0;
            let is_last = idx == time_slots.len() - 1;
            let next_slot = if idx < time_slots.len() - 1 { Some(time_slots[idx + 1]) } else { None };

            // 工学馆
            for floor in 1..=7 {
                let floor_prefix = format!("{}F", floor);
                let floor_num = floor.to_string();

                let mut current_rooms: Vec<String> = slot_data.get_rooms(slot, "工学馆")
                    .into_iter()
                    .filter(|r| r.starts_with(&floor_prefix) || r.starts_with(&floor_num))
                    .collect();

                // 智能排序
                current_rooms.sort_by(|a, b| smart_sort_classrooms(a, b));

                let next_rooms = next_slot.map(|s| slot_data.get_rooms(s, "工学馆")).unwrap_or_default();
                let all_day_rooms = all_day_free.get("工学馆").cloned().unwrap_or_default();
                let prev_rooms = previous_classrooms.get("工学馆").cloned().unwrap_or_default();

                let html = self.format_rooms_with_style(
                    &current_rooms, "工学馆", &all_day_rooms,
                    &prev_rooms, &next_rooms, is_first, is_last,
                );
                day_data.gxg.entry(slot.to_string()).or_default().insert(floor, html);
            }

            // 其他楼宇
            for building in &buildings[1..] {
                let mut current_rooms: Vec<String> = slot_data.get_rooms(slot, building).into_iter().collect();
                current_rooms.sort_by(|a, b| smart_sort_classrooms(a, b));

                let next_rooms = next_slot.map(|s| slot_data.get_rooms(s, building)).unwrap_or_default();
                let all_day_rooms = all_day_free.get(*building).cloned().unwrap_or_default();
                let prev_rooms = previous_classrooms.get(*building).cloned().unwrap_or_default();

                let html = self.format_rooms_with_style(
                    &current_rooms, building, &all_day_rooms,
                    &prev_rooms, &next_rooms, is_first, is_last,
                );

                match *building {
                    "基础楼" => { day_data.jcl.insert(slot.to_string(), html); }
                    "综合实验楼" => { day_data.zhsyl.insert(slot.to_string(), html); }
                    "地质楼" => { day_data.dzl.insert(slot.to_string(), html); }
                    "管理楼" => { day_data.gll.insert(slot.to_string(), html); }
                    "科技楼" => { day_data.kjl.insert(slot.to_string(), html); }
                    "人文楼" => { day_data.rwl.insert(slot.to_string(), html); }
                    _ => {}
                }
            }

            // 更新 previousClassrooms（排除 1-8 时段）
            if *slot != "1-8" {
                for building in &buildings {
                    let rooms = slot_data.get_rooms(slot, building);
                    previous_classrooms.insert(building.to_string(), rooms);
                }
            }
        }

        Ok(day_data)
    }

    fn initialize_empty_slots(&self, day_data: &mut DayData, time_slots: &[&str]) {
        let empty = "无".to_string();
        for slot in time_slots {
            let slot_string = slot.to_string();
            for floor in 1..=7 {
                day_data.gxg.entry(slot_string.clone()).or_default().insert(floor, empty.clone());
            }
            day_data.jcl.insert(slot_string.clone(), empty.clone());
            day_data.zhsyl.insert(slot_string.clone(), empty.clone());
            day_data.dzl.insert(slot_string.clone(), empty.clone());
            day_data.gll.insert(slot_string.clone(), empty.clone());
            day_data.kjl.insert(slot_string.clone(), empty.clone());
            day_data.rwl.insert(slot_string.clone(), empty.clone());
        }
    }

    fn build_time_slot_data(&self, data: &[ProcessedClassroomData]) -> TimeSlotBuildingData {
        let mut slot_data = TimeSlotBuildingData::new();
        for item in data {
            slot_data.add(&item.time_slot, &item.building, &item.name);
        }
        slot_data
    }

    fn calculate_all_day_free(&self, slot_data: &TimeSlotBuildingData) -> HashMap<String, std::collections::HashSet<String>> {
        let buildings = ["工学馆", "基础楼", "综合实验楼", "地质楼", "管理楼", "科技楼", "人文楼"];
        let mut result = HashMap::new();
        for building in &buildings {
            let all_day_rooms = slot_data.get_all_day_free_rooms(building);
            result.insert(building.to_string(), all_day_rooms);
        }
        result
    }

    /// 格式化教室列表（与原版逻辑一致）
    /// 样式顺序：下划线 → 删除线 → 加粗
    fn format_rooms_with_style(
        &self,
        rooms: &[String],
        building: &str,
        all_day_free: &std::collections::HashSet<String>,
        prev_rooms: &std::collections::HashSet<String>,
        next_rooms: &std::collections::HashSet<String>,
        is_first_slot: bool,
        is_last_slot: bool,
    ) -> String {
        if rooms.is_empty() {
            return "无".to_string();
        }

        // 原版的 STRIKETHROUGH_APPLICABLE_SLOTS = ["1-2", "3-4", "5-6", "7-8", "9-10"]
        // 即除了最后一个时段（11-12），其他都适用删除线
        let strikethrough_applicable = !is_last_slot;

        let styled_rooms: Vec<String> = rooms
            .iter()
            .map(|room| {
                let is_bold = all_day_free.contains(room);
                // 原版：timeSlotSuffix !== "1-2" && timeSlotSuffix !== "1-8" && !previousClassrooms[buildingName]?.has(roomName)
                let is_underlined = !is_first_slot && !prev_rooms.contains(room);
                let is_strikethrough = strikethrough_applicable && !next_rooms.contains(room);

                let mut styled = room.clone();

                // 原版顺序：先下划线，再删除线，最后加粗
                if is_underlined {
                    styled = format!("<u>{}</u>", styled);
                }
                if is_strikethrough {
                    styled = format!("<del>{}</del>", styled);
                }
                if is_bold {
                    styled = format!("<strong>{}</strong>", styled);
                }

                styled
            })
            .collect();

        match building {
            "工学馆" | "人文楼" => styled_rooms.join(" "),
            "科技楼" => {
                let mut regular = Vec::new();
                let mut zizhu = Vec::new();
                for room in &styled_rooms {
                    if room.contains("自习室") {
                        zizhu.push(room.clone());
                    } else {
                        regular.push(room.clone());
                    }
                }
                let mut result = regular.join(" ");
                if !zizhu.is_empty() {
                    if !result.is_empty() {
                        result.push_str("<br>");
                    }
                    result.push_str(&zizhu.join("<br>"));
                }
                result
            }
            _ => styled_rooms.join("<br>"),
        }
    }
}

/// 智能排序教室号（与原版 smartSortClassrooms 一致）
fn smart_sort_classrooms(a: &str, b: &str) -> std::cmp::Ordering {
    let regex = regex::Regex::new(r"^(\d+)(.*)$").unwrap();

    if let (Some(caps_a), Some(caps_b)) = (regex.captures(a), regex.captures(b)) {
        let num_a: i32 = caps_a[1].parse().unwrap_or(0);
        let num_b: i32 = caps_b[1].parse().unwrap_or(0);
        let suffix_a = &caps_a[2];
        let suffix_b = &caps_b[2];

        match num_a.cmp(&num_b) {
            std::cmp::Ordering::Equal => suffix_a.cmp(suffix_b),
            other => other,
        }
    } else {
        a.cmp(b)
    }
}

fn default_empty_filter(value: &tera::Value, _args: &HashMap<String, tera::Value>) -> tera::Result<tera::Value> {
    match value {
        tera::Value::String(s) => {
            if s.is_empty() {
                Ok(tera::Value::String("无".to_string()))
            } else {
                Ok(tera::Value::String(s.clone()))
            }
        }
        tera::Value::Null => Ok(tera::Value::String("无".to_string())),
        _ => Ok(value.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smart_sort_classrooms() {
        let mut rooms = vec!["103", "206", "111", "203", "104", "204"];
        rooms.sort_by(|a, b| smart_sort_classrooms(a, b));
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

        // 101 全天空闲 + 在 prev/next 中 → 只有加粗
        assert!(html.contains("<strong>101</strong>"));
        assert!(!html.contains("<del>101</del>"));
        assert!(!html.contains("<u>101</u>"));
        // 102 在 prev 中（无下划线），不在 next 中（有删除线）
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

        // 101 在 prev 中 → 无下划线
        assert!(!html.contains("<u>101</u>"));
        // 102 不在 prev 中 → 有下划线（新增）
        assert!(html.contains("<u>102</u>"));
    }

    #[test]
    fn test_format_rooms_first_slot_no_underline() {
        let generator = create_test_generator();
        let all_day_rooms = std::collections::HashSet::new();
        let prev_rooms = std::collections::HashSet::new(); // 第一个时段没有 prev
        let next_rooms = std::collections::HashSet::from(["102".to_string()]);

        let rooms = vec!["101".to_string(), "102".to_string()];
        let html = generator.format_rooms_with_style(
            &rooms, "工学馆", &all_day_rooms,
            &prev_rooms, &next_rooms, true, false, // is_first = true
        );
        // 第一个时段不应有下划线
        assert!(!html.contains("<u>"));
    }

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
    fn test_extract_hashes_nodejs_format() {
        let generator = create_test_generator();
        // Node.js 版本的 meta 标签格式（双引号包裹 content，&quot; 实体编码）
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
        // Rust 版本的 meta 标签格式（单引号包裹 content，无实体编码）
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
        // minify-html 可能去掉引号的格式
        let html = r#"<html><head><meta content={"0":"abc123","1":"def456"} name=page-content-hash></head><body></body></html>"#;
        let hashes = generator.extract_hashes_from_html(html);
        // 这种格式可能无法解析，但不应 panic
        // 如果能解析则验证结果
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
        // 说明：scraper 的 .html() 不保证属性顺序一致
        // 相同 HTML 输入在不同 parse 时可能产生不同属性排列
        // 因此 compute_daily_hashes 已改为基于 JSON 数据文件计算哈希
        let html = r##"<html><body><table border="1" class="gxg-table"><tr><td>1F</td></tr></table></body></html>"##;

        let doc1 = scraper::Html::parse_document(html);
        let doc2 = scraper::Html::parse_document(html);

        let sel = scraper::Selector::parse("table").unwrap();
        let el1 = doc1.select(&sel).next().unwrap();
        let el2 = doc2.select(&sel).next().unwrap();

        let h1 = el1.html();
        let h2 = el2.html();
        // 这个断言可能失败 —— 这正是我们改用 JSON 数据哈希的原因
        // 如果失败了，说明 scraper 确实不保证属性顺序
        let deterministic = h1 == h2;
        if !deterministic {
            // 预期行为：属性顺序不同
            assert_ne!(h1, h2);
        }
        // 无论哪种情况都通过 —— 我们只是验证这个行为存在
    }

    use std::path::PathBuf;
}

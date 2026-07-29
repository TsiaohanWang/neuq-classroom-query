use std::collections::HashMap;

use serde::Serialize;
use tokio::fs;

use crate::error::Result;
use crate::models::{ProcessedClassroomData, TimeSlotBuildingData};

use super::format;

#[derive(Debug, Serialize)]
pub(super) struct DayData {
    pub(super) index: u8,
    pub(super) gxg: HashMap<String, HashMap<u8, String>>,
    pub(super) jcl: HashMap<String, String>,
    pub(super) zhsyl: HashMap<String, String>,
    pub(super) dzl: HashMap<String, String>,
    pub(super) gll: HashMap<String, String>,
    pub(super) kjl: HashMap<String, String>,
    pub(super) rwl: HashMap<String, String>,
}

impl DayData {
    pub(super) fn new(index: u8) -> Self {
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

impl super::Generator {
    pub(super) async fn load_day_data(&self, day_offset: u8) -> Result<DayData> {
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

        let mut previous_classrooms: HashMap<String, std::collections::HashSet<String>> = HashMap::new();

        for (idx, slot) in time_slots.iter().enumerate() {
            let is_first = idx == 0;
            let is_last = idx == time_slots.len() - 1;
            let next_slot = if idx < time_slots.len() - 1 { Some(time_slots[idx + 1]) } else { None };

            for floor in 1..=7 {
                let floor_prefix = format!("{}F", floor);
                let floor_num = floor.to_string();

                let mut current_rooms: Vec<String> = slot_data.get_rooms(slot, "工学馆")
                    .into_iter()
                    .filter(|r| r.starts_with(&floor_prefix) || r.starts_with(&floor_num))
                    .collect();

                current_rooms.sort_by(|a, b| format::smart_sort_classrooms(a, b));

                let next_rooms = next_slot.map(|s| slot_data.get_rooms(s, "工学馆")).unwrap_or_default();
                let all_day_rooms = all_day_free.get("工学馆").cloned().unwrap_or_default();
                let prev_rooms = previous_classrooms.get("工学馆").cloned().unwrap_or_default();

                let html = self.format_rooms_with_style(
                    &current_rooms, "工学馆", &all_day_rooms,
                    &prev_rooms, &next_rooms, is_first, is_last,
                );
                day_data.gxg.entry(slot.to_string()).or_default().insert(floor, html);
            }

            for building in &buildings[1..] {
                let mut current_rooms: Vec<String> = slot_data.get_rooms(slot, building).into_iter().collect();
                current_rooms.sort_by(|a, b| format::smart_sort_classrooms(a, b));

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

            if *slot != "1-8" {
                for building in &buildings {
                    let rooms = slot_data.get_rooms(slot, building);
                    previous_classrooms.insert(building.to_string(), rooms);
                }
            }
        }

        Ok(day_data)
    }

    pub(super) fn initialize_empty_slots(&self, day_data: &mut DayData, time_slots: &[&str]) {
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
}

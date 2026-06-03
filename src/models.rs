use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fmt;

use crate::error::{AppError, Result};

/// 原始教室数据（从教务系统获取）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawClassroomData {
    #[serde(rename = "教学楼")]
    pub building: String,

    #[serde(rename = "名称")]
    pub name: String,

    #[serde(rename = "容量")]
    pub capacity: String,

    #[serde(rename = "教室设备配置")]
    pub equipment_config: String,

    #[serde(rename = "校区")]
    #[serde(default)]
    pub campus: Option<String>,

    #[serde(rename = "序号")]
    #[serde(default)]
    pub sequence_number: Option<String>,

    /// 空闲时段（处理时添加）
    #[serde(rename = "空闲时段")]
    #[serde(default)]
    pub time_slot: Option<String>,

    /// 其他未知字段
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// 处理后的教室数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedClassroomData {
    #[serde(rename = "教学楼")]
    pub building: String,

    #[serde(rename = "名称")]
    pub name: String,

    #[serde(rename = "容量")]
    pub capacity: String,

    #[serde(rename = "教室设备配置")]
    pub equipment_config: String,

    #[serde(rename = "空闲时段")]
    pub time_slot: String,
}

/// 黑名单数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blacklist {
    #[serde(flatten)]
    pub buildings: HashMap<String, Vec<String>>,
}

/// 事件数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventData {
    pub start: String,
    pub end: String,
    pub content: String,
}

/// 格言数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteData {
    pub content: String,
    pub description: String,
    #[serde(default)]
    pub translation: Option<String>,
}

/// 数据校验 trait
pub trait Validate {
    fn validate(&self) -> Result<()>;
}

impl Validate for RawClassroomData {
    fn validate(&self) -> Result<()> {
        // 校验容量是否为有效数字
        if self.capacity.is_empty() {
            return Err(AppError::Validation(
                "容量字段不能为空".to_string(),
            ));
        }

        // 容量应该是数字
        if self.capacity.parse::<u32>().is_err() {
            return Err(AppError::Validation(format!(
                "容量 '{}' 不是有效的数字",
                self.capacity
            )));
        }

        // 注意：教学楼名称可以为空，这会在 processor.rs 中被过滤掉
        // 不在这里校验，因为原始数据可能有各种情况

        Ok(())
    }
}

impl Validate for ProcessedClassroomData {
    fn validate(&self) -> Result<()> {
        if self.building.is_empty() {
            return Err(AppError::Validation("教学楼不能为空".to_string()));
        }

        if self.name.is_empty() {
            return Err(AppError::Validation("教室名称不能为空".to_string()));
        }

        if self.time_slot.is_empty() {
            return Err(AppError::Validation("空闲时段不能为空".to_string()));
        }

        // 校验时段格式
        if !is_valid_time_slot(&self.time_slot) {
            return Err(AppError::Validation(format!(
                "无效的时段格式: '{}'",
                self.time_slot
            )));
        }

        Ok(())
    }
}

/// 校验时段格式是否有效
fn is_valid_time_slot(slot: &str) -> bool {
    matches!(
        slot,
        "1-2" | "3-4" | "5-6" | "7-8" | "1-8" | "9-10" | "11-12"
    )
}

/// 校验批量数据
pub fn validate_batch<T: Validate>(data: &[T], context: &str) -> Result<()> {
    for (index, item) in data.iter().enumerate() {
        if let Err(e) = item.validate() {
            return Err(AppError::Validation(format!(
                "{} 第 {} 条数据校验失败: {}",
                context,
                index + 1,
                e
            )));
        }
    }
    Ok(())
}

/// 教室分组数据（按教学楼和楼层）
#[derive(Debug, Clone)]
pub struct ClassroomGroup {
    pub building: String,
    pub floor: Option<String>,
    pub rooms: Vec<ProcessedClassroomData>,
}

impl ClassroomGroup {
    pub fn new(building: String, floor: Option<String>) -> Self {
        Self {
            building,
            floor,
            rooms: Vec::new(),
        }
    }

    pub fn add_room(&mut self, room: ProcessedClassroomData) {
        self.rooms.push(room);
    }

    pub fn room_names(&self) -> Vec<&str> {
        self.rooms.iter().map(|r| r.name.as_str()).collect()
    }

    pub fn is_empty(&self) -> bool {
        self.rooms.is_empty()
    }
}

/// 按时段和教学楼分组的数据结构
#[derive(Debug, Clone, Default)]
pub struct TimeSlotBuildingData {
    /// key: 时段 -> 教学楼 -> 教室名称集合
    pub data: HashMap<String, HashMap<String, HashSet<String>>>,
}

impl TimeSlotBuildingData {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    /// 添加教室数据
    pub fn add(&mut self, time_slot: &str, building: &str, room_name: &str) {
        self.data
            .entry(time_slot.to_string())
            .or_default()
            .entry(building.to_string())
            .or_default()
            .insert(room_name.to_string());
    }

    /// 获取指定时段和教学楼的教室集合
    pub fn get_rooms(&self, time_slot: &str, building: &str) -> HashSet<String> {
        self.data
            .get(time_slot)
            .and_then(|b| b.get(building))
            .cloned()
            .unwrap_or_default()
    }

    /// 计算全天空闲教室（所有顺序时段都空闲）
    pub fn get_all_day_free_rooms(&self, building: &str) -> HashSet<String> {
        use crate::config::SEQUENTIAL_SLOTS;

        let mut common_rooms: Option<HashSet<String>> = None;

        for slot in SEQUENTIAL_SLOTS {
            let current_rooms = self.get_rooms(slot, building);

            match common_rooms {
                None => common_rooms = Some(current_rooms),
                Some(existing) => {
                    let intersection: HashSet<String> = existing
                        .intersection(&current_rooms)
                        .cloned()
                        .collect();

                    if intersection.is_empty() {
                        return HashSet::new();
                    }

                    common_rooms = Some(intersection);
                }
            }
        }

        common_rooms.unwrap_or_default()
    }
}

impl fmt::Display for ProcessedClassroomData {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} {} (容量: {}, 时段: {})",
            self.building, self.name, self.capacity, self.time_slot
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_raw_classroom_validation() {
        let valid = RawClassroomData {
            building: "工学馆".to_string(),
            name: "101".to_string(),
            capacity: "60".to_string(),
            equipment_config: "普通教室".to_string(),
            campus: None,
            sequence_number: None,
            time_slot: None,
            extra: HashMap::new(),
        };
        assert!(valid.validate().is_ok());

        let invalid_capacity = RawClassroomData {
            building: "工学馆".to_string(),
            name: "101".to_string(),
            capacity: "abc".to_string(),
            equipment_config: "普通教室".to_string(),
            campus: None,
            sequence_number: None,
            time_slot: None,
            extra: HashMap::new(),
        };
        assert!(invalid_capacity.validate().is_err());
    }

    #[test]
    fn test_processed_classroom_validation() {
        let valid = ProcessedClassroomData {
            building: "工学馆".to_string(),
            name: "101".to_string(),
            capacity: "60".to_string(),
            equipment_config: "普通教室".to_string(),
            time_slot: "1-2".to_string(),
        };
        assert!(valid.validate().is_ok());

        let invalid_slot = ProcessedClassroomData {
            building: "工学馆".to_string(),
            name: "101".to_string(),
            capacity: "60".to_string(),
            equipment_config: "普通教室".to_string(),
            time_slot: "invalid".to_string(),
        };
        assert!(invalid_slot.validate().is_err());
    }

    #[test]
    fn test_time_slot_building_data() {
        let mut data = TimeSlotBuildingData::new();

        data.add("1-2", "工学馆", "101");
        data.add("1-2", "工学馆", "102");
        data.add("3-4", "工学馆", "101");

        let rooms = data.get_rooms("1-2", "工学馆");
        assert_eq!(rooms.len(), 2);
        assert!(rooms.contains("101"));
        assert!(rooms.contains("102"));

        // 101 在 1-2 和 3-4 都空闲，但不在所有时段都空闲
        let all_day = data.get_all_day_free_rooms("工学馆");
        assert!(all_day.is_empty()); // 因为不是所有6个时段都有数据
    }

    #[test]
    fn test_is_valid_time_slot() {
        assert!(is_valid_time_slot("1-2"));
        assert!(is_valid_time_slot("11-12"));
        assert!(!is_valid_time_slot("invalid"));
        assert!(!is_valid_time_slot(""));
    }
}

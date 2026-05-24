use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use lazy_static::lazy_static;
use rayon::prelude::*;
use regex::Regex;
use tokio::fs;

use crate::config::{AppConfig, FORBIDDEN_BUILDINGS, FORBIDDEN_CONFIGS};
use crate::error::Result;
use crate::models::{Blacklist, ProcessedClassroomData, RawClassroomData, Validate};

// 预编译正则表达式（性能优化）
lazy_static! {
    /// 数字编号格式正则
    static ref NUMBER_PATTERN: Regex = Regex::new(r"^\d+[A-Z]?$|^\d+[A-Z]?-[A-Z\d-]+$").unwrap();
    
    /// 自主学习室格式正则
    static ref ZIZHU_PATTERN: Regex = Regex::new(r"^自主学习室([A-Z])科技楼(.+)$").unwrap();
}

/// 数据处理器
pub struct Processor {
    config: Arc<AppConfig>,
    blacklist: Blacklist,
}

impl Processor {
    /// 创建新的处理器
    pub async fn new(config: Arc<AppConfig>) -> Result<Self> {
        let blacklist = Self::load_blacklist(&config.assets_dir).await?;
        Ok(Self { config, blacklist })
    }

    /// 加载黑名单
    async fn load_blacklist(assets_dir: &Path) -> Result<Blacklist> {
        let blacklist_path = assets_dir.join("blacklist").join("blacklist.json");

        if blacklist_path.exists() {
            let content = fs::read_to_string(&blacklist_path).await?;
            let blacklist: Blacklist = serde_json::from_str(&content)?;
            tracing::debug!("黑名单加载成功");
            Ok(blacklist)
        } else {
            tracing::warn!("未找到黑名单文件");
            Ok(Blacklist {
                buildings: HashMap::new(),
            })
        }
    }

    /// 处理所有天数的数据
    pub async fn process_all(&self) -> Result<()> {
        tracing::info!("--- 数据处理开始 ---");

        // 并行处理每一天的数据
        let days: Vec<u8> = (0..self.config.total_days).collect();
        
        let results: Vec<Result<()>> = days
            .par_iter()
            .map(|&day| {
                let input_dir = self.config.output_dir.join(format!("output-day-{}", day));

                if !input_dir.exists() {
                    tracing::warn!("Day {} 目录不存在，跳过", day);
                    return Ok(());
                }

                tracing::info!("Day {} 处理中...", day);

                // 注意：这里需要同步处理，因为 rayon 在同步上下文中运行
                self.process_directory_sync(&input_dir)
            })
            .collect();

        // 检查是否有错误
        for result in results {
            result?;
        }

        tracing::info!("数据处理完成");
        Ok(())
    }

    /// 同步处理单个目录的数据（用于 rayon 并行）
    fn process_directory_sync(&self, input_dir: &Path) -> Result<()> {
        let output_file = input_dir.join("processed_classroom_data.json");
        let mut all_data: Vec<RawClassroomData> = Vec::new();

        // 读取目录中所有相关的 JSON 文件
        let entries = std::fs::read_dir(input_dir)?;

        for entry in entries {
            let entry = entry?;
            let file_name = entry.file_name().to_string_lossy().to_string();

            if file_name.starts_with("classroom_results_") && file_name.ends_with(".json") {
                let file_path = input_dir.join(&file_name);
                let content = std::fs::read_to_string(&file_path)?;
                let mut data: Vec<RawClassroomData> = serde_json::from_str(&content)?;

                // 提取时段信息
                let time_slot = file_name
                    .strip_prefix("classroom_results_")
                    .and_then(|s| s.strip_suffix(".json"))
                    .unwrap_or("未知时段");

                // 设置时段
                for item in &mut data {
                    item.time_slot = Some(time_slot.to_string());
                }

                tracing::debug!("读取 {} ({} 条)", time_slot, data.len());

                all_data.extend(data);
            }
        }

        if all_data.is_empty() {
            tracing::info!("目录中无数据文件");
            return Ok(());
        }

        tracing::info!("合并 {} 条，开始筛选...", all_data.len());

        // 应用筛选和转换规则（使用 rayon 并行处理）
        let processed = self.apply_rules_parallel(all_data)?;

        tracing::info!("筛选完毕，剩余 {} 条", processed.len());

        // 保存处理后的数据
        let json = serde_json::to_string_pretty(&processed)?;
        std::fs::write(&output_file, json)?;

        tracing::debug!("写入 {}", output_file.display());

        Ok(())
    }

    /// 并行应用所有筛选和转换规则
    fn apply_rules_parallel(&self, data: Vec<RawClassroomData>) -> Result<Vec<ProcessedClassroomData>> {
        let blacklist = &self.blacklist;
        
        // 使用 rayon 并行处理
        let result: Vec<ProcessedClassroomData> = data
            .into_par_iter()
            .filter_map(|item| {
                // Rule 1: 如果"教学楼"和"教室设备配置"字段均为空字符串，舍弃
                if item.building.is_empty() && item.equipment_config.is_empty() {
                    return None;
                }

                // Rule 2: 如果"教室设备配置"字段为空字符串，但"教学楼"不为空，舍弃
                if item.equipment_config.is_empty() && !item.building.is_empty() {
                    return None;
                }

                // Rule 3: 如果"容量"字段值为"0"，舍弃
                if item.capacity == "0" {
                    return None;
                }

                // Rule 5: 如果"教室设备配置"字段值为禁止类型，舍弃
                if FORBIDDEN_CONFIGS.contains(&item.equipment_config.as_str()) {
                    return None;
                }

                // Rule 6: 如果"教学楼"字段值为禁止建筑，舍弃
                if FORBIDDEN_BUILDINGS.contains(&item.building.as_str()) {
                    return None;
                }

                // Rules 7-12: 名称清洗
                let cleaned_name = match clean_name_static(&item.building, &item.name) {
                    Some(name) => name,
                    None => return None,
                };

                // Rule 13: 黑名单过滤
                if let Some(blacklisted_rooms) = blacklist.buildings.get(&item.building)
                    && blacklisted_rooms.contains(&cleaned_name) {
                        return None;
                    }

                // 创建处理后的数据
                let processed = ProcessedClassroomData {
                    building: item.building,
                    name: cleaned_name,
                    capacity: item.capacity,
                    equipment_config: item.equipment_config,
                    time_slot: item.time_slot.unwrap_or_default(),
                };

                // 校验处理后的数据
                if processed.validate().is_err() {
                    return None;
                }

                Some(processed)
            })
            .collect();

        Ok(result)
    }
}

/// 静态函数：清洗教室名称（Rules 7-12）
fn clean_name_static(building: &str, name: &str) -> Option<String> {
    match building {
        "工学馆" => extract_number_part_static(name, "工学馆"),
        "管理楼" => extract_number_part_static(name, "管理楼"),
        "基础楼" => extract_number_part_static(name, "基础楼"),
        "人文楼" => extract_number_part_static(name, "人文楼"),
        "综合实验楼" => extract_number_part_static(name, "综合楼"),
        "科技楼" => clean_keji_building_static(name),
        _ => Some(name.to_string()),
    }
}

/// 静态函数：提取数字部分
fn extract_number_part_static(name: &str, prefix: &str) -> Option<String> {
    if let Some(rest) = name.strip_prefix(prefix)
        && NUMBER_PATTERN.is_match(rest) {
            return Some(rest.to_string());
        }

    // 如果不匹配前缀，返回原名称
    Some(name.to_string())
}

/// 静态函数：清洗科技楼名称
fn clean_keji_building_static(name: &str) -> Option<String> {
    // 检查是否以"科技楼"开头
    if let Some(rest) = name.strip_prefix("科技楼")
        && NUMBER_PATTERN.is_match(rest) {
            return Some(rest.to_string());
        }

    // 检查是否是"自主学习室"格式
    if let Some(caps) = ZIZHU_PATTERN.captures(name) {
        let letter = caps.get(1)?.as_str();
        let number = caps.get(2)?.as_str();
        return Some(format!("{}自习室{}", number, letter));
    }

    // 不符合任何规则，舍弃
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_number_part() {
        assert_eq!(
            extract_number_part_static("工学馆101", "工学馆"),
            Some("101".to_string())
        );

        assert_eq!(
            extract_number_part_static("工学馆301A", "工学馆"),
            Some("301A".to_string())
        );

        assert_eq!(
            extract_number_part_static("工学馆6026-A", "工学馆"),
            Some("6026-A".to_string())
        );
    }

    #[test]
    fn test_clean_keji_building() {
        // 普通科技楼教室
        assert_eq!(
            clean_keji_building_static("科技楼6026"),
            Some("6026".to_string())
        );

        // 自主学习室格式
        assert_eq!(
            clean_keji_building_static("自主学习室Q科技楼6026-A"),
            Some("6026-A自习室Q".to_string())
        );

        // 不符合规则的
        assert_eq!(clean_keji_building_static("其他教室"), None);
    }

    #[test]
    fn test_regex_performance() {
        // 测试预编译正则的性能
        let test_cases = vec![
            "101", "301A", "6026-A", "1234-B5", "abc", "12-34-56",
        ];

        for case in &test_cases {
            let _ = NUMBER_PATTERN.is_match(case);
        }
    }
}

//! HTML 解析模块
//!
//! 负责教务系统查询结果的解析（`gridtable` 表格 → 教室数据条目）、
//! 登录页 salt 提取，以及异常响应的特征摘要生成（用于错误诊断）。

use std::collections::HashMap;
use std::sync::LazyLock;

use scraper::{Html, Selector};

use crate::error::{AppError, Result};

/// 登录页 salt 提取模式：`CryptoJS.SHA1('salt_value-' + form['password'].value)`
static SALT_REGEX: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"CryptoJS\.SHA1\('([^']+)-' \+ form\['password'\]\.value\)").unwrap()
});

/// 响应特征摘要：`<title>` 内容
static TITLE_REGEX: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap());

/// 响应特征摘要：去除所有 HTML 标签
static TAGS_REGEX: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?s)<[^>]*>").unwrap());

/// 解析教室查询返回的 HTML
///
/// 注意：响应中必须有 `gridtable` 结果表格；缺失说明响应异常
/// （会话失效的登录页、服务端错误页等），返回错误而非空结果，
/// 以免把异常响应误写成合法的"无空闲教室"数据。
/// 表格存在但没有数据行，才是合法的空结果。
pub fn parse_classroom_html(html: &str) -> Result<Vec<RawClassroomEntry>> {
    let document = Html::parse_document(html);
    let mut results = Vec::new();

    // 查找表格；未找到说明响应异常，不能静默当作空结果
    let table_selector = Selector::parse("table.gridtable")
        .map_err(|e| AppError::Other(format!("解析表格选择器失败: {:?}", e)))?;

    let table = match document.select(&table_selector).next() {
        Some(t) => t,
        None => {
            let snippet = html_snippet(html);
            return Err(AppError::Fetch {
                message: format!(
                    "响应中未找到结果表格（可能是登录页或错误页），响应特征: {}",
                    snippet
                ),
            });
        }
    };

    // 获取表头
    let th_selector = Selector::parse("thead th")
        .map_err(|e| AppError::Other(format!("解析表头选择器失败: {:?}", e)))?;

    let headers: Vec<String> = table
        .select(&th_selector)
        .map(|th| th.text().collect::<String>().trim().to_string())
        .collect();

    // 获取数据行
    let tr_selector = Selector::parse("tbody tr")
        .map_err(|e| AppError::Other(format!("解析行选择器失败: {:?}", e)))?;

    let td_selector = Selector::parse("td")
        .map_err(|e| AppError::Other(format!("解析单元格选择器失败: {:?}", e)))?;

    for row in table.select(&tr_selector) {
        let mut entry = serde_json::Map::new();

        for (j, cell) in row.select(&td_selector).enumerate() {
            let header = headers
                .get(j)
                .cloned()
                .unwrap_or_else(|| format!("column{}", j + 1));
            let value = cell.text().collect::<String>().trim().to_string();
            entry.insert(header, serde_json::Value::String(value));
        }

        if !entry.is_empty() {
            results.push(RawClassroomEntry(entry));
        }
    }

    Ok(results)
}

/// 从 script 文本中提取 salt
///
/// 匹配模式: CryptoJS.SHA1('salt_value-' + form['password'].value)
pub fn extract_salt_from_script(text: &str) -> Option<String> {
    SALT_REGEX
        .captures(text)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// 提取 HTML 响应的特征摘要（标题 + 去除标签后的前 150 字符）
///
/// 用于在错误信息中附带响应特征，便于从 CI 日志诊断异常响应的来源。
pub fn html_snippet(html: &str) -> String {
    let title = TITLE_REGEX
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim())
        .unwrap_or("");

    let text: String = TAGS_REGEX
        .replace_all(html, " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(150)
        .collect();

    if title.is_empty() && text.is_empty() {
        return "（空响应）".to_string();
    }
    format!("title='{}' 正文='{}'", title, text)
}

/// 原始教室条目（从 HTML 解析）
#[derive(Debug, Clone)]
pub struct RawClassroomEntry(pub serde_json::Map<String, serde_json::Value>);

impl RawClassroomEntry {
    /// 获取字段值
    pub fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|v| v.as_str())
    }

    /// 转换为 RawClassroomData
    pub fn to_raw_classroom_data(
        &self,
        time_slot: String,
    ) -> Result<crate::models::RawClassroomData> {
        let building = self.get("教学楼").unwrap_or("").to_string();
        let name = self.get("名称").unwrap_or("").to_string();
        let capacity = self.get("容量").unwrap_or("0").to_string();
        let equipment_config = self.get("教室设备配置").unwrap_or("").to_string();
        let campus = self.get("校区").map(|s| s.to_string());
        let sequence_number = self.get("序号").map(|s| s.to_string());

        Ok(crate::models::RawClassroomData {
            building,
            name,
            capacity,
            equipment_config,
            campus,
            sequence_number,
            time_slot: Some(time_slot),
            extra: HashMap::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_salt() {
        let script = r#"
            var password = CryptoJS.SHA1('abc123-' + form['password'].value);
        "#;
        let salt = extract_salt_from_script(script);
        assert_eq!(salt, Some("abc123".to_string()));
    }

    #[test]
    fn test_extract_salt_no_match() {
        let script = r#"var x = 1;"#;
        let salt = extract_salt_from_script(script);
        assert_eq!(salt, None);
    }

    #[test]
    fn test_html_snippet() {
        let html = r#"<html><head><title>错误</title></head><body>系统繁忙</body></html>"#;
        let snippet = html_snippet(html);
        assert!(snippet.contains("title='错误'"));
        assert!(snippet.contains("系统繁忙"));

        assert_eq!(html_snippet(""), "（空响应）");
    }

    #[test]
    fn test_parse_missing_table_is_error() {
        // 无 gridtable 的响应（如登录页）必须报错而非空结果
        let html = r#"<html><body>本次会话已经被过期</body></html>"#;
        let result = parse_classroom_html(html);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("会话已经被过期"));
    }

    #[test]
    fn test_parse_empty_table_is_valid() {
        // 有表格但无数据行 = 合法的空结果
        let html = r#"<table class="gridtable"><thead><tr><th>教学楼</th><th>名称</th></tr></thead><tbody></tbody></table>"#;
        let results = parse_classroom_html(html).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_parse_rows() {
        let html = r#"<table class="gridtable"><thead><tr><th>教学楼</th><th>名称</th><th>容量</th></tr></thead><tbody><tr><td>工学馆</td><td>101</td><td>60</td></tr></tbody></table>"#;
        let results = parse_classroom_html(html).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].get("教学楼"), Some("工学馆"));
        assert_eq!(results[0].get("名称"), Some("101"));
    }

    #[test]
    fn test_raw_classroom_entry() {
        let mut map = serde_json::Map::new();
        map.insert(
            "教学楼".to_string(),
            serde_json::Value::String("工学馆".to_string()),
        );
        map.insert(
            "名称".to_string(),
            serde_json::Value::String("101".to_string()),
        );
        map.insert(
            "容量".to_string(),
            serde_json::Value::String("60".to_string()),
        );
        map.insert(
            "教室设备配置".to_string(),
            serde_json::Value::String("普通教室".to_string()),
        );

        let entry = RawClassroomEntry(map);
        assert_eq!(entry.get("教学楼"), Some("工学馆"));
        assert_eq!(entry.get("名称"), Some("101"));

        let data = entry.to_raw_classroom_data("1-2".to_string()).unwrap();
        assert_eq!(data.building, "工学馆");
        assert_eq!(data.time_slot, Some("1-2".to_string()));
    }
}

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

static SORT_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\d+)(.*)$").unwrap());

pub(super) fn smart_sort_classrooms(a: &str, b: &str) -> std::cmp::Ordering {
    if let (Some(caps_a), Some(caps_b)) = (SORT_REGEX.captures(a), SORT_REGEX.captures(b)) {
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

impl super::Generator {
    pub(super) fn format_rooms_with_style(
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

        let strikethrough_applicable = !is_last_slot;

        let styled_rooms: Vec<String> = rooms
            .iter()
            .map(|room| {
                let is_bold = all_day_free.contains(room);
                let is_underlined = !is_first_slot && !prev_rooms.contains(room);
                let is_strikethrough = strikethrough_applicable && !next_rooms.contains(room);

                let mut styled = room.clone();

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

pub(super) fn default_empty_filter(
    value: &tera::Value,
    _args: &HashMap<String, tera::Value>,
) -> tera::Result<tera::Value> {
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

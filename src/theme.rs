use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::Result;

/// 主题颜色配置（亮色/暗色模式各一套）
/// 每个字段对应 main.css 中的一个 CSS 变量
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ThemeColors {
    // --- 背景色 ---
    pub body_bg: Option<String>,
    pub badge_bg: Option<String>,
    pub banner_bg: Option<String>,
    pub tab_bar_bg: Option<String>,
    pub tab_active_bg: Option<String>,
    pub container_bg: Option<String>,
    pub container_shadow: Option<String>,
    pub info_box_bg: Option<String>,

    // --- 主文字色 ---
    pub body_text: Option<String>,
    pub collapsible_text: Option<String>,
    pub btn_text: Option<String>,
    pub info_text: Option<String>,
    pub badge_text: Option<String>,
    pub banner_text: Option<String>,
    pub banner_close_text: Option<String>,
    pub collapsible_desc_text: Option<String>,
    pub theme_name_text: Option<String>,
    pub h1_text: Option<String>,
    pub date_display_text: Option<String>,

    // --- 表格文字色 ---
    pub table_header_text: Option<String>,
    pub floor_label_bg: Option<String>,
    pub floor_label_text: Option<String>,
    pub building_name_bg: Option<String>,
    pub building_name_text: Option<String>,

    // --- Tab 文字色 ---
    pub tab_text: Option<String>,
    pub tab_text_hover: Option<String>,

    // --- Hover 背景色 ---
    pub date_btn_hover_bg: Option<String>,
    pub tab_hover_bg: Option<String>,
    pub theme_btn_hover_bg: Option<String>,

    // --- 边框色 ---
    pub banner_border: Option<String>,
    pub info_box_border: Option<String>,
    pub container_border: Option<String>,
    pub tab_bar_border: Option<String>,
    pub tab_btn_border: Option<String>,
    pub hr_border: Option<String>,
    pub collapsible_border: Option<String>,
    pub collapsible_desc_border: Option<String>,
    pub theme_btn_border: Option<String>,
    pub table_border: Option<String>,
    pub table_header_bg: Option<String>,
    pub info_box_text: Option<String>,

    // --- 强调色 ---
    pub date_btn_icon: Option<String>,
    pub tab_active_text: Option<String>,
    pub tab_active_border: Option<String>,
    pub timeslot_title_text: Option<String>,
    pub theme_btn_hover_border: Option<String>,

    // --- 链接 / 标记色 ---
    pub link_color: Option<String>,
    pub strong_color: Option<String>,
    pub del_color: Option<String>,
}

/// 主题布局配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ThemeLayout {
    pub font_size_table: Option<String>,
    pub font_size_td: Option<String>,
    pub font_size_header: Option<String>,
    pub font_size_info: Option<String>,
    pub font_size_timeslot: Option<String>,
    pub font_size_tab: Option<String>,
    pub font_size_date: Option<String>,
}

/// 主题顶层配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ThemeConfig {
    pub name: Option<String>,
    /// 明暗模式锁定: "light" | "dark" | None(跟随系统)
    pub mode: Option<String>,
    pub light: ThemeColors,
    pub dark: ThemeColors,
    pub layout: ThemeLayout,
}

impl ThemeConfig {
    /// 从 TOML 字符串解析主题配置
    pub fn from_toml(content: &str) -> Result<Self> {
        let config: ThemeConfig = toml::from_str(content)?;
        Ok(config)
    }

    /// 转换为 CSS 变量覆盖的 JSON 字符串（供前端使用）
    pub fn to_css_json(&self) -> String {
        let mut light = HashMap::new();
        let mut dark = HashMap::new();
        let mut layout = HashMap::new();

        // 亮色模式变量映射
        Self::map_colors(&self.light, &mut light);
        Self::map_colors(&self.dark, &mut dark);

        // 布局变量映射
        if let Some(v) = &self.layout.font_size_table { layout.insert("--font-size-table", v); }
        if let Some(v) = &self.layout.font_size_td { layout.insert("--font-size-td", v); }
        if let Some(v) = &self.layout.font_size_header { layout.insert("--font-size-header", v); }
        if let Some(v) = &self.layout.font_size_info { layout.insert("--font-size-info", v); }
        if let Some(v) = &self.layout.font_size_timeslot { layout.insert("--font-size-timeslot", v); }
        if let Some(v) = &self.layout.font_size_tab { layout.insert("--font-size-tab", v); }
        if let Some(v) = &self.layout.font_size_date { layout.insert("--font-size-date", v); }

        let mut result = serde_json::json!({
            "light": light,
            "dark": dark,
            "layout": layout,
        });

        if let Some(mode) = &self.mode {
            if mode == "light" || mode == "dark" {
                result["mode"] = serde_json::Value::String(mode.clone());
            }
        }

        serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
    }

    fn map_colors<'a>(colors: &'a ThemeColors, map: &mut HashMap<&'static str, &'a String>) {
        // 背景色
        if let Some(v) = &colors.body_bg { map.insert("--body-bg", v); }
        if let Some(v) = &colors.badge_bg { map.insert("--badge-bg", v); }
        if let Some(v) = &colors.banner_bg { map.insert("--banner-bg", v); }
        if let Some(v) = &colors.tab_bar_bg { map.insert("--tab-bar-bg", v); }
        if let Some(v) = &colors.tab_active_bg { map.insert("--tab-active-bg", v); }
        if let Some(v) = &colors.container_bg { map.insert("--container-bg", v); }
        if let Some(v) = &colors.container_shadow { map.insert("--container-shadow", v); }
        if let Some(v) = &colors.info_box_bg { map.insert("--info-box-bg", v); }

        // 主文字色
        if let Some(v) = &colors.body_text { map.insert("--body-text", v); }
        if let Some(v) = &colors.collapsible_text { map.insert("--collapsible-text", v); }
        if let Some(v) = &colors.btn_text { map.insert("--btn-text", v); }
        if let Some(v) = &colors.info_text { map.insert("--info-text", v); }
        if let Some(v) = &colors.badge_text { map.insert("--badge-text", v); }
        if let Some(v) = &colors.banner_text { map.insert("--banner-text", v); }
        if let Some(v) = &colors.banner_close_text { map.insert("--banner-close-text", v); }
        if let Some(v) = &colors.collapsible_desc_text { map.insert("--collapsible-desc-text", v); }
        if let Some(v) = &colors.theme_name_text { map.insert("--theme-name-text", v); }
        if let Some(v) = &colors.h1_text { map.insert("--h1-text", v); }
        if let Some(v) = &colors.date_display_text { map.insert("--date-display-text", v); }

        // 表格文字色
        if let Some(v) = &colors.table_header_text { map.insert("--table-header-text", v); }
        if let Some(v) = &colors.floor_label_bg { map.insert("--floor-label-bg", v); }
        if let Some(v) = &colors.floor_label_text { map.insert("--floor-label-text", v); }
        if let Some(v) = &colors.building_name_bg { map.insert("--building-name-bg", v); }
        if let Some(v) = &colors.building_name_text { map.insert("--building-name-text", v); }

        // Tab 文字色
        if let Some(v) = &colors.tab_text { map.insert("--tab-text", v); }
        if let Some(v) = &colors.tab_text_hover { map.insert("--tab-text-hover", v); }

        // Hover 背景色
        if let Some(v) = &colors.date_btn_hover_bg { map.insert("--date-btn-hover-bg", v); }
        if let Some(v) = &colors.tab_hover_bg { map.insert("--tab-hover-bg", v); }
        if let Some(v) = &colors.theme_btn_hover_bg { map.insert("--theme-btn-hover-bg", v); }

        // 边框色
        if let Some(v) = &colors.banner_border { map.insert("--banner-border", v); }
        if let Some(v) = &colors.info_box_border { map.insert("--info-box-border", v); }
        if let Some(v) = &colors.container_border { map.insert("--container-border", v); }
        if let Some(v) = &colors.tab_bar_border { map.insert("--tab-bar-border", v); }
        if let Some(v) = &colors.tab_btn_border { map.insert("--tab-btn-border", v); }
        if let Some(v) = &colors.hr_border { map.insert("--hr-border", v); }
        if let Some(v) = &colors.collapsible_border { map.insert("--collapsible-border", v); }
        if let Some(v) = &colors.collapsible_desc_border { map.insert("--collapsible-desc-border", v); }
        if let Some(v) = &colors.theme_btn_border { map.insert("--theme-btn-border", v); }
        if let Some(v) = &colors.table_border { map.insert("--table-border", v); }
        if let Some(v) = &colors.table_header_bg { map.insert("--table-header-bg", v); }
        if let Some(v) = &colors.info_box_text { map.insert("--info-box-text", v); }

        // 强调色
        if let Some(v) = &colors.date_btn_icon { map.insert("--date-btn-icon", v); }
        if let Some(v) = &colors.tab_active_text { map.insert("--tab-active-text", v); }
        if let Some(v) = &colors.tab_active_border { map.insert("--tab-active-border", v); }
        if let Some(v) = &colors.timeslot_title_text { map.insert("--timeslot-title-text", v); }
        if let Some(v) = &colors.theme_btn_hover_border { map.insert("--theme-btn-hover-border", v); }

        // 链接 / 标记色
        if let Some(v) = &colors.link_color { map.insert("--link-color", v); }
        if let Some(v) = &colors.strong_color { map.insert("--strong-color", v); }
        if let Some(v) = &colors.del_color { map.insert("--del-color", v); }
    }

    /// 生成默认主题的 JSON（空配置）
    pub fn default_json() -> String {
        serde_json::to_string(&serde_json::json!({
            "light": {},
            "dark": {},
            "layout": {},
            "mode": null
        }))
        .unwrap_or_else(|_| "{}".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_minimal_toml() {
        let toml_str = "name = \"My Theme\"\n\n[light]\nbody_bg = \"#ffffff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.name, Some("My Theme".to_string()));
        assert_eq!(config.light.body_bg, Some("#ffffff".to_string()));
        assert!(config.dark.body_bg.is_none());
    }

    #[test]
    fn test_parse_full_toml() {
        let toml_str = concat!(
            "name = \"Full Theme\"\n\n",
            "[light]\n",
            "body_bg = \"#fff\"\n",
            "body_text = \"#333\"\n",
            "tab_bar_bg = \"#eee\"\n",
            "tab_active_text = \"#007bff\"\n\n",
            "[dark]\n",
            "body_bg = \"#111\"\n",
            "body_text = \"#ccc\"\n\n",
            "[layout]\n",
            "font_size_header = \"24px\"\n",
        );
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.name, Some("Full Theme".to_string()));
        assert_eq!(config.light.body_bg, Some("#fff".to_string()));
        assert_eq!(config.dark.body_bg, Some("#111".to_string()));
        assert_eq!(config.layout.font_size_header, Some("24px".to_string()));
    }

    #[test]
    fn test_to_css_json() {
        let config = ThemeConfig {
            name: Some("Test".to_string()),
            mode: None,
            light: ThemeColors {
                body_bg: Some("#fff".to_string()),
                banner_bg: Some("#f0f0f0".to_string()),
                ..Default::default()
            },
            dark: ThemeColors {
                body_bg: Some("#000".to_string()),
                ..Default::default()
            },
            layout: ThemeLayout {
                ..Default::default()
            },
        };

        let json = config.to_css_json();
        assert!(json.contains("\"--body-bg\":\"#fff\""));
        assert!(json.contains("\"--banner-bg\":\"#f0f0f0\""));
        assert!(json.contains("\"--body-bg\":\"#000\""));
    }

    #[test]
    fn test_all_variables_mapped() {
        let config = ThemeConfig {
            name: None,
            mode: None,
            light: ThemeColors {
                body_bg: Some("a".into()),
                badge_bg: Some("a".into()),
                banner_bg: Some("a".into()),
                tab_bar_bg: Some("a".into()),
                tab_active_bg: Some("a".into()),
                container_bg: Some("a".into()),
                container_shadow: Some("a".into()),
                info_box_bg: Some("a".into()),
                body_text: Some("a".into()),
                collapsible_text: Some("a".into()),
                btn_text: Some("a".into()),
                info_text: Some("a".into()),
                badge_text: Some("a".into()),
                banner_text: Some("a".into()),
                banner_close_text: Some("a".into()),
                collapsible_desc_text: Some("a".into()),
                theme_name_text: Some("a".into()),
                h1_text: Some("a".into()),
                date_display_text: Some("a".into()),
                table_header_text: Some("a".into()),
                floor_label_bg: Some("a".into()),
                floor_label_text: Some("a".into()),
                building_name_bg: Some("a".into()),
                building_name_text: Some("a".into()),
                tab_text: Some("a".into()),
                tab_text_hover: Some("a".into()),
                date_btn_hover_bg: Some("a".into()),
                tab_hover_bg: Some("a".into()),
                theme_btn_hover_bg: Some("a".into()),
                banner_border: Some("a".into()),
                info_box_border: Some("a".into()),
                container_border: Some("a".into()),
                tab_bar_border: Some("a".into()),
                tab_btn_border: Some("a".into()),
                hr_border: Some("a".into()),
                collapsible_border: Some("a".into()),
                collapsible_desc_border: Some("a".into()),
                theme_btn_border: Some("a".into()),
                table_border: Some("a".into()),
                table_header_bg: Some("a".into()),
                info_box_text: Some("a".into()),
                date_btn_icon: Some("a".into()),
                tab_active_text: Some("a".into()),
                tab_active_border: Some("a".into()),
                timeslot_title_text: Some("a".into()),
                theme_btn_hover_border: Some("a".into()),
                link_color: Some("a".into()),
                strong_color: Some("a".into()),
                del_color: Some("a".into()),
            },
            dark: ThemeColors::default(),
            layout: ThemeLayout::default(),
        };

        let json = config.to_css_json();
        // 检查亮色模式中所有 44 个颜色变量都被映射
        let css_vars = [
            "--body-bg", "--badge-bg", "--banner-bg", "--tab-bar-bg",
            "--tab-active-bg", "--container-bg", "--container-shadow", "--info-box-bg",
            "--body-text", "--collapsible-text", "--btn-text", "--info-text",
            "--badge-text", "--banner-text", "--banner-close-text", "--collapsible-desc-text",
            "--theme-name-text", "--h1-text", "--date-display-text",
            "--table-header-text", "--floor-label-bg", "--floor-label-text",
            "--building-name-bg", "--building-name-text",
            "--tab-text", "--tab-text-hover", "--date-btn-hover-bg", "--tab-hover-bg",
            "--theme-btn-hover-bg", "--banner-border", "--info-box-border", "--container-border",
            "--tab-bar-border", "--tab-btn-border", "--hr-border", "--collapsible-border",
            "--collapsible-desc-border", "--theme-btn-border", "--table-border", "--table-header-bg",
            "--info-box-text", "--date-btn-icon", "--tab-active-text", "--tab-active-border",
            "--timeslot-title-text", "--theme-btn-hover-border", "--link-color", "--strong-color",
            "--del-color",
        ];
        for var in &css_vars {
            assert!(json.contains(var), "Missing variable: {}", var);
        }
    }

    #[test]
    fn test_empty_toml() {
        let config = ThemeConfig::from_toml("").unwrap();
        assert!(config.name.is_none());
        assert!(config.light.body_bg.is_none());
    }

    #[test]
    fn test_mode_field() {
        let toml_str = "name = \"Test\"\nmode = \"dark\"\n\n[light]\nbody_bg = \"#fff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.mode, Some("dark".to_string()));

        let json = config.to_css_json();
        assert!(json.contains("\"mode\":\"dark\""));
    }

    #[test]
    fn test_mode_absent() {
        let toml_str = "name = \"Test\"\n\n[light]\nbody_bg = \"#fff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert!(config.mode.is_none());

        let json = config.to_css_json();
        assert!(!json.contains("\"mode\""));
    }

    #[test]
    fn test_mode_invalid_ignored() {
        let toml_str = "mode = \"auto\"\n\n[light]\nbody_bg = \"#fff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.mode, Some("auto".to_string()));

        let json = config.to_css_json();
        assert!(!json.contains("\"mode\""));
    }
}

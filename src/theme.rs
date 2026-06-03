use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::Result;

/// 主题颜色配置（亮色/暗色模式各一套）
///
/// 命名规则: `{element}_{css_property}`
/// - element: 页面元素名（如 page, banner, tab, table, data 等）
/// - css_property: 原子化 CSS 属性（bg, color, border, shadow 等）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ThemeColors {
    // ── 页面 ──────────────────────────────────────────────
    pub page_bg: Option<String>,
    pub page_color: Option<String>,

    // ── 标题 ──────────────────────────────────────────────
    pub heading_color: Option<String>,

    // ── 日期显示 ──────────────────────────────────────────
    pub date_color: Option<String>,

    // ── 横幅 ──────────────────────────────────────────────
    pub banner_bg: Option<String>,
    pub banner_color: Option<String>,
    pub banner_close_color: Option<String>,
    pub banner_border: Option<String>,

    // ── 徽章 ──────────────────────────────────────────────
    pub badge_bg: Option<String>,
    pub badge_color: Option<String>,

    // ── 容器 ──────────────────────────────────────────────
    pub container_bg: Option<String>,
    pub container_shadow: Option<String>,
    pub container_border: Option<String>,

    // ── 信息框（紧急信息/事件） ───────────────────────────
    pub infobox_bg: Option<String>,
    pub infobox_color: Option<String>,
    pub infobox_border: Option<String>,

    // ── 信息文本（更新时间/版本等） ───────────────────────
    pub info_color: Option<String>,

    // ── Tab 栏 ────────────────────────────────────────────
    pub tabbar_bg: Option<String>,
    pub tabbar_border: Option<String>,

    // ── Tab 按钮 ──────────────────────────────────────────
    pub tab_color: Option<String>,
    pub tab_hover_color: Option<String>,
    pub tab_hover_bg: Option<String>,
    pub tab_active_bg: Option<String>,
    pub tab_active_color: Option<String>,
    pub tab_active_border: Option<String>,
    pub tab_border: Option<String>,

    // ── 日期切换按钮 ──────────────────────────────────────
    pub date_btn_color: Option<String>,
    pub date_btn_hover_bg: Option<String>,

    // ── 时段标题 ──────────────────────────────────────────
    pub timeslot_color: Option<String>,

    // ── 表格 ──────────────────────────────────────────────
    pub table_border: Option<String>,
    pub table_header_bg: Option<String>,
    pub table_header_color: Option<String>,
    pub floor_bg: Option<String>,
    pub floor_color: Option<String>,
    pub building_bg: Option<String>,
    pub building_color: Option<String>,

    // ── 折叠面板 ──────────────────────────────────────────
    pub collapsible_color: Option<String>,
    pub collapsible_border: Option<String>,
    pub collapsible_desc_color: Option<String>,
    pub collapsible_desc_border: Option<String>,

    // ── 主题控制按钮 ──────────────────────────────────────
    pub theme_btn_color: Option<String>,
    pub theme_btn_hover_bg: Option<String>,
    pub theme_btn_border: Option<String>,
    pub theme_btn_hover_border: Option<String>,
    pub theme_name_color: Option<String>,

    // ── 分割线 ────────────────────────────────────────────
    pub hr_border: Option<String>,

    // ── 链接 ──────────────────────────────────────────────
    pub link_color: Option<String>,

    // ── 数据单元格 ────────────────────────────────────────
    pub data_color: Option<String>,
    pub data_bg: Option<String>,

    // ── 数据单元格 · 加粗 ─────────────────────────────────
    pub data_strong_color: Option<String>,
    pub data_strong_bg: Option<String>,

    // ── 数据单元格 · 删除线 ───────────────────────────────
    pub data_del_color: Option<String>,
    pub data_del_decoration_color: Option<String>,
    pub data_del_decoration_style: Option<String>,
    pub data_del_decoration_thickness: Option<String>,
    pub data_del_bg: Option<String>,

    // ── 数据单元格 · 下划线 ───────────────────────────────
    pub data_u_color: Option<String>,
    pub data_u_decoration_color: Option<String>,
    pub data_u_decoration_style: Option<String>,
    pub data_u_decoration_thickness: Option<String>,
    pub data_u_bg: Option<String>,
}

/// 主题布局配置
///
/// 命名规则: `{element}_font_size`
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ThemeLayout {
    pub table_font_size: Option<String>,
    pub td_font_size: Option<String>,
    pub heading_font_size: Option<String>,
    pub info_font_size: Option<String>,
    pub timeslot_font_size: Option<String>,
    pub tab_font_size: Option<String>,
    pub date_font_size: Option<String>,
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

        Self::map_colors(&self.light, &mut light);
        Self::map_colors(&self.dark, &mut dark);

        // 布局变量映射
        if let Some(v) = &self.layout.table_font_size { layout.insert("--table-font-size", v); }
        if let Some(v) = &self.layout.td_font_size { layout.insert("--td-font-size", v); }
        if let Some(v) = &self.layout.heading_font_size { layout.insert("--heading-font-size", v); }
        if let Some(v) = &self.layout.info_font_size { layout.insert("--info-font-size", v); }
        if let Some(v) = &self.layout.timeslot_font_size { layout.insert("--timeslot-font-size", v); }
        if let Some(v) = &self.layout.tab_font_size { layout.insert("--tab-font-size", v); }
        if let Some(v) = &self.layout.date_font_size { layout.insert("--date-font-size", v); }

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
        // 页面
        if let Some(v) = &colors.page_bg { map.insert("--page-bg", v); }
        if let Some(v) = &colors.page_color { map.insert("--page-color", v); }

        // 标题
        if let Some(v) = &colors.heading_color { map.insert("--heading-color", v); }

        // 日期显示
        if let Some(v) = &colors.date_color { map.insert("--date-color", v); }

        // 横幅
        if let Some(v) = &colors.banner_bg { map.insert("--banner-bg", v); }
        if let Some(v) = &colors.banner_color { map.insert("--banner-color", v); }
        if let Some(v) = &colors.banner_close_color { map.insert("--banner-close-color", v); }
        if let Some(v) = &colors.banner_border { map.insert("--banner-border", v); }

        // 徽章
        if let Some(v) = &colors.badge_bg { map.insert("--badge-bg", v); }
        if let Some(v) = &colors.badge_color { map.insert("--badge-color", v); }

        // 容器
        if let Some(v) = &colors.container_bg { map.insert("--container-bg", v); }
        if let Some(v) = &colors.container_shadow { map.insert("--container-shadow", v); }
        if let Some(v) = &colors.container_border { map.insert("--container-border", v); }

        // 信息框
        if let Some(v) = &colors.infobox_bg { map.insert("--infobox-bg", v); }
        if let Some(v) = &colors.infobox_color { map.insert("--infobox-color", v); }
        if let Some(v) = &colors.infobox_border { map.insert("--infobox-border", v); }

        // 信息文本
        if let Some(v) = &colors.info_color { map.insert("--info-color", v); }

        // Tab 栏
        if let Some(v) = &colors.tabbar_bg { map.insert("--tabbar-bg", v); }
        if let Some(v) = &colors.tabbar_border { map.insert("--tabbar-border", v); }

        // Tab 按钮
        if let Some(v) = &colors.tab_color { map.insert("--tab-color", v); }
        if let Some(v) = &colors.tab_hover_color { map.insert("--tab-hover-color", v); }
        if let Some(v) = &colors.tab_hover_bg { map.insert("--tab-hover-bg", v); }
        if let Some(v) = &colors.tab_active_bg { map.insert("--tab-active-bg", v); }
        if let Some(v) = &colors.tab_active_color { map.insert("--tab-active-color", v); }
        if let Some(v) = &colors.tab_active_border { map.insert("--tab-active-border", v); }
        if let Some(v) = &colors.tab_border { map.insert("--tab-border", v); }

        // 日期切换按钮
        if let Some(v) = &colors.date_btn_color { map.insert("--date-btn-color", v); }
        if let Some(v) = &colors.date_btn_hover_bg { map.insert("--date-btn-hover-bg", v); }

        // 时段标题
        if let Some(v) = &colors.timeslot_color { map.insert("--timeslot-color", v); }

        // 表格
        if let Some(v) = &colors.table_border { map.insert("--table-border", v); }
        if let Some(v) = &colors.table_header_bg { map.insert("--table-header-bg", v); }
        if let Some(v) = &colors.table_header_color { map.insert("--table-header-color", v); }
        if let Some(v) = &colors.floor_bg { map.insert("--floor-bg", v); }
        if let Some(v) = &colors.floor_color { map.insert("--floor-color", v); }
        if let Some(v) = &colors.building_bg { map.insert("--building-bg", v); }
        if let Some(v) = &colors.building_color { map.insert("--building-color", v); }

        // 折叠面板
        if let Some(v) = &colors.collapsible_color { map.insert("--collapsible-color", v); }
        if let Some(v) = &colors.collapsible_border { map.insert("--collapsible-border", v); }
        if let Some(v) = &colors.collapsible_desc_color { map.insert("--collapsible-desc-color", v); }
        if let Some(v) = &colors.collapsible_desc_border { map.insert("--collapsible-desc-border", v); }

        // 主题控制按钮
        if let Some(v) = &colors.theme_btn_color { map.insert("--theme-btn-color", v); }
        if let Some(v) = &colors.theme_btn_hover_bg { map.insert("--theme-btn-hover-bg", v); }
        if let Some(v) = &colors.theme_btn_border { map.insert("--theme-btn-border", v); }
        if let Some(v) = &colors.theme_btn_hover_border { map.insert("--theme-btn-hover-border", v); }
        if let Some(v) = &colors.theme_name_color { map.insert("--theme-name-color", v); }

        // 分割线
        if let Some(v) = &colors.hr_border { map.insert("--hr-border", v); }

        // 链接
        if let Some(v) = &colors.link_color { map.insert("--link-color", v); }

        // 数据单元格
        if let Some(v) = &colors.data_color { map.insert("--data-color", v); }
        if let Some(v) = &colors.data_bg { map.insert("--data-bg", v); }

        // 数据单元格 · 加粗
        if let Some(v) = &colors.data_strong_color { map.insert("--data-strong-color", v); }
        if let Some(v) = &colors.data_strong_bg { map.insert("--data-strong-bg", v); }

        // 数据单元格 · 删除线
        if let Some(v) = &colors.data_del_color { map.insert("--data-del-color", v); }
        if let Some(v) = &colors.data_del_decoration_color { map.insert("--data-del-decoration-color", v); }
        if let Some(v) = &colors.data_del_decoration_style { map.insert("--data-del-decoration-style", v); }
        if let Some(v) = &colors.data_del_decoration_thickness { map.insert("--data-del-decoration-thickness", v); }
        if let Some(v) = &colors.data_del_bg { map.insert("--data-del-bg", v); }

        // 数据单元格 · 下划线
        if let Some(v) = &colors.data_u_color { map.insert("--data-u-color", v); }
        if let Some(v) = &colors.data_u_decoration_color { map.insert("--data-u-decoration-color", v); }
        if let Some(v) = &colors.data_u_decoration_style { map.insert("--data-u-decoration-style", v); }
        if let Some(v) = &colors.data_u_decoration_thickness { map.insert("--data-u-decoration-thickness", v); }
        if let Some(v) = &colors.data_u_bg { map.insert("--data-u-bg", v); }
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
        let toml_str = "name = \"My Theme\"\n\n[light]\npage_bg = \"#ffffff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.name, Some("My Theme".to_string()));
        assert_eq!(config.light.page_bg, Some("#ffffff".to_string()));
        assert!(config.dark.page_bg.is_none());
    }

    #[test]
    fn test_parse_full_toml() {
        let toml_str = concat!(
            "name = \"Full Theme\"\n\n",
            "[light]\n",
            "page_bg = \"#fff\"\n",
            "page_color = \"#333\"\n",
            "tabbar_bg = \"#eee\"\n",
            "tab_active_color = \"#007bff\"\n\n",
            "[dark]\n",
            "page_bg = \"#111\"\n",
            "page_color = \"#ccc\"\n\n",
            "[layout]\n",
            "heading_font_size = \"24px\"\n",
        );
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.name, Some("Full Theme".to_string()));
        assert_eq!(config.light.page_bg, Some("#fff".to_string()));
        assert_eq!(config.dark.page_bg, Some("#111".to_string()));
        assert_eq!(config.layout.heading_font_size, Some("24px".to_string()));
    }

    #[test]
    fn test_to_css_json() {
        let config = ThemeConfig {
            name: Some("Test".to_string()),
            mode: None,
            light: ThemeColors {
                page_bg: Some("#fff".to_string()),
                banner_bg: Some("#f0f0f0".to_string()),
                ..Default::default()
            },
            dark: ThemeColors {
                page_bg: Some("#000".to_string()),
                ..Default::default()
            },
            layout: ThemeLayout {
                ..Default::default()
            },
        };

        let json = config.to_css_json();
        assert!(json.contains("\"--page-bg\":\"#fff\""));
        assert!(json.contains("\"--banner-bg\":\"#f0f0f0\""));
        assert!(json.contains("\"--page-bg\":\"#000\""));
    }

    #[test]
    fn test_all_variables_mapped() {
        let config = ThemeConfig {
            name: None,
            mode: None,
            light: ThemeColors {
                page_bg: Some("a".into()),
                page_color: Some("a".into()),
                heading_color: Some("a".into()),
                date_color: Some("a".into()),
                banner_bg: Some("a".into()),
                banner_color: Some("a".into()),
                banner_close_color: Some("a".into()),
                banner_border: Some("a".into()),
                badge_bg: Some("a".into()),
                badge_color: Some("a".into()),
                container_bg: Some("a".into()),
                container_shadow: Some("a".into()),
                container_border: Some("a".into()),
                infobox_bg: Some("a".into()),
                infobox_color: Some("a".into()),
                infobox_border: Some("a".into()),
                info_color: Some("a".into()),
                tabbar_bg: Some("a".into()),
                tabbar_border: Some("a".into()),
                tab_color: Some("a".into()),
                tab_hover_color: Some("a".into()),
                tab_hover_bg: Some("a".into()),
                tab_active_bg: Some("a".into()),
                tab_active_color: Some("a".into()),
                tab_active_border: Some("a".into()),
                tab_border: Some("a".into()),
                date_btn_color: Some("a".into()),
                date_btn_hover_bg: Some("a".into()),
                timeslot_color: Some("a".into()),
                table_border: Some("a".into()),
                table_header_bg: Some("a".into()),
                table_header_color: Some("a".into()),
                floor_bg: Some("a".into()),
                floor_color: Some("a".into()),
                building_bg: Some("a".into()),
                building_color: Some("a".into()),
                collapsible_color: Some("a".into()),
                collapsible_border: Some("a".into()),
                collapsible_desc_color: Some("a".into()),
                collapsible_desc_border: Some("a".into()),
                theme_btn_color: Some("a".into()),
                theme_btn_hover_bg: Some("a".into()),
                theme_btn_border: Some("a".into()),
                theme_btn_hover_border: Some("a".into()),
                theme_name_color: Some("a".into()),
                hr_border: Some("a".into()),
                link_color: Some("a".into()),
                data_color: Some("a".into()),
                data_bg: Some("a".into()),
                data_strong_color: Some("a".into()),
                data_strong_bg: Some("a".into()),
                data_del_color: Some("a".into()),
                data_del_decoration_color: Some("a".into()),
                data_del_decoration_style: Some("a".into()),
                data_del_decoration_thickness: Some("a".into()),
                data_del_bg: Some("a".into()),
                data_u_color: Some("a".into()),
                data_u_decoration_color: Some("a".into()),
                data_u_decoration_style: Some("a".into()),
                data_u_decoration_thickness: Some("a".into()),
                data_u_bg: Some("a".into()),
            },
            dark: ThemeColors::default(),
            layout: ThemeLayout::default(),
        };

        let json = config.to_css_json();
        let css_vars = [
            "--page-bg", "--page-color", "--heading-color", "--date-color",
            "--banner-bg", "--banner-color", "--banner-close-color", "--banner-border",
            "--badge-bg", "--badge-color",
            "--container-bg", "--container-shadow", "--container-border",
            "--infobox-bg", "--infobox-color", "--infobox-border",
            "--info-color",
            "--tabbar-bg", "--tabbar-border",
            "--tab-color", "--tab-hover-color", "--tab-hover-bg",
            "--tab-active-bg", "--tab-active-color", "--tab-active-border", "--tab-border",
            "--date-btn-color", "--date-btn-hover-bg",
            "--timeslot-color",
            "--table-border", "--table-header-bg", "--table-header-color",
            "--floor-bg", "--floor-color", "--building-bg", "--building-color",
            "--collapsible-color", "--collapsible-border",
            "--collapsible-desc-color", "--collapsible-desc-border",
            "--theme-btn-color", "--theme-btn-hover-bg", "--theme-btn-border",
            "--theme-btn-hover-border", "--theme-name-color",
            "--hr-border", "--link-color",
            "--data-color", "--data-bg",
            "--data-strong-color", "--data-strong-bg",
            "--data-del-color", "--data-del-decoration-color", "--data-del-decoration-style",
            "--data-del-decoration-thickness", "--data-del-bg",
            "--data-u-color", "--data-u-decoration-color", "--data-u-decoration-style",
            "--data-u-decoration-thickness", "--data-u-bg",
        ];
        for var in &css_vars {
            assert!(json.contains(var), "Missing variable: {}", var);
        }
    }

    #[test]
    fn test_empty_toml() {
        let config = ThemeConfig::from_toml("").unwrap();
        assert!(config.name.is_none());
        assert!(config.light.page_bg.is_none());
    }

    #[test]
    fn test_mode_field() {
        let toml_str = "name = \"Test\"\nmode = \"dark\"\n\n[light]\npage_bg = \"#fff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.mode, Some("dark".to_string()));

        let json = config.to_css_json();
        assert!(json.contains("\"mode\":\"dark\""));
    }

    #[test]
    fn test_mode_absent() {
        let toml_str = "name = \"Test\"\n\n[light]\npage_bg = \"#fff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert!(config.mode.is_none());

        let json = config.to_css_json();
        assert!(!json.contains("\"mode\""));
    }

    #[test]
    fn test_data_fields_toml() {
        let toml_str = "\
name = \"Data Test\"\n\n\
[light]\n\
data_color = \"#333333\"\n\
data_bg = \"rgba(0,0,0,0.05)\"\n\
data_strong_color = \"#cc0000\"\n\
data_strong_bg = \"rgba(192,0,0,0.1)\"\n\
data_del_color = \"#0000cc\"\n\
data_del_decoration_color = \"#0000cc\"\n\
data_del_decoration_style = \"dashed\"\n\
data_del_decoration_thickness = \"1.5px\"\n\
data_del_bg = \"rgba(0,0,192,0.1)\"\n\
data_u_color = \"#00cc00\"\n\
data_u_decoration_color = \"#00cc00\"\n\
data_u_decoration_style = \"wavy\"\n\
data_u_decoration_thickness = \"2px\"\n\
data_u_bg = \"rgba(0,192,0,0.1)\"\n\n\
[dark]\n\
data_color = \"#cccccc\"\n\
data_bg = \"rgba(255,255,255,0.05)\"\n\
data_strong_color = \"#ff6666\"\n\
data_strong_bg = \"rgba(255,102,102,0.1)\"\n\
data_del_color = \"#6666ff\"\n\
data_del_decoration_color = \"#6666ff\"\n\
data_del_decoration_style = \"dotted\"\n\
data_del_decoration_thickness = \"1px\"\n\
data_del_bg = \"rgba(102,102,255,0.1)\"\n\
data_u_color = \"#66ff66\"\n\
data_u_decoration_color = \"#66ff66\"\n\
data_u_decoration_style = \"dashed\"\n\
data_u_decoration_thickness = \"1.5px\"\n\
data_u_bg = \"rgba(102,255,102,0.1)\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.name, Some("Data Test".to_string()));

        // Light
        assert_eq!(config.light.data_color, Some("#333333".to_string()));
        assert_eq!(config.light.data_bg, Some("rgba(0,0,0,0.05)".to_string()));
        assert_eq!(config.light.data_strong_color, Some("#cc0000".to_string()));
        assert_eq!(config.light.data_strong_bg, Some("rgba(192,0,0,0.1)".to_string()));
        assert_eq!(config.light.data_del_color, Some("#0000cc".to_string()));
        assert_eq!(config.light.data_del_decoration_color, Some("#0000cc".to_string()));
        assert_eq!(config.light.data_del_decoration_style, Some("dashed".to_string()));
        assert_eq!(config.light.data_del_decoration_thickness, Some("1.5px".to_string()));
        assert_eq!(config.light.data_del_bg, Some("rgba(0,0,192,0.1)".to_string()));
        assert_eq!(config.light.data_u_color, Some("#00cc00".to_string()));
        assert_eq!(config.light.data_u_decoration_color, Some("#00cc00".to_string()));
        assert_eq!(config.light.data_u_decoration_style, Some("wavy".to_string()));
        assert_eq!(config.light.data_u_decoration_thickness, Some("2px".to_string()));
        assert_eq!(config.light.data_u_bg, Some("rgba(0,192,0,0.1)".to_string()));

        // Dark
        assert_eq!(config.dark.data_color, Some("#cccccc".to_string()));
        assert_eq!(config.dark.data_del_decoration_style, Some("dotted".to_string()));
        assert_eq!(config.dark.data_u_decoration_style, Some("dashed".to_string()));

        // CSS variable mapping
        let json = config.to_css_json();
        assert!(json.contains("\"--data-color\":\"#333333\""));
        assert!(json.contains("\"--data-bg\":\"rgba(0,0,0,0.05)\""));
        assert!(json.contains("\"--data-strong-color\":\"#cc0000\""));
        assert!(json.contains("\"--data-strong-bg\":\"rgba(192,0,0,0.1)\""));
        assert!(json.contains("\"--data-del-color\":\"#0000cc\""));
        assert!(json.contains("\"--data-del-decoration-color\":\"#0000cc\""));
        assert!(json.contains("\"--data-del-decoration-style\":\"dashed\""));
        assert!(json.contains("\"--data-del-decoration-thickness\":\"1.5px\""));
        assert!(json.contains("\"--data-del-bg\":\"rgba(0,0,192,0.1)\""));
        assert!(json.contains("\"--data-u-color\":\"#00cc00\""));
        assert!(json.contains("\"--data-u-decoration-color\":\"#00cc00\""));
        assert!(json.contains("\"--data-u-decoration-style\":\"wavy\""));
        assert!(json.contains("\"--data-u-decoration-thickness\":\"2px\""));
        assert!(json.contains("\"--data-u-bg\":\"rgba(0,192,0,0.1)\""));
        assert!(json.contains("\"--data-color\":\"#cccccc\""));
        assert!(json.contains("\"--data-del-decoration-style\":\"dotted\""));
    }

    #[test]
    fn test_partial_data_config() {
        let toml_str = "\
[light]\n\
data_strong_color = \"#cc0000\"\n\
data_u_decoration_style = \"wavy\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.light.data_strong_color, Some("#cc0000".to_string()));
        assert_eq!(config.light.data_u_decoration_style, Some("wavy".to_string()));
        // Other data fields should be None
        assert!(config.light.data_color.is_none());
        assert!(config.light.data_bg.is_none());
        assert!(config.light.data_strong_bg.is_none());
        assert!(config.light.data_del_color.is_none());
        assert!(config.light.data_u_color.is_none());

        let json = config.to_css_json();
        assert!(json.contains("\"--data-strong-color\":\"#cc0000\""));
        assert!(json.contains("\"--data-u-decoration-style\":\"wavy\""));
        assert!(!json.contains("\"--data-color\""));
        assert!(!json.contains("\"--data-bg\""));
    }

    #[test]
    fn test_layout_fields() {
        let toml_str = "\
[layout]\n\
table_font_size = \"14px\"\n\
td_font_size = \"16px\"\n\
heading_font_size = \"28px\"\n\
info_font_size = \"15px\"\n\
timeslot_font_size = \"22px\"\n\
tab_font_size = \"18px\"\n\
date_font_size = \"20px\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.layout.table_font_size, Some("14px".to_string()));
        assert_eq!(config.layout.td_font_size, Some("16px".to_string()));
        assert_eq!(config.layout.heading_font_size, Some("28px".to_string()));
        assert_eq!(config.layout.info_font_size, Some("15px".to_string()));
        assert_eq!(config.layout.timeslot_font_size, Some("22px".to_string()));
        assert_eq!(config.layout.tab_font_size, Some("18px".to_string()));
        assert_eq!(config.layout.date_font_size, Some("20px".to_string()));

        let json = config.to_css_json();
        assert!(json.contains("\"--table-font-size\":\"14px\""));
        assert!(json.contains("\"--td-font-size\":\"16px\""));
        assert!(json.contains("\"--heading-font-size\":\"28px\""));
        assert!(json.contains("\"--info-font-size\":\"15px\""));
        assert!(json.contains("\"--timeslot-font-size\":\"22px\""));
        assert!(json.contains("\"--tab-font-size\":\"18px\""));
        assert!(json.contains("\"--date-font-size\":\"20px\""));
    }

    #[test]
    fn test_invalid_toml_returns_error() {
        let toml_str = "this is not valid toml [[[";
        let result = ThemeConfig::from_toml(toml_str);
        assert!(result.is_err());
    }

    #[test]
    fn test_missing_sections_use_defaults() {
        let toml_str = "name = \"Minimal\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        assert_eq!(config.name, Some("Minimal".to_string()));
        assert!(config.light.page_bg.is_none());
        assert!(config.dark.page_bg.is_none());
        assert!(config.light.data_color.is_none());
        assert!(config.dark.data_strong_color.is_none());
        assert!(config.layout.table_font_size.is_none());
    }

    #[test]
    fn test_css_json_structure() {
        let toml_str = "\
name = \"Struct\"\n\
mode = \"dark\"\n\n\
[light]\n\
page_bg = \"#ffffff\"\n\n\
[dark]\n\
page_bg = \"#000000\"\n\n\
[layout]\n\
heading_font_size = \"24px\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        let json_str = config.to_css_json();
        let json: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert!(json.get("light").is_some());
        assert!(json.get("dark").is_some());
        assert!(json.get("layout").is_some());
        assert_eq!(json["mode"], "dark");
        assert_eq!(json["light"]["--page-bg"], "#ffffff");
        assert_eq!(json["dark"]["--page-bg"], "#000000");
        assert_eq!(json["layout"]["--heading-font-size"], "24px");
    }

    #[test]
    fn test_css_json_no_mode_when_absent() {
        let toml_str = "\
[light]\n\
page_bg = \"#ffffff\"\n";
        let config = ThemeConfig::from_toml(toml_str).unwrap();
        let json_str = config.to_css_json();
        let json: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert!(json.get("mode").is_none());
    }

    #[test]
    fn test_preset_toml_files_parse() {
        let themes_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/themes");
        if !themes_dir.exists() {
            return;
        }
        for entry in std::fs::read_dir(&themes_dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "toml") {
                let content = std::fs::read_to_string(&path).unwrap();
                let config = ThemeConfig::from_toml(&content).unwrap();
                assert!(config.name.is_some(), "Missing name in {:?}", path);
                let has_light = config.light.page_bg.is_some() || config.light.page_color.is_some();
                let has_dark = config.dark.page_bg.is_some() || config.dark.page_color.is_some();
                assert!(has_light || has_dark, "No colors in {:?}", path);
            }
        }
    }

    #[test]
    fn test_color_field_count() {
        let config = ThemeConfig {
            light: ThemeColors {
                page_bg: Some("a".into()), page_color: Some("a".into()),
                heading_color: Some("a".into()), date_color: Some("a".into()),
                banner_bg: Some("a".into()), banner_color: Some("a".into()),
                banner_close_color: Some("a".into()), banner_border: Some("a".into()),
                badge_bg: Some("a".into()), badge_color: Some("a".into()),
                container_bg: Some("a".into()), container_shadow: Some("a".into()),
                container_border: Some("a".into()),
                infobox_bg: Some("a".into()), infobox_color: Some("a".into()),
                infobox_border: Some("a".into()), info_color: Some("a".into()),
                tabbar_bg: Some("a".into()), tabbar_border: Some("a".into()),
                tab_color: Some("a".into()), tab_hover_color: Some("a".into()),
                tab_hover_bg: Some("a".into()), tab_active_bg: Some("a".into()),
                tab_active_color: Some("a".into()), tab_active_border: Some("a".into()),
                tab_border: Some("a".into()),
                date_btn_color: Some("a".into()), date_btn_hover_bg: Some("a".into()),
                timeslot_color: Some("a".into()),
                table_border: Some("a".into()), table_header_bg: Some("a".into()),
                table_header_color: Some("a".into()),
                floor_bg: Some("a".into()), floor_color: Some("a".into()),
                building_bg: Some("a".into()), building_color: Some("a".into()),
                collapsible_color: Some("a".into()), collapsible_border: Some("a".into()),
                collapsible_desc_color: Some("a".into()), collapsible_desc_border: Some("a".into()),
                theme_btn_color: Some("a".into()), theme_btn_hover_bg: Some("a".into()),
                theme_btn_border: Some("a".into()), theme_btn_hover_border: Some("a".into()),
                theme_name_color: Some("a".into()),
                hr_border: Some("a".into()),
                link_color: Some("a".into()),
                data_color: Some("a".into()), data_bg: Some("a".into()),
                data_strong_color: Some("a".into()), data_strong_bg: Some("a".into()),
                data_del_color: Some("a".into()),
                data_del_decoration_color: Some("a".into()),
                data_del_decoration_style: Some("a".into()),
                data_del_decoration_thickness: Some("a".into()),
                data_del_bg: Some("a".into()),
                data_u_color: Some("a".into()),
                data_u_decoration_color: Some("a".into()),
                data_u_decoration_style: Some("a".into()),
                data_u_decoration_thickness: Some("a".into()),
                data_u_bg: Some("a".into()),
            },
            ..Default::default()
        };
        let json_str = config.to_css_json();
        let json: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let light_vars = json["light"].as_object().unwrap().len();
        assert_eq!(light_vars, 61, "Expected 61 color CSS variables, got {}", light_vars);
    }

    #[test]
    fn test_layout_field_count() {
        let config = ThemeConfig {
            layout: ThemeLayout {
                table_font_size: Some("a".into()),
                td_font_size: Some("a".into()),
                heading_font_size: Some("a".into()),
                info_font_size: Some("a".into()),
                timeslot_font_size: Some("a".into()),
                tab_font_size: Some("a".into()),
                date_font_size: Some("a".into()),
            },
            ..Default::default()
        };
        let json_str = config.to_css_json();
        let json: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let layout_vars = json["layout"].as_object().unwrap().len();
        assert_eq!(layout_vars, 7, "Expected 7 layout CSS variables, got {}", layout_vars);
    }

    #[test]
    fn test_default_json_structure() {
        let json_str = ThemeConfig::default_json();
        let json: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert!(json.get("light").is_some());
        assert!(json.get("dark").is_some());
        assert!(json.get("layout").is_some());
        assert_eq!(json["light"].as_object().unwrap().len(), 0);
        assert_eq!(json["dark"].as_object().unwrap().len(), 0);
        assert_eq!(json["layout"].as_object().unwrap().len(), 0);
        assert_eq!(json["mode"], serde_json::Value::Null);
    }
}

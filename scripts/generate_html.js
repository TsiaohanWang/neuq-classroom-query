// 引入Node.js内置的文件系统模块，用于读写文件
const fs = require('fs');
// 引入Node.js内置的路径处理模块，用于安全地构建和操作文件/目录路径
const path = require('path');
// 引入jsdom库，用于在Node.js环境中模拟浏览器DOM，方便地解析和操作HTML字符串
const { JSDOM } = require('jsdom');

// 定义HTML样板字符串。这是最终HTML报告的基础结构。
// 整个HTML结构已使用Tailwind CSS重构，并链接到本地编译的CSS文件。
const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN" class="">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>东秦空闲教室总表</title>
    <!-- 链接到预先编译好的Tailwind CSS文件 -->
    <link href="style.css" rel="stylesheet">
    <style>
        /* 为自定义的下划线和加粗文本添加样式，因为直接在HTML中添加标签更方便 */
        u { text-decoration: underline; }
        strong { font-weight: bold; color: #30448c; }
        /* 为暗黑模式下的特殊元素定义颜色，以确保对比度 */
        .dark strong { color: #a9b7ff; }
        .dark u { text-decoration-color: #a9b7ff; }
    </style>
</head>

<body class="max-w-3xl mx-auto my-0 mb-[15px] px-[10px] font-sans leading-relaxed text-gray-800 bg-gray-50 dark:bg-gray-900 dark:text-gray-300 transition-colors duration-300">

    <!-- 页面顶部容器，包含标题和暗黑模式切换按钮 -->
    <div class="relative">
        <h1 class="text-center mb-px text-2xl text-gray-800 dark:text-gray-100">
            <span id="current-date-placeholder">YYYY/MM/DD</span> 东秦空闲教室总表
        </h1>
        <!-- 暗黑模式切换按钮，绝对定位于右上角 -->
        <div id="theme-switcher" class="absolute top-0 right-0 p-2 cursor-pointer text-xl">
            <span id="theme-icon">🌙</span>
        </div>
    </div>

    <p class="text-center font-bold mb-1 text-sm text-gray-600 dark:text-gray-400">
        本空闲教室表更新于 <span id="update-time-placeholder">YYYY/MM/DD HH:MM</span>
    </p>
    <p class="text-center mb-1 text-sm text-gray-600 dark:text-gray-400">
        内容仅供参考，实际请以<a href="https://jwxt.neuq.edu.cn/" target="_blank" rel="noopener noreferrer" class="text-neuq-blue no-underline hover:underline dark:text-blue-400">教务系统</a>查询结果为准
    </p>
    <hr class="my-2.5 border-t border-gray-200 dark:border-gray-700">

    <!-- 选项卡容器 -->
    <div class="w-full mt-2.5 bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden text-center">
        <!-- 选项卡按钮组 -->
        <div class="flex bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">
            <!-- 
              按钮样式说明:
              - 第一个按钮默认带有 'active' 类，提供初始视觉提示。
              - JS脚本在切换时会移除所有按钮的 'active' 类，并只给当前点击的按钮添加。
            -->
            <button class="tab-button active" onclick="openTab(event, 'gongxueguan')">工学馆</button>
            <button class="tab-button" onclick="openTab(event, 'benbuqita')">本部其它</button>
            <button class="tab-button" onclick="openTab(event, 'nanxiaoqu')">南校区</button>
        </div>

        <!-- 工学馆内容 -->
        <div id="gongxueguan" class="tab-content active">
            <div class="emergency-info">
                <!-- 临时信息将由JS填充 -->
            </div>
            <!-- 时间段表格循环开始 -->
            <h3 class="timeslot-title">🏙上午第1-2节</h3>
            <table class="gxg-table">
                <tbody>
                    <tr><td>1F</td><td id="GXG1F1-2">占位符</td></tr>
                    <tr><td>2F</td><td id="GXG2F1-2">占位符</td></tr>
                    <tr><td>3F</td><td id="GXG3F1-2">占位符</td></tr>
                    <tr><td>4F</td><td id="GXG4F1-2">占位符</td></tr>
                    <tr><td>5F</td><td id="GXG5F1-2">占位符</td></tr>
                    <tr><td>6F</td><td id="GXG6F1-2">占位符</td></tr>
                    <tr><td>7F</td><td id="GXG7F1-2">占位符</td></tr>
                </tbody>
            </table>
            <!-- 其他时间段的表格结构与上面类似，此处省略以保持简洁 -->
            <h3 class="timeslot-title">🏙上午第3-4节</h3><table class="gxg-table"><tbody><tr><td>1F</td><td id="GXG1F3-4">占位符</td></tr><tr><td>2F</td><td id="GXG2F3-4">占位符</td></tr><tr><td>3F</td><td id="GXG3F3-4">占位符</td></tr><tr><td>4F</td><td id="GXG4F3-4">占位符</td></tr><tr><td>5F</td><td id="GXG5F3-4">占位符</td></tr><tr><td>6F</td><td id="GXG6F3-4">占位符</td></tr><tr><td>7F</td><td id="GXG7F3-4">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌇下午第5-6节</h3><table class="gxg-table"><tbody><tr><td>1F</td><td id="GXG1F5-6">占位符</td></tr><tr><td>2F</td><td id="GXG2F5-6">占位符</td></tr><tr><td>3F</td><td id="GXG3F5-6">占位符</td></tr><tr><td>4F</td><td id="GXG4F5-6">占位符</td></tr><tr><td>5F</td><td id="GXG5F5-6">占位符</td></tr><tr><td>6F</td><td id="GXG6F5-6">占位符</td></tr><tr><td>7F</td><td id="GXG7F5-6">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌇下午第7-8节</h3><table class="gxg-table"><tbody><tr><td>1F</td><td id="GXG1F7-8">占位符</td></tr><tr><td>2F</td><td id="GXG2F7-8">占位符</td></tr><tr><td>3F</td><td id="GXG3F7-8">占位符</td></tr><tr><td>4F</td><td id="GXG4F7-8">占位符</td></tr><tr><td>5F</td><td id="GXG5F7-8">占位符</td></tr><tr><td>6F</td><td id="GXG6F7-8">占位符</td></tr><tr><td>7F</td><td id="GXG7F7-8">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌃晚上第9-10节</h3><table class="gxg-table"><tbody><tr><td>1F</td><td id="GXG1F9-10">占位符</td></tr><tr><td>2F</td><td id="GXG2F9-10">占位符</td></tr><tr><td>3F</td><td id="GXG3F9-10">占位符</td></tr><tr><td>4F</td><td id="GXG4F9-10">占位符</td></tr><tr><td>5F</td><td id="GXG5F9-10">占位符</td></tr><tr><td>6F</td><td id="GXG6F9-10">占位符</td></tr><tr><td>7F</td><td id="GXG7F9-10">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌃晚上第11-12节</h3><table class="gxg-table"><tbody><tr><td>1F</td><td id="GXG1F11-12">占位符</td></tr><tr><td>2F</td><td id="GXG2F11-12">占位符</td></tr><tr><td>3F</td><td id="GXG3F11-12">占位符</td></tr><tr><td>4F</td><td id="GXG4F11-12">占位符</td></tr><tr><td>5F</td><td id="GXG5F11-12">占位符</td></tr><tr><td>6F</td><td id="GXG6F11-12">占位符</td></tr><tr><td>7F</td><td id="GXG7F11-12">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🏙昼间第1-8节</h3><table class="gxg-table"><tbody><tr><td>1F</td><td id="GXG1F1-8">占位符</td></tr><tr><td>2F</td><td id="GXG2F1-8">占位符</td></tr><tr><td>3F</td><td id="GXG3F1-8">占位符</td></tr><tr><td>4F</td><td id="GXG4F1-8">占位符</td></tr><tr><td>5F</td><td id="GXG5F1-8">占位符</td></tr><tr><td>6F</td><td id="GXG6F1-8">占位符</td></tr><tr><td>7F</td><td id="GXG7F1-8">占位符</td></tr></tbody></table>
            <hr class="mt-5 mb-2.5 dark:border-gray-700">
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：<u>下划线</u>表示该教室在上一时段未处于空闲，<strong>蓝色加粗</strong>表示该教室全天(1-12节)空闲。</p>
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>

        <!-- 本部其它教学楼内容 -->
        <div id="benbuqita" class="tab-content">
            <div class="emergency-info"></div>
            <!-- 时间段表格循环开始 -->
            <h3 class="timeslot-title">🏙上午第1-2节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>基础楼</td><td>综合实验楼</td><td>地质楼</td><td>管理楼</td></tr><tr class="classroom-row"><td id="JCL1-2">占位符</td><td id="ZHSYL1-2">占位符</td><td id="DZL1-2">占位符</td><td id="GLL1-2">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🏙上午第3-4节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>基础楼</td><td>综合实验楼</td><td>地质楼</td><td>管理楼</td></tr><tr class="classroom-row"><td id="JCL3-4">占位符</td><td id="ZHSYL3-4">占位符</td><td id="DZL3-4">占位符</td><td id="GLL3-4">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌇下午第5-6节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>基础楼</td><td>综合实验楼</td><td>地质楼</td><td>管理楼</td></tr><tr class="classroom-row"><td id="JCL5-6">占位符</td><td id="ZHSYL5-6">占位符</td><td id="DZL5-6">占位符</td><td id="GLL5-6">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌇下午第7-8节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>基础楼</td><td>综合实验楼</td><td>地质楼</td><td>管理楼</td></tr><tr class="classroom-row"><td id="JCL7-8">占位符</td><td id="ZHSYL7-8">占位符</td><td id="DZL7-8">占位符</td><td id="GLL7-8">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌃晚上第9-10节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>基础楼</td><td>综合实验楼</td><td>地质楼</td><td>管理楼</td></tr><tr class="classroom-row"><td id="JCL9-10">占位符</td><td id="ZHSYL9-10">占位符</td><td id="DZL9-10">占位符</td><td id="GLL9-10">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌃晚上第11-12节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>基础楼</td><td>综合实验楼</td><td>地质楼</td><td>管理楼</td></tr><tr class="classroom-row"><td id="JCL11-12">占位符</td><td id="ZHSYL11-12">占位符</td><td id="DZL11-12">占位符</td><td id="GLL11-12">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🏙昼间第1-8节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>基础楼</td><td>综合实验楼</td><td>地质楼</td><td>管理楼</td></tr><tr class="classroom-row"><td id="JCL1-8">占位符</td><td id="ZHSYL1-8">占位符</td><td id="DZL1-8">占位符</td><td id="GLL1-8">占位符</td></tr></tbody></table>
            <hr class="mt-5 mb-2.5 dark:border-gray-700">
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：<u>下划线</u>表示该教室在上一时段未处于空闲，<strong>蓝色加粗</strong>表示该教室全天(1-12节)空闲。</p>
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>

        <!-- 南校区内容 -->
        <div id="nanxiaoqu" class="tab-content">
            <div class="emergency-info"></div>
            <!-- 时间段表格循环开始 -->
            <h3 class="timeslot-title">🏙上午第1-2节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>科技楼</td><td>人文楼</td></tr><tr class="classroom-row"><td id="KJL1-2">占位符</td><td id="RWL1-2">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🏙上午第3-4节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>科技楼</td><td>人文楼</td></tr><tr class="classroom-row"><td id="KJL3-4">占位符</td><td id="RWL3-4">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌇下午第5-6节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>科技楼</td><td>人文楼</td></tr><tr class="classroom-row"><td id="KJL5-6">占位符</td><td id="RWL5-6">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌇下午第7-8节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>科技楼</td><td>人文楼</td></tr><tr class="classroom-row"><td id="KJL7-8">占位符</td><td id="RWL7-8">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌃晚上第9-10节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>科技楼</td><td>人文楼</td></tr><tr class="classroom-row"><td id="KJL9-10">占位符</td><td id="RWL9-10">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🌃晚上第11-12节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>科技楼</td><td>人文楼</td></tr><tr class="classroom-row"><td id="KJL11-12">占位符</td><td id="RWL11-12">占位符</td></tr></tbody></table>
            <h3 class="timeslot-title">🏙昼间第1-8节</h3><table class="campus-table"><tbody><tr class="building-name-row"><td>科技楼</td><td>人文楼</td></tr><tr class="classroom-row"><td id="KJL1-8">占位符</td><td id="RWL1-8">占位符</td></tr></tbody></table>
            <hr class="mt-5 mb-2.5 dark:border-gray-700">
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：<u>下划线</u>表示该教室在上一时段未处于空闲，<strong>蓝色加粗</strong>表示该教室全天(1-12节)空闲。</p>
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>
    </div>

    <p class="text-center text-xs text-gray-500 mt-4">Powered by Tsiaohan Wang <a href="https://github.com/TsiaohanWang/neuq-classroom-query" target="_blank" rel="noopener noreferrer" class="text-neuq-blue no-underline hover:underline dark:text-blue-400">项目入口</a></p>

    <script>
        // 选项卡切换功能
        function openTab(evt, tabName) {
            let i, tabcontent, tablinks;
            // 隐藏所有内容区域
            tabcontent = document.getElementsByClassName("tab-content");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].style.display = "none";
                tabcontent[i].classList.remove("active");
            }
            // 移除所有按钮的激活状态
            tablinks = document.getElementsByClassName("tab-button");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].classList.remove("active");
            }
            // 显示点击的选项卡内容并激活对应按钮
            document.getElementById(tabName).style.display = "block";
            document.getElementById(tabName).classList.add("active");
            evt.currentTarget.classList.add("active");
        }

        // 暗黑模式切换功能
        document.addEventListener('DOMContentLoaded', () => {
            const themeSwitcher = document.getElementById('theme-switcher');
            const themeIcon = document.getElementById('theme-icon');
            const htmlElement = document.documentElement;

            // 应用主题的函数
            const applyTheme = (theme) => {
                if (theme === 'dark') {
                    htmlElement.classList.add('dark');
                    themeIcon.textContent = '☀️';
                } else {
                    htmlElement.classList.remove('dark');
                    themeIcon.textContent = '🌙';
                }
            };

            // 初始化主题：检查localStorage > 检查系统偏好 > 根据时间自动设置
            const savedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const currentHour = new Date().getHours();
            const isNightTime = currentHour >= 20 || currentHour < 6;

            if (savedTheme) {
                applyTheme(savedTheme);
            } else if (prefersDark) {
                applyTheme('dark');
            } else {
                applyTheme(isNightTime ? 'dark' : 'light');
            }

            // 点击切换按钮的事件监听
            themeSwitcher.addEventListener('click', () => {
                const isDarkMode = htmlElement.classList.contains('dark');
                const newTheme = isDarkMode ? 'light' : 'dark';
                applyTheme(newTheme);
                localStorage.setItem('theme', newTheme);
            });
        });
    </script>

</body>
</html>
`;

// 定义输入JSON文件路径 (处理后的教室数据 和 事件数据)
const processedClassroomJsonPath = path.join(__dirname, '..', 'output', 'processed_classroom_data.json');
const eventJsonPath = path.join(__dirname, '..', 'calendar', 'neuq_event.json'); // 事件JSON文件路径
// 定义输出HTML文件路径
const outputHtmlPath = path.join(__dirname, '..', 'index.html'); // 输出到主目录

// 定义时间段标签与HTML中时间段标题的映射 (用于查找正确的h3标题)
const timeSlotLabels = [
    "🏙上午第1-2节", "🏙上午第3-4节", "🌇下午第5-6节", "🌇下午第7-8节",
    "🌃晚上第9-10节", "🌃晚上第11-12节", "🏙昼间第1-8节"
];

// 辅助函数：获取当前北京时间并格式化 (YYYY/MM/DD HH:MM)
function getBeijingTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type) => parts.find((part) => part.type === type)?.value;
    return `${getPart("year")}/${getPart("month")}/${getPart("day")} ${getPart("hour")}:${getPart("minute")}`;
}

// 辅助函数：获取当前北京日期并格式化 (YYYY/MM/DD)
function getBeijingDate() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type) => parts.find((part) => part.type === type)?.value;
    return `${getPart("year")}/${getPart("month")}/${getPart("day")}`;
}

// 辅助函数：将 YYYY/MM/DD 格式的日期字符串转换为 Date 对象（只取日期部分，忽略时间）
function parseDateString(dateString) {
    const [year, month, day] = dateString.split('/').map(Number);
    return new Date(year, month - 1, day);
}

// 辅助函数：从JSON数据中提取所有符合条件的教室号到一个Set中，用于后续的加粗和下划线逻辑
function getAllClassroomsFromData(jsonData, buildingFilter = null) {
    const classrooms = new Set();
    if (!jsonData || !Array.isArray(jsonData)) return classrooms;
    for (const entry of jsonData) {
        if (buildingFilter && entry["教学楼"] !== buildingFilter) continue;
        if (entry["名称"] &&
            (
                /^\d+[A-Z]?(-\d+[A-Z\d-]*)?$/.test(entry["名称"]) ||
                (entry["教学楼"] === "科技楼" && (entry["名称"].includes("自主学习室") || entry["名称"].includes("自习室")))
            )
        ) {
            classrooms.add(entry["名称"]);
        }
    }
    return classrooms;
}


// 主处理函数：生成最终的HTML报告
function generateFinalHtmlReport() {
    // 步骤 1: 读取已处理的教室JSON数据 (processed_classroom_data.json)
    let allProcessedClassroomData;
    try {
        if (!fs.existsSync(processedClassroomJsonPath)) {
            console.error(`错误：处理后的教室JSON文件未找到于 ${processedClassroomJsonPath}`);
            return;
        }
        const rawClassroomData = fs.readFileSync(processedClassroomJsonPath, 'utf-8');
        allProcessedClassroomData = JSON.parse(rawClassroomData);
        console.log(`成功读取 ${allProcessedClassroomData.length} 条处理后的教室数据。`);
    } catch (error) {
        console.error(`读取或解析 ${processedClassroomJsonPath} 时发生错误:`, error);
        return;
    }

    // 步骤 1.5: 读取事件JSON数据 (neuq_event.json)
    let eventData = [];
    try {
        if (fs.existsSync(eventJsonPath)) {
            const rawEventData = fs.readFileSync(eventJsonPath, 'utf-8');
            eventData = JSON.parse(rawEventData);
            console.log(`成功读取 ${eventData.length} 条事件数据。`);
        } else {
            console.warn(`警告：事件JSON文件 (${eventJsonPath}) 未找到。将不会显示任何事件通知。`);
        }
    } catch (error) {
        console.error(`读取或解析 ${eventJsonPath} 时发生错误:`, error);
    }


    // 步骤 2: 使用JSDOM解析HTML样板字符串，创建一个可操作的DOM对象
    const dom = new JSDOM(htmlTemplate);
    const document = dom.window.document;

    // 步骤 3: 更新HTML模板中的日期和时间戳占位符
    const currentBeijingDateStr = getBeijingDate();
    const currentBeijingTimeStr = getBeijingTime();
    const h1Placeholder = document.getElementById("current-date-placeholder");
    if (h1Placeholder) {
        h1Placeholder.textContent = currentBeijingDateStr;
    }
    const updateTimePlaceholder = document.getElementById("update-time-placeholder");
    if (updateTimePlaceholder) {
        updateTimePlaceholder.textContent = currentBeijingTimeStr;
    }

    // 步骤 3.5: 处理并填充临时突发信息到每个选项卡的通知框
    const todayDateObj = parseDateString(currentBeijingDateStr);
    const tomorrowDateObj = new Date(todayDateObj);
    tomorrowDateObj.setDate(todayDateObj.getDate() + 1);
    let emergencyHtmlContent = "";

    const upcomingEvents = eventData.filter(event => {
        try {
            const startDate = parseDateString(event["起始日期"]);
            const endDate = parseDateString(event["结束日期"]);
            return (todayDateObj >= startDate && todayDateObj <= endDate) || (tomorrowDateObj >= startDate && tomorrowDateObj <= endDate);
        } catch (e) {
            console.warn(`解析事件日期时出错: ${event["名称"]}`, e);
            return false;
        }
    });

    if (upcomingEvents.length > 0) {
        upcomingEvents.forEach(event => {
            const eventStartDate = parseDateString(event["起始日期"]);
            let dayIndicator = "";
            if (eventStartDate.getTime() === todayDateObj.getTime()) {
                dayIndicator = "今天";
            } else if (eventStartDate.getTime() === tomorrowDateObj.getTime()) {
                dayIndicator = "明天";
            } else {
                if (todayDateObj >= eventStartDate) {
                    dayIndicator = `今天 (活动持续至${event["结束日期"]})`;
                } else {
                    dayIndicator = "明天";
                }
            }
            let occupiedRoomsText = "";
            if (event["是否占用全体教室"] === true) {
                occupiedRoomsText = "全体教室。";
            } else if (event["占用教室"]) {
                occupiedRoomsText = `<strong>${event["占用教室"]}</strong>教室。`;
            }
            emergencyHtmlContent += `<p>📢 <strong>${event["名称"]}</strong>将于${dayIndicator} ${event["起始时间"]} - ${event["结束时间"]}占用<strong>${event["占用教学楼"]}</strong>${occupiedRoomsText}</p>`;
        });
    } else {
        emergencyHtmlContent = "<p>今日及明日暂无重要事件通知。</p>";
    }
    const emergencyDivs = document.querySelectorAll('.emergency-info');
    emergencyDivs.forEach(div => {
        div.innerHTML = emergencyHtmlContent;
    });


    // 步骤 4: 预先计算每个教学楼的全天空闲教室集合，用于后续的加粗逻辑
    console.log("正在计算各教学楼的全天空闲教室...");
    const allDayFreeGongXueGuan = calculateAllDayFreeClassroomsForBuilding(allProcessedClassroomData, "工学馆");
    const allDayFreeJiChuLou = calculateAllDayFreeClassroomsForBuilding(allProcessedClassroomData, "基础楼");
    const allDayFreeZongHeShiYanLou = calculateAllDayFreeClassroomsForBuilding(allProcessedClassroomData, "综合实验楼");
    const allDayFreeDiZhiLou = calculateAllDayFreeClassroomsForBuilding(allProcessedClassroomData, "地质楼");
    const allDayFreeGuanLiLou = calculateAllDayFreeClassroomsForBuilding(allProcessedClassroomData, "管理楼");
    const allDayFreeKeJiLou = calculateAllDayFreeClassroomsForBuilding(allProcessedClassroomData, "科技楼");
    const allDayFreeRenWenLou = calculateAllDayFreeClassroomsForBuilding(allProcessedClassroomData, "人文楼");
    console.log("全天空闲教室计算完毕。");


    // 步骤 5: 填充每个选项卡（工学馆、本部其它、南校区）的教室数据表格
    // 步骤 5.1: 填充工学馆选项卡 (id="gongxueguan")
    let previousGxgClassrooms = new Set();

    timeSlotLabels.forEach(slotLabel => {
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();
        const currentSlotDataGxg = allProcessedClassroomData.filter(item => item["教学楼"] === "工学馆" && item["空闲时段"] === timeSlotSuffix);

        for (let floorNum = 1; floorNum <= 7; floorNum++) {
            const floorStr = `${floorNum}F`;
            const cellId = `GXG${floorStr}${timeSlotSuffix}`;
            const roomCell = document.getElementById(cellId);

            if (roomCell) {
                const roomsForFloor = currentSlotDataGxg
                    .filter(item => item["名称"] && item["名称"].startsWith(floorNum.toString()))
                    .map(item => {
                        let displayName = item["名称"];
                        let isBold = allDayFreeGongXueGuan.has(item["名称"]);
                        let isUnderlined = slotLabel !== timeSlotLabels[0] && slotLabel !== "🏙昼间第1-8节" && !previousGxgClassrooms.has(item["名称"]);

                        if (isBold && isUnderlined) {
                            displayName = `<strong><u>${item["名称"]}</u></strong>`;
                        } else if (isBold) {
                            displayName = `<strong>${item["名称"]}</strong>`;
                        } else if (isUnderlined) {
                            displayName = `<u>${item["名称"]}</u>`;
                        }
                        return { raw: item["名称"], display: displayName };
                    })
                    .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
                    .map(item => item.display)
                    .join(' ');
                roomCell.innerHTML = roomsForFloor || '无';
            }
        }
        if (slotLabel !== "🏙昼间第1-8节") {
            previousGxgClassrooms = getAllClassroomsFromData(currentSlotDataGxg);
        }
    });


    // 步骤 5.2: 填充本部其它教学楼选项卡 (id="benbuqita")
    const benbuBuildings = ["基础楼", "综合实验楼", "地质楼", "管理楼"];
    const benbuBuildingCodes = { "基础楼": "JCL", "综合实验楼": "ZHSYL", "地质楼": "DZL", "管理楼": "GLL" };
    let previousBenbuClassrooms = {};
    benbuBuildings.forEach(b => previousBenbuClassrooms[b] = new Set());

    timeSlotLabels.forEach(slotLabel => {
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();
        benbuBuildings.forEach((buildingName) => {
            const cellId = `${benbuBuildingCodes[buildingName]}${timeSlotSuffix}`;
            const roomCell = document.getElementById(cellId);

            if (roomCell) {
                const currentSlotDataBuilding = allProcessedClassroomData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                const allDaySet = getAllDaySetForBuilding(buildingName, { allDayFreeJiChuLou, allDayFreeZongHeShiYanLou, allDayFreeDiZhiLou, allDayFreeGuanLiLou });

                const roomsForBuilding = currentSlotDataBuilding
                    .map(item => {
                        let displayName = item["名称"];
                        let isBold = allDaySet.has(item["名称"]);
                        let isUnderlined = slotLabel !== timeSlotLabels[0] && slotLabel !== "🏙昼间第1-8节" && !previousBenbuClassrooms[buildingName].has(item["名称"]);

                        if (isBold && isUnderlined) displayName = `<strong><u>${item["名称"]}</u></strong>`;
                        else if (isBold) displayName = `<strong>${item["名称"]}</strong>`;
                        else if (isUnderlined) displayName = `<u>${item["名称"]}</u>`;
                        return { raw: item["名称"], display: displayName };
                    })
                    .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
                    .map(item => item.display)
                    .join('<br>');
                roomCell.innerHTML = roomsForBuilding || '无';
            }
        });
        if (slotLabel !== "🏙昼间第1-8节") {
            benbuBuildings.forEach(buildingName => {
                const currentData = allProcessedClassroomData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                previousBenbuClassrooms[buildingName] = getAllClassroomsFromData(currentData);
            });
        }
    });


    // 步骤 5.3: 填充南校区选项卡 (id="nanxiaoqu")
    const nanxiaoquBuildings = ["科技楼", "人文楼"];
    const nanxiaoquBuildingCodes = { "科技楼": "KJL", "人文楼": "RWL" };
    let previousNanxiaoquClassrooms = {};
    nanxiaoquBuildings.forEach(b => previousNanxiaoquClassrooms[b] = new Set());

    timeSlotLabels.forEach(slotLabel => {
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();
        nanxiaoquBuildings.forEach((buildingName) => {
            const cellId = `${nanxiaoquBuildingCodes[buildingName]}${timeSlotSuffix}`;
            const roomCell = document.getElementById(cellId);

            if (roomCell) {
                const currentSlotDataBuilding = allProcessedClassroomData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                const allDaySet = getAllDaySetForBuilding(buildingName, { allDayFreeKeJiLou, allDayFreeRenWenLou });

                let regularRooms = [];
                let zizhuRooms = [];

                currentSlotDataBuilding.forEach(item => {
                    let displayName = item["名称"];
                    let isBold = allDaySet.has(item["名称"]);
                    let isUnderlined = slotLabel !== timeSlotLabels[0] && slotLabel !== "🏙昼间第1-8节" && !previousNanxiaoquClassrooms[buildingName].has(item["名称"]);

                    if (isBold && isUnderlined) displayName = `<strong><u>${item["名称"]}</u></strong>`;
                    else if (isBold) displayName = `<strong>${item["名称"]}</strong>`;
                    else if (isUnderlined) displayName = `<u>${item["名称"]}</u>`;

                    if (buildingName === "科技楼" && (item["名称"].includes("自主学习室") || item["名称"].includes("自习室"))) {
                        const letterMatch = item["名称"].match(/(?:自主学习室|自习室)([A-Z])$/i) ;
                        zizhuRooms.push({ raw: item["名称"], display: displayName, letter: letterMatch ? letterMatch[1].toUpperCase() : 'Z' });
                    } else {
                        regularRooms.push({ raw: item["名称"], display: displayName });
                    }
                });

                let finalRoomsString;
                if (buildingName === "科技楼") {
                    const regularPart = regularRooms
                        .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
                        .map(item => item.display)
                        .join(' ');
                    const zizhuPart = zizhuRooms
                        .sort((a, b) => a.letter.localeCompare(b.letter))
                        .map(item => item.display)
                        .join('<br>');
                    finalRoomsString = regularPart;
                    if (zizhuPart) {
                        finalRoomsString += (regularPart ? '<br>' : '') + zizhuPart;
                    }
                } else { // 人文楼
                    finalRoomsString = regularRooms
                        .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
                        .map(item => item.display)
                        .join(' ');
                }
                roomCell.innerHTML = finalRoomsString || '无';
            }
        });
        if (slotLabel !== "🏙昼间第1-8节") {
            nanxiaoquBuildings.forEach(buildingName => {
                const currentData = allProcessedClassroomData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                previousNanxiaoquClassrooms[buildingName] = getAllClassroomsFromData(currentData);
            });
        }
    });


    // 步骤 6: 将修改后的DOM对象序列化回HTML字符串，并写入到最终的HTML文件中
    const finalHtml = dom.serialize();
    try {
        fs.writeFileSync(outputHtmlPath, finalHtml, 'utf-8');
        console.log(`最终HTML报告已成功生成到: ${outputHtmlPath}`);
    } catch (error) {
        console.error(`写入最终HTML文件时发生错误: ${error}`);
    }
}

// 新辅助函数：为特定楼栋计算全天空闲教室
function calculateAllDayFreeClassroomsForBuilding(allProcessedData, buildingName) {
    const individualSlotSuffixes = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];
    let commonClassrooms = null;

    for (const suffix of individualSlotSuffixes) {
        const currentSlotClassrooms = new Set(
            allProcessedData
                .filter(item => item["教学楼"] === buildingName && item["空闲时段"] === suffix)
                .map(item => item["名称"])
        );

        if (commonClassrooms === null) {
            commonClassrooms = currentSlotClassrooms;
        } else {
            commonClassrooms = new Set([...commonClassrooms].filter(classroom => currentSlotClassrooms.has(classroom)));
        }
        if (commonClassrooms.size === 0) break;
    }
    return commonClassrooms || new Set();
}

// 新辅助函数：根据教学楼名称，从包含各楼全天空闲教室集合的对象中获取对应楼栋的集合
function getAllDaySetForBuilding(buildingName, allDaySets) {
    switch (buildingName) {
        case "基础楼": return allDaySets.allDayFreeJiChuLou;
        case "综合实验楼": return allDaySets.allDayFreeZongHeShiYanLou;
        case "地质楼": return allDaySets.allDayFreeDiZhiLou;
        case "管理楼": return allDaySets.allDayFreeGuanLiLou;
        case "科技楼": return allDaySets.allDayFreeKeJiLou;
        case "人文楼": return allDaySets.allDayFreeRenWenLou;
        default: return new Set();
    }
}

// 更智能的教室号排序函数，用于对教室号列表进行排序
function smartSortClassrooms(a, b) {
    const regex = /^(\d+)(.*)$/;
    const matchA = String(a).match(regex);
    const matchB = String(b).match(regex);

    if (matchA && matchB) {
        const numA = parseInt(matchA[1]);
        const numB = parseInt(matchB[1]);
        const suffixA = matchA[2];
        const suffixB = matchB[2];

        if (numA !== numB) {
            return numA - numB;
        }
        return suffixA.localeCompare(suffixB);
    }
    return String(a).localeCompare(String(b));
}


// 执行主函数，开始生成HTML报告
generateFinalHtmlReport();
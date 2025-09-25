// 引入Node.js内置的文件系统模块，用于读写文件
const fs = require('fs');
// 引入Node.js内置的路径处理模块，用于安全地构建和操作文件/目录路径
const path = require('path');
// 引入Node.js内置的加密模块，用于计算内容的哈希值
const crypto = require('crypto');
// 引入jsdom库，用于在Node.js环境中模拟浏览器DOM，方便地解析和操作HTML字符串
const { JSDOM } = require('jsdom');

// 定义HTML样板字符串。这是最终HTML报告的基础结构。
const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8" lang="zh-CN">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="format-detection" content="telephone=no, email=no, address=no">
    
    <title>东秦空闲教室总表</title>
    <link rel="stylesheet" href="../style/index.css">

    <style>
        body {
        max-width: 800px;
        margin: 0px auto 15px;
        padding: 0 10px;
        font-family: "Maple Mono", "PingFang SC", "Microsoft YaHei", "Segoe UI",
            Roboto, "Helvetica Neue", Arial, sans-serif;
        font-feature-settings: "cv01", "cv02", "cv05", "cv35", "cv40", "cv42", "cv43",
            "cv61", "cv62", "cv63", "ss01", "ss03", "ss04", "ss05", "ss06";
        line-height: 1.6;
        color: #333;
        background-color: #f9f9f9;
        }

        .tab-container {
        width: 100%;
        margin-top: 10px;
        background-color: #fff;
        border-radius: 16px;
        box-shadow: 2px 4px 3px 2px rgba(0, 0, 0, 0.06);
        overflow: hidden;
        text-align: center;
        }

        .tab-buttons {
        display: flex;
        background-color: #f0f0f0;
        border-bottom: 1px solid #d8d8d8;
        }

        .tab-button {
        padding: 6px 10px;
        cursor: pointer;
        border: none;
        background-color: transparent;
        color: #888;
        font-size: 17px;
        font-weight: 500;
        transition: background-color 0.2s ease, color 0.2s ease,
            border-color 0.2s ease;
        outline: none;
        flex-grow: 1;
        text-align: center;
        border-right: 1px solid #d8d8d8;
        }

        .tab-button:last-child {
        border-right: none;
        }

        .tab-button:hover {
        background-color: #e5e5e5;
        color: #000;
        }

        .tab-button.active {
        background-color: #fff;
        color: #30448c;
        border-bottom: 2px solid #30448c;
        font-size: 17px;
        }

        .tab-content {
        display: none;
        padding: 15px;
        border-top: none;
        animation: fadeIn 0.3s;
        }

        .tab-content.active {
        display: block;
        }

        @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
        }

        /* 临时信息通知框样式 */
        .emergency-info {
        padding: 4px 10px; /* 调整内边距 */
        margin-bottom: 10px; /* 与下方内容的间距 */
        border: 2px dashed rgba(48, 68, 140, 0.3); /* 校色的浅色边框 */
        border-radius: 8px; /* 圆角 */
        background-color: rgba(48, 68, 140, 0.08); /* 校色的淡化透明背景 */
        color: #2c3e50; /* 文字颜色 */
        text-align: left; /* 文字左对齐 */
        font-size: 13px; /* 字体大小 */
        line-height: 1.5; /* 行高 */
        }
        .emergency-info p {
        /* 通知内每条消息的段落样式 */
        margin: 0 0 5px 0; /* 段落下边距 */
        }
        .emergency-info p:last-child {
        margin-bottom: 0; /* 最后一条消息无下边距 */
        }

        /* 表格样式 */
        table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        font-size: 12px;
        }

        th,
        td {
        border: 1px solid #e0e0e0;
        padding: 4px;
        text-align: center;
        vertical-align: middle;
        }

        th {
        background-color: #f8f9fa;
        font-weight: bold;
        font-size: 12px;
        text-align: center;
        }

        td {
        font-size: 14px;
        text-align: center;
        }

        /* 工学馆楼层列样式 */
        .gxg-table td:first-child {
        font-weight: bold;
        width: 30px;
        font-size: 14px;
        text-align: center;
        }

        /* 本部其它和南校区表格的教学楼名称行样式 */
        .campus-table .building-name-row td {
        font-weight: bold;
        text-align: center;
        background-color: #f8f9fa;
        font-size: 13px;
        }

        /* 本部其它和南校区表格的教室号行样式 */
        .campus-table .classroom-row td {
        text-align: center;
        min-height: 50px;
        word-break: break-word;
        white-space: pre-wrap;
        }

        /* 页面标题和信息文本样式 */
        h1 {
        text-align: center;
        margin-bottom: 1px;
        font-size: 22px;
        color: #343a40;
        }

        .info-text {
        text-align: center;
        margin-bottom: 4px;
        font-size: 13px;
        color: #6c757d;
        }

        .info-text.update-time {
        text-align: center;
        font-weight: bold;
        display: flex; /* 使用flex布局让时间和徽章在同一行 */
        justify-content: center; /* 水平居中 */
        align-items: center; /* 垂直居中 */
        }

        .info-text a {
        color: #30448c;
        text-decoration: none;
        }

        .info-text a:hover {
        text-decoration: underline;
        }

        /* 时间段标题样式 */
        .timeslot-title {
        display: flex; /* 使用Flex布局来对齐图标和文本 */
        align-items: center; /* 垂直居中 */
        justify-content: center; /* 水平居中 */
        font-size: 20px;
        text-align: center;
        margin-top: 10px;
        margin-bottom: 4px;
        color: #30448c;
        cursor: pointer; /* 提示整个标题区域都可点击 */
        user-select: none; /* 防止点击时选中文字 */
        }
        /* 为下划线、加粗和删除线添加样式 */
        u { text-decoration: underline; text-decoration-color: #30448c; text-decoration-thickness: 1.25px; }
        strong { font-weight: bold; color: green; }
        del { text-decoration: line-through;
  text-decoration-color: gray; text-decoration-thickness: 0.75px; }

        /* 状态徽章样式 */
        .status-badge {
            margin-left: 8px;
            padding: 1px 6px;
            font-size: 10px;
            font-weight: bold;
            border-radius: 18px;
            text-transform: uppercase;
            opacity: 0.67;
        }
        .badge-updated {
            background-color: #28a745; /* 绿色 */
            color: white;
        }
        .badge-not-updated {
            background-color: #6c757d; /* 灰色 */
            color: white;
        }

        /* 折叠按钮图标样式 */
        .toggle-icon {
            margin-right: 4px; /* 图标与文字的间距 */
            transition: transform 0.4s ease-in-out; /* 为旋转添加平滑过渡效果 */
        }
        .toggle-icon.collapsed {
            transform: rotate(-90deg); /* 折叠时旋转图标 */
        }
    </style>
</head>

<body>

    <h1><span id="current-date-placeholder">YYYY/MM/DD</span>东秦空闲教室总表</h1>
    <p class="info-text update-time">
        <span>本空闲教室表更新于 <span id="update-time-placeholder">YYYY/MM/DD HH:MM</span></span>
        <!-- 状态徽章将由JS在此处动态插入 -->
    </p>
    <p class="info-text">内容仅供参考，实际请以<a href="https://jwxt.neuq.edu.cn/">教务系统</a>查询结果为准</p>
    <hr>

    <div class="tab-container">
        <div class="tab-buttons">
            <button class="tab-button active" onclick="openTab(event, 'gongxueguan')">工学馆</button>
            <button class="tab-button" onclick="openTab(event, 'benbuqita')">本部其它</button>
            <button class="tab-button" onclick="openTab(event, 'nanxiaoqu')">南校区</button>
        </div>

        <!-- 工学馆内容 -->
        <div id="gongxueguan" class="tab-content active">
            <div class="emergency-info" id="gxg-emergency-info">
                <!-- 临时信息将由JS填充 -->
            </div>
            <!-- 上午第1-2节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                上午第1-2节
            </h3>
            <table border="1" class="gxg-table">
                <tbody>
                    <tr>
                        <td>1F</td>
                        <td id="GXG1F1-2">GXG1F1-2占位符</td>
                    </tr>
                    <tr>
                        <td>2F</td>
                        <td id="GXG2F1-2">GXG2F1-2占位符</td>
                    </tr>
                    <tr>
                        <td>3F</td>
                        <td id="GXG3F1-2">GXG3F1-2占位符</td>
                    </tr>
                    <tr>
                        <td>4F</td>
                        <td id="GXG4F1-2">GXG4F1-2占位符</td>
                    </tr>
                    <tr>
                        <td>5F</td>
                        <td id="GXG5F1-2">GXG5F1-2占位符</td>
                    </tr>
                    <tr>
                        <td>6F</td>
                        <td id="GXG6F1-2">GXG6F1-2占位符</td>
                    </tr>
                    <tr>
                        <td>7F</td>
                        <td id="GXG7F1-2">GXG7F1-2占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 上午第3-4节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                上午第3-4节
            </h3>
            <table border="1" class="gxg-table">
                <tbody>
                    <tr>
                        <td>1F</td>
                        <td id="GXG1F3-4">GXG1F3-4占位符</td>
                    </tr>
                    <tr>
                        <td>2F</td>
                        <td id="GXG2F3-4">GXG2F3-4占位符</td>
                    </tr>
                    <tr>
                        <td>3F</td>
                        <td id="GXG3F3-4">GXG3F3-4占位符</td>
                    </tr>
                    <tr>
                        <td>4F</td>
                        <td id="GXG4F3-4">GXG4F3-4占位符</td>
                    </tr>
                    <tr>
                        <td>5F</td>
                        <td id="GXG5F3-4">GXG5F3-4占位符</td>
                    </tr>
                    <tr>
                        <td>6F</td>
                        <td id="GXG6F3-4">GXG6F3-4占位符</td>
                    </tr>
                    <tr>
                        <td>7F</td>
                        <td id="GXG7F3-4">GXG7F3-4占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 下午第5-6节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                下午第5-6节
            </h3>
            <table border="1" class="gxg-table">
                <tbody>
                    <tr>
                        <td>1F</td>
                        <td id="GXG1F5-6">GXG1F5-6占位符</td>
                    </tr>
                    <tr>
                        <td>2F</td>
                        <td id="GXG2F5-6">GXG2F5-6占位符</td>
                    </tr>
                    <tr>
                        <td>3F</td>
                        <td id="GXG3F5-6">GXG3F5-6占位符</td>
                    </tr>
                    <tr>
                        <td>4F</td>
                        <td id="GXG4F5-6">GXG4F5-6占位符</td>
                    </tr>
                    <tr>
                        <td>5F</td>
                        <td id="GXG5F5-6">GXG5F5-6占位符</td>
                    </tr>
                    <tr>
                        <td>6F</td>
                        <td id="GXG6F5-6">GXG6F5-6占位符</td>
                    </tr>
                    <tr>
                        <td>7F</td>
                        <td id="GXG7F5-6">GXG7F5-6占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 下午第7-8节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                下午第7-8节
            </h3>
            <table border="1" class="gxg-table">
                <tbody>
                    <tr>
                        <td>1F</td>
                        <td id="GXG1F7-8">GXG1F7-8占位符</td>
                    </tr>
                    <tr>
                        <td>2F</td>
                        <td id="GXG2F7-8">GXG2F7-8占位符</td>
                    </tr>
                    <tr>
                        <td>3F</td>
                        <td id="GXG3F7-8">GXG3F7-8占位符</td>
                    </tr>
                    <tr>
                        <td>4F</td>
                        <td id="GXG4F7-8">GXG4F7-8占位符</td>
                    </tr>
                    <tr>
                        <td>5F</td>
                        <td id="GXG5F7-8">GXG5F7-8占位符</td>
                    </tr>
                    <tr>
                        <td>6F</td>
                        <td id="GXG6F7-8">GXG6F7-8占位符</td>
                    </tr>
                    <tr>
                        <td>7F</td>
                        <td id="GXG7F7-8">GXG7F7-8占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 晚上第9-10节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                晚上第9-10节
            </h3>
            <table border="1" class="gxg-table">
                <tbody>
                    <tr>
                        <td>1F</td>
                        <td id="GXG1F9-10">GXG1F9-10占位符</td>
                    </tr>
                    <tr>
                        <td>2F</td>
                        <td id="GXG2F9-10">GXG2F9-10占位符</td>
                    </tr>
                    <tr>
                        <td>3F</td>
                        <td id="GXG3F9-10">GXG3F9-10占位符</td>
                    </tr>
                    <tr>
                        <td>4F</td>
                        <td id="GXG4F9-10">GXG4F9-10占位符</td>
                    </tr>
                    <tr>
                        <td>5F</td>
                        <td id="GXG5F9-10">GXG5F9-10占位符</td>
                    </tr>
                    <tr>
                        <td>6F</td>
                        <td id="GXG6F9-10">GXG6F9-10占位符</td>
                    </tr>
                    <tr>
                        <td>7F</td>
                        <td id="GXG7F9-10">GXG7F9-10占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 晚上第11-12节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                晚上第11-12节
            </h3>
            <table border="1" class="gxg-table">
                <tbody>
                    <tr>
                        <td>1F</td>
                        <td id="GXG1F11-12">GXG1F11-12占位符</td>
                    </tr>
                    <tr>
                        <td>2F</td>
                        <td id="GXG2F11-12">GXG2F11-12占位符</td>
                    </tr>
                    <tr>
                        <td>3F</td>
                        <td id="GXG3F11-12">GXG3F11-12占位符</td>
                    </tr>
                    <tr>
                        <td>4F</td>
                        <td id="GXG4F11-12">GXG4F11-12占位符</td>
                    </tr>
                    <tr>
                        <td>5F</td>
                        <td id="GXG5F11-12">GXG5F11-12占位符</td>
                    </tr>
                    <tr>
                        <td>6F</td>
                        <td id="GXG6F11-12">GXG6F11-12占位符</td>
                    </tr>
                    <tr>
                        <td>7F</td>
                        <td id="GXG7F11-12">GXG7F11-12占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 昼间第1-8节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                昼间第1-8节
            </h3>
            <table border="1" class="gxg-table">
                <tbody>
                    <tr>
                        <td>1F</td>
                        <td id="GXG1F1-8">GXG1F1-8占位符</td>
                    </tr>
                    <tr>
                        <td>2F</td>
                        <td id="GXG2F1-8">GXG2F1-8占位符</td>
                    </tr>
                    <tr>
                        <td>3F</td>
                        <td id="GXG3F1-8">GXG3F1-8占位符</td>
                    </tr>
                    <tr>
                        <td>4F</td>
                        <td id="GXG4F1-8">GXG4F1-8占位符</td>
                    </tr>
                    <tr>
                        <td>5F</td>
                        <td id="GXG5F1-8">GXG5F1-8占位符</td>
                    </tr>
                    <tr>
                        <td>6F</td>
                        <td id="GXG6F1-8">GXG6F1-8占位符</td>
                    </tr>
                    <tr>
                        <td>7F</td>
                        <td id="GXG7F1-8">GXG7F1-8占位符</td>
                    </tr>
                </tbody>
            </table>
            <hr style="margin-top: 20px; margin-bottom: 10px;">
            <p class="info-text" style="text-align: justify">注：<u>蓝色下划线</u>表示该教室在上一时段未处于空闲，<strong>绿色加粗</strong>表示该教室全天(1-12节)空闲，<del>灰色删除线</del>表示该教室将于下一时段被占用。</p>
            <p class="info-text" style="text-align: justify">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>

        <!-- 本部其它教学楼内容 -->
        <div id="benbuqita" class="tab-content">
            <div class="emergency-info" id="benbu-emergency-info">
                <!-- 临时信息将由JS填充 -->
            </div>
            <!-- 上午第1-2节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                上午第1-2节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>基础楼</td>
                        <td>综合实验楼</td>
                        <td>地质楼</td>
                        <td>管理楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="JCL1-2">JCL1-2占位符</td>
                        <td id="ZHSYL1-2">ZHSYL1-2占位符</td>
                        <td id="DZL1-2">DZL1-2占位符</td>
                        <td id="GLL1-2">GLL1-2占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 上午第3-4节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                上午第3-4节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>基础楼</td>
                        <td>综合实验楼</td>
                        <td>地质楼</td>
                        <td>管理楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="JCL3-4">JCL3-4占位符</td>
                        <td id="ZHSYL3-4">ZHSYL3-4占位符</td>
                        <td id="DZL3-4">DZL3-4占位符</td>
                        <td id="GLL3-4">GLL3-4占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 下午第5-6节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                下午第5-6节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>基础楼</td>
                        <td>综合实验楼</td>
                        <td>地质楼</td>
                        <td>管理楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="JCL5-6">JCL5-6占位符</td>
                        <td id="ZHSYL5-6">ZHSYL5-6占位符</td>
                        <td id="DZL5-6">DZL5-6占位符</td>
                        <td id="GLL5-6">GLL5-6占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 下午第7-8节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                下午第7-8节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>基础楼</td>
                        <td>综合实验楼</td>
                        <td>地质楼</td>
                        <td>管理楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="JCL7-8">JCL7-8占位符</td>
                        <td id="ZHSYL7-8">ZHSYL7-8占位符</td>
                        <td id="DZL7-8">DZL7-8占位符</td>
                        <td id="GLL7-8">GLL7-8占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 晚上第9-10节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                晚上第9-10节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>基础楼</td>
                        <td>综合实验楼</td>
                        <td>地质楼</td>
                        <td>管理楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="JCL9-10">JCL9-10占位符</td>
                        <td id="ZHSYL9-10">ZHSYL9-10占位符</td>
                        <td id="DZL9-10">DZL9-10占位符</td>
                        <td id="GLL9-10">GLL9-10占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 晚上第11-12节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                晚上第11-12节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>基础楼</td>
                        <td>综合实验楼</td>
                        <td>地质楼</td>
                        <td>管理楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="JCL11-12">JCL11-12占位符</td>
                        <td id="ZHSYL11-12">ZHSYL11-12占位符</td>
                        <td id="DZL11-12">DZL11-12占位符</td>
                        <td id="GLL11-12">GLL11-12占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 昼间第1-8节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                昼间第1-8节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>基础楼</td>
                        <td>综合实验楼</td>
                        <td>地质楼</td>
                        <td>管理楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="JCL1-8">JCL1-8占位符</td>
                        <td id="ZHSYL1-8">ZHSYL1-8占位符</td>
                        <td id="DZL1-8">DZL1-8占位符</td>
                        <td id="GLL1-8">GLL1-8占位符</td>
                    </tr>
                </tbody>
            </table>
            <hr style="margin-top: 20px; margin-bottom: 10px;">
            <p class="info-text" style="text-align: justify">注：<u>蓝色下划线</u>表示该教室在上一时段未处于空闲，<strong>绿色加粗</strong>表示该教室全天(1-12节)空闲，<del>灰色删除线</del>表示该教室将于下一时段被占用。</p>
            <p class="info-text" style="text-align: justify">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>

        <!-- 南校区内容 -->
        <div id="nanxiaoqu" class="tab-content">
            <div class="emergency-info" id="nanqu-emergency-info">
                <!-- 临时信息将由JS填充 -->
            </div>
            <!-- 上午第1-2节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                上午第1-2节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL1-2" style="font-size: 13px">KJL1-2占位符</td>
                        <td id="RWL1-2" style="font-size: 13px">RWL1-2占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 上午第3-4节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                上午第3-4节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL3-4" style="font-size: 13px">KJL3-4占位符</td>
                        <td id="RWL3-4" style="font-size: 13px">RWL3-4占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 下午第5-6节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                下午第5-6节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL5-6" style="font-size: 13px">KJL5-6占位符</td>
                        <td id="RWL5-6" style="font-size: 13px">RWL5-6占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 下午第7-8节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                下午第7-8节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL7-8" style="font-size: 13px">KJL7-8占位符</td>
                        <td id="RWL7-8" style="font-size: 13px">RWL7-8占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 晚上第9-10节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                晚上第9-10节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL9-10" style="font-size: 13px">KJL9-10占位符</td>
                        <td id="RWL9-10" style="font-size: 13px">RWL9-10占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 晚上第11-12节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                晚上第11-12节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL11-12" style="font-size: 13px">KJL11-12占位符</td>
                        <td id="RWL11-12" style="font-size: 13px">RWL11-12占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 昼间第1-8节 -->
            <h3 class="timeslot-title" onclick="toggleTable(this)">
                <span class="toggle-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 12 12"><path fill="currentColor" d="M1.293 3.293a1 1 0 0 1 1.32-.083l.094.083L6 6.585l3.293-3.292a1 1 0 0 1 1.32-.083l.094.083a1 1 0 0 1 .083 1.32l-.083.094l-4 4a1 1 0 0 1-1.32.083l-.094-.083l-4-4a1 1 0 0 1 0-1.414"/></svg>
                </span>
                昼间第1-8节
            </h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL1-8" style="font-size: 13px">KJL1-8占位符</td>
                        <td id="RWL1-8" style="font-size: 13px">RWL1-8占位符</td>
                    </tr>
                </tbody>
            </table>
            <hr style="margin-top: 20px; margin-bottom: 10px;">
            <p class="info-text" style="text-align: justify">注：<u>蓝色下划线</u>表示该教室在上一时段未处于空闲，<strong>绿色加粗</strong>表示该教室全天(1-12节)空闲，<del>灰色删除线</del>表示该教室将于下一时段被占用。</p>
            <p class="info-text" style="text-align: justify">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>
    </div>

    <p class="info-text">Powered by Tsiaohan Wang <a href="https://github.com/TsiaohanWang/neuq-classroom-query">项目入口</a></p>

    <script>
        function openTab(evt, tabName) {
            var i, tabcontent, tablinks;
            tabcontent = document.getElementsByClassName("tab-content");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].style.display = "none";
                tabcontent[i].classList.remove("active");
            }
            tablinks = document.getElementsByClassName("tab-button");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].classList.remove("active");
            }
            document.getElementById(tabName).style.display = "block";
            document.getElementById(tabName).classList.add("active");
            evt.currentTarget.classList.add("active");
        }

        function toggleTable(headerElement) {
            const table = headerElement.nextElementSibling;
            if (table && table.tagName === 'TABLE') {
                const icon = headerElement.querySelector('.toggle-icon');
                if (table.style.display === 'none') {
                    table.style.display = ''; // or 'table'
                    icon.classList.remove('collapsed');
                } else {
                    table.style.display = 'none';
                    icon.classList.add('collapsed');
                }
            }
        }
    </script>

</body>
</html>
`;

// 定义输入JSON文件路径 (处理后的教室数据 和 事件数据)
const processedClassroomJsonPath = path.join(
  __dirname,
  "..",
  "output",
  "processed_classroom_data.json"
);
const eventJsonPath = path.join(__dirname, "..", "calendar", "neuq_events.json"); // 事件JSON文件路径已更新
// 定义输出HTML文件路径
const outputHtmlPath = path.join(__dirname, "..", "index.html"); // 输出到主目录

// 定义时间段标签与HTML中时间段标题的映射 (用于查找正确的h3标题)
// 注意：这里的label需要与HTML模板中<h3>标签的文本内容完全一致
const timeSlotLabels = [
  "上午第1-2节",
  "上午第3-4节",
  "下午第5-6节",
  "下午第7-8节",
  "晚上第9-10节",
  "晚上第11-12节",
  "昼间第1-8节",
];

// 辅助函数：获取当前北京时间并格式化 (YYYY/MM/DD HH:MM)
function getBeijingTime() {
  const now = new Date(); // 获取当前本地时间
  // 使用Intl.DateTimeFormat来获取指定时区（Asia/Shanghai，即北京时间）的格式化时间
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    // 'zh-CN' 指定了中国大陆的区域设置，影响日期格式
    timeZone: "Asia/Shanghai", // 设置目标时区为上海（北京时间）
    year: "numeric",
    month: "2-digit",
    day: "2-digit", // 日期部分：年、月、日（两位数）
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // 时间部分：时、分（两位数，24小时制）
  });
  const parts = formatter.formatToParts(now); // 将日期格式化为包含各个部分的数组
  // 辅助函数，从parts数组中根据类型提取值
  const getPart = (type) => parts.find((part) => part.type === type)?.value;
  // 拼接成 "YYYY/MM/DD HH:MM" 格式
  return `${getPart("year")}/${getPart("month")}/${getPart("day")} ${getPart(
    "hour"
  )}:${getPart("minute")}`;
}

// 辅助函数：获取当前北京日期并格式化 (YYYY/MM/DD)
function getBeijingDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find((part) => part.type === type)?.value;
  return `${getPart("year")}/${getPart("month")}/${getPart("day")}`;
}

// 辅助函数：将 YYYY/MM/DD 格式的日期字符串转换为 Date 对象（只取日期部分，忽略时间）
function parseDateString(dateString) {
  const [year, month, day] = dateString.split("/").map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

// 辅助函数：从JSON数据中提取所有符合条件的教室号到一个Set中，用于后续的加粗和下划线逻辑
// jsonData: 包含教室信息的数组
// buildingFilter (可选): 如果提供，则只提取指定教学楼的教室
function getAllClassroomsFromData(jsonData, buildingFilter = null) {
  const classrooms = new Set(); // 使用Set存储教室号，可以自动去重
  if (!jsonData || !Array.isArray(jsonData)) return classrooms; // 如果数据无效，返回空Set

  for (const entry of jsonData) {
    // 遍历数据中的每个条目
    // 如果提供了楼栋过滤器，但当前条目的教学楼不匹配，则跳过
    if (buildingFilter && entry["教学楼"] !== buildingFilter) continue;

    // 检查条目是否有“名称”字段，并且教室名称格式符合预期
    if (
      entry["名称"] &&
      (/^\d+[A-Z]?(-\d+[A-Z\d-]*)?$/.test(entry["名称"]) || // 匹配如 101, 101A, 101-B, 6026-A
        (entry["教学楼"] === "科技楼" &&
          (entry["名称"].includes("自主学习室") ||
            entry["名称"].includes("自习室")))) // 匹配科技楼的特殊自习室命名
    ) {
      classrooms.add(entry["名称"]); // 将符合条件的教室号添加到Set中
    }
  }
  return classrooms; // 返回包含所有提取到的教室号的Set
}

// 主处理函数：生成最终的HTML报告
async function generateFinalHtmlReport() {
  // 步骤 1: 读取已处理的教室JSON数据 (processed_classroom_data.json)
  let allProcessedClassroomData; // 用于存储从JSON文件读取的数据
  try {
    // 检查处理后的教室JSON文件是否存在
    if (!fs.existsSync(processedClassroomJsonPath)) {
      console.error(
        `错误：处理后的教室JSON文件未找到于 ${processedClassroomJsonPath}`
      );
      return; // 如果文件不存在，则终止执行
    }
    const rawClassroomData = fs.readFileSync(
      processedClassroomJsonPath,
      "utf-8"
    ); // 同步读取文件内容
    allProcessedClassroomData = JSON.parse(rawClassroomData); // 解析JSON字符串为JavaScript对象/数组
    console.log(
      `成功读取 ${allProcessedClassroomData.length} 条处理后的教室数据。`
    );
  } catch (error) {
    console.error(
      `读取或解析 ${processedClassroomJsonPath} 时发生错误:`,
      error
    );
    return; // 如果发生错误，则终止执行
  }

  // 步骤 1.5: 读取事件JSON数据 (neuq_events.json)
  let eventData = []; // 默认为空数组，以防文件不存在或读取失败
  try {
    // 检查事件JSON文件是否存在
    if (fs.existsSync(eventJsonPath)) {
      const rawEventData = fs.readFileSync(eventJsonPath, "utf-8"); // 同步读取文件内容
      eventData = JSON.parse(rawEventData); // 解析JSON字符串
      console.log(`成功读取 ${eventData.length} 条事件数据。`);
    } else {
      console.warn(
        `警告：事件JSON文件 (${eventJsonPath}) 未找到。将不会显示任何事件通知。`
      );
    }
  } catch (error) {
    console.error(`读取或解析 ${eventJsonPath} 时发生错误:`, error);
    // 出错时，eventData 保持为空数组，不中断后续流程，仅影响通知显示
  }

  // 步骤 2: 使用JSDOM解析HTML样板字符串，创建一个可操作的DOM对象
  const dom = new JSDOM(htmlTemplate);
  const document = dom.window.document; // 获取DOM中的document对象

  // 步骤 3: 更新HTML模板中的日期和时间戳占位符
  const currentBeijingDateStr = getBeijingDate(); // 获取当前北京日期字符串 (YYYY/MM/DD)
  const currentBeijingTimeStr = getBeijingTime(); // 获取当前北京时间字符串 (YYYY/MM/DD HH:MM)
  // 更新 <h1> 标题中的日期占位符
  const h1Placeholder = document.getElementById("current-date-placeholder");
  if (h1Placeholder) {
    h1Placeholder.textContent = currentBeijingDateStr;
  }
  // 更新 <p> 标签中“本空闲教室表更新于”的时间戳占位符
  const updateTimePlaceholder = document.getElementById(
    "update-time-placeholder"
  );
  if (updateTimePlaceholder) {
    updateTimePlaceholder.textContent = currentBeijingTimeStr;
  }

  // 步骤 3.5: 处理并填充临时突发信息到每个选项卡的通知框
  const todayDateObj = parseDateString(currentBeijingDateStr); // 将当前北京日期字符串转换为Date对象（仅日期部分）
  let emergencyHtmlContent = ""; // 用于构建通知内容的HTML字符串

  // 筛选出在今天日期范围内的事件
  const todayActiveEvents = eventData.filter((event) => {
    try {
      const startDate = parseDateString(event["起始日期"]); // 事件起始日期
      const endDate = parseDateString(event["结束日期"]); // 事件结束日期
      // 检查当前日期是否在事件的起始和结束日期之间（包含当天）
      return todayDateObj >= startDate && todayDateObj <= endDate;
    } catch (e) {
      console.warn(`解析事件日期时出错: ${event["名称"]}`, e);
      return false; // 如果日期格式错误，则不显示此事件
    }
  });

  if (todayActiveEvents.length > 0) {
    // 如果今天有活动事件
    todayActiveEvents.forEach((event) => {
      // 根据“是否占用全体教室”字段格式化通知文本
      let occupiedRoomsText = "";
      if (event["是否占用全体教室"] === true) {
        // 注意：JSON中的布尔值可能是true/false，也可能是字符串"true"/"false"
        occupiedRoomsText = "全体教室。"; // 如果占用全体，则不列出具体教室
      } else if (event["占用教室"]) {
        occupiedRoomsText = `<strong>${event["占用教室"]}</strong>教室。`; // 否则列出具体教室
      }
      // 拼接事件通知的HTML段落
      emergencyHtmlContent += `<p>📢 <strong>${event["名称"]}</strong>将于${event["起始日期"]} ${event["起始时间"]} - ${event["结束日期"]} ${event["结束时间"]}占用<strong>${event["占用教学楼"]}</strong>${occupiedRoomsText}</p>`;
    });
  } else {
    emergencyHtmlContent = "<p>今日暂无重要事件通知。</p>"; // 如果没有当天事件，显示默认信息
  }
  // 获取所有选项卡的通知框元素（通过class）
  const emergencyDivs = document.querySelectorAll(".emergency-info");
  emergencyDivs.forEach((div) => {
    // 遍历每个通知框
    div.innerHTML = emergencyHtmlContent; // 将格式化后的通知内容填充到每个通知框
  });

  // 步骤 4: 预先计算每个教学楼的全天空闲教室集合，用于后续的加粗逻辑
  console.log("正在计算各教学楼的全天空闲教室...");
  const allDayFreeGongXueGuan = calculateAllDayFreeClassroomsForBuilding(
    allProcessedClassroomData,
    "工学馆"
  );
  const allDayFreeJiChuLou = calculateAllDayFreeClassroomsForBuilding(
    allProcessedClassroomData,
    "基础楼"
  );
  const allDayFreeZongHeShiYanLou = calculateAllDayFreeClassroomsForBuilding(
    allProcessedClassroomData,
    "综合实验楼"
  );
  const allDayFreeDiZhiLou = calculateAllDayFreeClassroomsForBuilding(
    allProcessedClassroomData,
    "地质楼"
  );
  const allDayFreeGuanLiLou = calculateAllDayFreeClassroomsForBuilding(
    allProcessedClassroomData,
    "管理楼"
  );
  const allDayFreeKeJiLou = calculateAllDayFreeClassroomsForBuilding(
    allProcessedClassroomData,
    "科技楼"
  );
  const allDayFreeRenWenLou = calculateAllDayFreeClassroomsForBuilding(
    allProcessedClassroomData,
    "人文楼"
  );
  console.log("全天空闲教室计算完毕。");

  // 步骤 4.5: 预处理数据，按时间段和教学楼分组，以便高效查找
  const dataBySlotAndBuilding = {}; // 创建一个空对象用于存储分组后的数据
  // 遍历所有时间段标签
  timeSlotLabels.forEach(label => {
    // 提取时间段后缀
    const suffix = label.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();
    // 为每个时间段后缀创建一个对象
    dataBySlotAndBuilding[suffix] = {};
    // 从总数据中筛选出当前时间段的数据
    const slotData = allProcessedClassroomData.filter(item => item["空闲时段"] === suffix);
    // 在当前时间段内，按教学楼进一步分组
    slotData.forEach(item => {
        const building = item["教学楼"];
        if (!dataBySlotAndBuilding[suffix][building]) {
            dataBySlotAndBuilding[suffix][building] = new Set(); // 如果是该楼栋的第一条数据，则创建一个新的Set
        }
        dataBySlotAndBuilding[suffix][building].add(item["名称"]); // 将教室号添加到对应楼栋的Set中
    });
  });
  console.log("数据已按时间段和教学楼进行预处理。");


  // 步骤 5: 填充每个选项卡（工学馆、本部其它、南校区）的教室数据表格
  // 定义时间段序列，用于“向前看”的逻辑
  const sequentialSlots = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];
  // 定义哪些时间段需要应用删除线逻辑
  const strikethroughApplicableSlots = ["1-2", "3-4", "5-6", "7-8", "9-10"];

  // 步骤 5.1: 填充工学馆选项卡 (id="gongxueguan")
  let previousGxgClassrooms = new Set(); // 用于工学馆的下划线逻辑，存储上一个时间段的空闲教室

  // 使用带索引的循环遍历时间段标签
  for (let i = 0; i < timeSlotLabels.length; i++) {
    const slotLabel = timeSlotLabels[i];
    const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim(); // 提取当前时间段后缀
    const currentSlotDataGxg = allProcessedClassroomData.filter(
      (item) =>
        item["教学楼"] === "工学馆" && item["空闲时段"] === timeSlotSuffix
    );

    // 确定下一个时间段的空闲教室集合，用于删除线逻辑
    let nextSlotGxgClassrooms = new Set();
    const sequentialIndex = sequentialSlots.indexOf(timeSlotSuffix); // 查找当前时间段在序列中的位置
    // 如果当前时间段在序列中，并且不是最后一个
    if (sequentialIndex > -1 && sequentialIndex < sequentialSlots.length - 1) {
        const nextSlotSuffix = sequentialSlots[sequentialIndex + 1]; // 获取下一个时间段的后缀
        // 从预处理的数据中获取下一个时间段工学馆的教室Set
        nextSlotGxgClassrooms = (dataBySlotAndBuilding[nextSlotSuffix] && dataBySlotAndBuilding[nextSlotSuffix]["工学馆"]) || new Set();
    }


    // 遍历工学馆的楼层 (1F到7F)
    for (let floorNum = 1; floorNum <= 7; floorNum++) {
      const floorStr = `${floorNum}F`;
      const cellId = `GXG${floorStr}${timeSlotSuffix}`;
      const roomCell = document.getElementById(cellId);

      if (roomCell) {
        const roomsForFloor = currentSlotDataGxg
          .filter(
            (item) =>
              item["名称"] && item["名称"].startsWith(floorNum.toString())
          )
          .map((item) => {
            let displayName = item["名称"];
            const isBold = allDayFreeGongXueGuan.has(item["名称"]);
            const isUnderlined =
              slotLabel !== timeSlotLabels[0] &&
              slotLabel !== "昼间第1-8节" &&
              !previousGxgClassrooms.has(item["名称"]);
            // 判断是否需要删除线：当前时间段适用，且下一个时间段的空闲列表中没有这个教室
            const isStrikethrough = strikethroughApplicableSlots.includes(timeSlotSuffix) && !nextSlotGxgClassrooms.has(item["名称"]);

            // 按优先级组合样式：加粗 > 删除线 > 下划线 (从内到外包裹)
            let styledName = item["名称"];
            if (isUnderlined) {
                styledName = `<u>${styledName}</u>`;
            }
            if (isStrikethrough) {
                styledName = `<del>${styledName}</del>`;
            }
            if (isBold) {
                styledName = `<strong>${styledName}</strong>`;
            }
            return { raw: item["名称"], display: styledName };
          })
          .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
          .map((item) => item.display)
          .join(" ");
        roomCell.innerHTML = roomsForFloor || "无";
      }
    }
    // 更新“上一个时间段”的教室数据，但排除“昼间第1-8节”作为比较基准
    if (slotLabel !== "昼间第1-8节") {
      previousGxgClassrooms = getAllClassroomsFromData(currentSlotDataGxg);
    }
  }


  // 步骤 5.2: 填充本部其它教学楼选项卡 (id="benbuqita")
  const benbuBuildings = ["基础楼", "综合实验楼", "地质楼", "管理楼"];
  const benbuBuildingCodes = { "基础楼": "JCL", "综合实验楼": "ZHSYL", "地质楼": "DZL", "管理楼": "GLL" };
  let previousBenbuClassrooms = {};
  benbuBuildings.forEach((b) => (previousBenbuClassrooms[b] = new Set()));

  for (let i = 0; i < timeSlotLabels.length; i++) {
    const slotLabel = timeSlotLabels[i];
    const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();

    benbuBuildings.forEach((buildingName) => {
      const cellId = `${benbuBuildingCodes[buildingName]}${timeSlotSuffix}`;
      const roomCell = document.getElementById(cellId);
      
      if (roomCell) {
        const currentSlotDataBuilding = allProcessedClassroomData.filter(
          (item) =>
            item["教学楼"] === buildingName &&
            item["空闲时段"] === timeSlotSuffix
        );
        const allDaySet = getAllDaySetForBuilding(buildingName, {
          allDayFreeJiChuLou,
          allDayFreeZongHeShiYanLou,
          allDayFreeDiZhiLou,
          allDayFreeGuanLiLou,
        });

        let nextSlotBuildingClassrooms = new Set();
        const sequentialIndex = sequentialSlots.indexOf(timeSlotSuffix);
        if (sequentialIndex > -1 && sequentialIndex < sequentialSlots.length - 1) {
            const nextSlotSuffix = sequentialSlots[sequentialIndex + 1];
            nextSlotBuildingClassrooms = (dataBySlotAndBuilding[nextSlotSuffix] && dataBySlotAndBuilding[nextSlotSuffix][buildingName]) || new Set();
        }

        const roomsForBuilding = currentSlotDataBuilding
          .map((item) => {
            let styledName = item["名称"];
            const isBold = allDaySet.has(item["名称"]);
            const isUnderlined =
              slotLabel !== timeSlotLabels[0] &&
              slotLabel !== "昼间第1-8节" &&
              !previousBenbuClassrooms[buildingName].has(item["名称"]);
            const isStrikethrough = strikethroughApplicableSlots.includes(timeSlotSuffix) && !nextSlotBuildingClassrooms.has(item["名称"]);

            if (isUnderlined) styledName = `<u>${styledName}</u>`;
            if (isStrikethrough) styledName = `<del>${styledName}</del>`;
            if (isBold) styledName = `<strong>${styledName}</strong>`;

            return { raw: item["名称"], display: styledName };
          })
          .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
          .map((item) => item.display)
          .join("<br>");
        roomCell.innerHTML = roomsForBuilding || "无";
      }
    });

    if (slotLabel !== "昼间第1-8节") {
      benbuBuildings.forEach((buildingName) => {
        const currentData = allProcessedClassroomData.filter(
          (item) =>
            item["教学楼"] === buildingName &&
            item["空闲时段"] === timeSlotSuffix
        );
        previousBenbuClassrooms[buildingName] =
          getAllClassroomsFromData(currentData);
      });
    }
  }


  // 步骤 5.3: 填充南校区选项卡 (id="nanxiaoqu")
  const nanxiaoquBuildings = ["科技楼", "人文楼"];
  const nanxiaoquBuildingCodes = { "科技楼": "KJL", "人文楼": "RWL" };
  let previousNanxiaoquClassrooms = {};
  nanxiaoquBuildings.forEach(
    (b) => (previousNanxiaoquClassrooms[b] = new Set())
  );

  for (let i = 0; i < timeSlotLabels.length; i++) {
    const slotLabel = timeSlotLabels[i];
    const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();

    nanxiaoquBuildings.forEach((buildingName) => {
      const cellId = `${nanxiaoquBuildingCodes[buildingName]}${timeSlotSuffix}`;
      const roomCell = document.getElementById(cellId);

      if (roomCell) {
        const currentSlotDataBuilding = allProcessedClassroomData.filter(
          (item) =>
            item["教学楼"] === buildingName &&
            item["空闲时段"] === timeSlotSuffix
        );
        const allDaySet = getAllDaySetForBuilding(buildingName, {
          allDayFreeKeJiLou,
          allDayFreeRenWenLou,
        });

        let nextSlotBuildingClassrooms = new Set();
        const sequentialIndex = sequentialSlots.indexOf(timeSlotSuffix);
        if (sequentialIndex > -1 && sequentialIndex < sequentialSlots.length - 1) {
            const nextSlotSuffix = sequentialSlots[sequentialIndex + 1];
            nextSlotBuildingClassrooms = (dataBySlotAndBuilding[nextSlotSuffix] && dataBySlotAndBuilding[nextSlotSuffix][buildingName]) || new Set();
        }

        let regularRooms = [];
        let zizhuRooms = [];

        currentSlotDataBuilding.forEach((item) => {
          let styledName = item["名称"];
          const isBold = allDaySet.has(item["名称"]);
          const isUnderlined =
            slotLabel !== timeSlotLabels[0] &&
            slotLabel !== "昼间第1-8节" &&
            !previousNanxiaoquClassrooms[buildingName].has(item["名称"]);
          const isStrikethrough = strikethroughApplicableSlots.includes(timeSlotSuffix) && !nextSlotBuildingClassrooms.has(item["名称"]);

          if (isUnderlined) styledName = `<u>${styledName}</u>`;
          if (isStrikethrough) styledName = `<del>${styledName}</del>`;
          if (isBold) styledName = `<strong>${styledName}</strong>`;

          if (
            buildingName === "科技楼" &&
            (item["名称"].includes("自主学习室") ||
              item["名称"].includes("自习室"))
          ) {
            const letterMatch = item["名称"].match(
              /(?:自主学习室|自习室)([A-Z])$/i
            );
            zizhuRooms.push({
              raw: item["名称"],
              display: styledName,
              letter: letterMatch ? letterMatch[1].toUpperCase() : "Z",
            });
          } else {
            regularRooms.push({ raw: item["名称"], display: styledName });
          }
        });

        let finalRoomsString;
        if (buildingName === "科技楼") {
          const regularPart = regularRooms
            .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
            .map((item) => item.display)
            .join(" ");
          const zizhuPart = zizhuRooms
            .sort((a, b) => a.letter.localeCompare(b.letter))
            .map((item) => item.display)
            .join("<br>");
          finalRoomsString = regularPart;
          if (zizhuPart) {
            finalRoomsString += (regularPart ? "<br>" : "") + zizhuPart;
          }
        } else {
          finalRoomsString = regularRooms
            .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
            .map((item) => item.display)
            .join(" ");
        }
        roomCell.innerHTML = finalRoomsString || "无";
      }
    });
    if (slotLabel !== "昼间第1-8节") {
      nanxiaoquBuildings.forEach((buildingName) => {
        const currentData = allProcessedClassroomData.filter(
          (item) =>
            item["教学楼"] === buildingName &&
            item["空闲时段"] === timeSlotSuffix
        );
        previousNanxiaoquClassrooms[buildingName] =
          getAllClassroomsFromData(currentData);
      });
    }
  };

  // 步骤 5.5: 计算内容哈希并与线上版本比较，以确定更新状态
  // 获取核心内容区域的HTML，用于计算哈希值
  const tabContainer = document.querySelector(".tab-container");
  const newContentHtml = tabContainer ? tabContainer.outerHTML : "";
  // 使用MD5算法计算哈希值
  const newHash = crypto.createHash("md5").update(newContentHtml).digest("hex");
  console.log(`新生成内容的哈希值: ${newHash}`);

  // 将新计算的哈希值作为一个<meta>标签添加到<head>中
  const metaTag = document.createElement("meta");
  metaTag.name = "page-content-hash";
  metaTag.content = newHash;
  document.head.appendChild(metaTag);

  let liveHash = null; // 用于存储线上版本的哈希值
  let badgeStatus = "Updated"; // 默认状态为"Updated"
  const cnamePath = path.join(__dirname, "..", "CNAME"); // CNAME文件路径

  try {
    // 检查CNAME文件是否存在
    if (fs.existsSync(cnamePath)) {
      const domain = fs.readFileSync(cnamePath, "utf-8").trim(); // 读取域名
      const url = `https://${domain}`; // 构建URL
      console.log(`正在从 ${url} 获取当前部署的页面内容...`);
      // 使用fetch API异步获取线上页面的HTML内容
      const response = await fetch(url);
      if (response.ok) { // 如果请求成功
        const liveHtml = await response.text(); // 获取HTML文本
        const liveDom = new JSDOM(liveHtml); // 使用jsdom解析线上HTML
        // 在线上HTML中查找哈希meta标签
        const liveMetaTag =
          liveDom.window.document.querySelector('meta[name="page-content-hash"]');
        if (liveMetaTag) { // 如果找到了
          liveHash = liveMetaTag.getAttribute("content"); // 提取哈希值
          console.log(`获取到已部署页面的哈希值: ${liveHash}`);
        } else {
          console.log("已部署页面中未找到哈希 meta 标签。");
        }
      } else {
        console.warn(`获取 ${url} 失败，状态码: ${response.status}`);
      }
    } else {
      console.log("CNAME 文件未找到，无法进行比较。");
    }

    // 比较新旧哈希值
    if (newHash === liveHash) {
      badgeStatus = "Not Updated"; // 如果相同，状态设为"Not Updated"
      console.log("内容无变化。");
    } else {
      console.log("内容已更新。");
    }
  } catch (error) {
    console.error("获取或比较已部署页面时发生错误:", error);
    // 在任何错误情况下，都默认状态为"Updated"，以确保部署总能反映最新尝试
  }

  // 动态创建并插入状态徽章
  const updateTimeP = document.querySelector("p.update-time");
  if (updateTimeP) {
    const badge = document.createElement("span");
    badge.id = "status-badge";
    badge.textContent = badgeStatus;
    // 根据状态应用不同的CSS类
    badge.className = `status-badge ${
      badgeStatus === "Updated" ? "badge-updated" : "badge-not-updated"
    }`;
    updateTimeP.appendChild(badge); // 将徽章添加到时间戳的<p>标签中
  }

  // 步骤 6: 将修改后的DOM对象序列化回HTML字符串，并写入到最终的HTML文件中
  const finalHtml = dom.serialize();
  try {
    fs.writeFileSync(outputHtmlPath, finalHtml, "utf-8");
    console.log(`最终HTML报告已成功生成到: ${outputHtmlPath}`);
  } catch (error) {
    console.error(`写入最终HTML文件时发生错误: ${error}`);
  }
}

// 新辅助函数：为特定楼栋计算全天空闲教室
function calculateAllDayFreeClassroomsForBuilding(
  allProcessedData,
  buildingName
) {
  const individualSlotSuffixes = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];
  let commonClassrooms = null;

  for (const suffix of individualSlotSuffixes) {
    const currentSlotClassrooms = new Set(
      allProcessedData
        .filter(
          (item) =>
            item["教学楼"] === buildingName && item["空闲时段"] === suffix
        )
        .map((item) => item["名称"])
    );

    if (commonClassrooms === null) {
      commonClassrooms = currentSlotClassrooms;
    } else {
      commonClassrooms = new Set(
        [...commonClassrooms].filter((classroom) =>
          currentSlotClassrooms.has(classroom)
        )
      );
    }
    if (commonClassrooms.size === 0) break;
  }
  return commonClassrooms || new Set();
}

// 新辅助函数：根据教学楼名称，从包含各楼全天空闲教室集合的对象中获取对应楼栋的集合
function getAllDaySetForBuilding(buildingName, allDaySets) {
  switch (buildingName) {
    case "基础楼":
      return allDaySets.allDayFreeJiChuLou;
    case "综合实验楼":
      return allDaySets.allDayFreeZongHeShiYanLou;
    case "地质楼":
      return allDaySets.allDayFreeDiZhiLou;
    case "管理楼":
      return allDaySets.allDayFreeGuanLiLou;
    case "科技楼":
      return allDaySets.allDayFreeKeJiLou;
    case "人文楼":
      return allDaySets.allDayFreeRenWenLou;
    default:
      return new Set();
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
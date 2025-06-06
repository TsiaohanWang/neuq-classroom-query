// 引入Node.js内置的文件系统模块，用于读写文件
const fs = require('fs');
// 引入Node.js内置的路径处理模块，用于安全地构建和操作文件/目录路径
const path = require('path');
// 引入jsdom库，用于在Node.js环境中模拟浏览器DOM，方便地解析和操作HTML字符串
const { JSDOM } = require('jsdom');

// 定义HTML样板字符串。这是最终HTML报告的基础结构。
// 注意：为了简洁，实际的HTML模板内容在此处省略，假设它与您之前提供的版本一致。
// 关键点是模板中包含用于填充数据的占位符和ID。
const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>东秦空闲教室总表</title>
    <style>
        body {
            max-width: 800px;
            margin: 0px auto 15px;
            padding: 0 15px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
        }

        .tab-container {
            width: 100%;
            margin-top: 15px;
            background-color: #fff;
            border-radius: 10px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
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
            font-size: 15px;
            font-weight: 500;
            transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
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
            font-size: 15px;
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

        /* 表格样式 */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-family: monospace;
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
            font-size: 15px;
            text-align: center;
        }

        /* 本部其它和南校区表格的教学楼名称行样式 */
        .campus-table .building-name-row td {
            font-weight: bold;
            text-align: center;
            background-color: #f8f9fa;
            /* 轻微背景色区分 */
            font-size: 13px;
        }

        /* 本部其它和南校区表格的教室号行样式 */
        .campus-table .classroom-row td {
            text-align: center; /* 修改为居中 */
            min-height: 50px;
            word-break: break-word;
            white-space: pre-wrap; /* 允许<br>换行 */
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
            font-weight: bold;
            font-size: 18px;
            text-align: center;
            margin-top: 16px;
            margin-bottom: 4px;
            color: #495057;
        }
         /* 为下划线和加粗添加样式 */
        u {
            text-decoration-color: #30448c;
        }
        strong {
            text-decoration-color: #30448c;
        }
    </style>
</head>

<body>

    <h1><span id="current-date-placeholder">YYYY/MM/DD</span> 东秦空闲教室总表</h1>
    <p class="info-text update-time">本空闲教室表更新于 <span id="update-time-placeholder">YYYY/MM/DD HH:MM</span></p>
    <p class="info-text"><u>下划线</u>表示该教室在上一时间段未处于空闲状态，<strong>加粗</strong>表示该教室全天(1-12节)空闲</p>
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
            <!-- 🏙上午第1-2节 -->
            <h3 class="timeslot-title">🏙上午第1-2节</h3>
            <table border="1" class="gxg-table">
                <thead>
                    <tr>
                        <th>楼层</th>
                        <th>教室</th>
                    </tr>
                </thead>
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
            <!-- 🏙上午第3-4节 -->
            <h3 class="timeslot-title">🏙上午第3-4节</h3>
            <table border="1" class="gxg-table">
                <thead>
                    <tr>
                        <th>楼层</th>
                        <th>教室</th>
                    </tr>
                </thead>
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
            <!-- 🌇下午第5-6节 -->
            <h3 class="timeslot-title">🌇下午第5-6节</h3>
            <table border="1" class="gxg-table">
                <thead>
                    <tr>
                        <th>楼层</th>
                        <th>教室</th>
                    </tr>
                </thead>
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
            <!-- 🌇下午第7-8节 -->
            <h3 class="timeslot-title">🌇下午第7-8节</h3>
            <table border="1" class="gxg-table">
                <thead>
                    <tr>
                        <th>楼层</th>
                        <th>教室</th>
                    </tr>
                </thead>
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
            <!-- 🌃晚上第9-10节 -->
            <h3 class="timeslot-title">🌃晚上第9-10节</h3>
            <table border="1" class="gxg-table">
                <thead>
                    <tr>
                        <th>楼层</th>
                        <th>教室</th>
                    </tr>
                </thead>
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
            <!-- 🌃晚上第11-12节 -->
            <h3 class="timeslot-title">🌃晚上第11-12节</h3>
            <table border="1" class="gxg-table">
                <thead>
                    <tr>
                        <th>楼层</th>
                        <th>教室</th>
                    </tr>
                </thead>
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
            <!-- 🏙昼间第1-8节 -->
            <h3 class="timeslot-title">🏙昼间第1-8节</h3>
            <table border="1" class="gxg-table">
                <thead>
                    <tr>
                        <th>楼层</th>
                        <th>教室</th>
                    </tr>
                </thead>
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
        </div>

        <!-- 本部其它教学楼内容 -->
        <div id="benbuqita" class="tab-content">
            <!-- 🏙上午第1-2节 -->
            <h3 class="timeslot-title">🏙上午第1-2节</h3>
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
            <!-- 🏙上午第3-4节 -->
            <h3 class="timeslot-title">🏙上午第3-4节</h3>
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
            <!-- 🌇下午第5-6节 -->
            <h3 class="timeslot-title">🌇下午第5-6节</h3>
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
            <!-- 🌇下午第7-8节 -->
            <h3 class="timeslot-title">🌇下午第7-8节</h3>
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
            <!-- 🌃晚上第9-10节 -->
            <h3 class="timeslot-title">🌃晚上第9-10节</h3>
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
            <!-- 🌃晚上第11-12节 -->
            <h3 class="timeslot-title">🌃晚上第11-12节</h3>
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
            <!-- 🏙昼间第1-8节 -->
            <h3 class="timeslot-title">🏙昼间第1-8节</h3>
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
        </div>

        <!-- 南校区内容 -->
        <div id="nanxiaoqu" class="tab-content">
            <!-- 🏙上午第1-2节 -->
            <h3 class="timeslot-title">🏙上午第1-2节</h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL1-2" style="font-size: small">KJL1-2占位符</td>
                        <td id="RWL1-2" style="font-size: small">RWL1-2占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 🏙上午第3-4节 -->
            <h3 class="timeslot-title">🏙上午第3-4节</h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL3-4" style="font-size: small">KJL3-4占位符</td>
                        <td id="RWL3-4" style="font-size: small">RWL3-4占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 🌇下午第5-6节 -->
            <h3 class="timeslot-title">🌇下午第5-6节</h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL5-6" style="font-size: small">KJL5-6占位符</td>
                        <td id="RWL5-6" style="font-size: small">RWL5-6占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 🌇下午第7-8节 -->
            <h3 class="timeslot-title">🌇下午第7-8节</h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL7-8" style="font-size: small">KJL7-8占位符</td>
                        <td id="RWL7-8" style="font-size: small">RWL7-8占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 🌃晚上第9-10节 -->
            <h3 class="timeslot-title">🌃晚上第9-10节</h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL9-10" style="font-size: small">KJL9-10占位符</td>
                        <td id="RWL9-10" style="font-size: small">RWL9-10占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 🌃晚上第11-12节 -->
            <h3 class="timeslot-title">🌃晚上第11-12节</h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL11-12" style="font-size: small">KJL11-12占位符</td>
                        <td id="RWL11-12" style="font-size: small">RWL11-12占位符</td>
                    </tr>
                </tbody>
            </table>
            <!-- 🏙昼间第1-8节 -->
            <h3 class="timeslot-title">🏙昼间第1-8节</h3>
            <table border="1" class="campus-table">
                <tbody>
                    <tr class="building-name-row">
                        <td>科技楼</td>
                        <td>人文楼</td>
                    </tr>
                    <tr class="classroom-row">
                        <td id="KJL1-8" style="font-size: small">KJL1-8占位符</td>
                        <td id="RWL1-8" style="font-size: small">RWL1-8占位符</td>
                    </tr>
                </tbody>
            </table>
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
    </script>

</body>
</html>
`;

// 定义输入JSON文件路径和输出HTML文件路径
const processedJsonPath = path.join(__dirname, '..', 'output', 'processed_classroom_data.json');
const outputHtmlPath = path.join(__dirname, '..', 'index.html'); // 输出到主目录

// 定义时间段标签与HTML中时间段标题的映射 (用于查找正确的h3标题)
const timeSlotLabels = [
    "🏙上午第1-2节", "🏙上午第3-4节", "🌇下午第5-6节", "🌇下午第7-8节",
    "🌃晚上第9-10节", "🌃晚上第11-12节", "🏙昼间第1-8节"
];

// 辅助函数：获取当前北京时间并格式化 (YYYY/MM/DD HH:MM)
function getBeijingTime() {
    const now = new Date(); // 获取当前本地时间
    // 使用Intl.DateTimeFormat来获取指定时区（Asia/Shanghai，即北京时间）的格式化时间
    const formatter = new Intl.DateTimeFormat("zh-CN", { // 'zh-CN' 指定了中国大陆的区域设置，影响日期格式
        timeZone: "Asia/Shanghai", // 设置目标时区为上海（北京时间）
        year: "numeric", month: "2-digit", day: "2-digit", // 日期部分：年、月、日（两位数）
        hour: "2-digit", minute: "2-digit", hour12: false, // 时间部分：时、分（两位数，24小时制）
    });
    const parts = formatter.formatToParts(now); // 将日期格式化为包含各个部分的数组
    // 辅助函数，从parts数组中根据类型提取值
    const getPart = (type) => parts.find((part) => part.type === type)?.value;
    // 拼接成 "YYYY/MM/DD HH:MM" 格式
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

// 辅助函数：从JSON数据中提取所有符合条件的教室号到一个Set中，用于后续的加粗和下划线逻辑
// jsonData: 包含教室信息的数组
// buildingFilter (可选): 如果提供，则只提取指定教学楼的教室
function getAllClassroomsFromData(jsonData, buildingFilter = null) {
    const classrooms = new Set(); // 使用Set存储教室号，可以自动去重
    if (!jsonData || !Array.isArray(jsonData)) return classrooms; // 如果数据无效，返回空Set

    for (const entry of jsonData) { // 遍历数据中的每个条目
        // 如果提供了楼栋过滤器，但当前条目的教学楼不匹配，则跳过
        if (buildingFilter && entry["教学楼"] !== buildingFilter) continue;

        // 检查条目是否有“名称”字段，并且教室名称格式符合预期
        // 预期格式：纯数字，或纯数字后跟一个大写字母，或纯数字后跟 "-数字/字母组合"（例如处理科技楼的特殊编号）
        // 或者，对于科技楼，名称中包含“自主学习室”
        if (entry["名称"] &&
            (/^\d+[A-Z]?(-\d+[A-Z\d-]*)?$/.test(entry["名称"]) ||
             (entry["教学楼"] === "科技楼" && entry["名称"].includes("自主学习室")))
        ) {
            classrooms.add(entry["名称"]); // 将符合条件的教室号添加到Set中
        }
    }
    return classrooms; // 返回包含所有提取到的教室号的Set
}


// 主处理函数：生成最终的HTML报告
function generateFinalHtmlReport() {
    // 步骤 1: 读取已处理的JSON数据 (processed_classroom_data.json)
    let allProcessedData; // 用于存储从JSON文件读取的数据
    try {
        // 检查处理后的JSON文件是否存在
        if (!fs.existsSync(processedJsonPath)) {
            console.error(`错误：处理后的JSON文件未找到于 ${processedJsonPath}`);
            return; // 如果文件不存在，则终止执行
        }
        const rawData = fs.readFileSync(processedJsonPath, 'utf-8'); // 同步读取文件内容
        allProcessedData = JSON.parse(rawData); // 解析JSON字符串为JavaScript对象/数组
        console.log(`成功读取 ${allProcessedData.length} 条处理后的教室数据。`);
    } catch (error) {
        console.error(`读取或解析 ${processedJsonPath} 时发生错误:`, error);
        return; // 如果发生错误，则终止执行
    }

    // 步骤 2: 使用JSDOM解析HTML样板字符串，创建一个可操作的DOM对象
    const dom = new JSDOM(htmlTemplate);
    const document = dom.window.document; // 获取DOM中的document对象

    // 步骤 3: 更新HTML模板中的日期和时间戳占位符
    const currentDate = getBeijingDate(); // 获取当前北京日期
    const updateTime = getBeijingTime(); // 获取当前北京时间
    // 更新 <h1> 标题中的日期占位符
    const h1Element = document.querySelector("h1 > span#current-date-placeholder");
    if (h1Element) {
        h1Element.textContent = currentDate; // 直接设置span的内容
    }
    // 更新 <p> 标签中“本空闲教室表更新于”的时间戳占位符
    const updateTimePElement = document.querySelector("p.update-time > span#update-time-placeholder");
    if (updateTimePElement) {
        updateTimePElement.textContent = updateTime; // 直接设置span的内容
    }

    // 步骤 4: 预先计算每个教学楼的全天空闲教室集合，用于后续的加粗逻辑
    console.log("正在计算各教学楼的全天空闲教室...");
    const allDayFreeGongXueGuan = calculateAllDayFreeClassroomsForBuilding(allProcessedData, "工学馆");
    const allDayFreeJiChuLou = calculateAllDayFreeClassroomsForBuilding(allProcessedData, "基础楼");
    const allDayFreeZongHeShiYanLou = calculateAllDayFreeClassroomsForBuilding(allProcessedData, "综合实验楼");
    const allDayFreeDiZhiLou = calculateAllDayFreeClassroomsForBuilding(allProcessedData, "地质楼");
    const allDayFreeGuanLiLou = calculateAllDayFreeClassroomsForBuilding(allProcessedData, "管理楼");
    const allDayFreeKeJiLou = calculateAllDayFreeClassroomsForBuilding(allProcessedData, "科技楼");
    const allDayFreeRenWenLou = calculateAllDayFreeClassroomsForBuilding(allProcessedData, "人文楼");
    console.log("全天空闲教室计算完毕。");


    // 步骤 5: 填充每个选项卡（工学馆、本部其它、南校区）的内容
    // 步骤 5.1: 填充工学馆选项卡 (id="gongxueguan")
    const gongxueguanDiv = document.getElementById('gongxueguan'); // 获取工学馆内容区域的div
    let previousGxgClassrooms = new Set(); // 初始化Set，用于存储工学馆上一个时间段的空闲教室，以实现下划线逻辑

    // 遍历预定义的每个时间段标签 (例如 "🏙上午第1-2节")
    timeSlotLabels.forEach(slotLabel => {
        // 从时间段标签中提取时间段后缀 (例如 "1-2", "3-4")，用于匹配JSON数据中的“空闲时段”字段
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();
        // 从总数据中筛选出当前时间段、且教学楼为“工学馆”的教室数据
        const currentSlotDataGxg = allProcessedData.filter(item => item["教学楼"] === "工学馆" && item["空闲时段"] === timeSlotSuffix);

        // 在工学馆div中查找与当前时间段标签匹配的<h3>元素
        const targetH3 = Array.from(gongxueguanDiv.querySelectorAll('h3.timeslot-title')).find(h3 => h3.textContent.trim() === slotLabel);

        // 如果找到了<h3>且其后紧跟着一个<table>元素
        if (targetH3 && targetH3.nextElementSibling && targetH3.nextElementSibling.tagName === 'TABLE') {
            const table = targetH3.nextElementSibling; // 获取该表格
            const tbody = table.querySelector('tbody'); // 获取表格的<tbody>
            if (tbody) {
                const rows = Array.from(tbody.children); // 获取<tbody>中的所有行<tr>
                rows.forEach(row => { // 遍历每一行（代表一个楼层）
                    const floorCell = row.cells[0]; // 第一个单元格是楼层 (例如 "1F")
                    const roomCell = row.cells[1];  // 第二个单元格是教室号列表
                    if (floorCell && roomCell) {
                        const floor = floorCell.textContent.trim(); // 获取楼层文本
                        // 从当前时间段的工学馆数据中，筛选出属于当前楼层的教室
                        const roomsForFloor = currentSlotDataGxg
                            .filter(item => item["名称"].startsWith(floor.charAt(0))) // 简单通过教室号首字母匹配楼层
                            .map(item => { // 对每个教室进行处理，以决定是否加粗或加下划线
                                let displayName = item["名称"]; // 默认显示原始教室名
                                let isBold = allDayFreeGongXueGuan.has(item["名称"]); // 是否全天空闲
                                let isUnderlined = slotLabel !== timeSlotLabels[0] && slotLabel !== "🏙昼间第1-8节" && !previousGxgClassrooms.has(item["名称"]); // 是否新出现

                                // 根据标记组合最终显示的HTML字符串
                                if (isBold && isUnderlined) {
                                    displayName = `<strong><u>${item["名称"]}</u></strong>`;
                                } else if (isBold) {
                                    displayName = `<strong>${item["名称"]}</strong>`;
                                } else if (isUnderlined) {
                                    displayName = `<u>${item["名称"]}</u>`;
                                }
                                return { raw: item["名称"], display: displayName }; // 返回原始名和显示名，用于排序
                            })
                            .sort((a, b) => smartSortClassrooms(a.raw, b.raw)) // 使用智能排序函数对教室号排序
                            .map(item => item.display) // 提取处理后的显示名
                            .join(' '); // 用空格连接同一楼层的教室号
                        roomCell.innerHTML = roomsForFloor || '无'; // 将结果填充到单元格，如果为空则显示"无"
                        // roomCell.id = `GXG${floor}${timeSlotSuffix}`; // 如果需要通过ID直接操作，可以取消注释并确保ID唯一性
                    }
                });
            }
        }
        // 更新“上一个时间段”的教室数据，但排除“昼间第1-8节”作为比较基准
        if (slotLabel !== "🏙昼间第1-8节") {
            previousGxgClassrooms = getAllClassroomsFromData(currentSlotDataGxg);
        }
    });


    // 步骤 5.2: 填充本部其它教学楼选项卡 (id="benbuqita")
    const benbuqitaDiv = document.getElementById('benbuqita'); // 获取本部其它内容区域的div
    const benbuBuildings = ["基础楼", "综合实验楼", "地质楼", "管理楼"]; // 定义本部其它的教学楼列表
    // const benbuBuildingCodes = { "基础楼": "JCL", "综合实验楼": "ZHSYL", "地质楼": "DZL", "管理楼": "GLL" }; // 楼栋代码，用于ID (如果需要)
    let previousBenbuClassrooms = {}; // 初始化对象，按楼栋名存储上一个时间段的空闲教室
    benbuBuildings.forEach(b => previousBenbuClassrooms[b] = new Set()); // 为每个楼栋创建一个空的Set

    // 遍历每个时间段标签
    timeSlotLabels.forEach(slotLabel => {
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim(); // 提取时间段后缀
        // 查找当前时间段对应的<h3>标题
        const targetH3 = Array.from(benbuqitaDiv.querySelectorAll('h3.timeslot-title')).find(h3 => h3.textContent.trim() === slotLabel);

        // 如果找到了<h3>且其后是表格
        if (targetH3 && targetH3.nextElementSibling && targetH3.nextElementSibling.tagName === 'TABLE') {
            const table = targetH3.nextElementSibling; // 获取表格
            const classroomRow = table.querySelector('tr.classroom-row'); // 获取包含教室号的行
            // 确保教室号行存在且单元格数量与楼栋数量匹配
            if (classroomRow && classroomRow.cells.length === benbuBuildings.length) {
                // 遍历本部其它的每个教学楼
                benbuBuildings.forEach((buildingName, index) => {
                    // 筛选出当前时间段、当前教学楼的教室数据
                    const currentSlotDataBuilding = allProcessedData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                    // 获取当前教学楼的全天空闲教室集合
                    const allDaySet = getAllDaySetForBuilding(buildingName, { allDayFreeJiChuLou, allDayFreeZongHeShiYanLou, allDayFreeDiZhiLou, allDayFreeGuanLiLou });

                    // 处理教室数据，应用加粗和下划线逻辑
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
                        .sort((a, b) => smartSortClassrooms(a.raw, b.raw)) // 智能排序
                        .map(item => item.display)
                        .join('<br>'); // 使用<br>换行分隔教室号
                    classroomRow.cells[index].innerHTML = roomsForBuilding || '无'; // 填充单元格
                    // classroomRow.cells[index].id = `${benbuBuildingCodes[buildingName]}${timeSlotSuffix}`; // 设置ID (如果需要)
                });
            }
        }
        // 更新“上一个时间段”的教室数据，排除“昼间第1-8节”
        if (slotLabel !== "🏙昼间第1-8节") {
            benbuBuildings.forEach(buildingName => {
                const currentData = allProcessedData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                previousBenbuClassrooms[buildingName] = getAllClassroomsFromData(currentData);
            });
        }
    });


    // 步骤 5.3: 填充南校区选项卡 (id="nanxiaoqu")
    const nanxiaoquDiv = document.getElementById('nanxiaoqu'); // 获取南校区内容区域的div
    const nanxiaoquBuildings = ["科技楼", "人文楼"]; // 定义南校区的教学楼列表
    // const nanxiaoquBuildingCodes = { "科技楼": "KJL", "人文楼": "RWL" }; // 楼栋代码 (如果需要)
    let previousNanxiaoquClassrooms = {}; // 初始化对象，按楼栋名存储上一个时间段的空闲教室
    nanxiaoquBuildings.forEach(b => previousNanxiaoquClassrooms[b] = new Set()); // 为每个楼栋创建一个空的Set

    // 遍历每个时间段标签
    timeSlotLabels.forEach(slotLabel => {
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim(); // 提取时间段后缀
        const targetH3 = Array.from(nanxiaoquDiv.querySelectorAll('h3.timeslot-title')).find(h3 => h3.textContent.trim() === slotLabel);

        if (targetH3 && targetH3.nextElementSibling && targetH3.nextElementSibling.tagName === 'TABLE') {
            const table = targetH3.nextElementSibling;
            const classroomRow = table.querySelector('tr.classroom-row');
            if (classroomRow && classroomRow.cells.length === nanxiaoquBuildings.length) {
                nanxiaoquBuildings.forEach((buildingName, index) => {
                    const currentSlotDataBuilding = allProcessedData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                    const allDaySet = getAllDaySetForBuilding(buildingName, { allDayFreeKeJiLou, allDayFreeRenWenLou });

                    // 特殊处理科技楼的教室名称显示和排序
                    let regularKeJiLouRooms = [];
                    let zizhuKeJiLouRooms = [];

                    currentSlotDataBuilding.forEach(item => {
                        let displayName = item["名称"];
                        let isBold = allDaySet.has(item["名称"]);
                        let isUnderlined = slotLabel !== timeSlotLabels[0] && slotLabel !== "🏙昼间第1-8节" && !previousNanxiaoquClassrooms[buildingName].has(item["名称"]);

                        if (isBold && isUnderlined) displayName = `<strong><u>${item["名称"]}</u></strong>`;
                        else if (isBold) displayName = `<strong>${item["名称"]}</strong>`;
                        else if (isUnderlined) displayName = `<u>${item["名称"]}</u>`;

                        if (buildingName === "科技楼" && item["名称"].includes("自主学习室")) {
                            zizhuKeJiLouRooms.push({ raw: item["名称"], display: displayName, letter: item["名称"].match(/自主学习室([A-Z])$/)?.[1] || 'Z' });
                        } else {
                            regularKeJiLouRooms.push({ raw: item["名称"], display: displayName });
                        }
                    });

                    let finalRoomsString;
                    if (buildingName === "科技楼") {
                        // 普通教室排序并用空格连接
                        const regularPart = regularKeJiLouRooms
                            .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
                            .map(item => item.display)
                            .join(' ');
                        // 自主学习室按字母排序并用<br>连接
                        const zizhuPart = zizhuKeJiLouRooms
                            .sort((a, b) => a.letter.localeCompare(b.letter))
                            .map(item => item.display)
                            .join('<br>');
                        // 合并两部分
                        finalRoomsString = regularPart;
                        if (zizhuPart) {
                            finalRoomsString += (regularPart ? '<br>' : '') + zizhuPart;
                        }
                    } else { // 人文楼（或其他非科技楼的南校区楼栋）
                        finalRoomsString = regularKeJiLouRooms // 对于人文楼，regularKeJiLouRooms实际存的是人文楼的教室
                            .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
                            .map(item => item.display)
                            .join(' '); // 人文楼用空格分隔
                    }

                    classroomRow.cells[index].innerHTML = finalRoomsString || '无';
                    // classroomRow.cells[index].id = `${nanxiaoquBuildingCodes[buildingName]}${timeSlotSuffix}`; // 设置ID (如果需要)
                });
            }
        }
        // 更新“上一个时间段”的教室数据，排除“昼间第1-8节”
        if (slotLabel !== "🏙昼间第1-8节") {
            nanxiaoquBuildings.forEach(buildingName => {
                const currentData = allProcessedData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                previousNanxiaoquClassrooms[buildingName] = getAllClassroomsFromData(currentData);
            });
        }
    });


    // 步骤 6: 将修改后的DOM对象序列化回HTML字符串，并写入到最终的HTML文件中
    const finalHtml = dom.serialize(); // 将DOM对象转换为HTML字符串
    try {
        fs.writeFileSync(outputHtmlPath, finalHtml, 'utf-8'); // 同步写入文件，使用utf-8编码
        console.log(`最终HTML报告已成功生成到: ${outputHtmlPath}`); // 输出成功信息
    } catch (error) {
        console.error(`写入最终HTML文件时发生错误: ${error}`); // 如果写入失败，输出错误信息
    }
}

// 新辅助函数：为特定楼栋计算全天空闲教室
// allProcessedData: 包含所有已处理教室数据的数组
// buildingName: 要计算的教学楼名称
function calculateAllDayFreeClassroomsForBuilding(allProcessedData, buildingName) {
    // 定义构成“全天”的独立小节的时间段后缀 (例如 "1-2", "3-4", ..., "11-12")
    const individualSlotSuffixes = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];
    let commonClassrooms = null; // 初始化用于存储共同空闲教室的Set，初始为null表示尚未处理第一个小节

    // 遍历每个独立小节的时间段后缀
    for (const suffix of individualSlotSuffixes) {
        // 从总数据中筛选出当前教学楼、当前小节的空闲教室，并提取教室名称到Set中
        const currentSlotClassrooms = new Set(
            allProcessedData
                .filter(item => item["教学楼"] === buildingName && item["空闲时段"] === suffix)
                .map(item => item["名称"])
        );

        // 如果是第一个被处理的小节，则commonClassrooms直接设为当前小节的教室
        if (commonClassrooms === null) {
            commonClassrooms = currentSlotClassrooms;
        } else {
            // 否则，取commonClassrooms与当前小节教室的交集（即只保留在两者中都存在的教室）
            commonClassrooms = new Set([...commonClassrooms].filter(classroom => currentSlotClassrooms.has(classroom)));
        }
        // 优化：如果任何一个小节处理后，共同空闲教室数量变为0，则后续不可能再有全天空闲教室，可以提前中断循环
        if (commonClassrooms.size === 0) break;
    }
    // 返回最终在所有独立小节中都出现的教室集合；如果从未处理过（例如没有独立小节数据），则返回空Set
    return commonClassrooms || new Set();
}

// 新辅助函数：根据教学楼名称，从包含各楼全天空闲教室集合的对象中获取对应楼栋的集合
// buildingName: 要查询的教学楼名称
// allDaySets: 一个对象，键是教学楼的内部标识（例如 allDayFreeJiChuLou），值是对应楼栋全天空闲教室的Set
function getAllDaySetForBuilding(buildingName, allDaySets) {
    // 使用switch语句根据buildingName返回相应的全天空闲教室Set
    switch (buildingName) {
        case "基础楼": return allDaySets.allDayFreeJiChuLou;
        case "综合实验楼": return allDaySets.allDayFreeZongHeShiYanLou;
        case "地质楼": return allDaySets.allDayFreeDiZhiLou;
        case "管理楼": return allDaySets.allDayFreeGuanLiLou;
        case "科技楼": return allDaySets.allDayFreeKeJiLou;
        case "人文楼": return allDaySets.allDayFreeRenWenLou;
        default: return new Set(); // 如果教学楼名称不匹配，返回空Set
    }
}

// 更智能的教室号排序函数，用于对教室号列表进行排序
// a, b: 要比较的两个教室号字符串
function smartSortClassrooms(a, b) {
    // 正则表达式，用于从教室号中提取主要的数字部分和可能的后缀（如 "自主学习室X" 或 "-X"）
    // ^(\d+) 匹配开头的连续数字（捕获到组1）
    // (.*)$ 匹配剩余的所有字符作为后缀（捕获到组2）
    const regex = /^(\d+)(.*)$/;
    const matchA = a.match(regex); // 对教室号a进行匹配
    const matchB = b.match(regex); // 对教室号b进行匹配

    // 如果两个教室号都能成功匹配到数字前缀
    if (matchA && matchB) {
        const numA = parseInt(matchA[1]); // 提取教室号a的数字部分并转换为整数
        const numB = parseInt(matchB[1]); // 提取教室号b的数字部分并转换为整数
        const suffixA = matchA[2]; // 提取教室号a的后缀部分
        const suffixB = matchB[2]; // 提取教室号b的后缀部分

        // 如果数字部分不同，则直接按数字大小排序
        if (numA !== numB) {
            return numA - numB;
        }
        // 如果数字部分相同，则按后缀的字典序进行排序
        // 这可以处理例如 "101" 和 "101A"，或者 "6009自主学习室G" 和 "6009-1A自主学习室I" 的情况
        return suffixA.localeCompare(suffixB);
    }
    // 如果一个或两个教室号无法按上述规则解析（例如，不是以数字开头），
    // 则退回到标准的字符串字典序比较。
    return a.localeCompare(b);
}


// 执行主函数，开始生成HTML报告
generateFinalHtmlReport();
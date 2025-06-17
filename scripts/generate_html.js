// 引入Node.js内置的文件系统模块，用于读写文件
const fs = require('fs');
// 引入Node.js内置的路径处理模块，用于安全地构建和操作文件/目录路径
const path = require('path');
// 引入jsdom库，用于在Node.js环境中模拟浏览器DOM，方便地解析和操作HTML字符串
const { JSDOM } = require('jsdom');

// 定义HTML样板字符串。这是最终HTML报告的基础结构。
// 整个HTML结构已使用Tailwind CSS重构，以替代原有的<style>块。
const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN" class="">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>东秦空闲教室总表</title>
    <!-- 引入Tailwind CSS的CDN链接，以便应用utility classes -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        // 为Tailwind JIT引擎提供自定义配置，例如校色
        tailwind.config = {
            darkMode: 'class', // 启用基于class的暗黑模式
            theme: {
                extend: {
                    colors: {
                        'neuq-blue': '#30448c',
                    }
                }
            }
        }
    </script>
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
              - 基础样式: py-1.5 px-2.5 ... text-center
              - 状态切换: transition-colors duration-200 ease-in-out
              - 激活状态样式 (通过 [&.active] 选择器定义):
                - 亮色模式: bg-white text-neuq-blue border-b-2 border-neuq-blue
                - 暗色模式: dark:bg-gray-900 dark:text-gray-100 dark:border-b-2 dark:border-neuq-blue
              - 第一个按钮默认带有 'active' 类
            -->
            <button class="tab-button active py-1.5 px-2.5 cursor-pointer bg-transparent text-gray-500 dark:text-gray-400 text-[17px] font-medium transition-colors duration-200 ease-in-out focus:outline-none flex-grow text-center border-r border-gray-300 dark:border-gray-600 last:border-r-0 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-black dark:hover:text-white [&.active]:bg-white dark:[&.active]:bg-gray-900 [&.active]:text-neuq-blue dark:[&.active]:text-gray-100 [&.active]:border-b-2 [&.active]:border-neuq-blue" onclick="openTab(event, 'gongxueguan')">工学馆</button>
            <button class="tab-button py-1.5 px-2.5 cursor-pointer bg-transparent text-gray-500 dark:text-gray-400 text-[17px] font-medium transition-colors duration-200 ease-in-out focus:outline-none flex-grow text-center border-r border-gray-300 dark:border-gray-600 last:border-r-0 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-black dark:hover:text-white [&.active]:bg-white dark:[&.active]:bg-gray-900 [&.active]:text-neuq-blue dark:[&.active]:text-gray-100 [&.active]:border-b-2 [&.active]:border-neuq-blue" onclick="openTab(event, 'benbuqita')">本部其它</button>
            <button class="tab-button py-1.5 px-2.5 cursor-pointer bg-transparent text-gray-500 dark:text-gray-400 text-[17px] font-medium transition-colors duration-200 ease-in-out focus:outline-none flex-grow text-center last:border-r-0 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-black dark:hover:text-white [&.active]:bg-white dark:[&.active]:bg-gray-900 [&.active]:text-neuq-blue dark:[&.active]:text-gray-100 [&.active]:border-b-2 [&.active]:border-neuq-blue" onclick="openTab(event, 'nanxiaoqu')">南校区</button>
        </div>

        <!-- 工学馆内容 -->
        <div id="gongxueguan" class="tab-content active p-4">
            <div class="emergency-info p-1 mb-2.5 border-2 border-dashed border-neuq-blue/30 rounded-lg bg-neuq-blue/10 text-slate-800 dark:bg-neuq-blue/20 dark:text-gray-200 dark:border-neuq-blue/40 text-left text-sm leading-normal">
                <!-- 临时信息将由JS填充 -->
            </div>
            <!-- 时间段表格循环开始 -->
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙上午第1-2节</h3>
            <table class="w-full border-collapse mt-2.5 font-mono text-xs gxg-table">
                <tbody>
                    <tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">1F</td><td id="GXG1F1-2" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG1F1-2占位符</td></tr>
                    <tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">2F</td><td id="GXG2F1-2" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG2F1-2占位符</td></tr>
                    <tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">3F</td><td id="GXG3F1-2" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG3F1-2占位符</td></tr>
                    <tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">4F</td><td id="GXG4F1-2" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG4F1-2占位符</td></tr>
                    <tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">5F</td><td id="GXG5F1-2" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG5F1-2占位符</td></tr>
                    <tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">6F</td><td id="GXG6F1-2" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG6F1-2占位符</td></tr>
                    <tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">7F</td><td id="GXG7F1-2" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG7F1-2占位符</td></tr>
                </tbody>
            </table>
            <!-- 其他时间段的表格结构与上面类似，此处省略以保持简洁 -->
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙上午第3-4节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs gxg-table"><tbody><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">1F</td><td id="GXG1F3-4" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG1F3-4占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">2F</td><td id="GXG2F3-4" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG2F3-4占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">3F</td><td id="GXG3F3-4" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG3F3-4占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">4F</td><td id="GXG4F3-4" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG4F3-4占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">5F</td><td id="GXG5F3-4" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG5F3-4占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">6F</td><td id="GXG6F3-4" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG6F3-4占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">7F</td><td id="GXG7F3-4" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG7F3-4占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌇下午第5-6节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs gxg-table"><tbody><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">1F</td><td id="GXG1F5-6" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG1F5-6占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">2F</td><td id="GXG2F5-6" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG2F5-6占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">3F</td><td id="GXG3F5-6" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG3F5-6占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">4F</td><td id="GXG4F5-6" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG4F5-6占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">5F</td><td id="GXG5F5-6" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG5F5-6占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">6F</td><td id="GXG6F5-6" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG6F5-6占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">7F</td><td id="GXG7F5-6" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG7F5-6占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌇下午第7-8节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs gxg-table"><tbody><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">1F</td><td id="GXG1F7-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG1F7-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">2F</td><td id="GXG2F7-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG2F7-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">3F</td><td id="GXG3F7-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG3F7-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">4F</td><td id="GXG4F7-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG4F7-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">5F</td><td id="GXG5F7-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG5F7-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">6F</td><td id="GXG6F7-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG6F7-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">7F</td><td id="GXG7F7-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG7F7-8占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌃晚上第9-10节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs gxg-table"><tbody><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">1F</td><td id="GXG1F9-10" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG1F9-10占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">2F</td><td id="GXG2F9-10" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG2F9-10占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">3F</td><td id="GXG3F9-10" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG3F9-10占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">4F</td><td id="GXG4F9-10" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG4F9-10占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">5F</td><td id="GXG5F9-10" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG5F9-10占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">6F</td><td id="GXG6F9-10" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG6F9-10占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">7F</td><td id="GXG7F9-10" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG7F9-10占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌃晚上第11-12节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs gxg-table"><tbody><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">1F</td><td id="GXG1F11-12" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG1F11-12占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">2F</td><td id="GXG2F11-12" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG2F11-12占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">3F</td><td id="GXG3F11-12" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG3F11-12占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">4F</td><td id="GXG4F11-12" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG4F11-12占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">5F</td><td id="GXG5F11-12" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG5F11-12占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">6F</td><td id="GXG6F11-12" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG6F11-12占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">7F</td><td id="GXG7F11-12" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG7F11-12占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙昼间第1-8节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs gxg-table"><tbody><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">1F</td><td id="GXG1F1-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG1F1-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">2F</td><td id="GXG2F1-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG2F1-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">3F</td><td id="GXG3F1-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG3F1-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">4F</td><td id="GXG4F1-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG4F1-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">5F</td><td id="GXG5F1-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG5F1-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">6F</td><td id="GXG6F1-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG6F1-8占位符</td></tr><tr><td class="font-bold w-[30px] text-sm text-center border border-gray-200 dark:border-gray-600 p-1">7F</td><td id="GXG7F1-8" class="border border-gray-200 dark:border-gray-600 p-1 text-center align-middle text-sm">GXG7F1-8占位符</td></tr></tbody></table>
            <hr class="mt-5 mb-2.5">
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：<u>下划线</u>表示该教室在上一时段未处于空闲，<strong>蓝色加粗</strong>表示该教室全天(1-12节)空闲。</p>
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>

        <!-- 本部其它教学楼内容 -->
        <div id="benbuqita" class="tab-content hidden p-4">
            <div class="p-1 mb-2.5 border-2 border-dashed border-neuq-blue/30 rounded-lg bg-neuq-blue/10 text-slate-800 dark:bg-neuq-blue/20 dark:text-gray-200 dark:border-neuq-blue/40 text-left text-sm leading-normal">
                <div class="emergency-info" id="benbu-emergency-info"></div>
            </div>
            <!-- 时间段表格循环开始 -->
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙上午第1-2节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">基础楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">综合实验楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">地质楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">管理楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="JCL1-2" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">JCL1-2占位符</td><td id="ZHSYL1-2" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">ZHSYL1-2占位符</td><td id="DZL1-2" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">DZL1-2占位符</td><td id="GLL1-2" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">GLL1-2占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙上午第3-4节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">基础楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">综合实验楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">地质楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">管理楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="JCL3-4" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">JCL3-4占位符</td><td id="ZHSYL3-4" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">ZHSYL3-4占位符</td><td id="DZL3-4" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">DZL3-4占位符</td><td id="GLL3-4" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">GLL3-4占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌇下午第5-6节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">基础楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">综合实验楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">地质楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">管理楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="JCL5-6" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">JCL5-6占位符</td><td id="ZHSYL5-6" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">ZHSYL5-6占位符</td><td id="DZL5-6" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">DZL5-6占位符</td><td id="GLL5-6" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">GLL5-6占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌇下午第7-8节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">基础楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">综合实验楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">地质楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">管理楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="JCL7-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">JCL7-8占位符</td><td id="ZHSYL7-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">ZHSYL7-8占位符</td><td id="DZL7-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">DZL7-8占位符</td><td id="GLL7-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">GLL7-8占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌃晚上第9-10节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">基础楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">综合实验楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">地质楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">管理楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="JCL9-10" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">JCL9-10占位符</td><td id="ZHSYL9-10" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">ZHSYL9-10占位符</td><td id="DZL9-10" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">DZL9-10占位符</td><td id="GLL9-10" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">GLL9-10占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌃晚上第11-12节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">基础楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">综合实验楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">地质楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">管理楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="JCL11-12" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">JCL11-12占位符</td><td id="ZHSYL11-12" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">ZHSYL11-12占位符</td><td id="DZL11-12" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">DZL11-12占位符</td><td id="GLL11-12" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">GLL11-12占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙昼间第1-8节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">基础楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">综合实验楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">地质楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">管理楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="JCL1-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">JCL1-8占位符</td><td id="ZHSYL1-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">ZHSYL1-8占位符</td><td id="DZL1-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">DZL1-8占位符</td><td id="GLL1-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle">GLL1-8占位符</td></tr></tbody></table>
            <hr class="mt-5 mb-2.5">
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：<u>下划线</u>表示该教室在上一时段未处于空闲，<strong>蓝色加粗</strong>表示该教室全天(1-12节)空闲。</p>
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>

        <!-- 南校区内容 -->
        <div id="nanxiaoqu" class="tab-content hidden p-4">
            <div class="p-1 mb-2.5 border-2 border-dashed border-neuq-blue/30 rounded-lg bg-neuq-blue/10 text-slate-800 dark:bg-neuq-blue/20 dark:text-gray-200 dark:border-neuq-blue/40 text-left text-sm leading-normal">
                <div class="emergency-info" id="nanqu-emergency-info"></div>
            </div>
            <!-- 时间段表格循环开始 -->
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙上午第1-2节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">科技楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">人文楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="KJL1-2" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">KJL1-2占位符</td><td id="RWL1-2" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">RWL1-2占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙上午第3-4节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">科技楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">人文楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="KJL3-4" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">KJL3-4占位符</td><td id="RWL3-4" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">RWL3-4占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌇下午第5-6节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">科技楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">人文楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="KJL5-6" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">KJL5-6占位符</td><td id="RWL5-6" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">RWL5-6占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌇下午第7-8节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">科技楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">人文楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="KJL7-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">KJL7-8占位符</td><td id="RWL7-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">RWL7-8占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌃晚上第9-10节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">科技楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">人文楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="KJL9-10" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">KJL9-10占位符</td><td id="RWL9-10" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">RWL9-10占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🌃晚上第11-12节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">科技楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">人文楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="KJL11-12" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">KJL11-12占位符</td><td id="RWL11-12" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">RWL11-12占位符</td></tr></tbody></table>
            <h3 class="text-xl text-center mt-2.5 mb-1 text-neuq-blue dark:text-indigo-300">🏙昼间第1-8节</h3><table class="w-full border-collapse mt-2.5 font-mono text-xs"><tbody><tr class="font-bold text-center bg-gray-50 dark:bg-gray-700 text-sm"><td class="border border-gray-200 dark:border-gray-600 p-1">科技楼</td><td class="border border-gray-200 dark:border-gray-600 p-1">人文楼</td></tr><tr class="text-center min-h-[50px] break-words whitespace-pre-wrap"><td id="KJL1-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">KJL1-8占位符</td><td id="RWL1-8" class="border border-gray-200 dark:border-gray-600 p-1 align-middle text-sm">RWL1-8占位符</td></tr></tbody></table>
            <hr class="mt-5 mb-2.5">
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：<u>下划线</u>表示该教室在上一时段未处于空闲，<strong>蓝色加粗</strong>表示该教室全天(1-12节)空闲。</p>
            <p class="text-sm text-justify text-gray-600 dark:text-gray-400">注：本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。</p>
        </div>
    </div>

    <p class="text-center text-xs text-gray-500 mt-4">Powered by Tsiaohan Wang <a href="https://github.com/TsiaohanWang/neuq-classroom-query" class="text-neuq-blue no-underline hover:underline dark:text-blue-400">项目入口</a></p>

    <script>
        // 选项卡切换功能
        function openTab(evt, tabName) {
            var i, tabcontent, tablinks;
            // 隐藏所有内容区域
            tabcontent = document.getElementsByClassName("tab-content");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].classList.add("hidden");
                tabcontent[i].classList.remove("active");
            }
            // 移除所有按钮的激活状态
            tablinks = document.getElementsByClassName("tab-button");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].classList.remove("active");
            }
            // 显示点击的选项卡内容并激活对应按钮
            document.getElementById(tabName).classList.remove("hidden");
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
const eventJsonPath = path.join(__dirname, '..', 'calendar', 'neuq_events.json'); // 事件JSON文件路径
// 定义输出HTML文件路径
const outputHtmlPath = path.join(__dirname, '..', 'index.html'); // 输出到主目录

// 定义时间段标签与HTML中时间段标题的映射 (用于查找正确的h3标题)
// 注意：这里的label需要与HTML模板中<h3>标签的文本内容完全一致
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
// jsonData: 包含教室信息的数组
// buildingFilter (可选): 如果提供，则只提取指定教学楼的教室
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

    // 步骤 1.5: 读取事件JSON数据 (neuq_events.json)
    let eventData = []; // 默认为空数组，以防文件不存在或读取失败
    try {
        // 检查事件JSON文件是否存在
        if (fs.existsSync(eventJsonPath)) {
            const rawEventData = fs.readFileSync(eventJsonPath, 'utf-8'); // 同步读取文件内容
            eventData = JSON.parse(rawEventData); // 解析JSON字符串
            console.log(`成功读取 ${eventData.length} 条事件数据。`);
        } else {
            console.warn(`警告：事件JSON文件 (${eventJsonPath}) 未找到。将不会显示任何事件通知。`);
        }
    } catch (error) {
        console.error(`读取或解析 ${eventJsonPath} 时发生错误:`, error);
        // 出错时，eventData 保持为空数组，不中断后续流程，仅影响通知显示
    }


    // 步骤 2: 使用JSDOM解析HTML样板字符串，创建一个可操作的DOM对象
    const dom = new JSDOM(htmlTemplate);
    const document = dom.window.document; // 获取DOM中的document对象

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
    const todayDateObj = parseDateString(currentBeijingDateStr); // 将当前北京日期字符串转换为Date对象（仅日期部分）
    let emergencyHtmlContent = ""; // 用于构建通知内容的HTML字符串

    // 筛选出在今天日期范围内的事件
    const todayActiveEvents = eventData.filter(event => {
        try {
            const startDate = parseDateString(event["起始日期"]); // 事件起始日期
            const endDate = parseDateString(event["结束日期"]);   // 事件结束日期
            // 检查当前日期是否在事件的起始和结束日期之间（包含当天）
            return todayDateObj >= startDate && todayDateObj <= endDate;
        } catch (e) {
            console.warn(`解析事件日期时出错: ${event["名称"]}`, e);
            return false; // 如果日期格式错误，则不显示此事件
        }
    });

    if (todayActiveEvents.length > 0) { // 如果今天有活动事件
        todayActiveEvents.forEach(event => {
            // 根据“是否占用全体教室”字段格式化通知文本
            let occupiedRoomsText = "";
            if (event["是否占用全体教室"] === true) { // 注意：JSON中的布尔值可能是true/false，也可能是字符串"true"/"false"
                occupiedRoomsText = "全体教室。"; // 如果占用全体，则不列出具体教室
            } else if (event["占用教室"]) {
                occupiedRoomsText = `<strong>${event["占用教室"]}</strong>教室。`; // 否则列出具体教室
            }
            // 拼接事件通知的HTML段落
            emergencyHtmlContent += `<p>📢 <strong>${event["名称"]}</strong>将于${event["起始日期"]} ${event["起始时间"]}～${event["结束日期"]} ${event["结束时间"]}占用<strong>${event["占用教学楼"]}</strong>${occupiedRoomsText}</p>`;
        });
    } else {
        emergencyHtmlContent = "<p>今日暂无重要事件通知。</p>"; // 如果没有当天事件，显示默认信息
    }
    // 获取所有选项卡的通知框元素（通过class）
    const emergencyDivs = document.querySelectorAll('.emergency-info');
    emergencyDivs.forEach(div => { // 遍历每个通知框
        div.innerHTML = emergencyHtmlContent; // 将格式化后的通知内容填充到每个通知框
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
    let previousGxgClassrooms = new Set(); // 用于工学馆的下划线逻辑，存储上一个时间段的空闲教室

    // 遍历预定义的每个时间段标签 (例如 "🏙上午第1-2节")
    timeSlotLabels.forEach(slotLabel => {
        // 从时间段标签中提取时间段后缀 (例如 "1-2", "3-4")，用于匹配JSON数据中的“空闲时段”字段
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();
        // 从总数据中筛选出当前时间段、且教学楼为“工学馆”的教室数据
        const currentSlotDataGxg = allProcessedClassroomData.filter(item => item["教学楼"] === "工学馆" && item["空闲时段"] === timeSlotSuffix);

        // 遍历工学馆的楼层 (1F到7F)
        for (let floorNum = 1; floorNum <= 7; floorNum++) {
            const floorStr = `${floorNum}F`; // 例如 "1F"
            // 构建目标单元格的ID，例如 "GXG1F1-2"
            const cellId = `GXG${floorStr}${timeSlotSuffix}`;
            const roomCell = document.getElementById(cellId); // 通过ID获取单元格

            if (roomCell) { // 如果找到了对应的单元格
                // 从当前时间段的工学馆数据中，筛选出属于当前楼层的教室
                const roomsForFloor = currentSlotDataGxg
                    .filter(item => item["名称"] && item["名称"].startsWith(floorNum.toString())) // 通过教室号首数字匹配楼层
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
            }
        }
        // 更新“上一个时间段”的教室数据，但排除“昼间第1-8节”作为比较基准
        if (slotLabel !== "🏙昼间第1-8节") {
            previousGxgClassrooms = getAllClassroomsFromData(currentSlotDataGxg);
        }
    });


    // 步骤 5.2: 填充本部其它教学楼选项卡 (id="benbuqita")
    const benbuBuildings = ["基础楼", "综合实验楼", "地质楼", "管理楼"]; // 定义本部其它的教学楼列表
    const benbuBuildingCodes = { "基础楼": "JCL", "综合实验楼": "ZHSYL", "地质楼": "DZL", "管理楼": "GLL" }; // 楼栋代码，用于ID
    let previousBenbuClassrooms = {}; // 初始化对象，按楼栋名存储上一个时间段的空闲教室
    benbuBuildings.forEach(b => previousBenbuClassrooms[b] = new Set()); // 为每个楼栋创建一个空的Set

    // 遍历每个时间段标签
    timeSlotLabels.forEach(slotLabel => {
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim(); // 提取时间段后缀
        // 遍历本部其它的每个教学楼
        benbuBuildings.forEach((buildingName) => {
            const cellId = `${benbuBuildingCodes[buildingName]}${timeSlotSuffix}`;
            const roomCell = document.getElementById(cellId);

            if (roomCell) { // 如果找到了对应的单元格
                // 筛选出当前时间段、当前教学楼的教室数据
                const currentSlotDataBuilding = allProcessedClassroomData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
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
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim(); // 提取时间段后缀
        // 遍历南校区的每个教学楼
        nanxiaoquBuildings.forEach((buildingName) => {
            const cellId = `${nanxiaoquBuildingCodes[buildingName]}${timeSlotSuffix}`;
            const roomCell = document.getElementById(cellId);

            if (roomCell) { // 如果找到了对应的单元格
                // 筛选出当前时间段、当前教学楼的教室数据
                const currentSlotDataBuilding = allProcessedClassroomData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
                const allDaySet = getAllDaySetForBuilding(buildingName, { allDayFreeKeJiLou, allDayFreeRenWenLou });

                // 初始化普通教室和自主学习室（特指科技楼）的数组
                let regularRooms = [];
                let zizhuRooms = [];

                currentSlotDataBuilding.forEach(item => {
                    let displayName = item["名称"]; // 获取原始教室名
                    let isBold = allDaySet.has(item["名称"]); // 判断是否全天空闲
                    let isUnderlined = slotLabel !== timeSlotLabels[0] && slotLabel !== "🏙昼间第1-8节" && !previousNanxiaoquClassrooms[buildingName].has(item["名称"]); // 判断是否新出现

                    // 应用加粗和下划线样式
                    if (isBold && isUnderlined) displayName = `<strong><u>${item["名称"]}</u></strong>`;
                    else if (isBold) displayName = `<strong>${item["名称"]}</strong>`;
                    else if (isUnderlined) displayName = `<u>${item["名称"]}</u>`;

                    // 如果是科技楼，并且教室名称包含“自主学习室”或“自习室”（兼容process_json.js处理后的名称）
                    if (buildingName === "科技楼" && (item["名称"].includes("自主学习室") || item["名称"].includes("自习室"))) {
                        // 提取自主学习室后的字母用于排序，默认为'Z'以便排在最后
                        // 正则表达式匹配 "自主学习室" 或 "自习室" 结尾的字母
                        const letterMatch = item["名称"].match(/(?:自主学习室|自习室)([A-Z])$/i) ;
                        zizhuRooms.push({ raw: item["名称"], display: displayName, letter: letterMatch ? letterMatch[1].toUpperCase() : 'Z' });
                    } else {
                        // 其他情况（包括人文楼的教室和科技楼的普通教室）都视为普通教室
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
    let commonClassrooms = null;

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
    // 正则表达式，用于从教室号中提取主要的数字部分和可能的后缀（如 "自主学习室X" 或 "-X"）
    // ^(\d+) 匹配开头的连续数字（捕获到组1）
    // (.*)$ 匹配剩余的所有字符作为后缀（捕获到组2）
    const regex = /^(\d+)(.*)$/;
    const matchA = String(a).match(regex);
    const matchB = String(b).match(regex);

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
    return String(a).localeCompare(String(b)); // 确保比较的是字符串
}


// 执行主函数，开始生成HTML报告
generateFinalHtmlReport();
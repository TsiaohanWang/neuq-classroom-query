// 引入Node.js内置的文件系统模块，用于读写文件
const fs = require('fs');
// 引入Node.js内置的路径处理模块，用于安全地构建和操作文件/目录路径
const path = require('path');
// 引入Node.js内置的加密模块，用于计算内容的哈希值
const crypto = require('crypto');
// 引入jsdom库，用于在Node.js环境中模拟浏览器DOM，方便地解析和操作HTML字符串
const { JSDOM } = require('jsdom');

// --- 1. 定义文件和目录路径 ---
const baseDir = path.join(__dirname, '..'); // 项目根目录
const templatePath = path.join(baseDir, 'template', 'template.html'); // HTML模板文件路径
const eventJsonPath = path.join(baseDir, 'calendar', 'neuq_events.json'); // 事件文件路径
const quotesJsonPath = path.join(baseDir, 'quotes', 'quotes.json'); // 格言文件路径
const outputHtmlPath = path.join(baseDir, 'index.html'); // 最终输出的HTML文件路径
const totalDays = 7; // 总共处理的天数

// --- 2. 辅助函数 ---

// 获取指定偏移量的北京日期字符串 (YYYY/MM/DD)
function getBeijingDateString(dayOffset = 0) {
    const now = new Date();
    now.setDate(now.getDate() + dayOffset);
    const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(now);
}

// 解析 YYYY/MM/DD 格式的日期字符串为 Date 对象
function parseDateString(dateString) {
    const [year, month, day] = dateString.split('/').map(Number);
    return new Date(year, month - 1, day);
}

// 从教室数据中提取所有教室名称到一个 Set
function getAllClassroomsFromData(jsonData) {
    const classrooms = new Set();
    if (!jsonData || !Array.isArray(jsonData)) return classrooms;
    for (const entry of jsonData) {
        if (entry["名称"]) {
            classrooms.add(entry["名称"]);
        }
    }
    return classrooms;
}

// 智能排序教室号
function smartSortClassrooms(a, b) {
    const regex = /^(\d+)(.*)$/;
    const matchA = String(a).match(regex);
    const matchB = String(b).match(regex);

    if (matchA && matchB) {
        const numA = parseInt(matchA[1]);
        const numB = parseInt(matchB[1]);
        const suffixA = matchA[2];
        const suffixB = matchB[2];
        if (numA !== numB) return numA - numB;
        return suffixA.localeCompare(suffixB);
    }
    return String(a).localeCompare(String(b));
}

/**
 * 为特定的一天填充所有教室数据到DOM中
 * @param {Document} document - JSDOM的document对象
 * @param {number} dayOffset - 日期偏移量
 * @param {Array} allClassroomData - 当天已处理的所有教室数据
 */
function populateClassroomDataForDay(document, dayOffset, allClassroomData) {
    const timeSlotLabels = ["上午第1-2节", "上午第3-4节", "下午第5-6节", "下午第7-8节", "晚上第9-10节", "晚上第11-12节", "昼间第1-8节"];
    const sequentialSlots = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];

    // 1. 预处理数据，按时段和教学楼分组
    const dataBySlotAndBuilding = {};
    timeSlotLabels.forEach(label => {
        const suffix = label.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();
        dataBySlotAndBuilding[suffix] = {};
        const slotData = allClassroomData.filter(item => item["空闲时段"] === suffix);
        slotData.forEach(item => {
            const building = item["教学楼"];
            if (!dataBySlotAndBuilding[suffix][building]) {
                dataBySlotAndBuilding[suffix][building] = new Set();
            }
            dataBySlotAndBuilding[suffix][building].add(item["名称"]);
        });
    });

    // 2. 计算全天空闲教室
    const allDayFreeClassrooms = {};
    const buildings = ["工学馆", "基础楼", "综合实验楼", "地质楼", "管理楼", "科技楼", "人文楼"];
    buildings.forEach(buildingName => {
        let commonClassrooms = null;
        for (const suffix of sequentialSlots) {
            const currentSlotClassrooms = dataBySlotAndBuilding[suffix]?.[buildingName] || new Set();
            if (commonClassrooms === null) {
                commonClassrooms = new Set(currentSlotClassrooms);
            } else {
                commonClassrooms = new Set([...commonClassrooms].filter(c => currentSlotClassrooms.has(c)));
            }
            if (commonClassrooms.size === 0) break;
        }
        allDayFreeClassrooms[buildingName] = commonClassrooms || new Set();
    });

    // 3. 填充表格
    let previousClassrooms = {}; // 用于下划线逻辑
    const allBuildingCodes = {
        "工学馆": { floors: Array.from({length: 7}, (_, i) => `${i + 1}F`), code: "GXG" },
        "基础楼": { code: "JCL" }, "综合实验楼": { code: "ZHSYL" }, "地质楼": { code: "DZL" }, "管理楼": { code: "GLL" },
        "科技楼": { code: "KJL" }, "人文楼": { code: "RWL" }
    };

    timeSlotLabels.forEach(slotLabel => {
        const timeSlotSuffix = slotLabel.match(/第(.*?)节/)[1].replace(/[上午下午晚上昼间]/g, '').trim();

        Object.entries(allBuildingCodes).forEach(([buildingName, config]) => {
            const currentSlotDataBuilding = allClassroomData.filter(item => item["教学楼"] === buildingName && item["空闲时段"] === timeSlotSuffix);
            
            let nextSlotClassrooms = new Set();
            const seqIndex = sequentialSlots.indexOf(timeSlotSuffix);
            if (seqIndex > -1 && seqIndex < sequentialSlots.length - 1) {
                const nextSuffix = sequentialSlots[seqIndex + 1];
                nextSlotClassrooms = dataBySlotAndBuilding[nextSuffix]?.[buildingName] || new Set();
            }

            const formatAndStyleRooms = (roomList) => {
                return roomList.map(item => {
                    let styledName = item["名称"];
                    const isBold = allDayFreeClassrooms[buildingName].has(item["名称"]);
                    const isUnderlined = timeSlotSuffix !== "1-2" && timeSlotSuffix !== "1-8" && !(previousClassrooms[buildingName] && previousClassrooms[buildingName].has(item["名称"]));
                    const isStrikethrough = sequentialSlots.includes(timeSlotSuffix) && !nextSlotClassrooms.has(item["名称"]);

                    if (isUnderlined) styledName = `<u>${styledName}</u>`;
                    if (isStrikethrough) styledName = `<del>${styledName}</del>`;
                    if (isBold) styledName = `<strong>${styledName}</strong>`;
                    return { raw: item["名称"], display: styledName };
                });
            };

            if (config.floors) { // 工学馆逻辑
                config.floors.forEach(floor => {
                    const cellId = `day-${dayOffset}-${config.code}${floor}${timeSlotSuffix}`;
                    const roomCell = document.getElementById(cellId);
                    if (roomCell) {
                        const roomsForFloor = currentSlotDataBuilding.filter(item => item["名称"].startsWith(floor.charAt(0)));
                        const styledRooms = formatAndStyleRooms(roomsForFloor)
                            .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
                            .map(item => item.display)
                            .join(" ");
                        roomCell.innerHTML = styledRooms || "无";
                    }
                });
            } else { // 其他楼宇逻辑
                const cellId = `day-${dayOffset}-${config.code}${timeSlotSuffix}`;
                const roomCell = document.getElementById(cellId);
                if (roomCell) {
                    let regularRooms = [], zizhuRooms = [];
                    currentSlotDataBuilding.forEach(item => {
                         if (buildingName === "科技楼" && (item["名称"].includes("自主学习室") || item["名称"].includes("自习室"))) {
                            zizhuRooms.push(item);
                         } else {
                            regularRooms.push(item);
                         }
                    });
                     const styledRegular = formatAndStyleRooms(regularRooms).sort((a,b)=>smartSortClassrooms(a.raw,b.raw)).map(r=>r.display).join("<br>");
                     const styledZizhu = formatAndStyleRooms(zizhuRooms).sort((a,b)=>smartSortClassrooms(a.raw,b.raw)).map(r=>r.display).join("<br>");
                     let finalHtml = styledRegular;
                     if(styledZizhu) finalHtml += (finalHtml ? "<br>" : "") + styledZizhu;
                    roomCell.innerHTML = finalHtml || "无";
                }
            }
        });
        
        // 更新上一时段的数据，用于下次循环的下划线判断
        if (timeSlotSuffix !== "1-8") {
            buildings.forEach(b => {
                previousClassrooms[b] = getAllClassroomsFromData(allClassroomData.filter(item => item["教学楼"] === b && item["空闲时段"] === timeSlotSuffix));
            });
        }
    });
}

// --- 3. 主处理函数 ---
async function generateFinalHtmlReport() {
    // 1. 读取 HTML 模板
    let htmlTemplate;
    try {
        htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
        console.log(`成功读取HTML模板: ${templatePath}`);
    } catch (error) {
        console.error(`读取HTML模板文件时发生错误: ${error}`);
        return;
    }

    // 2. 读取事件和格言数据 (只需读取一次)
    let eventData = [], quotes = [];
    try {
        if (fs.existsSync(eventJsonPath)) eventData = JSON.parse(fs.readFileSync(eventJsonPath, 'utf-8'));
        console.log(`成功读取 ${eventData.length} 条事件数据。`);
    } catch (e) { console.error(`读取或解析事件文件失败: ${e}`); }
    try {
        if (fs.existsSync(quotesJsonPath)) quotes = JSON.parse(fs.readFileSync(quotesJsonPath, 'utf-8'));
        console.log(`成功读取 ${quotes.length} 条格言。`);
    } catch (e) { console.error(`读取或解析格言文件失败: ${e}`); }
    
    // 3. 使用 JSDOM 解析模板
    const dom = new JSDOM(htmlTemplate);
    const document = dom.window.document;

    // 4. 填充静态内容 (更新时间戳)
    const updateTimePlaceholder = document.getElementById("update-time-placeholder");
    if (updateTimePlaceholder) {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
        updateTimePlaceholder.textContent = formatter.format(now).replace(/\//g, '/');
    }

    // 5. 填充全局的、仅限今日的事件/格言信息
    console.log("\n--- 开始填充全局 Emergency Info Box ---");
    const todayDateStr = getBeijingDateString(0); // 获取今天的日期 YYYY/MM/DD
    const todayDateObj = parseDateString(todayDateStr);
    const emergencyInfoDiv = document.querySelector(".emergency-info"); // 定位唯一的info框

    if (emergencyInfoDiv) {
        // 筛选出今天的活动事件
        const todayActiveEvents = eventData.filter(event => {
            try {
                const start = parseDateString(event["起始日期"]);
                const end = parseDateString(event["结束日期"]);
                return todayDateObj >= start && todayDateObj <= end;
            } catch { return false; }
        });

        let emergencyHtml = '';
        if (todayActiveEvents.length > 0) {
            console.log(`发现 ${todayActiveEvents.length} 条今日活动事件。`);
            todayActiveEvents.forEach(event => {
                let rooms = event["是否占用全体教室"] ? "全体教室。" : `<strong>${event["占用教室"]}</strong>教室。`;
                emergencyHtml += `<p>📢 <strong>${event["名称"]}</strong>将于${event["起始日期"]} ${event["起始时间"]} - ${event["结束日期"]} ${event["结束时间"]}占用<strong>${event["占用教学楼"]}</strong>${rooms}</p>`;
            });
        } else if (quotes.length > 0) {
            console.log("今日无事件，选择一条随机格言。");
            emergencyHtml = quotes[Math.floor(Math.random() * quotes.length)];
        } else {
            emergencyHtml = "<p>今日暂无重要事件通知。</p>";
        }
        emergencyInfoDiv.innerHTML = emergencyHtml;
        console.log("全局 Emergency Info Box 填充完毕。");
    } else {
        console.warn("警告：在HTML模板中未找到 .emergency-info 元素。");
    }

    // 6. 循环处理每一天的数据并填充到DOM
    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        console.log(`\n--- 开始填充 Day ${dayOffset} 的教室数据 ---`);
        
        const processedJsonPath = path.join(baseDir, `output-day-${dayOffset}`, 'processed_classroom_data.json');
        let classroomDataForDay = [];
        try {
            if (fs.existsSync(processedJsonPath)) {
                classroomDataForDay = JSON.parse(fs.readFileSync(processedJsonPath, 'utf-8'));
                console.log(`成功读取 Day ${dayOffset} 的教室数据: ${classroomDataForDay.length} 条。`);
            } else {
                console.warn(`警告: Day ${dayOffset} 的数据文件未找到: ${processedJsonPath}`);
            }
        } catch (error) {
            console.error(`读取或解析 Day ${dayOffset} 的教室数据时发生错误:`, error);
        }

        if (classroomDataForDay.length > 0) {
            populateClassroomDataForDay(document, dayOffset, classroomDataForDay);
            console.log(`Day ${dayOffset} 的表格数据填充完毕。`);
        } else {
             console.log(`Day ${dayOffset} 没有教室数据可供填充。`);
        }
    }

    // 7. 计算内容哈希并与线上版本比较
    const todayTabContainer = document.querySelector("#day-0-content .tab-container");
    const newContentHtml = todayTabContainer ? todayTabContainer.outerHTML : "";
    const newHash = crypto.createHash("md5").update(newContentHtml).digest("hex");
    
    const metaTag = document.createElement("meta");
    metaTag.name = "page-content-hash";
    metaTag.content = newHash;
    document.head.appendChild(metaTag);

    try {
        const cnamePath = path.join(baseDir, "CNAME");
        if (fs.existsSync(cnamePath)) {
            const domain = fs.readFileSync(cnamePath, "utf-8").trim();
            const response = await fetch(`https://${domain}`);
            if (response.ok) {
                const liveHtml = await response.text();
                const liveDom = new JSDOM(liveHtml);
                const liveMeta = liveDom.window.document.querySelector('meta[name="page-content-hash"]');
                const liveHash = liveMeta ? liveMeta.content : null;

                const badge = document.createElement("span");
                badge.className = "status-badge";
                if (newHash === liveHash) {
                    badge.classList.add("badge-not-updated");
                    badge.textContent = "Not Updated";
                } else {
                    badge.classList.add("badge-updated");
                    badge.textContent = "Updated";
                }
                document.querySelector("p.update-time")?.appendChild(badge);
            }
        }
    } catch (e) { console.error("比较线上版本时出错:", e); }

    // 8. 将最终的DOM序列化并写入 index.html
    const finalHtml = dom.serialize();
    try {
        fs.writeFileSync(outputHtmlPath, finalHtml, 'utf-8');
        console.log(`\n最终HTML报告已成功生成到: ${outputHtmlPath}`);
    } catch (error) {
        console.error(`写入最终HTML文件时发生错误: ${error}`);
    }
}

// 执行主函数
generateFinalHtmlReport();
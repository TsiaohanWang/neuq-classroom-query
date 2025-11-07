// 引入Node.js内置的文件系统模块，用于读写文件
const fs = require("fs");
// 引入Node.js内置的路径处理模块，用于安全地构建和操作文件/目录路径
const path = require("path");
// 引入Node.js内置的加密模块，用于计算内容的哈希值
const crypto = require("crypto");
// 引入jsdom库，用于在Node.js环境中模拟浏览器DOM，方便地解析和操作HTML字符串
const { JSDOM } = require("jsdom");

// --- 1. 定义文件和目录路径 ---
const baseDir = path.join(__dirname, ".."); // 项目根目录
const templatePath = path.join(baseDir, "template", "template.html"); // HTML模板文件路径
const eventJsonPath = path.join(baseDir, "calendar", "neuq_events.json"); // 事件文件路径
const quotesJsonPath = path.join(baseDir, "quotes", "quotes.json"); // 格言文件路径
const outputHtmlPath = path.join(baseDir, "index.html"); // 最终输出的HTML文件路径
const totalDays = 7; // 总共处理的天数

// --- 2. 辅助函数 ---

// 获取指定偏移量的北京日期字符串 (YYYY/MM/DD)
function getBeijingDateString(dayOffset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + dayOffset);
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

// 解析 YYYY/MM/DD 格式的日期字符串为 Date 对象
function parseDateString(dateString) {
  // 增加对无效日期字符串的检查
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateString)) {
    console.warn(`[Helper] 无效的日期格式: "${dateString}"`);
    return null;
  }
  const [year, month, day] = dateString.split("/").map(Number);
  return new Date(year, month - 1, day);
}

// 从教室数据中提取所有教室名称到一个 Set
function getAllClassroomsFromData(jsonData) {
  const classrooms = new Set();
  if (!jsonData || !Array.isArray(jsonData)) return classrooms;
  for (const entry of jsonData) {
    if (entry && entry["名称"]) {
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
  const timeSlotLabels = [
    "上午第1-2节",
    "上午第3-4节",
    "下午第5-6节",
    "下午第7-8节",
    "晚上第9-10节",
    "晚上第11-12节",
    "昼间第1-8节",
  ];
  const sequentialSlots = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];
  // 明确定义哪些时间段适用删除线逻辑
  const STRIKETHROUGH_APPLICABLE_SLOTS = ["1-2", "3-4", "5-6", "7-8", "9-10"];

  // 1. 预处理数据，按时段和教学楼分组
  const dataBySlotAndBuilding = {};
  timeSlotLabels.forEach((label) => {
    const suffixMatch = label.match(/第(.*?)节/);
    if (!suffixMatch) return;
    const suffix = suffixMatch[1].replace(/[上午下午晚上昼间]/g, "").trim();
    dataBySlotAndBuilding[suffix] = {};
    const slotData = allClassroomData.filter(
      (item) => item && item["空闲时段"] === suffix
    );
    slotData.forEach((item) => {
      const building = item["教学楼"];
      if (building) {
        if (!dataBySlotAndBuilding[suffix][building]) {
          dataBySlotAndBuilding[suffix][building] = new Set();
        }
        dataBySlotAndBuilding[suffix][building].add(item["名称"]);
      }
    });
  });

  // 2. 计算全天空闲教室
  const allDayFreeClassrooms = {};
  const buildings = [
    "工学馆",
    "基础楼",
    "综合实验楼",
    "地质楼",
    "管理楼",
    "科技楼",
    "人文楼",
  ];
  buildings.forEach((buildingName) => {
    let commonClassrooms = null;
    for (const suffix of sequentialSlots) {
      const currentSlotClassrooms =
        dataBySlotAndBuilding[suffix]?.[buildingName] || new Set();
      if (commonClassrooms === null) {
        commonClassrooms = new Set(currentSlotClassrooms);
      } else {
        commonClassrooms = new Set(
          [...commonClassrooms].filter((c) => currentSlotClassrooms.has(c))
        );
      }
      if (commonClassrooms.size === 0) break;
    }
    allDayFreeClassrooms[buildingName] = commonClassrooms || new Set();
  });

  // 3. 填充表格
  let previousClassrooms = {}; // 用于下划线逻辑
  const allBuildingCodes = {
    工学馆: {
      floors: Array.from({ length: 7 }, (_, i) => `${i + 1}F`),
      code: "GXG",
    },
    基础楼: { code: "JCL" },
    综合实验楼: { code: "ZHSYL" },
    地质楼: { code: "DZL" },
    管理楼: { code: "GLL" },
    科技楼: { code: "KJL" },
    人文楼: { code: "RWL" },
  };

  timeSlotLabels.forEach((slotLabel) => {
    const suffixMatch = slotLabel.match(/第(.*?)节/);
    if (!suffixMatch) return;
    const timeSlotSuffix = suffixMatch[1]
      .replace(/[上午下午晚上昼间]/g, "")
      .trim();

    Object.entries(allBuildingCodes).forEach(([buildingName, config]) => {
      const currentSlotDataBuilding = allClassroomData.filter(
        (item) =>
          item &&
          item["教学楼"] === buildingName &&
          item["空闲时段"] === timeSlotSuffix
      );

      let nextSlotClassrooms = new Set();
      const seqIndex = sequentialSlots.indexOf(timeSlotSuffix);
      if (seqIndex > -1 && seqIndex < sequentialSlots.length - 1) {
        const nextSuffix = sequentialSlots[seqIndex + 1];
        nextSlotClassrooms =
          dataBySlotAndBuilding[nextSuffix]?.[buildingName] || new Set();
      }

      const formatAndStyleRooms = (roomList) => {
        if (!Array.isArray(roomList)) return [];
        return roomList.map((item) => {
          const roomName = item["名称"];
          let styledName = roomName;
          const isBold = allDayFreeClassrooms[buildingName]?.has(roomName);
          const isUnderlined =
            timeSlotSuffix !== "1-2" &&
            timeSlotSuffix !== "1-8" &&
            !previousClassrooms[buildingName]?.has(roomName);
          const isStrikethrough =
            STRIKETHROUGH_APPLICABLE_SLOTS.includes(timeSlotSuffix) &&
            !nextSlotClassrooms.has(roomName);

          if (isUnderlined) styledName = `<u>${styledName}</u>`;
          if (isStrikethrough) styledName = `<del>${styledName}</del>`;
          if (isBold) styledName = `<strong>${styledName}</strong>`;
          return { raw: roomName, display: styledName };
        });
      };

      if (config.floors) {
        // 工学馆逻辑
        config.floors.forEach((floor) => {
          const cellId = `day-${dayOffset}-${config.code}${floor}${timeSlotSuffix}`;
          const roomCell = document.getElementById(cellId);
          if (roomCell) {
            const roomsForFloor = currentSlotDataBuilding.filter((item) =>
              item?.["名称"]?.startsWith(floor.charAt(0))
            );
            const styledRooms = formatAndStyleRooms(roomsForFloor)
              .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
              .map((item) => item.display)
              .join(" ");
            roomCell.innerHTML = styledRooms || "无";
          } else {
            console.warn(`[Day ${dayOffset}] 未找到工学馆单元格: #${cellId}`);
          }
        });
      } else {
        // 其他楼宇逻辑
        const cellId = `day-${dayOffset}-${config.code}${timeSlotSuffix}`;
        const roomCell = document.getElementById(cellId);
        if (roomCell) {
          let finalHtml = "";
          if (buildingName === "科技楼") {
            let regularRooms = [];
            let zizhuRooms = [];
            currentSlotDataBuilding.forEach((item) => {
              if (item?.["名称"]?.includes("自习室")) {
                const letterMatch = item["名称"].match(/自习室([A-Z])$/i);
                zizhuRooms.push({
                  ...item,
                  letter: letterMatch ? letterMatch[1].toUpperCase() : "Z",
                });
              } else {
                regularRooms.push(item);
              }
            });

            const styledRegularPart = formatAndStyleRooms(regularRooms)
              .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
              .map((item) => item.display)
              .join(" ");

            const sortedZizhuRooms = zizhuRooms.sort((a, b) =>
              (a.letter || "Z").localeCompare(b.letter || "Z")
            );
            const styledZizhuPart = formatAndStyleRooms(sortedZizhuRooms)
              .map((item) => item.display)
              .join("<br>");

            finalHtml = styledRegularPart;
            if (styledZizhuPart) {
              finalHtml += (finalHtml ? "<br>" : "") + styledZizhuPart;
            }
          } else if (buildingName === "人文楼") {
            finalHtml = formatAndStyleRooms(currentSlotDataBuilding)
              .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
              .map((item) => item.display)
              .join(" ");
          } else {
            finalHtml = formatAndStyleRooms(currentSlotDataBuilding)
              .sort((a, b) => smartSortClassrooms(a.raw, b.raw))
              .map((item) => item.display)
              .join("<br>");
          }
          roomCell.innerHTML = finalHtml || "无";
        } else {
          console.warn(`[Day ${dayOffset}] 未找到单元格: #${cellId}`);
        }
      }
    });

    if (timeSlotSuffix !== "1-8") {
      buildings.forEach((b) => {
        previousClassrooms[b] = getAllClassroomsFromData(
          allClassroomData.filter(
            (item) =>
              item &&
              item["教学楼"] === b &&
              item["空闲时段"] === timeSlotSuffix
          )
        );
      });
    }
  });
}

// --- 3. 主处理函数 ---
async function generateFinalHtmlReport() {
  console.log("--- 开始生成HTML报告 ---");
  // 1. 读取 HTML 模板
  let htmlTemplate;
  try {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`模板文件不存在: ${templatePath}`);
    }
    htmlTemplate = fs.readFileSync(templatePath, "utf-8");
    console.log("✔ 成功读取HTML模板。");
  } catch (error) {
    console.error(`[致命错误] 读取HTML模板失败: ${error.message}`);
    return; // 无法继续，终止脚本
  }

  // 1.5. 服务器端随机选择背景并替换占位符
  console.log("--- 开始随机选择并注入背景样式表 ---");
  try {
    const patterns = [
      "pattern0.css",
      "pattern1.css",
      "pattern2.css",
      "pattern3.css",
      "pattern4.css",
      "pattern5.css",
      "pattern6.css",
      "pattern7.css",
    ];
    // 使用加密安全的随机数生成器
    const chosenPattern = patterns[crypto.randomInt(patterns.length)];
    console.log(`  ✔ 已随机选择背景: ${chosenPattern}`);

    const placeholder = "<!-- 背景样式表将由JS在此处动态插入 -->";
    const stylesheetLink = `<link rel="stylesheet" href="../style/${chosenPattern}">`;

    // 在将模板内容交给 JSDOM 解析之前，先进行字符串替换
    if (htmlTemplate.includes(placeholder)) {
      htmlTemplate = htmlTemplate.replace(placeholder, stylesheetLink);
      console.log("  ✔ 已成功将背景样式表链接注入HTML模板。");
    } else {
      console.warn(
        "  ! 警告: 在HTML模板中未找到背景样式表的占位符 '<!-- 背景样式表将由JS在此处动态插入 -->'。"
      );
    }
  } catch (error) {
    console.error(`  ✖ 处理随机背景时出错: ${error.message}`);
  }

  // 2. 读取事件和格言数据
  let eventData = [],
    quotes = [];
  try {
    if (fs.existsSync(eventJsonPath)) {
      eventData = JSON.parse(fs.readFileSync(eventJsonPath, "utf-8"));
      console.log(`✔ 成功读取 ${eventData.length} 条事件数据。`);
    } else {
      console.warn("! 未找到事件文件，将不显示任何事件。");
    }
  } catch (e) {
    console.error(`✖ 读取或解析事件文件失败: ${e.message}`);
  }
  try {
    if (fs.existsSync(quotesJsonPath)) {
      quotes = JSON.parse(fs.readFileSync(quotesJsonPath, "utf-8"));
      console.log(`✔ 成功读取 ${quotes.length} 条格言。`);
    } else {
      console.warn("! 未找到格言文件，将使用默认提示。");
    }
  } catch (e) {
    console.error(`✖ 读取或解析格言文件失败: ${e.message}`);
  }

  // 3. 使用 JSDOM 解析模板
  const dom = new JSDOM(htmlTemplate);
  const document = dom.window.document;

  // 4. 填充静态内容 (更新时间戳)
  const updateTimePlaceholder = document.getElementById(
    "update-time-placeholder"
  );
  if (updateTimePlaceholder) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    updateTimePlaceholder.textContent = formatter
      .format(now)
      .replace(/\//g, "/");
  }

  // 5. 填充全局的、仅限今日的事件/格言信息
  console.log("\n--- 开始填充全局 Emergency Info Box ---");
  const emergencyInfoDiv = document.querySelector(".emergency-info");
  if (emergencyInfoDiv) {
    let emergencyHtml = "";
    try {
      const todayDateStr = getBeijingDateString(0); // 获取今天的日期 YYYY/MM/DD
      const todayDateObj = parseDateString(todayDateStr);

      // 筛选出当前处于“活动时期”的事件
      const activeEvents = eventData.filter((event) => {
        // 健壮性检查：确保事件对象和必要的字段存在
        if (!event || !event.start || !event.end || !event.content) {
            console.warn("  ! 发现格式不完整的事件对象，已跳过:", event);
            return false;
        }
        try {
          // 解析事件的起始和结束日期
          const startDate = parseDateString(event.start);
          const endDate = parseDateString(event.end);
          
          // 计算活动时期的起始日（即事件开始日期的前一天）
          const activityStartDate = new Date(startDate);
          activityStartDate.setDate(startDate.getDate() - 1);

          // 检查今天是否在 [活动起始日, 事件结束日] 的闭区间内
          return todayDateObj >= activityStartDate && todayDateObj <= endDate;
        } catch (e) {
            console.error(`  ✖ 解析事件日期时出错，已跳过该事件: ${event.content}`, e);
            return false;
        }
      });

      if (activeEvents.length > 0) {
        console.log(`  发现 ${activeEvents.length} 条当前活动事件。`);
        // 将所有活动事件的 content 字段拼接起来
        emergencyHtml = activeEvents.map(event => event.content).join('');
      } else if (quotes.length > 0) {
        console.log("  今日无活动事件，选择一条随机格言。");
        // 使用 crypto 模块生成一个加密安全的随机索引
        const randomIndex = crypto.randomInt(quotes.length);
        const randomQuoteObject = quotes[randomIndex];
        emergencyHtml = randomQuoteObject.content;
      } else {
        emergencyHtml = "<p>今日暂无重要事件通知。</p>";
      }
    } catch (error) {
        console.error(`  ✖ 处理 Emergency Info Box 时发生错误: ${error.message}`);
        emergencyHtml = "<p>加载事件信息时出错。</p>";
    }

    emergencyInfoDiv.innerHTML = emergencyHtml;
    console.log("✔ 全局 Emergency Info Box 填充完毕。");
  } else {
    console.warn("! 警告：在HTML模板中未找到 .emergency-info 元素。");
  }

  // 6. 循环处理每一天的数据并填充到DOM
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    console.log(`\n--- 开始填充 Day ${dayOffset} 的教室数据 ---`);
    const processedJsonPath = path.join(
      baseDir,
      `output-day-${dayOffset}`,
      "processed_classroom_data.json"
    );
    let classroomDataForDay = [];
    try {
      if (fs.existsSync(processedJsonPath)) {
        classroomDataForDay = JSON.parse(
          fs.readFileSync(processedJsonPath, "utf-8")
        );
        console.log(
          `  ✔ 成功读取 Day ${dayOffset} 的教室数据: ${classroomDataForDay.length} 条。`
        );
      } else {
        console.warn(
          `  ! 警告: Day ${dayOffset} 的数据文件未找到: ${processedJsonPath}`
        );
      }
    } catch (error) {
      console.error(
        `  ✖ 读取或解析 Day ${dayOffset} 的教室数据时发生错误: ${error.message}`
      );
    }

    if (classroomDataForDay.length > 0) {
      populateClassroomDataForDay(document, dayOffset, classroomDataForDay);
      console.log(`  ✔ Day ${dayOffset} 的表格数据填充完毕。`);
    } else {
      console.log(`  - Day ${dayOffset} 没有教室数据可供填充。`);
    }
  }

  // 7. 计算内容哈希并与线上版本比较
  console.log("\n--- 开始计算内容哈希并与线上版本比较 ---");
  const todayTabContainer = document.querySelector(
    "#day-0-content .tab-container"
  );
  const newContentHtml = todayTabContainer ? todayTabContainer.outerHTML : "";
  const newHash = crypto.createHash("md5").update(newContentHtml).digest("hex");

  const metaTag = document.createElement("meta");
  metaTag.name = "page-content-hash";
  metaTag.content = newHash;
  document.head.appendChild(metaTag);

  const addStatusBadge = (text, className) => {
    const badge = document.createElement("span");
    badge.className = `status-badge ${className}`;
    badge.textContent = text;
    document.querySelector("p.update-time")?.appendChild(badge);
  };

  try {
    const cnamePath = path.join(baseDir, "CNAME");
    if (fs.existsSync(cnamePath)) {
      const domain = fs.readFileSync(cnamePath, "utf-8").trim();
      console.log(`  正在从 https://${domain} 获取线上版本...`);
      const response = await fetch(`https://${domain}`);

      if (response.ok) {
        // 成功获取到页面 (状态码 2xx)
        const liveHtml = await response.text();
        const liveDom = new JSDOM(liveHtml);
        const liveMeta = liveDom.window.document.querySelector(
          'meta[name="page-content-hash"]'
        );
        const liveHash = liveMeta ? liveMeta.content : null;
        console.log(`  线上版本哈希: ${liveHash} | 新版本哈希: ${newHash}`);

        if (newHash === liveHash) {
          addStatusBadge("Not Updated", "badge-not-updated");
          console.log("  内容无变化。");
        } else {
          addStatusBadge("Updated", "badge-updated");
          console.log("  内容已更新。");
        }
      } else {
        // 获取页面失败 (例如 404, 500等)
        console.warn(`  ! 获取线上版本失败，状态码: ${response.status}`);
        // 按照要求，显示 NotFound 状态
        addStatusBadge("Not Found", "badge-not-found");
      }
    } else {
      console.log("  - 未找到 CNAME 文件，跳过比较。");
    }
  } catch (e) {
    // 捕获 fetch 本身的网络错误 (例如 DNS 解析失败)
    console.error(`  ✖ 比较线上版本时发生网络错误: ${e.message}`);
    // 同样显示 NotFound 状态
    addStatusBadge("Not Found", "badge-not-found");
  }

  // 8. 将最终的DOM序列化并写入 index.html
  const finalHtml = dom.serialize();
  try {
    fs.writeFileSync(outputHtmlPath, finalHtml, "utf-8");
    console.log(`\n✔ 最终HTML报告已成功生成到: ${outputHtmlPath}`);
  } catch (error) {
    console.error(`[致命错误] 写入最终HTML文件失败: ${error.message}`);
  }
}

// 执行主函数
generateFinalHtmlReport();

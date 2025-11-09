const fs = require("fs");
const path = require("path");

/**
 * 读取并解析黑名单JSON文件。
 * @returns {object} 黑名单数据对象，或在失败时返回一个空对象。
 */
function loadBlacklist() {
  // 定义黑名单文件的路径，相对于当前脚本的位置
  const blacklistPath = path.join(__dirname, "..", "assets", "blacklist", "blacklist.json");
  try {
    if (fs.existsSync(blacklistPath)) {
      const rawData = fs.readFileSync(blacklistPath, "utf-8");
      console.log("✔ 成功读取黑名单文件。");
      return JSON.parse(rawData);
    } else {
      console.warn("! 警告: 未找到黑名单文件，将不应用任何黑名单规则。");
      return {}; // 返回空对象，使后续逻辑能安全运行
    }
  } catch (error) {
    console.error(`✖ 读取或解析黑名单文件时发生错误: ${error.message}`);
    return {}; // 出错时也返回空对象
  }
}

/**
 * 为单个目录中的JSON文件执行所有的筛选和转换规则。
 * @param {string} inputDir - 包含原始JSON文件的目录路径
 * @param {string} outputDir - 处理后的JSON文件将要保存的目录路径
 * @param {object} blacklist - 从文件加载的黑名单对象
 */
function processJsonFilesInDirectory(inputDir, outputDir, blacklist) {
  console.log(`\n====================================================`);
  console.log(`正在处理目录: ${inputDir}`);
  console.log(`====================================================`);

  const outputFile = path.join(outputDir, "processed_classroom_data.json");

  let allClassroomData = [];

  // 0. 读取目录中所有相关的JSON文件
  try {
    if (!fs.existsSync(inputDir)) {
      console.warn(`警告: 目录 ${inputDir} 不存在，跳过处理。`);
      return;
    }
    const files = fs.readdirSync(inputDir);
    for (const file of files) {
      if (file.startsWith("classroom_results_") && file.endsWith(".json")) {
        const filePath = path.join(inputDir, file);
        const rawData = fs.readFileSync(filePath, "utf-8");
        let jsonData = JSON.parse(rawData);

        const timeSlotSuffixMatch = file.match(/classroom_results_(.+)\.json$/);
        const timeSlot = timeSlotSuffixMatch
          ? timeSlotSuffixMatch[1]
          : "未知时段";

        jsonData = jsonData.map((item) => ({
          ...item,
          空闲时段: timeSlot,
        }));

        allClassroomData = allClassroomData.concat(jsonData);
        console.log(
          `已读取并合并文件: ${file}, 添加了 ${jsonData.length} 条数据，空闲时段: ${timeSlot}`
        );
      }
    }
  } catch (error) {
    console.error(`在目录 ${inputDir} 中读取或合并JSON文件时发生错误:`, error);
    return;
  }

  if (allClassroomData.length === 0) {
    console.log(`目录 ${inputDir} 中没有找到需要处理的JSON文件。`);
    return;
  }

  console.log(
    `所有JSON文件合并完成，总共 ${allClassroomData.length} 条数据。开始应用筛选和转换规则...`
  );

  /*
    处理规则说明:
    1. 如果“教学楼”和“教室设备配置”字段均为空字符串，那么舍弃该项。
    2. 如果“教室设备配置”字段为空字符串，但“教学楼”不为空，也舍弃该项。
    3. 如果"容量"字段值为"0"，那么舍弃该项。
    4. 删除所有项中的"校区"和"序号"字段。
    5. 如果“教室设备配置”字段值为“体育教学场地”、“机房”、“实验室”、“活动教室”、“研讨室”、“多功能”、“智慧教室”、“不排课教室”或“语音室”，只要是其中任意一种那么就舍弃该项。
    6. 如果“教学楼”字段值为“大学会馆”或“旧实验楼”，那么就舍弃该项。
    7. 对于所有“教学楼”字段值为“工学馆”的，先检查它的“名称”字段值是否符合“工学馆+一串数字编号”的样式，若符合，就将其中的“工学馆“字样除去，只保留后面的编号。
    8. 对于所有“教学楼”字段值为“管理楼”的，先检查它的“名称”字段值是否符合“管理楼+一串数字编号”的样式，若符合，就将其中的“管理楼”字样除去，只保留后面的编号。
    9. 对于所有“教学楼”字段值为“基础楼”的，先检查它的“名称”字段值是否符合“基础楼+一串数字编号”的样式，若符合，就将其中的“基础楼“字样除去，只保留后面的编号。
    10. 对于所有“教学楼”字段值为“人文楼”的，先检查它的“名称”字段值是否符合“人文楼+一串数字编号”的样式，若符合，就将其中的“人文楼“字样除去，只保留后面的编号。
    11. 对于所有“教学楼”字段值为“综合实验楼”的，先检查它的“名称”字段值是否符合“综合楼+一串数字编号”的样式，若符合，就将其中的“综合楼“字样除去，只保留后面的编号。
    12. 对于所有“教学楼”字段值为“科技楼”的，先检查它的“名称”字段值是否符合“科技楼+一串数字编号”的样式，若符合，就将其中的“科技楼“字样除去，只保留后面的编号。若不符合，进行以下判断：
        1) 若“名称”字段值以“自主学习室”开头，那么该字段值必定是“自主学习室+一个拉丁字母+科技楼+含有数字或数字和字母和符号的字符串“，将该字段更改为“含有数字或数字和字母和符号的字符串+自习室+一个拉丁字母”的样式。 例如“自主学习室Q科技楼6026-A”改为“6026-A自习室Q”。
        2) 若不符合1)的条件，就舍弃该项。
    13. 如果一个教室的“教学楼”和处理后的“名称”组合存在于黑名单中，则舍弃该项。
    */

  // 应用筛选和转换规则
  let processedData = allClassroomData
    .filter((item) => !(item["教学楼"] === "" && item["教室设备配置"] === "")) // Rule 1
    .filter((item) => !(item["教室设备配置"] === "" && item["教学楼"] !== "")) // Rule 2
    .filter((item) => item["容量"] !== "0") // Rule 3
    .map((item) => {
      // Rule 4
      delete item["校区"];
      delete item["序号"];
      return item;
    })
    .filter((item) => {
      // Rule 5
      const forbiddenConfigs = [
        "体育教学场地",
        "机房",
        "实验室",
        "活动教室",
        "研讨室",
        "多功能",
        "智慧教室",
        "不排课教室",
        "语音室",
      ];
      return !forbiddenConfigs.includes(item["教室设备配置"]);
    })
    .filter((item) => {
      // Rule 6
      const forbiddenBuildings = ["大学会馆", "旧实验楼"];
      return !forbiddenBuildings.includes(item["教学楼"]);
    })
    .map((item) => {
      // Rules 7 - 12 (名称清洗)
      const building = item["教学楼"];
      let name = item["名称"];

      // 这个函数用于简化名称提取逻辑
      const extractNumberPart = (prefix) => {
        if (name?.startsWith(prefix)) {
          const numberPart = name.substring(prefix.length);
          if (
            /^\d+[A-Z]?$/.test(numberPart) ||
            /^\d+[A-Z]?-\d+[A-Z\d-]*$/.test(numberPart)
          ) {
            item["名称"] = numberPart;
          }
        }
      };

      switch (building) {
        case "工学馆":
          extractNumberPart("工学馆");
          break;
        case "管理楼":
          extractNumberPart("管理楼");
          break;
        case "基础楼":
          extractNumberPart("基础楼");
          break;
        case "人文楼":
          extractNumberPart("人文楼");
          break;
        case "综合实验楼":
          extractNumberPart("综合楼");
          break;
        case "科技楼":
          if (name?.startsWith("科技楼")) {
            extractNumberPart("科技楼");
          } else {
            const zizhuMatch = name.match(/^自主学习室([A-Z])科技楼(.+)$/);
            if (zizhuMatch) {
              item["名称"] = `${zizhuMatch[2]}自习室${zizhuMatch[1]}`;
            } else {
              return null; // 标记为待删除
            }
          }
          break;
      }
      return item;
    })
    .filter((item) => item !== null) // 过滤掉名称不合规的项

    .filter((item) => {
      const building = item["教学楼"];
      const classroomName = item["名称"];

      // 检查黑名单对象中是否存在该教学楼的键，以及该教学楼的数组中是否包含当前教室名称
      if (blacklist[building] && blacklist[building].includes(classroomName)) {
        // 如果在黑名单中，返回 false 以过滤掉此项
        console.log(`  - 正在从黑名单中移除: ${building} - ${classroomName}`);
        return false;
      }

      // 如果不在黑名单中，返回 true 以保留此项
      return true;
    });

  console.log(`规则应用完毕，处理后剩余 ${processedData.length} 条数据。`);

  try {
    fs.writeFileSync(
      outputFile,
      JSON.stringify(processedData, null, 2),
      "utf-8"
    );
    console.log(`处理后的数据已成功写入到: ${outputFile}`);
  } catch (error) {
    console.error(`写入处理后的JSON文件 ${outputFile} 时发生错误:`, error);
  }
}

/**
 * 主函数，负责循环处理未来7天的所有数据目录
 */
function processAllDays() {
  const totalDays = 7;
  const baseDir = path.join(__dirname, "..");

  // 在所有处理开始前，只加载一次黑名单文件
  const blacklist = loadBlacklist();

  for (let day = 0; day < totalDays; day++) {
    const directoryName = `output-day-${day}`;
    const fullDirPath = path.join(baseDir, directoryName);
    // 将加载好的黑名单数据传递给处理函数
    processJsonFilesInDirectory(fullDirPath, fullDirPath, blacklist);
  }

  console.log("\n所有日期目录的数据处理任务已全部执行完毕。");
}

// 执行主函数
processAllDays();

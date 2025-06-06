const fs = require('fs');
const path = require('path');

// 定义输入和输出路径
const inputDir = path.join(__dirname, '..', 'output'); // JSON文件所在的目录 (父目录下的output文件夹)
// 修改下面这一行，将输出文件路径指向 inputDir
const outputFile = path.join(inputDir, 'processed_classroom_data.json'); // 处理后输出的JSON文件名

/*
0. 读取所有JSON文件，添加“空闲时段”字段，并合并数据。
1. 如果“教学楼”和“教室设备配置”字段均为空字符串，那么舍弃该项。
2. 如果“教室设备配置”字段为空字符串，但“教学楼”不为空，也舍弃该项。
3. 如果"容量"字段值为"0"，那么舍弃该项。
4. 删除所有项中的"校区"和"序号"字段。
5. 如果“教室设备配置”字段值为“体育教学场地”、“机房”、“实验室”、“活动教室”、“智慧教室”、“不排课教室”或“语音室”，只要是其中任意一种那么就舍弃该项。
6. 如果“教学楼”字段值为“大学会馆”或“旧实验楼”，那么就舍弃该项。
7. 对于所有“教学楼”字段值为“工学馆”的，先检查它的“名称”字段值是否符合“工学馆+一串数字编号”的样式，若符合，就将其中的“工学馆“字样除去，只保留后面的编号。
8. 对于所有“教学楼”字段值为“管理楼”的，先检查它的“名称”字段值是否符合“管理楼+一串数字编号”的样式，若符合，就将其中的“管理楼”字样除去，只保留后面的编号。
9. 对于所有“教学楼”字段值为“基础楼”的，先检查它的“名称”字段值是否符合“基础楼+一串数字编号”的样式，若符合，就将其中的“基础楼“字样除去，只保留后面的编号。
10. 对于所有“教学楼”字段值为“人文楼”的，先检查它的“名称”字段值是否符合“人文楼+一串数字编号”的样式，若符合，就将其中的“人文楼“字样除去，只保留后面的编号。
11. 对于所有“教学楼”字段值为“综合实验楼”的，先检查它的“名称”字段值是否符合“综合楼+一串数字编号”的样式，若符合，就将其中的“综合楼“字样除去，只保留后面的编号。
12. 对于所有“教学楼”字段值为“科技楼”的，先检查它的“名称”字段值是否符合“科技楼+一串数字编号”的样式，若符合，就将其中的“科技楼“字样除去，只保留后面的编号。若不符合，进行以下判断：
    1) 若“名称”字段值以“自主学习室”开头，那么该字段值必定是“自主学习室+一个拉丁字母+科技楼+含有数字或数字和字母和符号的字符串“，将该字段更改为“含有数字或数字和字母和符号的字符串+自主学习室+一个拉丁字母”的样式。 例如“自主学习室Q科技楼6026-A”改为“6026-A自主学习室Q”。
    2) 若不符合1)的条件，就舍弃该项。
*/

// 主处理函数
function processAllJsonFiles() {
    let allClassroomData = []; // 用于存储所有JSON文件合并后的数据

    // 0. 读取所有JSON文件，添加“空闲时段”字段，并合并数据
    try {
        const files = fs.readdirSync(inputDir); // 同步读取目录下的所有文件名
        for (const file of files) {
            // 修改这里的逻辑，避免读取自身（如果脚本恰好在output目录运行且文件名符合）
            if (file.startsWith('classroom_results_') && file.endsWith('.json') && file !== path.basename(outputFile)) {
                const filePath = path.join(inputDir, file); // 构建完整的文件路径
                const rawData = fs.readFileSync(filePath, 'utf-8'); // 读取文件内容
                let jsonData = JSON.parse(rawData); // 解析JSON数据

                // 从文件名中提取时段后缀，例如 "classroom_results_1-2.json" -> "1-2"
                const timeSlotSuffixMatch = file.match(/classroom_results_(.+)\.json$/);
                const timeSlot = timeSlotSuffixMatch ? timeSlotSuffixMatch[1] : '未知时段';

                // 为每个条目添加“空闲时段”字段
                jsonData = jsonData.map(item => ({
                    ...item,
                    "空闲时段": timeSlot
                }));

                allClassroomData = allClassroomData.concat(jsonData); // 将当前文件的数据合并到总数据中
                console.log(`已读取并合并文件: ${file}, 添加了 ${jsonData.length} 条数据，空闲时段: ${timeSlot}`);
            }
        }
    } catch (error) {
        console.error('读取或合并JSON文件时发生错误:', error);
        return; // 如果读取失败，则终止处理
    }

    console.log(`所有JSON文件合并完成，总共 ${allClassroomData.length} 条数据。开始应用筛选和转换规则...`);

    // 应用筛选和转换规则
    let processedData = allClassroomData
        // 1. 如果“教学楼”和“教室设备配置”字段均为空字符串，那么舍弃该项。
        .filter(item => !(item["教学楼"] === "" && item["教室设备配置"] === ""))
        // 2. 如果“教室设备配置”字段为空字符串，但“教学楼”不为空，也舍弃该项。
        .filter(item => !(item["教室设备配置"] === "" && item["教学楼"] !== ""))
        // 3. 如果"容量"字段值为"0"，那么舍弃该项。
        .filter(item => item["容量"] !== "0")
        // 4. 删除所有项中的"校区"和"序号"字段。
        .map(item => {
            delete item["校区"];
            delete item["序号"];
            return item;
        })
        // 5. 如果“教室设备配置”字段值为“体育教学场地”、“机房”、“实验室”、“活动教室”、“智慧教室”、“不排课教室”或“语音室”，只要是其中任意一种那么就舍弃该项。
        .filter(item => {
            const forbiddenConfigs = ["体育教学场地", "机房", "实验室", "活动教室", "智慧教室", "不排课教室", "语音室"];
            return !forbiddenConfigs.includes(item["教室设备配置"]);
        })
        // 6. 如果“教学楼”字段值为“大学会馆”或“旧实验楼”，那么就舍弃该项。
        .filter(item => {
            const forbiddenBuildings = ["大学会馆", "旧实验楼"];
            return !forbiddenBuildings.includes(item["教学楼"]);
        })
        // 7. - 12. 处理特定教学楼的名称字段
        .map(item => {
            const building = item["教学楼"];
            let name = item["名称"];

            if (building === "工学馆") {
                if (name && name.startsWith("工学馆") && /^\d+$/.test(name.substring("工学馆".length))) {
                    item["名称"] = name.substring("工学馆".length);
                }
            } else if (building === "管理楼") {
                if (name && name.startsWith("管理楼") && /^\d+$/.test(name.substring("管理楼".length))) {
                    item["名称"] = name.substring("管理楼".length);
                }
            } else if (building === "基础楼") {
                if (name && name.startsWith("基础楼") && /^\d+$/.test(name.substring("基础楼".length))) {
                    item["名称"] = name.substring("基础楼".length);
                }
            } else if (building === "人文楼") {
                if (name && name.startsWith("人文楼") && /^\d+$/.test(name.substring("人文楼".length))) {
                    item["名称"] = name.substring("人文楼".length);
                }
            } else if (building === "综合实验楼") {
                // 注意：规则是 "综合楼" + 数字编号
                if (name && name.startsWith("综合楼") && /^\d+$/.test(name.substring("综合楼".length))) {
                    item["名称"] = name.substring("综合楼".length);
                }
            } else if (building === "科技楼") {
                if (name && name.startsWith("科技楼") && /^\d+$/.test(name.substring("科技楼".length))) {
                    item["名称"] = name.substring("科技楼".length);
                } else {
                    // 12.1) 若“名称”字段值以“自主学习室”开头...
                    const zizhuXuexishiMatch = name.match(/^自主学习室([A-Z])科技楼(.+)$/);
                    if (zizhuXuexishiMatch) {
                        const letter = zizhuXuexishiMatch[1];
                        const numberPart = zizhuXuexishiMatch[2];
                        item["名称"] = `${numberPart}自主学习室${letter}`;
                    } else {
                        // 12.2) 若不符合1)的条件，就舍弃该项。
                        return null; // 标记为待删除
                    }
                }
            }
            return item;
        })
        // 过滤掉在步骤12中标记为null的项
        .filter(item => item !== null);


    console.log(`规则应用完毕，处理后剩余 ${processedData.length} 条数据。`);

    // 将处理后的数据写入新的JSON文件
    try {
        // 确保输出目录存在，如果不存在则创建它
        const outputDirForProcessedFile = path.dirname(outputFile);
        if (!fs.existsSync(outputDirForProcessedFile)) {
            fs.mkdirSync(outputDirForProcessedFile, { recursive: true });
            console.log(`输出目录 ${outputDirForProcessedFile} 已创建。`);
        }
        fs.writeFileSync(outputFile, JSON.stringify(processedData, null, 2), 'utf-8');
        console.log(`处理后的数据已成功写入到: ${outputFile}`);
    } catch (error) {
        console.error('写入处理后的JSON文件时发生错误:', error);
    }
}

// 执行主处理函数
processAllJsonFiles();
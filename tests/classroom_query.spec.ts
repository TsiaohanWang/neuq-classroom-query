import { test, expect, Browser } from "@playwright/test"; // 导入 Playwright 测试框架的核心模块, 注意增加了 Browser 类型
import * as fs from "fs"; // 引入Node.js内置的文件系统模块
import * as path from "path"; // 引入Node.js内置的路径处理模块

// 在所有测试开始前，配置测试上下文的默认时区为北京时间。
test.use({
  timezoneId: 'Asia/Shanghai',
});


/**
 * 封装了为特定某一天抓取所有空闲教室数据的完整逻辑。
 * @param dayOffset - 日期偏移量。0代表今天, 1代表明天, 以此类推。
 * @param browser - 由 Playwright test runner 提供的浏览器实例。
 */
async function fetchDataForDay(dayOffset: number, browser: Browser) {
  // 1. 创建一个全新的、隔离的浏览器上下文 (等同于一个全新的隐身窗口)
  const context = await browser.newContext();
  const page = await context.newPage();

  // 2. 设置当前页面的虚拟时间
  const baseDate = new Date();
  const targetDate = new Date(baseDate);
  targetDate.setDate(baseDate.getDate() + dayOffset);
  await page.clock.install({ time: targetDate });
  console.log(`已将浏览器虚拟时间设置为 Day ${dayOffset}: ${targetDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  // 定义统一的操作间隔，确保每步操作之间至少有2秒的缓冲
  const actionDelay = 2000;

  // --- 登录流程 ---
  console.log(`[Day ${dayOffset}] 正在导航到登录页面...`);
  await page.goto("https://jwxt.neuq.edu.cn/");
  await page.waitForTimeout(actionDelay);

  const usernameInput = page.locator("#username");
  await usernameInput.waitFor({ state: "visible", timeout: 100000 });
  console.log(`[Day ${dayOffset}] 登录页面已加载。正在填写用户名...`);


  /* 若本地测试Playwright，从这里开始的部分需要被替换，详见README */
  const username = process.env.YOUR_NEUQ_USERNAME;
  if (!username) {
    throw new Error("环境变量 YOUR_NEUQ_USERNAME 未设置！请在 GitHub Secrets 中配置。");
  }
  await usernameInput.fill(username);
  await page.waitForTimeout(actionDelay);

  const passwordInput = page.locator("#password");
  console.log(`[Day ${dayOffset}] 正在填写密码...`);

  const password = process.env.YOUR_NEUQ_PASSWORD;
  if (!password) {
    throw new Error("环境变量 YOUR_NEUQ_PASSWORD 未设置！请在 GitHub Secrets 中配置。");
  }
  await passwordInput.fill(password); // 使用环境变量中的值
  await page.waitForTimeout(actionDelay);
  /* 若本地测试Playwright，到这里结束的部分需要被替换，详见README */

  
  
  const loginButton = page.locator('button.submitBtn[type="submit"]');
  console.log(`[Day ${dayOffset}] 正在点击登录按钮...`);
  await loginButton.click();
  await page.waitForTimeout(actionDelay);

  // --- 导航到空闲教室查询页面 ---
  const freeClassroomURL = "https://jwxt.neuq.edu.cn/eams/classroom/apply/free.action";
  console.log(`[Day ${dayOffset}] 正在导航到空闲教室查询页面...`);
  await page.goto(freeClassroomURL);
  await page.waitForTimeout(actionDelay);

  const queryForm = page.locator("#actionForm");
  await queryForm.waitFor({ state: "visible", timeout: 30000 });
  console.log(`[Day ${dayOffset}] 空闲教室查询页面已加载。`);
  await page.waitForTimeout(actionDelay); // <--- 加载后额外等待

  // 定义要查询的时间段
  const timeSlots = [
    { begin: "1", end: "2", fileSuffix: "1-2" },
    { begin: "3", end: "4", fileSuffix: "3-4" },
    { begin: "5", end: "6", fileSuffix: "5-6" },
    { begin: "7", end: "8", fileSuffix: "7-8" },
    { begin: "1", end: "8", fileSuffix: "1-8" },
    { begin: "9", end: "10", fileSuffix: "9-10" },
    { begin: "11", end: "12", fileSuffix: "11-12" },
  ];

  // 辅助函数：在WDatePicker中选择“今天”
  async function selectTodayInDatePicker(dateInputElementSelector: string, inputFieldName: string) {
    console.log(`[Day ${dayOffset}] 正在点击 ${inputFieldName} 输入框...`);
    await page.locator(dateInputElementSelector).click();
    await page.waitForTimeout(actionDelay);

    let datePickerFrame = page.frameLocator("iframe#_my97DP");
    let isFrameVisible = await datePickerFrame.locator("body").isVisible({ timeout: 5000 });

    if (!isFrameVisible) {
      console.log(`[Day ${dayOffset}] iframe#_my97DP 未找到，尝试备用选择器...`);
      datePickerFrame = page.frameLocator('iframe[src*="My97DatePicker.htm"]');
      isFrameVisible = await datePickerFrame.locator("body").isVisible({ timeout: 5000 });
    }

    if (!isFrameVisible) {
      console.error(`[Day ${dayOffset}] WDatePicker 的 iframe 未找到。`);
      return false;
    }

    const todayButton = datePickerFrame.locator('input[type="button"][value="Today"]');
    if (await todayButton.isVisible({ timeout: 10000 })) {
      await todayButton.click();
      await page.waitForTimeout(actionDelay);
      console.log(`[Day ${dayOffset}] 已为 ${inputFieldName} 选择 "Today"。`);
      await page.waitForFunction(
        (selector) => (document.querySelector(selector as string) as HTMLInputElement)?.value !== "",
        dateInputElementSelector,
        { timeout: 10000 }
      );
      const selectedDate = await page.locator(dateInputElementSelector).inputValue();
      console.log(`[Day ${dayOffset}] [读取主输入框] ${inputFieldName} 的值已更新为: ${selectedDate}`);
      return true;
    } else {
      console.error(`[Day ${dayOffset}] 在 WDatePicker 中未找到 "Today" 按钮。`);
      return false;
    }
  }

  // --- 设置查询日期 ---
  console.log(`[Day ${dayOffset}] 正在设置查询日期...`);
  const dateBeginSuccess = await selectTodayInDatePicker("#dateBegin", "起始日期");
  if (!dateBeginSuccess) {
    console.error(`[Day ${dayOffset}] 设置 '起始日期' 失败。跳过此日。`);
    await context.close();
    return;
  }
  await page.waitForTimeout(actionDelay);

  const dateEndSuccess = await selectTodayInDatePicker("#dateEnd", "结束日期");
  if (!dateEndSuccess) {
    console.error(`[Day ${dayOffset}] 设置 '结束日期' 失败。跳过此日。`);
    await context.close();
    return;
  }
  await page.waitForTimeout(actionDelay);

  // --- 遍历时间段并抓取数据 ---
  for (const slot of timeSlots) {
    console.log(`\n[Day ${dayOffset}] --- 正在处理时间段 ${slot.fileSuffix} ---`);
    const timeBeginInput = page.locator('input[name="timeBegin"]');
    const timeEndInput = page.locator('input[name="timeEnd"]');
    await timeBeginInput.fill(slot.begin);
    await page.waitForTimeout(actionDelay);
    await timeEndInput.fill(slot.end);
    await page.waitForTimeout(actionDelay);

    const queryButton = page.locator('input[type="button"][value="查询"]');
    console.log(`[Day ${dayOffset}] 正在点击 "查询" 按钮...`);
    await queryButton.click();
    await page.waitForTimeout(actionDelay);

    // 设置每页显示1000条
    try {
      const changePageSizeLink = page.locator("#freeRoomList").locator('[title="点击改变每页数据量"]').first();
      await changePageSizeLink.waitFor({ state: "visible", timeout: 15000 });
      await changePageSizeLink.click();
      await page.waitForTimeout(actionDelay);

      const pageSizeSelect = page.locator("#freeRoomList").locator('select.pgbar-selbox[title="每页数据量"]').first();
      await pageSizeSelect.waitFor({ state: "visible", timeout: 10000 });
      await pageSizeSelect.selectOption({ value: "1000" });
      await page.waitForTimeout(actionDelay);

      const goButton = page.locator("#freeRoomList").locator('.pgbar-go[name="gogo"]').first();
      await goButton.waitFor({ state: "visible", timeout: 10000 });
      await goButton.click();
      await page.waitForTimeout(actionDelay);

      console.log(`[Day ${dayOffset}] 已设置每页1000条，等待数据重载...`);
      await page.waitForFunction(
        (selector) => {
          const element = document.querySelector(selector as string);
          return element && element.innerHTML.trim() !== "" && element.innerHTML.trim() !== "...";
        },
        "#freeRoomList",
        { timeout: 30000 }
      );
    } catch (error) {
      console.error(`[Day ${dayOffset}] 为时间段 ${slot.fileSuffix} 设置分页失败。跳过此时间段。`, error);
      continue;
    }

    await page.waitForTimeout(actionDelay);

    // --- 解析并保存结果 ---
    const resultsDiv = page.locator("#freeRoomList");
    const tableElement = resultsDiv.locator("table").first();
    const jsonData: Array<Record<string, string>> = [];

    if (await tableElement.isVisible({ timeout: 15000 })) {
      console.log(`[Day ${dayOffset}] 在结果中找到表格，正在解析数据...`);
      const headerElements = await tableElement.locator("thead tr th").all();
      const headers = await Promise.all(headerElements.map(async (h) => ((await h.textContent()) || "").trim()));
      const rows = await tableElement.locator("tbody tr").all();

      for (const row of rows) {
        const cells = await row.locator("td").all();
        const rowData: Record<string, string> = {};
        for (let i = 0; i < cells.length; i++) {
          const cellText = ((await cells[i].textContent()) || "").trim();
          const headerName = headers[i] || `column${i + 1}`;
          rowData[headerName] = cellText;
        }
        if (Object.keys(rowData).length > 0) {
          jsonData.push(rowData);
        }
      }
    } else {
      console.warn(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix}: 未找到结果表格。`);
    }

    if (jsonData.length > 0) {
      const outputFileName = `classroom_results_${slot.fileSuffix}.json`;
      const outputDirectory = `output-day-${dayOffset}`;
      const fullOutputDirectoryPath = path.join(__dirname, "..", outputDirectory);

      if (!fs.existsSync(fullOutputDirectoryPath)) {
        fs.mkdirSync(fullOutputDirectoryPath, { recursive: true });
        console.log(`[Day ${dayOffset}] 输出目录 ${fullOutputDirectoryPath} 已创建。`);
      }

      const outputFilePath = path.join(fullOutputDirectoryPath, outputFileName);
      fs.writeFileSync(outputFilePath, JSON.stringify(jsonData, null, 2));
      console.log(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix} 的结果已保存到 ${outputFilePath}`);
    } else {
      console.log(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix}: 未解析到数据，不生成文件。`);
    }

    await page.waitForTimeout(actionDelay);
  }

  console.log(`\n[Day ${dayOffset}] 当天数据抓取完毕，正在关闭浏览器会话...`);
  await context.close();
}


// 使用循环动态生成多个独立的测试用例，以便Playwright可以并行执行它们
const totalDaysToQuery = 7;

for (let dayOffset = 0; dayOffset < totalDaysToQuery; dayOffset++) {
  test(`查询 Day ${dayOffset} 的空闲教室`, async ({ browser }) => {
    // 增加每个测试的超时时间，以适应增加的固定延迟
    test.setTimeout(600000); // 每个测试用例超时10分钟

    console.log(`\n====================================================`);
    console.log(`开始执行 Day ${dayOffset} (今天 + ${dayOffset} 天) 的数据抓取任务`);
    console.log(`====================================================`);
    
    try {
      await fetchDataForDay(dayOffset, browser);
      console.log(`\n====================================================`);
      console.log(`Day ${dayOffset} 的数据抓取任务成功完成`);
      console.log(`====================================================`);
    } catch (error) {
      console.error(`\n!!!!!! Day ${dayOffset} 数据抓取任务发生严重错误 !!!!!!`);
      console.error(error);
      throw error; 
    }
  });
}
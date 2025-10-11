import { test, expect, Browser } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test.use({
  timezoneId: 'Asia/Shanghai',
});

/**
 * 封装了为特定某一天抓取所有空闲教室数据的完整逻辑。
 * @param dayOffset - 日期偏移量。0代表今天, 1代表明天, 以此类推。
 * @param browser - 由 Playwright test runner 提供的浏览器实例。
 */
async function fetchDataForDay(dayOffset: number, browser: Browser) {
  // 1. 创建一个全新的、隔离的浏览器上下文
  const context = await browser.newContext();
  const page = await context.newPage();

  // 2. 设置当前页面的虚拟时间
  const baseDate = new Date();
  const targetDate = new Date(baseDate);
  targetDate.setDate(baseDate.getDate() + dayOffset);
  await page.clock.install({ time: targetDate });
  console.log(`已将浏览器虚拟时间设置为 Day ${dayOffset}: ${targetDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  const operationDelay = 3000;
  const interactionDelay = 1500;

  // --- 登录流程 ---
  console.log(`[Day ${dayOffset}] 正在导航到登录页面...`);
  await page.goto("https://jwxt.neuq.edu.cn/");
  await page.waitForTimeout(operationDelay);

  const usernameInput = page.locator("#username");
  await usernameInput.waitFor({ state: "visible", timeout: 150000 });
  console.log(`[Day ${dayOffset}] 登录页面已加载。正在填写用户名...`);


  /* 若本地测试Playwright，从这里开始的部分需要被替换，详见README */
  const username = process.env.YOUR_NEUQ_USERNAME;
  if (!username) {
    throw new Error(
      "环境变量 YOUR_NEUQ_USERNAME 未设置！"
    );
  }
  await usernameInput.fill(username); // 使用环境变量中的值
  await page.waitForTimeout(interactionDelay);

  const passwordInput = page.locator("#password");
  console.log(`[Day ${dayOffset}] 正在填写密码...`);

  const password = process.env.YOUR_NEUQ_PASSWORD;
  if (!password) {
    throw new Error(
      "环境变量 YOUR_NEUQ_PASSWORD 未设置！"
    );
  }
  await passwordInput.fill(password); // 使用环境变量中的值
  await page.waitForTimeout(interactionDelay);
  /* 若本地测试Playwright，到这里结束的部分需要被替换，详见README */



  const loginButton = page.locator('button.submitBtn[type="submit"]');
  console.log(`[Day ${dayOffset}] 正在点击登录按钮...`);
  await loginButton.click();
  await page.waitForTimeout(operationDelay);

  // --- 导航到空闲教室查询页面 ---
  const freeClassroomURL = "https://jwxt.neuq.edu.cn/eams/classroom/apply/free.action";
  console.log(`[Day ${dayOffset}] 正在导航到空闲教室查询页面...`);
  await page.goto(freeClassroomURL);

  const queryForm = page.locator("#actionForm");
  await queryForm.waitFor({ state: "visible", timeout: 30000 });
  console.log(`[Day ${dayOffset}] 空闲教室查询页面已加载。`);
  await page.waitForTimeout(operationDelay);

  const timeSlots = [
    { begin: "1", end: "2", fileSuffix: "1-2" },
    { begin: "3", end: "4", fileSuffix: "3-4" },
    { begin: "5", end: "6", fileSuffix: "5-6" },
    { begin: "7", end: "8", fileSuffix: "7-8" },
    { begin: "1", end: "8", fileSuffix: "1-8" },
    { begin: "9", end: "10", fileSuffix: "9-10" },
    { begin: "11", end: "12", fileSuffix: "11-12" },
  ];

  async function selectTodayInDatePicker(dateInputElementSelector: string, inputFieldName: string) {
    console.log(`[Day ${dayOffset}] 正在点击 ${inputFieldName} 输入框...`);
    await page.locator(dateInputElementSelector).click();
    await page.waitForTimeout(interactionDelay);

    let datePickerFrame = page.frameLocator('iframe[src*="My97DatePicker.htm"]');
    let isFrameVisible = await datePickerFrame.locator("body").isVisible({ timeout: 15000 });

    if (!isFrameVisible) {
      // 这是一个致命错误，直接抛出异常
      throw new Error(`[Day ${dayOffset}] My97DatePicker 的 iframe 未找到或不可见。`);
    }

    const todayButton = datePickerFrame.locator('input[type="button"][value="Today"]');
    if (await todayButton.isVisible({ timeout: 15000 })) {
      await todayButton.click();
      console.log(`[Day ${dayOffset}] 已为 ${inputFieldName} 选择 "Today"。`);
      await page.waitForFunction(
        (selector) => (document.querySelector(selector as string) as HTMLInputElement)?.value !== "",
        dateInputElementSelector,
        { timeout: 15000 }
      );
      const selectedDate = await page.locator(dateInputElementSelector).inputValue();
      console.log(`[Day ${dayOffset}] [读取主输入框] ${inputFieldName} 的值已更新为: ${selectedDate}`);
      return true;
    } else {
      // 这也是一个致命错误
      throw new Error(`[Day ${dayOffset}] 在 WDatePicker 中未找到 "Today" 按钮。`);
    }
  }

  // --- 设置查询日期 ---
  console.log(`[Day ${dayOffset}] 正在设置查询日期...`);
  await selectTodayInDatePicker("#dateBegin", "起始日期");
  await page.waitForTimeout(interactionDelay);
  await selectTodayInDatePicker("#dateEnd", "结束日期");
  await page.waitForTimeout(operationDelay);

  // --- 遍历时间段并抓取数据 ---
  for (const slot of timeSlots) {
    console.log(`\n[Day ${dayOffset}] --- 正在处理时间段 ${slot.fileSuffix} ---`);
    await page.locator('input[name="timeBegin"]').fill(slot.begin);
    await page.locator('input[name="timeEnd"]').fill(slot.end);
    await page.waitForTimeout(interactionDelay);

    await page.locator('input[type="button"][value="查询"]').click();
    console.log(`[Day ${dayOffset}] 已点击 "查询" 按钮...`);
    await page.waitForTimeout(operationDelay);

    try {
      await page.locator("#freeRoomList").locator('[title="点击改变每页数据量"]').first().click({ timeout: 30000 });
      await page.locator("#freeRoomList").locator('select.pgbar-selbox[title="每页数据量"]').first().selectOption({ value: "1000" });
      await page.locator("#freeRoomList").locator('.pgbar-go[name="gogo"]').first().click();

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
      // 如果连设置分页都失败，说明页面可能有问题，这是一个致命错误
      console.error(`[Day ${dayOffset}] 为时间段 ${slot.fileSuffix} 设置分页时发生致命错误。`);
      await page.screenshot({ path: `error_day_${dayOffset}_slot_${slot.fileSuffix}_pagination.png`, fullPage: true });
      throw error; // 抛出错误，让外层捕获并终止
    }

    await page.waitForTimeout(operationDelay);

    // --- 解析并保存结果 ---
    const tableElement = page.locator("#freeRoomList").locator("table").first();
    if (!await tableElement.isVisible({ timeout: 15000 })) {
      console.warn(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix}: 未找到结果表格。`);
      continue; // 如果只是某个时间段没数据，可以继续下一个时间段
    }

    console.log(`[Day ${dayOffset}] 正在解析表格数据...`);
    const jsonData: Array<Record<string, string>> = await tableElement.evaluate((table) => {
      const data: Array<Record<string, string>> = [];
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const rowData: Record<string, string> = {};
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
          const headerName = headers[index] || `column${index + 1}`;
          rowData[headerName] = cell.innerText.trim();
        });
        if (Object.keys(rowData).length > 0) {
          data.push(rowData);
        }
      });
      return data;
    });

    if (jsonData.length > 0) {
      const outputFileName = `classroom_results_${slot.fileSuffix}.json`;
      const outputDirectory = `output-day-${dayOffset}`;
      const fullOutputDirectoryPath = path.join(__dirname, "..", outputDirectory);

      if (!fs.existsSync(fullOutputDirectoryPath)) {
        fs.mkdirSync(fullOutputDirectoryPath, { recursive: true });
      }

      const outputFilePath = path.join(fullOutputDirectoryPath, outputFileName);
      fs.writeFileSync(outputFilePath, JSON.stringify(jsonData, null, 2));
      console.log(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix} 的结果已保存到 ${outputFilePath}`);
    } else {
      console.log(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix}: 未解析到数据行。`);
    }

    await page.waitForTimeout(operationDelay);
  }

  console.log(`\n[Day ${dayOffset}] 当天数据抓取完毕，正在关闭浏览器会话...`);
  await context.close();
}

// 主测试函数，负责编排为期7天的抓取任务
test("查询未来7天空闲教室", async ({ browser }) => {
  test.setTimeout(3600000); // 1小时总超时

  const totalDaysToQuery = 7;

  for (let dayOffset = 0; dayOffset < totalDaysToQuery; dayOffset++) {
    console.log(`\n====================================================`);
    console.log(`开始获取 第 ${dayOffset} 天 (今天 + ${dayOffset} 天) 的数据`);
    console.log(`====================================================`);
    try {
      await fetchDataForDay(dayOffset, browser);
    } catch (error) {
      // ==================== 逻辑修改: 发生致命错误时终止脚本 ====================
      console.error(`\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
      console.error(`           FATAL ERROR on Day ${dayOffset} - ABORTING CI/CD RUN`);
      console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
      console.error(`\n错误详情 (Error Details):\n`, error);

      // 使用非零退出码终止整个进程，这将使CI/CD作业失败
      process.exit(1);
      // =======================================================================
    }
  }

  console.log("\n所有日期的查询任务已全部执行完毕。");
});
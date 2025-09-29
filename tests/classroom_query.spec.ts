import { test, expect, Browser, Page } from "@playwright/test"; // 增加 Page 类型
import * as fs from "fs";
import * as path from "path";

// 在所有测试开始前，配置测试上下文的默认时区为北京时间。
test.use({
  timezoneId: 'Asia/Shanghai',
});


// --- 辅助函数：可重试操作的包装器 ---
/**
 * 尝试执行一个操作，如果失败则刷新页面并重试一次。
 * @param page Playwright Page 对象
 * @param operationToRetry 需要执行的核心操作函数
 * @param cleanupAndSetupOnRetry 失败后，在重试前需要执行的清理和重新设置函数
 * @param attempt 当前尝试次数
 */
async function retryableOperation(
  page: Page,
  operationToRetry: () => Promise<void>,
  cleanupAndSetupOnRetry: () => Promise<void>,
  attempt = 1
): Promise<void> {
  try {
    await operationToRetry();
  } catch (error) {
    if (attempt < 3) {
      console.warn(`操作失败 (尝试 ${attempt}/2)。正在刷新页面并重试...`);
      console.warn(`错误详情: ${error}`);
      
      // 保存截图以供调试
      await page.screenshot({ path: `error_attempt_${attempt}_${Date.now()}.png`, fullPage: true });

      // 刷新页面
      await page.reload({ waitUntil: 'domcontentloaded' });
      
      // 等待页面稳定并执行重新设置操作
      await page.waitForTimeout(3000); // 刷新后等待一下
      await cleanupAndSetupOnRetry();

      // 递归调用进行重试
      await retryableOperation(page, operationToRetry, cleanupAndSetupOnRetry, attempt + 1);
    } else {
      console.error(`操作在连续 ${attempt-1} 次尝试后仍然失败。任务终止。`);
      await page.screenshot({ path: `error_final_failure_${Date.now()}.png`, fullPage: true });
      throw error; // 抛出最终错误
    }
  }
}


/**
 * 封装了为特定某一天抓取所有空闲教室数据的完整逻辑。
 * @param dayOffset - 日期偏移量。
 * @param browser - Playwright 浏览器实例。
 */
async function fetchDataForDay(dayOffset: number, browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseDate = new Date();
  const targetDate = new Date(baseDate);
  targetDate.setDate(baseDate.getDate() + dayOffset);
  await page.clock.install({ time: targetDate });
  console.log(`已将浏览器虚拟时间设置为 Day ${dayOffset}: ${targetDate.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  const actionDelay = 2000;

  // --- 登录并导航到查询页面 (只执行一次) ---
  console.log(`[Day ${dayOffset}] 正在登录并导航到查询页面...`);
  await page.goto("https://jwxt.neuq.edu.cn/");
  await page.waitForTimeout(actionDelay);
  const usernameInput = page.locator("#username");
  await usernameInput.waitFor({ state: "visible", timeout: 100000 });
  const username = process.env.YOUR_NEUQ_USERNAME;
  if (!username) throw new Error("环境变量 YOUR_NEUQ_USERNAME 未设置！");
  await usernameInput.fill(username);
  await page.waitForTimeout(actionDelay);
  const passwordInput = page.locator("#password");
  const password = process.env.YOUR_NEUQ_PASSWORD;
  if (!password) throw new Error("环境变量 YOUR_NEUQ_PASSWORD 未设置！");
  await passwordInput.fill(password);
  await page.waitForTimeout(actionDelay);
  await page.locator('button.submitBtn[type="submit"]').click();
  await page.waitForTimeout(actionDelay);
  const freeClassroomURL = "https://jwxt.neuq.edu.cn/eams/classroom/apply/free.action";
  await page.goto(freeClassroomURL);
  await page.waitForTimeout(actionDelay);
  await page.locator("#actionForm").waitFor({ state: "visible", timeout: 30000 });
  console.log(`[Day ${dayOffset}] 空闲教室查询页面已加载。`);
  await page.waitForTimeout(actionDelay);

  // --- 辅助函数和共享数据 ---
  const timeSlots = [
    { begin: "1", end: "2", fileSuffix: "1-2" }, { begin: "3", end: "4", fileSuffix: "3-4" },
    { begin: "5", end: "6", fileSuffix: "5-6" }, { begin: "7", end: "8", fileSuffix: "7-8" },
    { begin: "1", end: "8", fileSuffix: "1-8" }, { begin: "9", end: "10", fileSuffix: "9-10" },
    { begin: "11", end: "12", fileSuffix: "11-12" },
  ];

  async function selectTodayInDatePicker(dateInputElementSelector: string, inputFieldName: string) {
    await page.locator(dateInputElementSelector).click();
    await page.waitForTimeout(actionDelay);
    let datePickerFrame = page.frameLocator('iframe[src*="My97DatePicker.htm"]');
    if (!await datePickerFrame.locator("body").isVisible({ timeout: 5000 })) {
        datePickerFrame = page.frameLocator("iframe#_my97DP");
    }
    await datePickerFrame.locator('input[type="button"][value="Today"]').click();
    await page.waitForTimeout(actionDelay);
  }

  // --- 重试前的重新设置函数 ---
  const setupForQuery = async () => {
    console.log(`[Day ${dayOffset}] (重试) 正在重新设置查询表单...`);
    // 确保在查询页面
    if (!page.url().includes(freeClassroomURL)) {
        await page.goto(freeClassroomURL, { waitUntil: 'domcontentloaded' });
    }
    await page.locator("#actionForm").waitFor({ state: "visible", timeout: 30000 });
    // 重新设置日期
    await selectTodayInDatePicker("#dateBegin", "起始日期");
    await page.waitForTimeout(actionDelay);
    await selectTodayInDatePicker("#dateEnd", "结束日期");
    await page.waitForTimeout(actionDelay);
    console.log(`[Day ${dayOffset}] (重试) 查询表单已重新设置。`);
  };

  // --- 首次设置日期 ---
  await setupForQuery();
  
  // --- 遍历时间段并抓取数据 ---
  for (const slot of timeSlots) {
    // 封装单次查询-保存操作
    const queryAndSaveSlot = async () => {
      console.log(`\n[Day ${dayOffset}] --- 正在处理时间段 ${slot.fileSuffix} ---`);
      
      // 填充时间
      await page.locator('input[name="timeBegin"]').fill(slot.begin);
      await page.locator('input[name="timeEnd"]').fill(slot.end);
      await page.waitForTimeout(actionDelay);

      // 点击查询
      await page.locator('input[type="button"][value="查询"]').click();
      await page.waitForTimeout(actionDelay);

      // 设置分页 (这是最容易出错的地方)
      const changePageSizeLink = page.locator("#freeRoomList").locator('[title="点击改变每页数据量"]').first();
      await changePageSizeLink.waitFor({ state: "visible", timeout: 20000 }); // 增加超时
      await changePageSizeLink.click();
      await page.waitForTimeout(actionDelay);

      const pageSizeSelect = page.locator("#freeRoomList").locator('select.pgbar-selbox[title="每页数据量"]').first();
      await pageSizeSelect.selectOption({ value: "1000" });
      await page.waitForTimeout(actionDelay);

      await page.locator("#freeRoomList").locator('.pgbar-go[name="gogo"]').first().click();
      
      console.log(`[Day ${dayOffset}] 等待数据重载...`);
      await page.waitForFunction(
        (selector) => {
          const element = document.querySelector(selector as string);
          return element && element.innerHTML.trim() !== "" && element.innerHTML.trim() !== "...";
        },
        "#freeRoomList",
        { timeout: 45000 } // 增加等待重载的超时
      );

      // 解析并保存结果
      const tableElement = page.locator("#freeRoomList").locator("table").first();
      if (await tableElement.isVisible({ timeout: 15000 })) {
        const jsonData: Array<Record<string, string>> = [];
        const headerElements = await tableElement.locator("thead tr th").all();
        const headers = await Promise.all(headerElements.map(async (h) => ((await h.textContent()) || "").trim()));
        const rows = await tableElement.locator("tbody tr").all();

        for (const row of rows) {
            const cells = await row.locator("td").all();
            const rowData: Record<string, string> = {};
            for (let i = 0; i < cells.length; i++) {
                rowData[headers[i] || `column${i + 1}`] = ((await cells[i].textContent()) || "").trim();
            }
            if (Object.keys(rowData).length > 0) jsonData.push(rowData);
        }

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
            console.log(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix}: 未解析到数据。`);
        }
      } else {
        console.warn(`[Day ${dayOffset}] 时间段 ${slot.fileSuffix}: 未找到结果表格。`);
      }
    };
    
    // 使用重试包装器执行操作
    await retryableOperation(page, queryAndSaveSlot, async () => {
        // 重试前的准备工作：重新设置日期和填写当前时间段
        await setupForQuery();
        await page.locator('input[name="timeBegin"]').fill(slot.begin);
        await page.locator('input[name="timeEnd"]').fill(slot.end);
    });
  }

  console.log(`\n[Day ${dayOffset}] 当天数据抓取完毕，正在关闭浏览器会话...`);
  await context.close();
}

// --- 主测试循环 (保持不变) ---
const totalDaysToQuery = 7;
for (let dayOffset = 0; dayOffset < totalDaysToQuery; dayOffset++) {
  test(`查询 Day ${dayOffset} 的空闲教室`, async ({ browser }) => {
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
import { test, expect } from "@playwright/test"; // 导入 Playwright 测试框架的核心模块 test 和断言模块 expect
import * as fs from "fs"; // 引入Node.js内置的文件系统模块，用于后续将查询结果写入JSON文件
import * as path from "path"; // 引入Node.js内置的路径处理模块，用于安全地构建文件路径

// 定义一个名为 '登录并按多时间段查询空闲教室测试' 的测试用例
// async ({ page }) 表示这是一个异步测试函数，它接收一个 Playwright 的 Page 对象作为参数，用于与浏览器页面交互
test("登录并按多时间段查询空闲教室测试", async ({ page }) => {
  // 为此测试用例设置总超时时间（毫秒）。
  // 由于涉及多次网络请求和页面交互，需要比默认值更长的时间以避免因超时而失败。
  // [可调参数]: 600000 - 如果测试仍然超时，可以根据实际网络和服务器响应情况调整此值。
  test.setTimeout(600000);

  // 定义主要操作之间的固定延迟时间（毫秒）。
  // 用于确保页面有足够的时间加载或响应上一步操作。
  // [可调参数]: 1500 - 根据网站响应速度调整，太短可能导致元素未加载，太长会增加测试总时长。
  const operationDelay = 1500;
  // 定义点击、填充等交互操作后的短延迟时间（毫秒）。
  // [可调参数]: 750 - 类似operationDelay，用于更细粒度的等待。
  const interactionDelay = 750;

  // --- 1. 登录流程 ---
  console.log("正在导航到登录页面..."); // 在控制台输出当前操作的描述，便于追踪测试进度。
  // 使用 page.goto() 方法导航到指定的URL。
  // [可调参数]: 'https://jwxt.neuq.edu.cn/' - 如果目标网站的登录入口URL发生变化，需要更新此字符串。
  await page.goto("https://jwxt.neuq.edu.cn/");
  // 在导航后，等待一段固定的时间，以确保页面资源（如JavaScript）有时间执行和渲染。
  await page.waitForTimeout(operationDelay);

  // 定位用户名输入框。使用ID选择器 '#username'。
  // [可调参数]: '#username' - 如果用户名输入框的HTML `id` 属性改变，此选择器需要更新。
  const usernameInput = page.locator("#username");
  // 等待定位到的用户名输入框在页面上变为可见状态，设置最长等待时间。
  // [可调参数]: timeout: 100000 - 如果页面加载非常缓慢，导致输入框长时间才出现，可以增加此超时值。
  await usernameInput.waitFor({ state: "visible", timeout: 100000 });
  console.log("登录页面已加载。正在填写用户名...");
  
  /* 若本地测试Playwright，从这里开始的部分需要被替换，详见README */
  // [重要/可调参数]: 'YOUR_NEUQ_USERNAME' - 必须替换为实际的、有效的测试账号。
  // 从环境变量中获取账号
  const username = process.env.YOUR_NEUQ_USERNAME;
  if (!username) {
    throw new Error(
      "环境变量 YOUR_NEUQ_USERNAME 未设置！请在 GitHub Secrets 中配置。"
    );
  }
  await usernameInput.fill(username); // 使用环境变量中的值
  await page.waitForTimeout(interactionDelay);

  const passwordInput = page.locator("#password");
  console.log("正在填写密码...");
  // [重要/可调参数]: 'YOUR_NEUQ_PASSWORD' - 必须替换为实际的、有效的测试密码。
  // 从环境变量中获取密码
  const password = process.env.YOUR_NEUQ_PASSWORD;
  if (!password) {
    throw new Error(
      "环境变量 YOUR_NEUQ_PASSWORD 未设置！请在 GitHub Secrets 中配置。"
    );
  }
  await passwordInput.fill(password); // 使用环境变量中的值
  await page.waitForTimeout(interactionDelay);
  /* 若本地测试Playwright，到这里结束的部分需要被替换，详见README */

  // 定位登录按钮。使用复合CSS选择器，匹配 `<button>` 元素，
  // 且其 `class` 属性包含 'submitBtn'，`type` 属性为 'submit'。
  // [可调参数]: 'button.submitBtn[type="submit"]' - 如果登录按钮的HTML标签、类名或属性发生变化，此选择器需要更新。
  const loginButton = page.locator('button.submitBtn[type="submit"]');
  console.log("正在点击登录按钮...");
  // 使用 locator.click() 方法点击登录按钮。
  await loginButton.click();

  // 定义登录成功后期望跳转到的主页URL。
  // [可调参数]: 'https://jwxt.neuq.edu.cn/eams/homeExt.action' - 如果登录成功后的目标URL改变，需要更新此字符串。
  const homePageURL = "https://jwxt.neuq.edu.cn/eams/homeExt.action";
  // 登录点击后，等待一段时间，让服务器处理登录请求并完成页面跳转和主页内容的加载。
  // 建议使用更健壮的等待方式，如 page.waitForURL() 或等待页面特定元素。
  await page.waitForTimeout(operationDelay); // 等待主页内容进一步加载

  // --- 2. 导航到空闲教室查询页面 ---
  // 定义空闲教室查询页面的URL。
  // [可调参数]: 'https://jwxt.neuq.edu.cn/eams/classroom/apply/free.action' - 如果此页面的URL改变，需要更新。
  const freeClassroomURL =
    "https://jwxt.neuq.edu.cn/eams/classroom/apply/free.action";
  console.log(`正在导航到空闲教室查询页面: ${freeClassroomURL}`);
  // 导航到空闲教室查询页面。
  await page.goto(freeClassroomURL);

  // 定位空闲教室查询页面的主查询表单容器。使用ID选择器 '#actionForm'。
  // [可调参数]: '#actionForm' - 如果查询表单容器的HTML `id` 属性改变，此选择器需要更新。
  const queryForm = page.locator("#actionForm");
  // 等待查询表单在页面上变为可见状态，最长等待30秒。
  // [可调参数]: timeout: 30000 - 如果查询页面加载缓慢，可增加此超时值。
  await queryForm.waitFor({ state: "visible", timeout: 30000 });
  console.log("空闲教室查询页面已加载。");
  // 等待一段固定的时间，让页面元素稳定。
  await page.waitForTimeout(operationDelay);

  // --- 3. 定义要查询的时间段 ---
  // `timeSlots` 是一个对象数组，每个对象定义了一个要查询的时间段及其相关信息。
  // `begin`: 起始小节的数字字符串。
  // `end`: 结束小节的数字字符串。
  // `fileSuffix`: 用于构成输出JSON文件名的后缀，以区分不同时间段的结果。
  // [可调参数]: 可以修改此数组来增删或改变要查询的时间段组合。
  const timeSlots = [
    { begin: "1", end: "2", fileSuffix: "1-2" },
    { begin: "3", end: "4", fileSuffix: "3-4" },
    { begin: "5", end: "6", fileSuffix: "5-6" },
    { begin: "7", end: "8", fileSuffix: "7-8" },
    { begin: "1", end: "8", fileSuffix: "1-8" },
    { begin: "9", end: "10", fileSuffix: "9-10" },
    { begin: "11", end: "12", fileSuffix: "11-12" },
  ];

  // --- 4. 表单预设操作 (在循环查询所有时间段之前，执行一次的初始化步骤) ---

  // 异步辅助函数：用于在WDatePicker日期选择器中选择“今天”的日期。
  // 参数 `dateInputElementSelector`: 目标日期输入框的CSS选择器字符串 (例如 '#dateBegin')。
  // 参数 `inputFieldName`: 日期输入框的描述性名称 (例如 '起始日期 (dateBegin)')，主要用于日志输出。
  async function selectTodayInDatePicker(
    dateInputElementSelector: string,
    inputFieldName: string
  ) {
    console.log(
      `正在点击 ${inputFieldName} 输入框: ${dateInputElementSelector}`
    );
    // 点击日期输入框以触发WDatePicker日期选择器的显示。
    await page.locator(dateInputElementSelector).click();
    // 等待1秒，给予WDatePicker足够的时间弹出。
    await page.waitForTimeout(1000);

    // 尝试定位WDatePicker的iframe。
    let datePickerFrame = page.frameLocator("iframe#_my97DP");
    let isFrameVisible = await datePickerFrame
      .locator("body")
      .isVisible({ timeout: 5000 }); // 增加iframe检测超时

    // 如果主要ID的iframe未找到，尝试备用选择器。
    if (!isFrameVisible) {
      console.log(
        'iframe#_my97DP 未找到或不可见，尝试备用选择器 iframe[src*="My97DatePicker.htm"]'
      );
      datePickerFrame = page.frameLocator('iframe[src*="My97DatePicker.htm"]');
      isFrameVisible = await datePickerFrame
        .locator("body")
        .isVisible({ timeout: 5000 }); // 增加iframe检测超时
    }

    // 如果iframe仍未找到，则操作失败。
    if (!isFrameVisible) {
      console.error(
        `WDatePicker的iframe (${inputFieldName}) 未找到或不可见。无法选择日期。`
      );
      await page
        .locator(dateInputElementSelector)
        .click({ timeout: 500 })
        .catch(() => {}); // 尝试关闭
      return false;
    }

    // 在iframe内定位“Today”按钮。
    const todayButton = datePickerFrame.locator(
      'input[type="button"][value="Today"]'
    );
    // 等待按钮可见并点击。
    if (await todayButton.isVisible({ timeout: 10000 })) {
      // 增加按钮可见性超时
      await todayButton.click();
      console.log(`已为 ${inputFieldName} 选择 "Today"。`);
      // 等待日期值填充到输入框。
      await page.waitForFunction(
        (selector) =>
          (document.querySelector(selector as string) as HTMLInputElement)
            ?.value !== "",
        dateInputElementSelector,
        { timeout: 10000 } // 增加值填充等待超时
      );
      console.log(`${inputFieldName} 输入框已填充日期。`);
      return true;
    } else {
      // 如果按钮未找到。
      console.error(
        `在WDatePicker中未找到 "${inputFieldName}" 的 "Today" 按钮。`
      );
      const closeButton = datePickerFrame
        .locator(
          'input[value="清空"], input[value="Clear"], input[value="确定"], input[value="OK"]'
        )
        .first();
      if (await closeButton.isVisible({ timeout: 500 })) {
        await closeButton.click();
      }
      return false;
    }
  }

  // 步骤 4.1: 设置“教室使用日期” - 此操作在所有时间段查询之前仅执行一次。
  // 为“起始日期”选择“今天”。
  const dateBeginSuccess = await selectTodayInDatePicker(
    "#dateBegin",
    "起始日期 (dateBegin)"
  );
  if (!dateBeginSuccess) {
    console.error("设置 '起始日期' 失败。测试中止。");
    return;
  }
  await page.waitForTimeout(interactionDelay);

  // 为“结束日期”选择“今天”。
  const dateEndSuccess = await selectTodayInDatePicker(
    "#dateEnd",
    "结束日期 (dateEnd)"
  );
  if (!dateEndSuccess) {
    console.error("设置 '结束日期' 失败。测试中止。");
    return;
  }
  await page.waitForTimeout(operationDelay); // 日期设置完成后等待

  // --- 5. 遍历定义好的时间段，执行查询、调整分页并保存结果 ---
  // 循环遍历 `timeSlots` 数组中的每个时间段对象。
  for (const slot of timeSlots) {
    // 为当前时间段的完整操作（包括查询、分页、解析）创建一个计时器标签。
    const queryLabel = `QueryAndProcessForSlot_${slot.fileSuffix}`;
    console.time(queryLabel); // 开始计时

    console.log(`\n--- 正在处理时间段 ${slot.fileSuffix} ---`);

    // 步骤 5.1: 填写当前时间段的“教室使用小节”
    // 定位起始和结束小节的输入框。
    const timeBeginInput = page.locator('input[name="timeBegin"]');
    const timeEndInput = page.locator('input[name="timeEnd"]');

    console.log(`正在填写 "教室使用小节：" 从 ${slot.begin} 到 ${slot.end}...`);
    // 填充起始小节。
    await timeBeginInput.fill(slot.begin);
    await page.waitForTimeout(interactionDelay / 2);
    // 填充结束小节。
    await timeEndInput.fill(slot.end);
    await page.waitForTimeout(interactionDelay);

    // 步骤 5.2: 点击“查询”按钮以获取当前设置下的结果
    // 定位“查询”按钮。
    const queryButton = page.locator('input[type="button"][value="查询"]');
    console.log('正在点击 "查询" 按钮...');
    await queryButton.click(); // 提交查询

    // 等待查询结果区域初步加载，特别是确保分页栏元素出现，因为后续要操作它。
    // [可调参数]: '#freeRoomList .grid-bar' - 分页栏的CSS选择器。
    // 增加等待分页栏的超时时间。

    await page.waitForTimeout(operationDelay); // 等待页面稳定

    // 步骤 5.3: 为当前查询结果设置每页显示数量为1000
    console.log("正在为当前查询结果设置每页显示数量为1000...");
    // 定位并点击“点击改变每页数据量”的元素。使用 .first() 避免严格模式冲突。
    // [可调参数]: '[title="点击改变每页数据量"]' - 如果此元素的定位依据改变，需更新。
    const changePageSizeLink = page
      .locator("#freeRoomList")
      .locator('[title="点击改变每页数据量"]')
      .first();
    try {
      await changePageSizeLink.waitFor({ state: "visible", timeout: 15000 });
      await changePageSizeLink.click();
    } catch (error) {
      console.error(
        `为时间段 ${slot.fileSuffix} 点击“改变每页数据量”链接失败。跳过此时间段。`
      );
      await page.screenshot({
        path: `error_slot_${slot.fileSuffix}_pagesize_link.png`,
      });
      console.timeEnd(queryLabel);
      continue;
    }
    await page.waitForTimeout(interactionDelay); // 等待下拉菜单出现

    // 定位并选择每页显示数量的下拉框。
    // [可调参数]: 'select.pgbar-selbox[title="每页数据量"]' - 如果下拉框的定位依据改变，需更新。
    const pageSizeSelect = page
      .locator("#freeRoomList")
      .locator('select.pgbar-selbox[title="每页数据量"]')
      .first();
    try {
      await pageSizeSelect.waitFor({ state: "visible", timeout: 10000 });
      // 选择值为"1000"的选项。
      // [可调参数]: '1000' - 如果“每页1000”选项的实际`value`属性值不同，需更新。
      await pageSizeSelect.selectOption({ value: "1000" });
    } catch (error) {
      console.error(
        `为时间段 ${slot.fileSuffix} 选择每页1000条失败。跳过此时间段。`
      );
      await page.screenshot({
        path: `error_slot_${slot.fileSuffix}_pagesize_select.png`,
      });
      console.timeEnd(queryLabel);
      continue;
    }
    await page.waitForTimeout(interactionDelay);

    // 定位并点击应用分页设置的“Go”按钮。
    // [可调参数]: '.pgbar-go[name="gogo"]' - 如果此按钮的定位依据改变，需更新。
    const goButton = page
      .locator("#freeRoomList")
      .locator('.pgbar-go[name="gogo"]')
      .first();
    try {
      await goButton.waitFor({ state: "visible", timeout: 10000 });
      await goButton.click();
    } catch (error) {
      console.error(
        `为时间段 ${slot.fileSuffix} 点击分页“Go”按钮失败。跳过此时间段。`
      );
      await page.screenshot({
        path: `error_slot_${slot.fileSuffix}_pagesize_go.png`,
      });
      console.timeEnd(queryLabel);
      continue;
    }
    console.log("已设置每页显示1000条。等待数据按新分页设置重新加载...");
    // 等待数据因分页设置改变而重新加载。
    // 使用 `page.waitForFunction` 检查结果区域 `#freeRoomList` 的内容是否已更新。
    // [可调参数]: timeout: 25000 - 等待数据重新加载的超时时间。
    try {
      await page.waitForFunction(
        (selector) => {
          const element = document.querySelector(selector as string);
          return (
            element &&
            element.innerHTML.trim() !== "" &&
            element.innerHTML.trim() !== "..."
          );
        },
        "#freeRoomList",
        { timeout: 30000 } // 增加重新加载等待时间
      );
      console.log("数据已按新分页设置重新加载。");
    } catch (error) {
      console.error(
        `为时间段 ${slot.fileSuffix} 等待数据按新分页重新加载失败。跳过此时间段。`
      );
      await page.screenshot({
        path: `error_slot_${slot.fileSuffix}_reload_data.png`,
      });
      console.timeEnd(queryLabel);
      continue;
    }
    await page.waitForTimeout(operationDelay); // 等待页面完全稳定

    // 步骤 5.4: 解析并保存当前时间段的查询结果
    // 定位用于显示查询结果的`<div>`元素。
    const resultsDiv = page.locator("#freeRoomList");
    // 为等待结果最终确认加载的操作创建一个计时器标签。
    const waitForFinalResultsLabel = `WaitForFinalResults_${slot.fileSuffix}`;
    console.time(waitForFinalResultsLabel);
    try {
      // 再次确认结果区域已填充内容，准备解析。
      await page.waitForFunction(
        (selector) => {
          const element = document.querySelector(selector as string);
          return (
            element &&
            element.innerHTML.trim() !== "" &&
            element.innerHTML.trim() !== "..."
          );
        },
        "#freeRoomList",
        { timeout: 30000 } // 增加单个结果等待的超时时间
      );
      console.timeEnd(waitForFinalResultsLabel);
      console.log("查询结果已确认加载，准备解析。");
    } catch (e) {
      console.timeEnd(waitForFinalResultsLabel);
      console.error(`为时间段 ${slot.fileSuffix} 确认结果加载超时或发生错误。`);
      const currentHTML = await resultsDiv
        .innerHTML()
        .catch(() => "无法获取 #freeRoomList 的innerHTML");
      console.log(`#freeRoomList 的当前HTML内容: ${currentHTML}`);
      await page.screenshot({
        path: `error_slot_${slot.fileSuffix}_final_results.png`,
      });
      console.timeEnd(queryLabel);
      continue;
    }
    await page.waitForTimeout(operationDelay); // 等待内容稳定

    // --- JSON数据解析和文件写入逻辑 (与之前版本相同) ---
    // 定位结果表格。
    const tableElement = resultsDiv.locator("table").first();
    const jsonData: Array<Record<string, string>> = [];

    // 检查表格是否可见。
    if (await tableElement.isVisible({ timeout: 15000 })) {
      // 增加表格可见性检查超时
      console.log("在结果中找到表格。正在解析数据...");
      let headers: string[] = [];
      // 提取表头。
      const headerElements = await tableElement.locator("thead tr th").all();
      if (headerElements.length > 0) {
        headers = await Promise.all(
          headerElements.map(async (h) =>
            ((await h.textContent()) || "").trim()
          )
        );
      } else {
        console.log("未找到 <thead><th> 表头。将使用通用列名。");
      }

      // 提取数据行。
      const rows = await tableElement.locator("tbody tr").all();
      console.log(`在表格中找到 ${rows.length} 行数据。`);

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

      // 如果解析到数据，则写入JSON文件。
      if (jsonData.length > 0) {
        const outputFileName = `classroom_results_${slot.fileSuffix}.json`;
        const outputDirectory = "output"; // 输出目录名

        // 确保输出目录存在。
        if (!fs.existsSync(outputDirectory)) {
          try {
            fs.mkdirSync(outputDirectory, { recursive: true });
            console.log(`输出目录 ${outputDirectory} 已创建。`);
          } catch (mkdirError) {
            console.error(`创建输出目录 ${outputDirectory} 失败:`, mkdirError);
            console.timeEnd(queryLabel);
            continue; // 跳过写入
          }
        }
        // 构建完整输出路径。
        const outputFilePath = path.join(outputDirectory, outputFileName);
        try {
          // 写入JSON文件。
          fs.writeFileSync(outputFilePath, JSON.stringify(jsonData, null, 2));
          console.log(
            `\n--- 时间段 ${slot.fileSuffix} 的查询结果已保存到 ${outputFilePath} ---`
          );
        } catch (writeError) {
          console.error(`写入文件 ${outputFilePath} 失败:`, writeError);
        }
      } else {
        // 如果未解析到数据行。
        console.log(
          `时间段 ${slot.fileSuffix}: 未从表格中解析到数据行，或表格为空。`
        );
        const resultsHTMLContent = await resultsDiv.innerHTML();
        console.log(`#freeRoomList 的原始HTML内容 (供调试):`);
        console.log(resultsHTMLContent);
      }
    } else {
      // 如果结果区域未找到表格。
      console.log(
        `时间段 ${slot.fileSuffix}: 在 #freeRoomList 中未找到表格。转储原始文本内容:`
      );
      const resultsTextContent = await resultsDiv.textContent();
      console.log(resultsTextContent);
      await page.screenshot({
        path: `error_slot_${slot.fileSuffix}_no_table.png`,
      });
    }

    console.timeEnd(queryLabel); // 结束当前时间段操作的总计时
    await page.waitForTimeout(operationDelay); // 在开始下一个时间段的查询之前，等待。
  } // for循环结束

  console.log("\n所有时间段查询测试脚本执行完毕。");
});
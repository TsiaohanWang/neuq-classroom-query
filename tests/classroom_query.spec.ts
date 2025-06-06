import { test, expect } from '@playwright/test'; // 导入 Playwright 测试框架的核心模块 test 和断言模块 expect
import * as fs from 'fs'; // 引入Node.js内置的文件系统模块，用于后续将查询结果写入JSON文件
import * as path from 'path'; // 引入Node.js内置的路径处理模块，用于安全地构建文件路径

// 定义一个名为 '登录并按多时间段查询空闲教室测试' 的测试用例
// async ({ page }) 表示这是一个异步测试函数，它接收一个 Playwright 的 Page 对象作为参数，用于与浏览器页面交互
test('登录并按多时间段查询空闲教室测试', async ({ page }) => {
  // 为这个特定的测试用例设置更长的超时时间。默认超时通常是30秒。
  // 由于此测试包含多个查询操作，总耗时可能较长，因此增加超时至600000毫秒（10分钟）。
  // [可调参数]: 600000 - 如果测试因网络慢或操作复杂仍然超时，可以进一步增加此值。
  test.setTimeout(600000);

  // 定义操作间的通用固定延迟时间（毫秒）。用于在主要步骤之间添加等待，确保页面有足够时间响应或加载。
  // [可调参数]: 1500 - 如果目标网站响应很快，可以适当减少此值以加快测试速度；如果网站响应慢或有动画效果，可能需要增加。
  const operationDelay = 1500;
  // 定义交互操作（如点击输入框、填充文本）后的短延迟时间（毫秒）。
  // [可调参数]: 750 - 类似 operationDelay，根据网站响应速度调整。
  const interactionDelay = 750;

  // --- 1. 登录流程 ---
  console.log('正在导航到登录页面...'); // 控制台输出当前操作的描述
  // 导航到目标网站的登录页面URL。
  // [可调参数]: 'https://jwxt.neuq.edu.cn/' - 如果登录页面的URL发生变化，需要更新此字符串。
  await page.goto('https://jwxt.neuq.edu.cn/');
  // 等待一段固定的时间，让页面初步加载。
  await page.waitForTimeout(operationDelay);

  // 定位用户名输入框。使用ID选择器 '#username'。
  // [可调参数]: '#username' - 如果用户名输入框的HTML ID属性改变，此选择器需要更新。
  const usernameInput = page.locator('#username');
  // 等待用户名输入框在页面上变为可见状态，最长等待100秒。
  // [可调参数]: timeout: 100000 - 如果页面加载特别慢，导致输入框长时间不可见，可以增加此超时值。
  await usernameInput.waitFor({ state: 'visible', timeout: 100000 });
  console.log('登录页面已加载。正在填写用户名...');
  // 填充用户名。
  // [重要/可调参数]: 'YOUR_ACTUAL_USERNAME' - 这是实际的用户名，运行测试前务必替换为您自己的有效用户名。
  await usernameInput.fill('YOUR_ACTUAL_USERNAME');
  // 在填充操作后等待一小段时间。
  await page.waitForTimeout(interactionDelay);

  // 定位密码输入框。使用ID选择器 '#password'。
  // [可调参数]: '#password' - 如果密码输入框的HTML ID属性改变，此选择器需要更新。
  const passwordInput = page.locator('#password');
  console.log('正在填写密码...');
  // 填充密码。
  // [重要/可调参数]: 'YOUR_ACTUAL_PASSWORD' - 这是实际的密码，运行测试前务必替换为您自己的有效密码。
  await passwordInput.fill('YOUR_ACTUAL_PASSWORD');
  // 在填充操作后等待一小段时间。
  await page.waitForTimeout(interactionDelay);

  // 定位登录按钮。使用复合选择器，匹配 <button> 元素，且其 class 包含 'submitBtn'，type 属性为 'submit'。
  // [可调参数]: 'button.submitBtn[type="submit"]' - 如果登录按钮的HTML标签、类名或属性发生变化，此选择器需要更新。
  const loginButton = page.locator('button.submitBtn[type="submit"]');
  console.log('正在点击登录按钮...');
  // 点击登录按钮。
  await loginButton.click();

  // 定义登录成功后期望跳转到的主页URL。
  // [可调参数]: 'https://jwxt.neuq.edu.cn/eams/homeExt.action' - 如果登录成功后的目标URL改变，需要更新此字符串。
  const homePageURL = 'https://jwxt.neuq.edu.cn/eams/homeExt.action';
  // 注意：此处使用固定时长的等待。更健壮的做法是使用 page.waitForURL(homePageURL, { timeout: ... })
  // 来显式等待URL变为期望的主页URL，或者等待主页上的某个特定元素出现，以确认登录成功和页面跳转完成。
  // 当前的固定等待可能因网络波动或服务器响应慢而不稳定。
  await page.waitForTimeout(operationDelay);

  // --- 2. 导航到空闲教室查询页面 ---
  // 定义空闲教室查询页面的URL。
  // [可调参数]: 'https://jwxt.neuq.edu.cn/eams/classroom/apply/free.action' - 如果此页面的URL改变，需要更新。
  const freeClassroomURL = 'https://jwxt.neuq.edu.cn/eams/classroom/apply/free.action';
  console.log(`正在导航到空闲教室查询页面: ${freeClassroomURL}`);
  // 导航到空闲教室查询页面。
  await page.goto(freeClassroomURL);

  // 定位空闲教室查询页面的主查询表单。使用ID选择器 '#actionForm'。
  // [可调参数]: '#actionForm' - 如果查询表单的HTML ID属性改变，此选择器需要更新。
  const queryForm = page.locator('#actionForm');
  // 等待查询表单在页面上变为可见状态，最长等待30秒。
  // [可调参数]: timeout: 30000 - 如果查询页面加载缓慢，可增加此超时值。
  await queryForm.waitFor({ state: 'visible', timeout: 30000 });
  console.log('空闲教室查询页面已加载。');
  // 等待一段固定的时间，让页面元素稳定。
  await page.waitForTimeout(operationDelay);

  // --- 3. 定义要查询的时间段 ---
  // timeSlots 是一个对象数组，每个对象代表一个要查询的时间段。
  // begin: 起始小节，end: 结束小节，fileSuffix: 用于构成输出JSON文件的后缀。
  // [可调参数]: 数组中的每个对象的 'begin', 'end', 'fileSuffix' 均可根据实际需求修改，以查询不同时间段或更改输出文件名。
  const timeSlots = [
    { begin: '1', end: '2', fileSuffix: '1-2' },
    { begin: '3', end: '4', fileSuffix: '3-4' },
    { begin: '5', end: '6', fileSuffix: '5-6' },
    { begin: '7', end: '8', fileSuffix: '7-8' },
    { begin: '1', end: '8', fileSuffix: '1-8' }, // 例如，查询整个上午到下午的课
    { begin: '9', end: '10', fileSuffix: '9-10' },
    { begin: '11', end: '12', fileSuffix: '11-12' },
  ];

  // --- 4. 循环填写表单并提交查询 ---

  // 异步辅助函数：用于在WDatePicker日期选择器中选择“今天”
  // dateInputElementSelector: 日期输入框的CSS选择器字符串 (例如 '#dateBegin')
  // inputFieldName: 日期输入框的描述性名称 (例如 '起始日期 (dateBegin)')，用于日志输出
  async function selectTodayInDatePicker(dateInputElementSelector: string, inputFieldName: string) {
    console.log(`正在点击 ${inputFieldName} 输入框: ${dateInputElementSelector}`);
    // 点击日期输入框以触发日期选择器的显示。
    // [可调参数]: dateInputElementSelector (作为函数参数传入) - 如果日期输入框的ID或类名改变，调用此函数时传入的选择器需更新。
    await page.locator(dateInputElementSelector).click();
    // 等待1秒，让日期选择器（WDatePicker）有时间弹出。
    // [可调参数]: 1000 - 如果日期选择器弹出较慢，可增加此等待时间。
    await page.waitForTimeout(1000);

    // WDatePicker通常嵌入在一个iframe中。首先尝试使用常见的ID '#_my97DP' 定位此iframe。
    // [可调参数]: 'iframe#_my97DP' - 这是My97DatePicker iframe的常见ID。如果实际ID不同，需修改。
    let datePickerFrame = page.frameLocator('iframe#_my97DP');
    // 检查iframe是否加载并可见，设置3秒超时。
    // [可调参数]: timeout: 3000 - 如果iframe加载慢，可增加。
    let isFrameVisible = await datePickerFrame.locator('body').isVisible({ timeout: 3000 });

    // 如果通过ID未找到可见的iframe，则尝试使用备用选择器，匹配src属性中包含'My97DatePicker.htm'的iframe。
    if (!isFrameVisible) {
        console.log('未找到iframe#_my97DP或其不可见，尝试备用选择器 iframe[src*="My97DatePicker.htm"]');
        // [可调参数]: 'iframe[src*="My97DatePicker.htm"]' - 如果iframe的src特征改变，需修改。
        datePickerFrame = page.frameLocator('iframe[src*="My97DatePicker.htm"]');
        isFrameVisible = await datePickerFrame.locator('body').isVisible({ timeout: 3000 }); // 再次检查可见性
    }

    // 如果两种方式都找不到可见的iframe，则输出错误并返回false，表示日期选择失败。
    if (!isFrameVisible) {
        console.error(`WDatePicker的iframe (${inputFieldName}) 未找到或不可见。无法选择日期。`);
        // 尝试再次点击日期输入框，希望能关闭可能存在的非iframe日期选择器，避免干扰后续操作。
        await page.locator(dateInputElementSelector).click({timeout: 500}).catch(() => {}); // 设置短超时，忽略错误
        return false;
    }
    
    // 在日期选择器的iframe内部，定位“Today”按钮。按钮通常是input元素，type为button，value为"Today"。
    // [可调参数]: 'input[type="button"][value="Today"]' - 如果“今天”按钮的文本/value属性是中文“今天”或其他值，或者其HTML标签/属性改变，需更新此选择器。
    const todayButton = datePickerFrame.locator('input[type="button"][value="Today"]');
    // 等待“Today”按钮在iframe中可见，最长等待5秒。
    // [可调参数]: timeout: 5000 - 如果按钮加载慢，可增加。
    if (await todayButton.isVisible({ timeout: 5000 })) {
      await todayButton.click(); // 点击“Today”按钮
      console.log(`已为 ${inputFieldName} 选择 "Today"。`);
      // 等待日期选择器将选定的日期值填充回主页面的日期输入框中。
      // 使用 page.waitForFunction 在浏览器上下文中执行一个函数，直到它返回true。
      // 该函数检查指定选择器的输入框的值是否不再为空。
      // [可调参数]: timeout: 5000 - 如果日期填充回主页面输入框较慢，可增加。
      await page.waitForFunction(
        (selector) => (document.querySelector(selector as string) as HTMLInputElement)?.value !== '',
        dateInputElementSelector, // 将日期输入框的选择器传给浏览器端函数
        { timeout: 5000 }
      );
      console.log(`${inputFieldName} 输入框已填充日期。`);
      return true; // 日期选择成功
    } else {
      console.error(`在WDatePicker中未找到 "${inputFieldName}" 的 "Today" 按钮。`);
      // 如果未找到“Today”按钮，尝试找到并点击“清空”或“确定”按钮来关闭日期选择器，以防它遮挡页面。
      // [可调参数]: 'input[value="清空"], input[value="Clear"], input[value="确定"], input[value="OK"]' - 如果关闭/清除按钮的value或其他属性改变，需更新。
      const closeButton = datePickerFrame.locator('input[value="清空"], input[value="Clear"], input[value="确定"], input[value="OK"]').first();
      if(await closeButton.isVisible({timeout: 500})) { // 短暂等待关闭按钮
        await closeButton.click();
      }
      return false; // 日期选择失败
    }
  }

  // --- 表单预设操作 (在循环查询之前执行一次) ---
  // 定位“教学楼：”下拉选择框。使用ID选择器 '#building'。
  // [可调参数]: '#building' - 如果教学楼下拉框的HTML ID属性改变，此选择器需要更新。
  const buildingSelect = page.locator('#building');
  console.log('正在选择 "教学楼：" 为 "工学馆" (值为 "1")...');
  // 选择“工学馆”。假设“工学馆”选项的value属性为"1"。
  // [可调参数]: { value: '1' } - “工学馆”或其他目标教学楼的 <option> 标签的 value 属性值。需在网页源码中确认。
  await buildingSelect.selectOption({ value: '1' });
  // 等待一小段时间，让选择操作完成后页面可能发生的动态更新（如下拉框联动）。
  await page.waitForTimeout(interactionDelay);

  // 调用辅助函数，为“起始日期”选择“今天”。
  // [可调参数]: '#dateBegin' - 如果起始日期输入框的ID改变，需更新。
  const dateBeginSuccess = await selectTodayInDatePicker('#dateBegin', '起始日期 (dateBegin)');
  // 如果起始日期设置失败，则输出错误并终止后续操作。
  if (!dateBeginSuccess) {
    console.error("设置 '起始日期' 失败。正在中止后续表单操作。");
    return; // 终止当前测试
  }
  await page.waitForTimeout(interactionDelay); // 短暂等待

  // 调用辅助函数，为“结束日期”选择“今天”。
  // [可调参数]: '#dateEnd' - 如果结束日期输入框的ID改变，需更新。
  const dateEndSuccess = await selectTodayInDatePicker('#dateEnd', '结束日期 (dateEnd)');
   // 如果结束日期设置失败，则输出错误并终止后续操作。
   if (!dateEndSuccess) {
    console.error("设置 '结束日期' 失败。正在中止后续表单操作。");
    return; // 终止当前测试
  }
  await page.waitForTimeout(operationDelay); // 较长等待，准备进入循环查询

  // --- 遍历定义好的时间段，执行查询并保存结果 ---
  for (const slot of timeSlots) { // slot 是 timeSlots 数组中的一个时间段对象
    // 为当前时间段的查询操作创建一个计时器标签，用于性能分析。
    const queryLabel = `QueryForSlot_${slot.fileSuffix}`;
    console.time(queryLabel); // 开始计时

    console.log(`\n--- 正在为时间段 ${slot.fileSuffix} 执行查询 ---`); // 输出当前正在查询的时间段

    // 定位“教室使用小节：”的起始小节输入框。使用name属性选择器。
    // [可调参数]: 'input[name="timeBegin"]' - 如果起始小节输入框的name属性或其他定位依据改变，需更新。
    const timeBeginInput = page.locator('input[name="timeBegin"]');
    // 定位“教室使用小节：”的结束小节输入框。使用name属性选择器。
    // [可调参数]: 'input[name="timeEnd"]' - 如果结束小节输入框的name属性或其他定位依据改变，需更新。
    const timeEndInput = page.locator('input[name="timeEnd"]');

    console.log(`正在填写 "教室使用小节：" 从 ${slot.begin} 到 ${slot.end}...`);
    // 填充起始小节。slot.begin 来自 timeSlots 数组中当前对象的 begin 属性。
    await timeBeginInput.fill(slot.begin);
    await page.waitForTimeout(interactionDelay / 2); // 非常短的等待
    // 填充结束小节。slot.end 来自 timeSlots 数组中当前对象的 end 属性。
    await timeEndInput.fill(slot.end);
    await page.waitForTimeout(interactionDelay); // 短暂等待

    // 定位“查询”按钮。匹配input元素，type为button，value为“查询”。
    // [可调参数]: 'input[type="button"][value="查询"]' - 如果查询按钮的HTML标签、属性或文本改变，需更新。
    const queryButton = page.locator('input[type="button"][value="查询"]');
    console.log('正在点击 "查询" 按钮...');
    // 点击“查询”按钮，提交查询表单。
    await queryButton.click();

    // 定位用于显示查询结果的<div>元素。使用ID选择器 '#freeRoomList'。
    // [可调参数]: '#freeRoomList' - 如果结果显示区域的HTML ID属性改变，需更新。
    const resultsDiv = page.locator('#freeRoomList');
    console.log('正在等待查询结果在 #freeRoomList 中加载...');

    // 为等待结果加载的操作创建一个计时器标签。
    const waitForResultsLabel = `WaitForResults_${slot.fileSuffix}`;
    console.time(waitForResultsLabel); // 开始计时（等待结果）
    try {
      // 等待查询结果区域被实际内容填充。
      // page.waitForFunction 会在浏览器上下文中执行提供的函数，直到它返回true或超时。
      // 这里的函数检查 #freeRoomList 元素的 innerHTML 是否不为空且不等于 "..." (常见的加载中或无结果占位符)。
      // [可调参数]: timeout: 45000 - 单个查询结果加载的最大等待时间。如果查询本身很慢，可增加。
      // [可调参数]: 内部判断逻辑 `element.innerHTML.trim() !== '' && element.innerHTML.trim() !== '...'` - 如果空结果或加载中的表示方式改变，此逻辑需调整。
      await page.waitForFunction(
        (selector) => {
          const element = document.querySelector(selector as string); // 在浏览器中获取元素
          return element && element.innerHTML.trim() !== '' && element.innerHTML.trim() !== '...';
        },
        '#freeRoomList', // 将选择器传给浏览器端函数
        { timeout: 20000 }
      );
      console.timeEnd(waitForResultsLabel); // 结束计时（等待结果）
      console.log('查询结果已加载。');
    } catch (e) { // 如果等待超时或发生其他错误
      console.timeEnd(waitForResultsLabel); // 确保计时器结束
      console.error(`为时间段 ${slot.fileSuffix} 等待结果加载超时或发生错误。`);
      // 尝试获取并打印当前 #freeRoomList 的HTML内容，用于调试。
      const currentHTML = await resultsDiv.innerHTML().catch(() => "无法获取 #freeRoomList 的innerHTML");
      console.log(`#freeRoomList 的当前HTML内容: ${currentHTML}`);
      console.timeEnd(queryLabel); // 确保整个查询操作的计时器也结束
      continue; // 跳过当前时间段的后续处理（JSON解析和保存），继续下一个时间段的查询
    }
    // 等待一段固定时间，让结果区域的内容完全渲染稳定。
    await page.waitForTimeout(operationDelay);

    // --- JSON数据解析和文件写入 ---
    // 假设查询结果是以HTML表格的形式展现在 #freeRoomList 内部的第一个<table>元素中。
    // [可调参数]: .locator('table').first() - 如果结果不在第一个表格，或需要更精确的表格定位，需修改此选择器。
    const tableElement = resultsDiv.locator('table').first();
    // 初始化一个空数组，用于存储从表格中解析出来的JSON对象。
    const jsonData: Array<Record<string, string>> = [];

    // 检查定位到的表格是否可见，设置10秒超时。
    // [可调参数]: timeout: 10000 - 如果表格加载或显示较慢，可增加。
    if (await tableElement.isVisible({timeout: 10000})) {
      console.log('在结果中找到表格。正在解析数据...');
      let headers: string[] = []; // 用于存储表格的表头（列名）
      // 尝试从表格的 <thead><tr><th> 结构中提取表头文本。
      // [可调参数]: 'thead tr th' - 如果表头的HTML结构不同（例如没有thead，或使用其他标签），需修改此选择器。
      const headerElements = await tableElement.locator('thead tr th').all();

      if (headerElements.length > 0) { // 如果找到了<th>元素作为表头
          headers = await Promise.all(headerElements.map(async h => (await h.textContent() || '').trim()));
      } else { // 如果没有明确的<th>表头
          console.log('未找到 <thead><th> 表头。可能需要使用通用列名或将第一行数据作为表头。');
          // 注意：当前代码在未找到显式表头时，后续会使用通用列名如 "column1", "column2"等。
          // 如果需要更智能的表头推断（例如使用第一行<td>作为表头），则需要在此处添加相应逻辑。
      }

      // 从表格的 <tbody> 获取所有数据行 <tr>。
      // [可调参数]: 'tbody tr' - 如果数据行的HTML结构不同，需修改此选择器。
      const rows = await tableElement.locator('tbody tr').all();
      console.log(`在表格中找到 ${rows.length} 行数据。`);

      for (const row of rows) { // 遍历每一行数据
          // 获取当前行中所有的单元格 <td>。
          // [可调参数]: 'td' - 如果单元格使用不同标签，需修改。
          const cells = await row.locator('td').all();
          const rowData: Record<string, string> = {}; // 创建一个空对象存储当前行的数据
          for (let i = 0; i < cells.length; i++) { // 遍历当前行的每个单元格
              const cellText = (await cells[i].textContent() || '').trim(); // 获取单元格文本并去除首尾空格
              // 使用之前提取的表头名。如果表头数组中没有对应索引的表头（例如表头比列数少），
              // 或者根本没有提取到表头，则使用通用的列名 "columnX" (X从1开始)。
              const headerName = headers[i] || `column${i + 1}`;
              rowData[headerName] = cellText; // 将单元格数据存入rowData对象，键为表头名/通用列名
          }
          if (Object.keys(rowData).length > 0) { // 确保行数据对象不是空的
              jsonData.push(rowData); // 将当前行的数据对象添加到jsonData数组中
          }
      }

      if (jsonData.length > 0) { // 如果成功解析到数据
          // 构建输出JSON文件的名称，包含当前查询的时间段后缀。
          const outputFileName = `classroom_results_${slot.fileSuffix}.json`;
          // 使用path.join安全地构建完整的文件路径，默认输出到项目根目录。
          // [可调参数]: outputFileName 或 path.join() 的参数 - 如果希望输出到特定目录，可修改路径。
          const outputFilePath = path.join('output', outputFileName);
          // 将jsonData数组转换为格式化的JSON字符串（null, 2表示使用null作为替换函数，2个空格作为缩进）并写入文件。
          // 文件编码默认为utf8。
          fs.writeFileSync(outputFilePath, JSON.stringify(jsonData, null, 2));
          console.log(`\n--- 时间段 ${slot.fileSuffix} 的查询结果已保存到 ${outputFilePath} ---`);
      } else { // 如果未解析到任何数据行，或表格本身为空
          console.log(`时间段 ${slot.fileSuffix}: 未从表格中解析到数据行，或表格为空。`);
          // 打印 #freeRoomList 的原始HTML内容，用于调试为何没有数据。
          const resultsHTMLContent = await resultsDiv.innerHTML();
          console.log(`#freeRoomList 的原始HTML内容 (供调试):`);
          console.log(resultsHTMLContent);
      }
    } else { // 如果在结果区域未找到可见的表格
      console.log(`时间段 ${slot.fileSuffix}: 在 #freeRoomList 中未找到表格。转储原始文本内容:`);
      // 打印 #freeRoomList 的纯文本内容，用于调试。
      const resultsTextContent = await resultsDiv.textContent();
      console.log(resultsTextContent);
    }

    console.timeEnd(queryLabel); // 结束当前时间段查询操作的总计时
    // 在开始下一个时间段的查询之前，等待一段固定时间。
    await page.waitForTimeout(operationDelay);
  } // for循环结束，完成所有定义时间段的查询

  console.log('\n所有时间段查询测试脚本执行完毕。'); // 测试结束的标志性输出

}); // 测试用例函数结束
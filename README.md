# 东北大学秦皇岛分校空闲教室总表

本仓库通过部署在 `GitHub Actions` 上的 `Playwright` 测试文件来自动化获取空闲教室信息，并且借助JavaScript脚本生成对应HTML文件，自动发布在 `GitHub Pages` 上。该流程会每6小时自动执行一次。

本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。

本表定期更新可能占用教室的校园事件。

本项目通过 `/tests/classroom_query.spec.ts` 文件自动登录东秦教务系统，查询空闲教室信息，并将结果保存为JSON格式储存于 `/output` 中。

查询结果随后会被 `scripts/process_json.js` 处理，对数据进行筛选和合并，存储在 `/output/processed_classroom_data.json` 中。

`/scripts/generate_html.js` 会将 `/output/processed_classroom_data.json` 转换为对应的 `/index.html`。然后将该HTML文件发布在 `GitHub Pages` 上。

对于可能占用教室的校园事件，将其记录在 `/calendar/neuq_events.json` 中。`/scripts/generate_html.js`在生成HTML文件时会读取该文件，检查是否有当日发生的事件。

由于东秦教务系统网站时有变动，可能会导致Playwright自动化运行失效，**请以教务系统实际查询结果为准**。

本项目的诞生离不开Gemini和GitHub Copilot的协助。

---

## 本地测试

由于 `/scripts/generate_html.js` 需要用到`jsdom`，在本地测试时确保安装了该包。

本地测试时，需要修改 `/tests/classroom_query.spec.ts` 中的部分代码。

首先找到这里：

```typescript
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
```

将这部分替换为下面的代码

```typescript
  // [重要/可调参数]: 'YOUR_NEUQ_USERNAME' - 必须替换为实际的、有效的测试用户名。
  await usernameInput.fill("YOUR_NEUQ_USERNAME");
  // 在填充操作后，等待一小段时间，确保相关事件（如input事件）被触发。
  await page.waitForTimeout(interactionDelay);

  // 定位密码输入框。使用ID选择器 '#password'。
  // [可调参数]: '#password' - 如果密码输入框的HTML `id` 属性改变，此选择器需要更新。
  const passwordInput = page.locator("#password");
  console.log("正在填写密码...");
  // 使用 locator.fill() 方法填充密码。
  // [重要/可调参数]: 'YOUR_NEUQ_PASSWORD' - 必须替换为实际的、有效的测试密码。
  await passwordInput.fill("YOUR_NEUQ_PASSWORD");
  // 在填充操作后，等待一小段时间。
  await page.waitForTimeout(interactionDelay);
```
并且，将其中的`YOUR_NEUQ_USERNAME`替换为你的教务系统学号；`YOUR_NEUQ_PASSWORD`替换为你的教务系统登录密码。就可以正常在本地测试了。

## 自动化部署

若要部署到 `GitHub Actions` 中自动化执行，请在仓库设置中添加两个 `Repository secrets` ： `YOUR_NEUQ_USERNAME` 设为你的学号； `YOUR_NEUQ_PASSWORD` 设为你的密码。

若你想要将页面发布到网络上，请将 `/CNAME`文件内容改为自己的域名。

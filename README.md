# 东北大学秦皇岛分校空闲教室总表

本仓库通过部署在 Cloudflare Pages 上的 JavaScript 脚本来自动化获取空闲教室信息，并且生成对应 HTML 文件，自动发布在 Cloudflare Pages 上。该流程每2小时自动执行一次。

本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。

本表定期更新可能占用教室的校园事件。

本项目通过 `/scripts/fetch_data.js` 文件向东秦教务系统发送请求，查询空闲教室信息，并将结果保存为JSON格式储存于 `/output` 中。

查询结果随后会被 `/scripts/process_json.js` 处理，对数据进行筛选和合并，存储在 `/output-day-x/processed_classroom_data.json` 中。

`/scripts/generate_html.js` 会将 `/output/processed_classroom_data.json` 转换为对应的 `/index.html`。然后将该 HTML 文件发布在 Cloudflare Pages 上。

对于可能占用教室的校园事件，将其记录在 `/calendar/neuq_events.json` 中。`/scripts/generate_html.js` 在生成 HTML 文件时会读取该文件，检查是否有当日发生的事件。

因节假日调休时，由于教务系统可能未更新，本空教室表无法正常显示。

由于东秦教务系统网站时有变动，可能会导致自动化运行失效，**请以教务系统实际查询结果为准**。

本项目的诞生离不开 Gemini 和 GitHub Copilot 的协助。同时也感谢 [Ferry-200 的项目](https://github.com/Ferry-200/neuq-free-classroom) 提供了优化构建的思路。

---

## 本地测试

本地测试时，需要修改 `/scripts/fetch_data.js` 中的部分代码。

首先找到这里：

```javascript
    const username = process.env.YOUR_NEUQ_USERNAME;
    const password = process.env.YOUR_NEUQ_PASSWORD;
```

将 `process.env.YOUR_NEUQ_USERNAME` 和 `process.env.YOUR_NEUQ_PASSWORD` 分布替换为你的教务系统学号和登录密码。就可以正常在本地测试了。

## 自动化部署

若要部署到 GitHub Actions 中自动化执行，请在仓库设置中添加两个 Repository secrets： `YOUR_NEUQ_USERNAME` 设为你的学号； `YOUR_NEUQ_PASSWORD` 设为你的密码。

若你想要将页面发布到网络上，请将 `/CNAME`文件内容改为自己的域名。

若要部署到 Cloudflare Pages 或其他托管平台，请在构建命令中使用：

```
npm install && npm run fetch && npm run process && npm run generate
```
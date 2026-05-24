# 东北大学秦皇岛分校空闲教室总表

本仓库通过部署在 Cloudflare Pages 上的 Rust 程序来自动化获取空闲教室信息，并且生成对应 HTML 文件，自动发布在 Cloudflare Pages 上。该流程每 1 小时自动执行一次。

本表不显示机房、实验室、语音室、研讨室、多功能、活动教室、智慧教室、不排课教室、体育教学场地。大学会馆、旧实验楼以及科技楼的部分特殊教室被排除在外。教务系统中信息存在异常项的教室也不会予以显示。

本表定期更新可能占用教室的校园事件。

对于可能占用教室的校园事件，将其记录在 `calendar/neuq_events.json` 中。在生成 HTML 文件时会读取该文件，检查是否有当日发生的事件。若没有事件会按规则选取一条格言。

因节假日调休时，由于教务系统可能未更新，本空教室表无法正常显示。

由于东秦教务系统网站时有变动，可能会导致自动化运行失效，**请以教务系统实际查询结果为准**。

本项目的诞生离不开 Xiaomi MIMO 和 Deepseek 的协助。同时也感谢 [Ferry-200 的项目](https://github.com/Ferry-200/neuq-free-classroom) 提供了优化构建的思路。

---

## 本地测试

本地测试时，按照 `.env.example` 所示创建 `.env` 文件并填入对应变量即可。

## 自动化部署

若要部署到 GitHub Actions 中自动化执行，请在仓库设置中添加两个 Repository secrets： `YOUR_NEUQ_USERNAME` 设为你的学号； `YOUR_NEUQ_PASSWORD` 设为你的密码。并且找到 `.github/workflows/classroom-query.yml`，将下面的内容取消注释：

```yml
on:
#   push:
#     branches: [ main, master ]
#   pull_request:
#     branches: [ main, master ]
#   schedule:
#     - cron: '0 */1 * * *'  # 每 1 小时运行一次
  workflow_dispatch:  # 允许手动触发
```

请将 `CNAME` 文件内容改为你将要发布网页的域名。

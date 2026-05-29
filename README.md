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

### GitHub Actions

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

### Cloudflare Pages

进入 Cloudflare Pages 项目 初始参数填写如下：

| 字段 | 值 |
|---|---|
| **Framework preset** | `None` |
| **Build command** | 见下方 |
| **Build output directory** | `.` |
| **Root directory** | `/`（留空即可） |

然后设置自定义域以指向您的站点，需要与 `CNAME` 文件内容保持一致。

#### 构建命令（Build command）

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable && . "$HOME/.cargo/env" && cargo build --release && ./target/release/neuq-classroom-query deploy && rm -rf target/
```

> **说明**：如需加速编译，可将 `cargo build --release` 替换为 `cargo build --profile ci`，并将二进制路径 `./target/release/` 改为 `./target/ci/`。CI profile 跳过了链接时优化（LTO），编译速度更快，适合 CI/CD 环境。详见 `README.rust.md`。

#### 环境变量配置

进入 **Settings → Environment variables**，添加以下变量：

| 变量名 | 值 | 说明 |
|---|---|---|
| `YOUR_NEUQ_USERNAME` | 你的学号 | **设置为密钥** |
| `YOUR_NEUQ_PASSWORD` | 你的密码 | **设置为密钥** |
| `ASSETS_DIR` | `./assets` | 静态资源目录（可选） |
| `OUTPUT_DIR` | `./output` | HTML 输出目录（可选） |
| `TOTAL_DAYS` | `7` | 查询天数（可选） |
| `MINIFY_HTML` | `true` | 压缩 HTML（可选） |


#### 启用定期自动更新

Cloudflare Pages 本身**不支持定时触发**，你可以通过部署挂钩实现：

1. Pages → 设置 → 构建 → 部署挂钩 → 创建一个 Hook URL
2. 新建一个 Worker，内容如下：

   `变量和机密` 中设置一个密钥 `PAGES_DEPLOY_HOOK`，内容为刚刚创建的 Hook URL。

   `触发事件` 选择 `Cron 触发器`，然后选择更新频率。

   接着进入 `编辑代码` 界面，创建 `worker.js`：

   ```js
   export default {
     async scheduled(controller, env, ctx) {
       const deployHookUrl1 = env.PAGES_DEPLOY_HOOK;
   
       if (!deployHookUrl1) {
         console.error("错误：环境变量 PAGES_DEPLOY_HOOK_1 未设置。");
         return;
       }
       
       console.log(`[${new Date().toISOString()}] 准备触发 Pages 部署...`);
   
       try {
         // 向 Deploy Hook URL 发送 POST 请求
         const response = await fetch(deployHookUrl1, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json'
           }
         });
   
         if (response.ok) {
           console.log("成功触发 Pages 部署！");
         } else {
           const errorText = await response.text();
           console.error(`触发 Pages 部署失败。状态码: ${response.status}`, errorText);
         }
       } catch (error) {
         console.error("请求 Deploy Hook 时发生网络错误:", error);
       }
     },
   };

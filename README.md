# 东北大学秦皇岛分校空闲教室总表

> 当前尚未实现除工学馆以外的空闲教室表功能，敬请期待！

本仓库通过部署在 `GitHub Actions` 上的 `Playwright` 测试文件来自动化获取空闲教室信息，并且借助JavaScript脚本生成对应HTML文件，自动发布在 `GitHub Pages` 上。该流程会每6小时自动执行一次。

本项目通过 `/tests/classroom_query.spec.ts` 文件自动登录东秦教务系统，查询空闲教室信息，并将结果保存为JSON格式储存于 `/output` 中。

查询结果随后会被 `scripts/process_json.js` 处理，对数据进行筛选和合并，存储在 `/output/processed_classroom_data.json` 中。

`/scripts/generate_html.js` 会将 `/output/processed_classroom_data.json` 转换为对应的 `/index.html`。然后将该HTML文件发布在 `GitHub Pages` 上。

由于东秦教务系统网站时有变动，可能会导致Playwright自动化运行失效，**请以教务系统实际查询结果为准**。

本项目的诞生离不开Gemini和GitHub Copilot的协助。

---

## 本地测试

由于 `/scripts/generate_html.js` 需要用到`jsdom`，在本地测试时确保安装了该包。

本地测试时，将 `/tests/classroom_query.spec.ts` 中的YOUR_NEUQ_USERNAME替换为你的教务系统学号；YOUR_NEUQ_PASSWORD替换为你的教务系统登录密码。

## 自动化部署

若要部署到 `GitHub Actions` 中自动化执行，请在仓库设置中添加两个 `Repository secrets` ： `YOUR_NEUQ_USERNAME` 设为你的学号； `YOUR_NEUQ_PASSWORD` 设为你的密码。

若你想要将页面发布到网络上，请将 `/CNAME`文件内容改为自己的域名。

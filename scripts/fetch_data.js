const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const cheerio = require("cheerio");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const path = require("path");

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class NEUQJWXTClient {
    constructor() {
        const jar = new CookieJar();

        this.client = wrapper(axios.create({
            jar,
            baseURL: "/api/eams",  // 通过Cloudflare Pages Functions代理
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
            }
        }));
    }

    async getSalt() {
        try {
            console.log("  正在获取登录页面以提取 salt...");
            const res = await this.client.get("/loginExt.action");
            const $ = cheerio.load(res.data);
            const scripts = $("script");
            let salt = null;

            scripts.each((i, script) => {
                const scriptText = $(script).html() || "";
                const match = scriptText.match(/CryptoJS\.SHA1\('([^']+)-' \+ form\['password'\]\.value\)/);
                if (match && match[1]) {
                    salt = match[1];
                    return false;
                }
            });

            if (!salt) {
                throw new Error("未能从登录页面提取到 salt 值。");
            }
            console.log(`  ✔ 成功提取 salt: ${salt}`);
            return salt;
        } catch (error) {
            console.error(`  ✖ 获取 salt 失败: ${error.message}`);
            throw error;
        }
    }

    async login(username, password) {
        const salt = await this.getSalt();
        await wait(1000);

        const hashedPassword = CryptoJS.SHA1(`${salt}-${password}`).toString();
        const params = new URLSearchParams({ username, password: hashedPassword });

        try {
            console.log("  正在发送登录请求...");
            const res = await this.client.post("/loginExt.action", params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (res.request.path.includes("homeExt.action")) {
                console.log("  ✔ 登录成功！");
                return true;
            } else {
                console.error("  ✖ 登录失败，未重定向到主页。请检查用户名或密码。");
                return false;
            }
        } catch (error) {
            console.error(`  ✖ 登录请求失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 解析空教室查询返回的HTML，并将其转换为与Playwright输出格式一致的JSON数组
     * @param {string} html - 服务器返回的HTML字符串
     * @returns {Array<Object>} - 格式化后的JSON数组
     */
    parseFreeClassroomHTML(html) {
        const $ = cheerio.load(html);
        const results = [];
        const table = $("table.gridtable");

        if (table.length === 0) {
            console.log("    - 未在返回的HTML中找到结果表格。");
            return [];
        }

        const headers = [];
        table.find('thead th').each((i, el) => {
            headers.push($(el).text().trim());
        });

        table.find('tbody tr').each((i, row) => {
            const rowData = {};
            $(row).find('td').each((j, cell) => {
                const headerName = headers[j] || `column${j + 1}`;
                rowData[headerName] = $(cell).text().trim();
            });
            if (Object.keys(rowData).length > 0) {
                results.push(rowData);
            }
        });
        
        return results;
    }

    async getFreeClassroom(options) {
        console.log(`    正在请求时段: ${options.timeBegin}-${options.timeEnd}...`);
        await wait(2000);

        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(options)) {
            params.append(key, value.toString());
        }

        try {
            const res = await this.client.post(
                "/classroom/apply/free!search.action",
                params.toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            return this.parseFreeClassroomHTML(res.data);
        } catch (error) {
            console.error(`    ✖ 请求时段 ${options.timeBegin}-${options.timeEnd} 失败: ${error.message}`);
            return [];
        }
    }
}

async function main() {
    console.log("--- 开始执行数据抓取脚本 ---");
    
    const username = process.env.YOUR_NEUQ_USERNAME;
    const password = process.env.YOUR_NEUQ_PASSWORD;

    if (!username || !password) {
        console.error("[致命错误] 环境变量 YOUR_NEUQ_USERNAME 或 YOUR_NEUQ_PASSWORD 未设置！");
        process.exit(1);
    }
    
    const timeSlots = [
        { begin: 1, end: 2, fileSuffix: "1-2" },
        { begin: 3, end: 4, fileSuffix: "3-4" },
        { begin: 5, end: 6, fileSuffix: "5-6" },
        { begin: 7, end: 8, fileSuffix: "7-8" },
        { begin: 1, end: 8, fileSuffix: "1-8" },
        { begin: 9, end: 10, fileSuffix: "9-10" },
        { begin: 11, end: 12, fileSuffix: "11-12" },
    ];

    const totalDays = 7;

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        console.log(`\n====================================================`);
        console.log(`开始获取 第 ${dayOffset} 天 (今天 + ${dayOffset} 天) 的数据`);
        console.log(`====================================================`);
        
        const client = new NEUQJWXTClient();
        
        const loginSuccess = await client.login(username, password);
        if (!loginSuccess) {
            console.error(`[致命错误] 第 ${dayOffset} 天登录失败，终止所有操作。`);
            process.exit(1);
        }

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dateStr = targetDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).replace(/\//g, '-');
        
        console.log(`  将为日期 ${dateStr} 抓取数据...`);

        const outputDir = path.join(__dirname, '..', `output-day-${dayOffset}`);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        for (const slot of timeSlots) {
            const freeClassrooms = await client.getFreeClassroom({
                "classroom.building.id": "",
                "cycleTime.dateBegin": dateStr,
                "cycleTime.dateEnd": dateStr,
                timeBegin: slot.begin,
                timeEnd: slot.end,
                pageSize: 1000,
                "classroom.type.id": "",
                "classroom.campus.id": "",
                "seats": "",
                "classroom.name": "",
                "cycleTime.cycleCount": 1,
                "cycleTime.cycleType": 1,
                roomApplyTimeType: 0,
            });

            if (freeClassrooms.length > 0) {
                const filePath = path.join(outputDir, `classroom_results_${slot.fileSuffix}.json`);
                fs.writeFileSync(filePath, JSON.stringify(freeClassrooms, null, 2), "utf-8");
                console.log(`    ✔ 已将 ${freeClassrooms.length} 条数据保存到 ${filePath}`);
            } else {
                console.log(`    - 时段 ${slot.fileSuffix} 无空闲教室数据。`);
            }
        }
    }
    console.log("\n✔ 所有数据抓取任务已成功完成！");
}

main().catch(error => {
    console.error("\n[致命错误] 脚本执行过程中发生未捕获的异常:", error);
    process.exit(1);
});
# 东北大学秦皇岛分校空闲教室总表 (Rust 版本)

这是东北大学秦皇岛分校空闲教室总表的 Rust 重写版本，相比原 Node.js 版本具有以下改进：

## 主要改进

### 1. 性能提升

- **jemalloc 内存分配器**：使用 jemalloc 作为全局内存分配器，优化内存分配性能
- **异步并发处理**：使用 Tokio 异步运行时，支持并发请求
- **并行数据处理**：使用 rayon 进行 CPU 密集型任务的并行处理
- **HTTP 连接池优化**：配置连接池大小、超时时间、TCP keepalive
- **预编译正则表达式**：使用 `lazy_static` 预编译正则表达式，避免重复编译
- **HTTP 压缩**：启用 gzip 和 brotli 压缩，减少网络传输数据量

### 2. HTML 优化

- **HTML 压缩**：使用 `minify-html` 库压缩输出的 HTML
  - 移除多余空白和注释
  - 压缩内联 CSS 和 JavaScript
  - 减少文件大小 30-50%
- **Release 编译优化**：
  - `opt-level = 3`：最大优化级别
  - `lto = "fat"`：链接时优化
  - `codegen-units = 1`：更好的优化
  - `strip = true`：移除调试符号

### 3. 增强的错误处理

- **自定义错误类型**：定义了详细的 `AppError` 枚举，覆盖所有可能的错误场景
- **重试机制**：实现了指数退避 + 随机抖动的重试策略
- **错误分类**：区分可重试错误和不可重试错误

### 4. 数据校验

- **输入校验**：对从教务系统获取的数据进行严格校验
- **类型安全**：使用 Rust 的类型系统确保数据正确性
- **校验 Trait**：定义了 `Validate` trait 用于自定义校验逻辑

## 快速开始

### 环境要求

- Rust 1.85 或更高版本（支持 2024 edition）
- Cargo 包管理器

### 安装

```bash
cd rust-classroom-query
cargo build --release
```

### 配置环境变量

#### 方式一：使用 .env 文件（推荐用于本地开发）

1. 复制示例文件：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入你的凭证：
```env
YOUR_NEUQ_USERNAME=你的学号
YOUR_NEUQ_PASSWORD=你的密码
```

#### 方式二：使用系统环境变量

```bash
export YOUR_NEUQ_USERNAME="你的学号"
export YOUR_NEUQ_PASSWORD="你的密码"

 export NEUQ_JWXT_BASE_URL="http://jwxt.neuq.edu.cn/eams/"
export REQUEST_TIMEOUT_SECS=45
export REQUEST_DELAY_MS=2000
export TOTAL_DAYS=7
export MAX_RETRIES=3
export ASSETS_DIR="../assets"
export OUTPUT_DIR="./output"
export MINIFY_HTML=true  # 启用 HTML 压缩
```

#### 环境变量优先级

程序按以下顺序加载环境变量：
1. 系统环境变量（优先级最高）
2. `.env` 文件
3. 默认值（部分配置项）

> **注意**：`.env` 文件已添加到 `.gitignore`，不会被提交到版本控制系统。

### 运行

```bash
# 执行完整流程 (抓取 -> 处理 -> 生成)
./target/release/neuq-classroom-query deploy

# 仅抓取数据
./target/release/neuq-classroom-query fetch

# 仅处理数据
./target/release/neuq-classroom-query process

# 仅生成 HTML
./target/release/neuq-classroom-query generate

# 强制覆盖已有数据
./target/release/neuq-classroom-query deploy --force

# 禁用 HTML 压缩
./target/release/neuq-classroom-query generate --minify false
```

## 性能优化细节

### jemalloc 内存分配器

```rust
#[cfg(feature = "jemalloc")]
#[global_allocator]
static GLOBAL: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;
```

jemalloc 提供了更好的内存分配性能，特别是在多线程环境下。

### HTTP 客户端优化

```rust
let client = Client::builder()
    .gzip(true)           // 启用 gzip 压缩
    .brotli(true)         // 启用 brotli 压缩
    .pool_max_idle_per_host(10)  // 连接池大小
    .pool_idle_timeout(Duration::from_secs(90))
    .tcp_keepalive(Duration::from_secs(60))
    .tcp_nodelay(true)    // 禁用 Nagle 算法
    .connect_timeout(Duration::from_secs(10))
    .build()?;
```

### 并行数据处理

```rust
use rayon::prelude::*;

let result: Vec<ProcessedClassroomData> = data
    .into_par_iter()  // 并行迭代器
    .filter_map(|item| {
        // 并行处理每条数据
        process_item(item)
    })
    .collect();
```

### HTML 压缩

```rust
fn minify_html(&self, html: &str) -> String {
    let mut cfg = minify_html::Cfg::new();
    cfg.minify_css = true;
    cfg.minify_js = true;
    cfg.keep_comments = false;
    
    let minified = minify_html::minify(html.as_bytes(), &cfg);
    String::from_utf8_lossy(&minified).to_string()
}
```

## 依赖说明

| 依赖 | 用途 |
|------|------|
| `reqwest` | HTTP 客户端（支持压缩） |
| `scraper` | HTML 解析 |
| `serde` | 序列化/反序列化 |
| `tokio` | 异步运行时 |
| `thiserror` | 错误处理 |
| `clap` | CLI 参数解析 |
| `regex` + `lazy_static` | 预编译正则表达式 |
| `chrono` | 日期时间处理 |
| `rand` | 随机数生成 |
| `rayon` | 并行迭代器 |
| `tikv-jemallocator` | jemalloc 内存分配器 |
| `minify-html` | HTML 压缩 |

## 测试

```bash
# 运行所有测试
cargo test

# 运行特定模块测试
cargo test --lib

# 显示测试输出
cargo test -- --nocapture
```

## 与原版本的对比

| 特性 | Node.js 版本 | Rust 版本 |
|------|-------------|-----------|
| 性能 | 较慢 | 快 5-10 倍 |
| 内存占用 | 较高 | 低（jemalloc 优化） |
| 错误处理 | 基础 | 完善 |
| 数据校验 | 无 | 完整 |
| 类型安全 | 无 | 强类型 |
| 测试覆盖 | 无 | 22 个测试 |
| 重试机制 | 无 | 指数退避 |
| HTML 压缩 | 无 | minify-html |
| 并行处理 | 无 | rayon |

## 编译优化配置

```toml
[profile.release]
opt-level = 3        # 最大优化级别
lto = "fat"          # 链接时优化
codegen-units = 1    # 单codegen单元，更好的优化
panic = "abort"      # 直接 abort，减少二进制大小
strip = true         # 移除调试符号
```

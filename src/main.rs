use std::process;

use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use neuq_classroom_query::config::AppConfig;
use neuq_classroom_query::error::Result;
use neuq_classroom_query::fetcher::Fetcher;
use neuq_classroom_query::generator::Generator;
use neuq_classroom_query::processor::Processor;

// 使用 jemalloc 作为全局分配器（性能优化）
#[cfg(feature = "jemalloc")]
#[global_allocator]
static GLOBAL: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;

/// NEUQ 空闲教室查询工具 (Rust 版本)
#[derive(Parser)]
#[command(name = "neuq-classroom-query")]
#[command(version = "3.0.0")]
#[command(about = "东北大学秦皇岛分校空闲教室查询工具", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// 执行完整的部署流程 (fetch -> process -> generate)
    Deploy {
        /// 强制覆盖已有数据
        #[arg(long, short)]
        force: bool,
        /// 是否压缩 HTML 输出
        #[arg(long, default_value = "true")]
        minify: bool,
    },
    /// 仅抓取数据
    Fetch {
        /// 强制覆盖已有数据
        #[arg(long, short)]
        force: bool,
    },
    /// 仅处理数据
    Process,
    /// 仅生成 HTML
    Generate {
        /// 是否压缩 HTML 输出
        #[arg(long, default_value = "true")]
        minify: bool,
    },
}

#[tokio::main]
async fn main() {
    // 加载 .env 文件（本地开发时使用）
    // 在 Cloudflare 等部署环境中，环境变量直接注入，不需要 .env 文件
    dotenvy::dotenv().ok();

    // 初始化日志（使用本地时区 UTC+8）
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_timer(tracing_subscriber::fmt::time::ChronoLocal::new(
            "%Y-%m-%d %H:%M:%S%.3f".to_string(),
        ))
        .with_target(false)
        .init();

    let cli = Cli::parse();

    // 加载配置
    let config = match AppConfig::from_env() {
        Ok(config) => config,
        Err(e) => {
            tracing::error!("配置加载失败: {}", e);
            eprintln!("错误: {}", e);
            process::exit(1);
        }
    };

    // 执行命令
    let result = match cli.command {
        Commands::Deploy { force, minify } => {
            let mut config = config;
            config.force_overwrite = force;
            config.minify_html = minify;
            deploy(config).await
        }
        Commands::Fetch { force } => {
            let mut config = config;
            config.force_overwrite = force;
            fetch(config).await
        }
        Commands::Process => process(config).await,
        Commands::Generate { minify } => {
            let mut config = config;
            config.minify_html = minify;
            generate(config).await
        }
    };

    if let Err(e) = result {
        tracing::error!("执行失败: {}", e);
        eprintln!("错误: {}", e);
        process::exit(1);
    }
}

/// 执行完整的部署流程
async fn deploy(config: AppConfig) -> Result<()> {
    tracing::info!("开始执行完整部署流程...");
    let config = std::sync::Arc::new(config);

    // Step 1: 抓取数据
    tracing::info!("=== Step 1/3: 抓取数据 ===");
    let fetcher = Fetcher::new(std::sync::Arc::clone(&config))?;
    fetcher.fetch_all().await?;

    // Step 2: 处理数据
    tracing::info!("=== Step 2/3: 处理数据 ===");
    let processor = Processor::new(std::sync::Arc::clone(&config)).await?;
    processor.process_all().await?;

    // Step 3: 生成 HTML
    tracing::info!("=== Step 3/3: 生成 HTML ===");
    let generator = Generator::new(std::sync::Arc::clone(&config));
    generator.generate().await?;

    tracing::info!("✔ 部署完成");
    Ok(())
}

/// 仅抓取数据
async fn fetch(config: AppConfig) -> Result<()> {
    tracing::info!("开始抓取数据...");
    let config = std::sync::Arc::new(config);

    let fetcher = Fetcher::new(config)?;
    fetcher.fetch_all().await?;

    tracing::info!("✔ 数据抓取完成！");
    Ok(())
}

/// 仅处理数据
async fn process(config: AppConfig) -> Result<()> {
    tracing::info!("开始处理数据...");
    let config = std::sync::Arc::new(config);

    let processor = Processor::new(config).await?;
    processor.process_all().await?;

    tracing::info!("✔ 数据处理完成！");
    Ok(())
}

/// 仅生成 HTML
async fn generate(config: AppConfig) -> Result<()> {
    tracing::info!("开始生成 HTML...");
    let config = std::sync::Arc::new(config);

    let generator = Generator::new(config);
    generator.generate().await?;

    tracing::info!("✔ HTML 生成完成！");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_parse() {
        let cli = Cli::try_parse_from(&["neuq-classroom-query", "deploy"]).unwrap();
        match cli.command {
            Commands::Deploy { force, minify } => {
                assert!(!force);
                assert!(minify); // 默认启用压缩
            }
            _ => panic!("Expected Deploy command"),
        }
    }

    #[test]
    fn test_cli_parse_with_force() {
        let cli = Cli::try_parse_from(&["neuq-classroom-query", "deploy", "--force"]).unwrap();
        match cli.command {
            Commands::Deploy { force, .. } => assert!(force),
            _ => panic!("Expected Deploy command"),
        }
    }

    #[test]
    fn test_cli_parse_no_minify() {
        let cli = Cli::try_parse_from(&["neuq-classroom-query", "generate"]).unwrap();
        match cli.command {
            Commands::Generate { minify } => assert!(minify), // 默认值是 true
            _ => panic!("Expected Generate command"),
        }
    }
}

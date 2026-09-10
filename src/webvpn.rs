//! 深澜（srun wengine）WebVPN 协议支持
//!
//! 学校教务系统（jwxt.neuq.edu.cn）已限制为仅校内网访问，校外访问会被网关
//! 直接以 HTTP 483 拒绝。本模块实现通过学校 WebVPN
//! （<https://vpn.neuq.edu.cn>，深澜系统）代理访问教务系统。
//!
//! 资源 URL 格式：
//!
//! ```text
//! {webvpn_base}/{http|https}/{hex(AES-128-CBC(host:port))}/{原始路径}?{原始查询串}
//! ```
//!
//! 其中 AES-128-CBC 的 key 和 iv 均为 `wrdvpnisthebest!`（深澜默认值），
//! 密文以 PKCS7 填充、小写十六进制编码。

use aes::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
use cbc::Encryptor;

use crate::error::{AppError, Result};

type Aes128CbcEnc = Encryptor<aes::Aes128>;

/// 深澜 WebVPN 默认的 AES-128-CBC key / iv
const DEFAULT_KEY: &[u8; 16] = b"wrdvpnisthebest!";
const DEFAULT_IV: &[u8; 16] = b"wrdvpnisthebest!";

/// 将 `host:port` 用 AES-128-CBC 加密并做小写十六进制编码
pub fn encrypt_host_port(host_port: &str) -> Result<String> {
    let ciphertext = Aes128CbcEnc::new(DEFAULT_KEY.into(), DEFAULT_IV.into())
        .encrypt_padded_vec_mut::<Pkcs7>(host_port.as_bytes());
    Ok(hex::encode(ciphertext))
}

/// 把教务系统的直连 URL 转换为经过 WebVPN 代理的 URL
///
/// 例如：
///
/// ```text
/// http://jwxt.neuq.edu.cn/eams/loginExt.action
///   -> https://vpn.neuq.edu.cn/http/6e8af405...835ed/eams/loginExt.action
/// ```
pub fn build_resource_url(webvpn_base: &str, target_url: &str) -> Result<String> {
    let parsed = url::Url::parse(target_url)
        .map_err(|e| AppError::Config(format!("无法解析目标 URL '{}': {}", target_url, e)))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::Config(format!(
            "WebVPN 仅支持代理 http/https 资源，收到: {}",
            scheme
        )));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::Config(format!("URL '{}' 缺少主机名", target_url)))?;
    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| AppError::Config(format!("URL '{}' 无法确定端口", target_url)))?;

    let encrypted = encrypt_host_port(&format!("{}:{}", host, port))?;

    let base = webvpn_base.trim_end_matches('/');
    let mut proxied = format!("{}/{}/{}{}", base, scheme, encrypted, parsed.path());

    if let Some(query) = parsed.query() {
        proxied.push('?');
        proxied.push_str(query);
    }

    Ok(proxied)
}

/// 生成伪造的浏览器指纹（32 位小写十六进制，绕过 FingerprintJS 检查环节）
pub fn fake_fingerprint() -> String {
    (0..16)
        .map(|_| format!("{:02x}", rand::random::<u8>()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试向量由 openssl 实际生成：
    /// printf 'jwxt.neuq.edu.cn:80' | openssl enc -aes-128-cbc \
    ///   -K 77726476706e69737468656265737421 -iv 77726476706e69737468656265737421
    #[test]
    fn test_encrypt_host_port() {
        assert_eq!(
            encrypt_host_port("jwxt.neuq.edu.cn:80").unwrap(),
            "6e8af405815fd09db85f29218c1451f98246c17d36dbcaaed01fe02279a835ed"
        );
        assert_eq!(
            encrypt_host_port("jwxt.neuq.edu.cn:443").unwrap(),
            "6e8af405815fd09db85f29218c1451f9eccd5e32d703c5478bdb7095921171b3"
        );
    }

    #[test]
    fn test_build_resource_url_http() {
        let url = build_resource_url(
            "https://vpn.neuq.edu.cn",
            "http://jwxt.neuq.edu.cn/eams/loginExt.action",
        )
        .unwrap();
        assert_eq!(
            url,
            "https://vpn.neuq.edu.cn/http/6e8af405815fd09db85f29218c1451f98246c17d36dbcaaed01fe02279a835ed/eams/loginExt.action"
        );
    }

    #[test]
    fn test_build_resource_url_https_with_query() {
        let url = build_resource_url(
            "https://vpn.neuq.edu.cn/",
            "https://jwxt.neuq.edu.cn/eams/classroom/apply/free!search.action?page=1&x=2",
        )
        .unwrap();
        assert_eq!(
            url,
            "https://vpn.neuq.edu.cn/https/6e8af405815fd09db85f29218c1451f9eccd5e32d703c5478bdb7095921171b3/eams/classroom/apply/free!search.action?page=1&x=2"
        );
    }

    #[test]
    fn test_build_resource_url_trailing_slash_path() {
        let url =
            build_resource_url("https://vpn.neuq.edu.cn", "http://jwxt.neuq.edu.cn/eams/").unwrap();
        assert_eq!(
            url,
            "https://vpn.neuq.edu.cn/http/6e8af405815fd09db85f29218c1451f98246c17d36dbcaaed01fe02279a835ed/eams/"
        );
    }

    #[test]
    fn test_build_resource_url_rejects_non_http() {
        assert!(build_resource_url("https://vpn.neuq.edu.cn", "ftp://jwxt.neuq.edu.cn/").is_err());
    }

    #[test]
    fn test_fake_fingerprint() {
        let fp = fake_fingerprint();
        assert_eq!(fp.len(), 32);
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
    }
}

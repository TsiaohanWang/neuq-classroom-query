//! 深澜（srun wengine）WebVPN 加密原语
//!
//! 学校教务系统（jwxt.neuq.edu.cn）已限制为仅校内网访问，校外访问会被网关
//! 直接以 HTTP 483 拒绝。本模块实现通过学校 WebVPN
//! （<https://vpn.neuq.edu.cn>，深澜系统）代理访问教务系统所需的加密算法。
//! 会话与登录流程见 [`super::session`]。
//!
//!
//! ## 资源 URL 格式
//!
//! ```text
//! {webvpn_base}/{http|https}/{加密段}/{原始路径}?{原始查询串}
//! 加密段 = hex(iv) + hex(AES-128-CFB(明文)[:明文长度])
//! 明文   = "host"（默认端口 80/443 省略）或 "host:port"（非默认端口）
//!          右补 ASCII '0' 到 16 字节倍数后加密
//! ```
//!
//! 其中 key 和 iv 均为 `wrdvpnisthebest!`（深澜默认值）。此格式与
//! 深澜前端 `encrypt()` 函数及网关实际生成的链接一致（已实测验证）。
//!
//! ## 统一身份认证（CAS）密码加密
//!
//! 金智 authserver 登录页携带随机盐（`pwdDefaultEncryptSalt`，16 字符），
//! 密码按 `encrypt.wisedu.js` 加密：
//!
//! ```text
//! base64( AES-128-CBC-PKCS7( randomString(64) + password, key=盐, iv=randomString(16) ) )
//! ```

use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use cbc::Encryptor;
use cfb_mode::cipher::AsyncStreamCipher;

use crate::error::{AppError, Result};

type Aes128CbcEnc = Encryptor<aes::Aes128>;
type Aes128Cfb = cfb_mode::Encryptor<aes::Aes128>;

/// 深澜 WebVPN 默认的 AES-128-CFB key / iv
const DEFAULT_KEY: &[u8; 16] = b"wrdvpnisthebest!";
const DEFAULT_IV: &[u8; 16] = b"wrdvpnisthebest!";

/// 将 `host[:port]` 按深澜规则加密并编码
///
/// 明文右补 ASCII '0' 到 16 字节倍数，AES-128-CFB 加密后截断到原明文长度，
/// 输出 `hex(iv) + hex(密文)`。
pub fn encrypt_host_port(host_port: &str) -> Result<String> {
    let plain_len = host_port.len();
    if plain_len == 0 {
        return Err(AppError::Config("WebVPN 目标主机名为空".to_string()));
    }

    let mut buf = host_port.as_bytes().to_vec();
    while !buf.len().is_multiple_of(16) {
        buf.push(b'0');
    }

    let cipher = Aes128Cfb::new(DEFAULT_KEY.into(), DEFAULT_IV.into());
    cipher.encrypt(&mut buf);
    buf.truncate(plain_len);

    Ok(format!(
        "{}{}",
        hex::encode(DEFAULT_IV),
        hex::encode(buf)
    ))
}

/// 把教务系统的直连 URL 转换为经过 WebVPN 代理的 URL
///
/// 例如：
///
/// ```text
/// http://jwxt.neuq.edu.cn/eams/loginExt.action
///   -> https://vpn.neuq.edu.cn/http/777264...37421fae05988...203b/eams/loginExt.action
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

    // 与网关实际生成链接的行为一致：默认端口省略，仅非默认端口写入明文
    let default_port = if scheme == "https" { 443 } else { 80 };
    let host_port = match parsed.port() {
        Some(p) if p != default_port => format!("{}:{}", host, p),
        _ => host.to_string(),
    };

    let encrypted = encrypt_host_port(&host_port)?;

    let base = webvpn_base.trim_end_matches('/');
    let mut proxied = format!("{}/{}/{}{}", base, scheme, encrypted, parsed.path());

    if let Some(query) = parsed.query() {
        proxied.push('?');
        proxied.push_str(query);
    }

    Ok(proxied)
}

/// 金智统一身份认证使用的随机字符串字符集（出自 encrypt.wisedu.js）
const CAS_RANDOM_CHARS: &[u8] = b"ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";

/// 生成 `len` 位随机字符串（字符集与金智 encrypt.wisedu.js 一致）
pub fn cas_random_string(len: usize) -> String {
    (0..len)
        .map(|_| {
            let idx = rand::random::<usize>() % CAS_RANDOM_CHARS.len();
            CAS_RANDOM_CHARS[idx] as char
        })
        .collect()
}

/// 金智统一身份认证密码加密（AES-128-CBC-PKCS7，输出 base64）
///
/// `key` 为登录页携带的 16 字符盐（`pwdDefaultEncryptSalt`），
/// `iv` 为 16 字符随机串。
pub fn encrypt_cas_data(data: &str, key: &str, iv: &str) -> Result<String> {
    let key_bytes = key.as_bytes();
    let iv_bytes = iv.as_bytes();
    if key_bytes.len() != 16 || iv_bytes.len() != 16 {
        return Err(AppError::Config(format!(
            "统一身份认证加密参数长度错误：key {} 字节、iv {} 字节（均应为 16）",
            key_bytes.len(),
            iv_bytes.len()
        )));
    }

    let ciphertext =
        Aes128CbcEnc::new(key_bytes.into(), iv_bytes.into()).encrypt_padded_vec_mut::<Pkcs7>(
            data.as_bytes(),
        );

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(ciphertext))
}

/// 按 encrypt.wisedu.js 的 `encryptAES(data, aesKey)` 加密统一身份认证密码
///
/// 明文前拼接 64 位随机串，iv 为 16 位随机串（与前端行为一致）。
pub fn encrypt_cas_password(password: &str, salt: &str) -> Result<String> {
    if password.is_empty() {
        return Err(AppError::Config("统一身份认证密码为空".to_string()));
    }
    let data = format!("{}{}", cas_random_string(64), password);
    encrypt_cas_data(&data, salt, &cas_random_string(16))
}

/// 生成伪造的浏览器指纹（32 位小写十六进制，绕过 FingerprintJS 检查环节）
pub fn fake_fingerprint() -> String {
    (0..16).map(|_| format!("{:02x}", rand::random::<u8>())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试向量实测自学校 WebVPN 网关生成的真实链接（ids.neuq.edu.cn）
    #[test]
    fn test_encrypt_host_port_ids() {
        assert_eq!(
            encrypt_host_port("ids.neuq.edu.cn").unwrap(),
            "77726476706e69737468656265737421f9f352d229357d41300d8db9d6562d"
        );
    }

    /// 测试向量由 openssl 生成：
    /// printf 'jwxt.neuq.edu.cn' | openssl enc -aes-128-cfb \
    ///   -K 77726476706e69737468656265737421 -iv 77726476706e69737468656265737421
    #[test]
    fn test_encrypt_host_port_jwxt() {
        assert_eq!(
            encrypt_host_port("jwxt.neuq.edu.cn").unwrap(),
            "77726476706e69737468656265737421fae05988693e6d456f468ca88d1b203b"
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
            "https://vpn.neuq.edu.cn/http/77726476706e69737468656265737421fae05988693e6d456f468ca88d1b203b/eams/loginExt.action"
        );
    }

    #[test]
    fn test_build_resource_url_https_with_query() {
        let url = build_resource_url(
            "https://vpn.neuq.edu.cn/",
            "https://jwxt.neuq.edu.cn/eams/classroom/apply/free!search.action?page=1&x=2",
        )
        .unwrap();
        assert!(url.starts_with(
            "https://vpn.neuq.edu.cn/https/77726476706e69737468656265737421fae05988693e6d456f468ca88d1b203b"
        ));
        assert!(url.ends_with("/eams/classroom/apply/free!search.action?page=1&x=2"));
    }

    #[test]
    fn test_build_resource_url_non_default_port() {
        let url = build_resource_url(
            "https://vpn.neuq.edu.cn",
            "http://jwxt.neuq.edu.cn:8080/eams/",
        )
        .unwrap();
        let host_port = encrypt_host_port("jwxt.neuq.edu.cn:8080").unwrap();
        assert_eq!(
            url,
            format!("https://vpn.neuq.edu.cn/http/{}/eams/", host_port)
        );
    }

    #[test]
    fn test_build_resource_url_rejects_non_http() {
        assert!(build_resource_url("https://vpn.neuq.edu.cn", "ftp://jwxt.neuq.edu.cn/").is_err());
    }

    /// 测试向量由 openssl 生成（key=0123456789abcdef, iv=IVIVIVIVIVIVIVIV）：
    /// printf 'A'x64'testpassword' | openssl enc -aes-128-cbc -K ... -iv ... | base64
    #[test]
    fn test_encrypt_cas_data() {
        let data = "A".repeat(64) + "testpassword";
        assert_eq!(
            encrypt_cas_data(&data, "0123456789abcdef", "IVIVIVIVIVIVIVIV").unwrap(),
            "MbJZl1iNP8PgmXo79uTuz0lghd973+/LDPdzgwHuxJNugQ7dvsrCqgDohA50QVdASfH8XlxOh3pQ7387pHRGDu5+ddpxHEakaNNU3e+b4Ao="
        );
    }

    #[test]
    fn test_encrypt_cas_password_rejects_bad_salt() {
        assert!(encrypt_cas_password("test", "short").is_err());
        assert!(encrypt_cas_password("", "0123456789abcdef").is_err());
    }

    #[test]
    fn test_cas_random_string() {
        let s = cas_random_string(64);
        assert_eq!(s.len(), 64);
        assert!(s
            .chars()
            .all(|c| CAS_RANDOM_CHARS.contains(&(c as u8))));
    }

    #[test]
    fn test_fake_fingerprint() {
        let fp = fake_fingerprint();
        assert_eq!(fp.len(), 32);
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
    }
}

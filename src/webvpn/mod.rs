//! 深澜（srun wengine）WebVPN 协议支持
//!
//! - [`crypto`]：加密原语（资源 URL 加密、统一身份认证密码加密、指纹伪造）
//! - [`session`]：WebVPN 会话管理（统一身份认证 CAS / 本地账号登录、会话失效检测）

pub mod crypto;
pub mod session;

pub use crypto::{
    build_resource_url, cas_random_string, encrypt_cas_data, encrypt_cas_password,
    encrypt_host_port, fake_fingerprint,
};
pub use session::WebvpnSession;

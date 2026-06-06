use base64::{engine::general_purpose::STANDARD, Engine};
use rocket::{
    http::Status,
    request::{self, FromRequest, Request},
};

/// Size of the write-key stored at the front of every `.diary` file.
pub const KEY_SIZE: usize = 128;

/// A validated 128-byte write-key extracted from the `X-Diary-Key` header.
///
/// The header value must be standard Base64 that decodes to exactly 128 bytes.
/// Example header:
///   X-Diary-Key: <base64url of 128 random bytes>
pub struct DiaryKey(pub [u8; KEY_SIZE]);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for DiaryKey {
    type Error = String;

    async fn from_request(req: &'r Request<'_>) -> request::Outcome<Self, Self::Error> {
        let Some(raw) = req.headers().get_one("X-Diary-Key") else {
            return request::Outcome::Error((
                Status::BadRequest,
                "Missing `X-Diary-Key` header".into(),
            ));
        };

        match STANDARD.decode(raw.trim()) {
            Ok(bytes) if bytes.len() == KEY_SIZE => {
                let mut arr = [0u8; KEY_SIZE];
                arr.copy_from_slice(&bytes);
                request::Outcome::Success(DiaryKey(arr))
            }
            Ok(bytes) => request::Outcome::Error((
                Status::BadRequest,
                format!(
                    "`X-Diary-Key` must decode to exactly {KEY_SIZE} bytes, got {}",
                    bytes.len()
                ),
            )),
            Err(e) => request::Outcome::Error((
                Status::BadRequest,
                format!("`X-Diary-Key` is not valid Base64: {e}"),
            )),
        }
    }
}

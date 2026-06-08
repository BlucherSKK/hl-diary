#[macro_use]
extern crate rocket;

mod diary;
mod guards;

// ─── static SPA ─────────────────────────────────────────────────────────────

/// Serve the SPA shell.
use rocket::response::content::RawHtml;

#[get("/")]
async fn index() -> RawHtml<&'static str> {
    RawHtml(include_str!("../client.html"))
}

#[get("/favicon.ico")]
async fn favi() -> (rocket::http::ContentType, &'static [u8]) {
    (
        rocket::http::ContentType::Icon,
     include_bytes!("../favicon.ico"),
    )
}
// ─── launch ─────────────────────────────────────────────────────────────────

#[launch]
fn rocket() -> _ {
    // Make sure the diaries storage directory exists on startup.
    std::fs::create_dir_all(diary::DIARIES_DIR)
        .expect("Failed to create diaries/ directory");

    rocket::build()
        .mount("/", routes![index, favi])
        .mount(
            "/api/diary",
            routes![
                diary::create,
                diary::read,
                diary::update,
                diary::delete,
            ],
        )
}

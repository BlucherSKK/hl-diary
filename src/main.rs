#[macro_use]
extern crate rocket;

mod diary;
mod guards;

use rocket::fs::NamedFile;

// ─── static SPA ─────────────────────────────────────────────────────────────

/// Serve the SPA shell.
#[get("/")]
async fn index() -> Option<NamedFile> {
    NamedFile::open("/home/blucher/development/HL-dairy/client.html").await.ok()
}

#[get("/favicon.ico")]
async fn favi() -> Option<NamedFile> {

}

// ─── launch ─────────────────────────────────────────────────────────────────

#[launch]
fn rocket() -> _ {
    // Make sure the diaries storage directory exists on startup.
    std::fs::create_dir_all(diary::DIARIES_DIR)
        .expect("Failed to create diaries/ directory");

    rocket::build()
        .mount("/", routes![index, spa_fallback])
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

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

/// Catch-all fallback so client-side routing works after the SPA is wired up.
/// Low rank (= low priority) so all API routes win first.
#[get("/<_..>", rank = 20)]
async fn spa_fallback() -> Option<NamedFile> {
    NamedFile::open("/home/blucher/development/HL-dairy/client.html").await.ok()
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

//! The session server binary.
//!
//! Port 8788 — chosen to satisfy the monorepo's port guardrail, which forbids anything
//! starting with 4 or 5. See the repo root CLAUDE.md.

use std::sync::Arc;
use tri_server::{app, session::Registry, store::LocalStore};

/// Guardrail: the repo forbids ports beginning with 4 or 5.
const DEFAULT_PORT: u16 = 8788;

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("TRIMENSION_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    if port.to_string().starts_with(['4', '5']) {
        eprintln!(
            "refusing to bind port {port}: this repository forbids ports beginning with \
             4 or 5 (see CLAUDE.md)"
        );
        std::process::exit(2);
    }

    let root = std::env::var("TRIMENSION_STORE").unwrap_or_else(|_| "./storage".into());
    let registry = Registry::new(Arc::new(LocalStore::new(&root)));

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .unwrap_or_else(|e| panic!("could not bind port {port}: {e}"));

    eprintln!("trimension session server on http://0.0.0.0:{port} (documents in {root})");
    axum::serve(listener, app::router(registry))
        .await
        .expect("server stopped");
}

//! Blob persistence: one file per document.
//!
//! PRD anti-pattern: "Do not put entities in Postgres. Postgres holds users, orgs,
//! projects, comments, threads. Documents are files in blob storage, one per model."
//! Rayon found that a hundred models already meant millions of rows.
//!
//! The trait exists so S3 or GCS slots in without the session layer noticing. The local
//! implementation is what tests and single-machine deployments use.

use std::path::PathBuf;
use tri_api::tri_doc::Document;

#[async_trait::async_trait]
pub trait Store: Send + Sync {
    /// Load a document, or return a fresh one if it does not exist yet.
    async fn load(&self, id: &str) -> Result<Document, String>;
    async fn save(&self, id: &str, doc: &Document) -> Result<(), String>;
    async fn exists(&self, id: &str) -> bool;
}

/// Files on disk. One JSON document per model.
pub struct LocalStore {
    root: PathBuf,
}

impl LocalStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        LocalStore { root: root.into() }
    }

    /// Reject anything that could escape the storage root. Document ids arrive from the
    /// network, so this is a path-traversal boundary, not a tidiness check.
    fn path_for(&self, id: &str) -> Result<PathBuf, String> {
        if id.is_empty()
            || id.len() > 128
            || !id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(format!(
                "invalid document id {id:?}: expected 1-128 characters of [A-Za-z0-9_-]"
            ));
        }
        Ok(self.root.join(format!("{id}.json")))
    }
}

#[async_trait::async_trait]
impl Store for LocalStore {
    async fn load(&self, id: &str) -> Result<Document, String> {
        let path = self.path_for(id)?;
        match tokio::fs::read(&path).await {
            Ok(bytes) => {
                serde_json::from_slice(&bytes).map_err(|e| format!("document {id} is corrupt: {e}"))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Document::new()),
            Err(e) => Err(format!("could not read {id}: {e}")),
        }
    }

    async fn save(&self, id: &str, doc: &Document) -> Result<(), String> {
        let path = self.path_for(id)?;
        if let Some(dir) = path.parent() {
            tokio::fs::create_dir_all(dir)
                .await
                .map_err(|e| format!("could not create {}: {e}", dir.display()))?;
        }
        let bytes = serde_json::to_vec(doc).map_err(|e| e.to_string())?;

        // Write to a temp file and rename: a crash mid-write must not leave a truncated
        // document, because a truncated document is an unrecoverable data loss and the
        // whole point of blob-per-model is that the blob is the source of truth.
        let tmp = path.with_extension("json.tmp");
        tokio::fs::write(&tmp, &bytes)
            .await
            .map_err(|e| format!("could not write {id}: {e}"))?;
        tokio::fs::rename(&tmp, &path)
            .await
            .map_err(|e| format!("could not commit {id}: {e}"))
    }

    async fn exists(&self, id: &str) -> bool {
        match self.path_for(id) {
            Ok(p) => tokio::fs::try_exists(&p).await.unwrap_or(false),
            Err(_) => false,
        }
    }
}

/// In-memory store for tests.
#[derive(Default)]
pub struct MemoryStore {
    docs: tokio::sync::Mutex<std::collections::BTreeMap<String, Document>>,
}

#[async_trait::async_trait]
impl Store for MemoryStore {
    async fn load(&self, id: &str) -> Result<Document, String> {
        Ok(self.docs.lock().await.get(id).cloned().unwrap_or_default())
    }

    async fn save(&self, id: &str, doc: &Document) -> Result<(), String> {
        self.docs.lock().await.insert(id.to_string(), doc.clone());
        Ok(())
    }

    async fn exists(&self, id: &str) -> bool {
        self.docs.lock().await.contains_key(id)
    }
}

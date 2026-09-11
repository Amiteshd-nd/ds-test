//! One in-memory session per document (PRD §4.4).
//!
//! The server is the sequencer: it holds the document, validates, applies, assigns a
//! sequence number and broadcasts. It runs the *same* `tri_commit::Sequencer` the browser
//! runs, compiled from the same source for a different target — which is the entire
//! reason validation cannot drift between client and server.

use crate::protocol::ServerMsg;
use crate::store::Store;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tri_api::tri_commit::{Commit, CommitError, Sequencer};

pub struct Session {
    sequencer: Sequencer,
    sequence: u64,
    tx: broadcast::Sender<ServerMsg>,
}

impl Session {
    fn new(sequencer: Sequencer) -> Self {
        let (tx, _) = broadcast::channel(1024);
        Session {
            sequencer,
            sequence: 0,
            tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ServerMsg> {
        self.tx.subscribe()
    }

    pub fn snapshot(&self) -> ServerMsg {
        ServerMsg::Snapshot {
            document: Box::new(self.sequencer.document().clone()),
            head: self.sequencer.head(),
            sequence: self.sequence,
        }
    }

    pub fn sequencer(&self) -> &Sequencer {
        &self.sequencer
    }

    pub fn sequence(&self) -> u64 {
        self.sequence
    }

    /// Validate, apply, sequence, broadcast. The one write path on the server side.
    pub fn submit(&mut self, commit: Commit) -> Result<ServerMsg, ServerMsg> {
        let submitted_as = commit.id();
        match self.sequencer.submit(commit) {
            Ok(sequenced) => {
                self.sequence += 1;
                let msg = ServerMsg::Accepted {
                    commit: Box::new(sequenced),
                    sequence: self.sequence,
                    submitted_as,
                };
                // A send error just means nobody is listening yet.
                let _ = self.tx.send(msg.clone());
                Ok(msg)
            }
            Err(e) => Err(ServerMsg::Rejected {
                submitted_as,
                violations: match e {
                    CommitError::Rejected { violations, .. } => {
                        violations.iter().map(|v| v.to_string()).collect()
                    }
                    other => vec![other.to_string()],
                },
            }),
        }
    }
}

/// All live sessions. One process can host many documents; each is independent.
#[derive(Clone)]
pub struct Registry {
    sessions: Arc<Mutex<BTreeMap<String, Arc<Mutex<Session>>>>>,
    store: Arc<dyn Store>,
}

impl Registry {
    pub fn new(store: Arc<dyn Store>) -> Self {
        Registry {
            sessions: Arc::new(Mutex::new(BTreeMap::new())),
            store,
        }
    }

    /// Get or open a session, loading from blob storage on first access.
    pub async fn open(&self, id: &str) -> Result<Arc<Mutex<Session>>, String> {
        let mut map = self.sessions.lock().await;
        if let Some(s) = map.get(id) {
            return Ok(s.clone());
        }
        let doc = self.store.load(id).await?;
        let session = Arc::new(Mutex::new(Session::new(Sequencer::new(doc))));
        map.insert(id.to_string(), session.clone());
        Ok(session)
    }

    /// Write a document back to blob storage.
    pub async fn persist(&self, id: &str) -> Result<(), String> {
        let map = self.sessions.lock().await;
        let Some(session) = map.get(id) else {
            return Err(format!("no open session for {id}"));
        };
        let doc = session.lock().await.sequencer().document().clone();
        self.store.save(id, &doc).await
    }

    pub async fn is_open(&self, id: &str) -> bool {
        self.sessions.lock().await.contains_key(id)
    }

    pub fn store(&self) -> &Arc<dyn Store> {
        &self.store
    }
}

//! M5's test (PRD §5): "Two clients + one headless agent client converge on the same
//! document."
//!
//! These run against a real axum server over real websockets. A mock would test the
//! session type; this tests the thing that actually ships.
//!
//! Ports: the repo forbids anything starting with 4 or 5 (root CLAUDE.md), and the OS
//! ephemeral range on both macOS and Linux starts at 49152 — which begins with a 4. So
//! tests take fixed ports from the 87xx block instead of asking for port 0.

use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;
use tri_api::tri_commit::{AgentId, Author, Commit, CommitId, PlanId, UserId};
use tri_api::tri_doc::layer::Layer;
use tri_api::tri_doc::{Document, Op};
use tri_server::protocol::{ClientMsg, ServerMsg};
use tri_server::session::Registry;
use tri_server::store::MemoryStore;

/// Fixed test ports, all outside the forbidden 4xxx/5xxx ranges.
const PORTS: &[u16] = &[8791, 8792, 8793, 8794, 8795, 8796, 8797, 8798];

async fn serve(index: usize) -> (String, Registry) {
    let registry = Registry::new(Arc::new(MemoryStore::default()));
    let port = PORTS[index];
    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .unwrap_or_else(|e| panic!("could not bind test port {port}: {e}"));
    let app = tri_server::app::router(registry.clone());
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    // Let the listener come up.
    tokio::time::sleep(std::time::Duration::from_millis(40)).await;
    (format!("127.0.0.1:{port}"), registry)
}

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// A connected peer. The server does not know or care whether this is a browser tab or
/// an agent — that is invariant I3 and the Motif lesson, made concrete.
struct Peer {
    socket: Socket,
    head: CommitId,
    doc: Document,
}

impl Peer {
    async fn connect(addr: &str, doc_id: &str) -> Peer {
        let (socket, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/ws/{doc_id}"))
            .await
            .expect("websocket connect");
        let mut peer = Peer {
            socket,
            head: CommitId::ROOT,
            doc: Document::new(),
        };
        // First message is always the snapshot.
        match peer.recv().await {
            ServerMsg::Snapshot { document, head, .. } => {
                peer.doc = *document;
                peer.head = head;
            }
            other => panic!("expected a snapshot first, got {other:?}"),
        }
        peer
    }

    async fn recv(&mut self) -> ServerMsg {
        let msg = tokio::time::timeout(std::time::Duration::from_secs(5), self.socket.next())
            .await
            .expect("timed out waiting for the server")
            .expect("stream ended")
            .expect("websocket error");
        match msg {
            Message::Text(t) => serde_json::from_str(&t).expect("server sent invalid JSON"),
            other => panic!("unexpected frame: {other:?}"),
        }
    }

    async fn send(&mut self, msg: ClientMsg) {
        self.socket
            .send(Message::Text(serde_json::to_string(&msg).unwrap().into()))
            .await
            .expect("send");
    }

    async fn submit(&mut self, author: Author, ops: Vec<Op>, message: &str) -> CommitId {
        let commit = Commit::new(self.head, author, ops, message);
        let id = commit.id();
        self.send(ClientMsg::Submit {
            commit: Box::new(commit),
        })
        .await;
        id
    }

    /// Apply whatever the server sends until `n` commits have landed locally.
    async fn absorb(&mut self, n: usize) {
        let mut seen = 0;
        while seen < n {
            match self.recv().await {
                ServerMsg::Accepted { commit, .. } => {
                    let ops = commit.ops().to_vec();
                    let proof = tri_api::tri_doc::check(&self.doc, &ops)
                        .expect("the server validated this before broadcasting it");
                    self.doc.apply(proof).expect("apply");
                    self.head = commit.id();
                    seen += 1;
                }
                ServerMsg::Rejected { violations, .. } => {
                    panic!("unexpected rejection: {violations:?}")
                }
                ServerMsg::Error { message } => panic!("server error: {message}"),
                _ => {}
            }
        }
    }
}

fn layer_op(name: &str) -> Op {
    Op::CreateLayer {
        layer: Layer {
            name: name.into(),
            parent: None,
            visible: true,
            color: [255, 255, 255, 255],
        },
    }
}

fn human(name: &str) -> Author {
    Author::Human(UserId(name.into()))
}

fn agent() -> Author {
    Author::Agent(AgentId("claude".into()), PlanId("plan-1".into()))
}

// ---------------------------------------------------------------------------

#[tokio::test]
async fn two_clients_and_a_headless_agent_converge_on_the_same_document() {
    let (addr, registry) = serve(0).await;

    let mut alice = Peer::connect(&addr, "plan-a").await;
    let mut bob = Peer::connect(&addr, "plan-a").await;
    // The agent connects on the identical protocol at the identical privilege level.
    let mut claude = Peer::connect(&addr, "plan-a").await;

    alice
        .submit(
            human("alice"),
            vec![layer_op("A-WALL")],
            "alice adds a layer",
        )
        .await;
    bob.submit(human("bob"), vec![layer_op("A-DOOR")], "bob adds a layer")
        .await;
    claude
        .submit(agent(), vec![layer_op("A-GLAZ")], "agent adds a layer")
        .await;

    // Everyone absorbs all three commits, whoever authored them.
    alice.absorb(3).await;
    bob.absorb(3).await;
    claude.absorb(3).await;

    let server_hash = {
        let session = registry.open("plan-a").await.unwrap();
        let s = session.lock().await;
        assert_eq!(
            s.sequence(),
            3,
            "the server sequenced the wrong number of commits"
        );
        s.sequencer().document().hash()
    };

    assert_eq!(
        alice.doc.hash(),
        server_hash,
        "alice diverged from the server"
    );
    assert_eq!(bob.doc.hash(), server_hash, "bob diverged from the server");
    assert_eq!(
        claude.doc.hash(),
        server_hash,
        "the agent diverged from the server"
    );
    assert_eq!(alice.doc.layers().len(), 3);
    assert_eq!(
        alice.head, bob.head,
        "clients disagree about the head commit"
    );
    assert_eq!(alice.head, claude.head);
}

#[tokio::test]
async fn an_agent_commit_is_attributed_and_traceable_to_its_plan() {
    let (addr, registry) = serve(1).await;
    let mut claude = Peer::connect(&addr, "audit").await;
    claude
        .submit(agent(), vec![layer_op("A-WALL")], "agent edit")
        .await;
    claude.absorb(1).await;

    let session = registry.open("audit").await.unwrap();
    let s = session.lock().await;
    let commits = s.sequencer().history().by_plan(&PlanId("plan-1".into()));
    assert_eq!(commits.len(), 1);
    assert!(commits[0].author().is_agent());
}

#[tokio::test]
async fn a_rejected_commit_reaches_only_its_author() {
    let (addr, _) = serve(2).await;
    let mut alice = Peer::connect(&addr, "reject").await;
    let mut bob = Peer::connect(&addr, "reject").await;

    // Invalid: reparenting a layer that does not exist.
    let bad = vec![Op::ReparentLayer {
        id: tri_api::tri_doc::LayerId::from_raw(99),
        new_parent: None,
    }];
    let submitted = alice.submit(human("alice"), bad, "nonsense").await;

    match alice.recv().await {
        ServerMsg::Rejected {
            submitted_as,
            violations,
        } => {
            assert_eq!(submitted_as, submitted);
            assert!(violations[0].contains("no such layer"), "{violations:?}");
        }
        other => panic!("expected a rejection, got {other:?}"),
    }

    // Bob must not hear about an edit that never happened. A valid commit afterwards
    // proves the channel is alive and that nothing was queued behind it.
    bob.submit(human("bob"), vec![layer_op("A-WALL")], "real edit")
        .await;
    match bob.recv().await {
        ServerMsg::Accepted { commit, .. } => assert_eq!(commit.message(), "real edit"),
        other => panic!("bob saw something he should not have: {other:?}"),
    }
}

#[tokio::test]
async fn concurrent_commits_on_the_same_parent_both_land_in_arrival_order() {
    // PRD §4.4: "Conflicting commits apply in arrival order."
    let (addr, registry) = serve(3).await;
    let mut alice = Peer::connect(&addr, "race").await;
    let mut bob = Peer::connect(&addr, "race").await;

    // Both build on ROOT — neither has seen the other.
    assert_eq!(alice.head, bob.head);
    alice
        .submit(human("alice"), vec![layer_op("from-alice")], "a")
        .await;
    bob.submit(human("bob"), vec![layer_op("from-bob")], "b")
        .await;

    alice.absorb(2).await;
    bob.absorb(2).await;

    let session = registry.open("race").await.unwrap();
    let hash = session.lock().await.sequencer().document().hash();
    assert_eq!(alice.doc.hash(), hash);
    assert_eq!(bob.doc.hash(), hash);
    assert_eq!(
        alice.doc.layers().len(),
        2,
        "one of the two commits was lost"
    );
}

#[tokio::test]
async fn a_late_joiner_gets_a_snapshot_and_then_stays_in_step() {
    let (addr, _) = serve(4).await;
    let mut alice = Peer::connect(&addr, "late").await;
    alice
        .submit(human("alice"), vec![layer_op("first")], "1")
        .await;
    alice.absorb(1).await;

    // Carol arrives after the fact.
    let mut carol = Peer::connect(&addr, "late").await;
    assert_eq!(carol.doc.layers().len(), 1, "the snapshot was empty");
    assert_eq!(carol.doc.hash(), alice.doc.hash());
    assert_eq!(carol.head, alice.head);

    alice
        .submit(human("alice"), vec![layer_op("second")], "2")
        .await;
    alice.absorb(1).await;
    carol.absorb(1).await;
    assert_eq!(carol.doc.hash(), alice.doc.hash());
}

#[tokio::test]
async fn documents_round_trip_through_blob_storage() {
    let (addr, registry) = serve(5).await;
    let mut alice = Peer::connect(&addr, "persisted").await;
    alice
        .submit(human("alice"), vec![layer_op("A-WALL")], "work")
        .await;
    alice.absorb(1).await;

    registry.persist("persisted").await.expect("persist");
    let loaded = registry.store().load("persisted").await.expect("load");
    assert_eq!(loaded.hash(), alice.doc.hash());

    // A different document id is genuinely separate — one blob per model.
    let other = registry.store().load("something-else").await.unwrap();
    assert_eq!(other.entity_count(), 0);
    assert_eq!(other.layers().len(), 0);
}

#[tokio::test]
async fn a_document_id_cannot_escape_the_storage_root() {
    use tri_server::store::{LocalStore, Store};
    let dir = std::env::temp_dir().join("trimension-store-test");
    let store = LocalStore::new(&dir);
    for bad in ["../escape", "a/b", "", "with space", &"x".repeat(200)] {
        assert!(
            store.save(bad, &Document::new()).await.is_err(),
            "path traversal accepted: {bad:?}"
        );
    }
    assert!(store.save("good-id_1", &Document::new()).await.is_ok());
    let _ = tokio::fs::remove_dir_all(&dir).await;
}

#[tokio::test]
async fn resync_returns_the_current_state() {
    let (addr, _) = serve(6).await;
    let mut alice = Peer::connect(&addr, "resync").await;
    alice
        .submit(human("alice"), vec![layer_op("A-WALL")], "work")
        .await;
    alice.absorb(1).await;

    alice.send(ClientMsg::Resync).await;
    match alice.recv().await {
        ServerMsg::Snapshot { document, head, .. } => {
            assert_eq!(document.hash(), alice.doc.hash());
            assert_eq!(head, alice.head);
        }
        other => panic!("expected a snapshot, got {other:?}"),
    }
}

#[tokio::test]
async fn separate_documents_do_not_leak_into_each_other() {
    let (addr, _) = serve(7).await;
    let mut a = Peer::connect(&addr, "doc-one").await;
    let mut b = Peer::connect(&addr, "doc-two").await;

    a.submit(human("alice"), vec![layer_op("only-in-one")], "x")
        .await;
    a.absorb(1).await;

    b.send(ClientMsg::Resync).await;
    match b.recv().await {
        ServerMsg::Snapshot { document, .. } => {
            assert_eq!(document.layers().len(), 0, "a commit crossed documents");
        }
        other => panic!("{other:?}"),
    }
}

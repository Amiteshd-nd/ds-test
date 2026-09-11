//! Drive a *running* session server with three real clients: two humans and a headless
//! agent. Run the server first, then:
//!
//! ```bash
//! cargo run -p tri-server --example live_demo
//! ```
//!
//! Note what this cannot do: forge a commit. `CommitId` is a BLAKE3 hash over
//! (parent, author, ops, message), so a client that does not compute it correctly is
//! rejected as tampered. That is why this is a Rust client — the id has to come from the
//! same code the server verifies with.

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;
use tri_api::tri_commit::{AgentId, Author, Commit, CommitId, PlanId, UserId};
use tri_api::tri_doc::layer::Layer;
use tri_api::tri_doc::{Document, Op};
use tri_server::protocol::{ClientMsg, ServerMsg};

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

struct Peer {
    label: &'static str,
    socket: Socket,
    head: CommitId,
    doc: Document,
    author: Author,
}

impl Peer {
    async fn connect(label: &'static str, url: &str, author: Author) -> Peer {
        let (socket, _) = tokio_tungstenite::connect_async(url)
            .await
            .expect("the server must be running: cargo run -p tri-server");
        let mut p = Peer {
            label,
            socket,
            head: CommitId::ROOT,
            doc: Document::new(),
            author,
        };
        match p.recv().await {
            ServerMsg::Snapshot { document, head, .. } => {
                p.doc = *document;
                p.head = head;
            }
            other => panic!("expected a snapshot, got {other:?}"),
        }
        p
    }

    async fn recv(&mut self) -> ServerMsg {
        loop {
            let msg = self.socket.next().await.expect("stream").expect("ws");
            if let Message::Text(t) = msg {
                return serde_json::from_str(&t).expect("valid JSON");
            }
        }
    }

    async fn submit(&mut self, ops: Vec<Op>, message: &str) {
        let commit = Commit::new(self.head, self.author.clone(), ops, message);
        self.socket
            .send(Message::Text(
                serde_json::to_string(&ClientMsg::Submit {
                    commit: Box::new(commit),
                })
                .unwrap()
                .into(),
            ))
            .await
            .expect("send");
    }

    /// Absorb `n` broadcasts, validating each locally with the same code the server used.
    async fn absorb(&mut self, n: usize) {
        let mut seen = 0;
        while seen < n {
            match self.recv().await {
                ServerMsg::Accepted { commit, .. } => {
                    let ops = commit.ops().to_vec();
                    let proof = tri_api::tri_doc::check(&self.doc, &ops)
                        .expect("the server validated this before broadcasting");
                    self.doc.apply(proof).expect("apply");
                    self.head = commit.id();
                    seen += 1;
                    println!("  {:<7} <- {}", self.label, commit.message());
                }
                ServerMsg::Rejected { violations, .. } => {
                    println!("  {:<7} !! rejected: {}", self.label, violations.join("; "));
                    return;
                }
                _ => {}
            }
        }
    }
}

fn layer(name: &str) -> Op {
    Op::CreateLayer {
        layer: Layer {
            name: name.into(),
            parent: None,
            visible: true,
            color: [200, 200, 200, 255],
        },
    }
}

#[tokio::main]
async fn main() {
    let doc_id = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "live-demo".into());
    let url = format!("ws://127.0.0.1:8788/ws/{doc_id}");

    println!("connecting three clients to {doc_id}\n");
    let mut alice = Peer::connect("alice", &url, Author::Human(UserId("alice".into()))).await;
    let mut bob = Peer::connect("bob", &url, Author::Human(UserId("bob".into()))).await;
    // The agent connects on the identical protocol at the identical privilege level.
    let mut claude = Peer::connect(
        "claude",
        &url,
        Author::Agent(AgentId("claude".into()), PlanId("plan-live-1".into())),
    )
    .await;

    println!("all three submit concurrently, each building on the same head:");
    alice
        .submit(vec![layer("A-WALL")], "alice: wall layer")
        .await;
    bob.submit(vec![layer("A-DOOR")], "bob: door layer").await;
    claude
        .submit(vec![layer("A-GLAZ")], "agent: glazing layer")
        .await;

    alice.absorb(3).await;
    bob.absorb(3).await;
    claude.absorb(3).await;

    println!("\nhashes:");
    for p in [&alice, &bob, &claude] {
        println!("  {:<7} {}", p.label, &p.doc.hash().to_hex()[..24]);
    }
    let agreed = alice.doc.hash() == bob.doc.hash() && bob.doc.hash() == claude.doc.hash();
    println!(
        "\n{}",
        if agreed {
            "CONVERGED - two humans and a headless agent hold an identical document"
        } else {
            "DIVERGED"
        }
    );
    println!("layers now: {}", alice.doc.layers().len());

    // An invalid commit reaches only its author.
    println!("\nalice submits something invalid:");
    alice
        .submit(
            vec![Op::ReparentLayer {
                id: tri_api::tri_doc::LayerId::from_raw(999),
                new_parent: None,
            }],
            "alice: reparent a layer that doesn't exist",
        )
        .await;
    alice.absorb(1).await;
    println!("  bob and claude were not told about an edit that never happened");
}

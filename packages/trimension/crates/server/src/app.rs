//! The axum application: websocket sessions plus a small HTTP surface.

use crate::protocol::{ClientMsg, ServerMsg};
use crate::session::Registry;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};

pub fn router(registry: Registry) -> Router {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/doc/{id}", get(snapshot))
        .route("/doc/{id}/persist", post(persist))
        .route("/ws/{id}", get(ws_upgrade))
        .with_state(registry)
}

async fn snapshot(
    State(reg): State<Registry>,
    Path(id): Path<String>,
) -> Result<Json<ServerMsg>, (axum::http::StatusCode, String)> {
    let session = reg
        .open(&id)
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e))?;
    let msg = session.lock().await.snapshot();
    Ok(Json(msg))
}

async fn persist(
    State(reg): State<Registry>,
    Path(id): Path<String>,
) -> Result<&'static str, (axum::http::StatusCode, String)> {
    reg.persist(&id)
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e))?;
    Ok("saved")
}

async fn ws_upgrade(
    State(reg): State<Registry>,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle(socket, reg, id))
}

/// One connected client — a browser, a headless agent, or a test. The server does not
/// distinguish between them, which is the point: an agent is a peer, not a plugin.
async fn handle(socket: WebSocket, reg: Registry, id: String) {
    let Ok(session) = reg.open(&id).await else {
        return;
    };

    let (mut sink, mut stream) = socket.split();

    // Subscribe *before* snapshotting, so a commit landing between the two is queued
    // rather than lost. A client that misses a commit silently diverges, and divergence
    // is the failure mode this whole architecture exists to prevent.
    let mut rx = session.lock().await.subscribe();
    let snapshot = session.lock().await.snapshot();
    if send(&mut sink, &snapshot).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            // Broadcasts from other clients.
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(msg) => {
                        if send(&mut sink, &msg).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        // This client fell behind. Rather than let it drift, tell it to
                        // resync from a fresh snapshot.
                        let _ = send(
                            &mut sink,
                            &ServerMsg::error(format!(
                                "missed {n} commit(s); send a resync"
                            )),
                        )
                        .await;
                    }
                    Err(_) => break,
                }
            }

            // Messages from this client.
            incoming = stream.next() => {
                let Some(Ok(msg)) = incoming else { break };
                let text = match msg {
                    Message::Text(t) => t.to_string(),
                    Message::Close(_) => break,
                    Message::Ping(_) | Message::Pong(_) | Message::Binary(_) => continue,
                };

                let reply = match serde_json::from_str::<ClientMsg>(&text) {
                    Ok(ClientMsg::Ping) => Some(ServerMsg::Pong),
                    Ok(ClientMsg::Resync) => Some(session.lock().await.snapshot()),
                    Ok(ClientMsg::Submit { commit }) => {
                        // Accepted commits reach this client through the broadcast
                        // channel it is already subscribed to; sending here too would
                        // deliver it twice. Only a rejection needs a direct reply.
                        session.lock().await.submit(*commit).err()
                    }
                    Err(e) => Some(ServerMsg::error(format!("could not parse message: {e}"))),
                };

                if let Some(reply) = reply {
                    if send(&mut sink, &reply).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
}

async fn send<S>(sink: &mut S, msg: &ServerMsg) -> Result<(), ()>
where
    S: SinkExt<Message> + Unpin,
{
    let text = serde_json::to_string(msg).map_err(|_| ())?;
    sink.send(Message::Text(text.into())).await.map_err(|_| ())
}

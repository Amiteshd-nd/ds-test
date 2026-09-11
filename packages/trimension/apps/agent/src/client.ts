/**
 * The agent's connection to a document.
 *
 * The point of this file is how *unremarkable* it is. The agent talks to the session
 * server over the same websocket protocol a browser uses, submits the same commits, and
 * is validated by the same code. There is no agent-specific endpoint, no privileged
 * internal API, and nothing here that a human client could not also do.
 *
 * That is invariant I3 and the Motif lesson from PRD §2 — "UI, API and agents are all
 * clients of the same data model" — expressed as an absence of code rather than as a
 * feature.
 */
import { WebSocket } from 'ws'

export interface ServerMsg {
  type: 'snapshot' | 'accepted' | 'rejected' | 'pong' | 'error'
  data: unknown
}

export class SessionClient {
  private socket: WebSocket | null = null
  private readonly waiters: ((m: ServerMsg) => void)[] = []

  constructor(
    private readonly baseUrl: string,
    private readonly documentId: string,
  ) {}

  async connect(): Promise<void> {
    const url = `${this.baseUrl.replace(/^http/, 'ws')}/ws/${this.documentId}`
    this.socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('open', () => resolve())
      this.socket!.once('error', reject)
    })
    this.socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMsg
      this.waiters.splice(0).forEach((w) => w(msg))
    })
  }

  next(): Promise<ServerMsg> {
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  send(msg: unknown): void {
    this.socket?.send(JSON.stringify(msg))
  }

  close(): void {
    this.socket?.close()
  }
}

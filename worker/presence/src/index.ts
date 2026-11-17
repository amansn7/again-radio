import { DurableObject } from "cloudflare:workers";

interface Env { PRESENCE: DurableObjectNamespace<Presence>; }

const MIN_GAP_MS = 1000;
const OPEN = 1;

export class Presence extends DurableObject<Env> {
  private last = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private count(): number {
    return this.ctx.getWebSockets().filter(ws => ws.readyState === OPEN).length;
  }

  private broadcast(): void {
    this.last = Date.now();
    const msg = JSON.stringify({ n: this.count() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* closing socket */ }
    }
  }

  // Joins and leaves in a burst collapse into one broadcast per MIN_GAP_MS.
  private changed(): void {
    if (this.timer !== null) return;
    const wait = Math.max(0, this.last + MIN_GAP_MS - Date.now());
    this.timer = setTimeout(() => { this.timer = null; this.broadcast(); }, wait);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ n: this.count() }, { headers: { "Cache-Control": "no-store" } });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ n: this.count() }));
    this.changed();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(): void {}

  webSocketClose(ws: WebSocket, code: number): void {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* already closed */ }
    this.changed();
  }

  webSocketError(ws: WebSocket): void {
    try { ws.close(1011); } catch { /* already closed */ }
    this.changed();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const isCount = pathname === "/presence/count" && request.method === "GET";
    if (pathname !== "/presence" && !isCount) return new Response("Not found", { status: 404 });
    if (!isCount && request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    return env.PRESENCE.get(env.PRESENCE.idFromName("station")).fetch(request);
  },
};

const PING_MS = 25_000;
const DEAD_MS = 70_000;
const MAX_BACKOFF_MS = 30_000;

/** Calls `cb` with the live listener count, or null whenever it is not known. */
export function watchListeners(cb: (n: number | null) => void): () => void {
  const local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const url = local
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/presence`
    : "wss://again-radio-presence.again-radio-listeners.workers.dev/presence";
  let ws: WebSocket | null = null;
  let stopped = false;
  let tries = 0;
  let lastSeen = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let beat: ReturnType<typeof setInterval> | null = null;

  function clear(): void {
    if (retry !== null) { clearTimeout(retry); retry = null; }
    if (beat !== null) { clearInterval(beat); beat = null; }
  }

  function open(): void {
    if (stopped || ws) return;
    clear();
    const sock = new WebSocket(url);
    ws = sock;
    lastSeen = Date.now();
    sock.onmessage = e => {
      lastSeen = Date.now();
      try {
        const n = (JSON.parse(String(e.data)) as { n?: unknown }).n;
        if (typeof n === "number" && Number.isInteger(n) && n >= 0) { tries = 0; cb(n); }
      } catch { /* pong */ }
    };
    sock.onerror = () => sock.close();
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      clear();
      cb(null);
      if (stopped) return;
      const cap = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** tries++);
      retry = setTimeout(open, cap / 2 + Math.random() * (cap / 2));
    };
    beat = setInterval(() => {
      if (Date.now() - lastSeen > DEAD_MS) sock.close();
      else if (sock.readyState === WebSocket.OPEN) sock.send("ping");
    }, PING_MS);
  }

  function close(): void {
    clear();
    const sock = ws;
    ws = null;
    sock?.close();
    cb(null);
  }

  const onPageHide = (): void => close();
  const onWake = (): void => { if (document.visibilityState === "visible") { tries = 0; open(); } };
  addEventListener("pagehide", onPageHide);
  addEventListener("pageshow", onWake);
  addEventListener("online", onWake);
  document.addEventListener("visibilitychange", onWake);
  open();

  return () => {
    stopped = true;
    removeEventListener("pagehide", onPageHide);
    removeEventListener("pageshow", onWake);
    removeEventListener("online", onWake);
    document.removeEventListener("visibilitychange", onWake);
    close();
  };
}

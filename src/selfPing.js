const DEFAULT_SELF_PING_INTERVAL_SECONDS = 60;
let timer = null;

export function getSelfPingUrl() {
  const baseUrl = (process.env.SELF_PING_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/ping`;
}

export function getSelfPingIntervalSeconds() {
  const raw = process.env.SELF_PING_INTERVAL_SECONDS;
  const parsed = Number.parseInt(raw ?? String(DEFAULT_SELF_PING_INTERVAL_SECONDS), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SELF_PING_INTERVAL_SECONDS;
  }
  return Math.max(1, parsed);
}

export function startSelfPing() {
  const pingUrl = getSelfPingUrl();
  if (!pingUrl || timer) {
    return null;
  }
  const intervalMs = getSelfPingIntervalSeconds() * 1000;
  timer = setInterval(async () => {
    try {
      await fetch(pingUrl, { redirect: "follow" });
    } catch {
      return;
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function stopSelfPing() {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  timer = null;
}

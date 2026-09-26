/** Pings an Uptime Kuma push monitor. Throws on non-2xx so the caller can log it. */
export async function sendHeartbeat(url: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Heartbeat failed: HTTP ${response.status}`);
}

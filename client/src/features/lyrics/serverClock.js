// Shared estimate of the server clock, so the room and every controller can
// agree on "when" a playback sample was taken despite their different network
// latencies.
//
// NTP-style probe: the client notes when it sent `time-sync` and when the
// answer arrived, and assumes the server read its clock halfway through. The
// sample with the shortest round trip has the least room for asymmetric delay,
// so the estimate always uses the fastest of the recent samples. Times are
// measured on performance.now(), which never jumps when the device's wall
// clock is adjusted.

const SAMPLE_WINDOW = 8;
const BURST_SIZE = 5;
const PROBE_INTERVAL_MS = 20_000;
const PROBE_TIMEOUT_MS = 5000;

/** One probe → { offsetMs, rttMs } where serverTime ≈ localNow + offsetMs. */
export function probeSample(sentAt, receivedAt, serverTime) {
  const rttMs = Math.max(0, receivedAt - sentAt);
  return { offsetMs: serverTime + rttMs / 2 - receivedAt, rttMs };
}

/** The lowest-latency sample, or null before any probe has answered. */
export function bestSample(samples) {
  return samples.reduce((best, sample) => (!best || sample.rttMs < best.rttMs ? sample : best), null);
}

const localNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const clock = {
  socket: null,
  samples: [],
  timer: null,
  listeners: new Set(),
  onConnect: null,
};

function notify() {
  const stats = serverClockStats();
  for (const listener of clock.listeners) listener(stats);
}

function probe(socket) {
  if (!socket?.connected) return Promise.resolve(null);
  const sentAt = localNow();
  return new Promise((resolve) => {
    socket.timeout(PROBE_TIMEOUT_MS).emit("time-sync", {}, (error, response) => {
      if (error || !response?.ok || !Number.isFinite(response.serverTime) || clock.socket !== socket) {
        resolve(null);
        return;
      }
      const sample = probeSample(sentAt, localNow(), response.serverTime);
      clock.samples = [...clock.samples, sample].slice(-SAMPLE_WINDOW);
      notify();
      resolve(sample);
    });
  });
}

async function burst(socket) {
  for (let index = 0; index < BURST_SIZE && clock.socket === socket; index += 1) {
    await probe(socket);
  }
}

/** Begin (or keep) synchronising against this socket's server. */
export function startServerClock(socket) {
  if (!socket || clock.socket === socket) return;
  stopServerClock();
  clock.socket = socket;
  clock.onConnect = () => burst(socket);
  socket.on("connect", clock.onConnect);
  if (socket.connected) burst(socket);
  clock.timer = setInterval(() => probe(socket), PROBE_INTERVAL_MS);
}

export function stopServerClock() {
  if (clock.socket && clock.onConnect) clock.socket.off("connect", clock.onConnect);
  if (clock.timer) clearInterval(clock.timer);
  clock.socket = null;
  clock.timer = null;
  clock.onConnect = null;
  clock.samples = [];
}

/** Current server time in epoch milliseconds (the local clock until synchronised). */
export function serverNow() {
  const best = bestSample(clock.samples);
  return best ? localNow() + best.offsetMs : Date.now();
}

/** Convert a performance.now() reading into server epoch milliseconds. */
export function serverTimeAt(localMs) {
  const best = bestSample(clock.samples);
  return best ? localMs + best.offsetMs : Date.now() - (localNow() - localMs);
}

export function serverClockStats() {
  const best = bestSample(clock.samples);
  return { synced: Boolean(best), rttMs: best ? Math.round(best.rttMs) : null };
}

export function subscribeServerClock(listener) {
  clock.listeners.add(listener);
  return () => clock.listeners.delete(listener);
}

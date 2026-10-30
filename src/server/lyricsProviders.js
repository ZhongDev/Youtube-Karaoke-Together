// Lyrics providers: LRCLIB and NetEase Cloud Music. Ported from
// ZhongDev/Youtube-Karaoke-App (src/main/providers/). Both are free and need no
// key; NetEase uses unofficial endpoints, so every call is isolated behind a
// timeout and any failure only marks that provider as errored for the song.
//
// Only search terms derived from the video's public metadata are sent. No room,
// controller, or browser identifier ever leaves the server, and no cookies are
// stored (NetEase answers with decoy results once its cookie is echoed back).

const { cleanNeteaseLrc } = require('./lyricsText');
const { bestSimilarity, cleanTitleForSearch, titleCompatible, titleVariants } = require('./lyricsTitle');

const LRCLIB_BASE = 'https://lrclib.net/api';
const NETEASE_BASE = 'https://music.163.com/api';
const MAX_NETEASE_LYRIC_FETCHES = 3;

function durationScore(wantSec, gotSec) {
    if (!wantSec || !gotSec) return 0.05;
    const difference = Math.abs(wantSec - gotSec);
    if (difference <= 2) return 0.3;
    if (difference <= 5) return 0.15;
    if (difference <= 10) return 0;
    return -0.25;
}

class ProviderHttpError extends Error {
    constructor(provider, status) {
        super(`${provider} responded ${status}`);
        this.name = 'ProviderHttpError';
        this.status = status;
    }
}

function jsonFetcher(provider, fetchImpl, { userAgent, timeoutMs, headers = {}, busyRetryMs = 1500 }) {
    const request = (url) => fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
    });
    return async (url, { allowNotFound = false, retryBusy = false } = {}) => {
        let response = await request(url);
        // LRCLIB sheds load with 503 "retry in a moment": one short retry
        // turns most of those into answers.
        if (retryBusy && (response.status === 503 || response.status === 429)) {
            await new Promise((resolve) => setTimeout(resolve, busyRetryMs));
            response = await request(url);
        }
        if (allowNotFound && response.status === 404) return null;
        if (!response.ok) throw new ProviderHttpError(provider, response.status);
        return response.json();
    };
}

// LRCLIB is a community database and junk records exist (e.g. a one-line
// "*Rickrolling*" entry that exactly matches the real duration). A synced
// record with absurdly few timed lines for its length is discarded.
function isJunkSynced(record) {
    if (!record.syncedLyrics?.trim()) return false;
    const timedLines = record.syncedLyrics.split('\n')
        .filter((line) => /\[\d/.test(line) && line.replace(/\[[^\]]*\]/g, '').trim()).length;
    const durationSec = record.duration ?? 180;
    return timedLines < Math.max(4, Math.min(durationSec / 60, 10));
}

/** (track, artist) pairs to try in order, from as-given to progressively simplified. */
function fieldedAttempts(tracks, artists) {
    if (!tracks.length) return [];
    const pick = (values, index) => values[Math.min(index, values.length - 1)] ?? '';
    const out = [];
    for (let index = 0; index < Math.max(tracks.length, artists.length); index += 1) out.push([pick(tracks, index), pick(artists, index)]);
    if (tracks.length > 1) out.push([tracks[1], '']);
    return out.filter(([track, artist], index) => out.findIndex(([t, a]) => t === track && a === artist) === index);
}

function createLrclibProvider({ fetchImpl, userAgent, timeoutMs = 8000, busyRetryMs }) {
    const getJson = jsonFetcher('lrclib', fetchImpl, { userAgent, timeoutMs, busyRetryMs });

    return {
        id: 'lrclib',
        async search(query) {
            const byId = new Map();

            // 1) Exact match: duration-validated, so only when duration is known.
            //    /get falls back to an upstream lookup on a miss and answers 503
            //    when that is overloaded; it is only a shortcut, so carry on to
            //    /search, which is served from LRCLIB's own index.
            if (query.track && query.durationSec) {
                const params = new URLSearchParams({
                    track_name: query.track,
                    artist_name: query.artist,
                    duration: String(Math.round(query.durationSec)),
                });
                try {
                    const record = await getJson(`${LRCLIB_BASE}/get?${params}`, { allowNotFound: true });
                    if (record && !record.instrumental && !isJunkSynced(record)) byId.set(record.id, { record, confidence: 1 });
                } catch (error) {
                    if (!(error instanceof ProviderHttpError && error.status >= 500) && error.name !== 'TimeoutError') throw error;
                }
            }

            // 2) Fielded search with bracket-free / alternate-script variants, then
            //    3) the raw title as free text; rank ourselves.
            const trackVariants = titleVariants(query.track);
            const artistVariants = titleVariants(query.artist);
            let records = [];
            for (const [track, artist] of fieldedAttempts(trackVariants, artistVariants)) {
                const params = new URLSearchParams({ track_name: track });
                if (artist) params.set('artist_name', artist);
                records = (await getJson(`${LRCLIB_BASE}/search?${params}`, { allowNotFound: true, retryBusy: true })) ?? [];
                if (records.length) break;
            }
            if (!records.length) {
                const text = cleanTitleForSearch(query.rawTitle);
                if (text) records = (await getJson(`${LRCLIB_BASE}/search?${new URLSearchParams({ q: text })}`, { allowNotFound: true, retryBusy: true })) ?? [];
            }

            const wantTrack = trackVariants.length ? trackVariants : [cleanTitleForSearch(query.rawTitle)];
            for (const record of Array.isArray(records) ? records : []) {
                if (!record || record.instrumental || byId.has(record.id) || isJunkSynced(record)) continue;
                const direct = titleCompatible(wantTrack, record.trackName)
                    ? 0.55 * bestSimilarity(wantTrack, record.trackName || '') +
                        0.25 * (query.artist ? bestSimilarity(artistVariants, record.artistName || '') : 0.5)
                    : 0;
                // Community records sometimes have artist/track swapped.
                const swapped = query.artist && titleCompatible(wantTrack, record.artistName)
                    ? 0.9 * (0.55 * bestSimilarity(wantTrack, record.artistName || '') + 0.25 * bestSimilarity(artistVariants, record.trackName || ''))
                    : 0;
                if (!direct && !swapped) continue;
                const score = Math.max(direct, swapped) + durationScore(query.durationSec, record.duration);
                if (score >= 0.45) byId.set(record.id, { record, confidence: Math.min(score, 0.99) });
            }

            const out = [];
            for (const { record, confidence } of byId.values()) {
                const common = {
                    confidence,
                    providerTrack: record.trackName || null,
                    providerArtist: record.artistName || null,
                    providerDurationSec: record.duration ? Math.round(record.duration) : null,
                };
                if (record.syncedLyrics?.trim()) out.push({ kind: 'synced_line', body: record.syncedLyrics, ...common });
                else if (record.plainLyrics?.trim()) out.push({ kind: 'plain', body: record.plainLyrics, ...common, confidence: confidence * 0.9 });
            }
            return out.sort((a, b) => b.confidence - a.confidence);
        },
    };
}

/** Unsynced NetEase lyrics are uploaded with every line stamped [00:00.00]. */
function isEffectivelyUntimed(lrc) {
    const stamps = new Set();
    for (const match of lrc.matchAll(/\[(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)\]/g)) stamps.add(match[1]);
    return stamps.size < 3;
}

function stripTimestamps(lrc) {
    return lrc.split('\n').map((line) => line.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean).join('\n');
}

function createNeteaseProvider({ fetchImpl, userAgent, timeoutMs = 5000 }) {
    const getJson = jsonFetcher('netease', fetchImpl, { userAgent, timeoutMs, headers: { Referer: 'https://music.163.com/' } });

    return {
        id: 'netease',
        async search(query) {
            const trackVariants = titleVariants(query.track);
            const artistVariants = titleVariants(query.artist);
            const wantTrack = trackVariants.length ? trackVariants : [cleanTitleForSearch(query.rawTitle)];

            const pick = (values, index) => values[Math.min(index, values.length - 1)] ?? '';
            const queries = [];
            for (let index = 0; index < Math.max(trackVariants.length, artistVariants.length, 1); index += 1) {
                const text = `${pick(artistVariants, index)} ${pick(trackVariants, index)}`.trim();
                if (text && !queries.includes(text)) queries.push(text);
            }
            if (!queries.length) {
                const raw = cleanTitleForSearch(query.rawTitle);
                if (raw) queries.push(raw);
            }

            let ranked = [];
            for (const text of queries) {
                const reply = await getJson(`${NETEASE_BASE}/search/get?${new URLSearchParams({ s: text, type: '1', limit: '10' })}`);
                const songs = Array.isArray(reply?.result?.songs) ? reply.result.songs : [];
                ranked = songs
                    .filter((song) => typeof song?.id === 'number' && typeof song.name === 'string' && titleCompatible(wantTrack, song.name))
                    .map((song) => {
                        const artistNames = (song.artists ?? []).map((artist) => artist?.name ?? '').join(' ');
                        const score = 0.55 * bestSimilarity(wantTrack, song.name) +
                            0.25 * (query.artist ? bestSimilarity(artistVariants, artistNames) : 0.5) +
                            durationScore(query.durationSec, song.duration ? song.duration / 1000 : null);
                        return { song, artistNames, confidence: Math.min(score, 0.99) };
                    })
                    .filter((hit) => hit.confidence >= 0.45)
                    .sort((a, b) => b.confidence - a.confidence)
                    .slice(0, MAX_NETEASE_LYRIC_FETCHES);
                if (ranked.length) break;
            }

            const out = [];
            for (const { song, artistNames, confidence } of ranked) {
                const params = new URLSearchParams({ id: String(song.id), lv: '1', kv: '1', tv: '-1' });
                const lyric = await getJson(`${NETEASE_BASE}/song/lyric?${params}`);
                if (lyric?.nolyric || lyric?.uncollected) continue;
                const body = cleanNeteaseLrc(lyric?.lrc?.lyric);
                if (!body) continue;
                const common = {
                    confidence,
                    providerTrack: song.name,
                    providerArtist: artistNames || null,
                    providerDurationSec: song.duration ? Math.round(song.duration / 1000) : null,
                };
                if (isEffectivelyUntimed(body)) {
                    out.push({ kind: 'plain', body: stripTimestamps(body), ...common, confidence: confidence * 0.9 });
                    continue;
                }
                out.push({ kind: 'synced_line', body, ...common });
                break; // the first synced hit wins; spend no more requests
            }
            return out.sort((a, b) => b.confidence - a.confidence);
        },
    };
}

module.exports = { ProviderHttpError, createLrclibProvider, createNeteaseProvider, durationScore, isJunkSynced };

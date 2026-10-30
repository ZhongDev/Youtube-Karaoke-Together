const crypto = require('crypto');
const { createLrclibProvider, createNeteaseProvider } = require('./lyricsProviders');
const { JapaneseTokenizer, READING_MODES, annotateLines, effectiveReadingMode } = require('./lyricsReading');
const {
    decodeHtmlEntities,
    detectLanguage,
    detectTrackLanguage,
    isCjk,
    lyricsKindOf,
    parseLrc,
    plainLines,
} = require('./lyricsText');
const { searchCandidates } = require('./lyricsTitle');
const { AppError, isIdentifier } = require('./security');

// Lyrics lookup and cache. Provider hits are stored per video and source, so a
// song is searched once and then served from SQLite. Misses are remembered too
// (retried after a week; failures after a few minutes) to keep the providers
// from being asked the same question by every room that plays the song.
//
// Sources: 'lrclib' and 'netease' come from the providers; 'ykt' is lyrics an
// administrator pasted in. Rooms may override the source and offset per video;
// the song row holds the administrator's defaults.

const PROVIDER_SOURCES = Object.freeze(['lrclib', 'netease']);
const LYRICS_SOURCES = Object.freeze(['ykt', ...PROVIDER_SOURCES]);
const MAX_OFFSET_MS = 30_000;
// Fits a full CJK paste (3 bytes per character) inside the 100 KB JSON body limit.
const MAX_MANUAL_LYRICS_LENGTH = 30_000;
const MAX_SEARCH_FIELD_LENGTH = 200;
const NOT_FOUND_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 15 * 60 * 1000;
// A song a room has started playing retries failed providers sooner, so an
// outage during its prefetch does not leave it without lyrics.
const PLAYING_ERROR_RETRY_MS = 2 * 60 * 1000;
const MAX_QUEUED_LOOKUPS = 200;
const MAX_REMEMBERED_REQUESTS = 2000;

function normalizeOffset(value) {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_OFFSET_MS) {
        throw new AppError('invalid_lyrics_offset', `Lyrics offset must be a number of milliseconds between −${MAX_OFFSET_MS} and ${MAX_OFFSET_MS}`);
    }
    return Math.round(value);
}

function normalizeSource(value, { allowNull = false } = {}) {
    if (value === null && allowNull) return null;
    if (!LYRICS_SOURCES.includes(value)) throw new AppError('invalid_lyrics_source', 'Lyrics source must be lrclib, netease, or ykt');
    return value;
}

/** A search artist or track as typed: one line, trimmed, bounded; '' when empty. */
function cleanSearchField(value) {
    if (value !== null && value !== undefined && typeof value !== 'string') throw new AppError('invalid_lyrics_search', 'Search artist and track must be text');
    const cleaned = (value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length > MAX_SEARCH_FIELD_LENGTH) throw new AppError('invalid_lyrics_search', `Search fields must be ${MAX_SEARCH_FIELD_LENGTH} characters or less`);
    return cleaned;
}

function hashBody(language, body) {
    return crypto.createHash('sha256').update(`${language}\n${body}`).digest('hex');
}

class LyricsService {
    constructor({ db, config, logger = console, fetchImpl = fetch, tokenizer = null, onSongUpdated = () => {} }) {
        this.db = db;
        this.config = config;
        this.logger = logger;
        this.onSongUpdated = onSongUpdated;
        const userAgent = config.lyricsUserAgent;
        const available = {
            lrclib: () => createLrclibProvider({ fetchImpl, userAgent, busyRetryMs: config.lyricsBusyRetryMs }),
            netease: () => createNeteaseProvider({ fetchImpl, userAgent }),
        };
        this.providers = Object.fromEntries((config.lyricsProviders || PROVIDER_SOURCES)
            .filter((id) => available[id])
            .map((id) => [id, available[id]()]));
        this.tokenizer = tokenizer || new JapaneseTokenizer({ logger });
        this.inflight = new Map();
        this.readingsInflight = new Map();
        this.warming = new Set();
        this.warmChain = Promise.resolve();
        this.stopped = false;
        this.countedRequests = new Set();
        this.waiting = [];
        this.running = 0;
        this.concurrency = config.lyricsLookupConcurrency || 2;
    }

    get enabledProviders() {
        return Object.keys(this.providers);
    }

    stop() {
        this.stopped = true;
        for (const job of this.waiting.splice(0)) {
            this.inflight.delete(job.videoId);
            job.resolve(null);
        }
        this.tokenizer.stop();
    }

    // ── song records ──

    /** Record or refresh a song's YouTube metadata snapshot from a validated room item. */
    noteVideo(video, { durationSec = null } = {}) {
        if (!video?.id || !isIdentifier(video.id, this.config.limits.maxVideoIdLength)) return null;
        return this.db.upsertLyricsSongMetadata({
            videoId: video.id,
            title: video.title || null,
            channelTitle: video.channelTitle || null,
            durationSec: durationSec ?? video.durationSec ?? null,
            refreshedAt: video.apiDataRefreshedAt ?? video.queuedAt ?? Date.now(),
        });
    }

    /**
     * Refresh the snapshot of songs that are already cached from fresh Data API
     * results (a queue addition or room maintenance), without caching new ones.
     */
    refreshMetadata(videos) {
        for (const video of videos || []) {
            if (video?.id && this.db.lyricsSong(video.id)) this.noteVideo(video, { durationSec: video.durationSec });
        }
    }

    /**
     * Count a room needing a song's lyrics, once per queued play however many
     * of its screens ask. `playKey` identifies the play (room and queue item).
     */
    recordRequest(playKey, videoId) {
        if (this.countedRequests.has(playKey)) return;
        this.countedRequests.add(playKey);
        if (this.countedRequests.size > MAX_REMEMBERED_REQUESTS) {
            this.countedRequests.delete(this.countedRequests.values().next().value);
        }
        this.db.recordLyricsRequest(videoId);
    }

    /** Providers whose last outcome for this song is missing or old enough to retry. */
    providersDue(song, now = Date.now(), errorRetryMs = ERROR_RETRY_MS) {
        return this.enabledProviders.filter((id) => {
            const outcome = song?.lookup?.[id];
            if (!outcome) return true;
            if (outcome.status === 'found') return false;
            const wait = outcome.status === 'not_found' ? NOT_FOUND_RETRY_MS : errorRetryMs;
            return now - (outcome.at || 0) >= wait;
        });
    }

    /**
     * Make sure a lookup is cached or under way. Never waits for providers:
     * callers learn the outcome through onSongUpdated. 'high' priority is for
     * a song a room is playing: it jumps the queue, even ahead of its own
     * prefetch, and retries failed providers sooner. The returned promise
     * settles when the lookup does (null when none was needed).
     */
    ensure(video, { durationSec = null, priority = 'high' } = {}) {
        const song = this.noteVideo(video, { durationSec });
        if (!song) return null;
        const errorRetryMs = priority === 'high' ? PLAYING_ERROR_RETRY_MS : ERROR_RETRY_MS;
        if (!this.inflight.has(song.videoId) && this.providersDue(song, Date.now(), errorRetryMs).length === 0) return null;
        return this.schedule(song.videoId, { priority, errorRetryMs }).catch((error) => {
            this.logger.warn(`[WARN] Lyrics lookup failed for ${song.videoId}: ${error.message}`);
        });
    }

    /**
     * Look a queued song up ahead of its turn and prepare its reading aid, so
     * its lyrics are ready the moment it starts.
     */
    prefetch(video) {
        if (this.stopped) return;
        Promise.resolve(this.ensure(video, { priority: 'low' })).then(() => this.warmReadings(video.id));
    }

    /**
     * Compute and store a CJK song's default reading aid (romaji, romanization,
     * or pinyin) in the background, one song at a time so a song that starts
     * playing never waits behind a batch of prefetches.
     */
    warmReadings(videoId) {
        const song = this.stopped ? null : this.db.lyricsSong(videoId);
        if (!song || !isCjk(song.language) || this.warming.has(videoId)) return;
        this.warming.add(videoId);
        this.warmChain = this.warmChain
            .then(() => (this.stopped ? null : this.document(videoId)))
            .catch((error) => this.logger.warn(`[WARN] Lyrics reading aid prefetch failed for ${videoId}: ${error.message}`))
            .finally(() => this.warming.delete(videoId));
    }

    schedule(videoId, { priority = 'high', force = false, errorRetryMs = ERROR_RETRY_MS, terms = null } = {}) {
        const existing = this.inflight.get(videoId);
        if (existing) {
            // A room now needs a song that was only prefetched: move it up.
            const queued = this.waiting.findIndex((job) => job.videoId === videoId);
            if (priority === 'high' && queued >= 0) {
                const [job] = this.waiting.splice(queued, 1);
                job.errorRetryMs = Math.min(job.errorRetryMs, errorRetryMs);
                this.waiting.unshift(job);
            }
            return existing;
        }
        if (priority !== 'high' && this.waiting.length >= MAX_QUEUED_LOOKUPS) return Promise.resolve(null);
        const promise = new Promise((resolve, reject) => {
            const job = { videoId, force, errorRetryMs, terms, resolve, reject };
            if (priority === 'high') this.waiting.unshift(job);
            else this.waiting.push(job);
        });
        this.inflight.set(videoId, promise);
        this.onSongUpdated(videoId);
        this.drain();
        return promise;
    }

    drain() {
        while (this.running < this.concurrency && this.waiting.length) {
            const job = this.waiting.shift();
            this.running += 1;
            const work = job.terms
                ? this.lookupWithTerms(job.videoId, job.terms)
                : this.lookup(job.videoId, { force: job.force, errorRetryMs: job.errorRetryMs });
            work.then(job.resolve, job.reject)
                .finally(() => {
                    this.running -= 1;
                    this.inflight.delete(job.videoId);
                    this.onSongUpdated(job.videoId);
                    this.drain();
                });
        }
    }

    async lookup(videoId, { force = false, errorRetryMs = ERROR_RETRY_MS } = {}) {
        const song = this.db.lyricsSong(videoId);
        if (!song) return null;
        const due = force ? this.enabledProviders : this.providersDue(song, Date.now(), errorRetryMs);
        if (!due.length) return song;
        const title = decodeHtmlEntities(song.title || '');
        const channelTitle = decodeHtmlEntities(song.channelTitle || '');
        const candidates = this.candidatesFor(song);
        const now = Date.now();
        if (!candidates.length) {
            const outcomes = Object.fromEntries(due.map((id) => [id, { status: 'not_found', at: now, reason: 'no_metadata' }]));
            return this.db.saveLyricsLookup(videoId, { outcomes });
        }
        const language = detectLanguage(`${title} ${channelTitle} ${song.searchArtist || ''} ${song.searchTrack || ''}`);
        // Set search terms replace the title everywhere, free-text fallbacks included.
        const searchText = [song.searchArtist, song.searchTrack].filter(Boolean).join(' ');
        const results = await Promise.all(due.map((id) => this.searchProvider(id, candidates, {
            rawTitle: searchText || title, language, durationSec: song.durationSec,
        })));
        const outcomes = {};
        const hits = [];
        for (const result of results) {
            outcomes[result.source] = { status: result.status, at: Date.now(), ...(result.reason ? { reason: result.reason } : {}) };
            if (result.hit) hits.push({ source: result.source, ...result.hit });
        }
        const bodies = [...this.db.lyricsSources(videoId), ...hits];
        const preferred = bodies.find((entry) => entry.source === 'ykt') || bodies.find((entry) => entry.kind !== 'plain') || bodies[0];
        const saved = this.db.saveLyricsLookup(videoId, {
            outcomes,
            hits,
            language: preferred ? detectTrackLanguage(title, preferred.body) : language,
        });
        this.logger.info(`[INFO] Lyrics lookup ${videoId}: ${results.map((result) => `${result.source}=${result.status}`).join(' ')}`);
        return saved;
    }

    /**
     * The searches a lookup runs, in order: the song's set search terms, or
     * candidates parsed from its title and channel (`automatic` ignores set terms).
     */
    candidatesFor(song, { automatic = false } = {}) {
        return searchCandidates({
            title: decodeHtmlEntities(song.title || ''),
            channelTitle: decodeHtmlEntities(song.channelTitle || ''),
            ...(automatic ? {} : { artist: song.searchArtist, track: song.searchTrack }),
        });
    }

    /**
     * A search with corrected terms. Provider results are replaced only when
     * the terms find something, so a typo or a junk search cannot erase a
     * song's lyrics; when they do, the terms are kept for future lookups.
     */
    async lookupWithTerms(videoId, { artist, track }) {
        const song = this.db.lyricsSong(videoId);
        if (!song) return { found: [], outcomes: {} };
        const searchText = `${artist} ${track}`.trim();
        const results = await Promise.all(this.enabledProviders.map((id) => this.searchProvider(id, [{ artist, track }], {
            rawTitle: searchText, language: detectLanguage(searchText), durationSec: song.durationSec,
        })));
        const outcomes = Object.fromEntries(results.map((result) => [result.source, {
            status: result.status, at: Date.now(), ...(result.reason ? { reason: result.reason } : {}),
        }]));
        const hits = results.filter((result) => result.hit).map((result) => ({ source: result.source, ...result.hit }));
        const summary = Object.fromEntries(results.map((result) => [result.source, result.status]));
        if (!hits.length) return { found: [], outcomes: summary };
        const manual = this.db.lyricsSources(videoId).find((entry) => entry.source === 'ykt');
        const preferred = manual || hits.find((entry) => entry.kind !== 'plain') || hits[0];
        this.db.replaceLyricsProviderResults(videoId, {
            outcomes,
            hits,
            language: detectTrackLanguage(decodeHtmlEntities(song.title || ''), preferred.body),
            searchArtist: artist || null,
            searchTrack: track,
        });
        this.logger.info(`[INFO] Lyrics search ${videoId} with corrected terms: ${results.map((result) => `${result.source}=${result.status}`).join(' ')}`);
        return { found: hits.map((hit) => hit.source), outcomes: summary };
    }

    /** One provider across the title candidates: the first synced hit wins, else the best plain one. */
    async searchProvider(id, candidates, { rawTitle, language, durationSec }) {
        const provider = this.providers[id];
        let bestPlain = null;
        let failure = null;
        for (const candidate of candidates) {
            let results;
            try {
                results = await provider.search({
                    artist: candidate.artist,
                    track: candidate.track,
                    rawTitle,
                    language,
                    durationSec: durationSec || undefined,
                });
            } catch (error) {
                failure = error;
                // A timeout or HTTP failure will not be fixed by the next candidate.
                break;
            }
            const synced = results.find((result) => result.kind !== 'plain');
            if (synced) return { source: id, status: 'found', hit: synced };
            const plain = results.find((result) => result.kind === 'plain');
            if (plain && (!bestPlain || plain.confidence > bestPlain.confidence)) bestPlain = plain;
        }
        if (bestPlain) return { source: id, status: 'found', hit: bestPlain };
        if (failure) {
            this.logger.warn(`[WARN] Lyrics provider ${id} failed: ${failure.message}`);
            return { source: id, status: 'error', reason: failure.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
        }
        return { source: id, status: 'not_found' };
    }

    // ── room-facing state and documents ──

    pickSource(song, sources, override = null) {
        const ids = sources.map((entry) => entry.source);
        if (override && ids.includes(override)) return override;
        if (song?.defaultSource && ids.includes(song.defaultSource)) return song.defaultSource;
        if (ids.includes('ykt')) return 'ykt';
        const order = isCjk(song?.language) ? ['netease', 'lrclib'] : ['lrclib', 'netease'];
        const ranked = order.map((id) => sources.find((entry) => entry.source === id)).filter(Boolean);
        return (ranked.find((entry) => entry.kind !== 'plain') || ranked[0])?.source || null;
    }

    status(song, sources, videoId) {
        if (this.inflight.has(videoId)) return 'loading';
        if (sources.length) return 'ready';
        if (!this.enabledProviders.length) return 'none';
        if (!song) return 'idle';
        const outcomes = this.enabledProviders.map((id) => song.lookup?.[id]?.status);
        if (outcomes.some((outcome) => !outcome)) return 'idle';
        return outcomes.every((outcome) => outcome === 'error') ? 'error' : 'none';
    }

    /** What a room needs to know to show a song's lyrics, without the text itself. */
    songState(videoId, override = {}) {
        const song = videoId ? this.db.lyricsSong(videoId) : null;
        const sources = song ? this.db.lyricsSources(videoId) : [];
        const source = this.pickSource(song, sources, override.source || null);
        const chosen = sources.find((entry) => entry.source === source);
        const defaultOffsetMs = song?.defaultOffsetMs || 0;
        return {
            status: this.status(song, sources, videoId),
            sources: sources.map((entry) => ({ id: entry.source, kind: entry.kind })),
            source,
            kind: chosen?.kind || null,
            language: song?.language || null,
            defaultSource: song?.defaultSource || null,
            defaultOffsetMs,
            sourceOverridden: Boolean(override.source && override.source === source),
            offsetMs: Number.isFinite(override.offsetMs) ? override.offsetMs : defaultOffsetMs,
            offsetOverridden: Number.isFinite(override.offsetMs),
            revision: chosen ? `${videoId}:${source}:${chosen.updatedAt}` : null,
        };
    }

    /**
     * What each stored source matched (provider track, artist, length, and
     * confidence) and what was searched, for a room member checking whether
     * the lyrics belong to the right recording. Never includes the text.
     */
    matchDetails(videoId) {
        const song = videoId ? this.db.lyricsSong(videoId) : null;
        if (!song) return null;
        return {
            videoId: song.videoId,
            durationSec: song.durationSec,
            status: this.status(song, this.db.lyricsSources(song.videoId), song.videoId),
            searchTerms: song.searchArtist || song.searchTrack ? { artist: song.searchArtist || '', track: song.searchTrack || '' } : null,
            searchPlan: this.candidatesFor(song).map(({ artist, track }) => ({ artist, track })),
            providers: this.enabledProviders,
            lookup: Object.fromEntries(this.enabledProviders.map((id) => {
                const outcome = song.lookup?.[id];
                return [id, outcome ? { status: outcome.status, at: outcome.at || null } : null];
            })),
            matches: this.db.lyricsSources(song.videoId).map((entry) => ({
                source: entry.source,
                kind: entry.kind,
                track: entry.providerTrack,
                artist: entry.providerArtist,
                durationSec: entry.providerDurationSec,
                confidence: entry.confidence,
                updatedAt: entry.updatedAt,
            })),
        };
    }

    /**
     * Search again with terms a room member typed, for a song whose lyrics
     * matched the wrong recording (or were not found). Waits for the result.
     */
    async searchWithTerms(video, input, { roomId = null, controllerId = null } = {}) {
        const artist = cleanSearchField(input?.artist);
        const track = cleanSearchField(input?.track);
        if (!track) throw new AppError('invalid_lyrics_search', 'Enter the song title to search for');
        if (!this.enabledProviders.length) throw new AppError('lyrics_providers_disabled', 'Lyrics lookups are turned off on this server', 409);
        const song = this.noteVideo(video);
        if (!song) throw new AppError('invalid_video', 'Invalid YouTube video ID');
        // One lookup per song at a time: let a running one finish first.
        while (this.inflight.has(song.videoId)) await this.inflight.get(song.videoId).catch(() => null);
        // Null only when the server is shutting down.
        const result = (await this.schedule(song.videoId, { priority: 'high', terms: { artist, track } })) || { found: [], outcomes: {} };
        this.db.audit(null, 'lyrics_search_corrected', 'lyrics_song', song.videoId, {
            roomId, controllerId, artist, track, found: result.found,
        });
        return result;
    }

    /**
     * The display document for a song: parsed lines (with word timings when the
     * source has them) and, for CJK lyrics, reading-aid segments per line.
     */
    async document(videoId, { source = null, readingMode = 'romaji' } = {}) {
        const song = this.db.lyricsSong(videoId);
        if (!song) return null;
        const sources = this.db.lyricsSources(videoId);
        const chosen = sources.find((entry) => entry.source === this.pickSource(song, sources, source));
        if (!chosen) return null;
        const parsed = chosen.kind === 'plain' ? null : parseLrc(chosen.body);
        const lines = parsed
            ? parsed.lines.map((line) => ({
                t: line.timeMs,
                text: line.text,
                ...(line.words ? { words: line.words.map((word) => ({ t: word.timeMs, text: word.text })) } : {}),
            }))
            : plainLines(chosen.body).map((text) => ({ text }));
        const language = song.language || detectTrackLanguage(song.title || '', chosen.body);
        const mode = READING_MODES.includes(readingMode) ? effectiveReadingMode(language, readingMode) : 'romaji';
        const readings = await this.readings(videoId, chosen, language, mode, lines);
        return {
            videoId,
            source: chosen.source,
            kind: parsed ? parsed.kind : 'plain',
            synced: Boolean(parsed),
            language,
            readingMode: readings ? mode : 'none',
            revision: `${videoId}:${chosen.source}:${chosen.updatedAt}`,
            lines: readings ? lines.map((line, index) => ({ ...line, ruby: readings[index] })) : lines,
        };
    }

    async readings(videoId, chosen, language, mode, lines) {
        if (mode === 'none' || !isCjk(language) || !lines.length) return null;
        const bodyHash = hashBody(language, chosen.body);
        const cached = this.db.lyricsReading(videoId, chosen.source, mode);
        if (cached?.bodyHash === bodyHash && Array.isArray(cached.lines) && cached.lines.length === lines.length) return cached.lines;
        // When a song starts, the room and every controller on its Lyrics tab
        // ask at once: compute the reading once and share it.
        const key = `${videoId}\n${chosen.source}\n${mode}\n${bodyHash}`;
        if (!this.readingsInflight.has(key)) {
            const computation = annotateLines(language, lines.map((line) => line.text), mode, this.tokenizer)
                .then((computed) => {
                    if (computed) this.db.saveLyricsReading(videoId, chosen.source, mode, bodyHash, computed);
                    return computed;
                })
                .catch((error) => {
                    // A reading aid is an embellishment: show the lyrics without it.
                    this.logger.warn(`[WARN] Lyrics reading aid failed for ${videoId}: ${error.message}`);
                    return null;
                })
                .finally(() => this.readingsInflight.delete(key));
            this.readingsInflight.set(key, computation);
        }
        return this.readingsInflight.get(key);
    }

    // ── administration ──

    /**
     * Record that an administrator added or edited a song. Curated songs are
     * never deleted by retention: once their YouTube snapshot cannot be
     * refreshed, only that snapshot is removed.
     */
    markCurated(videoId) {
        this.db.markLyricsSongCurated(videoId);
    }

    list(options) {
        return this.db.listLyricsSongs(options);
    }

    detail(videoId) {
        const song = this.requireSong(videoId);
        return {
            ...song,
            status: this.status(song, this.db.lyricsSources(videoId), videoId),
            sources: this.db.lyricsSources(videoId),
            selectedSource: this.pickSource(song, this.db.lyricsSources(videoId)),
            providers: this.enabledProviders,
            // What the title parser searches for when no search terms are set.
            searchPlan: this.candidatesFor(song, { automatic: true }).map(({ artist, track }) => ({ artist, track })),
        };
    }

    requireSong(videoId) {
        const song = isIdentifier(videoId, this.config.limits.maxVideoIdLength) ? this.db.lyricsSong(videoId) : null;
        if (!song) throw new AppError('lyrics_song_not_found', 'This video is not in the lyrics cache', 404);
        return song;
    }

    updateSong(videoId, input, actorId) {
        const song = this.requireSong(videoId);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('invalid_lyrics_update', 'Lyrics settings must be an object');
        const patch = {};
        if (Object.hasOwn(input, 'defaultSource')) patch.defaultSource = normalizeSource(input.defaultSource, { allowNull: true });
        if (Object.hasOwn(input, 'defaultOffsetMs')) patch.defaultOffsetMs = normalizeOffset(input.defaultOffsetMs);
        for (const key of ['searchArtist', 'searchTrack']) {
            if (Object.hasOwn(input, key)) patch[key] = cleanSearchField(input[key]) || null;
        }
        if (!Object.keys(patch).length) throw new AppError('invalid_lyrics_update', 'No lyrics settings were provided');
        const updated = this.db.updateLyricsSong(song.videoId, patch);
        this.markCurated(song.videoId);
        this.db.audit(actorId, 'lyrics_song_updated', 'lyrics_song', song.videoId, { fields: Object.keys(patch) });
        this.onSongUpdated(song.videoId);
        return updated;
    }

    /** Store administrator lyrics as the 'ykt' source; empty text removes them. */
    setManualLyrics(videoId, text, actorId) {
        const song = this.requireSong(videoId);
        if (typeof text !== 'string') throw new AppError('invalid_lyrics', 'Lyrics must be text');
        const body = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();
        if (body.length > MAX_MANUAL_LYRICS_LENGTH) throw new AppError('invalid_lyrics', `Lyrics must be ${MAX_MANUAL_LYRICS_LENGTH.toLocaleString('en-US')} characters or less`);
        if (!body) {
            this.db.deleteLyricsSource(song.videoId, 'ykt');
            if (song.defaultSource === 'ykt') this.db.updateLyricsSong(song.videoId, { defaultSource: null });
            this.db.audit(actorId, 'lyrics_manual_removed', 'lyrics_song', song.videoId, {});
        } else {
            const kind = lyricsKindOf(body);
            this.db.setLyricsSource(song.videoId, { source: 'ykt', kind, body, updatedBy: actorId });
            this.db.audit(actorId, 'lyrics_manual_saved', 'lyrics_song', song.videoId, { kind, length: body.length });
        }
        const preferred = this.db.lyricsSources(song.videoId)[0];
        this.db.updateLyricsSong(song.videoId, { language: preferred ? detectTrackLanguage(song.title || '', preferred.body) : song.language });
        this.markCurated(song.videoId);
        this.onSongUpdated(song.videoId);
        return this.detail(song.videoId);
    }

    /** Discard provider results and search again now, waiting for the outcome. */
    async refetch(videoId, actorId) {
        const song = this.requireSong(videoId);
        // Clearing first would lose the stored lyrics to a search with nothing to search for.
        if (!song.title && !song.searchArtist && !song.searchTrack) {
            throw new AppError('lyrics_search_terms_required', "This song's YouTube details were removed by retention. Set a search artist or track, or play it in a room, before refetching", 409);
        }
        const existing = this.inflight.get(song.videoId);
        if (existing) await existing.catch(() => null);
        this.db.clearLyricsProviderResults(song.videoId);
        this.markCurated(song.videoId);
        this.db.audit(actorId, 'lyrics_refetched', 'lyrics_song', song.videoId, {});
        await this.schedule(song.videoId, { priority: 'high', force: true });
        return this.detail(song.videoId);
    }

    deleteSong(videoId, actorId) {
        const song = this.requireSong(videoId);
        this.db.deleteLyricsSongs([song.videoId]);
        this.db.audit(actorId, 'lyrics_song_deleted', 'lyrics_song', song.videoId, {});
        this.onSongUpdated(song.videoId);
    }

    // ── retention ──

    /**
     * Refresh metadata snapshots approaching the retention boundary through the
     * YouTube Data API. Videos that are gone or no longer public are deleted
     * along with their lyrics.
     */
    async refreshStale({ cutoff, lookupVideos, maxVideos = 500 }) {
        const ids = this.db.staleLyricsSongIds(cutoff, maxVideos);
        let refreshed = 0;
        let removed = 0;
        let kept = 0;
        for (let index = 0; index < ids.length; index += 50) {
            const batch = ids.slice(index, index + 50);
            const videos = await lookupVideos(batch);
            const found = new Set();
            for (const video of videos) {
                found.add(video.id);
                this.noteVideo(video, { durationSec: video.durationSec });
                refreshed += 1;
            }
            const retired = this.db.retireLyricsSongs(batch.filter((id) => !found.has(id)));
            removed += retired.removed;
            kept += retired.kept;
        }
        return { refreshed, removed, kept };
    }
}

module.exports = {
    ERROR_RETRY_MS,
    LYRICS_SOURCES,
    LyricsService,
    MAX_MANUAL_LYRICS_LENGTH,
    MAX_OFFSET_MS,
    NOT_FOUND_RETRY_MS,
    PLAYING_ERROR_RETRY_MS,
    PROVIDER_SOURCES,
    normalizeOffset,
    normalizeSource,
};

const { AppError, cleanText, isIdentifier } = require('./security');

const QUOTA_CATALOG = Object.freeze({
    version: '2026-07-08',
    methods: {
        'search.list': { bucket: 'search_calls', cost: 1, defaultDailyLimit: 100 },
        'videos.list': { bucket: 'general_units', cost: 1, defaultDailyLimit: 10000 },
        'playlistItems.list': { bucket: 'general_units', cost: 1, defaultDailyLimit: 10000 },
        'videos.insert': { bucket: 'video_upload_calls', cost: 1, defaultDailyLimit: 100, usedByApplication: false },
    },
});

const QUOTA_BUCKET_DEFAULTS = Object.freeze(Object.values(QUOTA_CATALOG.methods).reduce((buckets, quota) => {
    buckets[quota.bucket] = quota.defaultDailyLimit;
    return buckets;
}, {}));

function pacificDate(timestamp) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(timestamp));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
}

class YouTubeService {
    constructor({ db, config, logger = console, fetchImpl = fetch }) {
        this.db = db;
        this.config = config;
        this.logger = logger;
        this.fetch = fetchImpl;
    }

    async request(method, endpoint, params, roomId = null) {
        if (!this.config.youtubeApiKey) throw new AppError('youtube_not_configured', 'YouTube API key not configured', 503);
        const quota = QUOTA_CATALOG.methods[method];
        if (!quota) throw new Error(`Unknown YouTube quota method: ${method}`);
        const started = Date.now();
        const usageId = this.db.beginYoutubeUsage({
            attemptedAt: started,
            apiKeyAlias: this.config.youtubeApiKeyAlias,
            method,
            quotaBucket: quota.bucket,
            quotaCost: quota.cost,
            catalogVersion: QUOTA_CATALOG.version,
            roomId,
        });
        let status = null;
        let errorClass = null;
        try {
            const query = new URLSearchParams({ ...params, key: this.config.youtubeApiKey });
            const response = await this.fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${query}`, {
                signal: AbortSignal.timeout(10000),
                headers: { Accept: 'application/json' },
            });
            status = response.status;
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                errorClass = body?.error?.errors?.[0]?.reason || `http_${response.status}`;
                throw new AppError('youtube_request_failed', 'YouTube request failed', response.status >= 500 ? 502 : 400);
            }
            return body;
        } catch (error) {
            errorClass ||= error.name === 'TimeoutError' ? 'timeout' : (error.code || error.name || 'request_error');
            if (error instanceof AppError) throw error;
            throw new AppError('youtube_unavailable', 'YouTube is temporarily unavailable', 502);
        } finally {
            this.db.finishYoutubeUsage(usageId, {
                completedAt: Date.now(),
                httpStatus: status,
                errorClass,
                latencyMs: Date.now() - started,
            });
        }
    }

    async search(query, pageToken, roomId) {
        const normalized = cleanText(query, this.config.limits.maxSearchQueryLength + 1);
        if (!normalized) throw new AppError('invalid_search', 'Search query is required');
        if (normalized.length > this.config.limits.maxSearchQueryLength) {
            throw new AppError('invalid_search', `Search query must be ${this.config.limits.maxSearchQueryLength} characters or less`);
        }
        if (pageToken && !isIdentifier(pageToken, 256)) throw new AppError('invalid_page_token', 'Invalid page token');
        const data = await this.request('search.list', 'search', {
            part: 'snippet',
            q: normalized,
            type: 'video,playlist',
            maxResults: '10',
            safeSearch: 'none',
            ...(pageToken ? { pageToken } : {}),
        }, roomId);
        return {
            ...data,
            items: (data.items || []).filter((item) => ['youtube#video', 'youtube#playlist'].includes(item?.id?.kind))
                .map((item) => ({ ...item, isPlaylist: item.id.kind === 'youtube#playlist' })),
        };
    }

    async lookupVideos(ids, roomId) {
        const uniqueIds = [...new Set(ids)].filter((id) => isIdentifier(id, this.config.limits.maxVideoIdLength));
        if (uniqueIds.length === 0) return [];
        const videos = [];
        for (let index = 0; index < uniqueIds.length; index += 50) {
            const batch = uniqueIds.slice(index, index + 50);
            const data = await this.request('videos.list', 'videos', {
                part: 'snippet,status',
                id: batch.join(','),
                maxResults: '50',
            }, roomId);
            for (const item of data.items || []) {
                if (!item?.id || !item.snippet || item.status?.privacyStatus !== 'public' || item.status?.uploadStatus === 'deleted' || item.status?.embeddable === false) continue;
                videos.push({
                    id: item.id,
                    title: cleanText(item.snippet.title, this.config.limits.maxVideoTitleLength),
                    channelTitle: cleanText(item.snippet.channelTitle, 200),
                    thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                    madeForKids: Boolean(item.status?.madeForKids),
                    apiDataRefreshedAt: Date.now(),
                });
            }
        }
        const order = new Map(uniqueIds.map((id, index) => [id, index]));
        return videos.sort((a, b) => order.get(a.id) - order.get(b.id));
    }

    async expandPlaylist(playlistId, roomId, requestedLimit = this.config.limits.maxPlaylistItemsPerAdd) {
        if (!isIdentifier(playlistId, 128)) throw new AppError('invalid_playlist', 'Invalid playlist ID');
        const limit = Math.min(Math.max(Number(requestedLimit) || 1, 1), this.config.limits.maxPlaylistItemsPerAdd);
        const ids = [];
        let pageToken;
        while (ids.length < limit) {
            const data = await this.request('playlistItems.list', 'playlistItems', {
                part: 'snippet',
                playlistId,
                maxResults: String(Math.min(50, limit - ids.length)),
                ...(pageToken ? { pageToken } : {}),
            }, roomId);
            for (const item of data.items || []) {
                const id = item?.snippet?.resourceId?.videoId;
                if (id && isIdentifier(id, this.config.limits.maxVideoIdLength)) ids.push(id);
                if (ids.length >= limit) break;
            }
            pageToken = data.nextPageToken;
            if (!pageToken) break;
        }
        const videos = await this.lookupVideos(ids, roomId);
        return videos.map((video) => ({ ...video, sourcePlaylistId: playlistId }));
    }

    quotaLimits() {
        const overrides = this.db.youtubeQuotaLimits();
        return Object.entries(QUOTA_BUCKET_DEFAULTS).map(([bucket, defaultDailyLimit]) => ({
            bucket,
            defaultDailyLimit,
            effectiveDailyLimit: overrides[bucket] || defaultDailyLimit,
            isCustom: overrides[bucket] !== undefined,
        }));
    }

    updateQuotaLimits(input, actorId) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new AppError('invalid_quota_limits', 'Quota limits must be an object');
        }
        const updates = {};
        for (const [bucket, value] of Object.entries(input)) {
            if (!Object.hasOwn(QUOTA_BUCKET_DEFAULTS, bucket)) {
                throw new AppError('invalid_quota_bucket', `Unknown quota bucket: ${bucket}`);
            }
            if (value === null) {
                updates[bucket] = null;
                continue;
            }
            if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) {
                throw new AppError('invalid_quota_limit', `Quota limit for ${bucket} must be a whole number from 1 to 1,000,000,000`);
            }
            updates[bucket] = value;
        }
        if (Object.keys(updates).length === 0) throw new AppError('invalid_quota_limits', 'At least one quota limit is required');
        this.db.updateYoutubeQuotaLimits(updates, actorId);
        return this.usageSummary();
    }

    usageSummary(days = 30) {
        const since = Date.now() - Math.min(Math.max(days, 1), 30) * 24 * 60 * 60 * 1000;
        const rows = this.db.youtubeUsageSince(since);
        const quotaLimits = this.quotaLimits();
        const limitsByBucket = Object.fromEntries(quotaLimits.map((limit) => [limit.bucket, limit]));
        const grouped = new Map();
        for (const row of rows) {
            const day = pacificDate(row.attempted_at);
            const key = `${day}:${row.quota_bucket}:${row.method}`;
            const item = grouped.get(key) || {
                day,
                bucket: row.quota_bucket,
                method: row.method,
                requests: 0,
                cost: 0,
                failures: 0,
                defaultDailyLimit: QUOTA_CATALOG.methods[row.method]?.defaultDailyLimit || null,
                effectiveDailyLimit: limitsByBucket[row.quota_bucket]?.effectiveDailyLimit || null,
            };
            item.requests += 1;
            item.cost += row.quota_cost;
            if (row.error_class || (row.http_status && row.http_status >= 400)) item.failures += 1;
            grouped.set(key, item);
        }
        const methodRows = [...grouped.values()];
        const buckets = new Map();
        for (const row of methodRows) {
            const key = `${row.day}:${row.bucket}`;
            const item = buckets.get(key) || {
                day: row.day,
                bucket: row.bucket,
                requests: 0,
                cost: 0,
                failures: 0,
                defaultDailyLimit: row.defaultDailyLimit,
                effectiveDailyLimit: row.effectiveDailyLimit,
            };
            item.requests += row.requests;
            item.cost += row.cost;
            item.failures += row.failures;
            buckets.set(key, item);
        }
        return {
            catalogVersion: QUOTA_CATALOG.version,
            resetTimezone: 'America/Los_Angeles',
            authoritativeSource: 'Google Cloud Console',
            quotaLimits,
            catalog: Object.entries(QUOTA_CATALOG.methods).map(([method, quota]) => ({
                method,
                ...quota,
                effectiveDailyLimit: limitsByBucket[quota.bucket].effectiveDailyLimit,
            })),
            buckets: [...buckets.values()].sort((a, b) => b.day.localeCompare(a.day) || a.bucket.localeCompare(b.bucket)),
            rows: methodRows.sort((a, b) => b.day.localeCompare(a.day) || a.bucket.localeCompare(b.bucket) || a.method.localeCompare(b.method)),
        };
    }
}

module.exports = { QUOTA_BUCKET_DEFAULTS, QUOTA_CATALOG, YouTubeService, pacificDate };

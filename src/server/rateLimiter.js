/**
 * Fixed-window counters that outlive a single connection.
 *
 * A budget stored in a socket's closure resets the moment the client reconnects,
 * which makes it useless against anything a client can trigger deliberately.
 * Budgets protecting a shared resource are therefore keyed on the authenticated
 * actor and held here, so dropping the socket buys nothing.
 */
class FixedWindowLimiter {
    constructor({ windowMs = 60_000, maxKeys = 5000 } = {}) {
        this.windowMs = windowMs;
        this.maxKeys = maxKeys;
        this.buckets = new Map();
    }

    /** Records one use of `key` and reports whether it stayed within `limit`. */
    consume(key, limit, now = Date.now()) {
        if (this.buckets.size >= this.maxKeys) this.prune(now);
        const bucket = this.buckets.get(key);
        if (!bucket || now - bucket.startedAt >= this.windowMs) {
            this.buckets.set(key, { startedAt: now, count: 1 });
            return limit >= 1;
        }
        bucket.count += 1;
        return bucket.count <= limit;
    }

    /** Drops windows that have already elapsed so idle keys cannot accumulate. */
    prune(now = Date.now()) {
        for (const [key, bucket] of this.buckets) {
            if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(key);
        }
        return this.buckets.size;
    }

    get size() {
        return this.buckets.size;
    }
}

module.exports = { FixedWindowLimiter };

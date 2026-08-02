const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FixedWindowLimiter } = require('../../src/server/rateLimiter');

test('a fixed window admits up to the limit and then refuses until it rolls over', () => {
    const limiter = new FixedWindowLimiter({ windowMs: 60_000 });
    const start = 1_000_000;

    assert.equal(limiter.consume('singer:video-add', 2, start), true);
    assert.equal(limiter.consume('singer:video-add', 2, start + 100), true);
    assert.equal(limiter.consume('singer:video-add', 2, start + 200), false);
    // Still refused right up to the edge of the window.
    assert.equal(limiter.consume('singer:video-add', 2, start + 59_999), false);
    assert.equal(limiter.consume('singer:video-add', 2, start + 60_000), true);
});

test('keys hold independent budgets', () => {
    const limiter = new FixedWindowLimiter({ windowMs: 60_000 });
    const start = 1_000_000;

    assert.equal(limiter.consume('singer-a:video-add', 1, start), true);
    assert.equal(limiter.consume('singer-a:video-add', 1, start), false);
    // A different controller, and a different action for the same controller,
    // must each start with their own allowance.
    assert.equal(limiter.consume('singer-b:video-add', 1, start), true);
    assert.equal(limiter.consume('singer-a:playlist-add', 1, start), true);
});

test('elapsed windows are pruned so idle keys cannot accumulate', () => {
    const limiter = new FixedWindowLimiter({ windowMs: 60_000, maxKeys: 3 });
    const start = 1_000_000;

    for (const key of ['a', 'b', 'c']) limiter.consume(key, 5, start);
    assert.equal(limiter.size, 3);

    // Reaching maxKeys sweeps windows that have already elapsed, so a long-lived
    // process does not retain a bucket for every controller it has ever seen.
    limiter.consume('d', 5, start + 120_000);
    assert.equal(limiter.size, 1);
    assert.equal(limiter.prune(start + 240_000), 0);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { io: createClient } = require('socket.io-client');
const { loadConfig, parseLyricsProviders } = require('../../src/server/config');
const { createServer } = require('../../src/server/createServer');
const { AppDatabase } = require('../../src/server/database');
const { JapaneseTokenizer, kanaToRomaji, romanizeHangul, segmentsJa, segmentsKo, segmentsZh } = require('../../src/server/lyricsReading');
const { LyricsService, NOT_FOUND_RETRY_MS, PLAYING_ERROR_RETRY_MS } = require('../../src/server/lyricsService');
const {
    cleanNeteaseLrc, decodeHtmlEntities, detectLanguage, lyricsKindOf, parseLrc, plainLines,
} = require('../../src/server/lyricsText');
const { channelArtist, parseVideoTitle, searchCandidates, titleCompatible, titleVariants } = require('../../src/server/lyricsTitle');
const { RoomService } = require('../../src/server/roomService');

const runtimes = [];
const services = [];

function quietLogger() {
    return { info() {}, warn() {}, error() {} };
}

afterEach(async () => {
    while (runtimes.length) await runtimes.pop().stop();
    while (services.length) services.pop().stop();
});

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const SYNCED = '[00:01.00]First line here\n[00:05.00]Second line here\n[00:09.00]Third line here\n[00:13.00]Fourth line here\n[00:17.00]Fifth line';
const NETEASE_SYNCED = '[00:00.000] 作词 : Someone\n[00:02.00]夜に駆ける\n[00:06.00]沈むように溶けてゆくように\n[00:10.00]二人だけの空が広がる夜に\n[00:14.00]さよなら';

/**
 * A fake network for LRCLIB, NetEase, and the YouTube Data API. Every request
 * is recorded so tests can prove a cache hit spends nothing.
 */
function fakeNetwork({ lrclib = 'hit', lrclibGet = 404, lrclibBusy = 0, netease = 'hit', youtube = {}, neteaseSong = { name: 'Test Song', artist: 'Test Artist' } } = {}) {
    const calls = [];
    let busy = lrclibBusy;
    const fetchImpl = async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        if (url.hostname === 'lrclib.net') {
            if (lrclib === 'error') return json({ message: 'down' }, 503);
            if (url.pathname === '/api/get') return json({ code: lrclibGet }, lrclibGet);
            if (busy > 0) {
                busy -= 1;
                return json({ name: 'ServerOverloaded' }, 503);
            }
            if (lrclib === 'miss') return json([]);
            return json([{
                id: 7, trackName: 'Test Song', artistName: 'Test Artist', albumName: null, duration: 200,
                instrumental: false, plainLyrics: 'First line here', syncedLyrics: SYNCED,
            }]);
        }
        if (url.hostname === 'music.163.com') {
            if (netease === 'error') return json({}, 500);
            if (url.pathname === '/api/search/get') {
                if (netease === 'miss') return json({ result: { songs: [] } });
                return json({ result: { songs: [{ id: 99, name: neteaseSong.name, artists: [{ name: neteaseSong.artist }], duration: 200_000 }] } });
            }
            if (url.pathname === '/api/song/lyric') return json({ lrc: { lyric: NETEASE_SYNCED } });
        }
        if (url.hostname === 'www.googleapis.com') {
            const ids = (url.searchParams.get('id') || '').split(',');
            return json({
                items: ids.filter((id) => youtube[id]).map((id) => ({
                    id,
                    snippet: { title: youtube[id].title, channelTitle: youtube[id].channelTitle || 'Channel', thumbnails: {} },
                    status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true },
                    contentDetails: { duration: 'PT3M20S' },
                })),
            });
        }
        return json({}, 404);
    };
    return { calls, fetchImpl, count: (host) => calls.filter((url) => url.hostname === host).length };
}

function testConfig(overrides = {}) {
    return loadConfig({
        nodeEnv: 'test', databasePath: ':memory:', port: 0, youtubeApiKey: 'test-key',
        tokenPepper: 'lyrics-test-pepper', maintenanceIntervalMs: 3_600_000, lyricsBusyRetryMs: 0, ...overrides,
    }, quietLogger());
}

function standaloneLyrics(network, overrides = {}) {
    const config = testConfig(overrides);
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const service = new LyricsService({ db, config, logger: quietLogger(), fetchImpl: network.fetchImpl });
    services.push(service);
    return { db, service, config };
}

async function settle(service, videoId) {
    while (service.inflight.has(videoId)) await service.inflight.get(videoId);
}

async function waitFor(predicate, timeoutMs = 10_000) {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for condition');
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

// ── pure text handling ─────────────────────────────────────────────────────

test('LRC parsing expands repeated stamps, applies [offset:], and keeps word timings', () => {
    const parsed = parseLrc('[ti:Song]\n[offset:+500]\n[01:10.00][00:20.00]same\n<00:01.00>skip\n[00:10.00]<00:10.00>Never <00:10.40>gonna');
    assert.equal(parsed.kind, 'synced_word');
    assert.deepEqual(parsed.lines.map((line) => [line.timeMs, line.text]), [
        [9500, 'Never gonna'], [19500, 'same'], [69500, 'same'],
    ]);
    assert.deepEqual(parsed.lines[0].words.map((word) => word.timeMs), [9500, 9900]);
    assert.equal(parseLrc('no timestamps at all'), null);
    assert.equal(lyricsKindOf('[00:01.00]x'), 'synced_line');
    assert.deepEqual(plainLines('[ar:x]\nOne\n\n\n Two \n\n'), ['One', '', 'Two']);
});

test('NetEase credits and instrumental bodies are not lyrics', () => {
    assert.equal(cleanNeteaseLrc(NETEASE_SYNCED).includes('作词'), false);
    assert.equal(cleanNeteaseLrc('[00:00.00]纯音乐，请欣赏'), null);
    assert.equal(cleanNeteaseLrc(''), null);
});

test('script detection separates Japanese, Korean, and Chinese', () => {
    assert.equal(detectLanguage('夜に駆ける'), 'ja');
    assert.equal(detectLanguage('봄날 Spring Day'), 'ko');
    assert.equal(detectLanguage('我爱你中国'), 'zh');
    assert.equal(detectLanguage('Never gonna give you up'), 'en');
    assert.equal(decodeHtmlEntities('Don&#39;t Stop &amp; &quot;Go&quot; &#x263A;'), 'Don\'t Stop & "Go" ☺');
});

test('title parsing yields artist/track candidates for common upload conventions', () => {
    assert.deepEqual(parseVideoTitle('YOASOBI「夜に駆ける」Official Music Video')[0], { artist: 'YOASOBI', track: '夜に駆ける', confidence: 0.8 });
    const split = parseVideoTitle('Rick Astley - Never Gonna Give You Up (Official Music Video)', 'Rick Astley');
    assert.deepEqual(split[0], { artist: 'Rick Astley', track: 'Never Gonna Give You Up', confidence: 0.85 });
    assert.ok(split.some((guess) => guess.artist === 'Never Gonna Give You Up'), 'swapped order is kept as a fallback');
    assert.deepEqual(parseVideoTitle('周杰倫 Jay Chou【告白氣球 Love Confession】Official MV')[0], { artist: '周杰倫 Jay Chou', track: '告白氣球 Love Confession', confidence: 0.8 });
    assert.deepEqual(parseVideoTitle('周杰伦《晴天》')[0], { artist: '周杰伦', track: '晴天', confidence: 0.8 });
    assert.deepEqual(titleVariants('周杰倫 Jay Chou'), ['周杰倫 Jay Chou', '周杰倫', 'Jay Chou']);
    assert.deepEqual(titleVariants('Blueming(블루밍)'), ['Blueming(블루밍)', 'Blueming', '블루밍']);
    assert.deepEqual(searchCandidates({ title: 'Lemon', channelTitle: 'Kenshi Yonezu - Topic' })[0], { artist: 'Kenshi Yonezu', track: 'Lemon', confidence: 0.95 });
    assert.deepEqual(searchCandidates({ title: 'ignored', artist: 'Admin Artist', track: 'Admin Track' }), [{ artist: 'Admin Artist', track: 'Admin Track', confidence: 1 }]);
});

test('channels are weighed as the singer: Topic and VEVO lead, labels never do', () => {
    assert.deepEqual(channelArtist('ArianaGrandeVevo'), { names: ['Ariana Grande'], weight: 0.9 });
    assert.deepEqual(channelArtist('Aimer Official YouTube Channel'), { names: ['Aimer'], weight: 0.8 });
    assert.deepEqual(channelArtist('Ayase / YOASOBI').names, ['Ayase / YOASOBI', 'Ayase', 'YOASOBI']);
    assert.equal(channelArtist('HYBE LABELS').weight, 0.1);
    assert.equal(channelArtist('Official髭男dism').names[0], 'Official髭男dism', 'a band named "Official…" keeps its name');

    const pairs = (candidates) => candidates.map(({ artist, track }) => [artist, track]);
    assert.deepEqual(pairs(searchCandidates({ title: 'Against All Answers', channelTitle: 'TOGENASHI TOGEARI - Topic' })),
        [['TOGENASHI TOGEARI', 'Against All Answers'], ['', 'Against All Answers']], 'each distinct search runs once');
    assert.deepEqual(pairs(searchCandidates({ title: 'Blinding Lights', channelTitle: 'TheWeekndVEVO' }))[0], ['The Weeknd', 'Blinding Lights']);
    assert.deepEqual(pairs(searchCandidates({ title: 'Lemon', channelTitle: '米津玄師' }))[0], ['米津玄師', 'Lemon']);

    const live = searchCandidates({ title: 'LiSA - 紅蓮華 / THE FIRST TAKE', channelTitle: 'THE FIRST TAKE' });
    assert.deepEqual(pairs(live)[0], ['LiSA', '紅蓮華']);
    assert.ok(live.every((guess) => !`${guess.artist} ${guess.track}`.includes('FIRST TAKE')), "a label's name is neither singer nor song");

    const reupload = searchCandidates({ title: 'Ariana Grande - 7 rings (Lyrics)', channelTitle: '7clouds' }, 6).map((guess) => guess.artist);
    assert.ok(reupload.indexOf('') < reupload.indexOf('7clouds'), 'a lyric channel ranks below the bare title');
});

test('a provider title must resemble the song unless it is written in another script', () => {
    assert.equal(titleCompatible(['Mystery Upload'], 'Test Song'), false, 'artist and length cannot rescue a different song');
    assert.equal(titleCompatible(['Never Gonna Give You Up'], 'Never Gonna Give You Up (2022 Remaster)'), true);
    assert.equal(titleCompatible(['Yoru ni Kakeru'], '夜に駆ける'), true, 'romanized against Japanese is left to artist and length');
    assert.equal(titleCompatible(['告白氣球'], '告白气球'), true, 'Traditional and Simplified forms match by reading');
    assert.equal(titleCompatible(['告白氣球'], '晴天'), false);
});

test('reading aids romanize Japanese, Korean, and Chinese lines', () => {
    assert.equal(kanaToRomaji('とうきょう'), 'toukyou');
    assert.equal(kanaToRomaji('まっちゃ'), 'matcha');
    assert.equal(kanaToRomaji('しんや'), "shin'ya");
    assert.equal(kanaToRomaji('ラーメン'), 'raamen');
    assert.equal(romanizeHangul('같이'), 'gachi');
    assert.equal(romanizeHangul('한국어'), 'hangugeo');
    assert.deepEqual(segmentsKo('안녕 Hi'), [{ base: '안녕', ruby: 'annyeong' }, { base: ' Hi' }]);
    // 行 reads háng in 银行 (bank): readings come from the whole line's context.
    assert.deepEqual(segmentsZh('银行').map((segment) => segment.ruby), ['yín', 'háng']);
    // A token ending in っ doubles the consonant of the next token.
    const tokens = [
        { surface: '行っ', reading: 'イッ', pos: '動詞' },
        { surface: 'た', reading: 'タ', pos: '助動詞' },
        { surface: 'は', reading: 'ハ', pos: '助詞' },
    ];
    assert.deepEqual(segmentsJa(tokens, 'romaji').map((segment) => segment.ruby), ['it', 'ta', 'wa']);
    assert.deepEqual(segmentsJa([{ surface: '食べる', reading: 'タベル', pos: '動詞' }], 'furigana'), [{ base: '食', ruby: 'た' }, { base: 'べる' }]);
});

test('the Japanese tokenizer runs in a child process that can be stopped', async () => {
    const tokenizer = new JapaneseTokenizer({ idleMs: 60_000 });
    try {
        const [tokens] = await tokenizer.tokenize(['夜に駆ける']);
        assert.deepEqual(tokens.map((token) => token.reading), ['ヨル', 'ニ', 'カケル']);
        assert.ok(tokenizer.child, 'the process stays warm for the next song');
    } finally {
        tokenizer.stop();
    }
    assert.equal(tokenizer.child, null);
});

test('LYRICS_PROVIDERS selects providers and "none" turns lookups off', () => {
    assert.deepEqual(parseLyricsProviders(undefined, quietLogger()), ['lrclib', 'netease']);
    assert.deepEqual(parseLyricsProviders('netease, bogus', quietLogger()), ['netease']);
    assert.deepEqual(parseLyricsProviders('none', quietLogger()), []);
});

// ── lookup and cache ───────────────────────────────────────────────────────

test('a lookup caches every provider hit and a cached song costs no further requests', async () => {
    const network = fakeNetwork();
    const { service } = standaloneLyrics(network);
    const video = { id: 'aaaaaaaaaaa', title: 'Test Artist - Test Song (Official Video)', channelTitle: 'Test Artist', apiDataRefreshedAt: Date.now() };

    service.ensure(video, { durationSec: 200 });
    assert.equal(service.songState(video.id).status, 'loading');
    await settle(service, video.id);
    const state = service.songState(video.id);
    assert.equal(state.status, 'ready');
    assert.deepEqual(state.sources.map((entry) => entry.id).sort(), ['lrclib', 'netease']);
    // The NetEase body is Japanese, but the song language comes from the lyrics
    // the room will show first. LRCLIB's English lyrics lead for an English title.
    assert.equal(state.source, 'lrclib');

    const before = network.calls.length;
    service.ensure(video, { durationSec: 200 });
    assert.equal(service.inflight.has(video.id), false);
    assert.equal(network.calls.length, before, 'a cache hit makes no provider requests');

    const document = await service.document(video.id);
    assert.equal(document.synced, true);
    assert.deepEqual(document.lines.slice(0, 2), [{ t: 1000, text: 'First line here' }, { t: 5000, text: 'Second line here' }]);
});

test("an overloaded LRCLIB exact-match endpoint falls through to its search", async () => {
    const network = fakeNetwork({ lrclibGet: 503, netease: 'miss' });
    const { db, service } = standaloneLyrics(network);
    const video = { id: 'jjjjjjjjjjj', title: 'Test Artist - Test Song', channelTitle: 'Test Artist', apiDataRefreshedAt: Date.now() };
    service.ensure(video, { durationSec: 200 });
    await settle(service, video.id);
    assert.equal(db.lyricsSong(video.id).lookup.lrclib.status, 'found');
    assert.ok(network.calls.some((url) => url.pathname === '/api/get'), 'the exact match was attempted first');
});

test('misses are remembered for a week and failures retried after a short wait', async () => {
    const network = fakeNetwork({ lrclib: 'miss', netease: 'error' });
    const { db, service } = standaloneLyrics(network);
    const video = { id: 'bbbbbbbbbbb', title: 'Nobody - Nothing', channelTitle: 'Nobody', apiDataRefreshedAt: Date.now() };
    service.ensure(video);
    await settle(service, video.id);
    assert.equal(service.songState(video.id).status, 'none');
    const song = db.lyricsSong(video.id);
    assert.equal(song.lookup.lrclib.status, 'not_found');
    assert.equal(song.lookup.netease.status, 'error');

    const now = Date.now();
    assert.deepEqual(service.providersDue(song, now), []);
    assert.deepEqual(service.providersDue(song, now + 16 * 60 * 1000), ['netease']);
    assert.deepEqual(service.providersDue(song, now + NOT_FOUND_RETRY_MS + 1), ['lrclib', 'netease']);
    assert.deepEqual(service.providersDue(song, now + PLAYING_ERROR_RETRY_MS + 1, PLAYING_ERROR_RETRY_MS), ['netease'],
        'a song that is playing retries a failed provider sooner');
});

test('a busy LRCLIB search is retried once', async () => {
    const network = fakeNetwork({ lrclibBusy: 1, netease: 'miss' });
    const { db, service } = standaloneLyrics(network);
    const video = { id: 'kkkkkkkkkkk', title: 'Test Artist - Test Song', channelTitle: 'Test Artist', apiDataRefreshedAt: Date.now() };
    service.ensure(video, { durationSec: 200 });
    await settle(service, video.id);
    assert.equal(db.lyricsSong(video.id).lookup.lrclib.status, 'found');
    assert.equal(network.calls.filter((url) => url.pathname === '/api/search').length, 2);
});

test('queued songs are prefetched with their reading aid, and a song that starts playing jumps the queue', async () => {
    const network = fakeNetwork({ lrclib: 'miss', neteaseSong: { name: '夜に駆ける', artist: 'YOASOBI' } });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const searches = [];
    const fetchImpl = async (input, options) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/search/get') {
            searches.push(url.searchParams.get('s'));
            await gate;
        }
        return network.fetchImpl(input, options);
    };
    const { db, service } = standaloneLyrics({ fetchImpl }, { lyricsLookupConcurrency: 1 });
    const queued = ['Aqua', 'Blue', 'Cyan'].map((artist, index) => ({
        id: `${'abc'[index]}queued0000`, title: `${artist}「夜に駆ける」`, channelTitle: artist, apiDataRefreshedAt: Date.now(),
    }));
    for (const video of queued) service.prefetch(video);
    service.ensure(queued[2]);
    release();
    await waitFor(() => queued.every((video) => db.lyricsReading(video.id, 'netease', 'romaji')));
    assert.deepEqual(searches.map((text) => text.split(' ')[0]), ['Aqua', 'Cyan', 'Blue']);
    assert.equal(service.songState(queued[1].id).status, 'ready');
});

test('CJK songs prefer NetEase and administrator lyrics win unless a default is set', async () => {
    const network = fakeNetwork({ neteaseSong: { name: '夜に駆ける', artist: 'YOASOBI' } });
    const { db, service } = standaloneLyrics(network);
    const video = { id: 'ccccccccccc', title: 'YOASOBI「夜に駆ける」', channelTitle: 'Ayase / YOASOBI', apiDataRefreshedAt: Date.now() };
    service.ensure(video);
    await settle(service, video.id);
    db.updateLyricsSong(video.id, { language: 'ja' });
    assert.equal(service.songState(video.id).source, 'netease');

    service.setManualLyrics(video.id, '[00:01.00]管理者の歌詞\n[00:03.00]二行目', null);
    assert.equal(service.songState(video.id).source, 'ykt');
    service.updateSong(video.id, { defaultSource: 'lrclib' }, null);
    assert.equal(service.songState(video.id).source, 'ykt', 'a default with nothing stored falls back');
    service.updateSong(video.id, { defaultSource: 'netease', defaultOffsetMs: 250 }, null);
    assert.equal(service.songState(video.id).source, 'netease');
    assert.equal(service.songState(video.id).offsetMs, 250);
    assert.equal(service.songState(video.id, { source: 'ykt', offsetMs: -100 }).source, 'ykt');
    assert.equal(service.songState(video.id, { source: 'netease', offsetMs: -100 }).offsetMs, -100);
    assert.throws(() => service.updateSong(video.id, { defaultOffsetMs: 90_000 }, null), { code: 'invalid_lyrics_offset' });
});

test('Japanese documents carry romaji per line and reuse the stored reading', async () => {
    const network = fakeNetwork({ lrclib: 'miss', neteaseSong: { name: '夜に駆ける', artist: 'YOASOBI' } });
    const { db, service } = standaloneLyrics(network);
    const video = { id: 'ddddddddddd', title: 'YOASOBI「夜に駆ける」', channelTitle: 'YOASOBI', apiDataRefreshedAt: Date.now() };
    service.ensure(video);
    await settle(service, video.id);
    const document = await service.document(video.id, { readingMode: 'romaji' });
    assert.equal(document.language, 'ja');
    assert.equal(document.readingMode, 'romaji');
    assert.deepEqual(document.lines[0].ruby.map((segment) => segment.ruby), ['yoru', 'ni', 'kakeru']);
    assert.ok(db.lyricsReading(video.id, 'netease', 'romaji'), 'the reading is stored with the lyrics');
    service.tokenizer.stop();
    service.tokenizer.tokenize = () => { throw new Error('the cached reading should have been used'); };
    assert.deepEqual((await service.document(video.id)).lines[0].ruby, document.lines[0].ruby);
    const plain = await service.document(video.id, { readingMode: 'none' });
    assert.equal(plain.readingMode, 'none');
    assert.equal(plain.lines[0].ruby, undefined);
});

// ── rooms and realtime ─────────────────────────────────────────────────────

test('room lyrics are opt-in, and per-singer mode follows the queuing controller', () => {
    const config = testConfig();
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const rooms = new RoomService({ db, config, logger: quietLogger() });
    const created = rooms.createRoom();
    const alice = rooms.registerController(created.room.id, created.registrationToken, 'Alice');
    const bob = rooms.registerController(created.room.id, created.registrationToken, 'Bob');
    rooms.addVideos(created.room.id, alice.controllerKey, [{ id: 'aaaaaaaaaaa', title: 'Alice song' }]);
    const room = created.room;

    assert.equal(rooms.lyricsDisplay(room), false, 'off until someone opts the room in');
    rooms.updateSettings(room.id, bob.controllerKey, { lyricsEnabled: true });
    assert.equal(rooms.lyricsDisplay(room), true);
    assert.equal(room.settings.roundRobinEnabled, false, 'a partial settings update leaves the rest alone');

    rooms.updateSettings(room.id, bob.controllerKey, { lyricsPerUser: true });
    assert.equal(rooms.lyricsDisplay(room), false, "Alice has not turned lyrics on for her songs");
    rooms.setControllerLyrics(room.id, bob.controllerKey, true);
    assert.equal(rooms.lyricsDisplay(room), false, "Bob's preference does not cover Alice's song");
    rooms.setControllerLyrics(room.id, alice.controllerKey, true);
    assert.equal(rooms.lyricsDisplay(room), true);
    assert.equal(rooms.wantsLyricsFor(room, bob.controller.id), true);

    assert.throws(() => rooms.updateSettings(room.id, bob.controllerKey, { lyricsEnabled: 'yes' }), { code: 'invalid_settings' });
    assert.throws(() => rooms.updateSettings(room.id, bob.controllerKey, { unknown: true }), { code: 'invalid_settings' });
});

test('playback samples are stamped on the server clock and implausible stamps are replaced', () => {
    const config = testConfig();
    const db = new AppDatabase(':memory:', { logger: quietLogger() });
    const rooms = new RoomService({ db, config, logger: quietLogger() });
    const created = rooms.createRoom();
    const singer = rooms.registerController(created.room.id, created.registrationToken, 'Singer');
    rooms.addVideos(created.room.id, singer.controllerKey, [{ id: 'aaaaaaaaaaa', title: 'Song' }]);
    const base = { queueId: created.room.currentVideo.queueId, state: 'playing', positionSec: 10, durationSec: 100 };

    const sampledAt = Date.now() - 400;
    const accepted = rooms.updatePlayback(created.room.id, created.playerKey, { ...base, sampledAt, playbackRate: 1.25, latencyMs: 42.4 });
    assert.equal(accepted.sampledAt, sampledAt);
    assert.equal(accepted.playbackRate, 1.25);
    assert.equal(accepted.roomLatencyMs, 42);

    const skewed = rooms.updatePlayback(created.room.id, created.playerKey, { ...base, sampledAt: Date.now() - 60_000 });
    assert.ok(Math.abs(skewed.sampledAt - Date.now()) < 1000, 'an unsynchronised clock falls back to the receive time');
    assert.throws(() => rooms.updatePlayback(created.room.id, created.playerKey, { ...base, playbackRate: 9 }), { code: 'invalid_playback' });
});

test('lyrics overrides, settings, and preferences survive a database restart', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ytkt-lyrics-'));
    const databasePath = path.join(directory, 'test.sqlite');
    const config = testConfig({ databasePath });
    try {
        let db = new AppDatabase(databasePath, { logger: quietLogger() });
        let rooms = new RoomService({ db, config, logger: quietLogger() });
        const created = rooms.createRoom();
        const singer = rooms.registerController(created.room.id, created.registrationToken, 'Singer');
        rooms.addVideos(created.room.id, singer.controllerKey, [{ id: 'aaaaaaaaaaa', title: 'Song' }]);
        rooms.updateSettings(created.room.id, singer.controllerKey, { lyricsEnabled: true, lyricsPerUser: true });
        rooms.setControllerLyrics(created.room.id, singer.controllerKey, true);
        rooms.setLyricsOverride(created.room.id, singer.controllerKey, {
            expectedQueueId: created.room.currentVideo.queueId, source: 'netease', offsetMs: -350,
        });
        assert.throws(() => rooms.setLyricsOverride(created.room.id, singer.controllerKey, {
            expectedQueueId: 'stale', offsetMs: 0,
        }), { code: 'stale_lyrics' });
        db.close();

        db = new AppDatabase(databasePath, { logger: quietLogger() });
        rooms = new RoomService({ db, config, logger: quietLogger() });
        const restored = rooms.requireRoom(created.room.id);
        assert.deepEqual(restored.settings, { roundRobinEnabled: false, lyricsEnabled: true, lyricsPerUser: true });
        assert.deepEqual(rooms.lyricsOverride(restored), { source: 'netease', offsetMs: -350 });
        assert.equal(rooms.lyricsDisplay(restored), true);
        rooms.setLyricsOverride(created.room.id, singer.controllerKey, {
            expectedQueueId: restored.currentVideo.queueId, source: null, offsetMs: null,
        });
        assert.deepEqual(rooms.lyricsOverride(restored), {});
        db.close();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

async function socketRuntime(network) {
    const instance = createServer({ config: testConfig(), logger: quietLogger(), fetchImpl: network.fetchImpl });
    await instance.start(0);
    runtimes.push(instance);
    const port = instance.httpServer.address().port;
    const connect = async () => {
        const socket = createClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], path: '/socket.io/' });
        await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
        return socket;
    };
    const emit = (socket, event, payload) => new Promise((resolve, reject) => {
        socket.timeout(5000).emit(event, payload, (error, response) => (error ? reject(error) : resolve(response)));
    });
    // Fails rather than hangs: a pending wait would keep the sockets, and so the server, open.
    const next = (socket, event, predicate = () => true) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, handler);
            reject(new Error(`timed out waiting for ${event}`));
        }, 5000);
        const handler = (payload) => {
            if (!predicate(payload)) return;
            clearTimeout(timer);
            socket.off(event, handler);
            resolve(payload);
        };
        socket.on(event, handler);
    });
    return { instance, connect, emit, next };
}

test('controllers opt a room into lyrics and every member shares the source and offset', async () => {
    const network = fakeNetwork({ youtube: { aaaaaaaaaaa: { title: 'Test Artist - Test Song', channelTitle: 'Test Artist' } } });
    const { instance, connect, emit, next } = await socketRuntime(network);
    const created = instance.roomService.createRoom();
    const singer = instance.roomService.registerController(created.room.id, created.registrationToken, 'Singer');
    const player = await connect();
    const controller = await connect();
    const outsider = await connect();
    try {
        await emit(player, 'join-room-admin', { roomId: created.room.id, playerKey: created.playerKey });
        await emit(controller, 'auth-controller', { roomId: created.room.id, controllerKey: singer.controllerKey });

        const sync = await emit(controller, 'time-sync', {});
        assert.equal(sync.ok, true);
        assert.ok(Math.abs(sync.serverTime - Date.now()) < 1000);

        const enabled = await emit(controller, 'update-settings', { roomId: created.room.id, controllerKey: singer.controllerKey, settings: { lyricsEnabled: true } });
        assert.equal(enabled.settings.lyricsEnabled, true);

        const ready = next(player, 'lyrics-updated', (state) => state.status === 'ready');
        const added = await emit(controller, 'add-to-queue', { roomId: created.room.id, controllerKey: singer.controllerKey, video: { id: 'aaaaaaaaaaa' } });
        assert.equal(added.ok, true);
        const state = await ready;
        assert.equal(state.display, true);
        assert.equal(state.queueId, created.room.currentVideo.queueId);
        assert.ok(network.count('lrclib.net') > 0, 'the room display needing lyrics started the lookup');

        const fetched = await emit(controller, 'lyrics-get', { roomId: created.room.id, queueId: state.queueId, includeDocument: true });
        assert.equal(fetched.document.revision, fetched.state.revision);
        await emit(player, 'lyrics-get', { roomId: created.room.id, queueId: state.queueId, includeDocument: true });
        assert.equal(instance.db.lyricsSong('aaaaaaaaaaa').requestCount, 1, 'one play counts once however many screens ask');
        assert.equal(fetched.document.lines[0].text, 'First line here');

        const nudged = next(player, 'lyrics-updated', (update) => update.offsetMs === 300);
        const setOffset = await emit(controller, 'lyrics-set', {
            roomId: created.room.id, controllerKey: singer.controllerKey, expectedQueueId: state.queueId, offsetMs: 300,
        });
        assert.equal(setOffset.state.offsetMs, 300);
        assert.equal((await nudged).revision, state.revision, 'an offset change does not invalidate the text');

        const switched = await emit(controller, 'lyrics-set', {
            roomId: created.room.id, controllerKey: singer.controllerKey, expectedQueueId: state.queueId, source: 'netease',
        });
        assert.equal(switched.state.source, 'netease');
        assert.notEqual(switched.state.revision, state.revision);

        const unavailable = await emit(controller, 'lyrics-set', {
            roomId: created.room.id, controllerKey: singer.controllerKey, expectedQueueId: state.queueId, source: 'ykt',
        });
        assert.equal(unavailable.error.code, 'lyrics_source_unavailable');

        const denied = await emit(outsider, 'lyrics-get', { roomId: created.room.id, includeDocument: true });
        assert.equal(denied.error.code, 'not_joined');

        const perUser = next(player, 'lyrics-updated', (update) => update.perUser === true);
        await emit(controller, 'update-settings', { roomId: created.room.id, controllerKey: singer.controllerKey, settings: { lyricsPerUser: true } });
        assert.equal((await perUser).display, false);
        const optedIn = next(player, 'lyrics-updated', (update) => update.display === true);
        const preference = await emit(controller, 'update-controller-lyrics', { roomId: created.room.id, controllerKey: singer.controllerKey, enabled: true });
        assert.equal(preference.lyricsEnabled, true);
        await optedIn;
    } finally {
        for (const socket of [player, controller, outsider]) socket.close();
    }
});

test("a controller's Lyrics tab looks songs up with room lyrics off, and lookups resume after a restart", async () => {
    const network = fakeNetwork({
        youtube: {
            bbbbbbbbbbb: { title: 'Test Artist - Test Song', channelTitle: 'Test Artist' },
            ccccccccccc: { title: 'Test Artist - Test Song', channelTitle: 'Test Artist' },
            ddddddddddd: { title: 'Test Artist - Test Song', channelTitle: 'Test Artist' },
        },
    });
    const { instance, connect, emit, next } = await socketRuntime(network);
    const created = instance.roomService.createRoom();
    const singer = instance.roomService.registerController(created.room.id, created.registrationToken, 'Singer');
    const player = await connect();
    const controller = await connect();
    try {
        await emit(player, 'join-room-admin', { roomId: created.room.id, playerKey: created.playerKey });
        await emit(controller, 'auth-controller', { roomId: created.room.id, controllerKey: singer.controllerKey });
        await emit(controller, 'add-to-queue', { roomId: created.room.id, controllerKey: singer.controllerKey, video: { id: 'bbbbbbbbbbb' } });
        await emit(controller, 'add-to-queue', { roomId: created.room.id, controllerKey: singer.controllerKey, video: { id: 'ddddddddddd' } });

        const roomDisplay = await emit(player, 'lyrics-get', { roomId: created.room.id });
        assert.equal(roomDisplay.state.status, 'idle');
        assert.equal(network.count('lrclib.net'), 0, 'nobody wants lyrics yet, so nothing is sent to providers');

        const ready = next(controller, 'lyrics-updated', (state) => state.status === 'ready');
        const opened = await emit(controller, 'lyrics-get', { roomId: created.room.id, lookup: true });
        assert.equal(opened.state.status, 'loading');
        assert.equal((await ready).display, false, 'the room display keeps lyrics off');

        // Someone is reading along, so the next song was looked up while this one played.
        await waitFor(() => instance.db.lyricsSong('ddddddddddd')?.lookup?.lrclib);
        const requestsBefore = network.calls.length;
        const nextSong = next(controller, 'lyrics-updated', (state) => state.videoId === 'ddddddddddd');
        await emit(controller, 'play-next', { roomId: created.room.id, controllerKey: singer.controllerKey, expectedQueueId: created.room.currentVideo.queueId });
        assert.equal((await nextSong).status, 'ready', 'lyrics are ready the moment the song starts');
        assert.equal(network.calls.length, requestsBefore);

        // A room restored with lyrics on and a song whose lookup a restart cut short.
        await emit(controller, 'play-next', { roomId: created.room.id, controllerKey: singer.controllerKey, expectedQueueId: created.room.currentVideo.queueId });
        await emit(controller, 'add-to-queue', { roomId: created.room.id, controllerKey: singer.controllerKey, video: { id: 'ccccccccccc' } });
        instance.roomService.updateSettings(created.room.id, singer.controllerKey, { lyricsEnabled: true });
        instance.lyricsService.noteVideo(created.room.currentVideo);
        const resumed = next(player, 'lyrics-updated', (state) => state.videoId === 'ccccccccccc' && state.status === 'ready');
        const reconnected = await emit(player, 'lyrics-get', { roomId: created.room.id });
        assert.equal(reconnected.state.status, 'loading');
        assert.equal((await resumed).display, true);
    } finally {
        for (const socket of [player, controller]) socket.close();
    }
});

test('controllers see what the lyrics matched and can correct the search for everyone', async () => {
    const network = fakeNetwork({ netease: 'miss', youtube: { mmmmmmmmmmm: { title: 'Mystery Upload', channelTitle: 'Random Uploader' } } });
    const { instance, connect, emit, next } = await socketRuntime(network);
    const created = instance.roomService.createRoom();
    const singer = instance.roomService.registerController(created.room.id, created.registrationToken, 'Singer');
    const player = await connect();
    const controller = await connect();
    const roomId = created.room.id;
    const search = (terms, expectedQueueId = created.room.currentVideo.queueId) => emit(controller, 'lyrics-search', {
        roomId, controllerKey: singer.controllerKey, expectedQueueId, ...terms,
    });
    try {
        await emit(player, 'join-room-admin', { roomId, playerKey: created.playerKey });
        await emit(controller, 'auth-controller', { roomId, controllerKey: singer.controllerKey });
        await emit(controller, 'update-settings', { roomId, controllerKey: singer.controllerKey, settings: { lyricsEnabled: true } });
        const missed = next(player, 'lyrics-updated', (state) => state.status === 'none');
        await emit(controller, 'add-to-queue', { roomId, controllerKey: singer.controllerKey, video: { id: 'mmmmmmmmmmm' } });
        await missed;

        const before = (await emit(controller, 'lyrics-match', { roomId, queueId: created.room.currentVideo.queueId })).details;
        assert.deepEqual(before.matches, []);
        assert.equal(before.lookup.lrclib.status, 'not_found');
        assert.deepEqual(before.searchPlan[0], { artist: 'Random Uploader', track: 'Mystery Upload' });
        assert.equal(before.searchTerms, null);

        const ready = next(player, 'lyrics-updated', (state) => state.status === 'ready');
        const fixed = await search({ artist: 'Test Artist', track: 'Test Song' });
        assert.deepEqual(fixed.found, ['lrclib']);
        assert.equal((await ready).source, 'lrclib', 'every member is told about the new lyrics');
        assert.deepEqual(fixed.details.matches.map(({ source, track, artist }) => ({ source, track, artist })),
            [{ source: 'lrclib', track: 'Test Song', artist: 'Test Artist' }]);
        assert.deepEqual(fixed.details.searchTerms, { artist: 'Test Artist', track: 'Test Song' }, 'the correction is kept for future lookups');
        const audit = instance.db.listAudit().rows.find((row) => row.action === 'lyrics_search_corrected');
        assert.deepEqual(audit.detail, { roomId, controllerId: singer.controller.id, artist: 'Test Artist', track: 'Test Song', found: ['lrclib'] });

        const junk = await search({ artist: 'Nobody', track: 'Nothing At All' });
        assert.deepEqual(junk.found, []);
        assert.equal(junk.state.status, 'ready', 'a search that finds nothing leaves the lyrics alone');
        assert.equal(instance.db.lyricsSong('mmmmmmmmmmm').searchTrack, 'Test Song');

        assert.equal((await search({ artist: 'Test Artist', track: '  ' })).error.code, 'invalid_lyrics_search');
        assert.equal((await search({ track: 'Test Song' }, 'not-the-current-item')).error.code, 'stale_lyrics');
        assert.equal((await search({ track: 'Test Song' })).error.code, 'quota_action_rate_limited');
    } finally {
        for (const socket of [player, controller]) socket.close();
    }
});

// ── administration and retention ───────────────────────────────────────────

test('administrators browse the cache, set defaults, and paste lyrics; viewers only read', async () => {
    const network = fakeNetwork({ lrclib: 'miss', netease: 'miss', youtube: { eeeeeeeeeee: { title: 'Rare &amp; Obscure', channelTitle: 'Nobody' } } });
    const { instance } = await socketRuntime(network);
    const base = `http://127.0.0.1:${instance.httpServer.address().port}`;
    const sessionFor = (role) => {
        const user = instance.db.createAdminWithIdentity({ id: `${role}-id`, email: `${role}@example.com`, displayName: role, role, provider: 'google', subject: `${role}-sub` });
        const session = instance.adminService.createSession(user.id);
        return { cookie: `ytkt_admin_session=${encodeURIComponent(session.token)}`, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' };
    };
    const admin = sessionFor('admin');
    const viewer = sessionFor('viewer');
    const request = (method, route, headers, body) => fetch(`${base}${route}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });

    const added = await request('POST', '/api/admin/lyrics', admin, { video: 'https://youtu.be/eeeeeeeeeee' });
    assert.equal(added.status, 201);
    const addedDetail = await added.json();
    assert.equal(addedDetail.durationSec, 200);
    assert.ok(addedDetail.adminCuratedAt, 'a song an administrator adds is kept past retention');
    assert.deepEqual(addedDetail.searchPlan, [{ artist: 'Nobody', track: 'Rare & Obscure' }, { artist: '', track: 'Rare & Obscure' }],
        'the dialog shows what the title parser searches for, channel included');
    await settle(instance.lyricsService, 'eeeeeeeeeee');

    const listed = await (await request('GET', '/api/admin/lyrics?query=obscure', viewer)).json();
    assert.equal(listed.total, 1);
    assert.equal(listed.rows[0].videoId, 'eeeeeeeeeee');
    assert.deepEqual(listed.providers, ['lrclib', 'netease']);

    assert.equal((await request('PATCH', '/api/admin/lyrics/eeeeeeeeeee', viewer, { defaultOffsetMs: 100 })).status, 403);
    const { cookie } = admin;
    assert.equal((await request('PATCH', '/api/admin/lyrics/eeeeeeeeeee', { cookie, 'content-type': 'application/json' }, { defaultOffsetMs: 100 })).status, 403, 'CSRF is required');

    const manual = await request('PUT', '/api/admin/lyrics/eeeeeeeeeee/manual', admin, { lyrics: '[00:01.00]Hand typed\r\n[00:04.00]Second' });
    assert.equal(manual.status, 200);
    const manualDetail = await manual.json();
    assert.deepEqual(manualDetail.sources.map((entry) => [entry.source, entry.kind]), [['ykt', 'synced_line']]);
    assert.equal(manualDetail.status, 'ready');

    const patched = await (await request('PATCH', '/api/admin/lyrics/eeeeeeeeeee', admin, { defaultSource: 'ykt', defaultOffsetMs: -400, searchArtist: '  Real Artist ' })).json();
    assert.equal(patched.defaultOffsetMs, -400);
    assert.equal(patched.searchArtist, 'Real Artist');
    assert.equal((await request('PATCH', '/api/admin/lyrics/eeeeeeeeeee', admin, { defaultSource: 'other' })).status, 400);

    const preview = await (await request('GET', '/api/admin/lyrics/eeeeeeeeeee/preview', viewer)).json();
    assert.deepEqual(preview.document.lines.map((line) => line.text), ['Hand typed', 'Second']);

    const before = network.count('lrclib.net');
    const refetched = await (await request('POST', '/api/admin/lyrics/eeeeeeeeeee/refetch', admin)).json();
    assert.ok(network.count('lrclib.net') > before, 'a refetch searches again');
    assert.deepEqual(refetched.sources.map((entry) => entry.source), ['ykt'], 'administrator lyrics survive a refetch');

    assert.equal((await request('PUT', '/api/admin/lyrics/eeeeeeeeeee/manual', admin, { lyrics: 'x'.repeat(30_001) })).status, 400);
    assert.equal((await request('DELETE', '/api/admin/lyrics/eeeeeeeeeee', admin)).status, 204);
    assert.equal((await request('GET', '/api/admin/lyrics/eeeeeeeeeee', viewer)).status, 404);
    const audit = instance.db.listAudit({ limit: 50 }).rows.map((row) => row.action);
    for (const action of ['lyrics_song_added', 'lyrics_manual_saved', 'lyrics_song_updated', 'lyrics_refetched', 'lyrics_song_deleted']) {
        assert.ok(audit.includes(action), `${action} is audited`);
    }
});

test('cached YouTube metadata is refreshed before the retention boundary or deleted', async () => {
    const network = fakeNetwork({ youtube: { fffffffffff: { title: 'Fresh title', channelTitle: 'Fresh channel' } } });
    const { instance } = await socketRuntime(network);
    const { db } = instance;
    const day = 24 * 60 * 60 * 1000;
    const old = Date.now() - 22 * day;
    db.upsertLyricsSongMetadata({ videoId: 'fffffffffff', title: 'Old title', channelTitle: 'Old', refreshedAt: old, now: old });
    db.upsertLyricsSongMetadata({ videoId: 'ggggggggggg', title: 'Gone video', refreshedAt: old, now: old });
    db.upsertLyricsSongMetadata({ videoId: 'hhhhhhhhhhh', title: 'Recent', refreshedAt: Date.now() });

    // An older snapshot can never roll back a newer one.
    db.upsertLyricsSongMetadata({ videoId: 'hhhhhhhhhhh', title: 'Stale room item', refreshedAt: old });
    assert.equal(db.lyricsSong('hhhhhhhhhhh').title, 'Recent');

    await instance.runMaintenance();
    const refreshed = db.lyricsSong('fffffffffff');
    assert.equal(refreshed.title, 'Fresh title');
    assert.ok(Date.now() - refreshed.apiDataRefreshedAt < 60_000);
    assert.equal(db.lyricsSong('ggggggggggg'), null, 'a video that is no longer available is removed');
    assert.ok(db.lyricsSong('hhhhhhhhhhh'), 'recent snapshots are left alone');

    db.upsertLyricsSongMetadata({ videoId: 'iiiiiiiiiii', title: 'Expired', refreshedAt: Date.now() - 29 * day, now: Date.now() - 29 * day });
    assert.deepEqual(db.expireLyricsSongs(Date.now() - instance.roomService.config.historyRetentionMs), { removed: 1, kept: 0 });
});

test('songs an administrator curated keep their lyrics and settings when their YouTube data expires', async () => {
    const network = fakeNetwork({ lrclib: 'miss', netease: 'miss' });
    const { instance } = await socketRuntime(network);
    const { db, lyricsService } = instance;
    const day = 24 * 60 * 60 * 1000;
    const curate = (videoId, age) => {
        const then = Date.now() - age;
        db.upsertLyricsSongMetadata({ videoId, title: `Title ${videoId}`, channelTitle: 'Channel', durationSec: 200, refreshedAt: then, now: then });
        lyricsService.setManualLyrics(videoId, '[00:01.00]Kept line\n[00:04.00]Second', null);
        lyricsService.updateSong(videoId, { defaultOffsetMs: -300, searchArtist: 'Kept Artist' }, null);
    };
    curate('lateCurated', 29 * day);
    db.upsertLyricsSongMetadata({ videoId: 'lateUncurated', title: 'Plain', refreshedAt: Date.now() - 29 * day, now: Date.now() - 29 * day });
    assert.ok(db.lyricsSong('lateCurated').adminCuratedAt, 'administrator edits mark a song as curated');

    // The API was unavailable until the retention boundary.
    assert.deepEqual(db.expireLyricsSongs(Date.now() - instance.roomService.config.historyRetentionMs), { removed: 1, kept: 1 });
    assert.equal(db.lyricsSong('lateUncurated'), null, 'songs nobody curated are still deleted');

    // The refresh reports the video gone.
    curate('goneCurated', 22 * day);
    await instance.runMaintenance();
    assert.equal(db.listAudit().rows.find((row) => row.action === 'retention_purge').detail.lyricsYouTubeDataRemoved, 1);

    for (const videoId of ['goneCurated', 'lateCurated']) {
        const song = db.lyricsSong(videoId);
        assert.equal(song.title, null);
        assert.equal(song.channelTitle, null);
        assert.equal(song.durationSec, null);
        assert.ok(song.youtubeDataRemovedAt, `${videoId} lost only its YouTube data`);
        assert.equal(song.defaultOffsetMs, -300);
        assert.equal(song.searchArtist, 'Kept Artist');
        assert.deepEqual(db.lyricsSources(videoId).map((entry) => entry.source), ['ykt']);
    }
    assert.deepEqual(db.staleLyricsSongIds(Date.now()), [], 'songs without YouTube data are not refreshed again');

    // Refetching needs something to search for once the title is gone.
    db.updateLyricsSong('lateCurated', { searchArtist: null });
    await assert.rejects(lyricsService.refetch('lateCurated', null), { code: 'lyrics_search_terms_required' });
    assert.deepEqual(db.lyricsSources('lateCurated').map((entry) => entry.source), ['ykt']);

    // A room playing the video again brings the details back.
    lyricsService.noteVideo({ id: 'goneCurated', title: 'Back Again', channelTitle: 'Channel', apiDataRefreshedAt: Date.now() }, { durationSec: 201 });
    const restored = db.lyricsSong('goneCurated');
    assert.equal(restored.title, 'Back Again');
    assert.equal(restored.durationSec, 201);
    assert.equal(restored.youtubeDataRemovedAt, null);
});

test('simultaneous requests for a new song share one reading computation', async () => {
    const network = fakeNetwork({ lrclib: 'miss', neteaseSong: { name: '夜に駆ける', artist: 'YOASOBI' } });
    const { service } = standaloneLyrics(network);
    const video = { id: 'kkkkkkkkkkk', title: 'YOASOBI「夜に駆ける」', channelTitle: 'YOASOBI', apiDataRefreshedAt: Date.now() };
    service.ensure(video);
    await settle(service, video.id);
    let calls = 0;
    const tokenize = service.tokenizer.tokenize.bind(service.tokenizer);
    service.tokenizer.tokenize = (lines) => { calls += 1; return tokenize(lines); };
    const documents = await Promise.all([1, 2, 3, 4].map(() => service.document(video.id)));
    assert.equal(calls, 1);
    assert.ok(documents.every((document) => document.lines[0].ruby?.length));
});

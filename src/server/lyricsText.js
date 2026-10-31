// Pure lyrics text handling: LRC parsing, provider-body cleanup, and script
// detection. Ported from ZhongDev/Youtube-Karaoke-App (src/shared/lrc.ts,
// language.ts, src/main/providers/neteaseLrc.ts) with Chinese detection added
// so Han-only lyrics can receive pinyin.

// ── LRC ──────────────────────────────────────────────────────────────────────
//
// Handles the common quirks:
//   [01:10.00][02:30.00]same line    multiple timestamps per line
//   [ti:] [ar:] [offset:+500]        metadata tags; offset is APPLIED to times
//   <mm:ss.xx>                       enhanced per-word tags
//   CRLF, BOM, blank timed lines (used as spacing between verses).
//
// Sign convention for [offset:] (de-facto standard): positive shifts lyrics
// earlier, i.e. effective time = tag time − offset. Times are clamped at 0.

// Sticky flag: exec() only matches exactly at lastIndex, which yields the
// contiguous run of [mm:ss.xx] tags at the start of a line.
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/y;
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const META_TAG = /^\s*\[([a-zA-Z][a-zA-Z0-9#_-]*):([^\]]*)\]\s*$/;

function tagMs(min, sec, frac) {
    // Fraction digits are hundredths by convention but files vary: '5' → 500ms,
    // '50' → 500ms, '500' → 500ms.
    const fracMs = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0;
    return Number(min) * 60_000 + Number(sec) * 1000 + fracMs;
}

/**
 * Parse LRC text. Returns null when it contains no timestamps (plain lyrics).
 * Lines are sorted by time with [offset:] already applied.
 */
function parseLrc(raw) {
    const meta = {};
    const lines = [];
    let sawWordTags = false;

    for (const rawLine of String(raw || '').replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
        const line = rawLine.trim();

        const metaMatch = META_TAG.exec(line);
        if (metaMatch) {
            meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
            continue;
        }

        const times = [];
        TIME_TAG.lastIndex = 0;
        let cursor = 0;
        let match;
        while ((match = TIME_TAG.exec(line))) {
            times.push(tagMs(match[1], match[2], match[3]));
            cursor = TIME_TAG.lastIndex;
        }
        if (!times.length) continue; // untimed stray line

        const rest = line.slice(cursor);
        let words;
        let text;

        WORD_TAG.lastIndex = 0;
        if (WORD_TAG.test(rest)) {
            words = [];
            WORD_TAG.lastIndex = 0;
            let prefix = '';
            let previous = null;
            let wordMatch;
            while ((wordMatch = WORD_TAG.exec(rest))) {
                if (previous) {
                    const segment = rest.slice(previous.start, wordMatch.index);
                    if (segment.trim()) words.push({ timeMs: previous.timeMs, text: segment });
                } else {
                    prefix = rest.slice(0, wordMatch.index);
                }
                previous = { timeMs: tagMs(wordMatch[1], wordMatch[2], wordMatch[3]), start: WORD_TAG.lastIndex };
            }
            if (previous) {
                const segment = rest.slice(previous.start);
                if (segment.trim()) words.push({ timeMs: previous.timeMs, text: segment });
            }
            text = (prefix + words.map((word) => word.text).join('')).trim();
            if (words.length) sawWordTags = true;
            else words = undefined;
        } else {
            text = rest.trim();
        }

        for (const timeMs of times) {
            lines.push({ timeMs, text, ...(words ? { words: words.map((word) => ({ ...word })) } : {}) });
        }
    }

    if (!lines.length) return null;

    const offsetMs = Math.trunc(Number(meta.offset ?? 0)) || 0;
    if (offsetMs !== 0) {
        for (const line of lines) {
            line.timeMs = Math.max(0, line.timeMs - offsetMs);
            line.words?.forEach((word) => { word.timeMs = Math.max(0, word.timeMs - offsetMs); });
        }
    }
    lines.sort((a, b) => a.timeMs - b.timeMs);

    return { kind: sawWordTags ? 'synced_word' : 'synced_line', lines, meta, offsetMs };
}

/** Classify arbitrary text: enhanced LRC → synced_word, LRC → synced_line, else plain. */
function lyricsKindOf(text) {
    return parseLrc(text)?.kind ?? 'plain';
}

/** Plain lyrics as display lines: trimmed, untimed, at most one blank line in a row. */
function plainLines(text) {
    const out = [];
    for (const raw of String(text || '').replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
        const line = raw.replace(/\[[^\]]*\]/g, '').trim();
        if (!line && (!out.length || !out[out.length - 1])) continue;
        out.push(line);
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
}

/** Lyrics text with LRC timestamps, word tags, and metadata tags removed. */
function stripLrcTags(body) {
    return String(body || '')
        .replace(/\[[^\]\n]*\]/g, ' ')
        .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, ' ');
}

/** Number of lines that carry a timestamp and non-empty text. */
function countTimedTextLines(lrc) {
    return String(lrc || '').split(/\r?\n/)
        .filter((line) => /^\s*\[\d/.test(line) && line.replace(/\[[^\]]*\]/g, '').trim()).length;
}

// ── NetEase body cleanup ─────────────────────────────────────────────────────
//
// NetEase prefixes lyrics with timed credit lines such as
// "[00:00.000] 作词 : Ayase" and marks instrumentals with a single
// "纯音乐，请欣赏" line; neither is something to sing along to.

const CREDIT_LINE = /^\s*(?:\[[^\]]*\]\s*)+(?:作词|作曲|编曲|制作人|作詞|編曲|词|曲|监制|製作人|混音|母带|录音|吉他|贝斯|鼓|键盘|和声|Lyrics?\s*by|Composed\s*by|Arranged\s*by|Produced\s*by|Written\s*by|Lyricist|Composer|Arranger|Producer|OP|SP|Original\s*Publisher)\s*[:：]/i;
const INSTRUMENTAL_LINE = /纯音乐|純音樂|无歌词|無歌詞|instrumental/i;

/** Strip credit lines and detect empty/instrumental bodies. Null when nothing singable remains. */
function cleanNeteaseLrc(raw) {
    if (!raw || !String(raw).trim()) return null;
    const body = String(raw).split(/\r?\n/).filter((line) => !CREDIT_LINE.test(line)).join('\n').trim();
    if (!body) return null;
    const timed = countTimedTextLines(body);
    if (timed === 0) return null;
    if (timed <= 2 && INSTRUMENTAL_LINE.test(body)) return null;
    return body;
}

// ── language detection ───────────────────────────────────────────────────────
//
// Deliberately simple: it only has to pick a provider order and a reading aid.
//  - any Hangul (at least as much as kana) → ko
//  - any kana → ja (kana appears in virtually all real Japanese lyrics)
//  - Han only → zh
//  - Latin → en, anything else → other

const LANGUAGES = Object.freeze(['en', 'ja', 'ko', 'zh', 'other']);
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/gu;
const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/gu;
const HAN = /\p{Script=Han}/gu;
const LATIN = /\p{Script=Latin}/gu;

function count(text, pattern) {
    return text.match(pattern)?.length ?? 0;
}

function detectLanguage(text) {
    const value = String(text || '');
    const kana = count(value, KANA);
    const hangul = count(value, HANGUL);
    if (hangul && hangul >= kana) return 'ko';
    if (kana) return 'ja';
    if (count(value, HAN)) return 'zh';
    if (count(value, LATIN)) return 'en';
    return 'other';
}

/**
 * Track language: the lyrics body decides when there is one (an English cover
 * of a Japanese song has a Japanese title but English lyrics), else the title.
 */
function detectTrackLanguage(title, lyricsBody) {
    const stripped = lyricsBody ? stripLrcTags(lyricsBody) : '';
    if (stripped.trim().length >= 20) return detectLanguage(stripped);
    return detectLanguage(title);
}

function isCjk(language) {
    return language === 'ja' || language === 'ko' || language === 'zh';
}

// ── YouTube Data API titles ──────────────────────────────────────────────────

const NAMED_ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' });

/** The Data API returns titles with HTML entities still encoded (&#39;, &amp;…). */
function decodeHtmlEntities(text) {
    if (typeof text !== 'string' || !text.includes('&')) return text || '';
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
        if (code[0] === '#') {
            const value = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
            return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
        }
        return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
    });
}

module.exports = {
    LANGUAGES,
    cleanNeteaseLrc,
    countTimedTextLines,
    decodeHtmlEntities,
    detectLanguage,
    detectTrackLanguage,
    isCjk,
    lyricsKindOf,
    parseLrc,
    plainLines,
    stripLrcTags,
};

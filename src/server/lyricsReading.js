// Reading aids for CJK lyrics: romaji (or furigana) over Japanese, Revised
// Romanization over Korean, and pinyin over Chinese. The Japanese and Korean
// logic is ported from ZhongDev/Youtube-Karaoke-App (src/shared/ruby.ts).
//
// A line is a sequence of segments; a segment with `ruby` carries a reading
// drawn above its base text. Japanese readings need a morphological analyser
// (kuromoji). Its dictionary holds roughly 350 MB while loaded, which a
// long-running server should not keep for the occasional Japanese song, so it
// runs in a child process that is started on demand and exits when idle. The
// operating system reclaims that memory only when the process ends. Korean
// romanization is algorithmic and pinyin comes from pinyin-pro, in-process.

const path = require('path');
const { fork } = require('child_process');

const READING_MODES = Object.freeze(['romaji', 'furigana', 'none']);

// ── kana helpers ─────────────────────────────────────────────────────────────

const KANJI_RE = /[\p{Script=Han}〆]/u;
const KANA_RE = /[ぁ-ゖ゛-ゞァ-ヺー-ヾ]/u;

function hasKanji(value) {
    return KANJI_RE.test(value);
}

function isKana(character) {
    return KANA_RE.test(character);
}

function isAllKana(value) {
    return value.length > 0 && [...value].every(isKana);
}

/** Katakana → hiragana (ー and everything else untouched). */
function kataToHira(value) {
    let out = '';
    for (const character of value) {
        const code = character.codePointAt(0);
        out += code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
    }
    return out;
}

// Hepburn, wāpuro long vowels (とうきょう → toukyou).
const ROMAJI = {
    あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
    か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
    さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
    た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
    な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
    は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
    ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
    や: 'ya', ゆ: 'yu', よ: 'yo',
    ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
    わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
    が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
    ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
    だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
    ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
    ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
    ゔ: 'vu',
    ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
    きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
    ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
    ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
    りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
    じゃ: 'ja', じゅ: 'ju', じょ: 'jo', ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
    びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
    ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
    てぃ: 'ti', でぃ: 'di', でゅ: 'dyu', とぅ: 'tu', どぅ: 'du',
    うぃ: 'wi', うぇ: 'we', うぉ: 'wo', ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
    しぇ: 'she', じぇ: 'je', ちぇ: 'che', つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
    いぇ: 'ye',
};

/**
 * Kana (either script) → Hepburn romaji. っ doubles the next consonant
 * (っち → tchi), ん takes an apostrophe before vowels and y (しんや → shin'ya),
 * ー repeats the previous vowel. Anything else passes through.
 */
function kanaToRomaji(kana) {
    const characters = [...kataToHira(kana)];
    let out = '';
    let sokuon = false;
    for (let index = 0; index < characters.length; index += 1) {
        const character = characters[index];
        if (character === 'っ') {
            sokuon = true;
            continue;
        }
        if (character === 'ー') {
            const last = out[out.length - 1] ?? '';
            if ('aiueo'.includes(last)) out += last;
            sokuon = false;
            continue;
        }
        const next = characters[index + 1];
        let romaji;
        if (next !== undefined && ROMAJI[character + next] !== undefined) {
            romaji = ROMAJI[character + next];
            index += 1;
        } else {
            romaji = ROMAJI[character];
        }
        if (romaji === undefined) {
            out += character;
            sokuon = false;
            continue;
        }
        if (character === 'ん') {
            const after = characters[index + 1];
            const afterRomaji = after === undefined ? '' : (ROMAJI[after] ?? '');
            romaji = /^[aiueoy]/.test(afterRomaji) ? "n'" : 'n';
        }
        if (sokuon) {
            if (romaji.startsWith('ch')) romaji = `t${romaji}`;
            else if (!/^[aiueo]/.test(romaji)) romaji = romaji[0] + romaji;
            sokuon = false;
        }
        out += romaji;
    }
    return out;
}

// ── Japanese: tokens → segments ──────────────────────────────────────────────

/** Split a token so only its kanji carry ruby: 食べる/たべる → 食(た)べる. */
function splitOkurigana(surface, readingHira) {
    if (!hasKanji(surface) || !readingHira) return [{ base: surface }];
    const surfaceChars = [...surface];
    const readingChars = [...readingHira];
    let prefix = 0;
    while (prefix < surfaceChars.length && prefix < readingChars.length && isKana(surfaceChars[prefix]) &&
        kataToHira(surfaceChars[prefix]) === readingChars[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < surfaceChars.length - prefix && suffix < readingChars.length - prefix &&
        isKana(surfaceChars[surfaceChars.length - 1 - suffix]) &&
        kataToHira(surfaceChars[surfaceChars.length - 1 - suffix]) === readingChars[readingChars.length - 1 - suffix]) suffix += 1;
    const core = surfaceChars.slice(prefix, surfaceChars.length - suffix).join('');
    const coreReading = readingChars.slice(prefix, readingChars.length - suffix).join('');
    const out = [];
    if (prefix) out.push({ base: surfaceChars.slice(0, prefix).join('') });
    if (core) out.push(coreReading ? { base: core, ruby: coreReading } : { base: core });
    if (suffix) out.push({ base: surfaceChars.slice(surfaceChars.length - suffix).join('') });
    return out;
}

/** Romaji of one token; the particles は / へ read wa / e. */
function romajiOf(token) {
    if (token.pos === '助詞') {
        if (token.surface === 'は') return 'wa';
        if (token.surface === 'へ') return 'e';
    }
    const reading = token.reading ?? (isAllKana(token.surface) ? token.surface : null);
    return reading === null ? null : kanaToRomaji(reading);
}

function pushMerged(out, segment) {
    const last = out[out.length - 1];
    if (!segment.ruby && last && !last.ruby) last.base += segment.base;
    else out.push(segment);
}

const TRAILING_SOKUON = /[っッ]$/;

/** Segments for a line of Japanese from its tokens ({ surface, reading, pos }). */
function segmentsJa(tokens, mode) {
    const out = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (!token.surface) continue;
        if (!hasKanji(token.surface) && !isAllKana(token.surface)) {
            pushMerged(out, { base: token.surface }); // Latin, digits, punctuation
            continue;
        }
        if (mode === 'furigana') {
            if (!hasKanji(token.surface) || !token.reading) pushMerged(out, { base: token.surface });
            else for (const segment of splitOkurigana(token.surface, kataToHira(token.reading))) pushMerged(out, segment);
        } else {
            let romaji = romajiOf(token);
            // A token ending in っ (行っ|た) doubles the consonant that opens the next one.
            const reading = token.reading ?? token.surface;
            const next = tokens[index + 1];
            if (romaji !== null && TRAILING_SOKUON.test(reading) && next) {
                const nextRomaji = romajiOf(next) || '';
                if (/^[b-df-hj-np-tv-z]/.test(nextRomaji)) romaji += nextRomaji.startsWith('ch') ? 't' : nextRomaji[0];
            }
            pushMerged(out, romaji ? { base: token.surface, ruby: romaji } : { base: token.surface });
        }
    }
    return out;
}

// ── Korean: Revised Romanization ─────────────────────────────────────────────

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
/** Coda as pronounced before a consonant / at the end (neutralised). */
const FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
/** Coda carried over as the next syllable's onset when that syllable starts with ㅇ. */
const LINKED = ['', 'g', 'kk', 'ks', 'n', 'nj', 'nh', 'd', 'r', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'ps', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', ''];
const F_K = new Set([1, 2, 3, 9, 24]);
const F_T = new Set([7, 19, 20, 22, 23, 25, 27]);
const F_P = new Set([14, 17, 18, 26]);
const F_L = new Set([8, 11, 12, 13, 15]);
const F_N = new Set([4, 5, 6]);
const F_H = new Set([27, 6, 15]);
const I_G = 0; const I_N = 2; const I_D = 3; const I_R = 5; const I_M = 6; const I_NULL = 11; const I_J = 12; const I_H = 18;
const M_I = 20;

function decompose(character) {
    const code = character.codePointAt(0) - 0xac00;
    if (code < 0 || code >= 11172) return null;
    return { ini: Math.floor(code / 588), med: Math.floor((code % 588) / 28), fin: code % 28 };
}

/**
 * Revised Romanization of a run of Hangul syllables with the standard sound
 * changes between neighbours: linking, nasalisation, ㄹ assimilation, ㅎ
 * dropping/aspiration, and ㄷ/ㅌ + 이 palatalisation.
 */
function romanizeRun(syllables) {
    const onsets = syllables.map((syllable) => INITIALS[syllable.ini]);
    const codas = syllables.map((syllable) => FINALS[syllable.fin]);
    for (let index = 0; index + 1 < syllables.length; index += 1) {
        const { fin } = syllables[index];
        const next = syllables[index + 1];
        const nextInitial = next.ini;
        if (fin === 0) continue;
        if (nextInitial === I_NULL) {
            if ((fin === 7 || fin === 25) && next.med === M_I) {
                codas[index] = '';
                onsets[index + 1] = fin === 7 ? 'j' : 'ch';
            } else if (fin === 21) {
                codas[index] = 'ng';
            } else {
                codas[index] = '';
                onsets[index + 1] = LINKED[fin];
            }
        } else if (nextInitial === I_N || nextInitial === I_M) {
            if (F_K.has(fin)) codas[index] = 'ng';
            else if (F_T.has(fin)) codas[index] = 'n';
            else if (F_P.has(fin)) codas[index] = 'm';
            else if (F_L.has(fin) && nextInitial === I_N) {
                codas[index] = 'l';
                onsets[index + 1] = 'l';
            }
        } else if (nextInitial === I_R) {
            if (F_N.has(fin) || F_L.has(fin)) {
                codas[index] = 'l';
                onsets[index + 1] = 'l';
            } else if (fin === 16 || fin === 21) {
                onsets[index + 1] = 'n';
            } else if (F_K.has(fin)) {
                codas[index] = 'ng';
                onsets[index + 1] = 'n';
            } else if (F_P.has(fin)) {
                codas[index] = 'm';
                onsets[index + 1] = 'n';
            } else if (F_T.has(fin)) {
                codas[index] = 'n';
                onsets[index + 1] = 'n';
            }
        } else if (nextInitial === I_H) {
            if (F_K.has(fin)) {
                codas[index] = '';
                onsets[index + 1] = 'k';
            } else if (fin === 22) {
                codas[index] = '';
                onsets[index + 1] = 'ch';
            } else if (F_T.has(fin) && fin !== 27) {
                codas[index] = '';
                onsets[index + 1] = 't';
            } else if (F_P.has(fin)) {
                codas[index] = '';
                onsets[index + 1] = 'p';
            }
        } else if (F_H.has(fin) && (nextInitial === I_G || nextInitial === I_D || nextInitial === I_J)) {
            onsets[index + 1] = nextInitial === I_G ? 'k' : nextInitial === I_D ? 't' : 'ch';
            codas[index] = fin === 27 ? '' : fin === 6 ? 'n' : 'l';
        }
    }
    return syllables.map((syllable, index) => onsets[index] + MEDIALS[syllable.med] + codas[index]).join('');
}

/** Romanize every Hangul run in `text`; other characters pass through. */
function romanizeHangul(text) {
    let out = '';
    let run = [];
    const flush = () => {
        if (run.length) out += romanizeRun(run);
        run = [];
    };
    for (const character of text) {
        const syllable = decompose(character);
        if (syllable) run.push(syllable);
        else {
            flush();
            out += character;
        }
    }
    flush();
    return out;
}

const HAS_HANGUL = /[가-힣]/u;
const WORD_EDGES = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su;

/** Segments for a line of Korean: each space-separated word gets its romanization. */
function segmentsKo(text) {
    const out = [];
    for (const part of String(text || '').split(/(\s+)/)) {
        if (!part) continue;
        if (!HAS_HANGUL.test(part)) {
            pushMerged(out, { base: part });
            continue;
        }
        const [, lead = '', word = part, trail = ''] = WORD_EDGES.exec(part) ?? [];
        if (lead) pushMerged(out, { base: lead });
        pushMerged(out, { base: word, ruby: romanizeHangul(word) });
        if (trail) pushMerged(out, { base: trail });
    }
    return out;
}

// ── Chinese: pinyin ──────────────────────────────────────────────────────────

const HAN_CHARACTER = /\p{Script=Han}/u;
let pinyinLibrary = null;

/** Segments for a line of Chinese: each Han character carries its contextual pinyin. */
function segmentsZh(text) {
    pinyinLibrary ||= require('pinyin-pro');
    const value = String(text || '');
    if (!value) return [];
    // Converting the whole line lets pinyin-pro choose polyphone readings from context.
    const characters = pinyinLibrary.pinyin(value, { type: 'all', toneType: 'symbol' });
    const out = [];
    for (const entry of characters) {
        const base = entry.origin ?? '';
        if (entry.isZh && HAN_CHARACTER.test(base) && entry.pinyin && entry.pinyin !== base) out.push({ base, ruby: entry.pinyin });
        else pushMerged(out, { base });
    }
    return out;
}

// ── Japanese tokenizer process ───────────────────────────────────────────────

class JapaneseTokenizer {
    constructor({ idleMs = 120_000, timeoutMs = 30_000, logger = console } = {}) {
        this.idleMs = idleMs;
        this.timeoutMs = timeoutMs;
        this.logger = logger;
        this.child = null;
        this.pending = new Map();
        this.nextId = 1;
        this.idleTimer = null;
    }

    start() {
        if (this.child) return this.child;
        const child = fork(path.join(__dirname, 'lyricsReadingWorker.js'), [], { execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
        this.child = child;
        // Only the IPC channel holds the event loop, and only while work is pending.
        child.unref();
        child.on('message', (message) => {
            const request = this.pending.get(message?.id);
            if (!request) return;
            this.pending.delete(message.id);
            clearTimeout(request.timer);
            if (message.error) request.reject(new Error(message.error));
            else request.resolve(message.tokens);
            this.settle();
        });
        child.on('exit', (code, signal) => {
            if (this.child === child) this.child = null;
            for (const [id, request] of this.pending) {
                clearTimeout(request.timer);
                request.reject(new Error(`Japanese tokenizer exited (${signal || code})`));
                this.pending.delete(id);
            }
        });
        child.on('error', (error) => this.logger.warn(`[WARN] Japanese tokenizer process error: ${error.message}`));
        return child;
    }

    /** Hold the IPC channel open only while work is pending, then let the process idle out. */
    settle() {
        clearTimeout(this.idleTimer);
        if (this.pending.size > 0) {
            this.child?.channel?.ref();
            return;
        }
        this.child?.channel?.unref();
        this.idleTimer = setTimeout(() => this.stop(), this.idleMs);
        this.idleTimer.unref();
    }

    /** Tokens ({ surface, reading, pos }) for each input line. */
    tokenize(lines) {
        const child = this.start();
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Japanese tokenizer timed out'));
                this.settle();
            }, this.timeoutMs);
            timer.unref();
            this.pending.set(id, { resolve, reject, timer });
            this.settle();
            child.send({ id, lines });
        });
    }

    stop() {
        clearTimeout(this.idleTimer);
        if (!this.child) return;
        const child = this.child;
        this.child = null;
        child.kill();
    }
}

/**
 * Reading-aid segments for each line, or null when the language takes none.
 * Korean and Chinese have a single reading form; Japanese honours the mode.
 */
async function annotateLines(language, lines, mode, tokenizer) {
    if (mode === 'none') return null;
    if (language === 'ko') return lines.map((line) => segmentsKo(line));
    if (language === 'zh') return lines.map((line) => segmentsZh(line));
    if (language !== 'ja') return null;
    const tokens = await tokenizer.tokenize(lines);
    return tokens.map((lineTokens) => segmentsJa(lineTokens, mode === 'furigana' ? 'furigana' : 'romaji'));
}

/** The cache key mode: only Japanese distinguishes furigana from romaji. */
function effectiveReadingMode(language, mode) {
    if (mode === 'none') return 'none';
    return language === 'ja' && mode === 'furigana' ? 'furigana' : 'romaji';
}

module.exports = {
    JapaneseTokenizer,
    READING_MODES,
    annotateLines,
    effectiveReadingMode,
    kanaToRomaji,
    kataToHira,
    romanizeHangul,
    segmentsJa,
    segmentsKo,
    segmentsZh,
    splitOkurigana,
};

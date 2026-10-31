// Heuristic YouTube title → { artist, track } search candidates, plus the
// fuzzy matcher used to rank provider results. Ported from
// ZhongDev/Youtube-Karaoke-App (src/shared/titleParser.ts, fuzzy.ts).
//
// Candidates are returned by confidence. The lyrics service tries them in
// order, which is how the Artist–Title vs Title–Artist ambiguity is resolved
// (swapped candidates are always included). JP/KR conventions (「」 quotes,
// 【MV】 decorations, bracketed alternate-script names) are handled directly.

const { pinyin } = require('pinyin-pro');

/** Lowercased NFKC with all whitespace/punctuation/symbols removed. */
function normalizeForMatch(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** Sørensen–Dice bigram coefficient on normalized strings, 0..1. */
function diceSimilarity(a, b) {
    const left = normalizeForMatch(a);
    const right = normalizeForMatch(b);
    if (left === right) return left.length ? 1 : 0;
    if (left.length < 2 || right.length < 2) return 0;
    const bigrams = new Map();
    for (let index = 0; index < left.length - 1; index += 1) {
        const bigram = left.slice(index, index + 2);
        bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
    }
    let hits = 0;
    for (let index = 0; index < right.length - 1; index += 1) {
        const bigram = right.slice(index, index + 2);
        const remaining = bigrams.get(bigram) ?? 0;
        if (remaining > 0) {
            hits += 1;
            bigrams.set(bigram, remaining - 1);
        }
    }
    return (2 * hits) / (left.length - 1 + right.length - 1);
}

const SEPARATORS = [' - ', ' – ', ' — ', ' − ', ' _ ', ' / ', ' | ', '|'];

// NFKC maps fullwidth （）［] to ASCII; 【】 survives and is handled directly.
const BRACKET_RES = [/\(([^()]*)\)/g, /\[([^\][]*)\]/g, /【([^【】]*)】/g];

// A bracketed segment is dropped entirely when its content matches this.
// Content that names the song (alt-script names, subtitle translations) must
// NOT match — e.g. "(방탄소년단)", "(Spring Day)", "(블루밍)".
const BRACKET_NOISE = /official|video|audio|lyric|visuali[sz]er|remaster|^m?\/?v$|^mv\b|\bpv\b|4k|8k|\bhd\b|\bhq\b|\blive\b|color coded|dance practice|performance|teaser|eng sub|sub esp|romaji|romanized|karaoke|full ver|\bfeat\.?|\bft\.?\s|featuring|アニメ|主題歌|テーマ|オープニング|エンディング|挿入歌|歌詞|字幕|ミュージックビデオ|가사|안무|뮤직비디오|공식|官方|歌词|完整版/i;

// Standalone tokens stripped repeatedly from the ends of a fragment.
const EDGE_NOISE = /^(official|music|video|audio|lyrics?|mv|m\/v|pv|hd|hq|4k|8k|full|ver\.?|version|teaser|topic|shorts?)$/i;

const FEAT_TAIL = /\s+(feat\.?|ft\.?|featuring)\s+.+$/i;

const QUOTE_RES = [
    /「([^」]+)」/,
    /『([^』]+)』/,
    // Chinese uploads wrap the song in book-title marks or lenticular brackets;
    // decorative 【MV】-style brackets are already gone by the time this runs.
    /《([^》]+)》/,
    /【([^【】]+)】/,
    /(?:^|\s)'([^']+)'(?=\s|$)/,
    /(?:^|\s)‘([^’]+)’(?=\s|$)/,
    /(?:^|\s)"([^"]+)"(?=\s|$)/,
    /(?:^|\s)“([^”]+)”(?=\s|$)/,
];

const WRAPPING_QUOTES = [["'", "'"], ['‘', '’'], ['"', '"'], ['“', '”'], ['「', '」'], ['『', '』']];

function normalizeTitle(raw) {
    return String(raw || '').normalize('NFKC').replace(/[  　]/g, ' ');
}

function stripNoiseBrackets(value) {
    let out = value;
    let changed = true;
    while (changed) {
        const before = out;
        for (const pattern of BRACKET_RES) {
            out = out.replace(pattern, (full, inner) => (inner.trim() === '' || BRACKET_NOISE.test(inner) ? ' ' : full));
        }
        changed = out !== before;
    }
    return out;
}

function stripEdgeNoise(value) {
    const tokens = value.split(/\s+/).filter(Boolean);
    while (tokens.length && EDGE_NOISE.test(tokens[tokens.length - 1])) tokens.pop();
    while (tokens.length && EDGE_NOISE.test(tokens[0])) tokens.shift();
    return tokens.join(' ');
}

function tidy(value) {
    return value
        .replace(/#\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–—−_/|・:]+/, '')
        .replace(/[\s\-–—−_/|・:]+$/, '')
        .trim();
}

function unwrapQuotes(value) {
    for (const [open, close] of WRAPPING_QUOTES) {
        if (value.length > 1 && value.startsWith(open) && value.endsWith(close)) return value.slice(1, -1).trim();
    }
    return value;
}

function cleanFragment(value) {
    return unwrapQuotes(tidy(stripEdgeNoise(tidy(value)).replace(FEAT_TAIL, '')));
}

/** Whole title cleaned for a free-text provider search. */
function cleanTitleForSearch(raw) {
    return cleanFragment(stripNoiseBrackets(normalizeTitle(raw)));
}

const CJK_WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** "告白氣球 Love Confession" → ["告白氣球", "Love Confession"]; single-script names → []. */
function scriptVariants(value) {
    const words = value.split(/\s+/).filter(Boolean);
    const cjk = words.filter((word) => CJK_WORD.test(word)).join(' ');
    const other = words.filter((word) => !CJK_WORD.test(word)).join(' ');
    return cjk && /\p{L}/u.test(other) ? [cjk, other] : [];
}

/**
 * Search variants of a name carrying an alternate-script form, in brackets or
 * side by side: "Blueming(블루밍)" → ["Blueming(블루밍)", "Blueming", "블루밍"],
 * "周杰倫 Jay Chou" → ["周杰倫 Jay Chou", "周杰倫", "Jay Chou"]. Otherwise [name].
 */
function titleVariants(name) {
    const full = String(name || '').trim();
    const out = full ? [full] : [];
    const match = /^(.*?)\s*[(（【[]([^()（）【】[\]]+)[)）】\]]$/.exec(full);
    const parts = match && match[1].trim() ? [tidy(match[1]), tidy(match[2])] : [];
    for (const variant of [...parts, ...scriptVariants(full)]) {
        if (variant && !out.includes(variant)) out.push(variant);
    }
    return out;
}

/** Best fuzzy match of `value` against any variant. */
function bestSimilarity(variants, value) {
    return variants.reduce((best, variant) => Math.max(best, diceSimilarity(variant, value)), 0);
}

// Below this, two titles in the same script name different songs, however
// well the artist and length agree.
const MIN_TITLE_SIMILARITY = 0.35;

/**
 * Whether a provider's title can be the wanted song. Across scripts (a
 * romanized title against the Japanese one) similarity means nothing, so
 * artist and length decide alone.
 */
function titleCompatible(variants, value) {
    const text = String(value || '');
    if (bestSimilarity(variants, text) >= MIN_TITLE_SIMILARITY) return true;
    // Traditional and Simplified forms (告白氣球 / 告白气球) share a reading.
    if (HAN.test(text)) {
        const reading = hanReading(text);
        if (variants.some((variant) => HAN.test(variant) && diceSimilarity(hanReading(variant), reading) >= MIN_TITLE_SIMILARITY)) return true;
    }
    const valueCjk = CJK_WORD.test(text);
    return variants.length > 0 && variants.every((variant) => CJK_WORD.test(variant) !== valueCjk);
}

const HAN = /\p{Script=Han}/u;

function hanReading(value) {
    return pinyin(value, { toneType: 'none', type: 'array' }).join(' ');
}

// Channels that publish other people's songs: labels, broadcasters, lyric and
// karaoke channels, live-session series. Their name says nothing about the singer.
const LABEL_CHANNEL = /\b(records?|recordings|entertainment|labels?|lyrics?|karaoke|nightcore|broadcasting|radio|soundtracks?|playlists?|charts|vibes|nation)\b|\bmusic (group|japan|korea|entertainment)\b|1thek|smtown|\bhybe\b|\bjyp\b|stone music|\bmnet\b|\bgenius\b|first take|sing king|karafun|sony music|universal music|warner music|\bavex\b|pony ?canyon|aniplex|lantis|レコード|エンタテインメント|エンターテインメント/i;
const OFFICIAL_CHANNEL = /(^|\s)official(\s|$)|オフィシャル|公式|官方/i;
// Endings that only say a channel is official: "Aimer Official YouTube Channel".
const CHANNEL_SUFFIX = /[\s\-–—|・]*(official( artist)?( youtube)?( channel)?|youtube channel|channel|music|tv|ch\.?|オフィシャル(チャンネル)?|公式(チャンネル)?|官方(频道|頻道)?)$/i;

function isTopicChannel(channel) {
    return / - Topic$/.test(String(channel || ''));
}

/** Channel name → plausible artist ("ArianaGrandeVevo", "X - Topic", "X Official YouTube Channel"…). */
function cleanChannelName(channel) {
    const original = tidy(normalizeTitle(channel).replace(/\s*-\s*Topic$/i, ''));
    let value = original;
    // VEVO names run the artist's words together: "ArianaGrandeVevo".
    if (/vevo$/i.test(value)) {
        value = value.replace(/\s*vevo$/i, '');
        if (!value.includes(' ')) value = value.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
    }
    let previous;
    do {
        previous = value;
        value = value.replace(CHANNEL_SUFFIX, '');
    } while (value && value !== previous);
    return tidy(value) || original;
}

/**
 * What a channel says about the singer: its cleaned name (and each name of a
 * "Ayase / YOASOBI" pair) with a weight, 0..1, for how likely the channel is
 * the performer's own. Auto-generated "Artist - Topic" channels are certain;
 * VEVO and "Official" channels nearly so; a label, broadcaster, or lyric or
 * karaoke channel says nothing; anything else is an even guess.
 */
function channelArtist(channel) {
    const raw = tidy(normalizeTitle(channel));
    const name = raw ? cleanChannelName(raw) : '';
    if (!name) return null;
    let weight = 0.5;
    if (isTopicChannel(raw)) weight = 1;
    else if (/vevo$/i.test(raw)) weight = 0.9;
    else if (LABEL_CHANNEL.test(raw)) weight = 0.1;
    else if (OFFICIAL_CHANNEL.test(raw)) weight = 0.8;
    const parts = name.split(/\s+[/|×]\s+/).map(tidy).filter(Boolean);
    return { names: parts.length > 1 ? [name, ...parts] : [name], weight };
}

/** `value` without a standalone mention of `name` (and the separator or brackets around it). */
function withoutName(value, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return tidy(value
        .replace(new RegExp(`[(\\[【「『]\\s*${escaped}\\s*[)\\]】」』]`, 'giu'), ' ')
        .replace(new RegExp(`(^|\\s|[/|・])${escaped}(?=$|\\s|[/|・])`, 'giu'), ' '));
}

function parseVideoTitle(rawTitle, channel) {
    const channelInfo = channel ? channelArtist(channel) : null;
    let base = tidy(stripNoiseBrackets(normalizeTitle(rawTitle)));
    // A label's or live series' name in the title is decoration, not the
    // singer: "LiSA - 紅蓮華 / THE FIRST TAKE".
    if (channelInfo && channelInfo.weight <= 0.1) base = withoutName(base, channelInfo.names[0]) || base;
    const channelNames = channelInfo?.names || [];
    const out = [];
    let titleNamesArtist = false;
    let channelInTitle = channelNames.some((name) => {
        const normalized = normalizeForMatch(name);
        return normalized.length >= 2 && normalizeForMatch(base).includes(normalized);
    });

    const push = (artistRaw, trackRaw, confidence) => {
        const artist = cleanFragment(artistRaw);
        const track = cleanFragment(trackRaw);
        if (!track) return;
        if (out.some((guess) => guess.artist === artist && guess.track === track)) return;
        out.push({ artist, track, confidence });
        // "IU(아이유)" / "BTS (방탄소년단)": add the plain and bracketed forms so
        // provider search can hit whichever script the database indexes.
        const alternate = /^(.*?)\s*\(([^)]+)\)$/.exec(artist);
        if (alternate && alternate[1].trim()) {
            push(alternate[1], trackRaw, confidence - 0.05);
            push(alternate[2], trackRaw, confidence - 0.1);
        }
    };

    // 1) Quoted track: Artist「Title」/ Artist 'Title' …
    for (const pattern of QUOTE_RES) {
        const match = pattern.exec(base);
        if (match) {
            const remainder = `${base.slice(0, match.index)} ${base.slice(match.index + match[0].length)}`;
            if (cleanFragment(remainder)) titleNamesArtist = true;
            push(remainder, match[1], cleanFragment(remainder) ? 0.8 : 0.5);
            break;
        }
    }

    // 2) Separator split (first occurrence), plus the swapped order. The side
    //    that matches the channel is the artist.
    for (const separator of SEPARATORS) {
        const index = base.indexOf(separator);
        if (index > 0 && index + separator.length < base.length) {
            const first = base.slice(0, index);
            const second = base.slice(index + separator.length);
            let firstConfidence = 0.6;
            let secondConfidence = 0.4;
            titleNamesArtist = true;
            if (channelNames.length) {
                const firstSimilarity = bestSimilarity(channelNames, cleanFragment(first));
                const secondSimilarity = bestSimilarity(channelNames, cleanFragment(second));
                if (firstSimilarity >= 0.6 && firstSimilarity > secondSimilarity) firstConfidence = 0.85;
                else if (secondSimilarity >= 0.6 && secondSimilarity > firstSimilarity) secondConfidence = 0.85;
                if (Math.max(firstSimilarity, secondSimilarity) >= 0.6) channelInTitle = true;
            }
            push(first, second, firstConfidence);
            push(second, first, secondConfidence);
            break;
        }
    }

    // 3) The channel as the singer, when the title does not already name it.
    //    A title that is just the song ("Lemon") from a likely artist channel
    //    puts the channel first. A title naming someone else is a re-upload or
    //    lyric channel, so the channel only beats the bare title (0.2) when it
    //    is VEVO or official. Labels are never guessed as the singer.
    const whole = cleanFragment(base);
    if (channelInfo && channelInfo.weight > 0.1 && !channelInTitle) {
        const confidence = titleNamesArtist ? 0.25 * channelInfo.weight : 0.3 + 0.6 * channelInfo.weight;
        channelNames.forEach((name, index) => push(name, whole, confidence - 0.05 * index));
    }
    push('', whole, 0.2);

    return out.sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

/**
 * Ordered search candidates for a video. An administrator override is
 * authoritative; auto-generated "Artist - Topic" uploads are exact studio
 * audio, so channel-minus-suffix and the verbatim title lead.
 */
function searchCandidates({ title, channelTitle, artist, track }, limit = 4) {
    if (artist || track) return [{ artist: artist || '', track: track || '', confidence: 1 }];
    const parsed = parseVideoTitle(title || '', channelTitle || '');
    if (isTopicChannel(channelTitle)) {
        parsed.unshift({ artist: cleanChannelName(channelTitle), track: String(title || '').trim(), confidence: 0.95 });
    }
    // Each distinct search once: providers match case-insensitively.
    const seen = new Set();
    return parsed.filter((candidate) => {
        const key = `${candidate.artist}\n${candidate.track}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, limit);
}

module.exports = {
    bestSimilarity,
    channelArtist,
    cleanChannelName,
    cleanTitleForSearch,
    diceSimilarity,
    isTopicChannel,
    normalizeForMatch,
    parseVideoTitle,
    searchCandidates,
    titleCompatible,
    titleVariants,
};

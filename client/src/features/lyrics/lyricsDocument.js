// Helpers over the lyrics document the server sends: { synced, language,
// readingMode, lines: [{ t?, text, words?: [{ t, text }], ruby?: [{ base, ruby? }] }] }.

/** Timed lines in the scheduler's shape ({ timeMs, text, words }), or [] for unsynced lyrics. */
export function timedLines(document) {
  if (!document?.synced) return [];
  return document.lines.map((line) => ({
    timeMs: line.t,
    text: line.text,
    ...(line.words ? { words: line.words.map((word) => ({ timeMs: word.t, text: word.text })) } : {}),
  }));
}

/** Index of the line being sung at `tMs` (the last one stamped at or before it), or -1. */
export function lineIndexAt(lines, tMs) {
  let low = 0;
  let high = lines.length - 1;
  let answer = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].timeMs <= tMs) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return answer;
}

/** A line's reading aid as one string: spaced per word, except continuous kana for furigana. */
export function readingText(segments, readingMode) {
  if (!segments?.some((segment) => segment.ruby)) return "";
  const parts = segments.map((segment) => segment.ruby ?? segment.base);
  const joined = readingMode === "furigana" ? parts.join("") : parts.join(" ");
  return joined.replace(/\s+/g, " ").trim();
}

export const SOURCE_LABELS = Object.freeze({ lrclib: "LRCLIB", netease: "NetEase", ykt: "YKT" });
export const SOURCE_ORDER = Object.freeze(["lrclib", "netease", "ykt"]);
export const KIND_LABELS = Object.freeze({ synced_word: "word-synced", synced_line: "line-synced", plain: "unsynced" });
export const READING_MODES = Object.freeze(["romaji", "furigana", "none"]);

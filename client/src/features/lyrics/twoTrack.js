// Two-track ("Joysound style") lyrics scheduler. Ported from
// ZhongDev/Youtube-Karaoke-App (src/shared/twoTrack.ts).
//
// Two fixed lanes sit in the lower part of the video. Text never resizes or
// moves: a line fades in, is highlighted with a left→right wipe while it is
// sung, and fades out fully highlighted. Consecutive lines alternate lanes.
//
// A line should be on screen LEAD_MS before its timestamp when a lane is free;
// when both lanes are busy it appears as soon as its lane's previous line has
// finished and faded out. Fades stretch with the slack available (100 ms in
// fast passages, up to 3 s around breaks) so they never eat into singing time.
//
// Lines are { timeMs, text, words?: [{ timeMs, text }] }, sorted by time.

export const LEAD_MS = 3000;
export const HOLD_MAX_MS = 2000;
export const FADE_MIN_MS = 100;
export const FADE_MAX_MS = 3000;

const CJK_SYLLABLE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Estimated singing time of `text` when no finer timing exists. */
export function estimateSingMs(text) {
  let ms = 0;
  for (const character of text) {
    if (/\s/.test(character)) continue;
    // A CJK character is roughly a syllable; a Latin letter a fraction of one.
    ms += CJK_SYLLABLE.test(character) ? 280 : 130;
  }
  return Math.min(12_000, Math.max(600, ms));
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** When `line` is fully highlighted: after its last word, else an estimate; never past the next stamp. */
export function wipeEndOf(line, nextMarkMs) {
  const cap = Number.isFinite(nextMarkMs) ? nextMarkMs : Infinity;
  if (line.words?.length) {
    const last = line.words[line.words.length - 1];
    return Math.max(line.timeMs, Math.min(cap, last.timeMs + estimateSingMs(last.text)));
  }
  const estimate = line.timeMs + estimateSingMs(line.text);
  return Math.max(line.timeMs + Math.min(300, cap - line.timeMs), Math.min(estimate, cap));
}

/**
 * Build the lane schedule. Blank timed lines are not displayed but act as end
 * markers for the line before them (LRC files use them to mark rests).
 */
export function scheduleTwoTrack(lines) {
  const lanes = [[], []];
  const drafts = [];
  const lastInLane = [null, null];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.text.trim()) continue;
    let nextMark = Infinity;
    for (let later = index + 1; later < lines.length; later += 1) {
      if (lines[later].timeMs > line.timeMs) {
        nextMark = lines[later].timeMs;
        break;
      }
    }
    drafts.push({ index, lane: 0, startMs: line.timeMs, wipeEndMs: wipeEndOf(line, nextMark) });
  }

  const finish = (lane, previous, next) => {
    const wantMs = next ? next.startMs - LEAD_MS : Infinity;
    const fadeOutMs = next ? clamp((wantMs - previous.wipeEndMs) / 2, FADE_MIN_MS, FADE_MAX_MS) : FADE_MAX_MS;
    const departMs = Math.max(previous.wipeEndMs, Math.min(wantMs - fadeOutMs, previous.wipeEndMs + HOLD_MAX_MS));
    const goneMs = departMs + fadeOutMs;
    const entry = lanes[lane].find((candidate) => candidate.index === previous.index);
    entry.departMs = departMs;
    entry.fadeOutMs = fadeOutMs;
    entry.goneMs = goneMs;
    const showMs = Math.max(goneMs, wantMs, 0);
    return { showMs, fadeInMs: clamp((next ? next.startMs - showMs : 0) / 2, FADE_MIN_MS, FADE_MAX_MS) };
  };

  for (const draft of drafts) {
    // The lane that frees up first; an empty lane wins outright, lane 0 on ties.
    const free = (lane) => lastInLane[lane]?.wipeEndMs ?? -Infinity;
    const lane = free(1) < free(0) ? 1 : 0;
    draft.lane = lane;
    const previous = lastInLane[lane];
    let showMs;
    let fadeInMs;
    if (previous) {
      ({ showMs, fadeInMs } = finish(lane, previous, draft));
    } else {
      showMs = Math.max(0, draft.startMs - LEAD_MS);
      fadeInMs = clamp((draft.startMs - showMs) / 2, FADE_MIN_MS, FADE_MAX_MS);
    }
    lanes[lane].push({
      index: draft.index, lane, showMs, fadeInMs,
      startMs: draft.startMs, wipeEndMs: draft.wipeEndMs,
      departMs: Infinity, fadeOutMs: FADE_MAX_MS, goneMs: Infinity,
    });
    lastInLane[lane] = draft;
  }

  // The last line of each lane: nobody is waiting, so linger then fade slowly.
  for (const lane of [0, 1]) {
    if (lastInLane[lane]) finish(lane, lastInLane[lane], null);
  }
  return { lanes };
}

/** Highlight fraction of `line` at `tMs`, following word timings when present. */
export function wipeProgress(line, entry, tMs) {
  if (tMs <= entry.startMs) return 0;
  if (tMs >= entry.wipeEndMs) return 1;
  const words = line.words;
  if (!words?.length) return (tMs - entry.startMs) / (entry.wipeEndMs - entry.startMs);
  const total = words.reduce((sum, word) => sum + word.text.length, 0);
  if (total === 0) return (tMs - entry.startMs) / (entry.wipeEndMs - entry.startMs);
  let done = 0;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const wordStart = index === 0 ? entry.startMs : word.timeMs;
    const wordEnd = index + 1 < words.length ? words[index + 1].timeMs : entry.wipeEndMs;
    if (tMs >= wordEnd) {
      done += word.text.length;
      continue;
    }
    const fraction = wordEnd > wordStart ? clamp((tMs - wordStart) / (wordEnd - wordStart), 0, 1) : 1;
    return clamp((done + fraction * word.text.length) / total, 0, 1);
  }
  return 1;
}

/** What lane `lane` shows at `tMs` ({ entry, opacity, progress }), or null when it is empty. */
export function laneStateAt(schedule, lines, lane, tMs) {
  const entries = schedule.lanes[lane];
  let low = 0;
  let high = entries.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (entries[middle].showMs <= tMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0) return null;
  const entry = entries[found];
  if (tMs >= entry.goneMs) return null;
  const line = lines[entry.index];
  if (!line) return null;
  let opacity = 1;
  if (tMs < entry.showMs + entry.fadeInMs) opacity = (tMs - entry.showMs) / entry.fadeInMs;
  else if (tMs >= entry.departMs) opacity = 1 - (tMs - entry.departMs) / entry.fadeOutMs;
  return { entry, opacity: clamp(opacity, 0, 1), progress: wipeProgress(line, entry, tMs) };
}

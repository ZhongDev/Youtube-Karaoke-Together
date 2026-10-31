import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { laneStateAt, scheduleTwoTrack, wipeProgress } from "./twoTrack";
import "./lyrics.css";

// Joysound-style two-lane display (see twoTrack.js for the timing model).
// Ported from ZhongDev/Youtube-Karaoke-App (TwoTrackLyrics.tsx). Each frame
// reads the lyric time, asks the schedule what each lane shows, and writes
// opacity and the wipe clip straight into the DOM; React only re-renders when
// a lane switches to a different line.
//
// The wipe uses two clip-paths: the highlight layer is revealed from the left
// up to the sung position, and the base layer underneath is hidden up to where
// the wipe was WIPE_OVERLAP_MS ago. With no base drawn under sung text, its
// black outline cannot peek out around the highlight; the lag keeps the two
// edges overlapping so no gap opens between them.

const WIPE_OVERLAP_MS = 80;
// Glyph ink (descenders, the outer stroke) paints past the line box, so every
// clip edge except the moving one sits this far outside it.
const INK_BLEED = "0.3em";

function highlightClip(progress) {
  if (progress <= 0) return "inset(0 100% 0 0)";
  if (progress >= 1) return "none";
  return `inset(-${INK_BLEED} ${((1 - progress) * 100).toFixed(2)}% -${INK_BLEED} -${INK_BLEED})`;
}

function baseClip(trailing) {
  if (trailing <= 0) return "none";
  if (trailing >= 1) return "inset(0 0 0 100%)";
  return `inset(-${INK_BLEED} -${INK_BLEED} -${INK_BLEED} ${(trailing * 100).toFixed(2)}%)`;
}

function Segments({ segments }) {
  return segments.map((segment, index) => (segment.ruby ? (
    <ruby key={index}>{segment.base}<rt>{segment.ruby}</rt></ruby>
  ) : (
    <span key={index}>{segment.base}</span>
  )));
}

/**
 * @param lines  timed lines ({ timeMs, text, words? }), sorted
 * @param rubyLines reading-aid segments per line (same index), or null
 * @param getTimeMs returns the current lyric time in milliseconds; called every frame
 */
export default function TwoTrackLyrics({ lines, rubyLines, getTimeMs }) {
  const schedule = useMemo(() => scheduleTwoTrack(lines), [lines]);
  const [slots, setSlots] = useState([null, null]);
  const lineEls = useRef([null, null]);
  const baseEls = useRef([null, null]);
  const highlightEls = useRef([null, null]);
  const getTimeRef = useRef(getTimeMs);
  getTimeRef.current = getTimeMs;

  useEffect(() => {
    let frame = 0;
    const shown = [null, null];
    const tick = () => {
      const tMs = getTimeRef.current();
      let changed = false;
      for (const lane of [0, 1]) {
        const laneState = Number.isFinite(tMs) ? laneStateAt(schedule, lines, lane, tMs) : null;
        const index = laneState?.entry.index ?? null;
        if (index !== shown[lane]) {
          shown[lane] = index;
          changed = true;
        }
        const element = lineEls.current[lane];
        // A freshly assigned line mounts on the next render; style it from then on.
        if (element && laneState && index !== null && element.dataset.index === String(index)) {
          element.style.opacity = laneState.opacity.toFixed(3);
          const highlight = highlightEls.current[lane];
          const base = baseEls.current[lane];
          if (highlight) highlight.style.clipPath = highlightClip(laneState.progress);
          if (base) base.style.clipPath = baseClip(wipeProgress(lines[index], laneState.entry, tMs - WIPE_OVERLAP_MS));
        }
      }
      if (changed) setSlots([shown[0], shown[1]]);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [schedule, lines]);

  // Text never resizes while shown, but an over-long line is shrunk once,
  // before its first frame, so it fits its lane on one row.
  useLayoutEffect(() => {
    for (const lane of [0, 1]) {
      const element = lineEls.current[lane];
      if (!element) continue;
      element.style.fontSize = "";
      // The lane's content box: lanes are anchored left and right, so a line
      // that reached into the padding would be clipped on one side.
      const laneElement = element.parentElement;
      const laneStyle = laneElement ? getComputedStyle(laneElement) : null;
      const room = laneElement ? laneElement.clientWidth - parseFloat(laneStyle.paddingLeft) - parseFloat(laneStyle.paddingRight) : 0;
      const need = element.scrollWidth;
      if (room > 0 && need > room) {
        const size = parseFloat(getComputedStyle(element).fontSize);
        element.style.fontSize = `${Math.max(size * 0.45, size * (room / need) * 0.98)}px`;
      }
    }
  }, [slots, rubyLines]);

  return (
    <div className={`ytkt-twotrack${rubyLines ? " has-ruby" : ""}`}>
      {[0, 1].map((lane) => {
        const index = slots[lane];
        const line = index === null ? undefined : lines[index];
        const segments = (index !== null && rubyLines?.[index]) || (line ? [{ base: line.text }] : []);
        return (
          <div key={lane} className="ytkt-tt-lane">
            {line && (
              <div
                key={index}
                className="ytkt-tt-line"
                data-index={index}
                style={{ opacity: 0 }}
                ref={(element) => { lineEls.current[lane] = element; }}
              >
                <span className="ytkt-tt-text base" ref={(element) => { baseEls.current[lane] = element; }}>
                  <Segments segments={segments} />
                </span>
                <span className="ytkt-tt-text hl" aria-hidden ref={(element) => { highlightEls.current[lane] = element; }}>
                  <Segments segments={segments} />
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

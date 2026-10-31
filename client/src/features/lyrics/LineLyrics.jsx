import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { lineIndexAt, readingText, timedLines } from "./lyricsDocument";

// Per-line lyrics for a phone: every line in a scrolling column, the line
// being sung highlighted and kept centred. With time sync off (or for lyrics
// that have no timestamps) it is a plain list the reader scrolls themselves.

/** After the reader scrolls by hand, leave the position alone this long. */
const MANUAL_SCROLL_HOLD_MS = 4000;

export default function LineLyrics({ document, synced, getTimeMs, showReading = true }) {
  const lines = document?.lines || [];
  const timed = useMemo(() => timedLines(document), [document]);
  const following = synced && timed.length > 0;
  const [current, setCurrent] = useState(-1);
  const containerRef = useRef(null);
  const lineRefs = useRef([]);
  const manualUntilRef = useRef(0);
  const getTimeRef = useRef(getTimeMs);
  getTimeRef.current = getTimeMs;

  useEffect(() => {
    if (!following) {
      setCurrent(-1);
      return undefined;
    }
    let frame = 0;
    let shown = -2;
    const tick = () => {
      const tMs = getTimeRef.current?.();
      const index = Number.isFinite(tMs) ? lineIndexAt(timed, tMs) : -1;
      if (index !== shown) {
        shown = index;
        setCurrent(index);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [following, timed]);

  useEffect(() => {
    if (!following || current < 0 || Date.now() < manualUntilRef.current) return;
    const container = containerRef.current;
    const element = lineRefs.current[current];
    if (!container || !element) return;
    const target = element.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
    container.scrollTo?.({ top: Math.max(0, target), behavior: "smooth" });
  }, [current, following]);

  const holdScroll = () => { manualUntilRef.current = Date.now() + MANUAL_SCROLL_HOLD_MS; };

  return (
    <Box
      ref={containerRef}
      onWheel={holdScroll}
      onTouchMove={holdScroll}
      data-testid="line-lyrics"
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        position: "relative",
        px: 2,
        // Room above and below so the first and last lines can sit centred.
        py: following ? "35vh" : 2,
        scrollbarWidth: "thin",
      }}
    >
      {lines.map((line, index) => {
        const isCurrent = following && index === current;
        const isPast = following && index < current;
        const reading = showReading ? readingText(line.ruby, document.readingMode) : "";
        if (!line.text) return <Box key={index} sx={{ height: "1.2em" }} />;
        return (
          <Box
            key={index}
            ref={(element) => { lineRefs.current[index] = element; }}
            aria-current={isCurrent ? "true" : undefined}
            sx={{
              py: 0.75,
              textAlign: "center",
              opacity: following ? (isCurrent ? 1 : isPast ? 0.38 : 0.6) : 0.95,
              transform: isCurrent ? "scale(1.04)" : "none",
              transition: "opacity 0.25s ease, transform 0.25s ease",
            }}
          >
            {reading && (
              <Typography component="div" sx={{ fontSize: "0.8rem", lineHeight: 1.3, color: isCurrent ? "#F9A8D4" : "#A78BFA" }}>
                {reading}
              </Typography>
            )}
            <Typography
              component="div"
              sx={{
                fontSize: isCurrent ? "1.35rem" : "1.1rem",
                fontWeight: isCurrent ? 800 : 500,
                lineHeight: 1.35,
                color: isCurrent ? "#fff" : "text.primary",
                textShadow: isCurrent ? "0 0 18px rgba(236, 72, 153, 0.55)" : "none",
                transition: "font-size 0.2s ease",
                wordBreak: "break-word",
              }}
            >
              {line.text}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

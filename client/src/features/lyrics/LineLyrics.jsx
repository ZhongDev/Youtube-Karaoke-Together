import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // Space above and below the lines, half the box's height, so the first and
  // last lines can be centred too.
  const [edge, setEdge] = useState(0);
  const containerRef = useRef(null);
  const lineRefs = useRef([]);
  const manualUntilRef = useRef(0);
  const currentRef = useRef(-1);
  currentRef.current = following ? current : -1;
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

  // Centre the current line in the part of the box the reader can actually
  // see: browser toolbars, in-app browser bars, or the keyboard can cover the
  // box's lower edge on some phones, and centring on the whole box would then
  // leave the line too low.
  const centreCurrent = useCallback((behavior) => {
    const container = containerRef.current;
    const element = lineRefs.current[currentRef.current];
    if (!container || !element || Date.now() < manualUntilRef.current) return;
    const box = container.getBoundingClientRect();
    const line = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport ? viewport.offsetTop : 0;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const visibleTop = Math.max(box.top, viewportTop);
    const visibleBottom = Math.min(box.top + container.clientHeight, viewportBottom);
    const middle = visibleBottom > visibleTop ? (visibleTop + visibleBottom) / 2 : box.top + container.clientHeight / 2;
    container.scrollTo?.({ top: Math.max(0, container.scrollTop + line.top + line.height / 2 - middle), behavior });
  }, []);

  useEffect(() => {
    if (following && current >= 0) centreCurrent("smooth");
  }, [current, following, centreCurrent]);

  // Size the edges to the box, and keep the line centred when the box or the
  // visible area changes size (rotation, toolbars showing or hiding).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const recentre = () => requestAnimationFrame(() => centreCurrent("auto"));
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      setEdge(Math.floor(container.clientHeight / 2));
      recentre();
    });
    observer?.observe(container);
    window.visualViewport?.addEventListener("resize", recentre);
    return () => {
      observer?.disconnect();
      window.visualViewport?.removeEventListener("resize", recentre);
    };
  }, [centreCurrent]);

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
        px: 2,
        // The browser must not shift the scroll position itself as lines resize.
        overflowAnchor: "none",
        scrollbarWidth: "thin",
      }}
    >
      {/* The edge space lives on this inner column, not on the scroll box: as
          padding on the box it set a minimum height (70vh) taller than the
          panel on phones, so the box overflowed under the controls, the
          navigation, and the browser toolbar, and lines were centred too low. */}
      <Box sx={{ py: following ? (edge ? `${edge}px` : "35vh") : 2 }}>
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
                  // No size transition: the line is measured for centring as soon
                  // as it becomes current, so its height must already be final.
                  wordBreak: "break-word",
                }}
              >
                {line.text}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

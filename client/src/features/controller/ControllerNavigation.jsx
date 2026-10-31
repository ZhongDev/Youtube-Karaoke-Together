import React from "react";
import { BottomNavigation, BottomNavigationAction } from "@mui/material";
import { Lyrics, QueueMusic, Search, Settings, SkipNext } from "@mui/icons-material";

// Tab order; Control.jsx renders the panel at the same index.
export const CONTROLLER_TABS = Object.freeze({ search: 0, queue: 1, lyrics: 2, controls: 3, settings: 4 });
/** Height of the fixed bottom navigation, which full-height panels sit above. */
export const CONTROLLER_NAV_HEIGHT = 64;

const actions = [
  ["Search", <Search key="search" />],
  ["Queue", <QueueMusic key="queue" />],
  ["Lyrics", <Lyrics key="lyrics" />],
  ["Controls", <SkipNext key="controls" />],
  ["Settings", <Settings key="settings" />],
];

const ControllerNavigation = ({ value, onChange }) => (
  <BottomNavigation value={value} onChange={(event, next) => onChange(next)} sx={{
    position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(18,18,26,.95)",
    backdropFilter: "blur(20px)", borderTop: "1px solid rgba(148,163,184,.1)", height: CONTROLLER_NAV_HEIGHT,
  }}>
    {actions.map(([label, icon]) => <BottomNavigationAction key={label} label={label} icon={icon} sx={{ minWidth: 0, px: 0.5, color: "text.secondary", "&.Mui-selected": { color: "#8B5CF6" } }} />)}
  </BottomNavigation>
);

export default ControllerNavigation;

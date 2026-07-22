import React from "react";
import { BottomNavigation, BottomNavigationAction } from "@mui/material";
import { QueueMusic, Search, Settings, SkipNext } from "@mui/icons-material";

const actions = [
  ["Search", <Search key="search" />],
  ["Queue", <QueueMusic key="queue" />],
  ["Controls", <SkipNext key="controls" />],
  ["Settings", <Settings key="settings" />],
];

const ControllerNavigation = ({ value, onChange }) => (
  <BottomNavigation value={value} onChange={(event, next) => onChange(next)} sx={{
    position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(18,18,26,.95)",
    backdropFilter: "blur(20px)", borderTop: "1px solid rgba(148,163,184,.1)", height: 64,
  }}>
    {actions.map(([label, icon]) => <BottomNavigationAction key={label} label={label} icon={icon} sx={{ color: "text.secondary", "&.Mui-selected": { color: "#8B5CF6" } }} />)}
  </BottomNavigation>
);

export default ControllerNavigation;

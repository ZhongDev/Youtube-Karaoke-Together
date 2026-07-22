import React, { useState, useEffect } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
  LinearProgress,
} from "@mui/material";
import {
  PlaylistAdd as PlaylistIcon,
  Delete as DeleteIcon,
  SkipNext as SkipNextIcon,
  QueueMusic as QueueMusicIcon,
  Lyrics as LyricsIcon,
  OpenInNew as OpenInNewIcon,
  DragIndicator as DragIndicatorIcon,
} from "@mui/icons-material";
import { useParams } from "react-router-dom";
import useSocket from "../hooks/useSocket";
import { decodeHtmlEntities } from "../config";
import { reorderQueueForDrag } from "../features/controller/queueOrdering";

// Matches any Hiragana, Katakana (full + half width), or CJK Unified Ideograph.
// Kanji are shared with Chinese, but for karaoke-title detection this is
// intentional: most Japanese song titles are kanji-only or mixed kana/kanji.
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF65-\uFF9F]/;

const containsJapanese = (text) => typeof text === "string" && JAPANESE_CHAR_REGEX.test(text);

const buildLyricsSearchUrl = (title, romajiEnabled) => {
  const safeTitle = (title || "").trim();
  const parts = [safeTitle];
  if (romajiEnabled && containsJapanese(safeTitle)) parts.push("romaji");
  parts.push("lyrics");
  const query = parts.join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

// Defined outside Queue so its identity is stable across renders. If this were
// declared inside Queue, every parent re-render (e.g. the 1Hz playback-updated
// event) would produce a brand-new component type, causing React to unmount
// and remount every card's DOM node — which wipes the user's text selection.
const VideoCard = React.memo(function VideoCard({
  video,
  onAction,
  actionIcon,
  actionColor,
  actionBgColor,
  isNowPlaying = false,
  queueColorsEnabled = true,
  isConnected,
  controllerKey,
  leadingAction = null,
}) {
  const hue = video.colorHue;
  const hasColor = queueColorsEnabled && !isNowPlaying && hue != null;
  const displayTitle = decodeHtmlEntities(video.title);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        p: 2,
        borderRadius: 2,
        background: isNowPlaying
          ? "transparent"
          : hasColor
            ? `linear-gradient(135deg, hsla(${hue}, 66.6%, 66.6%, 0.1) 0%, hsla(${hue}, 66.6%, 66.6%, 0.06) 100%)`
            : "rgba(139, 92, 246, 0.05)",
        border: isNowPlaying
          ? "none"
          : hasColor
            ? `1px solid hsla(${hue}, 66.6%, 66.6%, 0.2)`
            : "1px solid rgba(148, 163, 184, 0.08)",
        transition: "background 0.2s ease, border 0.2s ease",
        "&:hover": isNowPlaying ? {} : {
          background: hasColor
            ? `linear-gradient(135deg, hsla(${hue}, 66.6%, 66.6%, 0.28) 0%, hsla(${hue}, 66.6%, 66.6%, 0.1) 100%)`
            : "rgba(139, 92, 246, 0.1)",
          border: hasColor
            ? `1px solid hsla(${hue}, 66.6%, 66.6%, 0.35)`
            : "1px solid rgba(139, 92, 246, 0.2)",
        },
      }}
    >
      {leadingAction}
      {/* Thumbnail */}
      <Box
        component="img"
        src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
        alt={displayTitle}
        sx={{
          width: 100,
          height: 56,
          borderRadius: 1.5,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: "text.primary",
            mb: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.4,
          }}
        >
          {displayTitle}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Added by: {video.addedBy}
          </Typography>
          {video.isPlaylist && (
            <Chip
              size="small"
              icon={<PlaylistIcon sx={{ fontSize: 12 }} />}
              label="Playlist"
              sx={{
                height: 18,
                fontSize: "0.65rem",
                background: "rgba(139, 92, 246, 0.2)",
                color: "#A78BFA",
                border: "none",
                "& .MuiChip-icon": { color: "#A78BFA" },
              }}
            />
          )}
        </Box>
      </Box>

      {/* Action Button */}
      <IconButton
        onClick={onAction}
        disabled={!isConnected || !controllerKey}
        sx={{
          flexShrink: 0,
          color: actionColor,
          background: actionBgColor,
          "&:hover": {
            background: actionBgColor.replace("0.1", "0.2"),
          },
          "&:disabled": {
            color: "rgba(148, 163, 184, 0.3)",
            background: "rgba(148, 163, 184, 0.05)",
          },
        }}
      >
        {actionIcon}
      </IconButton>
    </Box>
  );
});

const QueueItemTransition = ({ children }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -30 }}
    transition={{
      layout: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
      opacity: { duration: 0.15, ease: "easeOut" },
      y: { duration: 0.15, ease: [0.0, 0, 0.2, 1] },
    }}
  >
    {children}
  </motion.div>
);

const SortableQueueItem = ({ video, disabled, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(video.queueId), disabled });
  const displayTitle = decodeHtmlEntities(video.title);
  const handle = (
    <IconButton
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${displayTitle}`}
      disabled={disabled}
      size="small"
      sx={{
        flexShrink: 0,
        touchAction: "none",
        cursor: disabled ? "default" : "grab",
        color: disabled ? "text.disabled" : "text.secondary",
        "&:active": { cursor: "grabbing" },
      }}
    >
      <DragIndicatorIcon />
    </IconButton>
  );
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
        position: "relative",
        zIndex: isDragging ? 2 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }}
    >
      <QueueItemTransition>{children(handle)}</QueueItemTransition>
    </Box>
  );
};

const Queue = ({ controllerKey, controllerId, queueColorsEnabled = true, lyricsRomajiEnabled = false }) => {
  const { roomId } = useParams();
  const [queue, setQueue] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [settingsState, setSettingsState] = useState({
    roundRobinEnabled: false,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState(null);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  // Use the socket hook
  const {
    socket,
    isConnected,
    connectionError,
    serverError,
    clearServerError,
  } = useSocket();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Handle socket connection and listen for room updates
  useEffect(() => {
    if (!roomId) {
      console.error("[ERR] No roomId provided");
      return;
    }

    console.log("[INFO] Queue component mounted, roomId:", roomId);

    if (!socket) return;

    const handleRoomState = (room) => {
      console.log("[INFO] Queue received room state:", room);
      setQueue(room.queue || []);
      setCurrentVideo(room.currentVideo);
      setPlayback(room.playback || null);
      setSettingsState(room.settings || { roundRobinEnabled: false });
      setIsLoading(false);
    };

    const handleQueueUpdated = (newQueue) => {
      console.log("[INFO] Queue updated:", newQueue);
      setQueue(newQueue);
    };

    const handleVideoChanged = (video) => {
      console.log("[INFO] Video changed:", video);
      setCurrentVideo(video);
    };

    const handleSettingsUpdated = (settings) =>
      setSettingsState(settings || { roundRobinEnabled: false });
    const handlePlaybackUpdated = (pb) => setPlayback(pb);

    socket.on("room-state", handleRoomState);
    socket.on("queue-updated", handleQueueUpdated);
    socket.on("settings-updated", handleSettingsUpdated);
    socket.on("video-changed", handleVideoChanged);
    socket.on("playback-updated", handlePlaybackUpdated);

    // Request current room state when Queue mounts (it may have been emitted before Queue was mounted)
    if (isConnected) {
      socket.emit("request-room-state", { roomId });
    }

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("video-changed", handleVideoChanged);
      socket.off("settings-updated", handleSettingsUpdated);
      socket.off("playback-updated", handlePlaybackUpdated);
    };
  }, [roomId, socket, isConnected]);

  // Show server error notifications
  useEffect(() => {
    if (serverError) {
      setNotification({
        open: true,
        message: `Server Error: ${serverError.message}`,
        severity: "error",
      });
      clearServerError();
    }
  }, [serverError, clearServerError]);

  const handleDeleteClick = (video) => {
    setVideoToDelete({ video });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (videoToDelete && controllerKey && socket) {
      socket.timeout(10_000).emit("remove-from-queue", {
        roomId,
        queueId: videoToDelete.video.queueId,
        controllerKey,
      }, (error, response) => {
        if (error || !response?.ok) setNotification({
          open: true,
          message: response?.error?.message || "Removing the queue item timed out.",
          severity: "error",
        });
      });
      setDeleteDialogOpen(false);
      setVideoToDelete(null);
    } else if (!controllerKey) {
      setNotification({
        open: true,
        message: "Not authenticated. Please refresh the page.",
        severity: "error",
      });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setVideoToDelete(null);
  };

  const handleSkipClick = () => {
    setSkipDialogOpen(true);
  };

  const handleSkipConfirm = () => {
    if (controllerKey && socket) {
      socket.timeout(10_000).emit("play-next", {
        roomId,
        controllerKey,
        expectedQueueId: currentVideo?.queueId,
      }, (error, response) => {
        if (error || !response?.ok) setNotification({
          open: true,
          message: response?.error?.message || "Skip request timed out.",
          severity: "error",
        });
      });
      setSkipDialogOpen(false);
    } else {
      setNotification({
        open: true,
        message: "Not authenticated. Please refresh the page.",
        severity: "error",
      });
    }
  };

  const handleSkipCancel = () => {
    setSkipDialogOpen(false);
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over || !socket || !controllerKey || !isConnected) return;
    const reordered = reorderQueueForDrag(
      queue,
      active.id,
      over.id,
      Boolean(settingsState.roundRobinEnabled),
      controllerId
    );
    if (!reordered) return;
    setQueue(reordered.queue);
    setIsReordering(true);
    socket.timeout(10_000).emit("reorder-queue", {
      roomId,
      controllerKey,
      orderedQueueIds: reordered.orderedQueueIds,
    }, (error, response) => {
      setIsReordering(false);
      if (error || !response?.ok) {
        setNotification({
          open: true,
          message: response?.error?.message || "Reordering the queue timed out.",
          severity: "error",
        });
        socket.emit("request-room-state", { roomId });
      }
    });
  };

  const formatTime = (sec) => {
    if (sec == null || Number.isNaN(sec)) return "--:--";
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  const roundRobinEnabled = Boolean(settingsState.roundRobinEnabled);
  const sortableQueue = roundRobinEnabled
    ? queue.filter((video) => video.controllerId === controllerId)
    : queue;
  const sortableIds = sortableQueue.map((video) => String(video.queueId));
  const sortableIdSet = new Set(sortableIds);
  const reorderDisabled = !isConnected || !controllerKey || isReordering || sortableIds.length < 2;

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: "auto" }}>
      {/* Main Container */}
      <Paper
        elevation={0}
        sx={{
          background: "rgba(18, 18, 26, 0.7)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 2.5,
            borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
          }}
        >
          <QueueMusicIcon sx={{ color: "#8B5CF6" }} />
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
            Queue
          </Typography>
          {!isConnected && (
            <Chip
              label="Disconnected"
              size="small"
              sx={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#EF4444",
                fontWeight: 500,
              }}
            />
          )}
          {!controllerKey && (
            <Chip
              label="Not Authenticated"
              size="small"
              sx={{
                background: "rgba(245, 158, 11, 0.15)",
                color: "#F59E0B",
                fontWeight: 500,
              }}
            />
          )}
        </Box>

        {/* Connection Error */}
        {connectionError && (
          <Alert
            severity="error"
            sx={{
              m: 2,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 2,
            }}
          >
            Connection Error: {connectionError}
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && isConnected && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress sx={{ color: "#8B5CF6" }} />
          </Box>
        )}

        {/* Content */}
        {!isLoading && (
          <Box sx={{ p: 2 }}>
            {/* Now Playing Section */}
            {currentVideo && (
              <Box sx={{ mb: 3 }}>
                <Box
                  sx={{
                    p: 2,
                    background: "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%)",
                    borderRadius: 2,
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                      mb: 1.5,
                    }}
                  >
                    <Typography
                      variant="overline"
                      sx={{
                        color: "#8B5CF6",
                        fontWeight: 700,
                        letterSpacing: 1,
                        lineHeight: 1,
                      }}
                    >
                      Now Playing
                    </Typography>
                    <Button
                      component="a"
                      href={buildLyricsSearchUrl(decodeHtmlEntities(currentVideo.title), lyricsRomajiEnabled)}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                      startIcon={<LyricsIcon sx={{ fontSize: 14 }} />}
                      endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                      sx={{
                        textTransform: "none",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        letterSpacing: 0.3,
                        minHeight: 0,
                        py: 0.25,
                        px: 1.25,
                        borderRadius: 999,
                        color: "#A78BFA",
                        background: "rgba(139, 92, 246, 0.12)",
                        border: "1px solid rgba(139, 92, 246, 0.25)",
                        "&:hover": {
                          background: "rgba(139, 92, 246, 0.22)",
                          border: "1px solid rgba(139, 92, 246, 0.4)",
                        },
                      }}
                    >
                      Lyrics
                    </Button>
                  </Box>

                  <VideoCard
                    video={currentVideo}
                    onAction={handleSkipClick}
                    actionIcon={<SkipNextIcon />}
                    actionColor="#EC4899"
                    actionBgColor="rgba(236, 72, 153, 0.1)"
                    isNowPlaying
                    queueColorsEnabled={queueColorsEnabled}
                    isConnected={isConnected}
                    controllerKey={controllerKey}
                  />

                  {/* Progress Bar */}
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", minWidth: 36, fontFamily: "monospace" }}
                      >
                        {formatTime(playback?.positionSec)}
                      </Typography>
                      <LinearProgress
                        variant={playback?.durationSec ? "determinate" : "indeterminate"}
                        value={
                          playback?.durationSec
                            ? Math.max(0, Math.min(100, (100 * (playback?.positionSec || 0)) / (playback?.durationSec || 1)))
                            : 0
                        }
                        sx={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "rgba(148, 163, 184, 0.15)",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 2,
                            background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
                          },
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", minWidth: 36, textAlign: "right", fontFamily: "monospace" }}
                      >
                        {formatTime(playback?.durationSec)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Up Next Section */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ color: "text.secondary", fontWeight: 600 }}>
                Up Next
              </Typography>
              {queue.length > 0 && (
                <Chip
                  label={queue.length}
                  size="small"
                  sx={{
                    height: 20,
                    minWidth: 20,
                    fontSize: "0.7rem",
                    background: "rgba(139, 92, 246, 0.2)",
                    color: "#A78BFA",
                  }}
                />
              )}
              {settingsState.roundRobinEnabled && (
                <Chip
                  label="Round-robin"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: "0.65rem",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10B981",
                    ml: "auto",
                  }}
                />
              )}
            </Box>

            {queue.length > 1 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                {roundRobinEnabled
                  ? sortableIds.length > 1
                    ? "Drag your handles to change your personal order; round-robin turns stay fair."
                    : "Only videos you added can be reordered in round-robin mode."
                  : "Drag a handle to change the pending queue order."}
              </Typography>
            )}

            {/* Queue List */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <AnimatePresence initial={false}>
                    {queue.map((video, index) => {
                      const card = (leadingAction) => <VideoCard
                        video={video}
                        onAction={() => handleDeleteClick(video, index)}
                        actionIcon={<DeleteIcon fontSize="small" />}
                        actionColor="#EF4444"
                        actionBgColor="rgba(239, 68, 68, 0.1)"
                        queueColorsEnabled={queueColorsEnabled}
                        isConnected={isConnected}
                        controllerKey={controllerKey}
                        leadingAction={leadingAction}
                      />;
                      if (sortableIdSet.has(String(video.queueId))) {
                        return <SortableQueueItem key={video.queueId} video={video} disabled={reorderDisabled}>
                          {card}
                        </SortableQueueItem>;
                      }
                      return <QueueItemTransition key={video.queueId || `${video.id}-${index}`}>
                        {card(<Box aria-hidden sx={{ width: 34, flexShrink: 0 }} />)}
                      </QueueItemTransition>;
                    })}
                  </AnimatePresence>

                  {/* Empty State */}
                  {queue.length === 0 && (
                    <Box
                      sx={{
                        py: 5,
                        px: 3,
                        textAlign: "center",
                        background: "rgba(148, 163, 184, 0.03)",
                        borderRadius: 2,
                        border: "1px dashed rgba(148, 163, 184, 0.15)",
                      }}
                    >
                      <QueueMusicIcon sx={{ fontSize: 40, color: "rgba(148, 163, 184, 0.3)", mb: 1.5 }} />
                      <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
                        No videos in queue
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.7 }}>
                        Add videos from the search tab
                      </Typography>
                    </Box>
                  )}
                </Box>
              </SortableContext>
            </DndContext>
          </Box>
        )}
      </Paper>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
            minWidth: 320,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>Remove from Queue</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Are you sure you want to remove "{decodeHtmlEntities(videoToDelete?.video.title)}" from the queue?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button
            onClick={handleDeleteCancel}
            sx={{
              color: "text.secondary",
              "&:hover": { background: "rgba(148, 163, 184, 0.1)" },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
              boxShadow: "0 4px 14px rgba(239, 68, 68, 0.3)",
              "&:hover": {
                background: "linear-gradient(135deg, #F87171 0%, #EF4444 100%)",
              },
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Skip Dialog */}
      <Dialog
        open={skipDialogOpen}
        onClose={handleSkipCancel}
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
            minWidth: 320,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>Skip Current Song</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Are you sure you want to skip "{decodeHtmlEntities(currentVideo?.title)}" and move to the next song?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button
            onClick={handleSkipCancel}
            sx={{
              color: "text.secondary",
              "&:hover": { background: "rgba(148, 163, 184, 0.1)" },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSkipConfirm}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #EC4899 0%, #DB2777 100%)",
              boxShadow: "0 4px 14px rgba(236, 72, 153, 0.3)",
              "&:hover": {
                background: "linear-gradient(135deg, #F472B6 0%, #EC4899 100%)",
              },
            }}
          >
            Skip
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setNotification({ ...notification, open: false })}
          severity={notification.severity}
          sx={{
            background:
              notification.severity === "error"
                ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
                : "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
            color: "white",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
            "& .MuiAlert-icon": { color: "white" },
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Queue;

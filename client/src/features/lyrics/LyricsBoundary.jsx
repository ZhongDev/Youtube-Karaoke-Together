import React from "react";

/**
 * Contains a failure in lyrics rendering so it can never take the room's
 * player or the controller down with it: the lyrics simply disappear (or show
 * `fallback`) until the song changes, which resets the boundary.
 */
export default class LyricsBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failedKey: null };
  }

  static getDerivedStateFromError() {
    return { failedKey: Symbol("failed") };
  }

  componentDidCatch(error) {
    console.error("[ERR] Lyrics display failed:", error);
  }

  componentDidUpdate(previous) {
    if (this.state.failedKey && previous.resetKey !== this.props.resetKey) this.setState({ failedKey: null });
  }

  render() {
    return this.state.failedKey ? (this.props.fallback ?? null) : this.props.children;
  }
}

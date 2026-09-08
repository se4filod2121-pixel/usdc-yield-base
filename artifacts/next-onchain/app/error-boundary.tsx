"use client";

import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const isDev = process.env.NODE_ENV === "development";
      return (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            background: isDev ? "red" : "#111827",
            color: "white",
            padding: 16,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            maxHeight: "100vh",
            overflow: "auto",
          }}
        >
          {isDev
            ? "CAUGHT ERROR: " + this.state.error.message + "\n\n" + (this.state.error.stack || "")
            : "Something went wrong. Please refresh the page and try again."}
        </div>
      );
    }
    return this.props.children;
  }
}

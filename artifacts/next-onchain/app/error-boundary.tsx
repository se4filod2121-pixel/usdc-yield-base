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
      return (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            background: "red",
            color: "white",
            padding: 16,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            maxHeight: "100vh",
            overflow: "auto",
          }}
        >
          {"CAUGHT ERROR: " + this.state.error.message + "\n\n" + (this.state.error.stack || "")}
        </div>
      );
    }
    return this.props.children;
  }
}

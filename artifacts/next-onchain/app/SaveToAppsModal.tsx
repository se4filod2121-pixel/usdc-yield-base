"use client";

import { useState } from "react";
import { useLocale } from "../lib/LocaleContext";
import { addFrameToBaseApp, markSaveCtaSeen } from "../lib/saveToApps";

export function SaveToAppsModal({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const [pending, setPending] = useState(false);

  const dismiss = () => {
    markSaveCtaSeen();
    onClose();
  };

  const handleAdd = async () => {
    setPending(true);
    await addFrameToBaseApp();
    markSaveCtaSeen();
    setPending(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={dismiss}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "1rem",
          padding: "1.5rem",
          maxWidth: "26rem",
          width: "100%",
          boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
          {t("saveAppsTitle")}
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
          {t("saveAppsBody")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <button
            onClick={handleAdd}
            disabled={pending}
            style={{
              padding: "0.75rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {t("saveAppsAdd")}
          </button>
          <button
            onClick={dismiss}
            style={{
              padding: "0.75rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            {t("saveAppsLater")}
          </button>
        </div>
      </div>
    </div>
  );
}

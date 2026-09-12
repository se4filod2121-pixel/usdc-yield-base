"use client";

export const HISTORY_KEY = "onbase_tx_history";
const MAX_HISTORY = 10;

export type HistoryEntry = { hash: string; amount: string; symbol: string; timestamp: number };

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry) {
  try {
    const current = loadHistory();
    const next = [entry, ...current].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — silently skip, not critical
  }
}

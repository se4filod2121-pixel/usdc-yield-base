"use client";

const HISTORY_KEY_PREFIX = "onbase_tx_history";
const MAX_HISTORY = 10;

export type HistoryEntry = { hash: string; amount: string; symbol: string; timestamp: number };

// Scoped per wallet address rather than one shared key — otherwise a
// visitor with no wallet connected (or a different wallet than the one
// that made a deposit) would see someone else's transaction history.
function historyKey(address: string): string {
  return `${HISTORY_KEY_PREFIX}:${address.toLowerCase()}`;
}

export function loadHistory(address: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(address));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(address: string, entry: HistoryEntry) {
  try {
    const current = loadHistory(address);
    const next = [entry, ...current].slice(0, MAX_HISTORY);
    localStorage.setItem(historyKey(address), JSON.stringify(next));
  } catch {
    // localStorage unavailable — silently skip, not critical
  }
}

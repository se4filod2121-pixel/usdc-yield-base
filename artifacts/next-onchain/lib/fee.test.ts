import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFee } from "./fee";

test("computeFee takes 10 bps (0.1%) of the amount", () => {
  assert.equal(computeFee(1_000_000n), 1_000n); // 1 USDC -> 0.001 USDC fee
});

test("computeFee is zero for a zero amount", () => {
  assert.equal(computeFee(0n), 0n);
});

test("computeFee rounds down for amounts smaller than one fee unit", () => {
  assert.equal(computeFee(999n), 0n);
});

test("computeFee never exceeds the deposited amount", () => {
  const amount = 5_000_000n;
  assert.ok(computeFee(amount) < amount);
});

import assert from "node:assert/strict";
import test from "node:test";
import { advanceOlaRiseKnock, initialOlaRiseKnockState } from "../src/components/OlaRiseLayer";

function run(times: number[]) {
  let state = initialOlaRiseKnockState();
  let complete = false;
  for (const now of times) {
    const result = advanceOlaRiseKnock(state, now);
    state = result.state;
    complete ||= result.complete;
  }
  return complete;
}

test("three quick taps, pause, three quick taps completes the OLA: RISE knock", () => {
  assert.equal(run([100, 300, 450, 1500, 1700, 1850]), true);
});

test("the first quick triple is only the shared first-layer prefix", () => {
  assert.equal(run([100, 300, 450]), false);
});

test("six rapid taps without the required pause do not complete the OLA: RISE knock", () => {
  assert.equal(run([100, 220, 340, 460, 580, 700]), false);
});

test("an overlong pause resets the OLA: RISE knock", () => {
  assert.equal(run([100, 250, 400, 4000, 4200, 4350]), false);
});

test("a slow triple does not satisfy either burst", () => {
  assert.equal(run([100, 700, 800, 1900, 2100, 2250]), false);
});

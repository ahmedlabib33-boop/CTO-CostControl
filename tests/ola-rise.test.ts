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

test("two quick taps, pause, three quick taps completes the OLA: RISE knock", () => {
  assert.equal(run([100, 300, 1400, 1600, 1750]), true);
});

test("the first quick pair waits for the paused second burst", () => {
  assert.equal(run([100, 300]), false);
});

test("five rapid taps without the required pause do not complete the OLA: RISE knock", () => {
  assert.equal(run([100, 220, 340, 460, 580]), false);
});

test("an overlong pause resets the OLA: RISE knock", () => {
  assert.equal(run([100, 250, 4000, 4200, 4350]), false);
});

test("a slow second triple does not satisfy the second burst", () => {
  assert.equal(run([100, 250, 1400, 2000, 2150]), false);
});

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

test("two taps, pause, one tap, pause, two taps completes the OLA: RISE knock", () => {
  assert.equal(run([100, 300, 1400, 2500, 2700]), true);
});

test("five rapid taps do not complete the OLA: RISE knock", () => {
  assert.equal(run([100, 250, 400, 550, 700]), false);
});

test("an overlong pause resets the OLA: RISE knock", () => {
  assert.equal(run([100, 250, 4000, 5100, 5300]), false);
});

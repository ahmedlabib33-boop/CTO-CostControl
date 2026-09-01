"use client";

import { useEffect } from "react";

export const OLA_RISE_KEY_SEQUENCE = "654123";

export type OlaRiseKnockState = {
  stage: 0 | 1 | 2 | 3 | 4;
  lastTapAt: number;
  burstStartedAt: number;
};

export const OLA_RISE_KNOCK = {
  quickTapMaximumMs: 450,
  tripleTapMaximumMs: 850,
  firstBurstTapCount: 2,
  secondBurstTapCount: 3,
  pauseMinimumMs: 950,
  pauseMaximumMs: 2600,
} as const;

export function initialOlaRiseKnockState(): OlaRiseKnockState {
  return { stage: 0, lastTapAt: 0, burstStartedAt: 0 };
}

export function advanceOlaRiseKnock(
  current: OlaRiseKnockState,
  now: number,
): { state: OlaRiseKnockState; complete: boolean } {
  const elapsed = current.lastTapAt ? now - current.lastTapAt : 0;
  const restart = (): { state: OlaRiseKnockState; complete: false } => ({
    state: { stage: 1, lastTapAt: now, burstStartedAt: now },
    complete: false,
  });

  if (current.stage === 0) return restart();
  if (current.stage === 1) {
    if (elapsed <= OLA_RISE_KNOCK.quickTapMaximumMs) {
      return {
        state: { ...current, stage: 2, lastTapAt: now },
        complete: false,
      };
    }
    return restart();
  }
  if (current.stage === 2) {
    if (
      elapsed >= OLA_RISE_KNOCK.pauseMinimumMs &&
      elapsed <= OLA_RISE_KNOCK.pauseMaximumMs
    ) {
      return {
        state: { stage: 3, lastTapAt: now, burstStartedAt: now },
        complete: false,
      };
    }
    return restart();
  }
  if (current.stage === 3) {
    if (elapsed <= OLA_RISE_KNOCK.quickTapMaximumMs) {
      return {
        state: { ...current, stage: 4, lastTapAt: now },
        complete: false,
      };
    }
    return restart();
  }
  if (
    elapsed <= OLA_RISE_KNOCK.quickTapMaximumMs &&
    now - current.burstStartedAt <= OLA_RISE_KNOCK.tripleTapMaximumMs
  ) {
    return { state: initialOlaRiseKnockState(), complete: true };
  }
  return restart();
}

export default function OlaRiseLayer({ onExit }: { onExit: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onExit]);

  return (
    <div id="olaRiseOverlay" role="dialog" aria-modal="true" aria-label="OLA: RISE — Memory. Decisions. Projects. Destiny.">
      <iframe
        className="olaRiseFrame"
        src="/ola-rise/index.html?release=20260901-v28"
        title="OLA: RISE — Memory. Decisions. Projects. Destiny."
        allow="fullscreen; gamepad"
      />
      <button type="button" className="olaRiseExit" onClick={onExit} aria-label="Return to CTO Cost Intelligence">
        <span>Exit game</span>
        <b>×</b>
      </button>
    </div>
  );
}

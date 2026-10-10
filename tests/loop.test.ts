import { describe, expect, it } from 'vitest';
import { FixedStepLoop, type LoopHooks } from '../src/engine/loop';

function harness(stepMs = 100) {
  const log = { updates: 0, alphas: [] as number[] };
  let running = true;
  const hooks: LoopHooks = {
    stepMs: () => stepMs,
    isRunning: () => running,
    update: () => {
      log.updates++;
    },
    render: (alpha) => {
      log.alphas.push(alpha);
    },
  };
  const loop = new FixedStepLoop(hooks, { request: () => 1, cancel: () => {} });
  return { loop, log, setRunning: (r: boolean) => (running = r) };
}

describe('FixedStepLoop', () => {
  it('runs logic at the fixed step regardless of frame rate', () => {
    const { loop, log } = harness(100);
    loop.frame(0);
    // 60 frames at ~16.67ms = 1 second → 10 steps.
    for (let i = 1; i <= 60; i++) loop.frame((i * 1000) / 60);
    expect(log.updates).toBe(10);
  });

  it('passes the leftover fraction as alpha for interpolation', () => {
    const { loop, log } = harness(100);
    loop.frame(0);
    loop.frame(50);
    expect(log.alphas.at(-1)).toBeCloseTo(0.5);
    loop.frame(125);
    expect(log.updates).toBe(1);
    expect(log.alphas.at(-1)).toBeCloseTo(0.25);
  });

  it('clamps large frame gaps so the game never jumps ahead', () => {
    const { loop, log } = harness(100);
    loop.frame(0);
    loop.frame(10_000); // e.g. returning to a background tab
    expect(log.updates).toBeLessThanOrEqual(3);
  });

  it('does not advance while not running', () => {
    const { loop, log, setRunning } = harness(100);
    setRunning(false);
    loop.frame(0);
    loop.frame(200);
    expect(log.updates).toBe(0);
    expect(log.alphas.length).toBe(2);
  });

  it('primeStep makes the next frame tick immediately', () => {
    const { loop, log } = harness(100);
    loop.frame(0);
    loop.primeStep();
    loop.frame(1);
    expect(log.updates).toBe(1);
  });
});

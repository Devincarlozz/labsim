/**
 * SimRunner.ts: Master Simulation Clock & Tick Loop Runner
 * The single master clock owner in the application.
 * Advances simEngine with fixed timestep dt (1 ms).
 */

import { SimEngine, simEngine } from './SimEngine';
import { SimSnapshot } from './types';

type SnapshotListener = (snapshot: SimSnapshot) => void;

export class SimRunner {
  private engine: SimEngine;
  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private lastWallTime: number = 0;
  private accumulatedTime: number = 0;
  private listeners: Set<SnapshotListener> = new Set();

  constructor(engine: SimEngine = simEngine) {
    this.engine = engine;
  }

  public subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    // Send latest snapshot immediately
    listener(this.engine.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notifyListeners(snapshot: SimSnapshot): void {
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastWallTime = performance.now();
    this.accumulatedTime = 0;
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Run a single tick manually (Step mode / tests)
   */
  public stepOnce(): SimSnapshot {
    const snap = this.engine.tick();
    this.notifyListeners(snap);
    return snap;
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const elapsedSec = Math.min(0.1, (now - this.lastWallTime) / 1000); // Clamp to avoid spiral
    this.lastWallTime = now;
    this.accumulatedTime += elapsedSec;

    // Fixed timestep consumption (e.g. dt = 1ms)
    // Run up to max 50 ticks per frame to keep UI responsive
    let ticksRan = 0;
    const maxTicksPerFrame = 50;

    while (this.accumulatedTime >= this.engine.dt && ticksRan < maxTicksPerFrame) {
      this.engine.tick();
      this.accumulatedTime -= this.engine.dt;
      ticksRan++;
    }

    if (ticksRan > 0) {
      this.notifyListeners(this.engine.getSnapshot());
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}

export const simRunner = new SimRunner(simEngine);

/**
 * useSimEngine.ts: React Hook for Deterministic SimEngine Integration
 * Provides read-only immutable SimSnapshot to UI components.
 */

import { useState, useEffect } from 'react';
import { simEngine, SimEngine } from './SimEngine';
import { simRunner, SimRunner } from './SimRunner';
import { EngineCommand, SimSnapshot } from './types';

export function useSimEngine(): {
  snapshot: SimSnapshot;
  engine: SimEngine;
  runner: SimRunner;
  sendCommand: (cmd: EngineCommand) => void;
} {
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() => simEngine.getSnapshot());

  useEffect(() => {
    const unsubscribe = simRunner.subscribe((snap) => {
      setSnapshot(snap);
    });
    return unsubscribe;
  }, []);

  const sendCommand = (cmd: EngineCommand) => {
    simEngine.queueCommand(cmd);
    // If not running, step once so command applies immediately
    if (simEngine.daq.state !== 'RUNNING') {
      simRunner.stepOnce();
    }
  };

  return {
    snapshot,
    engine: simEngine,
    runner: simRunner,
    sendCommand,
  };
}

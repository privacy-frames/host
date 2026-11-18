import { startDedicatedWorker } from './contexts/worker-bootstrap.ts';
import { createGuestWorkerSession } from './session.ts';

startDedicatedWorker(
  self as unknown as DedicatedWorkerGlobalScope,
  createGuestWorkerSession,
);

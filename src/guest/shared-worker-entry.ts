import { startSharedWorker } from './contexts/worker-bootstrap.ts';
import { createGuestWorkerSession } from './session.ts';

startSharedWorker(self as unknown as SharedWorkerGlobalScope, createGuestWorkerSession);

import {
  startDedicatedWorker,
  startSharedWorker,
} from '../src/guest/contexts/worker-bootstrap.ts';
import { createGuestWorkerSession } from '../src/guest/session.ts';

if ('onconnect' in self)
  startSharedWorker(self as unknown as SharedWorkerGlobalScope, createGuestWorkerSession);
else
  startDedicatedWorker(
    self as unknown as DedicatedWorkerGlobalScope,
    createGuestWorkerSession,
  );

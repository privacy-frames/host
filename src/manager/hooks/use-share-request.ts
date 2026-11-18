import { useEffect, useState } from 'react';
import type { InstallationRequest } from '../../shared/types';
import { readShareHash } from '../share-link';
import { errorMessage } from '../types';

type ShareState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; request: InstallationRequest; hash: string };

export function useShareRequest() {
  const [state, setState] = useState<ShareState>(
    location.hash && location.hash !== '#install'
      ? { kind: 'loading' }
      : { kind: 'none' },
  );
  useEffect(() => {
    let revision = 0;
    async function read() {
      const current = ++revision;
      const hash = location.hash;
      setState(hash ? { kind: 'loading' } : { kind: 'none' });
      try {
        const request = await readShareHash(hash);
        if (current !== revision) return;
        setState(request ? { kind: 'ready', request, hash } : { kind: 'none' });
      } catch (error) {
        if (current === revision)
          setState({ kind: 'error', message: errorMessage(error) });
      }
    }
    void read();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) void read();
    };
    window.addEventListener('hashchange', read);
    window.addEventListener('pageshow', restore);
    return () => {
      revision++;
      window.removeEventListener('hashchange', read);
      window.removeEventListener('pageshow', restore);
    };
  }, []);

  function dismiss() {
    history.replaceState(null, '', location.pathname + location.search);
    // Invalidate any asynchronous decoding through the same path as browser navigation.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  return { state, dismiss };
}

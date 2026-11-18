import { useEffect, useRef, useState } from 'react';
import type { useLibrary } from '../hooks/use-library';
import type { useShareRequest } from '../hooks/use-share-request';
import { matchingInstallation } from '../share-link';
import { applicationLaunchURL } from '../../shared/runtime-url';
import { errorMessage } from '../types';

type Props = ReturnType<typeof useShareRequest> & {
  library: ReturnType<typeof useLibrary>;
};

export function SharedInstallation({ state, dismiss, library }: Props) {
  const started = useRef<string | null>(null);
  const mounted = useRef(false);
  const [operation, setOperation] = useState<{
    hash: string;
    phase: 'installing' | 'opening' | 'failed';
    error?: string;
  } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      state.kind !== 'ready' ||
      !library.ready ||
      !library.config ||
      library.installing ||
      started.current === state.hash
    )
      return;

    const { request, hash } = state;
    const runtimeURL = library.config.runtimeURL;
    started.current = hash;
    const current = () => mounted.current && location.hash === hash;
    async function open() {
      try {
        let app = matchingInstallation(request, library.apps);
        if (!app) {
          setOperation({ hash, phase: 'installing' });
          app = (await library.install(request)) ?? undefined;
        }
        if (!current()) return;
        if (!app) {
          setOperation({ hash, phase: 'failed', error: 'Could not install this app.' });
          return;
        }
        setOperation({ hash, phase: 'opening' });
        // Replace the share screen so Back does not immediately reopen the app.
        location.replace(applicationLaunchURL(app, runtimeURL).href);
      } catch (error) {
        if (current())
          setOperation({ hash, phase: 'failed', error: errorMessage(error) });
      }
    }
    void open();
  }, [state, library]);

  const request = state.kind === 'ready' ? state.request : null;
  const active =
    state.kind === 'ready' && operation?.hash === state.hash ? operation : null;
  const failure =
    state.kind === 'error'
      ? 'Could not read this share link. ' + state.message
      : library.status.error && (!library.ready || active?.phase === 'failed')
        ? library.status.message
        : active?.error;
  const installing = active?.phase === 'installing';
  const progress = installing
    ? library.status.message === 'Ready to install.'
      ? 'Preparing installation…'
      : library.status.message
    : state.kind === 'loading'
      ? 'Reading share link…'
      : 'Checking your local library…';

  return (
    <section
      aria-label="Opening shared app"
      className="flex flex-1 flex-col items-center justify-center gap-8 pb-20 text-center sm:gap-10 sm:pb-28"
    >
      {!failure && (
        <span
          aria-hidden="true"
          className="size-16 shrink-0 animate-spin rounded-full border-4 border-slate-700 border-t-slate-200 motion-reduce:animate-none sm:size-20"
        />
      )}
      <div className="w-full min-w-0 max-w-3xl">
        {failure ? (
          <>
            <p
              role="alert"
              className="text-xl leading-relaxed wrap-anywhere text-red-300 sm:text-2xl"
            >
              {failure}
            </p>
            <a
              href="./"
              className="mt-6 inline-block text-base text-slate-400"
              onClick={(event) => {
                event.preventDefault();
                dismiss();
              }}
            >
              Back to library
            </a>
          </>
        ) : (
          <div role="status" aria-live="polite">
            <p className="text-3xl leading-tight font-medium tracking-tight text-slate-100 sm:text-4xl">
              {installing ? 'Installing' : 'Opening'}
              {request ? (
                <>
                  {' '}
                  <span className="mt-4 block text-lg leading-relaxed font-normal tracking-normal wrap-anywhere text-slate-300 sm:text-2xl">
                    {request.url}
                  </span>
                </>
              ) : (
                ' app…'
              )}
            </p>
            <p className="mt-4 text-base leading-relaxed wrap-anywhere text-slate-400 sm:text-lg">
              {progress}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

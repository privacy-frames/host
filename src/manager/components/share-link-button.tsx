import { useState } from 'react';
import type { InstallationRequest } from '../../shared/types';
import { createShareURL } from '../share-link';
import { errorMessage } from '../types';

interface Props {
  recipe: () => InstallationRequest;
  managerURL?: string;
  disabled?: boolean;
}

export function ShareLinkButton({ recipe, managerURL, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  const [failed, setFailed] = useState(false);

  async function copy() {
    setBusy(true);
    setMessage('');
    setFallback('');
    setFailed(false);
    try {
      const link = await createShareURL(recipe(), managerURL || location.href);
      try {
        await navigator.clipboard.writeText(link);
        setMessage('Link copied.');
      } catch {
        setFallback(link);
        setMessage('Select and copy this link.');
      }
    } catch (error) {
      setFailed(true);
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="quiet px-3 py-2 text-xs"
        disabled={disabled || busy}
        onClick={() => void copy()}
      >
        {busy ? 'Creating link…' : 'Copy link'}
      </button>
      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={
            'mt-2 max-w-xs text-xs wrap-anywhere ' +
            (failed ? 'text-red-300' : 'text-slate-400')
          }
        >
          {message}
        </p>
      )}
      {fallback && (
        <input
          aria-label="Share link"
          readOnly
          value={fallback}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs"
        />
      )}
    </div>
  );
}

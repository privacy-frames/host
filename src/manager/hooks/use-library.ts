import { useEffect, useRef, useState } from 'react';
import { initializeManager, loadConfig } from '../services/bootstrap';
import { RuntimeBridge } from '../services/runtime-bridge';
import { InstallationBridge } from '../services/installation-bridge';
import { errorMessage } from '../types';
import type { AppSummary, HostConfig, RuntimeObservation, Status } from '../types';
import type { InstallationRequest } from '../../shared/types';
import { installationInput } from '../../installation/session';

export function useLibrary() {
  const [config, setConfig] = useState<HostConfig | null>(null);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [status, setStatus] = useState<Status>({ message: 'Starting…', error: false });
  const [ready, setReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [observations, setObservations] = useState('No observations loaded.');
  const bridge = useRef<RuntimeBridge | null>(null);
  const installer = useRef<InstallationBridge | null>(null);

  function report(message: string, error = false) {
    setStatus({ message, error });
  }

  function runtime(): RuntimeBridge {
    if (!bridge.current) throw new Error('Host is not ready.');
    return bridge.current;
  }

  async function refreshLibrary() {
    setApps(await runtime().request<AppSummary[]>('list'));
  }

  useEffect(() => {
    async function start() {
      const base = new URL('./', location.href);
      const settings = await loadConfig(base);
      setConfig(settings);
      installer.current = new InstallationBridge(new URL(settings.installationURL));
      await initializeManager(base);
      bridge.current = new RuntimeBridge(new URL(settings.runtimeURL), () => {
        report('Allow application storage to continue.');
      });
      await refreshLibrary();
      setReady(true);
      report('Ready to install.');
    }

    void start().catch((error: unknown) => report(errorMessage(error), true));
  }, []);

  async function install(request: InstallationRequest): Promise<AppSummary | null> {
    setInstalling(true);
    try {
      await runtime().connect();
      if (!installer.current) throw new Error('Installation origin is not configured.');
      const result = await installer.current.install(
        installationInput(request),
        report,
        async (input) => {
          report('Installing…');
          return runtime().request<{ id: string }>('install', input);
        },
      );
      await refreshLibrary();
      const installed = (await runtime().request<AppSummary[]>('list')).find(
        (application) => application.id === result.id,
      );
      if (!installed) throw new Error('Installed application could not be found.');
      report(`Installed ${installed.manifest.name}.`);
      return installed;
    } catch (error) {
      report(`Installation refused: ${errorMessage(error)}`, true);
      return null;
    } finally {
      setInstalling(false);
    }
  }

  async function remove(id: string) {
    try {
      await runtime().request('remove', id);
      await refreshLibrary();
      report('Removed.');
    } catch (error) {
      report(errorMessage(error), true);
    }
  }

  async function refresh() {
    try {
      await refreshLibrary();
      report('Ready to install.');
    } catch (error) {
      report(errorMessage(error), true);
    }
  }

  async function refreshObservations() {
    try {
      const events = await runtime().request<RuntimeObservation[]>('events');
      setObservations(
        events.length
          ? events
              .slice(-40)
              .reverse()
              .map(
                (event) => `${event.kind.toUpperCase()}  ${event.method}  ${event.url}`,
              )
              .join('\n')
          : 'No runtime requests recorded.',
      );
    } catch (error) {
      report(errorMessage(error), true);
    }
  }

  return {
    apps,
    config,
    status,
    ready,
    installing,
    observations,
    install,
    remove,
    refresh,
    refreshObservations,
  };
}

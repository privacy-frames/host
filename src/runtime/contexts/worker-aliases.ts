import { internalRecord } from '../../shared/primordials.ts';
import { applicationURL } from '../../shared/runtime-url.ts';
import type { Installation } from '../../shared/types.ts';
import type { WorkerBootstrapMetadata } from './model.ts';
import { scriptResourceURLs } from '../script-resources.ts';

/** Preserve publisher execution bases separately from canonical root aliases. */
export function workerResourceAliases(
  app: Installation,
  resources: URL,
  runtime: URL,
): Pick<WorkerBootstrapMetadata, 'aliases' | 'rootAliases' | 'scripts'> {
  const root = applicationURL(app, runtime);
  return internalRecord({
    scripts: scriptResourceURLs(
      app.resources,
      (resource) => new URL(resource.path, resources).href,
    ),
    aliases: app.resources.map((resource) => [
      resource.url,
      new URL(resource.path, resources).href,
    ]),
    rootAliases: app.resources.map((resource) => [
      new URL(resource.path, root).href,
      new URL(resource.path, resources).href,
    ]),
  });
}

import { createControllerClient } from '../controller-client.ts';
import { createResourceFetch } from '../resource-fetch.ts';
import { INSTALLED_RESOURCE_REQUEST } from '../../shared/types.ts';
import { internalRecord } from '../../shared/primordials.ts';
import { sealRuntimeBindings } from '../bindings.ts';
import { createPopupFactory } from './popup-factory.ts';
import { prepareRuntimeIntrinsics } from '../intrinsics.ts';
import { scopeContextStorage } from './storage.ts';
import { createWorkerFactory } from './worker-factory.ts';
import { createSharedWorkerFactory } from './shared-worker-factory.ts';
import { createWorkletFactory } from './worklet-factory.ts';
import type { SharedWorkerIdentity } from '../../shared/shared-worker.ts';
import { installScriptPolicy } from '../enforcement/scripts.ts';
import { createPublisherContainer } from '../publisher/client.ts';
import { resourceAliases } from '../resource-aliases.ts';
import { createPolicyTools } from '../enforcement/native.ts';
import { prepareNavigationPolicy } from '../enforcement/navigation.ts';
import { installDOMPolicy, installResourceAttributePolicy } from '../enforcement/dom.ts';
import { installEffectPolicy } from '../enforcement/effects.ts';
import { scopeWebStorage } from '../enforcement/web-storage.ts';
import { createDocumentFactory } from './document-factory.ts';
import { createTrustedPolicy } from '../trusted/client.ts';

export interface WindowContentMetadata {
  installationGeneration: string;
  aliases: [string, string][];
  source: string;
  documentBase?: string;
}

interface WindowRealmOptions {
  application: string;
  applicationURL: string;
  documentURL?: string;
  enableDocumentContexts?: boolean;
  scriptNonce: string;
}

/** Establish window policies before its adapter renders any publisher content. */
export function prepareWindowRealm({
  application,
  applicationURL,
  documentURL,
  enableDocumentContexts = false,
  scriptNonce,
}: WindowRealmOptions) {
  let sourceURL = applicationURL;
  const finishNavigationPolicy = prepareNavigationPolicy(
    internalRecord({
      documentURL: documentURL || applicationURL,
      ...(!documentURL
        ? internalRecord({ applicationURL, sourceURL: () => sourceURL })
        : internalRecord({})),
    }),
  );
  const rawGetAttribute = Element.prototype.getAttribute;
  const NativeURL = URL;
  prepareRuntimeIntrinsics();
  const tools = createPolicyTools();
  const { method, accessor, descriptor, apply, fail, define } = tools;
  let applicationWorker: unknown = null;
  let resourceBase = applicationURL;
  let sharedIdentity: SharedWorkerIdentity | undefined;
  const policy = createTrustedPolicy(applicationURL);
  const controller = createControllerClient();
  const fetchResource = createResourceFetch(
    (url, headers) =>
      controller.request(
        internalRecord({ type: INSTALLED_RESOURCE_REQUEST, url, headers }),
      ),
    tools,
  );
  const resources = resourceAliases(
    internalRecord({
      method,
      accessor,
      descriptor,
      apply,
      baseURL: () => resourceBase,
      documentSourceURL: () => sourceURL,
      fetchResource,
    }),
  );
  const publisher = createPublisherContainer(
    internalRecord({
      applicationURL,
      baseURL: () => resourceBase,
      installationSourceURL: () => sourceURL,
      resources,
    }),
  );
  applicationWorker = publisher.container;
  const createWorker = createWorkerFactory(
    tools,
    internalRecord({
      applicationURL,
      baseURL: () => resourceBase,
      resources,
    }),
  );
  const createSharedWorker = createSharedWorkerFactory(
    tools,
    internalRecord({
      applicationURL,
      baseURL: () => resourceBase,
      resources,
      identity: () => sharedIdentity,
    }),
  );
  const workletAddModule = createWorkletFactory(
    tools,
    internalRecord({ applicationURL, resources }),
  );
  const scripts = installScriptPolicy(
    tools,
    internalRecord({
      nonce: scriptNonce,
      mapURL: resources.mapURL,
      isInstalledURL: resources.isInstalledURL,
      baseURL: () => resourceBase,
      unavailableURL: new URL('__contexts/unavailable-script', applicationURL).href,
    }),
  );
  const documents = enableDocumentContexts
    ? createDocumentFactory(
        tools,
        internalRecord({ applicationURL, baseURL: () => resourceBase, policy }),
      )
    : undefined;
  const openPopup = enableDocumentContexts
    ? createPopupFactory(
        tools,
        internalRecord({
          applicationURL,
          baseURL: () => resourceBase,
          resources,
        }),
      )
    : undefined;
  finishNavigationPolicy(tools, openPopup);
  installDOMPolicy(tools, rawGetAttribute, policy, scripts, documents, resources.mapURL);
  installEffectPolicy(
    tools,
    () => applicationWorker,
    internalRecord({
      Worker: createWorker,
      SharedWorker: createSharedWorker,
      WorkletAddModule: workletAddModule,
    }),
  );
  scopeContextStorage(application, tools);
  scopeWebStorage(`pf:${application}:`, tools);
  installResourceAttributePolicy(
    tools,
    resources.mapURL,
    scripts,
    documents,
    resources.mapNavigationURL,
  );

  sealRuntimeBindings();

  function admitContent(data: WindowContentMetadata) {
    if (typeof data.installationGeneration !== 'string' || !data.installationGeneration)
      fail('Application generation is missing');
    sharedIdentity = Object.freeze(
      internalRecord({
        application,
        installationGeneration: data.installationGeneration,
      }),
    );
    resourceBase = data.documentBase || data.source;
    resources.install(data.aliases, data.source);
    sourceURL = data.source;
    void publisher.initialize().catch(() => {});
    define(
      window,
      'privacyHost',
      internalRecord({
        value: Object.freeze(
          internalRecord({
            version: 1,
            application,
            publisher: new NativeURL(data.source).origin,
            mode: 'network-isolated',
          }),
        ),
        writable: false,
        configurable: false,
      }),
    );
  }

  return internalRecord({ tools, resources, scripts, documents, admitContent, policy });
}

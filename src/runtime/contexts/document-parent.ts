import { internalRecord, ownDescriptor } from '../../shared/primordials.ts';
import { DOCUMENT_CONTROL_REQUEST } from '../../shared/types.ts';
import type { DocumentControl } from './document-client.ts';
import type { DocumentRegistration } from './document-protocol.ts';
import { acceptChildChannel } from './parent-channel.ts';

const apply = Reflect.apply;
const closePort = MessagePort.prototype.close;
const NativeError = Error;

/** The factory selects the child grant; child packets cannot select another actor. */
export function serveDocumentParent(options: {
  child(): Window | null;
  origin: string;
  registration: DocumentRegistration;
  isCurrent(): boolean;
  documentControl: DocumentControl;
}): { close(): void } {
  const { registration, documentControl } = options;
  return acceptChildChannel(
    internalRecord({
      child: options.child,
      origin: options.origin,
      key: registration.id,
      isCurrent: options.isCurrent,
      async handle(message: unknown, ports: readonly MessagePort[]) {
        for (let index = 0; index < ports.length; index++)
          apply(closePort, ports[index], []);
        const field = (key: string) =>
          message && typeof message === 'object'
            ? ownDescriptor(message, key)?.value
            : undefined;
        const operation = field('operation');
        if (
          ports.length ||
          field('type') !== DOCUMENT_CONTROL_REQUEST ||
          (operation !== 'configuration' && operation !== 'content')
        )
          throw new NativeError('Child document operation refused');
        return documentControl(
          operation === 'configuration' ? 'child-configuration' : 'child-content',
          internalRecord({
            id: registration.id,
            parentToken: registration.parentToken,
          }),
        );
      },
    }),
  );
}

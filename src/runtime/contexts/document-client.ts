import { internalRecord } from '../../shared/primordials.ts';
import { DOCUMENT_CONTROL_REQUEST } from '../../shared/types.ts';

export type DocumentControlOperation =
  | 'create'
  | 'configuration'
  | 'content'
  | 'child-configuration'
  | 'child-content'
  | 'close';
export type DocumentControl = (
  operation: DocumentControlOperation,
  payload: object,
) => Promise<unknown>;

const stringify = JSON.stringify;

/** The request closure holds native controller authority; callers only select an operation. */
export function createDocumentControl(
  request: (packet: object) => Promise<unknown>,
): DocumentControl {
  return (operation, payload) =>
    request(
      internalRecord({
        type: DOCUMENT_CONTROL_REQUEST,
        operation,
        payload: stringify(payload),
      }),
    );
}

/** Owned by one trusted context factory; its token never enters guest state. */
export interface ContextPublicationState {
  token: object;
  closed: boolean;
}

/** Begin a preparation with an identity distinct from every retained old token. */
export function beginContextPublication(state: ContextPublicationState): object {
  const token = {};
  state.token = token;
  state.closed = false;
  return token;
}

/** Invalidate pending continuations before running cleanup or cancellation callbacks. */
export function closeContextPublication(state: ContextPublicationState): object {
  const token = {};
  state.token = token;
  state.closed = true;
  return token;
}

export function isCurrentContextPublication(
  state: ContextPublicationState,
  token: object,
): boolean {
  return !state.closed && state.token === token;
}

/** Private allocator state: an owned writable field containing an integer in
 * [1, 2^53]. The final state is exhausted and never advances again. */
export interface IdentityState {
  next: number;
}

/** Allocate an exact positive Number identity, or return undefined on exhaustion.
 * The caller owns the record; reading or writing next cannot invoke guest code.
 * The function has no free runtime dependencies so the same body runs in QuickJS. */
export function allocateIdentity(state: IdentityState): number | undefined {
  const identity = state.next;
  if (identity > 9007199254740991) return;
  state.next = identity + 1;
  return identity;
}

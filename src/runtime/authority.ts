/** Constructed by trusted native callers from browser observations, never message data. */
export interface ManagerSenderClaims {
  closed: boolean;
  bound: boolean;
  trusted: boolean;
  embedded: boolean;
  parentSource: boolean;
  allowedOrigin: boolean;
}

export interface BrowserClientIdentity {
  id: string;
  type: string;
  url: string;
}

export function acceptsManagerSender(claims: ManagerSenderClaims): boolean {
  return (
    !claims.closed &&
    !claims.bound &&
    claims.trusted &&
    claims.embedded &&
    claims.parentSource &&
    claims.allowedOrigin
  );
}

/** The identity must come from Clients.get for the captured native event source. */
export function clientCanManage(
  client: BrowserClientIdentity,
  sourceID: string,
  controlURL: string,
): boolean {
  return client.id === sourceID && client.type === 'window' && client.url === controlURL;
}

/** A queued callback cannot reuse an endpoint after closure or replacement. */
export function managementPortIsCurrent(
  closed: boolean,
  current: object | null,
  candidate: object,
): boolean {
  return !closed && current === candidate;
}

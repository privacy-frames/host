const stringValue = String;

/** Host processors expose bootstrap control, not application processor behavior.
 * Convert once so validation and native construction consume the same name. */
export function guestProcessorName(value: unknown): string {
  if (typeof value === 'symbol') throw new TypeError('A Symbol is not a DOMString');
  const name = stringValue(value);
  if (name.startsWith('privacy-frames:'))
    throw new DOMException('Processor name is reserved for the host', 'SecurityError');
  return name;
}

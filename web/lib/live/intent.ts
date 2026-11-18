/**
 * One key per thing the farmer means to do: a sale typed in a form, a "Pornești pensia?" dialog,
 * an assistant card. It is made when the intent starts and sent again on every retry, so the
 * server can tell a second tap from a second sale (docs/idempotency-plan.md, M1).
 *
 * crypto.randomUUID exists only on https and localhost. A phone testing over the local network
 * (http://192.168…) gets the same kind of id from getRandomValues.
 */
export function newIntentKey(cryptoApi: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = globalThis.crypto): string {
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const b = cryptoApi.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

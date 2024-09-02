export function uint8ArrayToString(array: Uint8Array): string {
  return new TextDecoder().decode(array);
}

export function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

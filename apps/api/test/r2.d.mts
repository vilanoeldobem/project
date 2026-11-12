export function createR2(): R2Bucket & {
  objects: Map<string, { bytes: Uint8Array; httpMetadata: { contentType?: string } }>;
  keys(): string[];
  bytes(key: string): Uint8Array | undefined;
  failNext(op: "put" | "get" | "delete"): void;
};

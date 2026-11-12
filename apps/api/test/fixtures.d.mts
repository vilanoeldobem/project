export function pngChunk(type: string, text?: string): Uint8Array;
export function png(width?: number, height?: number, extra?: Uint8Array[]): Uint8Array;
export function jpeg(width?: number, height?: number, secret?: string): Uint8Array;
export function pdf(text?: string): Uint8Array;
export function text(bytes: Uint8Array): string;

export function createD1(options?: { before?: string }): D1Database & {
  sql: (q: string, ...p: unknown[]) => Array<Record<string, unknown>>;
  migrate: (filename: string) => void;
};

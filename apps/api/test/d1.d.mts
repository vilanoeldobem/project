export function createD1(): D1Database & { sql: (q: string, ...p: unknown[]) => Array<Record<string, unknown>> };

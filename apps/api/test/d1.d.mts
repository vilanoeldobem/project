export function createD1(options?: { upTo?: number; additionalMigrations?: number[] }): D1Database & { sql: (q: string, ...p: unknown[]) => Array<Record<string, unknown>> };

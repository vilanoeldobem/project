export function wranglerConfig(): {
  vars: Record<string, string>;
  services?: Array<{ binding: string; service: string }>;
  env?: Record<string, unknown>;
};
export function devVar(name: string): string | undefined;

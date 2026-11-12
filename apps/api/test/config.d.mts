export function productionVar(name: string): string | undefined;
export function devVar(name: string): string | undefined;
export function deployScript(): string;
export function configuredVars(name: string): string[];
export function environments(): string[];

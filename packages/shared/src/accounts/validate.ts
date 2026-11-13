/**
 * Validation for accounts (P13) and NGO applications (P12), shared by the client forms and the API
 * (IMPL-0011). CONFIRMADO: the four registration fields (DEC-038) and the three DEC-015 criteria.
 * Everything else here (lengths, nickname charset, field list of the application, tags, the 1-year
 * measurement) is PROPOSTA until the docs repository decides it (PEN-013, PEN-019, G08).
 * Error messages are user-facing pt-BR copy.
 */

import { validateExternalDonationUrl, type NgoPaymentMethod } from "../donations/contract";

export interface Registration {
  name: string;
  nickname: string;
  city: string;
  email: string;
}

export type Errors<T> = Partial<Record<keyof T, string>>;

/** Trims, turns control characters (NUL, ESC, line breaks…) into spaces and collapses whitespace. */
const clean = (v: unknown, max: number) =>
  // eslint-disable-next-line no-control-regex
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, max + 1) : "";

export const NICKNAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{1,18}[A-Za-z0-9_]$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/;

export function normaliseEmail(v: unknown): string {
  return clean(v, 254).toLowerCase();
}

export function validateRegistration(input: Partial<Record<keyof Registration, unknown>>): { value: Registration; errors: Errors<Registration> } {
  const value: Registration = {
    name: clean(input.name, 80),
    nickname: clean(input.nickname, 20),
    city: clean(input.city, 60),
    email: normaliseEmail(input.email),
  };
  const errors: Errors<Registration> = {};
  if (value.name.length < 2 || value.name.length > 80) errors.name = "Digite seu nome (2 a 80 caracteres).";
  if (!NICKNAME_RE.test(value.nickname))
    errors.nickname = "Use de 3 a 20 letras, números, ponto, hífen ou sublinhado (sem espaços).";
  if (value.city.length < 2 || value.city.length > 60) errors.city = "Digite sua cidade (2 a 60 caracteres).";
  if (!EMAIL_RE.test(value.email) || value.email.length > 254) errors.email = "Digite um e-mail válido.";
  return { value, errors };
}

/* --------------------------------------------------------------- NGO (P12) */

/** Action tags (DEC-028 "tags de atuação"; list is PROPOSTA). Labels are pt-BR. */
export const NGO_TAGS = {
  children: "Crianças",
  elderly: "Pessoas idosas",
  animals: "Animais",
  education: "Educação",
  health: "Saúde",
  food: "Alimentação",
  housing: "Moradia",
  environment: "Meio ambiente",
  culture: "Cultura",
  sport: "Esporte",
  disability: "Pessoas com deficiência",
  women: "Mulheres",
} as const;
export type NgoTag = keyof typeof NGO_TAGS;

export interface NgoProject {
  title: string;
  description: string;
}

export interface NgoApplication {
  // 1. Dados da organização
  name: string;
  cnpj: string; // digits only
  openedOn: string; // YYYY-MM-DD
  city: string;
  // 2. Documentos e comprovações (declarations; document upload is not part of this version)
  declarations: { activeCnpj: boolean; oneYear: boolean; fundsConfirmable: boolean };
  fundsConfirmation: string;
  // 3. Apresentação e projetos
  summary: string;
  description: string;
  tags: NgoTag[];
  projects: NgoProject[];
  /**
   * How the organisation wants to receive donations (IMPL-0022, PROPOSTA). Absent means "abacatepay": older
   * applications and clients keep working. `donationUrl` is required (and validated) only for "external_link".
   */
  paymentMethod?: NgoPaymentMethod;
  donationUrl?: string;
  // 4. Revisão e envio
  lotId: string;
}

/** CNPJ check digits (Receita Federal algorithm). Rejects all-equal sequences. */
export function isValidCnpj(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

/** DEC-015 criterion 2 (≥ 1 year of existence), measured from the CNPJ opening date (PEN-013: PROPOSTA). */
export function isAtLeastOneYearOld(openedOn: string, today: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(openedOn)) return false;
  const opened = new Date(`${openedOn}T00:00:00Z`);
  // Impossible dates (2021-02-29, 2020-04-31) would silently roll over to the next month.
  if (Number.isNaN(opened.getTime()) || opened.toISOString().slice(0, 10) !== openedOn) return false;
  const limit = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate()));
  return opened <= limit;
}

export function validateApplication(
  input: Partial<NgoApplication> | Record<string, unknown>,
  today: Date
): { value: NgoApplication; errors: Partial<Record<keyof NgoApplication, string>> } {
  const raw = input as Record<string, unknown>;
  const decl = (raw.declarations ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is NgoTag => typeof t === "string" && Object.hasOwn(NGO_TAGS, t)) : [];
  const projects = (Array.isArray(raw.projects) ? raw.projects : [])
    .slice(0, 3)
    .map((p) => ({ title: clean((p as NgoProject)?.title, 80), description: clean((p as NgoProject)?.description, 400) }))
    .filter((p) => p.title || p.description);
  const value: NgoApplication = {
    name: clean(raw.name, 120),
    cnpj: clean(raw.cnpj, 20).replace(/\D/g, ""),
    openedOn: clean(raw.openedOn, 10),
    city: clean(raw.city, 60),
    declarations: { activeCnpj: decl.activeCnpj === true, oneYear: decl.oneYear === true, fundsConfirmable: decl.fundsConfirmable === true },
    fundsConfirmation: clean(raw.fundsConfirmation, 1000),
    summary: clean(raw.summary, 280),
    description: clean(raw.description, 2000),
    tags: [...new Set(tags)].slice(0, 4),
    projects,
    paymentMethod: raw.paymentMethod === "external_link" ? "external_link" : "abacatepay",
    donationUrl: "",
    lotId: clean(raw.lotId, 40),
  };
  // The link is only kept for the mode that uses it; "abacatepay" clears it, so no stale URL is stored.
  const link = validateExternalDonationUrl(raw.donationUrl);
  if (value.paymentMethod === "external_link" && link.url) value.donationUrl = link.url;
  const errors: Partial<Record<keyof NgoApplication, string>> = {};
  if (value.name.length < 3 || value.name.length > 120) errors.name = "Digite o nome da organização (3 a 120 caracteres).";
  if (!isValidCnpj(value.cnpj)) errors.cnpj = "CNPJ inválido. Confira os 14 números.";
  if (!isAtLeastOneYearOld(value.openedOn, today)) errors.openedOn = "A organização precisa ter pelo menos 1 ano de abertura (data do CNPJ).";
  if (value.city.length < 2 || value.city.length > 60) errors.city = "Digite a cidade da sede.";
  if (!value.declarations.activeCnpj || !value.declarations.oneYear || !value.declarations.fundsConfirmable)
    errors.declarations = "Confirme os três requisitos. A equipe da Vila vai verificar cada um.";
  if (value.fundsConfirmation.length < 20 || value.fundsConfirmation.length > 1000)
    errors.fundsConfirmation = "Explique como os recursos recebidos podem ser confirmados (20 a 1000 caracteres).";
  if (value.summary.length < 20 || value.summary.length > 280) errors.summary = "Escreva um resumo de 20 a 280 caracteres.";
  if (value.description.length < 50 || value.description.length > 2000) errors.description = "Descreva a organização (50 a 2000 caracteres).";
  if (value.tags.length === 0) errors.tags = "Escolha de 1 a 4 áreas de atuação.";
  if (value.paymentMethod === "external_link" && !validateExternalDonationUrl(value.donationUrl).url) {
    errors.donationUrl = "Informe um link HTTPS público válido da organização (ex.: https://ong.org.br/doar).";
  }
  if (value.projects.some((p) => p.title.length < 3 || p.title.length > 80 || p.description.length > 400))
    errors.projects = "Cada projeto precisa de um título (3 a 80 caracteres) e descrição de até 400.";
  if (!/^plaza-\d{2}$/.test(value.lotId)) errors.lotId = "Escolha um terreno disponível.";
  return { value, errors };
}

/** Which form step (1–4) each field belongs to: lets the client jump to the first step with an error. */
export const APPLICATION_STEP: Record<keyof NgoApplication, 1 | 2 | 3 | 4> = {
  name: 1,
  cnpj: 1,
  openedOn: 1,
  city: 1,
  declarations: 2,
  fundsConfirmation: 2,
  summary: 3,
  description: 3,
  tags: 3,
  projects: 3,
  paymentMethod: 2,
  donationUrl: 2,
  lotId: 4,
};

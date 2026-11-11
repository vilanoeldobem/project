import { describe, expect, it } from "vitest";

import { isAtLeastOneYearOld, isValidCnpj, validateApplication, validateRegistration } from "./validate";

const TODAY = new Date("2026-11-11T12:00:00Z");
const VALID_APP = {
  name: "Associação Exemplo",
  cnpj: "11.222.333/0001-81",
  openedOn: "2020-03-10",
  city: "São Paulo",
  declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  fundsConfirmation: "Extratos mensais da conta da organização e relatório conciliável.",
  summary: "Apoio escolar para crianças do bairro.",
  description: "Atendemos crianças de 6 a 12 anos com reforço escolar, leitura e atividades culturais no contraturno.",
  tags: ["children", "education", "nope"],
  projects: [{ title: "Leitura em roda", description: "Encontros semanais." }],
  lotId: "plaza-03",
};

describe("registration (DEC-038: exactly four fields)", () => {
  it("accepts a valid registration and normalises it", () => {
    const { value, errors } = validateRegistration({ name: "  Ana   Lima ", nickname: "ana_lima", city: "Recife", email: " Ana@Example.COM " });
    expect(errors).toEqual({});
    expect(value).toEqual({ name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
  });

  it("rejects bad fields with pt-BR messages", () => {
    const { errors } = validateRegistration({ name: "A", nickname: "a b", city: "", email: "nope" });
    expect(Object.keys(errors).sort()).toEqual(["city", "email", "name", "nickname"]);
    expect(errors.nickname).toMatch(/letras/);
  });

  it("limits nickname charset and length", () => {
    for (const ok of ["abc", "noel.2026", "a-b_c", "X".repeat(20)]) expect(validateRegistration({ nickname: ok }).errors.nickname).toBeUndefined();
    for (const bad of ["ab", "X".repeat(21), ".abc", "abc.", "ab c", "ação"]) expect(validateRegistration({ nickname: bad }).errors.nickname).toBeDefined();
  });
});

describe("NGO application (P12; DEC-015)", () => {
  it("validates CNPJ check digits", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000180")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
  });

  it("requires at least one year since the CNPJ opening date", () => {
    expect(isAtLeastOneYearOld("2025-11-11", TODAY)).toBe(true);
    expect(isAtLeastOneYearOld("2025-11-12", TODAY)).toBe(false);
    expect(isAtLeastOneYearOld("not-a-date", TODAY)).toBe(false);
  });

  it("accepts a complete application and drops unknown tags", () => {
    const { value, errors } = validateApplication(VALID_APP, TODAY);
    expect(errors).toEqual({});
    expect(value.cnpj).toBe("11222333000181");
    expect(value.tags).toEqual(["children", "education"]);
    expect(validateApplication({ ...VALID_APP, tags: ["constructor", "toString", "__proto__", "health"] }, TODAY).value.tags).toEqual(["health"]);
  });

  it("requires all three DEC-015 declarations", () => {
    const { errors } = validateApplication({ ...VALID_APP, declarations: { activeCnpj: true, oneYear: true } }, TODAY);
    expect(errors.declarations).toBeDefined();
  });
});

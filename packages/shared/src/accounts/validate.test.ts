import { describe, expect, it } from "vitest";

import { APPLICATION_STEP, isAtLeastOneYearOld, isValidCnpj, validateApplication, validateRegistration } from "./validate";

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

  it("turns control characters into spaces (no NUL, ESC or line breaks stored)", () => {
    const { value, errors } = validateRegistration({ name: "Ana\u0000Lima", nickname: "ana_lima", city: "Re\u001b[31mcife\n", email: "ana@example.com" });
    expect(errors).toEqual({});
    expect(value.name).toBe("Ana Lima");
    expect(value.city).toBe("Re [31mcife");
    expect(validateApplication({ ...VALID_APP, summary: "Apoio\u0007 escolar para crianças do bairro." }, TODAY).value.summary).toBe("Apoio escolar para crianças do bairro.");
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
    for (const impossible of ["2020-02-30", "2021-02-29", "2020-04-31", "2020-13-01"]) expect(isAtLeastOneYearOld(impossible, TODAY)).toBe(false);
    expect(isAtLeastOneYearOld("2020-02-29", TODAY)).toBe(true);
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

  it("keeps the requested donation mode, validating only the external link", () => {
    const base = { ...VALID_APP, summary: "Apoio escolar às crianças da comunidade." };
    // Omitted: AbacatePay, as every application sent before IMPL-0022.
    const omitted = validateApplication(base, TODAY);
    expect(omitted.errors).toEqual({});
    expect([omitted.value.paymentMethod, omitted.value.donationUrl]).toEqual(["abacatepay", ""]);
    // AbacatePay mode with a URL keeps the URL out (it is not used there).
    expect(validateApplication({ ...base, paymentMethod: "abacatepay", donationUrl: "https://ong.org.br/doar" }, TODAY).value.donationUrl).toBe("");
    // External link: required and strictly HTTPS/public.
    expect(validateApplication({ ...base, paymentMethod: "external_link" }, TODAY).errors.donationUrl).toMatch(/link HTTPS/);
    expect(validateApplication({ ...base, paymentMethod: "external_link", donationUrl: "http://ong.org.br/doar" }, TODAY).errors.donationUrl).toMatch(/link HTTPS/);
    const valid = validateApplication({ ...base, paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar" }, TODAY);
    expect(valid.errors).toEqual({});
    expect([valid.value.paymentMethod, valid.value.donationUrl]).toEqual(["external_link", "https://ong.org.br/doar"]);
    // Both fields belong to step 2, so the wizard jumps there on an error.
    expect([APPLICATION_STEP.paymentMethod, APPLICATION_STEP.donationUrl]).toEqual([2, 2]);
  });

});
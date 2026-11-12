import { describe, expect, it } from "vitest";

import { APPLICATION_STATUSES, lotNumber, STATUS_LABEL } from "./contract";
import { ApiError, errorText } from "./errors";

describe("account API contract", () => {
  it("labels every application status", () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...APPLICATION_STATUSES].sort());
    for (const s of APPLICATION_STATUSES) expect(STATUS_LABEL[s].length).toBeGreaterThan(3);
  });

  it("reads the lot number people see from the lot id", () => {
    expect(lotNumber("plaza-03")).toBe(3);
    expect(lotNumber("plaza-08")).toBe(8);
  });
});

describe("error text (pt-BR)", () => {
  it("has a sentence for known codes", () => {
    expect(errorText(new ApiError(409, "stale_revision"))).toMatch(/nova versão/);
    expect(errorText(new ApiError(0, "network"))).toMatch(/Sem conexão/);
  });

  it("has a sentence for every file route error that carries no field message", () => {
    for (const code of ["files_disabled", "no_application", "application_locked", "application_changed"]) {
      const text = errorText(new ApiError(409, code));
      expect(text).not.toBe("Algo deu errado. Tente de novo.");
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it("points at the fields when the API sent field messages, and stays generic otherwise", () => {
    expect(errorText(new ApiError(400, "note_required", { note: "Explique o motivo." }))).toBe("Confira os campos destacados.");
    expect(errorText(new ApiError(500, "internal"))).toBe("Algo deu errado. Tente de novo.");
    expect(errorText(new TypeError("x"))).toBe("Algo deu errado.");
  });
});

import { describe, expect, it } from "vitest";

import { APPLICATION_STATUSES, lotNumber, ROLE_LABEL, ROLES, STATUS_LABEL } from "./contract";
import { ApiError, errorText } from "./errors";
import { BLOCK_MESSAGE_ERROR, cleanBlockMessage, MODERATION_TICKET, MODERATION_TICKET_TTL_MS, MODERATION_TICKETS_PER_MINUTE } from "./moderation";

describe("account API contract", () => {
  it("labels every application status", () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...APPLICATION_STATUSES].sort());
    for (const s of APPLICATION_STATUSES) expect(STATUS_LABEL[s].length).toBeGreaterThan(3);
  });

  it("labels the two roles as people read them, keeping the stored values (IMPL-0021)", () => {
    expect([...ROLES]).toEqual(["player", "admin"]);
    expect(ROLE_LABEL).toEqual({ player: "Padrão", admin: "Administrador" });
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

  it("has a sentence for every role and moderation refusal (IMPL-0021)", () => {
    const codes = ["admin_only", "self_role", "last_admin", "session_blocked", "account_blocked", "self_block", "admin_account", "bad_transition"];
    const texts = codes.map((code) => errorText(new ApiError(409, code)));
    for (const text of texts) {
      expect(text).not.toBe("Algo deu errado. Tente de novo.");
      expect(text.length).toBeGreaterThan(20);
    }
    expect(new Set(texts).size).toBe(codes.length);
    // The blocked person is told what they can still do; the administrator is told what to do first.
    expect(errorText(new ApiError(403, "session_blocked"))).toMatch(/ler o motivo.*excluir a conta/);
    expect(errorText(new ApiError(409, "admin_account"))).toMatch(/Padrão/);
  });

  it("points at the fields when the API sent field messages, and stays generic otherwise", () => {
    expect(errorText(new ApiError(400, "note_required", { note: "Explique o motivo." }))).toBe("Confira os campos destacados.");
    expect(errorText(new ApiError(500, "internal"))).toBe("Algo deu errado. Tente de novo.");
    expect(errorText(new TypeError("x"))).toBe("Algo deu errado.");
  });
});

describe("moderation rules (IMPL-0021, PROPOSTA)", () => {
  it("accepts a block message of 10 to 1000 characters after trimming, counted as code points", () => {
    expect(cleanBlockMessage("  Mensagem para a pessoa.  ")).toBe("Mensagem para a pessoa.");
    expect(cleanBlockMessage("🎄".repeat(10))).toBe("🎄".repeat(10));
    expect(cleanBlockMessage("x".repeat(1000))).toHaveLength(1000);
    for (const value of [undefined, null, 42, "", "curta", " ".repeat(30), "x".repeat(1001), "🎄".repeat(1001), `${"x".repeat(12)}\0`]) expect(cleanBlockMessage(value)).toBeNull();
    expect(BLOCK_MESSAGE_ERROR).toMatch(/10 a 1000 caracteres/);
  });

  it("does not count text nobody can see: format and control characters leave the message before it is trimmed and counted", () => {
    const invisible = [
      "​".repeat(10), "‮".repeat(12), "⁠﻿­‍‌؜⁦⁩‎‏", "\u0007".repeat(10), "\u009f".repeat(10),
      "\u{e0061}".repeat(10), "\r".repeat(10), "\n\t".repeat(10), `​curta${"​".repeat(20)}`, `‮${"​".repeat(9)}`,
    ];
    for (const value of invisible) expect([JSON.stringify(value), cleanBlockMessage(value)]).toEqual([JSON.stringify(value), null]);
    // What is kept is what the person reads: no override that reverses the text, nothing hidden inside or around it.
    expect(cleanBlockMessage("‮abcdefghij")).toBe("abcdefghij");
    expect(cleanBlockMessage("​ Mensagem​ para­ a pessoa.⁩ ﻿")).toBe("Mensagem para a pessoa.");
    expect(cleanBlockMessage(`${"x".repeat(1000)}${"​".repeat(50)}`)).toBe("x".repeat(1000));
    expect(cleanBlockMessage(`${"x".repeat(1001)}${"​".repeat(50)}`)).toBeNull();
    // Ordinary line breaks and tabs inside the message stay; a carriage return is a control character like any other.
    expect(cleanBlockMessage("Primeira linha.\r\n\tSegunda linha.")).toBe("Primeira linha.\n\tSegunda linha.");
    expect(cleanBlockMessage("\n\tMensagem para a pessoa.\t\n")).toBe("Mensagem para a pessoa.");
  });

  it("states the ticket lifetime and budget the API and the realtime server both rely on", () => {
    // The room refuses removals while it could still be handed a ticket issued before it was in memory.
    expect(MODERATION_TICKET_TTL_MS).toBe(30_000);
    expect(MODERATION_TICKETS_PER_MINUTE).toBe(10);
  });

  it("describes a moderation ticket as 32 URL-safe characters", () => {
    expect(MODERATION_TICKET.test("Ab0_-".repeat(6) + "Zz")).toBe(true);
    for (const value of ["", "a".repeat(31), "a".repeat(33), `${"a".repeat(31)}+`, `${"a".repeat(31)}=`, ` ${"a".repeat(31)}`]) expect(MODERATION_TICKET.test(value)).toBe(false);
  });
});

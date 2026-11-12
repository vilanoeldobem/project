/**
 * App shell: product name, section menu, who is signed in, and the current section. Flat HTML, keyboard
 * reachable; changing section moves focus to the new heading so screen readers announce it.
 */
import { useEffect, useRef, type ReactNode } from "react";

import type { Me } from "@vila/shared/accounts/contract";

import { hrefOf, type Route, SECTIONS } from "../lib/router";
import { SERVICES } from "../lib/services";

export function Shell({ route, user, onSignOut, children }: { route: Route; user: Me | null; onSignOut: () => void; children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  const label = SECTIONS.find((s) => s.section === route.section)!.label;
  const where = route.section === "applications" ? (route.id ?? "") : "";
  useEffect(() => {
    document.title = `${label} — Painel administrativo — Vila Noel do Bem`;
    // Not on the first paint: focus stays where the browser put it until the person navigates.
    if (first.current) first.current = false;
    else (main.current?.querySelector<HTMLElement>("h1") ?? main.current)?.focus();
  }, [label, where]);
  return (
    <div className="shell">
      <button className="skip" onClick={() => main.current?.focus()}>
        Pular para o conteúdo
      </button>
      <header className="top">
        <p className="top__brand">
          <strong>Vila Noel do Bem</strong> <span>Painel administrativo</span>
        </p>
        <div className="top__user">
          {user ? (
            <>
              <span>@{user.nickname}</span>
              <button className="btn btn--small btn--onDark" onClick={onSignOut}>
                Sair
              </button>
            </>
          ) : (
            <span>Sem sessão</span>
          )}
        </div>
      </header>
      <nav className="menu" aria-label="Seções">
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.section}>
              <a href={hrefOf({ section: s.section } as Route)} aria-current={s.section === route.section ? "page" : undefined}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="main" tabIndex={-1} ref={main}>
        {children}
      </main>
      <footer className="foot">
        <a href={SERVICES.game} target="_blank" rel="noopener noreferrer">
          Abrir o jogo
        </a>
        <span>Acesso restrito. Não compartilhe capturas de tela com dados de candidaturas.</span>
      </footer>
    </div>
  );
}

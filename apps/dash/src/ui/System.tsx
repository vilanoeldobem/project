/**
 * System status: the API's own `GET /health` and the feature flags of `GET /config` (both public). The realtime
 * server is only linked to: it sends no CORS headers, and adding them just for this screen is not worth widening
 * its surface (IMPL-0015), so the dashboard cannot read its `/health`.
 */
import { Fragment } from "react";

import type { Config } from "../lib/api";
import { FLAG_LABEL, flagRows, flagText } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { api, SERVICES } from "../lib/services";
import { Live, PageHead, Status } from "./common";

/**
 * Every flag the API sent, one line each, the moderation ones included (`moderation.presence` and
 * `moderation.block`, IMPL-0021): the label when the dashboard knows the flag, its key always.
 */
export function Flags({ config }: { config: Config }) {
  const flags = flagRows(config);
  if (flags.length === 0) return <p className="muted">A API não informou nenhuma bandeira.</p>;
  return (
    <dl className="facts" data-state="flags">
      {flags.map(([key, value]) => (
        <Fragment key={key}>
          <dt>
            {FLAG_LABEL[key] ?? key} <code className="muted">{key}</code>
          </dt>
          <dd data-flag={key}>{flagText(value)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function System() {
  const health = useLoad(() => api.health(), "health");
  const config = useLoad(() => api.config(), "config");
  return (
    <>
      <PageHead title="Sistema" lead="Estado dos serviços e bandeiras de funcionalidade desta instalação." />
      <section className="card" aria-labelledby="system-api">
        <h2 id="system-api">API</h2>
        <p className="muted">
          <code>{SERVICES.api}</code>
        </p>
        <Live loading={health.loading} error={health.error} onRetry={health.reload}>
          {health.data && (
            <dl className="facts" data-state="api-health">
              <dt>Situação</dt>
              <dd>
                <Status code={health.data.ok ? "ok" : "down"}>{health.data.ok ? "No ar" : "Com problema"}</Status>
              </dd>
              <dt>Versão</dt>
              <dd>{health.data.version}</dd>
              <dt>Ambiente</dt>
              <dd>{health.data.environment}</dd>
              <dt>Banco de dados (D1)</dt>
              <dd>{health.data.db ? "Conectado" : "Indisponível"}</dd>
              <dt>E-mail (Resend)</dt>
              <dd>{health.data.mail ? "Chave configurada" : "Sem chave: o link de acesso não é enviado"}</dd>
            </dl>
          )}
        </Live>
      </section>
      <section className="card" aria-labelledby="system-flags">
        <h2 id="system-flags">Bandeiras</h2>
        <Live loading={config.loading} error={config.error} onRetry={config.reload}>
          {config.data && <Flags config={config.data} />}
        </Live>
      </section>
      <section className="card" aria-labelledby="system-realtime">
        <h2 id="system-realtime">Servidor de tempo real</h2>
        <p>
          O painel não consulta este serviço: ele não envia CORS para outras origens, e o painel só se conecta à API. Para conferir, abra o
          endereço de estado em outra aba.
        </p>
        <p>
          <a className="btn btn--small" href={`${SERVICES.realtime}/health`} target="_blank" rel="noopener noreferrer">
            Abrir {new URL(SERVICES.realtime).host}/health
          </a>
        </p>
      </section>
    </>
  );
}

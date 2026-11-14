import { Component, type ReactNode } from "react";

/**
 * What the visitor sees when the 3D village cannot be shown (audit 7.1): the world's code did not download, the
 * browser has no WebGL, or the graphics context was lost and did not come back. The HUD lives outside this
 * boundary, so its paths (exploring the NGOs, the menu, the indicators) keep working as flat HTML.
 */
export function WorldUnavailable() {
  return (
    <div className="loading world-unavailable" role="alert">
      <p>A Vila em 3D não abriu neste aparelho.</p>
      <p className="world-unavailable__note">
        Pode ser a conexão ou o navegador sem suporte a gráficos 3D. Os botões do topo continuam funcionando.
      </p>
      <button type="button" className="world-unavailable__retry" onClick={() => location.reload()}>
        Tentar de novo
      </button>
    </div>
  );
}

/** Shown while the browser gives the graphics back, before the failure screen. */
export function WorldPaused() {
  return (
    <div className="world-paused" role="status">
      Os gráficos da Vila pararam por um instante. Voltando…
    </div>
  );
}

/** Catches anything the lazy world throws (a failed chunk, a failed WebGL context) and shows `WorldUnavailable`. */
export class WorldBoundary extends Component<{ children: ReactNode; failed?: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // The kind of failure only: never a message that could carry a URL or anything about the visitor.
    console.warn("world_unavailable", error instanceof Error ? error.name : typeof error);
  }

  render() {
    return this.state.failed || this.props.failed ? <WorldUnavailable /> : this.props.children;
  }
}

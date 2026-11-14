/**
 * Lost graphics context (audit 7.1): the browser can take the GPU away from a page (driver reset, memory pressure,
 * a device waking from sleep). three.js asks for it back; if it does not come back in `timeoutMs`, the village is
 * declared unavailable so the visitor gets a way out instead of a frozen picture.
 */
export type ContextState = "ok" | "lost" | "failed";

export function watchContext(canvas: EventTarget, onChange: (state: ContextState) => void, timeoutMs = 8000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const lost = () => {
    clear();
    onChange("lost");
    timer = setTimeout(() => {
      timer = null;
      onChange("failed");
    }, timeoutMs);
  };
  const restored = () => {
    // Too late: the failure screen is already up and offers a reload.
    if (!timer) return;
    clear();
    onChange("ok");
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  return () => {
    clear();
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
  };
}

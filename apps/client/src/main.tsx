import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { debugAllowed } from "./environment/runtime";
import { installDevtools } from "./game/devtools";
import "./styles.css";

installDevtools();

// Dev-only model gallery (IMPL-0010): separate lazy chunk, never reachable on a public hostname.
const Gallery = lazy(() => import("./gallery/Gallery").then((m) => ({ default: m.Gallery })));
const gallery = debugAllowed() && new URLSearchParams(location.search).has("gallery");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {gallery ? (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);

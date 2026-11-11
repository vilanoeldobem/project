/**
 * Dev-only model gallery (`?gallery`, localhost/dev builds; IMPL-0010): every generator of a category at
 * eight seeds, turning slowly, with voxel/face counts against the budget and live render stats.
 * Lazy-loaded, so production players never download it.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";

import { RenderStats } from "../scene/RenderStats";
import { perf } from "../scene/perf";
import { BUDGETS, measure } from "../scene/gen/budget";
import { byCategory } from "../scene/gen/catalog";
import type { Category, Generator } from "../scene/gen/types";
import { Voxels } from "../scene/Voxels";

const CATEGORIES: Category[] = ["props", "houses", "characters", "animals", "cosmetics"];
const SEEDS = Array.from({ length: 8 }, (_, i) => `gallery-${i}`);
const SPACING = 3.6;

function Turntable({ children, x, z }: { children: React.ReactNode; x: number; z: number }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => void (ref.current && (ref.current.rotation.y += dt * 0.4)));
  return (
    <group ref={ref} position={[x, 0, z]}>
      {children}
    </group>
  );
}

function Row({ g, row }: { g: Generator; row: number }) {
  const models = useMemo(() => SEEDS.map((s) => g.generate(s)), [g]);
  return (
    <>
      {models.map((m, i) => (
        <Turntable key={i} x={(i - (SEEDS.length - 1) / 2) * SPACING} z={row * SPACING}>
          <group scale={1.25}>
            <Voxels voxels={m.voxels} size={m.size} emissive={m.emissive} glow={m.glow} sway={m.sway} />
          </group>
        </Turntable>
      ))}
    </>
  );
}

export function Gallery() {
  const initial = (new URLSearchParams(location.search).get("cat") as Category) ?? "props";
  const [cat, setCat] = useState<Category>(CATEGORIES.includes(initial) ? initial : "props");
  const gens = byCategory(cat);
  const rows = useMemo(
    () =>
      gens.map((g) => {
        const counts = SEEDS.map((s) => measure(g.generate(s).voxels));
        return { g, voxels: Math.max(...counts.map((c) => c.voxels)), faces: Math.max(...counts.map((c) => c.faces)) };
      }),
    [gens]
  );
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000); // refresh the perf line
    return () => clearInterval(id);
  }, []);
  const depth = Math.max(1, gens.length) * SPACING;
  const budget = BUDGETS[cat];
  return (
    <div className="gallery">
      <Canvas
        shadows
        camera={{ position: [3, depth * 0.75 + 5, depth + 12], fov: 40 }}
        onCreated={({ camera }) => camera.lookAt(3, 0, depth / 2 - SPACING / 2)}
      >
        <RenderStats maxDpr={1.5} />
        <color attach="background" args={["#DCE7F0"]} />
        <hemisphereLight args={["#F3F5F7", "#7184A1", 1.6]} />
        <directionalLight position={[8, 14, 10]} intensity={2.2} castShadow />
        {gens.map((g, i) => (
          <Row key={g.id} g={g} row={i} />
        ))}
      </Canvas>
      <aside className="gallery__panel">
        <nav>
          {CATEGORIES.map((c) => (
            <button key={c} className={`btn btn--chip${c === cat ? " is-on" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </nav>
        <table className="gallery__stats">
          <thead>
            <tr>
              <th>gerador</th>
              <th>voxels máx. / {budget.voxels}</th>
              <th>faces máx. / {budget.faces}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.g.id}>
                <td>{r.g.name}</td>
                <td>{r.voxels}</td>
                <td>{r.faces}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3}>Ainda sem geradores nesta categoria.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="gallery__perf">{`calls ${perf.calls} · tris ${perf.triangles} · frame p50 ${perf.p50.toFixed(1)} p95 ${perf.p95.toFixed(1)} ms`}</p>
      </aside>
    </div>
  );
}

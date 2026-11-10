import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";

import { GIFTS, LAMPS, LOTS, PALETTE as P } from "../game/world";
import { useVila } from "../game/store";
import type { LotInfo } from "../lib/api";
import { Voxels } from "./Voxels";
import { Smoke } from "./environment/Particles";
import { bench, BULBS, gift, house, HOUSE_CHIMNEY, lamp, lotMarker, tree } from "./models";

const GLOW = [P.gold];
const WINDOWS = [P.window];

export function ChristmasTree() {
  const v = useMemo(tree, []);
  const open = useVila((s) => s.open);
  return (
    <group onClick={(e) => (e.stopPropagation(), open({ kind: "donation" }))}>
      <Voxels voxels={v} emissive={BULBS} />
      <Label y={14.5} text="Doação global" />
    </group>
  );
}

export function Lamps() {
  const v = useMemo(lamp, []);
  const b = useMemo(bench, []);
  return (
    <>
      {LAMPS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Voxels voxels={v} size={0.5} emissive={GLOW} />
          {i % 2 === 1 && (
            <group position={[x * -0.08, 0, z * -0.08]} rotation-y={Math.atan2(x, z)}>
              <Voxels voxels={b} size={0.5} />
            </group>
          )}
        </group>
      ))}
    </>
  );
}

export function Lots({ info }: { info: Record<string, LotInfo> }) {
  const marker = useMemo(lotMarker, []);
  const home = useMemo(house, []);
  const open = useVila((s) => s.open);
  const chimneys = useMemo(
    () =>
      LOTS.filter((lot) => info[lot.id]?.state === "published" && info[lot.id]?.ngo_name).map((lot): [number, number, number] => {
        // Chimney local (x, z) rotated by the lot facing, then moved to the lot.
        const [cx, cy, cz] = HOUSE_CHIMNEY;
        const c = Math.cos(lot.facing), s = Math.sin(lot.facing);
        return [lot.x + cx * c + cz * s, cy, lot.z - cx * s + cz * c];
      }),
    [info]
  );
  return (
    <>
      <Smoke origins={chimneys} />
      {LOTS.map((lot) => {
        const published = info[lot.id]?.state === "published" && info[lot.id]?.ngo_name;
        return (
          <group key={lot.id} position={[lot.x, 0, lot.z]} rotation-y={lot.facing}>
            <group onClick={(e) => (e.stopPropagation(), open({ kind: "lot", lotId: lot.id }))}>
              <Voxels voxels={published ? home : marker} glow={WINDOWS} />
              <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} receiveShadow>
                <planeGeometry args={[7, 7]} />
                <meshStandardMaterial color={published ? P.snowShade : P.snowDeep} />
              </mesh>
            </group>
            <Label y={published ? 7.5 : 5} text={published ? String(info[lot.id]?.ngo_name) : "Terreno disponível"} />
          </group>
        );
      })}
    </>
  );
}

const GIFT_COLORS = [P.red, P.pine, "#3E6FA8"];

export function Gifts() {
  const progress = useVila((s) => s.progress);
  return (
    <>
      {GIFTS.map((g, i) =>
        progress.seen[`explore-gifts:${g.id}`] ? null : <Gift key={g.id} x={g.x} z={g.z} color={GIFT_COLORS[i % 3]} />
      )}
    </>
  );
}

function Gift({ x, z, color }: { x: number; z: number; color: string }) {
  const ref = useRef<Group>(null);
  const v = useMemo(() => gift(color), [color]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime;
    ref.current.position.y = 0.2 + Math.sin(clock.elapsedTime * 2 + x) * 0.15;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <Voxels voxels={v} size={0.6} emissive={GLOW} />
    </group>
  );
}

export function Label({ y, text }: { y: number; text: string }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={28} zIndexRange={[10, 0]} className="label3d">
      {text}
    </Html>
  );
}

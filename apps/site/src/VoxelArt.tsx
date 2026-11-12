/**
 * Crisp-edge voxel artwork for the public site. Every shape is an integer-aligned rect
 * (`shapeRendering="crispEdges"`) painted with the semantic tokens, so the page reads as the
 * same block-built world as the game (PALETTE in packages/shared/src/game/world.ts) without
 * shipping a 3D engine (IMPL-0005: the site must stay light and indexable).
 */

const crisp = { shapeRendering: "crispEdges" as const, focusable: "false" as const, "aria-hidden": true };

/** Header mark: gold star over a snow-capped pine, block-built on a 12×12 grid. */
export function VoxelCrestMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 24 24" {...crisp}>
      <g transform="scale(2)">
        <rect x="5" y="0" width="1" height="1" fill="var(--accent-gold)" />
        <rect x="4" y="1" width="3" height="1" fill="var(--accent-gold)" />
        <rect x="5" y="2" width="1" height="1" fill="var(--accent-leaf)" />
        <rect x="4" y="3" width="3" height="1" fill="var(--accent-leaf)" />
        <rect x="3" y="4" width="5" height="1" fill="var(--accent-leaf)" />
        <rect x="2" y="5" width="7" height="1" fill="var(--accent-leaf)" />
        <rect x="2" y="5" width="1" height="1" fill="var(--snow)" />
        <rect x="8" y="5" width="1" height="1" fill="var(--snow)" />
        <rect x="1" y="6" width="9" height="1" fill="var(--accent-leaf)" />
        <rect x="1" y="6" width="1" height="1" fill="var(--snow)" />
        <rect x="9" y="6" width="1" height="1" fill="var(--snow)" />
        <rect x="5" y="7" width="1" height="2" fill="var(--accent-gold-strong)" />
        <rect x="1" y="9" width="9" height="1" fill="var(--snow)" />
      </g>
    </svg>
  );
}

const BULB_COLORS = ["var(--bulb-gold)", "var(--bulb-red)", "var(--bulb-green)", "var(--bulb-blue)"];

/**
 * Festive voxel light strand. Rendered as blocky spans instead of a stretched SVG so the bulbs
 * keep their pixel size from 320px to 4K and each one twinkles on its own beat.
 */
export function VoxelGarland({ steady = false }: { steady?: boolean }) {
  return (
    <div className={`garland${steady ? " garland--steady" : ""}`} aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="garland__bulb"
          style={{ background: BULB_COLORS[i % BULB_COLORS.length], animationDelay: `${(i % 5) * 0.4}s` }}
        />
      ))}
    </div>
  );
}

/** 32×32: snowy plaza with the central tree, a gift and an approved NGO chalet. */
export function VoxelPlazaIcon({ size = 44 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 32 32" {...crisp}>
      <rect x="13" y="1" width="4" height="4" fill="var(--accent-gold)" />
      <rect x="12" y="5" width="6" height="3" fill="var(--accent-leaf)" />
      <rect x="9" y="8" width="12" height="4" fill="var(--accent-leaf)" />
      <rect x="9" y="8" width="3" height="2" fill="var(--snow)" />
      <rect x="6" y="12" width="18" height="4" fill="var(--accent-leaf)" />
      <rect x="6" y="12" width="4" height="2" fill="var(--snow)" />
      <rect x="3" y="16" width="24" height="4" fill="var(--accent-leaf)" />
      <rect x="3" y="16" width="5" height="2" fill="var(--snow)" />
      <rect x="13" y="20" width="4" height="4" fill="var(--accent-gold-strong)" />
      <rect x="22" y="21" width="7" height="5" fill="var(--action-primary)" />
      <rect x="24" y="21" width="2" height="5" fill="var(--accent-gold)" />
      <rect x="1" y="25" width="30" height="4" fill="var(--surface-frost)" />
      <rect x="1" y="25" width="30" height="1" fill="var(--snow)" />
    </svg>
  );
}

/** 32×32: memory-game cards, one face down (voxel diamond) and one face up (gold star). */
export function VoxelGameIcon({ size = 44 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 32 32" {...crisp}>
      <rect x="3" y="6" width="12" height="20" fill="var(--accent-leaf)" />
      <rect x="3" y="6" width="12" height="2" fill="var(--snow)" />
      <rect x="7" y="12" width="4" height="3" fill="var(--accent-gold)" />
      <rect x="5" y="15" width="8" height="3" fill="var(--accent-gold)" />
      <rect x="7" y="18" width="4" height="3" fill="var(--accent-gold)" />
      <rect x="17" y="8" width="12" height="20" fill="var(--text-primary)" />
      <rect x="19" y="10" width="8" height="2" fill="var(--surface-frost)" />
      <rect x="22" y="13" width="2" height="8" fill="var(--accent-gold)" />
      <rect x="19" y="15" width="8" height="2" fill="var(--accent-gold)" />
      <rect x="19" y="20" width="8" height="2" fill="var(--surface-frost)" />
    </svg>
  );
}

/** 32×32: gold mission star over the Caderno de Missões. */
export function VoxelMissionIcon({ size = 44 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 32 32" {...crisp}>
      <rect x="14" y="1" width="4" height="9" fill="var(--accent-gold)" />
      <rect x="9" y="5" width="14" height="4" fill="var(--accent-gold)" />
      <rect x="12" y="9" width="8" height="3" fill="var(--accent-gold)" />
      <rect x="6" y="15" width="20" height="16" fill="var(--accent-gold-strong)" />
      <rect x="8" y="17" width="16" height="12" fill="var(--surface-elevated)" />
      <rect x="10" y="19" width="12" height="2" fill="var(--text-primary)" />
      <rect x="10" y="23" width="12" height="2" fill="var(--text-primary)" />
      <rect x="12" y="13" width="8" height="2" fill="var(--text-primary)" />
    </svg>
  );
}

/** 32×32: the central plaza tree inside a stepped globe (global donation, DEC-026). */
export function VoxelTreeGlobeIcon({ size = 44 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 32 32" {...crisp}>
      <rect x="8" y="3" width="16" height="26" fill="var(--surface-frost)" />
      <rect x="4" y="7" width="24" height="18" fill="var(--surface-frost)" />
      <rect x="15" y="4" width="2" height="2" fill="var(--accent-gold)" />
      <rect x="14" y="8" width="4" height="4" fill="var(--accent-leaf)" />
      <rect x="12" y="12" width="8" height="4" fill="var(--accent-leaf)" />
      <rect x="10" y="16" width="12" height="4" fill="var(--accent-leaf)" />
      <rect x="14" y="20" width="4" height="4" fill="var(--accent-gold-strong)" />
      <rect x="4" y="7" width="24" height="2" fill="var(--snow)" />
      <rect x="4" y="23" width="24" height="2" fill="var(--snow)" />
    </svg>
  );
}

/** 32×32: an approved NGO chalet with a heart-lit window. */
export function VoxelChaletHeartIcon({ size = 44 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 32 32" {...crisp}>
      <rect x="9" y="6" width="14" height="4" fill="var(--snow)" />
      <rect x="7" y="10" width="18" height="4" fill="var(--action-primary)" />
      <rect x="5" y="14" width="22" height="3" fill="var(--action-primary)" />
      <rect x="7" y="17" width="18" height="12" fill="var(--surface-frost)" />
      <rect x="13" y="19" width="6" height="2" fill="var(--accent-gold)" />
      <rect x="12" y="21" width="8" height="2" fill="var(--accent-gold)" />
      <rect x="14" y="23" width="4" height="2" fill="var(--accent-gold)" />
      <rect x="9" y="17" width="2" height="12" fill="var(--snow)" />
      <rect x="21" y="17" width="2" height="12" fill="var(--snow)" />
      <rect x="3" y="29" width="26" height="2" fill="var(--snow)" />
    </svg>
  );
}

/** 24×24: DEC-015 verification badge (shield + block check). */
export function VoxelCheckShieldIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 24 24" {...crisp}>
      <rect x="4" y="2" width="16" height="12" fill="var(--text-primary)" />
      <rect x="6" y="14" width="12" height="4" fill="var(--text-primary)" />
      <rect x="9" y="18" width="6" height="3" fill="var(--text-primary)" />
      <rect x="7" y="11" width="2" height="2" fill="var(--snow)" />
      <rect x="9" y="13" width="2" height="2" fill="var(--snow)" />
      <rect x="11" y="11" width="2" height="2" fill="var(--snow)" />
      <rect x="13" y="9" width="2" height="2" fill="var(--snow)" />
      <rect x="15" y="7" width="2" height="2" fill="var(--snow)" />
    </svg>
  );
}

/** 20×20: clock face for the São Paulo village time pill. */
export function VoxelClockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 20 20" {...crisp}>
      <rect x="7" y="1" width="6" height="2" fill="currentColor" />
      <rect x="7" y="17" width="6" height="2" fill="currentColor" />
      <rect x="1" y="7" width="2" height="6" fill="currentColor" />
      <rect x="17" y="7" width="2" height="6" fill="currentColor" />
      <rect x="3" y="3" width="4" height="4" fill="currentColor" />
      <rect x="13" y="3" width="4" height="4" fill="currentColor" />
      <rect x="3" y="13" width="4" height="4" fill="currentColor" />
      <rect x="13" y="13" width="4" height="4" fill="currentColor" />
      <rect x="9" y="5" width="2" height="6" fill="currentColor" />
      <rect x="9" y="9" width="4" height="2" fill="currentColor" />
    </svg>
  );
}

/** 20×20: comfort control icon for falling snow. */
export function VoxelSnowflakeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 20 20" {...crisp}>
      <rect x="9" y="1" width="2" height="18" fill="currentColor" />
      <rect x="1" y="9" width="18" height="2" fill="currentColor" />
      <rect x="4" y="4" width="2" height="2" fill="currentColor" />
      <rect x="6" y="6" width="2" height="2" fill="currentColor" />
      <rect x="12" y="12" width="2" height="2" fill="currentColor" />
      <rect x="14" y="14" width="2" height="2" fill="currentColor" />
      <rect x="14" y="4" width="2" height="2" fill="currentColor" />
      <rect x="12" y="6" width="2" height="2" fill="currentColor" />
      <rect x="6" y="12" width="2" height="2" fill="currentColor" />
      <rect x="4" y="14" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

/** 18×18: theme control icon (voxel sun for the day, block crescent for the night). */
export function VoxelSkyIcon({ night, size = 18 }: { night: boolean; size?: number }) {
  if (night) {
    return (
      <svg className="voxel-icon" width={size} height={size} viewBox="0 0 18 18" {...crisp}>
        <rect x="6" y="2" width="8" height="2" fill="currentColor" />
        <rect x="4" y="4" width="6" height="2" fill="currentColor" />
        <rect x="2" y="6" width="6" height="6" fill="currentColor" />
        <rect x="4" y="12" width="6" height="2" fill="currentColor" />
        <rect x="6" y="14" width="8" height="2" fill="currentColor" />
        <rect x="1" y="1" width="2" height="2" fill="currentColor" />
        <rect x="15" y="4" width="2" height="2" fill="currentColor" />
        <rect x="13" y="14" width="2" height="2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="voxel-icon" width={size} height={size} viewBox="0 0 18 18" {...crisp}>
      <rect x="6" y="2" width="6" height="14" fill="currentColor" />
      <rect x="2" y="6" width="14" height="6" fill="currentColor" />
      <rect x="4" y="4" width="2" height="2" fill="currentColor" />
      <rect x="12" y="4" width="2" height="2" fill="currentColor" />
      <rect x="4" y="12" width="2" height="2" fill="currentColor" />
      <rect x="12" y="12" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

/** 20×20: pointer for the in-page call to action. */
export function VoxelArrowIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="voxel-icon inline-cta__arrow" width={size} height={size} viewBox="0 0 20 20" {...crisp}>
      <rect x="2" y="9" width="12" height="2" fill="currentColor" />
      <rect x="11" y="6" width="3" height="3" fill="currentColor" />
      <rect x="14" y="9" width="3" height="3" fill="currentColor" />
      <rect x="11" y="12" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

/** One snow-capped pine, bottom-aligned on the skyline ground line. */
function SkylinePine({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} 138) scale(${s})`}>
      <rect x="-24" y="-24" width="48" height="8" fill="var(--accent-leaf)" />
      <rect x="-18" y="-36" width="36" height="12" fill="var(--accent-leaf)" />
      <rect x="-12" y="-48" width="24" height="12" fill="var(--accent-leaf)" />
      <rect x="-6" y="-60" width="12" height="12" fill="var(--accent-leaf)" />
      <rect x="-24" y="-28" width="10" height="4" fill="var(--snow)" />
      <rect x="-18" y="-40" width="8" height="4" fill="var(--snow)" />
      <rect x="-12" y="-52" width="6" height="4" fill="var(--snow)" />
      <rect x="-6" y="-64" width="12" height="4" fill="var(--snow)" />
      <rect x="-4" y="-16" width="8" height="16" fill="var(--surface-masthead)" />
    </g>
  );
}

/** One lit chalet, bottom-aligned on the skyline ground line. */
function SkylineChalet({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} 138) scale(${s})`}>
      <rect x="-28" y="-40" width="56" height="40" fill="var(--surface-frost)" />
      <rect x="-32" y="-46" width="64" height="6" fill="var(--action-primary)" />
      <rect x="-24" y="-54" width="48" height="8" fill="var(--action-primary)" />
      <rect x="-16" y="-62" width="32" height="8" fill="var(--snow)" />
      <rect x="-30" y="-46" width="16" height="4" fill="var(--snow)" />
      <rect x="14" y="-46" width="16" height="4" fill="var(--snow)" />
      <rect x="-18" y="-32" width="12" height="12" fill="var(--bulb-gold)" />
      <rect x="6" y="-32" width="12" height="12" fill="var(--bulb-gold)" />
      <rect x="-6" y="-16" width="12" height="16" fill="var(--accent-gold-strong)" />
    </g>
  );
}

/** Three-block snowman. */
function SkylineSnowman({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g transform={`translate(${x} 138) scale(${s})`}>
      <rect x="-10" y="-8" width="20" height="8" fill="var(--snow)" />
      <rect x="-8" y="-22" width="16" height="14" fill="var(--snow)" />
      <rect x="-6" y="-32" width="12" height="10" fill="var(--snow)" />
      <rect x="-4" y="-29" width="2" height="2" fill="var(--surface-masthead)" />
      <rect x="2" y="-29" width="2" height="2" fill="var(--surface-masthead)" />
      <rect x="-8" y="-38" width="16" height="6" fill="var(--action-primary)" />
      <rect x="-2" y="-41" width="4" height="3" fill="var(--action-primary)" />
    </g>
  );
}

/**
 * Full-width village horizon that carries the page into the deep-pine footer: pines, lit chalets,
 * a snowman, smoke puffs and the sleigh. Cropped from the centre on narrow screens.
 */
export function VoxelVillageSkyline() {
  return (
    <svg className="skyline" viewBox="0 0 1440 138" preserveAspectRatio="xMidYMax slice" {...crisp}>
      <rect x="0" y="128" width="1440" height="10" fill="var(--surface-masthead)" />
      <rect x="0" y="124" width="1440" height="4" fill="var(--snow)" />
      {/* Back row: dark silhouettes give the horizon depth. */}
      <g opacity="0.4">
        <SkylinePine x={170} s={1.5} />
        <SkylinePine x={430} s={1.8} />
        <SkylinePine x={700} s={1.4} />
        <SkylinePine x={960} s={1.7} />
        <SkylinePine x={1240} s={1.55} />
      </g>
      <SkylinePine x={70} s={1.9} />
      <SkylineChalet x={250} s={1.5} />
      <SkylinePine x={390} s={2.2} />
      <SkylineSnowman x={490} s={1.6} />
      <SkylinePine x={590} s={1.7} />
      <SkylineChalet x={720} s={1.5} />
      <SkylinePine x={860} s={2.1} />
      <SkylinePine x={1010} s={1.6} />
      <SkylineChalet x={1140} s={1.5} />
      <SkylineSnowman x={1240} s={1.4} />
      <SkylinePine x={1330} s={2} />
      <SkylinePine x={1410} s={1.5} />
      <g opacity="0.55">
        <rect x="236" y="62" width="8" height="8" fill="var(--snow)" />
        <rect x="246" y="52" width="8" height="8" fill="var(--snow)" />
        <rect x="258" y="44" width="6" height="6" fill="var(--snow)" />
        <rect x="706" y="66" width="8" height="8" fill="var(--snow)" />
        <rect x="718" y="56" width="6" height="6" fill="var(--snow)" />
        <rect x="1126" y="64" width="8" height="8" fill="var(--snow)" />
        <rect x="1138" y="54" width="6" height="6" fill="var(--snow)" />
      </g>
      <g transform="translate(940 138) scale(1.5)">
        <rect x="-34" y="-10" width="68" height="4" fill="var(--accent-gold)" />
        <rect x="-30" y="-18" width="8" height="8" fill="var(--accent-gold)" />
        <rect x="18" y="-18" width="8" height="8" fill="var(--accent-gold)" />
        <rect x="-24" y="-30" width="40" height="12" fill="var(--action-primary)" />
        <rect x="-28" y="-34" width="16" height="6" fill="var(--snow)" />
        <rect x="8" y="-26" width="10" height="10" fill="var(--surface-frost)" />
        <rect x="-12" y="-40" width="6" height="10" fill="var(--accent-gold-strong)" />
      </g>
    </svg>
  );
}

/**
 * Seats of the story characters that used to crowd the square (IMPL-0037). Each point was derived once from its
 * named place: the site's `front`, stepped along the ring street tangent by `width / 2 - 2`, and accepted only
 * when it is clear of every collider, of every lot front (5.2 u), of every site front (3.4 u), of every other
 * character (2 u) and of every village-life spot. The five village anchors stay where the scenery puts them.
 *
 * A `talk` interaction must stand exactly at its character (the book scene tests), so books spread `seatPoint`
 * instead of repeating the number: moving a seat moves its dialogue target with it.
 */
export interface StorySeat {
  x: number;
  z: number;
  rot: number;
}

export type StorySeatId =
  | "mestre-anselmo"
  | "nina"
  | "tomas"
  | "tia-bete"
  | "seu-nazario"
  | "dona-iris"
  | "dona-cida"
  | "mestre-teo"
  | "lia";

export const STORY_SEATS: Record<StorySeatId, StorySeat> = {
  // The small square of ring 1 (square-01).
  "mestre-anselmo": { x: -29.87, z: -24.93, rot: 0.7854 },
  // The restaurant of ring 1 (civic-02).
  "seu-nazario": { x: -35.53, z: 19.27, rot: 2.3562 },
  // The school of ring 2 (civic-04).
  lia: { x: 25.28, z: 51.44, rot: -2.3562 },
  // The theatre of ring 2 (civic-06).
  nina: { x: 35.88, z: -40.84, rot: -0.7854 },
  // The south park of ring 2 (park-01).
  "dona-cida": { x: -3.5, z: -54.25, rot: 0 },
  // The supermarket of ring 3 (civic-07).
  "tia-bete": { x: 50.38, z: 45.43, rot: -2.3562 },
  // The sleigh station of ring 3 (civic-09).
  tomas: { x: 64.52, z: -31.29, rot: -0.7854 },
  // The mall of ring 4 (civic-10).
  "dona-iris": { x: -54.98, z: 59.93, rot: 2.3562 },
  // The west park of ring 4 (park-03).
  "mestre-teo": { x: -81.25, z: -29.5, rot: 1.5708 },
};

export const seat = (id: StorySeatId): StorySeat => STORY_SEATS[id];

/** The point of a seat, without the facing: what a `talk` interaction spreads. */
export const seatPoint = (id: StorySeatId): { x: number; z: number } => {
  const { x, z } = STORY_SEATS[id];
  return { x, z };
};

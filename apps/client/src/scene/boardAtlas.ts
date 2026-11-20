/**
 * Where each display board draws in the one texture all of them share (IMPL-0031, PROPOSTA). Pure: the scene
 * turns it into a canvas and one quad per board, and the tests check that no two cells overlap.
 *
 * A board takes one cell of its format's size (`BOARD_FORMATS[format].cell`); a screen takes one per slide it
 * cycles through. Cells are packed in rows, format by format, into a texture `ATLAS_WIDTH` wide.
 */
import { type BillboardDef, BILLBOARDS, BOARD_FORMATS, type BoardFormat, boardNotices } from "@vila/shared/game/world";

export const ATLAS_WIDTH = 2048;
/** The largest first: rows of one height waste nothing. */
const ORDER: readonly BoardFormat[] = ["outdoor", "screen", "rooftop", "lawn"];

export interface AtlasCell {
  boardId: string;
  format: BoardFormat;
  /** Which of the board's notices this cell holds (0 for every board but a screen). */
  slide: number;
  text: string;
  /** Top-left corner and size, in pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardAtlas {
  width: number;
  height: number;
  cells: AtlasCell[];
}

export function boardAtlas(boards: readonly BillboardDef[] = BILLBOARDS): BoardAtlas {
  const cells: AtlasCell[] = [];
  let x = 0, y = 0;
  for (const format of ORDER) {
    const [w, h] = BOARD_FORMATS[format].cell;
    let any = false;
    for (const board of boards.filter((b) => b.format === format))
      boardNotices(board.id).forEach((text, slide) => {
        if (x + w > ATLAS_WIDTH) (x = 0), (y += h);
        cells.push({ boardId: board.id, format, slide, text, x, y, w, h });
        x += w;
        any = true;
      });
    // The next format starts a row of its own height.
    if (any) (x = 0), (y += h);
  }
  return { width: ATLAS_WIDTH, height: y, cells };
}

/** Texture coordinates of a cell: `[u0, v0, u1, v1]`, v up (the canvas is drawn top-down). */
export const cellUv = (atlas: BoardAtlas, cell: AtlasCell): [number, number, number, number] => [cell.x / atlas.width, 1 - (cell.y + cell.h) / atlas.height, (cell.x + cell.w) / atlas.width, 1 - cell.y / atlas.height];

/** Lines of a notice that fit `width` pixels (greedy: the notices are a few words). */
export function wrapNotice(text: string, width: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && measure(`${last} ${word}`) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

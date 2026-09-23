/**
 * Masked-region rendering polish (DESIGN.md §8/§18 Phase 9): a diagonal
 * hatch, not a flat fill, for the 2D contour's "invalid domain" cells
 * (`log(x)`, `1/x` at `x=0`, ...) — the spec explicitly asks for a "distinct
 * 'invalid region' hatch/fill so it's visibly different from 'outside the
 * plotted bounds.'" Built once per canvas 2D context (patterns are
 * `CanvasRenderingContext2D`-owned) on a small offscreen tile and repeated,
 * rather than stroking individual diagonal lines per masked cell.
 */
const TILE_SIZE = 10;

export function createMaskedRegionPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return null;

  tileCtx.fillStyle = "rgba(120,120,120,0.55)";
  tileCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  tileCtx.strokeStyle = "rgba(40,40,40,0.7)";
  tileCtx.lineWidth = 1.5;
  tileCtx.beginPath();
  tileCtx.moveTo(0, TILE_SIZE);
  tileCtx.lineTo(TILE_SIZE, 0);
  tileCtx.stroke();

  return ctx.createPattern(tile, "repeat");
}

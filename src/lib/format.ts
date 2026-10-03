const LOSS_DECIMALS = 6;

/** A loss value for display: fixed decimals when finite, otherwise `NaN`/`Infinity` verbatim so a diverged run is obvious. */
export function formatLoss(loss: number): string {
  return Number.isFinite(loss) ? loss.toFixed(LOSS_DECIMALS) : String(loss);
}

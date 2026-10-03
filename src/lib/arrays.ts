/** True when both arrays hold the identical (`===`) elements in the same order. */
export function shallowEqualArrays<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

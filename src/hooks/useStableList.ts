import { useRef } from "react";
import { shallowEqualArrays } from "../lib/arrays";

/**
 * Returns the previously returned array whenever `list` holds the same
 * elements in the same order. Callers routinely rebuild lists inline
 * (`entries.map((e) => e.runner)`); without this, every render hands
 * effects a "new" dependency and they tear down and re-run — re-subscribing
 * every runner listener and restarting the RAF loop each time.
 */
export function useStableList<T>(list: readonly T[]): readonly T[] {
  const previous = useRef(list);
  if (!shallowEqualArrays(previous.current, list)) previous.current = list;
  return previous.current;
}

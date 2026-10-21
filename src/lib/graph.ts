// Graph traversals: lineage ancestry and subproblem dependencies.

/** All nodes reachable from `start` by following `next`, excluding `start`. */
export function reachable(start: string, next: (id: string) => readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...next(start)];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === start || seen.has(n)) continue;
    seen.add(n);
    stack.push(...next(n));
  }
  return seen;
}

export function invert(edges: Record<string, readonly string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(edges)) out[k] ??= [];
  for (const [k, vs] of Object.entries(edges)) for (const v of vs) (out[v] ??= []).push(k);
  return out;
}

/** Ancestors (what it builds on, transitively) and descendants (what builds on it). */
export function ancestry(id: string, buildsOn: Record<string, readonly string[]>) {
  const rev = invert(buildsOn);
  return {
    ancestors: reachable(id, (n) => buildsOn[n] ?? []),
    descendants: reachable(id, (n) => rev[n] ?? []),
  };
}

/** Upstream dependencies and downstream dependents of a subproblem. */
export function subproblemFlow(id: string, dependsOn: Record<string, readonly string[]>) {
  const rev = invert(dependsOn);
  return {
    upstream: reachable(id, (n) => dependsOn[n] ?? []),
    downstream: reachable(id, (n) => rev[n] ?? []),
  };
}

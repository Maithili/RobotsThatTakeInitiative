/** First year with its own band on the Methods timeline. Earlier papers share one "Before" band (SPEC §7.1). */
export const TIMELINE_START = 2021;

/** Level scope lives in one shared place (SPEC §6.2). */
export { BAND_LEVELS, FOCUS_LEVELS } from '../../lib/scope.ts';

/** Cluster tints in family order; more families reuse them in turn. */
export const CLUSTER_TINTS = 6;

export interface FamilyInfo {
  name: string;
  definition?: string;
  scope_line?: string;
  strength?: string;
  limitations?: string[];
}

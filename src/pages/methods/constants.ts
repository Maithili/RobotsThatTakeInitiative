import type { LevelId } from '../../schema.ts';

/** First year with its own band on the Methods timeline. Earlier papers share one "Before" band (SPEC §7.1). */
export const TIMELINE_START = 2021;

/** Levels the literature graph shows (SPEC §7.2). L1 papers appear in the timeline and the list view. */
export const GRAPH_LEVELS: readonly LevelId[] = ['L2'];

/** Levels with a card and a timeline row, top to bottom. The Methods page does not show L0. */
export const BAND_LEVELS: readonly LevelId[] = ['L2', 'L1'];

/** Cluster tints in family order; more families reuse them in turn. */
export const CLUSTER_TINTS = 6;

export interface FamilyInfo {
  name: string;
  definition?: string;
  scope_line?: string;
  strength?: string;
  limitations?: string[];
}

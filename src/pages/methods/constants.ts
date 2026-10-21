import type { LevelId } from '../../schema.ts';

/** First year with its own band on the Methods timeline. Earlier papers share one "Before" band (SPEC §7.1). */
export const TIMELINE_START = 2021;

/** Levels the literature graph shows (SPEC §7.2). L1 papers appear in the timeline and the list view. */
export const GRAPH_LEVELS: readonly LevelId[] = ['L2'];

/** Whether tangential works appear in the literature graph and the list view at all (SPEC §7.2).
 *  When true, readers can still hide them with "Show tangential works" (`tangents=0`). */
export const TANGENTS_IN_GRAPH = true;

/** Levels with a card and a timeline row, top to bottom. The Methods page does not show L0. */
export const BAND_LEVELS: readonly LevelId[] = ['L2', 'L1'];

/** Family hues in taxonomy order: teal (Goal Inference), coral (Temporal Imitation), then hues for new families. */
export const FAMILY_HUES = 4;

/** CSS hue slot for a family: '0' to '3', or 'none' (purple) for papers with no family. */
export function familyHue(families: Record<string, unknown>, family: string | null | undefined): string {
  const i = family ? Object.keys(families).indexOf(family) : -1;
  if (i < 0) return 'none';
  return String(i < FAMILY_HUES ? i : 2 + ((i - 2) % (FAMILY_HUES - 2)));
}

export interface FamilyInfo {
  name: string;
  definition?: string;
  scope_line?: string;
  strength?: string;
  limitations?: string[];
}

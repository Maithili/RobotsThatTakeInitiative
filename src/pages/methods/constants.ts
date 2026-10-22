/** First year with its own band on the Methods timeline. Earlier papers share one "Before" band (SPEC §7.1). */
export const TIMELINE_START = 2021;

/** Level scope lives in one shared place (SPEC §6.2). */
export { BAND_LEVELS, FOCUS_LEVELS } from '../../lib/scope.ts';

/** Whether tangential works appear in the literature graph and the list view at all (SPEC §7.2).
 *  When true, readers can still hide them with "Show tangential works" (`tangents=0`). */
export const TANGENTS_IN_GRAPH = true;

/** Family hues in taxonomy order: teal (Goal Inference), coral (Temporal Imitation), then blue and green for new families. */
export const FAMILY_HUES = 4;
/** CSS hue slot for papers that fit no category: gray (SPEC §7.2). */
export const NO_CATEGORY_HUE = 'none';
/** CSS hue slot for the framework paper: purple, with a ring (SPEC §7.2). */
export const FRAMEWORK_HUE = 'framework';

/** CSS hue slot for a family: '0' to '3', or 'none' (gray) for papers with no family. */
export function familyHue(families: Record<string, unknown>, family: string | null | undefined): string {
  const i = family ? Object.keys(families).indexOf(family) : -1;
  if (i < 0) return NO_CATEGORY_HUE;
  return String(i < FAMILY_HUES ? i : 2 + ((i - 2) % (FAMILY_HUES - 2)));
}

/** CSS hue slot for a tangential category (its taxonomy `color`), or 'none' (gray) for a type the taxonomy lacks. */
export function tangentHue(types: Record<string, { color?: string }>, tangent: string | null | undefined): string {
  return (tangent && Object.prototype.hasOwnProperty.call(types, tangent) && types[tangent].color) || NO_CATEGORY_HUE;
}

export interface FamilyInfo {
  name: string;
  definition?: string;
  scope_line?: string;
  strength?: string;
  limitations?: string[];
  /** Drawn at 75% opacity in the literature graph (SPEC §7.2). */
  semi_tangential?: boolean;
}

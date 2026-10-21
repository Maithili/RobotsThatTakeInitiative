/** The year to print after a paper's short name, or null when the short name already contains it (e.g. "Ravichandar 2020"). */
export function yearAfterName(p: { short_name: string; year: number }): number | null {
  return p.short_name.includes(String(p.year)) ? null : p.year;
}

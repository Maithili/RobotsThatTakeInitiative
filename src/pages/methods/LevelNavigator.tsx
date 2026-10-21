import { KnownsChips } from '../../components/Chip.tsx';
import { LEVELS_TOP_DOWN, tx } from '../../data.ts';
import type { LevelId } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';

/** Compact, interactive version of RTI Fig. 1 (right panel). Clicking a card sets level=. */
export function LevelNavigator({ counts }: { counts: Record<LevelId, number> }) {
  const url = useUrl();
  const levels = url.filters.level;
  const selected = levels.length === 1 ? (levels[0] as LevelId) : null;

  return (
    <section className="levelnav" aria-label="Levels of proactivity">
      <ol className="levelnav__cards">
        {LEVELS_TOP_DOWN.map((l) => {
          const L = tx.levels[l];
          const on = levels.includes(l);
          return (
            <li key={l}>
              <button
                type="button"
                className={`levelcard levelcard--${l}${on ? ' is-on' : ''}`}
                aria-pressed={on}
                data-testid={`levelcard-${l}`}
                onClick={() => url.set({ level: selected === l ? null : l })}
              >
                <span className="levelcard__top">
                  <span className={`level-chip level-chip--${l}`}>{l}</span>
                  <strong>{L.name}</strong>
                  <span className="levelcard__count" aria-label={`${counts[l]} papers`}>
                    {counts[l]}
                  </span>
                </span>
                <KnownsChips knowns={L.knowns} />
                <span className="levelcard__def">{L.definition}</span>
                {L.note && <span className="levelcard__note">{L.note}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

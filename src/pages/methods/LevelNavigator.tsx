import { useEffect, useState } from 'react';
import { KnownsChips } from '../../components/Chip.tsx';
import { LEVELS_TOP_DOWN, tx } from '../../data.ts';
import { deriveLevel, type LevelId } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';

type K = 'known' | 'unknown' | null;

function Toggle({ name, label, value, onChange }: { name: string; label: React.ReactNode; value: K; onChange: (v: 'known' | 'unknown') => void }) {
  return (
    <div className="seg" role="group" aria-label={name}>
      <span className="seg__label">{label}</span>
      {(['known', 'unknown'] as const).map((v) => (
        <button key={v} type="button" className={value === v ? 'seg__btn is-on' : 'seg__btn'} aria-pressed={value === v} onClick={() => onChange(v)}>
          {v}
        </button>
      ))}
    </div>
  );
}

/** Compact, interactive version of RTI Fig. 1 (right panel). */
export function LevelNavigator({ counts }: { counts: Record<LevelId, number> }) {
  const url = useUrl();
  const levels = url.filters.level;
  const selected = levels.length === 1 ? (levels[0] as LevelId) : null;
  const [goal, setGoal] = useState<K>(selected ? tx.levels[selected].knowns.goal : null);
  const [policy, setPolicy] = useState<K>(selected ? tx.levels[selected].knowns.human_policy : null);

  // Follow the URL when the level changes elsewhere (filter chip removed, Back).
  useEffect(() => {
    if (selected) {
      setGoal(tx.levels[selected].knowns.goal);
      setPolicy(tx.levels[selected].knowns.human_policy);
    } else if (levels.length !== 0) {
      setGoal(null);
      setPolicy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, levels.length]);

  const setToggles = (g: K, p: K) => {
    setGoal(g);
    setPolicy(p);
    if (g && p) url.set({ level: deriveLevel({ goal: g, human_policy: p }) });
  };

  const invalid = goal === 'unknown' && policy === 'known';

  return (
    <section className="levelnav" aria-label="Levels of proactivity">
      <div className="levelnav__toggles">
        <Toggle name="Goal g" label="Goal g" value={goal} onChange={(v) => setToggles(v, policy)} />
        <Toggle
          name="Human policy πʰ"
          label={
            <>
              Human policy π<sup>h</sup>
            </>
          }
          value={policy}
          onChange={(v) => setToggles(goal, v)}
        />
        {invalid ? (
          <p className="levelnav__msg" role="status">
            Not a level in the formalism.
          </p>
        ) : (
          (goal || policy) &&
          !(goal && policy) && (
            <p className="levelnav__msg muted" role="status">
              Set both to pick a level.
            </p>
          )
        )}
      </div>
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
                onClick={() => {
                  if (selected === l) {
                    setGoal(null);
                    setPolicy(null);
                    url.set({ level: null });
                  } else {
                    setGoal(L.knowns.goal);
                    setPolicy(L.knowns.human_policy);
                    url.set({ level: l });
                  }
                }}
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

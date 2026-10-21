import { useMemo } from 'react';
import { Chip, LevelChip } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { FilterBar } from '../../components/FilterBar.tsx';
import { Math as TeX } from '../../components/Math.tsx';
import { StatusGlyph } from '../../components/StatusGlyph.tsx';
import { addressesAny, papers, SUBS, tx } from '../../data.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { SUBPROBLEM_IDS, type DbPaper, type SubproblemId, type SubproblemTag } from '../../schema.ts';
import { toggleInList, useUrl } from '../../state/url.ts';
import { buildLanes } from '../methods/groups.ts';
import { SubproblemNavigator } from './SubproblemNavigator.tsx';

const RELATIONS = Object.keys(tx.relations) as SubproblemTag['relation'][];

function isSub(s: string | null): s is SubproblemId {
  return !!s && (SUBPROBLEM_IDS as readonly string[]).includes(s);
}

/** This page lists only works that address a subproblem (SPEC §9). */
const addresses = (p: DbPaper, s: SubproblemId) => p.subproblems?.[s]?.status === 'addresses';

function Overview({ visible, onSelect }: { visible: DbPaper[]; onSelect: (s: SubproblemId) => void }) {
  return (
    <div className="overview">
      <ul className="plain overview__list">
        {SUBS.map((s) => {
          const n = visible.filter((p) => addresses(p, s)).length;
          const S = tx.subproblems[s];
          return (
            <li key={s}>
              <button type="button" className="overview__row" onClick={() => onSelect(s)}>
                <span className="overview__name">
                  <strong>{S.name}</strong>
                  <span className="small muted">{S.challenge}</span>
                </span>
                <span className="overview__counts small">
                  {n} {n === 1 ? 'work' : 'works'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Detail({ sub, visible }: { sub: SubproblemId; visible: DbPaper[] }) {
  const url = useUrl();
  const S = tx.subproblems[sub];
  const relations = url.list('relation');
  const tagged = visible
    .map((p) => ({ p, t: p.subproblems?.[sub] }))
    .filter((x): x is { p: DbPaper; t: SubproblemTag } => x.t?.status === 'addresses')
    .filter((x) => !relations.length || relations.includes(x.t.relation));
  const groups = [
    ...Object.entries(S.approaches).map(([id, label]) => ({ id, label, rows: tagged.filter((x) => x.t.approach === id) })),
    { id: 'other', label: 'Other', rows: tagged.filter((x) => !x.t.approach || !S.approaches[x.t.approach]) },
  ].filter((g) => g.rows.length);
  const anyDirect = visible.some((p) => addresses(p, sub) && p.subproblems?.[sub]?.relation === 'direct');

  return (
    <div className="detail" data-testid="sub-detail">
      <header className="detail__head">
        <div className="detail__title">
          <h2>{S.name}</h2>
          <span className="small muted">{tx.stages[S.stage]?.name}</span>
        </div>
        <div className="detail__io">
          <TeX tex={S.input} /> <span aria-label="to">→</span> <TeX tex={S.output} />
        </div>
        <p className="detail__challenge">
          <span className="muted">Challenge.</span> {S.challenge}
        </p>
      </header>
      <div className="detail__filters">
        <span className="chips" role="group" aria-label="Relation">
          {RELATIONS.map((r) => (
            <Chip key={r} pressed={relations.includes(r)} onClick={() => url.set({ relation: toggleInList(relations, r) })} title={tx.relations[r].definition}>
              {tx.relations[r].label}
            </Chip>
          ))}
        </span>
      </div>
      {!anyDirect && <EmptyState compact>No work in the database addresses {S.name.toLowerCase()} directly.</EmptyState>}
      {groups.length === 0 ? (
        <EmptyState>No work that addresses it matches these filters.</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="approach">
            <h3>
              {g.label} <span className="muted">· {g.rows.length}</span>
            </h3>
            <ul className="plain work-list">
              {[...g.rows]
                .sort((a, b) => b.p.year - a.p.year || a.p.short_name.localeCompare(b.p.short_name))
                .map(({ p, t }) => (
                  <li key={p.id}>
                    <button type="button" className="work-row" data-locate={p.id} data-testid={`work-${p.id}`} onClick={() => url.openPaper(p.id)}>
                      <span className="work-row__name">
                        <strong>{p.short_name}</strong> <span className="muted">{p.year}</span>
                      </span>
                      <span className={`rel rel--${t.relation}`}>{tx.relations[t.relation].label}</span>
                      <span className="work-row__note small">{t.note}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Matrix({ visible }: { visible: DbPaper[] }) {
  const url = useUrl();
  const gaps = url.get('gaps') === '1';
  const tagged = visible.filter(addressesAny);
  const groups = useMemo(() => {
    const methodPapers = tagged.filter((p) => p.method && p.level);
    const out: { id: string; title: string; level: DbPaper['level']; method: boolean; rows: DbPaper[] }[] = buildLanes(methodPapers)
      .filter((l) => l.papers.length)
      .map((l) => ({ id: l.id, title: l.family ? `${l.level} · ${l.title}` : l.title, level: l.level, method: true, rows: l.papers }));
    const others = tagged.filter((p) => !(p.method && p.level));
    if (others.length) out.push({ id: 'works', title: 'Subproblem works', level: null, method: false, rows: others });
    return out;
  }, [tagged]);
  const stages = Object.keys(tx.stages).map((st) => ({ id: st, subs: SUBS.filter((s) => tx.subproblems[s].stage === st) }));
  const count = (s: SubproblemId) => tagged.filter((p) => addresses(p, s)).length;

  if (!tagged.length) return <EmptyState>No work that addresses a subproblem matches these filters.</EmptyState>;
  return (
    <div className="matrix-wrap" data-testid="matrix">
      <p className="small muted matrix__legend">
        <StatusGlyph status="addresses" /> Addresses the subproblem. Blank otherwise.
      </p>
      <table className={`matrix${gaps ? ' is-gaps' : ''}`}>
        <thead>
          <tr>
            <th rowSpan={2} className="matrix__corner" scope="col">
              Paper
            </th>
            {stages.map((st) => (
              <th key={st.id} colSpan={st.subs.length} className={`matrix__stage matrix__stage--${st.id}`} scope="colgroup">
                {tx.stages[st.id].name}
              </th>
            ))}
          </tr>
          <tr>
            {SUBS.map((s) => (
              <th key={s} scope="col" className="matrix__col" title={tx.subproblems[s].name}>
                <button type="button" className="th-sort" onClick={() => url.set({ sub: s, view: null })}>
                  {tx.subproblems[s].short}
                </button>
                <span className="matrix__count">{count(s)}</span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.id}>
            <tr className="matrix__group">
              <th scope="colgroup" colSpan={SUBS.length + 1}>
                {g.level && <LevelChip level={g.level} />} {g.title} <span className="muted">· {g.rows.length}</span>
              </th>
            </tr>
            {[...g.rows]
              .sort((a, b) => a.year - b.year || a.short_name.localeCompare(b.short_name))
              .map((p) => (
                <tr key={p.id} data-locate={p.id}>
                  <th scope="row" className="matrix__paper">
                    <button type="button" className="linkish" onClick={() => url.openPaper(p.id)}>
                      {p.short_name}
                    </button>{' '}
                    <span className="muted small">{p.year}</span>
                  </th>
                  {SUBS.map((s) => {
                    const t = addresses(p, s) ? p.subproblems![s]! : null;
                    const name = tx.subproblems[s].short;
                    return (
                      <td key={s} className={`matrix__cell${t ? ' is-filled' : ' is-empty'}${g.method ? ' is-method' : ''}`}>
                        {t ? (
                          <button
                            type="button"
                            className="matrix__btn"
                            data-testid={`cell-${p.id}-${s}`}
                            aria-label={`${p.short_name} addresses ${name.toLowerCase()}`}
                            title={`${name}: ${t.note}`}
                            onClick={() => url.openPaper(p.id)}
                          >
                            <StatusGlyph status="addresses" />
                          </button>
                        ) : (
                          <span className="matrix__blank" data-testid={`cell-${p.id}-${s}`} aria-label={`${p.short_name}: does not address ${name.toLowerCase()}`} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function SubproblemsPage() {
  const url = useUrl();
  const raw = url.get('sub');
  const sub = isSub(raw) ? raw : null;
  const view = url.get('view') === 'matrix' ? 'matrix' : 'detail';
  const themes = url.filters.theme;
  const visible = papers.filter((p) => matchesGlobal(p, url.filters));
  const counts = Object.fromEntries(SUBS.map((s) => [s, visible.filter((p) => addresses(p, s)).length]));

  return (
    <div className="page">
      <div className="page__intro">
        <h1>Subproblems</h1>
        <p className="lede">Proactive assistance split into grounding, anticipation, and planning. Pick a subproblem to see the works that tackle it.</p>
      </div>
      <SubproblemNavigator selected={sub} counts={counts} onSelect={(s) => url.set({ sub: s, ...(s && view === 'matrix' ? { view: null } : {}) })} />
      <div className="themes" role="group" aria-label="Themes">
        <span className="small muted">Cross-cutting themes</span>
        {Object.entries(tx.themes).map(([id, t]) => (
          <Chip key={id} pressed={themes.includes(id)} onClick={() => url.set({ theme: toggleInList(themes, id) })} title={t.definition}>
            {t.label}
          </Chip>
        ))}
      </div>
      <FilterBar
        controls={['level', 'family', 'action', 'input']}
        extra={
          <span className="filterbar__extra">
            <span className="seg seg--sm" role="group" aria-label="View">
              <button type="button" className={view === 'detail' ? 'seg__btn is-on' : 'seg__btn'} aria-pressed={view === 'detail'} onClick={() => url.set({ view: null })}>
                Detail
              </button>
              <button type="button" className={view === 'matrix' ? 'seg__btn is-on' : 'seg__btn'} aria-pressed={view === 'matrix'} onClick={() => url.set({ view: 'matrix' })}>
                Matrix
              </button>
            </span>
            {view === 'matrix' && (
              <label className="check">
                <input type="checkbox" checked={url.get('gaps') === '1'} onChange={(e) => url.set({ gaps: e.target.checked ? '1' : null })} />
                Gaps
              </label>
            )}
          </span>
        }
      />
      {view === 'matrix' ? (
        <Matrix visible={visible} />
      ) : sub ? (
        <Detail sub={sub} visible={visible} />
      ) : (
        <Overview visible={visible} onSelect={(s) => url.set({ sub: s })} />
      )}
    </div>
  );
}

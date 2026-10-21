import { useMemo } from 'react';
import { Chip, LevelChip } from '../../components/Chip.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { FilterBar } from '../../components/FilterBar.tsx';
import { Math as TeX } from '../../components/Math.tsx';
import { StatusGlyph, StatusLegend } from '../../components/StatusGlyph.tsx';
import { papers, SUBS, tx } from '../../data.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import { SUBPROBLEM_IDS, type DbPaper, type SubproblemId, type SubproblemTag } from '../../schema.ts';
import { toggleInList, useUrl } from '../../state/url.ts';
import { buildLanes } from '../methods/LineageGraph.tsx';
import { SubproblemNavigator } from './SubproblemNavigator.tsx';

type Status = SubproblemTag['status'];
const STATUSES = Object.keys(tx.statuses) as Status[];
const RELATIONS = Object.keys(tx.relations) as SubproblemTag['relation'][];

function isSub(s: string | null): s is SubproblemId {
  return !!s && (SUBPROBLEM_IDS as readonly string[]).includes(s);
}

function Overview({ visible, onSelect }: { visible: DbPaper[]; onSelect: (s: SubproblemId) => void }) {
  return (
    <div className="overview">
      <ul className="plain overview__list">
        {SUBS.map((s) => {
          const c = { addresses: 0, assumes: 0, skips: 0 };
          for (const p of visible) {
            const t = p.subproblems?.[s];
            if (t) c[t.status]++;
          }
          const S = tx.subproblems[s];
          return (
            <li key={s}>
              <button type="button" className="overview__row" onClick={() => onSelect(s)}>
                <span className="overview__id">{s}</span>
                <span className="overview__name">
                  <strong>{S.name}</strong>
                  <span className="small muted">{S.challenge}</span>
                </span>
                <span className="overview__counts small">
                  {STATUSES.map((st) => (
                    <span key={st} title={tx.statuses[st].label}>
                      <StatusGlyph status={st} /> {c[st]}
                    </span>
                  ))}
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
  const statuses = url.list('status');
  const relations = url.list('relation');
  const tagged = visible
    .map((p) => ({ p, t: p.subproblems?.[sub] }))
    .filter((x): x is { p: DbPaper; t: SubproblemTag } => !!x.t)
    .filter((x) => (!statuses.length || statuses.includes(x.t.status)) && (!relations.length || relations.includes(x.t.relation)));
  const groups = [
    ...Object.entries(S.approaches).map(([id, label]) => ({ id, label, rows: tagged.filter((x) => x.t.approach === id) })),
    { id: 'other', label: 'Other', rows: tagged.filter((x) => !x.t.approach || !S.approaches[x.t.approach]) },
  ].filter((g) => g.rows.length);
  const statusOrder = (s: Status) => STATUSES.indexOf(s);
  const anyDirect = visible.some((p) => p.subproblems?.[sub]?.status === 'addresses' && p.subproblems[sub]?.relation === 'direct');

  return (
    <div className="detail" data-testid="sub-detail">
      <header className="detail__head">
        <div className="detail__title">
          <span className="detail__id">{sub}</span>
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
        <span className="chips" role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <Chip key={s} pressed={statuses.includes(s)} onClick={() => url.set({ status: toggleInList(statuses, s) })}>
              <StatusGlyph status={s} /> {tx.statuses[s].label}
            </Chip>
          ))}
        </span>
        <span className="chips" role="group" aria-label="Relation">
          {RELATIONS.map((r) => (
            <Chip key={r} pressed={relations.includes(r)} onClick={() => url.set({ relation: toggleInList(relations, r) })} title={tx.relations[r].definition}>
              {tx.relations[r].label}
            </Chip>
          ))}
        </span>
      </div>
      {!anyDirect && <EmptyState compact>No work in the database addresses {sub} directly.</EmptyState>}
      {groups.length === 0 ? (
        <EmptyState>No tagged work matches these filters.</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="approach">
            <h3>
              {g.label} <span className="muted">· {g.rows.length}</span>
            </h3>
            <ul className="plain work-list">
              {[...g.rows]
                .sort((a, b) => statusOrder(a.t.status) - statusOrder(b.t.status) || b.p.year - a.p.year)
                .map(({ p, t }) => (
                  <li key={p.id}>
                    <button type="button" className="work-row" data-locate={p.id} data-testid={`work-${p.id}`} onClick={() => url.openPaper(p.id)}>
                      <StatusGlyph status={t.status} />
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
  const tagged = visible.filter((p) => p.subproblems && Object.keys(p.subproblems).length);
  const groups = useMemo(() => {
    const methodPapers = tagged.filter((p) => p.method);
    const out: { id: string; title: string; level: DbPaper['level']; method: boolean; rows: DbPaper[] }[] = buildLanes(methodPapers)
      .filter((l) => l.papers.length)
      .map((l) => ({ id: l.id, title: l.family ? `${l.level} · ${l.title}` : l.title, level: l.level, method: true, rows: l.papers }));
    const others = tagged.filter((p) => !p.method);
    if (others.length) out.push({ id: 'works', title: 'Subproblem works', level: null, method: false, rows: others });
    return out;
  }, [tagged]);
  const stages = Object.keys(tx.stages).map((st) => ({ id: st, subs: SUBS.filter((s) => tx.subproblems[s].stage === st) }));
  const addressed = (s: SubproblemId) => tagged.filter((p) => p.subproblems?.[s]?.status === 'addresses').length;

  if (!tagged.length) return <EmptyState>No tagged work matches these filters.</EmptyState>;
  return (
    <div className="matrix-wrap" data-testid="matrix">
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
                  {s}
                </button>
                <span className="matrix__count">{addressed(s)}</span>
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
                    const t = p.subproblems?.[s];
                    return (
                      <td key={s} className={`matrix__cell${t ? ' is-filled' : ' is-empty'}${g.method ? ' is-method' : ''}`}>
                        <button
                          type="button"
                          className="matrix__btn"
                          data-testid={`cell-${p.id}-${s}`}
                          aria-label={`${p.short_name}, ${s}: ${t ? tx.statuses[t.status].label : 'not tagged'}`}
                          title={t ? `${s}: ${t.note}` : `${s}: not tagged`}
                          onClick={() => url.openPaper(p.id)}
                        >
                          <StatusGlyph status={t?.status} />
                        </button>
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
  const counts = Object.fromEntries(SUBS.map((s) => [s, visible.filter((p) => p.subproblems?.[s]?.status === 'addresses').length]));

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
      <StatusLegend />
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

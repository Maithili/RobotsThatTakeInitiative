import { useMemo, useState, type ReactNode } from 'react';
import { ActionChip, InputChip, LevelChip } from '../../components/Chip.tsx';
import { EmptyState, Missing } from '../../components/EmptyState.tsx';
import { FilterBar } from '../../components/FilterBar.tsx';
import { fixUrl, papers as allPapers, tx } from '../../data.ts';
import { matchesGlobal } from '../../lib/filters.ts';
import type { DbPaper } from '../../schema.ts';
import { useUrl } from '../../state/url.ts';
import { GRAPH_LEVELS, type FamilyInfo } from './constants.ts';
import { buildLanes } from './groups.ts';
import { LiteratureGraph } from './LiteratureGraph.tsx';
import { SYNTHETIC_FAMILIES, syntheticPapers } from './synthetic.ts';
import { TopBand } from './TopBand.tsx';

type SortKey = 'short_name' | 'year' | 'title' | 'inputs' | 'actions' | 'core' | 'subs';

const COLS: { key: SortKey; label: string }[] = [
  { key: 'short_name', label: 'Name' },
  { key: 'year', label: 'Year' },
  { key: 'title', label: 'Title' },
  { key: 'inputs', label: 'Inputs' },
  { key: 'actions', label: 'Action types' },
  { key: 'core', label: 'Core strength' },
  { key: 'subs', label: 'Addressed' },
];

const addressed = (p: DbPaper) => Object.values(p.subproblems ?? {}).filter((t) => t?.status === 'addresses').length;

function sortVal(p: DbPaper, k: SortKey): string | number {
  switch (k) {
    case 'short_name':
      return p.short_name.toLowerCase();
    case 'year':
      return p.year;
    case 'title':
      return p.title.toLowerCase();
    case 'inputs':
      return (p.method?.inputs ?? []).join();
    case 'actions':
      return (p.method?.action_types ?? []).join();
    case 'core':
      return p.method?.core_strength ?? '';
    case 'subs':
      return addressed(p);
  }
}

function MethodsList({ papers, tangential }: { papers: DbPaper[]; tangential: DbPaper[] }) {
  const url = useUrl();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'year', dir: 1 });
  const visible = papers.filter((p) => matchesGlobal(p, url.filters));
  const groups: { id: string; label: ReactNode; papers: DbPaper[] }[] = buildLanes(visible)
    .filter((l) => l.papers.length)
    .map((l) => ({ id: l.id, label: <><LevelChip level={l.level} /> {l.title}</>, papers: l.papers }));
  // Tangential works come last, grouped by tangent type (SPEC §7.2).
  if (url.get('tangents') !== '0') {
    for (const [tid, t] of Object.entries(tx.tangent_types)) {
      const ps = tangential.filter((p) => p.tangent === tid && matchesGlobal(p, url.filters));
      if (ps.length) groups.push({ id: `tangent:${tid}`, label: <><span className="tag">Tangential</span> {t.label}</>, papers: ps });
    }
  }

  if (!groups.length) return <EmptyState>No methods match these filters.</EmptyState>;

  const sorted = (ps: DbPaper[]) =>
    [...ps].sort((a, b) => {
      const va = sortVal(a, sort.key);
      const vb = sortVal(b, sort.key);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || a.short_name.localeCompare(b.short_name);
    });

  return (
    <div className="scroll-x">
      <table className="table methods-table" data-testid="methods-list">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="th-sort" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : 1 }))}>
                  {c.label}
                  <span aria-hidden="true">{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.id} data-testid={`list-group-${g.id}`}>
            <tr className="group-row">
              <th colSpan={COLS.length} scope="colgroup">
                {g.label} <span className="muted">· {g.papers.length}</span>
              </th>
            </tr>
            {sorted(g.papers).map((p) => (
              <tr key={p.id} className="clickable" data-locate={p.id} onClick={() => url.openPaper(p.id)}>
                <td>
                  <button
                    type="button"
                    className="linkish strong"
                    onClick={(e) => {
                      e.stopPropagation();
                      url.openPaper(p.id);
                    }}
                  >
                    {p.short_name}
                  </button>
                </td>
                <td className="num">{p.year}</td>
                <td className="title-cell">{p.title}</td>
                <td>{(p.method?.inputs ?? []).map((i) => <InputChip key={i} id={i} />)}</td>
                <td>{(p.method?.action_types ?? []).map((a) => <ActionChip key={a} type={a} />)}</td>
                <td className="core-cell">{p.method ? p.method.core_strength ?? <Missing href={fixUrl(p, 'method.core_strength')} /> : <span className="muted">—</span>}</td>
                <td className="num">{addressed(p)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function MethodsPage() {
  const url = useUrl();
  const synthetic = url.get('synthetic') === '1';
  const papers = useMemo(() => (synthetic ? syntheticPapers() : allPapers), [synthetic]);
  const families: Record<string, FamilyInfo> = synthetic ? SYNTHETIC_FAMILIES : tx.families;
  // Classified, non-tangential works fill the timeline and the graph core (SPEC §7).
  const methods = useMemo(() => papers.filter((p) => p.method && p.level && !p.tangent), [papers]);
  const tangential = useMemo(() => papers.filter((p) => p.tangent), [papers]);
  const graphPapers = useMemo(() => [...methods, ...tangential], [methods, tangential]);
  const clusters = useMemo(
    () => Object.keys(families).filter((fam) => methods.some((p) => p.level && GRAPH_LEVELS.includes(p.level) && p.method?.family === fam)),
    [families, methods],
  );
  const [hoverId, setHover] = useState<string | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const view = url.get('view') === 'list' || (url.get('view') !== 'graph' && narrow) ? 'list' : 'graph';
  const yearSpan = useMemo<[number, number]>(() => {
    const ys = methods.map((p) => p.year);
    return [Math.min(...ys), Math.max(...ys)];
  }, [methods]);

  return (
    <div className="page page--wide">
      <div className="page__intro">
        <h1>Methods</h1>
        <p className="lede">
          Proactive methods by level of proactivity: what the robot knows about the goal g and the human policy π<sup>h</sup>.
        </p>
      </div>

      <TopBand papers={methods} clusters={clusters} families={families} hoverId={hoverId} setHover={setHover} />

      <FilterBar
        controls={['family', 'action', 'input', 'theme']}
        years={yearSpan}
        extra={
          <span className="filterbar__extra">
            <span className="seg seg--sm" role="group" aria-label="View">
              <button type="button" className={view === 'graph' ? 'seg__btn is-on' : 'seg__btn'} aria-pressed={view === 'graph'} onClick={() => url.set({ view: 'graph' })}>
                Graph
              </button>
              <button type="button" className={view === 'list' ? 'seg__btn is-on' : 'seg__btn'} aria-pressed={view === 'list'} onClick={() => url.set({ view: 'list' })}>
                List
              </button>
            </span>
          </span>
        }
      />

      {synthetic && <p className="notice small">Showing synthetic papers (layout test fixture), not real data.</p>}

      {view === 'graph' ? (
        <LiteratureGraph papers={graphPapers} families={families} hoverId={hoverId} setHover={setHover} />
      ) : (
        <MethodsList papers={methods} tangential={tangential} />
      )}
    </div>
  );
}

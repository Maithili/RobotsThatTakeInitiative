import { tx } from '../data.ts';

type Status = 'addresses' | 'assumes' | 'skips';

/** Status shapes, drawn so all three have the same size whatever font the reader has: a filled disc for addresses, a
 *  ring with a center dot (⊙) for assumes given, and an empty ring for skips. "Assumes given" is not a half moon,
 *  since the Subproblems page uses the half moon for the adjacent relation. */
function StatusShape({ status }: { status: Status }) {
  return (
    <svg className="moon" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4.2" fill={status === 'addresses' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" />
      {status === 'assumes' && <circle cx="5" cy="5" r="1.7" fill="currentColor" />}
    </svg>
  );
}

export function StatusGlyph({ status, className }: { status: Status | null | undefined; className?: string }) {
  if (!status) return <span className={['glyph', 'glyph--empty', className].filter(Boolean).join(' ')} aria-label="Not tagged" />;
  const s = tx.statuses[status];
  return (
    <span className={['glyph', `glyph--${status}`, className].filter(Boolean).join(' ')} role="img" aria-label={s.label} title={s.label} data-status={status}>
      <StatusShape status={status} />
    </span>
  );
}

/** The key to the status glyphs, for every view that shows them (SPEC §11): the drawer strip and the compare view. */
export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul className={['legend', className].filter(Boolean).join(' ')} aria-label="Status legend">
      {(Object.keys(tx.statuses) as Status[]).map((k) => (
        <li key={k}>
          <span className={`glyph glyph--${k}`} aria-hidden="true">
            <StatusShape status={k} />
          </span>{' '}
          {tx.statuses[k].label}
        </li>
      ))}
      <li className="muted">Blank: not tagged</li>
    </ul>
  );
}

export type Relation = 'direct' | 'adjacent';

/** A full moon (●) or a left half moon (◐), drawn so both have the same size whatever font the reader has. */
function Moon({ half }: { half: boolean }) {
  return (
    <svg className="moon" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4.2" fill={half ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.3" />
      {half && <path d="M5,0.8 A4.2,4.2 0 0 0 5,9.2 Z" fill="currentColor" />}
    </svg>
  );
}

/** Direct as a full moon, adjacent as a half moon (SPEC §9.2). `decorative` hides it from assistive tech when a text
 *  label sits next to it. */
export function RelationGlyph({ relation, decorative }: { relation: Relation; decorative?: boolean }) {
  const r = tx.relations[relation];
  const label = `${r.label}: ${r.definition}`;
  const cls = `glyph glyph--rel-${relation}`;
  const moon = <Moon half={relation === 'adjacent'} />;
  if (decorative)
    return (
      <span className={cls} aria-hidden="true">
        {moon}
      </span>
    );
  return (
    <span className={cls} role="img" aria-label={label} title={label} data-relation={relation}>
      {moon}
    </span>
  );
}

const CAPTURE_GLYPH = { yes: '●', partial: '◐', no: '○' } as const;

export function CaptureGlyph({ value, label }: { value: 'yes' | 'partial' | 'no' | null | undefined; label: string }) {
  if (!value) return <span className="muted" aria-label={`${label}: not recorded`}>—</span>;
  return (
    <span className={`glyph glyph--cap-${value}`} role="img" aria-label={`${label}: ${value}`} title={`${label}: ${value}`}>
      {CAPTURE_GLYPH[value]}
    </span>
  );
}

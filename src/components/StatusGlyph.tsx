import { tx } from '../data.ts';

type Status = 'addresses' | 'assumes' | 'skips';

export function StatusGlyph({ status, className }: { status: Status | null | undefined; className?: string }) {
  if (!status) return <span className={['glyph', 'glyph--empty', className].filter(Boolean).join(' ')} aria-label="Not tagged" />;
  const s = tx.statuses[status];
  return (
    <span className={['glyph', `glyph--${status}`, className].filter(Boolean).join(' ')} role="img" aria-label={s.label} title={s.label}>
      {s.glyph}
    </span>
  );
}

export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul className={['legend', className].filter(Boolean).join(' ')} aria-label="Status legend">
      {(Object.keys(tx.statuses) as Status[]).map((k) => (
        <li key={k}>
          <StatusGlyph status={k} /> {tx.statuses[k].label}
        </li>
      ))}
      <li>
        <span className="glyph glyph--empty glyph--box" aria-hidden="true" /> Not tagged
      </li>
    </ul>
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

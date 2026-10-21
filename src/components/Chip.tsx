import type { ReactNode } from 'react';
import { tx } from '../data.ts';
import type { LevelId } from '../schema.ts';

export function Chip({
  children,
  onRemove,
  onClick,
  pressed,
  className,
  title,
  removeLabel,
}: {
  children: ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  pressed?: boolean;
  className?: string;
  title?: string;
  removeLabel?: string;
}) {
  const cls = ['chip', pressed && 'chip--on', className].filter(Boolean).join(' ');
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={pressed} title={title}>
        {children}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {children}
      {onRemove && (
        <button type="button" className="chip__x" onClick={onRemove} aria-label={removeLabel ?? 'Remove'}>
          ×
        </button>
      )}
    </span>
  );
}

export function LevelChip({ level }: { level: LevelId | null }) {
  if (!level) return <span className="level-chip level-chip--none" title="No level">—</span>;
  return (
    <span className={`level-chip level-chip--${level}`} title={tx.levels[level].name}>
      {level}
    </span>
  );
}

export function KnownsChips({ knowns }: { knowns: { goal: string; human_policy: string } | null | undefined }) {
  if (!knowns) return <span className="muted">—</span>;
  return (
    <span className="knowns">
      <span className={`known known--${knowns.goal}`}>g {knowns.goal}</span>
      <span className="knowns__dot" aria-hidden="true">·</span>
      <span className={`known known--${knowns.human_policy}`}>
        π<sup>h</sup> {knowns.human_policy}
      </span>
    </span>
  );
}

const ACTION_ICON: Record<string, string> = { act: '▸', timing: '◷', initiate: '✦', inform: 'i', ask: '?' };

export function ActionIcon({ type }: { type: string }) {
  const a = tx.action_types[type];
  return (
    <span className={`action-icon action-icon--${type}`} role="img" aria-label={a?.label ?? type} title={a ? `${a.label}: ${a.definition}` : type}>
      {ACTION_ICON[type] ?? '•'}
    </span>
  );
}

export function ActionChip({ type }: { type: string }) {
  const a = tx.action_types[type];
  return (
    <span className="chip chip--action" title={a?.definition}>
      <ActionIcon type={type} /> {a?.label ?? type}
    </span>
  );
}

export function InputChip({ id }: { id: string }) {
  const m = tx.observation_modalities[id];
  return (
    <span className="chip chip--input" title={m?.definition}>
      {m?.label ?? id}
    </span>
  );
}

export function TermDot({ term }: { term: string }) {
  const t = tx.net_value.terms[term];
  return <span className={`term-dot term-dot--${term}`} role="img" aria-label={t?.label ?? term} title={t?.label} />;
}

export function MetricChip({ id, onHover }: { id: string; onHover?: (id: string | null) => void }) {
  const m = tx.metrics[id];
  return (
    <span
      className="chip chip--metric"
      title={m ? `${m.definition} (${m.kind})` : id}
      tabIndex={onHover ? 0 : undefined}
      onMouseEnter={onHover && (() => onHover(id))}
      onMouseLeave={onHover && (() => onHover(null))}
      onFocus={onHover && (() => onHover(id))}
      onBlur={onHover && (() => onHover(null))}
    >
      {(m?.terms ?? []).map((t) => (
        <TermDot key={t} term={t} />
      ))}
      {m?.label ?? id}
    </span>
  );
}

export function LoopPill({ loop }: { loop: string | null }) {
  if (!loop) return <span className="muted small">Loop type not recorded</span>;
  const l = tx.loop_types[loop];
  const idx = Object.keys(tx.loop_types).indexOf(loop);
  return (
    <span className={`loop-pill loop-pill--${idx}`} title={l?.definition}>
      {l?.label ?? loop}
    </span>
  );
}

import type { ReactNode } from 'react';
import { issueUrl } from '../data.ts';

export function EmptyState({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? 'empty empty--compact' : 'empty'}>
      <span>{children}</span>{' '}
      <a href={issueUrl('add-paper.yml')} target="_blank" rel="noreferrer">
        Suggest a paper ↗
      </a>
    </div>
  );
}

/** "—" for an empty field, with a link to suggest a value. */
export function Missing({ href }: { href: string }) {
  return (
    <span className="missing">
      —{' '}
      <a href={href} target="_blank" rel="noreferrer" className="missing__link">
        suggest
      </a>
    </span>
  );
}

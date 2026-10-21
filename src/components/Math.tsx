import katex from 'katex';
import { useMemo } from 'react';

/** Inline (or display) KaTeX. Falls back to the raw TeX if it fails to parse. */
export function Math({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (html === null) return <code className={className}>{tex}</code>;
  return <span className={['math', className].filter(Boolean).join(' ')} dangerouslySetInnerHTML={{ __html: html }} />;
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { issueUrl, REPO, RTI_URL } from '../data.ts';
import { Search } from './Search.tsx';

type Theme = 'light' | 'dark' | null;

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('rti-theme');
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const el = document.documentElement;
    if (theme) el.dataset.theme = theme;
    else delete el.dataset.theme;
    try {
      if (theme) localStorage.setItem('rti-theme', theme);
      else localStorage.removeItem('rti-theme');
    } catch {
      /* storage unavailable: theme lasts for this visit */
    }
  }, [theme]);
  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const effective = theme ?? (systemDark ? 'dark' : 'light');
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(effective === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to ${effective === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${effective === 'dark' ? 'light' : 'dark'} theme`}
    >
      {effective === 'dark' ? '☀' : '☾'}
    </button>
  );
}

function Contribute() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div className="popover-wrap" ref={ref}>
      <button type="button" className="btn btn--primary btn--sm" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        Contribute
      </button>
      {open && (
        <div className="popover" role="menu">
          <a role="menuitem" href={issueUrl('add-paper.yml')} target="_blank" rel="noreferrer">
            <strong>Suggest a paper ↗</strong>
            <span>Open a short GitHub form</span>
          </a>
          <a role="menuitem" href={`${REPO}/tree/main/data/papers`} target="_blank" rel="noreferrer">
            <strong>Edit data on GitHub ↗</strong>
            <span>One YAML file per paper</span>
          </a>
          <a role="menuitem" href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
            <strong>Read the guide ↗</strong>
            <span>Fields, rules, and validation</span>
          </a>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { path: '/methods', label: 'Methods' },
  { path: '/evaluations', label: 'Evaluations' },
  { path: '/subproblems', label: 'Subproblems' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { search } = useLocation();
  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => {
        e.preventDefault();
        document.getElementById('main')?.focus();
      }}>
        Skip to content
      </a>
      <header className="header">
        <div className="header__inner">
          <Link to={{ pathname: '/methods', search }} className="brand" aria-label="Robots That Take Initiative: Methods">
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__name">
              Robots That Take Initiative<span className="brand__sub"> · literature map</span>
            </span>
          </Link>
          <nav className="tabs" aria-label="Pages">
            {TABS.map((t) => (
              <NavLink key={t.path} to={{ pathname: t.path, search }} className={({ isActive }) => (isActive ? 'tab is-active' : 'tab')}>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="header__tools">
            <Search />
            <Contribute />
            <a className="header__paper" href={RTI_URL} target="_blank" rel="noreferrer">
              Paper ↗
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="main">
        {children}
      </main>
    </>
  );
}

import { Link, useLocation } from 'wouter';
import { ArrowUpRight, ChevronRight, LockKeyhole, Swords } from 'lucide-react';
import type { ReactNode } from 'react';

const navItems = [
  { href: '/', label: 'Chronicle' },
  { href: '/leaderboard', label: 'Rankings' },
  { href: '/players', label: 'Players' },
  { href: '/matches', label: 'Match archive' },
];

export function WargamesShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-4 lg:px-10">
          <Link href="/" data-testid="link-brand" className="group flex items-center gap-3">
            <span className="grid size-9 place-items-center bg-primary text-primary-foreground transition-transform duration-200 group-hover:rotate-12">
              <Swords size={18} strokeWidth={2.3} />
            </span>
            <span className="leading-none">
              <span className="block font-display text-[15px] font-extrabold uppercase tracking-[0.16em]">Throne</span>
              <span className="block font-mono text-[9px] tracking-[0.26em] text-muted-foreground">/ WARGAMES</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                className={`relative py-2 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors hover:text-primary ${location === item.href ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {item.label}
                {location === item.href ? <span className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-primary" /> : null}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/apply" data-testid="link-apply-top" className="hidden items-center gap-2 border border-primary/50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:flex">
              Enter your six
              <ArrowUpRight size={14} />
            </Link>
            <Link href="/admin" data-testid="link-admin-top" className="grid size-9 place-items-center border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary" aria-label="Operations access">
              <LockKeyhole size={15} />
            </Link>
          </div>
        </div>
        <div className="flex gap-5 overflow-x-auto border-t border-border/50 px-5 py-2 md:hidden">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} data-testid={`link-mobile-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.15em] ${location === item.href ? 'text-primary' : 'text-muted-foreground'}`}>
              {item.label}
            </Link>
          ))}
          <Link href="/apply" data-testid="link-mobile-apply" className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Apply roster</Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-8 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <p className="font-mono uppercase tracking-[0.12em]">The record is the arena.</p>
          <div className="flex items-center gap-5">
            <Link href="/apply" data-testid="link-footer-apply" className="font-bold uppercase tracking-[0.12em] transition-colors hover:text-primary">Submit roster</Link>
            <Link href="/admin" data-testid="link-footer-admin" className="font-bold uppercase tracking-[0.12em] transition-colors hover:text-primary">Operator access</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function SectionLabel({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div className={`signal-line pl-11 font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${light ? 'text-primary' : 'text-primary'}`}>
      {children}
    </div>
  );
}

export function PageIntro({ eyebrow, title, detail, action }: { eyebrow: string; title: ReactNode; detail: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-10 pt-14 lg:px-10 lg:pb-14 lg:pt-20">
      <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div className="reveal max-w-3xl">
          <SectionLabel>{eyebrow}</SectionLabel>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-[0.94] tracking-[-0.055em] text-foreground sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">{detail}</p>
        </div>
        {action ? <div className="reveal reveal-delay-1 shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function MetricCard({ label, value, detail, accent = false }: { label: string; value: string | number; detail?: string; accent?: boolean }) {
  return (
    <div className={`data-card p-5 ${accent ? 'border-primary/50 bg-primary/8' : ''}`}>
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-muted-foreground">{label}</div>
      <div className={`mt-4 font-display text-3xl font-extrabold tracking-[-0.05em] ${accent ? 'text-primary' : 'text-foreground'}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>
      {detail ? <div className="mt-2 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" data-testid="loading-skeleton">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse bg-muted/60" />
      ))}
    </div>
  );
}

export function ErrorState({ message = 'The archive did not answer.' }: { message?: string }) {
  return (
    <div className="border border-destructive/35 bg-destructive/5 p-6" data-testid="status-error">
      <div className="font-display text-lg font-bold">Signal interrupted.</div>
      <p className="mt-2 text-sm text-muted-foreground">{message} Refresh when the record keeper is back online.</p>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-dashed border-border bg-card/50 px-6 py-12 text-center" data-testid="status-empty">
      <div className="mx-auto mb-4 grid size-10 place-items-center border border-primary/40 text-primary"><ChevronRight size={17} /></div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function formatWeapon(weapon: string) {
  return weapon.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
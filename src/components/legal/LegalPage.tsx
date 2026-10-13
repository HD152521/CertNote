import type { ReactNode } from 'react';

// 소개·문의·이용약관 공용 레이아웃. /privacy 와 같은 타이포를 쓴다.
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {updated && <p className="text-sm text-fg-muted">최종 업데이트: {updated}</p>}
      </header>
      {children}
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

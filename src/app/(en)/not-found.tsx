import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
  // robots는 선언하지 않는다 — (ko)/not-found.tsx 와 같은 이유(Next.js 가 404 에 noindex 를 자동 주입).
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-fg">Page not found</h1>
      <p className="text-sm text-fg-muted">The page you requested does not exist or has moved.</p>
      <div className="flex gap-2">
        <Link href="/en" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90">
          Home
        </Link>
      </div>
    </div>
  );
}

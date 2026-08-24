import { cn } from '@/lib/cn';

interface BulletListProps {
  items: string[];
  className?: string;
}

// 강조 점(accent dot) 불릿 목록.
// 시험 정보 카드의 '혜택 & 꿀팁'과 자격증 허브의 '트랙 구성'이 같은 마크업을 쓰고 있어
// 한 곳으로 모은다. 프레젠테이션 전용이라 'use client' 없이 서버 컴포넌트로 렌더된다.
export default function BulletList({ items, className }: BulletListProps) {
  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-fg-muted">
          <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

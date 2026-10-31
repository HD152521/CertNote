'use client';

import type { SimState } from '@/lib/cli-lab/state';

// 계정에 실제로 생긴 리소스를 보여 주는 띠. 명령이 상태를 바꾸면 해당 항목이 잠깐 빛난다 —
// "저장된 답을 돌려주는 게 아니라 계정이 바뀐다"는 걸 눈으로 확인하게 하는 장치.

interface Item {
  key: string;
  signature: string;
  label: string;
  meta: string[];
}

function items(state: SimState): Item[] {
  const buckets = state.buckets.map((b) => {
    const meta = [b.region, `객체 ${b.objects.length}`];
    if (b.versioning) meta.push(b.versioning === 'Enabled' ? '버전 관리 켜짐' : '버전 관리 중지');
    if (b.hiddenVersions) meta.push(`이전 버전 ${b.hiddenVersions}`);
    return { key: `s3:${b.name}`, signature: meta.join('|'), label: `s3://${b.name}`, meta };
  });
  const users = state.users.map((u) => {
    const policies = u.policyArns.map((a) => a.split('/').pop() ?? a);
    const meta = policies.length ? policies : ['정책 없음'];
    return { key: `iam:${u.userName}`, signature: meta.join('|'), label: `iam/${u.userName}`, meta };
  });
  return [...buckets, ...users];
}

export function AccountStrip({ state }: { state: SimState }) {
  const list = items(state);
  return (
    <div className="border-t border-border bg-bg-subtle px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">계정 리소스</span>
        <span className="text-[11px] text-fg-faint">계정 번호·ID·시각은 예시 값 · {list.length}개</span>
      </div>
      {list.length === 0 ? (
        <div className="text-[13px] text-fg-faint">아직 만든 리소스가 없어요. 명령으로 무언가를 만들면 여기에 나타나요.</div>
      ) : (
        <div role="list" className="flex flex-wrap gap-2">
          {list.map((item) => (
            <div
              role="listitem"
              key={`${item.key}:${item.signature}`}
              className="cli-flash flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border-strong bg-bg px-2.5 py-1.5 text-[12.5px]"
            >
              <span className="min-w-0 break-all font-mono text-fg">{item.label}</span>
              <span className="text-fg-muted">{item.meta.join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

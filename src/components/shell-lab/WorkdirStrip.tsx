'use client';

import { node, resolve } from '@/lib/shell-lab/fs';
import { modeString } from '@/lib/shell-lab/mode';
import { groupName, groupsOf, userName } from '@/lib/shell-lab/state';
import type { ShellState } from '@/lib/shell-lab/types';

// 지켜보는 디렉터리의 항목과 일반 사용자 계정을 보여 주는 띠. 명령이 상태를 바꾸면 그 항목이 잠깐 빛난다 —
// 저장된 답을 돌려주는 게 아니라 파일 시스템이 실제로 바뀐다는 걸 눈으로 확인하게 하는 장치(AWS 연습장의 계정 리소스 띠와 같다).

interface Item {
  key: string;
  signature: string;
  label: string;
  meta: string[];
}

function entries(st: ShellState, path: string): Item[] {
  let dir;
  try {
    dir = node(st, resolve(st, path, true).ino);
  } catch {
    return [];
  }
  if (dir.type !== 'dir') return [];
  return Object.keys(dir.entries!)
    .sort()
    .map((name) => {
      const n = node(st, dir.entries![name]);
      const meta = [modeString(n), `${userName(st, n.uid)}:${groupName(st, n.gid)}`, `inode ${n.ino}`, `링크 ${n.nlink}`];
      if (n.type === 'link') meta.push(`→ ${n.target}`);
      return { key: `f:${name}`, signature: meta.join('|'), label: n.type === 'dir' ? `${name}/` : name, meta };
    });
}

function people(st: ShellState): Item[] {
  return st.accounts
    .filter((a) => a.uid >= 1000 && a.uid < 60000)
    .map((a) => {
      const meta = [`uid ${a.uid}`, `그룹 ${groupsOf(st, a).map((g) => groupName(st, g)).join(',')}`];
      return { key: `u:${a.name}`, signature: meta.join('|'), label: `사용자 ${a.name}`, meta };
    });
}

export function WorkdirStrip({ state, watch }: { state: ShellState; watch: string }) {
  const list = [...entries(state, watch), ...people(state)];
  return (
    <div className="border-t border-border bg-bg-subtle px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">{watch}</span>
        <span className="text-[11px] text-fg-faint">시각·inode 번호는 예시 값 · {list.length}개</span>
      </div>
      {list.length === 0 ? (
        <div className="text-[13px] text-fg-faint">비어 있어요. 명령으로 무언가를 만들면 여기에 나타나요.</div>
      ) : (
        <div role="list" className="flex flex-wrap gap-2">
          {list.map((item) => (
            <div
              role="listitem"
              key={`${item.key}:${item.signature}`}
              className="cli-flash flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border-strong bg-bg px-2.5 py-1.5 text-[12.5px]"
            >
              <span className="min-w-0 break-all font-mono text-fg">{item.label}</span>
              <span className="font-mono text-[11.5px] text-fg-muted">{item.meta.join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

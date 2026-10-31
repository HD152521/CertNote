import type { Metadata } from 'next';
import { CliLab } from '@/components/cli-lab/CliLab';
import { ShellLab } from '@/components/shell-lab/ShellLab';
import { LABS } from '@/lib/cli-lab/labs';
import { SHELL_LABS } from '@/lib/shell-lab/labs';

// 터미널 연습장 미리보기. 노트에 넣기 전 확인용이라 검색에 노출하지 않는다.
// 본문을 .article 로 감싸 실제 노트 안에 들어갔을 때와 같은 CSS 환경에서 보이게 한다.
export const metadata: Metadata = {
  title: '터미널 연습장 미리보기',
  robots: { index: false, follow: false },
};

export default function LabPreviewPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-0">
      <article className="article">
        <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-fg-muted">미리보기 · 노트에 넣기 전</div>
        <h1>터미널 연습장</h1>
        <h2 id="linux">리눅스 셸 연습장</h2>
        <p>
          리눅스마스터 2급 범위(파일 시스템 명령어, 권한 및 그룹 설정, 사용자 관리)를 직접 쳐 보는 연습장입니다. 시험 실기
          환경과 같은 Rocky Linux 8.8 을 기준으로, 출력과 오류 문구는 실제 Rocky 8.8 에서 찍은 결과와 하나하나 비교해
          맞췄습니다. 명령을 치면 가상 파일 시스템과 계정이 실제로 바뀌고, 아래 띠에서 그 변화가 보입니다.
        </p>
        {SHELL_LABS.map((lab) => (
          <ShellLab key={lab.id} labId={lab.id} />
        ))}
        <h2 id="aws">AWS CLI 연습장</h2>
        <p>
          노트의 &ldquo;CLI로 직접 찍어보기&rdquo; 소제목 자리에 들어갈 연습장입니다. 명령을 치면 가상 계정의 상태가 실제로
          바뀌고, 오류도 AWS CLI v2 가 내는 문구 그대로 나옵니다. 아래 세 과제는 SAA-C03 1주차와 3주차 내용을 바탕으로
          만들었습니다.
        </p>
        {LABS.map((lab) => (
          <CliLab key={lab.id} labId={lab.id} />
        ))}
      </article>
    </div>
  );
}

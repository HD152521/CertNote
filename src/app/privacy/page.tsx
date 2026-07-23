import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

const TITLE = '개인정보처리방침';
const DESCRIPTION = `${SITE_NAME}가 수집하는 개인정보 항목과 이용 목적, 보관 기간, 이용자 권리를 안내합니다.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/privacy' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/privacy', type: 'website' },
};

// 개인정보처리방침(MVP 버전). 회원가입 동의 문구에서 링크된다.
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">개인정보처리방침</h1>
        <p className="text-sm text-fg-muted">최종 업데이트: 2026-06-25</p>
      </header>

      <p className="text-sm text-fg-muted">
        CertNote(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 중요하게 생각하며, 아래와 같이 수집·이용합니다. 본 방침은
        서비스 개선을 위한 베타 테스트 단계 기준이며, 정식 출시 시 갱신될 수 있습니다.
      </p>

      <Section title="1. 수집하는 항목">
        <ul className="list-disc space-y-1 pl-5">
          <li>필수: 이메일, 비밀번호(암호화 저장), 이름, 생년월일, 목표 자격증</li>
          <li>선택: 직업, 학습 목적, 현재 수준/경력</li>
          <li>자동 수집: 학습 기록(진도·정답·복습), 접속 로그, 알림 구독 정보</li>
          <li>이용 행태: 페이지 방문·클릭·체류 등 사용 통계(제품 분석 도구 PostHog를 통해 수집)</li>
        </ul>
      </Section>

      <Section title="2. 이용 목적">
        <ul className="list-disc space-y-1 pl-5">
          <li>회원 식별 및 로그인·계정 관리</li>
          <li>학습 진도·복습·통계 등 서비스 기능 제공</li>
          <li>학습 알림 발송(동의한 경우)</li>
          <li>이용 행태 분석을 통한 콘텐츠·서비스 개선(PostHog 등 분석 도구 활용)</li>
        </ul>
      </Section>

      <Section title="3. 보유 및 이용 기간">
        <p>회원 탈퇴 시 지체 없이 파기합니다. 관계 법령에 따라 별도 보관이 필요한 경우 해당 기간 동안만 보관합니다.</p>
      </Section>

      <Section title="4. 제3자 제공 및 처리 위탁">
        <p>
          이용자의 개인정보를 외부에 판매하거나 제공하지 않습니다. 서비스 운영에 필요한 범위에서 인프라·메일·결제 등
          처리 위탁이 발생할 수 있으며, 이 경우 수탁자에게 안전조치를 요구합니다.
        </p>
      </Section>

      <Section title="5. 이용자의 권리">
        <p>
          이용자는 언제든 본인의 개인정보를 조회·수정하거나(마이페이지), 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.
        </p>
      </Section>

      <Section title="6. 문의">
        <p>
          개인정보 관련 문의: <a href="mailto:wkdrndydtlr@gmail.com" className="underline underline-offset-4">wkdrndydtlr@gmail.com</a>
        </p>
      </Section>

      <p className="pt-4 text-sm">
        <Link href="/signup" className="text-fg underline underline-offset-4">← 회원가입으로 돌아가기</Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="text-sm text-fg-muted">{children}</div>
    </section>
  );
}

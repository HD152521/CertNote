import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL, OPERATOR_NAME, SITE_NAME } from '@/lib/site';

const TITLE = '이용약관';
const DESCRIPTION = `${SITE_NAME} 서비스 이용 조건, 회원 계정, 콘텐츠 저작권, 책임의 한계를 안내합니다.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/terms' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/terms', type: 'website' },
};

export default function TermsPage() {
  return (
    <LegalPage title="이용약관" updated="2026-10-13">
      <LegalSection title="1. 목적">
        <p>
          이 약관은 {OPERATOR_NAME}(이하 “운영자”)가 제공하는 {SITE_NAME}(이하 “서비스”)의 이용 조건과 운영자·이용자의
          권리와 의무를 정합니다.
        </p>
      </LegalSection>

      <LegalSection title="2. 서비스 내용">
        <p>
          서비스는 자격증 학습 노트, 연습 문제, 모의고사, 오답 복습, 학습 기록, AI 오답 설명을 제공합니다. 학습 노트는
          회원가입 없이 열람할 수 있고, 그 밖의 기능은 회원가입 후 이용할 수 있습니다. 서비스는 현재 무료로 제공됩니다.
        </p>
        <p>
          운영자는 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 이용자에게 불리한 중요한 변경은 서비스 화면을
          통해 미리 알립니다.
        </p>
      </LegalSection>

      <LegalSection title="3. 회원 계정">
        <ul className="list-disc space-y-1 pl-5">
          <li>이용자는 정확한 정보로 가입해야 하며, 계정과 비밀번호를 스스로 관리할 책임이 있습니다.</li>
          <li>이용자는 마이페이지에서 언제든 탈퇴할 수 있고, 탈퇴 시 계정 정보와 학습 기록은 삭제됩니다.</li>
          <li>운영자는 이 약관을 위반한 계정의 이용을 제한하거나 삭제할 수 있습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. AI 오답 설명">
        <p>
          AI 오답 설명은 인공지능이 생성한 참고용 답변이며 오류가 있을 수 있습니다. 계정당 하루 이용 횟수에 제한이
          있고, 운영 사정에 따라 횟수와 제공 여부가 바뀔 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 금지 행위">
        <ul className="list-disc space-y-1 pl-5">
          <li>자동화 수단으로 콘텐츠를 대량 수집하거나 서비스에 과도한 부하를 주는 행위</li>
          <li>이용 제한을 피하려고 여러 계정을 만들거나 타인의 계정을 사용하는 행위</li>
          <li>콘텐츠를 운영자의 허락 없이 복제·배포·판매하는 행위</li>
          <li>후기 등 게시 공간에 허위 사실, 광고, 타인의 권리를 침해하는 내용을 올리는 행위</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. 저작권">
        <p>
          서비스의 학습 노트, 문제, 해설, 도해의 저작권은 운영자에게 있습니다. 개인 학습 목적의 열람과 출처를 밝힌
          일부 인용은 허용됩니다. 이용자가 올린 후기의 저작권은 작성자에게 있으며, 운영자는 서비스 안에서 이를 게시할
          수 있습니다.
        </p>
        <p>
          AWS 및 각 서비스 이름은 Amazon.com, Inc. 또는 그 계열사의 상표이고, 그 밖의 상표는 각 소유자에게 있습니다.
          서비스는 시험 주관 기관과 제휴하거나 승인을 받은 것이 아닙니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 광고">
        <p>
          서비스에는 제3자가 제공하는 광고가 게재될 수 있습니다. 광고 내용과 광고주와의 거래에 대한 책임은 해당
          광고주에게 있습니다. 광고와 관련한 정보 처리는{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-fg">개인정보처리방침</Link>을 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 책임의 한계">
        <p>
          서비스의 콘텐츠는 학습을 돕기 위한 자료이며 시험 합격을 보장하지 않습니다. 시험 범위와 응시 정보는 주관
          기관의 공식 안내가 우선합니다. 운영자는 고의 또는 중대한 과실이 없는 한 콘텐츠의 오류나 서비스 중단으로
          생긴 손해에 대해 책임을 지지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 약관의 변경과 준거법">
        <p>
          운영자는 약관을 변경할 수 있고, 변경 시 적용일과 내용을 서비스 화면에 알립니다. 이 약관은 대한민국 법률에
          따라 해석됩니다.
        </p>
      </LegalSection>

      <LegalSection title="10. 문의">
        <p>
          약관에 관한 문의:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-fg">{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}

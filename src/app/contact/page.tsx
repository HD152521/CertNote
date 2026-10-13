import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL, OPERATOR_NAME, SITE_NAME } from '@/lib/site';

const TITLE = '문의';
const DESCRIPTION = `${SITE_NAME} 이용 문의, 콘텐츠 오류 제보, 개인정보·저작권 관련 요청을 보내는 방법을 안내합니다.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/contact' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/contact', type: 'website' },
};

export default function ContactPage() {
  return (
    <LegalPage title="문의">
      <LegalSection title="연락처">
        <p>
          운영: {OPERATOR_NAME}
          <br />
          이메일:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-fg">{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>

      <LegalSection title="이런 내용을 보내 주세요">
        <ul className="list-disc space-y-1 pl-5">
          <li>노트·문제·해설의 오류 제보(어느 자격증의 몇 주차 며칠인지 함께 적어 주세요)</li>
          <li>계정·로그인·학습 기록 관련 문의</li>
          <li>개인정보 열람·정정·삭제 요청</li>
          <li>저작권 관련 문의와 게시 중단 요청</li>
          <li>제휴·광고 문의</li>
        </ul>
        <p>화면 오른쪽 아래의 피드백 버튼으로도 의견을 남길 수 있습니다.</p>
      </LegalSection>
    </LegalPage>
  );
}

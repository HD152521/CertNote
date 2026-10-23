import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { NonAffiliationNotice } from '@/components/legal/NonAffiliationNotice';
import { CONTACT_EMAIL, OPERATOR_NAME, SITE_NAME } from '@/lib/site';

const TITLE = '소개';
const DESCRIPTION = `${SITE_NAME}는 ${OPERATOR_NAME}가 운영하는 AWS·리눅스 자격증 한국어 학습 노트입니다. 무엇을 제공하고 누가 운영하는지 안내합니다.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/about', type: 'website' },
};

export default function AboutPage() {
  return (
    <LegalPage title={`${SITE_NAME} 소개`}>
      <LegalSection title="무엇을 하는 곳인가요">
        <p>
          {SITE_NAME}는 AWS 자격증과 리눅스마스터 시험을 한국어로 준비하는 사람을 위한 학습 노트입니다. 시험 범위를
          주차와 일차로 나눠, 하루에 노트 한 편을 읽고 그 자리에서 연습 문제를 풀도록 구성했습니다.
        </p>
        <p>
          모든 노트는 로그인 없이 무료로 읽을 수 있습니다. 실전 모의고사, 오답 복습, 학습 기록, AI 오답 설명은 무료
          회원가입 후 이용할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제공하는 것">
        <ul className="list-disc space-y-1 pl-5">
          <li>자격증별 주차 커리큘럼과 일일 학습 노트</li>
          <li>노트마다 붙어 있는 연습 문제와 해설</li>
          <li>공식 시험 가이드의 출제 영역을 기준으로 직접 만든 모의고사</li>
          <li>틀린 문제를 간격을 두고 다시 내는 오답 복습</li>
          <li>
            직무별 준비 순서를 정리한 <Link href="/roadmap" className="underline underline-offset-4 hover:text-fg">자격증 로드맵</Link>
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="어떻게 만드나요">
        <p>
          범위를 정하는 기준, 노트와 문제를 만드는 방식, 검수와 오류 제보 처리 과정은{' '}
          <Link href="/about/how-we-make" className="underline underline-offset-4 hover:text-fg">제작 방식</Link>
          에 정리했습니다. 제보와 검수로 고친 오류는{' '}
          <Link href="/changelog" className="underline underline-offset-4 hover:text-fg">수정 기록</Link>에 공개합니다.
        </p>
      </LegalSection>

      <LegalSection title="운영 주체">
        <p>
          {SITE_NAME}는 {OPERATOR_NAME}가 운영합니다. 문의와 오류 제보는{' '}
          <Link href="/contact" className="underline underline-offset-4 hover:text-fg">문의 페이지</Link>로 보내 주세요.
        </p>
      </LegalSection>

      <LegalSection title="알아두실 점">
        <NonAffiliationNotice />
        <p>
          시험 범위와 응시 정보는 주관 기관이 수시로 바꿉니다. 응시료·문항 수·합격 기준 같은 수치는 접수 전에 공식
          안내에서 다시 확인해 주세요. 노트에서 틀린 내용을 발견하면{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-fg">{CONTACT_EMAIL}</a>
          로 알려 주시면 고치겠습니다.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

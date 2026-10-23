import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { NonAffiliationNotice } from '@/components/legal/NonAffiliationNotice';
import { CONTACT_EMAIL, SITE_NAME } from '@/lib/site';

// 제작 방식 공개(docs/P4-trust-quality-plan.md Step 5a). 사실만 적는다 — 자격증 보유·전문가 경력처럼
// 확인할 수 없는 주장이나 "가장 정확한" 같은 최상급 표현은 쓰지 않는다.
const TITLE = '제작 방식';
const DESCRIPTION = `${SITE_NAME}가 시험 범위를 정하는 기준, 노트와 문제를 만드는 방식, 검수와 오류 제보 처리 과정을 안내합니다.`;
const PATH = '/about/how-we-make';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' },
};

const LINK = 'underline underline-offset-4 hover:text-fg';

export default function HowWeMakePage() {
  return (
    <LegalPage title={`${SITE_NAME} 제작 방식`}>
      <LegalSection title="범위">
        <p>
          각 자격증의 공식 시험 안내를 기준으로 범위를 정합니다. AWS 자격증은 AWS가 공개하는 시험 가이드(Exam Guide)의
          출제 영역을, 리눅스마스터는 한국정보통신진흥협회(KAIT)의 출제 기준을 따릅니다. 이 출제 영역을 주차와 일차로
          나눠 커리큘럼을 구성합니다.
        </p>
        <p>
          노트 상단의 &ldquo;기준&rdquo; 줄은 그 노트가 어느 시험의 안내를 기준으로 쓰였는지를 나타냅니다.
        </p>
      </LegalSection>

      <LegalSection title="제작">
        <p>
          노트와 문제는 AI 도구로 초안을 만들고, 운영자가 검토하고 수정해서 올립니다. 연습 문제와 모의고사도 같은 방식으로
          만들며, 실제 시험 문항을 옮겨 오지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="검수">
        <p>
          2026년 10월에 이미 올린 노트와 문항을 다시 점검했습니다. 사실 오류, 같은 시험 안에서 서로 다르게 적힌 수치,
          한쪽 보기에 정답이 몰리는 편향을 확인하고 고쳤으며, 고친 내용은{' '}
          <Link href="/changelog" className={LINK}>수정 기록</Link>에 공개합니다.
        </p>
        <p>
          검수를 마친 노트에는 상단에 &ldquo;마지막 검수&rdquo; 연월을 표시합니다. 검수 기록이 없는 노트에는 날짜를
          표시하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="오류 제보">
        <p>
          틀린 내용을 발견하면 <Link href="/contact" className={LINK}>문의 페이지</Link>나{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>{CONTACT_EMAIL}</a>로 알려 주세요. 노트 상단의
          &ldquo;오류 제보&rdquo; 링크로도 보낼 수 있습니다. 받은 제보는 확인한 뒤 고치고, 고친 내용을{' '}
          <Link href="/changelog" className={LINK}>수정 기록</Link>에 남깁니다.
        </p>
      </LegalSection>

      <LegalSection title="알아두실 점">
        <NonAffiliationNotice />
        <p>
          시험 범위와 응시 정보는 주관 기관이 수시로 바꿉니다. 응시료·문항 수·합격 기준 같은 수치는 접수 전에 공식
          안내에서 다시 확인해 주세요.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

import type { Metadata } from 'next';
import { LabHubView } from '@/components/lab/LabHubView';
import { infoAlternates } from '@/lib/infoAlternates';

// "실습" 카테고리 목록. 브라우저에서 도는 연습장(SQL·리눅스 셸·AWS CLI)을 모아 둔다.
export const dynamic = 'error'; // 정적 생성 강제

const TITLE = '실습 — SQL(SQLD)·리눅스 셸·AWS CLI 를 설치 없이 브라우저에서';
const DESCRIPTION =
  'SQLD 문법(Oracle) SQL 실습장과 리눅스마스터·AWS CLI 터미널을 설치 없이 브라우저에서 직접 실행합니다. 결과와 오류 문구는 실제 Oracle·Rocky Linux 출력과 맞췄습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates('/lab'),
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/lab', type: 'website' },
};

export default function LabHubPage() {
  return <LabHubView lang="ko" />;
}

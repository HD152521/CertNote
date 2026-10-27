// "만들어 줬으면 하는 자격증" 요청 후보. 아직 노트가 없는 자격증만 둔다.
// 자유 입력만 받으면 같은 자격증이 "정처기"·"정보처리기사"처럼 갈라져 집계가 안 되므로
// 후보에서 고르게 하고, 목록에 없을 때만 OTHER_CERT_KEY + 직접 입력을 받는다.
// 노트가 출시된 자격증은 여기서 지운다(DB의 기존 요청 행은 key 문자열로 남아 집계에 그대로 보인다).
export interface CertCandidate {
  key: string;
  label: string;
  // 국내 자격증. 영어판(/en)에는 띄우지 않는다 — 영어권 방문자와 무관하고 라벨이 한국어라
  // lang="en" 페이지에 한글이 섞인다(구글 언어 판정 실패로 색인에서 빠진 전례).
  domestic?: true;
}

export const CERT_CANDIDATES: readonly CertCandidate[] = [
  { key: 'cka', label: 'CKA · Certified Kubernetes Administrator' },
  { key: 'ckad', label: 'CKAD · Certified Kubernetes Application Developer' },
  { key: 'terraform-associate', label: 'Terraform Associate' },
  { key: 'az-900', label: 'Azure AZ-900 · Fundamentals' },
  { key: 'gcp-ace', label: 'Google Cloud ACE · Associate Cloud Engineer' },
  { key: 'info-processing-engineer', label: '정보처리기사', domestic: true },
  { key: 'sqld', label: 'SQLD · SQL 개발자', domestic: true },
  { key: 'adsp', label: 'ADsP · 데이터분석 준전문가', domestic: true },
  { key: 'network-manager-2', label: '네트워크관리사 2급', domestic: true },
];

export const OTHER_CERT_KEY = 'other';

// 화면 언어별 후보 목록. 서버 검증(isCertCandidateKey)은 언어와 무관하게 전체 목록을 받는다.
export function certCandidatesFor(lang: 'ko' | 'en'): readonly CertCandidate[] {
  return lang === 'en' ? CERT_CANDIDATES.filter((c) => !c.domestic) : CERT_CANDIDATES;
}

export function isCertCandidateKey(key: string): boolean {
  return key === OTHER_CERT_KEY || CERT_CANDIDATES.some((c) => c.key === key);
}

// "만들어 줬으면 하는 자격증" 요청 후보. 아직 노트가 없는 자격증만 둔다.
// 자유 입력만 받으면 같은 자격증이 "정처기"·"정보처리기사"처럼 갈라져 집계가 안 되므로
// 후보에서 고르게 하고, 목록에 없을 때만 OTHER_CERT_KEY + 직접 입력을 받는다.
// 노트가 출시된 자격증은 여기서 지운다(DB의 기존 요청 행은 key 문자열로 남아 집계에 그대로 보인다).
export interface CertCandidate {
  key: string;
  label: string;
}

export const CERT_CANDIDATES: readonly CertCandidate[] = [
  { key: 'cka', label: 'CKA · Certified Kubernetes Administrator' },
  { key: 'ckad', label: 'CKAD · Certified Kubernetes Application Developer' },
  { key: 'terraform-associate', label: 'Terraform Associate' },
  { key: 'az-900', label: 'Azure AZ-900 · Fundamentals' },
  { key: 'gcp-ace', label: 'Google Cloud ACE · Associate Cloud Engineer' },
  { key: 'info-processing-engineer', label: '정보처리기사' },
  { key: 'sqld', label: 'SQLD · SQL 개발자' },
  { key: 'adsp', label: 'ADsP · 데이터분석 준전문가' },
  { key: 'network-manager-2', label: '네트워크관리사 2급' },
];

export const OTHER_CERT_KEY = 'other';

export function isCertCandidateKey(key: string): boolean {
  return key === OTHER_CERT_KEY || CERT_CANDIDATES.some((c) => c.key === key);
}

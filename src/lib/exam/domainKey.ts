// 도메인 필터 키. 자격증을 고른 경우엔 도메인 이름만, 전체 범위에선 "slug::도메인".
// 클라이언트(ExamRunner)도 쓰므로 문제은행 JSON 을 끌어오지 않는 별도 파일에 둔다.
export const DOMAIN_KEY_SEP = '::';
export const domainKey = (slug: string, domain: string): string => `${slug}${DOMAIN_KEY_SEP}${domain}`;

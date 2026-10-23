import type { CertMeta } from '@/lib/content';
import { getAllQuestions } from '@/lib/questions';

// 홈에 보여주는 규모 수치. 하드코딩 스냅샷 대신 데이터에서 센다.
// 노트 편수 = 목록에 있는 자격증의 dayCount 합(meta.json 이 day 파일 수와 일치함은 homeStats.test.ts 가 검증).
export function sumDayCount(certs: Pick<CertMeta, 'dayCount'>[]): number {
  return certs.reduce((sum, c) => sum + c.dayCount, 0);
}

// '/' 는 정적 프리렌더라 빌드 때 한 번 호출되지만, 무효 세션의 /home 은 요청마다 랜딩을 렌더한다.
// 문항 수는 프로세스 수명 동안 한 번만 센다(인덱스는 모듈 로드 시 이미 파싱되어 있다).
let questionTotalMemo: number | undefined;
function questionTotal(): number {
  questionTotalMemo ??= getAllQuestions().length;
  return questionTotalMemo;
}

export interface HomeStats {
  certCount: number;
  pageCount: number;
  questionCount: number;
}

export function buildHomeStats(certs: Pick<CertMeta, 'dayCount'>[]): HomeStats {
  return { certCount: certs.length, pageCount: sumDayCount(certs), questionCount: questionTotal() };
}

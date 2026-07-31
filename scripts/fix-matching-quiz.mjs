// 매칭형("연결하시오") 문항을 표준 4지선다로 변환한다.
//
// 왜: parseQuiz 의 정답 정규식은 `[A-E][A-E,\s/]*` 만 받는다. 매칭형의 `A-4, B-3, C-2, D-1`
// 이나 `1-A, 2-B` 는 매치되지 않아 해당 문항이 통째로 드롭됐다(화면 미노출).
// 항목을 ①②③④ 로 제시하고 보기 A~D 를 '완성된 매핑'으로 주면 교육적 내용은 그대로 보존하면서
// 표준 양식으로 파싱된다. 해설은 원문을 그대로 유지한다.
//
// 일회성 교정 스크립트(기록 목적으로 커밋). 실행: node scripts/fix-matching-quiz.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** 문항의 [스템 ~ 정답줄]을 새 본문으로 교체. 그 뒤의 해설은 건드리지 않는다. */
function replaceQuestion(file, qnum, newBody) {
  if (!existsSync(file)) return `없음: ${file}`;
  const text = readFileSync(file, 'utf8');
  const re = new RegExp(
    String.raw`\*\*(?:문제|Question|Problem)\s*${qnum}\.[\s\S]*?\*\*(?:정답|Answer):[^\n]*\n`,
  );
  if (!re.test(text)) return `패턴 불일치: ${file} #${qnum}`;
  writeFileSync(file, text.replace(re, `${newBody.trimEnd()}\n`), 'utf8');
  return `변환: ${file} #${qnum}`;
}

const KO_Q6 = `**문제 6.** 워크로드와 인스턴스 패밀리의 연결로 올바른 것은?

① 실시간 Apache Kafka 브로커 (높은 디스크 I/O, 낮은 레이턴시 필요)
② 딥러닝 모델 사전학습 (GPU 집중)
③ SAP BW 인메모리 분석 (512GB RAM 필요)
④ 마이크로서비스 앱 서버 (트래픽 변동 큼)

A) ①-I 패밀리, ②-P 패밀리, ③-R 패밀리, ④-T 패밀리
B) ①-I 패밀리, ②-G 패밀리, ③-R 패밀리, ④-T 패밀리
C) ①-R 패밀리, ②-P 패밀리, ③-I 패밀리, ④-T 패밀리
D) ①-T 패밀리, ②-P 패밀리, ③-R 패밀리, ④-I 패밀리

**정답: A**
`;

const EN_Q6 = `**문제 6.** Which mapping of workloads to instance families is correct?

① Real-time Apache Kafka broker (high disk I/O, low latency)
② Deep-learning model pre-training (GPU-intensive)
③ SAP BW in-memory analytics (512GB RAM)
④ Microservice app server (highly variable traffic)

A) ①-I family, ②-P family, ③-R family, ④-T family
B) ①-I family, ②-G family, ③-R family, ④-T family
C) ①-R family, ②-P family, ③-I family, ④-T family
D) ①-T family, ②-P family, ③-R family, ④-I family

**정답: A**
`;

const KO_Q9 = `**문제 9.** 다음 시나리오와 솔루션의 연결로 올바른 것은?

① 온프레미스 Veritas NetBackup이 테이프 라이브러리로 백업. 물리 테이프는 없애고 싶지만 소프트웨어 교체는 불가.
② 온프레미스 10TB 데이터를 S3로 일회성 이전. 1Gbps Direct Connect 있음.
③ 온프레미스 NAS 데이터를 지사 직원들이 기존 방식대로 계속 접근.
④ 인터넷이 없는 오지 건설 현장의 500TB를 AWS로 이전.

A) ①-Tape Gateway, ②-DataSync, ③-S3 File Gateway, ④-Snowball Edge
B) ①-DataSync, ②-Tape Gateway, ③-S3 File Gateway, ④-Snowball Edge
C) ①-Tape Gateway, ②-Snowball Edge, ③-S3 File Gateway, ④-DataSync
D) ①-S3 File Gateway, ②-DataSync, ③-Tape Gateway, ④-Snowball Edge

**정답: A**
`;

const EN_Q9 = `**문제 9.** Which mapping of scenarios to solutions is correct?

① On-prem Veritas NetBackup writes to a tape library. Physical tape must go, but the backup software cannot be replaced.
② One-time migration of 10TB from on-prem to S3, with a 1Gbps Direct Connect link available.
③ Branch staff must keep accessing on-prem NAS data the way they always have.
④ Move 500TB collected at a remote construction site with no internet connectivity to AWS.

A) ①-Tape Gateway, ②-DataSync, ③-S3 File Gateway, ④-Snowball Edge
B) ①-DataSync, ②-Tape Gateway, ③-S3 File Gateway, ④-Snowball Edge
C) ①-Tape Gateway, ②-Snowball Edge, ③-S3 File Gateway, ④-DataSync
D) ①-S3 File Gateway, ②-DataSync, ③-Tape Gateway, ④-Snowball Edge

**정답: A**
`;

const jobs = [
  ['content/aws-certs/saa-c03/week3/day1.md', 6, KO_Q6],
  ['content/en/saa-c03/week3/day1.md', 6, EN_Q6],
  ['content/aws-certs/saa-c03/week4/day5.md', 9, KO_Q9],
  ['content/en/saa-c03/week4/day5.md', 9, EN_Q9],
];

for (const [file, num, body] of jobs) console.log(`  ${replaceQuestion(file, num, body)}`);

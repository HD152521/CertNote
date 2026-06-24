# Day 5 - Week 8 종합: 모니터링·집계·분석 시나리오 통합 복습

이번 주는 "로깅 그 자체"가 아니라 *쌓인 로그를 어떻게 신호로, 신호를 어떻게 대응으로 바꾸는가*를 다뤘다. 오늘은 네 날의 도구들 — CloudWatch(임계 탐지), Security Hub(집계·정규화·점수), Athena/OpenSearch/Logs Insights(분석), EventBridge/Security Lake(자동화·통합) — 을 하나의 흐름으로 꿰고, 시험에서 *도구를 헷갈리게 만드는 경계들*을 정리한다. 핵심은 개별 기능 암기가 아니라 "이 요구에는 왜 *이* 도구가 정답이고 *저* 도구는 왜 아닌가"를 즉답하는 것이다.

## 한 장으로 보는 탐지-집계-분석-대응 파이프라인

```
 [수집]            [탐지]              [집계·정규화]        [분석]              [자동화·대응]
CloudTrail ─┐   CloudWatch ─┐
VPC Flow ───┼─▶ Metric Filter│        Security Hub ─┐    Athena(S3,사후)
ELB/R53 ────┤   + Alarm      ├──핀딩──▶ (ASFF 정규화) ├──▶ Logs Insights ──┐
앱 로그 ─────┘   GuardDuty ───┤        보안점수/표준   │    OpenSearch       │
                Inspector ───┤        (CIS/FSBP)     │    (준실시간)        │
                Macie ───────┘                       │                     ▼
                                                      └──▶ EventBridge ──▶ SNS(알림)
                                                           (라우팅)     ──▶ Lambda/SSM(교정)
                                                                        ──▶ Step Functions(오케스트레이션)

 [통합 저장] Security Lake: 위 원시 로그들을 OCSF/Parquet로 정규화해 S3 데이터 레이크로 — Athena/OpenSearch/SIEM이 단일 스키마로 질의
```

> 💡 **관련 이론**: 이 흐름은 NIST CSF의 *Detect(탐지)* 와 *Respond(대응)* 기능을 AWS 서비스로 사상(map)한 것이다. CloudWatch/GuardDuty는 탐지, Security Hub는 탐지 결과의 집계·평가, EventBridge는 대응의 오케스트레이션을 담당한다. 시험 문제는 보통 "이 요구가 탐지인가, 집계인가, 분석인가, 대응인가"를 먼저 식별하면 후보 서비스가 좁혀진다.

## 경계 정리 1: "탐지" 도구들의 분담

가장 자주 헷갈리는 영역. 무엇을 *탐지*하느냐로 구분한다.

| 요구 | 정답 | 이유 |
|------|------|------|
| 특정 로그 패턴(루트 사용, 로그인 실패 N회)을 임계로 경보 | CloudWatch Metric Filter + Alarm | 단일 로그 그룹 내 패턴 → 숫자 → 임계 |
| 악성 IP 통신, 크립토마이닝, 자격증명 이상 사용 | GuardDuty | 위협 인텔·ML 기반 행위 탐지 |
| EC2/컨테이너/Lambda의 CVE 취약점 | Inspector | 소프트웨어 취약점 스캔 |
| S3의 PII/민감데이터 발견 | Macie | 데이터 분류·발견 |
| 시간대마다 변동하는 메트릭의 "평소와 다름" | CloudWatch Anomaly Detection | 임의 메트릭 ML 밴드 |
| 외부에 의도치 않게 공유된 리소스(버킷/역할) | IAM Access Analyzer | 외부 접근 가능성 분석 |

> ⚠️ **함정**: "보안 이상을 탐지"라는 모호한 표현에 GuardDuty를 반사적으로 고르면 안 된다. *무엇이* 이상인지가 결정한다 — 특정 API 호출 임계면 CloudWatch, 위협 행위면 GuardDuty, 취약점이면 Inspector, 민감데이터면 Macie.

## 경계 정리 2: "분석" 도구들의 분담

데이터 위치와 시간성이 결정한다.

| 요구 | 정답 | 핵심 기준 |
|------|------|-----------|
| S3에 쌓인 대용량 로그를 일회성 SQL로, 저비용 | Athena | 데이터=S3, 사후·일회성 |
| CloudWatch Logs에 있는 로그를 즉시 질의 | Logs Insights | 데이터=CloudWatch Logs, 즉시 |
| 준실시간 대시보드·전문검색·반복 상관 | OpenSearch | 인덱싱, 상시 운영 |
| 조직 전역 로그를 단일 정규화 스키마로 | Security Lake(+Athena/OpenSearch) | OCSF 정규화 저장소 |

> 🎯 **시나리오**: "90일 전 사고를 조사하는데 로그는 S3에만 있고 비용을 최소화"한다 → Athena + 파티셔닝. "로그가 CloudWatch Logs에 있고 사고 대응 중 즉시" → Logs Insights. "SOC가 상시 대시보드로 모니터링" → OpenSearch. 같은 "로그 분석"이라도 위치·시간성으로 답이 갈린다.

## 경계 정리 3: Security Hub vs Security Lake vs Config

세 서비스가 "조직 보안 상태"라는 비슷한 단어 주변에 모여 헷갈린다.

- **AWS Config**: 리소스 *구성*의 기록·변경 추적·규칙 평가. "이 리소스가 규정 설정인가?"의 *원천 평가 엔진*. Security Hub 표준 컨트롤이 내부적으로 사용.
- **Security Hub**: 여러 탐지기의 *핀딩*을 ASFF로 집계, 표준(CIS/FSBP) 컨트롤 점검, 보안 점수. "지금 우리 보안 상태와 핀딩 한눈에."
- **Security Lake**: *원시 보안 로그*를 OCSF로 정규화한 S3 데이터 레이크. "모든 로그를 단일 스키마로 모아 분석/SIEM에 제공."

```
Config      → 구성 평가(설정이 규정에 맞나)      → Security Hub 표준의 엔진
Security Hub → 핀딩 집계·점수(탐지 결과 대시보드)  → ASFF 포맷
Security Lake→ 원시 로그 정규화 저장소(분석용)     → OCSF 포맷
```

> ⚠️ **함정**: "여러 소스를 정규화"라는 말이 둘 다에 쓰여 헷갈린다. *핀딩*(탐지 결과)의 정규화·집계·점수는 Security Hub(ASFF). *원시 로그*의 정규화 저장·분석은 Security Lake(OCSF). 포맷 이름(ASFF vs OCSF)이 결정적 단서다.

## 통합 시나리오 워크스루

**시나리오 A — 루트 사용 즉시 탐지 및 알림**
1. CloudTrail(전 리전) → CloudWatch Logs.
2. Metric Filter: `$.userIdentity.type = "Root" ...`, `metricValue=1, defaultValue=0`.
3. Alarm: `Sum`, period 300, threshold ≥1, `notBreaching`.
4. SNS → 보안팀. (CIS 벤치마크 통제와 일치)

**시나리오 B — 다계정 보안 상태 일원화**
1. Organizations에서 Security Hub 위임 관리자 지정.
2. Central Configuration으로 FSBP/CIS 표준 멤버에 일괄 배포(각 멤버 Config 활성화 전제).
3. Cross-Region Aggregation으로 단일 리전 집계.
4. 보안 점수·핀딩을 위임 관리자 계정에서 통합 조회.

**시나리오 C — CRITICAL 핀딩 자동 교정**
1. 모든 핀딩은 EventBridge로 자동 발행.
2. 규칙: `source=aws.securityhub`, `Severity.Label=CRITICAL`, `Workflow.Status=NEW`.
3. 대상: Step Functions → 격리 SG 적용 + EBS 스냅샷 + Security Hub 상태 갱신 + SNS.
4. 핸들러는 멱등, 실패 시 DLQ로 보존, 최소 권한 역할.

**시나리오 D — 사후 포렌식**
1. CloudTrail/VPC Flow는 S3에 장기 보관(또는 Security Lake).
2. Athena로 파티션 한정 쿼리(특정 IP·기간·이벤트).
3. 상시 모니터링이 필요해지면 Firehose → OpenSearch로 핫 데이터 인덱싱 계층 추가.

> 🔍 **더 깊이**: 성숙한 조직은 이들을 *계층*으로 운영한다. 핫(최근, 빈번 질의)=OpenSearch, 웜/콜드(장기, 가끔 조사)=S3+Athena, 정규화 허브=Security Lake, 핀딩 평면=Security Hub, 자동화 신경계=EventBridge. 한 도구가 모든 걸 하지 않는다는 것, 그리고 각 도구의 *비용 모델*(상시 클러스터 vs 종량 스캔)이 계층화 결정을 좌우한다는 것이 실무·시험 공통의 통찰이다.

## 비용·운영 함정 빠른 점검

- Athena: 파티션 프루닝 안 되면 전체 스캔(비용 폭탄). 컬럼형(Parquet)으로 절감.
- OpenSearch: 상시 클러스터 비용. 장기 보관은 S3로 계층화.
- CloudWatch: Metric Filter `defaultValue=0` + Alarm `Sum`이 카운트 탐지의 짝.
- EventBridge: at-least-once → 멱등 핸들러 + DLQ.
- 자동 대응 역할: 최소 권한 + 리소스 조건.
- KMS 암호화 로그 그룹: 키 정책에 CloudWatch Logs 서비스 주체 권한 필수.

## 마무리

Week 8의 한 문장: **"로그는 쌓는 것이 아니라 *신호로 변환하고, 정규화해 모으고, 질의하고, 자동으로 대응*하는 것이다."** CloudWatch는 단일 신호 임계, Security Hub는 핀딩 집계·점수, Athena/OpenSearch/Logs Insights는 위치·시간성에 따른 분석, EventBridge는 대응 라우팅, Security Lake는 OCSF 정규화 허브. 시험에서는 "요구가 탐지/집계/분석/대응 중 무엇이며, 데이터가 어디 있고, 시간성이 무엇인가"를 먼저 묻는 습관이 정답을 좁힌다.

---

## 📝 연습 문제

**문제 1.** "S3에 PII가 저장되어 있는지 발견", "EC2의 CVE 취약점 스캔", "악성 IP와의 통신 탐지"에 각각 대응하는 서비스 조합으로 옳은 것은?

A) Macie / Inspector / GuardDuty  
B) GuardDuty / Macie / Inspector  
C) Inspector / GuardDuty / Macie  
D) Config / CloudWatch / Athena  

**정답: A**  
해설: 민감데이터(PII) 발견은 Macie, 소프트웨어 취약점(CVE) 스캔은 Inspector, 위협 인텔·행위 기반 악성 통신 탐지는 GuardDuty다. 각 도구는 *무엇을* 탐지하느냐로 분담이 명확하며, Config/CloudWatch/Athena는 이 세 가지 탐지 역할과 다른 계층이다.

---

**문제 2.** 로그가 CloudWatch Logs에 있고, 사고 대응 중 별도 적재 없이 즉시 질의해 AccessDenied 추세를 보려 한다. 가장 적합한 도구는?

A) Athena  
B) Amazon OpenSearch에 새 도메인을 만들어 적재  
C) CloudWatch Logs Insights  
D) Security Lake  

**정답: C**  
해설: 데이터가 이미 CloudWatch Logs에 있고 즉시성이 요구되면 Logs Insights가 정답이다. Athena/Security Lake는 S3 데이터 대상이고, 사고 대응 중 OpenSearch 도메인을 새로 만들어 적재하는 것은 즉시성이 없다.

---

**문제 3.** 여러 탐지 서비스(GuardDuty, Inspector, Macie)의 핀딩을 단일 포맷으로 집계하고 CIS/FSBP 표준 합격률을 보안 점수로 보려 한다. 그리고 별개로, 조직 전역 *원시 로그*를 OCSF 표준으로 정규화해 SIEM이 질의하게 하려 한다. 각각의 서비스는?

A) 둘 다 Security Hub  
B) 핀딩 집계·점수는 Security Hub(ASFF), 원시 로그 OCSF 정규화는 Security Lake  
C) 핀딩 집계는 Security Lake, 원시 로그는 Security Hub  
D) 둘 다 AWS Config  

**정답: B**  
해설: 탐지기 핀딩의 집계·정규화(ASFF)·표준 점검·보안 점수는 Security Hub, 원시 보안 로그의 OCSF 정규화 데이터 레이크는 Security Lake다. 포맷 이름(ASFF vs OCSF)과 대상(핀딩 vs 원시 로그)이 구분 단서이며, Config는 구성 평가 엔진으로 둘 다 아니다.

---

**문제 4.** CloudTrail 로그로 5분 동안 콘솔 로그인 실패 5회 이상을 탐지하는 알람이 동작하지 않는다. 구성에서 함께 점검해야 할 두 가지는?

A) Metric Filter에 defaultValue=0 설정 여부와, Alarm Statistic이 Sum인지  
B) SNS 암호화와 KMS 키 정책  
C) 로그 그룹 보존 기간과 리전  
D) OpenSearch 인덱스 상태와 파티션  

**정답: A**  
해설: 카운트 기반 탐지는 Alarm Statistic이 Sum이어야 기간 내 발생 합을 임계와 비교할 수 있고, Metric Filter에 defaultValue=0이 없으면 결측 구간이 생겨 평가가 흔들린다. 이 둘은 짝으로 점검한다. SNS 암호화·보존 기간·OpenSearch는 이 카운트 탐지 동작과 무관하다.

---

**문제 5.** GuardDuty가 EC2 크립토마이닝을 탐지하면 자동으로 인스턴스를 격리하고 포렌식용 EBS 스냅샷을 만든 뒤 보안팀에 알리는 파이프라인을 구성한다. 운영 위생상 반드시 고려할 것을 모두 고른 묶음은?

A) 자동 대응 역할에 Administrator 부여, 핸들러는 단발 실행 가정  
B) 핸들러를 멱등하게 설계, 대상 실패 시 DLQ로 보존, 최소 권한 역할 + 리소스 조건  
C) EventBridge 대신 매분 폴링하는 cron  
D) 모든 핀딩을 무시 처리(SUPPRESSED)  

**정답: B**  
해설: EventBridge는 at-least-once 전달이라 핸들러는 멱등해야 하고, 대상 호출 실패 대비 DLQ로 이벤트를 보존하며, 자동 대응 역할은 최소 권한과 리소스 조건으로 공격 표면을 줄여야 한다. Administrator 부여·단발 가정은 위험하고, 폴링 cron은 비효율·지연이며, 핀딩 일괄 억제는 탐지를 무력화한다.

---

# Day 5 - Week 10 종합: 모니터링이라는 하나의 이야기

한 주 동안 CloudWatch, X-Ray, CloudTrail, EventBridge를 따로따로 봤지만, 사실 이 넷은 하나의 질문을 네 각도에서 답하는 도구들이다. 그 질문은 "운영 중인 시스템 안에서 무슨 일이 일어나고 있는가, 그리고 우리는 어떻게 알고 어떻게 반응하는가"다. 이 마지막 날은 개별 서비스를 복습하는 데 그치지 않고, 네 서비스가 어떻게 하나의 관측 가능성(observability) 그림으로 맞물리는지를 정리한 뒤, 실전 시험 유형의 시나리오 문제로 그 이해를 검증한다.

## 네 서비스를 하나의 좌표로

모니터링 도구들을 외울 때 가장 흔한 실수는 "이름 → 기능"을 단순 암기하는 것이다. 대신 두 개의 축으로 좌표를 잡으면 각 도구가 *왜 그 자리에 있는지*가 보인다.

첫 번째 축은 **무엇을 보는가** — 숫자(지표)인가, 텍스트(로그)인가, 요청의 경로(추적)인가, 행동의 기록(감사)인가. 두 번째 축은 **언제 작동하는가** — 사후에 관찰만 하는가, 실시간으로 반응하는가.

| 서비스 | 무엇을 보는가 | 핵심 질문 |
|--------|--------------|-----------|
| CloudWatch | 지표·로그 (양적 상태) | "지금 건강한가? 무엇이 느린가?" |
| X-Ray | 요청의 경로 (인과) | "*어디서* 느린가? 어느 단계가 병목인가?" |
| CloudTrail | API 호출 기록 (감사) | "누가 무엇을 했는가?" |
| EventBridge | 이벤트 (반응) | "이 사건에 무엇으로 대응할까?" |

이 좌표에서 보면, CloudWatch는 "무엇이 느린가"까지만 답하고 "어디서"는 X-Ray로 넘긴다. CloudTrail은 성능이 아니라 책임을 추적한다. EventBridge는 관찰자가 아니라 반응자다 — 다른 셋이 "안다"면 EventBridge는 "행동한다". 그래서 가장 강력한 패턴은 이들의 결합이다. CloudTrail이 root 로그인을 *알고*, EventBridge가 그에 *반응해* Lambda를 호출하고 SNS로 통지하는 식으로.

> 💡 **관련 이론**: 현대 모니터링은 "관측 가능성(observability)"이라는 더 넓은 개념으로 재정의됐다. 제어 이론에서 온 이 용어는 "시스템의 외부 출력만 보고 내부 상태를 얼마나 추론할 수 있는가"를 뜻한다. 관측 가능성의 세 기둥(three pillars)은 **지표(metrics)·로그(logs)·추적(traces)** 으로 정의되는데, 이게 정확히 CloudWatch(지표·로그)와 X-Ray(추적)에 대응한다. 핵심 통찰은 "모니터링은 *예상한* 문제를 보는 것(알람을 미리 걸어둔)이고, 관측 가능성은 *예상 못 한* 문제를 사후에 탐색할 수 있게 하는 것"이라는 구분이다. CloudTrail은 여기에 "감사"라는 네 번째 차원을 더한다 — 성능이 아니라 보안·규정 준수의 관측 가능성이다.

## Week 10 핵심 함정 총정리

시험은 미세한 디테일의 차이를 묻는다. 한 주의 함정을 한자리에 모은다.

| 헷갈리는 쌍 | 핵심 차이 |
|-------------|-----------|
| EC2 Basic / Detailed Monitoring | 5분 / 1분 (Detailed는 추가 비용) |
| 기본 / 고해상도 지표 | 1분 / 1초 (고해상도 유료) |
| `DiskReadOps` / `disk_used_percent` | 기본 지표 / Agent 필요 (하이퍼바이저 경계) |
| EC2 메모리 | 항상 Agent 필요 (OS 내부 측정) |
| Management / Data Events | 컨트롤 플레인·기본 ON / 데이터 플레인·기본 OFF·과금 |
| CloudTrail Event History / Trail | 90일 조회 캐시 / S3 영구 |
| CloudWatch Events / EventBridge | 같은 서비스 (EB가 상위 호환) |
| X-Ray Annotation / Metadata | 인덱싱·검색 가능(50개 한도) / 인덱싱 X·무제한 |
| Lambda Active Tracing / EC2 데몬 | 토글만 / 데몬 직접 실행 (UDP 2000) |
| Synthetics / R53 Health Check | 스크립트·다단계 흐름 / 단순 ping |
| Anomaly Detection / 정적 임계값 | ML 계절성 밴드 / 고정 선 |
| EMF / PutMetricData | 로그로 자동 추출 / 동기 API |
| Metric Stream / Subscription Filter | 지표를 외부로 / 로그를 외부로 |
| Container Insights / AMP | CloudWatch 푸시 / Prometheus 풀 |
| cron / rate | 특정 시각·캘린더 / 주기 간격 |

> ⚠️ **함정**: 가장 자주 틀리는 셋을 다시 강조한다. ① **EC2 메모리·디스크 공간은 기본 지표가 아니다** — 하이퍼바이저가 OS 내부를 못 보기 때문. ② **CloudTrail Data Events는 기본 OFF** — S3 GetObject·Lambda Invoke 추적은 명시적 활성화 필요. ③ **ALB는 X-Ray 미지원** — 추적은 API Gateway부터. 이 셋이 Week 10 오답의 절반을 차지한다.

## 통합 아키텍처: 신호가 흐르는 경로

```
[애플리케이션]
     |
     +-- API 호출 ──────→ [CloudTrail] ──→ [EventBridge] ──→ [Lambda] ──→ 보안 대응
     |                                          (root 로그인 등 패턴 매칭)
     |
     +-- 분산 요청 ─────→ [X-Ray] (Trace ID 전파, 서비스 맵)
     |
     +-- 성능 지표 ─────→ [CloudWatch Metrics] ──→ [Alarm] ──→ [SNS / Auto Scaling]
     |                          ↑
     |                     [EMF / Metric Filter]
     |                          ↑
     +-- 로그 ──────────→ [CloudWatch Logs] ──→ [Logs Insights / Subscription Filter]
```

이 그림에서 중요한 건 화살표의 *방향*이다. CloudTrail과 X-Ray, CloudWatch는 애플리케이션에서 *나오는* 신호를 받고, EventBridge와 Alarm은 그 신호를 받아 *되돌아가* 자동 대응한다. 관측(왼쪽)과 반응(오른쪽)의 순환이 모니터링 아키텍처의 본질이다.

> 🔍 **더 깊이**: 이 순환에서 자주 놓치는 연결이 "로그 → 지표 → 알람"의 변환이다. 로그(텍스트)는 그 자체로는 알람을 걸 수 없다 — 알람은 지표(숫자)에만 걸린다. 그래서 Metric Filter(로그의 패턴을 세어 지표화)와 EMF(JSON 로그에서 지표 자동 추출)라는 두 다리가 로그 세계와 지표 세계를 잇는다. 이 변환을 이해하면 "로그에 ERROR가 뜨면 알람"이라는 흔한 요구가 왜 곧장은 안 되고 Metric Filter를 거쳐야 하는지가 명확해진다. CloudWatch의 모든 자동 대응은 결국 "지표 → 알람 → 액션"이라는 단일 경로로 수렴하며, 다른 모든 신호(로그·이벤트)는 이 경로에 합류하기 위해 지표나 이벤트 형태로 변환된다.

## Week 10 약어 정리

| 약어 | 풀네임 | 비고 |
|------|--------|------|
| CW / CWL / CWA | CloudWatch / Logs / Agent | |
| EMF | Embedded Metric Format | 로그로 지표 자동 추출 |
| EB | EventBridge | 구 CloudWatch Events |
| ADOT | AWS Distro for OpenTelemetry | X-Ray 호환 표준 추적 |
| AMP / AMG | Managed Prometheus / Grafana | 쿠버네티스 표준 모니터링 |
| SLO / SLI / SLA | Service Level Objective/Indicator/Agreement | |
| RUM | Real User Monitoring | CloudWatch RUM |
| APM | Application Performance Monitoring | |

---

## 📝 Week 10 종합 연습문제

**문제 1.** API Gateway → Lambda → DynamoDB → 외부 결제 API로 이어지는 요청에서 간헐적 타임아웃이 발생한다. *어느 단계*에서 지연이 생기는지 파악하려면?

A) CloudWatch Lambda Duration·Errors 지표 대시보드만 보고 호출별 평균/p99 지연을 비교한다

B) X-Ray 분산 추적의 서비스 맵과 트레이스로 단계별 소요 시간 분석

C) CloudTrail 이벤트 기록을 조회해 각 API 호출의 타임스탬프 간격으로 지연 구간을 추정한다

D) VPC Flow Logs를 분석해 ENI 간 패킷 왕복 시간으로 어느 구간이 느린지 역추적한다

**정답: B**

해설: CloudWatch Duration 지표는 "Lambda 전체가 느리다"까지만 알려주고 *어디서* 느린지는 못 짚는다. **X-Ray**는 Trace를 Segment/Subsegment로 쪼개 "DynamoDB 조회 30ms, 외부 결제 API 2초"처럼 단계별 소요를 보여줘 병목(외부 API)을 정확히 지목한다. A) 지표는 "무엇이"는 알아도 "어디서"는 못 답한다 — 이게 X-Ray가 존재하는 이유다. C) CloudTrail은 성능이 아니라 API 감사용. D) Flow Logs는 네트워크 흐름이지 애플리케이션 단계 추적이 아니다.

---

**문제 2.** EC2 인스턴스의 메모리 사용률과 디스크 사용 공간(used %)을 CloudWatch에서 모니터링하려 한다. 동시에 `DiskReadOps`도 보고 싶다. 무엇이 추가로 필요한가?

A) 셋 다 하이퍼바이저가 EBS·인스턴스 경계에서 보는 기본 지표라 추가 작업 불필요

B) 메모리·디스크 사용 공간은 CloudWatch Agent 필요, `DiskReadOps`는 기본 지표

C) 셋 다 게스트 OS 내부 측정값이므로 CloudWatch Agent 설치가 필요하다

D) Detailed Monitoring을 켜면 1분 주기로 메모리·디스크 공간까지 셋 다 자동 수집된다

**정답: B**

해설: 메모리 사용률과 디스크 사용 *공간*은 게스트 OS 내부에서만 측정되므로 하이퍼바이저가 못 보고, **CloudWatch Agent**가 필요하다. 반면 `DiskReadOps`(블록 I/O *횟수*)는 하이퍼바이저가 EBS 경계에서 셀 수 있어 기본 지표다. "디스크"라는 단어가 둘 다 들어가 헷갈리지만 기준은 "OS 안을 봐야 하는가"다. D) Detailed Monitoring은 기본 지표의 *주기*를 1분으로 높일 뿐 메모리라는 새 지표를 추가하지 않는다 — 핵심 함정.

---

**문제 3.** 컴플라이언스 감사를 위해 S3 버킷의 모든 객체 다운로드(GetObject)를 *누가, 언제* 했는지 7년간 보존·분석해야 한다. 적절한 구성은?

A) Management Events만으로 충분, S3에 자동 7년 보존

B) Data Events를 활성화하고, Trail을 S3로 보내거나 CloudTrail Lake(최대 10년)로 적재

C) CloudWatch Logs에 GetObject가 자동 기록됨

D) X-Ray로 다운로드를 추적

**정답: B**

해설: GetObject는 **Data Event**(데이터 플레인)라 기본 비활성이므로 명시적으로 켜야 한다(추가 비용). 그리고 CloudTrail 기본 Event History는 90일뿐이라 7년 보존은 **Trail → S3**(무제한) 또는 **CloudTrail Lake**(7일~10년, SQL 분석)가 필요하다. A) Management Events는 컨트롤 플레인이라 객체 다운로드를 기록하지 않는다. C) GetObject는 CloudWatch Logs에 자동 기록되지 않는다.

---

**문제 4.** 마이크로서비스에서 "특정 주문 ID를 가진 모든 trace를 X-Ray 콘솔에서 검색"하려 한다. 그리고 디버깅용으로 주문의 전체 JSON 본문도 trace에 첨부하려 한다. 각각 무엇을 쓰는가?

A) 둘 다 Metadata에 넣으면 인덱싱되어 콘솔 필터 검색과 본문 조회가 한 번에 된다

B) 주문 ID는 Annotation(검색용), JSON 본문은 Metadata(큰 객체용)

C) 둘 다 Annotation에 담아 50개 한도 안에서 주문 ID와 본문 전체를 인덱싱·검색한다

D) 주문 ID는 Subsegment 이름으로 인코딩하고, 본문은 Annotation에 넣어 검색 가능하게 한다

**정답: B**

해설: **Annotation**만 인덱싱되어 콘솔에서 검색·필터링할 수 있으므로 주문 ID처럼 검색 키로 쓸 식별자는 Annotation이다(단, trace당 50개·단순값 제한). 디버깅용 큰 JSON 본문은 검색하지 않고 보기만 하므로 인덱싱 안 되는 **Metadata**(크기 무제한)가 맞다. 이 구분은 DB 인덱스 설계의 트레이드오프와 같다 — 모든 걸 인덱싱하면 검색 인프라가 감당 못 하므로 검색할 것만 인덱싱한다.

---

**문제 5.** Lambda 함수에서 비즈니스 지표(주문 수)를 CloudWatch로 보내려 한다. 실행 시간 과금이므로 비용과 지연을 최소화하고 싶다. 그리고 EC2/ECS에서는 X-Ray를 쓰는데 trace가 안 보인다. 각각의 해법은?

A) Lambda는 PutMetricData 동기 호출, EC2는 Active Tracing 토글

B) Lambda는 EMF로 stdout에 JSON 출력, EC2/ECS는 X-Ray 데몬(사이드카) 실행 확인

C) 둘 다 CloudWatch Agent 설치

D) Lambda는 X-Ray, EC2는 EMF

**정답: B**

해설: 람다에서 `PutMetricData`는 동기 네트워크 호출이라 실행 시간(=비용)을 늘린다. **EMF**는 stdout에 JSON 한 줄을 출력할 뿐(로그는 비동기 전송)이라 핫 패스에 지연이 없다. EC2/ECS에서 X-Ray trace가 안 보이는 흔한 원인은 SDK가 보내는 UDP 2000 span을 받을 **X-Ray 데몬(사이드카)이 없는** 것이다 — UDP라 에러도 안 나서 조용히 실패한다. 두 문제 모두 "동기/인프라 부재"가 원인이다.

---

**문제 6.** root 계정으로 누군가 콘솔 로그인하면 즉시 Slack 알림을 받고 싶다. 가장 적절한 패턴은?

A) IAM 정책에 root 사용자에 대한 Deny 조건을 걸어 콘솔 로그인 자체를 차단한다

B) CloudTrail이 ConsoleLogin 기록 → EventBridge Rule이 root 필터 → Lambda/SNS → Slack

C) `ConsoleLogin` 횟수를 추적하는 CloudWatch 기본 지표에 1회 초과 알람을 걸어 SNS로 통지한다

D) AWS Config Rule(`root-account-mfa-enabled` 등)이 root 로그인 시점을 평가해 SNS로 즉시 알린다

**정답: B**

해설: root 로그인 → **CloudTrail**이 `ConsoleLogin` 이벤트 기록 → **EventBridge Rule**이 `userIdentity.type = "Root"` 패턴으로 필터 → Lambda/SNS → Slack 통지가 표준 보안 자동화다. CloudTrail(감지)과 EventBridge(반응)의 결합으로 사람이 로그를 뒤지기 전에 시스템이 반응한다. A) root는 IAM 위에 있어 IAM으로 로그인 자체를 막을 수 없다. C) 로그인은 지표가 아니라 이벤트라 기본 지표로 존재하지 않는다. D) Config는 리소스의 *구성 상태*를 평가하는 도구라 "지금 막 일어난 로그인"이라는 순간 이벤트를 실시간 감지하는 데는 맞지 않다.

---

**문제 7.** 트래픽이 낮·밤·주말로 크게 달라지는 API의 지연 시간 지표에 알람을 걸려 한다. 단일 정적 임계값은 낮엔 너무 둔감하고 밤엔 오탐이 많다. 해법은?

A) 시간대별 임계값을 여러 개 만들고 EventBridge 스케줄로 낮·밤·주말마다 알람을 전환한다

B) CloudWatch Anomaly Detection으로 ML이 학습한 시간대별 정상 밴드 사용

C) Metric Filter로 지연 시간 로그를 패턴 매칭해 시간대별 평균을 지표화한 뒤 알람을 건다

D) Composite Alarm으로 낮·밤·주말 알람 3개를 AND/OR 조합해 오탐을 상쇄한다

**정답: B**

해설: **Anomaly Detection**은 ML로 지표의 계절성(시간대·요일 반복)과 추세를 학습해 "이 시각이면 값이 대략 이 범위"라는 예측 밴드를 만들고 그걸 벗어날 때만 알람을 울린다. 정적 임계값의 시간대 변동 문제를 자동으로 해결한다(Holt-Winters·SARIMA 계열의 시계열 예측 아이디어). A) 수동 시간대 전환은 운영 부담이 크고 패턴 변화에 취약하다. C) Metric Filter는 로그를 지표화할 뿐 시간대별 정상 범위를 학습하지 못한다. D) Composite Alarm은 기존 알람들을 논리 조합할 뿐, 각 알람이 여전히 정적 임계값에 의존하므로 근본 문제가 남는다.

---

**문제 8.** "에러 100건 초과 시 알람"을 걸었는데 트래픽이 평소의 10배로 늘자 정상 상태에서도 알람이 계속 울린다. 더 견고한 알람을 만들려면?

A) 임계값을 1000건으로 올려 트래픽 10배 상황의 정상 에러까지 흡수하도록 여유를 둔다

B) Metric Math로 에러율(에러/전체×100)을 계산해 비율 기반 알람을 건다

C) Anomaly Detection만 적용해 ML이 학습한 에러 *건수*의 정상 밴드 이탈로 판정한다

D) 평가 주기(period)를 늘리고 데이터포인트 개수를 높여 일시적 급증을 무시하게 한다

**정답: B**

해설: 절대값 임계값("100건")은 트래픽 규모에 따라 의미가 흔들린다. **Metric Math**로 에러율(에러/전체 요청 × 100)을 계산해 "에러율 1% 초과"처럼 비율 기반으로 걸면 트래픽이 늘어도 의미가 일정하다. SRE가 SLO를 절대 카운트가 아니라 비율(가용성 99.9%)로 정의하는 이유다. A) 임계값을 올리면 트래픽이 다시 줄었을 때 진짜 장애를 놓친다. C) 에러 *건수*에 Anomaly Detection을 걸어도 건수 자체가 트래픽에 비례해 출렁이므로 비율만큼 안정적이지 않다. D) 평가 주기를 늘리는 건 노이즈를 줄일 뿐 트래픽 규모에 따른 건수 왜곡이라는 근본 원인은 그대로다.

---

**문제 9.** CloudWatch 지표를 회사 표준 모니터링 도구(Datadog)로 거의 실시간 통합하고, 동시에 애플리케이션 로그도 OpenSearch로 보내려 한다. 각각 무엇을 쓰는가?

A) 둘 다 Metric Stream으로 Firehose를 거쳐 Datadog과 OpenSearch로 동시에 푸시한다

B) 지표는 Metric Stream(→Firehose), 로그는 CloudWatch Logs Subscription Filter

C) 둘 다 Subscription Filter로 지표와 로그를 실시간 스트리밍해 외부로 내보낸다

D) 둘 다 GetMetricData·FilterLogEvents API를 주기 폴링해 외부 도구로 적재한다

**정답: B**

해설: **Metric Stream**은 *지표*를 Firehose를 거쳐 외부(Datadog 등)로 거의 실시간 푸시하고, **Subscription Filter**는 *로그*를 실시간으로 Lambda/Kinesis/OpenSearch로 스트리밍한다. 둘은 "지표냐 로그냐"로 역할이 나뉜다. A) Metric Stream은 지표 전용이라 애플리케이션 로그를 OpenSearch로 보낼 수 없다. C) Subscription Filter는 로그 전용이라 CloudWatch 지표를 외부로 스트리밍하지 못한다. D) GetMetricData 폴링은 지연·비용·API 한도 문제로 실시간 통합에 부적합하다. 지표와 로그는 서로 다른 파이프라인을 탄다는 게 핵심이다.

---

**문제 10.** ECS Fargate 서비스에서 특정 태스크가 메모리 부족으로 반복 재시작되는데, 호스트 수준 CloudWatch 지표로는 평균이 정상이라 안 보인다. 컨테이너 레벨 가시성을 확보하려면?

A) EC2 기본 지표 사용

B) Container Insights 활성화로 클러스터/서비스/태스크/컨테이너 레벨 지표 수집

C) CloudWatch Agent를 호스트에 설치

D) X-Ray

**정답: B**

해설: 호스트 평균 지표는 특정 태스크의 메모리 스파이크를 평균에 묻어버린다. **Container Insights**는 클러스터 → 서비스 → 태스크 → 컨테이너 각 레벨로 지표를 집계하고 태스크 재시작 같은 오케스트레이션 신호까지 보여줘, 어느 태스크가 메모리 부족인지 짚는다. 컨테이너는 동적이고 수명이 짧아 호스트 단위 모니터링으로는 부족하다. C) Fargate는 호스트에 직접 Agent를 설치할 수 없다.

---

**문제 11.** "매일 새벽 2시에 정확히 한 번" 배치 Lambda를 실행하되, 향후 수천 개의 서로 다른 스케줄로 확장될 수 있다. 가장 적절한 구성은?

A) `rate(1 day)` Rule로 24시간마다 반복시키면 매일 새벽 2시 실행이 보장된다

B) `cron(0 2 * * ? *)` 표현식 — 특정 시각 지정. 대규모 확장은 EventBridge Scheduler 고려

C) CloudWatch 알람을 새벽 2시 지표 임계값에 걸어 Lambda를 트리거한다

D) SQS 지연 큐에 24시간 DelaySeconds 메시지를 넣어 매번 다음 실행을 예약한다

**정답: B**

해설: "매일 새벽 2시"는 특정 시각·캘린더 기반이므로 `rate`(주기 간격)가 아니라 **`cron`**이 맞다(`rate(1 day)`는 "마지막 실행으로부터 24시간 후"라 기준 시각이 고정되지 않는다). 향후 수천~백만 개 스케줄·일회성 일정·세밀한 재시도가 필요하면 **EventBridge Scheduler**가 일반 Rule(schedule)보다 적합하다. cron vs rate, Scheduler vs Rule 두 구분이 함께 출제된다. A) `rate(1 day)`는 "마지막 실행으로부터 24시간"이라 기준 시각이 떠다녀 "정확히 새벽 2시"를 보장하지 못한다. C) 알람은 지표 임계값 기반이라 시각 스케줄러가 아니다. D) SQS 지연 큐의 최대 지연은 15분이라 24시간 주기 스케줄에 부적합하다.

---

**문제 12.** 신규 배포 직후 API가 200을 반환하지만 사용자 화면의 결제 버튼이 깨져 클릭이 안 된다. 지표상으론 모두 정상이다. 이런 "기술적으로는 작동하지만 사용자에겐 고장"인 상태를 자동 감지하려면?

A) CloudWatch 기본 지표 알람

B) CloudWatch Synthetics 카나리로 실제 사용자 흐름(로그인→결제)을 스크립트로 검증, Visual monitoring으로 화면 깨짐 감지

C) X-Ray 샘플링

D) CloudTrail Data Events

**정답: B**

해설: 지표(200 응답)는 정상인데 사용자 경험은 고장인 상황은 내부 지표(white-box)로는 못 잡는다. **Synthetics**는 합성 카나리가 실제 사용자 흐름을 스크립트로 끝까지 수행하고, Visual monitoring 블루프린트는 스크린샷 픽셀 차이로 레이아웃 깨짐(결제 버튼 깨짐)까지 감지한다 — black-box 모니터링이라 "사용자 관점에서 작동하나"를 검증한다. 이는 "기술적 작동 ≠ 사용자에게 정상"이라는 합성 모니터링의 존재 이유 그 자체다. A) 기본 지표는 화면 깨짐을 모른다.

---

## 정리하며

Week 10의 네 서비스는 "관측하고 반응한다"는 하나의 순환으로 묶인다. CloudWatch가 양적 상태("무엇이 느린가")를, X-Ray가 인과("어디서 느린가")를, CloudTrail이 책임("누가 했는가")을 관측하고, EventBridge가 그 신호에 반응("무엇으로 대응할까")한다. 시험 함정의 대부분은 이 순환 위 어느 지점의 미세한 디테일 — EC2 메모리의 하이퍼바이저 경계, Data Events의 기본 OFF, Annotation의 인덱싱, Lambda 토글 vs EC2 데몬 — 을 묻는다. 개별 기능을 외우는 대신 "이 도구는 무엇을 보고 언제 작동하는가"라는 좌표로 이해하면, 처음 보는 시나리오도 그 좌표 위 어디쯤인지 짚어 답을 찾을 수 있다.

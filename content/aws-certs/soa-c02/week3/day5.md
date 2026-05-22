# Day 5 - Week 3 복습 + 시나리오 10문제

📅 날짜: Week 3 (Day 5)
🎯 주제: Alarms·Dashboards·Agent·Synthetics/RUM/X-Ray 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 3 핵심 개념 한 줄 요약

1. **Alarm 상태 3가지**: OK / ALARM / INSUFFICIENT_DATA. 상태 변경 시 액션 발화
2. **M of N 평가**: EvaluationPeriods 중 DatapointsToAlarm 위반 시 ALARM
3. **Treat Missing Data**: missing(기본) / notBreaching / breaching / ignore
4. **EC2 Auto Recovery는 `StatusCheckFailed_System`만** (호스트 장애), Instance 체크는 재시작
5. **Composite Alarm**: 자식 액션 suppress + 부모만 사람 알림 — 노이즈 감소
6. **Dashboard JSON 본문**: IaC 관리 가능. 3개까지 무료, 이후 $3/월
7. **Cross-Account Observability**: Sink (Monitoring Account) + Link (Source Account)
8. **CloudWatch Agent**: EC2 메모리·디스크·임의 로그 수집. IAM Role + Parameter Store + State Manager
9. **Synthetics**: 합성 모니터링, 새벽에도 동작. RUM은 실 사용자 데이터
10. **X-Ray**: 분산 추적, 기본 5% 샘플링. ServiceLens가 통합 뷰

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | Synthetics | RUM |
|------|------------|-----|
| 측정 방식 | 가상 사용자 시뮬 | 실 사용자 브라우저 |
| 트래픽 없을 때 | 동작 | 동작 안 함 |
| 측정 시점 | 정기 (1분~1시간) | 실시간 |
| 비용 | 실행 횟수 | 이벤트 수 |
| 사용 사례 | 가용성 | UX 분석 |

| 항목 | EC2 Status Check System | Status Check Instance |
|------|-------------------------|----------------------|
| 원인 | AWS 인프라 문제 | 게스트 OS 문제 |
| Auto Recovery | 가능 | 불가 (재시작 필요) |
| 메트릭 | StatusCheckFailed_System | StatusCheckFailed_Instance |

| 항목 | Metric Alarm | Composite Alarm |
|------|--------------|-----------------|
| 평가 대상 | 단일 메트릭 | 여러 알람 조합 |
| 표현식 | Threshold | ALARM("a") AND OK("b") |
| 사용 사례 | 기본 알람 | 노이즈 감소, 복합 조건 |

| 항목 | Container Insights | CloudWatch Agent |
|------|-------------------|------------------|
| 대상 | ECS/EKS | EC2/온프레미스 |
| 컨테이너 메트릭 | 자동 | 별도 설정 |
| 클러스터 가시화 | 자동 대시보드 | 수동 |

---

## 📝 시나리오 10문제

**문제 1.** EC2 인스턴스의 호스트 머신이 하드웨어 장애로 다운됐다. 자동으로 같은 IP·EBS 유지하며 다른 호스트로 옮기려면?

A) StatusCheckFailed_System 메트릭 + EC2 Recover 액션 알람
B) StatusCheckFailed_Instance 알람
C) Auto Scaling 사용
D) 수동 재배포

**정답: A**
해설: `StatusCheckFailed_System` = AWS 인프라 문제, Auto Recovery 가능. IP·EBS 유지 채로 다른 호스트로. Instance 체크는 OS 문제 → 재시작만.

---

**문제 2.** 운영팀이 100개 알람을 받는데 한 사고에 80개가 동시 울려 PagerDuty 노이즈가 심하다. 해결책은?

A) 알람 줄이기
B) Composite Alarm으로 묶고 자식 액션 비활성, 부모만 PagerDuty
C) Threshold 올리기
D) Period 늘리기

**정답: B**
해설: Composite Alarm의 핵심 사용 사례. 자식 알람은 메트릭 추적용으로 두되 액션은 disable, 의미 있는 조합(AND/OR)만 사람에게 통지.

---

**문제 3.** EC2 메모리 사용률 알람을 만들었지만 메트릭이 안 들어온다. 가장 먼저 점검할 것은?

A) 알람 설정
B) CloudWatch Agent 설치 + IAM Role(CloudWatchAgentServerPolicy)
C) Detailed Monitoring
D) AMI 변경

**정답: B**
해설: EC2 메모리는 표준 메트릭 X → Agent 필수. IAM Role에 권한 + Agent 실행 상태 확인.

---

**문제 4.** 회사 멀티 계정 환경에서 모든 계정의 EC2 CPU를 한 대시보드에 표시하려 한다. 어떻게?

A) 각 계정에 별도 대시보드
B) Cross-Account Observability — Monitoring Account에 Sink, Source 계정들에 Link 생성, 위젯에 accountId 명시
C) CloudFormation StackSet
D) 불가능

**정답: B**
해설: Cross-Account Observability 표준. OAM(Observability Access Manager) Sink + Link로 데이터 공유, 대시보드 위젯에 `accountId` 명시.

---

**문제 5.** 새벽 시간대 사이트가 다운된 적이 있었는데 알림이 안 왔다. 가용성을 24시간 모니터링하려면?

A) RUM
B) Synthetics Canary로 1분 주기 heartbeat
C) Logs Insights 스케줄 쿼리
D) CloudWatch Agent

**정답: B**
해설: 새벽엔 실 사용자 트래픽 없으므로 RUM은 무용. Canary는 합성 트래픽으로 24/7 가용성 측정. 실패 시 Synthetics 메트릭 + 알람 → SNS.

---

**문제 6.** 한 알람이 5분 중 1분만 위반해도 트리거된다. 일시적 spike에 알람이 자주 울린다. 노이즈 줄이는 가장 좋은 방법은?

A) Threshold 올리기
B) EvaluationPeriods 5, DatapointsToAlarm 3 같은 M of N 적용
C) Period 줄이기
D) 알람 삭제

**정답: B**
해설: M of N으로 일시적 노이즈 견딤. 5분 중 3분 이상 위반해야만 알람.

---

**문제 7.** Lambda 함수의 분산 추적을 활성화하고 싶다. 가장 간단한 방법은?

A) X-Ray SDK 코드 추가만
B) Lambda 함수 설정의 "Active Tracing" 토글 활성화 + X-Ray SDK는 자동 통합되어 있음
C) CloudWatch Agent 설치
D) 외부 APM 도구 필요

**정답: B**
해설: Lambda의 X-Ray 활성화는 함수 설정 한 줄. 코드에 SDK 통합 없이도 기본 trace는 생성됨. SDK를 코드에 추가하면 더 세밀한 subsegment 가능.

---

**문제 8.** 회사가 X-Ray 비용을 줄이려 한다. 모든 trace를 보지 않더라도 중요 API는 100% 추적하고 싶다. 어떻게?

A) X-Ray 끄기
B) Sampling Rule 추가 — URL 패턴별 FixedRate 조정 (정상 트래픽 1~5%, /premium/* 100%)
C) 리전 변경
D) Logs로 대체

**정답: B**
해설: X-Ray Sampling Rule로 URL/서비스 패턴별 샘플링 비율 조정. 기본 5%인 정상 API는 1%로 더 낮추고, 중요 API만 100%로.

---

**문제 9.** 회사가 100대 EC2 인스턴스에 CloudWatch Agent를 동일 설정으로 배포하고 신규 인스턴스에도 자동 적용하려 한다. 가장 적합한 패턴은?

A) User Data 스크립트
B) SSM Parameter Store에 설정 저장 + State Manager Association으로 태그 기반 지속 적용
C) CloudFormation 한 번
D) 수동 설치

**정답: B**
해설: State Manager Association이 운영 자동화 표준. 태그 기반 대상 + 주기적 점검 + drift 자동 교정. 신규 인스턴스는 태그만 맞으면 자동.

---

**문제 10.** Anomaly Detection 알람을 켰는데 첫 주 동안 한 번도 알람이 안 울렸다. 정상인가?

A) 권한 문제
B) 정상 — Anomaly Detection은 최소 2주 학습 기간이 필요
C) 메트릭 문제
D) 비활성됨

**정답: B**
해설: ANOMALY_DETECTION_BAND는 최소 2주 데이터로 학습. 그 전엔 정상 밴드 산출 불가 → 알람 동작 안 함. 학습 후 정확도 점점 향상.

---

## 🔮 다음 주 예고 (Week 4)

Week 4는 **로깅·감사** — CloudTrail / Config / Audit Manager.

- Day 1: CloudTrail - Management/Data Event, Organization Trail
- Day 2: CloudTrail Lake, Insights, EventBridge 연동
- Day 3: AWS Config - Rule, Conformance Pack, Remediation
- Day 4: Audit Manager, License Manager, Resource Explorer
- Day 5: Week 4 복습 + 시나리오 10문제

> 💡 Week 2-3가 "성능·가용성 모니터링"이었다면 Week 4는 "감사·컴플라이언스 추적". 시험 비중도 큰 영역입니다.

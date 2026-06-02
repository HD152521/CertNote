# Day 5 - Week 4 복습 + 시나리오 10문제

📅 날짜: Week 4 (Day 5)
🎯 주제: CloudTrail·Config·Audit Manager 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 4 핵심 개념 한 줄 요약

1. **CloudTrail = API 호출 감사** (행위 로그). Event History 90일 무료, Trail로 영구 보관
2. **Management Events 기본 ON 무료, Data Events 기본 OFF 유료** (S3/Lambda/DDB 접근)
3. **Organization Trail로 멀티 계정 통합** — 멤버 계정 사용자는 변경 불가
4. **Log File Validation = 변조 감지** — 컴플라이언스 필수
5. **CloudTrail Lake = SQL 분석 데이터 레이크** (10년 보존, 멀티 계정/외부 데이터 통합)
6. **CloudTrail Insights = ML 기반 API 이상 감지** (7일 학습 필요)
7. **EventBridge로 CloudTrail 실시간 대응** — Root 로그인, SG 0.0.0.0/0 등
8. **AWS Config = 리소스 상태 추적 + Rule 평가**. CloudTrail과 보완
9. **Conformance Pack로 산업 컴플라이언스 일괄 배포** (HIPAA/PCI/NIST)
10. **Audit Manager = 증거 수집 자동화 + 보고서 출력**. License Manager = BYOL 강제

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | CloudTrail | AWS Config |
|------|-----------|------------|
| 추적 대상 | API 호출 (행위) | 리소스 구성 (상태) |
| 질문 | "누가 무엇을 했나" | "지금 어떤 상태인가" |
| 비용 | Management 무료 | CI당 $0.003 + Rule |
| 알람 | EventBridge + Metric Filter | Rule 평가 → SNS |

| 항목 | CloudTrail Lake | S3 + Athena |
|------|-----------------|-------------|
| 분석 | 콘솔 직접 SQL | 외부 분석 |
| 보존 | 1~10년 | 영구 (S3) |
| 비용 | Ingest + Query | S3 + Athena scan |
| 외부 데이터 | 가능 | 불가 |

| 항목 | Audit Manager | Config | Trusted Advisor |
|------|---------------|--------|-----------------|
| 목적 | 감사 보고서 자동화 | 컴플라이언스 평가 | 모범 사례 권고 |
| 출력 | PDF/CSV 보고서 | NON_COMPLIANT 목록 | 점검 결과 |
| 자동 교정 | X (보고서만) | Auto Remediation | X |

---

## 📝 시나리오 10문제

**문제 1.** 회사가 S3 버킷의 객체 접근(누가 무엇을 다운로드했는가)을 감사 추적해야 한다. 필요한 설정은?

A) CloudTrail 기본 설정으로 충분
B) CloudTrail Data Events 활성화 + S3 Object 리소스 지정
C) Config Rule
D) Logs Insights

**정답: B**
해설: Management Events는 버킷 생성/삭제 같은 컨트롤 플레인. 객체 GetObject/PutObject는 Data Event로 별도 활성화 필요. 비용 발생.

---

**문제 2.** Root 사용자가 콘솔에 로그인하면 즉시 SNS 알림 + Slack 통보를 자동화하려 한다. 어떤 도구?

A) CloudWatch Alarm
B) EventBridge Rule (CloudTrail 이벤트 패턴) → SNS + Lambda(Slack)
C) Config Rule
D) Audit Manager

**정답: B**
해설: CloudTrail은 EventBridge default bus로 모든 이벤트 자동 전송. Rule에 패턴(userIdentity.type=Root) 매칭 후 여러 Target에 fan-out.

---

**문제 3.** 회사가 "S3 public bucket이 만들어지면 자동 차단"을 운영자 개입 없이 처리하려 한다. 어떤 조합?

A) CloudTrail Insights
B) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation `AWS-DisableS3BucketPublicReadWrite`
C) GuardDuty
D) Macie

**정답: B**
해설: Continuous compliance + auto remediation의 표준 패턴. Config Rule이 평가 → 비준수 발견 → SSM Runbook 자동 실행.

---

**문제 4.** 외부 감사를 위해 1년치 CloudTrail 데이터를 SQL로 분석해야 한다. 가장 적합한 도구는?

A) Event History (90일만)
B) CloudTrail Lake — 콘솔에서 직접 SQL 쿼리, 10년 보존
C) DynamoDB
D) Athena만

**정답: B**
해설: 90일 이상 분석은 Lake 또는 S3+Athena. Lake는 콘솔에서 직접 SQL + 외부 데이터 통합 + 멀티 계정 지원. 별도 ETL 불필요.

---

**문제 5.** 비정상적으로 많은 EC2 RunInstances 호출을 자동 감지하려면?

A) Config
B) CloudTrail Insights - API 호출량 spike 자동 감지 (7일 baseline 학습)
C) Logs Insights
D) Audit Manager

**정답: B**
해설: Insights는 정확히 이 시나리오. ApiCallRateInsight가 baseline 대비 spike 감지. 단, 7일 학습 후 동작.

---

**문제 6.** 회사가 HIPAA 컴플라이언스 증거를 외부 감사관에게 제출해야 한다. 가장 효율적인 도구는?

A) Config 결과를 수동으로 정리
B) Audit Manager의 사전 제공 HIPAA Framework로 Assessment 실행 → 자동 증거 수집 → PDF/CSV
C) CloudTrail
D) Excel

**정답: B**
해설: Audit Manager의 핵심 사용 사례. Framework 선택 → Assessment → 자동 증거 수집 → 보고서. Config/CloudTrail/Security Hub 데이터를 알아서 매핑.

---

**문제 7.** 회사가 멀티 계정에서 비준수 리소스를 한눈에 보려 한다. 어떤 구성?

A) 계정마다 콘솔 들어가기
B) Config Aggregator를 Audit Account에 두고 모든 계정·리전 데이터 통합
C) CloudWatch Dashboard
D) Logs Insights

**정답: B**
해설: Config Aggregator는 멀티 계정·리전 통합 뷰. Audit Account에 위치하는 게 Landing Zone 표준. `describe-aggregate-compliance-by-config-rules`로 통합 조회.

---

**문제 8.** Auto Remediation이 설정됐는데 작동 안 한다. 가장 흔한 원인은?

A) Config Rule 비활성
B) SSM Runbook의 AutomationAssumeRole에 리소스 수정 권한 없음
C) S3 권한
D) KMS

**정답: B**
해설: Auto Remediation = SSM Automation Runbook 실행. Runbook이 IAM Role의 권한으로 동작 → Role에 대상 리소스 수정 권한이 없으면 실패. 흔한 운영 실수.

---

**문제 9.** Microsoft Windows BYOL 라이선스 100코어 초과를 자동 차단하려 한다. 어떤 도구?

A) Config Rule
B) License Manager Configuration + Hard Limit + AMI 연결
C) Trusted Advisor
D) Service Quotas

**정답: B**
해설: License Manager의 정확한 사용 사례. Hard Limit이 켜져 있으면 라이선스 초과 시 EC2 RunInstances 자체 차단.

---

**문제 10.** 회사가 Trail의 무결성을 외부 감사관에게 입증해야 한다. 필요한 기능은?

A) S3 버전 관리
B) Log File Validation - 1시간 단위 다이제스트 파일 + SHA-256 해시
C) MFA Delete
D) S3 암호화

**정답: B**
해설: Log File Validation 활성화 시 다이제스트 파일로 변조 감지 가능. `aws cloudtrail validate-logs`로 외부 감사 시 무결성 입증. 컴플라이언스 필수.

---

## 🔮 다음 주 예고 (Week 5)

Week 5는 CloudOps의 핵심 무기 — **AWS Systems Manager**.

- Day 1: SSM 개요, Agent, Fleet Manager, Inventory
- Day 2: Run Command, State Manager, Maintenance Window
- Day 3: Patch Manager — 베이스라인, 패치 그룹, 컴플라이언스
- Day 4: Parameter Store, Session Manager, Automation Runbook
- Day 5: Week 5 복습 + 시나리오 10문제

> 💡 SSM은 SOA-C02 시험의 또 다른 단일 출제 비중 1위급 서비스. CloudWatch와 함께 가장 중요한 영역입니다.

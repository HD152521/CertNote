# Day 5 - Week 4 복습: CloudTrail·Config·감사 스택 종합

Week 4의 도구들은 CloudWatch와는 다른 질문에 답한다. CloudWatch가 "지금 무슨 일이 일어나고 있는가"를 실시간으로 보여준다면, 이번 주의 도구들은 "과거에 누가 무엇을 했고, 지금 상태가 규정을 준수하며, 그 증거를 외부 감사관에게 어떻게 제출하는가"라는 사후적·규범적 질문을 다룬다. 보안 사고 대응과 컴플라이언스는 실시간 탐지만큼이나 사후 추적과 증거 체계가 중요하다. 오늘은 CloudTrail, CloudTrail Lake, AWS Config, Audit Manager가 어떤 계층을 이루는지 재조명하고, 시험 빈출 시나리오 10개로 마무리한다.

## Week 4 핵심 개념 연결 지도

```
[AWS API 호출 발생]
        │
        ▼
[CloudTrail]  ─→  Event History (90일 무료, 변경 불가)
        │                │
        │                ▼
        │         [S3 Trail]  ─→  Log File Validation (SHA-256 해시 체인)
        │                │              → Athena 쿼리 분석
        │                │              → SIEM 연동 (Splunk, Sumo Logic)
        │                ▼
        │       [CloudTrail Lake]  ─→  SQL 쿼리 (Event Data Store)
        │                │              → 7년 보존 / Organization 통합
        │                │              → 외부 이벤트 수집 가능
        │                ▼
        │       [Insights Events]  ─→  ML: ApiCallRateInsight / ApiErrorRateInsight
        │                              → 7일 baseline 학습 필요
        │
        ▼
[EventBridge default bus]  ─→  Rule 패턴 매칭 → SNS / Lambda / SSM
        (모든 API 호출 자동 전달)
        │
        ▼
[AWS Config]  ─→  Configuration Item (리소스 상태 스냅샷)
        │              → Resource Timeline (변경 이력 시각화)
        │
        ▼
  [Config Rules]  ─→  평가 트리거 (Configuration change | Periodic)
        │              → NON_COMPLIANT 감지
        │              → SNS 알림
        ▼
[Auto Remediation]  ─→  SSM Automation Runbook 자동 실행
        │
        ▼
[Conformance Pack]  ─→  여러 Rule 묶음 (HIPAA/PCI/NIST 기반)
        │              → Organization 전체 배포
        ▼
[AWS Audit Manager]  ─→  Framework → Control → Data Source → Assessment
                         → 자동 증거 수집 (Config/CloudTrail/Security Hub)
                         → PDF/CSV 보고서 출력
```

> 💡 **관련 이론**: 이 스택의 설계는 보안 공학의 **심층 방어(Defense in Depth)** 원칙과 **감사 추적(Audit Trail)** 이론을 구현한다. NIST SP 800-92 "Guide to Computer Security Log Management"는 "누가 무엇을 언제 했는지 항상 재구성 가능해야 한다(accountability)"를 핵심 원칙으로 제시한다. CloudTrail이 이 accountability를 위한 원본 데이터를, Log File Validation이 tamper-evidence를, Config가 상태 추적을, Audit Manager가 컴플라이언스 보고를 담당하는 계층 구조다.

## 핵심 비교표

**CloudTrail vs AWS Config**

| 항목 | CloudTrail | AWS Config |
|------|-----------|------------|
| 추적 대상 | API 호출 (행위) | 리소스 구성 (상태) |
| 질문 | "누가 무엇을 했나" | "지금 어떤 상태인가" |
| 데이터 단위 | Event (JSON) | Configuration Item |
| 보관 | 기본 90일(History), Trail로 영구 | S3에 영구 저장 |
| 비용 | Management 무료, Data $0.10/100K | CI당 $0.003 + Rule $0.001 |
| 알람 연동 | EventBridge 패턴 매칭 → SNS/Lambda | Rule 평가 → SNS 또는 Auto Remediation |
| 변조 감지 | Log File Validation (SHA-256) | 변조 감지 기능 없음 |

**CloudTrail Lake vs S3 Trail + Athena**

| 항목 | CloudTrail Lake | S3 + Athena |
|------|-----------------|-------------|
| 분석 | 콘솔 직접 SQL (Event Data Store ID) | Athena 테이블 + 파티션 설정 |
| 최대 보존 | 7년 (2555일) | 영구 (S3 lifecycle 정책) |
| 쿼리 비용 | 스캔 TB당 $5 | 스캔 TB당 $5 (동일) |
| 외부 이벤트 | 가능 (다른 클라우드, on-prem) | 불가 |
| 멀티 계정 | Organization-enabled EDS | Organization Trail + S3 |
| 운영 부담 | 낮음 (AWS 관리) | 높음 (ETL, 파티션, 스키마 관리) |
| 중복 비용 | 주의: Trail과 동시 사용 시 이중 청구 | Trail만 사용 시 단일 청구 |

> 💡 **관련 이론**: CloudTrail Lake의 컬럼형 저장소 설계는 OLAP(Online Analytical Processing) 데이터베이스의 표준 접근이다. 로우 기반 저장소(OLTP)가 특정 행의 전체 컬럼을 빠르게 읽는 데 최적화된 반면, 컬럼형 저장소는 특정 컬럼(예: `eventName`, `sourceIPAddress`)만 스캔하는 분석 쿼리에서 I/O와 비용을 크게 줄인다. Apache Parquet, Google BigQuery, Amazon Redshift가 같은 원리다. 감사 쿼리는 대부분 "특정 eventName의 모든 행"을 찾는 컬럼 지향 패턴이므로 Lake의 컬럼형 저장이 유리하다.

**Config Rule 평가 트리거 비교**

| 트리거 유형 | 동작 시점 | 적합한 Rule 예시 |
|------------|---------|----------------|
| Configuration change | 리소스 설정 변경 감지 즉시 | `s3-bucket-public-read-prohibited`, `ec2-imdsv2-check` |
| Periodic (1h/3h/6h/12h/24h) | 설정한 주기마다 전체 평가 | `iam-password-policy`, 사용자 목록 기반 Rule |
| Hybrid (둘 다) | 변경 시 + 주기마다 | 변경 후 드리프트도 잡아야 하는 중요 Rule |

> 🔍 **더 깊이**: Configuration change 트리거는 AWS Config가 CloudTrail 이벤트를 소비해서 리소스 변경을 감지하고 CI(Configuration Item)를 생성한 직후 Rule을 평가한다. 따라서 CloudTrail이 정상 동작하지 않으면 Config Rule의 configuration change 트리거도 지연된다. Periodic 트리거는 이 의존성이 없어 Config 서비스 내부 스케줄러로 동작한다. 외부 시스템 상태(Credential report, IAM 사용자 목록)를 기반으로 하는 Rule은 "설정 변경"이 없어도 점검이 필요해 Periodic이 맞다.

**Audit Manager vs Config vs Trusted Advisor**

| 항목 | AWS Config | AWS Audit Manager | AWS Trusted Advisor |
|------|-----------|-------------------|---------------------|
| 주요 역할 | 리소스 상태 평가·Rule 위반 감지 | 컴플라이언스 증거 수집·보고서 자동화 | AWS 모범 사례 권고 |
| 출력물 | Rule 평가 결과, NON_COMPLIANT 목록 | PDF/CSV 감사 보고서, Control별 증거 | 점검 결과, 권고사항 |
| Framework 개념 | Conformance Pack(유사) | 핵심 (HIPAA, PCI-DSS, SOC 2 등) | 없음 |
| 감사관 지원 | 없음 | 감사관 계정 초대·검토 워크플로우 | 없음 |
| 자동 교정 | Auto Remediation O | 없음 (보고서만) | 없음 |
| 비용 | CI + Rule 별도 과금 | Assessment당 과금 | Business/Enterprise Support 포함 |

> 💡 **관련 이론**: Audit Manager가 자동화하는 "지속적 컴플라이언스(Continuous Compliance)" 개념은 NIST SP 800-137 "Information Security Continuous Monitoring"에서 이론적 기반을 가진다. 연 1회 점검식 감사(snapshot audit)에서 상시 증거 수집(continuous evidence collection)으로의 전환이 핵심이다. PCI-DSS v4.0(2022년 출시)은 연속 모니터링을 명시적으로 권고하는 방향으로 바뀌었고, Audit Manager의 Assessment 상시 실행이 이 요구사항을 충족하는 표준 구현이다.

## 다른 클라우드 플랫폼과의 비교

| 기능 | AWS | GCP | Azure |
|------|-----|-----|-------|
| API 감사 로그 | CloudTrail | Cloud Audit Logs | Azure Activity Log |
| 리소스 상태 추적 | AWS Config | Asset Inventory | Azure Resource Graph |
| SQL 감사 분석 | CloudTrail Lake | BigQuery Audit | Log Analytics |
| 컴플라이언스 평가 | Config Rules | Security Command Center | Azure Policy |
| 감사 보고서 자동화 | Audit Manager | Compliance Reports Manager | Microsoft Purview Compliance Manager |
| Organization 감사 | Organization Trail | Org-level Audit Logs | Management Group 정책 |
| 이상 감지 | CloudTrail Insights | Security Command Center AI | Microsoft Sentinel |

> 🔍 **더 깊이**: GCP의 Cloud Audit Logs는 CloudTrail과 유사하지만 Data Access 로그가 기본 비활성화이고, 활성화 시 Cloud Logging 비용에 포함된다는 점이 다르다. Azure Activity Log는 구독 레벨의 컨트롤 플레인 작업을 90일 보관(기본)하며, 장기 보관은 Log Analytics Workspace나 Storage Account로 내보내야 한다는 점이 CloudTrail S3 Trail과 유사하다. 세 플랫폼 모두 "기본 감사 로그는 있지만 데이터 플레인(객체 접근) 로그는 별도 활성화 + 추가 비용"이라는 구조는 동일하다.

## Organization Trail의 내부 동작과 거버넌스 패턴

Organization Trail이 켜지면 멤버 계정에서 발생하는 모든 이벤트가 관리 계정의 S3 버킷으로 집약된다. 멤버 계정 사용자는 이 Trail을 수정하거나 삭제할 수 없다. 이 잠금(lock) 메커니즘이 보안 거버넌스의 핵심이다.

```
[Management Account]
  └─ Organization Trail 생성
       ├─ S3 버킷: s3://org-audit-logs/
       │    └─ Prefix: AWSLogs/{org-id}/{account-id}/
       └─ 멤버 계정 전체에 자동 적용
            ├─ Account A: Trail READ-ONLY (삭제/수정 불가)
            ├─ Account B: Trail READ-ONLY
            └─ Account C: Trail READ-ONLY (신규 계정 자동 적용)
```

> 📚 **사례**: 2021년 국내 SI 기업 B사(공개 사례)는 멤버 계정 담당자가 실수로 Trail을 삭제해 2주간의 감사 로그가 없는 상태가 됐다. 외부 보안 감사에서 이 기간 로그 공백이 발견돼 추가 설명 자료를 수동으로 준비하는 데 상당한 인력이 투입됐다. 이후 Organization Trail을 활성화하고 SCP로 `cloudtrail:DeleteTrail`, `cloudtrail:StopLogging` 액션을 멤버 계정에서 Deny하는 정책을 적용했다. Organization Trail이 존재하더라도 추가 SCP로 Trail 조작을 이중으로 차단하는 것이 표준 거버넌스 패턴이다.

## CloudTrail Insights: ML 기반 이상 감지의 한계와 적합한 사용 사례

Insights는 7일간 과거 데이터를 baseline으로 학습하고, 현재 API 호출량 또는 에러율이 통계적으로 유의미하게 벗어나면 Insight 이벤트를 생성한다. 두 가지 유형이 있다.

- **ApiCallRateInsight**: 특정 API의 호출량이 baseline 대비 spike
- **ApiErrorRateInsight**: 특정 API의 에러율이 baseline 대비 급등

> ⚠️ **함정**: Insights는 **7일 학습 기간이 지나야** 의미 있는 탐지를 한다. 서비스를 막 배포하거나 트래픽 패턴이 완전히 바뀐 직후에는 false positive가 많다. 또한 Insights는 Trail이 활성화된 계정에서만 동작한다. 그리고 Insights 자체도 별도 비용($0.35/100K analyzed events)이다. 소규모 계정에서는 GuardDuty의 CloudTrail 기반 위협 탐지와 비용 효율성을 비교해보는 것이 좋다. GuardDuty는 CloudTrail을 자동으로 분석하고 Findings를 생성한다는 점에서 Insights와 보완 관계다.

> 💡 **관련 이론**: CloudTrail Insights의 ML 알고리즘은 공개되지 않지만, API 호출량 이상 탐지에 적합한 알고리즘은 CUSUM(Cumulative Sum Control Chart)과 EWMA(Exponentially Weighted Moving Average)다. CUSUM은 시계열에서 평균 변화를 누적적으로 감지하는 통계 방법으로, Page(1954)가 제안했다. 소규모 지속적 변화(APT 공격에서 자주 보이는 낮고 느린 데이터 유출)를 감지하는 데 효과적이다. CloudTrail Insights가 밤새 조금씩 이루어진 S3 GetObject 증가를 감지하는 데 이 방식이 쓰일 가능성이 높다.

## Auto Remediation과 SSM Automation의 실패 패턴

Auto Remediation은 Config Rule이 NON_COMPLIANT를 감지했을 때 SSM Automation Runbook을 자동으로 실행한다. 실무에서 "작동 안 한다"는 사례의 90%는 세 가지 원인 중 하나다.

1. **AutomationAssumeRole 권한 부족**: Runbook이 실행될 때 사용하는 IAM Role에 대상 리소스 수정 권한이 없음
2. **Runbook 파라미터 매핑 오류**: Config Rule의 리소스 ARN이 Runbook의 입력 파라미터로 올바르게 전달되지 않음
3. **리소스가 이미 삭제됨**: Rule이 평가한 시점과 Runbook이 실행된 시점 사이에 리소스가 없어짐

> 📚 **사례**: 2023년 금융권 C사는 `s3-bucket-public-read-prohibited` Rule에 Auto Remediation을 연결했다. 테스트 환경에서는 잘 동작했는데 프로덕션에서 작동하지 않았다. 조사 결과 AutomationAssumeRole의 S3 버킷 정책 수정 권한(`s3:PutBucketPublicAccessBlock`)이 테스트 환경 버킷에는 있었지만 프로덕션 버킷에는 Resource ARN 패턴이 달라 권한이 없었다. Config 콘솔의 "Remediation Execution Status" 탭에서 "AutomationExecution failed: Access Denied" 메시지로 원인을 특정했다. AutomationAssumeRole에 `Resource: "*"`를 쓰는 것은 최소 권한 원칙에 어긋나지만, ARN 패턴 실수를 방지하기 위해 규칙별 역할을 분리하는 것이 더 안전하다.

---

## 📝 연습 문제

**문제 1.** 보안팀이 "누가 프로덕션 S3 버킷에서 고객 PII 데이터를 다운로드했는지" 추적해야 한다. 필요한 CloudTrail 설정은?

A) Management Events만 활성화하면 `GetObject`를 포함한 모든 S3 접근이 컨트롤 플레인 이벤트로 기록되어 충분하다
B) S3 Data Events 활성화 — 특정 버킷의 GetObject/PutObject 추적
C) CloudTrail Insights를 활성화해 비정상적 다운로드 spike를 ML로 감지하면 누가 받았는지 식별된다
D) GuardDuty S3 Protection을 켜면 의심스러운 데이터 접근을 Finding으로 만들어 다운로드 주체까지 특정한다

**정답: B**
해설: S3 객체 다운로드(GetObject)는 Data Event다. Management Events는 `PutBucketPolicy`, `CreateBucket` 같은 컨트롤 플레인 작업만 추적한다. Data Events를 대상 버킷에 활성화해야 객체 레벨 접근이 기록된다. 비용($0.10/100K events)이 발생하므로 민감 버킷만 선택적으로 활성화하는 것이 효율적이다.

---

**문제 2.** Root 사용자가 콘솔에 로그인하면 즉시 SNS 알림 + Slack 통보를 자동화하려 한다. 어떤 도구 조합이 가장 적합한가?

A) CloudTrail 로그를 CloudWatch Logs로 보낸 뒤 `{ $.userIdentity.type = "Root" }` Metric Filter + CloudWatch Alarm으로 SNS 발송
B) EventBridge Rule (CloudTrail 이벤트 패턴 `userIdentity.type = Root`) → SNS + Lambda(Slack)
C) Config Rule `root-account-mfa-enabled`로 Root 사용을 평가하고 NON_COMPLIANT 시 SNS로 알림
D) Audit Manager의 Root 접근 Control을 Assessment에 추가해 로그인 발생을 증거로 수집·통보

**정답: B**
해설: CloudTrail은 모든 API 호출(콘솔 로그인 포함)을 EventBridge default bus로 자동 전달한다. EventBridge Rule에서 `userIdentity.type = Root` 패턴을 매칭하면 Root 로그인만 필터링된다. SNS와 Lambda(Slack webhook 호출)를 Target으로 지정하면 실시간 다채널 알림이 가능하다. A의 Metric Filter 경로도 동작은 하지만 CloudTrail→CloudWatch Logs 전송·Metric Filter·Alarm을 거쳐 지연이 크고 Slack 다채널 연동이 번거로워, 이벤트 패턴을 직접 매칭하는 EventBridge가 실시간 다채널 대응의 표준이다. Config Rule은 리소스 상태를 평가하는 도구이고 Audit Manager는 증거 수집·보고용이라 실시간 이벤트 대응에 부적합하다.

---

**문제 3.** 회사가 "S3 public bucket이 만들어지면 자동으로 차단"을 운영자 개입 없이 처리하려 한다. 가장 적합한 조합은?

A) CloudTrail Insights로 퍼블릭 버킷 생성 API의 호출량 spike를 감지해 EventBridge로 차단 Lambda를 트리거
B) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation `AWS-DisableS3BucketPublicReadWrite`
C) GuardDuty S3 Threat Detection으로 퍼블릭 노출을 Finding으로 만들고 자동으로 Public Access Block을 적용
D) Amazon Macie로 퍼블릭 버킷의 민감 데이터를 분류한 뒤 위험 버킷의 퍼블릭 액세스를 자동 차단

**정답: B**
해설: Continuous compliance + auto remediation의 표준 패턴이다. Config Rule이 버킷 설정 변경 시 즉시 평가(Configuration change 트리거) → NON_COMPLIANT 감지 → SSM Runbook `AWS-DisableS3BucketPublicReadWrite` 자동 실행 → 퍼블릭 액세스 차단. GuardDuty는 위협을 탐지하지만 자동 교정 기능이 없다. Macie는 데이터 분류와 PII 탐지 전문이다.

---

**문제 4.** 외부 감사를 위해 1년치 CloudTrail 데이터를 SQL로 분석해야 한다. 가장 적합한 도구는?

A) Event History를 콘솔에서 필터링 — 변경 불가한 90일 이벤트를 CSV로 내보내 외부 SQL 도구로 1년치 분석
B) CloudTrail Lake — 콘솔에서 직접 SQL 쿼리, 7년 보존, ETL 불필요
C) Trail 이벤트를 DynamoDB Streams로 적재한 뒤 PartiQL로 1년치를 쿼리
D) S3 Trail 없이 Athena만 단독으로 띄워 CloudTrail Event History를 직접 테이블로 쿼리

**정답: B**
해설: Event History는 90일만 제공된다. 90일 이상 분석은 Lake 또는 S3+Athena가 필요하다. Lake는 콘솔에서 직접 SQL + 외부 데이터 통합 + 멀티 계정 지원이 가능하고 별도 ETL 파이프라인이 불필요하다. S3+Athena도 유효하지만 파티션 설정, 스키마 관리가 필요하다. 대규모 멀티 계정 환경에서 빠른 분석이 필요하면 Lake가 운영 부담이 낮다.

---

**문제 5.** 비정상적으로 많은 EC2 RunInstances 호출을 자동 감지하려면 어떤 서비스가 가장 적합한가?

A) Config Rule `ec2-instance-no-public-ip`로 신규 인스턴스를 평가해 비정상 생성을 NON_COMPLIANT로 표시
B) CloudTrail Insights (ApiCallRateInsight — 7일 baseline 학습 후 spike 감지)
C) CloudTrail 로그를 CloudWatch Logs로 보내 Logs Insights `stats count(*) by bin(5m)` 쿼리로 RunInstances 급증을 주기적으로 집계
D) Audit Manager의 EC2 Control로 RunInstances 호출을 증거로 수집해 호출량 이상을 보고서로 식별

**정답: B**
해설: CloudTrail Insights는 정확히 이 시나리오를 위해 설계됐다. ApiCallRateInsight가 특정 API(`RunInstances`)의 호출량을 7일 baseline 대비 통계적으로 유의미하게 높아지면 Insight 이벤트를 생성한다. Config Rule은 리소스 상태를 평가하지 호출량 spike를 탐지하지 않는다. 단, 7일 학습 기간이 필요하고 이 기간 동안은 의미 있는 탐지가 안 된다는 점을 인지해야 한다.

---

**문제 6.** 회사가 HIPAA 컴플라이언스 증거를 외부 감사관에게 제출해야 한다. 가장 효율적인 도구는?

A) Config Aggregator의 HIPAA 관련 Rule 평가 결과를 CSV로 내보내 Control별로 수동 매핑·정리
B) Audit Manager의 사전 제공 HIPAA Framework로 Assessment 실행 → 자동 증거 수집 → PDF/CSV 보고서
C) CloudTrail Lake에서 HIPAA 관련 API 호출을 SQL로 추출해 엑셀로 변환한 뒤 감사 증빙으로 제출
D) Trusted Advisor의 보안 점검 결과와 Security Hub 점수를 캡처해 컴플라이언스 증거로 묶어 제출

**정답: B**
해설: Audit Manager의 핵심 사용 사례다. HIPAA Framework를 선택해 Assessment를 활성화하면 Config Rule 결과, CloudTrail API 호출, Security Hub Finding을 각 Control에 자동으로 매핑해 수집한다. 감사 시점에 "보고서 생성" 버튼 클릭만으로 증거가 정리된 PDF/CSV가 나온다. 이 접근이 "지속적 컴플라이언스"의 구현이다.

---

**문제 7.** 멀티 계정에서 비준수 리소스를 한눈에 보려 한다. 어떤 구성이 표준인가?

A) 계정마다 콘솔에 로그인해 Config 대시보드의 NON_COMPLIANT 목록을 확인하고 스프레드시트로 취합
B) Config Aggregator를 Audit Account에 두고 모든 계정·리전 데이터를 통합
C) CloudWatch Cross-Account Observability(OAM)로 각 계정 Config 메트릭을 중앙 대시보드 위젯에 모아 비준수 현황을 표시
D) CloudTrail Lake Organization EDS에 SQL을 돌려 리소스 변경 이벤트로부터 비준수 리소스를 역산

**정답: B**
해설: Config Aggregator는 멀티 계정·리전의 Config 데이터를 단일 뷰로 통합한다. Audit Account에 위치하는 것이 Landing Zone의 표준 패턴이다. `describe-aggregate-compliance-by-config-rules` API로 어떤 계정의 어떤 리소스가 어떤 Rule을 위반하는지 통합 조회할 수 있다. Organizations와 통합하면 신규 계정 추가 시 자동으로 Aggregator에 포함된다.

---

**문제 8.** Auto Remediation이 설정됐는데 NON_COMPLIANT 리소스가 자동으로 교정되지 않는다. 트러블슈팅 순서는?

A) Config Rule을 삭제하고 재생성한 뒤 Remediation을 다시 연결해 평가 캐시를 초기화한다
B) Config 콘솔의 Remediation Execution Status 확인 → AutomationAssumeRole의 IAM 권한 검토 → Runbook 실행 로그 확인
C) Config의 S3 Delivery Channel을 재설정해 Configuration Item 전달 지연으로 인한 교정 실패를 해소한다
D) Configuration Recorder를 중지·재시작해 리소스 상태 기록을 강제로 재동기화한다

**정답: B**
해설: Auto Remediation = SSM Automation Runbook 실행이다. 실패의 90%는 IAM 권한 문제다. Config 콘솔의 Remediation 탭 → "Remediation Execution Status"에서 실패 메시지를 확인한다. "AutomationExecution failed: Access Denied"이면 AutomationAssumeRole에 대상 리소스 수정 권한을 추가한다. Runbook 자체의 오류라면 SSM Automation 콘솔의 Execution 이력에서 상세 로그를 확인한다.

---

**문제 9.** Microsoft Windows BYOL 라이선스 200코어 한도를 초과하면 자동으로 EC2 시작을 차단하려 한다. 어떤 도구가 필요한가?

A) Config Rule로 실행 중인 Windows 인스턴스의 vCPU 합계를 주기적으로 평가해 200코어 초과 시 NON_COMPLIANT로 차단
B) License Manager Configuration + LicenseCountHardLimit = true + AMI 연결
C) Trusted Advisor의 라이선스 점검으로 코어 사용량을 모니터링하고 한도 근접 시 권고로 알림
D) Service Quotas에 Windows 코어 쿼터를 200으로 설정해 초과 RunInstances를 거부

**정답: B**
해설: License Manager의 정확한 사용 사례다. License Configuration을 만들 때 `--license-count-hard-limit` 플래그를 켜면, 해당 AMI로 EC2를 시작할 때 라이선스 카운트가 한도에 도달하면 RunInstances 자체가 실패한다. Hard Limit이 false면 초과 시 알림만 보내고 시작은 허용된다. Config Rule은 이 차단 기능이 없다.

---

**문제 10.** Trail의 무결성을 외부 감사관에게 입증해야 한다. 필요한 기능은 무엇이며, 어떻게 검증하는가?

A) Trail S3 버킷에 버전 관리를 활성화해 모든 로그 파일의 이전 버전을 보존하고 변경 이력으로 무결성을 입증
B) Log File Validation 활성화 → 1시간 단위 digest 파일 + SHA-256 해시 체인 → `aws cloudtrail validate-logs` 명령으로 검증
C) Trail 버킷에 MFA Delete를 활성화해 로그 파일 삭제·덮어쓰기를 차단함으로써 무결성을 보장
D) Trail 로그를 SSE-KMS로 암호화하고 키 정책으로 접근을 제한해 로그가 변조되지 않았음을 입증

**정답: B**
해설: Log File Validation을 활성화하면 CloudTrail이 매 1시간마다 해당 시간의 로그 파일들의 SHA-256 해시를 담은 digest 파일을 생성하고, digest 파일들도 체인 구조로 연결된다. `aws cloudtrail validate-logs --trail-arn ... --start-time ...` 명령으로 어떤 로그도 변조되지 않았음을 수학적으로 입증한다. S3 버전 관리는 삭제된 파일 복원에 도움이 되지만 변조 감지 기능은 없다. MFA Delete는 삭제 보호, KMS 암호화는 기밀성 보호로 목적이 다르다.

---

## Week 5 예고 — CloudOps의 핵심 무기: AWS Systems Manager

Week 5는 CloudWatch와 CloudTrail이 "무슨 일이 일어나고 있나"와 "누가 했나"를 추적한다면, **Systems Manager(SSM)**는 "어떻게 고치고 유지하는가"를 자동화하는 운영 실행 엔진이다.

- Day 1: SSM 개요, Agent 설치 패턴, Fleet Manager, Inventory 수집
- Day 2: Run Command, State Manager(Desired State 강제), Maintenance Window
- Day 3: Patch Manager — 베이스라인, 패치 그룹, 패치 컴플라이언스
- Day 4: Parameter Store(SecureString/KMS), Session Manager(VPN 없는 SSH 대체), Automation Runbook
- Day 5: Week 5 복습 + 시나리오 10문제

SSM은 SOA-C02에서 CloudWatch와 함께 단일 출제 비중 1위급 서비스다. Auto Remediation, Patch Manager, Run Command, Parameter Store는 시험 단골 시나리오다. CloudTrail의 Auto Remediation Runbook, Config의 Remediation Execution, CloudWatch Alarm의 EC2 Action이 모두 SSM과 연결되므로, Week 5가 끝나면 Week 3-5가 하나의 완성된 운영 자동화 루프로 연결된다.

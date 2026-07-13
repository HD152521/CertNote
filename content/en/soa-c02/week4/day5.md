# Day 5 - Week 4 Comprehensive Review: CloudTrail, Config, Audit Stack Integration

Week 4's tools answer different questions than CloudWatch. CloudWatch shows "what's happening now in real-time," but this week's tools answer "historically who did what, is current state compliant, how do we present evidence to external auditors"—retrospective, normative questions. Post-incident response and compliance require both real-time detection and post-incident tracking with evidence systems. Today we review how CloudTrail, CloudTrail Lake, AWS Config, and Audit Manager form layers, then finish with 10 high-frequency exam scenarios.

## Week 4 Core Concept Connection Map

```
[AWS API Call Occurs]
        │
        ▼
[CloudTrail]  →  Event History (90d free, unchangeable)
        │                │
        │                ▼
        │         [S3 Trail]  →  Log File Validation (SHA-256 hash chain)
        │                │              → Athena query analysis
        │                │              → SIEM integration (Splunk, Sumo Logic)
        │                ▼
        │       [CloudTrail Lake]  →  SQL query (Event Data Store)
        │                │              → 7-year retention / Organization integration
        │                │              → External event collection
        │                ▼
        │       [Insights Events]  →  ML: ApiCallRateInsight / ApiErrorRateInsight
        │                              → 7-day baseline learning needed
        │
        ▼
[EventBridge default bus]  →  Rule pattern match → SNS / Lambda / SSM
        (all API calls auto-sent)
        │
        ▼
[AWS Config]  →  Configuration Item (resource state snapshot)
        │              → Resource Timeline (change history visualization)
        │
        ▼
  [Config Rules]  →  Evaluation trigger (Configuration change | Periodic)
        │              → NON_COMPLIANT detection
        │              → SNS alert
        ▼
[Auto Remediation]  →  SSM Automation Runbook auto-execution
        │
        ▼
[Conformance Pack]  →  Multiple Rules bundle (HIPAA/PCI/NIST based)
        │              → Organization-wide deployment
        ▼
[AWS Audit Manager]  →  Framework → Control → Data Source → Assessment
                         → Automated evidence collection (Config/CloudTrail/Security Hub)
                         → PDF/CSV report generation
```

> 💡 **Related Theory**: This stack implements security engineering's **Defense in Depth** principle and **Audit Trail** theory. NIST SP 800-92 "Guide to Computer Security Log Management" states "accountability requires always reconstructable 'who did what when.'" CloudTrail provides raw accountability data, Log File Validation ensures tamper-evidence, Config tracks state, Audit Manager handles compliance reporting—layered responsibility structure.

## Core Comparison Charts

**CloudTrail vs AWS Config**

| Item | CloudTrail | AWS Config |
|------|-----------|------------|
| Tracking target | API calls (action) | Resource configuration (state) |
| Question | "Who did what" | "What state is it in now" |
| Data unit | Event (JSON) | Configuration Item |
| Storage | Default 90d (History), Trail permanent via S3 | S3 permanent storage |
| Cost | Management free, Data $0.10/100K | $0.003/CI + $0.001/1000 Rules |
| Alert integration | EventBridge pattern match → SNS/Lambda | Rule eval → SNS or Auto Remediation |
| Tamper detection | Log File Validation (SHA-256) | No tamper detection |

**CloudTrail Lake vs S3 Trail + Athena**

| Item | CloudTrail Lake | S3 + Athena |
|------|-----------------|-------------|
| Analysis | Console direct SQL (EDS ID) | Athena table + partition setup |
| Max retention | 7 years (2555d) | Unlimited (S3 lifecycle) |
| Query cost | Per TB $5 | Per TB $5 (same) |
| External events | Possible (other clouds, on-prem) | Not possible |
| Multi-account | Organization-enabled EDS | Organization Trail + S3 |
| Operational burden | Low (AWS-managed) | High (ETL, partitions, schema) |
| Dual-use cost | Caution: Trail + Lake = dual billing | Single billing with Trail only |

> 💡 **Related Theory**: Lake's columnar storage is OLAP (Online Analytical Processing) standard. Row-based (OLTP) optimizes reading all columns of specific rows fast; columnar optimizes analytical queries scanning specific columns only. Apache Parquet, BigQuery, Redshift use same. Audit queries mostly "find all rows with eventName = X"—columnar orientation advantages Lake.

**Config Rule Trigger Comparison**

| Trigger Type | Fire Point | Suitable Rule Examples |
|------------|---------|----------------|
| Configuration change | Immediately on resource setting change | `s3-bucket-public-read-prohibited`, `ec2-imdsv2-check` |
| Periodic (1h/3h/6h/12h/24h) | Every configured interval, all resources | `iam-password-policy`, user-list-based Rules |
| Hybrid (both) | On change + periodically | Critical Rule catching both drift + change |

> 🔍 **Deeper Dive**: Config change trigger consumes CloudTrail events, detects resource change, generates CI, then fires Rule. If CloudTrail fails, Config change trigger delays. Periodic trigger has no this dependency—internal Config scheduler. External-system-state Rules (Credential report, IAM user list) need periodic since no "configuration change" event exists.

**Audit Manager vs Config vs Trusted Advisor**

| Item | AWS Config | AWS Audit Manager | AWS Trusted Advisor |
|------|-----------|-------------------|---------------------|
| Primary role | Evaluate state, detect violations | Collect compliance evidence, report | AWS best practice recommendations |
| Output | Rule results, NON_COMPLIANT list | PDF/CSV audit report, Control evidence | Check results, recommendations |
| Framework concept | Conformance Pack (similar) | Core (HIPAA, PCI-DSS, SOC 2 etc.) | None |
| Auditor support | None | Invite auditor account, review workflow | None |
| Auto-remediation | Auto Remediation yes | No (report only) | No |
| Billing | CI + Rule separate | Per Assessment | Business/Enterprise Support included |

> 💡 **Related Theory**: "Continuous Compliance" (NIST SP 800-137) shifts from snapshot audit (annual check) to continuous evidence collection. PCI-DSS v4.0 (2022) explicitly recommends continuous monitoring. Audit Manager's continuous Assessment exactly implements this requirement.

## Organization Trail Internal Operation and Governance Patterns

When Organization Trail activates, all member account events flow to management account S3. Member account users can't modify/delete this Trail. This lock mechanism is core security governance.

```
[Management Account]
  └─ Organization Trail created
       ├─ S3 bucket: s3://org-audit-logs/
       │    └─ Prefix: AWSLogs/{org-id}/{account-id}/
       └─ Auto-applied to all member accounts
            ├─ Account A: Trail READ-ONLY (no delete/modify)
            ├─ Account B: Trail READ-ONLY
            └─ Account C: Trail READ-ONLY (auto-applied on new join)
```

> 📚 **Case Study**: 2021 Korean SI company B (public case). Member account admin accidentally deleted Trail—2 weeks log gap. External security audit discovered this gap, required manual supplementary documentation. Afterward: enabled Organization Trail + SCP denying `cloudtrail:DeleteTrail`, `cloudtrail:StopLogging` to member accounts. Organization Trail + additional SCP double-block is standard governance.

## CloudTrail Insights: ML-Based Anomaly Detection Limits and Appropriate Use Cases

Insights learns 7 days past data as baseline, detects statistically significant current deviation from baseline, generates Insight event. Two types exist.

- **ApiCallRateInsight**: Specific API call rate spikes vs. baseline
- **ApiErrorRateInsight**: Specific API error rate spikes vs. baseline

> ⚠️ **Pitfall**: Insights needs **7+ day learning period** before meaningful detection. Service just deployed or traffic pattern completely changed post-deployment = high false positives. Insights only works where Trail activates. Insights itself costs extra ($0.35/100K analyzed Management Events). Small accounts: compare GuardDuty CloudTrail-based threat detection cost-efficiency vs. Insights. GuardDuty auto-analyzes CloudTrail, generates Findings—complements Insights.

> 💡 **Related Theory**: Insights ML likely uses CUSUM (Cumulative Sum Control Chart) or EWMA (Exponentially Weighted Moving Average). CUSUM detects mean shift cumulatively (Page 1954) effective at catching low-slow changes (APT low-rate data exfil). Insights detecting overnight-accumulated S3 GetObject surge likely employs this statistical approach.

## Auto Remediation and SSM Automation Failure Patterns

Auto Remediation = Config NON_COMPLIANT trigger → SSM Automation Runbook auto-execute. 90% of "doesn't work" cases have 3 root causes.

1. **IAM Permission Insufficient**: `AutomationAssumeRole` lacks permissions Runbook needs. S3 public-block Runbook needs `s3:PutBucketPublicAccessBlock`. Check Config console > Rule > Remediation Execution Status for errors.
2. **Runbook Parameter Mapping Error**: Resource ARN not correctly passed from Config Rule to Runbook input.
3. **Resource Already Deleted**: Between Config evaluation and Runbook execution, resource deleted.

> 📚 **Case Study**: 2023 Korean finance company C. `s3-bucket-public-read-prohibited` Rule + Auto Remediation works in test, fails in prod. Investigation: AutomationAssumeRole's S3 bucket policy modify permission (`s3:PutBucketPublicAccessBlock`) works on test buckets but fails on prod due to resource ARN pattern mismatch. Config console Remediation Execution Status showed "AutomationExecution failed: Access Denied." Fixed by AutomationAssumeRole IAM policy. Hard-coding `Resource: "*"` violates least privilege, but per-rule roles prevent ARN pattern mistakes.

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
해설: CloudTrail은 모든 API 호출(콘솔 로그인 포함)을 EventBridge default bus로 자동 전달한다. EventBridge Rule에서 `userIdentity.type = Root` 패턴을 매칭하면 Root 로그인만 필터링된다. SNS와 Lambda(Slack webhook 호출)를 Target으로 지정하면 실시간 다채널 알림이 가능하다. A의 Metric Filter 경로도 동작은 하지만 지연이 크다. Config와 Audit Manager는 이벤트 대응 도구가 아니다.

---

**문제 3.** 회사가 "S3 public bucket이 만들어지면 자동으로 차단"을 운영자 개입 없이 처리하려 한다. 가장 적합한 조합은?

A) CloudTrail Insights로 퍼블릭 버킷 생성 API의 호출량 spike를 감지해 EventBridge로 차단 Lambda를 트리거
B) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation `AWS-DisableS3BucketPublicReadWrite`
C) GuardDuty S3 Threat Detection으로 퍼블릭 노출을 Finding으로 만들고 자동으로 Public Access Block을 적용
D) Amazon Macie로 퍼블릭 버킷의 민감 데이터를 분류한 뒤 위험 버킷의 퍼블릭 액세스를 자동 차단

**정답: B**
해설: Continuous compliance + auto remediation 표준 패턴이다. Config Rule이 버킷 설정 변경 시 즉시 평가(Configuration change 트리거) → NON_COMPLIANT 감지 → SSM Runbook `AWS-DisableS3BucketPublicReadWrite` 자동 실행 → 퍼블릭 액세스 차단. GuardDuty는 위협을 탐지하지만 자동 교정 기능이 없다. Macie는 데이터 분류 전문이다.

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

## Week 5 Preview — CloudOps' Core Weapon: AWS Systems Manager

Week 5 covers **Systems Manager (SSM)**—while CloudWatch & CloudTrail track "what's happening" and "who did it," SSM automates "how to fix and maintain."

- Day 1: SSM overview, Agent installation, Fleet Manager, Inventory
- Day 2: Run Command, State Manager (Desired State enforcement), Maintenance Window
- Day 3: Patch Manager—baselines, patch groups, compliance
- Day 4: Parameter Store (SecureString/KMS), Session Manager (VPN-less SSH), Automation Runbook
- Day 5: Week 5 review + 10 scenario questions

SSM ranks 1st in single-service exam weight with CloudWatch on SOA-C02. Auto Remediation Runbook, Patch Manager, Run Command, Parameter Store are frequent scenarios. Auto Remediation (Config's Runbook), Patch Manager (state enforcement), Run Command (operational automation) link Weeks 3-5 into single complete operations automation loop.

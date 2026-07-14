# Day 3 - AWS Config: Closed-Loop Control Principles for State Recording, Drift Detection, and Automated Remediation

The day after infrastructure is defined as code and deployed, someone in the console changes a line in a security group by hand. That one line becomes an incident days later. The most persistent problem in cloud operations is this: "The declared state (desired state) and actual state (actual state) diverge over time" — this is drift. AWS Config addresses this problem directly: "Record every change in every resource without exception, continuously evaluate whether it complies with policy, and when it deviates, automatically restore it." From the console, Config looks like a "service that shows resource inventory and compliance scores," but beneath that lie the concepts of feedback control from control theory, the history of configuration management, and declarative policy evaluation. Today we examine how Config records every change as Configuration Items, how Rules evaluate compliance, how Remediation uses SSM Automation to auto-correct drift, and where the costs and pitfalls lie.

In the DOP exam, Config appears as the core of "compliance evaluation + automated drift remediation," with scenarios like "to instantly correct specific policy violations without human intervention," "to deploy multiple standards at once across the organization," and "to view compliance across multiple accounts and regions from one place." Distinguishing the 3 Rule types (Managed/Custom Lambda/Custom Policy), connecting Remediation to SSM Automation, and understanding Conformance Packs and Aggregators reveals the answers.

## Configuration Management and Closed-Loop Control — Config's Philosophical Roots

Config's concept is not new. **Configuration Management** originated as a discipline in the 1950s U.S. defense and aerospace industries: "track the state of all components in complex systems and maintain control so that they never deviate from the approved baseline." Transitioning to software, tools like CFEngine (1993), Puppet (2005), Chef (2009), and Ansible (2012) implemented this by "converging and maintaining servers toward their declared state."

The common principle underlying these tools is **closed-loop control**. In control theory, a closed-loop (feedback control) system ①compares the goal state (setpoint) with ②the measured actual state, ③calculates the error, and ④manipulates in the direction that reduces that error. A thermostat is the classic example — it compares the set temperature with actual temperature and turns the heater on and off.

AWS Config applies this closed loop to infrastructure precisely. The **goal state** is the Config Rule (policy), the **measurement** is the Configuration Recorder (state recording), the **error judgment** is Rule evaluation (COMPLIANT/NON_COMPLIANT), and the **manipulation** is Remediation (automated correction). When drift occurs, an error is detected and Remediation restores the actual state to the goal — just as a thermostat restores a room to its set temperature.

> 💡 **Related Theory**: Configuration management tools broadly share **convergent** and **idempotent** semantics. Idempotency is the property that "applying the same operation multiple times produces the same result as applying it once" (mathematically, `f(f(x)) = f(x)`), as in Ansible's "if already at goal state, do nothing." Config's Remediation must also be idempotent — executing the SSM document that corrects NON_COMPLIANT states multiple times must have no side effects. Another key distinction is **imperative ("execute these commands") vs. declarative ("reach this state")**. Config is strictly declarative — it declares only the goal "S3 must be encrypted," leaving how to reach it to Remediation. Declarativeness's advantage is that it converges toward the goal regardless of the current state.

## Configuration Item — Point-in-Time Snapshots of Every Change

The foundation of Config is the **Configuration Item (CI)**. A CI is a snapshot capturing a resource's state at one point in time — including attributes, relationships (which SG, subnet, and EBS this EC2 is attached to), metadata, and even the CloudTrail event that triggered the change. Each time a resource changes, a new CI is created, forming a **Configuration History**. This history is stored in S3 and can trigger SNS notifications on change.

CIs are powerful because of the **time axis**. "What state was this security group in 6 months ago?" and "what changed just before this modification?" become answerable. This is the foundation for incident forensics and change auditing.

> 🔍 **Deeper**: Config recording **relationships** between resources is more important than just recording attributes. A CI captures graph structure: "EC2 i-xxx is attached to SG sg-yyy, located in subnet subnet-zzz, has EBS vol-www attached." This constructs a **resource dependency graph** rather than a simple list. Queries like "what resources are affected if we delete this SG?" and "what is in this subnet?" become possible. This is Config's cloud-native implementation of a **CMDB (Configuration Management Database)** — the central repository of IT assets and relationships defined by ITIL. This is why Advanced Query (coming next) can query this graph with SQL.

> ⚠️ **Pitfall**: Don't confuse Config with CloudTrail. **CloudTrail** records "who called what API when" (behavior/audit log), while **Config** records "what state did the resource end up in as a result" (state/configuration). "Who changed this SG?" is CloudTrail; "what rules did this SG have then and now?" is Config. They're complementary — CIs link to the CloudTrail events that caused the change, giving you the complete picture: "who → did what → to what state." In exams: "track resource state changes and compliance" is Config; "audit API calls and users" is CloudTrail.

## Config Rule — Three Types of Policy Evaluation

Config Rules evaluate whether resources comply with policy. There are three types, and this distinction appears directly in exams.

| Type | Defined How | When |
|------|----------|------|
| **AWS Managed Rule** | AWS-provided (hundreds) | Standard policies — review first |
| **Custom Lambda Rule** | Evaluation logic written in Lambda | Complex custom logic, external calls needed |
| **Custom Policy Rule** | Guard DSL declaratively defined policy | Policy expressed as code without Lambda (2021+) |

Representative Managed Rules: `s3-bucket-public-read-prohibited`, `encrypted-volumes`, `iam-password-policy`, `restricted-ssh`, `root-account-mfa-enabled`, `rds-storage-encrypted`.

Evaluation triggers are two-fold. A **Configuration change trigger** evaluates every time a resource changes (near-real-time), while a **Periodic trigger** evaluates on a fixed schedule (e.g., 24 hours). Rules depending on external state should use periodic evaluation, while rules that need to catch violations immediately should use change triggers.

> 🔍 **Deeper**: Why **Custom Policy Rule's Guard DSL** matters. **CloudFormation Guard** is a domain-specific language expressing policy declaratively (policy-as-code) like `Resources.*[ Type == "AWS::S3::Bucket" ] { Properties.BucketEncryption EXISTS }` saying "resources of this type must have this property." It's in the lineage of Kubernetes's **OPA (Open Policy Agent)/Rego**, HashiCorp's **Sentinel**, and other policy engines. The key value is "instead of writing evaluation logic in Lambda code (imperative), express policy declaratively so humans can read, verify, and version-control it." Guard rules can be reused in both pre-deployment (checking templates with `cfn-guard validate` in CI/CD) and post-deployment (evaluating real resources as Config Custom Policy Rules), unifying "shift-left" (blocking before deploy) and "runtime evaluation" under one policy language.

```
rule s3_bucket_must_be_encrypted {
  Resources.*[ Type == "AWS::S3::Bucket" ] {
    Properties.BucketEncryption EXISTS
  }
}
```

## Conformance Pack — Bundled Policy Deployment

Deploying rules one-by-one isn't realistic for dozens of rules across hundreds of accounts. A **Conformance Pack** bundles multiple Config Rules + Remediation into a single YAML and deploys them all at once. Pre-defined packs are provided (PCI DSS, NIST 800-53, FedRAMP, HIPAA, AWS Well-Architected, etc.), and custom YAMLs are also supported.

```yaml
Resources:
  S3PublicProhibitedRead:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-public-read
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      Scope:
        ComplianceResourceTypes: [AWS::S3::Bucket]
```

```bash
aws configservice put-conformance-pack --conformance-pack-name security-baseline \
  --template-s3-uri s3://conformance-packs/security-baseline.yaml
```

> 🔍 **Deeper**: Conformance Pack **internally uses CloudFormation StackSets** for org-wide deployment. That is, "define a rule bundle, then StackSets pushes it identically to each account and region." So Conformance Pack inherits StackSets' deployment model (parallel/sequential, failure tolerance thresholds). To clarify the relationship: **StackSets** is a general-purpose tool for multi-account deployment of any CloudFormation resources, while **Conformance Pack** is a specialized abstraction on top for "Config Rule + Remediation bundles." In exams: "deploy PCI/NIST compliance bundles org-wide" is Conformance Pack; "deploy arbitrary infrastructure resources multi-account" is StackSets.

## Auto-Remediation — The Manipulation Phase That Closes the Loop

Evaluation alone doesn't close the loop. When NON_COMPLIANT is found, it must actually be fixed. Config's **Remediation** links a Rule to an **SSM Automation Document**, executing that document when a violation is found to correct the state.

```bash
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName":"s3-bucket-public-read-prohibited",
    "TargetType":"SSM_DOCUMENT",
    "TargetId":"AWS-DisableS3BucketPublicReadWrite",
    "Parameters":{
      "AutomationAssumeRole":{"StaticValue":{"Values":["arn:aws:iam::...:role/RemediationRole"]}},
      "S3BucketName":{"ResourceValue":{"Value":"RESOURCE_ID"}}
    },
    "Automatic":true,
    "MaximumAutomaticAttempts":5,
    "RetryAttemptSeconds":60
  }]'
```

If `Automatic: true`, violations are corrected immediately upon detection; if `false`, an operator triggers correction manually from the console. `MaximumAutomaticAttempts` and `RetryAttemptSeconds` control retry behavior.

> ⚠️ **Pitfall**: Auto-Remediation has dangerous scenarios — **fix-violate loops (flapping)**. If some external process keeps returning a resource to NON_COMPLIANT state (e.g., another automation opens an SG, Config closes it, another opens it again...), Config attempts endless corrections, causing API throttling, cost explosion, and noise. `MaximumAutomaticAttempts` is the safety valve that stops this loop. Also, Remediation can be **destructive** — "force S3 buckets private" can break legitimate public website buckets. So production often puts exception tags on important resources or makes destructive remediations `Automatic:false` requiring human approval. In exams, "auto-remediation repeats endlessly" usually answers to "external process keeps violating + MaximumAutomaticAttempts not set."

> 📚 **Case Study**: A famous incident illustrating drift and bad remediation is GitLab's 2017 database deletion. An engineer manually deleting a production database directory while responding to a replication delay found that all five backup mechanisms failed, losing ~6 hours of data. The core lesson: "manual intervention is the enemy of configuration management, and safety nets (backups, validation) must be verified to actually work at all times." This is Config's value — it constantly evaluates that safety nets themselves (backup settings, encryption, replication) are enabled (e.g., `db-instance-backup-enabled` rule), catching NON_COMPLIANT immediately and auto-correcting. The philosophy is "don't trust that safety nets are on; prove they're on at all times" — this is the spirit of closed-loop compliance.

## Aggregator — Unified Multi-Account, Multi-Region View

Since Config is per-account and per-region, viewing organization-wide compliance requires an **Aggregator**. Create an Aggregator in the Audit account with Organization as source, and all member accounts' Config data across all regions becomes unified.

```bash
aws configservice put-configuration-aggregator --configuration-aggregator-name org-aggregator \
  --organization-aggregation-source RoleArn=arn:aws:iam::...:role/AWSConfigOrgRole,AllAwsRegions=true
```

## Advanced Queries — SQL Queries Over Inventory

**Advanced Query** queries Config data with SQL DSL. Similar syntax to CloudWatch Logs Insights, and cross-account queries are possible via Aggregator.

```sql
SELECT
  configuration.targetResource.resourceType,
  COUNT(*) as count
WHERE configuration.complianceType = 'NON_COMPLIANT'
GROUP BY configuration.targetResource.resourceType
```

This is the interface that makes the resource dependency graph (CMDB) queryable — "how many unencrypted EBS volumes are in which accounts" is answered in one query.

## Config + EventBridge — Routing Compliance Changes

Config emits events to EventBridge when compliance state changes. These can be routed to Slack alerts, Lambda, or SSM (a more flexible path than Remediation alone).

```json
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {"newEvaluationResult": {"complianceType": ["NON_COMPLIANT"]}}
}
```

## Cost Control — recordingMode

Config charges **per resource change (CI creation)**. Frequently-changing resources (e.g., EC2 constantly spawned and terminated by Auto Scaling, frequently-refreshed metadata) drive up costs. **recordingMode** controls whether to record all resources, only certain types, or bundle high-frequency resources by day.

> 💡 **Related Theory**: This cost structure exemplifies **observability's fundamental tradeoff** — "the more you record, the better you see, but the more it costs" — the same thinking as **sampling** in distributed tracing (keeping only some traces). With Config, you must choose between "record every change flawlessly (full audit trail, high cost)" and "record only important resources (low cost, blind spots)." The practical pattern is: record must-comply resources (IAM, S3, SG) completely, and exclude noisy, regulation-agnostic resources. The principle "observability isn't free" sits at the core of Config's cost design.

## Config vs Security Hub Standards

| | AWS Config | Security Hub Standards |
|---|-----------|------------------------|
| Role | Resource state recording + rule evaluation + auto-remediation engine | Curated, integrated Config Rules into security dashboard |
| Relationship | Underlying engine | Leverages Config Rules internally |
| Standalone | Yes | Depends on Config |

As seen in Day 2, many Security Hub Standards controls run Config Rules internally. Config is the evaluation engine, and Security Hub is the layer above that consolidates and visualizes results in ASFF.

> 🎯 **Scenario**: "Organization-wide (OU): ① all S3 buckets in all new/existing accounts must not be public and must be encrypted, auto-corrected instantly; ② EBS must be encrypted ③ view non-compliant resources across all accounts/regions in Audit account; ④ custom policy (tags mandatory) without Lambda; ⑤ protect against endless auto-remediation loops." → ① S3 public/encryption Managed Rules bundled in Conformance Pack deployed to OU via StackSets + SSM Automation Remediation (`Automatic:true`) on each rule; ② `encrypted-volumes` Managed Rule + Remediation; ③ Audit account Organization Aggregator (AllAwsRegions) + Advanced Query; ④ tag-mandatory policy as Custom Policy Rule (Guard DSL); ⑤ Remediation with `MaximumAutomaticAttempts`/`RetryAttemptSeconds` + exception tags on justified resources. Compliance changes routed via EventBridge to Slack alerts.

## Summary

Today we saw four key points. First, **Config applies closed-loop control to infrastructure** — goal (Rule), measurement (Recorder), error judgment (evaluation), and manipulation (Remediation) following the thermostat model, standing in the lineage of declarative, idempotent configuration management (Puppet/Chef/Ansible). Second, **Configuration Item records resource point-in-time state and relationship graph (CMDB)**. This complements CloudTrail's API-call focus by handling resource state. Third, **Rules come in 3 types: Managed/Custom Lambda/Custom Policy (Guard DSL, OPA/Sentinel lineage)**; Conformance Packs bundle via StackSets; Remediation closes the loop via SSM Automation, preventing flapping and destructive fixes with `MaximumAutomaticAttempts` and exception tags. Fourth, **Aggregator unifies multi-account/region**, Advanced Query enables SQL, recordingMode manages observability cost tradeoffs, and Security Hub Standards leverages Config as the underlying evaluation engine.

Next we'll extend compliance into **automated audit evidence collection, data classification, and vulnerability scanning** via Audit Manager, Macie, and Inspector.

---

## 📝 연습 문제

**문제 1.** AWS Config가 구현하는 "목표 상태(Rule)와 실제 상태(Recorder)를 비교해 오차(NON_COMPLIANT)를 검출하고 자동으로 되돌린다(Remediation)"는 구조의 제어 이론적 이름은?

A) 개루프(open-loop) 제어

B) 폐루프(closed-loop / feedback) 제어 — 온도조절기처럼 목표와 측정을 비교해 오차를 줄이는 방향으로 조작

C) 무상태(stateless) 처리

D) 배치 처리

**정답: B**

해설: Config는 폐루프(피드백) 제어를 인프라에 적용한다. 목표 상태(Config Rule), 측정(Configuration Recorder), 오차 판정(COMPLIANT/NON_COMPLIANT 평가), 조작(Remediation)이 온도조절기 모델 그대로다 — 드리프트가 생기면 오차가 검출되고 Remediation이 실제 상태를 목표로 수렴시킨다. 이는 선언형·멱등 형상 관리(Puppet/Chef/Ansible 계보)의 사상이다. 개루프(A)는 피드백이 없는 제어이고, 무상태(C)·배치(D)는 무관하다.

---

**문제 2.** "누가 이 보안 그룹을 언제 바꿨나"와 "그 보안 그룹이 6개월 전 어떤 규칙을 가졌나"를 각각 답하는 서비스는?

A) 둘 다 CloudTrail

B) 둘 다 Config

C) "누가 바꿨나"는 CloudTrail(API 호출·행위 감사), "과거 상태가 어땠나"는 Config(리소스 상태·형상 기록)

D) 둘 다 GuardDuty

**정답: C**

해설: CloudTrail은 "누가 무슨 API를 언제 호출했나"(행위·감사 로그)를, Config는 "리소스가 그 결과 어떤 상태가 됐나"(상태·형상, Configuration History)를 기록한다. 둘은 보완 관계로, Config의 CI는 변경을 일으킨 CloudTrail 이벤트를 연결해 "누가→무엇을→어떤 상태로"의 전체 그림을 준다. "리소스 상태 변화·컴플라이언스"는 Config, "API 호출·사용자 추적"은 CloudTrail이다. 둘을 한 서비스로 보는 A·B·D는 틀리다.

---

**문제 3.** Lambda 함수를 작성하지 않고, 정책을 선언적 코드로 표현해 Config Rule로 평가하려 한다. 올바른 선택과 그 계보는?

A) Custom Lambda Rule

B) Custom Policy Rule (CloudFormation Guard DSL) — OPA/Rego, HashiCorp Sentinel과 같은 policy-as-code 계보로, 배포 전(cfn-guard) 검사와 런타임 평가에 같은 룰 재사용 가능

C) Managed Rule만 가능

D) Conformance Pack

**정답: B**

해설: Custom Policy Rule은 CloudFormation Guard DSL로 정책을 선언적으로 기술한다(`Resources.*[Type=="AWS::S3::Bucket"]{Properties.BucketEncryption EXISTS}`). 이는 Kubernetes의 OPA/Rego, HashiCorp Sentinel과 같은 policy-as-code 계보로, Lambda 코드(명령형) 없이 사람이 읽고 버전 관리할 수 있다. 같은 Guard 룰을 배포 전 템플릿 검사(cfn-guard, shift-left)와 배포 후 런타임 평가에 재사용한다. Custom Lambda(A)는 코드 작성이 필요하고, Conformance Pack(D)은 규칙 묶음 배포 단위이지 평가 방식이 아니다.

---

**문제 4.** PCI DSS·NIST 800-53 같은 컴플라이언스 규칙 묶음을 조직 전체(OU)에 일괄 배포하려 한다. 올바른 도구와 그 내부 메커니즘은?

A) 규칙을 계정마다 하나씩 수동 생성

B) Conformance Pack — 여러 Config Rule + Remediation을 YAML로 묶어 내부적으로 CloudFormation StackSets를 통해 OU 전체에 배포

C) Aggregator

D) Advanced Query

**정답: B**

해설: Conformance Pack은 여러 Config Rule과 Remediation을 하나의 YAML로 묶어 배포하는 단위로, 사전 정의 팩(PCI/NIST/HIPAA/FedRAMP 등)과 사용자 정의 모두 지원한다. 내부적으로 CloudFormation StackSets를 사용해 각 계정·리전에 동일하게 푸시하므로 StackSets의 배포 모델을 물려받는다. "컴플라이언스 묶음을 OU 전체에"는 Conformance Pack, "임의 인프라 리소스 멀티 계정 배포"는 StackSets다. 수동 생성(A)은 비현실적이고, Aggregator(C)는 조회 통합, Advanced Query(D)는 SQL 질의로 배포 도구가 아니다.

---

**문제 5.** 자동 Remediation을 켰는데 같은 리소스가 끊임없이 수정-재위반을 반복(flapping)하며 API 스로틀과 비용 폭증이 일어난다. 원인과 안전장치는?

A) 정상 동작이므로 무시

B) 외부 프로세스가 계속 리소스를 NON_COMPLIANT로 되돌리는 상황 + MaximumAutomaticAttempts 미설정이 원인 — MaximumAutomaticAttempts·RetryAttemptSeconds로 재시도를 제한하고, 정당한 예외엔 제외 태그를 둔다

C) Config를 끈다

D) 리전을 바꾼다

**정답: B**

해설: 어떤 외부 자동화가 계속 리소스를 위반 상태로 되돌리면 Config가 무한 수정을 시도해 flapping이 발생한다. MaximumAutomaticAttempts와 RetryAttemptSeconds가 이 루프를 끊는 안전장치다. 또 Remediation이 정당한 리소스(예: 의도된 퍼블릭 웹사이트 버킷)를 망가뜨리지 않도록 예외 태그를 두거나, 파괴적 수정은 Automatic:false로 사람 승인을 끼운다. "자동 수정이 무한 반복"의 답은 보통 "외부에서 계속 위반 + MaximumAutomaticAttempts 미설정"이다. Config 비활성화(C)·리전 변경(D)은 해결이 아니다.

---

**문제 6.** 50개 계정 × 모든 리전의 NON_COMPLIANT 리소스를 Audit 계정 한 화면에서 조회하고, "암호화 안 된 EBS가 어느 계정에 몇 개인가"를 한 쿼리로 답하려 한다. 올바른 조합은?

A) 각 계정 콘솔을 일일이 확인

B) Audit 계정에 Organization Aggregator(AllAwsRegions) 설정 + Advanced Query(SQL DSL)로 cross-account 질의

C) Conformance Pack만 배포

D) EventBridge 규칙만 생성

**정답: B**

해설: Config는 리전·계정별이라 통합 조회엔 Aggregator가 필요하다. Audit 계정에 Organization 소스 Aggregator를 만들고 AllAwsRegions로 모든 리전을 묶으면 전 계정·리전 데이터가 통합된다. 그 위에서 Advanced Query(SQL DSL)로 "complianceType='NON_COMPLIANT'인 리소스를 타입별 COUNT" 같은 cross-account 질의를 한 번에 실행한다. 이는 리소스 의존성 그래프(CMDB)를 질의 가능하게 만드는 인터페이스다. 수동 확인(A)은 비현실적, Conformance Pack(C)은 배포, EventBridge(D)는 라우팅으로 통합 조회 도구가 아니다.

---

**문제 7.** AWS Config 비용이 예상보다 크게 나왔다. Auto Scaling으로 끊임없이 생성·삭제되는 EC2와 빈번히 갱신되는 메타데이터가 주범으로 보인다. 올바른 통제는?

A) Config를 완전히 끈다

B) recordingMode로 기록 범위를 조절 — 컴플라이언스가 강제되는 리소스(IAM·S3·SG)는 빠짐없이, 노이즈 많고 규제 무관한 자주 바뀌는 리소스는 제외하거나 일별로 묶기

C) 인스턴스 타입을 키운다

D) 리전을 줄인다

**정답: B**

해설: Config는 리소스 변경(CI 생성)당 과금되므로 자주 바뀌는 리소스가 비용을 키운다. 이는 관측 가능성의 근본 트레이드오프("더 많이 기록할수록 잘 보이지만 비싸다", 분산 추적의 샘플링과 같은 발상)다. recordingMode로 모든 리소스 기록 vs 선택 기록 vs 고빈도 리소스 일별 묶기를 골라, 규제 대상 리소스는 빠짐없이 기록하고 규제 무관 노이즈는 제외하는 선별이 실무 패턴이다. Config 비활성화(A)는 컴플라이언스 사각지대를 만들고, 인스턴스 타입(C)·리전 축소(D)는 근본 원인과 무관하다.

---

## 📌 Today's Summary

Today's key points were four-fold. First, Config applies closed-loop (feedback) control to infrastructure — goal (Rule), measurement (Recorder), error judgment (evaluation), and manipulation (Remediation) follow the thermostat model, standing in the lineage of declarative, idempotent configuration management. Second, Configuration Item records both point-in-time resource state and relationship graph (CMDB), complementing CloudTrail's audit of "API calls" with management of "resource state." Third, Rules come in 3 types: Managed/Custom Lambda/Custom Policy (Guard DSL, OPA/Sentinel lineage); Conformance Pack bundles via StackSets; Remediation closes the loop via SSM Automation while preventing flapping and destructive fixes with `MaximumAutomaticAttempts` and exception tags. Fourth, Aggregator unifies multi-account/region viewing, Advanced Query enables SQL querying, recordingMode controls observability cost tradeoffs, and Security Hub Standards uses Config as the underlying evaluation engine.

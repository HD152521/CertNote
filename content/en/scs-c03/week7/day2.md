# Day 2 - AWS Config: Configuration Items and Records, Rules (Managed/Custom Lambda), Conformance Pack, Auto-Remediation

If CloudTrail records "who did what" (activity), **AWS Config** records "what state is the resource in *right now* and at each point *in the past*" (configuration). They are complementary. In breach investigation, CloudTrail shows an `AuthorizeSecurityGroupIngress` call, but AWS Config shows that rule opened security group to 0.0.0.0/0:22 and *sustained that state for days* — the state and timeline.

For security exams, Config is the core tool for "regulatory compliance assessment," "configuration drift detection," and "enforcing desired state (auto-remediation)."

## Configuration Item and Configuration Recorder

Config's basic unit is **Configuration Item (CI)** — a snapshot of one resource at a specific point in time, containing attributes, relationships, related events, and metadata. Each time a resource changes, a new CI is created, forming a **configuration timeline**.

```json
{
  "configurationItemCaptureTime": "2026-06-24T08:00:00Z",
  "resourceType": "AWS::EC2::SecurityGroup",
  "resourceId": "sg-0abc123",
  "configurationItemStatus": "OK",
  "configuration": {
    "ipPermissions": [
      { "ipProtocol": "tcp", "fromPort": 22, "toPort": 22,
        "ipRanges": [{ "cidrIp": "0.0.0.0/0" }] }
    ]
  },
  "relationships": [
    { "resourceType": "AWS::EC2::Instance", "resourceId": "i-0def456",
      "relationshipName": "Is associated with" }
  ]
}
```

**Configuration Recorder** determines which resource types are recorded. You configure whether to record all resources, specific types only, and whether to include global resources (IAM etc.). Recorded CIs, snapshots, and change history flow via **delivery channel** to S3 bucket and SNS notifications.

> ⚠️ **Pitfall**: Config is a *regional service*. You must enable recorder in each region to record that region's resources. Also, global resources like IAM and CloudFront are recorded in only one region (usually us-east-1) to avoid duplication. "Config enabled but multi-region resources not evaluated" typically means per-region recorder not configured.

> 💡 **Related Theory**: Config's concept is *infrastructure as a state machine*. Every resource is a state machine changing over time, and Config records those state transitions like event sourcing. This enables "time travel" — querying "what state was this resource in 2 weeks ago" — the foundation of compliance audits and incident investigations.

## Config Rules: Compliance Assessment

**Config Rule** evaluates whether a resource satisfies the desired state, marking it `COMPLIANT` or `NON_COMPLIANT`. Evaluation triggers are two:
- **Configuration change triggered**: When CI is created/modified.
- **Periodic**: At configured intervals (1 hour to 24 hours).

Rules have three sources:
1. **AWS Managed Rules**: Hundreds of AWS-provided pre-defined rules (e.g., `s3-bucket-public-read-prohibited`, `encrypted-volumes`, `iam-password-policy`, `restricted-ssh`).
2. **Custom Lambda Rules**: Write evaluation logic directly in Lambda.
3. **Custom Policy Rules**: Write with Guard (policy language) without code.

```python
# Custom Lambda rule: Evaluate if EBS volume is encrypted with specific KMS key
import boto3, json

REQUIRED_KEY = "arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb"

def lambda_handler(event, context):
    invoking = json.loads(event["invokingEvent"])
    ci = invoking["configurationItem"]
    config = boto3.client("config")

    compliance = "NOT_APPLICABLE"
    if ci["resourceType"] == "AWS::EC2::Volume":
        cfg = ci["configuration"]
        if cfg.get("encrypted") and cfg.get("kmsKeyId") == REQUIRED_KEY:
            compliance = "COMPLIANT"
        else:
            compliance = "NON_COMPLIANT"

    config.put_evaluations(
        Evaluations=[{
            "ComplianceResourceType": ci["resourceType"],
            "ComplianceResourceId": ci["resourceId"],
            "ComplianceType": compliance,
            "OrderingTimestamp": ci["configurationItemCaptureTime"],
        }],
        ResultToken=event["resultToken"],
    )
```

> 🎯 **Scenario**: "Evaluate organization-specific rules AWS managed rules cannot express (e.g., all EBS must encrypt with *specific* CMK)." Answer: Custom Lambda rule or Custom Policy (Guard) rule. Just "is it encrypted" is fine with managed `encrypted-volumes`, but *specific key* enforcement needs custom.

## Conformance Pack: Bundled Rules and Remediation Deployment

Managing rules one-by-one is inefficient across many accounts and regions. **Conformance Pack** bundles Config rules and remediation actions into **one YAML template** for unified deployment and management. AWS provides **sample conformance packs** for PCI-DSS, HIPAA, NIST, CIS, FedRAMP etc.

```yaml
Resources:
  S3PublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
  EncryptedVolumes:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: encrypted-volumes
      Source:
        Owner: AWS
        SourceIdentifier: ENCRYPTED_VOLUMES
```

Combined with Organizations, **organization conformance pack** deploys the same rule set to all member accounts, with delegated administrator viewing aggregated compliance status.

> 💡 **Related Theory**: Conformance pack is *compliance as code* — replacing humans checking control items via checklist with machines continuously evaluating via code. This is *continuous compliance* — evaluation at each change, not annual audit snapshots. This connects to NIST 800-137 ISCM (Information Security Continuous Monitoring).

## Auto Remediation: Beyond Detection to Correction

Rules that find `NON_COMPLIANT` don't have to stop there; **auto remediation** enforces desired state. Config calls **SSM Automation documents** as remediation actions. Connect AWS-provided documents (e.g., `AWS-DisableS3BucketPublicReadWrite`, `AWS-DetachIAMPolicy`) or custom documents.

```yaml
RemediationConfiguration:
  ConfigRuleName: s3-bucket-public-read-prohibited
  TargetType: SSM_DOCUMENT
  TargetId: AWS-DisableS3BucketPublicReadWrite
  Automatic: true
  MaximumAutomaticAttempts: 3
  RetryAttemptSeconds: 60
  Parameters:
    AutomationAssumeRole:
      StaticValue: { Values: ["arn:aws:iam::111122223333:role/ConfigRemediationRole"] }
    S3BucketName:
      ResourceValue: { Value: "RESOURCE_ID" }
```

With `Automatic: true`, remediation runs immediately upon violation detection (manual requires console button). The remediation IAM role (`AutomationAssumeRole`) must have actual modification permissions.

> ⚠️ **Pitfall**: Auto-remediation is powerful but can create *loops* or *service disruption*. For example, auto-closing an operationally necessary 0.0.0.0/0 rule causes outage. When remediation changes resources, new CIs are created and rules re-evaluate — poor design can create change→evaluate→remediate loops. In production, first validate with manual remediation or alerts before automating.

> 🎯 **Scenario**: "When public-readable S3 bucket is created, auto-block it." Answer: Config rule `s3-bucket-public-read-prohibited` + SSM Automation remediation `AWS-DisableS3BucketPublicReadWrite` with `Automatic: true`. SCP blocks before creation (preventive), Config remediation undoes already-created violations (detective+responsive) — different layers.

## Config Aggregator: Multi-Account/Region Aggregation

**Configuration Aggregator** collects Config data from multiple accounts and regions into single view. Organizations-based aggregator lets you see organization-wide rule compliance and resource inventory from one place. Security team can query "where are unencrypted EBS in our organization" at once.

> 🔍 **Deeper Dive**: Config's real value is *advanced query* and *relationship graph*. Config records resource relationships (`relationships`), enabling tracking of "all resources using this KMS key," "all ENIs attached to this security group." Config advanced query uses SQL-like syntax for inventory:
>
> ```sql
> SELECT resourceId, resourceName
> WHERE resourceType = 'AWS::EC2::SecurityGroup'
>   AND configuration.ipPermissions.ipRanges.cidrIp = '0.0.0.0/0'
> ```
>
> In breach investigation, reconstructing "lateral movement" paths uses this relationship graph. Crossing CloudTrail activity logs with Config state/relationship graphs completes the attack picture — leading to tomorrow (day 3 network logging) and day 5 integration.

---

## 📝 연습 문제

**문제 1.** AWS Config와 CloudTrail의 역할 구분으로 가장 정확한 것은?

A) 둘 다 동일하게 API 호출만 기록하므로 하나만 켜면 된다  
B) CloudTrail은 "누가 무엇을 했는가"(활동)를, Config는 "리소스가 각 시점에 어떤 상태였는가"(구성 상태·이력)를 기록한다  
C) Config는 실시간 API 호출을, CloudTrail은 주기적 스냅샷을 기록한다  
D) Config는 네트워크 트래픽을, CloudTrail은 구성 변경을 기록한다  

**정답: B**  
해설: CloudTrail은 API 호출 활동(누가/언제/무엇을)을 기록하고, Config는 리소스의 구성 항목(CI)을 통해 각 시점의 상태와 구성 타임라인, 리소스 간 관계를 기록한다. 둘은 보완적이며 함께 써야 활동과 상태를 교차 분석할 수 있다. 역할이 동일하지 않고, 트래픽 로깅은 VPC Flow Logs의 영역이다.

---

**문제 2.** AWS 관리형 규칙으로는 표현할 수 없는, "모든 EBS 볼륨이 특정 CMK(지정된 KMS 키 ARN)로 암호화돼야 한다"는 조직 특화 요구를 평가해야 한다. 적절한 방법은?

A) 관리형 규칙 `encrypted-volumes`만 사용  
B) Custom Lambda rule 또는 Custom Policy(Guard) rule로 특정 키 ARN 일치를 평가  
C) CloudTrail 데이터 이벤트로 평가  
D) SCP로 EBS 생성을 차단  

**정답: B**  
해설: 관리형 `encrypted-volumes`는 암호화 *여부*만 본다. *특정 키*로의 암호화 강제는 커스텀 평가 로직이 필요하므로 Custom Lambda rule(또는 코드 없는 Custom Policy/Guard rule)로 `configuration.kmsKeyId`를 지정 ARN과 비교한다. CloudTrail은 활동 기록이지 준수 평가 엔진이 아니고, SCP는 예방 통제로 "특정 키 암호화" 평가를 표현하기 어렵다.

---

**문제 3.** 여러 규정(CIS, PCI-DSS)의 다수 Config 규칙과 교정을 다계정 조직에 일관되게 배포·관리하려 한다. 가장 적절한 것은?

A) 각 계정에서 규칙을 하나씩 콘솔로 생성  
B) Organization Conformance Pack으로 규칙·교정을 YAML 템플릿으로 묶어 모든 멤버 계정에 배포  
C) 계정마다 별도 Lambda 규칙 작성  
D) Config Aggregator만 설정  

**정답: B**  
해설: Conformance Pack은 다수의 Config 규칙과 교정 액션을 하나의 YAML 템플릿으로 묶어 배포·관리하는 단위이며, organization conformance pack으로 조직 전체 멤버 계정에 일괄 배포하고 위임 관리자가 집계 준수 상태를 본다. 개별 생성은 일관성·확장성이 없고, Aggregator는 데이터를 *집계해 보는* 도구일 뿐 규칙을 배포하지 않는다.

---

**문제 4.** 퍼블릭 읽기 가능한 S3 버킷이 생성되면 사람 개입 없이 자동으로 차단하려 한다. Config로 구현하는 방법은?

A) `s3-bucket-public-read-prohibited` 규칙에 SSM Automation 교정(`AWS-DisableS3BucketPublicReadWrite`)을 `Automatic: true`로 연결한다  
B) CloudTrail 무결성 검증을 켠다  
C) Config Aggregator를 설정한다  
D) 규칙을 만들고 매일 수동으로 검토한다  

**정답: A**  
해설: Config 규칙이 위반을 탐지하면 연결된 SSM Automation 문서를 교정 액션으로 호출하며, `Automatic: true`로 설정하면 탐지 즉시 자동 실행된다. `AWS-DisableS3BucketPublicReadWrite`는 퍼블릭 액세스를 차단하는 AWS 제공 문서다. 무결성 검증·Aggregator는 교정과 무관하고, 수동 검토는 "사람 개입 없이"라는 요구를 만족하지 못한다.

---

**문제 5.** Config 자동 교정을 운영 환경에 도입할 때 가장 주의해야 할 위험은?

A) Config가 리전 간 자동 복제되어 비용이 두 배가 된다  
B) 교정이 리소스를 변경하면 새 CI가 생겨 규칙이 재평가되므로, 잘못 설계하면 변경→평가→교정 루프나 운영 중단을 유발할 수 있다  
C) 교정은 IAM 역할 없이 동작하므로 권한 통제가 불가능하다  
D) 자동 교정은 글로벌 리소스에만 적용된다  

**정답: B**  
해설: 교정이 리소스를 수정하면 새 구성 항목이 생성되어 규칙이 다시 평가되며, 설계가 잘못되면 평가-교정 루프가 돌거나 운영상 필요한 설정(예: 의도된 공개 규칙)을 닫아 장애를 낼 수 있다. 그래서 먼저 수동 교정·알림으로 검증 후 자동화하는 것이 안전하다. 교정은 `AutomationAssumeRole`로 권한이 통제되며, 리전 자동 복제나 글로벌 한정 같은 동작은 없다.

---

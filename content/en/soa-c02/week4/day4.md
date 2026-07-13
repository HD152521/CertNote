# Day 4 - Audit Manager, License Manager, Resource Explorer: Audit Automation and Operational Visibility Design

A financial startup is getting ISO 27001 certified for the first time. External auditors send a requirements list. "Cases of console access without MFA in past 6 months," "RDS encryption adoption survey," "complete IAM policy change history." The operations team digs through CloudTrail logs, exports Config results to Excel, manually takes screenshots for PDF. Two people spent 3 weeks. Next year the audit's scheduled again. Will they need another 3 weeks?

This is the problem AWS Audit Manager solves. Audits are inherently periodic, evidence formats differ per Framework, and the same evidence is often requested by multiple Frameworks repeatedly. Manual processing creates human error, loses context when staff changes, and wastes effort "running operations while doing compliance." Audit Manager automates these repetitive tasks and ensures evidence is always audit-ready. Today covers Audit Manager's internal structure, License Manager's BYOL enforcement mechanism, and Resource Explorer's multi-region index design—the way operators actually use these tools.

## AWS Audit Manager: Evidence Collection Automation Internals

Understanding Audit Manager requires understanding audit structure. Audits always ask two things: "does the policy exist (policy)" and "is it actually followed (evidence)." Audit Manager automates the latter—evidence collection. The former remains organizational responsibility.

Four-layer hierarchy: **Framework** is the entire audit standard. PCI-DSS Framework contains hundreds of individual control items. **Control** is a Framework unit: "MFA must be enforced for console access." Each Control has one+ **Data Source**. Data Source specifies evidence location: AWS Config Rule results, CloudTrail API calls, Security Hub Finding, direct AWS API calls. **Assessment** is Framework applied to specific account·region scope. Activating Assessment starts Audit Manager periodically pulling evidence from specified Data Sources and connecting to each Control. As evidence accumulates, auditors review in console and export final report as PDF or CSV.

> 💡 **Design Philosophy**: Audit Manager's evidence collection implements "continuous compliance" concept. Instead of annual snapshot, Assessment running continuously collects evidence daily. At audit time, show "how was it for the last 6 months"—not "today's state." NIST SP 800-137 "Information Security Continuous Monitoring" provides theoretical basis.

Distinguishing Automated Evidence (Config Rule results, CloudTrail records, Security Hub Finding—auto-collected) vs Manual Evidence (security training completion certs, disaster recovery drill reports, vendor contracts—manually uploaded to console). Exam question: "what can't Audit Manager auto-collect?" → Answer: policy docs, interview records, external documentation.

Pre-provided Framework list matters for exam. AWS provides HIPAA, PCI-DSS, SOC 2, ISO 27001, NIST 800-53, NIST CSF, AWS Foundational Security Best Practices, GDPR, FedRAMP, CIS Benchmark as built-in Frameworks. Custom Frameworks available too. Built-in Frameworks have pre-mapped AWS service evidence per control item—activate Assessment and evidence collection starts.

> 🔍 **Internal Operation**: When creating Assessment, Audit Manager auto-creates IAM Service-Linked Role (`AWSServiceRoleForAuditManager`). This Role has Read permissions on Config, CloudTrail, Security Hub, various AWS APIs, and stores evidence in S3. By default Audit Manager-managed S3 bucket; custom S3 bucket + KMS CMK configurable. Evidence stored as JSON, each showing which Control it maps to, collection time, Pass/Fail evaluation.

```bash
# Create Audit Manager Assessment (PCI-DSS)
FRAMEWORK_ID=$(aws auditmanager list-available-prebuilt-frameworks \
  --query 'frameworkMetadataList[?name==`PCI DSS v3.2.1`].id' \
  --output text)

aws auditmanager create-assessment \
  --name "2026-Q2-PCI-DSS-Audit" \
  --description "2026年 Q2 PCI-DSS External Audit Prep" \
  --framework-id "$FRAMEWORK_ID" \
  --assessment-reports-destination '{
    "destinationType": "S3",
    "destination": "s3://company-audit-reports-bucket"
  }' \
  --roles '[{
    "roleType": "PROCESS_OWNER",
    "roleArn": "arn:aws:iam::123456789012:role/AuditProcessOwner"
  }]' \
  --scope '{
    "awsAccounts": [
      {"id": "123456789012", "name": "Production"},
      {"id": "234567890123", "name": "Staging"}
    ],
    "awsServices": [
      {"serviceName": "ec2"},
      {"serviceName": "s3"},
      {"serviceName": "rds"},
      {"serviceName": "iam"}
    ]
  }'

# Check Assessment status
aws auditmanager get-assessment \
  --assessment-id "assessment-uuid-here" \
  --query 'assessment.metadata.{name:name,status:status,complianceType:complianceType}'

# Request report generation
aws auditmanager create-assessment-report \
  --assessment-id "assessment-uuid-here" \
  --name "PCI-DSS-2026-Q2-Final-Report" \
  --description "Final report for external auditors"
```

Clarifying relationships: Config evaluates resource state, detects Rule violations. Audit Manager collects Config eval results as evidence, connects to Framework Control. Security Hub aggregates various security tool Findings. Audit Manager can collect Security Hub Finding as evidence. Trusted Advisor gives cost/performance/security/availability recommendations. Audit Manager doesn't integrate directly with Trusted Advisor. Misunderstanding these relationships causes exam failures.

> 📚 **Real Case Study**: 2023 Korean fintech A company does annual SOC 2 Type II audit. Previously, 2 ops people spent 3 weeks manually gathering evidence. After Audit Manager adoption running SOC 2 Framework Assessment continuously, pre-audit "generate report" button creates PDF with 12 months evidence in 2 hours. Evidence prep time dropped from 3 weeks to 2 hours. Core insight: "not preparing when audit arrives, but staying always prepared."

> ⚠️ **Absolute Don't Confuse**: Audit Manager doesn't "make AWS compliant for you." It's evidence collection and organization automation. Creating PCI-DSS Framework Assessment doesn't give PCI-DSS certification. Real certification is external QSA (Qualified Security Assessor) judgment. Audit Manager auto-assembles evidence for that review.

## AWS License Manager: BYOL Enforcement Mechanism

Imagine company bought 100 cores of Oracle Database license. Can't manually track every EC2 instance created on AWS. As instances multiply, tracking lapses, and someday license audits reveal "unlicensed usage"—companies face massive supplementary charges. Oracle, Microsoft, SAP license audits have caused hundreds-of-millions-won additional bills.

License Manager solves this at software level. Define **License Configuration**, connect to AMI, License Manager auto-increments license count as EC2 starts, decrements on termination. Key setting: `LicenseCountHardLimit`.

> 💡 **Hard Limit Meaning**: With `LicenseCountHardLimit: true`, when licenses reach limit, EC2 RunInstances API itself fails. Instance startup is blocked. With `false`, over-limit triggers alert only, startup allowed. Exam asks "how to tech-block over-limit usage?" → Answer: Hard Limit.

```bash
# Windows Server 2022 Datacenter BYOL License Configuration
aws license-manager create-license-configuration \
  --name "Windows-Server-2022-Datacenter-BYOL" \
  --description "Windows Server 2022 Datacenter BYOL tracking" \
  --license-counting-type Core \
  --license-count 200 \
  --license-count-hard-limit \
  --license-rules "#allowedTenancy=EC2-DedicatedHost,EC2-DedicatedInstance" \
  --tags Key=Project,Value=license-governance

# Connect License Config to AMI (EC2 from this AMI auto-tracked)
aws license-manager update-license-specifications-for-resource \
  --resource-arn "arn:aws:ec2:ap-northeast-2:123456789012:image/ami-0abc12345" \
  --add-license-specifications '[{
    "LicenseConfigurationArn": "arn:aws:license-manager:ap-northeast-2:123456789012:license-configuration:lic-abc123"
  }]'

# Check current license usage
aws license-manager list-usage-for-license-configuration \
  --license-configuration-arn "arn:aws:license-manager:ap-northeast-2:123456789012:license-configuration:lic-abc123" \
  --query 'LicenseConfigurationUsageList[*].{Resource:ResourceArn,Status:ResourceStatus,Consumed:ConsumedLicenses}'

# CloudWatch Alarm: alert at 80% usage
aws cloudwatch put-metric-alarm \
  --alarm-name "LicenseUsage-Windows-80pct" \
  --metric-name "LicenseConfigurationConsumedLicenses" \
  --namespace "AWS/LicenseManager" \
  --dimensions Name=LicenseConfigurationArn,Value="arn:aws:license-manager:ap-northeast-2:123456789012:license-configuration:lic-abc123" \
  --statistic Maximum \
  --period 3600 \
  --threshold 160 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions "arn:aws:sns:ap-northeast-2:123456789012:license-alert"
```

**Counting Units** vary per license contract. vCPU basis = `vCPU`, socket basis = `Socket`, core basis = `Core`, instance count = `Instance`. Oracle's Standard Edition licenses per-socket, Enterprise per-core—counting type differs. License Manager specifies this in Configuration.

> 🔍 **Multi-Account BYOL Management**: Via AWS Organizations, License Manager can share to member accounts. Management account creates License Configuration, shares via Organizations, member account usage aggregates to management account. Member users connect shared Config to their AMI; overall count limit controlled by management account. This is enterprise BYOL governance standard.

Two license types tracked: **BYOL (Bring Your Own License)**—company already bought, using on AWS. Windows, Oracle are examples. **License Entitlement**—purchased via AWS Marketplace or AWS, already digitally managed. SOA-C02 focuses mainly on BYOL tracking and enforcement.

> ⚠️ **Operational Caution**: With Hard Limit on, when licenses run out, Auto Scaling attempting scale-out fails on new instance startup. Traffic spike → blocked scaling → service outage. Must set CloudWatch alarm at 80-90% usage and have process to acquire extra licenses before limit hit.

## AWS Resource Explorer: Multi-Region Resource Index Design

In multi-region, multi-account environments, "how many EC2 instances do we have" is unexpectedly hard. Visit each region's console, repeatedly call `describe-instances`, or use third-party CMDB. Resource Explorer solves this with AWS native indexing.

Core concept: **Index**. Activate local index per region = index that region's resources. Designate one region as **Aggregator Index** = all other regions' local index data flows here. Query Aggregator Index region = search all regions at once.

> 📚 **Design Theory**: Resource Explorer's index structure follows distributed search's **centralized aggregation** pattern. Like Elasticsearch Master Node collecting all Shard metadata, local indexes per region act as Shards, Aggregator as Master. Difference: AWS manages sync and resilience.

```bash
# 1. Create Aggregator Index in current region (search hub)
aws resource-explorer-2 create-index \
  --type AGGREGATOR \
  --region ap-northeast-2

# 2. Create Local Index in other regions
for region in us-east-1 us-west-2 eu-west-1 ap-southeast-1; do
  aws resource-explorer-2 create-index \
    --type LOCAL \
    --region "$region"
  echo "Local index created in $region"
done

# 3. Create View (define search scope)
aws resource-explorer-2 create-view \
  --view-name "all-resources-view" \
  --included-properties '[{"Name":"tags"}]' \
  --region ap-northeast-2

# Get View ARN
VIEW_ARN=$(aws resource-explorer-2 list-views \
  --region ap-northeast-2 \
  --query 'Views[?contains(@, `all-resources-view`)]' \
  --output text | head -1)

# 4. Query examples
# All regions prod EC2 in running state
aws resource-explorer-2 search \
  --view-arn "$VIEW_ARN" \
  --query-string "service:ec2 resourcetype:instance tag.Environment=prod" \
  --region ap-northeast-2

# Lambda in specific region
aws resource-explorer-2 search \
  --view-arn "$VIEW_ARN" \
  --query-string "service:lambda region:us-east-1" \
  --region ap-northeast-2

# Unencrypted EBS volumes
aws resource-explorer-2 search \
  --view-arn "$VIEW_ARN" \
  --query-string "service:ec2 resourcetype:volume tag.Encrypted!=true" \
  --region ap-northeast-2
```

Query syntax is intuitive. `service:ec2` = EC2 resource, `resourcetype:instance` = narrow to instance. `tag.Key=Value` = tag filter, `region:ap-northeast-2` = specific region. Multiple space-separated conditions = AND.

> 💡 **Organizations Integration**: Via AWS Organizations, manage member account Resource Explorer from management account centrally. New account added to Organization → Resource Explorer auto-activated, data aggregated. Standard for large multi-account Resource Explorer operation.

## Tag Editor and Resource Groups: Operational Automation Connectors

Resource Explorer is "find" tool; Tag Editor is "organize" tool. As companies use AWS for years, tagging gets messy. Some teams use `env`, others `Environment`, others `Env`. Tag Editor bulk-searches and modifies resources across regions and services. AWS CLI `aws resourcegroupstaggingapi` does same automation.

```bash
# Bulk apply tags to multiple resources simultaneously
aws resourcegroupstaggingapi tag-resources \
  --resource-arn-list \
    "arn:aws:ec2:ap-northeast-2:123456789012:instance/i-0abc123" \
    "arn:aws:ec2:ap-northeast-2:123456789012:instance/i-0xyz456" \
    "arn:aws:rds:ap-northeast-2:123456789012:db:production-db" \
    "arn:aws:s3:::company-production-bucket" \
  --tags '{
    "Environment": "production",
    "Project": "payment-platform",
    "Owner": "platform-team",
    "CostCenter": "CC-2024-PLATFORM"
  }'

# Find resources missing tag (no Environment tag)
aws resourcegroupstaggingapi get-resources \
  --tag-filters 'Key=Environment' \
  --resource-type-filters ec2:instance \
  --query 'ResourceTagMappingList[?Tags[?Key!=`Environment`] || !Tags].ResourceARN' \
  --output text
```

**Resource Groups** dynamically groups resources by tags. Group definition is tag conditions; resources matching auto-join. New resource with matching tag auto-joins. Real value: **SSM integration**. Specify Resource Group as "target" in SSM Run Command, State Manager, Patch Manager—applies to all group instances.

```bash
# Create Resource Group (payment-prod tags based)
aws resource-groups create-group \
  --name "payment-prod-instances" \
  --description "Payment platform prod EC2 instances" \
  --resource-query '{
    "Type": "TAG_FILTERS_1_0",
    "Query": "{\"ResourceTypeFilters\":[\"AWS::EC2::Instance\"],\"TagFilters\":[{\"Key\":\"Project\",\"Values\":[\"payment-platform\"]},{\"Key\":\"Environment\",\"Values\":[\"production\"]}]}"
  }'

# Run SSM Run Command on entire Resource Group
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets '[{
    "Key": "resource-groups:Name",
    "Values": ["payment-prod-instances"]
  }]' \
  --parameters '{"commands":["systemctl status nginx","df -h","free -m"]}' \
  --comment "payment-prod comprehensive health check"
```

> 🔍 **CloudFormation Stack Resource Groups**: Beyond tags, create Resource Groups by CloudFormation Stack ID. Bundle all Stack-created resources into group, run SSM commands at stack level or track costs by stack. CloudFormation auto-tags all resources with `aws:cloudformation:stack-name`—use this as Resource Group condition.

## Service Comparison: Audit/Visibility Tool Selection Guide

Operators most often confuse: "for this scenario use Audit Manager, Config, or Trusted Advisor?" Clarify these three roles.

| Question | Appropriate Tool |
|------|-------------|
| Config Rule violation on specific resource? | AWS Config |
| Compliance report for external auditors? | AWS Audit Manager |
| AWS cost optimization, security recommendations? | AWS Trusted Advisor |
| Technically block BYOL over-usage? | AWS License Manager (Hard Limit) |
| Find resources with specific tag across regions? | AWS Resource Explorer |
| Bulk-edit tags on multiple resources? | Tag Editor (resourcegroupstaggingapi) |
| Run SSM command on 100 EC2s simultaneously? | Resource Groups + SSM |
| Advance notice of service disruption/change? | AWS Health Dashboard |
| Check account service limits, request increase? | AWS Service Quotas |

**Audit Manager vs Config**:

| Aspect | AWS Config | AWS Audit Manager |
|------|-----------|-------------------|
| Primary role | Evaluate resource state, detect Rule violation | Collect compliance evidence, automate reports |
| Output | Rule eval results, timeline | PDF/CSV audit report, evidence per Control |
| Framework concept | Absent (Conformance Pack similar) | Core (HIPAA, PCI-DSS, SOC 2 etc.) |
| Auditor support | No direct | Invite auditor account, review workflow |
| Manual evidence | Not supported | Supported (console upload) |
| Mutual relationship | Config results = Audit Manager evidence source | Config as Data Source |

> 📚 **ISO 27001 A.12.4 Audit Log Requirement**: ISO 27001 A.12.4 demands "event log creation, log protection, admin/operator activity logging." AWS environment compliance requires CloudTrail (API audit), Config (resource state), VPC Flow Logs (network), CloudWatch Logs (application logs) ALL activated. Audit Manager's ISO 27001 Framework automates evidence collection for each control item.

## Real Operations Pattern: Governance Stack Combination

How governance stack actually combines—Korean large fintech's 2024 ISMS-P certification:

**Setup**: AWS Config (continuous resource state eval) + CloudTrail (API audit everything) + Security Hub (aggregate security Finding) → Audit Manager (ISMS-P Custom Framework auto-evidence collection) + Resource Explorer (all-account resource inventory) + License Manager (Windows, Oracle BYOL enforce). During cert audit, auditor directly reviewed evidence in Audit Manager console per control, report generated in 30 minutes. Previous cert cycle same work took 4 weeks.

> 💡 **Quick Setup Utilization**: AWS Systems Manager Quick Setup applies Config Recording, SSM Agent install, CloudWatch Agent to multi-account·multi-region in one shot. New account added to Organization → Quick Setup auto-deploys baseline governance. Maintains consistent governance baseline across OU. 

Each tool is independently valuable, but combined they achieve "AWS environment always audit-ready." Resource Explorer shows "what exists," Tag Editor + Resource Groups "systematically organize," Config + CloudTrail "continuously monitor state and action," Audit Manager "auto-collect evidence," License Manager "tech-enforce license compliance." Operators mastering these three see the big picture.

Three key exam/ops points: First, Audit Manager automates evidence collection, not compliance guaranteeing. Second, License Manager Hard Limit is powerful enforcement on over-limit instance startup block. Third, Resource Explorer needs Aggregator Index for multi-region search. Connect scenarios to these three—correct answers follow.

---

## 📝 연습 문제

**문제 1.** 외부 감사 회사가 PCI-DSS 감사를 위해 지난 6개월간의 IAM 정책 변경 이력, RDS 암호화 상태, MFA 적용 현황을 모두 요청했다. 운영팀이 최소 노력으로 이 요구사항을 충족하는 방법은?

A) CloudTrail 로그를 S3에서 수동으로 다운로드해 정리한다
B) Config Rule 평가 결과를 엑셀로 내보낸다
C) Audit Manager에서 PCI-DSS Framework로 Assessment를 생성하고, 6개월치 증거 수집 후 보고서를 자동 생성한다
D) Security Hub에서 Finding을 PDF로 내보낸다

**정답: C**
해설: Audit Manager는 PCI-DSS를 포함한 주요 컴플라이언스 Framework를 내장하고 있으며, Assessment 활성화 후 CloudTrail, Config, Security Hub에서 자동으로 증거를 수집한다. 보고서는 PDF/CSV로 생성된다. A와 B는 수동 작업으로 오류 가능성이 높다. D는 Security Hub Finding만 포함되어 전체 요구사항을 충족하지 못한다.

---

**문제 2.** 회사가 Microsoft Windows Server Enterprise 라이선스 500코어 분을 구매했다. AWS에서 EC2를 시작할 때 이 한도를 초과하면 인스턴스 시작 자체를 차단해야 한다. 어떤 서비스와 설정을 사용해야 하는가?

A) AWS Config Rule로 EC2 인스턴스 수를 제한
B) Service Quotas로 EC2 인스턴스 수 제한
C) License Manager에서 License Configuration을 만들고 `LicenseCountHardLimit: true`로 설정한 후 해당 AMI에 연결
D) IAM Permission Boundary로 RunInstances 횟수 제한

**정답: C**
해설: License Manager의 정확한 사용 사례다. License Configuration을 만들 때 `--license-count-hard-limit` 플래그를 켜면, 해당 AMI로 EC2를 시작할 때 라이선스 카운트가 한도에 도달하면 RunInstances 자체가 실패한다. Hard Limit이 false면 초과 시 알림만 보내고 시작은 허용된다. Config Rule은 이 차단 기능이 없다.

---

**문제 3.** 기업이 20개 AWS 계정, 6개 리전에 걸쳐 `Project=payment-platform` 태그가 붙은 EC2 인스턴스 수를 빠르게 파악해야 한다. 가장 효율적인 방법은?

A) 각 계정에 로그인해 리전별로 EC2 콘솔을 확인
B) AWS Config 집계 보기에서 리소스 목록 확인
C) Resource Explorer를 Aggregator Index로 설정하고 `service:ec2 resourcetype:instance tag.Project=payment-platform` 검색
D) CloudTrail Lake SQL로 EC2 생성 이벤트 집계

**정답: C**
해설: Resource Explorer는 멀티 리전·멀티 계정 리소스 검색을 위한 도구다. Aggregator Index를 설정하면 모든 리전의 데이터가 집계되어 단일 쿼리로 검색 가능하다. A는 수작업이다. B는 Config도 리소스 목록을 볼 수 있지만 검색 기능이 Resource Explorer보다 제한적이다. D는 현재 상태가 아닌 이벤트 기록 조회다.

---

**문제 4.** Audit Manager Assessment를 활성화했는데 특정 Control의 증거가 수집되지 않는다. 원인으로 가장 가능성 높은 것은?

A) AWS Config가 해당 리소스 타입을 기록하지 않도록 설정되어 있다
B) CloudTrail이 비활성화되어 있다
C) S3 버킷 권한이 잘못 설정되어 있다
D) A 또는 B

**정답: D**
해설: Audit Manager는 Data Source에서 증거를 가져온다. Config Rule 결과를 Data Source로 쓰는 Control은 Config가 해당 리소스를 기록해야 하고, CloudTrail 이벤트를 Data Source로 쓰는 Control은 CloudTrail이 활성화되어야 한다. C는 보고서 저장에 영향을 주지만 증거 수집 자체를 막지는 않는다.

---

**문제 5.** Resource Group을 SSM Patch Manager의 대상으로 사용하면 어떤 장점이 있는가?

A) 인스턴스 ID를 일일이 나열할 필요 없이 태그 조건에 맞는 인스턴스가 자동으로 포함된다
B) 패치 속도가 빨라진다
C) 패치 실패 알림이 자동으로 생성된다
D) 인스턴스가 자동으로 재시작된다

**정답: A**
해설: Resource Groups의 핵심 가치는 동적 그룹핑이다. 태그 조건을 정의하면, 조건에 맞는 리소스가 자동으로 그룹에 포함되고 제거된다. 새 EC2를 시작할 때 태그만 붙이면 자동으로 그룹에 들어와 Patch Manager 대상이 된다. B, C, D는 Resource Groups이 아닌 Patch Manager 자체의 기능이다.

---

**문제 6.** Audit Manager가 자동으로 증거를 수집할 수 없는 항목은?

A) AWS Config Rule 평가 결과
B) CloudTrail에 기록된 API 호출
C) Security Hub Finding
D) 외부 감사관과 나눈 인터뷰 내용 및 수기로 작성한 정책 문서

**정답: D**
해설: Audit Manager의 자동 증거 수집은 AWS API를 통해 접근 가능한 데이터에 한정된다. Config Rule 결과(A), CloudTrail 이벤트(B), Security Hub Finding(C)은 모두 자동 수집된다. 종이 문서, 인터뷰 기록, 외부 시스템 데이터, 수기 서명 문서 등은 수동으로 콘솔에 업로드해야 한다.

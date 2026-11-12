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

## 📝 Practice Questions

**Question 1.** An external audit firm has requested the IAM policy change history, RDS encryption status, and MFA enforcement status for the past 6 months for a PCI-DSS audit. What is the way for the operations team to meet this requirement with the least effort?

A) Manually download CloudTrail logs from S3 and organize them
B) Export Config rule evaluation results to Excel
C) Create an Assessment in Audit Manager with the PCI-DSS Framework, collect 6 months of evidence, and generate the report automatically
D) Export Security Hub findings as a PDF

**Answer: C**
Explanation: Audit Manager has built-in major compliance frameworks including PCI-DSS, and once an Assessment is activated it automatically collects evidence from CloudTrail, Config, and Security Hub. Reports are generated as PDF/CSV. A and B are manual work and prone to errors. D includes only Security Hub findings and does not satisfy the full requirements.

---

**Question 2.** A company purchased Microsoft Windows Server Enterprise licenses for 500 cores. When launching EC2 on AWS, instance launches must be blocked outright if this limit is exceeded. Which service and setting should be used?

A) Limit the number of EC2 instances with an AWS Config rule
B) Limit the number of EC2 instances with Service Quotas
C) Create a License Configuration in License Manager, set `LicenseCountHardLimit: true`, and associate it with the relevant AMI
D) Limit the number of RunInstances calls with an IAM Permission Boundary

**Answer: C**
Explanation: This is the exact use case for License Manager. If the `--license-count-hard-limit` flag is turned on when creating the License Configuration, RunInstances itself fails when the license count reaches the limit while launching EC2 from that AMI. If Hard Limit is false, only a notification is sent when the limit is exceeded and the launch is still allowed. Config rules have no such blocking capability.

---

**Question 3.** An enterprise needs to quickly determine the number of EC2 instances tagged `Project=payment-platform` across 20 AWS accounts and 6 Regions. What is the most efficient method?

A) Log in to each account and check the EC2 console in each Region
B) Check the resource list in the AWS Config aggregated view
C) Set Resource Explorer to use an Aggregator Index and search `service:ec2 resourcetype:instance tag.Project=payment-platform`
D) Aggregate EC2 creation events with CloudTrail Lake SQL

**Answer: C**
Explanation: Resource Explorer is a tool for multi-Region, multi-account resource search. When an Aggregator Index is configured, data from all Regions is aggregated and can be searched with a single query. A is manual work. For B, Config can also show a resource list, but its search capability is more limited than Resource Explorer. D queries event history rather than the current state.

---

**Question 4.** After activating an Audit Manager Assessment, evidence is not being collected for a specific Control. What is the most likely cause?

A) AWS Config is configured not to record that resource type
B) CloudTrail is disabled
C) S3 bucket permissions are misconfigured
D) A or B

**Answer: D**
Explanation: Audit Manager retrieves evidence from Data Sources. A Control that uses Config rule results as its Data Source requires Config to record that resource, and a Control that uses CloudTrail events as its Data Source requires CloudTrail to be enabled. C affects report storage but does not block evidence collection itself.

---

**Question 5.** What is the advantage of using a Resource Group as the target for SSM Patch Manager?

A) Instances matching the tag condition are included automatically, without having to list instance IDs one by one
B) Patching becomes faster
C) Patch failure notifications are created automatically
D) Instances are restarted automatically

**Answer: A**
Explanation: The core value of Resource Groups is dynamic grouping. When a tag condition is defined, resources matching the condition are automatically added to and removed from the group. When a new EC2 instance is launched, simply tagging it brings it into the group automatically and makes it a Patch Manager target. B, C, and D are features of Patch Manager itself, not of Resource Groups.

---

**Question 6.** Which item can Audit Manager NOT collect evidence for automatically?

A) AWS Config rule evaluation results
B) API calls recorded in CloudTrail
C) Security Hub Finding
D) Interview content with an external auditor and manually written policy documents

**Answer: D**
Explanation: Audit Manager's automatic evidence collection is limited to data accessible through AWS APIs. Config rule results (A), CloudTrail events (B), and Security Hub findings (C) are all collected automatically. Paper documents, interview records, data from external systems, and handwritten signed documents must be uploaded manually to the console.

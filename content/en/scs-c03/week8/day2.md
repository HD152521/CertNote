# Day 2 - Security Hub: Security Standards (CIS/FSBP), Consolidated Score, Finding Aggregation and Normalization (ASFF), Automated Response

Once you turn on multiple detectors, a new problem immediately emerges — GuardDuty spits out alerts in GuardDuty format, Inspector in Inspector format, Macie in yet another format, and when you add configuration validation results from IAM, S3, and CloudTrail, an operator can no longer answer the single question: "Is our account secure right now?" **AWS Security Hub** is the aggregation, normalization, and scoring plane that solves this fragmentation. In the security exam, the essence of Security Hub is not a tool that *performs* detection, but a *meta-tool that collects, standardizes, and prioritizes results from multiple detectors*.

## Three Things Security Hub Does

Security Hub's work breaks down clearly into three functions.

1. **Security Standards Inspection (Security Standards)**: Automatically compares account and resource configurations against best-practice benchmarks (CIS, FSBP, PCI DSS, NIST, etc.) and produces pass/fail controls. Internally uses **AWS Config** rules.
2. **Finding Aggregation and Normalization (Aggregation)**: Receives findings from integrated services and third parties — GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager, etc. — in a single format called **ASFF** and collects them in one place.
3. **Automated Response (Automation)**: Flows findings to EventBridge or processes and suppresses them automatically via Automation Rules.

> ⚠️ **Trap**: The phrase "Security Hub detects threats" is inaccurate. Threat *detection* is done by GuardDuty, vulnerability *scanning* by Inspector, sensitive data *discovery* by Macie. Security Hub *aggregates* their results and separately performs *configuration compliance checking*. On the exam, if asked about "real-time malicious activity detection," the answer is GuardDuty; if asked "multiple security service results on a single dashboard," the answer is Security Hub.

## Security Standards: CIS vs FSBP

The two main standards offered by Security Hub differ clearly when compared.

| Standard | Nature | Source |
|----------|--------|--------|
| **CIS AWS Foundations Benchmark** | External consensus-based core baseline (root MFA, CloudTrail multi-region, risk alerts, etc.) | Center for Internet Security |
| **AWS Foundational Security Best Practices (FSBP)** | Broad service-specific best practices defined by AWS directly | AWS |
| **PCI DSS** | Payment card environment compliance | PCI SSC |
| **NIST SP 800-53** | U.S. federal security controls | NIST |

- **CIS** is a narrow, core baseline at the level of "at minimum adhere to this."
- **FSBP** is a *broad* inspection across services like EC2, S3, RDS, Lambda, etc., so it has many more controls.

Each control is evaluated as an AWS Config rule, so **AWS Config must be enabled** for standard controls to work. This is the key dependency.

```bash
# Enable Security Hub (default standards auto-enable or disable and enable explicitly)
aws securityhub enable-security-hub --enable-default-standards

# Subscribe to a specific standard
aws securityhub batch-enable-standards \
  --standards-subscription-requests \
    StandardsArn=arn:aws:securityhub:ap-northeast-2::standards/aws-foundational-security-best-practices/v/1.0.0
```

> 💡 **Related Theory**: Security Hub's standards inspection is an implementation of "detective control" and "continuous compliance." Traditionally, compliance audits were quarterly or annual snapshots, but Config rule-based inspection re-evaluates on every resource change — *continuous audit*. This connects directly to NIST's Continuous Monitoring (CM) concept. On the exam, when asked "continuously track compliance state," Config + Security Hub standards are the answer axis.

## Security Score: Controls Reduced to One Number

Security Hub converts the pass rate of controls from enabled standards into a **security score (%)** metric. Score calculation is straightforward.

```
Security Score = (Number of PASSED controls) / (PASSED + FAILED controls) × 100
```

- Controls marked `NOT_AVAILABLE` or `DISABLED` are excluded from the denominator.
- Multiple resources are evaluated per control, and if even one resource fails, that control is marked `FAILED` (control status is an aggregation of resource findings).

This score is a single-glance indicator of "how well are we maintaining the baseline right now," and can be aggregated at the organization level.

## ASFF: The Universal Language for All Findings

The single most important concept in Security Hub is **ASFF (AWS Security Finding Format)**. Whether findings originate from GuardDuty, Inspector, Macie, third parties, or elsewhere, all findings are normalized into this single JSON schema. As a result, operators need not memorize per-source formats — they can search, filter, and route using *one field system*.

Core ASFF fields:

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/abc/finding/xyz",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "GeneratorId": "guardduty",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:EC2-SSHBruteForce"],
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE",
  "Resources": [
    { "Type": "AwsEc2Instance", "Id": "arn:aws:ec2:...:instance/i-0123" }
  ],
  "Compliance": { "Status": "FAILED" },
  "ProductFields": { "aws/securityhub/CompanyName": "AWS" }
}
```

Two axes are especially important in normalization:

- **Severity.Normalized**: 0–100 normalized severity. Unifies different severity representations from different sources into one scale. Maps to labels (`INFORMATIONAL`/`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`).
- **Workflow.Status**: The *handling state* of a finding — `NEW` → `NOTIFIED` → `RESOLVED` / `SUPPRESSED`. This is the workflow state operators work with.
- **RecordState**: The *survival state* of a finding — `ACTIVE` / `ARCHIVED`. When the underlying issue is resolved, it moves to ARCHIVED.

> ⚠️ **Trap**: Do not confuse `Workflow.Status` with `RecordState`. `RecordState=ARCHIVED` means "the underlying issue is fixed so the finding is no longer valid" (system's judgment), while `Workflow.Status=RESOLVED` means "the operator marked it as handled" (human or automation's judgment). Also, `SUPPRESSED` means "I've seen it but deliberately ignoring it" — it drops from score and alerts but the record remains.

## Finding Aggregation and Integration

There are integrations that *send* findings to Security Hub and integrations that *receive* findings from Security Hub.

- **Inbound Integrations (→ Security Hub)**: GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager, Config, Health, and numerous third parties (Palo Alto, Splunk, etc.). When enabled, they automatically flow in as ASFF.
- **Outbound/Response Integrations (Security Hub →)**: EventBridge (all findings auto-publish as events), ticketing (Jira/ServiceNow), SIEM.

In multi-account environments, **Organizations integration** designates a delegated administrator account to centralize all member findings in one place, and **Cross-Region Aggregation** consolidates findings from multiple regions into a single aggregation region.

> 🎯 **Scenario**: When the requirement is "see and enforce consistent standards for the entire organization (hundreds of accounts, multiple regions) on a single screen," the winning combination is (1) designate Security Hub delegated administrator in Organizations → (2) use Central Configuration to deploy standards and controls to all members → (3) use Cross-Region Aggregation to aggregate into one region → (4) ensure Config is enabled on every member account. Per-member manual setup is not the answer — *central configuration* is the critical keyword.

## Automated Response: Automation Rules and EventBridge

Security Hub provides two automation paths.

1. **Security Hub Automation Rules**: Within Security Hub *itself*, when findings arrive, if they match conditions (e.g., specific control ID + account), automatically update fields (raise/lower severity, change Workflow.Status to SUPPRESSED). Cannot perform external actions, but *strong* at noise reduction and priority adjustment.
2. **EventBridge-Based Response**: All findings automatically publish to EventBridge. EventBridge rules can capture specific finding patterns and execute Lambda/Step Functions/SSM Automation for *actual remediation* (e.g., block public access on an exposed S3 bucket).

```json
// EventBridge rule: Catch only CRITICAL GuardDuty findings and respond
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": { "Label": ["CRITICAL"] },
      "ProductArn": [{ "prefix": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty" }],
      "Workflow": { "Status": ["NEW"] }
    }
  }
}
```

> 💡 **Related Theory**: The combination of Security Hub + EventBridge + automated remediation is the AWS native implementation of SOAR (Security Orchestration, Automation and Response). AWS provides a pre-built solution for this: **Automated Security Response on AWS (ASR, formerly SHARR)** — a collection of playbooks that take Security Hub findings and auto-remediate via SSM Automation documents. On the exam, when asked "automated remediation solution for Security Hub findings," recall the EventBridge → SSM Automation path (or ASR).

## Custom Insights: Turning Findings into Questions

Security Hub provides **Insights**, which are saved views that group and filter findings. Beyond default-provided insights (e.g., "resources with public access," "resources with the most findings"), you can build custom insights using ASFF fields. Insights group findings by *grouping attribute* (e.g., resource ID, account) to reveal "where is risk concentrated."

## Summary: Security Hub's Place

If CloudWatch is single-signal threshold detection, Security Hub is *aggregation, normalization, and scoring of multiple signals*. Recapping core concepts: standards (CIS/FSBP, Config-based) → score (pass rate) → finding normalization (ASFF) → automation (Automation Rules for internal cleanup + EventBridge for external remediation). This flow connects directly to Day 4's EventBridge security automation.

---

## 📝 연습 문제

**문제 1.** Security Hub의 보안 표준(CIS, FSBP) 컨트롤이 평가되려면 반드시 활성화되어 있어야 하는 선행 서비스는?

A) Amazon Macie  
B) AWS Config  
C) Amazon Inspector  
D) AWS Shield Advanced  

**정답: B**  
해설: Security Hub의 표준 컨트롤은 내부적으로 AWS Config 규칙으로 리소스 설정을 평가하므로 Config가 활성화되어 있어야 한다. Macie는 민감데이터 발견, Inspector는 취약점 스캔, Shield는 DDoS 방어로 표준 컨트롤 평가의 선행 조건이 아니다.

---

**문제 2.** GuardDuty, Inspector, Macie의 서로 다른 핀딩 포맷을 단일 체계로 다루기 위해 Security Hub가 사용하는 정규화 포맷은?

A) CloudTrail 이벤트 스키마  
B) ASFF(AWS Security Finding Format)  
C) VPC Flow Logs 포맷  
D) OCSF 원본 포맷만 그대로 보관  

**정답: B**  
해설: Security Hub는 모든 통합 소스의 핀딩을 ASFF라는 단일 JSON 스키마로 정규화해 출처와 무관하게 같은 필드(Severity.Normalized, Workflow.Status 등)로 검색·라우팅할 수 있게 한다. CloudTrail/VPC Flow 포맷은 다른 데이터이고, OCSF는 Security Lake의 포맷이다.

---

**문제 3.** 운영자가 특정 핀딩을 검토한 뒤 "의도적으로 무시하되 기록은 남기고 보안 점수·알림에서 제외"하려 한다. ASFF에서 설정할 값은?

A) RecordState를 ARCHIVED로  
B) Workflow.Status를 SUPPRESSED로  
C) Severity.Normalized를 0으로  
D) Compliance.Status를 PASSED로  

**정답: B**  
해설: Workflow.Status를 SUPPRESSED로 두면 운영자가 의도적으로 무시했음을 표시하며 알림·점수 집계에서 빠지지만 기록은 남는다. RecordState=ARCHIVED는 시스템이 근본 문제 해소를 판단해 바꾸는 값이고, 심각도나 Compliance를 임의 조작하는 것은 의미를 왜곡한다.

---

**문제 4.** 수백 개의 멤버 계정과 여러 리전에 걸쳐 Security Hub 표준을 일관되게 적용하고 모든 핀딩을 단일 화면에서 보려 한다. 가장 적절한 접근은?

A) 각 계정·리전에서 개별적으로 Security Hub를 수동 설정  
B) Organizations에서 위임 관리자를 지정하고 Central Configuration으로 표준을 배포한 뒤 Cross-Region Aggregation으로 한 리전에 집계  
C) 모든 핀딩을 이메일로 전달하도록 SNS만 구성  
D) GuardDuty만 켜면 자동으로 통합된다  

**정답: B**  
해설: 다계정·다리전 일관 운영의 정답은 Organizations 위임 관리자 + Central Configuration(표준/컨트롤 일괄 배포) + Cross-Region Aggregation(단일 집계 리전)이다. 계정별 수동 설정은 확장성이 없고, SNS만으로는 표준 강제·집계가 안 되며, GuardDuty는 탐지기일 뿐 표준 점검·집계를 대신하지 않는다.

---

**문제 5.** Security Hub의 CRITICAL 핀딩이 들어올 때 자동으로 실제 교정(예: 노출된 보안 그룹 규칙 회수)을 수행하려 한다. 표준 아키텍처는?

A) Security Hub Automation Rule로 보안 그룹을 직접 수정  
B) 핀딩이 EventBridge에 자동 발행되므로, EventBridge 규칙으로 패턴을 매칭해 SSM Automation/Lambda로 교정  
C) Config 규칙이 자동으로 교정한다  
D) Macie가 교정한다  

**정답: B**  
해설: 모든 Security Hub 핀딩은 EventBridge로 자동 발행되므로, EventBridge 규칙으로 CRITICAL 패턴을 잡아 SSM Automation 문서나 Lambda로 실제 교정을 실행하는 것이 표준 패턴(AWS의 ASR 솔루션도 이 경로)이다. Automation Rule은 핀딩 필드 갱신·억제만 할 뿐 외부 리소스를 직접 바꾸지 못하고, Config 자동 교정은 Config 규칙 차원이며, Macie는 데이터 발견 도구다.

---


# Day 3 - Audit Manager and Compliance: Automated Evidence Collection, Frameworks (CIS/PCI), Config Integration

Once governance is established, the next question is: "How do we *prove* we are following the rules?" Auditing is inherently repetitive *evidence collection, mapping, and reporting*. **AWS Audit Manager** automates this process — automatically mapping AWS activities and configurations as evidence to control items of predefined regulatory frameworks, producing audit-ready reports. In the security exam, Audit Manager is "the tool for automatically collecting continuous compliance evidence," and its *integration* with Config, CloudTrail, and Security Hub is key.

## Core Concepts of Audit Manager

```
Framework (Framework)  ── Collection of regulatory/standard controls (CIS, PCI-DSS, SOC2, HIPAA, GDPR ...)
  └ Control      ── Individual requirement (e.g., "Enable root account MFA")
      └ Data Source      ── Where to get evidence (Config rule, CloudTrail, API call, manual)
Assessment       ── Applying a specific framework to a specific account/region scope
  └ Evidence     ── Compliance basis automatically/manually collected (snapshot, log, config, check result)
Assessment Report             ── Bundled evidence formatted for submission to auditors
```

The core value is **automated, continuous evidence collection**. Instead of taking screenshots before an audit, Audit Manager collects evidence throughout the assessment period.

> 💡 **Related Theory**: This is *Continuous Compliance / Compliance as Code*. Traditional audits were point-in-time sample inspections, but in the cloud, configuration and activity are observable via API, so *Continuous Control Monitoring* is possible. We're implementing NIST's RMF (Risk Management Framework) "continuous monitoring" phase as an automated evidence pipeline.

## Four Sources of Evidence

Audit Manager maps where to source evidence for each control. There are four main sources:

1. **AWS Config Rule Evaluation Results**: Resource configuration compliance/non-compliance. *Configuration evidence* like "EBS encrypted," "S3 public access blocked." → Core source for detective controls.
2. **AWS Security Hub Check Results**: Absorb CIS, FSBP, and other security standard check results as evidence.
3. **AWS CloudTrail Events**: *Activity evidence* of "who did what when." Example: root login, KMS key policy change, security group modification.
4. **AWS API Call Results (Resource Snapshots)**: Direct API queries of resource state at a specific point in time.

Items not automatically obtainable (physical security, policy documents, human procedures) are submitted as **manual evidence**. Real audit preparation is "automatic evidence + manual evidence."

## Config Integration: Foundation of Evidence Pipeline

Most of Audit Manager's automated configuration evidence comes from **Config rule evaluation**. Preconditions must be met:

```
Config Recorder activated (all regions/accounts)
   → Config rules (managed/custom) perform evaluation
   → Audit Manager maps rule results to controls
   → Compliance/non-compliance evidence accumulates during assessment
```

If Config is off or rules are missing, Audit Manager cannot generate automatic configuration evidence for that control — this is an exam trap. **Audit Manager requires Config, CloudTrail, and Security Hub to already be activated to reveal its full value**. Audit Manager does not *generate* data but *translates and aggregates* existing data into regulatory framework language.

```bash
# Prerequisite: Config Recorder and rules must be active
aws configservice put-configuration-recorder ...
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "encrypted-volumes",
  "Source": { "Owner": "AWS", "SourceIdentifier": "ENCRYPTED_VOLUMES" }
}'

# Create Audit Manager assessment (apply framework to scope)
aws auditmanager create-assessment \
  --name "PCI-DSS-Q2-2026" \
  --framework-id <PCI_FRAMEWORK_ID> \
  --scope '{ "awsAccounts": [{"id":"111122223333"}], "awsServices": [{"serviceName":"s3"},{"serviceName":"ec2"},{"serviceName":"kms"}] }' \
  --assessment-reports-destination '{ "destinationType":"S3","destination":"s3://audit-reports-bucket/pci/" }' \
  --roles '[{"roleType":"PROCESS_OWNER","roleArn":"arn:aws:iam::111122223333:role/AuditOwner"}]'
```

## Frameworks: Built-in vs Custom

Audit Manager provides multiple **prebuilt frameworks**: CIS AWS Foundations Benchmark, PCI-DSS, SOC 2, HIPAA, GDPR, NIST 800-53, FedRAMP, AWS Well-Architected, etc. Each framework already has a list of controls and recommended data source mappings.

- **CIS AWS Foundations Benchmark**: Infrastructure hygiene controls for IAM, logging, monitoring, networking. Most directly mapped to AWS environments.
- **PCI-DSS**: Card data protection. Encryption, access control, logging, network segmentation, etc. Many automate as Config rules, but some (physical, policy) require manual evidence.

**Custom Frameworks** combine standard controls or define your own. Use when coding internal security policies or specific contract requirements. Duplicate and modify standard framework controls to fit your environment.

## Multi-Account Auditing: Delegated Administrator

Audit Manager also integrates with Organizations to operate **organization-wide assessments from a delegated administrator account** (typically an Audit account). One assessment aggregates evidence from multiple accounts.

```bash
# Register Audit Manager delegated admin from Management Account
aws auditmanager register-account \
  --delegated-admin-account 222233334444
```

This ensures consistency with yesterday (central security account model) — GuardDuty, Security Hub, Config, and Audit Manager all operate from the same Audit account as delegated administrators, centralizing evidence, detection, and reporting.

> 💡 **Related Theory**: Centralizing evidence in a single *access-controlled* account reflects *audit trail integrity* requirement (preventing the evaluated party from directly manipulating evidence). Separating evaluated accounts from evidence custody/assessment accounts structurally blocks manipulation paths.

## Evidence Protection and Reporting

Collected evidence is stored in the S3 bucket specified during assessment setup and encrypted with KMS. Evidence should be treated as nearly immutable, so combining with Log Archive account's immutability pattern (Object Lock, etc.) is best practice. Assessment reports export as PDF/CSV for auditor submission.

## Role Distinction from Other Services (Avoid Confusion)

| Service | Role | "This service is the answer when" |
|---|---|---|
| **Config** | Record and evaluate resource config (compliant/non-compliant) | "Detect/evaluate if configuration follows rules" |
| **Security Hub** | Aggregate security standard checks, findings | "Security score, unified findings dashboard" |
| **Audit Manager** | Auto-map evidence to regulatory frameworks, *audit reports* | "Automate evidence/reports for auditors" |
| **CloudTrail** | API activity log (who, when, what) | "Activity tracking, forensic source log" |

Exams relentlessly test this distinction. "Automate evidence collection and reporting for audits" → Audit Manager. "Evaluate if resources follow rules" → Config. "Aggregate security findings and score" → Security Hub.

## Trap Summary

- Audit Manager does not *generate* evidence — Config, CloudTrail, Security Hub must be activated first for automatic evidence to accumulate.
- Not all controls automate. Physical, policy, procedures require *manual evidence* upload.
- If Config is inactive, configuration evidence is empty and assessment is incomplete.
- Organization-wide audits operate from *delegated administrator* account to centralize and isolate evidence.
- "Evaluation/detection" is Config, "evidence/reports" is Audit Manager — role confusion is a common wrong answer.

## 📝 연습 문제

**문제 1.** 감사팀이 PCI-DSS 감사를 위해 분기마다 수작업으로 스크린샷과 설정을 모아 왔다. 이를 자동화하려 한다. 가장 적절한 서비스는?

A) AWS Config만 사용  
B) AWS Audit Manager로 PCI-DSS 프레임워크 평가를 만들고 Config·CloudTrail·Security Hub 증거를 자동 수집·보고  
C) CloudTrail만 사용  
D) GuardDuty  

**정답: B**  
해설: 규제 프레임워크의 통제에 증거를 자동 매핑·수집하고 감사 보고서까지 만드는 것은 Audit Manager의 핵심 용도다. PCI-DSS 사전 구축 프레임워크로 평가를 만들면 Config·CloudTrail·Security Hub의 데이터가 통제별 증거로 누적된다. Config·CloudTrail 단독은 증거 원천일 뿐 프레임워크 매핑·보고를 하지 않고, GuardDuty는 위협 탐지로 감사 보고와 무관하다.

---

**문제 2.** Audit Manager 평가를 만들었는데 다수 통제의 자동 구성 증거가 비어 있다. 가장 가능성 높은 원인은?

A) Audit Manager가 증거를 직접 생성하지 못해서  
B) AWS Config 레코더/규칙이 비활성 상태라 구성 증거의 원천이 없어서  
C) 프레임워크가 잘못 선택돼서  
D) S3 버킷이 암호화되어서  

**정답: B**  
해설: Audit Manager의 자동 구성 증거는 Config 규칙 평가 결과에서 나온다. Config가 꺼져 있거나 규칙이 없으면 매핑할 데이터가 없어 통제 증거가 비게 된다. Audit Manager는 데이터를 생성하지 않고 기존 데이터를 번역·집계하므로, 선행 서비스 활성화가 전제다. 프레임워크 선택 오류나 버킷 암호화는 이 증상의 일반적 원인이 아니다.

---

**문제 3.** 물리 데이터센터 보안과 직원 보안 교육 이수 같은 통제는 어떻게 Audit Manager 평가에 반영하는가?

A) Config 규칙으로 자동 수집  
B) 자동 수집이 불가하므로 수동 증거(manual evidence)로 문서를 업로드  
C) CloudTrail 이벤트로 수집  
D) 반영할 수 없다  

**정답: B**  
해설: AWS API로 관측 불가능한 물리 보안·인적 절차·정책 문서는 자동 증거로 모을 수 없으므로 수동 증거로 업로드한다. 실제 감사 준비는 자동 증거와 수동 증거의 합이다. Config·CloudTrail은 AWS 구성·활동만 다루므로 이 항목을 수집하지 못하고, 반영할 수 없다는 설명은 틀렸다.

---

**문제 4.** 조직 전역 다계정 감사 증거를 한곳에 집계하고 평가 대상이 증거를 조작하지 못하게 하려 한다. 가장 적절한 설계는?

A) 각 계정에서 개별 Audit Manager 평가를 따로 운영  
B) Audit Manager 위임 관리자를 Audit 계정으로 등록해 조직 전역 평가를 그 계정에서 운영하고 증거를 격리·집계  
C) 관리 계정에서 모든 평가를 운영  
D) 워크로드 계정마다 증거를 로컬 저장  

**정답: B**  
해설: 위임 관리자(통상 Audit 계정)에서 조직 전역 평가를 운영하면 증거를 한곳에 집계하면서 평가 대상 계정과 증거 보관·평가 계정을 분리해 증거 변조 경로를 차단한다. 이는 GuardDuty·Security Hub·Config 위임 모델과도 일관된다. 계정별 분산 운영은 집계·무결성을 잃고, 관리 계정 집중은 공격 표면을 키우며, 로컬 저장은 탈취 시 함께 조작·삭제될 위험이 있다.

---

**문제 5.** 다음 설명 중 서비스 역할 매칭이 옳은 것은?

A) "리소스 구성이 규칙을 지키는지 평가" → Audit Manager  
B) "감사자 제출용 증거를 프레임워크별로 자동 수집·보고" → Audit Manager  
C) "API 활동 로그를 누가·언제 남겼는지 기록" → Config  
D) "위협 행위를 탐지" → Audit Manager  

**정답: B**  
해설: 규제 프레임워크별 증거를 자동 수집해 감사 보고서를 만드는 것은 Audit Manager의 고유 역할이다. 리소스 구성 평가는 Config, API 활동 기록은 CloudTrail, 위협 탐지는 GuardDuty의 몫이므로 나머지는 서비스 매칭이 어긋난다. 시험은 이 네 서비스의 역할 경계를 자주 묻는다.

---

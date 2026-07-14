# Day 4 - Multi-Account Security Operations: Firewall Manager, Central Policy Distribution, Cost/Tag Governance, Security Baseline Automation

With governance ceiling (SCP), baseline automation (Control Tower), and evidence collection (Audit Manager) in place, what remains is *day-to-day operations*. Applying firewall policies consistently across hundreds of accounts, controlling tags and costs, and automatically activating security tools every time a new account is born — this is the operations plane. Today's focus: **AWS Firewall Manager** (central firewall policy distribution), **tag/cost governance**, and **security baseline automation**.

## AWS Firewall Manager: Central Firewall Policy Distribution

Setting up WAF, Shield, Security Groups, Network Firewall, and Route 53 Resolver DNS Firewall account-by-account is error-prone. **Firewall Manager (FMS)** is a service that *defines firewall policies once and automatically distributes and enforces them* across the organization.

Prerequisites matter (common exam focus):
1. **AWS Organizations enabled** (FMS is organization-based)
2. **Firewall Manager admin account designated** — Management Account designates a delegated admin account (typically Security account) as FMS admin
3. **AWS Config enabled** — FMS evaluates resources via Config to determine compliance
4. For WAF/Shield policies, activate respective services first

```
Management Account ──(designate FMS admin)──▶ Security Account (FMS Admin)
                                                 │ define policy once
   ┌─────────────┬─────────────┬─────┘
   ▼             ▼             ▼
Account A      Account B      Account C   (auto-distribute policy + auto-remediate non-compliance)
```

Policy types FMS can distribute and enforce:
- **WAF Policy**: Attach common Web ACL (including managed rule groups) to ALB/CloudFront/API Gateway, etc. automatically.
- **Shield Advanced Policy**: Batch-apply Shield Advanced to protected resources.
- **Security Group Policy**: Common SG or *audit-mode* SG policy (detect and remediate overly-open 0.0.0.0/0 inbound).
- **Network Firewall Policy**: Deploy central inspection VPC firewall policy to multi-account.
- **Route 53 Resolver DNS Firewall Policy**: Distribute malicious domain blocking rule groups.

FMS's strength is **automatic protection of new resources**. When a new resource matching the policy scope (accounts, resource tags) is created, FMS automatically applies the policy. A new ALB without WAF is automatically wired.

> 💡 **Related Theory**: This is *declarative enforcement of policy* and *continuous remediation*. Once a policy is declared, the system *converges* actual state to declared state (same principle as Kubernetes reconcile loop). We structurally eliminate the omissions from imperative manual operations.

## FMS vs WAF vs Network Firewall Role Distinction

| Service | Essence | Relationship |
|---|---|---|
| **WAF** | Apply single Web ACL to one resource | FMS *distributes* this |
| **Network Firewall** | Inspect VPC traffic (stateful/IPS) | FMS *distributes* this |
| **Firewall Manager** | *Organization-wide distribute, enforce, remediate* above policies | Orchestrator |

In exams, "apply WAF consistently to multiple accounts and auto-protect new resources" → Answer is almost always **Firewall Manager**. Direct WAF is only for single resource protection.

```json
// FMS WAF policy (concept). Auto-attach common Web ACL to resourceType targets
{
  "PolicyName": "Org-Common-WAF",
  "ResourceType": "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "SecurityServicePolicyData": {
    "Type": "WAFV2",
    "ManagedServiceData": "{ \"preProcessRuleGroups\":[{\"managedRuleGroupIdentifier\":{\"vendorName\":\"AWS\",\"managedRuleGroupName\":\"AWSManagedRulesCommonRuleSet\"}}], \"defaultAction\":{\"type\":\"ALLOW\"} }"
  },
  "RemediationEnabled": true,
  "IncludeMap": { "ORG_UNIT": ["ou-xxxx-prod"] }
}
```

`RemediationEnabled: true` means FMS auto-remediates non-compliant resources.

## Tag Governance

Tags are the foundation for cost allocation, access control (ABAC), and automation. Inconsistent tags break cost tracking and tag-based permissions. Organization-scale tag governance enforces via three axes:

1. **Tag Policies (Organizations)**: Define allowed tag keys, values, case standards; *report* non-compliant resources (mainly detective/standardization).
2. **SCP-based tag enforcement**: Block creation if required tags missing (preventive).
   ```json
   {
     "Sid": "RequireCostCenterTag",
     "Effect": "Deny",
     "Action": ["ec2:RunInstances","rds:CreateDBInstance"],
     "Resource": "*",
     "Condition": { "Null": { "aws:RequestTag/CostCenter": "true" } }
   }
   ```
3. **Config rule (required-tags)**: Detect and remediate missing tags on existing resources.

Tags are also the core of **ABAC (Attribute-Based Access Control)**. Using `aws:ResourceTag`/`aws:PrincipalTag`, you can grant dynamic permissions like "access only resources with the same team tag," so policy count doesn't explode as accounts and resources grow.

> 💡 **Related Theory**: Tag consistency is the cloud version of *data governance*. Without consistent metadata (tags), all downstream automation for cost, security, and operations sits on unreliable input — "garbage in, garbage out." Use prevention (SCP), standardization (Tag Policy), and remediation (Config) together.

## Cost Governance (Security Perspective)

Cost seems unrelated to security, but **abnormal cost spikes signal compromise** (cryptomining instances, data exfiltration, stolen keys creating bulk resources). Security operations leverage cost signals for threat detection.

- **AWS Budgets**: Threshold alerts by account, tag, service. Alert on spikes.
- **Cost Anomaly Detection**: ML-based abnormal spend detection → early signal of compromise or config error.
- **SCP to restrict expensive instance types/regions**: Block large GPU instance types via SCP to *limit blast radius* of cryptocurrency mining attacks.
   ```json
   {
     "Sid": "DenyExpensiveGPUInstances",
     "Effect": "Deny",
     "Action": "ec2:RunInstances",
     "Resource": "arn:aws:ec2:*:*:instance/*",
     "Condition": {
       "ForAnyValue:StringLike": { "ec2:InstanceType": ["p4d.*","p5.*","x2*"] }
     }
   }
   ```
- **Tag-based cost allocation**: Consistent tags attribute costs to teams/environments so anomalies surface quickly.

Some GuardDuty finding types (e.g., cryptocurrency mining related EC2/Kubernetes findings) connect directly to this context.

## Security Baseline Automation

The endpoint of multi-account security operations is making security tools activate automatically when new accounts are born and non-compliance automatically remediate. Components:

- **GuardDuty / Security Hub / Config auto-activation**: When delegated admin activates "auto-enable," new organizational accounts activate immediately.
- **EventBridge-based auto-response**: GuardDuty/Security Hub findings → EventBridge rule → Lambda/SSM Automation for auto-isolation and remediation.
   ```
   GuardDuty finding (e.g., exposed access key)
     → EventBridge rule match
     → Lambda: disable key + SNS alert + replace SG with isolation SG
   ```
- **Config auto-remediation**: Run SSM Automation document against non-compliant resources (e.g., reapply public access block to public S3 bucket).
- **Account Factory post-processing**: Immediately after new account issuance, auto-apply baseline (additional SCPs, log subscription, tags, IAM roles) via IaC (AFT/CfCT).

This creates the closed loop of "detect → alert → auto-remediate" operating organization-wide.

## Trap Summary

- Firewall Manager requires *Config is activated*. Without Config, compliance evaluation and remediation fail.
- FMS admin should be *delegated administrator (typically Security account)*, not Management Account.
- "Apply WAF/SG/Network Firewall consistently to multiple accounts + auto-protect new resources" → Not direct WAF but *Firewall Manager*.
- Tag governance requires prevention (SCP), standardization (Tag Policy), and remediation (Config) together.
- Abnormal cost spikes are *security signals* — connect Budgets/Cost Anomaly Detection to threat detection.
- New account security bootstraps with auto-enable; non-compliance auto-remediates via EventBridge+Lambda/SSM.

## 📝 연습 문제

**문제 1.** 200개 계정의 모든 ALB에 공통 WAF 관리형 규칙을 적용하고, 앞으로 새로 생기는 ALB도 자동으로 보호되게 하려 한다. 가장 적절한 서비스는?

A) 각 계정에서 WAF Web ACL을 수동으로 ALB에 연결  
B) AWS Firewall Manager로 WAF 정책을 정의해 조직 전역 ALB에 자동 배포·교정하고 신규 리소스도 자동 적용  
C) Security Group으로 HTTP를 제한  
D) CloudFront만 사용  

**정답: B**  
해설: 조직 전역에 방화벽 정책을 일관 배포·강제하고 신규 리소스를 자동 보호하는 것은 Firewall Manager의 핵심 기능이다. WAF 정책으로 관리형 규칙 그룹을 정의하면 범위 내 모든 ALB에 자동 연결되고, 교정을 켜면 비준수도 자동 수정된다. 계정별 수동 연결은 누락·드리프트가 불가피하고, SG는 7계층 WAF 통제를 못 하며, CloudFront 단독은 ALB 보호 일괄화와 무관하다.

---

**문제 2.** Firewall Manager 정책을 만들었는데 일부 계정에서 준수 평가·자동 교정이 동작하지 않는다. 가장 가능성 높은 전제 조건 누락은?

A) 해당 계정에서 AWS Config가 비활성 상태  
B) CloudFront가 비활성  
C) Route 53이 비활성  
D) S3 버킷이 없음  

**정답: A**  
해설: Firewall Manager는 AWS Config로 리소스를 평가해 준수 여부를 판단하고 교정한다. 대상 계정에서 Config가 꺼져 있으면 평가·교정이 동작하지 않는다. FMS의 전제는 Organizations·FMS 관리자 지정·Config 활성화이며, CloudFront·Route 53·S3 존재 여부는 정책 유형에 따른 부수 사항일 뿐 보편적 전제 조건이 아니다.

---

**문제 3.** 모든 EC2/RDS 생성 시 CostCenter 태그를 반드시 갖도록 *강제(차단)*하려 한다. 가장 직접적인 방법은?

A) Tag Policies로 보고만 한다  
B) SCP로 RunInstances/CreateDBInstance에서 aws:RequestTag/CostCenter가 없으면 Deny  
C) Config 규칙으로 탐지만 한다  
D) IAM 사용자에게 교육한다  

**정답: B**  
해설: 생성 시점에 태그 부재를 차단하는 예방 통제는 SCP의 Null 조건으로 구현한다. 필수 태그가 없으면 생성 액션 자체가 거부된다. Tag Policies와 Config 규칙은 표준화·탐지 중심이라 생성을 막지는 않고, 교육은 강제력이 없다. 실무에서는 셋을 함께 쓰되 "강제 차단"의 직접 수단은 SCP다.

---

**문제 4.** 한 계정에서 평소의 10배에 달하는 GPU 인스턴스 비용이 갑자기 발생했다. 보안 운영 관점의 가장 적절한 해석과 통제 조합은?

A) 정상적인 사용 증가이므로 무시  
B) 침해(예: 채굴) 신호일 수 있으므로 Cost Anomaly Detection/Budgets 경보로 조기 탐지하고, SCP로 대형 GPU 인스턴스 타입을 제한해 피해 한계를 줄인다  
C) 인스턴스를 더 늘려 처리량을 높인다  
D) 비용은 보안과 무관하므로 재무팀에만 통보  

**정답: B**  
해설: 비정상 비용 급증, 특히 대형 GPU 인스턴스 급증은 탈취된 자격증명에 의한 암호화폐 채굴 같은 침해의 전형적 신호다. Cost Anomaly Detection·Budgets로 조기 탐지하고, SCP로 채굴용 대형 인스턴스 타입 생성을 차단해 blast radius를 줄이는 것이 보안 운영의 정석이다. 무시·확장은 위험을 키우고, 비용을 보안과 분리해 재무팀에만 넘기는 것은 탐지 기회를 놓친다.

---

**문제 5.** 신규로 조직에 합류하는 모든 계정에서 GuardDuty·Security Hub·Config가 자동으로 켜지고, 발견된 비준수가 자동 교정되게 하려 한다. 가장 적절한 설계는?

A) 계정마다 수동으로 서비스를 켠다  
B) 위임 관리자에서 자동 등록(auto-enable)을 켜고, findings를 EventBridge 규칙으로 받아 Lambda/SSM Automation으로 자동 격리·교정하는 닫힌 루프를 구성  
C) 보안 도구를 끄고 비용을 절감한다  
D) 루트 사용자로 각 계정을 점검한다  

**정답: B**  
해설: 위임 관리자에서 auto-enable을 켜면 신규 계정이 조직에 들어오는 즉시 보안 서비스가 활성화되고, findings를 EventBridge→Lambda/SSM으로 연결하면 탐지·알림·자동 교정의 닫힌 루프가 완성된다. 계정별 수동 활성화는 누락이 생기고, 보안 도구 비활성화는 거버넌스를 무너뜨리며, 루트 점검은 직무 분리·최소 권한에 반한다.

---

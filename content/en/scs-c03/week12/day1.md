# Day 1 - Integrated Review Domains 1 & 2: Threat Detection and Incident Response ↔ Security Logging and Monitoring

The two heaviest-tested axes of the six exam domains are Domain 1 (Threat Detection and Incident Response, ~14%) and Domain 2 (Security Logging and Monitoring, ~18%). They almost always appear as *one flow* in exams. "Logs must exist to detect, detection must exist to respond." Today, we review the pipeline — **collection (logs) → analysis/detection (GuardDuty/Detective/Macie) → aggregation (Security Hub) → auto-response (EventBridge→Lambda/SSM)** — as one nervous system.

## Logging Layer: What Gets Recorded Where

Detection originates from logs. Exams endlessly ask: "To see this evidence, which log must you activate?"

| What You Want to Know | Log Source | Location/Note |
|---|---|---|
| Who called which API | CloudTrail (management events) | On by default, held 90 days in console. Permanent retention via S3 |
| S3 object/Lambda data access | CloudTrail **data events** | Explicit activation, metered. Tracks object GET/PUT |
| VPC IP flow (allow/deny) | VPC Flow Logs | Per ENI/Subnet/VPC. No payload |
| DNS query content | Route 53 Resolver query log | Domain exfiltration detection |
| HTTP request and block | WAF log | `aws-waf-logs-` prefix required |
| OS/app internal activity | CloudWatch Logs (agent) | Instance internal visibility |
| Configuration change history, compliance | AWS Config | Resource timeline, rule evaluation |

Critical trap: **CloudTrail management events do not record S3 GetObject.** Object-level access requires *data events* explicitly enabled. Organization trails aggregate multi-account into single S3 bucket, log file validation (SHA-256 digest) detects tampering, SSE-KMS encryption.

## Detection Layer: Translate Logs to Threats

- **GuardDuty**: Analyzes CloudTrail, VPC Flow Logs, DNS logs with ML and threat intel to generate findings.
- **Macie**: Auto-classify and discover PII, sensitive data in S3.
- **Detective**: Graph-investigate GuardDuty finding's root cause and scope.
- **Inspector**: Scan EC2/ECR/Lambda for CVE vulnerabilities and network exposure.
- **Access Analyzer**: Analyze resource policies exposed to external/cross-account.

## Aggregation Layer: Security Hub

Security Hub normalizes findings from GuardDuty, Inspector, Macie, Config into **ASFF** standard. Provides automated compliance scores (CIS, AWS FSBP, PCI DSS, NIST).

## Response Layer: EventBridge Wires the Nerve

**EventBridge** routes findings to Lambda (immediate remediation), SSM Automation (multi-step response), SNS (human alert), or Step Functions (approval-gated workflow).

### Standard Incident Response Procedure

Compromised EC2 response order:
1. **Isolate**: Replace with empty security group for forensic isolation.
2. **Preserve Evidence**: EBS snapshot, memory dump, instance metadata.
3. **Detach**: Detach from Auto Scaling Group to prevent replacement.
4. **Investigate**: Detective for scope, share snapshots to forensic account.
5. **Recover/Remediate**: Redeploy clean AMI, revoke compromised credentials.

## 📝 연습 문제

**문제 1.** 보안팀이 "어떤 IAM 사용자가 특정 S3 객체를 다운로드했는지"를 추적하려 한다. 기본 CloudTrail만 켜진 상태에서 이 정보가 보이지 않았다. 원인과 해결은?

A) VPC Flow Logs를 켜야 한다  
B) CloudTrail **데이터 이벤트**(S3 객체 수준)를 명시적으로 활성화해야 한다 — 관리 이벤트는 객체 GET/PUT을 기록하지 않는다  
C) GuardDuty를 켜면 자동으로 기록된다  
D) CloudWatch Logs agent를 설치해야 한다  

**정답: B**

---

**문제 2.** GuardDuty가 EC2 인스턴스의 악성 IP 통신 finding을 생성했다. 보안팀은 이 인스턴스가 다른 어떤 리소스·계정과 연결됐고 침해가 얼마나 퍼졌는지 시각적으로 조사하려 한다. 가장 적합한 서비스는?

A) Amazon Inspector  
B) Amazon Macie  
C) Amazon Detective  
D) AWS Config  

**정답: C**

---

**문제 3.** 요구사항: "Config 규칙이 퍼블릭 S3 버킷을 발견하면 사람 개입 없이 즉시 퍼블릭 접근을 차단하고 보안팀에 알림." 가장 적절한 구현은?

A) Config 규칙 점수만 매일 검토한다  
B) Config 규칙 + 자동 교정(SSM Automation)으로 즉시 PublicAccessBlock 적용 + EventBridge→SNS로 알림  
C) IAM 정책으로 모든 사용자의 S3 권한 제거  
D) GuardDuty에 버킷을 등록한다  

**정답: B**

---

**문제 4.** 침해가 의심되는 EC2 인스턴스를 다룰 때, 휘발성 증거를 보존하면서 격리하는 올바른 첫 조치는?

A) 인스턴스를 즉시 종료(terminate)한다  
B) 인바운드·아웃바운드가 없는 포렌식 격리용 보안 그룹으로 교체하고, Auto Scaling에서 detach하며, EBS 스냅샷을 뜬다  
C) 보안 그룹을 모두 허용으로 바꿔 트래픽을 관찰한다  
D) 인스턴스 IAM 역할만 삭제한다  

**정답: B**

---

**문제 5.** 다음 중 탐지 서비스와 그 주 용도의 연결이 잘못된 것은?

A) GuardDuty — CloudTrail/Flow Logs/DNS 기반 위협(행위 이상) 탐지  
B) Inspector — EC2/ECR/Lambda의 취약점(CVE)·네트워크 노출 평가  
C) Macie — S3 내 PII·민감 데이터 자동 분류·발견  
D) Security Hub — GuardDuty finding의 근본 원인을 그래프로 조사  

**정답: D**

---

**문제 6.** 다계정 환경에서 모든 계정의 CloudTrail 로그를 변조 불가능하게 중앙 보관하려 한다. 가장 적절한 조합은?

A) 각 계정이 개별 trail을 로컬에 보관  
B) Organization trail로 단일 중앙 S3 버킷에 집약 + log file validation(digest) + SSE-KMS + S3 Object Lock(WORM)/MFA Delete  
C) CloudWatch Logs에만 저장하고 30일 후 삭제  
D) GuardDuty에 로그를 직접 업로드  

**정답: B**

---

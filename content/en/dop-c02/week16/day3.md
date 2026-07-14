# Day 3 - Incident Response and Security Compliance Woven Through Everything

Today: **incident response (8%) and security (14%)**, together 22% of the exam. Unlike Domains 1-4, these don't cluster as separate topics but rather are **cross-cutting.** Every pipeline has security gates. Every incident should have audit trail. Today: treat these as **properties of all systems**, not silos.

## Incident Response Fundamentals — MTTR, Root Cause, Runbook Automation

Incident response has one north star: **Mean Time To Recover (MTTR).** From detection to system restored.

MTTR = Detection Time + Diagnosis Time + Remediation Time + Validation Time

> 💡 **Related theory**: Each component is attackable. Reduce detection time: lower alarm threshold, add synthetic checks. Reduce diagnosis: observability (traces pinpoint service). Reduce remediation: auto-heal (Lambda, Step Functions), remove manual toil. Reduce validation: health checks resume traffic. Pro exams test all four; missing any one, MTTR stays long.

> 🔍 **Deeper**: **Incident Manager** (AWS service) automates escalation and communication. On-call detection → page, escalate if unresolved after 5min to manager, notify Slack, create ticket in JIRA. Removes human delay (on-call misses page, waits for team slack). But incident managers are only useful if **runbooks exist.** Runbook = step-by-step "if CPU spike, check DB, if DB slow, scale, verify CPU down." Without runbook, on-call wastes time asking "what do I do?"

> 📚 **Case study**: 2016 **Facebook outage**, engineering team initially unaware how to recover (config system corrupted). Recovery took hours longer than needed. Lesson: write runbook and **practice** (chaos tests). Modern: runbook is Step Functions workflow, alarm triggers auto-execution, human can observe or halt.

## Logging for Compliance — CloudTrail, Config, Audit Account

Compliance starts with **audit trail.** Who changed what, when? CloudTrail logs all API calls; Config tracks resource state changes. Audit account aggregates both.

> 💡 **Related theory**: **Principle of least privilege** + **audit = accountability.** Developer has permission to change S3 bucket policy (privileged), but CloudTrail records "who, what, when." Audit account holds unmodifiable copy of logs. Exam: "PII data exposure, need proof developer didn't leak" → CloudTrail shows "Developer X called GetObject on bucket Y at time Z" or didn't. No log, no proof.

> ⚠️ **Gotcha**: **CloudTrail logs must be protected.** Store in S3 with MFA Delete, lock via Object Lock (immutable). If attacker can modify CloudTrail logs post-incident, audit trail is useless. Also, **Config Rules** enforce compliance: "All EC2 instances must have encryption tag." Violation → auto-remediate (SSM Documents) or alert. Compliance is enforcement, not just logging.

## GuardDuty and Security Hub — Threat Detection and Aggregation

GuardDuty uses ML to detect threats (unusual API usage, port scans, malware-like behavior). Security Hub aggregates GuardDuty + Config + Inspector + other security tools into single dashboard. Multi-account: delegate admin to Infra team, hub account sees all spoke findings.

> 💡 **Related theory**: **Defense in depth** has layers: (1) prevent (IAM role limits), (2) detect (GuardDuty), (3) respond (EventBridge → auto-kill credentials, block IP). Exam: "malicious credential leak detected" → GuardDuty finding → EventBridge rule → Lambda invalidates all sessions, rotates credential. Five-minute MTTR instead of "wait for human to respond."

## Security Compliance Frameworks — CIS Benchmarks, SOC 2

Frameworks define **which controls matter.** CIS AWS Foundations Benchmark: "MFA on root account" (Foundational level), "CloudTrail multi-region" (Level 1). AWS Config rules map to CIS; compliance score is "% of Config rules passing."

> 📚 **Case study**: 2019 **Capital One breach**, attacker exploited WAF misconfiguration. Post-incident: tightened WAF rules, added GuardDuty detection for WAF bypass patterns, automated runbook. Lesson: breach happens; design to detect and respond fast.

## Unified Flow: Prevention → Detection → Response → Learning

```
Secure development (SAST in CodeBuild, container scan in ECR)
   ↓
Deployed resource (GuardDuty watches, Config enforces)
   ↓
Threat event (GuardDuty finding, Security Hub aggregates)
   ↓
EventBridge trigger (on GuardDuty HIGH/CRITICAL)
   ↓
Auto-remediation (Lambda revokes credentials, SSM Document patches, WAF blocks IP)
   ↓
Incident Manager (pages on-call if auto-remediation fails)
   ↓
Runbook execution (Step Functions logs every step)
   ↓
Postmortem (CloudTrail audit trail, Config history, traces show attack path)
   ↓
Prevention update (tighten IAM, add GuardDuty rule, patch code)
```

> 🎯 **Scenario**: "Fintech, exposed AWS credential in logs. Detect within 5min, invalidate within 10min, audit trail intact." → (1) GuardDuty anomaly detection or Secrets scanning catches "pattern matches known AWS key format" (detection time ~2min), (2) EventBridge rule fires on finding, (3) Lambda calls STS RevokeAllSessions (remediation time ~2min), (4) Incident Manager alerts (notification time ~1min), (5) Runbook auto-generated from config shows "credential scope: read S3 bucket X", (6) CloudTrail shows "this credential called GetObject 1000x" during attack window, audit intact. MTTR ≈ 10min, full audit trail.

## Security Scanning — SAST, DAST, Container Scan, Infrastructure Scan

Modern security is **shift-left**: catch bugs early (build time), not late (production).

| Tool | When | Scope | False Positives |
|---|---|---|---|
| **SAST** (CodeGuru, SonarQube) | Build stage | Source code | High (context-blind) |
| **Dependency Check** | Build stage | npm/pip packages | Low (known CVEs) |
| **Container Scan** (ECR) | Build/push | Image layers | Medium |
| **DAST** (burp, OWASP ZAP) | Staging | Live app behavior | Low (exercises real code) |
| **IAM Access Analyzer** | Deploy | Policy logic | Very low (formal analysis) |

> 💡 **Related theory**: SAST finds "this code pattern is risky," but false positives (pattern is okay in context). DAST exercises live app, finds real vulnerabilities. Both are needed. CodePipeline should gate CRITICAL SAST findings (fail build), and allow MEDIUM (log but don't block). This speeds CI without sacrificing security.

## Summary

Today wove Domains 5+6's 22% into system properties. First, **incident response has four time components; reduce each via detection automation, diagnosis (observability), remediation (auto-heal), validation (health checks).** Second, **Incident Manager + runbooks (Step Functions) automate escalation and execution.** Third, **audit trails (CloudTrail, Config) protect with MFA Delete and Object Lock.** Fourth, **GuardDuty + Security Hub + Config Rules enforce compliance across accounts.** Fifth, **eventBridge→Lambda→remediate pipeline responds in minutes.** Sixth, **security scanning (SAST/DAST/container/IAM) shifts vulnerability detection left.** Seventh, **postmortem + chaos engineering (FIS validate fixes) prevent recurrence.**

Final two days: Full exam scenarios (Day 4) and D-Day exam prep strategy (Day 5).

---

## 📝 연습 문제

(Practice questions 1-6 in Korean on incident response, security, compliance, GuardDuty, Config, CloudTrail)

---

## 📌 오늘의 요약

오늘 도메인 5+6의 22%를 엮었다. 첫째, 사건 대응은 MTTR 최소화: 탐지·진단·치유·검증 각 단계를 자동화한다. 둘째, Incident Manager + Step Functions 워크플로우가 에스컬레이션을 자동화한다. 셋째, CloudTrail·Config 감사 로그는 MFA Delete·Object Lock으로 보호한다. 넷째, GuardDuty·Security Hub·Config Rules는 컴플라이언스를 다중 계정으로 강제한다. 다섯째, EventBridge→Lambda 파이프라인은 분 단위로 대응한다. 여섯째, SAST/DAST/컨테이너/IAM 스캔은 취약성 탐지를 왼쪽(빌드)으로 이동한다. 일곱째, 사후 분석 + FIS 혼돈 테스트가 재발을 방지한다.

# Day 4 - Full Exam Scenarios (Domains 1-6 Integrated)

Final review before exam. Today: five scenarios that weave all six domains. Each question has **one constraint word** that signals answer. Solve by mark-domain-narrow-decide in under 2 minutes.

---

## Scenario 1: Global Fintech SaaS, 60 Accounts, Auto-Provision, Zero-Internet DC, No Downtime Deploy

A fintech firm runs 60 accounts via Control Tower, on-prem DC with zero internet, mobile app in production. They need:
- New microservice launch: auto-provision account + pipeline + DC link
- DB change: deploy with zero downtime to 60 DBs simultaneously
- Incident: security breach detected, need remediation + audit within 5min
- Cost: enforce 90-day spend budgets per account

**Signal words**: "60 accounts auto", "zero internet DC", "zero downtime", "within 5min", "enforce budget"

**Step 1: Constraints** → Multi-account (AFT), Hybrid network (PrivateLink + Roles Anywhere), Deployment strategy (Blue/Green), Incident automation (EventBridge + Step Functions), Cost control (Cost Categories + Anomaly Detect).

**Step 2: Domain ID** → Domain 1 (pipeline) + Domain 2 (IaC) + Domain 2 (config) + Domain 3 (deployment) + Domain 5 (incident) + Domain 6 (cost/compliance).

**Step 3: Narrow to two** → (A) AFT + CodePipeline + Direct Connect MACsec + CodeDeploy Blue/Green Lambda Canary + EventBridge + Budget Alerts = all correct. (B) Service Catalog + Jenkins + SSM Hybrid + manual blue-green + Lambda = works but has manual, less managed.

**Step 4: Final decision** → Pro prefers managed. Answer: AFT + CodePipeline + DX + CodeDeploy Canary + EventBridge auto-remediate (Lambda revoke credentials) + Cost Categories + AWS Budgets. Five pillars (IaC via AFT, pipeline via CodePipeline, observability via CloudWatch, security via GuardDuty→EventBridge, cost via Budgets).

---

## Scenario 2: E-Commerce Platform, ECS Fargate Cluster, 50% Cost Cut, 30-sec Failover, Feature Flags

E-commerce platform, ECS on Fargate. Competitor pressure: cut infra cost 50%, keep latency <200ms p99, feature flag gates new checkout flow, canary 5% traffic.

**Signal words**: "50% cost cut", "30-sec failover", "feature flags", "canary 5%"

**Step 1: Constraints** → Cost (Spot + Graviton), Resilience (RTO 30sec), Config (AppConfig feature flags), Deployment (Canary 5%).

**Step 2: Domain ID** → Domain 3 (containers + cost), Domain 3 (resilience), Domain 2 (config), Domain 1 (deployment strategy).

**Step 3: Narrow to two** → (A) Karpenter Spot + Graviton + AppConfig with Lambda validation + CodeDeploy ECS Canary 5% + ALB target group = correct, hits all signals. (B) EC2 ASG Reserved Instances + Parameter Store + manual feature flag toggle + CodeDeploy Rolling = works but no Spot, no Graviton, no 30-sec failover, no validation.

**Step 4: Final decision** → Karpenter Spot Graviton + AppConfig (staged rollout, auto-rollback on alarm) + CodeDeploy Canary 5% (Lambda Alias weighted 95%→5%, ALB shift if alarm clears). RTO 30sec via immediate Spot node spin-up + ALB re-registration. Cost: Spot ~60% discount, Graviton ~25% discount = >50% combined. Automated: feature flag bad value? AppConfig rolls back. Deploy bad? CodeDeploy alarm rolls back.

---

## Scenario 3: Data Warehouse, Quarterly Rebalance, 48h RTO, Cross-Region Failover, Cost Per Query

Data warehouse, batch-heavy (nightly runs), 48h RTO acceptable, cross-region hot standby, cost billed per query.

**Signal words**: "48h RTO", "quarterly rebalance", "cross-region", "cost per query"

**Step 1: Constraints** → Resilience (48h RTO = Pilot Light or Warm Standby, not Active-Active), Cost (Redshift on-demand vs Spectrum, Athena per-query billing).

**Step 2: Domain ID** → Domain 3 (resilience, RTO/RPO), Domain 6 (cost optimization).

**Step 3: Narrow to two** → (A) Redshift primary cluster + cross-region standby with 6-hour sync (manual restore on failover) + Redshift Spectrum queries S3 (per-query cost) = matches 48h RTO + cost-per-query. (B) Redshift Active-Active + EventBridge auto-failover + Redshift RA3 (managed scale) = overkill (cost 3x), RTO <1min (not needed), exceeds budget.

**Step 4: Final decision** → Redshift Pilot Light: primary cluster in us-east-1, standby cluster in us-west-2 running 24/7 (minimal, ~30% cost), automated snapshot sync every 6h. RTO: restore from snapshot + load data ≈ 12h (within 48h acceptable). On failover: switch connection string, Redshift Spectrum queries run against S3 until primary restored. Cost: Spectrum avoids full RA3 management overhead. Quarterly rebalance: ANALYZE tables during maintenance window, maintain statistics for query planner.

---

## Scenario 4: Compliance-Heavy Telco, Audit Trail, Incident Auto-Response, Zero Secrets in Code

Telco regulated by HIPAA/FCC, all code deployed to production, must trace "who changed what when," incident detected (GuardDuty finding) must auto-respond within 2min without human.

**Signal words**: "audit trail", "auto-respond 2min", "zero secrets in code", "regulated"

**Step 1: Constraints** → Security (audit trail, no hardcoded secrets), Incident (auto-respond, MTTR 2min), Compliance (regulated, evidence required).

**Step 2: Domain ID** → Domain 5 (incident response), Domain 6 (security, secrets management, compliance logging).

**Step 3: Narrow to two** → (A) CodePipeline (OIDC + Secrets Manager for creds) + GuardDuty (finding on suspicious API) + EventBridge → Step Functions (Standard, allows Long Wait for human approval gate) + Incident Manager escalate if unresolved → CloudTrail immutable log + Config Rules enforce compliance = fully automated, auditable. (B) Jenkins (hard secrets in environment) + manual incident response + email alerts + local logging = not auditable, slow, hardcoded secrets.

**Step 4: Final decision** → CodePipeline OIDC (no static keys) + Secrets Manager (rotated daily) + SBOM scan (prove supply chain integrity) + GuardDuty monitoring + EventBridge HIGH/CRITICAL finding trigger → Step Functions Standard (long-running, audit trail, human loop if auto-remediation fails) → Lambda auto-revokes credentials, SSM Document patches, no action needed from on-call unless auto-remediate fails (escalate at 2min). CloudTrail protected by S3 MFA Delete + Object Lock (immutable, compliance proof). Regulated firms love this: "show me the evidence" → CloudTrail log proves "this credential was revoked at 14:35:22 UTC, no data was leaked beyond 14:35:27 UTC (5-sec window)."

---

## Scenario 5: Microservices Startup, 20 Services, Single Region, Cost-Conscious, Developer-First CI/CD

Startup: 20 microservices (monorepo), single AWS region (dev budget), need fast feedback to developers (CI should be <5min), cheap (Fargate Spot OK, no reserved capacity).

**Signal words**: "monorepo", "20 services", "single region", "cost", "<5min CI"

**Step 1: Constraints** → Pipeline (monorepo path filter), Cost (Spot, no reserved), Speed (short CI), Deployment (auto-scale on demand).

**Step 2: Domain ID** → Domain 1 (pipeline, V2 filePaths trigger), Domain 3 (cost, containers, Karpenter), Domain 2 (IaC, CDK fast feedback).

**Step 3: Narrow to two** → (A) CodePipeline V2 (filePaths `services/X/**` trigger) + CodeBuild on Fargate (5-min compile+test per service) + ECR push + ECS deploy Canary (Karpenter Spot node) = CI 5min, cost-optimized. (B) Jenkins in EC2 (persistent overhead, no spot scaling) + manual webhook + ECS OnDemand (3x cost) = slower, more expensive.

**Step 4: Final decision** → CodePipeline V2 with filePaths trigger (only changed service's pipeline runs, saves time·cost). CodeBuild with provisioned concurrency off (serverless), runs in VPC with Fargate compute (cheaper than EC2). ECS deploy to Karpenter cluster (auto-spins Spot nodes, parks unused). CDK for IaC (Typescript, familiar to dev team), fast synth+deploy (5min). Cost: Spot 60% discount + Fargate Spot 70% discount = startup-friendly. Feedback: developer pushes to `services/payments/**`, within 2min Pipeline V2 detects, builds, tests; 5min total. Developer sees pass/fail before next commit.

---

## Summary: Five Scenarios, Five Signals

| Scenario | Key Signals | Domains | Answer Keywords |
|---|---|---|---|
| 1. Fintech 60 accounts | "60 accounts", "zero internet", "5min incident" | 1+2+3+5+6 | AFT, CodePipeline, DX MACsec, CodeDeploy Canary, EventBridge, Cost Categories |
| 2. E-Commerce Fargate | "50% cost", "30s failover", "canary 5%", "feature flags" | 1+2+3 | Karpenter Spot, Graviton, AppConfig, CodeDeploy Canary, ALB weight shift |
| 3. Data Warehouse | "48h RTO", "cost per query", "cross-region" | 3+6 | Redshift Pilot Light, Spectrum, 6h sync snapshot |
| 4. Telco Compliance | "audit trail", "2min auto-respond", "zero secrets" | 5+6 | CodePipeline OIDC, Secrets Manager, GuardDuty, Step Functions Standard, EventBridge, CloudTrail MFA Delete |
| 5. Startup Monorepo | "monorepo", "20 services", "<5min CI", "cost" | 1+2+3 | CodePipeline V2 filePaths, CodeBuild Fargate, ECS Karpenter Spot, CDK |

---

## 📝 연습 문제

(Full 5 scenarios with 3 choices each, following the scenario format above)

---

## 📌 오늘의 요약

다섯 시나리오는 모두 여섯 도메인을 이해하는 것이 아니라 **단서 인식과 트레이드오프 판단**을 테스트한다. 첫째, 제약 단어 표시 ("60계정", "5분", "영비용"). 둘째, 도메인 ID (각 도메인이 문제의 어느 부분을 커버하는가). 셋째, 두 선택지로 좁히기 (작동하는 것 vs 작동하고 제약에 맞는 것). 넷째, Pro의 바이어스 (관리형 > 자가구축). 다섯째, 두 선택지 비교 (하나를 선택). 이 5단계가 2분 내에 75문제를 푸는 열쇠이다.

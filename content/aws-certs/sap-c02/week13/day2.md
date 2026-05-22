# Day 62 - 운영 우수성·보안 기둥 심화

📅 Week 13 (Day 2)
🎯 주제: Ops·Sec 두 기둥
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Operational Excellence 설계 원칙·도구
- Security 설계 원칙·도구 (책임 공유, 데이터 보호, 사고 대응)

---

## 🧩 사전 지식 (CS 기초)

- **GitOps**: Git 저장소를 단일 진실 소스로
- **Zero Trust**: 모든 요청 검증
- **책임 공유 모델**: AWS vs 고객 책임 경계

---

## 📖 이론 내용

### 1. Operational Excellence 원칙

1. 운영을 **코드로** (CFN·CDK·Terraform)
2. 작은·빈번한 **되돌릴 수 있는** 변경
3. 운영 절차 정기적 **개선**
4. 장애 **예상·학습**
5. 모든 운영 절차 **자동화**

### 2. Ops 도구

| 도구 | 용도 |
|------|------|
| **CloudFormation·CDK** | IaC |
| **Service Catalog** | 승인된 제품 카탈로그 |
| **Systems Manager** | 패치·세션·파라미터·인벤토리·OpsCenter |
| **CloudWatch** | 메트릭·로그·알람·대시보드·Synthetics |
| **X-Ray·CloudWatch ServiceLens·ADOT** | 트레이스·관측성 |
| **CodePipeline·CodeDeploy** | CI/CD |
| **Health Dashboard** | 서비스·계정 헬스 |
| **Chatbot** | Slack·MS Teams 운영 알림 |

### 3. Security 원칙

1. 강력한 ID 기반
2. **추적성** (CloudTrail·Config)
3. 모든 계층 보안
4. **자동화된** 보안 모범 사례
5. 전송·저장 **암호화**
6. 사람을 데이터에서 멀리
7. 사고 대응 **준비**

### 4. Security 도구

| 영역 | 도구 |
|------|------|
| ID | IAM·IAM Identity Center·STS·Cognito |
| 탐지 | GuardDuty·Macie·Inspector·Security Hub·Detective |
| 인프라 보호 | SG·NACL·WAF·Shield·Network Firewall·Firewall Manager |
| 데이터 보호 | KMS·CloudHSM·Secrets Manager·Certificate Manager |
| 사고 대응 | EventBridge·Lambda·Systems Manager Incident Manager·Detective |
| 컴플라이언스 | Artifact·Audit Manager·Config |

### 5. 추적성 3종

- **CloudTrail** — API 감사
- **Config** — 리소스 상태·변경
- **CloudWatch Logs** — 애플리케이션·시스템

---

## 🧠 심화 이론

### Pro 단골 시나리오

- "운영 변경 안전" → Canary·Blue/Green·CodeDeploy
- "사람이 SSH 안 됨" → SSM Session Manager
- "Secret 자동 로테이션" → Secrets Manager + RDS 통합
- "ACL·SG 변경 추적" → Config + EventBridge
- "Org 차원 자동 격리" → GuardDuty + Security Hub + EventBridge + Lambda

### Incident Manager (Systems Manager)

- 사고 대응 자동화 — 페이저·런북·소통 채널 자동

---

## 🏗️ 아키텍처 — 운영·보안 통합

```
[GitOps]
   │
[CodePipeline → CFN/CDK → Service Catalog]
   │
[SSM Patch·Session·Inventory]
   │
[CloudWatch · X-Ray · ADOT]
   │
[CloudTrail · Config · Security Hub]
   │
[EventBridge → Lambda · Incident Manager · Chatbot]
```

---

## ⭐ 핵심 포인트

1. ⭐ Ops = IaC + Managed + 자동화
2. ⭐ SSM Session Manager·Patch Manager
3. ⭐ Sec = 추적성 3종(CloudTrail·Config·Logs)
4. ⭐ Secrets Manager 자동 로테이션
5. ⭐ Incident Manager로 런북 자동
6. ⭐ Org 위임 관리자로 통합

---

## 💻 CLI 예시

```bash
# Secret 자동 로테이션
aws secretsmanager rotate-secret \
  --secret-id prod/db \
  --rotation-lambda-arn arn:aws:lambda:...:function:rotate-rds \
  --rotation-rules AutomaticallyAfterDays=30
```

---

## 📝 연습 문제

**문제 1.** SSH 키 관리 부담 제거.

A) Bastion 호스트
B) SSM Session Manager
C) Cognito
D) Client VPN

**정답: B**

---

**문제 2.** DB 비밀번호 30일마다 자동 변경.

A) Parameter Store
B) Secrets Manager + Rotation Lambda
C) KMS
D) Config

**정답: B**

---

**문제 3.** API 호출 누가 했는지 감사.

A) Config
B) CloudTrail
C) CloudWatch
D) X-Ray

**정답: B**

---

**문제 4.** 리소스 상태 변경 이력·컴플라이언스.

A) CloudTrail
B) Config
C) Trusted Advisor
D) Inspector

**정답: B**

---

**문제 5.** 사고 발생 시 페이저·런북·채널 자동.

A) Chatbot
B) Incident Manager
C) Health Dashboard
D) EventBridge

**정답: B**

---

**문제 6.** 승인된 인프라 제품만 사용자가 배포.

A) CFN 직접
B) Service Catalog
C) Control Tower
D) Config Rule

**정답: B**

---

## 📌 오늘의 요약

1. Ops = IaC·SSM·CW·CI/CD
2. Sec = 추적성·KMS·SM·SH 통합
3. Session Manager·Patch Manager
4. Secrets Manager 자동 로테이션
5. Incident Manager 자동 대응

# Day 56 - 도메인 1 복습: 보안 아키텍처 (30%)

📅 날짜: Week 12 (Day 1)
🎯 주제: 시험 도메인 1 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 보안 도메인의 핵심 25개 키워드 → 서비스 매핑이 즉시 나온다
- 시나리오 빈출 함정 10개를 외운다

---

## 🧩 사전 지식 (CS 기초)

- **CIA Triad**: 기밀성·무결성·가용성. 보안 3대 목표.
- **Defense in Depth**: 다층 방어. 단일 솔루션 의존 X.
- **Zero Trust**: 내부도 신뢰하지 않음.

---

## 📖 핵심 정리

### A. 자격 증명·권한

| 키워드 | 서비스 |
|--------|--------|
| 사용자·역할·정책 | IAM |
| 사용자 앱 로그인·JWT | Cognito User Pool |
| 사용자 → STS Role 임시 | Cognito Identity Pool |
| 직원 SSO | IAM Identity Center |
| 임시 자격증명 일반 | STS |
| AD/Okta SAML | AssumeRoleWithSAML |
| EKS Pod IAM | IRSA (AssumeRoleWithWebIdentity) |
| 조직 가드레일 | SCP |
| 사용자 천장 | Permission Boundary |

### B. 암호화

| 키워드 | 서비스 |
|--------|--------|
| 키 관리 | KMS CMK |
| FIPS L3 | CloudHSM |
| 비밀 자동 회전 | Secrets Manager |
| 구성/SecureString | Parameter Store |
| 봉투 암호화 | KMS DEK |
| S3 디폴트 암호화 | SSE-S3 |
| 키 정책 통제 | SSE-KMS |
| S3 KMS 호출 비용 ↓ | Bucket Keys |

### C. 네트워크 / 경계

| 키워드 | 서비스 |
|--------|--------|
| 인스턴스 화이트리스트 | Security Group |
| IP 차단 / 서브넷 광역 | NACL |
| L7 어플 공격 | WAF |
| DDoS L3/L4 | Shield |
| 위협 행동 탐지 | GuardDuty |
| OS 취약점 | Inspector |
| S3 PII | Macie |
| 통합 점수 | Security Hub |
| 사고 분석 그래프 | Detective |
| 조직 가드레일 (WAF/SG) | Firewall Manager |

### D. 데이터 보호

| 키워드 | 서비스 |
|--------|--------|
| S3 public 차단 | Block Public Access |
| Glacier WORM | Vault Lock / S3 Object Lock |
| HTTPS 강제 | aws:SecureTransport |
| 멀티 리전 키 | KMS Multi-Region Key |
| 봉투 암호화 SDK 캐시 | DEK Caching |

### 시험 함정 10가지

1. SG는 Deny 불가 → IP 차단은 NACL.
2. SSE-KMS는 KMS 키 정책에도 명시 필요.
3. Block Public Access는 IAM/Bucket Policy 모두 이긴다.
4. EC2 → AWS API 호출 = IAM Role (키 하드코딩 ❌).
5. 자동 비밀 회전 = Secrets Manager (Parameter Store ❌).
6. GuardDuty = 위협 / Inspector = 취약점 / Macie = PII.
7. WAF는 CloudFront / ALB / API GW / AppSync / Cognito 통합.
8. Shield Standard 무료, Advanced 비싸+SLA.
9. CloudHSM = 단독 HSM, KMS는 multi-tenant.
10. Cross-account = 양쪽 허용 + 키 정책까지.

---

## ⭐ 추가 시험 팁

- **MFA**는 정책의 `aws:MultiFactorAuthPresent`로 강제.
- **Org Trail**로 모든 계정 자동 감사.
- **Resource Policy**가 있는 서비스들: S3, KMS, SQS, SNS, Lambda, Secrets Manager, IAM Role(신뢰 정책).

---

## 📝 종합 시나리오 문제 5

**문제 1.** RDS 비밀번호 30일마다 자동 회전:

A) Parameter Store B) Secrets Manager C) KMS D) IAM DB Auth

**정답: B**.

---

**문제 2.** EKS Pod 단위 IAM:

A) Instance Profile B) IRSA C) Task Role D) KMS Grant

**정답: B**.

---

**문제 3.** S3 PII 자동 분류:

A) GuardDuty B) Inspector C) Macie D) Config

**정답: C**.

---

**문제 4.** WAF 통합 가능 대상:

A) CloudFront / ALB / API GW / AppSync / Cognito B) NLB C) EC2 직접 D) S3 직접

**정답: A**.

---

**문제 5.** 회사 비밀 멀티 리전 복제:

A) Secrets Manager Replication B) Parameter Store Replication C) KMS only D) IAM 정책 복제

**정답: A**.

---

## 📌 오늘의 요약

1. 도메인 1(30%)의 키워드 → 서비스 매핑이 시험 가성비 가장 큼.
2. IAM·KMS·Secrets·Cognito·WAF·GuardDuty/Inspector/Macie + Security Hub 정도가 거의 매번 나옴.
3. 함정 10가지 한 번 더 점검.

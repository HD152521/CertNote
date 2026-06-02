# Day 40 - Week 8 복습 + 시나리오 문제 10

📅 날짜: Week 8 (Day 5)
🎯 주제: 보안 & 자격 증명 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 보안 도메인(30%) 핵심 서비스를 시나리오로 매핑한다
- 암호화·자격증명·탐지·차단 4축을 한 번에 본다

---

## 🧩 사전 지식 (CS 기초)

- **Defense in Depth**: 한 계층 뚫려도 다음 계층이 있다.
- **Zero Trust**: 내부 네트워크라도 신뢰하지 않고 항상 인증/검증.

---

## 📖 한 주 핵심 정리

1. **KMS**: 봉투 암호화, CMK, 자동 회전, 7~30일 삭제.
2. **Secrets Manager**(회전) vs **Parameter Store**(구성).
3. **CloudHSM**: FIPS L3 전용.
4. **Cognito User Pool**(JWT) + **Identity Pool**(STS Role).
5. **WAF**(L7) + **Shield**(DDoS).
6. **GuardDuty**(위협) + **Inspector**(취약점) + **Macie**(PII).
7. **Security Hub**(통합) + **Detective**(분석).

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **KMS vs CloudHSM** | AWS multi-tenant | 전용·FIPS L3 |
| **Secrets vs Parameter** | 자동 회전·비싸 | 무료·기본 |
| **User Pool vs Identity Pool** | JWT 발급 | STS Role |
| **WAF vs Shield** | L7 어플 공격 | L3-L4 DDoS |
| **GuardDuty vs Inspector vs Macie** | 위협 | 취약점 | PII |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 풀스택 보안 ]

  Internet
    │ Shield Std/Advanced
  CloudFront ─ WAF (Bot/SQLi/Rate)
    │
  ALB ─ WAF, Cognito 통합
    │
  ECS / EC2 (Task Role / IRSA)
    │
  RDS Aurora (KMS, Secrets Manager 회전)
    │
  S3 (SSE-KMS, BPA, OAC, Macie 스캔)

  관제:
    GuardDuty / Inspector / Config / CloudTrail → Security Hub
    Detective 분석 → EventBridge → 자동 대응
    Firewall Manager (조직 가드레일)
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** RDS 비밀 30일 자동 회전:

A) Secrets Manager B) Parameter Store C) KMS D) IAM DB Auth

**정답: A**.

---

**문제 2.** SQL 주입 차단:

A) Shield B) WAF C) Network ACL D) Inspector

**정답: B**.

---

**문제 3.** S3 PII 탐지:

A) GuardDuty B) Macie C) Inspector D) Detective

**정답: B**.

---

**문제 4.** 모바일 사용자에 S3 직접 업로드 권한 임시 부여:

A) User Pool 단독 B) Identity Pool C) IAM 사용자 키 D) Bucket Public

**정답: B**.

---

**문제 5.** FIPS L3 HSM:

A) KMS CMK B) CloudHSM C) Secrets Manager D) STS

**정답: B**.

---

**문제 6.** 멀티 계정 전체 보안 점수:

A) Detective B) Security Hub C) GuardDuty D) Macie

**정답: B**.

---

**문제 7.** EC2 OS 패키지 CVE:

A) GuardDuty B) Inspector C) Macie D) Config

**정답: B**.

---

**문제 8.** 대규모 DDoS 대비 + AWS 비용 보호:

A) Shield Standard B) Shield Advanced C) WAF Rate D) Route 53 Failover

**정답: B**.

---

**문제 9.** B2B 엔터프라이즈 SAML SSO + 사용자 앱:

A) IAM Identity Center B) Cognito User Pool + SAML IdP C) Cognito Identity Pool D) AD Connector

**정답: B**.

---

**문제 10.** 큰 파일 KMS 호출 비용 절감:

A) SSE-S3 B) Bucket Keys + SSE-KMS / 봉투 암호화 C) HTTPS D) IAM 정책

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. SAA 도메인 1(보안 30%)의 핵심 키워드 매핑이 끝.
2. 다음 주: **모니터링·운영** — CloudWatch / CloudTrail / Config / SSM / X-Ray.

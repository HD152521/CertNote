# Day 67 - 백업: AWS Backup·Cross-Region Copy

📅 Week 14 (Day 2)
🎯 주제: 통합 백업 운영
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- AWS Backup의 중앙 정책 관리
- Backup Vault·Lock·Cross-Region·Cross-Account
- 서비스별 백업 옵션과 차이

---

## 🧩 사전 지식 (CS 기초)

- **WORM**: Write Once Read Many (변경 불가 보관)
- **Immutability**: 보호 기간 동안 삭제 불가
- **Continuous Backup**: 시점 복구 (PITR)

---

## 📖 이론 내용

### 1. AWS Backup 지원 서비스

- EBS·EC2 (AMI)·RDS·Aurora·DDB·EFS·FSx·S3·DocumentDB·Neptune·Storage Gateway·Redshift·Timestream·SAP HANA on EC2

### 2. 핵심 구성

| 개념 | 설명 |
|------|------|
| **Backup Plan** | 일정·보존·복사 규칙 |
| **Backup Vault** | KMS로 암호화된 저장소 |
| **Vault Lock** | WORM·삭제 금지 (Governance / Compliance) |
| **Backup Policy** | Org 차원 정책 |
| **Recovery Point** | 백업 결과 |
| **Continuous Backup** | RDS·Aurora·S3 PITR |

### 3. Vault Lock 모드

- **Governance**: 관리자 권한으로 해제 가능
- **Compliance**: 일정 기간 동안 누구도 변경 불가 (WORM)

### 4. Cross-Region·Cross-Account

- Backup Plan에 Copy Destination 추가
- KMS 키 Cross-Region·Account 권한 필요
- Org 단위 백업 정책

### 5. Backup Audit Manager

- 백업 컴플라이언스 자동 평가
- 누락·미준수 리소스 식별

### 6. 서비스별 백업 차이

| 서비스 | 백업 |
|--------|------|
| EBS | Snapshot (DLM 또는 Backup) |
| RDS | 자동 백업 35일 + Manual + PITR |
| Aurora | Continuous + Snapshot |
| DDB | On-Demand + PITR (35일) |
| S3 | Versioning + CRR + Object Lock |
| EFS | AWS Backup |

---

## 🧠 심화 이론

### 함정 포인트

- **"즉시 변경 불가·규제 준수"** → Compliance Mode Vault Lock
- **"멀티 계정·멀티 리전 통합"** → Org Backup Policy + Cross-Region Copy
- **"DDB 35일 시점 복구"** → PITR
- **"Aurora 5분 전 시점"** → Aurora Continuous Backup (1초 단위)

### S3는 특별

- AWS Backup S3 지원 (최근) — Versioning·CRR과 함께 사용
- Object Lock = WORM

---

## 🏗️ 아키텍처 — 멀티 계정 백업

```
[App Account] EBS·RDS·DDB
       │ Backup Plan
       ▼
[Backup Vault (Account A)]
       │ Cross-Account Copy
       ▼
[Backup Vault (Account B - Backup Account)]
       │ Cross-Region Copy
       ▼
[Vault Compliance Lock (다른 리전)]
```

---

## ⭐ 핵심 포인트

1. ⭐ AWS Backup = 중앙 정책·다중 서비스
2. ⭐ Vault Lock Compliance = WORM
3. ⭐ Cross-Region·Cross-Account Copy
4. ⭐ Org Backup Policy로 일괄
5. ⭐ Backup Audit Manager로 준수 평가
6. ⭐ RDS 35일·DDB PITR 35일·Aurora 1초

---

## 💻 CLI 예시

```bash
# Backup Plan
aws backup create-backup-plan --backup-plan file://plan.json

# Vault Compliance Lock
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name secure-vault \
  --min-retention-days 30 \
  --max-retention-days 365 \
  --changeable-for-days 3
```

---

## 📝 연습 문제

**문제 1.** 백업이 일정 기간 절대 삭제 불가.

A) Vault Governance
B) Vault Compliance Lock
C) S3 Glacier
D) Tag Policy

**정답: B**

---

**문제 2.** DDB 5분 전 시점 복구.

A) DDB Stream
B) PITR (Point-In-Time Recovery)
C) Snapshot
D) Global Table

**정답: B**

---

**문제 3.** Org 전체 계정 백업 정책 통합.

A) 계정별 수동
B) Organizations Backup Policy + 위임 관리자
C) Config
D) Service Catalog

**정답: B**

---

**문제 4.** Cross-Region Backup Copy.

A) Lambda 수동
B) Backup Plan Copy Action + KMS 권한
C) DataSync
D) MGN

**정답: B**

---

**문제 5.** S3 객체를 WORM 보관.

A) Versioning만
B) Object Lock (Compliance Mode)
C) CRR
D) Glacier

**정답: B**

---

**문제 6.** 백업 누락·미준수 자동 평가.

A) Trusted Advisor
B) Backup Audit Manager
C) Config
D) Security Hub

**정답: B**

---

## 📌 오늘의 요약

1. AWS Backup = 중앙 백업
2. Vault Lock Compliance = WORM
3. Cross-Region/Account Copy
4. Org Backup Policy + Audit Manager
5. 서비스별 PITR 옵션 차이

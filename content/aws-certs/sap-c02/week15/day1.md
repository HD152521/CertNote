# Day 71 - 대기업 글로벌 ERP 마이그레이션

📅 Week 15 (Day 1)
🎯 주제: 대규모 멀티 계정·하이브리드
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 글로벌 ERP의 멀티 계정·네트워크·DR 설계
- 마이그레이션 단계와 도구 선택
- 데이터 무결성·감사 요구사항

---

## 🧩 사전 지식 (CS 기초)

- **ERP**: SAP·Oracle 등 핵심 업무 시스템
- **Data Residency**: 데이터의 국가/지역 보관 요건
- **CMDB**: 구성 관리 데이터베이스

---

## 📖 시나리오

> 글로벌 제조사. 온프레 SAP·Oracle 100TB+. 미주·EU·APAC 운영.
> 6개월 내 AWS 전환, 다운타임 최소, EU 데이터는 EU 외 이동 불가.

### 요구사항

- 멀티 계정 (Prod·NonProd·Sandbox·Security·Logging)
- 데이터 잔존성: EU 워크로드는 EU 리전 (eu-central-1·eu-west-1)
- DR: RTO 2시간·RPO 5분
- 감사: 7년 보관·WORM
- 네트워크: 온프레와 하이브리드 (Direct Connect 다중)

---

## 📖 솔루션 아키텍처

### 1. 계정 구조

```
Org Root
 ├─ Security OU
 │   ├─ Log Archive (S3 Object Lock)
 │   └─ Audit (Security Hub·Config Aggregator)
 ├─ Infrastructure OU
 │   ├─ Network (TGW·DX)
 │   └─ Shared Services
 ├─ Workloads OU
 │   ├─ Prod (Region별)
 │   ├─ NonProd
 │   └─ Sandbox
```

- **Control Tower** + **IAM Identity Center**
- **SCP**: 비인가 리전 차단, 루트 보호, 암호화 강제

### 2. 네트워크

- **DX 2회선** + **VPN backup** (BGP·BFD)
- **Transit Gateway** + DX Gateway (다중 리전)
- 핵심 VPC: SAP·Oracle DB
- **PrivateLink**: S3·KMS·SecretsManager 접근

### 3. 마이그레이션

- **MGN**: Linux/Windows 서버 (블록 레벨 복제·짧은 다운타임)
- **DMS + SCT**: Oracle → Aurora PostgreSQL (Refactor) 또는 RDS Oracle (Rehost)
- **App2Container**: Java 앱 컨테이너화 (선택)
- **Migration Hub**: 전체 추적

### 4. 데이터 잔존성

- EU 데이터 = eu-central-1·eu-west-1만
- SCP로 region 제한
- S3 CRR도 EU 내 리전끼리

### 5. DR

- **Aurora Global Database** (eu-central-1 ↔ eu-west-1)
- **AWS Backup Cross-Region** (지역 한정)
- **Resilience Hub** 정책 평가

### 6. 감사·보안

- **CloudTrail Org Trail** → Log Archive S3 + Object Lock 7년
- **Config Aggregator** → Audit 계정
- **Security Hub Org** + GuardDuty Org + Macie
- **Audit Manager**: PCI·SOX 보고서

---

## ⭐ 핵심 포인트

1. ⭐ Control Tower + IAM IC + Org SCP로 계정·리전 거버넌스
2. ⭐ MGN (Rehost) + DMS·SCT (Refactor)
3. ⭐ TGW + 다중 DX·VPN 이중화
4. ⭐ Aurora Global + AWS Backup으로 DR
5. ⭐ Log Archive + Object Lock 7년 WORM
6. ⭐ Data Residency = SCP로 리전 제한

---

## 📝 연습 문제

**문제 1.** EU 데이터의 비EU 리전 이동 차단.

A) IAM Policy
B) SCP (DenyRegions)
C) Config
D) NACL

**정답: B**

---

**문제 2.** 100여 대 서버 마이그레이션 — 다운타임 최소.

A) Snowball
B) MGN (블록 레벨)
C) DataSync
D) DMS

**정답: B**

---

**문제 3.** Oracle → Aurora PostgreSQL.

A) MGN
B) DMS + SCT
C) DRS
D) Snowball

**정답: B**

---

**문제 4.** 7년 변경 불가 감사 로그.

A) S3 Versioning
B) S3 Object Lock Compliance + 7년
C) Glacier
D) CloudTrail 직접

**정답: B**

---

**문제 5.** 다중 리전 SQL DB·RPO 5분.

A) Read Replica
B) Aurora Global Database
C) DMS 양방향
D) RDS Multi-AZ

**정답: B**

---

**문제 6.** DX·VPN 이중화 + 다중 리전 라우팅.

A) Single DX
B) DX + VPN Backup + TGW + DX Gateway
C) VPN만
D) Internet GW

**정답: B**

---

## 📌 오늘의 요약

1. Org·CT·IAM IC·SCP로 거버넌스
2. MGN + DMS·SCT 마이그레이션
3. TGW·DX·VPN 이중화
4. Aurora Global DR
5. Object Lock + Audit Manager 감사

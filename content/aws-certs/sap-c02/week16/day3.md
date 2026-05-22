# Day 78 - 도메인 3 종합: 마이그레이션·현대화 (20%)

📅 Week 16 (Day 3)
🎯 주제: 7R + 도구 매핑
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 7R 전략·도구 선택
- 데이터·서버·앱·DB 마이그레이션
- 현대화 (컨테이너·서버리스)

---

## 📌 도메인 3 핵심 (한 페이지)

### 7R

| R | 의미 | 대표 도구 |
|---|------|----------|
| **Retire** | 폐기 | - |
| **Retain** | 유지 (당분간) | - |
| **Relocate** | 그대로 이전 (VMware Cloud on AWS) | - |
| **Rehost** | Lift & Shift | MGN |
| **Replatform** | 일부 변경 (예: EC2→RDS) | DMS·App2Container |
| **Repurchase** | 상용으로 교체 | Marketplace |
| **Refactor** | 재설계 | DMS+SCT·Lambda·Fargate |

### 데이터 이전

- **DataSync**: 온프레 ↔ AWS 파일/S3 (NFS·SMB·HDFS·Object)
- **Storage Gateway**: 하이브리드 (File·Volume·Tape·FSx)
- **Snow Family**: Snowcone·Snowball·Snowmobile (대용량 물리 전송)
- **Direct Connect** + **S3 Transfer Acceleration**

### DB 마이그레이션

- **DMS**: 동/이기종 (CDC 가능)
- **SCT (Schema Conversion Tool)**: 이기종 스키마 변환
- **AWS Migration Hub**: 통합 추적
- **DMS Schema Conversion**: 콘솔에서 SCT 기능

### 컨테이너화

- **App2Container**: Java·.NET → 컨테이너 이미지
- **AWS Modernization**: ECS·EKS·Fargate
- **AppFlow**: SaaS ↔ AWS 데이터

### 마이그레이션 추적

- **Migration Hub**: 발견·계획·추적·자동화
- **Migration Hub Strategy Recommendations**: 7R 권고
- **Application Discovery Service**: 온프레 인벤토리

---

## 🧠 시나리오 매핑

| 시나리오 | 답 |
|----------|-----|
| 100여 대 짧은 다운타임 이전 | MGN |
| Oracle → Aurora | DMS + SCT |
| 1PB 데이터 이전 | Snowball Edge |
| 5TB·빠른 인터넷 | DataSync |
| Java EE 컨테이너화 | App2Container |
| SaaS 데이터 → S3 | AppFlow |
| 마이그레이션 전체 추적 | Migration Hub |
| 온프레 자산 자동 인벤토리 | Discovery Service |

---

## 📝 연습 문제

**문제 1.** 200대 VM Lift & Shift·다운타임 최소.

A) Snowball
B) MGN
C) DRS
D) DataSync

**정답: B**

---

**문제 2.** Oracle 11g → Aurora PostgreSQL.

A) MGN
B) DMS + SCT
C) Snow
D) Direct Copy

**정답: B**

---

**문제 3.** 1PB 데이터·인터넷 회선 부족.

A) Snowmobile (Exabyte) 또는 Snowball Edge 다수
B) DataSync
C) DX 일회성
D) S3 Multipart

**정답: A**

---

**문제 4.** Java EE 모놀리스를 컨테이너화 자동.

A) Copilot
B) App2Container
C) Fargate
D) Beanstalk

**정답: B**

---

**문제 5.** Salesforce → S3 데이터 통합.

A) DMS
B) AppFlow
C) Glue
D) DataSync

**정답: B**

---

**문제 6.** 마이그레이션 단계·자산 통합 콘솔.

A) Trusted Advisor
B) Migration Hub
C) Service Catalog
D) Control Tower

**정답: B**

---

## 📌 오늘의 요약

1. 7R 즉답
2. MGN·DMS·SCT·DataSync·Snow 선택
3. App2Container·AppFlow·Migration Hub
4. Discovery Service 인벤토리

# Day 52 - Macie, GuardDuty, Inspector

📅 Week 11 (Day 2)
🎯 주제: 데이터·위협·취약점 탐지
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Macie·GuardDuty·Inspector의 역할 차이를 즉답한다
- 통합 패턴: Security Hub·EventBridge로 자동 대응
- 비용 모델 차이

---

## 🧩 사전 지식 (CS 기초)

- **CVE**: Common Vulnerabilities and Exposures — 취약점 식별 번호
- **PII**: Personally Identifiable Information
- **VPC Flow Logs**: VPC 트래픽 메타데이터 로그

---

## 📖 이론 내용

### 1. 한눈 정리

| 서비스 | 대상 | 탐지 내용 |
|--------|------|-----------|
| **Macie** | S3 객체 | PII·민감 데이터 |
| **GuardDuty** | VPC FL·DNS·CloudTrail·S3·EKS·Lambda·RDS Login·Malware | 이상 트래픽·악성 IP·암호화폐 채굴·로그인 이상 |
| **Inspector** | EC2·ECR·Lambda | CVE·네트워크 노출·소프트웨어 취약점 |

### 2. Macie 심화

- **자동 검색**: 자격 증명, 신용카드, 의료, 주민번호 등 **관리형 식별자**
- **커스텀 식별자**: 정규식·키워드
- **민감도 점수**: 0-100
- **All Accounts (Organization)**: 위임 관리자 계정에서 일괄

### 3. GuardDuty 심화

- **데이터 소스 추가** (Protection):
  - S3 Protection
  - Malware Protection (EBS)
  - EKS Protection (Audit Log + Runtime)
  - RDS Login Protection
  - Lambda Protection
- **Finding 카테고리**: Recon·UnauthorizedAccess·Backdoor·Trojan·CryptoCurrency
- **자동 대응**: EventBridge → Lambda·SNS·Step Functions

### 4. Inspector 심화

- **EC2**: SSM Agent 통해 OS·앱 CVE 스캔 (연속)
- **ECR**: 컨테이너 이미지 푸시 시 스캔
- **Lambda**: 함수 코드·레이어 의존성 스캔
- **Risk Score**: CVSS + 환경 컨텍스트 조정

### 5. 통합 패턴

```
GuardDuty Finding ─┐
Macie Finding     ─┼──▶ Security Hub ──▶ EventBridge ──▶ Lambda·SOAR
Inspector Finding ─┘
```

- **Organization 위임 관리자** 한 곳에서 모든 계정 통합

---

## 🧠 심화 이론

### 함정 매핑

| 시나리오 | 정답 |
|----------|------|
| EC2 OS 패치 누락 탐지 | Inspector |
| S3에 신용카드 번호 저장 여부 | Macie |
| VPC에 비정상 외부 IP 통신 | GuardDuty |
| 컨테이너 이미지에 CVE | Inspector (ECR) |
| 의심스러운 API 호출 패턴 | GuardDuty (CloudTrail) |
| Lambda 의존성 취약점 | Inspector (Lambda) |

### 비용 절감

- **GuardDuty Protection** 모듈은 옵트인. 필요한 것만 켜기
- **Macie**: 객체 평가 1KB 단위 과금. 일회성 스캔 + 자동화는 큰 범위만

---

## 🏗️ 아키텍처 — 자동 격리

```
[GuardDuty: EC2 가상 통신]
        │
        ▼
[Security Hub 집계]
        │
[EventBridge Rule]
        │
        ▼
[Lambda]
   ├─ EC2 격리 SG로 변경
   ├─ Snapshot 백업
   └─ SNS 알림
```

---

## ⭐ 핵심 포인트

1. ⭐ Macie = S3 PII / GuardDuty = 트래픽·로그 이상 / Inspector = CVE
2. ⭐ GuardDuty Protection 모듈(S3·EKS·Malware·Lambda·RDS Login) 옵트인
3. ⭐ Inspector v2 = EC2·ECR·Lambda 통합 (SSM 기반)
4. ⭐ Organization 위임 관리자로 일괄
5. ⭐ Security Hub + EventBridge로 자동 대응

---

## 💻 CLI 예시

```bash
# GuardDuty 활성화
aws guardduty create-detector --enable

# Macie 활성화
aws macie2 enable-macie

# Inspector v2 활성화
aws inspector2 enable --resource-types EC2 ECR LAMBDA
```

---

## 📝 연습 문제

**문제 1.** S3 버킷에 의도치 않은 PII 저장 여부.

A) GuardDuty S3 Protection
B) Macie
C) Inspector
D) Config

**정답: B**

---

**문제 2.** EC2 인스턴스 OS·앱 CVE 자동 탐지.

A) GuardDuty Malware
B) Inspector v2
C) Macie
D) Trusted Advisor

**정답: B**

---

**문제 3.** EC2에서 알려진 악성 IP로 통신.

A) Inspector
B) GuardDuty
C) Macie
D) WAF

**정답: B**

---

**문제 4.** EKS Pod의 런타임 의심 동작.

A) Inspector ECR
B) GuardDuty EKS Protection (Runtime)
C) Macie
D) Config

**정답: B**

---

**문제 5.** Lambda 함수 의존성 취약점.

A) GuardDuty Lambda
B) Inspector Lambda Scanning
C) CodeGuru
D) Macie

**정답: B** — Inspector v2 Lambda 스캔

---

**문제 6.** 모든 계정의 보안 결과를 한 콘솔로.

A) Trusted Advisor
B) Security Hub (Org 위임 관리자)
C) Detective
D) Audit Manager

**정답: B**

---

## 📌 오늘의 요약

1. Macie = S3 / GuardDuty = 위협 / Inspector = 취약점
2. GuardDuty Protection 모듈 옵트인
3. Inspector v2 = EC2·ECR·Lambda
4. Security Hub 집계 + EventBridge 자동 대응
5. Org 위임 관리자로 멀티 계정 통합

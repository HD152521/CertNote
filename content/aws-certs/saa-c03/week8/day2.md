# Day 37 - Secrets Manager, Parameter Store, CloudHSM

📅 날짜: Week 8 (Day 2)
🎯 주제: 비밀·구성 관리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Secrets Manager vs Parameter Store 선택을 안다
- 자동 회전·KMS 통합 흐름을 안다
- CloudHSM이 KMS와 다른 점을 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **비밀(Secret)**: 노출되면 안 되는 자격 증명·키.
- **구성(Configuration)**: 환경별 설정. 비밀 일 수도 있고 아닐 수도 있음.
- **회전(Rotation)**: 키·비밀을 주기적으로 새 값으로 교체. 유출 시 노출 시간 ↓.

---

## 📖 이론 내용

### 1. Secrets Manager

- **자동 회전** 지원 (Lambda 함수).
- **KMS 암호화** 기본.
- 비밀당 **월 비용 + API 호출 비용**.
- RDS / Aurora / Redshift / DocumentDB와 통합(원클릭 회전).
- 다른 계정·리전 공유.

### 2. SSM Parameter Store

| 종류 | 설명 | 비용 |
|------|------|-----|
| **Standard** | 평문/SecureString, 4KB | 무료 |
| **Advanced** | 8KB, 정책, 만료, 알림 | 파라미터 월 비용 |

- 자동 회전 X (Lambda 직접 구현 가능).
- SecureString은 KMS로 암호화.

### 3. 선택 기준

| 요구 | 서비스 |
|------|--------|
| 자동 회전 | **Secrets Manager** |
| 단순 구성 / 무료 | **Parameter Store Standard** |
| RDS 비밀 회전 | **Secrets Manager** |
| 큰 값(>4KB) / 정책 / 만료 | **Parameter Store Advanced** |

### 4. CloudHSM

- **고객 전용 HSM** (FIPS 140-2 Level 3).
- 키가 칩 밖으로 안 나옴.
- SSL/TLS offload, IBM HSM 마이그레이션 등.
- VPC 안에서 클러스터로 운영(다중 AZ).

### 5. KMS XKS (External Key Store)

- KMS에 외부 HSM(CloudHSM 또는 고객 KMIP)를 연결.
- 키가 외부에 있고 KMS는 프록시.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Resource Policy** | Secrets Manager는 리소스 정책 가능 | 크로스 계정 |
| **Replication** | Secrets Manager 멀티 리전 복제 | DR |
| **Versioning** | 비밀 버전(currentVersion/prev) | 회전 |
| **EC2 통합** | UserData에서 Secrets/SSM 호출 가능 | 부트스트랩 |
| **IAM 인증 DB** | Secrets Manager 대신 IAM Token | 옵션 |

> ⚠️ **함정**: "비밀 자동 회전" → SSM Parameter Store ❌, **Secrets Manager**.

> 💡 **암기 팁**: 비밀(회전) = Secrets Manager / 구성 = Parameter Store / 전용 HSM = CloudHSM.

### 관련 서비스 Cross-Reference

- RDS Proxy + Secrets Manager → Week 5
- KMS → Day 1
- Lambda 환경 변수 → Week 6

---

## 🏗️ 아키텍처 다이어그램

```
[ Lambda + Secrets Manager 회전 ]

  Lambda 함수
     │ GetSecretValue
     ▼
  Secrets Manager (KMS로 암호화)
     │ 회전 트리거
     ▼
  Rotation Lambda
     │ RDS 비밀번호 갱신 + Aurora 적용
     ▼
  Secrets Manager (새 버전: AWSCURRENT)
                 (이전 버전: AWSPREVIOUS)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **자동 회전 = Secrets Manager**.
2. ⭐ Parameter Store Standard는 **무료** + SecureString.
3. ⭐ CloudHSM = 고객 전용 HSM·FIPS L3.
4. ⭐ Secrets Manager는 **Cross-region 복제 + 리소스 정책**.
5. ⭐ RDS / Aurora 비밀은 Secrets Manager가 원클릭 회전.

---

## 💻 실제 예시 - AWS CLI

```bash
# Secrets Manager 시크릿 생성
aws secretsmanager create-secret --name saa/db/pass \
  --secret-string '{"username":"admin","password":"StrongPass!"}' \
  --kms-key-id alias/saa-app

# 자동 회전 (Lambda 미리 준비)
aws secretsmanager rotate-secret --secret-id saa/db/pass \
  --rotation-lambda-arn arn:...:function:rotateSecret \
  --rotation-rules AutomaticallyAfterDays=30

# Parameter Store SecureString
aws ssm put-parameter --name /saa/app/dbHost \
  --value "saa.cluster-xxx.rds.amazonaws.com" \
  --type SecureString --key-id alias/saa-app
```

---

## 📝 연습 문제

**문제 1.** RDS 비밀번호 30일마다 자동 회전:

A) Parameter Store B) Secrets Manager C) CloudHSM D) IAM DB Auth

**정답: B**.

---

**문제 2.** 비용 없이 구성·SecureString 보관:

A) Secrets Manager B) Parameter Store Standard C) CloudHSM D) KMS

**정답: B**.

---

**문제 3.** FIPS 140-2 Level 3 HSM 단독 키 보관:

A) KMS B) Secrets Manager C) CloudHSM D) STS

**정답: C**.

---

**문제 4.** Secrets Manager 비밀을 다른 리전에 복제:

A) Backup B) Replication C) CRR D) DMS

**정답: B**.

---

**문제 5.** RDS Proxy와 통합되는 비밀 저장소:

A) Parameter Store B) Secrets Manager C) CloudHSM D) KMS 단독

**정답: B**.

---

## 📌 오늘의 요약

1. 자동 회전 + 통합 = Secrets Manager.
2. 무료·단순 구성 = Parameter Store Standard.
3. FIPS L3 / 전용 = CloudHSM.
4. Secrets Manager는 Replication + Resource Policy.
5. SecureString은 KMS로 암호화.

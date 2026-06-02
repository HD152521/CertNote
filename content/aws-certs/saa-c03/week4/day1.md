# Day 16 - S3 기본: 버킷, 객체, 일관성

📅 날짜: Week 4 (Day 1)
🎯 주제: 객체 스토리지의 기초
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 버킷·객체·키·메타데이터 개념을 안다
- S3 강한 일관성 모델을 설명한다
- 버전 관리, 이벤트 알림, 사전 서명 URL의 사용을 안다

---

## 🧩 사전 지식 (CS 기초)

- **객체 스토리지**: 파일 시스템이 아닌 키-값 저장소. 부분 수정 불가, 통째로 쓰고 통째로 읽음.
- **일관성 모델**: Eventually consistent → Strongly consistent. S3는 2020년부터 **강한 일관성**.
- **REST/HTTPS API**: S3는 모든 호출이 HTTPS. SDK가 서명(SigV4)을 자동 처리.
- **Idempotent PUT**: 같은 키에 PUT 반복 → 마지막 값으로 덮어쓰기.

---

## 📖 이론 내용

### 1. 버킷·객체·키

- **버킷**: 전 세계 유일한 이름(글로벌 네임스페이스), 리전 종속.
- **객체**: 파일 + 메타데이터. 최대 **5TB**.
- **키(Key)**: 경로 형태의 문자열. 폴더는 가상 — 실제는 prefix.
- **메타데이터**: 시스템 정의 + 사용자 정의(x-amz-meta-*).

### 2. 일관성 모델

- 2020.12부터 **모든 작업에 강한 일관성** (read-after-write, list).
- PUT 직후 동일 키 GET은 즉시 최신.

### 3. 버전 관리 (Versioning)

- 켜면 객체마다 버전 ID 부여.
- DELETE는 "Delete Marker" 추가 (실제 삭제 아님). 이전 버전 복구 가능.
- 끄기 불가 — Suspended만.
- **MFA Delete**: 영구 삭제 시 MFA 강제.

### 4. 이벤트 알림 (S3 Event Notifications)

- 객체 생성/삭제/태깅 시 → **SNS / SQS / Lambda / EventBridge**.
- 시나리오: 업로드 → Lambda 썸네일 / 영상 트랜스코딩.
- **EventBridge로 보낼 때**가 더 다양한 패턴/규칙 가능.

### 5. 사전 서명 URL (Presigned URL)

- 시간 제한된 다운로드/업로드 URL.
- 호출자(IAM 주체)의 권한을 빌려 발급.
- **퍼블릭 객체 없이 일시적 공유** 가능.

### 6. 멀티파트 업로드

- **100MB 이상 권장, 5GB 초과는 필수**.
- 병렬 업로드 + 중간 실패 재시도 부분만.
- 미완료 파트는 비용 → **수명 주기 규칙**으로 정리.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **객체 락(Object Lock)** | WORM 보관(법적·규제). Governance / Compliance 모드 | 변조 불가 백업 |
| **S3 Replication** | CRR(리전 간) / SRR(리전 내). 양방향 가능 | DR / 컴플라이언스 |
| **Replication Time Control** | 99.99% 15분 내 복제 SLA | 까다로운 요구사항 |
| **Transfer Acceleration** | 엣지 통한 빠른 업로드(SFTP·대용량 글로벌) | 글로벌 사용자 |
| **Inventory / Storage Lens** | 일일 보고서 / 조직 관점 가시성 | 거버넌스 |

> ⚠️ **함정**: "S3 객체 일부 갱신" → 객체 스토리지는 부분 갱신 불가. 통째 PUT.

> 💡 **암기 팁**: 5GB까지 PutObject 한 번, 그 이상은 멀티파트. 객체 최대는 5TB.

### 관련 서비스 Cross-Reference

- 스토리지 클래스 → Day 2
- 보안·암호화 → Day 3
- CloudFront → Day 4
- Athena·Lake Formation → 분석 (스킬 보너스)

---

## 🏗️ 아키텍처 다이어그램

```
[ 업로드 → 이벤트 → 처리 패턴 ]

  사용자 → Presigned URL → S3 Bucket (uploads/)
                              │
                          ObjectCreated
                              ▼
                       EventBridge or SQS
                              ▼
                          Lambda
                              ▼
                       처리 결과 S3 또는 DDB
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **버킷 이름은 글로벌 유일**, 데이터는 리전 종속.
2. ⭐ **객체 최대 5TB**, 단일 PUT 5GB. 그 이상은 멀티파트.
3. ⭐ **2020년 이후 강한 일관성**.
4. ⭐ **버전 관리 + MFA Delete**로 안전 삭제.
5. ⭐ **이벤트는 SNS/SQS/Lambda/EventBridge**. 다중 라우팅은 EventBridge.

---

## 💻 실제 예시 - AWS CLI

```bash
# 버킷 생성 + 버전 관리 활성화
aws s3api create-bucket --bucket my-saa-bucket-2026 --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2
aws s3api put-bucket-versioning --bucket my-saa-bucket-2026 \
  --versioning-configuration Status=Enabled

# 멀티파트 업로드 (high-level cp가 자동)
aws s3 cp ./bigfile.bin s3://my-saa-bucket-2026/data/

# Presigned URL (1시간 유효)
aws s3 presign s3://my-saa-bucket-2026/data/report.pdf --expires-in 3600

# 이벤트 → Lambda
aws s3api put-bucket-notification-configuration --bucket my-saa-bucket-2026 \
  --notification-configuration file://notif.json
```

---

## 📝 연습 문제

**문제 1.** S3 객체 단일 PUT 최대 크기는?

A) 100MB B) 5GB C) 5TB D) 100GB

**정답: B** — 객체는 최대 5TB지만 단일 PUT은 5GB.

---

**문제 2.** S3 데이터 일관성 모델은?

A) Eventually consistent B) Strong read-after-write & list C) Causal D) Bounded staleness

**정답: B**.

---

**문제 3.** 임시로 안전하게 파일 공유:

A) 버킷 공개 B) Presigned URL C) ACL public-read D) NAT

**정답: B**.

---

**문제 4.** 업로드 시 자동 썸네일 생성:

A) S3 정적 웹사이트 B) S3 → Lambda 트리거 C) CloudFront D) Storage Gateway

**정답: B**.

---

**문제 5.** 멀티파트 업로드의 미완료 파트가 비용을 발생시키지 않게:

A) Lifecycle 규칙으로 incomplete multipart upload 자동 삭제 B) ACL 변경 C) 버전 관리 비활성 D) CRR 활성

**정답: A**.

---

## 📌 오늘의 요약

1. 버킷 글로벌 유일·리전 종속. 객체 5TB / 단일 PUT 5GB.
2. 2020년 이후 강한 일관성.
3. 버전 + MFA Delete로 안전.
4. 이벤트는 SNS/SQS/Lambda/EventBridge.
5. Presigned URL로 시간 제한 공유.

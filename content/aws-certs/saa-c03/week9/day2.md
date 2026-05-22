# Day 42 - CloudTrail: 관리/데이터 이벤트, Organizations Trail

📅 날짜: Week 9 (Day 2)
🎯 주제: 감사·거버넌스 로깅
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 관리 이벤트 vs 데이터 이벤트의 비용 차이를 안다
- Organization Trail로 멀티 계정 감사를 한다
- CloudTrail Lake / Insights 신기능을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **감사 추적(Audit Log)**: 누가·언제·무엇을. 사고·규제 핵심.
- **변조 방지(Immutable)**: 로그 자체가 변조되지 않게.
- **데이터 사고와 관리 사고**: API로 데이터 다운로드 vs API로 권한 변경.

---

## 📖 이론 내용

### 1. CloudTrail 기본

- 모든 AWS API 호출 기록 (CLI/SDK/콘솔/AWS 서비스).
- **기본 90일 이벤트 히스토리** (관리 이벤트, 무료).
- **Trail**을 만들어 **S3 / CloudWatch Logs / EventBridge / CloudTrail Lake**로 전송.

### 2. 이벤트 종류

| 종류 | 예 | 기본 |
|------|----|------|
| **Management** | IAM 생성, EC2 시작 | 활성 |
| **Data** | S3 GetObject, Lambda Invoke | 비활성(추가 비용) |
| **Insights** | 이상 활동 ML | 추가 비용 |

### 3. 무결성 & 보안

- **로그 파일 검증(Integrity Validation)**: SHA-256 + RSA 서명.
- S3 버킷에 **MFA Delete + 객체 락**으로 변조 방지.
- 로그 자체도 **KMS 암호화**.

### 4. Organization Trail

- Org Management 계정에서 만들면 **모든 계정 자동 포함**.
- 신규 계정 자동 합류.
- Log Archive 계정에 S3 통합.

### 5. CloudTrail Lake

- 이벤트 데이터 스토어. **SQL 쿼리** 가능.
- 보존 7년+.
- CloudTrail / Config / 3rd party 통합.

### 6. 통합 패턴

- **CloudTrail → CloudWatch Logs Subscription → Lambda**: 실시간 알림 (예: 루트 로그인).
- **CloudTrail → EventBridge → 자동 대응**.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **글로벌 서비스 이벤트** | IAM·STS·CloudFront. us-east-1로 기록 | 멀티 리전 Trail에 포함 |
| **데이터 이벤트 비용** | S3 GetObject 같은 고볼륨은 비쌈 | 필요 prefix만 |
| **CloudTrail vs Config** | "무엇을 했나" vs "지금 어떤 상태/규칙 준수" | 시험 자주 |
| **CloudTrail vs S3 Access Logs** | API 단 | 서버 액세스 | 함정 |
| **CloudTrail vs VPC Flow Logs** | API | 패킷 메타 | 함정 |

> ⚠️ **함정**: "S3에 누가 객체를 GetObject 했는지" → **CloudTrail Data Events** 활성 필요. 기본 관리만으로는 안 보임.

> 💡 **암기 팁**: "누가 했는가" = CloudTrail / "지금 상태" = Config / "트래픽" = VPC Flow Logs.

### 관련 서비스 Cross-Reference

- Organizations → Week 1
- Config → Day 3
- GuardDuty (CloudTrail 분석) → Week 8

---

## 🏗️ 아키텍처 다이어그램

```
[ 멀티 계정 감사 ]

  Org Management Account
    │ Organization Trail
    ▼
  All member accounts events
    ↓
  Log Archive Account
    └─ S3 (Object Lock, KMS)
          └─ Lifecycle → Glacier Deep Archive

  Trail → CloudWatch Logs → Lambda (루트 로그인 알림)
  Trail → CloudTrail Lake → SQL 쿼리
  Trail → EventBridge → 자동 대응
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **관리 이벤트 90일 무료** / 데이터·Insights는 별도.
2. ⭐ S3 GetObject 같은 데이터 액세스는 **Data Events** 활성 필요.
3. ⭐ Organization Trail로 멀티 계정 자동 감사.
4. ⭐ Integrity Validation + S3 Object Lock + KMS로 변조 방지.
5. ⭐ CloudTrail Lake로 7년+ SQL 쿼리.

---

## 💻 실제 예시 - AWS CLI

```bash
# 다중 리전 Trail
aws cloudtrail create-trail --name org-trail \
  --s3-bucket-name org-trail-log-archive \
  --is-multi-region-trail --include-global-service-events \
  --is-organization-trail \
  --kms-key-id alias/saa-app \
  --enable-log-file-validation

aws cloudtrail start-logging --name org-trail

# S3 데이터 이벤트만 추가
aws cloudtrail put-event-selectors --trail-name org-trail \
  --event-selectors '[{
    "ReadWriteType":"All",
    "IncludeManagementEvents":true,
    "DataResources":[{"Type":"AWS::S3::Object","Values":["arn:aws:s3:::sensitive-bucket/"]}]
  }]'
```

---

## 📝 연습 문제

**문제 1.** "어떤 사용자가 EC2를 종료했는가?":

A) CloudTrail B) VPC Flow Logs C) S3 Access Logs D) Config

**정답: A**.

---

**문제 2.** S3 GetObject 호출자 추적:

A) Management Events만 B) Data Events 활성 + CloudTrail C) S3 Access Logs만 D) Inspector

**정답: B** (Access Logs도 가능하지만 시험은 CloudTrail Data Events 정답).

---

**문제 3.** 멀티 계정 통합 감사:

A) 각 계정 별 Trail B) Organization Trail C) Config Aggregator D) SCP

**정답: B**.

---

**문제 4.** 로그 변조 방지:

A) S3 Object Lock + Trail Integrity Validation + KMS B) IAM 정책 C) BPA만 D) MFA Delete만

**정답: A**.

---

**문제 5.** 7년 SQL 쿼리:

A) S3 + Athena B) CloudTrail Lake C) Logs Insights D) Glacier Vault

**정답: B**.

---

## 📌 오늘의 요약

1. CloudTrail = API 감사. 관리(무료 90일) / 데이터(별도) / Insights.
2. Organization Trail로 멀티 계정 자동.
3. Integrity Validation + Object Lock + KMS로 변조 방지.
4. CloudTrail Lake로 SQL·장기 보존.
5. EventBridge / Logs Subscription으로 자동 대응.

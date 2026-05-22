# Day 26 - Lambda 기초, 트리거, 동시성

📅 날짜: Week 6 (Day 1)
🎯 주제: AWS 서버리스의 중심
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda 실행 모델(콜드/웜 스타트, 동시성)을 안다
- 트리거 유형(동기/비동기/이벤트 소스 매핑)을 구분한다
- 동시성 제어(예약 / 프로비저닝)와 DLQ를 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **Stateless 함수**: 호출 간 상태 공유 X. 외부 저장소 필요.
- **Cold start**: 처음/유휴 후 첫 호출 지연. VPC ENI 할당 / 큰 패키지 등에서 더 커짐.
- **이벤트 기반 아키텍처**: 큐/스트림/스토리지가 함수를 깨운다.
- **동기 vs 비동기**: 동기는 호출자가 응답 기다림 / 비동기는 큐잉 후 즉시 ACK.

---

## 📖 이론 내용

### 1. 핵심 사양

- 최대 실행 시간: **15분**.
- 메모리: 128MB ~ 10240MB (메모리에 비례한 vCPU).
- 패키지: ZIP 50MB(콘솔) / 250MB(unzipped) / **Container Image 10GB**.
- **ARM(Graviton2)** 옵션 → 가성비 ↑.

### 2. 트리거 종류

| 종류 | 호출 방식 | 예 |
|------|-----------|-----|
| **동기** | 호출자 응답 대기 | API Gateway, ALB, Cognito |
| **비동기** | 이벤트 큐 → 함수 | S3, SNS, EventBridge |
| **이벤트 소스 매핑** | Lambda가 폴링 | SQS, Kinesis, DynamoDB Streams, MSK |

### 3. 오류 처리

| 호출 종류 | 재시도 | DLQ / On Failure |
|-----------|--------|--------------------|
| 동기 | 호출자 책임 | - |
| 비동기 | 자동 2회 재시도 | SQS / SNS / Lambda Destinations |
| 이벤트 소스 매핑 | 스트림: 끝까지 / SQS: 가시성 타임아웃 | DLQ 큐 / on-failure destination |

### 4. 동시성

- 계정/리전 디폴트 한도 **1000** (Soft).
- **Reserved Concurrency**: 함수에 풀 예약. 다른 함수에 영향 ↓.
- **Provisioned Concurrency**: 미리 워밍업된 인스턴스 N개. **콜드 스타트 제거**.
- **Throttling**: 한도 초과 시 429.

### 5. Lambda 네트워킹

- 기본은 VPC 밖. VPC 안 리소스 호출 시 VPC 설정.
- **Hyperplane ENI**로 콜드 스타트 영향 ↓.
- VPC 내에서 인터넷 필요하면 **NAT Gateway** 라우팅.

### 6. Lambda Destinations

- 비동기 함수의 결과를 **SNS / SQS / Lambda / EventBridge**로 전달.
- DLQ보다 다양. 성공/실패 둘 다 라우팅.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Lambda SnapStart (Java)** | 함수 스냅샷으로 콜드 스타트 ↓ | Java 한정 |
| **Function URL** | API GW 없이 HTTPS 엔드포인트 | IAM/Public 인증 |
| **Lambda Layer** | 공통 라이브러리 공유 5개 | 패키지 작게 |
| **Lambda + EFS** | 큰 모델/데이터 마운트 | ML 추론 |
| **Power Tuning** | 메모리 ↔ 시간 ↔ 비용 최적 | 비용 최적화 |

> ⚠️ **함정**: "Lambda VPC 내부에서 인터넷 못 봄" → NAT 필요. Public 서브넷이라도 ENI는 사설 IP만.

> 💡 **암기 팁**: "콜드 스타트 제거" → **Provisioned Concurrency** / "특정 함수 보호" → **Reserved Concurrency**.

### 관련 서비스 Cross-Reference

- API Gateway → Day 2
- Step Functions → Day 3
- SQS / Kinesis → Week 7
- VPC Endpoint → Week 2

---

## 🏗️ 아키텍처 다이어그램

```
[ 동기 / 비동기 / 폴링 ]

  Sync:    Caller → Lambda → Caller (응답)
              예: API GW, ALB, Cognito

  Async:   Producer → Lambda 큐 → Lambda
              예: S3, SNS, EventBridge
              실패 시 → DLQ / Destinations

  Polling (Event Source Mapping):
           Lambda Service ── poll ── SQS/Kinesis/DDB Streams
           → Lambda 호출 (배치)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **최대 15분, 메모리 10240MB, 이미지 10GB**.
2. ⭐ **콜드 스타트 제거** = Provisioned Concurrency.
3. ⭐ **이벤트 소스 매핑(SQS/Kinesis/DDB Streams)**은 폴링.
4. ⭐ **비동기 실패** → DLQ / Destinations.
5. ⭐ **Lambda + VPC**에서 인터넷 필요 시 NAT Gateway.

---

## 💻 실제 예시 - AWS CLI

```bash
# Lambda 함수 생성 (ARM)
aws lambda create-function --function-name saa-fn \
  --runtime nodejs20.x --architectures arm64 \
  --role arn:aws:iam::111122223333:role/lambda-exec \
  --handler index.handler --zip-file fileb://fn.zip \
  --memory-size 512 --timeout 30

# Reserved Concurrency
aws lambda put-function-concurrency \
  --function-name saa-fn --reserved-concurrent-executions 100

# Provisioned Concurrency
aws lambda put-provisioned-concurrency-config \
  --function-name saa-fn --qualifier prod \
  --provisioned-concurrent-executions 5

# SQS 이벤트 소스 매핑
aws lambda create-event-source-mapping \
  --function-name saa-fn --batch-size 10 \
  --event-source-arn arn:aws:sqs:ap-northeast-2:111:saa-queue
```

---

## 📝 연습 문제

**문제 1.** Lambda 최대 실행 시간:

A) 5분 B) 15분 C) 30분 D) 1시간

**정답: B**.

---

**문제 2.** API GW 뒤 Lambda의 콜드 스타트 거의 제거:

A) Reserved Concurrency B) Provisioned Concurrency C) Memory 늘리기 D) ARM 사용

**정답: B**.

---

**문제 3.** S3 → Lambda 비동기 호출 실패 시 후속 추적:

A) X-Ray B) SQS DLQ / Destinations C) Step Functions D) Throttle

**정답: B**.

---

**문제 4.** Lambda가 VPC 안 RDS에 접근 + 외부 API 호출 필요:

A) Public 서브넷에 Lambda B) Private 서브넷 + NAT Gateway C) Private + IGW D) Endpoint만

**정답: B**.

---

**문제 5.** 큰 ML 모델(수 GB)을 Lambda 함수에서 사용:

A) S3에서 매번 다운로드 B) EFS 마운트 또는 Container Image C) DynamoDB에 저장 D) Provisioned Concurrency만

**정답: B**.

---

## 📌 오늘의 요약

1. Lambda 15분·10GB 이미지·10240MB 메모리.
2. 동기 / 비동기 / 폴링 — 트리거에 따라 재시도·DLQ 다름.
3. Provisioned Concurrency가 콜드 스타트의 정답.
4. VPC + 외부는 NAT 필요.
5. 큰 데이터는 EFS·이미지·Layer로.

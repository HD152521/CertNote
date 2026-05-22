# Day 40 - Week 8 복습 + 시나리오 10문항

📅 날짜: Week 8 (Day 5)
🎯 주제: 서버리스 종합
⏱️ 학습 시간: 약 90분

---

## 📖 Week 8 핵심 정리

1. **Lambda 동시성**: Reserved(상한)·Provisioned(따뜻함)·계정 1000
2. **콜드 스타트**: SnapStart(무료)·PC·작은 패키지·init 최적화
3. **Lambda VPC**: Hyperplane ENI 공유, NAT GW로 인터넷
4. **Destinations·DLQ**: 비동기 결과 라우팅
5. **Function URL·Container Image(10GB)·Graviton2**
6. **Step Functions**: Standard 1년·Express 5분, Distributed Map 10K
7. **.sync vs .waitForTaskToken**, Retry/Catch Saga
8. **EventBridge Bus 3종 + Pipes + Scheduler + Schema Registry**
9. **AppSync GraphQL + Subscription**
10. **SQS Standard/FIFO·DLQ, SNS Fan-out·Filtering, Kinesis 재처리**

---

## 🔄 비교표

| A | B | 차이 |
|---|---|------|
| **Reserved Concurrency** vs **Provisioned** | 상한 vs 따뜻함 | 비용·콜드 |
| **SnapStart** vs **Provisioned** | 무료·Java/Python/.NET vs 비용·모든 런타임 | 비용 |
| **Standard** vs **Express** | 장기·1년 vs 5분 | 사용 사례 |
| **.sync** vs **.waitForTaskToken** | Job 동기 대기 vs 콜백 대기 | 메커니즘 |
| **SNS** vs **EventBridge** | Fan-out 고처리 vs 풍부 필터 | 패턴 |
| **SQS** vs **Kinesis** | 1회 소비 vs 재처리·다중 소비자 | 모델 |
| **API Gateway** vs **Function URL** | 풍부 기능 vs 단순·저비용 | 기능 |
| **Pipes** vs **Step Functions** | 1:1 라우팅 vs 복잡 워크플로우 | 복잡도 |

---

## 📝 시나리오 10문항

---

**문제 1.** Java Lambda 콜드 스타트가 5초. 비용 추가 없이 줄이려면?

A) Provisioned Concurrency
B) SnapStart
C) 메모리 최대치
D) 함수 분리

**정답: B**

---

**문제 2.** 결제·재고·배송으로 이어지는 장기 워크플로우, 실패 시 보상.

A) EventBridge Rule 체인
B) Step Functions Standard + Catch 보상
C) Lambda 체인
D) SQS Workflow

**정답: B**

---

**문제 3.** 100만 사용자 알림 스케줄(고객별 시간).

A) CloudWatch Events Rule 1개
B) EventBridge Scheduler
C) Lambda + Cron
D) Step Functions Wait

**정답: B**

---

**문제 4.** SQS 큐 → Step Functions로 필터링·변환 (코드 작성 없이).

A) Lambda 직접
B) EventBridge Pipes
C) AppFlow
D) DMS

**정답: B**

---

**문제 5.** Lambda 5초 콜드 + 일정 트래픽(피크 9시).

A) Provisioned Concurrency + Application Auto Scaling
B) Reserved 상한만
C) Container Image
D) Layer 통합

**정답: A**

---

**문제 6.** 순서·중복 제거 결제 큐.

A) SQS Standard
B) SQS FIFO + Deduplication
C) Kinesis 단일 샤드
D) SNS

**정답: B**

---

**문제 7.** 한 이벤트를 5개 SQS로 fan-out + subscriber별 필터.

A) SNS + Message Filtering
B) Kinesis Fan-out
C) MSK
D) AppSync

**정답: A**

---

**문제 8.** 7일치 스트림을 다시 처리·다중 소비자.

A) SQS
B) Kinesis Data Streams (보존 365일)
C) SNS
D) EventBridge

**정답: B**

---

**문제 9.** ML 모델 1.8GB + Python Lambda.

A) Layer
B) Container Image
C) EFS만
D) zip 분할

**정답: B**

---

**문제 10.** 실시간 GraphQL 채팅 + 오프라인 동기화 + 인증(Cognito).

A) API Gateway REST
B) AppSync
C) WebSocket API
D) IoT Core

**정답: B**

---

## 📌 Week 8 한눈에

```
Lambda  ──► Concurrency / SnapStart / PC / VPC ENI
SF      ──► Standard·Express / Distributed Map / Saga
EB      ──► Bus·Pipes·Scheduler·Schema Registry
GraphQL ──► AppSync + Subscription
큐/스트 ──► SQS / SNS / Kinesis / MSK
```

다음 주(Week 9): **데이터 아키텍처** — Data Lake·Redshift·EMR·Lake Formation.

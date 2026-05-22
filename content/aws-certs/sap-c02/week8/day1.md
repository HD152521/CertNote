# Day 36 - Lambda 고급 — 동시성, Provisioned, SnapStart

📅 날짜: Week 8 (Day 1)
🎯 주제: Lambda 운영 최적화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda 동시성 3종(Reserved/Provisioned/계정 한도)을 안다
- 콜드 스타트의 원인과 SnapStart·Provisioned·Init 코드 위치 최적화를 이해한다
- Lambda VPC 통합과 Hyperplane ENI 동작을 안다
- Lambda Destinations·DLQ·재시도 정책 정리

---

## 🧩 사전 지식 (CS 기초)

- **Cold Start**: 함수 환경 초기화(컨테이너 다운로드·런타임 부팅·init code 실행) 후 첫 호출까지의 지연.
- **Hyperplane ENI**: Lambda VPC 통합 시 한 번 만들어진 ENI를 다수 함수가 공유 (스케일 시 ENI 폭증 방지).
- **Firecracker**: Lambda·Fargate가 사용하는 micro VM 가상화 (수십 ms 부팅).

---

## 📖 이론 내용

### 1. 동시성 종류

| 종류 | 설명 |
|------|------|
| **계정 한도(Unreserved)** | 리전당 기본 1,000 동시 (소프트 한도, 증액 가능) |
| **Reserved Concurrency** | 함수별 상한 설정 — 다른 함수에 영향 차단 |
| **Provisioned Concurrency** | 미리 따뜻한 인스턴스 유지 — 콜드 스타트 0 |

### 2. 콜드 스타트 줄이는 법

1. **Provisioned Concurrency** — 안정적이지만 비용 발생 (시간당 과금)
2. **SnapStart (Java/Python/.NET)** — Firecracker 스냅샷으로 init 결과 재사용. 비용 0
3. 런타임 선택 — Node·Python·Go가 일반적으로 Java보다 빠름
4. **Init 단계에 무거운 로직 위치**시켜 호출 시 빠른 응답
5. 패키지·레이어 크기 축소

### 3. SnapStart

- 처음 배포 시 init 실행 후 스냅샷 저장
- 새 환경 부팅 시 스냅샷 복원 → 초기화 시간 거의 0
- 무료(스냅샷 보관·복원 비용 없음, Java 한정에서 Python/.NET까지 확장)
- 주의: 스냅샷이 환경 변수/난수 시드를 복사하므로 **uniqueness state**는 init에 두지 말기

### 4. Lambda VPC 통합

- 함수에 서브넷·SG 지정 → Hyperplane ENI를 통해 VPC 내부 통신
- 첫 ENI 생성에 시간 걸리지만 이후 공유
- VPC 안에서 NAT GW로 인터넷 가야 함 (Lambda 자체는 퍼블릭 IP 없음)
- VPC Endpoint(Gateway: S3/DynamoDB / Interface: 기타) 활용으로 NAT 비용 절감

### 5. Lambda Destinations·DLQ

- **Destinations(비동기)**: 성공/실패 결과를 SNS·SQS·EventBridge·Lambda로 라우팅
- **DLQ**: 실패한 이벤트를 SQS/SNS로 (legacy 방식, Destinations 권장)
- **재시도**: 비동기 호출은 2회 자동 재시도 (총 3회)
- **Maximum Event Age**: 메시지 유효 시간 (default 6시간, max 6시간)

### 6. Lambda 동시 호출과 스케일링

- 가용 영역별 안전한 폭발(burst): us-east-1·us-west-2·eu-west-1은 3000 burst, 그 외 500–1000
- 이후 분당 +500 동시성 증가 (gradual)
- 갑작스런 폭증은 Throttle (HTTP 429)

### 7. Lambda Function URL

- API Gateway 없이 함수에 HTTPS 엔드포인트 부여
- IAM Auth 또는 NONE
- CloudFront 앞단·CORS 설정 가능
- API Gateway 비용 줄이고 단순 API에 적합

### 8. Lambda Layer + Container Image

- **Layer**: 공통 라이브러리 재사용, 최대 5개, 250MB unzipped
- **Container Image**: 최대 10GB. 큰 ML 모델·바이너리 의존성에 적합
- Layer는 zip, Container Image는 ECR Push

---

## 🧠 알아두면 좋은 심화 이론

### Lambda Power Tuning

- 메모리(=CPU)를 1~10GB까지 변경하며 성능·비용 최적점 탐색
- 오픈소스 Step Functions 도구

### Provisioned Concurrency Auto Scaling

- Application Auto Scaling으로 시간 기반 PC 조정 (피크 시간만 따뜻하게)

### Lambda ARM(Graviton2)

- 약 20% 저렴 + 19% 성능 향상

---

## 🏗️ 다이어그램 — Lambda + SnapStart + Provisioned

```
1차 Deploy:
[Code Upload] → [Init 실행] → [Snapshot 저장]

콜드 호출 시:
[Request] → [Snapshot 복원, ~100ms] → [Handler 즉시 실행]

피크 시간:
[Provisioned Concurrency = 50] → 콜드 0
```

---

## ⭐ 핵심 포인트

1. ⭐ Reserved = 상한, Provisioned = 따뜻함, 계정 한도 = 기본 1000
2. ⭐ **SnapStart로 Java·Python·.NET 콜드↓** (무료)
3. ⭐ VPC 통합은 Hyperplane ENI 공유
4. ⭐ 비동기 자동 재시도 2회 + Destinations로 결과 라우팅
5. ⭐ Function URL = API GW 없는 간단 HTTPS
6. ⭐ Container Image = 10GB 한도, Layer = 250MB
7. ⭐ Graviton2(ARM) = 저렴·빠름

---

## 💻 실제 예시 - Provisioned Concurrency

```bash
aws lambda put-provisioned-concurrency-config \
  --function-name myfunc \
  --qualifier prod \
  --provisioned-concurrent-executions 50
```

### SnapStart 활성화

```bash
aws lambda update-function-configuration \
  --function-name myfunc \
  --snap-start ApplyOn=PublishedVersions
```

---

## 📝 연습 문제

**문제 1.** Java Lambda 콜드 스타트가 5초. 비용 추가 없이 줄이려면?

A) Provisioned Concurrency
B) SnapStart
C) 메모리 10GB로
D) VPC 제거

**정답: B**

---

**문제 2.** 한 함수가 다른 함수 동시성 한도를 잡아먹는다. 격리하려면?

A) Reserved Concurrency 설정
B) 계정 한도 증액
C) DLQ
D) Layer

**정답: A**

---

**문제 3.** Lambda VPC 통합 후 인터넷 호출에 필요한 것?

A) Lambda 퍼블릭 IP
B) NAT Gateway (또는 VPC Endpoint)
C) IGW 직접
D) Direct Connect

**정답: B**

---

**문제 4.** 비동기 호출 실패 결과를 SQS로 라우팅. 최신 권장 방법?

A) DLQ
B) Destinations (OnFailure → SQS)
C) Step Functions
D) X-Ray

**정답: B**

---

**문제 5.** ML 추론 함수 모델 1.5GB. zip 한도 초과.

A) Layer 늘리기
B) Container Image (10GB 한도)
C) EFS 마운트
D) S3 다운로드

**정답: B** (EFS·S3도 가능하지만 Container Image가 표준)

---

**문제 6.** Provisioned Concurrency 50으로 두면?

A) 콜드 스타트 50회까지 0
B) 50까지는 따뜻한 인스턴스, 그 이상은 콜드
C) 비용 무료
D) 동시 호출 50만 가능

**정답: B**

---

## 📌 오늘의 요약

1. 동시성 3종 — 계정/Reserved/Provisioned
2. 콜드↓: SnapStart·PC·작은 패키지·init 최적화
3. VPC 통합은 Hyperplane ENI 공유
4. Destinations로 비동기 결과 라우팅
5. Container Image = 10GB ML 의존성 OK
6. Graviton2 — 저렴·빠름

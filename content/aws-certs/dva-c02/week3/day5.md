# Day 15 - Week 3 복습 + 연습문제

📅 날짜: 2026년 6월 4일 (목요일)  
🎯 주제: Lambda 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Lambda의 모든 핵심 개념을 종합적으로 정리한다
- 실제 시험 유형의 Lambda 문제를 풀어 실력을 점검한다

---

## 📖 Week 3 핵심 정리

### Lambda 기본 스펙 암기
```
메모리:        128MB ~ 10,240MB
타임아웃:      최소 1초 ~ 최대 15분
임시 스토리지: 512MB ~ 10GB (/tmp)
배포 크기:     ZIP 50MB 직접 / 250MB S3 / 컨테이너 10GB
레이어 최대:   5개 (합계 250MB)
환경 변수:     최대 4KB
비동기 재시도: 최대 2회
동시성 기본:   리전당 1,000
```

### Lambda 호출 유형 요약
```
동기:  API GW, ALB, Cognito → 즉시 응답, 재시도는 호출자 책임
비동기: S3, SNS, EventBridge → 2회 재시도 → DLQ/Destinations
폴링:  SQS, Kinesis, DynamoDB Streams → Lambda가 배치로 가져옴
```

### 버전 / 별칭 / 배포 전략
```
$LATEST → 개발 중인 최신 코드
버전(1,2,3...) → 불변 스냅샷
별칭(dev,staging,prod) → 버전 포인터
카나리 배포 → 별칭에 가중치 설정 (예: 90%/10%)
```

---

## 🧠 Week 3 시험 함정 & 약어

### Lambda 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| 동기 호출 | 비동기 호출 | API GW(동기) vs S3(비동기) |
| 비동기 | 이벤트 소스 매핑 | Lambda가 수신 vs Lambda가 폴링 |
| 예약 동시성 | 프로비저닝된 동시성 | 상한 설정 vs 미리 켜둠 |
| Reserved=0 | 함수 삭제 | 일시 비활성화 vs 완전 제거 |
| $LATEST | 버전 | 변경 가능 vs 불변 |
| 별칭 | 버전 | 포인터 vs 스냅샷 |
| DLQ | Destinations | 실패만·구형 vs 성공·실패·신형 |
| 환경 변수 | Secrets Manager | 평문 위험 vs 자동 회전·암호화 |
| Layer | 함수 코드 | /opt vs /var/task |
| SnapStart | Provisioned Concurrency | Java/Python 무료 vs 모든 런타임·유료 |
| ENI 콜드 스타트 (구버전) | Hyperplane ENI (현재) | 수십 초 vs 무시 가능 |

### Week 3 시험 함정 12가지

1. **타임아웃 최대 15분** — Step Functions는 1년
2. **메모리 = vCPU** — 메모리 ↑면 자동으로 CPU·네트워크도 ↑
3. **/tmp 공유 위험** — 같은 환경 재사용 시 이전 데이터 잔존
4. **Reserved=0은 비활성화**
5. **Provisioned는 별칭/버전에만**, `$LATEST` 불가
6. **Kinesis ESM 실패 = 샤드 블록** → MaximumRetryAttempts 설정 필수
7. **S3 무한 루프** — 같은 버킷에 출력 금지
8. **레이어 최대 5개**, 합계 250MB (압축 해제)
9. **컨테이너 이미지 10GB**
10. **비동기 재시도 = 2회**, 1분/2분 간격
11. **별칭 가중치 라우팅은 2개 버전만**
12. **VPC 연결 시 인터넷 차단** — NAT GW/VPC Endpoint 필요

### Week 3 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **DLQ** | Dead Letter Queue |
| **ESM** | Event Source Mapping |
| **PC** | Provisioned Concurrency |
| **ARN** | Amazon Resource Name |
| **ENI** | Elastic Network Interface |
| **EFS** | Elastic File System (Lambda 마운트 가능) |
| **DDB** | DynamoDB |
| **SAM** | Serverless Application Model |
| **SnapStart** | Java/Python/.NET 초기화 스냅샷 |
| **EMF** | Embedded Metric Format |
| **TTFB** | Time To First Byte (Response Streaming) |
| **IAM** | (실행 역할 + 리소스 정책 양쪽) |

---

## 아키텍처 다이어그램 - 완전한 서버리스 아키텍처

```
서버리스 주문 처리 시스템
================================

[모바일/웹 클라이언트]
        |
        | HTTPS
        v
[API Gateway]
  /orders POST (동기)
  /orders GET  (동기)
        |
        v
[Lambda - 주문 API]
  메모리: 512MB
  타임아웃: 30초
  환경변수: DB_URL, TABLE_NAME
  레이어: 공통 유틸리티 레이어
  버전: 3, 별칭: prod
        |
        +---> [DynamoDB] (주문 저장)
        |
        +---> [SQS] (비동기 주문 처리)
                  |
                  | (이벤트 소스 매핑)
                  v
        [Lambda - 주문 처리]
          배치 크기: 10
          예약 동시성: 50
                  |
                  +---> 성공 --> [SNS] --> 이메일/SMS 알림
                  |
                  +---> 실패 --> [DLQ] --> [Lambda - 오류 처리]
                                               |
                                               v
                                           [CloudWatch Logs]
                                           [Slack 알림]

배포 파이프라인:
개발자 커밋
    --> CodePipeline
    --> Lambda 새 버전 발행
    --> 별칭 "prod" 10% 트래픽 → 새 버전 (카나리)
    --> 문제 없으면 100% 전환
```

---

## 📝 Week 3 종합 연습문제

**문제 1.** Lambda 함수의 최대 타임아웃은?

A) 5분  
B) 10분  
C) 15분  
D) 30분  

**정답: C** - Lambda 최대 타임아웃은 15분(900초)입니다.

---

**문제 2.** Lambda 레이어에 대한 올바른 설명이 아닌 것은?

A) 여러 함수 간 코드 공유  
B) /opt 디렉토리에 추출  
C) 최대 10개까지 연결 가능  
D) 다른 계정과 공유 가능  

**정답: C** - Lambda 레이어는 최대 5개까지 연결 가능합니다.

---

**문제 3.** Lambda 비동기 호출의 최대 재시도 횟수는?

A) 0  
B) 2  
C) 3  
D) 무제한  

**정답: B** - Lambda 비동기 호출은 최대 2회 자동 재시도합니다.

---

**문제 4.** API Gateway를 통한 Lambda 호출 방식은?

A) 비동기  
B) 동기  
C) 이벤트 소스 매핑  
D) 예약 호출  

**정답: B** - API Gateway는 Lambda를 동기 방식으로 호출합니다.

---

**문제 5.** Lambda Provisioned Concurrency의 목적은?

A) 비용 절감  
B) 더 많은 메모리 지원  
C) 콜드 스타트 제거  
D) 더 긴 타임아웃  

**정답: C** - Provisioned Concurrency는 미리 초기화된 환경을 유지하여 콜드 스타트를 제거합니다.

---

**문제 6.** SQS 이벤트 소스 매핑에서 처리 실패 시 메시지는 어떻게 되는가?

A) 즉시 삭제된다  
B) 가시성 타임아웃 후 큐로 반환된다  
C) DLQ로 자동 이동된다  
D) Lambda가 무한 재시도한다  

**정답: B** - SQS 메시지 처리 실패 시 메시지는 가시성 타임아웃 이후 큐에 다시 나타납니다.

---

**문제 7.** Lambda 함수에서 $LATEST 버전의 특징은?

A) 발행된 버전 중 가장 최신 버전  
B) 수정 가능한 현재 작업 버전  
C) 가장 안정적인 버전  
D) 삭제할 수 없는 기본 버전  

**정답: B** - $LATEST는 Lambda 함수의 수정 가능한 현재 작업 버전을 가리킵니다.

---

**문제 8.** Lambda 함수에 할당 가능한 최대 메모리는?

A) 1,024MB  
B) 3,008MB  
C) 5,120MB  
D) 10,240MB  

**정답: D** - Lambda 함수에는 최대 10,240MB(약 10GB)의 메모리를 할당할 수 있습니다.

---

**문제 9.** Lambda 함수의 /tmp 디렉토리에 대한 올바른 설명은?

A) 인스턴스 간 항상 공유된다  
B) 최대 512MB만 사용 가능하다  
C) 동일 실행 환경의 다음 호출에서 재사용될 수 있다  
D) 함수 종료 시 자동으로 백업된다  

**정답: C** - 동일한 Lambda 실행 환경이 웜 상태로 재사용될 때 /tmp 디렉토리의 내용도 유지됩니다.

---

**문제 10.** Lambda 예약 동시성(Reserved Concurrency)의 효과는?

A) 함수의 최소 실행 보장  
B) 콜드 스타트 방지  
C) 함수의 최대 동시 실행 수 제한 및 전용 할당  
D) 자동 스케일링 설정  

**정답: C** - 예약 동시성은 특정 함수에 최대 동시성을 설정하고 해당 동시성을 다른 함수가 사용하지 못하게 합니다.

---

**문제 11.** DynamoDB Streams와 Lambda 이벤트 소스 매핑에서 레코드 순서는?

A) 처리 순서가 보장되지 않는다  
B) 샤드 내에서는 순서가 보장된다  
C) 모든 테이블에서 전역적으로 순서가 보장된다  
D) 최신 레코드부터 역순으로 처리된다  

**정답: B** - DynamoDB Streams에서 Lambda는 각 샤드 내의 레코드 순서를 보장합니다.

---

**문제 12.** Lambda 컨테이너 이미지 배포의 최대 크기는?

A) 250MB  
B) 1GB  
C) 5GB  
D) 10GB  

**정답: D** - Lambda 컨테이너 이미지 배포의 최대 크기는 10GB입니다.

---

## 📊 Week 3 자기 평가

| 점수 | 평가 |
|------|------|
| 10-12 | 우수 - Lambda 완전 이해 |
| 7-9 | 양호 - 틀린 부분 재학습 |
| 4-6 | 보통 - Day 11-14 복습 |
| 0-3 | 미흡 - Week 3 처음부터 재학습 |

## 📌 오늘의 요약

1. Lambda 핵심 스펙: 메모리 10GB, 타임아웃 15분, 레이어 5개(250MB), 비동기 2회 재시도
2. 호출 유형: 동기(API GW), 비동기(S3/SNS), 폴링(SQS/Kinesis/DynamoDB Streams)
3. 콜드 스타트 대응: Provisioned Concurrency(완전 제거), SnapStart(Java)
4. 버전+별칭+카나리: 안전한 배포를 위한 트래픽 점진적 전환
5. 오류 처리: 동기=호출자 책임, 비동기=자동 재시도+DLQ/Destinations

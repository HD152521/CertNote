# Day 28 - DynamoDB: 읽기/쓰기 용량, Streams

📅 날짜: 2026년 6월 23일 (화요일)
🎯 주제: DynamoDB 용량 모드 및 Streams
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- DynamoDB 읽기/쓰기 용량 단위(RCU/WCU)를 계산한다
- 프로비저닝 모드와 온디맨드 모드를 비교한다
- DynamoDB Streams의 동작 방식을 이해한다

---

## 📖 이론 내용

### 1. 용량 단위 (Capacity Units)

**읽기 용량 단위 (RCU):**
- 강력한 일관성 읽기: 4KB당 1 RCU
- 최종적 일관성 읽기: 4KB당 0.5 RCU
- 트랜잭션 읽기: 4KB당 2 RCU

**RCU 계산 예시:**
`
항목 크기 10KB, 강력한 일관성 10회 읽기
RCU = ceil(10KB/4KB) x 1 x 10 = 3 x 10 = 30 RCU
`

**쓰기 용량 단위 (WCU):**
- 1KB당 1 WCU (항상 동일)
- 트랜잭션 쓰기: 1KB당 2 WCU

**WCU 계산 예시:**
`
항목 크기 2.5KB, 분당 10회 쓰기 (초당 약 0.17회)
WCU = ceil(2.5KB/1KB) x 1 = 3 WCU
`

### 2. 용량 모드

**프로비저닝 모드:**
- 미리 RCU/WCU 지정
- Auto Scaling으로 자동 조정 가능
- 예측 가능한 워크로드에 비용 효율적

**온디맨드 모드:**
- 사용량에 따라 자동 확장
- 예측 불가능한 워크로드에 적합
- 프로비저닝보다 약 2~3배 비용

**⭐ 모드 전환**: 24시간에 한 번만 전환 가능

### 3. DynamoDB Streams

테이블의 모든 변경 사항(INSERT, MODIFY, REMOVE)을 스트림으로 기록합니다.

**스트림 뷰 유형:**
- KEYS_ONLY: 기본 키만
- NEW_IMAGE: 변경 후 전체 항목
- OLD_IMAGE: 변경 전 전체 항목
- NEW_AND_OLD_IMAGES: 변경 전/후 모두

**사용 사례:**
- 실시간 데이터 처리 (Lambda 트리거)
- 교차 리전 복제
- ElastiCache 캐시 무효화
- 감사 로그

**⭐ Lambda + DynamoDB Streams:**
- Lambda가 Streams를 폴링
- 샤드당 하나의 Lambda 동시 실행
- 최대 1년 데이터 보존

---

## 🧠 알아두면 좋은 심화 이론

### Burst Capacity (시험 출제)

- 미사용 RCU/WCU를 **300초(5분)** 동안 저장 → 일시적 트래픽 폭증에 사용
- 자동 동작, 별도 설정 없음
- 5분 누적 한도 초과는 throttling

### Adaptive Capacity (자동 핫 파티션 완화)

- 핫 파티션 감지 → 다른 파티션의 여유 용량 재분배
- 즉시 적용 (이전엔 분 단위 → 2018부터 즉시)
- 근본 해결은 키 설계

### DynamoDB Auto Scaling (Provisioned 모드)

```
대상 사용률 70% 유지
  ↓
사용률 > 70% 분기 N분 연속 → RCU/WCU 증가
사용률 < 70% 의 70% (49%) 분기 N분 연속 → RCU/WCU 감소
```

- 분당 4회 감소 + 일일 최대 27회 감소 한도
- GSI별 독립 적용 가능

### 온디맨드 모드 동작 (시험 함정)

- 시작 시점 처리량: **이전 트래픽의 2배** 또는 최소값
- 30분 내 트래픽 2배 증가는 처리 가능
- 그 이상은 throttling (예열되지 않은 상태)
- 가격: 백만 요청당 과금 + 저장량

> ⚠️ **함정**: "온디맨드로 변경했더니 throttling 발생" → 초기 예열 부족. 트래픽이 2배 이상 갑자기 늘면 미리 프로비저닝 후 전환 권장.

### DynamoDB Streams 상세

| 항목 | 값 |
|------|-----|
| 보존 기간 | **24시간** (고정) |
| 샤드 수 | 자동 (테이블 트래픽에 따라) |
| 순서 | 파티션 키 단위 보장 |
| 활성화 후 | 미래 변경만 캡처 (과거 데이터 X) |
| 통합 | Lambda (ESM), KCL, Kinesis Adapter |

### Kinesis Data Streams for DynamoDB (대안)

- DynamoDB Streams의 24시간 보존 → **Kinesis Data Streams로 라우팅** 시 최대 **365일** 보존
- 더 많은 컨슈머·복잡한 처리 가능
- 시험 시나리오: "1년 동안 변경 이력 추적" → Kinesis Stream 모드

### DAX (DynamoDB Accelerator) - 시험 출제

- DynamoDB **마이크로초 단위** 캐시 (10x 빠름)
- 완전 관리형, 클러스터 모드
- **읽기 전용** (쓰기는 일반 DynamoDB)
- 두 가지 캐시:
  - **Item Cache** (TTL 기본 5분): GetItem/BatchGetItem
  - **Query Cache** (TTL 기본 5분): Query/Scan
- 강력한 일관성 읽기는 캐시 우회

> 💡 시험: "DynamoDB 응답 속도 µs로" → DAX. 단, **VPC 내부에서만** 접근.

### DAX vs ElastiCache (자주 헷갈림)

| 항목 | DAX | ElastiCache |
|------|-----|-------------|
| 대상 | DynamoDB 전용 | 모든 DB / 캐시 |
| 일관성 | DDB와 통합 (eventual) | 별도 관리 필요 |
| API 호환 | DDB SDK 그대로 | 별도 코드 |
| 사용 | 단순 캐싱 | 세션, Pub/Sub, 복잡 |

### Global Tables (시험 출제)

- **다중 리전 활성/활성** 복제
- Streams 활성화 필요
- 마지막 쓰기 우선 (Last Writer Wins)
- 사용: 글로벌 사용자, 재해 복구

### 관련 서비스 Cross-Reference

- **DAX ↔ ElastiCache** → 이 페이지에서 비교
- **Streams ↔ Lambda** → [Week 3 Day 2]
- **Kinesis Data Streams** → [Week 11 Day 4]
- **Global Tables + KMS Multi-Region Key** → [Week 9]

---

## 아키텍처 다이어그램

`
DynamoDB 용량 계산
================================

RCU 계산:
항목 크기 6KB, 강력한 일관성 읽기:
ceil(6/4) = 2 RCU/읽기

항목 크기 6KB, 최종적 일관성 읽기:
ceil(6/4) x 0.5 = 1 RCU/읽기

WCU 계산:
항목 크기 3.5KB 쓰기:
ceil(3.5/1) = 4 WCU/쓰기

DynamoDB Streams 아키텍처
================================

사용자 주문 생성
      |
      v
[DynamoDB Table]
  PUT Item (신규 주문)
      |
      | Streams 이벤트 발생
      v
[DynamoDB Streams]
  이벤트: INSERT
  NewImage: {orderId: "O001", status: "PENDING"}
      |
      | Lambda 폴링
      v
[Lambda 함수]
      |
      +---> [SNS] 알림 발송
      |
      +---> [ElastiCache] 캐시 업데이트
      |
      +---> [OpenSearch] 검색 인덱스 업데이트
`

---

## ⭐ 핵심 포인트

1. ⭐ **RCU 계산**: ceil(항목크기/4KB) x 읽기 일관성 계수
2. ⭐ **WCU 계산**: ceil(항목크기/1KB) x 1
3. ⭐ **용량 모드 전환**: 24시간에 한 번만 가능
4. ⭐ **Streams 보존**: 최대 24시간 (Lambda로 처리)
5. ⭐ **NEW_AND_OLD_IMAGES**: 변경 전/후 모두 기록

---

## 📝 연습 문제

**문제 1.** 6KB 항목을 강력한 일관성으로 읽을 때 소비 RCU는?

A) 1 RCU  
B) 2 RCU  
C) 3 RCU  
D) 6 RCU  

**정답: B** - ceil(6/4) = 2 RCU (강력한 일관성 1 RCU/4KB)

---

**문제 2.** DynamoDB Streams의 데이터 보존 기간은?

A) 1시간  
B) 24시간  
C) 7일  
D) 30일  

**정답: B** - DynamoDB Streams의 데이터는 24시간 동안 보존됩니다.

---

**문제 3.** 프로비저닝 모드에서 온디맨드 모드로 전환 제한은?

A) 언제든 가능  
B) 24시간에 한 번  
C) 1주일에 한 번  
D) 1달에 한 번  

**정답: B** - DynamoDB 용량 모드는 24시간에 한 번만 전환 가능합니다.

---

**문제 4.** 변경 전후 모두 기록하는 Streams 뷰 유형은?

A) KEYS_ONLY  
B) NEW_IMAGE  
C) OLD_IMAGE  
D) NEW_AND_OLD_IMAGES  

**정답: D** - NEW_AND_OLD_IMAGES는 변경 전 항목과 변경 후 항목을 모두 스트림에 기록합니다.

---

**문제 5.** 트랜잭션 쓰기의 WCU 소비는?

A) 0.5 WCU/1KB  
B) 1 WCU/1KB  
C) 2 WCU/1KB  
D) 4 WCU/1KB  

**정답: C** - 트랜잭션 쓰기는 일반 쓰기(1 WCU/1KB)보다 2배인 2 WCU/1KB를 소비합니다.

---

## 📌 오늘의 요약

1. RCU: 강력한 일관성 1 RCU/4KB, 최종적 일관성 0.5 RCU/4KB, 트랜잭션 2 RCU/4KB
2. WCU: 1 WCU/1KB, 트랜잭션 2 WCU/1KB
3. 프로비저닝(예측 가능, 저렴) vs 온디맨드(유연, 비쌈) - 24시간에 한 번만 전환
4. DynamoDB Streams: 변경 사항 스트림, 24시간 보존, Lambda로 실시간 처리
5. Streams 뷰: KEYS_ONLY, NEW_IMAGE, OLD_IMAGE, NEW_AND_OLD_IMAGES
# Day 26 - DynamoDB: 테이블, 항목, 속성 기초

📅 날짜: 2026년 6월 21일 (일요일)  
🎯 주제: Amazon DynamoDB 기초  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- DynamoDB의 기본 개념(테이블, 항목, 속성)을 이해한다
- DynamoDB의 데이터 유형을 구분한다
- DynamoDB 읽기 일관성 모델을 이해한다

---

## 📖 이론 내용

### 1. Amazon DynamoDB란?

DynamoDB는 완전 관리형 NoSQL 데이터베이스 서비스입니다.

**DynamoDB 특징:**
- 서버리스 (용량 자동 확장)
- 일관되게 낮은 지연 시간 (밀리초 이하)
- 완전 관리형 (패치, 백업, 고가용성 AWS가 관리)
- 멀티-리전, 멀티-마스터 (DynamoDB Global Tables)
- 자동 데이터 암호화

### 2. 핵심 개념

**테이블 (Table)**
- DynamoDB의 기본 저장 단위
- 스키마리스 (고정 스키마 없음, 기본 키 제외)

**항목 (Item)**
- 관계형 DB의 "행(row)"에 해당
- 최대 크기: **400KB**

**속성 (Attribute)**
- 관계형 DB의 "열(column)"에 해당
- 스칼라, 문서, 집합 유형 지원

### 3. DynamoDB 데이터 유형

**스칼라 유형:**
- **S**: 문자열 (String)
- **N**: 숫자 (Number)
- **B**: 이진 (Binary)
- **BOOL**: 불리언
- **NULL**: Null

**집합 유형:**
- **SS**: 문자열 집합
- **NS**: 숫자 집합
- **BS**: 이진 집합

**문서 유형:**
- **M**: 맵(Map) - JSON 객체
- **L**: 목록(List) - 배열

### 4. 읽기 일관성

**최종적 일관성 읽기 (Eventually Consistent):**
- 기본 읽기 방식
- 0.5 RCU/4KB 소비
- 최근 쓰기가 즉시 반영 안 될 수 있음

**강력한 일관성 읽기 (Strongly Consistent):**
- 항상 최신 데이터 반환
- 1 RCU/4KB 소비 (2배 비용)
- `ConsistentRead: true` 설정

**트랜잭션 읽기:**
- 2 RCU/4KB 소비

---

## 🧠 알아두면 좋은 심화 이론

### DynamoDB 핵심 한도 (시험 자주 출제)

| 항목 | 한도 |
|------|------|
| 항목(Item) 최대 크기 | **400 KB** |
| 테이블당 GSI | **20개** (요청으로 ↑ 가능) |
| 테이블당 LSI | **5개** |
| 테이블당 속성 이름 길이 | 64 KB |
| 파티션 키 길이 | 1~2,048 바이트 |
| 정렬 키 길이 | 1~1,024 바이트 |
| 파티션당 처리량 | **3,000 RCU + 1,000 WCU** |
| 단일 트랜잭션 | 100개 항목 / 4MB (이전엔 25개) |
| BatchGetItem | 100개 항목 / 16MB |
| BatchWriteItem | 25개 PutItem/DeleteItem / 16MB |

> ⚠️ **함정**: 항목 400KB. 큰 데이터(이미지 등)는 S3에 저장하고 DynamoDB에는 **S3 URL**만 보관 — 표준 패턴.

### 일관성 모델 - SQL DB와 다른 점

| 동작 | DynamoDB | RDBMS |
|------|----------|-------|
| 기본 쓰기 | 동기적 모든 AZ 복제 | 동기 단일 → 비동기 복제 |
| 기본 읽기 | **Eventually Consistent** (0.5 RCU) | 일반적으로 Strong |
| 강력 일관성 | `ConsistentRead=true` (1 RCU) | 기본 |
| 트랜잭션 | TransactWrite/Get (2x 비용) | 기본 ACID |
| GSI 읽기 | **Eventually Consistent만** | - |

### DynamoDB 표현식 (시험 빈출)

```
KeyConditionExpression  - Query에서 키 조건
FilterExpression        - 결과 필터 (RCU는 그대로!)
UpdateExpression        - SET, REMOVE, ADD, DELETE
ConditionExpression     - 쓰기 조건 (조건부 쓰기)
ProjectionExpression    - 반환할 속성 선택
```

> ⚠️ **함정**: `FilterExpression`은 **읽은 후** 필터링 → RCU 절감 X. 비용 줄이려면 KeyCondition·인덱스 활용.

### 예약어와 ExpressionAttributeNames

`name`, `type`, `count` 등 DynamoDB 예약어를 속성으로 쓸 때:

```python
update_item(
    UpdateExpression='SET #n = :v',
    ExpressionAttributeNames={'#n': 'name'},
    ExpressionAttributeValues={':v': {'S': 'Kim'}}
)
```

### 데이터 분산 - 파티션 메커니즘

```
파티션 키 → SHA-1 해시 → 파티션 결정
같은 파티션 키 → 같은 파티션 (정렬 키로 정렬)

파티션당 한도:
  스토리지: 10GB
  처리량: 3,000 RCU + 1,000 WCU
초과 시 자동 분할 (Adaptive Capacity)
```

> 💡 **Adaptive Capacity** (2018~): 핫 파티션 자동 감지 + 다른 파티션의 여유 용량 재할당. 시험에 가끔 "핫 파티션 발생 시" → AC가 도움 주지만 키 설계가 근본.

### 데이터 분산 전략 - 핫 파티션 방지

| 안티 패턴 | 개선 |
|-----------|------|
| `date` 파티션 키 (오늘 모든 쓰기 → 한 파티션) | `date#hash` 또는 UUID |
| `status` 파티션 키 (값이 적음) | 복합 키 + GSI |
| sequential ID | 시드 분산 (`hash(id) + id`) |

### DynamoDB Local & Test 환경

- **DynamoDB Local**: 로컬 jar로 다운로드 가능, 무료, 통합 테스트용
- **PartiQL**: SQL 호환 쿼리 (Select/Insert/Update/Delete) — 시험엔 가끔
- **NoSQL Workbench**: GUI 도구 (테이블 설계·시각화)

### 관련 서비스 Cross-Reference

- **DAX (DynamoDB Accelerator)** → [Day 3 / 마이크로초 캐시]
- **Streams + Lambda** → [Day 3]
- **Global Tables (다중 리전)** → 멀티 리전 활성/활성
- **KMS** → 저장 시 자동 암호화 (선택: AWS owned / aws managed / customer managed)

---

## 아키텍처 다이어그램

```
DynamoDB 구조 (관계형 DB와 비교)
================================

관계형 DB:           DynamoDB:
테이블 (Table)    =  테이블 (Table)
행 (Row)         =  항목 (Item)
열 (Column)      =  속성 (Attribute)
기본 키 (PK)     =  파티션 키 (필수)
인덱스           =  LSI, GSI

DynamoDB 항목 예시
================================

테이블: Users
+----------+------+---+---------------------------+
|userId(PK)|name  |age|email                      |
+----------+------+---+---------------------------+
|"u001"    |"Kim" |30 |"kim@example.com"          |
|"u002"    |"Lee" |25 |"lee@example.com"          |
|"u003"    |"Park"|35 |{tags:["admin","user"]}    |
+----------+------+---+---------------------------+
          (스키마리스: 각 항목이 다른 속성 가질 수 있음)

읽기 일관성
================================

최종적 일관성:
Writer --> [DynamoDB 노드 1] --> Reader
              |
              | 복제 중...
           [노드 2] <-- 읽으면 이전 데이터일 수 있음

강력한 일관성:
Writer --> [DynamoDB] --> 복제 완료 확인 --> Reader
              (최신 데이터 보장, 2배 비용)
```

---

## ⭐ 핵심 포인트

1. ⭐ **항목 최대 크기**: 400KB (S3보다 훨씬 작음)
2. ⭐ **강력한 일관성**: 2배 RCU 소비, ConsistentRead: true
3. ⭐ **스키마리스**: 기본 키 외 속성은 항목마다 다를 수 있음
4. ⭐ **완전 관리형**: 패치, 확장, 고가용성 AWS가 담당
5. ⭐ **데이터 유형**: S(문자열), N(숫자), B(바이너리), BOOL, NULL, SS, NS, M, L

---

## 📝 연습 문제

**문제 1.** DynamoDB 항목의 최대 크기는?

A) 64KB  
B) 400KB  
C) 1MB  
D) 5MB  

**정답: B** - DynamoDB 항목의 최대 크기는 400KB입니다. 더 큰 데이터는 S3에 저장하고 DynamoDB에 S3 링크를 저장하는 방식을 사용합니다.

---

**문제 2.** 강력한 일관성 읽기를 사용하면 RCU 소비는?

A) 0.5 RCU/4KB  
B) 1 RCU/4KB  
C) 2 RCU/4KB  
D) 4 RCU/4KB  

**정답: B** - 강력한 일관성 읽기는 1 RCU/4KB를 소비합니다. 최종적 일관성 읽기는 0.5 RCU/4KB입니다.

---

**문제 3.** DynamoDB의 스키마리스(Schemaless) 특성이란?

A) 기본 키도 없어도 된다  
B) 기본 키 외에 각 항목이 다른 속성을 가질 수 있다  
C) 데이터 유형이 없다  
D) 인덱스를 생성할 수 없다  

**정답: B** - DynamoDB는 기본 키는 필수이지만, 나머지 속성은 항목마다 다를 수 있어 유연한 스키마를 지원합니다.

---

**문제 4.** DynamoDB의 완전 관리형 특성이 의미하는 것은?

A) 고객이 서버를 직접 관리  
B) AWS가 인프라, 패치, 확장, 고가용성을 관리  
C) 무료로 사용 가능  
D) 오직 AWS 서비스만 접근 가능  

**정답: B** - DynamoDB는 완전 관리형 서비스로 AWS가 서버, 패치, 백업, 고가용성, 확장을 자동으로 관리합니다.

---

**문제 5.** 항상 최신 데이터를 읽어야 하는 금융 애플리케이션에서 사용해야 하는 읽기 방식은?

A) 최종적 일관성 읽기  
B) 약한 일관성 읽기  
C) 강력한 일관성 읽기  
D) 캐시된 읽기  

**정답: C** - 금융 애플리케이션처럼 항상 최신 데이터가 필요한 경우 강력한 일관성 읽기를 사용해야 합니다.

---

## 📌 오늘의 요약

1. DynamoDB: 완전 관리형 NoSQL, 밀리초 이하 지연 시간, 자동 확장
2. 기본 구조: 테이블 > 항목(최대 400KB) > 속성, 스키마리스
3. 데이터 유형: 스칼라(S,N,B,BOOL,NULL), 집합(SS,NS,BS), 문서(M,L)
4. 읽기 일관성: 최종적(0.5 RCU, 기본), 강력한(1 RCU, 최신 보장)
5. 강력한 일관성은 최종적 일관성보다 2배 비용이 발생함

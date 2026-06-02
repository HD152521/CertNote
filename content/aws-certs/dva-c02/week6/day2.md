# Day 27 - DynamoDB: 파티션 키, 정렬 키, LSI/GSI

📅 날짜: 2026년 6월 22일 (월요일)  
🎯 주제: DynamoDB 키 설계 및 인덱스  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 파티션 키와 정렬 키의 역할을 이해한다
- LSI와 GSI의 차이점을 명확히 구분한다
- 효과적인 DynamoDB 키 설계 원칙을 적용한다

---

## 📖 이론 내용

### 1. 기본 키 유형

**단순 기본 키**: 파티션 키만 (고유해야 함)  
**복합 기본 키**: 파티션 키 + 정렬 키 (조합이 고유)

**파티션 키 선택 기준:**
- 높은 카디널리티(많은 고유 값)
- 균등한 데이터 분산
- 핫 파티션 방지

### 2. Query vs Scan

**Query**: 파티션 키로 검색, 효율적, 비용 낮음  
**Scan**: 전체 테이블 읽기, 비효율적, 비용 높음

### 3. LSI vs GSI

| 특성 | LSI | GSI |
|------|-----|-----|
| 파티션 키 | 기본 테이블과 동일 | 다른 파티션 키 가능 |
| 정렬 키 | 다른 정렬 키 | 다른 정렬 키 |
| 생성 시점 | **테이블 생성 시만** | **언제든 가능** |
| 읽기 일관성 | 강력/최종적 모두 | **최종적만** |
| RCU/WCU | 기본 테이블 공유 | **별도 설정 필요** |
| 최대 개수 | 5개 | 20개 |

---

## 🧠 알아두면 좋은 심화 이론

### Single-Table Design (실무 표준 + 시험 시나리오)

DynamoDB 모범 사례: **여러 엔티티를 한 테이블에 저장** + 인덱스로 다양한 조회 패턴 지원.

```
USER#123    PROFILE       { name, email }
USER#123    ORDER#001     { total, status }
USER#123    ORDER#002     { total, status }
PRODUCT#A   DETAIL        { name, price }
PRODUCT#A   REVIEW#u1     { rating, text }
```

- 파티션 키: `PK` (USER#id, PRODUCT#id)
- 정렬 키: `SK` (PROFILE, ORDER#xxx)
- GSI로 역방향 조회 (예: GSI1PK=`PRODUCT#A`, GSI1SK=`REVIEW#xxx`)

### GSI Projection 옵션 (시험에 가끔)

| 옵션 | 인덱스에 저장 | 비용 |
|------|---------------|------|
| **KEYS_ONLY** | PK + SK만 | 최저 |
| **INCLUDE** | 지정한 속성만 | 중간 |
| **ALL** | 모든 속성 | 최고 |

> 💡 KEYS_ONLY로 검색하고 필요 시 GetItem으로 원본 가져오는 패턴이 가장 저렴.

### GSI Throttling - 함정 시나리오

```
기본 테이블 WCU 충분 → 쓰기 OK
GSI WCU 부족 → GSI 쓰기 실패 → 기본 테이블 쓰기도 throttled!
```

> ⚠️ **함정**: GSI도 자체 WCU 부족하면 본 테이블에 영향. 항상 GSI WCU ≥ 기본 WCU 유지 또는 온디맨드 모드.

### Query vs Scan 디테일

| 항목 | Query | Scan |
|------|-------|------|
| 조건 | 파티션 키 = (필수) + 정렬 키 비교 | 없음 (전체 읽기) |
| 효율성 | ✅ 빠름 | ❌ 느림 |
| 정렬 순서 | `ScanIndexForward` (ASC/DESC) | 정렬 X |
| 페이지네이션 | `LastEvaluatedKey` → `ExclusiveStartKey` | 동일 |
| Parallel Scan | ❌ | `Segment`/`TotalSegments`로 병렬 |
| 비용 | 일치하는 데이터만 | **전체 스캔** |

### Sparse Index (희소 인덱스) - 고급 패턴

GSI 파티션 키가 일부 항목에만 존재하면 해당 항목만 인덱스에 포함 → 효율적.

```
USER#123 가 admin=true → 인덱스에 포함
USER#456 admin 속성 없음 → 인덱스에 포함 X

GSI로 "관리자만 조회" 효율적
```

### LSI 추가 디테일

- LSI 사용 시 **단일 파티션 키 항목 컬렉션 = 10GB 제한** (전체 LSI 합산)
- LSI는 본 테이블 RCU/WCU 공유 → 추가 비용 없음
- LSI 강력 일관성 가능 (GSI는 불가)

### 키 설계 - 시험에 자주 출제되는 패턴

| 시나리오 | 키 설계 |
|----------|---------|
| 사용자별 주문 (최신순) | PK=UserId, SK=OrderDate (ScanIndexForward=false) |
| 카테고리별 상품 + 가격순 | GSI: PK=Category, SK=Price |
| 시간 범위 쿼리 | PK=동일, SK=ISO 타임스탬프 |
| 위계 데이터 | PK=ParentId, SK=`<type>#<id>` |
| Geospatial | Geohash를 파티션 키로 |

### 관련 서비스 Cross-Reference

- **GSI 비동기 복제** → 쓰기 후 즉시 GSI 조회 시 비반영 가능
- **Single-Table Design ↔ DynamoDB Streams** → [Day 3]
- **NoSQL Workbench** → 키 설계 시각화 도구

---

## 아키텍처 다이어그램

```
DynamoDB 복합 기본 키 구조
================================

테이블: UserOrders
PK: UserId (파티션 키)
SK: OrderDate (정렬 키)

파티션 키별 데이터 분산:
+--------+----------+------+
|UserId  |OrderDate |Total |
+--------+----------+------+
|U001    |2026-01   |50000 |  파티션 1
|U001    |2026-02   |30000 |  파티션 1 (같은 파티션)
|U002    |2026-01   |80000 |  파티션 2
|U003    |2026-03   |20000 |  파티션 3
+--------+----------+------+

Query: UserId=U001이면서 OrderDate >= 2026-01 인 항목
(파티션 키로 파티션 찾고, 정렬 키로 범위 검색 - 효율적!)

LSI vs GSI
================================

기본 테이블: Articles
PK: AuthorId | SK: ArticleId

[LSI - 같은 PK]            [GSI - 다른 PK]
PK: AuthorId               PK: Category
SK: PublishDate            SK: PublishDate

AuthorId로 날짜순 조회     Category로 날짜순 조회
(테이블 생성 시만 생성)    (언제든 추가 가능)
```

---

## ⭐ 핵심 포인트

1. ⭐ **LSI**: 테이블 생성 시에만 설정, 강력한 일관성 지원
2. ⭐ **GSI**: 언제든 추가/삭제 가능, 최종적 일관성만, 별도 용량
3. ⭐ **Scan**: 전체 테이블 읽기, 비효율적, 피해야 함
4. ⭐ **파티션 키**: 높은 카디널리티로 핫 파티션 방지
5. ⭐ **복합 기본 키**: 정렬 키로 범위 쿼리 및 정렬 가능

---

## 📝 연습 문제

**문제 1.** LSI에 대한 올바른 설명은?

A) 테이블 생성 후 언제든 추가 가능  
B) 테이블 생성 시에만 설정 가능  
C) 기본 파티션 키와 다른 파티션 키 사용  
D) 별도 RCU/WCU가 필요하다  

**정답: B** - LSI는 테이블 생성 시에만 설정 가능합니다.

---

**문제 2.** GSI의 읽기 일관성은?

A) 강력한 일관성만  
B) 최종적 일관성만  
C) 둘 다 지원  
D) 읽기 일관성 없음  

**정답: B** - GSI는 최종적 일관성 읽기만 지원합니다.

---

**문제 3.** 가장 비효율적인 읽기 방식은?

A) Get Item  
B) Query  
C) Scan  
D) Batch Get  

**정답: C** - Scan은 전체 테이블을 읽어 가장 비효율적입니다.

---

**문제 4.** 핫 파티션 방지를 위한 파티션 키 선택은?

A) 날짜(Date)  
B) 상태 코드  
C) 높은 카디널리티 UserId/UUID  
D) 국가 코드  

**정답: C** - 높은 카디널리티를 가진 키가 데이터를 균등 분산시킵니다.

---

**문제 5.** GSI에서 별도 RCU/WCU가 필요한 이유는?

A) GSI가 더 빠르기 때문  
B) GSI는 전체 테이블에 걸쳐 독립적으로 운영되기 때문  
C) AWS 정책 때문  
D) 데이터 암호화 때문  

**정답: B** - GSI는 기본 테이블과 독립적인 파티션으로 운영되므로 별도 RCU/WCU를 설정해야 합니다.

---

## 📌 오늘의 요약

1. 기본 키: 단순(파티션 키만) 또는 복합(파티션 키 + 정렬 키)
2. LSI: 같은 파티션 키, 테이블 생성 시만, 강력한 일관성 지원
3. GSI: 다른 파티션 키, 언제든 추가 가능, 최종적 일관성만, 별도 용량
4. Query(효율적) vs Scan(비효율적) - Scan은 최대한 피하자
5. 파티션 키는 높은 카디널리티로 선택하여 핫 파티션 방지

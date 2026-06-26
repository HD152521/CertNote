# Day 5 - Week 3 종합: 데이터 수집 2 복습

한 주 동안 데이터 수집의 "어려운 절반"을 다뤘다. Week 2가 "데이터를 어떻게 받아들이는가"의 기초였다면, Week 3는 "그 수집이 실시간이고, 장애가 나고, 운영 DB가 멈출 수 없고, 여러 컴포넌트가 얽혀 있을 때 어떻게 견고하게 만드는가"였다. 오늘은 흩어진 조각을 하나의 그림으로 다시 맞춘다.

핵심 질문 하나로 묶어보자. **"끝없이 흘러드는 데이터를, 중복·순서 뒤바뀜·장애 속에서, 운영 시스템을 멈추지 않고, 여러 소비자가 각자 활용하도록 어떻게 수집할 것인가."** 이번 주의 다섯 날이 이 질문의 다섯 부분에 정확히 대응한다.

## 한 장으로 보는 Week 3

| Day | 주제 | 핵심 한 줄 |
|-----|------|------------|
| Day1 | 스트리밍 처리(Managed Flink) | 무한 스트림에 윈도우로 경계를 긋고 워터마크로 결과 시점을 정한다 |
| Day2 | 수집 신뢰성 | at-least-once 전달 + 멱등 컨슈머 = effectively-once |
| Day3 | CDC / DMS | 전체를 다시 읽지 말고 트랜잭션 로그로 변경만 따라간다 |
| Day4 | 아키텍처 패턴 | Lambda/Kappa로 처리를, SQS/SNS/EventBridge로 결합을 설계한다 |

## 흐름으로 다시 읽기: 하나의 파이프라인

이번 주 개념을 하나의 가상 파이프라인에 모두 배치해보자.

```
[운영 RDS MySQL]
   │  (Day3) DMS Full Load + CDC, binlog ROW 필요
   ▼
[Kinesis Data Streams]  ── PartitionKey=userId (Day2 순서 보장)
   │
   ├─(Day4 팬아웃)→ [Firehose] → S3 raw  ──(Day4 Batch Layer)
   │
   ▼ (Day1 Speed Layer)
[Managed Flink]  Event time + Watermark + Tumbling window
   │  체크포인트로 exactly-once 처리
   ├─→ OpenSearch (실시간 대시보드)
   └─→ 실패 레코드 → (Day2) SQS DLQ / OnFailure destination
```

이 그림 안에 이번 주 전부가 들어 있다. DMS가 운영 DB의 변경을 무중단으로 캡처(Day3)하고, Kinesis가 순서를 보장하며 받아(Day2), 한쪽은 S3로 적재(배치)하고 한쪽은 Flink로 실시간 집계(Day1)한다 — 전형적인 Lambda 아키텍처(Day4)다. 처리 실패는 DLQ로 격리되고(Day2), 컴포넌트들은 스트림/큐로 느슨하게 결합된다(Day4).

> 💡 **관련 이론**: 이 파이프라인은 데이터 엔지니어링의 두 가지 불변 원칙을 보여준다. 첫째, **원본 보존(immutable raw)** — S3 raw 레이어는 절대 수정하지 않고, 잘못은 재처리로 바로잡는다. 둘째, **단일 진실 공급원(single source of truth)에서의 다중 뷰** — 같은 데이터를 배치 뷰와 실시간 뷰로 각자 재구성한다. 수집 설계의 견고함은 이 두 원칙을 지키는 데서 나온다.

## 자주 헷갈리는 선택지 정리

시험에서 "무엇을 고를까"로 헷갈리는 쌍들을 묶어둔다.

| 상황 | 선택 | 이유 |
|------|------|------|
| 윈도우 집계·스트림 조인·상태 처리 | Managed Flink | 복잡한 stateful 처리 |
| 단순 변환 후 S3 적재 | Firehose + Lambda | Flink는 과한 설계 |
| 중복 가능 환경에서 정합성 | 멱등 컨슈머(DynamoDB 조건부 쓰기) | exactly-once 전달은 불가 |
| 사용자별 순서 보장 | Kinesis PartitionKey=userId / SQS FIFO GroupId | 파티션/그룹 단위 순서 |
| 운영 DB 무중단 분석 복제 | DMS Full Load + CDC | 표준 무중단 마이그레이션 |
| 스키마·저장 프로시저 변환 | SCT | DMS는 데이터만 |
| 한 이벤트 → 여러 내구성 컨슈머 | SNS → SQS 팬아웃 | 분배 + 버퍼 |
| 콘텐츠 기반 라우팅, AWS 이벤트 | EventBridge | 패턴 매칭 + 서비스 이벤트 |
| 로직 중복 없이 실시간 중심 | Kappa | 스트림 단일 + replay |

> ⚠️ **함정 모음**: (1) CDC가 안 되면 원본 로그 설정(binlog ROW / wal_level=logical / supplemental logging)을 의심하라. (2) SQS 가시성 타임아웃 < 실제 처리 시간이면 중복 처리가 난다. (3) Flink `millisBehindLatest` 지속 증가 = 처리량 부족, 병렬성/샤드를 늘려라. (4) SNS 단독은 컨슈머 다운 시 유실 위험 → 내구성 필요하면 SQS를 끼워라. (5) Lambda 아키텍처의 숨은 비용은 로직 이중 구현이다.

## 핵심 개념 셀프 체크

스스로 답할 수 있는지 점검해보자.

```
□ Event time / Processing time / Ingestion time의 차이는?
□ 워터마크는 무엇을 결정하는가? (→ 윈도우 결과를 언제 확정할지)
□ Tumbling / Sliding / Session 윈도우를 한 줄로 구분할 수 있는가?
□ "exactly-once 전달은 불가하지만 ___ 처리는 가능"의 빈칸은? (→ exactly-once)
□ 멱등성 키는 누가 부여해야 하는가? (→ 프로듀서)
□ Kinesis 순서 보장 단위 / SQS FIFO 순서 보장 단위는?
□ 지수 백오프에 지터를 더하는 이유는? (→ thundering herd 분산)
□ DLQ의 maxReceiveCount는 무엇을 의미하는가?
□ DMS Full Load + CDC의 3단계 동작은?
□ CDC가 읽는 것은? (→ 트랜잭션 로그)
□ Lambda vs Kappa의 핵심 트레이드오프는? (→ 로직 중복 vs replay)
□ SQS / SNS / EventBridge의 한 줄 역할 구분은?
```

> 🎯 **종합 시나리오**: 글로벌 게임사가 "운영 DB의 결제 기록을 데이터 레이크에 근실시간 반영하면서, 동시에 최근 5분 지역별 매출을 실시간 대시보드에 표시"하려 한다. 설계: (1) DMS CDC로 결제 DB 변경을 Kinesis로 송출(Day3) → (2) PartitionKey=region으로 지역별 순서 유지(Day2) → (3) Firehose가 S3 raw에 Parquet 적재(배치 경로) → (4) Managed Flink가 region별 5분 Tumbling window로 매출 집계 후 OpenSearch에 싱크(실시간 경로, Day1) → (5) 전체는 Lambda 아키텍처(Day4), 처리 실패는 DLQ 격리(Day2), 멱등성으로 CDC 재전송 중복 무해화(Day2). 이 한 문제가 Week 3 전부를 묶는다.

## 다음 주로 가는 다리

Week 3까지 우리는 "데이터를 견고하게 받아들이는" 모든 방법을 익혔다 — 스트림으로, 변경 캡처로, 신뢰성 있게, 느슨하게 결합해서. 받아들인 데이터는 이제 어딘가에 **저장**되고 **변환**되어야 한다. 다음 주제는 자연스럽게 "저장과 변환" — 데이터 레이크 설계, 파일 포맷(Parquet/ORC)과 압축, 파티셔닝, 그리고 Glue/EMR/Spark를 이용한 본격적인 변환 처리로 이어진다. 오늘 그린 파이프라인의 화살표 끝(S3, Redshift, OpenSearch)이 다음 주의 출발점이다.

수집(ingestion)은 데이터 파이프라인의 입구다. 입구가 흔들리면 그 뒤의 모든 분석이 흔들린다. 이번 주에 익힌 멱등성, 순서, 재시도, CDC, 이벤트 결합은 화려하지 않지만, 실무에서 데이터 엔지니어를 새벽에 깨우지 않게 하는 바로 그 기초들이다.

---

## 📝 연습 문제

**문제 1.** Week 3 전체를 관통하는 신뢰성 명제로 가장 정확한 것은?

A) 분산 시스템에서 exactly-once 전달은 항상 보장된다  
B) 중복을 막으려면 항상 SQS FIFO만 쓰면 된다  
C) exactly-once 전달은 보장하기 어렵지만, at-least-once 전달과 멱등 컨슈머를 조합하면 effectively-once 처리를 달성할 수 있다  
D) 순서 보장은 언제나 전역(global)으로 해야 한다  

**정답: C**  
해설: 네트워크에 의존하는 전달은 완벽히 통제할 수 없어 exactly-once 전달은 어렵다. 대신 at-least-once 전달을 전제로 컨슈머를 멱등하게 만들면 중복이 무해해져 effectively-once 처리를 얻는다. SQS FIFO 중복 제거는 5분 윈도우 한계가 있고, 전역 순서는 처리량을 크게 깎으므로 보통 파티션 단위로만 보장한다.

---

**문제 2.** 다음 중 Managed Flink(Day1) 대신 Kinesis Data Firehose + Lambda 변환(Day4 단순 경로)을 선택해야 하는 상황은?

A) 들어오는 JSON을 Parquet로 형식 변환만 해서 S3에 적재  
B) 두 스트림을 시간 범위로 조인해 데이터를 강화  
C) 사용자 세션별 페이지뷰를 세션 윈도우로 집계  
D) 최근 10분 이동 평균을 슬라이딩 윈도우로 계산  

**정답: A**  
해설: 윈도우 집계(A, D)나 스트림 조인(B) 같은 stateful 복잡 처리는 Flink의 영역이다. 단순 형식 변환 후 S3 적재는 Firehose + Lambda 변환이 더 간단하고 저렴하며, 이 경우 Flink는 과한 설계다.

---

**문제 3.** DMS로 운영 DB를 무중단으로 분석 시스템에 복제하려는데, Full Load는 성공하지만 이후 변경분이 반영되지 않는다. 가장 먼저 확인할 것은?

A) Target Endpoint의 색상 설정  
B) Migration Task의 생성 시각  
C) Replication Instance의 이름  
D) 원본 DB의 변경 로그 설정(MySQL binlog ROW, PostgreSQL wal_level=logical, Oracle supplemental logging)  

**정답: D**  
해설: CDC는 원본의 트랜잭션 로그를 읽어 변경을 추출하므로, 해당 로그 기능이 활성화돼 있어야 한다. 설정이 없으면 Full Load는 되지만 CDC가 동작하지 않는다. 엔진별로 binlog(ROW), logical WAL, supplemental logging이 필요하며, 이 누락이 가장 흔한 원인이다.

---

**문제 4.** 한 "주문 생성" 이벤트를 결제·재고·분석 세 도메인이 각각 독립적으로, 일시 장애에도 유실 없이 처리해야 한다. 그리고 결제 도메인은 영구 실패 메시지를 따로 격리해야 한다. 가장 적절한 조합은?

A) 단일 SQS Standard 큐 + 세 컨슈머 + 가시성 타임아웃 0  
B) SNS 팬아웃 → 도메인별 SQS 큐(각 DLQ 연결) → 각 컨슈머가 멱등 처리  
C) 세 도메인을 동기 REST로 순차 호출  
D) EventBridge 없이 Lambda를 직접 체이닝  

**정답: B**  
해설: SNS가 한 이벤트를 세 SQS 큐로 팬아웃(1:N 분배)하고, 각 SQS가 내구성 버퍼로 일시 장애를 흡수하며, 결제 큐에 DLQ를 연결해 영구 실패를 격리한다. 컨슈머는 멱등하게 처리해 중복 전달을 무해화한다. 단일 큐+세 컨슈머는 팬아웃이 안 되고, 동기 호출/직접 체이닝은 강결합이라 한 곳의 장애가 전파된다.

---

**문제 5.** Lambda 아키텍처를 Kappa 아키텍처로 단순화했다. 이때 얻는 이점과 새로 생기는 제약을 옳게 짝지은 것은?

A) 이점: 로직 이중 구현 제거 / 제약: 전체 재처리는 스트림 보존 기간 내에서 replay로만  
B) 이점: 저장 비용 0 / 제약: 실시간 처리 불가  
C) 이점: 순서 보장 자동 / 제약: 배치 분석 불가  
D) 이점: DLQ 불필요 / 제약: 멱등성 불필요  

**정답: A**  
해설: Kappa는 배치 레이어를 없애 배치/실시간에 같은 로직을 두 번 구현하는 부담을 제거한다. 대신 전체 재처리가 필요하면 스트림을 처음부터 replay해야 하며, 이는 스트림의 데이터 보존 기간 내에서만 가능하다. 그 이상 과거는 별도 저장소(S3)가 필요하다. 나머지는 사실과 다르다.

---

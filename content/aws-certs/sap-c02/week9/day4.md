# Day 4 - Lake Formation, 데이터 거버넌스, MSK: 세분화 권한과 실시간 스트림의 내부

데이터 레이크가 조직 전체로 퍼지면 곧바로 두 가지 문제가 터진다. 첫째는 권한이다. S3에 모든 데이터를 모았는데, 영업팀은 PII 컬럼을 보면 안 되고, 한국 지사는 한국 region 행만 봐야 하고, 새 테이블이 추가될 때마다 누구에게 권한을 줄지 일일이 손으로 관리하기 시작하면 거버넌스가 무너진다. 둘째는 실시간성이다. 배치로 하루 한 번 적재하던 데이터를 "초 단위로 흘러들어오는 스트림"으로 다뤄야 할 때, 어떤 스트림 플랫폼을 어떻게 운영하느냐가 아키텍처를 가른다.

SAP-C02 시험에서 이 영역은 "S3 버킷 정책·IAM만으로는 풀 수 없는 행·열·셀 단위 권한", "여러 AWS 계정이 하나의 데이터 레이크를 공유하는 cross-account 패턴", "Kafka 표준이 필요한 조직의 스트림 선택", "수만 TPS 스트림의 운영 부담 최소화" 같은 거버넌스·스트리밍 아키텍처로 출제된다. 오늘은 Lake Formation의 권한 모델이 IAM과 어떻게 다른지, MSK가 Kafka를 어떻게 매니지드로 감싸는지를 내부 원리부터 분해한다.

## 왜 IAM·버킷 정책만으로는 부족한가 — 권한의 입도(granularity) 문제

데이터 레이크 권한을 IAM과 S3 버킷 정책으로만 다루면 곧 한계에 부딪힌다. IAM 정책은 "이 역할은 이 버킷/객체에 접근 가능"이라는 **객체 수준**까지만 표현한다. 그런데 분석 권한은 "이 테이블의 이 컬럼은 보되 PII 컬럼은 가리고, region='KR' 행만 보여달라"는 **테이블 내부의 행·열·셀 수준**이다. S3 파일 하나(Parquet)에 모든 컬럼과 모든 행이 섞여 있으므로, 파일 단위 권한으로는 이 입도를 낼 수 없다.

**AWS Lake Formation**은 이 간극을 메운다. Glue Data Catalog 위에 얹히는 별도의 권한 레이어로, 데이터베이스·테이블뿐 아니라 **컬럼(column)·행(row filter)·셀(cell)** 단위까지 권한을 부여한다. 사용자가 Athena·Redshift Spectrum·EMR로 질의하면, 그 엔진이 Lake Formation에 "이 주체가 이 테이블에서 무엇을 볼 수 있나"를 물어 허용된 컬럼만 반환하고 허용된 행만 필터링한다. IAM이 "문을 열 수 있나"라면, Lake Formation은 "방 안에서 어떤 서랍의 어떤 칸을 볼 수 있나"를 결정한다.

> 💡 **관련 이론**: 행·열 단위 권한은 데이터베이스 보안의 고전 주제인 **Row-Level Security(RLS)**와 **Column-Level Security(CLS)**의 데이터 레이크 구현이다. 전통 RDBMS(PostgreSQL의 RLS 정책, Oracle VPD)는 테이블에 보안 술어(predicate)를 붙여 "이 사용자의 쿼리에 자동으로 `WHERE tenant_id = current_user`를 주입"하는 식으로 행을 거른다. Lake Formation은 같은 개념을 카탈로그 메타데이터 계층에서 구현해, 물리 파일을 복제하거나 뷰를 따로 만들지 않고도 같은 데이터에 사용자별로 다른 행·열을 보여준다. SAP 시험에서 "PII 컬럼만 제외 / 특정 region 행만"은 Lake Formation의 CLS·RLS(데이터 필터)가 정답이다.

## LF Tag — ABAC로 권한을 스케일링하다

테이블이 수천 개, 컬럼이 수만 개로 늘면, 권한을 하나하나 부여하는 것은 불가능하다. **LF Tag(Lake Formation Tag) 기반 접근 제어(LF-TBAC)**가 이 스케일 문제를 푼다. 데이터에 태그(예: `classification=PII`, `sensitivity=high`, `domain=finance`)를 붙이고, 사용자/역할에는 "어떤 태그 값에 접근 가능한지"의 태그 권한을 부여한다. 그러면 **새 테이블이나 컬럼이 추가될 때 거기에 태그만 달면 자동으로 알맞은 권한이 적용**된다 — 권한을 다시 손볼 필요가 없다.

> 💡 **관련 이론**: LF Tag는 접근 제어 모델의 **RBAC vs ABAC** 논쟁에서 ABAC(Attribute-Based Access Control) 쪽이다. RBAC(Role-Based)는 "역할에 권한을 묶고 사용자에게 역할을 부여"하는데, 자원이 늘면 역할·권한 매트릭스가 폭발(role explosion)한다. ABAC는 "주체·자원·환경의 속성(attribute)으로 권한을 동적으로 판단"한다. NIST가 SP 800-162에서 정의한 ABAC 모델이 이 접근의 표준 근거다. LF Tag는 자원에 분류 속성을 부여하고 주체에 속성 매칭 권한을 줘, 자원이 늘어도 정책 수가 선형으로만 증가한다. 시험에서 "새 테이블 추가 시 자동 권한 적용 / 운영 부담 최소화 / 대규모 스케일"은 LF Tag(ABAC)가 답이다.

> ⚠️ **함정**: Lake Formation을 켜도 기존 IAM 권한이 즉시 무력화되지는 않는다. **LF Hybrid Access Mode**가 있어 IAM 권한과 Lake Formation 권한이 한동안 병행한다. 마이그레이션 중 둘이 공존하다 보면 "분명 LF에서 막았는데 IAM 경로로 여전히 접근된다"는 혼란이 생긴다. 점진 이전 시에는 어느 경로가 우세한지(IAM allow가 살아 있는지) 반드시 확인해야 한다. 시험에서 "기존 IAM 기반 레이크를 LF로 점진 이전"은 Hybrid Mode를 인지해야 풀린다.

## Cross-Account Data Lake — RAM + Lake Formation

대기업은 보통 데이터를 한 계정(Producer)에 모으고 여러 계정(Consumer: 부서·자회사)이 나눠 쓴다. 이때 두 메커니즘이 함께 작동한다. **AWS RAM(Resource Access Manager)**이 Producer의 Glue Catalog 리소스(데이터베이스·테이블)를 Consumer 계정과 **공유**하고, **Lake Formation**이 그 위에 컬럼·행 단위 세분 권한을 건다. Consumer 계정의 분석가는 자기 계정의 Athena/Redshift로 질의하되, Producer가 LF로 허용한 컬럼·행만 본다.

```
[Producer 계정]
  Glue Catalog ── RAM 공유 ──► [Consumer 계정]
                                     │
                              Lake Formation 권한
                              ├─ Column Filter (PII 컬럼 제외)
                              └─ Row Filter (region='KR' 행만)
                                     │
                              Athena / Redshift Spectrum 조회
```

> 🔍 **더 깊이**: 이 패턴이 **AWS Organizations·멀티 계정 전략**(SAP의 핵심 주제)과 맞물린다. 중앙 데이터 레이크를 별도의 데이터 계정에 두고, 부서별 계정이 RAM+LF로 필요한 데이터만 공유받는 구조는 "계정 경계로 폭발 반경(blast radius)을 격리하면서 데이터는 중앙 거버넌스로 통제"하는 멀티 계정 데이터 메시(data mesh)의 토대다. Control Tower로 계정을 프로비저닝하고, SCP로 가드레일을 치고, Lake Formation으로 데이터 권한을 중앙 관리하는 조합이 엔터프라이즈 데이터 거버넌스의 정석이다. 시험에서 "여러 계정이 중앙 레이크를 공유 + 행·열 세분 권한"은 RAM + Lake Formation.

## AWS DataZone과 Glue Data Quality — 거버넌스의 두 축

Lake Formation이 "누가 무엇을 볼 수 있나(권한)"라면, **DataZone**은 "데이터를 어떻게 발견·구독·관리하나(데이터 카탈로그·거버넌스 경험)"다. DataZone은 비즈니스 도메인 단위로 데이터를 카탈로그화하고, 데이터 프로듀서(데이터를 게시)와 컨슈머(검색·구독 요청) 경험을 분리한다. 비유하면 "사내 데이터 마켓플레이스"로, 분석가가 필요한 데이터셋을 검색하고 구독을 요청하면 승인 워크플로우를 거쳐 접근권이 부여된다. 내부적으로 Lake Formation·Glue·Redshift·S3와 통합되어, DataZone에서의 구독 승인이 실제 LF 권한 부여로 이어진다.

**Glue Data Quality**는 데이터의 정확성을 보장한다. Glue Catalog 테이블에 **DQDL(Data Quality Definition Language)**로 품질 규칙(예: "이 컬럼은 NULL이 5% 미만", "이메일 형식이어야 함", "값이 0~100 범위")을 정의하고, 주기적·자동으로 검사해 위반 시 EventBridge로 알린다. ML로 규칙을 추천하기도 한다. 잘못된 데이터가 파이프라인 하류로 흘러 잘못된 분석·의사결정을 낳는 것을 막는다.

> 💡 **관련 이론**: 데이터 품질·계보(lineage)는 **데이터 거버넌스**의 핵심 기둥이다. 데이터 계보는 "이 지표가 어떤 원천에서 어떤 변환을 거쳐 만들어졌나"를 추적하는데, 잘못된 숫자의 원인을 역추적하거나 규제 감사(GDPR의 데이터 처리 추적, 금융권 데이터 출처 증빙)에 필수다. 업계 표준으로 **OpenLineage**(계보 메타데이터 수집 표준)와 그 구현인 **Marquez**가 있고, AWS는 Glue·DataZone에 계보 기능을 내장한다. 데이터 품질을 파이프라인의 게이트로 두는 패턴(검증 실패 시 하류 차단)은 "garbage in, garbage out"을 방지하는 데이터 엔지니어링의 기본 안티패턴 회피책이다.

## MSK — Apache Kafka를 매니지드로

이제 실시간 스트림으로 넘어간다. **Amazon MSK(Managed Streaming for Apache Kafka)**는 Apache Kafka를 매니지드로 운영하는 서비스다. Kafka 자체를 먼저 이해해야 한다. Kafka는 2011년 LinkedIn에서 만들어진 분산 스트리밍 플랫폼으로, 핵심 모델은 다음과 같다.

- **Topic**: 메시지(이벤트)의 논리적 채널. "주문 이벤트", "클릭 스트림" 같은 단위.
- **Partition**: 토픽을 나눈 물리적 조각. 병렬성과 순서의 단위 — **한 파티션 내에서는 메시지 순서가 보장**되지만 파티션 간에는 보장되지 않는다. 파티션 수가 곧 최대 병렬 소비자 수다.
- **Broker**: 파티션을 저장·서빙하는 서버(MSK에서는 EC2). 여러 브로커가 파티션을 나눠 갖고 복제한다.
- **Consumer Group**: 여러 소비자가 그룹을 이뤄 파티션을 나눠 읽어 처리량을 수평 확장한다. 그룹 내 한 파티션은 한 소비자만 읽는다.
- **Offset**: 각 소비자가 "어디까지 읽었는지"의 위치. 소비자가 직접 커밋·관리하므로, 재처리·되감기가 자유롭다.

Kafka의 결정적 특성은 **로그 기반 저장**이다. 메시지를 소비해도 즉시 삭제하지 않고 보존 기간(retention) 동안 디스크에 남긴다. 그래서 여러 소비자 그룹이 같은 스트림을 독립적으로 여러 번 읽을 수 있고(pub/sub + replay), 새 소비자가 과거 데이터를 처음부터 다시 읽을 수도 있다. 이것이 Kafka를 단순 메시지 큐가 아니라 "이벤트의 진실의 원천(source of truth)"으로 만든다.

> 💡 **관련 이론**: Kafka의 설계 철학은 Jay Kreps가 정리한 **"The Log"** 개념이다 — 모든 시스템 상태 변화를 순서 있는 불변 로그(append-only log)로 표현하면, 그 로그를 재생(replay)해 어떤 시점의 상태도 복원하고 여러 시스템을 동기화할 수 있다는 것이다. 이는 데이터베이스의 WAL(Write-Ahead Log), 이벤트 소싱(event sourcing), CDC(Change Data Capture)와 같은 뿌리를 가진다. CAP 정리 관점에서 Kafka는 파티션 내 순서·복제를 통해 일관성과 가용성의 균형을 튜닝(acks 설정, ISR)할 수 있게 설계됐다. 이 "불변 로그 + 오프셋 재생" 모델이 스트리밍 아키텍처(Day 42의 Zero-ETL CDC 포함)의 공통 기반이다.

> 🔍 **더 깊이**: MSK의 인증·인가는 세 가지다. **IAM**(AWS 네이티브, 정책으로 토픽 접근 제어), **SASL/SCRAM**(사용자명·비밀번호, Secrets Manager 연동), **mTLS**(상호 TLS 인증서). 또 전통 Kafka는 메타데이터·리더 선출을 **ZooKeeper**에 의존했는데, 이는 운영 복잡성과 확장 한계의 원인이었다. Kafka는 **KRaft(Raft 합의)**로 ZooKeeper를 제거하는 방향으로 진화했고, MSK도 이를 따라간다. Raft는 분산 합의(consensus) 알고리즘으로, 리더를 선출하고 로그를 복제해 노드 장애에도 일관된 메타데이터를 유지한다. 시험에 KRaft 세부가 직접 나오진 않지만 "ZooKeeper 운영 부담"이 줄어드는 맥락은 알아둘 가치가 있다.

## MSK Serverless와 MSK Connect

**MSK Serverless**(2022)는 클러스터 사이징(브로커 수·파티션 용량 계획)을 없앤다. 토픽을 만들고 데이터를 보내면 MSK가 처리량에 맞춰 자동 확장한다. 용량 산정이 어렵거나 가변적인 워크로드, 클러스터 운영을 하기 싫은 경우에 적합하다.

**MSK Connect**는 Kafka Connect(커넥터 프레임워크)를 매니지드로 제공한다. 소스/싱크 커넥터로 외부 시스템과 Kafka를 코드 없이 연결한다. 대표 사례가 **Debezium 커넥터**로, 데이터베이스의 변경 로그(binlog/WAL)를 읽어 Kafka로 CDC 이벤트를 흘려보낸다. 운영 DB의 모든 변경을 실시간 스트림으로 바꾸는 표준 패턴이다.

> ⚠️ **함정**: MSK Serverless가 표준 MSK의 완전한 상위호환은 아니다. 토픽당·클러스터당 처리량 한도가 있고, 일부 Kafka 기능·설정이 제한되며, 매우 높은 처리량이나 세밀한 브로커 튜닝이 필요한 워크로드에는 프로비저닝드 MSK가 더 유연하다. 시험에서 "사이징 없이 / 가변 / 운영 회피"는 Serverless, "초고처리량 / 세밀한 튜닝 / 특정 Kafka 기능"은 프로비저닝드.

## MSK vs Kinesis Data Streams — 이식성 vs 단순성

실시간 스트림에서 가장 자주 나오는 선택이 MSK와 Kinesis Data Streams다.

| 항목 | MSK | Kinesis Data Streams |
|------|-----|---------------------|
| 기반 | Apache Kafka(OSS 표준) | AWS 독자 기술 |
| 이식성 | 매우 좋음(온프렘·타클라우드 Kafka로 이전) | AWS 종속 |
| 운영 | 프로비저닝드는 일부 사용자 책임(파티션·브로커), Serverless는 매니지드 | 완전 매니지드 |
| 확장 단위 | Partition | Shard(또는 On-Demand 자동) |
| 생태계 | 방대한 Kafka 커넥터·도구·커뮤니티 | AWS 서비스(Firehose·Lambda·Analytics) 깊은 통합 |
| 적합 | 기존 Kafka 자산·표준·복잡한 토픽 구조·이식성 | 단순·빠른 시작·AWS 네이티브 통합 |

판단 기준: **이미 Kafka를 쓰거나, 멀티클라우드 이식성, 방대한 Kafka 생태계(커넥터·스트림 처리)가 필요하면 MSK**. **빠르게 시작하고, AWS 서비스(Firehose→S3, Lambda 트리거)와 단순하게 통합하고 싶으면 Kinesis**. 시험에서 "Kafka 표준 / 이식성 / 기존 Kafka 마이그레이션"은 MSK, "단순 / AWS 네이티브 / 빠른 시작"은 Kinesis로 갈린다.

> 📚 **사례**: 많은 기업이 온프레미스에서 자체 운영하던 Kafka 클러스터를 AWS로 옮길 때 MSK를 택한다. 자체 Kafka는 브로커 패치·ZooKeeper 운영·디스크 관리·확장에 전담 엔지니어가 붙어야 했는데, MSK로 옮기면 브로커 프로비저닝·패치·복제·모니터링을 AWS가 맡아 운영 부담이 크게 준다. 결정적 이점은 **애플리케이션 코드를 거의 안 바꿔도 된다**는 것 — Kafka API가 그대로이므로 프로듀서·컨슈머 코드와 기존 커넥터(Debezium 등)를 재사용한다. 만약 같은 마이그레이션을 Kinesis로 했다면 SDK·파티셔닝 모델·소비 방식을 전부 다시 짜야 했을 것이다. 이것이 "기존 Kafka 자산 → MSK"가 시험의 정답인 이유다.

## 다른 클라우드와의 비교

| 역할 | AWS | GCP | Azure |
|------|-----|-----|-------|
| 매니지드 Kafka | MSK | (Confluent 파트너) Managed Kafka | Event Hubs(Kafka 호환 API) |
| 독자 스트림 | Kinesis Data Streams | Pub/Sub | Event Hubs |
| 데이터 레이크 권한 | Lake Formation | Dataplex / BigLake | Purview + RBAC |
| 데이터 거버넌스 카탈로그 | DataZone / Glue Catalog | Dataplex / Data Catalog | Purview |

Azure Event Hubs가 Kafka 호환 API를 제공한다는 점이 흥미롭다 — Kafka 프로토콜이 사실상 스트리밍의 산업 표준이 되면서, 각 클라우드가 "Kafka 호환"을 내세워 이식성 불안을 달랜다. 이것이 표준(Kafka) 기반 MSK가 이식성에서 강한 근본 이유다.

## 정리하며

데이터 레이크의 거버넌스는 IAM·버킷 정책의 객체 수준을 넘어 **행·열·셀 단위 권한**을 요구하고, 그 답이 Glue Catalog 위에 얹히는 **Lake Formation**이다. LF Tag(ABAC)는 새 자원에 태그만 달면 권한이 자동 적용되어 대규모 스케일을 감당하고, **RAM + Lake Formation**은 멀티 계정 데이터 레이크의 cross-account 공유를 가능하게 한다. DataZone(데이터 마켓플레이스)과 Glue Data Quality(DQDL 규칙)가 거버넌스를 완성한다. 실시간 스트림에서 **MSK**는 Kafka(불변 로그·파티션·오프셋·컨슈머 그룹)를 매니지드로 감싸 이식성과 생태계를, **Kinesis**는 단순성과 AWS 네이티브 통합을 제공한다.

SAP 시험의 단골 매핑: (1) "PII 컬럼 제외 / 특정 행만" → Lake Formation CLS·RLS(데이터 필터), (2) "새 테이블 자동 권한 / 대규모 스케일" → LF Tag(ABAC), (3) "여러 계정이 중앙 레이크 공유 + 세분 권한" → RAM + Lake Formation, (4) "기존 IAM 레이크 점진 이전" → LF Hybrid Mode, (5) "데이터 품질 규칙 자동 검사" → Glue Data Quality(DQDL), (6) "사내 데이터 검색·구독 마켓플레이스" → DataZone, (7) "Kafka 표준 / 이식성 / 기존 Kafka 마이그레이션" → MSK, (8) "사이징 없이 Kafka" → MSK Serverless, (9) "단순·AWS 네이티브 스트림" → Kinesis. 다음 day에서는 Week 9 전체를 종합 시나리오로 복습한다.

---

## 📝 연습 문제

**문제 1.** S3 데이터 레이크의 한 테이블에서, 분석가 그룹에게는 PII 컬럼(주민번호·이메일)을 제외한 나머지 컬럼만 보여주고 싶다. S3 버킷 정책과 IAM만으로는 컬럼 단위 통제가 안 된다. 가장 적합한 것은?

A) S3 버킷 정책으로 객체 접근 제한
B) Lake Formation 컬럼 수준 권한(Column-Level Security)
C) KMS로 컬럼 암호화
D) PII 컬럼을 별도 버킷으로 분리하고 IAM으로 차단

**정답: B**

해설: 한 Parquet 파일에 모든 컬럼이 섞여 있으므로 S3 버킷 정책·IAM(객체 수준)으로는 컬럼 단위 권한을 낼 수 없다. Lake Formation은 Glue Catalog 위에서 컬럼 단위 권한을 부여해, 같은 테이블을 질의해도 허용된 컬럼만 반환한다(CLS). A·D는 객체/버킷 수준이라 컬럼 입도가 안 나오고, D는 데이터를 분리·복제해 관리 부담이 큼. C(KMS)는 암호화일 뿐 컬럼 단위 노출 제어가 아니다.

---

**문제 2.** 데이터 레이크에 매주 새 테이블이 수십 개씩 추가된다. 테이블이 추가될 때마다 수동으로 권한을 부여하는 운영 부담이 커지고 있다. 새 테이블에 자동으로 알맞은 권한이 적용되게 하려면?

A) 테이블마다 IAM 정책을 수동으로 추가
B) Lake Formation LF Tag(태그 기반 접근 제어)
C) S3 객체 태그
D) Glue Trigger로 권한 스크립트 실행

**정답: B**

해설: LF Tag는 ABAC(속성 기반 접근 제어)로, 데이터에 분류 태그(예: classification=PII)를 붙이고 사용자/역할에 태그 권한을 주면, 새 테이블·컬럼이 해당 태그를 받는 순간 권한이 자동 적용된다. 자원이 늘어도 정책을 다시 손볼 필요가 없어 스케일링된다. A는 수동 부담이 그대로. C(S3 태그)는 Lake Formation 권한 메커니즘과 무관. D는 직접 스크립트를 짜고 유지해야 해 관리형 ABAC의 이점이 없다.

---

**문제 3.** 중앙 데이터 계정(Producer)의 Glue Catalog 데이터를 여러 부서 계정(Consumer)이 공유해야 한다. 동시에 각 부서는 자기 region 행만 보고 PII 컬럼은 제외돼야 한다. 가장 적합한 구성은?

A) Producer의 IAM Role을 Consumer가 AssumeRole
B) RAM으로 Glue Catalog 공유 + Lake Formation으로 행·열 세분 권한
C) 각 Consumer 계정에 데이터를 COPY로 복제
D) S3 Cross-Account 버킷 정책

**정답: B**

해설: RAM(Resource Access Manager)이 Producer의 Glue Catalog 리소스를 Consumer 계정에 공유하고, 그 위에 Lake Formation이 컬럼 필터(PII 제외)와 행 필터(region별)를 건다. Consumer는 자기 계정의 Athena/Redshift로 질의하되 LF가 허용한 행·열만 본다. A는 광범위한 역할 위임이라 세분 권한이 안 되고, C는 데이터 복제·동기화 부담과 거버넌스 분산, D(버킷 정책)는 행·열 입도가 안 나온다. "멀티 계정 + 중앙 레이크 + 세분 권한"은 RAM + Lake Formation.

---

**문제 4.** 온프레미스에서 자체 운영하던 Apache Kafka 클러스터를 AWS로 옮기려 한다. 기존 프로듀서·컨슈머 애플리케이션 코드와 Debezium 커넥터를 거의 그대로 재사용하고, 브로커 운영 부담은 줄이고 싶다. 가장 적합한 것은?

A) Kinesis Data Streams로 마이그레이션
B) Amazon MSK
C) SQS
D) Amazon MQ

**정답: B**

해설: MSK는 Apache Kafka를 매니지드로 제공하므로 Kafka API가 그대로여서 기존 프로듀서·컨슈머 코드와 커넥터(Debezium 등)를 거의 수정 없이 재사용하고, 브로커 프로비저닝·패치·복제·모니터링은 AWS가 맡아 운영 부담이 준다. A(Kinesis)는 AWS 독자 기술이라 SDK·파티셔닝·소비 모델을 전부 다시 짜야 함. C(SQS)는 메시지 큐로 스트림 재생·컨슈머 그룹 모델이 다름. D(MQ)는 ActiveMQ/RabbitMQ 매니지드로 Kafka가 아니다. "기존 Kafka 자산 재사용 + 운영 부담↓"은 MSK.

---

**문제 5.** Kafka를 쓰고 싶지만 브로커 수·파티션 용량 계획 같은 클러스터 사이징을 하고 싶지 않고, 처리량에 따라 자동으로 확장되기를 원한다. 가장 적합한 것은?

A) 프로비저닝드 MSK 클러스터를 크게 구성
B) MSK Serverless
C) Kinesis Data Streams 프로비저닝드 모드
D) 자체 Kafka를 EC2에 구축

**정답: B**

해설: MSK Serverless는 브로커 수·파티션 용량 계획 없이 토픽을 만들고 데이터를 보내면 처리량에 맞춰 자동 확장한다. 사이징이 어렵거나 가변적인 워크로드, 클러스터 운영 회피에 최적이다. A는 사이징을 직접 해야 함. C는 Kafka가 아니고 프로비저닝드는 샤드 계획이 필요. D는 운영 부담이 가장 큼. 단, 초고처리량·세밀한 튜닝이 필요하면 프로비저닝드 MSK가 더 유연하다는 한계도 기억할 것.

---

**문제 6.** Glue Data Catalog의 테이블에 대해 "이 컬럼은 NULL 5% 미만, 이메일 형식이어야 함" 같은 품질 규칙을 정의하고 주기적으로 자동 검사하며 위반 시 알림을 받고 싶다. 가장 적합한 것은?

A) Athena에서 WHERE로 수동 확인
B) Glue Data Quality(DQDL)
C) DataBrew 프로파일만 1회 실행
D) Lambda로 직접 검증 코드 작성

**정답: B**

해설: Glue Data Quality는 DQDL(Data Quality Definition Language)로 카탈로그 테이블에 품질 규칙을 선언하고, 주기적·자동으로 검사해 위반 시 EventBridge로 알린다(규칙 ML 추천도 지원). A는 수동·일회성. C(DataBrew 프로파일)는 통계 프로파일링이지 지속적 규칙 검증·알림 체계가 아님. D는 직접 코드를 짜고 유지해야 해 관리형 품질 프레임워크의 이점이 없다.

---

**문제 7.** 대규모 조직에서 분석가들이 필요한 데이터셋을 사내에서 검색하고 구독을 요청하면 승인 워크플로우를 거쳐 접근권이 부여되는 "데이터 마켓플레이스" 경험을 원한다. 프로듀서/컨슈머 경험을 분리하고 Lake Formation·Redshift와 통합돼야 한다. 가장 적합한 것은?

A) Lake Formation 단독
B) AWS DataZone
C) Glue Crawler
D) QuickSight 대시보드

**정답: B**

해설: DataZone은 비즈니스 도메인 단위 데이터 카탈로그·검색·구독·승인 워크플로우를 제공하는 거버넌스 서비스로, 데이터 프로듀서(게시)와 컨슈머(검색·구독) 경험을 분리하고 Lake Formation·Glue·Redshift·S3와 통합된다. 구독 승인이 실제 LF 권한 부여로 이어진다. A(Lake Formation)는 권한 메커니즘이지 검색·구독 마켓플레이스 경험이 아님. C는 스키마 추론 도구. D는 BI 시각화로 목적이 다르다.

---

## 📌 오늘의 요약

1. **권한 입도 문제** — IAM·버킷 정책은 객체 수준까지. 행·열·셀은 Lake Formation(Glue Catalog 위 권한 레이어)
2. **RLS/CLS** — Lake Formation이 행 필터·컬럼 필터를 카탈로그 계층에서 구현. 데이터 복제·뷰 없이 사용자별 다른 행·열
3. **LF Tag(ABAC)** — 태그로 권한 자동 적용, 새 자원도 태그만 달면 됨. NIST SP 800-162 ABAC. 대규모 스케일
4. **Cross-Account** — RAM(카탈로그 공유) + Lake Formation(세분 권한). 멀티 계정 데이터 메시의 토대
5. **거버넌스** — DataZone(데이터 마켓플레이스·구독), Glue Data Quality(DQDL 규칙·자동검사·알림), 계보(OpenLineage)
6. **Kafka 모델** — Topic·Partition(순서·병렬 단위)·Broker·Consumer Group·Offset. 불변 로그 + 오프셋 재생
7. **MSK** — Kafka 매니지드. IAM/SASL-SCRAM/mTLS 인증. ZooKeeper→KRaft(Raft 합의)
8. **MSK Serverless/Connect** — 사이징 없는 Serverless, Kafka Connect 매니지드(Debezium CDC)
9. **MSK vs Kinesis** — Kafka 표준·이식성·생태계 vs 단순·AWS 네이티브. "기존 Kafka"는 MSK

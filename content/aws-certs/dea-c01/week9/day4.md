# Day 4 - 데이터 거버넌스: 카탈로그·계보·공유·감사

데이터 거버넌스는 "데이터를 어떻게 찾고, 신뢰하고, 공유하고, 추적하는가"를 다룹니다. 오늘은 데이터 카탈로그와 계보(lineage), 안전한 데이터 공유(Data Exchange/Clean Rooms), 그리고 모든 활동을 추적하는 감사(CloudTrail)를 살펴봅니다.

## 1. 데이터 카탈로그

데이터 카탈로그는 데이터 자산의 메타데이터(스키마·위치·소유자·태그)를 중앙에서 관리하는 단일 진실 공급원입니다.

- **AWS Glue Data Catalog**: 데이터베이스/테이블/파티션 메타데이터 저장. Athena·Redshift Spectrum·EMR·Glue가 공유.
- **크롤러**: S3 등을 스캔해 스키마를 자동 추론·등록.
- **Glue Schema Registry**: 스트리밍(Kafka/Kinesis) 스키마 버전·호환성 관리.
- **검색·발견**: 분석가가 필요한 데이터를 찾는 출발점.

```text
[S3 데이터] --크롤러--> [Glue Data Catalog: 테이블/스키마/파티션]
                              ↑ 공유
        [Athena] [Redshift Spectrum] [EMR] [Glue ETL]
```

> 💡 **관련 이론**: 카탈로그가 없으면 같은 데이터에 엔진마다 다른 스키마를 정의해 불일치가 생깁니다. Glue Data Catalog를 공유하면 "한 번 정의, 모든 엔진 사용"으로 일관성을 확보합니다.

## 2. 데이터 계보 (Lineage)

데이터 계보는 데이터가 어디서 와서 어떤 변환을 거쳐 어디로 갔는지 추적하는 기록입니다.

- **목적**: 영향 분석(이 컬럼을 바꾸면 어떤 리포트가 깨지나?), 근본 원인 분석(이 값은 어디서 왔나?), 규정 감사.
- **AWS 구현**: Glue ETL 작업 메타데이터, SparkUI/잡 로그, 그리고 데이터 거버넌스 카탈로그(예: DataZone/SageMaker Catalog)에서 자산 간 관계를 시각화.
- **수집 계보**: 소스 → ETL → 타깃 테이블 → BI 대시보드의 흐름을 기록.

계보를 유지하면 "이 매출 수치의 원천 테이블과 변환 단계"를 추적해 신뢰성을 입증할 수 있습니다.

## 3. 데이터 공유: Data Exchange와 Clean Rooms

조직 내부/외부와 데이터를 안전하게 공유하는 두 가지 대표 서비스:

### AWS Data Exchange
- 서드파티 데이터셋을 구독하거나, 자체 데이터를 라이선스로 게시하는 데이터 마켓플레이스.
- 데이터를 복사해 구독자 계정으로 전달(파일/API/Redshift/S3).

### AWS Clean Rooms
- 여러 당사자가 **원본 데이터를 서로 노출하지 않고** 공동 분석.
- 분석 규칙(허용 쿼리·집계·차등 프라이버시)을 사전 합의해 협업.
- 광고 측정·금융 협업처럼 데이터 공유가 민감한 경우에 적합.

### Lake Formation / Redshift 데이터 공유
- **Lake Formation 교차 계정 공유**(RAM 기반)로 카탈로그 리소스 공유.
- **Redshift 데이터 공유(datashare)**로 클러스터 간 라이브 공유(복사 없음).

```text
당사자 A 데이터 ┐
                ├──> [Clean Rooms 협업: 합의된 집계 쿼리만] ──> 결과만 반환
당사자 B 데이터 ┘     (원본은 서로 못 봄)
```

> 💡 **관련 이론**: Data Exchange는 "데이터를 건네주는" 모델, Clean Rooms는 "데이터를 건네지 않고 합산 결과만 얻는" 모델입니다. 원본 노출 없이 협업해야 하면 Clean Rooms가 정답입니다.

## 4. 감사: CloudTrail과 로깅

감사는 "누가 언제 무엇을 했는가"를 추적해 보안·규정 준수를 입증합니다.

- **AWS CloudTrail**: 모든 AWS API 호출(관리 이벤트)을 기록. 누가 S3 정책을 바꿨는지, 누가 KMS 키를 썼는지 추적.
- **CloudTrail 데이터 이벤트**: S3 객체 GetObject/PutObject 같은 데이터 평면 활동을 세밀히 기록(옵션).
- **S3 액세스 로그 / Lake Formation 감사**: 데이터 접근 기록.
- **CloudTrail Lake**: 이벤트를 저장·SQL 분석.
- **Security Hub**: 다수 보안 발견을 집계.

```text
{
  "eventName": "GetObject",
  "userIdentity": { "arn": "arn:aws:iam::111122223333:role/RegionAnalyst" },
  "requestParameters": { "bucketName": "lake-curated", "key": "sales/dt=2026-06-25/part-0.parquet" },
  "eventTime": "2026-06-25T09:14:02Z"
}
```

위 CloudTrail 데이터 이벤트는 특정 역할이 언제 어떤 객체를 읽었는지 보여줍니다.

> 💡 **관련 이론**: CloudTrail 관리 이벤트는 기본 기록되지만, S3 객체 수준 접근(데이터 이벤트)은 비용 때문에 기본 비활성입니다. 민감 버킷 감사가 필요하면 데이터 이벤트 로깅을 명시적으로 켜야 합니다.

## 5. 거버넌스 통합

견고한 거버넌스는 네 요소가 맞물립니다.

```text
[카탈로그] 찾기 → [계보] 신뢰 → [공유] 협업 → [감사] 추적
   Glue        Lineage      Clean Rooms     CloudTrail
   Catalog                  /Data Exchange
```

한 축만 갖추면(예: 공유만 잘하고 감사가 없으면) 규정 위반·신뢰 상실 위험이 생깁니다.

## 시험 포인트 요약

- Glue Data Catalog는 엔진 공유 메타데이터, 크롤러로 스키마 자동 등록, Schema Registry는 스트리밍 스키마.
- 계보는 영향/근본 원인 분석·감사 목적. 소스→ETL→타깃→BI 추적.
- Data Exchange(데이터 전달/마켓플레이스) vs Clean Rooms(원본 비노출 공동 분석) 구분.
- Lake Formation 교차 계정 공유(RAM), Redshift datashare(복사 없는 라이브 공유).
- CloudTrail: 관리 이벤트(기본) vs 데이터 이벤트(S3 객체, 옵션·과금). 민감 버킷은 데이터 이벤트 활성.

## 📝 연습 문제

**문제 1.** 두 회사가 광고 효과를 공동 측정하려 하지만, 서로의 고객 원본 데이터는 절대 노출할 수 없다. 합의된 집계 쿼리 결과만 공유하려면?

A) AWS Data Exchange로 데이터셋 교환  
B) S3 교차 계정 버킷 정책으로 원본 공유  
C) Redshift 스냅샷 공유  
D) AWS Clean Rooms로 협업  

**정답: D**  
해설: Clean Rooms는 당사자들이 원본을 서로 노출하지 않고 사전 합의된 분석 규칙으로 집계 결과만 얻는 공동 분석 서비스입니다. Data Exchange·버킷 공유·스냅샷 공유는 모두 원본 데이터를 상대에게 전달하므로 요건에 맞지 않습니다.

---

**문제 2.** 한 매출 컬럼의 정의를 변경하기 전에, 그 컬럼이 어떤 다운스트림 리포트와 테이블에 영향을 주는지 파악하려 한다. 가장 도움이 되는 거버넌스 기능은?

A) 데이터 계보(lineage)  
B) S3 수명주기 정책  
C) KMS 키 교체  
D) 파티션 프로젝션  

**정답: A**  
해설: 데이터 계보는 소스→변환→타깃→BI의 흐름을 기록해 영향 분석(어떤 다운스트림이 깨지는지)을 가능하게 합니다. 수명주기·키 교체·파티션 프로젝션은 영향 추적과 무관합니다.

---

**문제 3.** Athena, Redshift Spectrum, EMR이 동일 S3 데이터에 대해 서로 다른 스키마를 정의해 결과가 불일치한다. 단일 진실 공급원을 제공하는 해결책은?

A) 각 엔진에 별도 스키마 유지  
B) 데이터를 CSV로 통일  
C) 버킷마다 다른 KMS 키 적용  
D) 공유 Glue Data Catalog 사용  

**정답: D**  
해설: Glue Data Catalog를 공유하면 테이블/스키마를 한 번 정의해 Athena·Spectrum·EMR·Glue가 동일 메타데이터를 사용하므로 불일치가 사라집니다. 별도 스키마 유지는 문제의 원인이고, CSV 통일·KMS는 스키마 일관성과 무관합니다.

---

**문제 4.** 감사팀이 "지난주 누가 민감 S3 버킷의 어떤 객체를 읽었는지" 알고자 한다. 그러나 CloudTrail에는 관리 이벤트만 보인다. 필요한 조치는?

A) S3 버전 관리 활성화  
B) CloudTrail 데이터 이벤트(S3 객체 수준) 로깅 활성화  
C) Macie 분류 작업 실행  
D) IAM 정책에 Deny 추가  

**정답: B**  
해설: S3 객체 수준 접근(GetObject 등)은 CloudTrail 데이터 이벤트로 기록되며 비용 때문에 기본 비활성이므로 명시적으로 켜야 추적됩니다. 버전 관리는 변경 이력, Macie는 탐지, Deny는 차단으로 접근 감사 로그를 만들지 않습니다.

---

**문제 5.** 서드파티 시장 조사 데이터셋을 정기적으로 받아 분석 파이프라인에 통합하려 한다. 가장 적절한 AWS 서비스는?

A) AWS Clean Rooms  
B) AWS Glue Schema Registry  
C) AWS Data Exchange  
D) AWS CloudTrail Lake  

**정답: C**  
해설: AWS Data Exchange는 서드파티 데이터셋을 구독해 S3/API/Redshift로 정기 수신할 수 있는 데이터 마켓플레이스입니다. Clean Rooms는 원본 비노출 공동 분석, Schema Registry는 스트리밍 스키마, CloudTrail Lake는 감사 이벤트 분석용입니다.

---

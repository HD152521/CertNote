# Day 1 - 배치 수집: S3 업로드, DataSync, Transfer Family, Snow

데이터 엔지니어링의 첫 단추는 언제나 "데이터를 어디서, 어떻게 가져오느냐"다. 분석 파이프라인이 아무리 화려해도 원천 데이터가 안정적으로 들어오지 않으면 전부 멈춘다. Week 2는 이 수집(ingestion)을 배치와 스트리밍으로 나눠 다루는데, 오늘은 그중 배치 수집을 본다.

배치 수집은 "정해진 단위(파일·테이블·시간)로 모아서 한꺼번에" 가져오는 방식이다. 실시간성이 필요 없는 야간 적재, 온프레미스 마이그레이션, 대용량 일괄 전송이 여기 속한다. AWS는 데이터의 양과 위치, 네트워크 상황에 따라 서로 다른 도구를 제공한다. 오늘 다룰 4가지는 S3 업로드 패턴, DataSync, Transfer Family, Snow 패밀리다.

## S3는 데이터 레이크의 착륙장이다

대부분의 AWS 분석 파이프라인에서 데이터가 처음 도착하는 곳은 S3다. S3는 사실상 무제한 용량, 11 9's 내구성, 그리고 Athena·Glue·Redshift Spectrum·EMR이 모두 직접 읽을 수 있는 공통 저장소이기 때문이다. 그래서 "배치 수집 = 어떻게든 S3에 파일을 안전하게 올리기"로 단순화해도 크게 틀리지 않는다.

작은 파일은 단순 PutObject로 충분하지만, 큰 파일(수백 MB 이상)은 **멀티파트 업로드(Multipart Upload)** 를 써야 한다. 파일을 여러 조각으로 나눠 병렬 전송하고, 한 조각이 실패해도 그 조각만 재전송하면 되므로 대용량 전송이 빠르고 견고해진다.

```bash
# 작은 파일: 단순 업로드
aws s3 cp sales-2026-06.csv s3://my-data-lake/raw/sales/

# 큰 파일: CLI가 임계값(기본 8MB)을 넘으면 자동으로 멀티파트로 전환
aws s3 cp huge-dataset.parquet s3://my-data-lake/raw/events/ \
    --expected-size 5368709120

# 멀티파트 임계값/동시성 튜닝 (대량 전송 가속)
aws configure set s3.multipart_threshold 64MB
aws configure set s3.max_concurrent_requests 20
```

> 💡 **관련 이론**: 멀티파트 업로드를 시작했다가 완료(CompleteMultipartUpload)하지 않으면 업로드된 조각이 S3에 남아 보이지 않는 스토리지 비용을 발생시킨다. 이를 막기 위해 S3 Lifecycle 규칙에 `AbortIncompleteMultipartUpload`를 설정해 N일 후 미완료 조각을 자동 삭제하는 것이 베스트 프랙티스다. 시험은 "원인 모를 S3 비용 증가" 시나리오로 이를 자주 묻는다.

S3에 도착하는 순간 이벤트를 발생시켜 다운스트림을 트리거할 수도 있다. **S3 Event Notification**이 객체 생성 이벤트를 Lambda·SQS·SNS·EventBridge로 보내, "파일이 들어오면 바로 Glue 잡 실행" 같은 이벤트 드리븐 배치를 만든다.

```json
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "arn:aws:lambda:ap-northeast-2:123456789012:function:trigger-glue-job",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": { "FilterRules": [{ "Name": "prefix", "Value": "raw/sales/" }] }
      }
    }
  ]
}
```

## DataSync: 온프레미스 ↔ AWS 대량 파일 전송 자동화

온프레미스 NAS나 파일 서버에 쌓인 수 TB의 데이터를 S3·EFS·FSx로 옮기는 일은 손으로 하면 끔찍하다. **AWS DataSync**는 이 작업을 자동화·가속하는 관리형 전송 서비스다. 온프레미스에 에이전트(VM)를 두고, AWS와의 사이에서 데이터를 멀티스레드로 전송하며, 전송 중·후에 **체크섬으로 무결성을 검증**한다.

DataSync의 핵심 가치는 단발성 복사가 아니라 **반복 가능한 스케줄 동기화**다. 매일 밤 변경된 파일만 증분 전송하도록 예약할 수 있어, 온프레미스에서 데이터 레이크로의 지속적 피드 파이프라인을 만든다.

```bash
aws datasync create-task \
    --source-location-arn arn:aws:datasync:...:location/loc-onprem-nas \
    --destination-location-arn arn:aws:datasync:...:location/loc-s3-lake \
    --options '{"VerifyMode":"POINT_IN_TIME_CONSISTENT","PreserveDeletedFiles":"PRESERVE"}' \
    --schedule '{"ScheduleExpression":"cron(0 2 * * ? *)"}'
```

> 💡 **관련 이론**: DataSync vs S3 단순 CLI 업로드의 구분이 시험 포인트다. 일회성 소량이면 CLI/SDK로 충분하지만, ① 대량(TB+) ② 반복 스케줄 ③ 무결성 검증 ④ 메타데이터(권한·타임스탬프) 보존이 필요하면 DataSync가 정답이다. DataSync는 네트워크 대역폭을 사용하므로 충분한 회선이 있을 때 적합하고, 회선이 부족하거나 페타바이트급이면 Snow 패밀리로 넘어간다.

## Transfer Family: 기존 SFTP/FTPS 워크플로를 S3로

수많은 기업·파트너 시스템은 여전히 **SFTP/FTPS/FTP**로 파일을 주고받는다. 이 레거시 프로토콜을 유지하면서 저장소만 S3로 바꾸고 싶을 때 쓰는 것이 **AWS Transfer Family**다. 외부 파트너는 평소처럼 SFTP로 파일을 올리지만, 그 파일은 실제로는 곧장 S3 버킷(또는 EFS)에 저장된다.

핵심은 "파트너의 클라이언트와 인증 방식은 그대로 두고, 백엔드만 S3로 교체"한다는 점이다. 기존 EDI·B2B 파일 교환을 코드 변경 없이 데이터 레이크에 연결할 수 있다.

```bash
aws transfer create-server \
    --protocols SFTP \
    --endpoint-type VPC \
    --identity-provider-type SERVICE_MANAGED \
    --domain S3
```

DataSync가 "내가 AWS로 끌어오는(pull/push) 대량 동기화"라면, Transfer Family는 "외부가 정해진 프로토콜로 밀어 넣는(receive) 게이트웨이"다. 방향과 주체가 다르다.

## Snow 패밀리: 네트워크로는 답이 없을 때

데이터가 페타바이트급이거나, 전송 회선이 느려서 인터넷으로 옮기면 몇 달이 걸린다면? 물리 장비에 데이터를 담아 AWS로 배송하는 **Snow 패밀리**가 답이다.

| 서비스 | 용량 | 용도 |
|--------|------|------|
| Snowcone | ~8TB(SSD) | 소형·엣지·이동 환경 |
| Snowball Edge | ~80TB | 대량 마이그레이션, 엣지 컴퓨팅 |
| Snowmobile | ~100PB | (사실상 단종) 초대형 데이터센터 이전 |

장비를 받아 데이터를 채운 뒤 반송하면 AWS가 S3로 적재한다. 전송 중에는 256비트 암호화로 보호된다.

> 💡 **관련 이론**: "회선 vs 물리 배송"의 손익분기는 데이터양과 대역폭의 함수다. 대략 10TB를 100Mbps 회선으로 보내면 약 12일이 걸린다. 같은 데이터를 Snowball로 보내면 배송 왕복 약 1주일에 회선도 점유하지 않는다. 시험에서 "느린 회선 + 대용량 + 일회성 마이그레이션" 키워드가 보이면 거의 항상 Snow 패밀리가 정답이다. 반대로 "지속적·반복적 동기화 + 충분한 회선"이면 DataSync다.

## 정리: 무엇을 언제 쓰나

- **소량·단발 → S3 CLI/SDK** (멀티파트 + Lifecycle abort 규칙)
- **대량·반복·검증 필요 → DataSync** (스케줄 증분 동기화)
- **외부 파트너가 SFTP/FTPS로 밀어넣음 → Transfer Family**
- **페타바이트급·느린 회선·일회성 → Snow 패밀리**

이 네 가지 선택지의 경계를 키워드로 구분하는 능력이 DEA-C01 수집 도메인의 기본기다.

## 📝 연습 문제

**문제 1.** 온프레미스 NAS에 있는 30TB의 데이터를 매일 밤 변경분만 S3로 자동 동기화하고, 전송 무결성 검증과 파일 메타데이터 보존이 필요하다. 가장 적절한 서비스는?

A) AWS DataSync 스케줄 태스크  
B) AWS Snowball Edge를 매일 배송  
C) S3 단순 CLI 업로드 스크립트를 cron으로 실행  
D) AWS Transfer Family SFTP 서버  

**정답: A**  
해설: 대량·반복 스케줄·무결성 검증·메타데이터 보존이 모두 필요한 전형적 DataSync 시나리오다. CLI 스크립트는 증분·검증·메타데이터 보존을 직접 구현해야 해 취약하고, Snowball은 일회성 대량 마이그레이션용이라 매일 배송은 비현실적이다. Transfer Family는 외부가 프로토콜로 밀어넣는 게이트웨이로 방향이 맞지 않는다.

---

**문제 2.** 외부 파트너사들이 오랫동안 SFTP 클라이언트로 파일을 전송해 왔다. 이 워크플로를 그대로 유지하면서 수신 파일을 곧바로 S3 데이터 레이크에 저장하려 한다. 코드 변경을 최소화하는 방법은?

A) 파트너에게 AWS SDK로 PutObject를 직접 호출하도록 요청  
B) AWS Transfer Family로 SFTP 서버를 만들고 백엔드를 S3로 지정  
C) DataSync 에이전트를 파트너사에 설치  
D) Snowcone을 파트너사에 배송  

**정답: B**  
해설: Transfer Family는 기존 SFTP/FTPS/FTP 인증과 클라이언트를 그대로 두고 백엔드 저장소만 S3/EFS로 교체하는 관리형 게이트웨이다. 파트너 측 변경이 없다. SDK 직접 호출은 파트너 시스템 전면 개편을 요구하고, DataSync/Snow는 외부가 표준 프로토콜로 밀어넣는 수신 패턴이 아니다.

---

**문제 3.** 100Mbps 회선만 있는 데이터센터에서 80TB의 아카이브를 일회성으로 AWS S3로 마이그레이션해야 한다. 가장 빠르고 회선을 점유하지 않는 방법은?

A) DataSync로 야간마다 증분 전송  
B) S3 멀티파트 업로드 병렬 실행  
C) AWS Snowball Edge 장비로 데이터를 담아 배송  
D) Transfer Family로 SFTP 업로드  

**정답: C**  
해설: 느린 회선 + 대용량(80TB) + 일회성 마이그레이션은 Snow 패밀리의 정석 시나리오다. 100Mbps로 80TB를 보내면 이론상 수십 일이 걸리고 그동안 회선을 점유한다. Snowball Edge는 80TB급 용량을 물리 배송으로 처리해 회선과 무관하게 약 1주일에 완료한다. DataSync·멀티파트·SFTP는 모두 같은 느린 회선을 사용한다.

---

**문제 4.** S3 비용 청구서에 어떤 객체로도 보이지 않는 정체불명의 스토리지 요금이 꾸준히 발생한다. 대용량 파일 업로드 자동화 직후부터 시작됐다. 가장 가능성 높은 원인과 해결책은?

A) 버전 관리가 켜져 있음 — 버전 관리 비활성화  
B) 복제 규칙 오류 — 복제 비활성화  
C) 잘못된 스토리지 클래스 — Glacier로 전환  
D) 미완료 멀티파트 업로드 조각이 남음 — Lifecycle의 AbortIncompleteMultipartUpload 설정  

**정답: D**  
해설: 멀티파트 업로드를 완료하지 못하면 업로드된 조각이 객체 목록에는 안 보이지만 스토리지로 과금된다. Lifecycle 규칙에 AbortIncompleteMultipartUpload를 넣어 N일 후 자동 정리하는 것이 표준 해결책이다. 버전·스토리지 클래스·복제는 모두 객체로 보이므로 "보이지 않는" 비용의 원인이 아니다.

---

**문제 5.** S3 raw/sales/ 경로에 파일이 도착하는 즉시 Glue 변환 잡을 자동 실행하는 이벤트 드리븐 배치를 구성하려 한다. 가장 적절한 방법은?

A) S3 Event Notification으로 prefix 필터를 걸어 Lambda를 트리거하고 Glue 잡 실행  
B) Glue 잡을 1분마다 폴링하는 cron 설정  
C) DataSync 태스크에 Glue를 연결  
D) Transfer Family 이벤트로 직접 Redshift 적재  

**정답: A**  
해설: S3 Event Notification은 ObjectCreated 이벤트를 prefix/suffix 필터와 함께 Lambda·SQS·SNS·EventBridge로 보내 이벤트 드리븐 파이프라인을 만든다. raw/sales/ prefix 필터로 해당 경로만 트리거할 수 있다. 1분 폴링은 지연·비효율적이고, DataSync/Transfer Family는 Glue 잡을 직접 트리거하는 용도가 아니다.

---

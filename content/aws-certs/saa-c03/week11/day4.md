# Day 4 - 마이그레이션은 왜 "무엇을 옮기는가"보다 "어떻게 옮길 수 없는가"로 결정되나

클라우드 마이그레이션 도구를 처음 보면 DMS·SCT·Snow Family·DataSync·MGN이 비슷비슷한 "옮기는 도구"로 뭉뚱그려진다. 하지만 이들을 가르는 진짜 축은 "무엇을 옮기느냐(DB·서버·파일)"가 아니라 **"옮기는 과정에서 무엇이 발목을 잡느냐"**다. 데이터베이스 마이그레이션의 적은 **다운타임**이고, 대용량 파일 마이그레이션의 적은 **네트워크 대역폭**이며, 서버 마이그레이션의 적은 **이식 중 상태 불일치**다. 각 도구는 이 특정 제약을 푸는 데 특화돼 있다. SAA 시험이 마이그레이션을 끝없이 변주해 묻는 이유도, 시나리오의 "제약 키워드"를 읽고 맞는 도구를 고르는 능력이 곧 아키텍트의 판단력이기 때문이다.

이 글은 마이그레이션 전략의 큰 그림(7R)에서 시작해, 각 도구가 어떤 제약을 어떻게 푸는지 — DMS의 CDC가 어떻게 무중단 전환을 만드는지, Snow와 DataSync를 가르는 네트워크 손익분기점은 어디인지, MGN과 DRS가 같은 블록 복제를 쓰면서도 왜 다른 서비스인지 — 를 내부 동작으로 따라간다.

## 7R: 옮기기 전에 "옮길 가치가 있는가"를 먼저 묻는다

AWS의 마이그레이션 전략은 **7R**로 정리된다 — Retire(폐기), Retain(유지), Relocate(이전), Rehost(재호스팅), Repurchase(재구매), Replatform(재플랫폼), Refactor(재설계). 이 순서가 중요한 건, 가장 좋은 마이그레이션이 종종 **아예 옮기지 않는 것**이기 때문이다. 더 이상 쓰지 않는 시스템은 Retire하고, 규제·기술 제약으로 온프레에 남겨야 할 건 Retain한다. 옮긴다면 가장 단순한 Rehost(lift-and-shift, 그대로 들어 옮기기)부터 시작해, 약간 손보는 Replatform(예: DB를 관리형 RDS로), 전면 재작성하는 Refactor로 갈수록 노력과 위험이 커진다.

> 💡 **관련 이론**: 7R은 소프트웨어 진화에서 **기술 부채(technical debt)**를 다루는 의사결정 프레임이다. lift-and-shift(Rehost)는 부채를 그대로 들고 클라우드로 옮기는 것 — 빠르지만 비효율을 함께 가져온다. Refactor는 부채를 갚으며 옮기는 것 — 클라우드 네이티브의 이점(서버리스·관리형·자동 확장)을 얻지만 비싸고 위험하다. 현실의 대규모 마이그레이션은 거의 **단계적 접근**을 쓴다 — 먼저 Rehost로 데이터센터를 빠르게 비우고(시간·계약 압박 해소), 클라우드에 올라온 뒤 가치가 큰 시스템부터 점진적으로 Refactor한다. "한 번에 완벽하게"보다 "일단 옮기고 반복 개선"이 위험을 줄이는 진화적 전략이다. SAA는 보통 "다운타임 최소 + 노력 최소"라는 조건으로 Rehost·Replatform 쪽을 정답으로 낸다.

## DMS: 다운타임이라는 적을 CDC로 무력화한다

데이터베이스 마이그레이션의 진짜 어려움은 데이터 복사 자체가 아니라 **복사하는 동안에도 원본이 계속 변한다**는 점이다. 수백 GB를 복사하는 몇 시간 동안 운영 DB를 멈출 수는 없으니, 복사가 끝나면 그 사이 쌓인 변경분을 따라잡아야 한다. **DMS(Database Migration Service)**는 이를 **Full Load + CDC(Change Data Capture)**로 푼다. 먼저 현재 데이터를 통째로 복사(Full Load)하고, 그 사이와 이후의 변경을 원본 DB의 트랜잭션 로그에서 읽어 지속적으로 대상에 적용(CDC)한다. 원본과 대상이 거의 실시간으로 동기화된 상태가 되면, 그 순간 애플리케이션 연결만 대상으로 전환하면 된다 — 다운타임이 수 분 이내로 줄어든다.

DMS는 두 종류의 마이그레이션을 다룬다. **Homogeneous(같은 엔진)** — Oracle→Oracle, MySQL→MySQL은 스키마가 그대로라 DMS만으로 충분하다. **Heterogeneous(다른 엔진)** — Oracle→Aurora PostgreSQL처럼 엔진이 바뀌면, 테이블 구조·저장 프로시저·데이터 타입이 호환되지 않으므로 **SCT(Schema Conversion Tool)**로 먼저 스키마와 코드를 변환한 뒤 DMS로 데이터를 옮긴다.

> 🔍 **더 깊이**: CDC가 "원본 DB에 부하를 거의 주지 않으면서" 변경을 잡아내는 비결은 **트랜잭션 로그를 읽는다**는 점이다. 관계형 DB는 모든 변경을 커밋 전에 로그(Oracle의 redo log, MySQL의 binlog, PostgreSQL의 WAL)에 먼저 쓰는데, 이는 장애 복구를 위한 것이다. CDC는 이 이미 존재하는 로그를 꼬리부터 읽어 INSERT/UPDATE/DELETE를 재구성하므로, 원본 테이블에 무거운 쿼리를 날리지 않고도 변경을 추적한다. 이는 RDS Read Replica나 Kafka 기반 이벤트 소싱이 쓰는 것과 같은 **로그 기반 복제(log-based replication)** 원리다. 그래서 DMS로 CDC를 쓰려면 원본 DB에서 로그(binlog/WAL 등)를 활성화하고 보존 기간을 충분히 둬야 한다 — 이걸 안 하면 Full Load는 되지만 CDC가 변경을 따라잡지 못한다. SCT의 변환 불가 항목(엔진 고유 기능)은 보고서로 남겨 수동 재작성하게 하는데, 이 수동 작업량이 Heterogeneous 마이그레이션의 진짜 비용이다.

> 📚 **사례**: Amazon 내부적으로 2018~2019년에 걸쳐 수천 개의 Oracle 데이터베이스를 Aurora·DynamoDB·RDS로 옮긴 "Oracle 탈출" 프로젝트가 유명하다. 핵심은 단순 lift가 아니라 워크로드별로 맞는 엔진을 골라(관계형은 Aurora, 키-값은 DynamoDB) SCT로 스키마를 변환하고 DMS로 데이터를 옮긴 것이다. 교훈은 두 가지다. 첫째, 대규모 Heterogeneous 마이그레이션의 비용 대부분은 데이터 이동이 아니라 **저장 프로시저·트리거·엔진 고유 SQL의 재작성**에 들어간다 — Oracle PL/SQL을 PostgreSQL PL/pgSQL로 옮기는 수작업이 병목이었다. 둘째, "DB 엔진 종속(lock-in)을 끊는" 것 자체가 장기 비용·라이선스를 크게 줄이는 전략적 가치가 있었다. 시험에서 "Oracle→Aurora PostgreSQL, 다운타임 최소"가 보이면 SCT + DMS(Full Load + CDC)가 반사적 정답이다.

## Snow vs DataSync: 네트워크 대역폭이라는 물리 법칙

대용량 데이터를 옮길 때의 적은 **네트워크**다. 여기엔 피할 수 없는 산수가 있다 — 데이터량과 가용 대역폭이 전송 시간을 결정하고, 어떤 시점을 넘으면 **데이터를 물리적으로 트럭에 실어 보내는 게 인터넷으로 보내는 것보다 빠르다**. 100TB를 100Mbps 회선으로 보내면 이론상 90일이 넘게 걸린다(실효 대역폭은 더 낮다). 같은 데이터를 Snowball에 담아 택배로 보내면 며칠이면 된다. 이 손익분기점이 Snow와 DataSync를 가르는 경계다.

**DataSync**는 **네트워크가 충분할 때**의 온라인 전송 도구다. NFS·SMB·HDFS·S3·기타 오브젝트 스토리지를 소스로, S3·EFS·FSx를 대상으로 파일을 옮기고 복제한다 — 자동 스케줄링, 전송 후 무결성 검증, 대역폭 제한(운영 시간엔 회선을 덜 먹게)까지 갖췄다. 한 번의 마이그레이션뿐 아니라 지속적 동기화에도 쓴다.

**Snow Family**는 **네트워크가 부족하거나 없을 때**의 오프라인 전송 도구다. AWS가 물리 장비를 보내 주면 거기에 데이터를 담아 AWS로 반송하면, AWS가 데이터센터에서 S3로 적재한다.

| 장비 | 용량 | 특징 |
|------|------|------|
| **Snowcone** | 약 8TB | 가장 작고 가벼움, 엣지·소량 |
| **Snowball Edge Storage Optimized** | 약 80TB | 페타급은 여러 대 클러스터 |
| **Snowball Edge Compute Optimized** | 컴퓨팅(EC2/GPU) 포함 | 연결 끊긴 엣지에서 처리까지 |
| **Snowmobile** | 최대 100PB(트럭) | 엑사바이트급 데이터센터 통째 이전 |

> ⚠️ **함정**: Snow vs DataSync는 **네트워크 가용성과 데이터량**으로 갈린다. "10TB + 네트워크 충분(예: 고대역폭 전용선)"이면 DataSync로 며칠 내 온라인 전송이 낫고, "10TB + 네트워크 부족/없음(원격지·저대역폭)"이면 Snowball이 답이다. 단순히 데이터가 크다고 무조건 Snow가 아니다 — Direct Connect 같은 고대역폭이 있으면 큰 데이터도 DataSync가 빠를 수 있다. 시나리오에서 **회선 속도와 데이터량을 곱해 전송 시간을 가늠**하는 게 핵심이고, "시간 안에 못 보낸다"가 보이면 Snow다.

> 🔍 **더 깊이**: Snowball Edge는 단순 저장 상자가 아니다 — **Compute Optimized** 모델은 내부에 EC2·Lambda·심지어 GPU를 품어, **연결이 끊긴 환경에서 데이터를 처리까지** 한다. 선박·유전·군사 기지·재난 현장처럼 인터넷이 없거나 불안정한 곳에서 센서 데이터를 현장에서 전처리·추론한 뒤, 결과만(또는 전체를) AWS로 반송하는 엣지 컴퓨팅 시나리오다. 또 모든 Snow 장비는 **하드웨어 암호화(전송 중·저장 중)**가 기본이고, 키는 AWS KMS로 관리돼 장비를 운송 중 분실해도 데이터가 노출되지 않는다 — 물리적 운송이라는 특성상 도난·분실 위협을 암호화로 막는 설계다. Snowball은 "느린 네트워크"뿐 아니라 "네트워크가 아예 없는 곳"이라는 더 극단적 제약까지 푸는 도구다.

## MGN과 DRS: 같은 블록 복제, 다른 목적

서버를 통째로 옮기는 **MGN(Application Migration Service, 구 CloudEndure Migration)**은 소스 서버의 디스크를 **블록 레벨로 실시간 복제**해 AWS의 스테이징 영역에 보관하다가, 준비가 되면 그 데이터로 EC2 인스턴스를 부팅한다. OS·애플리케이션·설정을 그대로 들고 오는 **lift-and-shift(Rehost)**의 자동화 도구로, 수백 대 규모의 데이터센터를 코드 변경 없이 EC2로 옮길 때 쓴다.

여기서 혼동하기 쉬운 게 **DRS(Elastic Disaster Recovery)**다. 둘은 같은 CloudEndure 계보의 블록 레벨 실시간 복제 기술을 공유하지만 **목적이 정반대**다 — MGN은 **마이그레이션**용으로, 한 번 옮기고 나면 소스를 폐기한다(일회성, 컷오버). DRS는 **재해 복구**용으로, 소스를 계속 운영하면서 복제를 상시 유지하다가 장애 시에만 페일오버한다(지속적, 평상시 대기). "데이터센터를 AWS로 영구 이전"이면 MGN, "운영은 그대로 두고 DR 대비"면 DRS다.

> ⚠️ **함정**: MGN과 DRS, 그리고 DMS의 역할을 섞으면 안 된다. **DMS는 데이터베이스의 데이터**를 옮기고(스키마·테이블 단위, CDC), **MGN은 서버 전체**를 옮긴다(OS·디스크 블록 단위). DB만 옮길 거면 DMS가 맞고, DB가 올라간 서버를 통째로 옮길 거면 MGN이다. 또 Storage Gateway를 마이그레이션 도구로 착각하는 것도 흔한 실수다 — **Storage Gateway는 영구적 하이브리드 스토리지(온프레에서 클라우드를 확장 디스크처럼 쓰는 것)**이지 일회성 마이그레이션 도구가 아니다. 옮기고 끝낼 거면 DataSync, 온프레-클라우드를 영구히 잇는 캐시면 Storage Gateway다.

## 다른 클라우드의 마이그레이션 도구 비교

| 제약/대상 | AWS | Azure | GCP |
|-----------|-----|-------|-----|
| DB 마이그레이션 | DMS + SCT | Azure Database Migration Service | Database Migration Service |
| 서버 lift-and-shift | MGN | Azure Migrate | Migrate to Virtual Machines |
| 온라인 파일 전송 | DataSync | Azure File Sync / AzCopy | Storage Transfer Service |
| 오프라인 대용량 | Snowball / Snowmobile | Azure Data Box / Data Box Heavy | Transfer Appliance |

세 클라우드 모두 **"네트워크 대역폭의 물리 법칙"이라는 같은 문제**를 같은 방식으로 푼다 — 온라인 전송 도구와 오프라인 물리 장비(Data Box, Transfer Appliance)를 짝으로 제공한다. 이는 마이그레이션의 핵심 제약이 클라우드 종류가 아니라 물리(빛의 속도, 회선 용량)에서 온다는 방증이다. CDC 기반 무중단 DB 마이그레이션, 블록 복제 기반 서버 lift-and-shift도 세 클라우드가 거의 동일한 패턴을 쓴다 — 도구 이름만 다를 뿐 풀어야 할 제약은 같다.

## CLI로 직접 만져보기

```bash
# DMS Replication Instance 생성
aws dms create-replication-instance \
  --replication-instance-identifier saa-dms \
  --replication-instance-class dms.t3.medium --allocated-storage 50

# DMS Task: Full Load + CDC (무중단 전환)
aws dms create-replication-task \
  --replication-task-identifier orders-migration \
  --source-endpoint-arn arn:... --target-endpoint-arn arn:... \
  --migration-type full-load-and-cdc \
  --table-mappings file://mappings.json

# DataSync Task: 온프레 NFS → S3 (대역폭 제한 포함)
aws datasync create-task --source-location-arn arn:... \
  --destination-location-arn arn:... --name saa-sync \
  --options BytesPerSecond=104857600

# Snowball Edge 작업 생성 (오프라인 대용량)
aws snowball create-job --job-type IMPORT \
  --snowball-type EDGE_S --resources S3Resources=... \
  --address-id ADID... --role-arn arn:... --kms-key-arn arn:...

# MGN 소스 서버 복제 상태 확인 (서버 lift-and-shift)
aws mgn describe-source-servers
```

## 정리하며

마이그레이션 도구 선택은 "무엇을 옮기나"가 아니라 **"무엇이 발목을 잡나"**로 결정된다. ① **7R**은 옮기기 전에 폐기·유지를 먼저 묻고, 단계적으로 Rehost→Replatform→Refactor로 위험을 관리한다. ② **DMS**는 다운타임이라는 적을 Full Load + CDC(로그 기반 복제)로 무력화하고, 엔진이 다르면 SCT로 스키마·코드를 먼저 변환하는데 그 수동 재작성이 진짜 비용이다. ③ **Snow vs DataSync**는 네트워크 대역폭이라는 물리 법칙으로 갈리고, 회선 속도×데이터량으로 전송 시간을 가늠해 손익분기점을 넘으면 오프라인(Snow), 안 넘으면 온라인(DataSync)이며, Snowball Edge Compute는 연결 끊긴 엣지의 처리까지 푼다. ④ **MGN과 DRS**는 같은 블록 복제를 쓰되 마이그레이션(일회성)과 DR(지속)로 목적이 갈리고, Storage Gateway는 마이그레이션이 아닌 영구 하이브리드다. 시험은 시나리오의 제약 키워드를 도구에 매핑하는 능력을 묻는다.

다음 글에서는 이번 주의 복원력·DR·마이그레이션을 종합해, 실제 시험에 나오는 복합 시나리오 문제들로 키워드 매핑을 굳힌다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 온프레미스 Oracle 데이터베이스를 Aurora PostgreSQL로 옮기되, 마이그레이션 중 다운타임을 수 분 이내로 최소화하려 한다. 가장 적절한 접근은?

A) DMS Full Load + CDC, SCT로 스키마 선변환
B) Snowball에 DB 백업을 담아 전송
C) DataSync로 데이터 파일 복사
D) MGN으로 서버 전체 lift-and-shift

**정답: A**

해설: Oracle→Aurora PostgreSQL은 엔진이 다른 Heterogeneous 마이그레이션이라 SCT로 스키마·저장 프로시저를 먼저 변환하고, DMS의 Full Load + CDC로 데이터를 옮기며 변경을 실시간 따라잡아 전환 순간 다운타임을 수 분으로 줄인다. Snowball(B)은 오프라인 대용량 전송용이고 DB 무중단 전환 메커니즘이 없으며, DataSync(C)는 파일 전송이지 DB 트랜잭션 일관성을 다루지 않고, MGN(D)은 서버 통째 lift라 엔진 변환(Oracle→PG)을 못 한다. "엔진 다름 + 다운타임 최소" = SCT + DMS(CDC).

---

**문제 2.** 한 연구소가 원격지(저대역폭 위성 회선)에 있는 100TB 데이터를 S3로 옮겨야 한다. 네트워크로는 수개월이 걸린다. 가장 적절한 방법은?

A) DataSync
B) DMS
C) Snowball Edge Storage Optimized
D) S3 Multipart Upload

**정답: C**

해설: 저대역폭에서 100TB를 온라인 전송하면 수개월이 걸리므로, 물리 장비에 담아 보내는 오프라인 전송(Snowball Edge Storage Optimized, 약 80TB/대, 페타급은 클러스터)이 답이다. DataSync(A)·Multipart Upload(D)는 네트워크를 타므로 회선이 병목이면 무의미하고, DMS(B)는 DB 마이그레이션 도구로 파일 대량 전송이 아니다. "큰 데이터 + 네트워크 부족/수개월 소요" = Snow. 회선 속도×데이터량으로 전송 시간을 가늠하는 게 핵심 판단이다.

---

**문제 3.** 한 회사가 온프레미스 NFS 파일 서버의 데이터를 S3로 **정기적으로 동기화**하려 하며, 전용선 대역폭은 충분하다. 적절한 도구는?

A) DataSync
B) Snowball
C) Storage Gateway(영구 캐시)
D) S3 Cross-Region Replication

**정답: A**

해설: 대역폭이 충분한 온라인 환경에서 NFS→S3를 스케줄 기반으로 동기화하고 전송 후 무결성 검증까지 하는 도구가 DataSync다. Snowball(B)은 네트워크가 부족할 때의 오프라인 도구라 불필요하고, Storage Gateway(C)는 일회성/정기 마이그레이션이 아니라 온프레-클라우드를 영구히 잇는 하이브리드 캐시이며, S3 CRR(D)은 S3 버킷 간 복제이지 온프레 NFS 소스를 다루지 않는다. "온라인 + 정기 파일 동기화" = DataSync.

---

**문제 4.** 한 기업이 데이터센터의 200대 가상 머신을 코드 변경 없이 AWS EC2로 영구 이전하려 한다. 가장 적절한 도구는?

A) DMS
B) AWS Application Migration Service (MGN)
C) DataSync
D) AWS Elastic Disaster Recovery (DRS)

**정답: B**

해설: 서버를 OS·애플리케이션째 코드 변경 없이 EC2로 옮기는 lift-and-shift(Rehost)의 자동화 도구가 MGN으로, 블록 레벨 실시간 복제 후 EC2로 부팅한다. DMS(A)는 DB 데이터만 옮기고, DataSync(C)는 파일 전송이며, DRS(D)는 같은 블록 복제를 쓰지만 목적이 재해 복구(소스를 계속 운영하며 대기)라 "영구 이전"과 다르다. MGN=일회성 마이그레이션, DRS=지속적 DR이 핵심 구분이다.

---

**문제 5.** 한 아키텍트가 MGN과 DRS의 차이를 설명하려 한다. 가장 정확한 설명은?

A) 둘 다 동일하며 이름만 다르다
B) MGN은 일회성 마이그레이션(컷오버 후 소스 폐기), DRS는 지속적 재해 복구(소스 운영 유지, 장애 시 페일오버)
C) MGN은 DB 전용, DRS는 서버 전용
D) MGN은 오프라인, DRS는 온라인

**정답: B**

해설: MGN과 DRS는 같은 CloudEndure 계보의 블록 레벨 실시간 복제를 공유하지만 목적이 정반대다 — MGN은 마이그레이션용으로 옮긴 뒤 소스를 폐기하는 일회성 컷오버이고, DRS는 재해 복구용으로 소스를 계속 운영하며 복제를 상시 유지하다 장애 시에만 페일오버한다. A는 목적 차이를 무시했고, C는 둘 다 서버 단위라 틀렸으며(DB 전용은 DMS), D는 둘 다 온라인 블록 복제다. "영구 이전=MGN, DR 대비=DRS".

---

**문제 6.** 한 팀이 인터넷이 닿지 않는 선박에서 센서 데이터를 **현장에서 전처리**한 뒤 나중에 AWS로 반송하려 한다. 적절한 장비는?

A) Snowcone(저장 전용)
B) Snowball Edge Compute Optimized
C) DataSync
D) Storage Gateway

**정답: B**

해설: Snowball Edge Compute Optimized는 내부에 EC2·Lambda·GPU를 품어 연결이 끊긴 환경에서 데이터를 처리(추론·전처리)까지 한 뒤 결과를 AWS로 반송하는 엣지 컴퓨팅 시나리오에 맞는다. Snowcone(A)은 작고 저장 위주라 무거운 현장 처리에는 한계가 있고, DataSync(C)·Storage Gateway(D)는 네트워크 연결을 전제로 하므로 "인터넷 없는 선박"에 부적합하다. "연결 끊긴 엣지 + 현장 처리" = Snowball Edge Compute.

---

**문제 7.** 한 회사가 DMS로 Oracle→Aurora 마이그레이션을 시작했는데, Full Load는 성공하지만 CDC가 원본의 변경을 따라잡지 못한다. 가장 가능성 높은 원인은?

A) Aurora가 CDC를 지원하지 않음
B) 원본 DB의 트랜잭션 로그(redo/binlog/WAL)가 비활성이거나 보존 기간이 너무 짧음
C) Replication Instance 용량이 큼
D) SCT를 사용하지 않음

**정답: B**

해설: DMS의 CDC는 원본 DB의 트랜잭션 로그(Oracle redo, MySQL binlog, PostgreSQL WAL)를 읽어 변경을 재구성하므로, 그 로그가 비활성이거나 보존 기간이 짧으면 변경을 추적·재생할 수 없다. 해결책은 원본에서 로그를 활성화하고 보존 기간을 충분히 늘리는 것이다. A는 사실과 반대(대상은 CDC 적용을 받는 쪽), C는 용량이 크면 오히려 유리하며, D는 SCT는 스키마 변환 도구로 CDC 동작 자체와 무관하다. CDC = 로그 기반 복제라는 원리를 알면 풀린다.

---

## 📌 핵심 요약

마이그레이션 도구는 "무엇을 옮기나"가 아니라 "무엇이 발목을 잡나"로 갈린다. 7R은 옮기기 전에 폐기·유지를 먼저 묻고 Rehost→Replatform→Refactor로 위험을 단계 관리한다. DMS는 다운타임을 Full Load + CDC(트랜잭션 로그 기반 복제)로 무력화하며, 엔진이 다르면 SCT로 스키마·저장 프로시저를 먼저 변환하는데 그 수동 재작성이 Heterogeneous의 진짜 비용이다(Amazon Oracle 탈출 사례). Snow vs DataSync는 네트워크 대역폭의 물리 법칙으로 갈려 회선×데이터량으로 전송 시간을 가늠하고, Snowball Edge Compute는 연결 끊긴 엣지의 현장 처리까지 푼다. MGN과 DRS는 같은 블록 복제를 쓰되 일회성 마이그레이션 vs 지속적 DR로 목적이 갈리고, Storage Gateway는 마이그레이션이 아닌 영구 하이브리드 캐시다. 시험은 시나리오의 제약 키워드를 도구에 매핑하는 능력을 묻는다.

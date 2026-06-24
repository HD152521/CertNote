# Day 3 - 도메인 3 종합: 마이그레이션·현대화 (20%) — 7R의 역사, 블록 복제·CDC의 내부 동작, 대역폭 수학, Strangler Fig 패턴

SAP-C02 도메인 3 "Migration and Modernization"은 비중 20%로, 본질은 "온프레미스나 타 클라우드의 워크로드를 어떻게 AWS로 옮기고(migration) 클라우드 네이티브로 현대화하느냐(modernization)"의 질문이다. AWS는 이를 **7R 프레임워크**로 정형화했고, 각 R마다 정해진 도구 셋과 내부 동작 원리가 있다. Pro 시험은 "이 시나리오는 어느 R이고, 어느 도구를 어떻게 조합하느냐"를 묻는다 — 단순 도구 이름 매핑을 넘어 대역폭 수학·복제 메커니즘·점진 분해 전략까지 이해해야 변형 문제를 푼다.

오늘은 도메인 3을 7R 결정 트리 + 도구 내부 동작 + 현대화 패턴 + 시나리오 매핑으로 깊이 정리한다.

## 7R 프레임워크 — 마이그레이션 전략의 역사와 결정 트리

7R의 뿌리는 2011년 Gartner의 분석가 Richard Watson이 제시한 **5R**(Rehost, Refactor, Revise, Rebuild, Replace)이다. AWS는 2016년 이를 **6R**로 다듬고(Retire·Retain·Rehost·Replatform·Repurchase·Refactor), 2021년 **Relocate**를 더해 **7R**로 확장했다. 핵심은 각 R이 "이전 비용 vs 클라우드 네이티브 가치"의 스펙트럼 위 한 점이라는 것이다.

| R | 의미 | 사용 시점 | 대표 도구 |
|---|------|-----------|----------|
| **Retire** | 폐기 | 사용 안 되는 시스템 발견 | Application Discovery Service |
| **Retain** | 일단 유지 | 미적합·우선순위 낮음·라이선스 묶임 | - |
| **Relocate** | 동일 환경 통째 이전 | VMware → VMware Cloud on AWS | VMware HCX |
| **Rehost** | Lift & Shift | 빠른 이전 + 코드 변경 최소 | **MGN** |
| **Replatform** | 일부 변경(lift-tinker-shift) | DB 엔진 유지 + 호스팅만 관리형 | DMS, Beanstalk, App2Container |
| **Repurchase** | 상용 SaaS로 교체 | 자체 ERP→Workday, CRM→Salesforce | AWS Marketplace |
| **Refactor** | 클라우드 네이티브 재설계 | 모놀리스→마이크로서비스·서버리스 | DMS+SCT, Lambda, ECS, Step Functions |

> 💡 **관련 이론**: 7R 선택은 **"비즈니스 가치 ÷ 마이그레이션 노력"의 최적화 문제**다. 왼쪽(Retire·Rehost)으로 갈수록 노력은 작지만 클라우드 가치도 작고(EC2를 데이터센터처럼 운영), 오른쪽(Refactor)으로 갈수록 노력·위험은 크지만 진정한 클라우드 네이티브(서버리스·오토스케일·관리형)를 얻는다. 클라우드 벤더별로 모델이 다르다 — Microsoft Azure는 5R(Rehost·Refactor·Rearchitect·Rebuild·Replace), Google Cloud는 자체 분류를 쓴다. AWS의 7R이 가장 세분화됐다. 시험 핵심 매핑: "Lift & Shift"=Rehost, "동일 DB 엔진 + RDS 이동"=Replatform, "모놀리스 분해"=Refactor, "VMware 그대로"=Relocate.

> 🔍 **더 깊이**: Pro 시험의 가장 중요한 통찰은 **"시간 제약이 있으면 Rehost 먼저, 클라우드 위에서 점진 최적화(then optimize)"**다. 데드라인이 짧으면 처음부터 Refactor를 시도하다 스키마 변환·앱 수정·테스트에 수개월이 걸려 실패한다. 대신 MGN으로 빠르게 Rehost해 데이터센터를 먼저 닫고, 클라우드에 올린 뒤 비즈니스 가치 높은 워크로드만 골라 Replatform·Refactor한다. 이것이 "lift-and-shift then modernize" 패턴이며, Capital One·GE 같은 대형 마이그레이션이 검증한 정석이다.

> 📚 **사례**: **GE의 클라우드 후퇴 vs Capital One의 성공**(2010년대 후반)이 7R 전략의 명암을 보여준다. GE는 9,000개 워크로드를 옮기겠다는 야심으로 시작했지만 거버넌스·우선순위 없이 무차별 이전해 상당수를 다시 온프레로 되돌렸다. 반면 Capital One은 2015~2020년 8년에 걸쳐 **초기엔 대부분 Rehost로 빠르게 옮기고**, 점진적으로 Replatform(Oracle→Aurora, 자체 ELB→ALB) → Refactor(모놀리스→마이크로서비스·Lambda)로 진화해 결국 자체 데이터센터를 전부 닫았다. 교훈: 한꺼번에 Refactor하지 말고 wave로 나눠 점진 진행하라.

## 도구 내부 동작 — MGN·DMS·DRS의 메커니즘

### MGN (Application Migration Service) — 블록 레벨 연속 복제

MGN은 온프레 서버에 **에이전트**를 설치해 디스크를 **블록 레벨로 지속 복제**한다. 핵심은 소스가 살아 운영되는 동안 백그라운드로 AWS staging 영역에 계속 동기화하다, cutover 순간에만 짧게 멈추고 EC2로 전환하는 것이다. 다운타임이 "마지막 델타 동기화 + 부팅"으로 압축된다(분 단위).

> 💡 **관련 이론**: MGN의 블록 레벨 연속 복제는 본질적으로 **비동기 복제 + CDP(Continuous Data Protection)**다. 원리상 DR 서비스인 **Elastic Disaster Recovery(DRS)**와 동일한 엔진(CloudEndure 인수 기반)을 쓴다 — MGN은 "한 번 옮기고 종료", DRS는 "계속 복제하며 DR 대기"라는 목적만 다를 뿐 기술은 형제다. 그래서 시험에서 "최소 다운타임 + OS 통째 이전·일회성"은 MGN, "지속 복제하며 재해 대기"는 DRS로 갈린다. 둘 다 OS·앱·데이터 전체(서버 단위)를 옮기지, 파일(DataSync)이나 DB 스키마(DMS)만 옮기는 게 아니다.

### DMS + SCT — CDC로 무중단 DB 이전

- **동종(homogeneous)**: Oracle→Oracle on RDS, MySQL→MySQL — DMS만으로
- **이기종(heterogeneous)**: Oracle→Aurora PostgreSQL, SQL Server→MySQL — **SCT로 스키마 변환** + **DMS로 데이터 이전**
- **CDC(Change Data Capture)**: 초기 풀 로드 + 지속 변경 캡처 → 무중단 cutover

> 🔍 **더 깊이**: DMS의 무중단 비결은 **CDC가 소스 DB의 트랜잭션 로그를 읽는 것**이다 — MySQL의 binlog, Oracle의 redo log, PostgreSQL의 WAL, SQL Server의 transaction log를 파싱해 변경(INSERT/UPDATE/DELETE)을 캡처한다. 이는 read replica처럼 가벼워 소스 DB 부하가 작다. 동작 순서: (1) Full Load로 기존 데이터를 통째 복사, (2) Full Load 중 발생한 변경을 캐시했다 적용, (3) 이후 CDC로 실시간 변경을 계속 적용해 양쪽을 동기 상태로 유지, (4) cutover 시점에 앱 트래픽을 새 DB로 전환하고 DMS 종료. 다운타임이 "트래픽 전환" 순간으로 압축된다. 함정: **동종 이전엔 SCT가 불필요**하다 — SCT는 SQL 방언·저장 프로시저 변환용이라 같은 엔진 간엔 쓸 일이 없다.

> 📚 **사례**: 한 핀테크가 Oracle Database Enterprise Edition(라이선스 연간 수억 원)에서 Aurora PostgreSQL로 이전했다. **SCT로 PL/SQL → PL/pgSQL 변환**(자동 70%, 수동 30% — SCT는 변환 불가 항목을 Assessment Report로 표시), **DMS CDC로 6개월간 양쪽 동기화**, 주말에 cutover. 결과: 라이선스 비용 0원 + 성능 향상. 전형적인 Refactor 사례이며, "이기종 DB + 스키마 변환"은 항상 SCT+DMS 조합이다.

### DataSync vs Snow Family — 대역폭이 곧 시간

| 도구 | 용량 | 시간 | 사용처 |
|------|------|------|--------|
| DataSync | 수 GB ~ 수십 TB | 회선 의존 | 회선 충분·온라인 동기화 |
| Snowcone | 8TB | 일주일 운송 | 소량 + 회선 부족·엣지 |
| Snowball Edge | 80TB(스토리지 최적화) | 일주일 운송 | 대용량 + 회선 부족 |
| Snowmobile | 100PB | 수 주 운송 | exa·peta급 일괄 이전 |

> ⚠️ **함정**: 마이그레이션의 숨은 변수는 **대역폭 수학**이다. 회선으로 옮길 시간 = 데이터량 ÷ 실효 대역폭이다. 예: 1PB ÷ 100Mbps ≈ 1000일(불가), 100TB ÷ 10Gbps ≈ 22시간(이론, 실효는 2~3배). 그래서 "수십~수백 TB + 제한된 대역폭"이면 **초기 대량은 Snow로 물리 운송, 이후 델타만 DataSync/DMS로 온라인 동기화**하는 하이브리드가 정석이다. "1PB + 100Mbps + 1개월"을 DataSync로 답하면 함정이다 — 회선으로 불가능하니 Snowball Edge 다수 또는 Snowmobile이다(보통 10PB 미만은 Snowball, 이상은 Snowmobile). 참고: Snowmobile은 2024년 신규 주문이 중단됐으나 시험 개념상 peta급 트럭 운송의 상징으로 남아있다.

### App2Container · AppFlow · Migration Hub

- **App2Container(A2C)**: Java(Tomcat·JBoss)·.NET 앱을 자동 분석 → Docker 이미지 생성 → ECS/EKS 배포 매니페스트 (Replatform 컨테이너화)
- **AppFlow**: SaaS(Salesforce·Slack·ServiceNow·Google Analytics) ↔ AWS(S3·Redshift) 코드리스 데이터 통합
- **Migration Hub**: Discovery→Planning→Migration→Validation 통합 추적 + 자산별 7R 권고(Strategy Recommendations)
- **Application Discovery Service(ADS)**: 온프레 인벤토리 자동 수집(에이전트=상세 / 에이전트리스=VMware vCenter 통합) + 의존성 그래프 자동 생성

> 💡 **관련 이론**: **Migration Wave Planning**은 마이그레이션 거버넌스의 핵심이다. 한꺼번에 모든 워크로드를 옮기지 않고, **의존성 그래프 기반**으로 wave 1, 2, 3로 나눠 점진 진행한다 — 강하게 결합된 시스템(같은 DB를 공유하는 앱들)은 같은 wave에, 의존성 없는 시스템은 먼저 옮긴다. ADS가 앱 간 네트워크 통신을 자동 매핑해 의존성 그래프를 만들고, Migration Hub가 wave 배정·진행 추적을 한다. 이것이 "빅뱅 마이그레이션"의 위험을 줄이는 정석이다.

## 현대화 패턴 — 모놀리스를 안전하게 분해하기

### Strangler Fig 패턴 — 점진 교살

모놀리스를 한 번에 재작성(빅뱅)하는 것은 고위험이다(Knight Capital·여러 ERP 재작성 실패가 증명). **Strangler Fig 패턴**(Martin Fowler, 2004 — 무화과나무가 숙주를 감싸 서서히 교살하는 데서 유래)은 모놀리스를 그대로 두고 새 기능부터 마이크로서비스로 만들어, API Gateway/Proxy로 요청을 옛 모놀리스 또는 새 서비스로 분기한다. 시간이 지나며 기능이 하나씩 새 서비스로 이동해 모놀리스가 "교살"된다.

```
[모놀리스 EC2 + Oracle]
        ↓ Refactor (점진)
[API Gateway 분기] → 옛 기능: 모놀리스 / 새 기능: Lambda·Fargate
[Aurora + DynamoDB] [Step Functions 워크플로]
```

> 🎯 **시나리오**: "한 기업이 20년 된 Java EE 모놀리스(단일 Oracle DB 공유)를 마이크로서비스로 전환하려 한다. 한 번에 재작성하면 비즈니스 중단 위험이 크다. 어떻게 점진 분해하는가?" — 답: **Strangler Fig 패턴 + API Gateway 라우팅 + 새 기능부터 Lambda/Fargate 마이크로서비스 + DMS로 DB도 점진 분리(database-per-service)**. API Gateway가 요청을 모놀리스/새 서비스로 분기하고, 새 기능부터 떼어내며, DB는 DMS로 해당 도메인 데이터를 새 DB(Aurora/DynamoDB)로 점진 이관한다. 한 번에 모든 기능을 옮기지 않으므로 각 단계가 롤백 가능하고 위험이 분산된다. "빅뱅 재작성"은 항상 오답 신호다.

> 🔍 **더 깊이**: 모놀리스 분해의 어려운 부분은 코드가 아니라 **공유 데이터베이스**다. 마이크로서비스의 원칙은 "서비스마다 자기 DB(database-per-service)"인데, 모놀리스는 보통 하나의 거대 DB를 공유한다. 분해 시 트랜잭션 경계가 서비스를 가로지르면 **분산 트랜잭션** 문제가 생긴다 — 2PC(2-phase commit)는 가용성을 해쳐 클라우드에선 기피되고, 대신 **Saga 패턴**(보상 트랜잭션으로 일관성을 결국 달성)을 Step Functions로 구현한다. "마이크로서비스 간 분산 트랜잭션·보상 로직"이 보이면 Step Functions Saga가 정답 방향이다.

## 시나리오 키워드 → 정답 매핑

| 키워드 | 정답 | 한 줄 근거 |
|--------|------|-----------|
| "200대 VM Lift & Shift + 짧은 다운타임" | MGN | 블록 레벨 연속 복제 |
| "온프레 + AWS 지속 DR" | DRS | 계속 복제·대기 |
| "Oracle → Aurora PostgreSQL" | DMS + SCT | 이기종·스키마 변환 |
| "SQL Server → MySQL(이기종)" | SCT + DMS | 방언 변환 + CDC |
| "MySQL → RDS MySQL(동종)" | DMS만 | 동종은 SCT 불필요 |
| "무중단 DB 이전" | DMS CDC | 트랜잭션 로그 캡처 |
| "1PB + 회선 100Mbps + 1개월" | Snowball Edge 다수/Snowmobile | 대역폭 수학상 회선 불가 |
| "수십 TB + 회선 충분" | DataSync | 온라인 동기화 |
| "Java EE 모놀리스 컨테이너화" | App2Container | 자동 Docker화 |
| ".NET → Fargate" | App2Container | 자동 분석·배포 |
| "Salesforce → S3 통합" | AppFlow | 코드리스 SaaS 커넥터 |
| "마이그레이션 단계 통합 추적" | Migration Hub | wave·진행 시각화 |
| "온프레 자산 자동 인벤토리·의존성" | Application Discovery Service | 의존성 그래프 |
| "모놀리스 → 점진 마이크로서비스" | Strangler Fig + API Gateway | 빅뱅 회피 |
| "마이크로서비스 분산 트랜잭션" | Step Functions Saga | 보상 트랜잭션 |
| "VMware → VMware on AWS" | VMware Cloud on AWS(Relocate) | 하이퍼바이저 그대로 |

## 정리하며

도메인 3은 **7R 즉답 + 도구 내부 동작 이해 + 대역폭 수학**이 핵심이다. 통찰: (1) 시간 제약이면 Rehost(MGN) 먼저, 클라우드 위에서 점진 Refactor — GE 실패 vs Capital One 성공이 증명, (2) MGN은 블록 연속 복제(=DRS 형제 엔진), DMS CDC는 트랜잭션 로그를 읽어 무중단, 이기종만 SCT 추가, (3) "수십~수백 TB + 제한 대역폭"은 Snow + 온라인 델타 하이브리드 — 회선으로 PB는 불가, (4) 모놀리스는 빅뱅 재작성 금물 — Strangler Fig로 점진 교살하고 공유 DB는 database-per-service + Saga로 분리. 시험 함정: "동종 이전에 SCT 필요?" → 아니오, DMS만으로 충분.

내일(Day 79)은 도메인 4 지속적 개선(관측성·자동화·SRE)을 SRE 이론과 함께 종합 정리한다.

---

## 📝 연습 문제

**문제 1.** 온프레미스 데이터센터의 VMware VM 약 200대를 6개월 내 AWS로 Lift & Shift하되, 각 서버의 다운타임을 분 단위로 최소화해야 한다. cutover 전까지 소스는 계속 운영된다. 가장 적합한 도구는?

A) AWS DataSync

B) AWS Application Migration Service(MGN)

C) AWS Snowball만 사용

D) AWS Database Migration Service(DMS)

**정답: B**

해설: "서버 전체(OS+앱+데이터) Lift & Shift + 최소 다운타임 + 소스 운영 중 연속 복제"는 MGN의 정의역이다. MGN은 에이전트로 디스크를 블록 레벨 연속 복제하다 cutover 순간에만 멈춰 EC2로 전환해 다운타임을 "마지막 델타 + 부팅"으로 압축한다. A(DataSync)는 파일·객체 전송이라 서버 전체를 옮기지 않는다. C(Snowball 단독)는 대량 초기 운송엔 좋지만 연속 복제·최소 다운타임 cutover가 없다. D(DMS)는 DB 엔진 마이그레이션 도구다. 함정: "OS 통째 + 최소 다운타임 + 일회성"은 MGN(지속 DR이면 DRS).

---

**문제 2.** 온프레 Oracle 11g 데이터베이스를 라이선스 비용 제거를 위해 Aurora PostgreSQL로 이전한다. 저장 프로시저(PL/SQL)와 스키마 변환이 필요하고, 무중단에 가깝게 cutover해야 한다. 가장 적합한 조합은?

A) MGN으로 DB 서버 Rehost

B) DMS + Schema Conversion Tool(SCT) + CDC

C) RDS Oracle로 Rehost 후 종료

D) Snowball로 덤프 운송

**정답: B**

해설: Oracle→PostgreSQL은 이기종 전환이라 SQL 방언·PL/SQL 차이를 변환해야 한다. **SCT**가 스키마·저장 프로시저를 PL/pgSQL로 자동 변환(불가 항목은 리포트)하고, **DMS CDC**가 Full Load + 트랜잭션 로그 기반 지속 변경 캡처로 양쪽을 동기화해 무중단 cutover를 지원한다. A(MGN)는 OS를 옮길 뿐 엔진 전환이 아니다. C는 Oracle을 유지해 라이선스 비용이 남아 목표에 반한다. D는 일회성 덤프라 지속 동기화·cutover가 없다. 함정: "이기종 + 스키마 변환 + 무중단"은 SCT+DMS+CDC.

---

**문제 3.** 온프레 1PB 데이터를 1개월 내 S3로 옮겨야 한다. 인터넷 회선은 100Mbps로 제한된다. 가장 적합한 접근은?

A) Snowball Edge 다수 대 또는 Snowmobile

B) DataSync로 온라인 전송

C) Direct Connect 신청 후 일회성 전송

D) S3 Multipart Upload 병렬화

**정답: A**

해설: 대역폭 수학상 1PB ÷ 100Mbps ≈ 1000일이라 회선 전송은 불가능하다. **Snowball Edge(80TB) 다수 또는 Snowmobile(peta급)**로 물리 운송해야 한다(1PB는 Snowball Edge 약 13~14대 또는 Snowmobile 1대 — 비용·운송 시간 trade-off로 결정, 보통 10PB 미만은 Snowball). B(DataSync)·D(Multipart)는 모두 회선에 의존하므로 100Mbps로는 불가능하다. C(Direct Connect)도 회선 증설일 뿐 1PB를 1개월에 못 옮기고, DX 프로비저닝에 수 주가 걸린다. 함정: "PB급 + 제한 대역폭"은 회선이 아니라 Snow 물리 운송.

---

**문제 4.** 한 기업이 20년 된 Java EE 모놀리스를 마이크로서비스로 전환하려 한다. 단일 Oracle DB를 공유하며, 한 번에 재작성하면 비즈니스 중단 위험이 크다. 가장 안전한 점진 전략은?

A) 빅뱅으로 전체를 Lambda로 재작성

B) Strangler Fig 패턴 + API Gateway 라우팅 + 새 기능부터 마이크로서비스 + DMS로 DB 점진 분리

C) App2Container로 모놀리스를 한 컨테이너에 그대로 담기

D) 모놀리스를 그대로 EC2로 Rehost하고 종료

**정답: B**

해설: 모놀리스 분해의 안전한 정석은 **Strangler Fig 패턴**이다. API Gateway가 요청을 옛 모놀리스/새 서비스로 분기하고, 새 기능부터 떼어내며, 공유 DB는 DMS로 해당 도메인 데이터를 새 DB로 점진 이관(database-per-service)한다. 각 단계가 롤백 가능해 위험이 분산된다. A(빅뱅 재작성)는 고위험으로 항상 오답 신호다. C(A2C로 통째 컨테이너화)는 마이크로서비스 분해가 아니라 단순 컨테이너화(Replatform)라 "마이크로서비스 전환" 목표에 미달한다. D(Rehost)는 현대화가 아니다. 함정: "점진 분해 + 빅뱅 위험 회피"는 Strangler Fig.

---

**문제 5.** Salesforce CRM의 데이터를 매일 자동으로 S3로 가져와 분석하려 한다. 최소 코드로 구현하려면?

A) DMS

B) AppFlow

C) AWS Glue 커스텀 스크립트

D) DataSync

**정답: B**

해설: AppFlow는 SaaS↔AWS 코드리스 데이터 통합 도구로, Salesforce·ServiceNow·Slack 등의 네이티브 커넥터를 제공하고 스케줄·필터·변환을 콘솔에서 설정한다("매일 자동" 스케줄 지원). A(DMS)는 DB 마이그레이션이지 SaaS API 통합이 아니다. C(Glue)는 ETL이지만 Salesforce 연동에 커스텀 코드가 필요해 "최소 코드"에 미달한다. D(DataSync)는 파일·객체 동기화 도구다. 함정: "SaaS → AWS 코드리스 통합"은 AppFlow.

---

**문제 6.** 멀티 wave 마이그레이션에서 온프레 자산의 인벤토리와 애플리케이션 간 의존성을 자동으로 수집·매핑하려 한다. 가장 적합한 도구는?

A) Migration Hub

B) Application Discovery Service

C) CloudFormation

D) Systems Manager Inventory

**정답: B**

해설: ADS는 에이전트(상세 성능·프로세스) 또는 에이전트리스(VMware vCenter 통합)로 온프레 자산을 자동 수집하고, **애플리케이션 간 네트워크 통신을 매핑해 의존성 그래프를 자동 생성**한다 — 이 그래프가 wave planning의 입력이 된다. A(Migration Hub)는 ADS 데이터를 받아 단계·wave·진행을 추적하는 상위 콘솔이지 인벤토리·의존성 수집기 자체가 아니다. C·D는 마이그레이션 자산 자동 수집·의존성 매핑이 주 용도가 아니다. 함정: "온프레 자산 자동 인벤토리 + 의존성 그래프"는 ADS, "단계 통합 추적"은 Migration Hub.

---

**문제 7.** MySQL 5.7 온프레 DB를 RDS MySQL 8.0(동종)으로 무중단에 가깝게 이전하려 한다. 가장 적합한 접근은?

A) DMS CDC만 사용

B) SCT + DMS

C) Snowball로 덤프 운송

D) mysqldump 수동 복원

**정답: A**

해설: 동종 이전(MySQL→MySQL)은 스키마·방언 변환이 불필요하므로 **SCT 없이 DMS만**으로 충분하다. DMS가 Full Load로 기존 데이터를 복사하고 CDC(binlog 기반)로 지속 변경을 캡처해 cutover까지 양쪽을 동기화한다 — 다운타임이 트래픽 전환 순간으로 압축된다. B(SCT 추가)는 동종 이전에 불필요한 도구를 더한 함정 오답이다. C(Snowball)·D(mysqldump)는 일회성 복사라 지속 동기화·무중단 cutover가 없다. 함정: "동종 이전에 SCT 필요?" → 아니오, DMS만.

---

**문제 8.** 온프레미스 VMware 가상화 환경을 최소 변경으로 AWS로 옮기되, 기존 VMware 운영 도구와 vSphere 워크플로를 그대로 유지하려 한다. 어느 R·서비스인가?

A) Rehost — MGN

B) Relocate — VMware Cloud on AWS

C) Refactor — ECS

D) Replatform — Elastic Beanstalk

**정답: B**

해설: "VMware 하이퍼바이저·vSphere 도구를 그대로 유지 + 통째 이전"은 **Relocate** 전략이며, **VMware Cloud on AWS**가 정답이다 — AWS 베어메탈 위에 VMware SDDC(vSphere·vSAN·NSX)를 그대로 띄워 기존 운영 방식을 바꾸지 않고 옮긴다(HCX로 마이그레이션). A(MGN Rehost)는 EC2로 변환해 VMware 운영 도구를 잃는다. C·D는 앱 변경이 필요해 "최소 변경 + VMware 유지"에 반한다. 함정: "VMware 그대로 유지"는 Relocate(VMware Cloud on AWS).

---

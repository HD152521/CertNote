# Day 78 - 도메인 3 종합: 마이그레이션·현대화 (20%)

SAP-C02 시험 도메인 3 "Migration and Modernization"은 비중 20%로, 본질적으로 "온프레미스 또는 타 클라우드의 워크로드를 어떻게 AWS로 옮기고 현대화하느냐"의 질문이다. AWS는 이를 **7R 프레임워크**(Gartner의 5R을 확장)로 정형화했고, 각 R마다 정해진 도구 셋이 있다. Pro 시험은 "이 시나리오는 어느 R이고, 어느 도구를 써야 하느냐"를 묻는다.

오늘은 도메인 3 전체를 7R + 도구 매핑 + 시나리오 키워드로 정리한다.

## 7R 프레임워크: 마이그레이션 전략 결정 트리

| R | 의미 | 사용 시점 | 대표 도구 |
|---|------|-----------|----------|
| **Retire** | 폐기 | 사용되지 않는 시스템 발견 | Application Discovery Service |
| **Retain** | 일단 유지 | 마이그레이션 미적합·우선순위 낮음 | - |
| **Relocate** | 동일 환경으로 이전 | VMware → VMware Cloud on AWS | VMware HCX |
| **Rehost** | Lift & Shift | 빠른 이전 + 코드 변경 최소 | **MGN (Application Migration Service)** |
| **Replatform** | 일부 변경 | DB 엔진 유지 + 호스팅만 관리형으로 | DMS, Elastic Beanstalk, App2Container |
| **Repurchase** | 상용 SaaS로 교체 | 자체 ERP → Workday, 자체 CRM → Salesforce | AWS Marketplace |
| **Refactor** | 재설계 | 모놀리스 → 마이크로서비스·Lambda | DMS + SCT, Lambda, ECS, Step Functions |

> 🔍 **더 깊이**: 7R은 **이전 비용(왼쪽으로 갈수록 ↓) vs 클라우드 네이티브 가치(오른쪽으로 갈수록 ↑)**의 trade-off다. Rehost는 빠르지만 클라우드 가치를 거의 못 얻고(EC2를 데이터센터처럼 운영), Refactor는 비용·시간이 크지만 진정한 클라우드 네이티브 달성. 대부분 기업은 Rehost로 시작 → 시간이 지나며 점진적 Replatform·Refactor.

> 💡 **관련 이론**: 7R은 Gartner의 5R(Rehost, Refactor, Revise, Rebuild, Replace)을 AWS가 2021년 확장한 것. Microsoft Azure는 5R, Google Cloud는 6R을 사용. AWS의 7R이 가장 세분화된 모델. 시험에서는 "Lift & Shift"=Rehost, "동일 DB 엔진 유지 + RDS로 이동"=Replatform, "모놀리스 분해"=Refactor라는 키워드 매핑이 핵심.

> 📚 **사례**: 2019년 Capital One은 8년간 진행한 AWS 마이그레이션을 완료했다. 초기 워크로드는 대부분 Rehost로 빠르게 옮기고, 점진적으로 Replatform(Oracle→Aurora, 데이터센터 ELB→ALB) → Refactor(모놀리스→마이크로서비스·Lambda)로 진화. 8년에 걸친 단계적 전략이 표준 패턴.

## 도구별 상세

### MGN (Application Migration Service)

- 온프레미스 VM의 디스크를 지속 복제 → AWS EBS 스냅샷에 저장
- Cutover 시점에 EC2 인스턴스로 부팅 → 다운타임 수 분
- 모든 OS·앱 지원(에이전트 기반)

> 🎯 **시나리오**: "온프레 VM 500대를 6개월 내 AWS로 이전". → **MGN**. 일회성 Rehost는 MGN이 정공. 단 이전이 끝나면 종료. 지속적 DR이면 DRS.

### DMS (Database Migration Service) + SCT (Schema Conversion Tool)

- **동종(homogeneous)**: Oracle→Oracle on RDS, MySQL→MySQL on RDS — DMS만으로
- **이기종(heterogeneous)**: Oracle→Aurora PostgreSQL, SQL Server→MySQL — SCT로 스키마 변환 + DMS로 데이터 이전
- **CDC(Change Data Capture)**: 초기 데이터 이전 + 지속적 변경 캡처 → 무중단 cutover

> 🔍 **더 깊이**: DMS는 source DB의 binary log(MySQL), redo log(Oracle), CDC stream(SQL Server)을 읽어 변경을 캡처한다. 따라서 source DB에 약간의 부하 증가가 있지만 read replica처럼 가벼움. cutover 직전까지 양쪽 동기화 → 새 DB로 트래픽 전환 → DMS 종료. 다운타임 수 분.

> 📚 **사례**: 한 핀테크가 Oracle Database Enterprise Edition(라이선스 연간 수억 원)에서 Aurora PostgreSQL로 이전. SCT로 PL/SQL → PL/pgSQL 변환(자동 70%, 수동 30%), DMS CDC로 6개월 양쪽 동기화, 주말 cutover. 결과: 라이선스 0원 + 성능 향상. Refactor 사례.

### DataSync vs Snow Family

| 도구 | 용량 | 시간 | 사용처 |
|------|------|------|--------|
| DataSync | 수 GB ~ 수 TB | 회선 의존 | 회선 충분 |
| Snowcone | 8TB | 일주일 운송 | 작은 데이터 + 회선 부족 |
| Snowball Edge | 80TB | 일주일 운송 | 대용량 + 회선 부족 |
| Snowmobile | 100PB | 수 주 운송 | exa·peta급 일괄 이전 |

> ⚠️ **함정**: "1PB + 회선 100Mbps"는 Snowmobile? Snowball Edge? — Snowmobile은 100PB(40-foot container 트럭). 1PB는 Snowball Edge 약 14대 또는 Snowmobile 1대. 비용·운송 시간 trade-off로 결정. 보통 10PB 이상이 Snowmobile.

### App2Container (A2C)

- Java(Tomcat, JBoss) 또는 .NET 애플리케이션을 자동 분석 → Docker 이미지 생성 → ECS/EKS 배포
- Replatform의 컨테이너화 도구

### AppFlow

- SaaS(Salesforce, Slack, ServiceNow, Google Analytics) ↔ AWS(S3, Redshift) 데이터 통합
- 코드 없는 데이터 파이프라인

### Migration Hub

- 마이그레이션 단계 통합 추적(Discovery → Planning → Migration → Validation)
- Migration Hub Strategy Recommendations: 자산별 7R 권고
- Application Discovery Service: 온프레 인벤토리 자동 수집(에이전트 또는 에이전트리스)

> 💡 **관련 이론**: **Migration Wave Planning**은 마이그레이션 거버넌스의 핵심. 한꺼번에 모든 워크로드를 옮기지 않고, 의존성 그래프 기반으로 wave 1, 2, 3로 나눠 점진 진행. Migration Hub가 이 wave 관리를 지원. Discovery Service는 어플리케이션 간 통신을 자동 매핑해 의존성 그래프 자동 생성.

## 현대화 (Modernization) 패턴

### 모놀리스 → 마이크로서비스 (Refactor)

```
[모놀리스 EC2 + Oracle]
        ↓ Refactor
[마이크로서비스 ECS/Fargate]
[API Gateway + Lambda]
[Aurora + DynamoDB]
[Step Functions로 워크플로]
```

### Strangler Fig 패턴

- 모놀리스를 한 번에 분해하지 않고, 새 기능부터 마이크로서비스로 구축
- API Gateway로 요청을 모놀리스 또는 새 서비스에 분기
- 시간이 지나며 모놀리스가 "교살"됨

> 🎯 **시나리오**: "한 기업이 20년 된 Java EE 모놀리스를 Lambda·마이크로서비스로 점진 분해". → **Strangler Fig 패턴 + API Gateway + Lambda + DMS로 DB도 점진 이전**. 빅뱅 재작성은 위험, 점진 분해가 권장.

## 시나리오 키워드 → 정답 매핑 표

| 키워드 | 정답 |
|--------|------|
| "200대 VM Lift & Shift + 짧은 다운타임" | MGN |
| "온프레 + AWS 지속 DR" | DRS |
| "Oracle → Aurora PostgreSQL" | DMS + SCT |
| "SQL Server → MySQL (이기종)" | SCT + DMS |
| "MySQL → RDS MySQL (동종)" | DMS만 |
| "무중단 DB 이전" | DMS CDC |
| "1PB 데이터 + 인터넷 부족" | Snowball Edge 다수 또는 Snowmobile |
| "5TB + 회선 1Gbps" | DataSync |
| "Java EE 모놀리스 컨테이너화" | App2Container |
| "Salesforce → S3 통합" | AppFlow |
| "마이그레이션 단계 통합 추적" | Migration Hub |
| "온프레 자산 자동 인벤토리" | Application Discovery Service |
| ".NET → Fargate" | App2Container |
| "모놀리스 → 점진 마이크로서비스" | Strangler Fig + API Gateway |
| "VMware → VMware on AWS" | VMware Cloud on AWS (Relocate) |

## 정리하며

도메인 3은 **7R 즉답 + 도구 매핑**이 핵심이다. 시나리오 키워드(Lift & Shift, 컨테이너화, 이기종 DB, 1PB)만 보고 정답 도구를 떠올릴 수 있어야 한다. 현실에서는 7R을 혼합 적용하지만 시험에서는 단일 R + 단일 도구로 답이 정해진다. Pro 시험 함정: "동종 DB 이전에 SCT 필요?" → 아니오, DMS만으로 충분.

내일(Day 79)은 **도메인 4: 지속적 개선**(운영·SRE·자동화) 종합.

---

## 📝 연습 문제

**문제 1.** 200대 VM을 Lift & Shift로 AWS에 이전 + 다운타임 최소화.

A) Snowball
B) MGN (Application Migration Service)
C) DRS (Elastic Disaster Recovery)
D) DataSync

**정답: B**
해설: MGN은 디스크 지속 복제 + cutover 시 다운타임 수 분. 일회성 마이그레이션 정공. DRS는 지속 DR(이전 완료 후에도 유지), DataSync는 파일·객체 동기화 도구.

---

**문제 2.** Oracle 11g 온프레미스 → Aurora PostgreSQL 이기종 이전.

A) MGN
B) DMS + SCT
C) Snowball + 수동 import
D) Direct Copy

**정답: B**
해설: 이기종 DB → SCT로 스키마·코드 변환 + DMS로 데이터 + CDC로 무중단 cutover. MGN은 VM 이전이지 DB 엔진 변경 도구 아님.

---

**문제 3.** 1PB 데이터 + 인터넷 회선 100Mbps + 1개월 내 이전.

A) Snowmobile 또는 Snowball Edge 다수
B) DataSync
C) Direct Connect 일회성
D) S3 Multipart Upload

**정답: A**
해설: 1PB at 100Mbps = 약 1000일 → 불가. Snowmobile(100PB) 또는 Snowball Edge(80TB) 약 14대. Snowball Edge가 보통 더 경제적(1PB 미만).

---

**문제 4.** Java EE 모놀리스 200개 → 컨테이너화 자동.

A) AWS Copilot
B) App2Container
C) Fargate 수동
D) Elastic Beanstalk

**정답: B**
해설: App2Container는 Java(Tomcat, JBoss) 또는 .NET 앱을 자동 분석 → Docker 이미지 + ECS/EKS 배포 매니페스트 생성. Copilot은 CDK 기반 IaC.

---

**문제 5.** Salesforce CRM 데이터를 매일 S3로 통합.

A) DMS
B) AppFlow
C) AWS Glue
D) DataSync

**정답: B**
해설: AppFlow는 SaaS ↔ AWS 데이터 통합 코드리스 도구. Salesforce, ServiceNow, Slack 등 native connector 제공. DMS는 DB, Glue는 ETL, DataSync는 파일.

---

**문제 6.** 멀티 wave 마이그레이션 단계·자산·진행 통합 콘솔.

A) Trusted Advisor
B) Migration Hub
C) Service Catalog
D) Control Tower

**정답: B**
해설: Migration Hub는 Discovery → Planning → Migration → Validation 4단계 통합 추적 + 자산별 wave 배정 + 진행 상태 시각화. 마이그레이션 거버넌스 표준 도구.

---

**문제 7.** 온프레미스 자산(서버·OS·앱·통신)을 자동 인벤토리화.

A) Migration Hub
B) Application Discovery Service
C) CloudFormation
D) Systems Manager

**정답: B**
해설: ADS는 에이전트(상세) 또는 에이전트리스(VMware vCenter 통합)로 온프레 자산 자동 수집 + 의존성 그래프 자동 생성. Migration Hub의 입력 데이터 제공.

---

**문제 8.** MySQL 5.7 → RDS MySQL 8.0 (동종) 무중단 이전.

A) DMS CDC만
B) SCT + DMS
C) Snowball
D) mysqldump 수동

**정답: A**
해설: 동종 이전은 SCT 불필요. DMS CDC로 초기 데이터 + 지속 변경 캡처 + cutover. 다운타임 수 분 또는 무중단.

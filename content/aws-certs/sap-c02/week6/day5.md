# Day 35 - Week 6 복습: 마이그레이션 전략 통합 시나리오

Week 6은 클라우드 마이그레이션의 전 과정을 다뤘다. 의사결정 프레임워크인 7R(Day 31), 서버 이전의 표준 도구 MGN과 DRS(Day 32), DB 이전의 과학 DMS+SCT(Day 33), 생태계를 완성하는 가속 도구들(Day 34). 이 네 일자의 내용이 SAP-C02 도메인 3(마이그레이션·현대화, 20%)의 핵심이다.

도메인 3에서 자주 나오는 패턴은 "긴 시나리오에 여러 도구가 등장하고, 각 도구의 역할을 정확히 구분해야 정답을 고를 수 있는" 유형이다. 오늘은 각 개념의 핵심을 결정 트리로 압축하고, 복합 시나리오 12문항으로 실전 감각을 완성한다.

## 7R 결정 트리: 시나리오에서 R을 고르는 법

7R은 암기 문제가 아니라 시나리오 분류 문제다. 각 R의 "진입 조건"을 결정 트리로 이해해야 한다.

```
질문 1: 이 시스템을 계속 쓸 이유가 있는가?
  NO → Retire (폐기)
  YES → 다음

질문 2: AWS 이전 자체의 ROI가 없거나 규제상 온프레가 필수인가?
  YES → Retain (그대로 유지)
  NO → 다음

질문 3: VMware vCenter를 그대로 유지해야 하는가?
  YES → Relocate (VMware Cloud on AWS)
  NO → 다음

질문 4: 코드 변경 없이 빠르게 이전이 최우선인가?
  YES → Rehost (lift-and-shift, MGN)
  NO → 다음

질문 5: DB 엔진 교체나 OS 변경(최소 코드 수정)인가?
  YES → Replatform (DMS+SCT, MGN)
  NO → 다음

질문 6: SaaS 제품으로 전환하는 것이 더 합리적인가?
  YES → Repurchase (Salesforce, ServiceNow 등)
  NO → 다음

질문 7: 아키텍처 자체를 마이크로서비스/서버리스로 재설계하는가?
  YES → Refactor/Re-architect (A2C, Refactor Spaces, Lambda 재개발)
```

> ⚠️ **핵심 구분**: Replatform과 Refactor의 경계.
> - Replatform: **코드는 그대로**, 인프라 레이어 일부만 교체. "Oracle → Aurora(코드 미수정)", "EC2 기반 앱 → ECS(Dockerize만)"
> - Refactor: **코드도 변경**, 아키텍처 재설계. "모놀리식 → Lambda+DynamoDB", "REST API → 이벤트 드리븐 아키텍처"
> 경계 사례: "Oracle → Aurora PostgreSQL로 이전 시 PL/SQL 일부를 PostgreSQL 함수로 변환" → SCT가 자동 변환하더라도 코드 변환이 일어나므로 엄밀히는 Replatform(인프라+일부 코드). SAP 시험은 주로 코드 변경 여부로 구분한다.

## 도구 매핑 최종 테이블

| 시나리오 | 도구 조합 | 이유 |
|---------|---------|------|
| 서버 전체 빠른 이전 | **MGN** | 블록 레벨 복제, Cutover 수분 |
| DB 동종 엔진 이전 (MySQL→Aurora MySQL) | **DMS** only | 스키마 변환 불필요 |
| DB 이종 엔진 이전 (Oracle→Aurora PG) | **DMS + SCT** | 스키마·코드 변환 필요 |
| SQL Server T-SQL 호환 최소 변경 | **Babelfish** + MGN | T-SQL 그대로 사용 |
| .NET Framework → .NET Core 포팅 | **Porting Assistant** | 코드 호환성 분석·변환 |
| Java/.NET 앱 → 컨테이너화 | **App2Container (A2C)** | Dockerfile·ECS task def 자동 생성 |
| VMware vCenter 그대로 AWS로 | **VMware Cloud on AWS** | vCenter API 유지, Relocate |
| 온프레 서버를 AWS DR로 보호 | **DRS** | 상시 복제 + Failback |
| 마이그레이션 후 DR 역방향 | **DRS** | DR 리전 EC2 → 온프레 복제 |
| 모놀리식 → 마이크로서비스 점진 전환 | **Refactor Spaces** | Strangler Fig 트래픽 라우팅 |
| EoS Windows 2003/2008 앱 호환성 | **EMP** | 호환성 패키지 래핑 |
| Windows Server App → 현대 Windows | **EMP + MGN** | 호환성 + 이전 |
| 대용량 데이터 오프라인 이전 | **Snow Family** | 인터넷 대역폭 부족 시 |
| 파일/오브젝트 스토리지 이전 | **DataSync** | NFS, SMB, S3, EFS |

> 💡 **관련 이론**: 마이그레이션에서 데이터 정합성(Consistency)은 선택이 아니라 필수다. ACID(Atomicity, Consistency, Isolation, Durability) 특성을 가진 OLTP DB에서는 마이그레이션 중 열린 트랜잭션이 어떻게 처리되는지가 핵심이다. DMS는 DB 엔진의 트랜잭션 로그(Oracle Redo Log, MySQL binlog, SQL Server CDC, PostgreSQL WAL)를 읽어 트랜잭션 단위로 변경을 캡처한다. MGN의 블록 레벨 복제는 트랜잭션 경계를 인식하지 못하기 때문에 DB는 DMS로 이전하는 것이 Best Practice다.

## 동종 vs 이종 마이그레이션 결정 기준

```
엔진이 같은가?
  MySQL → Aurora MySQL → DMS만
  PostgreSQL → Aurora PostgreSQL → DMS만
  Oracle → RDS Oracle → DMS만

엔진이 다른가?
  Oracle → Aurora PostgreSQL → SCT(스키마) + DMS(데이터)
  SQL Server → Aurora PostgreSQL → SCT + DMS
  MongoDB → DynamoDB → DMS (NoSQL→NoSQL, SCT 불필요)
  SQL Server → Aurora MySQL Babelfish → Babelfish(T-SQL 호환 레이어)

동종이지만 버전이 많이 다른가?
  MySQL 5.6 → Aurora MySQL 3.x(MySQL 8.0 호환) →
  DMS만으로 이전하되, 문자열 함수·시스템 변수 변경 사항을 사전 테스트
```

### SCT 변환 품질 이해

SCT(Schema Conversion Tool)는 이종 엔진 간 스키마를 자동 변환하지만, 변환률은 완전하지 않다.

```
SCT Assessment Report 예시:
  자동 변환 가능: 75%
  수동 수정 필요: 20% (복잡한 PL/SQL 함수, 패키지 의존성)
  지원 불가: 5% (DB 전용 기능, 커스텀 C 확장)

실무 교훈:
- SCT 변환률이 낮을수록 Refactor 비용이 증가
- Oracle의 오라클 전용 힌트, DB 링크, 파티셔닝이 많으면 변환 어려움
- 사전 SCT Assessment 실행으로 공수 예측
```

> 🔍 **더 깊이**: DMS CDC의 최소 다운타임 마이그레이션 패턴. Full Load만 쓰면 대용량 DB에서 다운타임이 길어진다. Full Load + CDC를 조합하면: (1) Full Load로 기존 데이터를 이전(원본 운영 중), (2) Full Load 완료 후 CDC로 변경분만 계속 적용, (3) Lag이 수 초로 줄어들면 앱 중단 → 마지막 CDC 반영 → 전환. 이 패턴으로 수 TB DB도 다운타임 수분 이내로 이전 가능하다. SAP 시험에서 "최소 다운타임 DB 마이그레이션"은 항상 DMS Full Load + CDC 패턴이다.

## MGN vs DMS 선택 기준 최종 정리

```
이전 대상이 "서버 전체(OS + 앱 + 미들웨어)"인가?
  YES → MGN

이전 대상이 "DB 데이터"인가?
  YES → DMS (동종) 또는 DMS+SCT (이종)

DB 서버를 MGN으로 이전해도 되는가?
  기술적으로 가능하지만 Best Practice 아님.
  이유: 복제 중 열린 트랜잭션 → 데이터 불일관성 가능
  권장: 앱 서버 → MGN, DB → DMS

두 가지 모두 필요한 경우:
  앱 서버 700대 → MGN (병렬)
  Oracle DB 100대 → SCT+DMS (병렬)
  → Migration Hub Orchestrator로 Wave 조율
```

## A2C (App2Container) 심화: 컨테이너화 자동화

A2C는 Java, .NET(IIS) 기반 앱을 분석해 Docker 이미지와 ECS/EKS 배포 아티팩트를 자동 생성한다.

**A2C 작동 순서**:
```
1. Discover (앱 분석)
   $ app2container discover --target-container-id app-001
   └── 실행 중인 앱 프로세스, 포트, 의존성, 환경 변수 분석

2. Extract (추출)
   $ app2container extract --application-id java-app:1234
   └── 앱 파일, 설정, 런타임 환경을 tar 패키지로 추출

3. Containerize (컨테이너화)
   $ app2container containerize --application-id java-app:1234
   └── Dockerfile 생성, Docker 이미지 빌드, ECR push
   └── ECS Task Definition 또는 EKS Helm Chart 생성

4. Generate Pipeline (CI/CD 파이프라인)
   $ app2container generate app-deployment \
     --application-id java-app:1234 \
     --deploy-target ecs
   └── CodePipeline + CodeBuild 파이프라인 CloudFormation 생성
```

> 📚 **사례**: A2C의 한계. 국내 한 SI 회사가 레거시 Java EE 앱(JBoss 4.2 기반)을 A2C로 컨테이너화했을 때, JBoss 4.2의 특정 JMX 설정과 EJB 원격 호출이 컨테이너 환경에서 동작하지 않았다. A2C는 앱을 "그대로" 컨테이너에 넣는 것이지, 컨테이너 친화적으로 만들어주지는 않는다. 서버 상태를 파일에 저장하는 레거시 앱, JVM 힙 설정이 컨테이너 메모리와 충돌하는 케이스가 대표적 A2C 이후 추가 작업 대상이다.

## EKS Anywhere vs AWS Outposts: 하이브리드 쿠버네티스

마이그레이션 도구 Day 34에서 다룬 컨테이너화 이후 "어디에 배포하는가"의 선택이다.

| 항목 | EKS Anywhere | AWS Outposts |
|------|-------------|-------------|
| 하드웨어 | 고객 소유 서버 (VMware, Bare Metal) | AWS가 설계·배송한 랙 |
| 컨트롤 플레인 | 온프레미스에서 직접 운영 | AWS가 관리 |
| AWS 서비스 통합 | 제한적 (EKS Connector로 일부 통합) | EC2, EBS, S3, RDS 등 대부분 통합 |
| 적합 상황 | 기존 온프레 인프라 재사용, AWS 의존도 최소화 | AWS 관리형 서비스가 온프레에 필요한 경우 |
| 데이터 주권 | ✅ 데이터가 온프레에서 처리 | ✅ 데이터가 고객 시설에서 처리 |
| 가격 | EKS 라이선스 비용 | Outposts 하드웨어 임차 비용 (월 수백만~수천만 원) |

> 🎯 **시나리오 분류**:
> - "기존 온프레미스 서버에 쿠버네티스를 배포하고 AWS 콘솔에서 통합 관리하고 싶다" → EKS Anywhere
> - "병원 내부에서 환자 데이터가 절대 외부로 나가면 안 되지만 RDS를 쓰고 싶다" → Outposts
> - "규제상 데이터를 국내 데이터센터에서만 처리해야 하는 금융권" → Outposts 또는 EKS Anywhere (규제 상세에 따라)

## 마이그레이션 파이프라인 전체 흐름

엔터프라이즈 마이그레이션의 end-to-end 파이프라인을 한 그림으로 정리한다.

```
[Phase 1: Discover & Assess]
  ADS (Application Discovery Service)
  └── Agentless Collector (VMware 환경)
  └── Discovery Agent (물리 서버, 다른 클라우드)
  └── 인벤토리: CPU, 메모리, 디스크, 네트워크 의존성

  DMS Fleet Advisor
  └── DB 서버 특화 인벤토리
  └── 스키마 복잡도, 변환 가능성 평가

  Migration Evaluator
  └── On-Demand vs Savings Plans 비교
  └── 5년 TCO 절감 예측

  Migration Hub Strategy Recommendations
  └── 서버별 7R 자동 권장 (Refactor/Replatform/Rehost...)

[Phase 2: Plan & Mobilize]
  MAP (Migration Acceleration Program)
  └── AWS 파트너 + 자금 지원 + 교육
  └── Assess → Mobilize → Migrate 3단계

  Migration Hub
  └── 모든 마이그레이션 진행 상황 통합 추적

[Phase 3: Migrate]
  서버 이전:
  MGN (Rehost → EC2) + DRS (상시 DR)

  DB 이전:
  DMS + SCT (이종) 또는 DMS (동종)
  DataSync (파일/오브젝트 스토리지)
  Snow Family (대용량 오프라인)

  컨테이너화:
  App2Container (Java, .NET)
  Porting Assistant (.NET Core 포팅)
  EMP (EoS Windows)

[Phase 4: Modernize]
  Refactor Spaces (점진적 마이크로서비스 분리)
  EKS / ECS (컨테이너 오케스트레이션)
  Lambda / EventBridge (서버리스 이벤트 드리븐)
  Serverless Application Model (SAM)

[Phase 5: Optimize]
  Compute Optimizer (Right-Sizing)
  Savings Plans / Reserved Instances (비용 약정)
  Trusted Advisor (전반 권장)
  Well-Architected Tool (6 Pillar 검토)
```

## 핵심 비교표: 시험 직전 체크

| 비교 쌍 | A | B | 차이 기준 |
|--------|---|---|---------|
| MGN vs DMS | 서버 전체(OS+앱) | DB 데이터만 | 이전 단위 |
| MGN vs DRS | 1회 마이그레이션 | 상시 DR + Failback | 목적 |
| 동종 DMS vs 이종 SCT+DMS | 스키마 변환 불필요 | SCT로 변환 필요 | 엔진 호환성 |
| A2C vs Porting Assistant | OS 그대로 컨테이너 | 코드를 .NET Core로 포팅 | 코드 변경 유무 |
| ADS vs Migration Evaluator | 기술 인벤토리 | 재무 TCO | 분석 차원 |
| ADS Agentless vs Agent | VMware 전용, 무설치 | 모든 OS, 설치 필요 | 환경 |
| Migration Hub vs MAP | 추적 도구 | 자금·컨설팅 프로그램 | 도구 vs 프로그램 |
| Relocate vs Rehost | VMware 그대로 | OS·앱 그대로 EC2 | 하이퍼바이저 유지 |
| Refactor vs Replatform | 코드+아키텍처 재설계 | 코드 없이 인프라 교체 | 코드 변경 여부 |
| DRS vs MGN | 지속 DR (RPO 수초) | 1회 마이그레이션 | 마이그 vs 상시 DR |
| Babelfish vs SCT+DMS | T-SQL 호환 레이어 | 완전 변환 후 이식성 | 변경 최소 vs 완전 이식 |
| EKS Anywhere vs Outposts | 고객 하드웨어 재사용 | AWS 관리형 하드웨어 | 하드웨어 소유 |

---

## 📝 시나리오 12문항

**문제 1.** 한 대형 유통회사가 800대 물리 서버(앱 서버 700대 + Oracle DB 서버 100대)를 6개월 안에 AWS로 이전해야 한다. Oracle을 Aurora PostgreSQL로 교체하고, 앱 서버는 빠르게 EC2로 이전한다. 가장 적합한 도구 조합은?

A) MGN (모두) + RDS Oracle (DB)
B) MGN (앱 700대) + DMS+SCT (Oracle DB 100대 → Aurora PG)
C) App2Container (전체) + DMS (DB)
D) Refactor Spaces (모두) + Babelfish (DB)

**정답: B**
해설: 앱 서버 700대 = Rehost → MGN (블록 레벨 복제, 코드 변경 없음). Oracle DB 100대 → Aurora PG = Replatform → DMS(데이터 복제) + SCT(이종 엔진 스키마·PL/SQL 변환). A는 Oracle 라이선스 비용 지속으로 TCO 개선 없음. C는 A2C가 앱 서버만 대상이고 DB 서버는 적합하지 않음. D는 Refactor Spaces는 모놀리식→마이크로서비스 도구이고, Babelfish는 SQL Server 호환(Oracle 비지원).

---

**문제 2.** ADS가 3,000대 서버 중 500대가 CPU 평균 < 3%, 트래픽 없음, 마지막 로그인 2년 전임을 발견했다. 나머지 2,500대는 활성 워크로드다. 500대에 적용해야 하는 7R 전략은?

A) Retain (온프레 그대로, 규제 이유)
B) Rehost (EC2로 이전 후 모니터링)
C) Retire (폐기)
D) Repurchase (SaaS 전환)

**정답: C**
해설: "사용하지 않는 시스템" = Retire. ADS 발견 결과 CPU 3% 미만 + 트래픽 없음 + 2년간 접속 없음은 해당 시스템이 사실상 방치됐음을 의미한다. 이전하지 않아도 되는 시스템을 클라우드로 옮기는 것은 비용 낭비다. Retain은 규제·의존성·이전 ROI 없음이라는 명시적 이유가 있어야 하고, 단순히 방치된 시스템은 Retire가 맞다. 마이그레이션 전 Retire 판단으로 이전 대상을 2,500대로 줄이는 것 자체가 비용 최적화다.

---

**문제 3.** 한 금융회사가 SQL Server 위의 .NET Framework 4.6 앱을 코드 변경 최소화로 AWS 이전 + SQL Server 라이선스 제거를 원한다. 개발 인력이 부족해 대규모 코드 재작성은 불가하다. 가장 현실적인 조합은?

A) Porting Assistant로 .NET Core 포팅 + RDS PostgreSQL
B) App2Container로 컨테이너화 + RDS SQL Server
C) Aurora PostgreSQL Babelfish (DB) + MGN (앱 서버 EC2)
D) DMS+SCT (DB) + Refactor Spaces (앱)

**정답: C**
해설: 코드 변경 최소 + SQL Server 라이선스 제거 = Babelfish. .NET 앱이 SQL Server 드라이버로 Babelfish에 연결하면 T-SQL이 그대로 작동한다. 앱 서버는 MGN으로 EC2 Rehost(코드 변경 없음). A는 Porting Assistant로 .NET Core 포팅 = 코드 수정 필요 (인력 부족 조건 불충족). B는 SQL Server 라이선스 지속 (목표 불충족). D는 SCT 변환 공수 + Refactor Spaces 개발 비용 발생.

---

**문제 4.** 전사 마이그레이션 프로젝트 킥오프. 임원진이 "5년 TCO 절감 얼마?"를 묻고, 팀이 "서버별 어느 R을 적용?"을 묻는다. 두 요구를 모두 충족하는 AWS 서비스 조합은?

A) Cost Explorer + Trusted Advisor
B) Migration Evaluator (TCO) + Migration Hub Strategy Recommendations (7R 권장)
C) AWS Pricing Calculator + Compute Optimizer
D) AWS Budgets + AWS Config

**정답: B**
해설: 5년 TCO 비교 = Migration Evaluator. 현재 온프레 비용을 분석하고 AWS 이전 후 예상 비용을 계산해 5년 절감액을 제시한다. 서버별 7R 자동 권장 = Migration Hub Strategy Recommendations. ADS 데이터를 기반으로 각 서버에 Retire/Retain/Rehost/Replatform 등을 자동 추천한다. Cost Explorer는 이미 AWS를 쓰는 계정의 비용 분석, Trusted Advisor는 운영 중인 환경 권장이라 마이그레이션 Assess 단계와 다르다.

---

**문제 5.** VMware Cloud on AWS(Relocate)로 500대 VM을 이전한 후 6개월 경과. VMware 라이선스 비용이 여전히 높다. 다음 단계는?

A) VMware/AWS와 VMC 구독 라이선스를 재협상해 호스트 단가를 낮춘다 (아키텍처는 그대로 유지)
B) MGN으로 VMC VM을 EC2 네이티브로 이전 (Relocate → Rehost)
C) 500대 VM을 모두 즉시 Lambda + DynamoDB로 Refactor해 서버리스로 재설계한다
D) VMC를 그대로 유지하고 Compute Optimizer로 Right-Sizing만 수행해 비용을 재검토한다

**정답: B**
해설: Relocate → Rehost는 클라우드 여정의 자연스러운 다음 단계다. VMC는 온프레 VMware를 AWS로 빠르게 이전하는 중간 단계다. 네이티브 EC2로 이전하면 VMware 라이선스를 제거할 수 있다. MGN은 VMC 위에서 실행 중인 VM에서도 Agent를 설치해 동작한다. C는 즉각 Refactor는 대규모 개발 비용과 기간이 필요해 "다음 단계"로 적합하지 않다.

---

**문제 6.** 대형 모놀리식 Java 앱(200만 라인)을 마이크로서비스로 전환 중이다. 기존 모놀리식을 운영하면서 새 주문 관리 모듈을 먼저 마이크로서비스로 개발하고, 주문 API 트래픽의 일부를 새 서비스로 점진적으로 전환하고 싶다. 어떤 서비스가 라우팅 자동화를 관리하는가?

A) AWS App Mesh
B) AWS Migration Hub Refactor Spaces
C) Amazon API Gateway (직접 구성)
D) AWS Cloud Map

**정답: B**
해설: Strangler Fig 패턴 + 기존 모놀리식과 새 마이크로서비스 간 트래픽 점진 전환 = Refactor Spaces. 새 주문 서비스 URL을 Refactor Spaces 환경에 등록하면 API Gateway와 VPC 링크가 자동 구성된다. 트래픽 비율(예: 10% → 50% → 100%)을 콘솔에서 조정한다. App Mesh는 이미 마이크로서비스화된 환경에서 서비스 간 트래픽 관리, Cloud Map은 서비스 등록/탐색이다.

---

**문제 7.** 1,000대 VMware VM의 CPU·메모리 사용률과 서버 간 TCP 의존성을 수집해 Wave를 설계하려 한다. vCenter 환경이므로 에이전트 설치 없이 진행하고 싶다. 어떤 도구를 쓰는가?

A) DMS Fleet Advisor
B) ADS Agentless Collector (vCenter 가상 어플라이언스)
C) ADS Discovery Agent (각 VM에 설치)
D) AWS Systems Manager Inventory

**정답: B**
해설: VMware vCenter + 에이전트 없이 + CPU/메모리/네트워크 의존성 = ADS Agentless Collector. vCenter에 가상 어플라이언스를 배포하면 ESXi 레벨에서 VM의 메트릭과 TCP 연결을 수집한다. Fleet Advisor는 DB 서버 특화, Discovery Agent는 각 VM에 설치 필요(무에이전트 조건 불충족), SSM Inventory는 AWS EC2 전용.

---

**문제 8.** MySQL 5.7 → Aurora MySQL 2.x(MySQL 5.7 호환) 마이그레이션을 한다. 스토어드 프로시저가 100개 있다. DMS와 SCT 중 무엇이 필요한가?

A) DMS + SCT 모두 (MySQL도 이종으로 간주)
B) DMS만 (동종 엔진, 스키마 변환 불필요)
C) SCT만 (스토어드 프로시저 변환)
D) MGN으로 MySQL 서버 통째로

**정답: B**
해설: MySQL → Aurora MySQL = 동종 엔진(MySQL 호환). SCT는 이종 엔진 간 스키마·코드 변환 도구다. Aurora MySQL은 MySQL 5.7/8.0과 호환되므로 MySQL의 스토어드 프로시저, 트리거, 뷰가 대부분 그대로 작동한다. DMS만으로 Full Load + CDC 진행하면 된다. D는 MGN이 기술적으로 가능하지만 DB 이전에 DMS 사용이 Best Practice(트랜잭션 정합성 보장).

---

**문제 9.** 마이그레이션 담당자가 MGN 150대, DMS 30개, 파트너 도구 20대를 동시 진행 중이다. 각 서버의 "Discovery → Ready → Testing → Cutover Complete" 상태와 Wave별 진행률을 한 콘솔에서 관리하고, Wave 간 의존성에 따른 자동화도 원한다. 어떤 서비스를 쓰는가?

A) CloudWatch Dashboards
B) AWS Migration Hub + Migration Hub Orchestrator
C) AWS Service Catalog
D) AWS Config + Systems Manager

**정답: B**
해설: 마이그레이션 진행 상태 통합 추적 = Migration Hub. Wave별 서버 상태 관리와 단계별 워크플로우 자동화(Test Launch → 수동 승인 → Cutover → 검증) = Migration Hub Orchestrator. CloudWatch는 운영 메트릭 모니터링, Service Catalog는 제품 카탈로그, Config+SSM은 규정 준수 및 운영이다.

---

**문제 10.** 마이그레이션 완료 후 EC2 인스턴스들이 원본 서버 사양 기준으로 과잉 프로비저닝됐을 가능성이 있다. CPU 사용률이 평균 15%, 메모리는 40% 수준이다. 인스턴스 타입 변경을 권장받으려 한다. 어떤 서비스를 사용하는가?

A) AWS Cost Explorer
B) AWS Compute Optimizer
C) AWS Trusted Advisor (비용 카테고리)
D) AWS Pricing Calculator

**정답: B**
해설: 실제 CPU·메모리·네트워크 사용 패턴 기반 인스턴스 타입 Right-Sizing 권장 = Compute Optimizer. 최소 2주간 CloudWatch 메트릭을 분석해 구체적 권장(예: m5.2xlarge → m5.large)을 제공한다. Cost Explorer는 비용 추세 분석이지 인스턴스 타입 권장이 아니다. Trusted Advisor의 비용 카테고리도 유휴 인스턴스를 찾아주지만 세밀한 타입 권장은 Compute Optimizer가 더 구체적이다.

---

**문제 11.** 한 회사가 온프레미스에서 AWS로 마이그레이션을 완료했다. 이제 온프레미스 데이터센터가 남아있고 이것을 AWS 서비스의 DR 사이트로 활용하고 싶다. 어떤 구성이 가능한가?

A) MGN을 역방향으로 재설치해 AWS EC2를 소스로 온프레미스로 블록 레벨 상시 복제하도록 구성한다
B) DRS로 AWS EC2를 소스로, 온프레미스를 DR 대상으로 구성 (역방향 복제)
C) AWS는 온프레미스를 DR 대상으로 지원하지 않으므로 다른 AWS 리전을 DR 대상으로 삼아야 한다
D) AWS DataSync로 EC2의 EBS 볼륨 데이터를 온프레미스 NFS로 스케줄 기반 주기 복사한다

**정답: B**
해설: DRS는 소스가 온프레미스인 경우뿐 아니라 AWS EC2가 소스이고 온프레미스(또는 다른 AWS 리전)가 DR 대상인 역방향도 지원한다. "AWS to On-Prem DR" 패턴이다. MGN은 단방향 마이그레이션 도구라 상시 DR 복제에 적합하지 않다. DataSync는 파일/오브젝트 스토리지 이전 도구이지 서버 DR 복제가 아니다.

---

**문제 12.** 한 회사가 Well-Architected 마이그레이션 리뷰를 받았다. "도메인 3: 마이그레이션·현대화에서 DB 마이그레이션 중 다운타임을 최소화하는 설계가 누락됐다"는 지적을 받았다. Oracle DB 10TB를 Aurora PostgreSQL로 이전하면서 다운타임을 2시간 이내로 맞추는 Best Practice 설계는?

A) Oracle Dump → S3 → Aurora 임포트 (Full Load만)
B) Oracle Data Pump로 초기 이전 + 이후 DMS CDC로 변경분 동기화 → Lag 수 초 시 짧은 다운타임으로 전환
C) Aurora를 Oracle과 동일 서버에 설치해 실시간 복제
D) Snowball Edge로 오프라인 이전 후 전환

**정답: B**
해설: 최소 다운타임 DB 마이그레이션의 표준 패턴: (1) SCT로 스키마 변환, (2) DMS Full Load로 기존 10TB 데이터 이전(원본 운영 유지), (3) Full Load 완료 후 DMS CDC로 변경분 지속 적용, (4) Replication Lag이 수 초로 줄면 → 앱 짧게 중단 → 마지막 CDC 반영 → Aurora로 연결 전환. 총 다운타임: 수분~수십 분. A는 Full Load만이라 10TB 이전 중 원본의 모든 쓰기가 누락되어 다운타임이 이전 시간 전체(수십 시간)가 됨. D는 Snowball은 S3 데이터 이전이고 DB 직접 지원 안 함.

# Day 29 - 마이그레이션 가속 도구: App2Container, MAP, Migration Hub

마이그레이션 프로젝트에서 "이전"은 전체 여정의 절반도 안 된다. 나머지 절반은 **무엇을 이전할지 결정하는 Discovery, 얼마나 드는지 파악하는 TCO 분석, 조직 전체가 안전하게 이전하는 Landing Zone 구축, 이전 중 상태를 추적하는 대시보드**다. AWS는 이 각 단계를 지원하는 전문 도구와 프로그램을 제공한다.

오늘은 Day 26-28에서 본 7R·MGN·DMS 외에 마이그레이션 생태계를 완성하는 도구들을 다룬다. App2Container(컨테이너화), Porting Assistant(코드 포팅), Migration Hub(통합 추적), MAP(자금 프로그램), Refactor Spaces(점진적 모놀리식 분해). 특히 비슷해 보이는 도구들 간의 경계를 정확히 구분하는 것이 Pro 시험의 핵심이다.

## App2Container (A2C): 코드 없이 컨테이너화

App2Container는 현재 실행 중인 Java 또는 .NET IIS 앱을 소스 코드 없이 Docker 이미지로 변환하는 AWS CLI 도구다.

### A2C가 해결하는 문제

기존에 EC2나 온프레미스에서 돌아가는 레거시 앱을 컨테이너로 옮기려면 보통 두 가지 방법이 있었다. (1) 소스 코드를 받아 Dockerfile을 직접 작성하거나, (2) VM 스냅샷을 가져오거나. 둘 다 복잡하고 시간이 걸렸다. A2C는 실행 중인 프로세스를 분석해 의존성, 환경 변수, 포트, 파일 마운트를 자동 추출해 Dockerfile을 만들어준다.

### A2C 지원 앱

| 기술 스택 | 지원 |
|---------|-----|
| Java + Tomcat | ✅ |
| Java + JBoss | ✅ |
| Java + WebSphere | ✅ |
| Java + WebLogic | ✅ |
| .NET Framework + IIS (Windows Container) | ✅ |
| Python Flask/Django | ❌ (A2C 미지원, 직접 컨테이너화) |
| Node.js | ❌ |

> ⚠️ **함정**: A2C는 **앱만** 컨테이너화한다. DB(MySQL, Oracle 등)는 A2C 대상이 아니다. "Tomcat 앱을 EKS로 이전하려 한다" → A2C로 앱 컨테이너화 + DMS로 DB 별도 이전.

> ⚠️ **함정 2**: .NET Framework 앱을 A2C로 컨테이너화하면 **Windows Container**가 만들어진다. Linux Container로 바꾸려면 **.NET Core(현재 .NET 8)로 포팅**이 필요하고, 그 작업을 도와주는 것이 Porting Assistant다.

### A2C 5단계 워크플로우

```
1. init        ─── A2C 초기화, IAM/리전 설정

2. inventory   ─── 실행 중인 앱 발견·ID 부여
                   (PID, 포트, 클래스패스, 바인드 마운트)

3. analyze     ─── 의존성 심층 분석
                   (외부 호출, 환경 변수, 정적 리소스)

4. extract     ─── 컨테이너화할 아티팩트 추출
                   (WAR/JAR, DLL, 설정 파일)

5. containerize ── Dockerfile 자동 생성 + 이미지 빌드 + ECR push

6. generate    ─── ECS Task Definition / EKS Deployment YAML / App Runner 설정 생성
```

### A2C가 생성하는 결과물

- `Dockerfile`
- `docker-compose.yml` (로컬 테스트용)
- `ecs-task-def.json` (ECS 배포)
- `deployment.yaml` (EKS 배포)
- `CloudFormation Template` (인프라 포함)

### A2C에 사이드카 주입 가능

컨테이너화 시 다음 사이드카를 자동 주입할 수 있다:
- **CloudWatch Agent**: 컨테이너 메트릭 수집
- **X-Ray Daemon**: 분산 추적

> 💡 **관련 이론**: 컨테이너는 프로세스 격리를 위해 Linux Namespaces(PID, Network, Mount, IPC, UTS)와 cgroups(CPU·메모리 자원 제한)를 활용한다. A2C는 현재 실행 중인 프로세스의 Namespace 정보와 환경을 분석해 동일한 환경을 컨테이너 이미지로 재현한다. 이론적으로 OS가 제공하는 것과 동일한 격리를 Docker로 복제하는 것이다.

## Porting Assistant for .NET: 포팅 분석 도구

A2C와 가장 많이 혼동되는 도구. 결정적 차이:

| | App2Container | Porting Assistant |
|--|--|--|
| **역할** | 현재 OS에서 컨테이너로 패키징 | .NET Framework → .NET 코드 자체 변환 |
| **코드 변경** | 없음 | 있음 (API·NuGet 패키지 교체) |
| **결과물** | Docker 이미지 | 코드 분석 리포트 + 일부 자동 마이그레이션 |
| **사용 시점** | OS 그대로 유지하며 컨테이너화 | .NET Core/8로 현대화하려 할 때 |

Porting Assistant의 동작:
1. 솔루션 파일(.sln) 로드
2. 모든 .NET Framework API 호출 분석
3. .NET Core/.NET 8 호환 API 확인 (호환/미호환 구분)
4. NuGet 패키지 호환성 확인
5. 호환 패키지가 있는 경우 자동 교체 권장
6. 리포트 생성 (수동 작업 필요 항목 색상 표시)

> 🔍 **더 깊이**: .NET Framework와 .NET Core(현재 .NET 8)의 분리. .NET Framework는 Windows 전용, .NET Core는 크로스 플랫폼(Linux/macOS/Windows). 2016년 Microsoft가 .NET Core를 오픈소스로 출시하면서 AWS에서 Linux 컨테이너로 .NET 앱을 실행하는 길이 열렸다. 하지만 .NET Framework API(Windows Registry, COM, WCF 일부)는 .NET Core에서 지원하지 않아 포팅 과정에서 코드 변경이 필요하다. Porting Assistant는 이 갭을 식별해준다.

## End-of-Support Migration Program (EMP)

Windows Server 2003(2015년 EoS), Windows Server 2008(2020년 EoS) 등 더 이상 MS 보안 패치를 받지 못하는 OS 위에서 레거시 앱이 동작하는 경우가 있다. 그냥 EC2 Windows 2019로 올리면 앱이 동작하지 않을 수 있다.

EMP는 이런 레거시 앱에 **호환성 패키지(Compatibility Shim)**를 적용해 새로운 Windows 버전에서도 동작하도록 만든다. MGN으로 EC2로 이전한 후 EMP 패키지를 적용하는 조합이 표준이다.

| 시나리오 | 솔루션 |
|---------|-------|
| Win 2008 앱을 Win 2019로 바꾸고 싶다 | EMP + MGN |
| Win 2008 앱을 Linux 컨테이너로 | Porting Assistant (코드 포팅 먼저) |
| Win 2008 .NET Framework 앱을 AWS ECS로 | A2C (Windows Container) |

## Migration Hub: 전사 마이그레이션의 콘트롤 타워

Migration Hub는 마이그레이션 도구가 아니라 **통합 추적 대시보드**다. MGN, DMS, ADS, 파트너 도구들의 진행 상황을 한 콘솔에서 본다.

### 핵심 기능

**진행 상황 트래킹**: 서버·앱별로 "Discovery → Not Ready → Ready → Testing → Cutover Complete" 상태 관리.

**홈 리전(Home Region)**: Migration Hub는 모든 데이터를 하나의 리전에 저장한다. 최초 설정 후 변경 불가. 전사 마이그레이션 거버넌스 관점에서 하나의 권위 있는 리전을 선택해야 한다.

**Strategy Recommendations**: 서버 인벤토리와 소스 코드 분석을 토대로 7R 중 어떤 R을 권장하는지 자동 제안한다. A2C·Porting Assistant·MGN 등과 연동해 구체적인 도구까지 권장.

**Migration Hub Orchestrator (2022~)**: 마이그레이션 단계별 워크플로우를 자동화한다. 예: "ADS 발견 → Wave 승인 → MGN 에이전트 설치 → Test Launch 승인 → Cutover → 검증"을 Orchestrator가 단계별로 실행하고 승인 게이트를 관리.

> 📚 **사례**: 2023년 Deutsche Bank의 대규모 마이그레이션. Deutsche Bank는 5,000대 이상 서버를 AWS로 이전하는 과정에서 Migration Hub Orchestrator를 사용해 Wave 관리와 승인 프로세스를 자동화했다. 금융 규제 요구에 따라 각 Wave Cutover 전 IT 위험 관리팀의 승인 게이트를 Orchestrator에 구성했다. 교훈: 대규모 마이그레이션에서 Orchestrator의 승인 워크플로우는 거버넌스와 감사 추적을 동시에 해결한다.

## Application Discovery Service (ADS): 인벤토리의 출발점

ADS는 마이그레이션의 전제 조건이다. "무엇이 어디에 있는지" 모르고는 7R 결정도 Wave 설계도 불가능하다.

### 두 가지 수집 모드

**Agentless Collector** (VMware vCenter):
- vCenter에 가상 어플라이언스 배포
- ESXi 레벨에서 VM 메타데이터·성능 메트릭 수집
- 에이전트 없이 수백-수천 VM을 한 번에 발견
- 한계: 앱 레벨 의존성(TCP 연결) 파악이 Agent보다 덜 정밀

**Discovery Agent** (Linux/Windows 설치):
- 각 OS에 에이전트 설치
- TCP 연결 매핑으로 서버 간 의존성 파악 (5초 단위 스냅샷)
- 앱 프로세스 정보, 환경 변수, 설치된 소프트웨어 목록
- Agentless보다 상세하지만 에이전트 설치 오버헤드

| 항목 | Agentless Collector | Discovery Agent |
|-----|--------------------|----|
| 설치 방법 | vCenter 가상 어플라이언스 | 각 OS에 에이전트 |
| 의존성 맵 | 제한적 (네트워크 레벨) | 상세 (TCP 연결, 프로세스) |
| vCenter 의존 | 필수 | 불필요 |
| 물리 서버 지원 | ❌ | ✅ |

수집 데이터는 S3에 저장되어 Amazon Athena에서 SQL 쿼리 가능. 이를 통해 "특정 Oracle 버전이 설치된 서버 목록", "특정 포트로 통신하는 서버 쌍" 같은 분석이 가능하다.

## Migration Evaluator: 재무 의사결정 도구

ADS가 기술 인벤토리라면, Migration Evaluator는 재무 인벤토리다.

**주요 기능**:
- 현재 온프레미스 인프라 비용(하드웨어 감가상각, 전기료, 인건비, 라이선스) 계산
- AWS 이전 후 예상 비용(EC2, RDS, 스토리지, 지원) 계산
- 5년 TCO 비교 리포트 생성
- Right-Sizing 권장 포함 (과잉 프로비저닝 식별)

**Migration Evaluator vs AWS Pricing Calculator**:
- Migration Evaluator: 온프레 현황과 AWS 이전 후를 비교하는 마이그레이션 전용 TCO 도구
- Pricing Calculator: 특정 AWS 구성의 비용을 견적하는 일반 도구

## Refactor Spaces: Strangler Fig 매니지드 구현

Refactor Spaces는 모놀리식 앱을 마이크로서비스로 점진적으로 전환하는 Strangler Fig 패턴을 AWS 매니지드 서비스로 제공한다.

### 왜 Strangler Fig인가?

모놀리식을 한 번에 마이크로서비스로 바꾸는 "빅뱅 Refactor"는 수년의 개발 기간과 높은 리스크를 수반한다. Strangler Fig는 기존 모놀리식을 계속 운영하면서, 새 기능은 마이크로서비스로 개발하고 점진적으로 기존 기능을 교체한다.

### Refactor Spaces의 동작

Refactor Spaces는 API Gateway, VPC Link, Route 53 자원을 자동 구성해 라우팅 계층을 만든다.

```
클라이언트
    │
    ▼
API Gateway (Refactor Spaces 관리)
    ├── /api/orders/* → 새 마이크로서비스 (Lambda + DynamoDB)
    ├── /api/products/* → 새 마이크로서비스 (ECS)
    └── /* → 기존 모놀리식 (ALB → EC2)
```

신규 기능을 마이크로서비스로 개발하면 Refactor Spaces에 라우팅 규칙을 추가한다. 점진적으로 모놀리식의 엔드포인트가 새 서비스로 교체되고, 결국 모놀리식으로 향하는 트래픽이 없어지면 모놀리식을 폐기한다.

**Refactor Spaces vs 직접 API Gateway 구성**:
- 직접: API Gateway + VPC Link + Route 53 + ALB를 각각 설정해야 함, 여러 팀 간 라우팅 규칙 관리 복잡
- Refactor Spaces: 추상화 레이어로 라우팅 규칙 추가/변경 UI/API 제공, 팀별 서비스 독립 관리

> 💡 **관련 이론**: Martin Fowler의 Strangler Fig Application (2004). 레거시 시스템의 기능을 하나씩 새로운 서비스로 교체할 때, 원래 시스템이 여전히 실행되지만 점점 더 적은 기능을 처리하도록 하는 패턴이다. "교살(Strangler)"이라는 이름이 불편하게 들릴 수 있지만, 이는 기존 나무를 감싸 결국 대체하는 열대 무화과나무에서 온 비유다. 소프트웨어 현대화에서 가장 현실적이고 안전한 전략으로 널리 채택되었다.

## 도구 선택 매핑 완전판

시험에서 나오는 모든 시나리오를 아래 매핑으로 판단한다.

| 시나리오 | 도구 | 근거 |
|---------|------|-----|
| VM/서버 인벤토리 자동 수집 | ADS | 기술 인벤토리 |
| VMware vCenter 무에이전트 발견 | ADS Agentless Collector | vCenter 통합 |
| 5년 TCO 비교 리포트 | Migration Evaluator | 재무 분석 |
| VM → EC2 Rehost (lift-and-shift) | MGN | 블록 레벨 복제 |
| Oracle/SQL Server → Aurora | DMS + SCT | 이종 DB 마이그 |
| MySQL → RDS MySQL | DMS만 | 동종 DB 마이그 |
| SQL Server → Aurora (코드 변경 최소) | Babelfish | TDS 호환 |
| Java(Tomcat/JBoss) → ECS/EKS 컨테이너 | App2Container | Java 컨테이너화 |
| .NET IIS → ECS/EKS 컨테이너 | App2Container | .NET IIS 컨테이너화 |
| .NET Framework → .NET Core 포팅 | Porting Assistant | 코드 포팅 분석 |
| Win 2003/2008 EoS AWS 이전 | EMP + MGN | 호환성 패키지 |
| 모놀리식 → 마이크로서비스 점진 교체 | Refactor Spaces | Strangler Fig |
| 전사 마이그레이션 통합 대시보드 | Migration Hub | 진행률 트래킹 |
| 7R 자동 권장 | Migration Hub Strategy Recommendations | AI 기반 권장 |
| 마이그레이션 단계별 자동화·승인 | Migration Hub Orchestrator | 워크플로우 |
| 전사 자금·컨설팅·파트너 프로그램 | MAP | 3단계 프로그램 |

> 🎯 **시나리오**: "온프레 데이터센터에 3,000대 서버가 있다. IT 팀이 현재 어떤 앱이 어디서 실행 중인지 모른다. 서버 인벤토리와 DB 복잡도를 모두 파악하고, 임원에게 5년 TCO 리포트를 제출한 뒤 전사 마이그레이션 자금을 지원받고 싶다." → ADS(인벤토리) + Fleet Advisor(DB 복잡도) + Migration Evaluator(TCO) + MAP(자금·프로그램).

## 📝 연습 문제

**문제 1.** 온프레미스에서 JBoss 위에 Java EE 앱이 운영 중이다. EKS로 이전하려 하며, 앱 코드를 수정하지 않고 컨테이너 이미지와 EKS 매니페스트를 자동 생성하고 싶다. 가장 적합한 도구는?

A) AWS MGN (서버 통째로 EC2)
B) AWS App2Container
C) AWS Porting Assistant for .NET
D) AWS Copilot CLI (ECS/EKS 배포 도구)

**정답: B**
해설: JBoss Java 앱 컨테이너화 → A2C. A2C는 JBoss를 포함한 Java 앱 서버를 지원하며, 소스 코드 없이 실행 중인 프로세스 분석으로 Dockerfile + EKS Deployment YAML을 자동 생성한다. MGN은 OS째로 EC2로 이전(컨테이너화 아님), Porting Assistant는 .NET 전용, Copilot은 이미 컨테이너화된 앱을 ECS에 배포하는 도구.

---

**문제 2.** 회사가 .NET Framework 4.7 IIS 앱을 Linux ECS에서 실행하려 한다. 현재는 Windows에서만 돌아간다. 먼저 무엇을 해야 하는가?

A) App2Container로 바로 컨테이너화 (Windows Container로 ECS 실행)
B) Porting Assistant for .NET으로 .NET Core 호환성 분석 후 포팅
C) MGN으로 Windows EC2로 이전 후 컨테이너화
D) Refactor Spaces로 마이크로서비스 분리

**정답: B**
해설: Linux ECS 실행 = .NET Core(크로스 플랫폼)가 필요. .NET Framework는 Windows 전용이므로 먼저 Porting Assistant로 .NET 8 호환성을 분석하고 포팅 작업을 한다. A2C는 .NET Framework IIS를 Windows Container로만 만들 수 있다(Linux 아님). 포팅 후 A2C나 직접 Dockerfile로 Linux Container 생성 가능.

---

**문제 3.** 회사의 마이그레이션 팀이 MGN(EC2 이전), DMS(DB 이전), 파트너 도구(파일서버 이전)를 동시에 진행 중이다. 임원이 "전체 진행 상황을 한 화면에서 보고 싶다"고 요구한다. 어떤 서비스를 사용하는가?

A) CloudWatch Dashboards
B) AWS Migration Hub
C) AWS Systems Manager OpsCenter
D) AWS Service Catalog

**정답: B**
해설: 다수 마이그레이션 도구의 진행 상황 통합 트래킹 = Migration Hub. 홈 리전 설정 후 MGN·DMS·파트너 도구 진행 상황이 Migration Hub에 집계된다. CloudWatch는 운영 모니터링, OpsCenter는 운영 인시던트 관리.

---

**문제 4.** 거대 모놀리식 Java 앱을 마이크로서비스로 전환하려 한다. 한 번에 재설계하는 것은 리스크가 너무 높다. 기존 모놀리식을 유지하면서 새 기능부터 마이크로서비스로 개발하고 점진적으로 교체하려 한다. 어떤 서비스가 이 라우팅 관리를 매니지드로 제공하는가?

A) AWS App Mesh (서비스 메시)
B) AWS Migration Hub Refactor Spaces
C) AWS API Gateway (직접 구성)
D) AWS Cloud Map (서비스 디스커버리)

**정답: B**
해설: Strangler Fig 패턴 매니지드 구현 = Refactor Spaces. API Gateway·VPC Link·Route 53를 자동 구성하고, 새 마이크로서비스 추가 시 라우팅 규칙을 간단히 추가할 수 있다. App Mesh는 이미 마이크로서비스가 있는 환경의 서비스 간 통신 관리, Cloud Map은 서비스 등록·발견.

---

**문제 5.** 1,500대 VMware vCenter 환경 서버의 CPU·메모리·네트워크 의존성을 에이전트 없이 수집하려 한다. 어떤 도구가 적합한가?

A) ADS Discovery Agent (각 OS에 설치)
B) ADS Agentless Collector (vCenter 가상 어플라이언스)
C) DMS Fleet Advisor
D) Migration Hub Strategy Recommendations

**정답: B**
해설: vCenter 환경 + 무에이전트 = ADS Agentless Collector. vCenter에 가상 어플라이언스를 배포하면 모든 VMware VM의 메트릭을 에이전트 없이 수집한다. Discovery Agent는 각 OS에 설치 필요, Fleet Advisor는 DB 특화, Strategy Recommendations는 분석 후 권장.

---

**문제 6.** 임원진이 "AWS로 이전하면 5년간 얼마를 절약하는가"를 알고 싶다. 현재 온프레 인프라 비용(하드웨어, 전기, 인건비, 라이선스)과 AWS 이전 후 예상 비용을 비교한 리포트가 필요하다. 어떤 도구를 사용하는가?

A) AWS Pricing Calculator
B) AWS Cost Explorer
C) AWS Migration Evaluator
D) AWS Budgets

**정답: C**
해설: 온프레 현황 vs AWS 이전 후 5년 TCO 비교 = Migration Evaluator(구 TSO Logic). 온프레 비용 항목을 입력하면 Right-Sizing된 AWS 구성과 비용을 비교해 비즈니스 케이스 리포트를 생성한다. Pricing Calculator는 특정 AWS 구성 견적(현황 비교 없음), Cost Explorer는 이미 사용 중인 AWS 비용 분석.

---

**문제 7.** 회사가 2,000대 서버를 24개월에 이전하는 전사 프로젝트를 시작했다. AWS 파트너의 마이그레이션 전문가 지원, AWS 마이그레이션 크레딧, Mobilize 단계의 Landing Zone 구축 지원을 원한다. 어떤 것이 이 모든 것을 제공하는가?

A) AWS Professional Services 계약
B) AWS Migration Acceleration Program (MAP)
C) AWS Migration Hub
D) AWS Activate (스타트업 프로그램)

**정답: B**
해설: 대규모 마이그레이션 + 파트너 전문가 + AWS 크레딧 + Landing Zone 지원 = MAP. MAP은 Assess/Mobilize/Migrate 3단계로 자금 인센티브·파트너·도구 패키지를 통합 제공한다. AWS Activate는 스타트업 전용, Professional Services는 MAP과 별도 계약, Migration Hub는 추적 도구.

---

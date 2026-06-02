# Day 29 - App2Container, AWS MAP, Migration Hub

📅 날짜: Week 6 (Day 4)
🎯 주제: 레거시 앱 컨테이너화·전사 마이그레이션 프로그램·통합 추적
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS App2Container(A2C)로 .NET·Java 레거시를 컨테이너화하는 흐름을 이해한다
- AWS MAP(Migration Acceleration Program)의 3단계와 금전적 인센티브 구조를 안다
- Migration Hub의 역할 — 마이그레이션 통합 대시보드·Strategy Recommendations
- Application Discovery Service(ADS)·Migration Evaluator(TSO Logic)의 차이를 안다
- Refactor 가속 도구(AWS MGN + Refactor Spaces·App2Container·Porting Assistant)를 시나리오에 매핑한다

---

## 🧩 사전 지식 (CS 기초)

- **컨테이너화(Containerization)**: 앱과 의존성을 격리된 이미지로 패키징. OS 커널은 공유하지만 사용자 공간은 격리. VM보다 가벼움.
- **CRI(Container Runtime Interface)**: Docker → containerd → runc 흐름. ECS는 containerd, EKS도 1.24부터 dockershim 제거.
- **APM(Application Performance Monitoring)**: 런타임 성능 모니터링. A2C가 만들어주는 컨테이너 이미지에 X-Ray·CloudWatch Agent를 주입하는 패턴.
- **Strangler Fig 패턴**: 레거시 모놀리식을 점진적으로 새로운 서비스로 감싸 결국 교체하는 패턴. Refactor Spaces가 이 패턴을 매니지드로 제공.
- **Portfolio Discovery**: 마이그레이션 전 서버 인벤토리(CPU, 메모리, 디스크, 네트워크, 의존성, OS, 라이선스)를 자동 수집해 의사결정에 사용.

---

## 📖 이론 내용

### 1. AWS App2Container (A2C)

**목적**: 기존에 EC2·온프레미스에서 동작 중인 **Java(Tomcat, JBoss, WebSphere, WebLogic)** · **.NET (IIS 기반)** 애플리케이션을 컨테이너 이미지로 자동 변환.

- 무료 CLI 도구 (소스 코드 없이도 동작) — 기동 중인 프로세스를 inspect해서 의존성·바인드 마운트·환경 변수·포트·정적 리소스를 자동 식별
- 산출물: Docker 이미지 + ECS 태스크 정의 + EKS Deployment 매니페스트 + CloudFormation 템플릿 (또는 App Runner 배포 옵션)
- 컨테이너 이미지에 **CloudWatch Container Insights**, **X-Ray daemon**을 사이드카로 주입 가능

#### 5단계 워크플로우
1. **inventory**: 워커 머신에서 실행 중인 앱 ID 부여
2. **analyze**: 의존성 파일·바인드 라이브러리·외부 호출 자동 추출
3. **extract**: 컨테이너에 들어갈 산출물 추출 (war, dll 등)
4. **containerize**: Dockerfile 자동 생성 + 이미지 빌드 + ECR push
5. **generate**: ECS/EKS/App Runner 배포 매니페스트 생성

#### A2C 시나리오 결정
| 상황 | A2C 적합? |
|------|----------|
| Tomcat 위 Java 웹앱을 EKS로 옮기고 싶다 | ✅ 매우 적합 |
| 윈도우 IIS .NET Framework 4.6 앱 | ✅ Windows Container로 변환 |
| 새로운 마이크로서비스 신규 작성 | ❌ 그냥 직접 작성 |
| 코드 자체를 .NET Core로 포팅하고 싶다 | ❌ **Porting Assistant for .NET**이 그 역할 |

### 2. AWS Porting Assistant for .NET

A2C와 헷갈리기 쉬운 도구. **Porting Assistant**는 **.NET Framework → .NET Core(현재 .NET 8) 포팅**을 도와주는 분석 도구. 호환되는 API와 그렇지 않은 API를 식별하고 NuGet 패키지 호환성을 평가한다.

| 도구 | 역할 |
|------|-----|
| **App2Container** | OS는 그대로(주로 Linux+Java/Windows+IIS), 컨테이너 패키징 |
| **Porting Assistant** | .NET Framework → .NET (cross-platform) 코드 포팅 |
| **End-of-Support Migration Program (EMP)** | 윈도우 서버 2003·2008 → AWS로 안전 이전 (호환성 패키지) |

### 3. AWS MAP (Migration Acceleration Program)

**MAP은 도구가 아니라 "프로그램"** — AWS가 제공하는 자금·전문 인력·툴체인 패키지. 시험에서 "운영비를 줄이며 대규모 마이그레이션을 진행하려 한다. 어떤 프로그램?"으로 출제.

#### 3단계 (3-Phased Approach)
| 단계 | 명칭 | 활동 | 비용·인센티브 |
|------|------|------|--------------|
| 1 | **Assess** | 비즈니스 케이스 / TCO 분석 / 준비도 평가 (MRA: Migration Readiness Assessment) | AWS 또는 파트너 펀딩 |
| 2 | **Mobilize** | Landing Zone 구축, 운영 모델 정의, PoC | AWS 마이그레이션 크레딧 |
| 3 | **Migrate & Modernize** | 실제 이전(7R), 검증, 운영 안정화 | EC2/RDS 등 사용량 대비 % 환급 |

#### 적합 시나리오
- "전사 규모 수천 대 서버를 18개월 내 이전 + 비용 인센티브 + 파트너 활용" → **MAP**
- "단순 데이터베이스 1대 이전" → MAP은 과함, DMS만으로 충분
- "MAP과 함께 사용하는 도구": Migration Hub, MGN, DMS, ADS

### 4. Migration Hub

**전사 마이그레이션 진행도 통합 뷰**. 여러 도구(MGN, DMS, ADS, 파트너 도구)의 진행 상황·발견 결과를 하나의 콘솔에서 추적.

- **홈 리전(Home Region)** 선택 필요 (글로벌 거버넌스)
- 마이그레이션 패턴 트래킹: 서버·DB별 "discovery → migration → cutover" 상태
- **Migration Hub Strategy Recommendations**: 디스커버리 데이터·소스 코드 분석을 토대로 7R 중 무엇을 권장할지 자동 제안
- **Migration Hub Orchestrator** (2022~): 마이그레이션 단계별 워크플로우 자동화

### 5. Application Discovery Service (ADS)

- 온프레미스 서버 인벤토리 수집 → Migration Hub로 전송
- **Agentless Collector** (VMware vCenter)
- **Discovery Agent** (Linux/Windows에 설치)
- 수집 항목: CPU·메모리·디스크 IOPS·네트워크 의존성(2~5초 TCP 연결 캡처)
- 데이터는 자동으로 Athena에서 쿼리 가능 (S3 익스포트)

### 6. Migration Evaluator (구 TSO Logic)

- **재정적 비즈니스 케이스 작성용 — TCO 분석**
- "온프레 운영 vs AWS 이전 5년 TCO 비교 리포트" 제공
- ADS와 역할 분리: ADS=기술 인벤토리, Migration Evaluator=재무 비교

### 7. Refactor Spaces

- Strangler Fig 패턴 매니지드 구현
- 기존 모놀리식 앱 앞에 API Gateway·VPC Link·Route 53 자원을 자동 구성해, 마이크로서비스를 점진적으로 추가하면서 트래픽을 부분 전환
- 결국 모놀리식을 모두 새 마이크로서비스로 교체

---

## 🧠 알아두면 좋은 심화 이론

### 시험에서 자주 헷갈리는 매핑

| 상황 시나리오 | 정답 도구 |
|-------------|----------|
| "수천 대 인벤토리 자동 발견" | **ADS** + Migration Hub |
| "마이그레이션 5년 TCO 계산해서 임원에게 보고" | **Migration Evaluator** |
| "VMware vCenter 환경 무에이전트 발견" | **ADS Agentless Collector** |
| ".NET Framework 4.6 → .NET 8 포팅 평가" | **Porting Assistant for .NET** |
| "윈도우 Server 2008 EoS — AWS로 안전 이전" | **EMP** (End-of-Support Migration) |
| "Tomcat Java 앱을 EKS 컨테이너로" | **App2Container** |
| "모놀리식을 마이크로서비스로 점진적 교체" | **Refactor Spaces** |
| "마이그레이션 펀딩 + 컨설팅 + 전사 프로그램" | **MAP** |
| "여러 도구의 마이그레이션 진행률 통합 뷰" | **Migration Hub** |
| "EC2 통째로 옮기기 (Rehost)" | **MGN** (Day 27) |
| "DB 이전(이종 포함)" | **DMS + SCT** (Day 28) |

### A2C의 함정

- A2C는 **앱 코드 자체를 cross-platform으로 만들지 못한다** — Windows IIS 앱은 Windows Container로 나옴
- 컨테이너화 후 동작 검증은 워크로드 수동 테스트 필요
- **DB는 별도 마이그레이션**해야 함 (A2C는 앱만)

### MAP과 7R의 연결

MAP의 Migrate 단계에서 7R 전략을 적용:
- Rehost → MGN
- Replatform → MGN/DMS + 일부 매니지드 전환
- Refactor → Refactor Spaces, A2C, Porting Assistant
- Retire/Retain은 디스커버리 결과를 토대로 결정

---

## 🏗️ 아키텍처 다이어그램 — 전사 MAP 마이그레이션

```
[온프레미스 데이터센터]
   │
   │ 1. Application Discovery Service Agent 설치
   ▼
[ADS → Migration Hub 통합]
   │
   │ 2. Migration Evaluator로 TCO 리포트 → 비즈니스 케이스
   │ 3. Strategy Recommendations → 서버별 7R 권장
   ▼
[MAP Mobilize: Landing Zone (Control Tower)]
   │
   │ 4. MAP Migrate:
   │   - 단순 EC2 → MGN (Rehost)
   │   - DB → DMS + SCT (Replatform)
   │   - 레거시 앱 → App2Container (Refactor)
   │   - 모놀리식 → Refactor Spaces (Refactor)
   ▼
[AWS 운영 환경 — Multi-Account, Multi-Region]
   │
   │ 5. Migration Hub 대시보드 — 전 단계 통합 추적
   ▼
[Optimize: Compute Optimizer / Cost Anomaly Detection]
```

---

## ⭐ 핵심 포인트

1. ⭐ **App2Container = Tomcat/IIS 앱 → 컨테이너** (앱만, DB는 별도)
2. ⭐ **Porting Assistant = .NET Framework → .NET Core 코드 포팅 분석**
3. ⭐ **MAP = 프로그램(자금+컨설팅+도구) — 3단계: Assess/Mobilize/Migrate**
4. ⭐ **Migration Hub = 마이그레이션 통합 대시보드 + Strategy Recommendations**
5. ⭐ **ADS = 기술 인벤토리**, **Migration Evaluator = 재무 TCO**
6. ⭐ **Refactor Spaces = Strangler Fig 매니지드 (모놀리식 점진 교체)**
7. ⭐ **EMP = Windows Server 2003/2008 EoS 안전 이전 (호환성 패키지)**

---

## 💻 실제 예시 - A2C CLI 흐름

```bash
# 1. A2C 초기화
sudo app2container init

# 2. 워커 머신에서 실행 중인 앱 인벤토리
sudo app2container inventory

# 3. 특정 앱 분석
sudo app2container analyze --application-id java-app-id

# 4. 추출 (war + 의존성)
sudo app2container extract --application-id java-app-id

# 5. 컨테이너화 (Dockerfile + 이미지 빌드 + ECR push)
sudo app2container containerize --application-id java-app-id

# 6. 배포 매니페스트 생성 (ECS/EKS)
sudo app2container generate app-deployment \
  --application-id java-app-id \
  --deploy
```

### Migration Hub 홈 리전 설정

```bash
aws migrationhub-config create-home-region-control \
  --home-region ap-northeast-2 \
  --target Type=ACCOUNT,Id=123456789012
```

### ADS 에이전트 설치 (Linux)

```bash
curl -O https://s3-us-west-2.amazonaws.com/aws-discovery-agent.us-west-2/linux/latest/aws-discovery-agent.tar.gz
tar -xzf aws-discovery-agent.tar.gz
sudo bash install -r ap-northeast-2 -k <access-key> -s <secret-key>
```

---

## 📝 연습 문제

**문제 1.** 온프레미스에서 동작 중인 Tomcat 기반 Java 웹앱을 운영 중단을 최소화하면서 EKS로 옮기고 싶다. 가장 효율적인 도구는?

A) AWS Application Migration Service(MGN)
B) AWS App2Container
C) AWS Porting Assistant for .NET
D) AWS Refactor Spaces

**정답: B**
해설: A2C는 Java(Tomcat/JBoss/WebSphere/WebLogic) 및 .NET IIS 앱을 자동으로 분석해 Docker 이미지 + ECS/EKS 매니페스트를 생성한다. MGN은 VM 통째 Rehost, Porting Assistant는 .NET 포팅 분석 도구다.

---

**문제 2.** 회사가 5,000대 서버를 18개월 안에 AWS로 이전한다. 임원진에게 보고할 마이그레이션 5년 TCO 비교 리포트가 필요하다. 무엇을 사용해야 하나?

A) Application Discovery Service
B) Migration Evaluator
C) AWS Pricing Calculator
D) Cost Explorer

**정답: B**
해설: Migration Evaluator(구 TSO Logic)는 마이그레이션 비즈니스 케이스용 TCO 리포트 도구다. ADS는 기술 인벤토리, Pricing Calculator는 신규 워크로드 견적, Cost Explorer는 이미 사용 중인 AWS 비용 분석이다.

---

**문제 3.** .NET Framework 4.6 모놀리식 ASP.NET 앱을 .NET 8 (cross-platform)로 포팅하기 전 호환성을 평가하고 싶다. 가장 적합한 도구는?

A) App2Container
B) Porting Assistant for .NET
C) Refactor Spaces
D) End-of-Support Migration Program

**정답: B**
해설: Porting Assistant for .NET은 .NET Framework → .NET Core/.NET 8 포팅 시 호환되는/호환되지 않는 API와 NuGet 패키지를 식별해준다. A2C는 OS 그대로 컨테이너화하는 도구로 포팅과는 다르다.

---

**문제 4.** 회사가 전사 마이그레이션 프로그램을 시작하고 싶다. AWS의 자금 인센티브와 컨설팅 파트너 지원을 받고 싶다. 어떤 것을 사용해야 하나?

A) AWS Migration Hub
B) AWS Migration Acceleration Program (MAP)
C) AWS Trusted Advisor
D) AWS Professional Services 단독 계약

**정답: B**
해설: MAP은 Assess/Mobilize/Migrate 3단계로 자금 + 도구 + 파트너를 통합 제공하는 프로그램이다. Migration Hub는 진행률 대시보드 도구일 뿐 펀딩 프로그램이 아니다.

---

**문제 5.** 여러 도구(MGN, DMS, 파트너 도구)로 진행 중인 마이그레이션의 전체 진행률을 한 콘솔에서 보고 싶다. 무엇이 적합한가?

A) CloudWatch Dashboards
B) AWS Migration Hub
C) AWS Config
D) AWS Systems Manager OpsCenter

**정답: B**
해설: Migration Hub는 다양한 마이그레이션 도구의 진행 상황을 통합 트래킹하는 대시보드다. 홈 리전을 선택해 모든 디스커버리·마이그레이션 작업이 거기 모인다.

---

**문제 6.** VMware vCenter 환경 1,200대 VM의 자원 사용량·네트워크 의존성을 에이전트 설치 없이 자동 수집하려 한다. 어떤 도구가 적합한가?

A) ADS Discovery Agent
B) ADS Agentless Collector (vCenter 통합)
C) AWS Systems Manager
D) AWS Inspector

**정답: B**
해설: ADS는 두 가지 수집 모드를 제공한다. Agentless는 vCenter에 가상 어플라이언스를 띄워 무에이전트로 수집하고, Agent 모드는 각 OS에 에이전트를 설치한다. vCenter 환경엔 Agentless가 권장된다.

---

**문제 7.** 거대 모놀리식 .NET 앱을 점진적으로 마이크로서비스로 교체하려 한다. 기존 모놀리식과 새 마이크로서비스 사이의 라우팅을 매니지드로 처리하고 싶다. 어떤 서비스를 사용하나?

A) ALB + Target Group 직접 구성
B) AWS Migration Hub Refactor Spaces
C) AWS App Mesh
D) API Gateway + Lambda 직접 구성

**정답: B**
해설: Refactor Spaces는 Strangler Fig 패턴을 매니지드로 제공한다. API Gateway·VPC Link·Route 53 자원을 자동 구성하고 트래픽 점진 전환을 지원한다.

---

## 📌 오늘의 요약

1. **A2C** = Java/IIS 앱을 컨테이너화 (앱 코드는 그대로)
2. **Porting Assistant** = .NET Framework → .NET 8 포팅 분석
3. **MAP** = 3단계 마이그레이션 프로그램 (Assess/Mobilize/Migrate, 자금 인센티브)
4. **Migration Hub** = 통합 대시보드 + Strategy Recommendations
5. **ADS = 기술**, **Migration Evaluator = 재무**, **EMP = Win EoS**
6. **Refactor Spaces** = Strangler Fig 매니지드
7. 도구 매핑을 외워 시나리오에 즉시 맞추는 것이 Pro 시험의 핵심

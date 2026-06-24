# Day 1 - 7R 마이그레이션 전략: 클라우드 이전의 의사결정 언어

"클라우드로 이전한다"는 말은 생각보다 불명확하다. 서버를 그대로 옮기는 것인가, DB 엔진을 바꾸는 것인가, 아키텍처 자체를 다시 설계하는 것인가. 2010년대 초 Gartner가 처음 클라우드 마이그레이션 전략을 5R로 정리했고, AWS가 여기에 Relocate와 Refactor를 보강해 7R 프레임워크를 제안했다. 오늘날 엔터프라이즈 마이그레이션 프로젝트는 대부분 이 7R을 의사결정 언어로 사용한다.

SAP-C02 도메인 3(마이그레이션·현대화)은 단순히 도구 이름을 외우는 것이 아니다. 시나리오에서 "어떤 R이 맞는가"를 판단하고, 그 R에 해당하는 도구를 즉각 매핑하는 능력이다. 7R은 연속 스펙트럼이며, 각각이 다른 노력·비용·ROI·리스크를 가진다.

## 7R 프레임워크: 스펙트럼으로 이해하기

7R은 "변화의 크기" 순서로 정렬된다.

```
변화 없음 ◄─────────────────────────────────────────► 완전 재설계
Retire | Retain | Relocate | Rehost | Repurchase | Replatform | Refactor
```

| R | 정의 | 변화 크기 | 노력 | 대표 도구 | ROI 발현 시점 |
|---|------|---------|------|----------|------------|
| **Retire** | 더 이상 필요 없는 시스템 폐기 | 없음 | 최소 | ADS 발견 후 결정 | 즉시 (비용 제거) |
| **Retain** | 현재 그대로 유지 (On-Prem) | 없음 | 없음 | — | 없음 |
| **Relocate** | 하이퍼바이저 그대로 이전 | 인프라 위치만 | 최소 | VMware Cloud on AWS | 빠름 (1-3개월) |
| **Rehost** | Lift-and-Shift, OS·앱 유지 | 인프라 위치만 | 낮음 | AWS MGN | 빠름 (1-6개월) |
| **Repurchase** | SaaS 솔루션으로 교체 | 플랫폼 완전 교체 | 중간 | SaaS 구매 | 중기 (운영비 감소) |
| **Replatform** | 일부 컴포넌트 매니지드로 전환 | 일부 변경 | 중간 | MGN + DMS/SCT | 중기 (운영 효율) |
| **Refactor** | 클라우드 네이티브 재설계 | 완전 변경 | 높음 | A2C, Refactor Spaces | 장기 (최대 ROI) |

> 💡 **관련 이론**: Strangler Fig 패턴(Martin Fowler, 2004)은 레거시 시스템을 한 번에 교체하지 않고 점진적으로 새로운 서비스로 "감싸" 결국 대체하는 패턴이다. 이름은 열대우림의 교살 무화과(Strangler Fig)에서 왔다. 숙주 나무를 감싸며 성장해 결국 숙주가 죽으면 혼자 서 있게 된다. Refactor 전략의 리스크 완화 방법으로, Refactor Spaces가 이 패턴을 매니지드로 제공한다.

> 📚 **사례**: Capital One의 AWS 이전 (2019). 미국 최대 은행 중 하나인 Capital One은 2012년부터 AWS 이전을 시작해 2019년 데이터센터 완전 폐쇄를 선언했다. 7년간의 여정에서 단순 Rehost부터 시작해 점진적으로 Refactor로 이동했다. 결과: 배포 주기 75% 단축, 인프라 비용 35% 감소. 교훈: 7R은 전략이지 한 번의 선택이 아니다. 시스템마다 다른 R을 선택하고 시간이 지나면서 이동한다.

## 각 R의 상세 분석

### Retire: 폐기의 가치

마이그레이션 평가에서 가장 간과되는 R이다. ADS(Application Discovery Service)로 실제 사용 현황을 보면, 많은 기업의 포트폴리오에서 10-30%의 시스템이 실제로 사용되지 않거나 사용이 극히 적다.

Retire 후보 식별 기준:
- CPU 평균 < 5%, 네트워크 트래픽 거의 없음
- 마지막 사용자 로그인이 6개월 이상 전
- 명확한 소유자·사용 목적 불명확
- 동일 기능을 다른 시스템이 이미 제공

> ⚠️ **함정**: Retire는 "폐기"이지 "마이그레이션 없이 온프레 유지"가 아니다. 마이그레이션 없이 온프레에 두는 것은 Retain이다. 시험에서 "사용하지 않는 시스템을 어떻게 처리하는가?" → Retire(폐기), "마이그레이션 ROI가 낮아 이전을 보류하는 시스템" → Retain(유지).

### Retain: 유지의 전략적 선택

Retain은 포기나 실패가 아니다. 전략적 선택이다. 다음 경우에 적합하다:
- 규제상 데이터 온프레 요건 (일부 국가 금융 규제)
- 마이그레이션 비용 > 마이그레이션 후 절감액
- 최근 대규모 온프레 투자 (감가상각 기간 내)
- 기술적 마이그레이션 경로 불명확 (예: 메인프레임)

> 🔍 **더 깊이**: Retain은 영구 전략이 아니다. 규제 변화, 계약 만료, 비즈니스 변화로 Retain에서 다른 R로 이동한다. 마이그레이션 평가 시 "왜 Retain인가"의 이유를 문서화하고 12-18개월마다 재검토하는 것이 AWS MAP 프로그램의 모범 사례다.

### Relocate: VMware의 특수 케이스

Relocate는 VMware 환경에서만 실질적 의미가 있다. VMware Cloud on AWS(VMC)는 AWS 베어메탈 서버 위에 VMware vSphere/NSX/vSAN 스택을 그대로 올려 운영한다. 고객은 기존 VMware 도구(vCenter, vSphere, NSX)를 그대로 사용하면서 AWS 인프라 위에서 실행된다.

Relocate의 장점:
- vMotion으로 무중단 마이그레이션
- 기존 VMware 라이선스·도구·스킬 그대로 활용
- AWS 서비스(S3, RDS, Lambda)와 통합 가능

Relocate의 한계:
- AWS 네이티브 서비스의 완전한 활용이 제한됨
- VMware 라이선스 비용 지속 발생
- 장기적으로 Rehost 또는 Refactor로 이동 권장

### Rehost (Lift-and-Shift): 속도 우선

Rehost는 가장 빠른 마이그레이션 경로다. OS, 미들웨어, 애플리케이션 코드를 전혀 바꾸지 않고 EC2로 옮긴다. 도구: **AWS Application Migration Service(MGN)**. MGN은 블록 레벨 복제로 원본 서버와 동일한 EC2 인스턴스를 생성한다.

Rehost는 "클라우드 여정의 첫 단계"다. 일단 클라우드로 가고 나서 점진적으로 Replatform·Refactor로 이동하는 전략이 현실적이다.

> 💡 **관련 이론**: Pace-Layer 전략(Gartner). 시스템을 변화 속도에 따라 계층화해 각각 다른 전략을 적용한다. 빠르게 변하는 혁신 계층(신규 앱) → Refactor, 중간 속도 (업무 앱) → Replatform, 느리게 변하는 기록 계층(ERP, 메인프레임) → Rehost 또는 Retain. 모든 것을 동일 속도로 이전하려는 "빅뱅" 마이그레이션의 실패 원인이 바로 이 Pace-Layer를 무시하는 것이다.

### Repurchase: SaaS 전환

온프레 또는 IaaS로 운영 중인 애플리케이션을 SaaS 솔루션으로 교체한다.

| 온프레 시스템 | SaaS 대체 |
|------------|---------|
| 자체 CRM | Salesforce |
| 자체 이메일 서버 | Microsoft 365, Google Workspace |
| 자체 HR 시스템 | Workday |
| 자체 콘택트 센터 | Amazon Connect |
| 자체 LMS | Cornerstone, Docebo |

Repurchase의 시험 단서: "운영 부담 최소화", "IT 직원이 핵심 비즈니스에 집중", "레거시 소프트웨어 라이선스 절감".

> ⚠️ **함정**: Repurchase는 데이터 마이그레이션과 프로세스 변경이 필요하다. "운영 부담이 없다"고 생각하기 쉽지만, 기존 데이터를 SaaS로 이전하고 직원 재교육을 하는 비용이 상당하다. 단기 비용은 높고 장기 ROI가 큰 전략이다.

### Replatform: 핵심 아키텍처 유지, 일부 최적화

코드를 바꾸지 않고 인프라 레이어의 일부를 매니지드 서비스로 교체한다.

주요 Replatform 패턴:

| 원본 | 대상 | 이점 |
|-----|------|-----|
| Oracle DB on EC2 | Aurora PostgreSQL (DMS + SCT) | 라이선스 비용 절감, 매니지드 |
| MySQL on EC2 | Amazon RDS MySQL | 자동 백업, HA, 패치 |
| Tomcat on EC2 | AWS Elastic Beanstalk | 플랫폼 관리 자동화 |
| Redis on EC2 | ElastiCache for Redis | 매니지드 클러스터 |
| Windows Server | AWS에서 Windows EC2 (OS 업그레이드) | 라이선스 최적화 |

Replatform이 적합한 시나리오 단서: "DB 운영 부담 감소", "OS 패치·백업 자동화", "엔진 교체로 비용 절감", "최소한의 코드 변경".

> 📚 **사례**: GE(General Electric)의 Oracle → Aurora 마이그레이션 (2018). GE는 수십 개 Oracle DB 인스턴스를 Aurora PostgreSQL로 Replatform했다. Oracle Enterprise 라이선스 비용만으로 연간 수백만 달러를 절감했다. SCT가 PL/SQL 스토어드 프로시저의 약 70%를 자동 변환하고 나머지는 수동 수정했다. 교훈: 이종 DB 마이그레이션은 스키마 변환 자동화율이 70-80%이고 나머지는 수동 작업이 필요하다는 현실적 기대치를 가져야 한다.

### Refactor (Re-Architect): 가장 큰 ROI, 가장 큰 리스크

모놀리식 앱을 마이크로서비스로, VM 기반을 컨테이너·서버리스로 재설계한다. 코드 레벨의 변경이 필요하다.

Refactor 도구 생태계:

| 시나리오 | 도구 |
|---------|------|
| Java/IIS 앱 → 컨테이너 | App2Container (A2C) |
| .NET Framework → .NET Core | Porting Assistant for .NET |
| 모놀리식 → 마이크로서비스 점진 | Refactor Spaces |
| EoS Windows 2003/2008 → 안전 이전 | End-of-Support Migration Program |
| 신규 서버리스 아키텍처 | Lambda + API Gateway + DynamoDB |

## 7R 결정 트리 (시험 즉답용)

```
시스템 평가 시작
│
├─ 더 이상 사용 안 하는가? → YES → Retire (폐기)
│
├─ 마이그레이션 ROI 없음, 기술 제약? → YES → Retain (유지)
│
├─ VMware vCenter 환경 그대로 이전? → YES → Relocate (VMC)
│
├─ 빠른 클라우드 진입, 변경 최소? → YES → Rehost (MGN)
│
├─ SaaS가 더 적합한 기능인가? → YES → Repurchase
│
├─ DB/OS 변경으로 비용·운영 개선? → YES → Replatform (DMS+SCT)
│
└─ 클라우드 네이티브 최대 활용? → YES → Refactor (A2C, Serverless)
```

## 마이그레이션 프로세스: 5단계 여정

클라우드 마이그레이션은 도구 실행이 아니라 프로세스다. AWS는 표준 5단계를 제시한다.

```
1. Discovery (발견)
   └── ADS, Migration Evaluator, 수동 인터뷰
   └── 서버 인벤토리, 의존성, TCO 데이터 수집

2. Assess (평가)
   └── 7R 결정, 우선순위, 종속성 분석
   └── MRA(Migration Readiness Assessment)

3. Mobilize (준비)
   └── Landing Zone (AWS Control Tower)
   └── 네트워크 (VPC, Direct Connect, VPN)
   └── 보안·거버넌스 (SCP, IAM Identity Center)
   └── PoC 마이그레이션

4. Migrate (이전)
   └── Wave 계획 (의존성 기반 배치)
   └── MGN, DMS, A2C, DataSync, Snow Family
   └── 검증·컷오버

5. Optimize (최적화)
   └── Right-Sizing (Compute Optimizer)
   └── Reserved Instances, Savings Plans
   └── 모니터링·비용 최적화
```

> 🔍 **더 깊이**: Wave 계획의 중요성. 1000대 서버를 한 번에 이전하는 "빅뱅"은 실패 위험이 높다. 의존성 맵을 기반으로 Wave(배치)를 만든다. Wave 1: 단독 동작하는 웹 서버 (의존성 최소). Wave 2: Wave 1에 의존하는 앱 서버. Wave 3: DB 서버. 이 순서가 반전되면 앱 서버가 이전된 후 DB가 온프레에 남아 레이턴시 폭증이 생긴다. ADS의 네트워크 의존성 데이터(TCP 연결 분석)가 Wave 설계의 근거가 된다.

## 마이그레이션 가속 도구 매핑

| 목적 | 도구 | 키워드 |
|-----|------|-------|
| 서버 인벤토리·의존성 발견 | **ADS** (Application Discovery Service) | "온프레 인벤토리 자동 수집" |
| 재무 TCO 분석 | **Migration Evaluator** | "5년 TCO 리포트", "임원 보고" |
| 서버 Rehost | **MGN** (Application Migration Service) | "lift-and-shift", "VM → EC2" |
| DB 마이그레이션 | **DMS + SCT** | "Oracle → Aurora", "이종 엔진" |
| 컨테이너화 | **App2Container** | "Tomcat/IIS → 컨테이너" |
| 전사 프로그램 | **MAP** | "AWS 자금", "파트너 지원" |
| 진행률 통합 대시보드 | **Migration Hub** | "통합 추적", "홈 리전" |

## AWS MAP (Migration Acceleration Program)

MAP은 도구가 아닌 **프로그램**이다. 대규모 마이그레이션(1,000대+ 서버 또는 $100K+ 예상 AWS 비용)을 대상으로 AWS가 자금·전문가·도구를 패키지로 제공한다.

| 단계 | 명칭 | 활동 | 인센티브 |
|-----|------|-----|--------|
| 1 | **Assess** | MRA, 비즈니스 케이스 | 파트너 펀딩 |
| 2 | **Mobilize** | Landing Zone, PoC | AWS 마이그레이션 크레딧 |
| 3 | **Migrate & Modernize** | 실제 이전·최적화 | 사용량 환급 (Migration Credits) |

> 🎯 **시나리오**: "1,500대 서버를 18개월 내 이전, 임원진에게 TCO 보고 필요, AWS 전문가 지원과 자금 인센티브 원함" → 답: MAP + Migration Evaluator. MAP은 자금·컨설팅·도구 패키지 프로그램, Migration Evaluator는 TCO 리포트 도구.

## 비교: Replatform vs Refactor의 경계

시험에서 가장 헷갈리는 구분이다.

| 기준 | Replatform | Refactor |
|-----|-----------|---------|
| 코드 변경 | 없거나 최소 | 있음 (때로는 완전 재작성) |
| 아키텍처 변경 | 없음 | 있음 (모놀리식→MSA 등) |
| 예시 | EC2 Oracle → Aurora (DMS) | 모놀리식 → Lambda + DynamoDB |
| 기간 | 주~월 | 월~년 |
| 리스크 | 중간 | 높음 |

경계가 모호한 케이스: "Java 앱을 Tomcat → App2Container → EKS로". 코드는 안 바꿨지만 컨테이너화는 했다 → **Refactor에 가까운 Replatform** 또는 Refactor로 분류. 시험에서는 App2Container의 주목적이 "코드 없이 컨테이너화"이므로 Refactor 도구로 분류한다.

## 📝 연습 문제

**문제 1.** 한 기업이 1,200대 물리 서버와 VMware VM 500대를 가지고 있다. 물리 서버는 빠르게 클라우드로 옮기고 싶고, VMware 환경은 기존 vCenter·vMotion을 그대로 쓰고 싶다. 각각 어떤 R이 가장 적합한가?

A) 물리 서버: Rehost, VMware: Rehost
B) 물리 서버: Rehost (MGN), VMware: Relocate (VMware Cloud on AWS)
C) 물리 서버: Refactor, VMware: Retain
D) 둘 다 Repurchase

**정답: B**
해설: 물리 서버를 코드 변경 없이 빠르게 EC2로 이전 = Rehost(MGN). VMware 환경을 vCenter·vMotion 그대로 이전 = Relocate(VMware Cloud on AWS). Relocate는 VMware vSphere 환경에 특화된 R이다.

---

**문제 2.** ADS가 발견한 서버 200개 중 50개가 CPU 평균 2%, 트래픽 없음, 마지막 로그인 1년 전임이 확인됐다. 이 서버들에 어떤 R을 적용해야 하는가?

A) Retain (이전 비용 ROI 없음)
B) Retire (폐기)
C) Rehost (일단 클라우드로)
D) Repurchase (SaaS 교체)

**정답: B**
해설: 사용하지 않는 시스템 = Retire. Retain은 "이유가 있어서 온프레에 두는 것"이고, 사용이 없는 시스템을 온프레에 두는 것은 불필요한 비용이다. 폐기가 가장 직접적인 비용 절감 방법이다.

---

**문제 3.** 한 제조사가 Oracle DB 100TB를 AWS로 이전하려 한다. Oracle Enterprise 라이선스 비용을 없애고 싶고, 애플리케이션 코드는 건드리지 않으려 한다. 스토어드 프로시저도 자동 변환을 원한다. 어떤 R과 도구가 적합한가?

A) Rehost (MGN), Oracle on EC2
B) Replatform (SCT + DMS → Aurora PostgreSQL)
C) Refactor (완전 재설계)
D) Retain (Oracle 라이선스 유지)

**정답: B**
해설: DB 엔진 교체(Oracle → Aurora PG) + 코드 변경 없음 = Replatform. SCT로 스키마·PL/SQL 변환, DMS Full Load + CDC로 무중단 이전. Rehost는 EC2에서 Oracle을 계속 쓰므로 라이선스 비용 유지.

---

**문제 4.** 한 회사의 자체 CRM 시스템이 레거시 코드베이스라 유지 비용이 높다. 기능 자체는 상용 CRM SaaS와 동일하다. 어떤 R이 가장 적합한가?

A) Rehost
B) Replatform
C) Repurchase (예: Salesforce)
D) Refactor

**정답: C**
해설: 상용 SaaS로 대체 가능한 기능 = Repurchase. CRM은 Salesforce·HubSpot 등 성숙한 SaaS가 있다. Repurchase는 IT 팀의 유지보수 부담을 없애고 벤더에 맡기는 전략이다.

---

**문제 5.** 전사 5,000대 서버 마이그레이션을 18개월 내 완료해야 한다. AWS 자금 지원, 전문가 컨설팅, 파트너 생태계를 모두 활용하고 싶다. 어떤 것을 이용해야 하는가?

A) AWS Trusted Advisor
B) AWS Migration Acceleration Program (MAP)
C) AWS Control Tower만으로 충분
D) AWS Personal Health Dashboard

**정답: B**
해설: 대규모 마이그레이션 + AWS 자금 + 파트너 컨설팅 = MAP. MAP은 3단계 프로그램(Assess/Mobilize/Migrate)으로 자금 인센티브·크레딧·도구를 패키지로 제공한다. Trusted Advisor와 Control Tower는 개별 도구지 프로그램이 아니다.

---

**문제 6.** ADS로 수집한 데이터를 바탕으로 임원진에게 "온프레 유지 vs AWS 이전 5년 비용 비교 리포트"를 제출해야 한다. 어떤 도구를 사용하는가?

A) AWS Cost Explorer
B) AWS Migration Evaluator (구 TSO Logic)
C) AWS Pricing Calculator
D) AWS Compute Optimizer

**정답: B**
해설: 마이그레이션 재무 비즈니스 케이스 = Migration Evaluator. 온프레 현황 비용 vs AWS 이전 후 5년 TCO를 비교하는 표준 도구다. Cost Explorer는 이미 사용 중인 AWS 비용 분석, Pricing Calculator는 신규 워크로드 견적이다.

---

**문제 7.** 한 회사가 Tomcat 위 Java 웹앱을 EKS로 이전하려 한다. 소스 코드를 건드리지 않고 컨테이너 이미지와 EKS 매니페스트를 자동 생성하고 싶다. 어떤 도구가 적합한가?

A) AWS MGN (Application Migration Service)
B) AWS App2Container
C) AWS Porting Assistant for .NET
D) AWS Copilot CLI

**정답: B**
해설: 소스 코드 없이 실행 중인 Java(Tomcat) 앱을 컨테이너화 → App2Container. A2C는 실행 중인 프로세스를 분석해 Dockerfile + ECS/EKS 매니페스트를 자동 생성한다. MGN은 VM 전체를 EC2로 Rehost, Porting Assistant는 .NET Framework → .NET Core 포팅 분석이다.

---

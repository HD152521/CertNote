# Day 30 - Week 6 복습 + 시나리오 10문항

📅 날짜: Week 6 (Day 5)
🎯 주제: 마이그레이션 종합
⏱️ 학습 시간: 약 90분

---

## 📖 Week 6 핵심 정리

### 1. 7R 마이그레이션 전략 한 줄 요약
| R | 의미 | 대표 도구 | 비용·시간·가치 |
|---|------|----------|--------------|
| **Retire** | 더 이상 필요 없는 시스템 폐기 | ADS 디스커버리 | 가장 저렴, 가치 즉시 |
| **Retain** | 그대로 두기 (규제·기술적 제약) | — | 마이그레이션 없음 |
| **Relocate** | VMware Cloud on AWS로 이전 | VMC | 가장 빠름·코드 변경 0 |
| **Rehost** (Lift & Shift) | OS·앱 그대로 EC2로 | **MGN** | 가장 흔함 |
| **Replatform** | 일부 매니지드 전환 (예: MySQL → RDS) | DMS, MGN | 중간 가치·중간 노력 |
| **Repurchase** | SaaS로 교체 | (구매) | 운영 부담↓ |
| **Refactor** | 클라우드 네이티브로 재설계 | A2C, Refactor Spaces, Porting Assistant | 가장 큰 가치·가장 큰 노력 |

### 2. MGN — Application Migration Service
- Rehost 표준 도구. AWS Replication Agent를 소스에 설치 → 블록 레벨 복제 → 테스트 인스턴스 부팅 → 컷오버
- **CloudEndure Migration의 후속** (현재 단일 도구)
- 컷오버 RPO 분 단위, 다운타임 단 몇 분
- **MGN은 EC2 통째**, **DMS는 DB만**

### 3. DMS — Database Migration Service
- 동종(MySQL → RDS MySQL): DMS만으로 OK
- 이종(Oracle → Aurora PG): **SCT + DMS**
- **Full Load + CDC**로 무중단 컷오버
- 대상으로 S3·Kinesis·Redshift 가능 (분석 파이프라인)
- DMS Serverless로 운영 부담↓
- **Babelfish** = SQL Server TDS 호환 Aurora PG (코드 변경 최소)

### 4. App2Container / Porting Assistant / EMP
| 도구 | 적용 |
|------|------|
| **A2C** | Tomcat/JBoss/WebLogic + IIS .NET → 컨테이너 |
| **Porting Assistant** | .NET Framework → .NET 8 코드 포팅 분석 |
| **EMP** | Windows Server 2003/2008 → AWS 안전 이전 |
| **Refactor Spaces** | 모놀리식 → 마이크로서비스 점진 교체 (Strangler Fig) |

### 5. MAP — Migration Acceleration Program
- 3단계: Assess(MRA) → Mobilize(Landing Zone) → Migrate(7R)
- 펀딩·크레딧·파트너 통합 프로그램 — 도구가 아닌 프로그램

### 6. Migration Hub + ADS + Migration Evaluator
- **Migration Hub** = 통합 대시보드 (홈 리전 필요)
- **ADS** = 기술 인벤토리 (Agentless vCenter / Agent)
- **Migration Evaluator** = 재무 TCO 리포트

---

## 🔄 핵심 비교표

| A | B | 차이 |
|---|---|------|
| **Rehost (MGN)** vs **Replatform** | OS 그대로 EC2 vs 일부 매니지드 전환 | 가치 vs 속도 |
| **MGN** vs **DMS** | EC2 전체 vs DB만 | 워크로드 단위 |
| **동종 DMS** vs **이종 DMS+SCT** | 스키마 변환 불필요 vs SCT 변환 필요 | 엔진 호환 |
| **A2C** vs **Porting Assistant** | 컨테이너화 vs 코드 포팅 | OS·런타임 변경 여부 |
| **ADS** vs **Migration Evaluator** | 기술 인벤토리 vs 재무 TCO | 의사결정 차원 |
| **Migration Hub** vs **MAP** | 도구·대시보드 vs 프로그램(펀딩) | 도구 vs 프로그램 |
| **VMC on AWS (Relocate)** vs **MGN (Rehost)** | 하이퍼바이저 그대로 vs EC2 | 가장 빠른 vs 클라우드 네이티브 |

---

## 📝 시나리오 10문항

---

**문제 1.** 회사는 6개월 안에 1,000대의 VMware vSphere VM을 AWS로 이전해야 한다. 코드 변경은 불가능하다. 운영 우수성과 인프라 유연성을 모두 고려할 때 어떤 전략이 가장 적합한가?

A) Refactor — 모든 앱을 Lambda·Fargate로 재설계
B) Relocate — VMware Cloud on AWS 사용
C) Repurchase — 동등 SaaS로 교체
D) Retire — 모두 폐기

**정답: B**
해설: VMware Cloud on AWS는 하이퍼바이저를 그대로 유지한 채 AWS 인프라 위로 이전한다. 6개월 + 코드 변경 불가 + 빠른 이전 = Relocate. Refactor는 시간 부족, Repurchase·Retire는 일괄 적용 비현실적이다.

---

**문제 2.** 1TB 미만의 PostgreSQL DB를 운영 중인 회사가 RDS PostgreSQL로 무중단 이전하려 한다. 다운타임은 5분 이내여야 한다. 가장 적합한 전략은?

A) pg_dump → 새 RDS에 복원
B) DMS Full Load + CDC, 동기 후 컷오버
C) Snowball Edge로 데이터 전송
D) AWS Backup으로 복구

**정답: B**
해설: DMS Full Load + CDC는 원본을 운영하면서 변경 분을 실시간 동기하므로 컷오버 시 다운타임을 분 단위로 줄일 수 있다. pg_dump는 다운타임이 크고, Snowball은 무중단 이전 도구가 아니다.

---

**문제 3.** 5,000대 서버 마이그레이션을 18개월에 진행한다. 임원진에게 5년 TCO 리포트와 AWS 펀딩·파트너 지원을 받고 싶다. 어떤 조합이 옳은가?

A) Migration Hub + Trusted Advisor
B) Migration Evaluator + MAP
C) Cost Explorer + Compute Optimizer
D) AWS Pricing Calculator + AWS Activate

**정답: B**
해설: Migration Evaluator로 5년 TCO 비즈니스 케이스를 만들고, MAP을 통해 펀딩·파트너·도구를 통합 제공받는다. Trusted Advisor·Cost Explorer는 운영 중 비용 분석, Activate는 스타트업 프로그램이다.

---

**문제 4.** 자사 윈도우 IIS 위에 운영 중인 .NET Framework 4.6 ASP.NET 모놀리식을 운영 중단 최소화하면서 ECS로 컨테이너화하고 싶다. 가장 효율적인 도구는?

A) Porting Assistant for .NET
B) App2Container
C) Refactor Spaces
D) AWS Copilot CLI

**정답: B**
해설: A2C는 IIS .NET Framework 앱을 Windows Container 이미지로 자동 변환해 ECS/EKS 매니페스트까지 만들어준다. Porting Assistant는 코드를 .NET Core로 포팅하는 분석 도구, Refactor Spaces는 점진 교체 패턴이다.

---

**문제 5.** Oracle Enterprise Edition 라이선스 비용 절감을 위해 Aurora PostgreSQL로 이전하려 한다. 무중단으로 진행해야 하고 스토어드 프로시저 변환도 필요하다. 가장 적합한 단계는?

A) DMS만 실행
B) SCT로 스키마·PL/SQL 변환 → DMS Full Load + CDC → 검증·컷오버
C) Babelfish로 그대로 마이그
D) pg_dump → 수동 변환

**정답: B**
해설: 이종 엔진 + PL/SQL 변환 + 무중단 = SCT + DMS Full Load + CDC 표준 패턴. Babelfish는 SQL Server 호환이지 Oracle은 아니다.

---

**문제 6.** SQL Server 위 .NET 앱을 코드 변경 최소화하면서 AWS의 비용·운영 이점을 누리고 싶다. 어떤 옵션이 가장 적합한가?

A) Aurora PostgreSQL Babelfish
B) RDS for SQL Server (BYOL)
C) DynamoDB
D) DocumentDB

**정답: A**
해설: Babelfish는 SQL Server TDS 프로토콜과 T-SQL을 Aurora PostgreSQL이 이해할 수 있도록 변환해, 앱 코드를 거의 그대로 두고 라이선스 비용을 절감한다.

---

**문제 7.** 거대 모놀리식 자바 앱이 있다. 마이크로서비스로 점진적으로 분해하는 동안 기존 모놀리식과 새 서비스 사이의 라우팅을 매니지드 솔루션으로 처리하고 싶다. 어떤 서비스를 사용하나?

A) AWS App Mesh
B) AWS Migration Hub Refactor Spaces
C) API Gateway + Lambda 직접 구성
D) AWS Cloud Map

**정답: B**
해설: Refactor Spaces는 Strangler Fig 패턴 매니지드 구현. API Gateway·VPC Link·Route 53 자원을 자동 구성하고 점진 트래픽 전환을 지원한다.

---

**문제 8.** 1,200대 VMware vCenter 환경의 자원 사용·네트워크 의존성을 무에이전트로 수집하려 한다. 어떤 도구를 사용해야 하나?

A) ADS Discovery Agent
B) ADS Agentless Collector
C) Systems Manager Inventory
D) CloudWatch Application Insights

**정답: B**
해설: vCenter 환경에는 ADS Agentless Collector가 권장된다. 가상 어플라이언스를 띄워 ESXi 메트릭·네트워크 의존성을 수집한다.

---

**문제 9.** Windows Server 2008 위에서 동작 중인 레거시 앱이 있다. MS 지원이 종료되어 AWS로 이전해야 한다. 가장 적합한 프로그램은?

A) MGN만 사용
B) End-of-Support Migration Program (EMP) + MGN
C) App2Container
D) Porting Assistant for .NET

**정답: B**
해설: EMP는 Windows Server 2003/2008 등 EoS 워크로드를 AWS 위에서 안전하게 동작시키는 호환성 패키지를 제공한다. EMP로 패키징 후 MGN으로 이전한다.

---

**문제 10.** 대규모 마이그레이션 진행 중 ▶ MGN으로 EC2 200대 이전, DMS로 DB 50개 이전, 파트너 도구로 파일서버 이전 ▶ 진행률을 임원진 대시보드 하나로 보고 싶다. 어떤 서비스를 사용하나?

A) CloudWatch Dashboards
B) AWS Migration Hub
C) AWS Systems Manager OpsCenter
D) AWS Trusted Advisor

**정답: B**
해설: Migration Hub는 여러 마이그레이션 도구의 진행 상황을 통합 트래킹하는 표준 대시보드다. 홈 리전을 선택해 모든 발견·이전 작업을 거기에 모아 본다.

---

## 📌 Week 6 한눈에 보기

```
디스커버리   ──► ADS (기술 인벤토리) + Migration Evaluator (재무 TCO)
                          │
이전 도구    ──► MGN (EC2 Rehost), DMS (DB), A2C (컨테이너화)
                          │
프로그램     ──► MAP (3단계: Assess/Mobilize/Migrate)
                          │
대시보드     ──► Migration Hub (홈 리전)
                          │
패턴         ──► Refactor Spaces (Strangler Fig)
```

다음 주(Week 7)부터는 **컨테이너 아키텍처 심화** — ECS·EKS·Fargate 선택과 Service Mesh 패턴으로 들어갑니다.

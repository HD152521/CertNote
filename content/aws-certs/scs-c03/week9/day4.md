# Day 4 - 탐지 통합: GuardDuty + Security Hub + Detective + Inspector 한 그림, 멀티계정 탐지 베이스라인

지난 사흘은 탐지 계층의 개별 도구를 봤다. GuardDuty(위협 탐지), Detective(조사), Inspector(취약점). 그런데 실제 보안 운영에서 이들은 *따로* 쓰이지 않는다 — 각자 핀딩을 쏟아내면 분석가는 네 개의 콘솔을 오가며 같은 사건을 네 번 본다. 오늘의 주제는 이 도구들을 **하나의 일관된 탐지 아키텍처**로 묶는 것이다. 그 접착제가 **AWS Security Hub**다.

핵심 통찰: GuardDuty·Inspector·Detective·Macie·IAM Access Analyzer 등은 각자 *전문 탐지기*이고, Security Hub는 이들의 출력을 *표준 형식으로 모아 한 화면에서 우선순위화·상관·자동화*하는 **집계·오케스트레이션 허브**다. 시험은 "이 신호들을 어떻게 단일 운영 창으로 통합하는가"를 반복해서 묻는다.

## Security Hub: 집계의 중심과 ASFF

Security Hub의 두 가지 기능:

```
1) 표준 검사(Security Standards): CIS, AWS FSBP, PCI DSS, NIST 등의
   규정 준수 컨트롤을 자동 평가 → "구성이 모범에 맞나"

2) 핀딩 집계(Findings aggregation): 통합된 서비스들의 핀딩을
   ASFF(AWS Security Finding Format)로 표준화해 한곳에 모음
```

**ASFF(AWS Security Finding Format)**가 통합의 열쇠다. GuardDuty 핀딩, Inspector 발견, Macie 결과는 원래 형식이 제각각인데, Security Hub가 이를 *공통 JSON 스키마(ASFF)*로 정규화한다. 덕분에 출처가 달라도 동일한 필드(severity, resource, type)로 검색·필터·상관할 수 있다.

```
GuardDuty ─┐
Inspector ─┤
Macie     ─┼─▶ Security Hub ─(ASFF 정규화)─▶ 단일 핀딩 뷰
Access Analyzer ┤                              ├─ severity·리소스로 정렬/필터
서드파티(파트너)┘                              ├─ Insights(상관 그룹)
                                               └─ EventBridge로 발행
```

> 💡 **관련 이론**: 이것은 *SIEM/SOAR* 패러다임의 클라우드 네이티브 구현이다. SIEM(Security Information and Event Management)은 흩어진 보안 이벤트를 *정규화·집계*하고, SOAR(Security Orchestration, Automation and Response)는 그 위에서 *자동 대응*을 건다. Security Hub는 ASFF로 정규화(SIEM의 정규화 계층)하고 EventBridge·자동화 규칙으로 대응(SOAR)을 트리거한다. 표준 스키마 없이는 도구마다 다른 형식 때문에 상관·자동화가 불가능하다 — ASFF가 그 공통어다.

## 네 도구가 한 사건에서 협력하는 법

한 침해 시나리오를 통해 네 도구의 협업을 보자:

```
[사전 예방]  Inspector: "이 EC2의 OpenSSL이 critical CVE에 취약 + 인터넷 도달 가능"
                 │ (Security Hub 집계 — 우선순위 패치 대상)
                 ▼ (패치 전에 공격받음)
[탐지]       GuardDuty: "UnauthorizedAccess:EC2/SSHBruteForce → 이후 비정상 아웃바운드"
                 │ (Security Hub 집계, severity High)
                 ▼
[조사]       Detective: "이 인스턴스의 역할이 새 지역에서 IAM API 정찰 시작,
                          같은 IP가 다른 인스턴스와도 통신 — 횡적 이동 의심"
                 ▼
[대응]       Security Hub → EventBridge → Lambda/SSM:
                 인스턴스 격리 SG 이동 + 포렌식 스냅샷 + 자격증명 회수 + 티켓
```

- **Inspector**가 약점을 미리 표시(패치 우선순위).
- **GuardDuty**가 실제 공격을 탐지.
- **Detective**가 근본 원인·영향 범위를 조사.
- **Security Hub**가 이 모두를 한 화면에 모으고, **EventBridge**로 자동 대응을 트리거.

> ⚠️ **함정**: GuardDuty·Inspector 핀딩은 Security Hub에 **자동 통합**되지만, 통합을 *활성화*해야 한다(integration 켜기). 또 Security Hub가 *조사*를 하지 않고(그건 Detective), *위협 탐지*를 직접 하지 않는다(그건 GuardDuty/Inspector). Security Hub는 *집계·표준화·자동화 오케스트레이션*이다. 역할 혼동은 단골 함정이다.

## Security Hub Insights와 상관

Security Hub **Insights**는 핀딩을 특정 기준으로 그룹핑한 *저장된 필터/상관 뷰*다. 예: "퍼블릭으로 노출된 + critical severity + 특정 계정"의 핀딩을 모아 추세를 본다. 관리형 Insight도 있고 커스텀도 만든다. 이는 수천 개 핀딩에서 "지금 가장 위험한 것"을 추려내는 상관 도구다.

또 Security Hub의 **automation rules**는 핀딩 속성에 따라 자동으로 severity 조정·억제·필드 갱신을 한다(예: 알려진 테스트 계정의 핀딩은 자동 억제). 이는 경보 피로를 줄이는 운영 장치다.

## 멀티계정 탐지 베이스라인: 한 장의 청사진

엔터프라이즈 멀티계정에서 탐지 베이스라인의 권장 구성:

```
AWS Organizations
  │
  ├─ 관리 계정(management) — 위임만, 운영 부담 최소화
  │
  ├─ Security Tooling 계정 ◀── 모든 탐지 서비스의 위임 관리자 정렬
  │     ├─ GuardDuty 위임 관리자 (조직 + auto-enable)
  │     ├─ Security Hub 위임 관리자 (조직 + 표준 + 집계)
  │     ├─ Detective 위임 관리자 (단일 동작 그래프)
  │     ├─ Inspector 위임 관리자 (EC2/ECR/Lambda 지속 스캔)
  │     ├─ Macie / IAM Access Analyzer 위임 관리자
  │     └─ 중앙 EventBridge 버스 → 대응 자동화(Lambda/SSM/Step Functions)
  │
  ├─ Log Archive 계정 — CloudTrail/Config/로그 불변 보관(write-once)
  │
  └─ 워크로드 계정들 — 탐지 멤버(끄지 못함), 핀딩은 Security Tooling로 흐름
```

핵심 원칙:
- **모든 탐지 서비스의 위임 관리자를 동일한 Security Tooling 계정으로 정렬**한다(데이터·권한·조사 경험의 일관성).
- **auto-enable**로 신규 계정을 자동 포함 — 사각지대 없음.
- **Security Hub 크로스리전 집계(aggregation Region)**로 여러 리전 핀딩을 단일 리전에서 본다.
- **로그는 별도 Log Archive 계정에 불변 보관**(탐지 계정과 분리 — 권한 분리).

> 💡 **관련 이론**: 이는 AWS *Security Reference Architecture(SRA)*의 핵심 패턴이다. 보안 도구를 워크로드와 분리된 전용 계정에 위임하면 *권한 분리(separation of duties)*가 성립한다 — 워크로드 팀이 자기 탐지를 끄거나 핀딩을 지울 수 없고, 로그는 침해자가 닿지 못하는 별도 계정에 불변 보관된다. SRA는 "관리 계정에는 운영 부담을 지우지 말고 위임하라"를 강조하는데, 관리 계정은 조직 루트 권한이 집중되어 가장 보호해야 할 대상이기 때문이다.

> ⚠️ **함정**: Security Hub 핀딩은 **리전별**이다. 멀티리전 환경에서 한 리전 콘솔만 보면 다른 리전 위협을 놓친다 — **aggregation Region(집계 리전)**을 지정해 크로스리전 집계를 켜야 한다. 또 위임 관리자 지정은 *각 서비스마다* 해야 한다(GuardDuty 위임 따로, Security Hub 위임 따로). 한 번에 전부 위임되지 않는다.

## 핀딩에서 대응까지: 통합 자동화

통합 아키텍처의 출구는 항상 *자동 대응*이다:

```
Security Hub(집계) ──▶ EventBridge(custom event bus)
                          ├─▶ Lambda: 리소스 격리/태깅/자격증명 회수
                          ├─▶ SSM Automation: 패치/구성 교정
                          ├─▶ Step Functions: 다단계 대응 워크플로
                          ├─▶ SNS: 온콜 알림(Slack/PagerDuty)
                          └─▶ Jira/ServiceNow: 티켓 생성
```

Security Hub는 모든 통합 서비스의 핀딩을 단일 EventBridge 스트림으로 발행하므로, *하나의* 대응 자동화로 여러 탐지기를 커버할 수 있다 — 도구마다 자동화를 따로 짤 필요가 없다(통합의 운영 이득).

> 🔍 **더 깊이**: 통합의 진짜 가치는 "단일 창(single pane of glass)"이라는 구호가 아니라 *상관(correlation)*과 *자동화의 단일화*다. 네 도구를 따로 운영하면 (1) 같은 사건을 네 번 보고, (2) 도구별 자동화를 네 벌 유지하며, (3) 사건의 전체 그림(취약점→공격→영향)을 손으로 짜맞춰야 한다. Security Hub 중심 통합은 ASFF로 상관을, EventBridge로 자동화 단일화를, Detective 연계로 조사 깊이를 한 파이프라인에 묶는다. SCS-C03가 묻는 "best detection architecture"의 답은 거의 항상 *이 통합 패턴 + Security Tooling 계정 위임*이다.

## 자주 틀리는 구분

- **Security Hub vs GuardDuty/Inspector**: 후자는 *탐지기*(핀딩 생성), Security Hub는 *집계기·오케스트레이터*. Security Hub는 직접 위협을 탐지하지 않는다(자체 표준 검사 컨트롤은 예외적으로 평가함).
- **Security Hub vs Detective**: Security Hub는 *집계/표준화*, Detective는 *심층 조사*. 넓고 얕게 vs 좁고 깊게.
- **ASFF**: 핀딩의 *공통 스키마* — 통합·상관·자동화의 전제.
- **위임 관리자 정렬**: 모든 탐지 서비스를 *같은* Security Tooling 계정으로 — 시험의 베이스라인 정답.

## 한 줄 요약 체크리스트

- [ ] Security Hub를 켜고 GuardDuty·Inspector·Macie 등 통합을 활성화했는가
- [ ] 모든 탐지 서비스의 위임 관리자를 동일 Security Tooling 계정으로 정렬했는가
- [ ] auto-enable로 신규 계정을 자동 포함, 사각지대를 없앴는가
- [ ] aggregation Region으로 멀티리전 핀딩을 단일 리전에 집계했는가
- [ ] Security Hub → EventBridge로 대응 자동화를 단일화했는가
- [ ] 로그는 별도 Log Archive 계정에 불변 보관해 권한을 분리했는가

---

## 📝 연습 문제

**문제 1.** 보안팀이 GuardDuty, Inspector, Macie의 핀딩을 서로 다른 형식 때문에 따로따로 보고 있어 상관 분석과 자동화가 어렵다. 이들을 표준 형식으로 한곳에 모으고 단일 자동화로 대응하려면?

A) 각 서비스의 콘솔을 북마크해 번갈아 본다  
B) Security Hub를 활성화해 핀딩을 ASFF로 정규화·집계하고 EventBridge로 대응을 단일화한다  
C) Detective로 모든 핀딩을 조사한다  
D) CloudWatch Logs에 모든 핀딩을 저장한다  

**정답: B**  
해설: Security Hub는 통합 서비스들의 핀딩을 공통 스키마인 ASFF로 정규화해 한 화면에 집계하고, 단일 EventBridge 스트림으로 발행해 하나의 자동화로 여러 탐지기를 커버한다. 콘솔 북마크는 통합이 아니고, Detective는 집계가 아닌 심층 조사 도구이며, 단순 로그 저장은 표준화·상관·자동화를 제공하지 않는다.

---

**문제 2.** 50개 계정 조직에서 GuardDuty·Security Hub·Detective·Inspector를 운영할 때 권장되는 멀티계정 베이스라인은?

A) 각 탐지 서비스를 서로 다른 계정에 위임해 분산한다  
B) 모든 탐지 서비스의 위임 관리자를 동일한 Security Tooling 계정으로 정렬하고 auto-enable을 켠다  
C) 모든 탐지 서비스를 관리(management) 계정에서 직접 운영한다  
D) 워크로드 계정마다 개별로 모든 서비스를 켜고 따로 관리한다  

**정답: B**  
해설: AWS SRA 권장 패턴은 GuardDuty·Security Hub·Detective·Inspector 등 모든 탐지 서비스의 위임 관리자를 전용 Security Tooling 계정으로 정렬해 데이터·권한·조사 경험을 일관되게 하고, auto-enable로 신규 계정을 자동 포함하는 것이다. 서비스를 여러 계정에 분산하면 조사가 단절되고, 관리 계정 직접 운영은 루트 권한 집중 계정에 부담을 주며, 계정별 개별 운영은 사각지대를 낳는다.

---

**문제 3.** 멀티리전으로 운영하는 조직이 한 리전 Security Hub 콘솔만 보다가 다른 리전의 critical 핀딩을 놓쳤다. 올바른 구성은?

A) 모든 워크로드를 한 리전으로 이전한다  
B) Security Hub aggregation Region을 지정해 여러 리전의 핀딩을 단일 리전에 크로스리전 집계한다  
C) 리전마다 별도 보안팀을 둔다  
D) GuardDuty만 멀티리전으로 켠다  

**정답: B**  
해설: Security Hub 핀딩은 리전별로 존재하므로, aggregation Region(집계 리전)을 지정해 여러 리전의 핀딩을 단일 리전에서 통합 조회·관리해야 멀티리전 사각지대를 없앤다. 워크로드 이전은 비현실적이고, 리전별 팀 분리는 통합 가시성을 주지 못하며, GuardDuty만 켜는 것은 Security Hub 집계 문제를 해결하지 못한다.

---

**문제 4.** Security Hub의 역할에 대한 설명으로 가장 정확한 것은?

A) 네트워크 트래픽을 직접 검사해 악성 연결을 차단한다  
B) 통합된 탐지 서비스들의 핀딩을 ASFF로 표준화·집계하고 상관·자동화를 오케스트레이션하는 허브이며, 표준 규정 준수 컨트롤도 평가한다  
C) S3의 PII를 분류한다  
D) EBS 볼륨에서 멀웨어를 스캔한다  

**정답: B**  
해설: Security Hub는 GuardDuty·Inspector·Macie 등의 핀딩을 ASFF 공통 스키마로 정규화해 집계하고, Insights·automation rules·EventBridge로 상관과 대응 자동화를 오케스트레이션하며, CIS·FSBP 같은 표준 컨트롤도 평가한다. 트래픽 차단·PII 분류(Macie)·멀웨어 스캔(GuardDuty Malware Protection)은 다른 서비스의 역할이다.

---

**문제 5.** 통합 탐지 아키텍처에서 침해 사건이 발생했을 때 각 서비스의 역할을 올바르게 짝지은 것은?

A) Inspector=조사, GuardDuty=집계, Detective=취약점, Security Hub=차단  
B) Inspector=사전 취약점 식별, GuardDuty=위협 탐지, Detective=근본원인 조사, Security Hub=집계·자동화 오케스트레이션  
C) 모든 서비스가 동일하게 위협을 탐지하고 차단한다  
D) Security Hub=조사, Detective=집계, GuardDuty=취약점, Inspector=차단  

**정답: B**  
해설: 통합 파이프라인에서 Inspector는 악용 가능한 취약점을 사전에 식별하고, GuardDuty는 실제 위협 활동을 탐지하며, Detective는 근본 원인·영향 범위를 조사하고, Security Hub는 이 모두를 집계·표준화하고 EventBridge로 대응을 오케스트레이션한다. 나머지 보기는 역할이 뒤섞이거나 모든 서비스를 동일시해 잘못되었다.

---

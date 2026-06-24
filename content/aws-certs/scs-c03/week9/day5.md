# Day 5 - Week 9 종합: 위협 탐지 시나리오 통합 복습

이번 주는 위협 탐지(threat detection) 계층 전체를 다뤘다. GuardDuty(에이전트리스 위협 탐지), Detective(핀딩 조사·근본원인), Inspector(취약점 스캔), 그리고 Security Hub 중심의 통합 아키텍처. 오늘은 이들을 하나의 결정 체계로 묶는다. 시험은 개별 서비스 기능보다 *"이 상황에서 탐지의 어느 도구를, 어떤 역할로, 어디에 배치하는가"*를 묻는다. 핵심은 **목적(무엇을 알고 싶은가) × 통합(어떻게 한 파이프라인으로 묶는가)**의 2차원 사고다.

## 통합 결정 매트릭스: 요구 → 도구

| 요구/상황 | 1차 도구 | 핵심 이유 |
|-----------|----------|-----------|
| 자격증명 오남용·악성 통신을 실시간 탐지 | GuardDuty(기초) | 에이전트리스, CloudTrail/Flow/DNS 분석 |
| 호스트 내부 프로세스·파일 악성 행위 | GuardDuty Runtime Monitoring | 런타임 가시성(경량 에이전트) |
| EC2 멀웨어 감염 의심 스캔 | GuardDuty Malware Protection(EBS) | 스냅샷 기반, 에이전트 불필요 |
| EC2/ECR/Lambda의 CVE 취약점 발견 | Inspector | 지속 스캔 + 컨텍스트 우선순위 |
| 사후 공시 CVE까지 이미지 추적 | Inspector ECR continuous 스캔 | 푸시 후 재평가 |
| 핀딩의 근본원인·영향범위·횡적이동 조사 | Detective | 동작 그래프, 베이스라인 |
| 관련 핀딩을 묶어 경보 피로 감소 | Detective finding groups | 캠페인 단위 그룹핑 |
| 여러 도구 핀딩을 표준화·집계 | Security Hub(ASFF) | 단일 창 + 상관 |
| 규정 준수 컨트롤(CIS/FSBP) 평가 | Security Hub 표준 검사 | 구성 모범 평가 |
| 멀티리전 핀딩 단일 조회 | Security Hub aggregation Region | 크로스리전 집계 |
| 탐지→자동 대응(격리/패치/티켓) | Security Hub → EventBridge → Lambda/SSM | SOAR 단일화 |
| 신규 계정 자동 탐지 포함 | 위임 관리자 + auto-enable | 사각지대 제거 |
| S3 민감 데이터(PII) 분류 | Macie | 데이터 분류(위협 탐지 아님) |

> 💡 **관련 이론**: 이 매트릭스의 바탕은 NIST CSF의 *Detect* 기능과 *예방-탐지-대응*의 분업이다. 예방(IAM·암호화·WAF)이 뚫리는 것을 전제로, 탐지 계층은 "위협(GuardDuty) + 취약점(Inspector)"을 발견하고, 조사(Detective)로 의미를 부여하며, 집계·자동화(Security Hub+EventBridge)로 운영한다. 시험의 "best" 답은 보통 *목적에 맞는 전문 도구 + Security Hub 통합 + Security Tooling 계정 위임*이다.

## 목적 사고: "탐지하라" vs "조사하라" vs "막아라"

같은 사건도 *동사*에 따라 답이 갈린다. 문제의 동사를 먼저 읽어라:

- **"탐지(detect)하라"** → GuardDuty(위협) 또는 Inspector(취약점). 핀딩을 *생성*하는 도구.
- **"조사(investigate)·근본원인" ** → Detective. 핀딩을 *설명*하는 도구(생성 안 함).
- **"집계·표준화·단일 창"** → Security Hub. 핀딩을 *모으는* 도구.
- **"막아라(prevent/block)"** → WAF/SG/NACL/Network Firewall. 탐지 도구는 *차단하지 않는다*.
- **"자동 대응하라"** → EventBridge + Lambda/SSM/Step Functions.

> ⚠️ **함정 모음**:
> - Detective를 "탐지 도구"로 오인(실제로는 조사 — 핀딩 생성 안 함).
> - Security Hub를 "위협 탐지 도구"로 오인(실제로는 집계·오케스트레이션).
> - GuardDuty/Inspector를 "차단 도구"로 오인(탐지만 — 차단은 별도 자동화).
> - GuardDuty가 호스트 내부를 본다고 가정(기초는 네트워크/API만 — Runtime Monitoring 필요).
> - Inspector EC2 스캔이 SSM 관리 없이 된다고 가정(에이전트 기반은 SSM 필요).
> - 커스텀 DNS resolver에서 GuardDuty DNS 핀딩이 나온다고 가정(VPC 기본 resolver 필요).
> - ECR on-push만으로 사후 CVE를 잡는다고 가정(continuous 필요).
> - Security Hub 핀딩이 글로벌이라고 가정(리전별 — aggregation Region 필요).

## 통합 시나리오 A: 단일 침해의 풀 파이프라인

> 🎯 **시나리오 A**: "인터넷 노출 EC2가 침해된 것으로 보인다. 사전에 약점을 알았어야 했고, 공격을 탐지하고, 근본원인을 조사하고, 자동으로 격리·티켓팅하고 싶다. 50개 계정 조직이다."
>
> **답**:
> 1. **Inspector**: 노출 EC2의 critical CVE를 지속 스캔으로 사전 식별(도달성·익스플로잇 가중 우선순위).
> 2. **GuardDuty**: `UnauthorizedAccess:EC2/SSHBruteForce` + 비정상 아웃바운드 탐지. 호스트 내부 의심 시 Runtime Monitoring, 멀웨어 의심 시 Malware Protection.
> 3. **Detective**: 침해 인스턴스 역할의 새 지역·새 API 정찰, 동일 IP의 다른 인스턴스 통신(횡적 이동) 조사.
> 4. **Security Hub**: 1~3 핀딩을 ASFF로 집계 → **EventBridge** → Lambda(격리 SG 이동 + 스냅샷 + 자격증명 회수) + Jira 티켓.
> 5. **베이스라인**: 모든 서비스 위임 관리자를 Security Tooling 계정으로 정렬 + auto-enable.

## 통합 시나리오 B: 멀티계정·멀티리전 탐지 베이스라인

> 🎯 **시나리오 B**: "수백 개 계정, 여러 리전. 신규 계정도 자동 포함하고, 워크로드 팀이 탐지를 끄지 못하게 하며, 모든 핀딩을 단일 창에서 보고, 로그는 침해자가 못 건드리게 보관하고 싶다."
>
> **답**:
> - **Security Tooling 계정**을 GuardDuty·Security Hub·Detective·Inspector·Macie·Access Analyzer의 **공통 위임 관리자**로 정렬.
> - 조직 모드 + **auto-enable**로 신규 계정 자동 포함, 멤버는 끄지 못함.
> - Security Hub **aggregation Region**으로 멀티리전 핀딩 단일 리전 집계.
> - **Log Archive 계정**에 CloudTrail/Config 로그 불변(write-once) 보관 — 탐지 계정과 분리(권한 분리).
> - 중앙 EventBridge 버스 → 대응 자동화 단일화.

## 자주 틀리는 구분 총정리

**GuardDuty vs Inspector** — 위협(실제 악성 활동, 탐지) vs 취약점(악용 가능한 약점, 사전 예방). 시점이 다르다.

**GuardDuty vs Detective** — 탐지(핀딩 생성) vs 조사(핀딩 설명). Detective는 핀딩을 만들지 않는다.

**Detective vs Security Hub** — 심층 조사(좁고 깊게, 동작 그래프) vs 집계·표준화(넓고 얕게, ASFF). 보완적.

**Security Hub vs GuardDuty/Inspector** — 집계·오케스트레이션 허브 vs 전문 탐지기. Security Hub는 직접 위협을 탐지하지 않는다(표준 컨트롤 평가는 예외).

**탐지 도구 vs 예방 도구** — GuardDuty/Inspector/Detective/Security Hub는 *탐지·조사·집계*만. 차단은 WAF/SG/NACL/Network Firewall + 자동화의 몫.

**GuardDuty Malware Protection vs Inspector** — 전자는 *멀웨어*(악성 파일) 스캔, 후자는 *CVE 취약점* 스캔. 다른 대상.

**Macie vs 탐지 도구** — Macie는 S3 *민감 데이터 분류*(PII), 위협 탐지가 아니다.

## 가시성·운영: 탐지는 파이프라인으로 완성된다

탐지의 성숙도는 "핀딩이 나오는가"가 아니라 "핀딩이 *상관·조사·대응*으로 흐르는가"로 갈린다:

```
[예방 우회] → Inspector(약점) + GuardDuty(위협) → Security Hub(집계·ASFF)
                                                       ├─ Detective(조사)
                                                       └─ EventBridge → 자동 대응
                                                            (격리/패치/티켓/알림)
```

각 도구의 신호·통합:
- **GuardDuty**: 핀딩 → EventBridge(실시간) + Security Hub 자동 통합.
- **Inspector**: 발견 → Security Hub + EventBridge → SSM Patch Manager(교정).
- **Detective**: 조사 — 핀딩에서 "Investigate in Detective"로 진입.
- **Security Hub**: ASFF 집계 + Insights 상관 + automation rules + 단일 EventBridge 발행.

이 신호들은 다음 주(인시던트 대응)에서 *실제 격리·포렌식·복구* 워크플로로 연결된다 — 탐지는 대응의 입구다.

> 🔍 **더 깊이**: 탐지 계층 전체를 한 문장으로 요약하면 *"전문 도구로 발견하고, ASFF로 통합하고, Detective로 조사하고, EventBridge로 대응하며, Security Tooling 계정으로 위임한다"*이다. 시험에서 탐지 관련 "best" 답은 거의 항상 이 통합 패턴의 어느 조각이다. 함정은 대개 역할 혼동(조사를 탐지로, 집계를 탐지로, 탐지를 차단으로)이거나 활성화 전제 누락(SSM 미관리, 커스텀 DNS, on-push만, auto-enable 미설정, aggregation Region 미지정)이다. 동사와 전제를 먼저 읽어라.

## 한 줄 요약 체크리스트

- [ ] 문제의 동사(탐지/조사/집계/차단/대응)를 먼저 읽어 도구를 골랐는가
- [ ] GuardDuty 기초 vs 보호 플랜(Runtime/Malware)을 상황에 맞게 구분했는가
- [ ] Inspector 스캔 전제(SSM 관리, ECR continuous)를 확인했는가
- [ ] Detective를 탐지가 아닌 조사 도구로 정확히 포지셔닝했는가
- [ ] Security Hub를 집계·오케스트레이션 허브(ASFF)로 이해했는가
- [ ] 모든 탐지 서비스 위임 관리자를 Security Tooling 계정으로 정렬 + auto-enable 했는가
- [ ] aggregation Region·EventBridge 자동화로 멀티리전·자동대응을 묶었는가

---

## 📝 연습 문제

**문제 1.** 인터넷에 노출된 EC2가 침해된 것으로 보인다. 50개 계정 조직에서 (a) 사전에 약점을 알고, (b) 공격을 탐지하고, (c) 근본원인을 조사하고, (d) 자동으로 격리·티켓팅하려 한다. 가장 적절한 통합 설계는?

A) GuardDuty 하나만 켜고 나머지는 수동으로 처리한다  
B) Inspector(취약점) + GuardDuty(위협) + Detective(조사) + Security Hub 집계 → EventBridge → Lambda/SSM 자동 대응, 모두 Security Tooling 계정에 위임  
C) WAF와 Shield만으로 모든 것을 처리한다  
D) CloudTrail 로그를 Athena로 수동 쿼리해 사람이 분석한다  

**정답: B**  
해설: 네 요구가 서로 다른 탐지 기능에 대응하므로 전문 도구를 통합해야 한다. Inspector가 사전 약점을, GuardDuty가 공격을, Detective가 근본원인을 담당하고, Security Hub가 ASFF로 집계해 EventBridge로 격리·티켓 자동화를 트리거하며, 모든 서비스를 Security Tooling 계정에 위임해 멀티계정 일관성을 확보한다. GuardDuty 단독·WAF/Shield(예방)·수동 Athena 분석은 이 통합 요구를 충족하지 못한다.

---

**문제 2.** 한 분석가가 "Amazon Detective로 위협을 실시간 탐지하고 악성 트래픽을 차단하겠다"고 설계했다. 이 설계의 오류는?

A) Detective는 멀티계정에서 동작하지 않는다  
B) Detective는 탐지나 차단을 하지 않고, 기존 핀딩·로그를 조사·근본원인 분석하는 도구다 — 탐지는 GuardDuty, 차단은 WAF/SG의 역할이다  
C) Detective는 EC2만 지원한다  
D) Detective는 비용이 너무 비싸다  

**정답: B**  
해설: Detective는 핀딩을 생성하거나 트래픽을 차단하지 않으며, GuardDuty 등이 만든 핀딩과 로그를 동작 그래프로 조사해 "왜·어디까지·어떻게"를 분석하는 조사 전용 도구다. 위협 탐지는 GuardDuty, 차단은 WAF/SG/NACL의 역할이다. Detective는 멀티계정을 지원하며 EC2 외 다양한 엔티티를 다루므로 나머지 보기는 틀렸다.

---

**문제 3.** Inspector를 켰는데 일부 EC2가 스캔되지 않고, GuardDuty는 호스트 내부 악성 프로세스를 탐지하지 못한다. 두 문제의 올바른 해결 조합은?

A) Inspector는 SSM 관리 상태(또는 agentless) 확인, GuardDuty는 Runtime Monitoring 활성화  
B) 둘 다 VPC Flow Logs를 S3에 저장하면 해결된다  
C) Inspector는 ECR continuous를 켜고, GuardDuty는 Trusted IP를 추가한다  
D) 둘 다 Security Hub만 켜면 자동 해결된다  

**정답: A**  
해설: Inspector의 EC2 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 하므로 SSM 상태를 확인(또는 agentless 사용)해야 하고, GuardDuty 기초는 네트워크/API만 보므로 호스트 내부 프로세스 가시성은 Runtime Monitoring으로 확보한다. Flow Logs 저장·ECR continuous(이미지 대상)·Trusted IP(핀딩 억제)·Security Hub(집계)는 이 두 문제의 직접 해결책이 아니다.

---

**문제 4.** 멀티리전·다계정 조직에서 신규 계정이 자동으로 탐지에 포함되고, 모든 리전 핀딩을 단일 창에서 보며, 워크로드 팀이 탐지를 끄지 못하게 하려 한다. 가장 적절한 베이스라인은?

A) 각 계정·리전에서 서비스를 수동으로 켜고 콘솔을 번갈아 본다  
B) 탐지 서비스를 Security Tooling 계정에 위임 + auto-enable + Security Hub aggregation Region 구성  
C) 관리(management) 계정에서 모든 것을 직접 운영한다  
D) 핀딩을 이메일로만 받는다  

**정답: B**  
해설: 위임 관리자(Security Tooling 계정) + 조직 모드 auto-enable은 신규 계정 자동 포함과 멤버의 임의 비활성화 방지를 동시에 달성하고, Security Hub aggregation Region은 멀티리전 핀딩을 단일 리전에 집계한다. 수동 활성화·콘솔 순회는 사각지대를 낳고, 관리 계정 직접 운영은 권한 집중 위험이며, 이메일 수신만으로는 통합·자동화가 불가능하다.

---

**문제 5.** 다음 중 이번 주 탐지 통합에서 "함정"으로 자주 지적되는 항목이 아닌 것은?

A) Detective를 위협 탐지·차단 도구로 오인하는 것  
B) GuardDuty 기초만으로 호스트 내부 프로세스를 본다고 가정하는 것  
C) 모든 탐지 서비스의 위임 관리자를 동일 Security Tooling 계정으로 정렬하고 auto-enable을 켜는 것  
D) Security Hub 핀딩이 모든 리전에 글로벌로 보인다고 가정하는 것  

**정답: C**  
해설: 모든 탐지 서비스를 동일 Security Tooling 계정에 위임하고 auto-enable을 켜는 것은 함정이 아니라 *권장 베이스라인*이다 — 데이터·권한·조사 일관성과 신규 계정 자동 포함을 보장한다. 나머지는 모두 실제 빈출 함정이다: Detective는 조사 도구이지 탐지·차단이 아니고, GuardDuty 기초는 호스트 내부를 못 보며(Runtime Monitoring 필요), Security Hub 핀딩은 리전별이라 aggregation Region이 필요하다. 함정이 *아닌* 것을 고르는 문제이므로 정답은 위임 정렬 구성이다.

---

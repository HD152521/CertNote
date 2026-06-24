# Day 3 - Resilience Hub·Fault Injection Simulator — 카오스 엔지니어링의 탄생, Stop Condition의 안전 공학, DR 검증 자동화

2010년 Netflix가 DVD 우편 사업에서 스트리밍으로, 자체 데이터센터에서 AWS로 옮기던 시기, 엔지니어들은 한 가지 두려운 진실을 마주했다 — **클라우드에서 인스턴스는 언제든 예고 없이 죽는다**. 이들의 대응은 직관에 반했다. "장애가 무서우니 피하자"가 아니라 "장애를 일부러, 자주, 평일 업무 시간에 일으켜 시스템이 그래도 버티는지 끊임없이 증명하자"였다. 그렇게 탄생한 것이 production에서 무작위로 인스턴스를 죽이는 **Chaos Monkey**이고, 이 발상이 곧 **카오스 엔지니어링(Chaos Engineering)**이라는 분야가 됐다.

SAP-C02 시험에서 복원력은 "Multi-AZ를 켰다"로 끝나지 않는다. Pro의 관점은 **그 복원력이 실제로 작동하는지를 RTO/RPO 목표 대비 자동으로 평가하고(Resilience Hub), 의도적 장애를 안전하게 주입해 검증하며(FIS), 장애 시 트래픽 전환을 정밀하게 통제(Route 53 ARC)**하는 능동적 검증 체계다. 오늘은 카오스 엔지니어링의 기원, FIS Stop Condition이 구현하는 안전 공학, 그리고 DR 위치별 도구(DRS·MGN) 선택을 깊이 분해한다.

## Resilience Hub — RTO/RPO를 코드처럼 평가한다

복원력 설계의 첫 단계는 "내 워크로드가 정의한 RTO/RPO를 실제로 충족하는가"를 객관적으로 아는 것이다. 사람이 아키텍처 다이어그램을 보고 추측하는 대신, **AWS Resilience Hub**는 이를 자동으로 분석한다.

동작은 명료하다. (1) 워크로드를 등록하면(CloudFormation 스택·Terraform state·Resource Group으로 리소스 자동 검색), (2) 목표 RTO/RPO를 정책으로 입력하고, (3) Resilience Hub가 현재 아키텍처가 그 목표를 충족하는지 분석해 **정책 위반·격차를 식별**한다. (4) 그리고 "Multi-AZ를 추가하면 RTO 30초 달성", "백업 빈도를 늘리면 RPO 5분 달성" 같은 **구체적 개선 권고**를 제시하며, (5) 검증용 **FIS 실험 템플릿까지 자동 생성**한다.

> 💡 **관련 이론**: Resilience Hub의 가장 강력한 활용은 **CI/CD 파이프라인 통합**이다. 코드를 PR할 때마다 Resilience Hub가 resilience score를 계산하게 하면, 복원력을 코드 품질처럼 게이트로 강제할 수 있다 — "이 변경이 RTO를 악화시키면 머지 차단" 같은 정책이 가능해진다. 이는 **Resilience as Code**라 부를 만한 패러다임으로, 테스트 커버리지·보안 스캔처럼 복원력을 정량 지표로 만들어 회귀(regression)를 막는다. WA Tool이 정성적 인터뷰라면 Resilience Hub는 정량적·자동화된 RTO/RPO 평가라는 점이 차이다. 시험에서 "RTO/RPO 격차 자동 식별 + 구체적 권고 + CI/CD"가 보이면 Resilience Hub다.

> 🔍 **더 깊이**: Resilience Hub와 WA Tool은 영역이 겹치지만 다르다. WA Tool은 6 기둥 전체를 질문으로 평가하는 정성적 도구이고, Resilience Hub는 **Reliability 한 기둥의 RTO/RPO만을 깊게, 자동으로** 측정한다. 또 Resilience Hub는 실제 리소스를 검색해 분석하고 FIS 실험을 생성하는 반면, WA Tool은 사람의 답변에 의존한다. 시험에서 "6 기둥 구조화 평가"는 WA Tool, "RTO/RPO 정량 격차 + 실험 자동 생성"은 Resilience Hub로 갈린다.

## Fault Injection Simulator — 카오스의 관리형 구현

FIS는 Netflix의 Chaos Monkey 발상을 AWS가 2021년 **관리형 서비스로 상품화**한 것이다. 핵심 구성은 **Experiment Template** — Targets(어떤 리소스에)와 Actions(어떤 장애를)의 조합이다.

주입 가능한 장애의 종류가 풍부하다.

- **EC2 중지/종료**: 인스턴스 강제 종료로 ASG 자가 치유 검증
- **CPU/메모리 스트레스**: 리소스 고갈 시 동작 검증
- **네트워크 지연·패킷 손실**: 컴포넌트 간 통신 장애 모사
- **API throttling**: AWS API 호출 제한 시 재시도 로직 검증
- **RDS Failover**: Multi-AZ 전환이 실제로 작동하는지 검증
- **IAM 권한 일시 회수**: 권한 장애 시 graceful degradation 검증
- **AZ 가용성 차단**: 단일 AZ 장애 시 Multi-AZ 견고성 검증

> 💡 **관련 이론**: 카오스 엔지니어링은 단순한 "장애 테스트"가 아니라 **과학적 실험 방법론**을 따른다. 정식 절차는 (1) 정상 상태(steady state)를 측정 가능한 지표로 정의(예: "초당 주문 처리율 1000"), (2) "장애가 나도 이 지표가 유지될 것"이라는 가설 수립, (3) 실제 장애 주입, (4) 가설 검증 — 지표가 유지되면 시스템이 복원력 있는 것이고, 무너지면 약점을 발견한 것이다. 이는 소프트웨어 공학에 실험과학의 가설-검증 루프를 들여온 것으로, "테스트는 알려진 것을 확인하고, 카오스 실험은 알려지지 않은 것을 발견한다"는 명제로 요약된다. 시험에서 FIS는 "사전에 모르던 복원력 약점을 production 전에 발견"하는 맥락으로 출제된다.

> 📚 **사례**: 카오스 엔지니어링의 가치를 역으로 증명한 것이 **2012년 크리스마스이브 Netflix 대장애**다. AWS ELB의 us-east-1 장애로 Netflix 스트리밍이 크리스마스 시즌에 수 시간 멈췄다. Netflix는 이 사건 이후 단일 인스턴스를 죽이는 Chaos Monkey를 넘어 **전체 AWS 리전을 죽이는 시뮬레이션 도구 "Chaos Kong"**을 개발했고, 정기적으로 리전 장애를 모사해 다른 리전으로의 failover를 검증했다. 그 결과 이후 실제 AWS 리전 장애가 발생했을 때 사용자가 거의 눈치채지 못하게 흡수했다. 교훈: **failover는 평소에 자주 연습한 만큼만 실제 위기에서 작동한다**. 시험에서 "리전 장애 대비를 production 전에 정기 검증"이 보이면 FIS 기반 Game Day가 답이다.

## Stop Condition — 의도적 장애가 진짜 사고가 되지 않게

카오스 엔지니어링의 가장 큰 위험은 명백하다 — **의도적으로 일으킨 장애가 통제를 벗어나 진짜 대형 사고가 되는 것**이다. FIS가 Chaos Monkey 같은 자체 스크립트보다 결정적으로 우월한 이유가 바로 **Stop Condition(중단 조건)**이라는 안전장치다.

Stop Condition은 하나 이상의 **CloudWatch Alarm**과 연결된다. 실험 중 그 알람이 발동하면(예: "에러율 5% 초과", "지연 1초 초과") FIS가 **진행 중인 모든 장애 주입을 즉시 중단하고 정상 상태로 되돌린다**. 즉 "여기까지는 괜찮지만 이 선을 넘으면 멈춰라"는 안전 경계를 사전에 정의해두는 것이다.

> 💡 **관련 이론**: Stop Condition은 안전 공학의 **자동 안전 정지(fail-safe / dead-man's switch)** 원리를 클라우드에 구현한 것이다. 원자로의 SCRAM(긴급 정지), 엘리베이터의 비상 브레이크, 산업 기계의 안전 차단기와 같은 사상이다 — "위험 신호가 감지되면 사람의 판단을 기다리지 말고 자동으로 가장 안전한 상태로 복귀하라". 카오스 실험에서 이것이 없으면 실험자가 모니터링하다 반응하기 전에 사고가 커질 수 있다. FIS는 IAM Role 권한 분리(실험이 정의된 리소스에만 영향)와 영향 범위(blast radius) 사전 정의까지 결합해 다층 안전망을 만든다. 시험에서 "카오스 실험이 실제 사고로 번지지 않도록"은 Stop Condition의 직답 신호다.

> ⚠️ **함정**: FIS를 "장애를 일으키는 도구"로만 이해하면 시험에서 함정에 빠진다. FIS의 본질적 가치는 **Stop Condition·blast radius·IAM 분리로 둘러싸인 "통제된" 장애**라는 점이다. 보기에서 "Lambda로 직접 EC2를 종료" "Systems Manager로 수동 장애 주입" 같은 선택지는 안전장치가 없어 카오스 엔지니어링의 정석이 아니다. 시험에서 "운영 중 의도적 장애 + 알람 시 자동 중단"이라는 두 조건이 함께 나오면, 자동 중단(Stop Condition)을 내장한 FIS가 유일한 정답이다.

## DRS vs MGN — DR 위치를 가르는 같은 엔진, 다른 목적

복원력 검증을 넘어 실제 DR 환경을 구축할 때, AWS는 블록 레벨 복제를 쓰는 두 서비스를 제공한다. 둘은 같은 복제 엔진(과거 CloudEndure)에서 갈라져 나왔지만 목적이 정반대다.

| 항목 | **MGN** (Application Migration Service) | **DRS** (Elastic Disaster Recovery) |
|------|----------------------------------------|--------------------------------------|
| **목적** | 일회성 마이그레이션 | 지속적 DR |
| **소스** | 온프레/타 클라우드 → AWS | 온프레/타 클라우드/AWS Region → AWS Region |
| **컷오버** | 한 번(이전 완료 후 종료) | 반복 가능(정기 Drill) |
| **복제 기간** | 이전 완료까지만 | 24/7 지속 |
| **RPO/RTO** | - | RPO 초·RTO 분 |
| **비용** | 이전 후 소스 종료 | DR 환경 지속 비용 |

핵심 판별은 **"옮기고 끝인가(MGN), 계속 유지하는가(DRS)"**다. 온프레미스 서버 200대를 AWS로 영구 이전하면 MGN(7R의 Rehost), 온프레미스를 그대로 두고 AWS에 24시간 DR 대기 환경을 유지하면 DRS다.

> 🔍 **더 깊이**: DRS의 강점은 **블록 레벨 연속 복제 + 반복 가능한 Drill**이다. DR 사이트를 실제로 띄워 테스트(drill)한 뒤 다시 대기 상태로 돌릴 수 있어, "DR이 실제로 작동하는가"를 production에 영향 없이 정기 검증할 수 있다. 또 DRS는 복제된 데이터를 평소엔 저렴한 staging 영역에 보관하다가 failover 시점에만 실제 인스턴스로 변환(convert)하므로, Pilot Light에 가까운 비용 효율을 가진다. 시험에서 "온프레 + AWS 지속 DR + 정기 drill"은 DRS, "온프레 → AWS 영구 이전"은 MGN으로 정확히 갈린다.

## Route 53 ARC — Failover의 정밀 통제

자동 Health Check 기반 failover는 빠르지만, 미션 크리티컬 시스템에서는 **false positive(일시적 네트워크 흔들림을 장애로 오판)로 인한 불필요한 failover**가 더 위험할 수 있다. **Route 53 Application Recovery Controller(ARC)**는 이 통제를 정밀화한다.

- **Routing Control**: 자동 Health Check와 **분리된** 명시적 ON/OFF 토글. 운영자가 의도적으로 트래픽 전환을 결정한다. failover를 사람의 판단 아래 둔다.
- **Readiness Check**: DR 리전이 항상 production 수준의 readiness(용량·설정·할당량)를 유지하는지 자동·지속 검증. "막상 failover했더니 DR이 준비 안 됨"을 사전에 방지.
- **Zonal Shift**: 문제가 생긴 특정 **AZ**를 ALB/NLB에서 즉시 제외. 리전 전체가 아니라 한 AZ만 격리하는 정밀 대응.

> 📚 **사례**: 2021년 12월 7일 **AWS us-east-1 대장애**(약 7시간, API 게이트웨이·콘솔·다수 서비스 영향)는 내부 네트워크 디바이스 자동 확장의 예기치 못한 동작에서 시작됐다. 이 사건에서 일부 기업은 자동 health check가 정상/비정상을 오락가락 판정해 트래픽이 불안정하게 튀는 문제를 겪었다. ARC Routing Control처럼 **운영자가 명시적으로 "지금 us-west-2로 전환"을 결정**할 수 있는 구조였다면 더 통제된 대응이 가능했다. 또 이 장애는 "제어 평면(control plane)은 죽어도 데이터 평면(data plane)은 살 수 있게" 설계하라는 교훈을 남겼다 — ARC의 Routing Control 데이터 평면은 5개 리전에 분산돼 us-east-1이 죽어도 작동하도록 설계됐다. 시험에서 "자동 failover의 false positive가 우려되는 미션 크리티컬"은 ARC Routing Control이 시그널이다.

> 🎯 **시나리오**: "한 핀테크가 us-east-1·us-west-2 active-active로 운영 중인데, 자동 health check가 부분 장애를 오판해 트래픽이 불안정하게 튀는 것을 막고, 장애 시 운영자가 직접 신중하게 failover를 결정하고 싶다. 무엇을 쓰나?" — 답: **Route 53 ARC Routing Control**. 자동 health check와 분리된 명시적 토글로 사람이 failover를 통제한다. 단순 Route 53 Health Check(자동)는 false positive 문제를 그대로 가지므로 부적합하다. "AZ만 격리"라면 Zonal Shift, "DR 준비 상태 지속 검증"이면 Readiness Check로 ARC 내에서도 기능이 갈린다.

## 정리하며

복원력은 설계가 아니라 **검증**으로 완성된다. Resilience Hub는 RTO/RPO 격차를 자동 식별하고 구체적 권고와 FIS 실험을 생성하며, CI/CD에 통합해 복원력을 코드 품질처럼 게이트화한다. FIS는 Netflix가 창시한 카오스 엔지니어링을 관리형으로 구현하되, **Stop Condition·blast radius·IAM 분리**라는 안전 공학으로 의도적 장애가 진짜 사고가 되지 않게 막는다. DR 위치 구축은 목적에 따라 MGN(일회성 이전)·DRS(지속 DR)로 갈리고, 장애 시 트래픽 통제는 Route 53 ARC의 Routing Control(명시적 사람 결정)·Zonal Shift(AZ 격리)·Readiness Check(준비 검증)로 정밀화된다.

SAP 시험 단골 매핑: (1) "RTO/RPO 격차 자동 식별 + 권고 + CI/CD" → **Resilience Hub**, (2) "운영 중 의도적 장애 + 알람 시 자동 중단" → **FIS + Stop Condition**, (3) "온프레 → AWS 영구 이전" → **MGN**, (4) "온프레 + AWS 지속 DR + 정기 drill" → **DRS**, (5) "자동 failover false positive 우려·사람이 명시적 결정" → **ARC Routing Control**, (6) "문제 AZ만 즉시 트래픽 제외" → **Zonal Shift**, (7) "DR 리전 준비 상태 지속 검증" → **Readiness Check**. 다음 day는 이 복원력의 데이터 계층(RDS·Aurora·DynamoDB Global의 Multi-AZ·Multi-Region) 선택을 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 팀이 워크로드의 현재 RTO/RPO가 목표를 충족하는지 자동으로 평가받고, 격차를 메우는 구체적 권고를 받아 CI/CD 파이프라인에서 복원력을 게이트로 강제하려 한다. 가장 적합한 도구는?

A) Well-Architected Tool

B) AWS Resilience Hub

C) Trusted Advisor

D) CloudWatch Synthetics

**정답: B**

해설: Resilience Hub는 워크로드를 등록하면 목표 RTO/RPO 대비 격차를 자동 식별하고 "Multi-AZ 추가 시 RTO 30초" 같은 구체적 권고와 FIS 실험을 생성하며, resilience score를 CI/CD에 통합해 복원력 회귀를 게이트로 막을 수 있다. A(WA Tool)는 6 기둥 전체를 사람 답변으로 평가하는 정성 도구로 RTO/RPO 정량 격차를 자동 측정하지 않는다. C는 자동 체크 스캐너이고, D는 엔드포인트 가용성 모니터링일 뿐이다. 함정: "RTO/RPO 정량 격차 + 권고 + CI/CD"는 Resilience Hub의 직답이다.

---

**문제 2.** 한 회사가 production 환경에서 EC2 종료·네트워크 지연을 의도적으로 주입해 복원력을 검증하되, 에러율이 임계치를 넘으면 실험이 자동으로 중단되기를 원한다. 가장 적합한 구성은?

A) Lambda로 무작위 EC2를 종료하는 스크립트

B) FIS Experiment Template + CloudWatch Alarm 기반 Stop Condition

C) Systems Manager Run Command로 수동 장애 주입

D) Auto Scaling으로 인스턴스를 줄였다 늘림

**정답: B**

해설: FIS는 Experiment Template으로 장애(EC2 종료·네트워크 지연)를 정의하고, CloudWatch Alarm에 연결된 Stop Condition으로 에러율이 임계치를 넘으면 즉시 실험을 중단해 정상 상태로 복귀한다 — 의도적 장애가 진짜 사고로 번지는 것을 막는 자동 안전 정지(fail-safe)다. A·C는 Stop Condition 같은 안전장치가 없어 통제를 벗어날 위험이 있고, D는 장애 주입이 아니라 일반 스케일링이다. 함정: "의도적 장애 + 알람 시 자동 중단" 두 조건이 함께 나오면 Stop Condition을 내장한 FIS가 유일한 정답이다.

---

**문제 3.** 한 기업이 온프레미스 데이터센터를 그대로 운영하면서, AWS에 24시간 대기하는 DR 환경을 유지하고 정기적으로 failover drill을 수행하려 한다. 가장 적합한 서비스는?

A) Application Migration Service (MGN)

B) Elastic Disaster Recovery (DRS)

C) DataSync

D) AWS Backup

**정답: B**

해설: DRS는 블록 레벨 연속 복제로 온프레미스를 유지하면서 AWS에 지속적 DR 환경을 유지하고, DR 사이트를 띄워 drill한 뒤 다시 대기 상태로 되돌릴 수 있어 production 영향 없이 정기 검증이 가능하다. A(MGN)는 일회성 마이그레이션 후 종료되어 "지속적 DR"에 부적합하다. C(DataSync)는 파일 전송 도구이고, D(Backup)는 스냅샷 백업이지 실시간 DR 환경이 아니다. 함정: "온프레 유지 + AWS 지속 DR + 정기 drill"은 DRS, "AWS로 영구 이전"은 MGN으로 갈린다.

---

**문제 4.** 한 핀테크가 us-east-1·us-west-2 active-active로 운영 중이다. 자동 health check가 일시적 네트워크 흔들림을 장애로 오판해 트래픽이 불필요하게 튀는 것을 막고, 장애 시 운영자가 직접 신중하게 failover를 결정하길 원한다. 가장 적합한 것은?

A) Route 53 Health Check 자동 failover만 사용

B) Route 53 ARC Routing Control

C) Global Accelerator endpoint group 자동 failover

D) Lambda로 자동 DNS 전환

**정답: B**

해설: ARC Routing Control은 자동 health check와 분리된 명시적 ON/OFF 토글로, 운영자가 의도적으로 트래픽 전환을 결정한다. false positive로 인한 불필요한 자동 failover가 더 위험한 미션 크리티컬 시스템에 적합하며, Routing Control 데이터 평면은 5개 리전에 분산돼 단일 리전 장애에도 작동한다. A·C·D는 모두 자동 전환이라 false positive 문제를 그대로 가진다. 함정: "자동 failover의 false positive 우려 + 사람의 명시적 결정"은 ARC Routing Control의 직답이다.

---

**문제 5.** 카오스 엔지니어링 실험에서 Stop Condition의 역할로 가장 정확한 것은?

A) 실험을 더 빠르게 실행한다

B) 연결된 CloudWatch Alarm이 발동하면 진행 중인 장애 주입을 즉시 중단해 의도적 장애가 실제 사고로 번지는 것을 막는다

C) 실험 결과를 S3에 저장한다

D) 실험 대상 리소스를 자동으로 늘린다

**정답: B**

해설: Stop Condition은 하나 이상의 CloudWatch Alarm과 연결되어, 실험 중 그 알람이 발동(예: 에러율·지연 임계 초과)하면 FIS가 모든 장애 주입을 즉시 중단하고 정상 상태로 복귀시키는 자동 안전 정지(fail-safe) 메커니즘이다. 원자로 SCRAM·엘리베이터 비상 브레이크와 같은 안전 공학 원리다. A·C·D는 Stop Condition의 기능과 무관하다. 함정: Stop Condition은 "실험을 멈추는 안전장치"이지 성능·저장·확장 기능이 아니다.

---

**문제 6.** 한 워크로드가 단일 AZ의 부분 장애를 겪고 있다. 리전 전체를 failover하지 않고 문제가 된 그 AZ만 즉시 트래픽에서 제외하려 한다. 가장 적합한 방법은?

A) NACL로 해당 AZ 트래픽 차단

B) Route 53 ARC Zonal Shift

C) ASG에서 인스턴스 Detach

D) ALB Connection Draining

**정답: B**

해설: Zonal Shift는 단일 명령으로 ALB/NLB에서 특정 AZ를 즉시 제외해 트래픽을 나머지 정상 AZ로 재분배하는 정밀 대응으로, 리전 전체를 건드리지 않는다. A(NACL)는 너무 광범위하고 수동적이며, C·D는 개별 인스턴스·연결 단위라 AZ 전체를 깔끔하게 격리하지 못한다. 함정: "리전이 아니라 문제 AZ만 즉시 제외"는 Zonal Shift의 직답이다.

---

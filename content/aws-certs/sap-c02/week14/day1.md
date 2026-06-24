# Day 1 - DR 4가지 전략과 RTO/RPO 매핑 — 재해 복구의 역사, 동기·비동기 복제의 물리학, 클라우드 DR의 경제학

2003년 8월 14일, 미국 동북부와 캐나다를 덮친 대정전(Northeast Blackout)으로 5천만 명이 전기를 잃었다. 이때 자체 데이터센터에만 의존하던 수많은 기업이 사업을 멈췄고, 반대로 지리적으로 떨어진 DR 사이트를 갖춘 금융기관은 살아남았다. 이 사건은 "DR은 IT 부서의 보험이 아니라 사업 연속성(Business Continuity)의 핵심"이라는 인식을 산업 전반에 박았다. 그로부터 20년, AWS는 이 DR을 **온프레미스라면 수백억 원이 드는 두 번째 데이터센터를 클릭 몇 번으로 대체**하는 서비스로 상품화했다.

SAP-C02 시험에서 DR을 "백업을 켜는 것"으로 이해하면 SAA 수준에 머문다. Pro의 핵심은 비즈니스가 정의한 **RTO(복구 시간 목표)와 RPO(데이터 손실 허용)**라는 두 숫자를, 비용을 최소화하면서 정확히 충족하는 전략을 고르는 의사결정이다. 오늘은 4가지 DR 전략이 왜 이 스펙트럼으로 정리됐는지, 동기·비동기 복제가 어떤 물리 법칙에 묶이는지, 그리고 클라우드가 DR의 경제학을 어떻게 뒤집었는지를 깊이 분해한다.

## RTO와 RPO — 두 숫자가 모든 것을 결정한다

DR 설계의 출발점은 두 개의 시간 지표다. **RTO(Recovery Time Objective)**는 "장애 발생 후 서비스가 복구될 때까지 허용되는 최대 시간"이고, **RPO(Recovery Point Objective)**는 "장애 시 잃어도 되는 데이터의 시간 폭"이다. RTO가 시간축에서 **장애 이후 미래**를 가리킨다면, RPO는 **장애 이전 과거**를 가리킨다. RTO 1시간·RPO 5분이라면 "1시간 안에 복구하되, 마지막 5분치 데이터는 잃어도 된다"는 뜻이다.

이 두 숫자는 IT가 임의로 정하는 게 아니라 **BIA(Business Impact Analysis, 비즈니스 영향 분석)**의 산출물이다. "다운타임 1분당 손실액이 얼마인가"를 사업 부서가 명시해야, RTO 1분을 위해 비용 수십 배를 쓰는 게 정당한지 판단할 수 있다.

> 💡 **관련 이론**: RTO/RPO는 ISO 22301(사업 연속성 관리 시스템, BCMS) 국제 표준에서 공식 정의된 용어다. ISO 22301은 BIA를 통해 MTPD(Maximum Tolerable Period of Disruption, 최대 허용 중단 시간)를 도출하고, 그 안에서 RTO를 설정하라고 규정한다. 또 NIST SP 800-34(연방 정보시스템 비상계획 가이드)도 동일한 RTO/RPO/WRT(Work Recovery Time) 체계를 쓴다. AWS WA Framework의 Reliability 기둥 질문(REL13: "재해 복구를 어떻게 계획하는가")이 바로 이 표준 용어를 차용한 것이다. 시험에서 "비즈니스가 허용하는 데이터 손실"은 RPO, "서비스 복구까지 시간"은 RTO로 즉각 매핑해야 한다.

> 🔍 **더 깊이**: RTO와 RPO는 독립적이다. RPO가 0(데이터 한 건도 못 잃음)인데 RTO는 1시간(천천히 복구해도 됨)인 시스템이 존재한다 — 예를 들어 야간 배치로 도는 회계 정산 시스템은 모든 거래를 보존해야 하지만(RPO≈0) 다음 영업일 아침까지만 복구되면 된다(RTO 수 시간). 반대로 RTO 0(즉시 복구)인데 RPO는 관대한 경우도 있다 — 읽기 위주 상품 카탈로그는 즉시 떠야 하지만 최근 몇 분의 가격 변경은 다시 동기화하면 된다. 시험은 이 두 숫자를 따로 흔들어 함정을 만든다. "RPO 0"이 보이면 동기 복제 또는 Active-Active, "RTO 수 시간 허용"이 보이면 비용 절감 여지(Backup & Restore)를 떠올려야 한다.

## 4가지 전략 — "평소 얼마나 켜두느냐"의 스펙트럼

AWS DR 백서(2021 개정판)는 DR을 4단계 스펙트럼으로 정리한다. 본질은 단순하다 — **DR 리전에 평소 자원을 얼마나 켜두느냐**다. 0%부터 100%까지 켜둠의 정도가 비용과 RTO를 동시에 결정한다.

| 전략 | RTO | RPO | 비용 | DR 리전 가동 상태 | 적합 워크로드 |
|------|-----|-----|------|------------------|----------------|
| **Backup & Restore** | 수 시간~수 일 | 수 시간 | ★ | 0%(데이터만 복사) | 개발·스테이징·비중요 |
| **Pilot Light** | 10분~수 시간 | 분 | ★★ | DB만 켜둠·앱은 콜드 | 중요도 중간 |
| **Warm Standby** | 수 분~30분 | 초~분 | ★★★ | 축소판 전체 스택 상시 | 미션 크리티컬 |
| **Multi-Site Active-Active** | 0~수 초 | 0~수 초 | ★★★★ | 100%·양쪽 트래픽 처리 | 금융·결제·게임 |

> 🔍 **더 깊이**: 네 전략을 외우려 하지 말고 **"capacity와 RTO는 반비례, capacity와 비용은 비례"**라는 한 문장으로 이해하라. Backup/Restore는 DR 리전에 컴퓨트를 0% 켜두므로 가장 싸지만, 장애 시 인프라를 처음부터 프로비저닝해야 해 RTO가 길다. Multi-Site는 100% 켜두므로 비용이 거의 2배지만 트래픽이 이미 흐르고 있어 RTO가 0에 수렴한다. Pilot Light와 Warm Standby의 결정적 차이는 **"앱 서버가 켜져 있느냐"**다 — Pilot Light는 DB만 핫·앱은 콜드(AMI만 준비), Warm Standby는 축소된 앱도 항상 떠 있다. 그래서 Warm Standby는 "스케일 아웃"만 하면 되지만 Pilot Light는 "앱을 처음 시작"해야 해 RTO가 더 길다.

### Backup & Restore — 최저 비용의 기준선

정기 스냅샷(EBS Snapshot·RDS Snapshot)과 S3 Cross-Region Replication으로 데이터만 DR 리전에 보내두고, 장애 시 IaC(CloudFormation·Terraform)로 인프라를 통째로 재생성한다. 비용은 사실상 스토리지 비용뿐이지만, 인프라 프로비저닝 + 데이터 복구에 수 시간이 걸린다.

> 📚 **사례**: 2017년 2월 28일 발생한 **AWS S3 us-east-1 대장애**(4시간)는 한 엔지니어의 오타 명령으로 S3 빌링 서브시스템 서버가 대량 제거되며 시작됐다. 이때 백업·DR을 단일 리전 S3에만 의존하던 수많은 서비스(Trello·Quora·Slack 일부 기능 등)가 동시에 멈췄다. 교훈은 명확하다 — **백업은 반드시 다른 리전(또는 다른 계정)에 격리**되어야 한다. 같은 리전·같은 계정에 백업을 두면 그 리전·계정 장애 시 백업도 함께 사라진다. 시험에서 "리전 전체 장애 대비"가 보이면 Cross-Region이 필수 조건이다.

### Pilot Light — DB만 핫, 앱은 콜드

비행기 점화용 작은 불씨(pilot light)에서 따온 이름이다. DR 리전에 DB(Aurora Global의 Reader, DDB Global Table)만 항상 켜 데이터를 지속 복제하고, 앱 서버는 AMI·Launch Template만 준비해 평소엔 실행하지 않는다. 장애 시 ASG의 min capacity를 0에서 올려 앱을 띄우고 Route 53로 트래픽을 전환한다.

### Warm Standby — 축소판 상시 가동

DR 리전에 production보다 작은 capacity의 **전체 스택**을 항상 가동한다. 앱 서버가 이미 떠 있으므로 장애 시 ASG를 production 수준으로 스케일 아웃만 하면 된다. Pilot Light보다 비싸지만 RTO가 짧다(스케일 아웃 시간만).

### Multi-Site Active-Active — 양쪽 동시 처리

양 리전 모두 production 트래픽을 처리한다. Aurora Global(write forwarding) 또는 DDB Global Tables로 데이터를 양방향 동기화하고, Route 53 Latency/Weighted 또는 Global Accelerator로 트래픽을 분배한다. 한쪽이 죽어도 다른 쪽이 이미 트래픽을 받고 있어 RTO가 0에 수렴한다. 대가는 데이터 일관성 설계(conflict resolution)의 복잡도와 거의 2배의 비용이다.

> 🎯 **시나리오**: "한 글로벌 결제 회사가 SLA 99.99%(연간 다운타임 52.6분)를 약속한다. 어떤 DR 전략인가?" — 답: **Multi-Site Active-Active + Aurora Global(또는 DDB Global) + Route 53**. 4 9(99.99%)는 연간 허용 다운타임이 약 53분에 불과해, 장애 시 수 분~수십 분이 걸리는 Pilot Light·Warm Standby로는 사실상 달성 불가능하다. 비용이 2배지만 결제 1분 중단의 손실이 그보다 크기에 정당화된다. 시험에서 "99.99% 이상 SLA + 글로벌"이 보이면 Multi-Site가 정답 신호다.

## 동기 vs 비동기 복제 — RPO를 가르는 물리 법칙

DR 전략의 RPO는 결국 **데이터 복제 방식**이 결정한다. 그리고 복제 방식은 빛의 속도라는 물리 한계에 묶인다.

**동기 복제(Synchronous)**는 쓰기 요청이 primary와 모든 사본에 도달해 확인(ack)을 받은 뒤에야 클라이언트에 성공을 반환한다. 따라서 RPO가 0이지만, 사본까지의 왕복 지연(RTT)이 모든 쓰기에 더해진다. **비동기 복제(Asynchronous)**는 primary에 쓰면 즉시 성공을 반환하고 사본에는 나중에 보낸다. 쓰기가 빠르지만, primary가 죽으면 아직 못 보낸 데이터가 사라져 RPO > 0이 된다.

여기서 핵심은 **거리**다. us-east-1(버지니아)과 us-west-2(오레곤)는 약 4,000km 떨어져 있고, 빛이 광케이블을 왕복하는 데만 물리적으로 약 40ms가 걸린다. 동기 복제를 리전 간에 걸면 모든 쓰기에 이 40ms가 더해져 처리량이 무너진다. 그래서 **동기 복제는 AZ 간(수 km, 1~2ms)에만 현실적이고, 리전 간 복제는 거의 항상 비동기**다.

> 💡 **관련 이론**: 이것이 분산 시스템의 **CAP 정리**와 **PACELC 정리**가 말하는 트레이드오프의 물리적 뿌리다. CAP은 "네트워크 분할(P) 시 일관성(C)과 가용성(A) 중 하나를 포기하라"고 한다. PACELC은 한 발 더 나가 "분할이 없을 때(Else)도 지연(L)과 일관성(C) 사이에서 골라야 한다"고 명시한다. 리전 간 동기 복제는 강한 일관성(C)을 택해 지연(L)을 감수하는 것이고, 비동기는 지연을 줄이는 대신 일관성을 양보(eventual consistency)한 것이다. Aurora가 리전 간을 비동기(storage-level)로, Multi-AZ를 동기로 설계한 이유가 바로 이 지연-일관성 균형이다. 시험에서 "리전 간 RPO 0"을 요구하면 거의 불가능하거나 큰 지연 대가를 의심해야 한다.

> ⚠️ **함정**: "RPO 0 = 항상 동기 복제"라고 외우면 틀린다. DDB Global Tables는 **비동기** Active-Active이지만 실무적으로 RPO를 거의 0으로 본다 — 모든 리전이 쓰기를 받으므로 한 리전이 죽어도 다른 리전에 이미 쓰인 데이터가 있기 때문이다. 반대로 Aurora Global은 secondary가 read-only라 한 리전 쓰기 구조이고 RPO는 보통 1초 미만(0은 아님)이다. 시험에서 "RPO 0 + 양 리전 쓰기"는 DDB Global Tables, "RPO 1초 + 글로벌 SQL"은 Aurora Global로 갈린다.

## 클라우드가 뒤집은 DR의 경제학

온프레미스 시절 DR은 **두 번째 데이터센터를 통째로 짓는 일**이었다. 평소 트래픽을 받지도 않는 건물·서버·냉각·인력에 수백억을 묻어두는 "보험료"였고, 그래서 대기업·금융권만이 진정한 DR을 가질 수 있었다. 클라우드는 이 구조를 근본적으로 바꿨다.

| 측면 | 온프레미스 DR | 클라우드 DR |
|------|--------------|-------------|
| **초기 투자** | 두 번째 데이터센터 건설(CAPEX) | 0(필요할 때 프로비저닝) |
| **유휴 비용** | 평소 100% 자원 비용 발생 | Pilot Light면 DB 비용만 |
| **DR 테스트** | 실제 장애 안 나면 검증 불가 | FIS·Game Day로 정기 검증 |
| **확장** | 사전 구매한 용량 한계 | 장애 시 Auto Scaling 무한 확장 |
| **RTO 단축** | 더 많은 하드웨어 구매 필요 | Warm/Multi-Site로 설정만 변경 |

핵심은 **"용량을 추측하지 말라(Stop guessing capacity)"**는 WA 일반 원칙이 DR에서 가장 빛난다는 점이다. 온프레미스는 DR 리전에 production 전체 용량을 미리 사둬야 했지만, 클라우드는 Pilot Light로 평소엔 DB만 켜두고 장애 순간에만 Auto Scaling으로 폭발적으로 확장한다 — 유휴 비용을 거의 0으로 만들면서도 RTO를 지킨다.

> 🔍 **더 깊이**: 이 경제학 변화 때문에 클라우드 DR은 **DR 사이트를 "비용 절감의 기회"로 재활용**할 수 있다. 예컨대 Warm Standby의 축소된 DR 스택을 평소엔 배치 처리·분석 워크로드에 쓰거나, Multi-Site의 양 리전을 Latency Routing으로 묶어 사용자에게 더 가까운 리전을 제공해 **DR과 성능 최적화를 동시에 달성**한다. 온프레미스에서는 불가능했던 "DR 자원의 이중 활용"이다. 시험에서 "DR 리전을 평소에도 활용해 비용 효율을 높이려면?"이 보이면 Active-Active 구성을 떠올린다.

## Route 53 기반 Failover 오케스트레이션

DR의 마지막 퍼즐은 "장애를 감지하고 트래픽을 DR로 돌리는" 메커니즘이다. AWS의 정석은 **Route 53 Failover Routing + Health Check**다. Primary 레코드에 Health Check를 붙여, 상태가 unhealthy가 되면 자동으로 Secondary(DR) 레코드로 DNS 응답을 전환한다.

- **Failover Routing**: Primary/Secondary 이중화. Health Check 실패 시 자동 전환.
- **Latency Routing**: 사용자에게 가장 빠른 리전으로(Multi-Site에 적합).
- **Weighted Routing**: 가중치로 트래픽 분배(점진적 전환·카나리).
- **Geolocation**: 사용자 위치 기반(데이터 주권 요구 시).

> ⚠️ **함정**: DNS Failover에는 **TTL 지연**이라는 숨은 함정이 있다. Route 53가 레코드를 바꿔도 클라이언트·중간 리졸버가 이전 IP를 TTL 동안 캐싱하면 즉시 전환되지 않는다. RTO를 초 단위로 요구한다면 DNS Failover만으로는 부족하고, **Global Accelerator**(애니캐스트 IP·고정 엔드포인트로 DNS 캐싱 우회) 또는 Active-Active 구성이 필요하다. 시험에서 "RTO 0~수 초 + DNS 캐싱 우회"가 보이면 Global Accelerator, "RTO 수 분 허용"이면 Route 53 Failover로 갈린다.

## 정리하며

DR은 **비즈니스가 RTO/RPO를 정의 → 4전략 중 비용 최저로 충족하는 것을 선택 → Route 53·복제로 구현**하는 워크플로다. 4전략(Backup & Restore·Pilot Light·Warm Standby·Multi-Site)은 "DR 리전에 평소 얼마나 켜두느냐"의 스펙트럼이며, capacity와 RTO는 반비례·비용은 비례한다. RPO는 동기(AZ 간·RPO 0)·비동기(리전 간·RPO>0) 복제가 결정하고, 이는 빛의 속도라는 물리 한계와 CAP/PACELC 트레이드오프에 뿌리를 둔다.

SAP 시험 단골 매핑: (1) "RTO 24시간·비용 최소" → **Backup & Restore**, (2) "DB만 항시 복제·앱은 정지" → **Pilot Light**, (3) "축소 스택 상시·수 분 RTO" → **Warm Standby**, (4) "99.99% SLA·양 리전 트래픽" → **Multi-Site Active-Active**, (5) "RPO 0 + 양 리전 쓰기" → **DDB Global Tables**, (6) "글로벌 SQL·RPO 1초" → **Aurora Global**, (7) "DR 트래픽 자동 전환" → **Route 53 Failover + Health Check**, (8) "RTO 초 단위·DNS 캐싱 우회" → **Global Accelerator**. 다음 day는 이 DR을 떠받치는 백업 인프라(AWS Backup·Vault Lock·Cross-Region Copy)를 도구 레벨까지 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 개발팀이 스테이징 환경의 DR을 설계한다. 비즈니스 SLA는 RTO 24시간·RPO 12시간으로 매우 관대하고, 비용을 최소화하라는 지시를 받았다. 가장 적합한 전략은?

A) Multi-Site Active-Active

B) Warm Standby

C) Pilot Light

D) Backup & Restore

**정답: D**

해설: RTO 24시간·RPO 12시간이라는 관대한 목표와 "비용 최소" 지시가 동시에 주어지면, DR 리전에 컴퓨트를 0% 켜두는 Backup & Restore가 정답이다. 정기 스냅샷·CRR로 데이터만 보내두고 장애 시 IaC로 인프라를 재생성하면 수 시간이 걸리지만 24시간 RTO 안에 충분히 들어온다. A·B·C는 모두 더 빠른 RTO를 제공하지만 그만큼 유휴 자원 비용이 발생해, 충족할 필요 없는 RTO를 위해 돈을 낭비하는 over-engineering이다. 함정: "충족 가능한 가장 저렴한 전략"을 고르는 것이 Pro 사고이며, RTO를 과도하게 초과 달성하는 것은 비용 낭비다.

---

**문제 2.** 한 회사가 DR 리전인 us-west-2와 production인 us-east-1 사이에 데이터베이스를 **리전 간 동기 복제(RPO 0)**로 구성하려 했더니 쓰기 처리량이 급감했다. 원인으로 가장 정확한 것은?

A) us-west-2의 인스턴스 사양이 부족하다

B) 약 4,000km 거리로 인한 왕복 지연이 모든 쓰기에 더해졌다

C) KMS 암호화가 복제를 느리게 한다

D) Route 53 TTL이 너무 길다

**정답: B**

해설: 동기 복제는 모든 사본의 ack를 받아야 쓰기가 완료되므로, primary와 사본 사이의 왕복 지연(RTT)이 모든 쓰기 지연에 더해진다. us-east-1↔us-west-2는 약 4,000km로 빛의 물리적 왕복만 약 40ms이며, 여기에 네트워크 오버헤드가 더해져 쓰기마다 수십 ms가 추가된다. 이것이 리전 간 동기 복제가 비현실적이고 거의 항상 비동기를 쓰는 이유다(CAP/PACELC의 지연-일관성 트레이드오프). A는 사양 문제로 오해한 것이고, C·D는 처리량 급감의 본질과 무관하다. 함정: "리전 간 RPO 0"을 요구하면 큰 지연 대가를 의심해야 한다.

---

**문제 3.** 한 미디어 회사가 DR 리전에 production과 동일한 전체 스택을 **축소된 capacity로 항상 가동**하고, 장애 시 Auto Scaling으로 확장해 수 분 내 복구하려 한다. 이 전략은?

A) Backup & Restore

B) Pilot Light

C) Warm Standby

D) Multi-Site Active-Active

**정답: C**

해설: Warm Standby의 정의는 "DR 리전에 축소된 capacity의 전체 스택(앱 서버 포함)을 상시 가동하고, 장애 시 스케일 아웃으로 production 수준에 도달"이다. 앱 서버가 이미 떠 있어 스케일 아웃 시간만 걸리므로 RTO가 수 분이다. B(Pilot Light)는 DB만 켜두고 앱은 콜드(AMI만 준비)라 앱을 처음 시작해야 해 RTO가 더 길다 — "앱 서버가 항상 떠 있느냐"가 둘을 가르는 결정적 차이다. A는 DR 리전에 아무것도 안 켜두고, D는 양쪽이 트래픽을 받는다. 함정: "축소판 전체 스택 상시 가동"은 Warm Standby의 직답 키워드다.

---

**문제 4.** 한 글로벌 게임 회사가 매치메이킹 서비스에 99.99% 가용성과 양 리전 동시 쓰기를 요구한다. 가장 적합한 DR·데이터 구성은?

A) Backup & Restore + S3 CRR

B) Pilot Light + Aurora Read Replica

C) Warm Standby + RDS Multi-AZ

D) Multi-Site Active-Active + DynamoDB Global Tables

**정답: D**

해설: 99.99% SLA(연간 다운타임 약 53분)는 장애 시 수 분이 걸리는 Pilot Light·Warm Standby로는 사실상 불가능하고, 양 리전이 이미 트래픽을 받는 Multi-Site Active-Active만이 RTO를 0에 수렴시킨다. "양 리전 동시 쓰기"는 multi-master인 DynamoDB Global Tables가 정답이다(Aurora Global의 secondary는 read-only). A·B·C는 모두 RTO가 분 단위 이상이라 4 9 SLA를 못 맞추고, B의 Read Replica는 양 리전 쓰기를 지원하지 않는다. 함정: "99.99% + 양 리전 쓰기"는 Multi-Site + DDB Global Tables의 직답 조합이다.

---

**문제 5.** 한 회사가 Route 53 Failover Routing으로 DR 전환을 구성했으나, 실제 장애 시 일부 사용자가 수 분간 여전히 죽은 primary로 접속했다. 원인과 RTO를 초 단위로 줄이는 해법으로 가장 정확한 것은?

A) Health Check 간격을 늘린다

B) DNS TTL 캐싱이 원인이며, Global Accelerator로 DNS 캐싱을 우회한다

C) Secondary 레코드를 삭제한다

D) Route 53를 다른 리전으로 옮긴다

**정답: B**

해설: Route 53가 레코드를 Secondary로 바꿔도 클라이언트·중간 DNS 리졸버가 이전 IP를 TTL 동안 캐싱하면 그 시간만큼 전환이 지연된다 — 이것이 DNS 기반 Failover의 본질적 한계다. RTO를 초 단위로 요구하면 Global Accelerator의 애니캐스트 고정 IP를 쓰면 된다. 클라이언트는 항상 같은 IP를 보고, AWS 네트워크 내부에서 엔드포인트를 즉시 전환하므로 DNS 캐싱 영향을 받지 않는다. A는 오히려 감지를 느리게 하고, C·D는 무관하다. 함정: "DNS 캐싱으로 인한 전환 지연 + 초 단위 RTO"는 Global Accelerator의 시그널이다.

---

**문제 6.** 한 기업이 비용 절감을 위해 DR 리전을 평소에는 유휴로 두지 않고 사용자 트래픽 처리에도 활용하고 싶다. 가장 적합한 접근은?

A) Backup & Restore로 전환한다

B) Pilot Light에서 DB만 더 크게 띄운다

C) Multi-Site Active-Active로 양 리전을 Latency Routing으로 묶어 DR과 성능 최적화를 동시에 달성한다

D) DR 리전을 삭제한다

**정답: C**

해설: 클라우드 DR의 경제학이 온프레미스와 다른 핵심은 DR 자원을 이중 활용할 수 있다는 점이다. Multi-Site Active-Active로 양 리전을 모두 production으로 운영하고 Route 53 Latency Routing으로 사용자에게 더 가까운 리전을 제공하면, DR(한쪽 장애 시 다른 쪽이 흡수)과 성능 최적화(지연 감소)를 동시에 얻는다 — 유휴 자원이 사라진다. A·B는 오히려 DR 리전을 더 유휴화하고, D는 DR을 포기하는 것이다. 함정: "DR 리전을 평소에도 활용"은 Active-Active 구성의 신호다.

---

**문제 7.** RTO와 RPO의 관계로 가장 정확한 설명은?

A) RTO와 RPO는 항상 같은 값이어야 한다

B) RTO는 장애 이후 복구까지의 미래 시간, RPO는 장애 이전 허용 데이터 손실의 과거 시간으로 서로 독립적이다

C) RPO가 0이면 RTO도 반드시 0이다

D) RTO는 데이터 손실, RPO는 복구 시간을 의미한다

**정답: B**

해설: RTO(Recovery Time Objective)는 시간축에서 장애 이후 미래(복구까지 허용 시간)를, RPO(Recovery Point Objective)는 장애 이전 과거(잃어도 되는 데이터의 시간 폭)를 가리키며 서로 독립적이다. 야간 배치 회계 시스템처럼 RPO≈0(모든 거래 보존)이지만 RTO는 수 시간(다음 영업일까지 복구)인 경우가 실재한다. C는 둘을 잘못 연동한 것이고, D는 RTO와 RPO의 정의를 뒤바꾼 것이다. 함정: "허용 데이터 손실"은 RPO, "복구 시간"은 RTO로 정확히 구분해야 하며 둘은 따로 흔들린다.

---

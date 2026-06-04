# Day 2 - 도메인 3·4 통합 복습: 복원력의 수학과 관찰성의 이론

어제 코드가 프로덕션까지 가는 흐름을 한 줄기로 꿰었다면, 오늘은 그 코드가 프로덕션에서 **버티고(복원력)** 그 상태를 **들여다보는(관찰성)** 두 도메인을 다룬다. 도메인 3(복원력, 15%)과 도메인 4(모니터링/로깅, 15%)는 합쳐 30%이며, 둘은 동전의 양면이다. 복원력은 "장애가 나도 살아남는 능력"이고, 관찰성은 "장애가 나는 순간 또는 나기 전에 그것을 아는 능력"이다. 관찰성 없는 복원력은 맹목이고(시스템이 죽어가는데 모름), 복원력 없는 관찰성은 무력하다(문제를 보지만 대응 자동화가 없음). DOP 시험은 이 둘을 종종 한 문제 안에서 엮는다 — "DR 페일오버를 자동화하라"는 문제는 복원력(라우팅 전환)과 관찰성(Health Check가 장애를 탐지)을 동시에 요구한다.

오늘의 복습은 RTO/RPO를 "분/초"로 외우는 데서 멈추지 않고, **왜 그 수치가 비용과 교환되는지의 수학**, 그리고 관찰성이 단순 로그 수집이 아니라 **분산 시스템의 인과를 재구성하는 이론**임을 다시 판다.

## RTO와 RPO — 두 시간축이 비용을 결정하는 수학

DR 전략을 이해하는 출발점은 **RTO(Recovery Time Objective)**와 **RPO(Recovery Point Objective)**라는 두 개의 독립된 시간축이다. 둘을 혼동하면 시나리오 문제에서 무너진다.

- **RTO**는 **시간의 축**이다. "장애 발생부터 서비스 복구까지 허용되는 시간." RTO 1분은 "1분 안에 다시 떠야 한다."
- **RPO**는 **데이터의 축**이다. "마지막 정상 시점부터 장애 시점까지 잃어도 되는 데이터의 양(시간으로 표현)." RPO 1초는 "최대 1초어치 데이터만 잃어도 된다."

> 💡 **관련 이론**: RTO와 RPO가 별개의 축인 이유는 **복구 속도(가용성 차원)**와 **데이터 손실(내구성 차원)**이 서로 다른 메커니즘으로 보장되기 때문이다. RTO는 "얼마나 빨리 대체 인프라를 띄우고 트래픽을 돌리는가"의 문제 — 핫스탠바이일수록 빠르다. RPO는 "데이터를 얼마나 자주, 얼마나 동기적으로 복제하는가"의 문제 — 동기 복제(synchronous replication)면 RPO≈0, 비동기 복제(asynchronous)면 복제 지연만큼 RPO가 늘어난다. 여기에 분산 시스템의 근본 한계인 **CAP 정리**가 개입한다. 두 리전 간 네트워크 분할(partition) 시, 강한 일관성(동기 복제, RPO=0)을 유지하려면 가용성을 희생해야 하고(쓰기 차단), 가용성을 유지하려면 일관성을 희생한다(비동기, RPO>0). Aurora Global Database가 "RPO 1초 미만"을 광고하지만 0이 아닌 이유가 바로 이것 — 리전 간 동기 복제의 레이턴시 비용을 피하려고 비동기 복제를 쓰되, 그 지연을 1초 미만으로 최적화한 타협이다. 시험에서 "RPO 0(데이터 손실 절대 불가)"을 요구하면 단일 리전 동기 복제(Multi-AZ) 또는 Active-Active 멀티라이트가 필요하고, "RPO 수 초 허용 + 멀티 리전 DR"이면 Aurora Global이 정답이다.

> 🔍 **더 깊이**: DR 4종 전략은 본질적으로 **"콜드(cold) ↔ 핫(hot)" 스펙트럼 위의 네 점**이다. Backup & Restore는 완전 콜드(인프라가 꺼져 있고 백업만 존재 → 복구 시 처음부터 프로비저닝, RTO 시간~일), Pilot Light는 "불씨만 켜둠"(핵심 DB는 복제 중이지만 앱 계층은 꺼둠 → 장애 시 앱만 부팅, RTO 십 분대), Warm Standby는 축소된 전체 환경이 상시 가동(소규모로 떠 있어 스케일업만 하면 됨, RTO 분대), Active-Active는 완전 핫(양쪽 리전이 동등하게 트래픽 처리, RTO≈0). 비용은 정확히 반대로 올라간다 — 콜드일수록 싸고, 핫일수록 비싸다. 이는 **"준비 비용(상시 가동) vs 복구 비용(장애 시 부담)"의 트레이드오프**다. 시험 단서 매핑: "최저 비용 + RTO 길어도 됨" → Backup & Restore, "핵심 데이터는 항상 최신이지만 앱은 평소 꺼둠" → Pilot Light, "수 분 내 복구 + 비용은 중간" → Warm Standby, "RTO 0 + 비용 무관" → Active-Active.

## 멀티 리전 도구의 분업 — 무엇이 어느 계층을 복제하는가

DR 전략을 구현하는 도구들은 각각 **다른 계층(데이터/라우팅/인프라)**을 책임진다. 이 분업을 알면 시나리오에서 정확한 조합이 나온다.

| 도구 | 책임 계층 | RPO/특성 | 대표 단서 |
|------|------|------|------|
| Aurora Global Database | 관계형 DB | RPO <1초, RTO ~1분, 최대 5~10 리전 | "RTO 1분 RPO 1초 SQL DB" |
| DynamoDB Global Tables | 키-값 DB | Active-Active, LWW 충돌 해소 | "두 리전 동시 쓰기 키-값" |
| S3 CRR / RTC | 객체 스토리지 | CRR 비동기, RTC 15분 SLA | "S3 객체 15분 내 복제 보장" |
| Route 53 | DNS 라우팅 | Failover/Latency/Weighted + Health Check | "DNS 기반 페일오버" |
| Global Accelerator | 네트워크(L4) | Anycast IP, ~1초 페일오버, 고정 IP | "고정 IP + 빠른 페일오버" |
| AWS Backup | 백업 오케스트레이션 | Cross-Region/Account 복사 | "중앙 백업 정책 + 리전 복제" |
| CloudFormation StackSets | 인프라 | 멀티 리전/계정 템플릿 배포 | "DR 리전에 동일 인프라" |

> 🔍 **더 깊이**: **Route 53과 Global Accelerator는 둘 다 "페일오버"를 하지만 작동 계층이 완전히 다르다.** Route 53은 **DNS 계층(L7 이름 해석)**에서 동작한다 — Health Check가 실패하면 DNS 응답을 대체 엔드포인트로 바꾼다. 문제는 **DNS 캐싱(TTL)**이다. 클라이언트·리졸버가 이전 IP를 TTL 동안 캐시하므로, TTL을 짧게(예: 60초) 줘도 페일오버에 수십 초~수 분이 걸리고, 일부 클라이언트는 TTL을 무시한다. Global Accelerator는 **네트워크 계층(Anycast IP)**에서 동작한다 — 사용자에게 변하지 않는 고정 IP 2개를 주고, 그 IP로 들어온 트래픽을 AWS 백본에서 건강한 엔드포인트로 라우팅한다. 엔드포인트가 죽으면 **DNS를 거치지 않고** 백본 레벨에서 ~1초 내 다른 리전으로 돌린다. 그래서 "IP를 바꿀 수 없는 클라이언트(방화벽 화이트리스트·IoT)" 또는 "1초급 빠른 페일오버"가 단서면 Global Accelerator, "표준적·저비용 DNS 페일오버"면 Route 53이다. 핵심: DNS 페일오버의 한계(TTL 캐싱)를 Global Accelerator가 우회한다는 인과를 알아야 한다.

> ⚠️ **함정**: DynamoDB Global Tables는 **Active-Active이고 충돌을 "마지막 쓰기 승리(Last Writer Wins, LWW)"로 해소**한다. 이것은 강한 일관성이 아니다 — 두 리전에서 같은 키를 거의 동시에 다르게 쓰면, 타임스탬프가 늦은 쓰기가 이긴다(앞선 쓰기는 조용히 사라진다). "두 리전에서 동일 레코드를 동시 수정해도 둘 다 보존돼야 한다"는 요건이면 LWW로는 안 되고 애플리케이션 레벨 충돌 해소(예: CRDT, 벡터 클록)나 단일 라이터 설계가 필요하다. 시험에서 "Active-Active 키-값"은 거의 항상 DynamoDB Global Tables가 정답이지만, "동시 충돌 데이터 손실 없음"이라는 추가 조건이 붙으면 LWW의 한계를 떠올려야 한다. 또 하나: Aurora Global Database의 secondary 리전은 기본적으로 **읽기 전용**이며, 쓰기를 받으려면 명시적 **failover(promote)**가 일어나야 한다 — Active-Active 쓰기 DB가 아니다.

> 📚 **사례**: 2021년 12월 **AWS us-east-1 대규모 장애**(약 7시간, 내부 네트워크 디바이스 자동 스케일링 이슈에서 시작)는 단일 리전 의존의 위험을 다시 일깨웠다. Disney+, Netflix, Robinhood, 그리고 수많은 서비스가 영향을 받았는데, 특히 충격적이었던 것은 **글로벌 서비스의 컨트롤 플레인이 us-east-1에 묶여 있어** 다른 리전에 워크로드를 둔 조직도 관리 기능(API·콘솔)이 마비됐다는 점이다. 교훈: (1) us-east-1은 많은 글로벌 컨트롤 플레인의 본거지라 "리전 다양화"만으로 충분치 않고 컨트롤 플레인 의존성까지 봐야 한다, (2) DR은 데이터 복제뿐 아니라 **페일오버 절차 자체가 장애 리전에 의존하지 않아야** 한다(예: 페일오버를 트리거하는 Lambda/파이프라인이 죽은 리전에 있으면 무용). DOP 시험이 "DR 자동화"를 물을 때 Route 53 Health Check + EventBridge + Step Functions를 **DR 리전 쪽에서** 돌리는 설계를 선호하는 이유가 이것이다.

## 카오스 엔지니어링 — 복원력을 "증명"하는 법

복원력을 설계하는 것과 그것이 실제로 작동함을 아는 것은 다르다. **AWS Fault Injection Simulator(FIS)**는 의도적으로 장애(AZ 다운, 인스턴스 종료, API 스로틀링, 네트워크 지연)를 주입해 시스템이 정말 복원되는지 검증한다.

> 💡 **관련 이론**: 이것이 **카오스 엔지니어링(Chaos Engineering)**이다. Netflix가 2010년경 **Chaos Monkey**(무작위로 프로덕션 인스턴스를 죽이는 도구)로 정립했고, 이후 Simian Army(Chaos Gorilla=AZ 장애, Chaos Kong=리전 장애)로 확장됐다. 핵심 철학은 **"장애는 일어난다는 것을 전제하고, 장애를 통제된 실험으로 일으켜 시스템의 약점을 평시에 발견한다"**이다. 과학적 방법과 같은 구조 — 정상 상태(steady state)에 대한 가설을 세우고, 실세계 이벤트(장애)를 주입하고, 가설이 유지되는지 관찰한다. FIS는 이 실험을 관리형으로, **자동 중단 조건(stop condition, CloudWatch Alarm 연동)**과 함께 제공해 실험이 실제 사고로 번지지 않게 한다. 시험에서 "복원력을 사전에 검증/테스트"하는 단서는 FIS가 정답이며, Synthetics(합성 모니터링)나 Inspector(취약점 스캔)와 혼동하면 안 된다 — FIS는 "고장을 일부러 낸다", Synthetics는 "정상 동작을 흉내 내 감시한다", Inspector는 "취약점을 스캔한다"로 역할이 다르다.

## 관찰성의 세 기둥 — 로그·메트릭·트레이스는 무엇을 다르게 답하는가

도메인 4로 넘어가면 핵심은 **관찰성(observability)**의 세 기둥 — 로그(logs), 메트릭(metrics), 트레이스(traces) — 가 각각 다른 질문에 답한다는 것이다.

| 기둥 | 답하는 질문 | 데이터 형태 | AWS 도구 |
|------|------|------|------|
| 메트릭 | "무엇이 얼마나?"(집계 수치) | 시계열 숫자 | CloudWatch Metrics, Managed Prometheus |
| 로그 | "정확히 무슨 일이?"(개별 이벤트) | 타임스탬프 텍스트 | CloudWatch Logs, OpenSearch |
| 트레이스 | "어디서·왜 느린가?"(요청 경로) | 분산 스팬(span) | X-Ray, ADOT |

> 💡 **관련 이론**: "관찰성"이라는 용어는 **제어 이론(control theory)**에서 왔다. 1960년 칼만(Rudolf Kálmán)이 정의한 관찰성은 "시스템의 **외부 출력만으로 내부 상태를 추론할 수 있는 정도**"다. 소프트웨어로 옮기면, 로그·메트릭·트레이스라는 외부 출력만으로 "지금 시스템 내부에서 무슨 일이 일어나는가"를 추론할 수 있어야 관찰 가능한 시스템이다. 모니터링과 관찰성의 차이가 여기서 갈린다 — **모니터링은 "내가 미리 정한 질문(대시보드·알람)에 답한다"**(known-unknowns), **관찰성은 "미리 예상 못 한 질문에도 사후에 답할 수 있다"**(unknown-unknowns). 세 기둥이 모두 필요한 이유: 메트릭은 "에러율이 급증했다"를 빠르게 알리지만 **왜**인지는 모르고(저카디널리티 집계), 로그는 개별 사건을 담지만 분산 시스템에서 한 요청이 어느 서비스를 거쳤는지 꿰지 못하며, 트레이스는 그 요청 경로를 이어 붙여 "어느 홉(hop)에서 시간이 샜는가"를 보여준다. 셋을 **상관(correlation)**시키는 것 — 메트릭 이상 → 해당 시간 로그 → 그 요청의 트레이스 — 이 현대 관찰성의 핵심이다.

> 🔍 **더 깊이**: **X-Ray의 샘플링(sampling)**은 Pro 단골이자 자주 틀리는 지점이다. 모든 요청을 트레이싱하면 비용·오버헤드가 폭증하므로, X-Ray는 **기본 샘플링 규칙**으로 "초당 1건(reservoir) + 그 이상은 5%"만 트레이싱한다. 트래픽이 큰 프로덕션에서 이 기본값은 너무 적거나(드문 에러를 놓침) 너무 많을 수 있어, **커스텀 샘플링 규칙**으로 특정 경로(`/checkout`)는 100%, 헬스체크(`/health`)는 0%처럼 조정한다. 이는 **통계적 표본 추출**의 응용 — 전수 조사 대신 대표 표본으로 모집단(전체 요청)의 행동을 추정하되, 희귀하지만 중요한 사건(에러)은 별도 규칙으로 보장 포착한다. 또 X-Ray의 후속·확장으로 **ADOT(AWS Distro for OpenTelemetry)**가 있는데, OpenTelemetry는 벤더 중립 표준(CNCF)이라 X-Ray·Prometheus·Jaeger 등 여러 백엔드로 동시 전송할 수 있다. 시험에서 "오픈소스 호환·벤더 종속 회피" 단서면 ADOT/OpenTelemetry, "AWS 네이티브 분산 트레이스"면 X-Ray다.

## 로그 파이프라인과 비용 — Logs Insights는 왜 비싼가

로그는 가장 풍부하지만 가장 비싼 기둥이다. 비용 구조를 이해하면 시험의 "장기 보관·대용량 분석" 패턴이 풀린다.

> ⚠️ **함정**: **CloudWatch Logs Insights는 스캔한 데이터량당 과금**된다. 수 TB의 로그를 대화형으로 반복 쿼리하면 비용이 빠르게 쌓인다. 그래서 "장기 보관 + 대용량 분석 + 저비용"이 단서면 답은 Logs에 영구 보존이 아니라 **Subscription Filter → Kinesis Data Firehose → S3 → Athena/Glue**다. 핵심 인과: CloudWatch Logs는 "실시간·단기 운영 가시성"에 최적이고, S3+Athena는 "저비용 장기 보관 + 가끔 대용량 분석"에 최적이다. Subscription Filter는 **거의 실시간으로 로그를 외부(Firehose·Lambda·OpenSearch)로 분기**시키는 무료에 가까운 경로이며, 이 분기로 운영(CloudWatch)과 분석/보관(S3·OpenSearch)을 비용 효율적으로 분리한다.

> 🔍 **더 깊이**: **EMF(Embedded Metric Format)**는 "메트릭과 로그의 비용을 동시에 줄이는" 영리한 트릭이다. 보통 Lambda에서 커스텀 메트릭을 만들려면 `PutMetricData` API를 동기 호출해야 하는데, 이는 (1) 추가 레이턴시 (2) API 호출 비용 (3) 고카디널리티(많은 차원 조합) 메트릭의 폭발적 비용을 유발한다. EMF는 **구조화된 로그 한 줄에 메트릭 정의를 포함**시켜 CloudWatch Logs로 보내면, CloudWatch가 그 로그에서 **자동으로 메트릭을 추출**한다. 즉 로그를 쓰는 김에 메트릭이 공짜로 따라온다 — `PutMetricData` 동기 호출이 사라지고(레이턴시·비용↓), 고차원 메트릭도 로그 기반이라 효율적이다. 시험에서 "Lambda에서 고카디널리티 커스텀 메트릭을 비용·성능 효율적으로"는 EMF가 정답이다.

> 📚 **사례**: 2019년 이후 여러 SaaS 기업이 "관찰성 비용 폭발(observability cost explosion)"을 공개적으로 토로했다 — 마이크로서비스가 늘수록 로그·메트릭·트레이스 데이터가 기하급수로 증가해, 어떤 조직은 관찰성 도구 비용이 프로덕션 인프라 비용에 육박했다. 이 현상이 EMF·샘플링·로그 티어링(hot=CloudWatch, cold=S3) 같은 비용 최적화 패턴을 표준으로 만들었다. DOP 시험이 "cost-effective" 한정어를 관찰성 문제에 자주 붙이는 배경이 이것 — 단순히 "다 수집해 OpenSearch에 넣어라"는 거의 항상 비용 함정 오답이고, "운영은 CloudWatch, 장기·대용량은 S3+Athena, 메트릭은 EMF"로 계층화하는 답이 정답이다.

## 멀티 계정 관찰성 — 흩어진 신호를 한 곳에서

50개 계정의 메트릭·로그·트레이스가 각 계정에 흩어져 있으면 장애 시 전체 그림을 볼 수 없다. **CloudWatch Cross-Account Observability(OAM, Observability Access Manager)**가 이를 푼다.

> 🔍 **더 깊이**: OAM은 **Sink(싱크, 모니터링 계정)와 Link(링크, 소스 계정)**라는 단방향 신뢰 모델이다. 중앙 모니터링 계정에 Sink를 만들고, 각 소스 계정이 그 Sink로 Link를 걸면, 모니터링 계정에서 모든 소스 계정의 Metrics·Logs·X-Ray Traces를 **읽기 전용으로** 한눈에 본다(데이터를 복사·이동하는 게 아니라 cross-account 읽기 권한을 위임). 이는 도메인 1에서 본 Tooling 계정 Hub-Spoke, 도메인 6의 Security Hub Delegated Admin과 같은 **"중앙 집계(centralized aggregation)" 패턴의 관찰성 버전**이다. 시험에서 "여러 계정 메트릭을 단일 대시보드로 통합" 단서는 OAM이 정답이며, Lambda로 메트릭을 긁어모으거나(운영 부담) Grafana만으로(인증·집계 직접 구현) 푸는 보기는 안티패턴이다.

```
멀티 계정 관찰성 + DR 통합
==================================================
  소스 계정들(Link)                 모니터링 계정(Sink)
  ┌─ Metrics ──┐
  ├─ Logs ─────┼──── OAM ────►  단일 대시보드 + 알람
  └─ X-Ray ────┘                (cross-account 읽기)

  DR 페일오버 흐름(DR 리전에서 구동)
  Route 53 Health Check(또는 GA) ──장애 탐지──►
     EventBridge ──► Step Functions(Runbook)
        ├─ Aurora Global secondary promote
        ├─ DNS/GA 엔드포인트 전환
        └─ SNS/Incident Manager 알림
```

> 🎯 **시나리오**: "글로벌 전자상거래가 ap-northeast-2(주)·us-east-1(DR)로 운영된다. 요구사항: ① SQL DB는 RTO 1분·RPO 수 초 ② 장바구니(키-값)는 양 리전 동시 처리 ③ 클라이언트가 IP를 화이트리스트해 IP 변경 불가, 페일오버 1초 ④ 40개 계정의 관찰성을 단일 대시보드로 ⑤ 페일오버 절차가 주 리전 장애에 의존하면 안 됨." → ① **Aurora Global Database**(secondary promote). ② **DynamoDB Global Tables**(LWW 한계 인지). ③ **Global Accelerator**(고정 Anycast IP, DNS TTL 우회). ④ **CloudWatch OAM**(Sink/Link). ⑤ 페일오버 자동화(Route 53/GA Health Check + EventBridge + Step Functions)를 **DR 리전에서** 구동 — 2021 us-east-1 장애의 교훈. 다섯 단서가 도메인 3·3·3·4·3을 가로지른다.

## 정리하며

오늘 도메인 3+4의 30%를 다섯 줄기로 묶었다. 첫째, **RTO(시간축)와 RPO(데이터축)는 별개**이며 CAP 정리가 RPO=0과 가용성의 교환을 강제하고, Aurora Global의 "1초 미만 RPO"는 비동기 복제 타협이다. 둘째, **DR 4종은 콜드↔핫 스펙트럼의 네 점**으로 비용과 RTO/RPO가 반비례하며, 단서별(최저비용/핵심만/수분/RTO0) 매핑이 즉답이다. 셋째, **Route 53(DNS, TTL 한계)과 Global Accelerator(Anycast, 고정 IP·1초)는 작동 계층이 다르고**, DynamoDB Global Tables의 LWW, Aurora secondary의 읽기 전용이 함정이다. 넷째, **FIS는 카오스 엔지니어링으로 복원력을 증명**하며 Synthetics/Inspector와 역할이 다르다. 다섯째, **관찰성은 로그·메트릭·트레이스 세 기둥의 상관**이고, X-Ray 샘플링·EMF·Logs Insights 비용·Subscription Filter 분기·OAM 중앙 집계가 비용 효율 관찰성의 핵심이며, 2021 us-east-1 교훈처럼 페일오버 자동화는 DR 리전에서 구동해야 한다.

다음 글에서는 도메인 5(인시던트)와 6(보안·컴플라이언스)를 통제(control) 이론과 자동 대응의 관점으로 다시 꿴다.

---

## 📝 연습 문제

**문제 1.** 한 핀테크의 관계형 데이터베이스 DR 요구가 "RTO 1분, RPO 1초 미만, 멀티 리전"이다. 가장 적합한 솔루션과, 그것이 RPO를 완전한 0으로 보장하지 못하는 이유는?

A) RDS Multi-AZ — RPO가 0이다

B) Aurora Global Database — 리전 간 비동기 복제로 RPO를 1초 미만으로 최적화하지만, 동기 복제의 레이턴시 비용을 피하려 비동기를 쓰므로 RPO가 정확히 0은 아니다

C) RDS Cross-Region Read Replica — RPO가 0이다

D) DynamoDB Streams — SQL을 지원한다

**정답: B**

해설: Aurora Global Database는 전용 복제 인프라로 리전 간 RPO를 보통 1초 미만으로 유지하고 RTO ~1분의 페일오버를 제공한다. RPO가 정확히 0이 아닌 이유는 CAP 정리의 현실 — 리전 간 동기 복제는 왕복 레이턴시를 모든 쓰기에 부과하므로, Aurora Global은 비동기 복제를 쓰고 그 지연을 1초 미만으로 최적화한다. RDS Multi-AZ(A)는 단일 리전(멀티 리전 DR 아님), Cross-Region RR(C)은 Aurora Global보다 RPO/RTO가 나쁘고, DynamoDB(D)는 키-값으로 SQL이 아니다.

---

**문제 2.** 클라이언트(파트너 방화벽)가 목적지 IP를 화이트리스트로 고정해 IP를 바꿀 수 없고, 리전 장애 시 1초 내 페일오버가 필요하다. Route 53 Failover만으로 부족한 이유와 올바른 선택은?

A) Route 53로 충분하다 — TTL을 0으로 하면 된다

B) Route 53는 DNS 계층이라 클라이언트/리졸버의 TTL 캐싱으로 페일오버가 수십 초~수 분 지연되고 IP도 바뀐다. Global Accelerator는 고정 Anycast IP 2개를 제공하고 AWS 백본에서 ~1초 내 페일오버하므로 이 요건에 맞다

C) CloudFront를 쓰면 된다

D) NLB를 멀티 리전에 두면 된다

**정답: B**

해설: Route 53 페일오버는 DNS 응답을 바꾸는 방식이라, 클라이언트와 리졸버가 이전 IP를 TTL 동안 캐시하고 일부는 TTL을 무시해 페일오버가 느리며, 응답 IP 자체가 바뀐다 — IP 고정 요건을 위반한다. Global Accelerator는 변하지 않는 Anycast IP를 주고 DNS를 거치지 않고 백본에서 건강한 엔드포인트로 ~1초 내 전환한다. TTL 0(A)도 DNS 캐싱 문제를 완전히 못 푼다. CloudFront(C)는 HTTP 캐싱·고정 IP 아님, 단일 리전 NLB(D)는 멀티 리전 페일오버를 자체 제공하지 않는다.

---

**문제 3.** "Active-Active 두 리전에서 키-값 데이터를 양쪽 다 쓴다"는 요건에 DynamoDB Global Tables를 골랐다. 추가로 "같은 키를 양 리전에서 동시 수정해도 두 변경이 모두 보존돼야 한다"는 조건이 붙으면 어떤 한계를 고려해야 하는가?

A) 한계 없음 — Global Tables가 둘 다 보존한다

B) Global Tables는 충돌을 Last Writer Wins(LWW)로 해소하므로 동시 충돌 시 늦은 쓰기가 이기고 앞선 쓰기는 사라진다. "둘 다 보존"이 필요하면 애플리케이션 레벨 충돌 해소(CRDT/벡터 클록) 또는 단일 라이터 설계가 필요하다

C) Global Tables는 강한 일관성이라 문제없다

D) Aurora Global로 바꾸면 자동 해결된다

**정답: B**

해설: DynamoDB Global Tables는 Active-Active이지만 충돌을 LWW로 해소한다 — 타임스탬프가 늦은 쓰기가 이기고 앞선 쓰기는 조용히 손실된다. "동시 충돌 데이터 둘 다 보존"은 LWW로 불가능하며 애플리케이션 레벨 병합 로직이나 단일 라이터가 필요하다. Global Tables는 강한 일관성이 아니다(C). Aurora Global(D)의 secondary는 읽기 전용이라 Active-Active 쓰기 자체가 안 된다.

---

**문제 4.** 수백만 사용자 서비스의 복원력 설계가 실제 장애에서 작동하는지 평시에 검증하고 싶다. 통제된 방식으로 AZ 장애·인스턴스 종료·API 스로틀링을 주입하되 실제 사고로 번지지 않게 하려면?

A) Amazon Inspector로 취약점 스캔

B) AWS Fault Injection Simulator(FIS)로 장애를 주입하고, CloudWatch Alarm 기반 Stop Condition으로 실험이 임계를 넘으면 자동 중단

C) CloudWatch Synthetics Canary로 합성 요청

D) GuardDuty로 위협 탐지

**정답: B**

해설: FIS는 카오스 엔지니어링 도구로, AZ 다운·인스턴스 종료·스로틀링 등 장애를 의도적으로 주입해 복원력을 검증하며, CloudWatch Alarm 연동 Stop Condition으로 실험이 통제를 벗어나면 즉시 중단한다(실험이 실제 사고가 되지 않게). Inspector(A)는 취약점 스캔, Synthetics(C)는 정상 동작을 흉내 낸 감시, GuardDuty(D)는 위협 탐지로 모두 "고장을 일부러 내는" FIS와 역할이 다르다.

---

**문제 5.** 50개 마이크로서비스의 분산 요청이 어느 서비스 홉에서 지연되는지 추적하려는데, 트래픽이 매우 커서 전수 트레이싱은 비용·오버헤드가 크다. 또 벤더 종속 없이 여러 백엔드로 보낼 수 있어야 한다. 가장 적절한 접근은?

A) 모든 요청을 X-Ray로 100% 트레이싱

B) ADOT(OpenTelemetry)로 계측하고 커스텀 샘플링 규칙(중요 경로 高비율, 헬스체크 0%)을 적용해 대표 표본만 수집

C) CloudWatch Logs Insights로 로그만 분석

D) Inspector로 스캔

**정답: B**

해설: 트레이스는 분산 요청의 인과 경로를 보여주는 기둥이다. 전수 트레이싱은 비용·오버헤드가 크므로 커스텀 샘플링으로 중요 경로는 높게, 헬스체크 등은 0%로 조정해 대표 표본을 수집한다(통계적 표본 추출). 벤더 중립·다중 백엔드 요건은 OpenTelemetry 표준 기반 ADOT가 충족한다. 100% 트레이싱(A)은 비용 폭발, Logs Insights(C)는 트레이스가 아닌 로그라 요청 경로를 꿰지 못하며, Inspector(D)는 무관하다.

---

**문제 6.** 수 TB의 애플리케이션 로그를 장기 보관하면서 가끔 대용량 분석을 해야 하는데, CloudWatch Logs Insights 비용이 부담된다. 가장 비용 효율적인 패턴은?

A) CloudWatch Logs에 영구 보존하고 Insights로 매번 쿼리

B) Subscription Filter → Kinesis Data Firehose → S3로 장기 보관하고, 분석은 Athena/Glue로 수행(운영 가시성은 CloudWatch 단기 보존 유지)

C) 모든 로그를 OpenSearch에 상시 적재

D) Lambda로 매일 로그를 수동 export

**정답: B**

해설: Logs Insights는 스캔 데이터량당 과금이라 대용량 반복 쿼리가 비싸다. Subscription Filter(거의 무료 분기)로 Firehose를 거쳐 S3에 저비용 장기 보관하고, 분석은 Athena로 필요할 때만 수행하는 계층화가 비용 효율적이다. 운영 단기 가시성은 CloudWatch에 짧은 보존으로 둔다. Logs 영구 보존(A)·OpenSearch 상시 적재(C)는 비용 폭발, 수동 export(D)는 운영 부담의 안티패턴이다.

---

**문제 7.** Lambda 함수에서 고카디널리티 커스텀 메트릭(예: 고객ID·지역별 조합)을 만들어야 하는데 `PutMetricData` 동기 호출의 레이턴시·비용이 문제다. 가장 적절한 방법은?

A) `PutMetricData`를 매 호출마다 동기 실행

B) Embedded Metric Format(EMF)으로 구조화 로그에 메트릭 정의를 포함해 CloudWatch Logs로 보내면 CloudWatch가 자동으로 메트릭을 추출 — 동기 API 호출 제거, 고차원 메트릭 효율화

C) X-Ray로 메트릭을 만든다

D) DynamoDB에 메트릭을 적재 후 집계

**정답: B**

해설: EMF는 구조화된 로그 한 줄에 메트릭을 포함시키고 CloudWatch가 거기서 메트릭을 자동 추출하는 방식이다 — `PutMetricData` 동기 호출(레이턴시·API 비용)을 없애고, 로그를 쓰는 김에 메트릭이 따라오며, 고카디널리티도 로그 기반이라 효율적이다. 반복 PutMetricData(A)는 비용·레이턴시 문제 그대로, X-Ray(C)는 트레이스이지 메트릭 추출이 아니며, DynamoDB 자체 집계(D)는 운영 부담이다.

---

## 📌 오늘의 요약

1. RTO(시간축)와 RPO(데이터축)는 별개이며, CAP 정리가 RPO=0과 가용성을 교환시킨다(Aurora Global의 1초 미만은 비동기 타협).
2. DR 4종은 콜드↔핫 스펙트럼이고 비용과 RTO/RPO가 반비례 — 단서별 즉답 매핑.
3. Route 53(DNS·TTL 한계)과 Global Accelerator(Anycast·고정 IP·1초)는 계층이 다르고, DynamoDB LWW·Aurora secondary 읽기 전용이 함정.
4. FIS는 카오스 엔지니어링으로 복원력을 증명하며 Synthetics/Inspector와 역할이 다르다.
5. 관찰성은 로그·메트릭·트레이스의 상관이고, EMF·샘플링·Subscription Filter·OAM이 비용 효율 핵심, 페일오버 자동화는 DR 리전에서 구동(2021 us-east-1 교훈).

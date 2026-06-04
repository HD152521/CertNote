# Day 29 - Week 5 복습: 글로벌 아키텍처 통합 시나리오

Week 5의 5일을 돌아보면 하나의 축이 관통한다. **글로벌 사용자를 어떻게 올바른 리전·엔드포인트로 보내고, 장애 시 어떻게 자동 또는 수동으로 전환하며, 그 모든 것을 비용 안에서 설계하는가.** DR 전략(Day 21), Route 53 라우팅 7종(Day 22), CloudFront 심화(Day 23), Global Accelerator(Day 24), Route 53 Health Check·DNSSEC·Resolver(Day 28). 이 다섯 레이어는 독립적으로 배웠지만 시험장에서는 하나의 시나리오 안에 섞여서 나온다.

오늘은 단순 반복이 아니다. 각 개념의 결정 트리를 압축하고, 가장 자주 틀리는 트레이드오프 비교를 수학 수준으로 정리하고, 복합 엔터프라이즈 시나리오 12문항으로 마무리한다.

## DR 전략 통합: Aurora Global RPO/RTO 수학

DR 전략의 숫자를 다시 본다. 암기가 아니라 "왜 이 숫자인가"를 이해해야 한다.

| 전략 | RTO | RPO | 비용 비율 | 핵심 메커니즘 |
|------|-----|-----|---------|-------------|
| Backup & Restore | 수시간~수일 | 백업 주기 | ~5% | S3 스냅샷, 복원 시 EC2+RDS 프로비저닝 |
| Pilot Light | 30분~2시간 | 분 단위 | ~15-25% | DB 복제 상시, 앱 서버는 AMI 대기 |
| Warm Standby | 수분~30분 | 분 단위 | ~30-50% | 축소된 풀 스택 상시 운영 |
| Active-Active | ~0 | ~0 | ~100%+ | 양 리전 동시 서빙 |

### Aurora Global Database의 수학

Aurora Global Database는 Pilot Light과 Warm Standby 사이에 위치하는 DR 도구다.

**RPO**: Aurora Global은 **비동기 복제**, Replication Lag은 일반적으로 **1초 미만**이다. 따라서 RPO ~ 1초. 다만 대규모 쓰기 폭풍(예: 배치 인서트 수백만 건)이 발생하면 Lag이 수초~수십초로 늘어날 수 있다.

**RTO**: Managed Planned Failover와 Unplanned Failover의 차이가 있다.
- **Managed Planned Failover** (계획된 전환): Aurora가 Secondary를 승격 전 Primary와 완전 동기화를 시도. RTO ~수 초. 데이터 손실 없음
- **Unplanned Failover** (Primary 리전 장애): Secondary 수동 승격 필요. `promote-read-replica-db-cluster` API 또는 콘솔. RTO ~1분(DB 승격) + 앱 재연결 시간

```bash
# Aurora Global Unplanned Failover: Secondary를 새 Primary로 승격
aws rds promote-read-replica-db-cluster \
  --db-cluster-identifier secondary-cluster-ap-northeast-2 \
  --region ap-northeast-2

# 승격 후 앱의 연결 문자열을 Secondary 클러스터 엔드포인트로 변경
```

**Replication Lag 모니터링**: `AuroraGlobalDBReplicationLag` CloudWatch 메트릭을 DR 판단 기준으로 사용한다. R53 ARC Safety Rule에서 이 메트릭을 조건으로 걸 수 있다 — "Lag > 5초이면 페일오버 금지".

> 💡 **관련 이론**: Aurora Global Database의 비동기 복제는 **WAL(Write-Ahead Logging)** 기반이다. PostgreSQL 호환 Aurora는 WAL 세그먼트를 Secondary 리전으로 스트리밍한다. 이 스트리밍은 Aurora Storage Layer에서 직접 이루어지므로 DB 엔진 레벨의 복제(binlog 기반 MySQL 복제)보다 오버헤드가 낮고, Lag도 짧다. Aurora Global Database의 1초 미만 Lag이 일반 RDS Cross-Region Read Replica(수 초~수십 초 Lag)보다 뛰어난 이유다.

### R53 ARC SafetyRule: 자동 페일오버의 안전장치

자동 Failover는 빠르지만 위험하다. "DB Replication Lag이 클 때 자동 Failover가 발동하면 5분치 데이터가 날아간다"는 시나리오가 실제 사고다. R53 ARC는 수동 전환 + SafetyRule로 이를 방지한다.

```
R53 ARC SafetyRule 예시:
MUST_EXIST: 전환 후에도 최소 1개 셀이 ACTIVE여야 한다
            → 모든 트래픽이 차단되는 상황 방지

ASSERTION: Aurora Lag < 3초일 때만 전환 허용
           → 데이터 손실 임계치 제어
```

SafetyRule은 **Gating Control** + **Assertion Control** 두 종류다:
- Gating Control: 다른 Routing Control을 켜기/끄기 전에 평가되는 선제 조건
- Assertion Control: 최소/최대 ACTIVE 상태를 보장하는 수량 기반 조건

> 📚 **사례**: Amazon 내부 시스템에서 나온 설계 원칙. 2019년 Amazon Shopping Cart 서비스가 자동 Failover로 인해 Secondary에 데이터 불일치가 발생했다. 이후 Amazon은 "DB Lag을 인간이 확인하고 안전 시 수동 전환"하는 원칙을 도입했고, 이것이 R53 ARC의 설계 철학이 됐다. ARC는 "자동화가 항상 옳지 않다"는 교훈의 산물이다.

## CloudFront + Global Accelerator 선택 공식

가장 혼동되는 두 서비스를 최종 정리한다.

```
선택 알고리즘:
1. UDP 프로토콜인가?
   YES → AGA (CloudFront는 UDP 불지원)

2. 정적 IP 2개가 필요한가? (방화벽 화이트리스트, BYOIP)
   YES → AGA

3. 캐싱이 핵심인가? (정적 콘텐츠, Cache Hit Rate > 50%)
   YES → CloudFront

4. WAF / Signed URL / Signed Cookies / FLE / Lambda@Edge 필요?
   YES → CloudFront

5. DNS 캐시 우회 즉각 페일오버가 필요한가?
   YES → AGA (Route 53 DNS 캐시 우회, 패킷 레벨 전환)

6. 기본 HTTP API, 캐시도 고정IP도 불필요?
   → Route 53 LBR이 가장 저렴
```

**비용 비교 (월 100GB 트래픽 기준)**:
- Route 53 LBR: 쿼리당 $0.0000004 → 100만 쿼리 = $0.40
- CloudFront: Data Transfer Out $0.085/GB × 100GB = $8.50 (캐시 없으면 Origin 요금 추가)
- AGA: 고정 $18/월 + $0.015~0.035/GB × 100GB = $20~$21.50

소량 트래픽에서 AGA 고정비 $18이 부담될 수 있지만, 고정 IP와 패킷 레벨 전환이 필요하면 선택의 여지가 없다.

> 🔍 **더 깊이**: CloudFront + AGA 조합 패턴. 고정 IP(AGA Anycast) + HTTP 캐싱(CloudFront)이 모두 필요한 경우, AGA를 앞단에 두고 CloudFront Origin으로 포워딩한다. 이 경우 AGA의 IP로 기업 방화벽을 화이트리스트하고, CloudFront에서 WAF·캐싱·Lambda@Edge를 처리한다. 이 패턴은 "고정 IP 기업 고객 + 퍼블릭 CDN"이 모두 필요한 하이브리드 SaaS에서 사용된다.

## Route 53 Health Check 종합 정리

| Health Check 유형 | 적합 시나리오 | 제약 |
|------------------|-------------|------|
| Endpoint (HTTP/S/TCP) | 퍼블릭 엔드포인트 직접 폴링 | Private 리소스 도달 불가 |
| CloudWatch Alarm 연동 | Private 리소스, 복잡한 메트릭 기반 | CW Alarm 설계 필요 |
| Calculated HC | 다계층 앱 전체 상태 판정 | 하위 HC 설계 복잡도 |

Failover 라우팅에서 Primary Health Check가 Unhealthy가 되면 모든 쿼리가 Secondary로 전환된다. 이때 "Secondary도 Healthy인가"를 보장해야 한다. Secondary에도 Health Check를 붙이고, Secondary가 Unhealthy면 Route 53은 Primary가 Unhealthy여도 Secondary로 전환하지 않고 Primary를 반환한다(덜 나쁜 선택).

> ⚠️ **함정 교훈**: Route 53이 DNS 캐시 문제로 느리게 전환된다고 느끼면, Health Check 감지 시간(기본 30초 간격, 3번 연속 실패 = 90초)과 DNS TTL을 합산해야 한다. 기본 설정에서 장애 감지 + TTL만 합산해도 90초 + 300초 = 390초(6.5분)가 될 수 있다. 빠른 전환이 필요하면 Health Check 간격을 10초(Fast)로 줄이고 TTL도 60초 이하로 낮춘다.

## Savings Plans 비용 계산 통합 복습

DR과 글로벌 아키텍처에서 비용 최적화는 SAP 도메인 4(지속적 개선) 영역이다.

**Compute Savings Plans vs EC2 Instance Savings Plans**:

| 항목 | Compute Savings Plans | EC2 Instance Savings Plans |
|-----|----------------------|--------------------------|
| 약정 | 1년 또는 3년 | 1년 또는 3년 |
| 할인율 | 최대 66% (On-Demand 대비) | 최대 72% |
| 유연성 | EC2 + Fargate + Lambda | EC2 특정 Family만 |
| 리전 변경 | 가능 | 불가 (특정 리전 고정) |
| 인스턴스 패밀리 변경 | 가능 | 불가 |
| DR 시나리오 적합성 | 리전 전환 시에도 적용 | DR 리전이 달라지면 적용 안 될 수 있음 |

DR 환경에서 리전이 달라질 가능성이 있다면 **Compute Savings Plans**가 더 안전하다. DR 발동 시 us-east-1에서 us-west-2로 전환해도 Compute Savings Plans는 그대로 적용된다.

**비용 계산 예시**:
```
현재: m5.xlarge On-Demand 10대 × $0.192/시간 × 720시간 = $1,382/월

Compute Savings Plans 1년:
할인율 30% → $0.134/시간
절감액: $1,382 - ($0.134 × 10 × 720) = $1,382 - $965 = $417/월 절감

Compute Savings Plans 3년:
할인율 50% → $0.096/시간
절감액: $1,382 - ($0.096 × 10 × 720) = $1,382 - $691 = $691/월 절감
```

> 💡 **관련 이론**: Savings Plans는 **금융의 선물 계약(Futures Contract)**과 유사한 구조다. 특정 컴퓨팅 사용량을 미래에도 일정 금액으로 구매하겠다고 약정하고, 그 대가로 할인을 받는다. Spot Instance는 반대로 "남는 용량을 현물 시장에서 싸게 구매"하는 스팟 거래다. 비용 최적화에서 이 두 가지를 조합하면 — Savings Plans로 기본 부하를 커버, Spot으로 버스트 처리 — 최적의 비용 구조가 된다.

## Well-Architected 6 Pillar 체크리스트: 글로벌 아키텍처 적용

| Pillar | 글로벌 아키텍처 체크포인트 | 주요 서비스 |
|--------|------------------------|-----------|
| 운영 우수성 | DR Runbook 자동화, 페일오버 훈련 주기화 | R53 ARC, Systems Manager Runbook |
| 보안 | CloudFront + WAF, DNSSEC, OAC, FLE | WAF, Shield, KMS |
| 안정성 | Multi-Region, Health Check, Calculated HC | Route 53, AGA, Aurora Global |
| 성능 효율 | CloudFront 캐시 히트율, AGA 백본 | CloudFront, Global Accelerator |
| 비용 최적화 | Savings Plans, Reserved, CloudFront vs AGA 선택 | Cost Explorer, Savings Plans |
| 지속 가능성 | 최소 필요 리전만 운영, 불필요 리소스 정리 | Trusted Advisor, Compute Optimizer |

> 🔍 **더 깊이**: 2022년 AWS Well-Architected Framework에 6번째 Pillar로 "Sustainability(지속 가능성)"가 추가됐다. SAP-C02는 이 6번째 Pillar를 명시적으로 다룬다. 글로벌 아키텍처에서 지속 가능성 최적화는 "필요 이상의 리전을 운영하지 않는 것"이 핵심이다. Active-Active가 RTO/RPO 요구사항을 초과 충족한다면 Warm Standby로 줄여 리소스 사용량을 낮추는 것이 지속 가능성 관점에서 옳다.

## 핵심 비교 매트릭스 최종판

### DR 전략 결정 트리

```
RTO > 4시간, RPO > 1시간?
  YES → Backup & Restore (가장 저렴)

RTO 30분~4시간, RPO 분 단위?
  "DB만 복제, 앱은 AMI로 빠르게 시작 가능"
  YES → Pilot Light

RTO 수분~30분?
  "풀 스택이 작은 규모로 항상 켜져 있어야"
  YES → Warm Standby

RTO ~0, 동시 서빙?
  YES → Active-Active (가장 비쌈)
```

### Route 53 + CloudFront + AGA 통합 결정 트리

```
사용자를 올바른 리전으로?
  데이터 주권 강제 → Geolocation
  성능 최적화 → Latency-Based Routing
  거리 + 트래픽 조정 → Geoproximity (Traffic Flow)
  DR Primary/Secondary → Failover

엔드포인트 가속이 추가로 필요?
  HTTP + 캐시 + WAF → CloudFront
  UDP / 고정IP / DNS우회페일오버 → AGA
  양쪽 다 → AGA 앞단 + CloudFront 뒷단

리전 내 페일오버?
  HTTP 오류 기반 즉각 재시도 → CloudFront Origin Failover
  Health Check 기반 리전 전환 → Route 53 / AGA
  수동 안전 전환 → R53 ARC Routing Control
```

---

## 📝 시나리오 12문항

**문제 1.** 한 글로벌 핀테크 회사가 us-east-1(Primary)과 ap-northeast-2(Secondary)로 Aurora Global Database를 운영한다. 장애 시 데이터 손실을 5초 이내로 제한해야 한다. 운영팀이 DB Replication Lag을 모니터링하다가 Lag이 급증하면 자동 페일오버를 막고 싶다. 어떤 구성이 가장 적합한가?

A) Route 53 Failover Health Check (자동 전환)
B) R53 ARC Safety Rule로 AuroraGlobalDBReplicationLag > 5초이면 페일오버 금지 + 수동 Routing Control
C) CloudWatch Alarm → Lambda → Route 53 레코드 자동 변경
D) DynamoDB Global Tables로 DB 교체

**정답: B**
해설: "Lag 조건부 페일오버 금지 + 수동 전환" = R53 ARC. SafetyRule의 Assertion Control로 Lag 조건을 설정하고, 실제 전환은 Routing Control을 사람이 조작한다. 자동 Failover(A, C)는 Lag 상태를 인식하지 못해 5초 초과 시 데이터 손실이 발생할 수 있다. D는 OLTP Aurora를 DynamoDB로 교체하는 것은 스키마 재설계가 필요한 Refactor로, 이 시나리오의 요구와 무관하다.

---

**문제 2.** 한 전자상거래 회사가 유럽 사용자는 eu-west-1, 아시아 사용자는 ap-northeast-2에서 서비스하고 싶다. 두 리전 모두 정상이면 각 리전의 사용자가 각자 리전으로 가고, 어느 리전이 장애나면 나머지 리전이 전체를 처리해야 한다. Route 53 구성은?

A) Geolocation 단독 (EU→eu-west-1, AS→ap-northeast-2, Default 없음)
B) Weighted (50:50)
C) Geolocation + Health Check 연동 (Primary Geolocation + Health Check 실패 시 Failover Default 레코드로)
D) Latency-Based Routing

**정답: C**
해설: Geolocation은 국가별 고정 매핑이다. 기본적으로 EU→eu-west-1, AS→ap-northeast-2로 보내되, eu-west-1이 장애 나면 EU 레코드의 Health Check가 Unhealthy가 되고 Route 53이 Default 레코드(ap-northeast-2)로 폴백한다. A는 Default 레코드가 없어 장애 시 매핑 없는 국가 또는 장애 리전 사용자에게 NODATA가 반환된다. D는 성능 기반이라 데이터 주권 요구가 있으면 부적합.

---

**문제 3.** 한 미디어 회사가 CloudFront로 HLS 스트리밍 서비스를 운영한다. 유료 가입자만 영상을 볼 수 있어야 하고, 로그인 후 수백 개의 .ts 세그먼트에 매번 인증이 필요하다. 가장 효율적인 CloudFront 접근 제어 방법은?

A) 각 .ts 파일마다 Signed URL 발급
B) 로그인 시 Signed Cookies 발급 (이후 모든 .ts 요청에 자동 포함)
C) CloudFront Functions로 모든 요청에 JWT 검증
D) S3 버킷 정책으로 IP 화이트리스트

**정답: B**
해설: HLS 스트리밍에서 .ts 세그먼트가 수백~수천 개면 Signed URL을 매번 발급하는 것은 비효율적이다. Signed Cookies는 로그인 시 한 번 발급하면 이후 모든 요청에 쿠키가 자동 포함돼 전체 콘텐츠 디렉토리를 커버한다. C는 CloudFront Functions가 외부 시스템 호출(JWT 검증 API)을 할 수 없어 Lambda@Edge가 필요하며, 모든 세그먼트 요청에 Lambda 비용이 발생한다. D는 사용자 IP가 변하면 차단되는 문제가 있다.

---

**문제 4.** 한 회사의 글로벌 게임이 UDP 기반 멀티플레이어 서버를 운영하고, 기업 B2B 파트너가 자신의 방화벽에 서버 IP를 등록해야 한다. 동시에 공격으로부터 게임 서버를 보호해야 한다. 어떤 구성이 가장 적합한가?

A) CloudFront + AWS WAF
B) Global Accelerator + AWS Shield Advanced
C) Route 53 LBR + ALB + WAF
D) API Gateway + Lambda@Edge

**정답: B**
해설: UDP 프로토콜 + 고정 IP(방화벽 화이트리스트) = AGA 필수. CloudFront는 UDP 불지원. AGA + Shield Advanced는 AGA Anycast IP를 통한 L3/L4 DDoS 공격을 PoP 레벨에서 흡수한다. CloudFront의 WAF는 L7이라 UDP에는 적용 불가. Route 53 LBR은 고정 IP를 제공하지 않는다.

---

**문제 5.** 한 금융 회사가 Aurora Global Database(Primary: us-east-1, Secondary: ap-northeast-2)의 Managed Planned Failover를 실행했다. ap-northeast-2가 새 Primary가 됐다. 이 과정에서 데이터 손실이 발생했는가?

A) 예. Managed Planned Failover도 결국 비동기 복제 기반이라 전환 시점의 Replication Lag(1초 미만)만큼 데이터가 손실된다
B) 아니오. Managed Planned Failover는 Secondary가 완전 동기화될 때까지 기다리고 전환하므로 데이터 손실이 없다
C) 예. Aurora Storage Layer 특성상 항상 1초 미만의 데이터 손실(RPO ~1초)이 고정적으로 발생한다
D) 전환 자체가 진행 중 트랜잭션 충돌로 실패해, Secondary를 수동 promote한 뒤 재시도해야 한다

**정답: B**
해설: Aurora Global Database의 Managed Planned Failover는 Aurora가 Secondary를 Primary와 완전히 동기화한 후 Primary를 강등하고 Secondary를 승격한다. RPO = 0, 데이터 손실 없음. 반면 Unplanned Failover(재해 상황, Primary 갑자기 죽음)는 Replication Lag만큼 데이터 손실이 발생할 수 있다. 이 차이가 시험에서 자주 출제된다.

---

**문제 6.** 한 SaaS 회사가 us-east-1에 EC2 100대를 운영 중이다. 현재 On-Demand. 트래픽이 안정적이고 앞으로 1년간 동일 규모로 운영할 예정이다. 인스턴스 패밀리를 바꿀 가능성은 없다. 비용을 최대로 절감하는 옵션은?

A) Compute Savings Plans 1년
B) EC2 Instance Savings Plans 1년
C) Spot Instances
D) Reserved Instances (3년 All Upfront)

**정답: B**
해설: 인스턴스 패밀리 고정 + 1년 약정 + 비용 최대 절감 = EC2 Instance Savings Plans 1년이 Compute Savings Plans 1년보다 할인율이 높다(최대 72% vs 66%). 인스턴스 패밀리를 바꿀 가능성이 없다면 더 엄격한 약정의 더 높은 할인을 선택한다. Spot은 스테이트풀 프로덕션 워크로드 100대에 전면 적용 부적합(중단 위험). RI 3년은 약정이 너무 길고 1년만 필요하다는 조건과 불일치.

---

**문제 7.** CloudFront Origin Failover와 Route 53 Failover의 결정적 차이는?

A) CloudFront Origin Failover는 리전 간 글로벌 전환을 담당하고, Route 53 Failover는 동일 리전 내 AZ 간 전환만 담당한다
B) CloudFront Origin Failover는 HTTP 응답 코드 기반 즉각 요청 재시도, Route 53 Failover는 DNS TTL 후 전환
C) 두 서비스 모두 Health Check 실패를 감지한 뒤 DNS 레코드를 변경하는 동일한 방식으로 작동한다
D) Route 53 Failover가 클라이언트 DNS 캐시를 우회하므로 CloudFront Origin Failover보다 항상 빠르다

**정답: B**
해설: CloudFront Origin Failover는 Primary Origin에서 5xx 또는 타임아웃이 발생하면 그 요청을 즉시 Secondary Origin으로 재시도한다. 요청 단위, 밀리초 단위 전환. Route 53 Failover는 Health Check가 실패를 감지(수십 초)하고 DNS 레코드를 변경해도 클라이언트 TTL 캐시 때문에 완전 전환까지 수분이 걸린다. 동일 CloudFront Distribution 내에서의 Origin 전환이 필요하면 CloudFront Origin Failover, 리전 자체를 바꾸는 글로벌 전환이면 Route 53 Failover.

---

**문제 8.** 한 회사가 ap-northeast-2에서 운영 중인 서비스를 eu-west-1로도 확장하려 한다. 유럽 사용자에게 서울보다 유럽 리전을 우선하되, eu-west-1이 장애나면 ap-northeast-2로 폴백해야 한다. 동시에 유럽 사용자의 DNS 캐시 때문에 장애 전환이 수분 지연되면 안 된다. 어떤 구성이 최적인가?

A) Route 53 Geolocation + Failover (EU → eu-west-1 Primary, ap-northeast-2 Secondary)
B) Global Accelerator (eu-west-1 Endpoint Group 100%, ap-northeast-2 그룹 대기) + AGA Health Check
C) Route 53 LBR + CloudFront Multi-Origin
D) CloudFront Lambda@Edge로 리전 라우팅

**정답: B**
해설: "DNS 캐시 지연 없이 수초 내 전환" = AGA. AGA는 패킷 레벨에서 리전 전환하므로 DNS TTL 영향이 없다. eu-west-1 Endpoint Group에 높은 우선순위(또는 Traffic Dial 100%), ap-northeast-2 그룹은 Health Check 기반 자동 페일오버 대상. A의 Route 53 Failover는 DNS TTL 지연이 있어 "수분 지연"이 발생한다. 요구사항의 "DNS 캐시 지연 불가"가 AGA를 선택하는 결정적 키워드다.

---

**문제 9.** 한 회사가 Field-Level Encryption(FLE)을 CloudFront에 적용했다. 신용카드 번호 필드가 CloudFront 엣지에서도 복호화되지 않아야 한다. 누가 복호화할 수 있는가?

A) CloudFront Edge Function (Lambda@Edge)
B) ALB
C) Origin의 결제 서비스 (RSA 개인키 보유)
D) CloudFront 자체가 복호화해 Origin에 평문 전달

**정답: C**
해설: FLE는 CloudFront Edge에서 RSA 공개키로 지정 필드를 추가 암호화한다. 이 암호화된 데이터는 엣지를 통과해 원본 서버까지 암호화 상태로 전달된다. 복호화는 RSA 개인키를 가진 Origin의 결제 서비스만 할 수 있다. HTTPS는 각 홉(클라이언트→엣지, 엣지→Origin)에서 복호화되는 Point-to-Point 암호화이고, FLE는 End-to-End 레이어를 추가로 제공한다.

---

**문제 10.** 한 기업이 Well-Architected Review를 받았다. "운영 우수성 Pillar에서 DR 페일오버 훈련이 문서화되지 않았고, 자동화되지 않았다"는 지적을 받았다. AWS에서 페일오버 Runbook을 자동화하는 가장 적합한 서비스는?

A) AWS Config Auto Remediation
B) AWS Systems Manager Automation (Runbook)
C) AWS Lambda (직접 코딩)
D) AWS CloudFormation (스택 재배포)

**정답: B**
해설: DR Runbook 자동화 = SSM Automation. R53 ARC와 연동해 "Routing Control 전환 → Aurora Failover → 앱 재연결 검증 → 알림"을 단계별 Runbook으로 구성한다. SSM Automation은 AWS 서비스 API 호출, 스크립트 실행, 병렬/분기 처리, 수동 승인 단계를 조합할 수 있다. Lambda로도 가능하지만 Runbook 형태의 시각화·재사용성·승인 단계가 SSM에서 더 강력하다.

---

**문제 11.** 한 스타트업이 글로벌 사용자에게 SaaS를 제공한다. 비용이 가장 중요한 제약이며, 현재 단일 리전(us-east-1)에서 99.9% SLA를 제공 중이다. RTO 4시간, RPO 1시간 요구사항을 만족하는 가장 저렴한 DR 전략은?

A) Active-Active 멀티 리전
B) Warm Standby (us-west-2)
C) Backup & Restore (S3 스냅샷, 다른 리전 복사)
D) Pilot Light (DB 복제 상시 운영)

**정답: C**
해설: RTO 4시간, RPO 1시간은 Backup & Restore로 충족 가능하다. 1시간마다 스냅샷/백업을 us-west-2에 복사하면 RPO 1시간. 장애 시 us-west-2에서 EC2+RDS를 프로비저닝하면 RTO 4시간 이내 가능. 비용은 주요 인프라의 ~5% 수준. Warm Standby는 30~50% 비용으로 과잉, Active-Active는 100%+로 훨씬 비쌈. 비용이 최우선 제약인 시나리오에서 요구사항을 "충족하는 가장 저렴한" 옵션이 정답이다.

---

**문제 12.** 한 회사가 DNSSEC을 Route 53 호스팅 존에 활성화했다. 활성화 후 일부 사용자에서 도메인이 SERVFAIL로 응답한다. 원인과 해결책은?

A) Route 53이 DNSSEC을 지원하지 않는 오래된 리졸버를 자동 차단해 SERVFAIL을 유발한다 — 호스팅 존에서 DNSSEC을 비활성화하면 해결
B) DS 레코드가 도메인 등록기관에 아직 등록되지 않았거나 잘못 등록됐다 — DS 레코드 정확히 등록 확인
C) DNSSEC은 Private Hosted Zone에서만 지원되며 퍼블릭 존에서는 SERVFAIL이 난다 — Private Hosted Zone으로 전환
D) Route 53이 자동 관리하는 KSK가 만료돼 서명 검증이 깨졌다 — 콘솔에서 새 KSK로 수동 롤오버

**정답: B**
해설: DNSSEC SERVFAIL의 가장 흔한 원인은 DS 레코드 등록 문제다. DS 레코드가 부모 도메인(도메인 등록기관)에 등록되지 않으면 신뢰 체인이 끊어진다. DNSSEC 검증 리졸버는 서명을 검증하려는데 DS가 없으면 BOGUS로 분류하고 SERVFAIL을 반환한다. 활성화 직후 DS를 등록기관에 정확히 입력했는지 확인하고, `dig DS example.com @8.8.8.8`로 DS 레코드 전파 여부를 검증한다. DNSSEC을 지원하지 않는 리졸버(오래된 DNS 서버)는 DNSSEC 플래그를 무시하고 정상 응답을 받으므로 A는 틀렸다.

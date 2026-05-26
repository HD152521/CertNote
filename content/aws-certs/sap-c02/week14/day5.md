# Day 70 - 복원력·DR 종합 복습: RTO/RPO를 지키는 4가지 전략과 검증 도구

DR(Disaster Recovery)을 "백업을 해두는 것"으로 이해하면 SAA 수준이다. Pro에서는 **RTO(Recovery Time Objective, 복구 시간 목표)**와 **RPO(Recovery Point Objective, 데이터 손실 허용 시간)**를 비즈니스가 정의하고, 그 숫자에 맞는 DR 전략을 비용 효율적으로 설계해야 한다. AWS는 이를 위해 **4가지 전략(Backup/Restore, Pilot Light, Warm Standby, Multi-Site)**과 **자동 검증 도구(Resilience Hub, FIS, DRS, Route 53 ARC)**를 제공한다. 오늘은 14주차에 본 DR 전체를 한 시나리오로 정리한다.

## DR 4전략: RTO/RPO/비용 trade-off

| 전략 | RTO | RPO | 비용 | 적합 워크로드 |
|------|-----|-----|------|----------------|
| Backup & Restore | 수 시간 ~ 수 일 | 수 시간 | ★ (가장 저렴) | 비중요 시스템, 개발/스테이징 |
| Pilot Light | 10분 ~ 1시간 | 분 단위 | ★★ | 중요도 중간 |
| Warm Standby | 수 분 ~ 30분 | 초 ~ 분 | ★★★ | 미션 크리티컬 |
| Multi-Site Active-Active | 0 ~ 수 초 | 0 ~ 수 초 | ★★★★ (가장 비싼) | 금융·결제·게임 매치메이킹 |

> 🔍 **더 깊이**: 4가지 전략은 본질적으로 "DR 환경에 평소 얼마나 자원을 켜두느냐"의 스펙트럼이다. Backup/Restore는 0% 켜둠, Multi-Site는 100% 켜둠. Pilot Light는 DB만 켜두고 앱은 꺼둠(failover 시 시작), Warm Standby는 축소된 capacity로 항상 켜둠(failover 시 확장). 비용은 capacity에 비례, RTO는 capacity에 반비례.

> 💡 **관련 이론**: Gartner의 **RTO/RPO 매트릭스**는 비즈니스 영향 분석(BIA, Business Impact Analysis)의 산출물이다. RTO 1분 vs 1시간의 차이는 수십 배 비용이 들 수 있으므로, 비즈니스 부서가 "다운타임 1분당 손실액"을 명시해야 합리적 설계가 가능. AWS는 이를 **WA Tool의 Reliability Pillar 질문**에 포함시켜 워크로드 등록 시 명시하게 한다.

### Backup & Restore: 최저 비용

- 정기 스냅샷 + S3 저장 + DR 시 인프라 재생성
- 비용 거의 0(스토리지 비용만)
- RTO 수 시간 이상(인프라 프로비저닝 + 데이터 복구)

> 📚 **사례**: 한 작은 SaaS가 production을 us-east-1에서 운영하며 백업만 us-west-2 S3에 CRR(Cross-Region Replication)로 보낸다. 리전 장애 시 us-west-2에서 CloudFormation으로 인프라 재생성 → 6시간 RTO. 비즈니스 SLA가 24시간이라 충분.

### Pilot Light: DB만 핫·앱은 콜드

- DR 리전에 DB(Aurora Replica, DDB Global Table)만 항상 켜둠
- 앱 서버는 AMI만 준비, 평소엔 안 실행
- Failover 시 ASG min capacity 증가 → 트래픽 전환

### Warm Standby: 축소 capacity 상시 가동

- DR 리전에 축소된 capacity의 전체 스택 가동
- Failover 시 ASG 확장으로 production 수준 도달
- RTO 수 분(스케일 아웃 시간)

### Multi-Site Active-Active: 양쪽 동시 트래픽

- 양 리전 모두 production 트래픽 처리
- Failover는 자동(Route 53 health check 또는 Global Accelerator)
- 비용은 거의 2배지만 RTO 0

> 🎯 **시나리오**: "한 글로벌 결제 회사가 SLA 99.99%(연간 다운타임 52분)를 약속한다. DR 전략은?" — 답: **Multi-Site Active-Active + Aurora Global + DDB Global + Route 53 ARC Routing Control**. 4 9 SLA는 사실상 Multi-Site 외에는 불가능. 비용 2배지만 1분 다운타임 = 수천만 원 손실이라 정당화됨.

## 백업·복원 인프라

### AWS Backup: 중앙 백업 서비스

- EC2, EBS, RDS, Aurora, EFS, FSx, DynamoDB, Storage Gateway 등 통합 백업
- 백업 정책(Backup Plan)을 Organizations 전체에 배포 가능
- Cross-Region·Cross-Account Copy로 격리된 백업 보관

### Vault Lock: Compliance vs Governance

| 모드 | 변경 가능 여부 | 사용처 |
|------|----------------|--------|
| Governance | IAM 권한 있으면 가능 | 일반 |
| Compliance | 어떤 권한으로도 불가 | 규제(7년 보관) |

> 🔍 **더 깊이**: Compliance 모드는 한 번 활성화하면 **AWS 본사 root 사용자도 변경 불가**. 백업이 영구 삭제되거나 변경되지 않음을 법적으로 보장. 금융권 SEC Rule 17a-4, FINRA 4511 등 WORM(Write Once Read Many) 요구사항을 만족. S3 Object Lock Compliance 모드와 동일한 철학.

> 📚 **사례**: 한 헬스케어 회사가 HIPAA 준수를 위해 환자 백업을 7년 보관해야 한다. Backup Vault Compliance Lock + Cross-Region Copy로 us-east-1·us-west-2 양쪽 보관. Vault Lock으로 의도적·우발적 삭제 모두 차단. 감사관에게 Vault Lock 정책 출력본을 제공해 컴플라이언스 증명.

### Backup Audit Manager

- 백업이 정책대로 실행되는지 자동 평가
- "Daily backup + 35-day retention + cross-region copy" 같은 룰 정의
- 위반 시 Security Hub 통합으로 알림

## 검증·자동화 도구

### Resilience Hub: RTO/RPO 자동 평가

- 워크로드 등록 → 자동으로 RTO/RPO 격차 식별
- 권고: "Aurora Multi-AZ로 변경 시 RTO 30초 달성" 같은 구체적 가이드
- CI/CD 통합으로 PR마다 resilience score 검증

### FIS (Fault Injection Simulator): 카오스 엔지니어링

- EC2 종료, latency 주입, API throttling, IAM 권한 일시 회수 시뮬레이션
- **Stop Condition**: 특정 CloudWatch 알람 발생 시 자동 중단
- 정기 카오스 테스트로 production 견고성 검증

> 💡 **관련 이론**: **Chaos Engineering**은 Netflix가 2010년 도입한 패러다임. "production은 항상 부분적으로 망가져 있다"는 가정 하에 정기적으로 의도적 장애를 주입해 시스템이 graceful degradation을 하는지 검증. AWS는 2021년 FIS로 관리형 서비스화. Stop Condition이 핵심 차별화 — 의도적 장애가 실제 사고로 번지지 않도록 안전망.

### Application Migration Service (MGN) vs Elastic Disaster Recovery (DRS)

| 서비스 | 용도 | 동작 |
|--------|------|------|
| MGN | 일회성 마이그레이션 | 온프레 → AWS 옮긴 후 종료 |
| DRS | 지속적 DR | 온프레/타 클라우드 → AWS 지속 복제 |

> 🎯 **시나리오**: "온프레미스 VM 100대를 AWS로 영구 이전(7R의 Rehost)". → **MGN**. "온프레미스 VM을 그대로 유지하면서 AWS에 24시간 DR 환경 유지". → **DRS**.

### Route 53 ARC (Application Recovery Controller)

- **Routing Control**: 사람이 명시적으로 ON/OFF 토글하는 failover (자동 health check와 별개)
- **Zonal Shift**: 문제 AZ를 ALB/NLB에서 즉시 제외 (수동 또는 자동)
- **Readiness Check**: DR 리전이 항상 production 수준의 readiness를 유지하는지 자동 검증

> 📚 **사례**: 한 핀테크가 production을 us-east-1·us-west-2에서 active-active로 운영. us-east-1에서 부분 장애 발생 시 자동 health check가 false positive를 일으킬 우려 → ARC Routing Control로 운영자가 명시적으로 traffic shift 결정. 자동 fail보다 더 신중하고 통제 가능.

## 데이터 계층 DR

### RDS Multi-AZ: Instance vs Cluster

| 모드 | Failover | Replica 사용 |
|------|----------|---------------|
| Multi-AZ Instance | 60-120초 | Replica는 standby, 트래픽 불가 |
| Multi-AZ Cluster | 35초 | 2개 Replica에 read 트래픽 가능 |

> 🔍 **더 깊이**: Multi-AZ Cluster는 2022년 출시. 기존 Multi-AZ Instance가 "1 primary + 1 standby(트래픽 불가)"였다면, Cluster는 "1 primary + 2 readable replica"로 진화. semi-synchronous replication으로 primary가 1개 replica에 데이터 도달 확인 후 commit ack → 비동기 replication보다 데이터 손실 위험 ↓.

### Aurora Global Database

- 최대 5개 리전, secondary는 read-only
- 일반적으로 RPO < 1초, RTO < 1분
- "Managed Planned Failover" 또는 "Unplanned Failover"

### DynamoDB Global Tables: Active-Active

- 모든 리전에 쓰기 가능
- Conflict resolution: last writer wins (timestamp 기반)
- 쓰기 latency: 같은 리전 RTT + replication overhead (~1초)

> ⚠️ **함정**: Aurora Global secondary는 read-only이지만 DDB Global Tables는 모든 리전에 쓰기 가능. "양 리전 쓰기"라는 키워드가 보이면 DDB Global Tables, 또는 Aurora Global의 write forwarding(write를 primary 리전으로 자동 forward, latency 대가).

### S3 Multi-Region Access Point (MRAP)

- 여러 리전의 S3 버킷을 단일 글로벌 엔드포인트로 노출
- 가장 가까운 리전으로 자동 라우팅
- Cross-Region Replication과 결합해 read·write를 모두 글로벌 분산

## DR 시나리오 키워드 매핑 표

| 키워드 | 정답 |
|--------|------|
| "RPO 0 + Active-Active 양 리전 쓰기" | DDB Global Tables |
| "글로벌 SQL DB + RPO 1초" | Aurora Global |
| "RDS Failover 30초" | Multi-AZ Cluster |
| "온프레 → AWS 영구 이전" | MGN |
| "온프레 + AWS 지속 DR" | DRS |
| "S3 다중 리전 단일 엔드포인트" | MRAP |
| "백업 7년 변경 불가" | Backup Vault Compliance Lock |
| "운영 중 의도적 장애 + 자동 중단" | FIS + Stop Condition |
| "DR 격차 자동 식별 + 권고" | Resilience Hub |
| "AZ만 즉시 트래픽 제외" | Route 53 ARC Zonal Shift |
| "사람이 명시적 failover 결정" | Route 53 ARC Routing Control |
| "백업 정책 준수 자동 평가" | Backup Audit Manager |

## 정리하며

DR은 **비즈니스 RTO/RPO 정의 → 4전략 중 선택 → 검증 자동화**의 워크플로다. 비용·RTO·RPO는 상호 trade-off이므로 무작정 Multi-Site를 선택하면 안 되고, 비즈니스 임팩트 분석으로 적정 수준을 정해야 한다. AWS Backup, Resilience Hub, FIS, DRS, Route 53 ARC를 조합해 "정의 → 구현 → 검증"의 전체 수명주기를 자동화하는 것이 Pro 수준의 설계.

다음 주(Week 15)는 **종합 시나리오**다. 대기업·스타트업·금융·미디어·정부/헬스케어 각 산업별 종합 케이스를 풀어본다.

---

## 📝 연습 문제

**문제 1.** RTO 5분 · RPO 1초 · 글로벌 SQL DB가 필요하다.

A) RDS Multi-AZ
B) Aurora Global Database
C) DMS Continuous Replication
D) Read Replica

**정답: B**
해설: Aurora Global은 최대 5개 리전, RPO < 1초, RTO < 1분 보장. RDS Multi-AZ는 단일 리전 내 가용성만, Read Replica는 일관성 약함. DMS는 마이그레이션 도구.

---

**문제 2.** "운영 중 의도적 장애 주입 + 알람 시 자동 중단".

A) Lambda로 수동 EC2 종료
B) FIS + Stop Condition
C) Trusted Advisor 모니터링
D) Resilience Hub 자동 테스트

**정답: B**
해설: FIS의 Stop Condition은 CloudWatch 알람 발생 시 진행 중인 실험을 즉시 중단. 의도적 장애가 실제 사고로 번지는 것을 방지하는 안전망.

---

**문제 3.** 규제 요건: 백업 7년 보관 + 즉시 변경·삭제 불가 (AWS root도 불가).

A) S3 Glacier Deep Archive
B) Backup Vault Compliance Lock
C) Backup Vault Governance Lock
D) S3 Object Lock Governance Mode

**정답: B**
해설: Compliance 모드만 AWS root 권한으로도 변경 불가. Governance는 IAM 권한 있으면 변경 가능. Glacier는 저장소이지 WORM 정책 아님.

---

**문제 4.** 양 리전 모두 쓰기 가능한 글로벌 DB.

A) Aurora Global (Read-Only Secondary)
B) DynamoDB Global Tables
C) RDS Cross-Region Read Replica
D) DocumentDB Global Cluster

**정답: B**
해설: DDB Global Tables만 multi-master active-active. Aurora Global은 secondary가 read-only(write forwarding은 가능하지만 본질은 single-writer). RDS Read Replica는 promotion 전엔 read-only.

---

**문제 5.** 문제 발생한 AZ만 즉시 트래픽에서 제외.

A) NACL로 트래픽 차단
B) Route 53 ARC Zonal Shift
C) ASG Detach Instance
D) ALB Connection Draining

**정답: B**
해설: Zonal Shift는 단일 명령으로 ALB/NLB에서 특정 AZ를 즉시 제외. 5분 이내 트래픽 재분배. NACL은 너무 광범위, ASG/ALB는 인스턴스 단위로 부분 대응만.

---

**문제 6.** 온프레미스 VM 200대를 AWS에 24시간 DR 환경으로 유지.

A) Application Migration Service (MGN)
B) Elastic Disaster Recovery (DRS)
C) DataSync
D) Snowball

**정답: B**
해설: DRS는 지속적 replication으로 DR 환경 유지. MGN은 일회성 마이그레이션이 끝나면 종료. "지속적 DR"이라는 키워드가 DRS의 시그널.

---

**문제 7.** RDS Failover를 30초 이내로 달성.

A) Multi-AZ Instance (Standby)
B) Multi-AZ Cluster (2 Replicas)
C) Read Replica
D) Snapshot 복원

**정답: B**
해설: Multi-AZ Cluster는 35초 failover, 2개 replica에 read도 가능. Multi-AZ Instance는 60-120초. Replica는 자동 failover 안 함(promotion 필요).

---

**문제 8.** DR 격차를 자동으로 식별하고 구체적 개선 권고.

A) Trusted Advisor
B) Resilience Hub
C) WA Tool
D) Config

**정답: B**
해설: Resilience Hub는 워크로드의 현재 RTO/RPO vs 목표 격차를 식별 + "Aurora Multi-AZ로 변경" 같은 구체적 권고. CI/CD 통합 가능.

---

**문제 9.** S3 다중 리전 버킷을 단일 글로벌 엔드포인트로 노출.

A) CloudFront
B) S3 Multi-Region Access Point (MRAP)
C) Global Accelerator
D) Route 53 Latency Routing

**정답: B**
해설: MRAP는 여러 리전 버킷을 단일 글로벌 엔드포인트로 묶어 가장 가까운 리전으로 라우팅. CloudFront는 CDN이지 S3 정책이 아님.

---

**문제 10.** 사람이 명시적으로 의사결정해 failover를 트리거.

A) Route 53 ARC Routing Control
B) Health Check 자동 failover
C) Lambda 자동 스크립트
D) Global Accelerator endpoint group failover

**정답: A**
해설: Routing Control은 자동 health check와 분리되어 운영자가 명시적으로 ON/OFF 토글. false positive로 인한 자동 failover 위험이 큰 미션 크리티컬 시스템에 적합.

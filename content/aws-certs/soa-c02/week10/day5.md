# Day 5 - Week 10 종합 복습 — 백업·DR·고가용성을 하나의 그림으로

Week 10을 관통하는 질문은 하나였다. **"원본이 사라지는 순간, 우리는 어디서 다시 시작할 수 있는가."** 그리고 그 답이 두 개의 축으로 갈라졌다 — **무엇을 잃을 수 있나(RPO)**와 **얼마나 빨리 복구하나(RTO)**. 백업은 RPO를 줄이는 게임이고, 가용성·DR은 RTO를 줄이는 게임이다. 이번 주의 모든 도구는 이 두 축 위의 어느 점에, 얼마의 비용으로 도달하느냐의 선택이었다.

이 복습은 개념을 나열하지 않고, 도구들이 **왜 그렇게 갈라지는지**를 다시 엮는다. 그래야 시험에서 처음 보는 시나리오를 만나도 "이건 RPO 문제인가 RTO 문제인가, 같은 리전인가 리전 간인가, 데이터인가 워크로드인가"로 도구를 역산할 수 있다.

## 한 장으로 보는 Week 10

| Day | 주제 | 한 줄 본질 |
|-----|------|-----------|
| 1 | EBS Snapshot / AMI / DLM | 변경 블록만 기억하는 증분·블록 공유 백업 |
| 2 | AWS Backup / Vault Lock | 발급자조차 못 지우는 격리된 멀티 서비스 백업 |
| 3 | RDS Multi-AZ / Read Replica / Aurora | 동기(HA)와 비동기(읽기·DR) 사이의 선택 |
| 4 | S3 복제 / Storage Gateway / DRS | 객체·파일·워크로드를 옮기는 세 가지 결 |

## RPO와 RTO — Week 10 전체를 꿰는 두 축

복구 설계의 모든 결정은 두 숫자로 환원된다. **RPO(Recovery Point Objective)**는 "얼마나 과거 데이터까지 잃어도 되나" — 마지막 백업/복제 시점과 장애 시점의 간격이다. **RTO(Recovery Time Objective)**는 "장애부터 복구 완료까지 얼마나 걸려도 되나"다. 이 두 숫자가 작을수록 비용이 가파르게 오른다. RPO 0(데이터 한 건도 못 잃음)은 동기 복제(Multi-AZ)를, RTO 분 단위는 즉시 부팅 가능한 복제(DRS, Aurora Global)를 요구하고, 둘 다 평소에 돈을 태운다.

| 도구 | RPO | RTO | 비용 성격 |
|------|-----|-----|-----------|
| 일별 Snapshot/Backup | 최대 24시간 | 복원 시간(수십 분~수 시간) | 저렴(저장만) |
| RDS Multi-AZ | 0 (동기) | 60~120초 자동 | 중간(Standby 상시) |
| Cross-Region Read Replica | 분 단위 | 수동 promote | 중간(RR 상시) |
| Aurora Global Database | < 1초 | < 1분 promote | 높음(멀티 리전) |
| S3 CRR (+RTC) | 분(15분 SLA) | 복제 도달 시간 | 전송+저장 |
| DRS (CDP) | 초 단위 | 분 단위 launch | 낮음(평소 Staging 작음) |

이 표가 시험 시나리오의 90%를 푼다. "데이터 손실 없이"는 RPO 0 → Multi-AZ. "리전 장애에도 1분 내 복구"는 Aurora Global DB. "평소 비용 최소 + 분 단위 복구"는 DRS. 문제에서 RPO/RTO 요구와 비용 제약을 읽어내면 도구는 거의 자동으로 결정된다.

## 패턴 1: DLM vs AWS Backup — 가벼움과 통합의 갈림길

같은 "자동 백업"이지만 경계가 분명하다. **DLM**은 EBS 볼륨·AMI **전용**의 경량 스케줄러로, 태그 기반으로 스냅샷을 찍고 보존·Cross-Region 복제를 자동화하며 정책 자체는 무료다. **AWS Backup**은 RDS·DynamoDB·EFS·FSx·S3까지 아우르는 멀티 서비스 통합 플랫폼으로, Backup Audit Manager로 컴플라이언스까지 검증한다. EBS만이면 DLM, 여러 서비스 + 감사면 AWS Backup이다.

## 패턴 2: 세 가지 WORM Lock — 같은 모델, 다른 자원

Week 10에는 "발급자조차 못 푸는 불변 보관"이 세 번 등장했다. 전부 같은 WORM 모델(1990년대 금융 규제의 물리 WORM 광디스크에서 유래)을 자원만 바꿔 입힌 것이다.

| Lock | 대상 | Governance | Compliance |
|------|------|-----------|-----------|
| Snapshot Lock | EBS Snapshot | 권한자 해제 가능 | 영구 해제 불가 |
| Backup Vault Lock | AWS Backup 금고 | 권한자 해제 가능 | cooling-off(3일) 후 영구 |
| S3 Object Lock | S3 객체 | 권한자 해제 가능 | retention 동안 영구 |

핵심 공통점: **Compliance 모드는 루트 계정·AWS조차 풀 수 없다.** "관리자도 못 지운다"가 곧 "공격자도 못 지운다"이고, 이게 Ransomware 방어와 규제 WORM의 본질이다. Governance는 실수 방지 가드레일(권한자 해제 가능)이다.

> 🔍 **더 깊이**: 세 Lock이 "Versioning 또는 그에 준하는 불변 버전 추적"을 전제하는 데는 공통 이유가 있다. 불변성(immutability)은 "특정 버전을 고정"하는 것이지 "키를 고정"하는 게 아니다. 같은 키에 덮어쓰기가 가능하면 "변경 불가"라는 약속을 지킬 수 없으므로, 각 쓰기가 고유한 버전(version ID)을 갖고 그 버전을 개별적으로 잠가야 WORM이 성립한다. S3 Object Lock이 Versioning 필수인 것, EBS Snapshot이 본질적으로 시점별 불변 객체인 것, Backup 복구 지점이 개별 식별자를 갖는 것이 전부 같은 이유다. 그래서 규제 감사에서 "이 데이터는 생성 후 변조되지 않았다"를 증명하려면, 변경 불가 플래그만으로는 부족하고 "각 버전이 고유하게 식별·고정됐다"까지 보여야 한다 — 불변 버전 체인이 곧 변조 부재의 증거다.

> 📚 **사례**: Snapshot Lock·Vault Lock·Object Lock의 Compliance 모드가 한결같이 "cooling-off 후 발급자도 불가"를 고수하는 건 과잉처럼 보이지만, 실제 규제 감사에서 이 차이가 합격과 불합격을 가른다. 금융·의료 감사자는 "관리자가 마음먹으면 지울 수 있는가"를 묻는다 — 지울 수 있으면(Governance) 그 백업은 변조 가능으로 분류돼 WORM 요건 미충족이다. 반대로 Compliance 모드는 third-party(Cohasset Associates)가 SEC 17a-4·FINRA·CFTC 규정 충족을 검증해 줘, 감사에서 법적 근거로 제출할 수 있다. "불편할 정도로 못 푼다"가 규제 신뢰의 가격이며, 편의(Governance)와 규제(Compliance)를 자원마다 선택하게 한 게 세 Lock의 공통 설계다.

## 패턴 3: Multi-AZ vs Read Replica — 동기/비동기가 모든 걸 가른다

이 주의 최다 빈출이자 최다 오답 지점이다. 표면이 비슷해도 정반대다.

| | Multi-AZ | Read Replica |
|--|----------|--------------|
| 목적 | 가용성(HA) | 읽기 확장 + Cross-Region DR |
| 복제 | 동기(ack 대기, RPO 0) | 비동기(지연 가능) |
| 클라이언트 읽기 | 불가(Standby 대기조) | 가능(별도 endpoint) |
| Cross-Region | 불가(같은 리전) | 가능 |
| 장애 대응 | 자동 페일오버(endpoint 유지) | 수동 promote(관계 단절) |

오답 패턴: "가용성"에 Read Replica, "읽기 분산"에 Multi-AZ를 고르는 것. Multi-AZ Standby는 읽기조차 못 받고, Read Replica는 비동기라 RPO 0이 아니다. 둘 다 필요하면 함께 쓴다.

## 패턴 4: 같은 리전 vs 리전 간 — DR의 경계선

가장 자주 묻히는 함정: **Multi-AZ는 DR이 아니다.** 같은 리전 AZ 장애는 견디지만 리전 전체 장애엔 무력하다(동기 복제라 리전을 못 넘는다). 리전 단위 DR은 별도 도구다.

```
같은 리전 (AZ 장애 대비)        리전 간 (리전 장애 대비, = DR)
─────────────────────          ─────────────────────────────
RDS Multi-AZ (동기)            Cross-Region Read Replica (RDS)
Multi-AZ DB Cluster            Aurora Global Database (RPO<1s)
S3 (자동 다중 AZ)              S3 Cross-Region Replication
EBS Snapshot                   DLM/Backup Cross-Region Copy
                               DRS (워크로드 페일오버)
```

## 패턴 5: 데이터 vs 워크로드 — 무엇을 복구하나

S3 Replication·DLM·AWS Backup은 **데이터**를 복제·보관한다. 장애 시 그 데이터로 서버를 다시 세우는 건 별도 작업이다. **DRS**는 **워크로드 전체**(OS·앱·데이터)를 분 단위로 다른 곳에서 부팅 가능하게 한다. "데이터센터를 통째로 AWS로 페일오버, 평소 비용 최소"는 DRS. "S3 객체만 다른 리전에"는 CRR. "온프레미스 앱은 그대로 두고 백엔드만 S3"는 Storage Gateway.

> 💡 **관련 이론**: Week 10 전체가 보여주는 메타 패턴은 "상태(state)와 변화(change)를 분리하면 시간을 다룰 수 있다"이다. EBS 증분 스냅샷(베이스 + 변경 블록), PITR(베이스 스냅샷 + 트랜잭션 로그), Aurora Backtrack(로그 되감기), S3 Versioning(버전 체인)이 모두 "전체 상태를 매번 복사하지 않고, 기준점 + 그 이후의 변화"로 데이터를 관리한다. 이 분리 덕에 임의 시점 복원, 블록 공유, 빠른 되감기가 가능하다. 함수형 영속 자료구조, Git, 이벤트 소싱이 같은 원리를 쓴다 — 상태를 불변의 스냅샷으로, 변화를 추가 전용(append-only) 로그로 두면 과거를 자유롭게 재구성할 수 있다.

---

## 📝 시나리오 12문제

**문제 1.** 운영자가 사용하지 않는 골든 AMI 수십 개를 deregister했는데 스토리지 비용이 거의 줄지 않았다. 원인과 조치는?

A) AMI 삭제는 비동기라 며칠 후 자동 정리된다
B) AMI deregister는 부팅 레시피만 제거하고 연관 EBS 스냅샷은 그대로 남으므로, 스냅샷을 별도 삭제하거나 DLM으로 정리해야 한다
C) AMI는 비용이 없으므로 정상이다
D) EC2를 종료하면 정리된다

**정답: B**

해설: AMI는 데이터를 직접 갖지 않고 EBS 스냅샷에 대한 참조 + 디바이스 매핑 메타데이터(부팅 레시피)일 뿐이다. deregister는 이 레시피만 제거해 실제 데이터인 스냅샷은 남아 계속 과금된다. 골든 AMI를 버전별로 만들고 지우면 미사용 스냅샷이 누적되는 대표적 비용 함정이다. 스냅샷을 명시적으로 삭제하거나 DLM 정리 옵션을 써야 한다.

---

**문제 2.** 회사가 RDS·EBS·DynamoDB·EFS를 하나의 정책으로 통합 백업하고 "모든 prod 리소스가 백업되는지" 자동 검증·보고하려 한다. 적합한 구성은?

A) 서비스별 DLM 정책
B) AWS Backup의 Backup Plan + Backup Audit Manager Framework
C) Lambda로 서비스별 스냅샷 스크립트
D) 수동 스냅샷 + 스프레드시트 점검

**정답: B**

해설: DLM은 EBS/AMI 전용이라 RDS·DynamoDB·EFS를 다루지 못한다. AWS Backup은 다수 서비스를 하나의 Backup Plan으로 통합 백업하고, Backup Audit Manager의 Control(BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN 등)로 미보호 리소스·보존 기간·Cross-Region 복사 여부를 지속 평가해 컴플라이언스 리포트를 자동 생성한다.

---

**문제 3.** Ransomware 공격자가 운영 계정 관리자 권한을 탈취해 백업까지 삭제하는 시나리오를 막아야 한다. 규제상 백업은 발급자조차 삭제 불가여야 한다. 가장 강력한 구조는?

A) 운영 계정 IAM 정책으로 삭제 권한 제거
B) Cross-Account로 별도 중앙 계정 Vault에 복제하고 그 금고에 Compliance 모드 Vault Lock 적용
C) 백업 빈도 증가
D) 모든 사용자에 MFA

**정답: B**

해설: 운영 계정이 통째로 침해되면 그 계정 내 IAM(A)은 우회된다. 백업을 다른 보안 경계(별도 계정)에 두고, 중앙 금고에 Compliance Vault Lock을 걸면 멤버 계정의 어떤 권한으로도, 중앙 계정 루트로도 보존 기간 내 복구 지점을 삭제할 수 없다. "관리자도 못 지운다"가 곧 "공격자도 못 지운다"이며, 이것이 Ransomware 방어 + 규제 WORM의 본질이다.

---

**문제 4.** 오후 2시 30분에 실행된 잘못된 DELETE 직전 상태로 RDS를 되돌려야 한다. 어제 새벽 스냅샷밖에 없으면 하루치를 잃는다. 필요한 기능은?

A) Manual Snapshot 복원
B) Point-in-Time Recovery(PITR) — 베이스 스냅샷 + 트랜잭션 로그 재생으로 임의 초 단위 시점을 새 인스턴스로 복원
C) Multi-AZ 페일오버
D) Read Replica promote

**정답: B**

해설: PITR은 주기적 베이스 스냅샷 + 연속 트랜잭션 로그(binlog/WAL)를 조합해, 지정 시각 직전 스냅샷을 복원한 뒤 로그를 그 시각까지 재생해 임의 시점을 재구성한다. 항상 새 리소스로 복원하므로 원본은 보존되고, 시점을 잘못 짚어도 다시 시도할 수 있다. 자동 백업 보존 기간(1~35일) 내에서 작동한다.

---

**문제 5.** "단일 AZ 장애에서 데이터 손실 없이 자동 복구"가 목표다. 정확한 RDS 기능은?

A) Read Replica
B) Multi-AZ — 다른 AZ Standby에 동기 복제, RPO 0, 자동 페일오버
C) Snapshot
D) Cross-Region Read Replica

**정답: B**

해설: Multi-AZ는 모든 커밋을 다른 AZ Standby에 동기 복제하고 ack를 받은 뒤 커밋을 완료하므로 Primary가 죽어도 마지막 커밋까지 보존돼 RPO가 0이다. 자동으로 Standby를 승격하고 endpoint를 전환한다. Read Replica(A)는 비동기·읽기 확장용이고, Cross-Region RR(D)은 리전 DR용 수동 promote다.

---

**문제 6.** 운영 중 DB 읽기 부하(분석·리포트)가 폭증한다. 비용 효율적으로 읽기를 분산하려면?

A) DB 인스턴스 크기 증가
B) Read Replica 추가, 별도 endpoint로 읽기 분산
C) Multi-AZ 활성화
D) Snapshot 증가

**정답: B**

해설: Read Replica는 비동기 복제로 읽기 전용 사본을 만들고 별도 endpoint로 읽기를 분산하는 정확한 도구다. Multi-AZ(C)의 Standby는 클라이언트가 읽기조차 못 보내 읽기 분산이 안 된다. 인스턴스 키우기(A)는 비용이 크고 읽기/쓰기를 분리하지 못한다.

---

**문제 7.** 글로벌 사용자에게 가까운 리전에서 빠른 읽기 + 리전 단위 DR(RPO<1초)이 필요하다. 가장 적합한 도구는?

A) RDS Multi-AZ
B) Aurora Global Database — 최대 5 Secondary 리전, 스토리지 계층 복제로 RPO<1초·RTO<1분
C) 단일 리전 Read Replica 다수
D) DynamoDB Multi-AZ

**정답: B**

해설: Aurora Global Database는 Primary 변경을 전용 인프라로 최대 5개 Secondary 리전 스토리지에 복제해, 각 지역에서 수십 ms 지연 읽기를 제공하고 리전 DR(promote 60초 이내)을 제공한다. 스토리지 계층 복제라 인스턴스 단위 RDS Cross-Region RR보다 지연·RTO가 작다.

---

**문제 8.** Lambda가 트래픽 폭증 시 RDS에 동시 수천 커넥션을 열어 DB 최대 커넥션 한도를 초과한다. 근본 해결은?

A) 인스턴스 타입 증가
B) RDS Proxy — 커넥션 풀로 소수의 실제 커넥션을 재사용(multiplexing)
C) Multi-AZ
D) Read Replica

**정답: B**

해설: Lambda는 동시 요청에 따라 함수가 수천 개로 폭증하고 각자 DB에 직접 커넥션을 열어 Connection Storm을 일으킨다. RDS Proxy는 DB 앞 커넥션 풀로 실제 커넥션을 풀 크기로 제한·재사용하고, Secrets Manager 통합과 빠른 페일오버까지 제공한다. 인스턴스 키우기(A)는 Lambda 스케일을 못 따라잡아 근본 해결이 아니다.

---

**문제 9.** 회사가 S3 데이터를 다른 리전 DR에 자동 복제하려 한다. 필수 전제는?

A) DataSync 주기 실행
B) S3 Cross-Region Replication + 소스·대상 양쪽 Versioning 활성화 + IAM Role
C) Storage Gateway
D) Lifecycle Policy

**정답: B**

해설: S3 CRR이 표준이며 소스·대상 버킷 양쪽 Versioning이 필수다. 복제 시스템이 각 객체 버전을 고유 version ID로 멱등하게 관리하려면 Versioning이 전제이기 때문이다. 켠 이후 새 객체만 자동 복제되며, 기존 객체는 S3 Batch Replication으로 백필한다.

---

**문제 10.** 운영 데이터센터를 AWS로 DR 페일오버 가능하게 하되 평소 비용 최소화, 페일오버 시 분 단위 복구가 필요하다. 어떤 도구인가?

A) S3 Replication
B) AWS Elastic Disaster Recovery(DRS) — 블록 레벨 CDP, 평소 작은 Staging, 페일오버 시 실제 크기 launch
C) Storage Gateway
D) DataSync

**정답: B**

해설: DRS는 서버 전체를 블록 레벨로 연속 복제(CDP)해 RPO 초 단위를 달성하고, 평소엔 저렴한 Staging(t3.small + EBS)에만 데이터를 쌓아 비용을 최소화하다 페일오버 시 실제 크기 인스턴스를 launch해 분 단위 RTO로 복구한다. S3 Replication(A)은 객체만 복제하므로 워크로드 페일오버에는 DRS가 정답이다.

---

**문제 11.** 규제상 S3 객체에 5년간 변경·삭제를 절대 불가능하게 강제해야 한다. 어떤 기능과 전제인가?

A) IAM 정책으로 삭제 거부
B) S3 Object Lock Compliance 모드 + 5년 retention, Versioning 필수
C) Cross-Region Replication
D) Glacier Deep Archive 이동

**정답: B**

해설: S3 Object Lock Compliance 모드는 retention 동안 루트 계정조차 객체를 삭제·덮어쓸 수 없는 WORM 보관으로 SEC 17a-4·HIPAA를 만족하고 Ransomware·내부자 삭제를 방어한다. 특정 버전을 고정하므로 Versioning이 필수다. IAM(A)은 권한 탈취 시 우회되어 불변성을 보장하지 못한다. Snapshot/Vault Lock과 같은 WORM 모델이다.

---

**문제 12.** DR 페일오버 시 큰 EBS 스냅샷에서 만든 새 볼륨의 첫 IO가 느려 복구가 지연된다. 비용을 고려한 해결은?

A) 스냅샷 재생성
B) 페일오버 대상 AZ에만 Fast Snapshot Restore(FSR)를 켜 미리 hydrate
C) gp2→gp3 변경
D) 인스턴스 타입 증가

**정답: B**

해설: 스냅샷에서 만든 볼륨은 기본적으로 lazy loading이라 블록을 처음 접근할 때 백업 스토리지에서 끌어와 초기 IO가 느리다. FSR은 스냅샷을 특정 AZ에 미리 완전히 hydrate해 첫 IO부터 최대 성능을 낸다. 단 FSR은 스냅샷×AZ 조합마다 시간당 과금되므로, 모든 AZ가 아니라 실제 페일오버 대상 AZ에만 선택적으로 켜는 것이 비용 최적화 정답이다.

---

## 🔮 다음 주 예고 (Week 11)

Week 11은 **성능·비용 최적화** — 운영자의 일상 업무다. Compute Optimizer로 right-sizing, Trusted Advisor의 5개 체크 카테고리, Cost Explorer·Budgets·Cost Allocation Tag로 비용 가시화, Savings Plans·Reserved Instances·Spot으로 비용 절감을 다룬다. Week 10이 "잃지 않고 빨리 복구하는" 안정성의 주였다면, Week 11은 "같은 안정성을 더 싸게" 만드는 효율의 주다.

# Day 5 - D-Day 체크리스트, 시험이라는 마지막 시스템을 운영하기

12주의 끝에 도착했다. 마지막 날 할 일은 새로운 지식을 욱여넣는 게 아니라 **이미 가진 것을 꺼내 쓰기 좋게 정리하는 것**이다. 시험 자체도 하나의 운영 대상이다 — 한정된 시간(180분)이라는 자원, Flag라는 큐잉 전략, 컨디션이라는 인프라. CloudOps 운영자가 시스템을 다루듯, 시험도 자원 배분과 리스크 관리의 문제로 보면 침착해진다.

이 글은 D-7부터 D-Day까지의 체크리스트, 시험장에서 실제로 작동하는 시간 배분과 문제 풀이 전략, 그리고 마지막 컨디션 조정용 20문항을 담았다. 문항 해설은 깊게 달아, 마지막으로 한 번 더 "왜 그 답인가"를 새긴다.

---

## 🧩 사전 지식 (시험 운영)

- **Pearson VUE / PSI**: AWS 시험 벤더(예약 시 선택)
- **Onsite vs OnVUE**: 시험장 vs 자택 온라인 응시(웹캠 + 원격 감독)
- **65문항 / 130분 채점 + 비채점 혼합**: 일부는 통계 수집용 비채점 문항(어느 것인지 표시 안 됨)
- **합격선 720/1000**: 단순 정답률이 아니라 문항 난이도를 반영한 척도 점수(scaled score)

> 💡 **관련 이론**: AWS 시험 점수가 "맞은 문항 수 ÷ 전체"가 아닌 **척도 점수(scaled scoring)**인 이유는 시험 형평성 때문이다. 시험마다 문항 세트가 다르고 난이도가 미세하게 다른데, 어려운 세트를 받은 응시자가 불리해선 안 된다. 그래서 각 문항의 난이도를 통계적으로 보정(문항반응이론, IRT 계열)해 720이라는 동일 기준으로 환산한다. 결과적으로 "쉬운 문항 다 맞고 어려운 몇 개 틀려도" 합격할 수 있고, 비채점 문항(채점에 안 들어가는 신규 검증 문항)이 섞여 있어 모든 문항을 똑같이 진지하게 풀어야 한다 — 어느 게 비채점인지 알 수 없기 때문이다.

---

## 1. D-7 ~ D-Day 체크리스트

운영에서 변경은 점진적으로, 위험한 변경일수록 일찍 한다. 시험 준비도 같다 — 새 지식 습득(위험·고부하)은 일찍 끝내고, 막바지엔 안정화(복습·휴식)만 남긴다.

### D-7 (시험 1주일 전) — 통합 복습

- [ ] 이번 주 Day 1·2·3 도메인 다시 읽기 재정독(데이터 모델·trade-off 중심)
- [ ] Day 4 모의고사 약점 도메인의 주차별 day.md 다시 보기
- [ ] AWS 공식 Exam Guide PDF 통독 — 출제 범위에 빠진 서비스 없는지 점검
- [ ] 시험 예약 확인(날짜·시간·언어·벤더)
- [ ] 시험장 위치 또는 OnVUE 환경(웹캠·네트워크) 점검

### D-3 (시험 3일 전) — 함정 집중

- [ ] 핵심 매핑 표(키워드 → 정답 서비스) 암기 점검
- [ ] 헷갈리는 쌍 정리: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica, OAC/OAI
- [ ] 모의고사 오답만 다시 풀기(맞은 문항은 건너뜀 — 시간 효율)
- [ ] 한국어 응시 권장(번역 모호성 회피). 영어 응시면 핵심 용어 친숙도 점검

### D-1 (시험 전날) — 안정화만

- [ ] **새로운 학습 X** — 기존 핵심 카드만 가볍게 회독
- [ ] 신분증 2개 준비(시험장: 주민등록증/운전면허/여권 중 2개, 영문명 일치 확인)
- [ ] OnVUE면: 웹캠·마이크·네트워크·조용하고 깨끗한 책상 확보(주변 물건 치우기)
- [ ] 충분한 수면(7-8시간) — 인지 성능은 수면에 직결

### D-Day (시험 당일) — 실행

- [ ] 시험장 30분 전 도착 / OnVUE 15분 전 체크인(신분 확인·룸 스캔)
- [ ] 가벼운 식사 + 적정 카페인(과다 금물 — 손떨림·화장실)
- [ ] 시작 후 **첫 5-10문항으로 페이스 잡기**(긴장 풀기)
- [ ] 헷갈리면 **Flag 후 다음으로** — 한 문항에 매몰 금지
- [ ] **마지막 10분 Review** — 빈 답안·실수 마킹 점검

> ⚠️ **함정**: D-1에 새 주제를 공부하는 것은 거의 항상 역효과다. 전날 처음 본 개념은 시험장에서 어설프게 떠올라 오히려 확실히 알던 답을 흔든다(간섭 효과). 마지막 24시간은 "새 입력 차단 + 기존 강화 + 휴식"이 정석이다. 운영으로 치면 중요한 릴리스 직전에 검증 안 된 변경을 배포하지 않는 것과 같다 — change freeze.

---

## 2. 시험 응시 전략 — 시간이라는 자원의 배분

### 시간 배분 (180분)

| 단계 | 시간 | 작업 |
|------|------|------|
| 1st pass | 약 100분 | 65문항 전부 한 번 — 즉답은 풀고, 막히면 Flag 후 넘김 |
| Review | 약 60분 | Flag한 문항 재검토(이제 시간 압박 없이) |
| Final check | 약 20분 | 빈 답 0 확인 + 마지막 점검 |

핵심은 **1st pass에서 한 문항에 90초 이상 쓰지 않는 것**이다. 분산 시스템에서 느린 요청 하나가 전체 처리량을 망치듯, 어려운 한 문항에 매달리면 쉬운 뒤 문항을 풀 시간을 잃는다. Flag는 "이 작업을 큐에 넣고 나중에 처리"하는 비동기 전략이다 — 막힌 작업을 블로킹하지 말고 넘긴 뒤, 자원(시간)에 여유가 생긴 Review 단계에서 처리한다.

### 문제 풀이 5단계

1. **질문을 끝까지 읽는다** — "MOST cost-effective", "LEAST operational overhead", "MOST secure" 같은 한정어가 정답을 가른다. 한정어를 놓치면 "되긴 되는" 오답을 고른다.
2. **시나리오 키워드를 잡는다** — "자동으로", "감사 가능한", "운영 부하 최소", "거의 실시간" 등이 특정 서비스를 가리킨다.
3. **명백히 틀린 보기를 먼저 제거한다** — 4지선다는 보통 2개가 확실히 틀리다. 남는 2개에 집중.
4. **남은 2개에서 한정어로 결정한다** — 둘 다 "가능"하지만 한정어(비용? 부하? 보안?)에 더 맞는 하나가 정답.
5. **확신이 없으면 Flag** — 직관으로 임시 답을 남기되(빈칸 금지), Flag해서 나중에 본다.

### 한정어 ↔ 정답 패턴

| 한정어 | 자주 나오는 정답 방향 |
|--------|----------------------|
| "MOST cost-effective" | Gateway Endpoint(무료) / Compute SP / S3 Intelligent-Tiering / Spot |
| "LEAST operational overhead" | 관리형 서비스(AWS Backup / Secrets Manager / Session Manager / Fargate) |
| "automatically" | Auto Scaling / DLM / Lifecycle / Config Remediation |
| "highly available" | Multi-AZ / Multi-Region / Route 53 Failover |
| "auditable" / "track who" | CloudTrail / Config / Audit Manager |
| "fastest recovery" | Multi-Site / Aurora Global → Warm Standby → Pilot Light 순 |
| "real-time threat" | GuardDuty |
| "encrypt + rotate" | KMS + Secrets Manager |

> 💡 **관련 이론**: "LEAST operational overhead"가 거의 항상 관리형 서비스를 가리키는 건 우연이 아니라 AWS 시험 철학의 반영이다. AWS는 고객이 차별화되지 않는 무거운 작업(undifferentiated heavy lifting) — 패치·백업·확장·HA 구성 같은 것 — 을 AWS에 위임하고 비즈니스 로직에 집중하길 바란다. 그래서 시험은 "직접 EC2에 설치·운영"보다 "관리형 서비스 사용"을 거의 항상 선호한다. EC2 자체 관리 < RDS < Aurora Serverless, 직접 cron < EventBridge Scheduler, bastion < Session Manager. "운영 부하 최소"가 보이면 가장 관리형인 보기를 의심하라.

---

## 3. 오답노트 양식

각 오답을 1장씩 아래 양식으로 정리하면 약점이 구조화된다. 핵심은 "왜 틀렸는가"를 세 유형(혼동/한정어/함정)으로 분류하는 것이다.

```
[오답노트 #N]
=====================================
📅 작성일: YYYY-MM-DD
📚 출제 도메인: 도메인 X (XX%)
🎯 출제 영역: <예: CloudWatch Composite Alarm>

📝 문제 요약
<핵심 시나리오 1-2줄>

❌ 내가 고른 답: <보기>
✅ 정답: <보기>

🔍 오답 유형 (택1)
□ 서비스 혼동   □ 한정어 놓침   □ 함정 보기

💡 핵심 학습 (한 줄로 기억할 패턴)
<예: "운영 부하 최소" → 관리형(Session Manager)>

🔗 관련 day.md
- weekN/dayM.md
=====================================
```

---

## 4. 최종 암기 카드 (시험 직전 5분 회독)

### 모니터링·로깅
- 메모리/디스크 메트릭 = **CloudWatch Agent**(하이퍼바이저가 게스트 내부를 못 봄)
- API 행위 = **CloudTrail**, 리소스 상태 = **Config**
- 알람 통합 = **Composite**, 동적 임계 = **Anomaly Detection**, 로그→메트릭 = **Metric Filter**

### 안정성·BCP
- HA = **Multi-AZ**(동기·손실0), 읽기 확장 = **Read Replica**(비동기·lag), 글로벌 = **Aurora Global DB**
- DR 4종 좌표 = Backup&Restore / Pilot Light / Warm Standby / Multi-Site (RTO·RPO·비용)
- 객체 보존 = **S3 Object Lock**, 백업 보존 = **Vault Lock**

### 배포·자동화
- 멀티 계정 IaC = **StackSets**, 변경 미리보기 = **Change Set**, 차이 탐지 = **Drift Detection**
- 즉시 롤백 = **Blue/Green**, 안전 교체 = **Immutable**
- 패치 = **Patch Manager + MW**, 접속 = **Session Manager**, DB 비밀 = **Secrets Manager**

### 보안
- Org 가드레일(상한) = **SCP**, 엔티티 상한 = **Permission Boundary**, 명시적 Deny가 우선
- 행위 위협 = **GuardDuty**, 취약점 = **Inspector**, S3 데이터 = **Macie**, 통합 = **Security Hub**

### 네트워킹
- **SG = Stateful**(응답 자동), **NACL = Stateless**(ephemeral port 명시)
- S3/DDB = **Gateway Endpoint**(무료), 기타 = **Interface Endpoint**
- 경로 진단 = **Reachability Analyzer**, HTTP 캐싱 = **CloudFront**, TCP/UDP = **Global Accelerator**

### 비용·성능
- Right Sizing = **Compute Optimizer**, 가장 유연 약정 = **Compute SP**, 최대 할인 = **Standard RI**
- 90% 할인(회수) = **Spot**, 용량 보장(할인X) = **Capacity Reservation**
- ML 이상 탐지 = **Cost Anomaly Detection**, 알림+자동차단 = **Budgets + Action**

---

## ⭐ 최종 핵심 포인트

1. ⭐ **CloudWatch + SSM이 출제의 큰 축** — 두 서비스를 깊이 알면 합격선에 근접한다
2. ⭐ **한정어가 정답 단서** — "MOST cost-effective", "LEAST overhead"를 놓치지 말 것
3. ⭐ **헷갈리는 쌍 마지막 점검** — SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica, OAC/OAI
4. ⭐ **시간 관리 = Flag 비동기 전략** — 한 문항에 매몰되지 말고 큐에 넣고 넘긴다
5. ⭐ **D-1은 change freeze** — 새 공부 금지, 핵심 카드 회독 + 충분한 수면

---

## 📝 짧은 모의고사 20문항 (컨디션 조정용)

> 💡 **관련 이론**: 이 20문항은 새 지식 테스트가 아니라 **인출 연습(retrieval practice)**이다. 인지심리학에서 기억은 "다시 떠올리는 행위" 자체로 강화된다 — 읽기만 반복하는 것보다 시험 형식으로 꺼내 보는 것이 장기 기억에 훨씬 효과적이다(testing effect). 시험 직전 가벼운 인출 연습은 자신감과 회상 속도를 동시에 올린다.

**문제 1.** EC2에 SSH 키 없이 접속하고 모든 세션을 CloudTrail로 감사하려면?
A) Run Command  B) Session Manager  C) Patch Manager  D) State Manager

**정답: B**

해설: Session Manager는 SSM Agent의 아웃바운드 연결로 셸을 열어 인바운드 포트·키 페어가 불필요하고, IAM으로 인가하며 모든 세션을 CloudTrail에 기록한다. 키 관리·포트 노출·감사 부담을 한 번에 없앤다.

---

**문제 2.** CloudFront에서 S3 오리진을 보호하는 현재 표준은?
A) OAI(구식)  B) OAC  C) Signed URL  D) Bucket Policy만

**정답: B**

해설: OAC(Origin Access Control)는 SigV4 서명 기반으로 OAI를 대체했고 KMS 암호화 객체까지 지원한다. S3를 비공개로 두고 CloudFront만 접근하게 강제한다. OAI는 레거시다.

---

**문제 3.** 조직 전체 계정에 권한 상한을 거는 가드레일은?
A) IAM Policy  B) SCP  C) Permission Boundary  D) Identity Center

**정답: B**

해설: SCP는 Organizations 단위 권한 상한이다. 단 권한을 부여하지 않고 제한만 하므로, 실제 권한은 각 계정의 IAM 정책으로 따로 줘야 한다. SCP의 Deny는 명시적 Deny라 모든 Allow를 이긴다.

---

**문제 4.** EC2·Fargate·Lambda 전부에 적용되는 가장 유연한 약정은?
A) Standard RI  B) EC2 Instance SP  C) Compute Savings Plans  D) Convertible RI

**정답: C**

해설: Compute SP는 서비스·패밀리·리전을 가리지 않고 시간당 금액만 약속하므로 가장 유연하다(할인은 중간). 유연성과 할인은 반비례하므로, 변동 큰 워크로드엔 Compute SP가 맞다.

---

**문제 5.** 두 리소스 간 경로를 실제 트래픽 없이 정적 진단하려면?
A) VPC Flow Logs  B) Reachability Analyzer  C) Traffic Mirroring  D) ping

**정답: B**

해설: Reachability Analyzer는 SG·NACL·라우트 구성을 정적 분석해 도달 가능 여부와 막힌 지점을 보고한다. 실제 패킷이 필요 없어 사전 진단에 적합하다. Flow Logs는 실제 트래픽 발생 후의 기록이다.

---

**문제 6.** 다운타임 0 + 즉시 롤백이 핵심인 배포는?
A) Rolling  B) All at once  C) Blue/Green  D) In-place

**정답: C**

해설: Blue/Green은 구 환경을 지우지 않고 신 환경으로 전환하므로, 문제 시 라우팅을 되돌리는 한 번으로 즉시 롤백된다. DNS 전환이면 TTL 지연, 공유 DB면 스키마 호환이 함정이다.

---

**문제 7.** S3에 저장된 PII(민감정보)를 자동 탐지하려면?
A) Inspector  B) GuardDuty  C) Macie  D) Detective

**정답: C**

해설: Macie는 ML로 S3 객체 내용을 스캔해 PII 위치·노출을 찾는다. "S3 데이터 내용"을 보는 유일한 서비스다 — Inspector는 취약점, GuardDuty는 행위 위협을 본다.

---

**문제 8.** 멀티 계정/리전에 동일 IaC를 일괄 배포하려면?
A) Nested Stack  B) StackSets  C) Change Set  D) Drift Detection

**정답: B**

해설: StackSets는 한 템플릿을 여러 계정·리전에 동시 배포·관리한다(조직 baseline 등). Nested Stack은 한 스택 내 모듈화로 범위가 다르다.

---

**문제 9.** 요일·시간대별 정상값이 크게 변하는 메트릭에 알람을 걸려면?
A) Composite  B) Anomaly Detection  C) Standard  D) Metric Math

**정답: B**

해설: Anomaly Detection은 과거 패턴을 ML로 학습해 동적 정상 밴드를 그리고 그걸 벗어나면 알람한다. 고정 임계로는 시간대별 변동을 못 따라가 오탐·미탐이 많다.

---

**문제 10.** Spot 회수 2분 전 경고를 받아 우아하게 종료하려면?
A) CloudWatch Alarm  B) EventBridge(Spot Interruption Warning) → Lambda/Lifecycle Hook  C) Cron  D) SQS

**정답: B**

해설: Spot 회수 경고는 EC2 Spot Instance Interruption Warning 이벤트로 오고, EventBridge로 받아 Lambda나 Lifecycle Hook으로 드레이닝·체크포인트 후 종료한다. Spot은 stateless·체크포인트 가능한 워크로드 전제다.

---

**문제 11.** RDS PostgreSQL의 약정 할인 모델은?
A) Compute SP  B) EC2 Instance SP  C) Reserved Instances(RDS RI)  D) Spot

**정답: C**

해설: Savings Plans는 EC2·Fargate·Lambda 대상이고 RDS는 포함하지 않는다. RDS·Redshift·ElastiCache는 각자의 Reserved Instances로 약정 할인을 받는다. "RDS 약정 = RDS RI"다.

---

**문제 12.** 리전 전체 장애에 대비한 RDS 구성은?
A) Multi-AZ  B) Cross-Region Read Replica / Aurora Global DB  C) Snapshot  D) Backup

**정답: B**

해설: Multi-AZ는 단일 리전 내 HA라 리전 전체 장애를 못 막는다. 리전 장애 대비는 다른 리전으로의 복제 — 일반 RDS는 Cross-Region Read Replica(필요 시 promote), Aurora는 Global Database가 정답이다.

---

**문제 13.** Security Group의 특징은?
A) Stateless  B) Stateful(응답 자동 허용)  C) 서브넷 단위  D) Deny 규칙 지원

**정답: B**

해설: SG는 stateful이라 나간 연결의 응답을 연결 추적 테이블로 자동 허용한다. allow 규칙만 지원하고, 적용 단위는 인스턴스(ENI)다. Deny와 서브넷 단위는 NACL의 특성이다.

---

**문제 14.** S3·DynamoDB만 무료로 프라이빗 연결하는 옵션은?
A) Interface Endpoint  B) Gateway Endpoint  C) PrivateLink  D) NAT

**정답: B**

해설: Gateway Endpoint는 S3·DynamoDB 전용이며 무료다(라우트 테이블 경로). NAT를 우회해 GB당 처리 요금을 없앤다. 기타 서비스는 유료 Interface Endpoint(PrivateLink)를 쓴다.

---

**문제 15.** EC2·EBS·Lambda의 Right Sizing을 ML로 권장받으려면?
A) Trusted Advisor만  B) Compute Optimizer  C) Cost Explorer  D) Budgets

**정답: B**

해설: Compute Optimizer는 14일 이상 메트릭의 퍼센타일 분포를 ML로 분석해 Over/Under/Optimized를 판정하고 적합 타입을 권장한다. 단 메모리는 Agent가 없으면 못 보므로 권장이 틀어질 수 있다.

---

**문제 16.** Config Rule이 비준수 리소스를 자동 수정하는 메커니즘은?
A) Lambda 직접  B) SSM Automation Remediation  C) EventBridge  D) CloudFormation

**정답: B**

해설: Config Remediation은 SSM Automation Document를 호출해 리소스를 표준 상태로 되돌린다. 이 수정은 멱등적(여러 번 실행해도 안전)이어야 하며, "이 상태가 되게 하라"는 선언적 액션이 그 조건을 만족한다.

---

**문제 17.** UDP 게임 트래픽을 글로벌 가속하고 고정 IP가 필요하면?
A) CloudFront  B) Global Accelerator  C) Route 53 Latency  D) ALB

**정답: B**

해설: CloudFront는 HTTP/S 캐싱 전용이라 UDP를 못 다룬다. Global Accelerator는 TCP·UDP를 AWS 사설 백본으로 가속하고 고정 Anycast IP 2개를 제공하며 리전 간 빠른 failover를 한다.

---

**문제 18.** DB 패스워드를 무중단 자동 회전하려면?
A) Parameter Store SecureString  B) Secrets Manager + Lambda  C) KMS  D) IAM

**정답: B**

해설: 자동 회전은 Secrets Manager의 핵심으로, create→set→test→finish 4단계 무중단 교체를 한다. Parameter Store SecureString은 암호화 저장은 되나 회전 기능이 없다. 더 근본적으로는 RDS IAM 인증으로 비밀 자체를 없애는 방법도 있다.

---

**문제 19.** 월 예산 임계 도달 시 자동으로 EC2 stop 또는 제한 SCP를 부착하려면?
A) Cost Anomaly Detection  B) Budgets + Budget Action  C) CloudWatch Alarm  D) Trusted Advisor

**정답: B**

해설: Budget Action은 임계 도달 시 IAM/SCP 부착이나 EC2/RDS 중지 같은 능동 조치를 한다. Cost Anomaly Detection은 ML 이상 탐지·알림까지이지 자동 차단 액션은 없다. "알림 + 자동 차단"은 Budgets + Action이다.

---

**문제 20.** PCI·SOC·HIPAA 컴플라이언스 증거 수집과 보고서를 자동화하려면?
A) Security Hub  B) Audit Manager  C) Config  D) Artifact

**정답: B**

해설: Audit Manager는 프레임워크별 필요한 증거를 자동 수집해 감사 보고서를 만든다. Artifact는 AWS 자신의 컴플라이언스 문서(SOC 보고서 등)를 받는 곳이고, Config는 리소스 컴플라이언스 평가다. "내 환경의 컴플라이언스 보고서 자동화"는 Audit Manager다.

---

## 📌 최종 요약 & 응원

1. **12주 완주를 축하합니다** — 꾸준함이 가장 큰 자산이었다
2. **CloudOps는 "운영자 관점" 시험** — 어떤 장애에 어떤 관리형 도구로 대응할지를 묻는다
3. **헷갈리는 쌍 마지막 점검**: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica, OAC/OAI
4. **시간 = 자원, Flag = 비동기 큐** — 한 문항에 매몰되지 말고 침착하게 배분
5. **D-1은 change freeze** — 새 공부 금지, 푹 자고 가벼운 컨디션으로

> 🏆 **합격을 기원합니다. 12주간 정말 수고 많으셨습니다. Fighting!**

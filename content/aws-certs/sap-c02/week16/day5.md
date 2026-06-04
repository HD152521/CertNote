# Day 80 - 최종 종합: 시험 채점 메커니즘, 출제 심리, 키워드 디코딩, 시나리오 모의고사 12문항 + D-Day 전략

80일의 마지막 날이다. 오늘은 새 개념을 배우지 않는다. 대신 **시험이 어떻게 채점되고, 출제자가 어떤 심리로 오답(distractor)을 까는지**를 분해하고, 그동안 쌓은 4개 도메인 지식을 "키워드 → 직답" 반사로 압축한 뒤, 실전 길이의 시나리오 모의고사 12문항으로 마무리한다. SAP-C02는 지식 시험이 아니라 **판단 시험**이다 — 정답처럼 보이는 선택지 사이에서 "요구를 가장 정확히, 가장 낮은 운영 부담으로 충족하는 단 하나"를 고르는 능력을 측정한다.

## 시험 채점·구조의 내부 메커니즘

> 🔍 **더 깊이**: SAP-C02는 **75문항 / 180분**이고 합격선은 **1000점 만점에 750점**(약 75%)이다. 핵심은 **scaled score(척도 점수)**라는 것 — 단순 정답 비율이 아니라 문항 난이도를 보정한 점수다(IRT, Item Response Theory 기반). 또 75문항 중 일부(약 15문항)는 **채점되지 않는 unscored 문항**으로, 신규 문제의 통계를 수집하는 용도다. 어느 것이 unscored인지 알 수 없으므로 모든 문항을 동일하게 대해야 한다. 부분 점수는 없고, 틀려도 감점은 없다(빈칸 < 추측). 그래서 **모르는 문항도 반드시 찍는다** — 4지선다는 기대값 25%, 2개를 소거하면 50%다.

> 💡 **관련 이론**: 객관식 시험의 오답(distractor) 설계에는 패턴이 있다. **"그럴듯하지만 한 조건을 놓친 답"**, **"맞지만 과한 답(over-engineering)"**, **"맞지만 운영 부담이 큰 답"**이 전형적이다. SAP-C02의 함정 대부분은 셋 중 하나다 — 예: 정답이 Managed 서비스인데 "직접 EC2로 구축"(운영 부담 과다)을 깔거나, SCP가 정답인데 "IAM Policy"(root를 못 막는 조건 누락)를 깐다. 그래서 채점 전략의 핵심은 **선택지를 정답 후보가 아니라 "어떤 조건을 위반하는지"로 소거**하는 것이다.

## 시험 당일 전략

### 시험 전 1주

- 80일 노트의 각 day "정리하며/요약" 핵심 키워드만 빠르게 순회
- 약점 도메인 1개를 골라 시나리오 30문항 집중
- AWS 공식 샘플 문제 + Exam Readiness 다시 풀기
- 모국어가 영어가 아니면 **ESL +30분 연장**을 사전 신청(시험 예약 단계에서, 당일 신청 불가)

### 시험 전 1일

- 새 개념 학습 금지 — 복습만
- 6시간 이상 수면(인지 성능이 점수에 직결)
- 신분증 2개 준비(Pearson VUE: 정부 발급 사진 ID + 보조 ID), 온라인 시험이면 환경 점검 사전 완료

### 시험 당일 3-pass 전략

1. **1차 통과**: 즉답 가능한 것만 답하고, 망설여지면 즉시 Mark for Review(시간 소모 금지)
2. **2차 통과**: Mark된 문항을 차분히 — 이때는 선택지 소거법으로 2개까지 줄인다
3. **3차 통과**: 빈칸 채우기 + 답 변경은 신중히(첫 직감이 통계적으로 더 맞는 경우가 많다 — 명확한 근거 있을 때만 변경)
4. **시간 배분**: 75문항 / 180분 = 평균 **144초/문항**. 1차에 60% 답하고 나머지 시간을 어려운 문항에 배분

> ⚠️ **함정**: Pro 시험 지문은 **길고 노이즈가 많다**. "회사 매출, 직원 수, 과거 시스템 역사" 같은 무관 정보를 깔아 핵심 제약을 묻는다. 전략은 **지문 끝의 실제 질문을 먼저 읽고 → 제약 키워드(RTO/RPO·운영 부담·비용·격리·규제·다운타임)를 추출한 뒤 → 지문을 역으로 스캔**하는 것이다. 모든 문장을 순서대로 읽으면 144초를 넘긴다.

## 키워드 디코딩 — 출제 언어 → 정답 신호

Pro 시험은 정답을 직접 말하지 않고 **암호화된 키워드**로 신호한다. 디코딩 사전:

| 출제 키워드 | 정답 신호 |
|------------|----------|
| "운영 부담 최소·관리 오버헤드 없이" | Managed/Serverless(Lambda·Fargate·Aurora Serverless) |
| "가장 비용 효율적" | SP·Spot·Lifecycle·서버리스·On-Demand 회피 |
| "장애를 격리" | AZ→Region→Account 사다리 |
| "사람 개입 없이·자동 복구" | EventBridge·SSM Automation·Auto Scaling |
| "root 사용자도 막아야" | SCP(IAM Policy 아님) |
| "변경 절대 불가·규제" | Object Lock/Vault Lock **Compliance**(Governance 아님) |
| "RPO 초/분 단위·글로벌 SQL" | Aurora Global Database |
| "각 리전 로컬 쓰기·eventual OK" | DynamoDB Global Tables |
| "최소 다운타임·OS 통째·일회성" | MGN(지속 DR이면 DRS) |
| "이기종 DB + 스키마 변환" | DMS + SCT |
| "수십~수백 TB + 느린 회선" | Snow Family + 온라인 델타 |
| "SaaS→다수 고객 VPC·IP 충돌 무관" | PrivateLink |
| "DX 장애 1초 내 전환" | BGP + BFD |
| "사람이 판단하는 신뢰성 높은 Failover" | Route 53 ARC Routing Control |

> 🎯 **시나리오**: 한 지문이 "스타트업이 빠르게 성장 중이며 엔지니어가 3명뿐이고 운영에 시간을 쓸 수 없다"고 하면, 이건 비용·규모가 아니라 **"운영 부담 최소 → 가장 관리형/서버리스 선택지"**를 고르라는 암호다. 같은 아키텍처라도 "전담 SRE 팀이 있고 세밀한 제어가 필요하다"면 EC2·EKS 같은 더 통제 가능한 선택지로 기운다. **조직 맥락이 곧 정답 가중치**다.

## 4개 도메인 한 페이지 압축

| 도메인 | 비중 | 핵심 도구 | 정답 반사 |
|--------|------|----------|----------|
| 1. 조직 복잡도 | 29% | Org·SCP·Control Tower·TGW·DX·PrivateLink·Outposts | 계정=격리, SCP=천장, TGW=O(N), Snow=대역폭 |
| 2. 신규 솔루션 | 29% | Lambda·Fargate·Aurora·DynamoDB·EventBridge·Kinesis | CAP/PACELC, 결합도 분리, fan-out |
| 3. 마이그·현대화 | 20% | MGN·DMS+SCT·Snow·App2Container·Strangler Fig | Rehost 먼저, CDC 무중단, 빅뱅 금지 |
| 4. 지속 개선 | 25% | CloudWatch·SSM·CodeDeploy·FIS·Compute Optimizer | SRE, Toil 자동화, 점진 배포, FinOps |

## 정리하며

SAP-C02는 **'최적해' 판단 시험**이다. 80일의 모든 깊이는 결국 한 반사로 수렴한다 — **지문 끝 질문 먼저 → 제약 키워드 추출 → 키워드를 정답 신호로 디코딩 → 같은 정답처럼 보이면 더 운영 부담 낮은 쪽**. 채점은 척도 점수(750/1000)이고 빈칸은 손해이니 모르는 것도 반드시 찍는다. 합격은 지식의 양이 아니라 **제약을 읽고 trade-off를 판단하는 속도**가 결정한다.

이제 80일을 마무리하는 실전 길이 시나리오 12문항을 푼다. 각 해설은 왜 다른 선택지가 틀렸는지까지 분해했다.

---

## 📝 최종 시나리오 모의고사 12문항

**문제 1.** 한 다국적 기업이 200개 이상의 AWS 계정을 운영한다. 보안팀은 모든 계정에서 EU 외 리전 사용을 차단하고(root 포함), 신규 계정은 자동으로 표준 로깅·가드레일을 상속하며, 전 계정의 보안 Finding을 한 곳에서 보려 한다. 다음 중 이 요구를 모두 충족하는 조합은?

A) 각 계정에 IAM Policy로 리전 제한 + 수동 계정 생성 + GuardDuty 계정별 개별 운영

B) Control Tower(Account Factory·Guardrail) + SCP DenyRegions + Security Hub 위임 관리자

C) SCP DenyRegions + StackSets로 로깅 배포 + 각 계정 콘솔에서 Finding 확인

D) Organizations만으로 OU 분리 + NACL 리전 차단 + CloudTrail 계정별

**정답: B**

해설: 세 요구를 각각 매핑하면 — (1) "EU 외 리전 차단·root 포함"은 SCP DenyRegions(`aws:RequestedRegion`)가 유일하게 root까지 막는다, (2) "신규 계정 자동 표준·가드레일"은 Control Tower의 Account Factory + Guardrail, (3) "전 계정 Finding 한 곳"은 Security Hub 위임 관리자 + 자동 가입이다. B가 셋을 모두 충족한다. A는 IAM Policy가 root를 못 막고, 수동 생성·개별 운영으로 자동화·통합이 없다. C는 SCP는 맞지만 StackSets가 가드레일 자동 상속을 주지 않고, 콘솔 개별 확인은 "한 곳" 요구에 미달한다. D는 NACL이 리전 생성을 못 막고 계정별 CloudTrail이 통합되지 않는다. 함정: 복합 요구는 각 절을 분해해 모두 만족하는 조합을 골라야 한다.

---

**문제 2.** 글로벌 SaaS가 전 세계 사용자의 세션 데이터를 여러 리전에서 읽고 쓴다. 각 리전은 로컬 지연(단자리 ms)으로 읽고 써야 하며, 다른 리전의 변경이 결국 반영되면 충분하다(강한 일관성 불필요). 운영 부담은 최소여야 한다. 가장 적합한 설계는?

A) 단일 리전 Aurora + 글로벌 Read Replica

B) DynamoDB Global Tables(On-Demand)

C) Aurora Global Database

D) 리전별 RDS + DMS 양방향 복제

**정답: B**

해설: "각 리전 로컬 쓰기(active-active) + 단자리 ms + eventual consistency 허용 + 운영 부담 최소"는 DynamoDB Global Tables(서버리스 NoSQL)의 정확한 정의역이다. PACELC로 PA/EL — 정상 시 지연을 위해 일관성을 완화하고, 각 리전이 로컬 복제본에 직접 쓴다(last-writer-wins). A·C(Aurora Global)는 **단일 리전에만 쓰기**가 가능해 "각 리전 로컬 쓰기" 요구를 못 채운다(쓰기는 primary로 가야 해 지연). D(DMS 양방향)는 충돌 해소·운영 부담이 크고 권장되지 않는다. 함정: "각 리전 로컬 쓰기 + eventual"은 Aurora Global이 아니라 DynamoDB Global Tables.

---

**문제 3.** 온프레 Oracle 100TB를 6개월 데드라인으로 옮겨야 한다. 핵심 분석 DB만 라이선스 제거를 위해 Aurora PostgreSQL로 전환하고, 나머지는 빠르게 옮긴 뒤 클라우드에서 점진 최적화하려 한다. 가장 적합한 전략은?

A) 모든 DB를 처음부터 Aurora로 Refactor

B) 나머지는 RDS Oracle로 Rehost, 핵심 분석 DB만 DMS+SCT로 Refactor

C) 전부 Snowball로 운송 후 EC2에 수동 복원

D) 전부 Retain(이전 보류)

**정답: B**

해설: 시간 제약이 있으면 Pro 정석은 "**빠르게 Rehost 후 클라우드에서 점진 Refactor**"다. 100TB 전체를 처음부터 Aurora로 Refactor하면 스키마 변환·앱 수정·테스트에 수개월이 걸려 데드라인을 못 맞춘다. 따라서 대부분은 RDS Oracle로 Rehost해 빠르게 옮기고, 비즈니스 가치 높은 핵심 분석 DB만 DMS+SCT로 Refactor한다. A는 데드라인 리스크가 크다. C는 수동 복원이라 고위험·비효율이다. D는 이전을 안 하는 것이다. 함정: "데드라인 + 점진 최적화"는 Rehost 먼저, 선택적 Refactor.

---

**문제 4.** 주문 시스템이 한 주문당 결제·재고·배송·알림 4개 마이크로서비스를 트리거한다. 한 서비스가 장애여도 나머지는 정상이어야 하고, 장애 서비스는 복구 후 누락 없이 밀린 메시지를 처리해야 한다. 가장 적합한 패턴은?

A) 주문 서비스가 4개를 동기 HTTP 호출

B) SNS 주문 토픽 → 4개 SQS 큐 fan-out(각 큐에 DLQ), 서비스별 자기 큐 소비

C) 단일 SQS 큐를 4개 서비스가 공유 소비

D) EventBridge 룰로 4개 Lambda 직접 호출

**정답: B**

해설: "한 서비스 장애가 타 서비스 무영향 + 복구 후 누락 없는 처리"는 SNS fan-out + 서비스별 전용 SQS 큐가 정석이다. SNS가 4개 큐에 동시 복제하고 각 큐가 독립 버퍼가 되어, 한 서비스가 죽어도 그 큐에만 쌓였다 복구 후 소비된다. DLQ가 반복 실패를 격리한다. A(동기 호출)는 한 서비스 장애가 전체를 막는 시간 결합이다. C(단일 큐 공유)는 한 메시지를 한 컨슈머만 가져가 fan-out이 안 된다. D(직접 Lambda)는 버퍼가 없어 다운스트림 장애 시 누락 위험이 크다. 함정: "fan-out + 서비스별 격리 버퍼"는 SNS→다중 SQS.

---

**문제 5.** 금융 규제기관이 거래 감사 로그를 7년간 누구도(관리자·root 포함) 변경·삭제할 수 없게 보관하라고 요구한다. 로그는 모든 멤버 계정에서 생성된다. 가장 적합한 설계는?

A) 각 계정 S3 Versioning + 버킷 정책

B) CloudTrail Org Trail → Log Archive 계정 S3 + Object Lock **Compliance** 7년

C) CloudTrail Org Trail → S3 + Object Lock **Governance** 7년

D) 각 계정 CloudTrail → Glacier Deep Archive 7년

**정답: B**

해설: 세 요구 — (1) "모든 멤버 계정 로그"는 CloudTrail **Org Trail**, (2) "운영자가 못 지움"은 별도 **Log Archive 계정**(직무 분리), (3) "root도 변경 불가"는 Object Lock **Compliance** 모드(보존 기간 내 root조차 삭제·변경 불가, SEC 17a-4·SOX WORM 충족)다. C의 **Governance** 모드는 `s3:BypassGovernanceRetention` 권한자가 우회 가능해 "누구도 불가"에 미달한다 — 이 둘의 구분이 핵심 함정이다. A(Versioning)는 삭제 자체를 못 막는다. D는 계정별 분산이고 Glacier 자체가 변경 불가를 보장하지 않는다(Vault Lock 별도). 함정: "규제·절대 변경 불가"는 Governance가 아니라 Compliance.

---

**문제 6.** 200개 VPC를 3개 리전에 두고 온프레 DC 2곳과 연결하되, EU VPC와 미주 VPC 간 직접 통신은 차단해야 한다. DX 회선 장애 시 1초 이내에 백업 VPN으로 자동 전환되어야 한다. 가장 적합한 조합은?

A) VPC Peering 메시 + 단일 DX

B) 리전별 TGW + 다중 라우트 테이블 + DX Gateway + DX 2회선·VPN + BGP/BFD

C) 단일 TGW 라우트 테이블 + VPN만 2개

D) PrivateLink 메시 + 단일 DX

**정답: B**

해설: 두 요구 — (1) "대규모 VPC 연결 + 일부 격리"는 리전별 TGW + **다중 라우트 테이블**(어태치먼트별 경로 분리로 EU↔미주 차단), (2) "1초 내 VPN 자동 전환"은 DX 2회선 + VPN 백업 + **BGP + BFD(RFC 5880)**다. A는 200 VPC 메시가 19,900 연결로 불가능하고 단일 DX는 SPOF다. C(단일 라우트 테이블)는 격리가 안 되고 VPN만으론 DX의 저지연을 잃는다. D(PrivateLink 메시)는 전체 VPC 라우팅 통합에 부적합하다. 함정: 복합 요구는 격리(다중 라우트 테이블) + 페일오버(BGP/BFD)를 모두 만족해야 한다.

---

**문제 7.** 500대 EC2에 매월 보안 패치를 적용해야 한다. 보안 정책상 SSH·Bastion이 금지되고, 패치는 정해진 시간대에 그룹별로 점진 적용되며, 모든 접속은 감사 기록이 남아야 한다. 가장 적합한 구성은?

A) Run Command로 수동 패치 + EC2 키 페어 SSH

B) SSM Patch Manager + Maintenance Window + Session Manager

C) 각 EC2에 yum-cron + CloudWatch 로그

D) CloudFormation으로 패치된 AMI 인스턴스 교체

**정답: B**

해설: 세 요구 — (1) "패치 자동화·그룹 점진"은 Patch Manager(패치 그룹·베이스라인), (2) "시간대 통제"는 Maintenance Window, (3) "SSH 금지 + 감사"는 Session Manager(SSH 키·Bastion 없이 접속, 모든 세션 CloudTrail·S3 기록)다. A는 SSH 금지 정책에 위반된다. C는 중앙 통제·시간 통제·감사가 약하다. D는 패치가 아니라 과한 인스턴스 교체다. 함정: "SSH 금지 + 패치 + 시간 통제 + 감사"는 SSM 3종 세트.

---

**문제 8.** 미션 크리티컬 SQL 워크로드가 주 리전 장애 시 다른 리전에서 RPO 1초 미만, RTO 1분 내로 복구되어야 한다. 평소엔 보조 리전이 읽기 부하를 분담한다. 가장 적합한 설계는?

A) RDS Multi-AZ

B) Aurora Global Database

C) DynamoDB Global Tables

D) Cross-Region Read Replica 수동 승격

**정답: B**

해설: "글로벌 SQL + RPO<1s + RTO 분 단위 + 보조 리전 읽기 분담"은 Aurora Global Database다 — 스토리지 비동기 복제로 RPO 1초 미만, 보조 리전 읽기 레플리카가 부하를 분담하다 재해 시 1분 내 승격한다. A(Multi-AZ)는 리전 장애에 무력하다. C는 NoSQL이라 "SQL"에 안 맞는다. D(수동 승격)는 복제 지연·수동 승격으로 RTO를 못 맞춘다. 함정: "글로벌 SQL + RPO 초 + 빠른 승격"은 Aurora Global Database.

---

**문제 9.** 분기마다 의도적 장애를 주입해 복원력을 검증하되, 실제 사용자 영향이 임계치를 넘으면 실험이 자동 중단되고, 이 실험은 자동 스케줄로 실행되어야 한다. 가장 적합한 구성은?

A) AWS Backup 복구 테스트 + 수동 실행

B) FIS(Fault Injection Service) + Stop Condition + EventBridge Scheduler

C) Resilience Hub 정적 평가만

D) Trusted Advisor 정기 점검

**정답: B**

해설: "의도적 장애 주입 + 자동 안전 중단 + 스케줄 자동 실행"은 FIS + Stop Condition + EventBridge Scheduler다. FIS가 카오스 실험을 주입하고(Netflix Chaos Monkey의 관리형 구현), Stop Condition이 CloudWatch 알람 임계 초과 시 자동 중단하며, EventBridge Scheduler가 분기 자동 실행을 트리거한다. A(Backup)는 장애 주입이 아니다. C(Resilience Hub)는 RTO/RPO를 정적 평가만 하고 장애를 주입하지 않는다. D는 베스트프랙티스 점검이다. 함정: "장애 주입 + 자동 중단 + 자동 스케줄"은 FIS + Stop Condition + Scheduler.

---

**문제 10.** 한 기업이 20년 된 Java EE 모놀리스(단일 Oracle DB 공유)를 마이크로서비스로 전환하려 한다. 한 번에 재작성하면 비즈니스 중단 위험이 크다. 가장 안전한 점진 전략은?

A) 빅뱅으로 전체를 Lambda로 재작성

B) Strangler Fig 패턴 + API Gateway 라우팅 + 새 기능부터 마이크로서비스 + DMS로 DB 점진 분리

C) App2Container로 모놀리스를 한 컨테이너에 그대로 담기

D) 모놀리스를 EC2로 Rehost하고 종료

**정답: B**

해설: 모놀리스 분해의 안전한 정석은 Strangler Fig 패턴이다. API Gateway가 요청을 옛 모놀리스/새 서비스로 분기하고, 새 기능부터 떼어내며, 공유 DB는 DMS로 도메인별 데이터를 새 DB로 점진 이관(database-per-service)한다 — 각 단계가 롤백 가능해 위험이 분산된다. A(빅뱅)는 고위험 오답 신호다. C(A2C 통째 컨테이너화)는 단순 Replatform이라 "마이크로서비스 전환" 목표에 미달한다. D(Rehost)는 현대화가 아니다. 함정: "점진 분해 + 빅뱅 회피"는 Strangler Fig.

---

**문제 11.** 한 SaaS가 운영 부담을 최소화하면서 자사 문서를 근거로 답하는 RAG 챗봇을 구축하려 한다. 모델 호스팅·벡터 인프라를 직접 운영하지 않으려 한다. 가장 적합한 설계는?

A) SageMaker에 오픈소스 LLM 자체 호스팅 + 자체 벡터 DB

B) Amazon Bedrock + Knowledge Base(관리형 벡터·RAG)

C) EC2에 LLM + FAISS 인덱스 직접 구축

D) Amazon Kendra만 사용

**정답: B**

해설: "운영 부담 최소 + RAG + 모델·벡터 인프라 직접 운영 회피"는 Amazon Bedrock + Knowledge Base가 정석이다 — Bedrock이 파운데이션 모델을 서버리스로 제공하고, Knowledge Base가 문서 임베딩·벡터 저장·검색 증강(RAG)을 관리형으로 처리한다. A·C는 모델·벡터 인프라를 직접 운영해 "부담 최소"에 정면 위배된다. D(Kendra)는 엔터프라이즈 검색이지 생성형 RAG 챗봇의 완결 답이 아니다(Bedrock과 결합 가능하나 단독으로는 생성 부분이 빠짐). 함정: "운영 부담 최소 RAG 챗봇"은 Bedrock + Knowledge Base.

---

**문제 12.** 리전 전체 장애 시, 자동 헬스체크의 오탐을 피하고 운영팀이 상황을 판단해 신뢰성 높게 트래픽을 다른 리전으로 전환하려 한다. 동시에 비용은 절충하되 RTO는 분 단위여야 한다. 가장 적합한 조합은?

A) Route 53 Health Check 자동 Failover + Multi-Site Active-Active

B) Route 53 ARC Routing Control + Warm Standby

C) Global Accelerator 자동 + Backup&Restore

D) Lambda 라우팅 스크립트 + Pilot Light

**정답: B**

해설: 두 요구 — (1) "사람 판단 + 오탐 회피 + 신뢰성 높은 수동 전환"은 Route 53 ARC Routing Control(분산 데이터 플레인으로 자체 가용성 높은 수동 on/off 스위치), (2) "비용 절충 + RTO 분 단위"는 Warm Standby(축소판 상시 가동, 페일오버 시 스케일업)다. A(자동 Health Check)는 오탐 위험이 있고 Active-Active는 비용 절충에 반한다. C(Backup&Restore)는 RTO가 시간 단위라 분 단위를 못 맞춘다. D(Lambda 스크립트)는 신뢰성·감사가 약하고 Pilot Light는 RTO가 더 길다. 함정: "사람 판단 Failover + 비용 절충 + RTO 분 단위"는 ARC Routing Control + Warm Standby.

---

## 📌 80일 한 줄 정리

> **"SAP-C02는 '최적해 판단' 시험. 지문 끝 질문 먼저 → 제약 키워드(운영 부담·비용·RTO/RPO·격리·규제·다운타임) 추출 → 키워드를 정답 신호로 디코딩 → 같은 정답처럼 보이면 더 운영 부담 낮은 쪽. 빈칸은 손해이니 모르는 것도 반드시 찍는다."**

---

## 🏆 80일 학습 완료

- Week 1-4: SAA 복습 · 멀티 계정 · 네트워크 · 하이브리드
- Week 5-9: 글로벌 · 마이그레이션 · 컨테이너 · 서버리스 · 데이터
- Week 10-12: ML/AI · 보안 · 비용
- Week 13-14: Well-Architected · DR
- Week 15-16: 케이스 스터디 · 도메인 종합 · 모의고사

**합격을 기원합니다. 시험 후엔 Specialty(Security·Networking·DB·ML) 또는 실무 깊이 우선으로 다음 목표를 정하세요.**

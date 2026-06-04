# Day 5 - Week 9 종합: 운영 자동화를 하나의 그림으로

이번 주 다섯 글에 걸쳐 본 것들은 따로 보면 제각각의 도구다. SSM Run Command, Session Manager, Patch Manager, State Manager, Inventory, AppConfig, Parameter Store, Secrets Manager. 하지만 이들은 사실 하나의 질문에 대한 서로 다른 각도의 답이다 — **"수천 대 규모의 fleet과 그 위에서 도는 애플리케이션을, 사람이 손으로 만지지 않고 안전하게 운영하려면 어떻게 하는가."** 오늘은 개별 기능을 다시 나열하는 대신, 이 도구들이 실제 운영 상황에서 어떻게 한 그림으로 맞물리는지를 시나리오로 묶어 본다. DOP 시험은 단일 기능 암기가 아니라 "이 상황에 어떤 조합이 맞는가"를 묻기 때문에, 시나리오로 사고하는 훈련이 곧 시험 대비다.

## 한 장으로 보는 Week 9 — 운영 자동화의 4개 축

Week 9의 도구들을 네 개의 축으로 정리하면 전체 그림이 잡힌다.

```
운영 자동화 4축
==================================================
[명령·접속]   Run Command(일회성 명령) / Session Manager(셸·터널)
[상태 강제]   State Manager(원하는 상태 정기 적용) / Inventory(수집)
[앱 구성]     AppConfig(기능 플래그·동적 구성 + 검증 + 자동 롤백)
[비밀 관리]   Parameter Store(설정·무료) / Secrets Manager(회전)
       └─ 공통 토대: SSM Agent(pull 모델) · IAM · KMS · CloudTrail(감사)
```

이 네 축을 관통하는 공통 원리가 둘 있다. 하나는 **선언적(declarative) 운영** — "이렇게 하라(명령)"가 아니라 "이런 상태여야 한다(목표)"를 선언하면 시스템이 알아서 수렴시킨다(State Manager, AppConfig, Patch Baseline). 다른 하나는 **폭발 반경 통제(blast radius control)** — 모든 변경을 한 번에 전체에 적용하지 않고 점진적으로 퍼뜨리며 실패하면 멈춘다(max-concurrency/max-errors, AppConfig 배포 전략, Patch Maintenance Window).

> 💡 **관련 이론**: 이 두 원리는 신뢰성 공학의 핵심 교의다. 선언적 운영은 제어 이론의 **폐루프 제어(closed-loop control)** — 목표 상태와 현재 상태의 차이를 계속 측정해 그 오차를 줄이는 피드백 루프다. Kubernetes의 reconciliation loop, Terraform의 desired state, Git의 declarative config가 모두 같은 뿌리다. 폭발 반경 통제는 **점진적 출시(progressive delivery)**와 회로 차단기(circuit breaker) 패턴이다. "변경은 위험하고, 위험은 작게 나눠 빨리 감지해야 한다"는 경험칙. Week 9 전체가 이 두 원리의 AWS 구현체다.

> 📚 **사례**: 2017년 AWS S3의 us-east-1 대규모 장애는 운영 명령을 폭발 반경 통제 없이 전체에 던졌을 때 무슨 일이 벌어지는지를 보여준 교과서적 사례다. 한 엔지니어가 청구 시스템의 일부 서버를 제거하는 디버깅 명령을 실행했는데, 입력 오타로 의도보다 훨씬 많은 서버가 한 번에 제거되어 S3의 핵심 서브시스템이 연쇄적으로 재시작에 들어갔고, 그 재시작이 수 시간 걸리며 us-east-1 전역의 수많은 서비스가 멈췄다. 교훈은 명확하다 — fleet 규모 명령에는 반드시 한 번에 일부만 적용하고(max-concurrency) 실패하면 멈추는(max-errors) 통제가 있어야 한다. AWS는 사후 이 도구의 제거 속도에 안전 한계를 추가했다. Week 9에서 본 Run Command의 점진 배포·Patch Manager의 Maintenance Window가 바로 이런 사고를 막기 위한 장치다.

## 시나리오로 보는 도구 선택의 갈림길

시험에서 가장 자주 헷갈리는 건 "비슷해 보이는 두 도구 중 무엇인가"다. 핵심 갈림길 몇 개를 미리 정리해두면 시나리오가 쉬워진다.

**Run Command vs State Manager.** 둘 다 인스턴스에 명령을 실행한다. 차이는 시간성이다. Run Command는 **일회성** — 지금 한 번 친다. State Manager는 **정기·지속** — "항상 이 상태여야 한다"를 주기적으로 강제하고 컴플라이언스를 리포팅한다. "지금 긴급 패치 한 번"이면 Run Command, "모든 인스턴스에 CloudWatch Agent가 항상 깔려 있어야 함"이면 State Manager.

**AppConfig vs Parameter Store.** 둘 다 설정을 담는다. 차이는 안전 장치다. Parameter Store는 값을 저장만 한다. AppConfig는 **배포 전략(점진 롤아웃) + Validator(배포 전 검증) + Monitor(알람 감지 시 자동 롤백)**를 갖춘 "구성 배포 파이프라인"이다. "잘못된 구성이 배포되면 자동으로 되돌려야 한다"면 AppConfig, "그냥 값을 읽기만"이면 Parameter Store.

**Secrets Manager vs Parameter Store(SecureString).** 둘 다 비밀을 암호화 저장한다. 차이는 회전이다. 회전이 필요하면 Secrets Manager, 정적이면 Parameter Store. 그리고 비용이 10배 차이다.

**Session Manager vs Bastion.** 둘 다 프라이빗 인스턴스 접속 수단이다. Bastion은 22번 포트를 인터넷에 노출하고 항상 켜둬야 하는 공격 표적이다. Session Manager는 포트 없이 IAM 신원으로 접속하고 세션 전체를 감사한다. 새 설계에서 Bastion을 고르는 건 거의 항상 오답이다.

**StackSets vs 개별 스택.** 멀티 계정·멀티 리전에 같은 인프라를 배포할 때, 계정마다 스택을 따로 만드는 건 운영 부담이 폭증한다. StackSets는 하나의 템플릿을 여러 계정·리전에 한 번에 배포하고, Organizations와 통합(Service-managed)하면 OU 단위로 다루며 새 계정 자동 배포(Auto-deployment)까지 된다. "조직 차원", "모든 멤버 계정", "새 계정 추가 시 자동"이 단서면 StackSets다.

이 갈림길들을 한 표로 압축하면 시험장에서 즉시 꺼내 쓸 수 있다.

| 헷갈리는 쌍 | 가르는 기준 | 단서 키워드 |
|---|---|---|
| Run Command vs State Manager | 일회성 vs 정기 강제 | "항상", "정기적으로", "새 인스턴스에도" → State Manager |
| AppConfig vs Parameter Store | 점진 배포·자동 롤백 유무 | "코드 재배포 없이", "자동 롤백", "기능 플래그" → AppConfig |
| Secrets Manager vs Parameter Store | 회전 필요 여부 | "30일마다 회전", "zero-downtime" → Secrets Manager |
| Session Manager vs Bastion | 포트 노출·감사 | "SSH 키 제거", "세션 감사", "Bastion 없이" → Session Manager |
| StackSets vs 개별 스택 | 멀티 계정·자동 배포 | "조직 전체", "새 계정 자동" → StackSets |

> 🔍 **더 깊이**: 이 갈림길들의 바닥에는 "운영 부담(operational overhead)"이라는 시험의 숨은 평가 기준이 깔려 있다. DOP 시험은 "동작하는 답"이 아니라 "운영 부담이 가장 적으면서 안전한 답"을 묻는다. 그래서 같은 결과를 내더라도 Lambda를 직접 짜는 답(높은 부담)보다 매니지드 기능(State Manager, --manage-master-user-password, AppConfig 자동 롤백)을 쓰는 답이 거의 항상 정답이다. 보기에서 "Lambda를 작성하여", "스크립트를 cron으로", "EC2를 두어"가 나오면 더 매니지드한 대안이 있는지 먼저 의심하라. 이게 DOP 시나리오를 푸는 메타 전략이다.

> 🎯 **시나리오**: "조직 전체 멤버 계정 50개에 동일한 SSM Patch Baseline과 IAM 역할을 자동 배포하고, 새 계정이 OU에 추가되면 자동으로 적용되어야 한다." — 답은 CloudFormation StackSets의 Service-managed 권한 + Auto-deployment다. StackSets가 OU 단위로 스택을 배포하고, AutoDeployment를 켜면 OU에 새 계정이 들어올 때 자동으로 스택이 배포된다. Lambda로 계정 추가를 감지해 배포하는 답(높은 운영 부담)이나 수동 배포는 오답이다. "조직 차원·계정 추가 시 자동"이라는 단서가 나오면 StackSets Auto-deployment를 떠올린다.

> 🎯 **시나리오**: "온프레미스 데이터센터와 AWS를 하이브리드로 운영한다. 두 환경의 비밀번호·접속·패치를 가능한 한 동일한 도구 체계로 관리하고 싶다." — 답은 SSM의 하이브리드 확장을 전면 활용하는 것이다. Hybrid Activation으로 온프레미스 서버를 mi- 관리 인스턴스로 등록하면 Run Command·Session Manager·Patch Manager·Inventory가 EC2와 똑같이 동작하고, 시크릿은 Secrets Manager를 단일 진실 공급원으로 두되 온프레미스 앱은 VPN/Direct Connect 경유로 같은 시크릿을 읽는다. 핵심은 "도구를 두 벌 운영하지 않는다"는 것 — 하이브리드 시나리오에서 별도 온프레미스 전용 도구를 답으로 고르면 거의 오답이다.

## 정리하며 — 시나리오 사고법

Week 9를 관통하는 사고법은 이렇다. 문제를 읽으면 먼저 **4축 중 어디인가**(명령·접속 / 상태 강제 / 앱 구성 / 비밀)를 잡고, 그다음 **시간성(일회성 vs 지속)**, **안전 장치(롤백·검증 필요 여부)**, **운영 부담(매니지드 우선)**, **감사 요구(CloudTrail·세션 로그)**를 순서대로 따진다. 이 네 질문이면 Week 9의 거의 모든 시나리오가 풀린다. 아래 10개 문제로 그 사고를 굳혀보자.

---

## 📝 연습 문제

**문제 1.** 수백 대 EC2에 OS 보안 패치를 토요일 새벽 시간대에만 자동 적용하고, prod는 패치 출시 후 일정 기간 검증을 거친 뒤 적용하려 한다. 가장 적절한 구성은?

A) Run Command를 매주 토요일 운영자가 수동 실행 — 시간대는 맞출 수 있으나 사람 의존이라 누락·휴먼에러가 생기고 검증 기간(approve-after-days)이나 컴플라이언스 리포팅이 없음

B) Patch Baseline(approve-after-days) + Patch Group + Maintenance Window(cron) 조합

C) Lambda를 매일 호출해 yum update 실행 — 매니지드 패치 워크플로 없이 시간대 제어·검증 기간·폭발 반경 통제를 전부 직접 구현해야 함

D) 각 인스턴스 userdata에 패치 스크립트 삽입 — 최초 부팅 시 1회만 동작하고 토요일 새벽 윈도우 제어나 prod 검증 기간을 보장하지 못함

**정답: B**

해설: "무엇을(Baseline의 approve-after-days로 검증 기간 확보)·어디에(Patch Group 태그)·언제(Maintenance Window cron으로 토요일 새벽)"를 세 요소가 나눠 책임지는 게 Patch Manager의 표준이다. approve-after-days로 패치 출시 후 일정 기간 군중 검증을 거친 뒤 자동 승인되므로 prod의 검증 요구가 충족된다. 매니지드 기능을 쓰지 않는 A/C/D는 운영 부담이 크고 컴플라이언스 리포팅도 없다.

---

**문제 2.** 기능 플래그를 코드 재배포 없이 10% → 50% → 100%로 점진 노출하고, 5xx 오류율이 임계치를 넘으면 자동으로 이전 구성으로 롤백되어야 한다. 무엇을 쓰는가?

A) Parameter Store에 플래그를 저장하고 앱이 주기적으로 폴링 — 값 읽기는 되지만 10→50→100 점진 노출도, 5xx 임계치 감지 시 자동 롤백도 없어 핵심 요건을 못 채움

B) AppConfig(점진 배포 전략 + Environment의 CloudWatch Alarm Monitor로 자동 롤백)

C) S3에 플래그 JSON을 저장하고 Lambda로 분배 — 점진 배포 전략과 알람 연동 자동 롤백을 전부 자체 구현해야 해 운영 부담이 큼

D) 파이프라인으로 플래그 변경 때마다 재배포 — 코드 재배포 없이라는 요건에 정면으로 위배되고 점진 노출·자동 롤백도 제공하지 않음

**정답: B**

해설: Parameter Store는 값 저장만 하지 점진 배포나 자동 롤백이 없다. AppConfig는 배포 전략(Linear/Canary로 10→50→100 점진)과 Monitor(CloudWatch Alarm 감지 시 자동 롤백)를 갖춘 구성 배포 파이프라인이다. "코드 재배포 없이 + 점진 + 자동 롤백"이라는 세 단서가 모두 AppConfig를 가리킨다.

---

**문제 3.** RDS 마스터 비밀번호를 30일마다 회전하되, 회전 순간에도 신규·진행 연결이 실패하면 안 된다. 초당 신규 연결이 많다. 가장 적절한 것은?

A) Single User Rotation — 한 사용자의 비밀번호를 그 자리에서 교체하므로 setSecret과 finishSecret 사이에 AWSCURRENT와 실제 DB 값이 잠깐 불일치해 고빈도 신규 연결 일부가 실패

B) Multi User(Alternating Users) Rotation

C) Parameter Store SecureString에 저장 후 수동 회전 — 회전 자동화·zero-downtime 전환 메커니즘이 없어 고빈도 연결 환경의 무중단 요건을 충족하지 못함

D) 운영자가 매일 비밀번호를 수동 변경 — 사람 의존이라 30일 주기 자동화도, 연결 무중단 전환도 보장되지 않음

**정답: B**

해설: Single User는 setSecret과 finishSecret 사이에 DB 실제 비밀번호와 AWSCURRENT 값이 잠깐 불일치해 고빈도 신규 연결에서 일부 실패가 날 수 있다. Multi User는 현재 사용 중인 사용자를 회전 내내 건드리지 않고 미사용 사용자를 바꿔 전환하므로 진정한 zero-downtime이다.

---

**문제 4.** 단순 설정값 100개와 회전이 필요한 비밀번호 5개의 비용을 최소화하려 한다.

A) 모두 Secrets Manager (월 약 $42)

B) 설정 100개 Parameter Store Standard(무료) + 비밀번호 5개 Secrets Manager($2/월)

C) 모두 Parameter Store Advanced

D) 모두 환경 변수에 평문

**정답: B**

해설: 판단 축은 "회전이 필요하냐"다. 회전 불요 설정값은 Parameter Store Standard에 무료로, 회전 필요 비밀번호만 Secrets Manager($0.40/개)에 둔다. 혼합 시 월 $2, 전부 Secrets Manager면 약 $42다. 환경 변수 평문(D)은 보안 위반이다.

---

**문제 5.** A 계정의 시크릿을 B 계정 앱이 가져오려 한다. Resource Policy와 B의 IAM 권한을 모두 설정했는데 KMS 단계에서 AccessDenied가 난다. 원인은?

A) 두 계정 간 VPC Peering 부재 — Secrets Manager는 리전 엔드포인트 API 호출이라 VPC 피어링과 무관하고, 실패가 KMS 단계에서 AccessDenied로 특정된 점과도 맞지 않음

B) 시크릿이 AWS 관리형 키(alias/aws/secretsmanager)로 암호화되어 Key Policy 수정 불가 → CMK 필요

C) 두 계정의 리전이 동일 — 같은 리전이라는 사실은 교차 계정 복호화 거부의 원인이 될 수 없고 오히려 정상 조건임

D) 시크릿 이름이 너무 길어서 발생 — 이름 길이는 ARN 참조에 영향을 주지 않으며 KMS Decrypt 권한 부재와 인과관계가 없음

**정답: B**

해설: 봉투 암호화 때문에 시크릿 복호화는 그것을 암호화한 KMS 키에 대한 kms:Decrypt를 요구한다. AWS 관리형 키는 Key Policy를 사용자가 수정할 수 없어 다른 계정에 복호화 권한을 줄 수 없다. 따라서 시크릿 접근은 통과해도 복호화에서 막힌다. 고객 관리형 키(CMK)로 시크릿을 암호화해야 한다.

---

**문제 6.** 운영자의 SSH 키 관리 부담을 없애고, 프라이빗 인스턴스 접속을 IAM으로 통제하며, 모든 세션 입출력을 변조 불가능하게 감사하려 한다.

A) Bastion EC2 + SSH 키 정기 회전 — 22번 포트를 노출한 상시 공격 표적이 남고 SSH 키 관리 부담을 없애려는 요건과 정반대이며 셸 히스토리는 사용자가 지울 수 있어 감사 증거로 부적합

B) Session Manager + 세션 로깅(CloudWatch Logs + S3 + KMS) + IAM 접근 통제

C) VPN을 도입해 프라이빗 망 접속 — 네트워크 경로는 열어주지만 SSH 키 부담 제거도, IAM 기반 접근 통제도, 변조 불가 세션 감사도 제공하지 않음

D) IAM User에 EC2 키페어를 연결 — 여전히 SSH 키를 관리해야 하고 세션 입출력 전체를 변조 불가능하게 기록하는 감사 요건을 충족하지 못함

**정답: B**

해설: Session Manager는 SSH 키와 22번 포트, Bastion을 모두 제거한다. 접근은 IAM(누가 StartSession 가능)으로 통제하고, 세션 입출력 전체를 AWS 측에서 기록해 운영자가 변조할 수 없다. CloudTrail(언제 세션 시작) + 세션 로그(무엇을 실행)로 완전한 감사가 된다. SSH 셸 히스토리는 사용자가 지울 수 있어 감사 증거로 부적합하다.

---

**문제 7.** 새 EC2가 ASG로 수시로 생성·종료되는 환경에서, 모든 인스턴스에 CloudWatch Agent가 항상 설치되어 있어야 하고 표준 상태가 강제되어야 한다.

A) AMI에 CloudWatch Agent를 구워 넣기만 — 부팅 시 설치는 되지만 Agent 업데이트나 누군가 제거했을 때의 드리프트 교정이 안 되고 컴플라이언스 리포팅도 없음

B) State Manager Association(AWS-ConfigureAWSPackage) + 태그 타겟팅으로 정기 강제

C) ASG가 인스턴스를 띄울 때마다 Run Command를 수동 실행 — 일회성 명령이라 자동으로 새 인스턴스를 포함하지 못하고 지속적 상태 강제가 되지 않음

D) 각 인스턴스 userdata에 설치 스크립트 삽입 — 최초 부팅 1회만 동작하고 이후 드리프트 교정·Agent 갱신·컴플라이언스 추적을 제공하지 못함

**정답: B**

해설: State Manager는 "원하는 상태를 정기적으로 강제 + 컴플라이언스 리포팅 + 새 인스턴스 자동 적용"을 한다. 태그 기반 타겟이라 새로 뜬 인스턴스도 자동으로 association이 걸려 첫 부팅 후 표준 상태가 보장된다. AMI 굽기(A)만으로는 Agent 업데이트나 드리프트 교정이 안 되고, Run Command(C)는 일회성이라 새 인스턴스를 자동 포함하지 못한다.

---

**문제 8.** 수십만 대 인스턴스의 소프트웨어 인벤토리를 수집해 "특정 취약 버전 패키지가 깔린 인스턴스"를 SQL로 질의하고 싶다.

A) 각 인스턴스 패키지 목록을 DynamoDB에 수동 적재 — 수집·갱신 파이프라인을 직접 만들어야 하고 수십만 대 규모에서 SQL 질의도 자연스럽지 않아 운영 부담이 큼

B) SSM Inventory 수집 → Resource Data Sync로 S3 집계 → Athena로 SQL 질의

C) CloudWatch Logs Insights로 질의 — 로그 검색 도구라 인스턴스 소프트웨어 인벤토리 메타데이터를 fleet 전역으로 수집·집계하는 용도에 맞지 않음

D) 각 인스턴스에 SSH로 접속해 패키지 버전 조회 — 수십만 대를 사람이 순회하는 것은 비현실적이고 중앙 집계·SQL 질의가 불가능함

**정답: B**

해설: SSM Inventory가 각 인스턴스의 소프트웨어·구성 메타데이터를 수집하고, Resource Data Sync가 이를 S3에 중앙 집계한다. S3에 모인 데이터를 Athena로 표준 SQL 질의하면 "특정 버전이 깔린 인스턴스"를 한 번에 찾는다. fleet 전역 분석의 표준 데이터 파이프라인이다.

---

**문제 9.** 초당 수천 번 호출되는 Lambda가 매번 Secrets Manager GetSecretValue를 직접 호출해 ThrottlingException이 간헐 발생한다. 시크릿은 30일에 한 번만 바뀐다.

A) Secrets Manager API 한도 증설만 요청 — 거의 안 바뀌는 시크릿을 초당 수천 번 읽는 낭비 구조는 그대로라 비용도 throttle 위험도 근본적으로 줄지 않음

B) AWS Parameters and Secrets Lambda Extension으로 TTL 캐시(localhost:2773)

C) 시크릿을 Lambda 환경 변수에 평문 저장 — 호출은 줄지만 시크릿이 평문으로 노출되는 보안 위반이고 30일 회전 시 자동 반영도 되지 않음

D) 매 호출 전 sleep을 넣어 throttle 회피 — 호출량 자체를 줄이지 못하고 latency만 늘려 성능을 악화시키는 안티패턴

**정답: B**

해설: 거의 안 바뀌는 시크릿을 초당 수천 번 읽는 건 낭비다. Lambda Extension은 함수 인스턴스 안에 캐시 프록시를 띄워 첫 호출만 실제 API를 치고 TTL 동안 로컬 캐시로 응답한다. 실제 API 호출이 인스턴스당 TTL마다 한 번으로 줄어 throttle이 사라지고 비용도 급감한다.

---

**문제 10.** 데이터센터의 물리 서버 200대와 AWS EC2 fleet을 단일 패치 정책으로 통합 관리하고, 두 환경을 같은 콘솔에서 컴플라이언스 리포팅하려 한다.

A) 물리 서버용 별도 패치 도구를 따로 운영 — 두 벌의 도구 체계를 유지해야 하고 단일 콘솔 통합 컴플라이언스 리포팅이라는 요건을 정면으로 위배함

B) 물리 서버에 SSM Agent 설치 + Hybrid Activation 등록(mi- ID) 후 EC2와 동일 Patch Baseline·Group·Maintenance Window 적용

C) 물리 서버 200대를 전부 EC2로 마이그레이션 — 통합은 되지만 대규모 이전 비용·기간이 과도하고 하이브리드 운영을 유지하려는 전제 자체를 부정함

D) 물리 서버는 운영자가 수동 패치 — 사람 의존이라 누락·시점 지연이 생기고 EC2와 같은 컴플라이언스 리포팅에 포함되지 않음

**정답: B**

해설: Hybrid Activation으로 온프레미스 서버를 SSM 관리 대상(mi- 접두사)으로 등록하면 EC2와 똑같이 Patch Manager·Run Command·Inventory를 쓸 수 있고, 같은 태그 타겟팅과 컴플라이언스 리포팅에 포함된다. 단일 콘솔에서 하이브리드 fleet을 통합 관리하는 표준이다.

---

**문제 11.** 조직의 모든 멤버 계정에 동일한 SSM Patch Baseline과 IAM 역할을 배포하고, OU에 새 계정이 추가되면 자동으로 적용되어야 한다. 운영 부담을 최소화하려면?

A) 각 멤버 계정에 운영자가 수동으로 CloudFormation 스택 배포 — 신규 계정 추가 시마다 사람이 개입해야 해 운영 부담이 크고 OU 자동 적용 요건을 충족하지 못함

B) CloudFormation StackSets(Service-managed 권한 + Auto-deployment)로 OU 단위 배포

C) Lambda가 계정 추가 이벤트를 감지해 스택 배포 — 동작은 하지만 멱등성·교차 계정 권한·실패 재시도를 자체 구현해야 해 매니지드 대비 운영 부담이 큼

D) 계정마다 Terraform을 수동 apply — 신규 계정마다 사람이 apply를 돌려야 하므로 OU 추가 시 자동 배포가 되지 않음

**정답: B**

해설: StackSets의 Service-managed 권한은 AWS Organizations와 통합되어 OU 단위로 스택을 배포한다. Auto-deployment를 켜면 OU에 새 계정이 들어올 때 자동으로 스택이 배포되고, 계정이 빠지면 정리된다. Lambda로 직접 감지·배포하는 답(C)은 동작은 하지만 운영 부담이 크다 — DOP는 매니지드 기능을 우선한다.

---

**문제 12.** 긴급 제로데이 취약점이 발표되어, 평소 approve-after-days(7일) 정책을 기다리지 않고 특정 패치를 prod에 즉시 적용해야 한다. Patch Baseline에서 무엇을 쓰는가?

A) approve-after-days를 0으로 일괄 변경 — 긴급 패치 하나만이 아니라 모든 패치가 즉시 승인되어 검증 안 된 다른 패치까지 prod에 깔리는 위험을 부름

B) 해당 패치를 Patch Baseline의 명시적 승인 목록(approved patches)에 직접 추가

C) Patch Group 태그를 삭제해 베이스라인 우회 — 타겟팅이 끊겨 어떤 패치도 적용되지 않으므로 긴급 적용과 정반대 결과를 냄

D) Maintenance Window를 더 자주 실행 — 적용 빈도만 높일 뿐 해당 패치가 approve-after-days 대기 중이면 여전히 승인되지 않아 즉시 적용이 안 됨

**정답: B**

해설: Patch Baseline에는 승인 규칙(approval rules, 평시 자동화)과 명시적 승인/거부 목록(예외 처리)이 있다. 긴급 패치는 approved patches에 직접 추가하면 approve-after-days 대기 없이 즉시 승인되어 적용된다. approve-after-days를 0으로 바꾸면(A) 해당 패치만이 아니라 모든 패치가 즉시 승인되어 검증되지 않은 다른 패치까지 깔리는 위험이 있다. 승인 규칙은 평시, 명시적 목록은 예외라는 역할 분담을 활용한다.

---

## 📌 Week 9 마무리

이번 주의 핵심은 운영 자동화의 4축 — 명령·접속(Run Command/Session Manager), 상태 강제(State Manager/Inventory), 앱 구성(AppConfig), 비밀 관리(Parameter Store/Secrets Manager) — 가 SSM Agent의 pull 모델과 IAM·KMS·CloudTrail이라는 공통 토대 위에서 맞물린다는 것이다. 이들을 관통하는 두 원리는 선언적 운영(목표 상태로의 수렴)과 폭발 반경 통제(점진 롤아웃 + 실패 시 중단)다. 시나리오를 풀 땐 4축 식별 → 시간성 → 안전 장치 → 운영 부담 → 감사 요구 순으로 따지면 거의 모든 문제가 풀린다. 그리고 DOP의 숨은 기준은 항상 "운영 부담이 가장 적은 매니지드 답"임을 기억하라.

다음 주(Week 10)부터는 모니터링 심화로 들어가 CloudWatch를 깊이 파고든다.

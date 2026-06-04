# Day 45 - Week 9 종합: 관찰성과 거버넌스를 "누가·언제·무엇·왜"로 꿰기

한 주 동안 본 서비스들 — CloudWatch, CloudTrail, Config, Systems Manager, X-Ray, Trusted Advisor, Health Dashboard — 은 얼핏 잡다한 운영 도구 모음처럼 보인다. 하지만 이들을 한 줄로 꿰는 질문이 있다. 시스템에 무슨 일이 생겼을 때 엔지니어가 던지는 질문은 결국 네 가지다. "**누가** 이걸 했나(감사)", "**지금 무슨 상태인가**(구성·메트릭)", "**왜** 느리거나 망가졌나(트레이싱·로그)", "이게 **내 문제인가 AWS 문제인가**(헬스)". Week 9의 모든 서비스는 이 네 질문 중 하나에 답하기 위해 존재하고, SAA 시험은 시나리오가 던지는 질문이 넷 중 어디에 속하는지 가리는 능력을 끈질기게 묻는다.

이 글은 한 주의 서비스를 이 네 질문 축으로 재정렬하고, 서로 헷갈리는 경계(CloudTrail vs Config, Metrics vs Logs vs Trace, Health vs Trusted Advisor)를 사고 사례와 함께 굳힌 뒤, 실제 시험에 나오는 형태의 시나리오 문제 12개로 매핑을 확정한다. 개별 서비스의 깊이는 Day 1~4에서 봤으니, 여기서는 "어떤 신호가 어떤 도구를 가리키는가"라는 의사결정의 결을 만든다.

## 네 질문으로 재정렬한 Week 9

운영 도구를 외우는 가장 나쁜 방법은 "서비스 목록"으로 외우는 것이다. 가장 좋은 방법은 "질문 → 도구" 매핑이다. 시험 문제는 항상 질문의 형태로 오기 때문이다.

| 질문 | 핵심 도구 | 보조/구분 |
|---|---|---|
| **누가 무엇을 언제 했나** (행위 감사) | CloudTrail | Config는 "상태", CloudTrail은 "행위" |
| **지금 리소스 구성이 규칙을 지키나** (상태·준수) | Config | 자동 교정은 SSM Automation |
| **시스템 건강은**(CPU·에러율·가용성) | CloudWatch Metrics/Alarm | 게스트 내부(메모리)는 Agent |
| **그 순간 정확히 무슨 일이**(상세 맥락) | CloudWatch Logs/Insights | 집계 불가, raw 보존 |
| **이 요청이 왜 느린가**(분산 인과) | X-Ray | 다운스트림까지 분해 |
| **네트워크 트래픽 흐름** | VPC Flow Logs | 패킷 메타데이터 |
| **AWS 측에서 무슨 사고가**(내 계정 영향) | Health Dashboard (Personal) | + EventBridge 자동대응 |
| **모범 사례를 지키나**(권고) | Trusted Advisor | 전체·API는 Business+ |
| **자원을 얼마로 잡아야**(right-sizing) | Compute Optimizer | 메모리엔 Agent |
| **운영 작업 실행**(패치·접속·명령) | Systems Manager | Session/Patch/Run/State |

> 💡 **관련 이론**: 이 네 질문은 관찰성(observability) 이론의 "세 기둥(메트릭·로그·트레이스)"에 거버넌스(감사·구성) 한 축을 더한 것이다. 메트릭은 "무언가 이상하다"는 증상을, 로그는 "그 순간의 맥락"을, 트레이스는 "여러 서비스에 걸친 인과"를 답한다. 세 기둥은 상호 보완적이라 어느 하나만으로는 부족하다 — 메트릭으로 이상을 감지하고, 트레이스로 어느 서비스인지 좁히고, 로그로 정확한 원인 줄을 찾는 식의 교차 분석이 본질이다. CloudTrail·Config는 여기에 "누가 시스템을 이렇게 만들었나"라는 거버넌스 차원을 더한다.

## CloudTrail vs Config — "행위"와 "상태"는 어떻게 갈리나

가장 자주 헷갈리는 경계다. 둘 다 "변경"과 관련 있어 보이지만 답하는 질문이 정반대다. **CloudTrail은 행위(누가 어떤 API를 호출했나)**를 시간순으로 기록하고, **Config는 상태(지금 이 리소스의 구성이 무엇이고 규칙을 지키나)**를 기록한다.

구체적으로 "보안 그룹이 0.0.0.0/0으로 열렸다"는 사건을 보자. **누가** 이걸 열었는지(어느 IAM 사용자가 언제 `AuthorizeSecurityGroupIngress`를 호출했나)는 CloudTrail이 답한다. **지금** 그 보안 그룹이 규칙을 위반한 상태인지(예: "어떤 SG도 0.0.0.0/0:22를 허용하면 안 된다")는 Config가 답한다. 즉 CloudTrail은 "사건의 행위자와 시각", Config는 "현재 상태와 준수 여부"다.

> 🔍 **더 깊이**: Config는 리소스의 **구성 항목(Configuration Item) 타임라인**을 만든다 — 시점 t1엔 포트 22가 닫혀 있었고, t2에 누군가 열어서 위반 상태가 됐다는 "상태의 역사"를 보존한다. 여기에 Config Rule을 걸면 위반을 감지하고, **SSM Automation Runbook**으로 자동 교정(다시 닫기)까지 연결된다. 반면 CloudTrail은 그 t1→t2 전이를 일으킨 API 호출의 주체·소스 IP·요청 파라미터를 남긴다. 둘을 함께 쓰면 "무엇이 잘못된 상태가 됐고(Config), 누가 그렇게 만들었나(CloudTrail)"를 모두 답한다 — 보안 사고 분석의 완결된 그림이다.

> ⚠️ **함정**: "현재 모든 S3 버킷이 Block Public Access(BPA)를 켰는지 점검하라"는 정답은 Config Rule이다(상태 점검). 반면 "누가 BPA를 껐는지 추적하라"는 정답은 CloudTrail이다(행위 추적). 문제의 동사가 "지금 ~인 상태인가/준수하나"면 Config, "누가/언제 ~했나"면 CloudTrail로 갈린다.

> 📚 **사례**: 2019년 **Capital One 데이터 유출**(약 1억 건의 신용 신청 정보)은 잘못 구성된 WAF/IAM 권한으로 공격자가 EC2 메타데이터를 통해 과도한 S3 접근 권한을 탈취한 사건이었다. 사후 분석에서 결정적 역할을 한 게 CloudTrail 로그였다 — 비정상적 `ListBuckets`·`GetObject` 호출 패턴이 기록돼 있어 침해 범위와 경로를 재구성할 수 있었다. 교훈은 두 가지다. 첫째, CloudTrail은 "사건이 나기 전부터 켜져 있어야" 사후 분석이 가능하다(사고 후엔 늦다). 둘째, Config로 "S3 공개 금지·과도한 IAM 권한 금지" 같은 규칙을 상시 점검했다면 잘못된 상태를 사전에 잡았을 것이다. 행위 감사(CloudTrail)와 상태 준수(Config)는 사고 예방과 분석의 양 날개다.

## Metrics vs Logs vs Trace — 같은 장애를 보는 세 각도

"서비스가 느리다"는 한 사건을 세 도구가 어떻게 다르게 보는지가 관찰성의 핵심이다. **CloudWatch Metrics**는 "p99 지연이 평소 200ms에서 3초로 튀었다"는 **증상의 시계열**을 보여준다 — 무언가 이상하다는 신호. **X-Ray Trace**는 그 느린 요청 하나를 따라가 "Lambda는 200ms인데 그 안의 외부 결제 API Subsegment가 2.8초"라는 **인과의 분해**를 준다 — 어느 서비스가 범인인지. **CloudWatch Logs**는 그 외부 API 호출 시점의 로그에서 "gateway timeout after 3 retries"라는 **정확한 맥락**을 준다 — 왜 그랬는지.

이 순서가 실무 디버깅의 표준 흐름이다: 메트릭으로 이상을 감지 → 트레이스로 서비스를 좁힘 → 로그로 원인 줄을 확정. 어느 하나만으로는 부족하다. 메트릭만 보면 "느리다"까지만, 로그만 보면 수억 줄에서 어디를 봐야 할지 모르고, 트레이스만 보면 "느린 구간"은 알아도 그 안의 정확한 에러 메시지는 모른다.

> 💡 **관련 이론**: 이 세 데이터의 저장 구조가 근본적으로 다르다는 게 Day 1의 핵심이었다. 메트릭은 사전 집계된 시계열(싸고 빠르지만 "그 1초"를 잃음), 로그는 raw 텍스트(비싸지만 정확한 맥락 보존), 트레이스는 Trace ID로 묶인 span 트리(서비스 간 인과)다. 그래서 같은 사건도 어느 도구로 보느냐에 따라 답할 수 있는 질문이 다르다. "고카디널리티 추적(사용자별)은 메트릭이 아니라 로그/트레이스의 일"이라는 원칙도 여기서 나온다 — 메트릭 차원에 사용자 ID를 넣으면 시계열이 폭발한다.

> ⚠️ **함정**: "EC2 메모리 사용률에 알람"은 표준 메트릭에 메모리가 없으므로 CloudWatch Agent 설치가 정답이다. CPU·네트워크·디스크 I/O는 하이퍼바이저(Nitro) 레벨에서 보이지만, 메모리·디스크 여유 공간은 게스트 OS 안쪽 정보라 하이퍼바이저가 못 본다. 이 함정은 Day 1·Day 4(Compute Optimizer)·Day 5에 반복 등장하는 SAA 단골이다.

## Health vs Trusted Advisor — "AWS의 사고"와 "내 환경의 권고"

또 하나의 헷갈리는 경계. **Health Dashboard**는 "AWS 쪽 인프라에서 일어난 일이 내 계정에 미치는 영향"을, **Trusted Advisor**는 "내가 만든 환경이 모범 사례를 지키는가"를 답한다. 전자는 AWS의 책임 영역, 후자는 내 책임 영역이다.

"내 인스턴스가 도는 하드웨어가 다음 주 화요일 점검 재부팅됩니다"는 Health(Personal)다 — AWS가 일으키는 이벤트. "당신의 EIP가 어디에도 연결 안 돼 낭비되고 있습니다, 보안 그룹이 0.0.0.0/0으로 열려 있습니다"는 Trusted Advisor다 — 내 구성에 대한 권고. 책임 주체가 누구냐로 갈린다.

> 🔍 **더 깊이**: 둘 다 EventBridge와 결합해 자동화의 소스가 된다는 점이 공통점이지만 용도가 다르다. Health(Personal) + EventBridge는 "AWS 점검에 앞서 트래픽을 다른 AZ로 사전 이동" 같은 선제 대응이고, Trusted Advisor + EventBridge는 "서비스 한도가 80% 도달 시 자동 증설 요청" 같은 권고 기반 대응이다. Organizations 환경에선 Health Organizational View로 모든 멤버 계정의 헬스를 관리 계정에서 보고, 보안 권고를 더 깊게 가려면 Security Hub, 비용은 Compute Optimizer/Cost Explorer로 확장한다.

> 📚 **사례**: 2021년 12월 7일 us-east-1 대규모 장애 당시 **Service Health Dashboard 자체가 같은 리전 인프라에 의존**해 상태 갱신이 지연됐다. 많은 고객이 "내 서비스가 이상한데 AWS 상태 페이지는 녹색"이라 혼란을 겪었다. 교훈은 두 가지다. 첫째, 전역 Service Health보다 내 계정에 개인화된 Personal Health가 더 실행 가능하다. 둘째, 모니터링 시스템은 감시 대상과 장애 도메인을 공유하면 안 된다(자신을 감시하는 눈이 함께 멀면 안 된다). 이후 AWS는 헬스 경로를 사고 영향에서 더 격리했다.

## Systems Manager — 운영 "작업"의 단일 관문

Week 9의 나머지 한 축은 "관측"이 아니라 "실행"이다. SSM은 100대 EC2에 SSH 키 없이 접속하고(Session Manager), 패치를 자동 적용하고(Patch Manager + Maintenance Window), 명령을 일괄 실행하고(Run Command), 원하는 상태를 강제하고(State Manager), 비밀·설정을 보관(Parameter Store)하는 운영 작업의 단일 관문이다.

특히 **Session Manager**가 시험 단골인데, "Bastion 호스트 없이, SSH 키 없이, 인바운드 포트를 열지 않고 셸 접속"이라는 요구의 정답이다. 작동 원리는 인스턴스의 SSM Agent가 SSM 서비스로 **아웃바운드** 연결을 맺고, 사용자는 그 서비스를 통해 셸에 닿는다 — 인바운드 22번 포트를 열 필요가 없어 공격 표면이 줄고, 모든 세션이 CloudTrail/CloudWatch Logs로 감사된다.

> 💡 **관련 이론**: Session Manager의 "아웃바운드 연결로 인바운드 포트를 없앤다"는 발상은 **제로 트러스트 네트워크**의 핵심 패턴이다. 전통적 Bastion은 "신뢰하는 점프 호스트"를 두고 그 안쪽을 믿는 경계 보안인데, 키 분실·포트 노출·세션 미감사라는 약점이 있다. Session Manager는 네트워크 경로 자체를 없애고 IAM으로 접근을 통제(인증·인가)하며 모든 세션을 기록(감사)해, 경계가 아니라 ID 기반으로 신뢰를 옮긴다. SSH 키라는 장기 자격증명을 IAM 임시 자격증명으로 대체하는 것도 같은 맥락이다.

## 한 주 통합 아키텍처

```
[ 관찰성 + 거버넌스 통합 그림 ]

  EC2/Lambda/Container
    ├─ 증상 감지 ─→ CloudWatch (Metrics/Alarm)  ── 메모리는 Agent
    ├─ 정확한 맥락 ─→ CloudWatch Logs/Insights
    └─ 분산 인과 ─→ X-Ray (Trace/ServiceMap) ─→ Application Signals(SLO)

  API 호출 (행위) ─→ CloudTrail ─→ S3(Object Lock) + Logs + Lake
  리소스 상태 (준수) ─→ Config Rule ─위반→ SSM Automation 자동교정
  운영 작업 ─→ Systems Manager (Session/Patch/Run/State/Parameter)

  AWS 측 사고 ─→ Health(Personal) ─→ EventBridge ─→ SNS/Lambda 자동대응
  모범사례 권고 ─→ Trusted Advisor (Business+ 전체) ─→ EventBridge
  자원 크기 ─→ Compute Optimizer (메모리엔 Agent)
```

이 그림의 요지는 "감지 → 진단 → 대응"의 흐름이 끊기지 않는다는 것이다. 메트릭이 이상을 감지하면, 트레이스가 서비스를 좁히고, 로그가 원인을 확정하며, CloudTrail이 책임자를 밝히고, Config/SSM이 상태를 교정한다. 어느 한 도구가 빠지면 이 사슬이 끊겨 "원인을 모르는 비싼 시간"이 늘어난다.

## 시나리오 연습 문제 12

**문제 1.** 보안 감사에서 "누가, 언제, 어떤 IAM 사용자가 특정 보안 그룹을 0.0.0.0/0으로 열었는가"를 추적해야 한다. 가장 적절한 도구는?

A) AWS Config
B) CloudTrail
C) VPC Flow Logs
D) X-Ray

**정답: B**

해설: "누가·언제·어떤 API를 호출했나"라는 행위 추적은 CloudTrail의 영역이다. CloudTrail은 `AuthorizeSecurityGroupIngress` 호출의 주체(IAM principal)·시각·소스 IP·요청 파라미터를 남긴다. A의 Config는 "지금 그 SG가 규칙을 위반한 상태인가"라는 현재 상태·준수를 답하지 행위자를 직접 밝히지 않는다. C의 Flow Logs는 네트워크 트래픽 메타데이터(누가 어디로 패킷을 보냈나)이지 구성 변경 API 호출이 아니다. D는 분산 트레이싱으로 무관하다. 동사가 "누가 ~했나"면 CloudTrail이라는 신호를 기억하라.

---

**문제 2.** 컴플라이언스 팀이 "현재 모든 S3 버킷이 Block Public Access를 켰는지" 지속적으로 점검하고, 위반 시 자동으로 교정하려 한다. 가장 적절한 구성은?

A) CloudTrail로 누가 껐는지만 본다
B) AWS Config Rule로 준수 상태를 점검하고 SSM Automation Runbook으로 자동 교정한다
C) Inspector로 취약점 스캔한다
D) Macie로 민감 데이터를 분류한다

**정답: B**

해설: "지금 ~인 상태인가/준수하나"는 Config의 영역이고, 위반 시 자동 교정은 Config Rule → SSM Automation Runbook 경로가 표준이다. A의 CloudTrail은 행위 추적이라 "누가 껐나"는 알아도 현재 상태 점검·자동 교정을 못 한다. C의 Inspector는 EC2/컨테이너 취약점 평가, D의 Macie는 S3 민감 데이터 분류로 BPA 준수 점검과 다르다. "상태 준수 + 자동 교정"은 Config + SSM Automation 조합으로 기억하라.

---

**문제 3.** API Gateway → Lambda → DynamoDB → 외부 결제 API 흐름에서 사용자 체감 지연이 3초인데, CloudWatch Metrics로는 Lambda Duration이 길다는 것까지만 보이고 어느 다운스트림이 병목인지 모른다. 가장 적절한 도구는?

A) CloudWatch Metrics를 더 본다
B) X-Ray(Active Tracing)로 Subsegment 단위 지연을 분해한다
C) Trusted Advisor Performance 점검
D) Compute Optimizer로 Lambda 메모리 증설

**정답: B**

해설: "다운스트림 호출까지 포함한 호출 단위 지연 분해"는 분산 트레이싱 고유의 능력이다. X-Ray는 Lambda Segment 안에서 DynamoDB·외부 API를 각각 Subsegment로 쪼개 어느 구간이 2.8초를 잡아먹는지 보여준다. A의 메트릭은 증상(느림)까지만이다. C는 모범 사례 점검이지 런타임 진단이 아니다. D의 right-sizing은 원인이 외부 API라면 무의미하다. "왜 느린가 + 여러 서비스 인과" = X-Ray.

---

**문제 4.** 운영자가 100대 EC2 인스턴스에 SSH 키 배포 없이, 인바운드 22번 포트를 열지 않고, 모든 접속을 감사하면서 셸 접속을 하려 한다. 가장 적절한 방법은?

A) Bastion 호스트를 둔다
B) Systems Manager Session Manager를 쓴다
C) EC2 Instance Connect만 쓴다
D) Site-to-Site VPN

**정답: B**

해설: Session Manager는 인스턴스 SSM Agent의 아웃바운드 연결로 셸에 닿게 해 인바운드 22번을 열 필요가 없고, SSH 키라는 장기 자격증명 대신 IAM으로 접근을 통제하며, 모든 세션을 CloudTrail/Logs로 감사한다. 제로 트러스트에 부합한다. A의 Bastion은 키 관리·포트 노출·감사 부담이 남는다. C의 EC2 Instance Connect는 일시 키 주입이지만 여전히 인바운드 SSH 경로를 전제로 하는 경우가 많아 "포트 미개방·100대 일괄·감사" 요구에 Session Manager가 우월하다. D는 네트워크 연결 방식이지 셸 접속 관문이 아니다.

---

**문제 5.** 1,000대 규모의 EC2 플릿에 보안 패치를 정해진 점검 시간대에만 자동 적용하고, 적용 결과를 보고받고 싶다. 가장 적절한 조합은?

A) UserData 스크립트
B) Systems Manager Patch Manager + Maintenance Window
C) Auto Scaling 인스턴스 리프레시
D) Lambda로 SSH 접속해 패치

**정답: B**

해설: 대규모 패치를 "정해진 시간대(Maintenance Window)에 자동 적용 + 규정 준수 보고"하는 것은 Patch Manager + Maintenance Window의 정확한 용도다. Patch Baseline으로 적용 정책을 정의하고 결과를 컴플라이언스로 집계한다. A의 UserData는 부팅 시 1회 실행이라 운영 중 반복 패치에 부적합하다. C의 인스턴스 리프레시는 AMI 교체 기반이라 "기존 인스턴스에 패치"와 결이 다르다. D는 SSH 의존·확장성·감사 모두 열위다.

---

**문제 6.** 멀티 계정 Organizations 환경에서 ① 모든 계정의 API 행위를 한곳에 감사하고, ② 모든 계정의 구성 준수를 통합 조회하며, ③ 보안 발견사항을 집계하려 한다. 가장 적절한 조합은?

A) Organization Trail만
B) Config Aggregator만
C) Security Hub만
D) Organization Trail + Config Aggregator + Security Hub 조합

**정답: D**

해설: 세 요구가 각각 다른 도구에 대응한다 — ① 멀티 계정 API 행위 감사는 Organization Trail(CloudTrail), ② 멀티 계정 구성 준수 통합 조회는 Config Aggregator, ③ 보안 발견사항 집계는 Security Hub다. 하나로 다 되지 않고 조합이 정답이다. 멀티 계정 거버넌스는 "감사(CloudTrail) + 상태(Config) + 보안 집계(Security Hub)"의 삼각 구도로 기억하라. 단일 도구 보기(A·B·C)는 요구의 일부만 충족한다.

---

**문제 7.** 운영팀이 "내 계정 리소스에 실제 영향을 주는 AWS 측 예정 점검·장애"를 감지해 사전에 트래픽을 다른 AZ로 옮기는 자동화를 걸려 한다. 가장 적절한 구성은?

A) Service Health Dashboard 페이지를 주기 새로고침
B) AWS Health API(Personal) 이벤트를 EventBridge로 받아 Lambda 자동 대응
C) GuardDuty 알림
D) Trusted Advisor 점검

**정답: B**

해설: 내 계정에 영향을 주는 AWS 측 이벤트는 Personal Health의 영역이고, Health API + EventBridge로 받아 자동 대응을 트리거하는 것이 표준이다. A의 전역 Service Health는 개인화된 영향을 주지 않고 자동화에도 부적합하며, 2021년 us-east-1 장애 때 그 페이지 자체가 갱신 지연된 사례가 한계를 보여준다. C의 GuardDuty는 위협 탐지, D의 Trusted Advisor는 모범 사례 권고로 AWS 인프라 사고와 다르다.

---

**문제 8.** 서비스 한도(예: VPC당 보안 그룹 수)가 한계에 임박했을 때 자동으로 알림을 받고 싶다. 가장 적절한 구성은?

A) Trusted Advisor(Service Limits) + EventBridge
B) IAM 정책
C) Macie
D) Config Aggregator만

**정답: A**

해설: 서비스 한도 점검은 Trusted Advisor의 Service Limits 카테고리이고, 이를 EventBridge로 받아 SNS 알림이나 자동 증설 요청으로 잇는다. 무료 범위에서도 서비스 한도 점검은 제공되지만 전체 카테고리·API 자동화는 Business+가 전제다. B는 권한 제어, C는 민감 데이터 분류, D는 멀티 계정 구성 집계로 한도 알림과 무관하다. 참고로 Service Quotas 서비스로도 일부 한도를 CloudWatch 알람과 연동할 수 있으나, 시험에서 모범 사례·한도 권고의 대표 신호는 Trusted Advisor다.

---

**문제 9.** EC2 메모리 사용률에 알람을 걸려는데 `AWS/EC2` 네임스페이스에 메모리 메트릭이 없다. 올바른 해결은?

A) 표준 메트릭에 이미 있으니 리전을 바꾼다
B) CloudWatch Agent를 설치해 게스트 OS가 메모리를 직접 보고하게 하고 사용자 정의 메트릭으로 알람
C) X-Ray로 메모리를 본다
D) Inspector로 점검

**정답: B**

해설: 메모리·디스크 여유 공간은 게스트 OS 안쪽 정보라 하이퍼바이저(Nitro)가 못 보고, 표준 메트릭에 아예 없다. CloudWatch Agent를 게스트에 설치해 OS가 직접 보고하게 해야 메모리 메트릭과 알람이 가능하다. A는 표준 메트릭에 메모리가 있다는 잘못된 전제다. C·D는 무관하다. 이 함정은 Compute Optimizer의 메모리 기반 right-sizing 정확도에도 같은 이유로 Agent가 필요하다는 점과 연결된다.

---

**문제 10.** Config Rule이 "EBS 볼륨은 반드시 암호화"를 위반한 리소스를 감지했다. 사람 개입 없이 자동으로 교정(또는 격리)하려 한다. 가장 적절한 구성은?

A) Lambda 단독으로 폴링
B) Config Rule(위반 감지) → EventBridge → SSM Automation Runbook으로 자동 교정
C) Step Functions만
D) Inspector

**정답: B**

해설: Config가 위반을 감지하고, 그 이벤트를 EventBridge로 받아 SSM Automation Runbook이 정형화된 교정 절차(재암호화·격리·태깅)를 실행하는 것이 자동 교정의 표준 패턴이다. Config는 일부 관리형 Rule에 직접 Remediation Action(SSM Automation)을 연결할 수도 있다. A의 Lambda 폴링은 커서 관리·중복·확장성 문제가 있고, C는 오케스트레이션 도구이지 Config 교정의 표준 진입점이 아니며, D는 취약점 평가로 무관하다.

---

**문제 11.** 한 SaaS가 ECS on Fargate 마이크로서비스를 운영하며, 벤더 종속 없이 표준 방식으로 트레이싱을 계측해 향후 X-Ray·Prometheus·Jaeger를 바꿔 끼울 여지를 남기고, 동시에 트레이스에서 SLO를 자동 추적하려 한다. 가장 적절한 조합은?

A) X-Ray SDK 전용 계측만
B) ADOT(OpenTelemetry)로 표준 계측 + CloudWatch Application Signals로 SLO 추적
C) CloudWatch Agent만
D) Lambda Active Tracing

**정답: B**

해설: 벤더 중립·이식성을 원하면 OpenTelemetry 표준이 정답이고 ADOT가 그 AWS 배포판이다. 한 번 OTel로 계측하면 백엔드를 교체할 수 있어 락인이 준다. 여기에 Application Signals를 더하면 트레이스/메트릭에서 SLI를 자동 추출해 SLO("p99<300ms를 99.9% 충족")를 관리형으로 추적·경보한다. A는 AWS 종속이 강하고, C는 트레이싱 표준 계측이 아니며, D는 Fargate가 아닌 Lambda 한정이다. ECS/EKS에선 Collector를 사이드카로 띄운다는 점도 함께 기억하라.

---

**문제 12.** 한 결제 서비스의 가용성 알람이 "에러율 5% 초과 시 ALARM"으로 설정됐는데, 서비스가 완전히 죽어 요청이 0이 됐을 때 알람이 울리지 않았다. 또 글로벌 3개 리전의 메트릭/로그를 한 화면에서 보고 싶다. 각각의 올바른 대응은?

A) 임계값을 낮추고, 리전별 콘솔을 따로 본다
B) missing data 처리를 breaching으로 설정하고, Cross-region(필요 시 Cross-account) CloudWatch Dashboard를 쓴다
C) Anomaly Detection으로 바꾸고, 메트릭을 한 리전으로 재전송한다
D) 평가 기간을 늘리고, Service Health Dashboard를 본다

**정답: B**

해설: 요청이 0이면 에러율 메트릭 자체가 보고되지 않아 알람이 INSUFFICIENT_DATA가 되고 기본(missing) 처리에선 ALARM으로 전이하지 않는다. 가용성 알람은 missing data를 breaching으로 처리해야 "트래픽 끊김도 장애"로 잡힌다. 글로벌 통합 가시성은 메트릭이 기본 리전 격리이므로 Cross-region/Cross-account Dashboard가 여러 리전 위젯을 한 뷰로 합성한다. A는 데이터 없는 문제를 못 풀고 운영 부담만 늘린다. C의 재전송은 비용·이중화 문제를 만들고 Anomaly Detection도 데이터 없으면 한계가 같다. D의 Service Health는 AWS 측 상태 페이지이지 내 메트릭 대시보드가 아니다.

---

해설 보강: Week 9의 핵심은 "질문 → 도구" 매핑을 흔들림 없이 하는 것이다. 누가 했나(CloudTrail) / 지금 상태·준수(Config) / 건강 증상(CloudWatch Metrics) / 그 순간 맥락(Logs) / 분산 인과(X-Ray) / 트래픽 흐름(Flow Logs) / AWS 측 사고의 내 영향(Health Personal + EventBridge) / 모범 사례 권고(Trusted Advisor, Business+) / 자원 크기(Compute Optimizer, 메모리엔 Agent) / 운영 작업(Systems Manager). 반복 출제되는 함정은 ① EC2 메모리는 Agent, ② 가용성 알람의 missing=breaching, ③ CloudTrail(행위) vs Config(상태)의 구분, ④ Health(AWS 사고) vs Trusted Advisor(내 권고)의 구분이다. 다음 주는 비용 최적화 도메인으로 넘어가, 이번 주의 Compute Optimizer·Trusted Advisor Cost가 비용 도구들과 어떻게 엮이는지 본다.

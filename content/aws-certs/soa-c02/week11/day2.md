# Day 2 - Trusted Advisor, AWS가 당신 계정을 대신 점검하는 다섯 개의 눈

운영자 한 명이 머릿속에 담을 수 있는 모범 사례에는 한계가 있다. "보안 그룹에 0.0.0.0/0 SSH가 열려 있나? RDS가 Multi-AZ인가? IAM 액세스 키가 90일 넘게 안 돌아갔나? EBS 볼륨 한도가 차오르고 있나?" — 이런 점검 항목은 수백 개이고, 계정이 수십 개로 늘면 사람의 기억으로는 도저히 따라잡을 수 없다. **Trusted Advisor**는 이 점검을 AWS가 대신 한다. AWS는 자기 플랫폼 위에서 수백만 고객이 어떻게 망가지는지 누구보다 잘 안다 — 그 집단 지성을 자동 체크 항목으로 코드화한 것이 Trusted Advisor다.

핵심은 Trusted Advisor가 다섯 개의 렌즈로 계정을 들여다본다는 것이다 — 비용, 성능, 보안, 내결함성, 서비스 한도. 이 다섯이 AWS Well-Architected Framework의 기둥과 거의 포개진다는 점이 우연이 아니다. Trusted Advisor는 사실상 Well-Architected의 일부를 자동 점검 가능한 체크로 환원한 도구다. 이 글은 그 다섯 카테고리가 각각 무엇을 보는지, Support 플랜에 따라 왜 점검 범위가 갈리는지, 그리고 점검 결과를 어떻게 자동 대응으로 연결하는지를 파고든다.

## 다섯 카테고리는 Well-Architected의 그림자다

Trusted Advisor의 다섯 카테고리를 그냥 외우면 시험은 통과하지만 본질을 놓친다. 이 다섯은 AWS가 2015년 공개한 **Well-Architected Framework**의 다섯(이후 여섯) 기둥 — 운영 우수성, 보안, 안정성, 성능 효율성, 비용 최적화 — 을 자동 점검 가능한 형태로 옮긴 것이다. Well-Architected가 "사람이 워크숍에서 질문에 답하며 평가하는" 정성적 프레임워크라면, Trusted Advisor는 그중 코드로 자동 판정할 수 있는 항목만 뽑아 "실시간 자동 체크"로 만든 도구다.

| 카테고리 | 무엇을 보나 | 대표 체크 |
|----------|-------------|-----------|
| **Cost Optimization** | 돈이 새는 곳 | 미사용 EBS·EIP·LB, 저활용 EC2, gp2→gp3, RI/SP 활용 |
| **Performance** | 병목·과부하 | 과활용 EC2/EBS, 비대한 보안 그룹, CloudFront 캐시 효율 |
| **Security** | 노출·위반 | 0.0.0.0/0 SSH/RDP, 공개 S3, MFA 없는 Root, 키 미회전 |
| **Fault Tolerance** | 단일 장애점 | Multi-AZ 없는 RDS, 스냅샷 부재, 단일 AZ, Route 53 헬스체크 |
| **Service Limits** | 한도 임박 | 각 서비스 쿼터의 80% 도달 경고 |

이 매핑을 알면 시험에서 헷갈리는 함정 하나가 풀린다 — **Compliance(규정 준수)는 다섯 카테고리에 없다.** 규정 준수는 Trusted Advisor가 아니라 AWS Config(커스텀 규칙 평가)와 Audit Manager(감사 보고서)의 영역이다. Trusted Advisor는 "모범 사례를 따르고 있나"를 보지, "특정 규제 조항을 만족하나"를 보지 않는다.

> 💡 **관련 이론**: Trusted Advisor가 작동하는 방식은 소프트웨어 공학의 **정적 분석(static analysis)·린팅(linting)**과 같은 발상이다. ESLint나 SonarQube가 코드를 실행하지 않고도 "여기 SQL 인젝션 위험", "여기 미사용 변수"를 잡아내듯, Trusted Advisor는 계정 설정을 실행해보지 않고도 구성(configuration)을 스캔해 안티패턴을 잡는다. 둘 다 "알려진 나쁜 패턴의 룰셋"을 입력에 대조하는 룰 기반 엔진이다. 차이는 대상이 소스 코드냐 클라우드 리소스 구성이냐일 뿐이다. 이 발상이 클라우드 전반으로 확장된 것이 Policy as Code(OPA, AWS Config Rules)이고, Trusted Advisor는 AWS가 미리 짜둔 룰셋을 관리형으로 제공하는 버전이다.

## Support 플랜이 점검 범위를 가르는 이유 — 비즈니스 모델의 경계선

Trusted Advisor에서 가장 자주 출제되는 함정은 "무료 계정은 비용 최적화 체크를 못 본다"는 것이다. 이건 기술적 제약이 아니라 **AWS Support의 비즈니스 모델**이 만든 경계다. Trusted Advisor의 전체 체크는 사실상 컨설팅 서비스이고, AWS는 이 부가가치를 유료 Support 플랜(Business 이상)에 묶어둔다.

| 플랜 | Trusted Advisor 접근 |
|------|----------------------|
| **Basic / Developer** | 핵심 체크만 (보안 일부 + 서비스 한도) |
| **Business / Enterprise On-Ramp / Enterprise** | 전체 100+ 체크 (5개 카테고리 전부) |

무료(Basic/Developer)에서 볼 수 있는 핵심 체크는 보안과 서비스 한도에 집중돼 있다 — 이것들은 "방치하면 AWS 플랫폼 전체에 해가 되는" 항목이라 AWS가 무료로라도 경고해준다. 공개된 S3 버킷, 0.0.0.0/0으로 열린 특정 포트, MFA 없는 Root, 공개된 EBS/RDS 스냅샷, 서비스 한도 임박 — 이런 항목은 그대로 두면 보안 사고나 운영 중단으로 이어져 AWS도 손해이기 때문이다. 반면 비용 최적화(미사용 리소스 정리, RI 권장)는 순수하게 고객의 돈을 아끼는 부가가치이므로 유료 영역에 둔다.

> 🔍 **더 깊이**: Trusted Advisor 체크는 **자동 새로고침 주기**가 카테고리마다 다르다. 일부는 자동으로 5분~1주 간격으로 갱신되지만, 일부는 수동 새로고침(`refresh-trusted-advisor-check`)을 해야 즉시 결과가 반영된다. 이게 운영에서 중요한 이유는 "방금 보안 그룹을 고쳤는데 Trusted Advisor가 아직 빨간불"인 상황 때문이다 — 설정은 바꿨지만 체크가 아직 갱신 안 된 것이다. Enterprise Support 고객은 추가로 **Trusted Advisor Priority**를 받는데, 이는 AWS의 TAM(Technical Account Manager)이 큐레이션한 우선순위 권장으로, 수백 개 체크 중 "지금 당장 봐야 할 것"을 사람이 골라준다. 자동 체크 위에 사람의 판단을 얹은 계층이다.

## 점검을 행동으로 — EventBridge로 자동 대응 파이프라인 만들기

Trusted Advisor가 단순한 "리포트 대시보드"에 머물면 가치의 절반만 쓰는 것이다. 진짜 운영은 **점검 결과를 자동 대응으로 연결**하는 데 있다. 누군가 보안 그룹에 실수로 0.0.0.0/0 SSH를 열면, 운영자가 주간 리뷰 때 발견하는 게 아니라 **수 분 내에 자동으로 닫혀야** 한다.

이 파이프라인의 중심은 **EventBridge**다. Trusted Advisor는 체크 상태가 바뀔 때 `aws.trustedadvisor` 소스로 이벤트를 발행하고, EventBridge 규칙이 이를 받아 대응 액션을 트리거한다.

```
Trusted Advisor 체크 상태 변경 (예: SG에 0.0.0.0/0 SSH 감지 → status: ERROR)
   │
   ▼
EventBridge Rule (source: aws.trustedadvisor, detail.status: [ERROR, WARN])
   │
   ├──► SNS          → 운영팀 즉시 알림
   ├──► Lambda       → SG 규칙 자동 제거 (revoke-security-group-ingress)
   ├──► SSM Automation → 표준 복구 런북 실행
   └──► OpsCenter OpsItem → 추적 가능한 작업 항목 생성
```

여기서 한 가지 설계 판단이 갈린다 — **자동 복구(auto-remediation)를 어디까지 할 것인가.** "0.0.0.0/0 SSH를 자동으로 닫기"는 안전해 보이지만, 만약 그게 의도된 임시 접근이었다면 자동 차단이 운영을 방해한다. 그래서 성숙한 조직은 보통 "위험도 높고 명백한 위반(공개 S3, Root MFA 없음)"만 자동 복구하고, 애매한 항목은 알림 + OpsItem 생성에 그쳐 사람의 판단을 남긴다.

> 📚 **사례**: 2017년 컨설팅 기업 Accenture, 2017년 Verizon, 2019년 미국 통신사 등 수많은 대형 유출 사고의 공통 원인이 **공개로 잘못 설정된 S3 버킷**이었다. 민감 데이터가 담긴 버킷이 인터넷에 노출됐고, 보안 연구자나 공격자가 이를 스캔으로 발견했다. 이 사고들의 교훈은 "설정 실수는 반드시 일어난다"는 것이고, 그래서 Trusted Advisor의 무료 체크에 **공개 S3 버킷 탐지**가 포함된 것이다. 나아가 AWS는 이후 S3 Block Public Access(계정·버킷 레벨 차단), Access Analyzer(외부 접근 분석), Macie(민감 데이터 자동 탐지)를 잇따라 내놨다. Trusted Advisor의 공개 S3 체크는 이 방어 계층의 가장 바깥, 가장 저렴한 첫 그물이다 — EventBridge로 자동 알림까지 걸어두면 노출이 발생한 순간 운영팀이 안다.

## Service Limits — 80%에서 울리는 사전 경보의 가치

다섯 카테고리 중 운영자가 가장 과소평가하는 게 **Service Limits**(서비스 한도, 쿼터)다. 모든 AWS 서비스에는 계정당 한도가 있다 — VPC 개수, EIP 개수, 보안 그룹 규칙 수, 실행 중 인스턴스 수 등. 이 한도에 부딪히면 새 리소스 생성이 그냥 실패한다. 문제는 이게 **가장 나쁜 타이밍**에 터진다는 것이다 — 트래픽 급증으로 Auto Scaling이 인스턴스를 더 띄우려는 바로 그 순간, vCPU 한도에 걸려 스케일 아웃이 막힌다.

Trusted Advisor의 Service Limits 체크는 한도의 **80%에 도달하면 미리 경고**한다. 이 "80% 사전 경보"가 핵심이다 — 한도 증가 요청은 즉시 처리되는 게 아니라 AWS 승인을 거쳐 시간이 걸릴 수 있으므로, 100%에 부딪히고 나서 요청하면 이미 늦다. 80%에서 알림을 받아 미리 증액해두는 것이 사전 대응이다.

> ⚠️ **함정**: "서비스 한도는 자동으로 늘어난다"는 건 **틀렸다.** 한도 증가는 거의 항상 **수동 요청 + AWS 승인**이 필요하다(Service Quotas 콘솔 또는 Support 케이스). Trusted Advisor는 80% 도달을 알려줄 뿐 자동으로 늘려주지 않는다. 시험에서 "한도에 부딪혀 스케일 아웃 실패"가 나오면, 답은 "Trusted Advisor Service Limits로 80%에 사전 경보를 받고 Service Quotas로 미리 증액 요청"이다. 또한 일부 쿼터는 CloudWatch의 `AWS/Usage` 네임스페이스 메트릭으로도 모니터링·알람을 걸 수 있다.

## 비슷한 도구들과의 경계 — 무엇이 어디까지 보나

Trusted Advisor는 광범위하지만 만능이 아니다. 시험은 "이 상황엔 Trusted Advisor가 아니라 X"를 정확히 가르는 문제를 자주 낸다. 핵심은 각 도구의 **고유 영역**을 아는 것이다.

| 도구 | 고유 역할 | Trusted Advisor와의 차이 |
|------|-----------|--------------------------|
| **Trusted Advisor** | AWS 모범 사례 자동 점검 (5 카테고리) | 가장 광범위, 룰은 AWS가 고정 제공 |
| **Config** | 리소스 구성 변경 추적 + 커스텀 규칙 평가 | 내 규칙 정의 가능, 시점별 이력 추적 |
| **Security Hub** | 여러 보안 소스 finding 통합 + 표준(CIS, PCI) 평가 | 보안 전문, 다중 소스 집계 |
| **Compute Optimizer** | ML 기반 right-sizing 권장 | 인스턴스 단위 정밀 권장 (TA는 거친 점검) |
| **Cost Explorer** | 비용 다차원 분석·시각화 | 분석 도구, 점검 아님 |

경계를 가르는 질문은 "규칙을 내가 정의해야 하나?"이다. "회사 표준에 맞는 커스텀 규칙(예: 모든 EBS는 암호화 필수)"이면 Config Rule이다. "구성 변경의 시점별 이력과 누가 바꿨나"도 Config다. Trusted Advisor는 AWS가 고정한 룰셋만 제공하므로 커스텀이 안 된다. 반면 "AWS 모범 사례 전반을 한눈에"는 Trusted Advisor가 가장 넓다.

> 💡 **관련 이론**: Trusted Advisor·Config·Security Hub의 관계는 관측가능성(observability)의 **수집-평가-집계** 계층 구조로 볼 수 있다. Config가 리소스 구성의 원천 데이터(시점별 스냅샷)를 수집하고, 그 위에서 Config Rules와 Trusted Advisor가 규칙 평가를 하고, Security Hub가 여러 평가 결과(GuardDuty, Inspector, Macie, Config 등)를 하나의 finding 포맷(ASFF, AWS Security Finding Format)으로 정규화해 집계한다. 이는 로그·메트릭·트레이스를 수집해 상위에서 상관분석하는 옵저버빌리티 파이프라인과 같은 구조다. 각 도구를 따로 외우기보다 "원천(Config) → 평가(TA/Rules) → 집계(Security Hub)"의 흐름으로 이해하면 어느 상황에 무엇이 답인지 자연스럽게 갈린다.

## 곁가지지만 자주 묶여 나오는 둘 — Health Dashboard와 Cost Anomaly Detection

Trusted Advisor와 함께 운영 점검 맥락에서 자주 출제되는 두 서비스가 있다. **AWS Health Dashboard**는 Trusted Advisor와 방향이 반대다 — Trusted Advisor가 "내 계정 설정의 문제"를 보는 반면, Health Dashboard는 "**AWS 쪽에서 일어나는 일**"을 본다. 공개 Service Health Dashboard는 전체 서비스 장애를 보여주고, **Personal Health Dashboard(PHD)**는 내 계정에 실제로 영향을 주는 이벤트만 추린다 — 내 EC2 호스트의 retirement 예정, 내 EBS 볼륨 성능 저하, 내 RDS의 유지보수 윈도우. 이것도 EventBridge로 받아 사전 대응(미리 인스턴스 마이그레이션)을 자동화한다.

**Cost Anomaly Detection**은 비용 점검의 ML 버전이다. Trusted Advisor의 비용 체크가 "미사용 리소스" 같은 룰 기반 정적 점검이라면, Cost Anomaly Detection은 계정의 비용 패턴을 학습해 **평소와 다른 spike를 통계적으로 탐지**한다. 갑자기 데이터 전송 비용이 평소의 3배가 되면, 어떤 고정 임계값을 넘지 않았어도 "이건 비정상"이라고 알린다. 핵심 구분은 이것이 **탐지(detection)이지 차단(block)이 아니라는** 점이다 — 알림만 줄 뿐 비용 발생을 막지는 않는다. 차단은 다음 글의 Budgets Action 몫이다.

> ⚠️ **함정**: Cost Anomaly Detection과 Budgets를 혼동하면 안 된다. Budgets는 "고정 임계값"(월 $5,000)을 정해두고 넘으면 알리는 룰 기반이고, Cost Anomaly Detection은 "평소 패턴 대비 이상치"를 ML로 잡는다. 정상적으로 점증하는 비용은 Anomaly가 안 잡지만 Budgets는 임계 넘으면 잡고, 반대로 임계 안에서의 갑작스러운 spike는 Budgets가 못 잡지만 Anomaly는 잡는다. 둘은 보완 관계다. 그리고 둘 다 PHD처럼 "탐지·알림"이지 "차단"은 Budgets Action에서만 된다.

## 정리하며

Trusted Advisor는 AWS가 수백만 고객의 실패에서 학습한 모범 사례를 다섯 카테고리의 자동 체크로 코드화한 도구다. 그 다섯이 Well-Architected의 기둥과 포개진다는 것을 알면 본질이 보인다 — 정성적 프레임워크를 자동 점검 가능한 린터로 만든 것이다.

운영자가 기억할 다섯 가지는 이렇다. ① 다섯 카테고리는 Cost / Performance / Security / Fault Tolerance / Service Limits — Compliance는 여기 없고 Config·Audit Manager 영역이다. ② 전체 체크는 Business 이상 Support의 유료 부가가치이고, 무료(Basic/Developer)는 방치 시 플랫폼에 해가 되는 보안·한도 핵심 체크만 본다. ③ EventBridge로 체크 결과를 SNS·Lambda·SSM·OpsItem에 연결해 자동 대응 파이프라인을 만들되, 자동 복구 범위는 신중히 정한다. ④ Service Limits는 80% 사전 경보가 핵심 — 한도는 자동 증가하지 않고 수동 요청·승인이 필요하다. ⑤ Health Dashboard(AWS 쪽 이벤트)와 Cost Anomaly Detection(ML 비용 이상 탐지)은 탐지·알림이지 차단이 아니다.

다음 글에선 비용을 다차원으로 분석하는 Cost Explorer, 예산을 정하고 초과 시 자동 차단까지 거는 Budgets, 그리고 팀·프로젝트별 비용을 가르는 Cost Allocation Tag의 내부를 다룬다.

---

## 📝 연습 문제

**문제 1.** 한 운영자가 "Trusted Advisor의 다섯 카테고리"를 묻는 문제에서 보기 중 하나를 골라야 한다. 다섯 카테고리에 **포함되지 않는** 것은?

A) Cost Optimization

B) Fault Tolerance

C) Compliance(규정 준수)

D) Service Limits

**정답: C**

해설: Trusted Advisor의 다섯 카테고리는 Cost Optimization / Performance / Security / Fault Tolerance / Service Limits로, AWS Well-Architected Framework의 기둥을 자동 점검 형태로 옮긴 것이다. Compliance(규정 준수)는 여기 없다 — 특정 규제 조항 만족 여부는 AWS Config(커스텀 규칙 평가)와 Audit Manager(감사 보고서)의 영역이다. Trusted Advisor는 "모범 사례를 따르는가"를 보지 "특정 규제를 만족하는가"를 보지 않는다.

---

**문제 2.** Basic Support 플랜을 쓰는 회사가 Trusted Advisor에서 "미사용 EBS 볼륨"과 "저활용 EC2" 같은 비용 최적화 권장을 받으려 한다. 무엇이 필요한가?

A) IAM 권한만 추가하면 된다

B) Business 또는 Enterprise Support 플랜으로 업그레이드 — 전체 100+ 체크(비용 카테고리 포함)는 유료 플랜 전용

C) 리전을 us-east-1로 변경

D) CloudWatch Agent 설치

**정답: B**

해설: 무료(Basic/Developer)에서 보이는 핵심 체크는 보안 일부와 서비스 한도에 한정된다 — 방치하면 플랫폼 전체에 해가 되는 항목들이다. 비용 최적화(미사용 리소스, RI 권장)는 순수하게 고객의 돈을 아끼는 부가가치이므로 Business 이상 유료 Support 플랜에 묶여 있다. 이는 기술 제약이 아니라 AWS Support의 비즈니스 모델이 만든 경계다. 전체 5개 카테고리 100+ 체크를 보려면 플랜 업그레이드가 필요하다.

---

**문제 3.** 누군가 보안 그룹에 0.0.0.0/0 SSH를 실수로 열면 수 분 내 자동으로 닫히고 운영팀에 알림이 가도록 만들려 한다. 어떤 구성이 맞나?

A) 주간 수동 리뷰로 점검

B) Trusted Advisor 체크 상태 변경 → EventBridge Rule(source: aws.trustedadvisor) → Lambda(규칙 제거) + SNS(알림)

C) CloudTrail 로그를 매일 읽는다

D) Config만 활성화

**정답: B**

해설: Trusted Advisor는 체크 상태가 바뀌면 `aws.trustedadvisor` 소스로 이벤트를 발행한다. EventBridge 규칙으로 이를 받아 Lambda(`revoke-security-group-ingress`로 규칙 자동 제거), SNS(즉시 알림), SSM Automation(런북), OpsItem(추적) 등에 연결하면 자동 대응 파이프라인이 된다. 단 자동 복구 범위는 신중히 정해야 한다 — 의도된 임시 접근까지 자동 차단하면 운영을 방해할 수 있어, 명백한 고위험 위반만 자동 복구하고 애매한 항목은 알림에 그치는 것이 성숙한 패턴이다.

---

**문제 4.** 트래픽 급증으로 Auto Scaling이 인스턴스를 추가하려다 vCPU 한도에 걸려 스케일 아웃이 실패했다. 이를 사전에 방지하려면?

A) 한도는 자동으로 늘어나므로 기다린다

B) Trusted Advisor Service Limits로 80% 도달 시 경보를 받고, Service Quotas로 미리 증액을 요청한다(승인에 시간 소요)

C) 인스턴스를 더 크게 만든다

D) Spot으로 전환한다

**정답: B**

해설: 서비스 한도는 자동으로 늘어나지 않는다 — 수동 요청 + AWS 승인이 필요하고 시간이 걸린다. 따라서 100%에 부딪히고 나서 요청하면 이미 늦다. Trusted Advisor의 Service Limits 체크는 80% 도달 시 사전 경보를 주므로, 이 시점에 Service Quotas 콘솔이나 Support 케이스로 미리 증액을 요청해 한도에 부딪히기 전에 여유를 확보해야 한다. 일부 쿼터는 CloudWatch `AWS/Usage` 네임스페이스로도 알람을 걸 수 있다.

---

**문제 5.** AWS가 내 EC2 인스턴스가 올라간 물리 호스트를 retirement(교체) 예정이라고 알려, 사전에 마이그레이션하고 싶다. 어떤 서비스가 맞나?

A) Trusted Advisor

B) AWS Personal Health Dashboard(PHD) + EventBridge

C) CloudTrail

D) Inspector

**정답: B**

해설: Trusted Advisor는 "내 계정 설정의 문제"를 보지만, "AWS 쪽에서 일어나는 일"(호스트 retirement, EBS 성능 저하, RDS 유지보수)은 AWS Health Dashboard, 그중에서도 내 계정에 실제로 영향을 주는 이벤트만 추리는 Personal Health Dashboard(PHD)가 본다. PHD 이벤트를 EventBridge로 받아 사전 마이그레이션을 자동화하면 retirement 전에 무중단으로 인스턴스를 옮길 수 있다.

---

**문제 6.** 회사 비용이 어떤 고정 예산 임계값은 넘지 않았지만, 데이터 전송 비용이 평소 패턴 대비 갑자기 3배로 튀었다. 이런 패턴 기반 이상을 자동 탐지하려면?

A) AWS Budgets(고정 임계값 기반)

B) Cost Anomaly Detection — ML로 평소 패턴을 학습해 통계적 이상치(spike) 탐지

C) Trusted Advisor Cost

D) CloudWatch Alarm

**정답: B**

해설: Budgets는 "월 $5,000" 같은 고정 임계값을 넘을 때 알리는 룰 기반이라, 임계 안에서의 갑작스러운 spike는 못 잡는다. Cost Anomaly Detection은 계정의 비용 패턴을 ML로 학습해 평소 대비 이상치를 통계적으로 탐지하므로, 고정 임계를 안 넘어도 "평소와 다른" spike를 잡는다. 둘은 보완 관계다. 단 Anomaly Detection은 탐지·알림이지 차단이 아니다 — 비용 발생 자체를 막지는 못한다.

---

**문제 7.** 회사가 "모든 EBS 볼륨은 반드시 암호화돼야 한다"는 자체 표준의 준수 여부를 지속 평가하고, 위반 시점과 변경 이력을 추적하려 한다. Trusted Advisor가 아니라 무엇을 써야 하나?

A) Trusted Advisor Security 카테고리

B) AWS Config + 커스텀 Config Rule(encrypted-volumes) — 커스텀 규칙 정의와 시점별 구성 이력 추적 가능

C) Cost Explorer

D) Compute Optimizer

**정답: B**

해설: Trusted Advisor는 AWS가 고정한 룰셋만 제공하므로 "우리 회사만의 커스텀 규칙"을 정의할 수 없고, 구성의 시점별 변경 이력도 추적하지 않는다. 커스텀 규칙 평가와 변경 이력은 AWS Config의 고유 영역이다 — `encrypted-volumes` 같은 관리형/커스텀 Config Rule로 지속 평가하고, 구성 타임라인으로 언제 누가 위반 상태로 만들었는지 추적한다. "내가 규칙을 정의해야 하나?"가 Config와 Trusted Advisor를 가르는 질문이다.

---

## 📌 오늘의 요약

1. Trusted Advisor의 다섯 카테고리(Cost/Performance/Security/Fault Tolerance/Service Limits)는 Well-Architected 기둥을 자동 점검 린터로 옮긴 것 — Compliance는 여기 없고 Config·Audit Manager 영역
2. 전체 100+ 체크는 Business 이상 유료 Support 부가가치, 무료는 방치 시 플랫폼에 해가 되는 보안·한도 핵심 체크만
3. EventBridge(source: aws.trustedadvisor)로 SNS·Lambda·SSM·OpsItem에 연결해 자동 대응 파이프라인 구성, 자동 복구 범위는 신중히
4. Service Limits는 80% 사전 경보가 핵심 — 한도는 자동 증가하지 않고 수동 요청·승인 필요
5. Health Dashboard(PHD)는 AWS 쪽 이벤트, Cost Anomaly Detection은 ML 비용 이상 탐지 — 둘 다 탐지·알림이지 차단 아님

# Day 62 - 운영 우수성·보안 기둥 심화 — GitOps의 뿌리, 책임 공유 모델의 경계, 추적성 3종의 내부 차이

production 인프라가 무너지는 두 가지 방식이 있다. 하나는 운영자가 콘솔에서 손으로 무언가를 잘못 누르는 것(Operational Excellence 실패), 다른 하나는 공격자가 약한 자격증명·열린 포트·과도한 권한을 파고드는 것(Security 실패)이다. 흥미롭게도 두 기둥의 해법은 본질적으로 같은 철학을 공유한다 — **사람의 수동 개입을 코드와 자동화로 대체하고, 모든 행위를 추적 가능하게 만든다.** 운영을 코드로 바꾸면 휴먼 에러가 사라지고, 보안을 코드로 바꾸면 일관성과 감사 가능성이 생긴다.

SAP-C02에서 Operational Excellence와 Security는 "운영 부담 최소", "사람이 SSH 없이 접속", "30일 자동 비밀번호 변경", "누가 API를 호출했나" 같은 키워드로 끊임없이 출제된다. 오늘은 GitOps의 역사적 뿌리부터 책임 공유 모델의 정확한 경계, 추적성 3종(CloudTrail·Config·Logs)의 내부 차이, 그리고 멀티 계정 보안 위임까지 파고든다.

## Operational Excellence — 운영을 코드로 만든다는 것의 의미

Operational Excellence의 5대 설계 원칙은 한 문장으로 요약된다: **"운영을 코드로 수행하고, 작은 변경을 자주, 되돌릴 수 있게, 학습하며 자동화하라."** 이 중 첫 번째 원칙 "운영을 코드로(Perform operations as code)"가 모든 것의 출발점이다.

| 원칙 | 의미 | AWS 매핑 |
|------|------|----------|
| 운영을 코드로 | 인프라·운영 절차를 코드화 | CloudFormation·CDK·Terraform·SSM Automation |
| 작고 빈번한 가역적 변경 | 큰 배포 대신 작게 자주, 롤백 가능 | CodeDeploy(Canary·Blue/Green) |
| 운영 절차 정기 개선 | 회고·게임데이로 절차 진화 | WA Review·Game Day |
| 장애 예상·학습 | 실패를 전제하고 사후 학습 | FIS·포스트모템 문화 |
| 모든 운영 자동화 | 반복 작업에 사람 손 배제 | SSM·EventBridge·Lambda |

> 💡 **관련 이론**: "운영을 코드로"의 사상적 뿌리는 2017년 Weaveworks가 명명한 **GitOps**다. 핵심은 "Git 저장소를 시스템의 단일 진실 소스(Single Source of Truth)로 삼고, 실제 인프라 상태가 Git 선언과 다르면 자동으로 수렴(reconcile)시킨다"는 선언적(declarative) 모델이다. 이는 더 거슬러 올라가면 인프라를 **명령형(imperative)**이 아니라 **선언형(declarative)**으로 다루자는 패러다임 전환이다 — "이 명령을 실행하라"가 아니라 "최종 상태가 이래야 한다"를 선언하고 시스템이 차이를 메운다. CloudFormation의 drift detection, Terraform의 plan/apply가 모두 이 수렴 루프다. 시험에서 "수동 변경을 탐지·교정", "선언적 인프라"가 보이면 IaC + drift detection 조합이 정답 신호다.

> 🔍 **더 깊이**: "작고 빈번한 가역적 변경" 원칙은 배포 전략으로 구현된다. **Blue/Green**은 새 환경(Green)을 통째로 띄우고 트래픽을 한 번에 전환, 문제 시 Blue로 즉시 롤백한다(가역성↑, 비용↑ — 두 환경 동시 운영). **Canary**는 트래픽의 5~10%만 새 버전에 보내 관찰 후 점진 확대한다(위험 노출 최소화). **Rolling**은 인스턴스를 순차 교체한다(비용↓, 롤백 느림). SAP 시험에서 "배포 위험 최소화 + 즉시 롤백"은 Blue/Green, "소수 사용자로 먼저 검증"은 Canary로 갈린다. CodeDeploy는 이 세 전략을 모두 매니지드로 제공한다.

## Operational Excellence 도구 지형 — Systems Manager가 중심이다

| 도구 | 핵심 용도 | 시험 키워드 |
|------|----------|------------|
| **CloudFormation·CDK** | 선언적 IaC | "인프라를 코드로" |
| **Service Catalog** | 승인된 제품만 셀프서비스 배포 | "임의 인프라 생성 금지" |
| **Systems Manager** | 패치·세션·파라미터·인벤토리·Automation·OpsCenter | "SSH 없이", "패치 자동", "런북" |
| **CloudWatch** | 메트릭·로그·알람·대시보드·Synthetics | "관측성", "합성 모니터링" |
| **X-Ray·ServiceLens·ADOT** | 분산 트레이싱 | "마이크로서비스 지연 추적" |
| **CodePipeline·CodeDeploy** | CI/CD·배포 전략 | "자동 배포 파이프라인" |
| **Health Dashboard** | 서비스·계정 헬스 이벤트 | "AWS 측 장애 알림" |
| **Chatbot** | Slack·Teams 운영 알림 | "ChatOps" |

Systems Manager(SSM)는 Operational Excellence의 스위스 군용 칼이다. 시험에 가장 자주 나오는 두 기능은 **Session Manager**(SSH/RDP 포트 개방 없이 IAM 권한으로 셸 접속, 모든 세션을 CloudTrail·S3에 기록)와 **Patch Manager**(패치 베이스라인 정의 후 스케줄로 자동 패치)다. 또 **Automation Document**는 다단계 런북(EC2 시작 → 패치 → 검증 → 재시작)을 코드로 정의해 사고 대응을 자동화한다.

> ⚠️ **함정**: SSM의 두 종류 문서를 혼동하면 안 된다. **Run Document(Command document)**는 EC2에 단일 명령을 실행한다(예: 셸 스크립트 한 줄). **Automation Document**는 여러 AWS API를 순서대로 엮는 다단계 워크플로다(예: 스냅샷 → AMI 생성 → 인스턴스 교체 → 검증). 시험에서 "여러 단계로 된 복구·운영 워크플로를 자동화"는 Automation Document, "인스턴스 안에서 명령 실행"은 Run Document다. 둘을 바꿔 고르면 오답이다.

## Security — 책임 공유 모델의 정확한 경계

Security 기둥을 이해하려면 **책임 공유 모델(Shared Responsibility Model)**의 경계를 정확히 그어야 한다. AWS는 "of the cloud(클라우드 자체)"의 보안을, 고객은 "in the cloud(클라우드 안)"의 보안을 책임진다.

```
[고객 책임 — Security IN the cloud]
  • 데이터 암호화(저장·전송)
  • IAM 권한·자격증명 관리
  • OS·앱 패치 (EC2의 경우)
  • 네트워크·방화벽 구성 (SG·NACL)
  • 애플리케이션 보안
─────────────────────────────────
[AWS 책임 — Security OF the cloud]
  • 물리 데이터센터·하드웨어
  • 하이퍼바이저·호스트 OS
  • 매니지드 서비스의 인프라 운영
  • 글로벌 네트워크 백본
```

핵심은 **추상화 수준이 올라갈수록 고객 책임이 줄어든다**는 점이다. EC2(IaaS)는 OS 패치까지 고객 몫이지만, RDS(매니지드)는 DB 엔진 패치를 AWS가 하고, Lambda(서버리스)는 런타임까지 AWS가 관리한다. 그래서 "운영·보안 부담을 줄여라"는 곧 "더 매니지드한 서비스로 올라가라"와 같은 말이다.

> 💡 **관련 이론**: 책임 공유 모델의 보안 철학은 **Zero Trust(제로 트러스트)**로 진화했다. 전통 보안은 "네트워크 경계 안은 신뢰, 밖은 불신"이라는 성벽(perimeter) 모델이었다. Zero Trust는 NIST SP 800-207에 정의된 대로 **"네트워크 위치를 신뢰의 근거로 삼지 않고 모든 요청을 매번 검증"**한다. AWS에서는 IAM 권한 검증, VPC 내부에서도 SG로 세분화, IMDSv2의 token 요구, mTLS 등이 Zero Trust 구현이다. 2019년 Capital One 사고(SSRF로 EC2 메타데이터에서 IAM 자격증명 탈취 → 1억 명 데이터 유출)가 IMDSv2 의무화의 직접 계기였다 — 경계 안에 있다고 신뢰한 메타데이터 엔드포인트가 공격 표면이 됐기 때문이다.

> 📚 **사례**: 2019년 Capital One 데이터 유출은 책임 공유 모델의 "고객 책임" 영역에서 발생한 전형적 사고다. 원인은 잘못 구성된 WAF(고객 책임)가 SSRF를 허용했고, 과도한 권한의 IAM 역할(고객 책임)이 메타데이터 서비스 v1(token 불필요)에서 탈취돼 S3 버킷을 읽었다. AWS 인프라 자체(AWS 책임)는 뚫리지 않았다. 교훈: (1) IMDSv2 의무화로 token 없는 메타데이터 접근 차단, (2) IAM 최소 권한, (3) VPC Endpoint·SG로 메타데이터 접근 경로 제한. 이 사고 이후 GuardDuty에 자격증명 탈취 탐지 패턴이 추가됐고, 모든 신규 워크로드는 IMDSv2가 기본 권장이 됐다.

## Security 도구 지형 — 탐지·보호·대응의 3계층

| 영역 | 도구 | 핵심 역할 |
|------|------|----------|
| **ID** | IAM·IAM Identity Center·STS·Cognito | 인증·인가·임시 자격증명·사용자 풀 |
| **탐지** | GuardDuty·Macie·Inspector·Security Hub·Detective | 위협 탐지·민감정보·취약점·통합·근본원인 |
| **인프라 보호** | SG·NACL·WAF·Shield·Network Firewall·Firewall Manager | 방화벽·DDoS·L7 보호·Org 일괄 관리 |
| **데이터 보호** | KMS·CloudHSM·Secrets Manager·ACM | 키 관리·HSM·비밀·인증서 |
| **사고 대응** | EventBridge·Lambda·SSM Incident Manager·Detective | 자동 격리·페이저·런북·조사 |
| **컴플라이언스** | Artifact·Audit Manager·Config | 증빙 문서·감사 증거·규칙 평가 |

탐지 도구의 역할 분담이 시험 단골이다. **GuardDuty**는 VPC Flow Logs·DNS·CloudTrail을 ML로 분석해 위협(비정상 API 호출, 암호화폐 채굴, 자격증명 탈취)을 탐지한다. **Macie**는 S3의 민감정보(PII, 신용카드)를 자동 분류한다. **Inspector**는 EC2·ECR·Lambda의 소프트웨어 취약점(CVE)을 스캔한다. **Security Hub**는 이 모든 결과를 표준 형식으로 통합·점수화한다. **Detective**는 탐지된 위협의 근본 원인을 그래프로 시각화한다.

> 🔍 **더 깊이**: **Secrets Manager의 자동 로테이션**은 시험에서 Parameter Store와 반드시 구분해야 한다. Secrets Manager는 비밀을 저장할 뿐 아니라 **로테이션 Lambda를 스케줄로 자동 호출**해 RDS·Redshift·DocumentDB의 비밀번호를 무중단으로 교체한다(네 단계: createSecret → setSecret → testSecret → finishSecret). 애플리케이션은 항상 "현재 버전(AWSCURRENT)"을 조회하므로 교체 순간에도 끊김이 없다. SSM Parameter Store(SecureString)는 비밀을 KMS로 암호화 저장하지만 **자동 로테이션을 네이티브로 지원하지 않는다**. 시험에서 "30일마다 자동으로 DB 비밀번호 교체 + 무중단"은 Secrets Manager의 직답이다.

## 멀티 계정 보안 — 위임 관리자와 일괄 통제

SAP 시험의 보안 시나리오는 거의 항상 **멀티 계정 Organization** 전제다. 핵심 패턴은 **위임 관리자(Delegated Administrator)**다 — 보안 도구(GuardDuty·Security Hub·Macie·Config)를 관리 계정이 아닌 전용 **Security 계정**에 위임해, 그 계정에서 Org 전체의 탐지 결과를 한곳에 모아 본다.

```
[Organizations 관리 계정]
   │ (위임)
   ▼
[전용 Security 계정 — Delegated Admin]
   ├── GuardDuty (전 계정 위협 통합)
   ├── Security Hub (전 계정 점수·통합)
   ├── Macie (전 계정 S3 민감정보)
   └── EventBridge → Lambda (자동 격리·대응)
```

> 🎯 **시나리오**: "한 Organization이 50개 계정을 운영한다. 어느 계정에서든 위협이 탐지되면 중앙 보안팀이 즉시 보고, 자동으로 해당 리소스를 격리하고 싶다. Pro 설계는?" — 답: **GuardDuty·Security Hub를 전용 Security 계정에 위임 관리자로 설정 → 전 계정 탐지 결과를 중앙 집계 → EventBridge 규칙이 위협 이벤트를 받아 Lambda/SSM Automation으로 자동 격리(SG 교체·인스턴스 격리)**. 각 계정이 따로 보안 도구를 보는 방식(분산)은 사각지대가 생기고 운영 부담이 크다. "중앙 집계 + 자동 대응"이 Pro 정답의 전형이다.

> 🔍 **더 깊이**: 멀티 계정 보안의 또 다른 축은 **SCP(Service Control Policy)**다. SCP는 Organization 차원에서 "그 계정의 IAM이 무엇을 허용하든 절대 넘을 수 없는 상한선(permission boundary)"을 친다 — 예방적(preventive) 통제다. 반면 Config·GuardDuty는 위반을 사후 탐지하는 탐지적(detective) 통제다. 둘의 역할 분담이 시험 단골이다: "특정 리전 사용 자체를 금지", "루트 사용자 액션 차단"처럼 **사전에 막아야** 하면 SCP, "위반이 일어나면 알림·교정"이면 Config Rule + 자동 remediation이다. 가장 강한 설계는 SCP로 큰 경계를 치고(예방), Config·GuardDuty로 나머지를 감시(탐지)하는 다층 방어다.

> ⚠️ **함정**: 추적성 3종을 정확히 구분해야 한다. **CloudTrail**은 "누가 어떤 API를 언제 호출했나"(행위 감사), **Config**는 "리소스의 구성이 어떻게 바뀌었나 + 규정 준수 평가"(상태·컴플라이언스), **CloudWatch Logs**는 "애플리케이션·시스템이 무엇을 로깅했나"다. 시험에서 "IAM 사용자가 어떤 API를 호출했는지"는 CloudTrail이지 Config가 아니다 — Config는 리소스 구성 변경을 추적하지 API 호출 자체를 기록하지 않는다. 반대로 "보안 그룹이 누구에 의해 어떤 상태로 바뀌었고 규정 위반인지"는 Config가 적합하다.

## 정리하며

Operational Excellence와 Security는 "수동을 코드·자동화로, 모든 행위를 추적 가능하게"라는 공통 철학을 공유한다. Operational Excellence는 GitOps·선언적 IaC·배포 전략(Blue/Green·Canary)·Systems Manager(Session·Patch·Automation)로 구현된다. Security는 책임 공유 모델의 경계 위에서 Zero Trust로 진화하며, 탐지(GuardDuty·Macie·Inspector·Security Hub·Detective)·데이터 보호(KMS·Secrets Manager)·사고 대응(EventBridge·Incident Manager)을 멀티 계정 위임 관리자로 중앙 통제한다.

SAP 시험 단골 매핑: (1) "SSH/RDP 없이 IAM으로 접속 + 세션 기록" → **SSM Session Manager**, (2) "30일 자동 비밀번호 교체 + 무중단" → **Secrets Manager 로테이션**(Parameter Store 아님), (3) "다단계 운영 워크플로 자동화" → **SSM Automation Document**(Run Document 아님), (4) "누가 API 호출했나" → **CloudTrail**, (5) "리소스 구성 변경·컴플라이언스" → **Config**, (6) "임의 인프라 생성 금지 + 셀프서비스" → **Service Catalog**, (7) "Org 전 계정 위협 중앙 집계 + 자동 격리" → **GuardDuty/Security Hub 위임 관리자 + EventBridge + Lambda**, (8) "배포 즉시 롤백" → **Blue/Green**. 다음 day는 Reliability와 Performance Efficiency를 분산 시스템 이론까지 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 관리자들이 production EC2에 디버깅을 위해 접속해야 하지만, SSH 포트(22)를 인터넷에 열거나 Bastion 호스트를 운영하고 싶지 않다. 또한 모든 접속 세션을 감사 로그로 남겨야 한다. 가장 적합한 솔루션은?

A) Bastion 호스트에 SSH 키 배포

B) SSM Session Manager로 IAM 권한 기반 접속, 세션을 CloudTrail·S3에 기록

C) Client VPN으로 VPC 접속 후 SSH

D) Direct Connect 전용선 구성

**정답: B**
해설: SSM Session Manager는 22 포트 개방이나 Bastion 없이 IAM 권한으로 셸을 열고, 모든 세션 로그를 CloudTrail·S3·CloudWatch Logs에 기록한다. 공격 표면이 0이고 감사가 자동이다. A(Bastion)는 22 포트와 SSH 키 관리 부담·공격 표면을 만든다. C(Client VPN)도 결국 SSH 포트가 필요하고 세션 기록이 자동이 아니다. D(Direct Connect)는 네트워크 연결 수단이지 접속·감사 솔루션이 아니다. 함정: "SSH 없이 + 세션 기록"은 Session Manager의 직답이다.

---

**문제 2.** 한 애플리케이션이 RDS를 사용하며, 보안 정책상 DB 비밀번호를 30일마다 자동으로 교체하되 애플리케이션 중단이 없어야 한다. 가장 적합한 솔루션은?

A) SSM Parameter Store(SecureString)에 비밀번호 저장

B) Secrets Manager에 비밀번호 저장 후 RDS 네이티브 통합으로 자동 로테이션 활성화

C) KMS로 비밀번호 암호화 후 S3에 저장

D) IAM 데이터베이스 인증으로 비밀번호 제거

**정답: B**
해설: Secrets Manager는 로테이션 Lambda를 스케줄로 자동 호출해 RDS 비밀번호를 무중단으로 교체하며(createSecret→setSecret→testSecret→finishSecret), 앱은 항상 AWSCURRENT 버전을 조회하므로 끊김이 없다. A(Parameter Store)는 비밀 저장은 되지만 자동 로테이션을 네이티브로 지원하지 않는다. C는 수동 관리로 자동 교체가 없다. D(IAM DB 인증)는 유효한 대안이나 "비밀번호 30일 자동 교체"라는 명시 요건에는 Secrets Manager가 직접 답이다. 함정: 자동 로테이션은 Parameter Store가 아니라 Secrets Manager다.

---

**문제 3.** 한 운영팀이 장애 발생 시 "EBS 스냅샷 생성 → AMI 빌드 → 새 인스턴스 교체 → 헬스 검증"의 여러 단계를 사람 개입 없이 자동 실행하는 런북을 만들고 싶다. Systems Manager의 어떤 기능이 적합한가?

A) Run Document(Command document)

B) Automation Document

C) Session Manager

D) Parameter Store

**정답: B**
해설: Automation Document는 여러 AWS API를 순서대로 엮는 다단계 워크플로(스냅샷→AMI→교체→검증)를 코드로 정의해 사고 대응·운영을 자동화한다. A(Run Document)는 EC2 안에서 단일 명령(셸 스크립트 등)을 실행하는 용도로 다단계 AWS API 오케스트레이션이 아니다. C는 셸 접속, D는 파라미터 저장이다. 함정: "여러 단계 워크플로 자동화"는 Automation Document, "인스턴스 내부 명령 실행"은 Run Document다.

---

**문제 4.** 2019년 Capital One 데이터 유출 사고의 근본 원인과 AWS의 대응으로 가장 정확한 것은?

A) AWS 데이터센터 물리 침입 → AWS가 펜스를 강화

B) SSRF로 EC2 메타데이터(v1)에서 IAM 자격증명 탈취 → IMDSv2(token 기반) 도입·권장

C) RDS 엔진 취약점 → AWS가 자동 패치

D) KMS 키 유출 → AWS가 키를 회전

**정답: B**
해설: 공격자는 잘못 구성된 WAF(고객 책임)를 통한 SSRF로 token 불필요한 메타데이터 서비스 v1에서 과도한 권한의 IAM 자격증명을 탈취해 S3를 읽었다. AWS 인프라(AWS 책임)는 뚫리지 않았다. 대응으로 token 기반 IMDSv2가 도입·권장됐고 GuardDuty에 탐지 패턴이 추가됐다. A·C·D는 사실과 다르며, 이 사고는 "고객 책임" 영역(WAF·IAM 구성)의 실패다. 함정: 책임 공유 모델에서 구성 실패는 고객 책임이며, 메타데이터 v1 → IMDSv2 전환이 핵심 교훈이다.

---

**문제 5.** 한 Organization이 50개 계정을 운영한다. 모든 계정의 위협 탐지(GuardDuty)와 보안 점수(Security Hub)를 중앙 보안팀이 한곳에서 보고, 위협 발생 시 자동으로 리소스를 격리하려 한다. 가장 적합한 설계는?

A) 각 멤버 계정이 개별적으로 GuardDuty·Security Hub를 보고 수동 대응

B) 전용 Security 계정을 GuardDuty·Security Hub 위임 관리자로 설정해 전 계정 결과를 중앙 집계하고, EventBridge + Lambda/SSM Automation으로 자동 격리

C) 관리 계정에서만 GuardDuty를 켜고 멤버 계정은 비활성

D) CloudTrail 로그를 수동으로 검토

**정답: B**
해설: 멀티 계정 보안의 표준은 전용 Security 계정을 위임 관리자로 지정해 GuardDuty·Security Hub·Macie 결과를 중앙 집계하고, EventBridge 규칙이 위협 이벤트를 받아 Lambda/SSM Automation으로 자동 격리(SG 교체·인스턴스 격리)하는 것이다. A는 사각지대·운영 부담이 크고, C는 멤버 계정 위협을 놓치며, D는 자동 대응이 없다. 함정: "중앙 집계 + 자동 대응"이 멀티 계정 보안 Pro 정답의 전형이며, 각 계정 분산 관리는 오답이다.

---

**문제 6.** 한 회사가 새 애플리케이션 버전을 배포할 때 위험을 최소화하고, 문제가 발견되면 즉시 이전 버전으로 전체 롤백하고 싶다. 두 환경을 동시에 운영할 비용 여력은 있다. 가장 적합한 배포 전략은?

A) Rolling 배포

B) Blue/Green 배포 (CodeDeploy)

C) In-place 단일 배포

D) 수동 콘솔 배포

**정답: B**
해설: Blue/Green은 새 환경(Green)을 통째로 띄우고 트래픽을 전환하며, 문제 시 Blue로 즉시 전체 롤백한다(가역성 최대, 두 환경 동시 운영 비용 발생). "위험 최소화 + 즉시 전체 롤백 + 비용 여력 있음" 요건에 정확히 맞는다. A(Rolling)는 순차 교체라 롤백이 느리다. C·D는 가역성·안전성이 낮다. 함정: "즉시 전체 롤백"은 Blue/Green, "소수 트래픽 점진 검증"은 Canary로 갈린다.

---

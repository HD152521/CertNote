# Day 43 - Config와 Systems Manager: 원하는 상태를 어떻게 강제하나

클라우드 인프라가 수백 개의 리소스로 커지면, "지금 우리 환경이 안전한 상태인가?"라는 질문에 사람이 직접 답하는 게 불가능해진다. 어제까지 모든 S3 버킷이 퍼블릭 액세스 차단(BPA)이었는데, 누군가 오늘 한 버킷을 공개로 바꿨다면? 어제까지 모든 EBS 볼륨이 암호화됐는데, 새로 만든 볼륨 하나가 평문이라면? 이런 "원하는 상태(desired state)에서 벗어나는 표류(drift)"는 시간이 지날수록 누적되고, 그 한 틈이 보안 사고의 입구가 된다. 핵심 문제는 두 가지다 — 첫째, 표류를 어떻게 **지속적으로 감지**할 것인가. 둘째, 표류를 발견했을 때 어떻게 **자동으로 교정**할 것인가.

AWS는 이 두 문제를 두 서비스로 나눠 푼다. **AWS Config**(2014)는 "리소스의 구성을 계속 기록하고, 원하는 상태(Rule)와 비교해 위반을 감지"하는 거버넌스 도구다. **Systems Manager(SSM)**는 "인스턴스와 리소스를 중앙에서 실제로 조작·교정"하는 운영 도구다. Config가 "무엇이 잘못됐는지"를 알려주면 SSM이 "그것을 고친다." 이 글은 두 서비스의 기능을 나열하는 대신, "desired state 모델이 왜 인프라 관리의 핵심 패러다임인지", "Session Manager가 어떻게 SSH 키와 베스천 호스트를 없앴는지", "Config + SSM 자동 교정이 어떤 제어 루프를 만드는지"를 따라가며 SAA 운영 도메인의 본질을 짚는다.

## Desired State: 선언적 인프라 관리라는 패러다임

AWS Config의 Rule을 이해하려면 먼저 "desired state(원하는 상태)" 모델을 알아야 한다. 이건 Config만의 개념이 아니라 현대 인프라 관리 전체를 관통하는 패러다임이다.

전통적인 명령형(imperative) 관리는 "이 단계를 실행하라"고 지시한다 — "버킷을 만들어라, BPA를 켜라, 암호화를 설정하라." 문제는 시간이 지나면서 상태가 바뀌는데 명령형 스크립트는 "이미 한 일"을 기억하지 못한다는 것이다. 선언형(declarative) 관리는 다르다 — "최종 상태가 이래야 한다"고 선언하면, 시스템이 현재 상태와 원하는 상태의 차이(diff)를 계산해 그 차이만큼만 조정한다. Config Rule이 정확히 이 모델이다. "모든 S3 버킷은 BPA가 켜져 있어야 한다"가 desired state이고, Config는 실제 버킷들을 이 규칙으로 평가해 위반(NON_COMPLIANT)을 찾아낸다.

> 💡 **관련 이론**: Desired state 모델은 Kubernetes의 심장이기도 하다. K8s에서 "이 Deployment는 replica가 3개여야 한다"고 선언하면, 컨트롤러가 끊임없이 현재 상태(실제 떠 있는 Pod 수)와 원하는 상태(3개)를 비교해 차이를 메운다 — 이걸 **reconciliation loop(조정 루프)** 라고 한다. Terraform의 `plan`/`apply`, Git Ops의 "Git이 진실의 원천"도 모두 같은 발상이다. Config + 자동 교정은 AWS 리소스에 대한 reconciliation loop를 만드는 것이고, "drift를 감지하고 desired state로 되돌린다"는 점에서 K8s 컨트롤러와 철학이 같다.

Config Rule은 세 종류다. **Managed Rules**는 AWS가 미리 만든 수백 개의 규칙(s3-bucket-public-read-prohibited, encrypted-volumes 등)이고, **Custom Rules**는 Lambda나 Guard(정책 언어)로 직접 작성한다. **Conformance Pack**은 여러 규칙을 규제 프레임워크(PCI DSS, HIPAA, NIST 800-53) 단위로 묶은 템플릿이라, "PCI 준수에 필요한 규칙 50개를 한 번에 배포"할 수 있다. 그리고 **Aggregator**는 멀티 계정·멀티 리전의 Config 데이터를 한 계정에서 통합 조회하게 해, 조직 전체의 컴플라이언스를 한눈에 본다.

> ⚠️ **함정**: Config는 "구성 항목(configuration item)" 단위로 과금되고, 리소스 변경이 잦은 큰 환경에서는 비용이 빠르게 올라간다. 그래서 "모든 리소스 타입을 다 기록"하는 대신 중요한 타입만 선택 기록하거나, 변경이 폭주하는 리소스를 제외하는 튜닝이 필요하다. 시험에서 "큰 환경의 Config 비용 절감"이 나오면 "기록 대상 리소스 타입 한정"이 정답 방향이다.

## CloudTrail과 Config의 짝: "누가 했나" + "지금 어떤가"

Day 2에서 CloudTrail이 "누가 무엇을 했는가"를 답한다고 했다. Config는 그 짝인 "그래서 지금 어떤 상태이고 규칙을 지키는가"를 답한다. 이 둘은 사고 분석에서 함께 쓰인다.

예를 들어 "어떤 버킷이 공개로 바뀌었다"는 사고가 있다면, Config는 "현재 이 버킷이 공개이고 'public-read 금지' 규칙을 위반한다"는 상태와 그 변경의 타임라인(언제부터 공개였는지)을 보여준다. 그런데 "누가 그 변경을 했는지"는 Config가 직접 답하지 않는다 — Config의 구성 항목 타임라인에 연결된 CloudTrail 이벤트를 따라가야 행위자가 나온다. 즉 Config는 "상태의 역사", CloudTrail은 "행위의 기록"이고, Config 콘솔에서 구성 변경을 클릭하면 그 변경을 일으킨 CloudTrail 이벤트로 연결되는 식으로 통합된다.

> 🔍 **더 깊이**: Config의 구성 항목(CI)은 리소스의 시점별 스냅샷이다. 리소스가 바뀔 때마다 새 CI가 생기고, 이게 "구성 타임라인"을 이룬다. 그래서 "이 SG가 3개월 전에는 어떤 규칙을 가졌는지"를 시점 단위로 되감아 볼 수 있다 — 마치 git의 커밋 히스토리처럼. 이 시계열 구성 기록이 CloudTrail의 행위 기록과 결합하면 "언제 무엇이 어떻게 바뀌었고 누가 바꿨는지"의 완전한 그림이 나온다. 두 서비스를 따로 보면 반쪽이지만 함께 보면 포렌식이 완성된다.

## Systems Manager: 흩어진 운영 도구를 하나의 우산으로

Systems Manager는 단일 기능이 아니라 운영에 필요한 여러 도구를 묶은 우산 서비스다. Session Manager, Run Command, Patch Manager, State Manager, Maintenance Windows, Parameter Store, Inventory, Automation 등이 한 콘솔 아래 있다. 이 묶음의 공통 기반은 **SSM Agent**다 — 인스턴스에 설치된 이 에이전트가 SSM 서비스와 통신하며 명령을 받아 실행한다. Amazon Linux·Ubuntu·Windows에는 기본 사전 설치되어 있고, 인스턴스에는 `AmazonSSMManagedInstanceCore` IAM Role이 필요하다.

이 묶음을 관통하는 사상은 "인프라를 직접 만지지 말고 API로 조작하라"이다. SSH로 서버에 들어가 명령을 치는 전통적 운영은 추적이 안 되고(누가 무엇을 쳤는지 기록 없음), 확장이 안 되며(100대를 한 대씩 들어가야), 인적 실수에 취약하다. SSM은 이 모든 조작을 API 호출로 바꿔 추적·확장·자동화 가능하게 만든다.

## Session Manager: SSH 키와 베스천 호스트를 없앤 발상

SSM에서 시험에 가장 자주 나오는 게 **Session Manager**다. SSH 키 없이, 22번 포트 개방 없이, 베스천 호스트 없이 인스턴스 셸에 접속하는 도구다. 왜 이게 중요한지는 전통적 SSH 접속의 보안 부담을 보면 명확하다.

전통적으로 프라이빗 서브넷의 EC2에 접속하려면 ① 퍼블릭 서브넷에 베스천(점프) 호스트를 두고 ② SSH 키 쌍을 관리·배포하고 ③ 베스천의 22번 포트를 운영자 IP에 열고 ④ 베스천에서 다시 내부로 SSH 점프해야 했다. 여기서 모든 단계가 공격 표면이다 — SSH 키가 유출되면? 베스천이 침해되면? 22번 포트로 무차별 대입 공격이 들어오면? Session Manager는 이 구조를 완전히 뒤집는다. 인스턴스의 SSM Agent가 **아웃바운드로** SSM 엔드포인트에 연결을 맺고, 운영자는 그 채널을 통해 셸을 받는다. 즉 인바운드 포트를 하나도 열지 않고(22번 포트 닫힌 채), 키도 없이, IAM 권한만으로 접속한다. 모든 세션은 CloudTrail에 기록되고, 세션 중 친 명령까지 S3/CloudWatch Logs로 로깅할 수 있다.

> 💡 **관련 이론**: Session Manager의 "아웃바운드 연결로 인바운드 채널을 만든다"는 발상은 reverse tunnel(역방향 터널) 패턴이다. 방화벽 안쪽 머신이 바깥으로 연결을 맺으면, 그 연결을 통해 바깥에서 안쪽으로 트래픽을 흘릴 수 있다 — 인바운드 규칙을 열지 않고도. SSH의 reverse tunnel, ngrok, Cloudflare Tunnel이 모두 같은 원리다. 이게 "인바운드 포트 0개"라는 강력한 보안 속성을 만든다. 공격자는 열린 포트가 없으니 직접 두드릴 표면 자체가 없다.

> ⚠️ **함정**: "프라이빗 서브넷 EC2에 SSH 키 없이 안전하게 접속"이라는 시나리오의 정답은 거의 항상 Session Manager다. 인터넷이 완전히 차단된 프라이빗 서브넷이라도 SSM/SSM Messages/EC2 Messages용 **VPC Interface Endpoint**를 두면 NAT 게이트웨이나 IGW 없이도 작동한다 — 트래픽이 AWS 내부 네트워크로만 흐른다. 시험에서 "인터넷 게이트웨이 없이 프라이빗 인스턴스 관리"가 나오면 Session Manager + VPC Endpoint가 정답이다.

> 📚 **사례**: SSH 키 기반 접속은 운영 규모가 커질수록 "키 관리 지옥"을 만든다. 누가 어떤 키를 가졌는지, 퇴사자 키를 회수했는지, 키가 어느 노트북에 복사됐는지 추적 불가능해진다. 많은 조직이 보안 감사에서 "수백 개의 미회수 SSH 키"를 발견하고, 이를 Session Manager로 전환해 키 자체를 없애고 IAM 권한과 SSO로 접근을 통합한다. 접근 권한이 IAM 한 곳에 모이니 퇴사자 권한 회수가 즉각적이고, 모든 접속이 CloudTrail에 남아 감사가 완전해진다.

## Patch Manager와 Maintenance Windows: 100대를 안전하게 패치하기

OS 보안 패치는 미루면 취약점에 노출되고, 한꺼번에 적용하면 전체 서비스가 동시에 재부팅돼 장애가 난다. **Patch Manager**는 이 긴장을 푼다. **Patch Baseline**으로 "어떤 분류의 패치(보안/중요)를, 출시 며칠 후 자동 승인할지"를 정의하고, **Patch Group**으로 인스턴스를 태그 단위로 묶는다. 그리고 **Maintenance Windows**로 "점검은 매주 일요일 새벽 2~4시에만"이라는 시간대를 정의해 그 안에서만 패치가 실행되게 한다.

핵심은 **점진적 롤아웃**이다. Maintenance Windows에서 동시성(concurrency)과 오류 임계값(error threshold)을 설정하면, "한 번에 25%씩 패치하고, 오류율이 10%를 넘으면 즉시 중단"처럼 안전하게 굴릴 수 있다. 이렇게 하면 패치가 문제를 일으켜도 전체가 아닌 일부만 영향받고, 나머지는 보호된다. 이건 배포 안전성의 표준 패턴(카나리/롤링)을 패치에 적용한 것이다.

> 🔍 **더 깊이**: Patch Manager의 "자동 승인 지연(auto-approval delay)"은 영리한 위험 분산이다. 패치가 나오자마자 적용하면 그 패치 자체에 버그가 있을 위험이 있고(공급망 사고), 너무 늦게 적용하면 취약점에 노출된다. "출시 7일 후 자동 승인" 같은 설정은 그 7일 사이에 다른 조직들이 먼저 패치를 깔고 문제를 발견하는 "집단 검증" 시간을 버는 동시에, 무한정 미루지 않게 강제한다. 보안과 안정성 사이의 균형점을 시간으로 표현한 것이다.

## Config + SSM Automation: 감지에서 교정까지의 제어 루프

Config와 SSM이 결합하면 완전한 자동 교정(auto-remediation) 루프가 완성된다. 흐름은 이렇다.

```
[ Config + SSM 자동 교정 제어 루프 ]

  리소스 변경 (예: 누군가 EBS를 평문으로 생성)
      │ CloudTrail이 행위 기록
      ▼
  Config Recording → Config Rule 평가
      │ "encrypted-volumes 위반!" (NON_COMPLIANT)
      ▼
  EventBridge rule (또는 Config Remediation)
      │
      ▼
  SSM Automation Runbook 실행
      │ (예: 볼륨 격리, 스냅샷 후 암호화 재생성, SecOps 알림)
      ▼
  리소스가 desired state로 복귀 → Config 재평가 → COMPLIANT
```

이 루프의 우아함은 **사람이 개입하지 않아도 환경이 스스로 컴플라이언스 상태로 수렴**한다는 것이다. 누군가 실수로 규칙을 위반하는 리소스를 만들어도, 몇 분 안에 Config가 감지하고 SSM Automation이 교정한다. SSM Automation의 실행 단위인 **Document(Runbook)**는 미리 정의된 작업 절차로, AWS가 제공하는 수백 개의 표준 Runbook(인스턴스 재시작, 스냅샷 생성, 보안 그룹 규칙 회수 등)과 직접 만든 커스텀 Runbook을 쓸 수 있다.

> 💡 **관련 이론**: 이 "감지 → 평가 → 교정 → 재감지"는 제어 이론의 **피드백 제어 루프(closed-loop control)** 그 자체다. 온도조절기가 현재 온도를 측정하고(감지), 목표와 비교하고(평가), 히터를 켜고(교정), 다시 측정하는(재감지) 것과 구조가 같다. 인프라를 "한 번 설정하고 잊는 정적인 것"이 아니라 "끊임없이 desired state로 당겨지는 동적 시스템"으로 보는 관점이고, 현대 클라우드 운영(SRE, GitOps, K8s)이 공유하는 핵심 사상이다.

> 📚 **사례**: 자동 교정에는 신중함이 필요하다. "위반을 발견하면 즉시 리소스를 삭제"하는 너무 공격적인 Remediation은 정당한 변경까지 되돌려 운영을 마비시킬 수 있다. 한 조직은 "퍼블릭 SG를 발견하면 자동으로 규칙 회수"를 걸었다가, 정당한 마이그레이션 작업 중인 SG가 계속 회수되어 작업이 무한 반복 실패하는 사고를 겪었다. 그래서 성숙한 패턴은 "치명적 위반은 자동 교정 + 격리, 애매한 위반은 알림만 + 사람 승인 후 교정"으로 등급을 나눈다. 자동화의 힘이 클수록 그 트리거 조건을 정밀하게 설계해야 한다.

## Parameter Store, Inventory, AppConfig: 나머지 운영 도구들

**Parameter Store**(SSM의 일부)는 구성 값과 시크릿을 계층적 경로(`/app/prod/db/password`)로 저장한다. 평문 String, StringList, 그리고 KMS로 암호화된 SecureString을 지원한다. Day(Week 8)의 Secrets Manager와 비교되는데 — Parameter Store는 무료 티어(Standard)가 있고 자동 회전이 없으며, Secrets Manager는 유료지만 RDS 등과 통합된 자동 회전을 제공한다. "비용이 중요하고 회전이 불필요"하면 Parameter Store, "자동 회전이 필요"하면 Secrets Manager가 정답 방향이다.

**Inventory**는 각 인스턴스의 설치된 패키지·실행 중인 서비스·구성 정보를 수집해 "우리 함대에 어떤 소프트웨어가 깔려 있나"를 가시화한다. 취약점이 발견된 라이브러리가 어느 인스턴스에 있는지 한 번에 찾는 데 쓴다. **AppConfig**는 애플리케이션의 동적 구성(기능 플래그, 임계값)을 코드 재배포 없이 안전하게 배포한다 — 검증·점진적 롤아웃·자동 롤백을 내장해, 잘못된 구성이 전체에 퍼지기 전에 되돌린다.

> 🔍 **더 깊이**: Parameter Store와 Secrets Manager의 경계는 모호해 보이지만 설계 의도가 다르다. Parameter Store는 "구성 관리" 도구로 시작해 시크릿도 다룰 수 있게 확장됐고, Secrets Manager는 처음부터 "시크릿 라이프사이클(생성·회전·폐기) 관리"에 특화됐다. 그래서 Secrets Manager는 RDS·Redshift·DocumentDB의 자격 증명을 자동으로 회전시키는 Lambda를 내장하는데, 이건 Parameter Store에 없다. 시험에서 "DB 비밀번호 자동 회전"이 보이면 거의 항상 Secrets Manager가 정답이다.

## CLI로 직접 만져보기

```bash
# Config 레코더 + 전송 채널 설정 후 시작
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::111:role/Config

aws configservice put-delivery-channel \
  --delivery-channel name=default,s3BucketName=config-logs-bucket

aws configservice start-configuration-recorder \
  --configuration-recorder-name default

# 관리형 Rule: 암호화 안 된 EBS 볼륨 탐지
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName":"encrypted-volumes",
  "Source":{"Owner":"AWS","SourceIdentifier":"ENCRYPTED_VOLUMES"}
}'

# Session Manager로 SSH 키 없이 접속 (22번 포트 불필요)
aws ssm start-session --target i-1234567890abcdef0

# Run Command로 다수 인스턴스에 명령 일괄 실행
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets "Key=tag:Environment,Values=production" \
  --parameters 'commands=["yum update -y --security"]' \
  --max-concurrency "25%" --max-errors "10%"

# Patch Baseline (보안 패치, 출시 7일 후 자동 승인)
aws ssm create-patch-baseline --name "saa-baseline" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules 'PatchRules=[{
    "PatchFilterGroup":{"PatchFilters":[{"Key":"CLASSIFICATION","Values":["Security"]}]},
    "ApproveAfterDays":7,
    "ComplianceLevel":"CRITICAL"
  }]'

# Parameter Store에 SecureString 시크릿 저장 (KMS 암호화)
aws ssm put-parameter --name "/app/prod/db/password" \
  --value "s3cr3t" --type SecureString --key-id alias/saa-app

# Config Rule 위반 시 SSM Automation으로 자동 교정 연결
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName":"encrypted-volumes",
    "TargetType":"SSM_DOCUMENT",
    "TargetId":"AWS-CreateSnapshot",
    "Automatic":true
  }]'
```

## 정리하며

Config와 Systems Manager는 "원하는 상태를 감지하고 강제한다"는 거버넌스·운영의 짝이다. 핵심은 다섯 가지로 압축된다. ① Config는 desired state(Rule) 모델로 구성 표류를 감지하고, Managed/Custom Rule·Conformance Pack(규제 묶음)·Aggregator(멀티 계정 통합)로 확장한다 — K8s reconciliation loop와 같은 철학이다. ② Config(지금 상태/규칙)는 CloudTrail(누가 했나)과 짝을 이뤄 구성 타임라인과 행위 기록을 결합해 완전한 포렌식을 만든다. ③ Session Manager는 reverse tunnel 발상으로 SSH 키·베스천·인바운드 포트를 모두 없애고 IAM 권한만으로 접속하며, VPC Endpoint로 인터넷 없는 프라이빗 인스턴스도 관리한다. ④ Patch Manager + Maintenance Windows는 점진적 롤아웃·자동 승인 지연으로 100대를 안전하게 패치한다. ⑤ Config + SSM Automation은 감지→평가→교정→재감지의 피드백 제어 루프로 환경을 스스로 컴플라이언스로 수렴시킨다.

다음 글에서는 메트릭·로그·감사를 넘어 "한 요청이 여러 서비스를 지나는 흐름"을 추적하는 분산 트레이싱(X-Ray)과, AWS가 능동적으로 주는 모범 사례 권고(Trusted Advisor)·인프라 상태 알림(Health Dashboard)을 본다. 관찰성의 세 번째 기둥인 트레이스가 어떻게 마이크로서비스의 병목을 드러내는지가 핵심이다.

---

## 📝 연습 문제

**문제 1.** 한 조직이 "모든 S3 버킷이 항상 BPA(퍼블릭 액세스 차단) 활성 상태를 유지하는지 지속적으로 점검"하려 한다. 가장 적합한 서비스는?

A) CloudTrail
B) AWS Config Rule
C) Amazon Inspector
D) Amazon Macie

**정답: B**

해설: "구성이 원하는 상태(BPA 활성)를 유지하는지 지속 점검"은 Config Rule의 desired state 평가 영역이다. Managed Rule(s3-account-level-public-access-blocks 등)로 위반을 감지한다. CloudTrail(A)은 누가 BPA를 껐는지 행위를 답하고, Inspector(C)는 취약점 스캔, Macie(D)는 민감 데이터 탐지로 구성 상태 평가와 다르다.

---

**문제 2.** 프라이빗 서브넷의 EC2 100대에 SSH 키 없이, 22번 포트를 열지 않고, 베스천 호스트 없이 셸 접속과 명령 실행을 하려 한다. 인터넷 게이트웨이도 없다. 가장 적합한 솔루션은?

A) 베스천 호스트 + SSH 키 배포
B) Session Manager + SSM/EC2 Messages VPC Interface Endpoint
C) VPN으로 직접 SSH
D) Public IP 부여 후 SG에 22번 개방

**정답: B**

해설: Session Manager는 인스턴스의 SSM Agent가 아웃바운드로 연결을 맺어 인바운드 포트 0개로 셸을 제공한다. 인터넷이 없는 프라이빗 서브넷에서는 SSM·SSMMessages·EC2Messages용 VPC Interface Endpoint를 두면 NAT/IGW 없이도 AWS 내부 네트워크로만 작동한다. 모든 접속은 CloudTrail에 기록된다. A·C·D는 모두 키 관리나 포트 개방의 공격 표면을 남긴다.

---

**문제 3.** 100대 EC2에 OS 보안 패치를 주말 새벽 점검 시간대에만, 한 번에 25%씩 점진적으로 적용하며 오류율이 높으면 중단하려 한다. 가장 적합한 조합은?

A) UserData 스크립트
B) Patch Manager + Maintenance Windows(동시성·오류 임계값 설정)
C) Run Command 단독으로 전체 동시 실행
D) ASG Instance Refresh

**정답: B**

해설: Patch Manager로 패치 정책(Baseline)을 정의하고 Maintenance Windows로 점검 시간대와 동시성(25%)·오류 임계값을 설정하면 안전한 점진적 롤아웃이 된다. C는 전체 동시 실행이라 장애 시 전부 영향받고, A는 부팅 시 1회용이며, D는 AMI 교체용이지 OS 패치 자동화 도구가 아니다.

---

**문제 4.** EC2가 Systems Manager(Session Manager, Run Command 등)로 관리되려면 무엇이 필요한가?

A) Public IP와 SG 22번 포트 개방
B) AmazonSSMManagedInstanceCore IAM Role + SSM Agent
C) NACL에서 22번 허용
D) 인터넷 게이트웨이 연결

**정답: B**

해설: SSM 관리의 기반은 SSM Agent(주요 OS에 기본 설치)와 인스턴스가 SSM과 통신할 권한을 주는 AmazonSSMManagedInstanceCore IAM Role이다. Session Manager는 아웃바운드 연결을 쓰므로 Public IP·22번 포트·IGW가 필요 없다. A·C·D는 모두 SSM이 없애려는 인바운드 접근 모델의 잔재다.

---

**문제 5.** Config Rule이 "암호화 안 된 EBS 볼륨"을 위반으로 감지했을 때, 사람 개입 없이 자동으로 교정 작업(스냅샷·격리·알림)을 실행하려 한다. 가장 적합한 패턴은?

A) Lambda를 폴링 방식으로 돌려 직접 검사
B) Config Remediation(또는 EventBridge) → SSM Automation Runbook
C) Step Functions만으로 처리
D) Inspector로 스캔

**정답: B**

해설: Config Rule 위반은 Config Remediation 또는 EventBridge rule을 통해 SSM Automation Runbook으로 연결되어 자동 교정된다. 이게 감지→평가→교정의 피드백 제어 루프를 만든다. A는 비효율적 폴링이고, C는 오케스트레이션 도구지 Config 통합 표준이 아니며, D는 취약점 스캔으로 교정 실행과 다르다.

---

**문제 6.** 한 팀이 멀티 계정·멀티 리전 환경에서 "조직 전체의 컴플라이언스 상태(어느 계정의 어떤 리소스가 규칙을 위반하는지)"를 한 계정에서 통합 조회하려 한다. 가장 적합한 기능은?

A) 각 계정 Config 콘솔을 따로 확인
B) Config Aggregator
C) CloudTrail Organization Trail
D) Trusted Advisor

**정답: B**

해설: Config Aggregator는 멀티 계정·멀티 리전의 Config 데이터를 한 계정으로 모아 통합 컴플라이언스 뷰를 제공한다(계정 간 권한 부여 필요). CloudTrail Organization Trail(C)은 API 감사 통합이지 구성 컴플라이언스 통합이 아니고, Trusted Advisor(D)는 모범 사례 권고로 Config 규칙 통합과 다르다.

---

**문제 7.** 한 애플리케이션이 DB 비밀번호를 저장하면서 정기적인 자동 회전이 필요하다. 비용보다 운영 자동화가 우선이다. Parameter Store와 Secrets Manager 중 무엇이 적합한가?

A) Parameter Store SecureString (자동 회전 내장)
B) Secrets Manager (RDS 통합 자동 회전)
C) 둘 다 동일하다
D) S3에 KMS 암호화 저장

**정답: B**

해설: Secrets Manager는 처음부터 시크릿 라이프사이클에 특화되어 RDS·Redshift·DocumentDB 자격 증명의 자동 회전을 내장한다. Parameter Store는 무료 티어가 있고 SecureString을 지원하지만 자동 회전 기능이 없다. "자동 회전 필요"가 핵심 요구이므로 Secrets Manager가 정답이다. A는 자동 회전을 잘못 전제했고, D는 회전·통합이 없다.

---

해설 보강: Config와 SSM은 SAA 운영·거버넌스 도메인의 중심이고, 시험은 "Config(상태/규칙) vs CloudTrail(행위)", "Session Manager의 키·포트 없는 접속", "Patch Manager + Maintenance Window 조합", "Config + SSM Automation 자동 교정"을 반복해서 묻는다. desired state 모델과 피드백 제어 루프라는 큰 그림을 이해하면 개별 기능이 왜 그렇게 설계됐는지가 한 줄로 꿰어진다.

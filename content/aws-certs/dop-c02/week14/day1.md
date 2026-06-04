# Day 1 - GuardDuty와 자동 격리: 위협 탐지의 신호 처리·통계·자동 대응 원리

보안 운영을 오래 들여다보면 결국 한 가지 긴장으로 수렴한다. "공격은 정상 트래픽 사이에 숨어 들어오는데, 어떻게 사람의 개입 없이 그 한 줌의 악성 신호를 골라내고, 골라낸 즉시 손을 쓸 것인가." 이 질문이 탐지(detection)와 대응(response)이라는 두 축으로 갈라지고, AWS에서 그 첫 축을 떠받치는 서비스가 GuardDuty다. 콘솔에서 보면 GuardDuty는 그냥 "켜기 버튼 하나로 동작하는 관리형 위협 탐지"처럼 보이지만, 그 밑에는 1980년대 침입 탐지 연구부터 쌓여 온 신호 처리 — 시그니처 기반 탐지, 이상 탐지(anomaly detection), 위협 인텔리전스, 행동 분석 — 이 그대로 깔려 있다. 오늘은 이 "켜기 버튼"이 내부에서 어떤 데이터를 어떻게 읽어 위협을 판정하는지, 탐지된 Finding을 EventBridge와 SSM Automation으로 어떻게 사람 없이 격리까지 끌고 가는지, 그리고 그 자동화가 어디서 위험해지는지를 판다.

DOP 시험에서 GuardDuty는 "위협 탐지 + 자동 대응"의 토대로, "탐지된 침해 인스턴스를 사람 개입 없이 30초 내 격리하려면", "멀티 계정 전체에 탐지를 일괄 적용하려면", "false positive로 운영팀이 알림 피로에 빠졌을 때 noise를 줄이려면" 같은 시나리오로 반복 등장한다. 각 선택지가 데이터 소스·EventBridge 필터·SSM Runbook·Organizations 위임 중 무엇을 건드리는지 읽어내면 답이 보인다.

## 침입 탐지는 왜 어려운가 — 시그니처와 이상 탐지 사이의 근본 긴장

위협 탐지의 역사는 1980년 제임스 앤더슨(James P. Anderson)의 보고서 *"Computer Security Threat Monitoring and Surveillance"*에서 시작한다. 이 보고서가 "감사 로그를 분석해 비정상 행동을 찾아낸다"는 발상을 처음 제시했고, 1986~87년 도로시 데닝(Dorothy Denning)의 IDES(Intrusion Detection Expert System) 모델이 이를 통계적 프레임워크로 정식화했다. 여기서 침입 탐지의 두 갈래가 갈린다.

**시그니처 기반 탐지(signature-based / misuse detection)**는 "알려진 악성 패턴"의 목록을 들고 트래픽과 대조한다. 안티바이러스, Snort 룰, 알려진 C2(Command & Control) 서버 IP 차단이 이 방식이다. 정확도(낮은 false positive)는 높지만, **목록에 없는 새 공격(zero-day)은 못 잡는다**. **이상 탐지(anomaly-based detection)**는 "정상이 무엇인지"를 통계적으로 학습한 뒤, 그 분포에서 벗어나는 것을 의심한다. 새 공격도 잡을 수 있지만, "정상의 정의"가 흔들리면 false positive가 폭발한다.

GuardDuty는 이 둘을 섞는다. 위협 인텔리전스 피드(알려진 악성 IP·도메인)로 시그니처 탐지를 하고, CloudTrail·VPC Flow·DNS 로그에 머신러닝과 통계 모델을 돌려 이상 탐지를 한다. "이 계정이 한 번도 쓴 적 없는 region에서 갑자기 IAM 사용자를 대량 생성" 같은 판정은 순수 시그니처로는 불가능하고, 행동 베이스라인이 있어야 가능하다.

> 💡 **관련 이론**: 이상 탐지의 수학적 토대는 **통계적 가설 검정**과 **베이즈 추론**이다. 데닝의 IDES는 각 주체(사용자·프로세스)의 행동을 평균과 분산으로 모델링하고, 관측값이 기대 분포에서 몇 표준편차(σ) 벗어났는지로 이상도를 측정했다. 현대 GuardDuty는 여기에 더 정교한 모델을 쓰지만 원리는 같다 — "이 행동의 사전 확률(prior)은 낮은데, 관측됐다(posterior 급등)면 의심하라." 이 접근의 근본 한계가 **기저율의 오류(base rate fallacy)**다. 침해가 극히 드물면(예: 100만 이벤트당 1건), 탐지기의 정확도가 99%여도 알람의 대다수가 false positive가 된다. GuardDuty의 Severity 점수와 Suppression Rule이 존재하는 이유가 바로 이 기저율 문제 — "탐지는 쉽고, 알람 피로를 안 만들면서 탐지하는 게 어렵다"는 — 를 다루기 위해서다.

> 🔍 **더 깊이**: GuardDuty가 "에이전트 없이(agentless)" 동작하는 것이 설계의 핵심이다. 전통적 호스트 IDS(HIDS, 예: OSSEC)는 각 서버에 에이전트를 깔아 로그·파일 무결성을 감시한다. GuardDuty는 에이전트를 깔지 않고 **AWS가 이미 수집하는 데이터 평면(data plane) 로그**를 읽는다 — CloudTrail은 API 호출을, VPC Flow Logs는 네트워크 흐름을, Route 53 Resolver는 DNS 쿼리를 이미 기록한다. GuardDuty는 이 로그들의 **복제 스트림을 내부적으로 직접 받아** 분석하므로, 사용자가 이 로그들을 따로 켜거나 저장할 필요조차 없다(VPC Flow Logs를 활성화하지 않아도 GuardDuty는 흐름을 본다). 이것이 "켜기 버튼 하나"의 정체다 — 새 데이터 수집 인프라를 까는 게 아니라, 이미 흐르는 로그에 분석 엔진을 붙이는 것이다. 예외는 EKS/ECS Runtime Monitoring과 EBS Malware Protection으로, 이들은 경량 에이전트나 스냅샷 스캔을 추가로 쓴다.

## GuardDuty 데이터 소스 — 무엇을 읽어 무엇을 판정하는가

GuardDuty의 탐지 능력은 결국 "어떤 로그를 보느냐"에서 나온다. 데이터 소스별로 잡아내는 위협의 종류가 다르다.

| 데이터 소스 | 읽는 것 | 대표 탐지 |
|------------|---------|-----------|
| **CloudTrail 관리 이벤트** | 모든 API 호출 | Root 사용, 비정상 region, IAM 권한 상승 |
| **CloudTrail S3 Data Events** | S3 객체 수준 액세스 | 비정상 대량 다운로드, 권한 없는 접근 |
| **VPC Flow Logs** | 네트워크 5-튜플 흐름 | 마이닝 풀 통신, C2 채널, 포트 스캔 |
| **Route 53 DNS Logs** | DNS 쿼리 | 알려진 악성 도메인, DGA, DNS 터널링 |
| **EKS Audit Logs** | K8s API 서버 호출 | 권한 상승, 익명 접근, 컨테이너 탈출 |
| **EBS Malware Protection** | EBS 볼륨 스냅샷 스캔 | 멀웨어 파일, 트로이목마 |
| **Lambda Network Activity** | Lambda VPC 흐름 | 함수의 비정상 외부 통신 |
| **RDS Login Activity** | DB 인증 시도 | 무차별 대입, 비정상 로그인 |
| **Runtime Monitoring** | EKS/ECS/EC2 런타임 행위 | 프로세스 실행, 파일 접근 이상 |

> 🔍 **더 깊이**: **DNS 기반 탐지**가 왜 강력한지를 보면 GuardDuty의 설계 철학이 드러난다. 멀웨어는 C2 서버와 통신하려면 거의 항상 도메인을 해석(resolve)해야 하고, 많은 공격이 **DGA(Domain Generation Algorithm)** — 매일 수천 개의 무작위처럼 보이는 도메인을 생성해 차단을 회피하는 기법(예: Conficker 웜이 2008년 사용) — 를 쓴다. GuardDuty는 DNS 쿼리의 도메인 이름에 엔트로피 분석과 ML을 돌려 "사람이 안 쓸 무작위 문자열" 패턴을 잡고, 알려진 C2 도메인 피드와 대조한다. 또 **DNS 터널링** — DNS 쿼리/응답에 데이터를 인코딩해 방화벽을 우회하는 데이터 유출 기법 — 도 쿼리 길이·빈도·레코드 타입(TXT 남용)으로 탐지한다. 그래서 `CryptoCurrency:EC2/BitcoinTool.B!DNS` 같은 Finding 타입에 `!DNS` 접미사가 붙는다 — DNS 신호로 잡았다는 표시다. 네트워크 페이로드(VPC Flow)와 DNS를 교차하면 암호화된 트래픽도 "어디로 향하는가"로 의심할 수 있다.

대표 Finding 타입의 명명 규칙은 `Threat:ResourceType/ThreatFamily.Variant!Source` 형태다. 예를 들어 `Backdoor:EC2/C&CActivity.B!DNS`는 "백도어 위협, EC2 대상, C&C 활동 변종 B, DNS 신호로 탐지"를 뜻한다. 이 구조를 읽을 줄 알면 Finding만 봐도 무엇이 어떻게 잡혔는지 안다.

## Finding Severity — 점수는 어떻게 정해지고 왜 중요한가

GuardDuty는 모든 Finding에 1.0~10.0의 Severity 점수를 매기고, 이를 네 구간으로 라벨링한다.

- **1.0~3.9: Low** — 정찰·낮은 위험 (포트 스캔 등)
- **4.0~6.9: Medium** — 의심스러운 행동
- **7.0~8.9: High** — 침해 가능성 높음
- **9.0~10.0: Critical** — 활성 침해 강력 의심

이 점수는 자동 대응의 트리거가 된다. "Severity 7 이상이면 자동 격리"가 표준 패턴인 이유는, 이 임계값 위쪽이 "사람을 기다릴 시간이 없는" 구간이기 때문이다.

> ⚠️ **함정**: Severity 점수를 "공격의 위험도"로만 이해하면 함정에 빠진다. GuardDuty의 Severity는 **위협의 심각성 × 신뢰도(confidence)**를 함께 반영한다. 즉 "확실히 침해됐다"가 높은 점수를 받지, "엄청난 공격이지만 확신이 낮다"는 중간 점수에 머문다. 그래서 같은 `SSHBruteForce`라도 "성공 후 추가 활동이 관측됨"이면 점수가 뛴다. DOP 시험에서 "왜 이 Finding의 severity가 예상보다 낮은가"의 답은 종종 "탐지 신뢰도가 아직 낮아서"다. 또한 자동 격리를 Severity ≥ 7로만 거는 설계는 8.9까지의 High를 다 포함하므로, 너무 공격적이면 false positive가 운영 인스턴스를 격리하는 사고로 이어진다 — 그래서 보통 Finding 타입 prefix 필터(예: `UnauthorizedAccess:EC2/`)를 함께 건다.

## 자동 격리 응답 패턴 — 탐지에서 격리까지의 자동화 사슬

탐지만으로는 부족하다. DOP의 핵심은 "탐지된 위협에 사람 없이 손을 쓰는" 자동화다. 표준 패턴은 GuardDuty → EventBridge → SSM Automation Runbook의 사슬이다.

```
GuardDuty Finding (Severity >= 7, type prefix 매칭)
   │
   ▼ EventBridge Rule (이벤트 필터링 + 라우팅)
   │
   ▼ SSM Automation Runbook (순서 있는 단계 실행)
   ├─ 1. Snapshot EBS         ← 포렌식 증거 보존 (가장 먼저!)
   ├─ 2. Modify Instance SG → sg-quarantine  ← 네트워크 격리
   ├─ 3. Detach/Replace IAM Role ← 자격 증명 무력화
   ├─ 4. Tag with incident ID  ← 추적
   ├─ 5. Notify Slack/PagerDuty ← 사람에게 알림
   └─ 6. Create Jira ticket     ← 사후 추적
```

EventBridge 규칙의 이벤트 패턴이 어떤 Finding을 자동 대응으로 보낼지 결정한다.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{"numeric": [">=", 7]}],
    "type": [{"prefix": "UnauthorizedAccess:EC2/"}]
  }
}
```

> ⚠️ **함정**: 자동 격리 단계의 **순서**가 시험에 나온다. 스냅샷을 가장 먼저 떠야 한다 — 인스턴스를 격리하거나 종료한 뒤엔 메모리·디스크 상태가 오염되거나 사라져 포렌식이 불가능해진다. 또 "격리"는 인스턴스를 **종료(terminate)하는 게 아니라** 격리 SG로 네트워크만 끊는 것이다. 종료하면 공격자가 무엇을 했는지 영영 모른다. 격리 SG는 "모든 아웃바운드 차단 + 포렌식 점프박스에서의 인바운드만 허용"으로, 공격자의 C2 통신을 끊으면서 조사자는 접근하게 한다. "GuardDuty Critical 발견 시 즉시 인스턴스 종료"는 거의 항상 오답이다 — 증거 인멸이기 때문이다.

> 📚 **사례**: 2019년 캐피털 원(Capital One) 침해는 약 1억 명의 신용 정보가 유출된 대형 사고로, 잘못 설정된 WAF가 SSRF(Server-Side Request Forgery) 공격에 악용돼 EC2 인스턴스의 IAM 역할 자격 증명이 탈취되고, 그 자격 증명으로 S3 버킷이 통째로 유출됐다. 핵심 교훈은 두 가지였다. 첫째, **인스턴스의 IAM 역할 자격 증명 탈취 후 비정상 API 호출**(다른 region·대량 S3 접근)은 GuardDuty의 `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` 같은 Finding으로 탐지 가능한 패턴이었다 — 탐지가 켜져 있고 자동 대응이 걸려 있었다면 자격 증명 무력화로 피해를 줄일 수 있었다. 둘째, **탐지 후 대응 속도**가 피해 규모를 결정한다 — 침해와 외부 신고 사이에 약 4개월의 공백이 있었다. 이 사고 이후 "탐지(GuardDuty) → 자동 자격 증명 무력화·격리(EventBridge+SSM)"의 자동화 사슬이 업계 표준 권고가 됐다.

## Multi-Account GuardDuty — Organizations로 일괄 적용

수백 개 계정에서 각자 GuardDuty를 켜고 Finding을 따로 보는 건 운영 불가능이다. GuardDuty는 Organizations와 통합해 중앙 집중화한다.

핵심은 **위임 관리자(Delegated Administrator)** 계정이다. 보통 Security OU의 Audit 계정을 위임 관리자로 지정하면, 그 계정이 조직 전체의 GuardDuty를 통제한다. `auto-enable`을 켜면 **기존 멤버 계정은 물론 앞으로 새로 만들어지는 계정도 자동으로 GuardDuty가 활성**된다 — 사람이 새 계정마다 켜는 걸 잊는 사고를 원천 차단한다.

```bash
# Organizations 서비스 접근 허용
aws organizations enable-aws-service-access --service-principal guardduty.amazonaws.com

# Audit 계정을 위임 관리자로
aws guardduty enable-organization-admin-account --admin-account-id AUDIT-ACCT

# 모든 계정 + 신규 계정 auto-enable, 데이터 소스 지정
aws guardduty update-organization-configuration \
  --detector-id <id> --auto-enable-organization-members ALL \
  --features '[{"Name":"EBS_MALWARE_PROTECTION","AutoEnable":"NEW"},{"Name":"EKS_AUDIT_LOGS","AutoEnable":"ALL"}]'
```

> 💡 **관련 이론**: 위임 관리자 패턴은 보안의 **관심사 분리(separation of concerns)**와 **최소 권한** 원칙의 조직 단위 적용이다. 관리 계정(management account)에 모든 권한을 몰아넣는 대신, GuardDuty 운영은 Audit 계정에, 로깅은 Log Archive 계정에 위임한다(AWS의 Landing Zone / Control Tower 권장 구조). 이는 **폭발 반경(blast radius) 축소** — 한 계정이 침해돼도 전체가 무너지지 않게 권한을 분산 — 라는 분산 시스템의 격벽(bulkhead) 패턴을 IAM 거버넌스에 적용한 것이다. 관리 계정은 결제·조직 구조만 다루고 일상 보안 운영에서 빠지므로, 관리 계정 자격 증명이 노출돼도 보안 탐지 기능 자체는 별도 계정에서 계속 돌아간다.

## Finding을 ASFF로 — Security Hub와의 통합

GuardDuty Finding은 자동으로 **ASFF(AWS Security Finding Format)**라는 표준 JSON 스키마로 변환되어 Security Hub로 전송된다. ASFF는 GuardDuty·Inspector·Macie 등 서로 다른 소스의 Finding을 같은 형식으로 정규화하는 공통 언어다. Security Hub가 이를 받아 중복 제거(dedup)하고 우선순위화한다(상세는 Day 2).

> 💡 **관련 이론**: ASFF는 보안 데이터의 **정규화(normalization)** 문제에 대한 답이다. 여러 도구가 각자 다른 형식으로 알람을 내면, SIEM(Security Information and Event Management)은 이를 통합 분석할 수 없다. 업계엔 STIX(Structured Threat Information eXpression, MITRE/OASIS 표준), OCSF(Open Cybersecurity Schema Framework, 2022년 AWS·Splunk 등이 공동 발족) 같은 표준이 경쟁한다. ASFF는 AWS 생태계 내부의 공통 스키마로, "서로 다른 탐지기의 출력을 하나의 파이프라인으로 흘려보낸다"는 **표준 인터페이스(adapter pattern)** 사상의 구현이다. 데이터 형식을 표준화하면 다운스트림(EventBridge 필터·자동 수정 Lambda)을 소스마다 새로 짜지 않아도 된다 — 이것이 통합 보안 자동화의 전제 조건이다.

## Noise 통제 — Suppression, Trusted IP, Threat IP

탐지가 정확해도 false positive가 운영팀을 알람 피로(alert fatigue)에 빠뜨리면 결국 진짜 경보를 놓친다(기저율 오류의 실무적 결과). GuardDuty는 세 가지 noise 통제 장치를 준다.

- **Suppression Rule**: 특정 패턴의 Finding을 자동으로 "보존만 하고 알리지 않음" 처리. 예: 알려진 취약점 스캐너(Qualys)의 정상적 스캔을 매번 알리지 않게.
- **Trusted IP List**: 알려진 안전한 IP는 아예 Finding을 만들지 않음(예: 회사 VPN 출구 IP).
- **Threat IP List**: 사용자 정의 악성 IP 목록 — 이 IP와의 통신을 적극 탐지.

> ⚠️ **함정**: Suppression Rule과 Trusted IP List는 효과가 다르다. **Trusted IP List**는 해당 IP에 대한 Finding 생성 자체를 막으므로, 그 IP가 나중에 침해돼도 GuardDuty가 침묵한다 — 위험한 사각지대가 될 수 있다. **Suppression Rule**은 Finding을 여전히 생성·보존하되 콘솔/알림에서만 숨긴다 — 사후 조사 시 데이터는 남아 있다. 따라서 "잠깐의 false positive 억제"는 Suppression이 안전하고, Trusted IP는 정말 통제된 인프라 IP에만 신중히 써야 한다. 시험에서 "false positive를 줄이되 사후 감사용 기록은 남기고 싶다"의 답은 Trusted IP가 아니라 Suppression Rule이다.

## GuardDuty Malware Protection — 에이전트리스 EBS 스캔

GuardDuty Malware Protection은 위협 Finding이 난 EC2의 EBS 볼륨을 자동으로(또는 on-demand) 스캔해 멀웨어를 찾는다. 핵심은 **인스턴스를 건드리지 않는 스캔 방식**이다 — 대상 EBS의 스냅샷을 떠서 GuardDuty 서비스 계정 측에서 격리된 환경에 마운트해 스캔하므로, 운영 인스턴스의 성능에 영향을 주지 않고 공격자에게도 들키지 않는다(에이전트가 없으니 공격자가 비활성화할 수 없다). 별도 과금이며, 컨테이너 런타임 모니터링(EKS·ECS Fargate)도 제공한다.

> 🎯 **시나리오**: "GuardDuty가 EC2에서 `CryptoCurrency:EC2/BitcoinTool.B!DNS`(Severity 8.5)를 탐지했다. 사람 개입 없이 ①포렌식 증거 보존 ②네트워크 격리 ③멀웨어 확인 ④운영팀 알림을 자동화하라." → EventBridge 규칙으로 `severity >= 7` AND `type prefix CryptoCurrency:EC2/`를 필터링 → SSM Automation Runbook 호출: (1) EBS 스냅샷 생성, (2) GuardDuty Malware Protection on-demand 스캔 트리거, (3) 인스턴스 SG를 sg-quarantine으로 교체, (4) 인스턴스에 incident-id 태그, (5) SNS로 Slack/PagerDuty 알림, (6) Lambda로 Jira 티켓 생성. 인스턴스 **종료는 하지 않는다**(증거 보존). 멀티 계정이면 위임 관리자 계정의 EventBridge가 조직 전체 Finding을 받아 소스 계정의 SSM Runbook을 cross-account 역할로 실행한다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **위협 탐지는 시그니처 기반과 이상 탐지 사이의 긴장**이며 GuardDuty는 위협 인텔리전스(시그니처)와 ML 행동 분석(이상 탐지)을 섞고, 그 밑엔 데닝의 통계적 IDS 모델과 기저율 오류라는 근본 제약이 깔려 있다. 둘째, **GuardDuty는 에이전트리스로 AWS가 이미 수집하는 데이터 평면 로그**(CloudTrail·VPC Flow·DNS 등)를 직접 읽어 위협을 판정하며, Finding 타입의 명명 규칙이 무엇을 어떻게 잡았는지 알려준다. 셋째, **자동 격리는 GuardDuty → EventBridge → SSM Runbook 사슬**이고, 단계 순서(스냅샷 먼저, 종료 아닌 격리)와 Severity·타입 필터가 핵심이다 — 캐피털 원 사고가 이 자동화의 가치를 증명했다. 넷째, **Organizations 위임 관리자 + auto-enable로 멀티 계정을 일괄 통제**하고, Suppression/Trusted/Threat 목록으로 noise를 다루며, Finding은 ASFF로 Security Hub에 흘러든다.

다음 글에서는 이렇게 모인 Finding들을 **단일 진실 출처로 통합·정규화하고 자동 수정**하는 Security Hub를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** GuardDuty가 "에이전트 없이(agentless)" 동작할 수 있는 근본 이유는?

A) GuardDuty가 각 EC2에 경량 에이전트를 자동 배포해서

B) AWS가 이미 수집하는 데이터 평면 로그(CloudTrail, VPC Flow, Route 53 DNS)의 복제 스트림을 GuardDuty가 직접 받아 분석하므로 별도 수집 인프라나 에이전트가 필요 없어서

C) GuardDuty가 네트워크 패킷을 직접 가로채서

D) 사용자가 모든 로그를 수동으로 업로드해서

**정답: B**

해설: GuardDuty의 "켜기 버튼 하나"의 정체는 새 데이터 수집 인프라를 까는 게 아니라, AWS가 이미 기록하는 데이터 평면 로그 — CloudTrail(API 호출), VPC Flow Logs(네트워크 흐름), Route 53 Resolver(DNS 쿼리) — 의 복제 스트림을 내부적으로 직접 받아 분석하는 것이다. 그래서 사용자가 VPC Flow Logs를 따로 활성화·저장하지 않아도 GuardDuty는 흐름을 본다. 예외적으로 EKS/ECS Runtime Monitoring과 EBS Malware Protection은 경량 에이전트나 스냅샷 스캔을 추가로 쓴다. 에이전트 자동 배포(A)나 수동 업로드(D)는 GuardDuty의 모델이 아니다.

---

**문제 2.** 침해가 매우 드문 환경(예: 100만 이벤트당 1건)에서 탐지기의 정확도가 99%여도 알람의 대다수가 false positive가 되는 통계적 현상은? GuardDuty가 이에 대응하는 장치는?

A) CAP 정리 — Severity 점수로 대응

B) 기저율의 오류(base rate fallacy) — Severity 점수, Suppression Rule, Trusted IP List로 알람 피로를 줄여 대응

C) 무어의 법칙 — 더 빠른 하드웨어로 대응

D) 비둘기집 원리 — region 분산으로 대응

**정답: B**

해설: 기저율의 오류는 사건의 사전 확률(기저율)이 극히 낮을 때, 탐지기 정확도가 높아도 양성 판정의 대부분이 거짓 양성이 되는 베이즈 추론의 결과다. 침입 탐지의 근본 난제이며, 데닝의 통계적 IDS 모델 이래 핵심 문제로 남아 있다. GuardDuty는 Severity 점수(위협 심각성 × 탐지 신뢰도)로 우선순위를 매기고, Suppression Rule·Trusted IP List로 알려진 정상 패턴을 걸러 운영팀의 알람 피로를 줄인다. "탐지는 쉽고, 알람 피로 없이 탐지하는 게 어렵다"가 핵심이다. CAP(A)·무어(C)·비둘기집(D)은 무관하다.

---

**문제 3.** GuardDuty Severity 점수가 동일한 공격 유형인데도 케이스마다 다르게 나오는 이유로 가장 정확한 것은?

A) Severity는 무작위로 부여된다

B) Severity는 위협의 심각성뿐 아니라 탐지 신뢰도(confidence)를 함께 반영하므로, "성공 후 추가 활동이 관측됨" 같은 확신 요소가 점수를 높인다

C) Severity는 인스턴스 타입에 비례한다

D) Severity는 계정 나이에 따라 정해진다

**정답: B**

해설: GuardDuty Severity는 단순한 "공격 위험도"가 아니라 위협의 심각성 × 신뢰도를 함께 반영한다. 같은 `SSHBruteForce`라도 "성공 후 추가 활동(권한 상승·데이터 접근)이 관측됨"이면 침해 신뢰도가 올라 점수가 뛴다. 반대로 "엄청난 공격처럼 보이지만 확신이 낮음"은 중간 점수에 머문다. DOP에서 "왜 이 Finding의 severity가 예상보다 낮은가"의 답은 종종 "탐지 신뢰도가 아직 낮아서"다. 무작위(A)·인스턴스 타입(C)·계정 나이(D)는 근거 없다.

---

**문제 4.** GuardDuty Critical Finding(`Backdoor:EC2/C&CActivity.B!DNS`) 발견 시 SSM Automation Runbook으로 자동 대응한다. 단계 순서로 가장 올바른 것은?

A) 인스턴스 즉시 종료 → 스냅샷 → 알림

B) EBS 스냅샷(포렌식 보존) → 격리 SG로 교체(네트워크 격리, 종료 아님) → IAM 역할 무력화 → 태그 → 알림

C) 알림 → 운영자 승인 대기 → 수동 종료

D) IAM 역할 삭제 → 인스턴스 재부팅 → 스냅샷

**정답: B**

해설: 자동 격리 단계의 순서가 중요하다. 포렌식 증거 보존을 위해 EBS 스냅샷을 가장 먼저 떠야 한다 — 인스턴스를 종료하거나 오염시킨 뒤엔 메모리·디스크 상태가 사라져 조사가 불가능하다. "격리"는 인스턴스 종료가 아니라 격리 SG(모든 아웃바운드 차단 + 포렌식 점프박스 인바운드만 허용)로 네트워크만 끊어 C2 통신을 차단하면서 조사자 접근은 남기는 것이다. 즉시 종료(A)나 재부팅(D)은 증거 인멸이고, 수동 승인 대기(C)는 "사람 없이 즉시 대응"이라는 자동화 목표에 어긋난다.

---

**문제 5.** 수백 개 계정 조직에서 기존 계정은 물론 앞으로 생성될 모든 신규 계정에도 GuardDuty가 자동 활성되고, Finding이 중앙 집계되게 하려면?

A) 각 계정 관리자가 콘솔에서 수동으로 GuardDuty를 켠다

B) 관리 계정(management account)에서 모든 탐지를 직접 운영한다

C) Audit 계정을 GuardDuty 위임 관리자(Delegated Administrator)로 지정하고 auto-enable을 ALL/NEW로 설정한다

D) Lambda로 매일 신규 계정을 스캔해 GuardDuty를 켜는 스크립트를 돌린다

**정답: C**

해설: GuardDuty는 Organizations와 통합해 Audit 계정을 위임 관리자로 지정하면 조직 전체를 중앙 통제한다. auto-enable을 ALL(기존)·NEW(신규)로 설정하면 새로 만들어지는 계정도 자동으로 GuardDuty가 켜져, 사람이 새 계정마다 켜는 걸 잊는 사고를 원천 차단한다. 위임 관리자 패턴은 관리 계정에 권한을 몰지 않고 보안 운영을 Audit 계정에 분리하는 관심사 분리·폭발 반경 축소 원칙의 적용이다. 수동(A)·관리 계정 직접 운영(B)·커스텀 스크립트(D)는 모두 누락·운영 부담의 위험이 있는 안티패턴이다.

---

**문제 6.** false positive를 줄이고 싶지만, 나중에 그 IP/패턴이 실제로 침해됐을 때를 대비해 사후 조사용 기록은 남기고자 한다. 올바른 선택은?

A) Trusted IP List에 추가해 Finding 생성 자체를 막는다

B) Suppression Rule을 만들어 Finding은 생성·보존하되 콘솔/알림에서만 숨긴다

C) GuardDuty를 끈다

D) 해당 region 전체를 비활성화한다

**정답: B**

해설: Trusted IP List는 해당 IP에 대한 Finding 생성 자체를 막으므로, 그 IP가 나중에 침해돼도 GuardDuty가 침묵하는 사각지대가 된다. 반면 Suppression Rule은 Finding을 여전히 생성·보존하되 콘솔/알림에서만 숨기므로, 사후 조사 시 데이터가 남아 있다. "false positive는 줄이되 감사용 기록은 보존"이라는 요구에는 Suppression Rule이 맞다. GuardDuty를 끄거나(C) region을 비활성화(D)하면 탐지 공백이 생긴다.

---

**문제 7.** GuardDuty Finding이 자동으로 ASFF(AWS Security Finding Format)로 변환되어 Security Hub로 전송되는 설계가 주는 핵심 이점은?

A) Finding의 저장 비용이 사라진다

B) 서로 다른 탐지 소스(GuardDuty·Inspector·Macie)의 출력이 같은 표준 스키마로 정규화되어, 다운스트림(중복 제거·우선순위화·자동 수정 파이프라인)을 소스마다 새로 짤 필요가 없어진다

C) Finding이 자동으로 수정된다

D) GuardDuty가 더 빨리 탐지하게 된다

**정답: B**

해설: ASFF는 보안 데이터의 정규화 문제에 대한 답으로, 여러 탐지기의 서로 다른 출력 형식을 하나의 표준 스키마로 통일한다. 이는 표준 인터페이스(adapter pattern) 사상의 구현으로, Security Hub가 중복 제거·우선순위화를 하고 EventBridge 필터·자동 수정 Lambda 같은 다운스트림을 소스마다 다시 작성하지 않아도 되게 한다 — 통합 보안 자동화의 전제 조건이다. 저장 비용(A)·자동 수정(C)·탐지 속도(D)와는 직접 관련이 없다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 위협 탐지는 시그니처 기반(낮은 false positive, zero-day 취약)과 이상 탐지(새 공격 탐지, false positive 위험) 사이의 긴장이며, GuardDuty는 위협 인텔리전스와 ML 행동 분석을 섞고 그 밑엔 데닝의 통계적 IDS와 기저율 오류라는 제약이 있다. 둘째, GuardDuty는 에이전트리스로 AWS가 이미 수집하는 데이터 평면 로그(CloudTrail·VPC Flow·DNS·EKS Audit 등)를 직접 읽으며, Severity는 위협 심각성×신뢰도를 반영하고 자동 대응의 트리거가 된다. 셋째, 자동 격리는 GuardDuty → EventBridge(severity·type 필터) → SSM Runbook 사슬이고, 단계 순서(스냅샷 먼저, 종료 아닌 격리 SG)가 핵심이며 캐피털 원 사고가 그 가치를 보여줬다. 넷째, Organizations 위임 관리자 + auto-enable로 멀티 계정을 일괄 통제하고, Suppression(기록 보존)·Trusted IP(생성 차단)·Threat IP로 noise를 다루며, Finding은 ASFF로 Security Hub에 통합된다.

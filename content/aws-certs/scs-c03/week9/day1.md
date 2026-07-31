# Day 1 - Amazon GuardDuty: 위협 탐지 원리, 핀딩 유형, 위협 인텔, 멀티계정 위임 관리자

탐지(detection)는 예방(prevention)이 뚫렸음을 전제로 한다. 방화벽·IAM·암호화로 아무리 막아도 자격증명 탈취, 내부자, 제로데이는 통과한다. 그래서 보안 운영의 두 번째 기둥은 "이미 일어난(또는 일어나는 중인) 악성 활동을 *증거 기반으로* 알아채는 것"이다. Amazon GuardDuty는 이 탐지 계층의 1차 진입점으로, **에이전트 없이(agentless)** 계정 전역의 텔레메트리를 상시 분석해 위협을 핀딩(finding)으로 토해낸다.

GuardDuty의 본질은 "로그를 *수집하는* 서비스가 아니라, 로그를 *읽어 의미를 부여하는* 분석 엔진"이다. CloudTrail을 켜야 GuardDuty가 보는 것이 아니라, GuardDuty가 CloudTrail/VPC Flow/DNS 스트림을 *직접 구독*해서 분석한다. 사용자가 로그를 저장·전달하도록 구성할 필요가 없고, 활성화하는 순간 데이터 소스가 연결된다 — 이 "켜기만 하면 끝"이 시험의 단골 포인트다.

## 무엇을 분석하는가: 3대 기초 데이터 소스

GuardDuty가 추가 비용·구성 없이 항상 소비하는 세 가지 *기초(foundational)* 소스:

```
CloudTrail 관리 이벤트  → API 호출 행위 (누가 무엇을 했나)
CloudTrail S3 데이터 이벤트(옵션) → S3 객체 수준 접근
VPC Flow Logs           → 네트워크 흐름 (어디로 연결했나)
DNS 쿼리 로그           → 도메인 해석 (무엇을 찾았나)
```

중요한 미묘함: GuardDuty는 이 로그들을 **복제하지 않는다**. 계정에 VPC Flow Logs를 켜지 않았어도, GuardDuty는 내부적으로 흐름 데이터를 받아 분석한다(별도 저장 안 함). DNS 분석은 **VPC 기본 DNS resolver(Route 53 Resolver)**를 쓸 때만 가능하다 — 커스텀 DNS나 외부 resolver를 쓰면 GuardDuty의 DNS 기반 핀딩(예: DNS exfiltration)은 사각지대가 된다.

> 💡 **관련 이론**: 이는 *행위 기반 탐지(behavioral detection)*의 전형이다. 시그니처 매칭(알려진 악성 IP·해시)에만 의존하지 않고, 베이스라인 대비 *이상(anomaly)*을 통계·ML로 잡는다. GuardDuty는 계정별로 "정상" 프로파일(평소 호출하는 API, 평소 통신하는 지역·포트)을 학습해, 평소와 다른 행위를 위협 점수화한다. 이것이 NIST CSF의 "Detect" 기능 중 "Anomalies and Events(DE.AE)"에 대응한다.

### 데이터 소스가 다르면 답할 수 있는 질문도 다르다

탐지 서비스를 고르는 시험 문제는 결국 "이 질문에 답할 수 있는 데이터를 누가 갖고 있는가"로 환원된다. 각 서비스가 *무엇을 먹는가*를 축으로 정리하면 헷갈릴 일이 없다.

| 서비스 | 먹는 데이터 | 답하는 질문 | 답하지 못하는 질문 |
|--------|-------------|-------------|--------------------|
| **GuardDuty** | CloudTrail 관리 이벤트, VPC Flow, DNS 쿼리, (+옵션) S3 데이터 이벤트·EKS 감사 로그·런타임 텔레메트리·EBS 스냅샷 | "지금 누가 악성 행위를 하고 있는가" | "이 서버에 어떤 CVE가 있는가", "이 파일에 주민번호가 있는가" |
| **Inspector** | 패키지 인벤토리(SSM/스냅샷), ECR 이미지 레이어, Lambda 의존성, 네트워크 도달성 | "어디가 악용당할 수 있는 약점인가" | "지금 공격받고 있는가" |
| **Macie** | S3 객체의 *내용* | "민감 데이터가 어디에 얼마나 있는가" | "누가 그걸 훔쳐 갔는가" |
| **Detective** | VPC Flow, CloudTrail, GuardDuty 핀딩, EKS 감사 로그를 **그래프로 연결** | "왜 일어났고 어디까지 번졌는가" | "새 위협을 탐지" (핀딩을 만들지 않는다) |
| **Security Hub** | 위 서비스들의 *핀딩*(ASFF) | "지금 조직 전체에서 가장 위험한 것은 무엇인가" | 원천 데이터에 대한 심층 질의 |

> ⚠️ **함정**: 이 표에서 가장 자주 뒤섞이는 쌍이 **GuardDuty와 Inspector**다. "EC2가 침해된 것 같다"는 GuardDuty, "EC2가 침해될 수 있는가"는 Inspector다. 문장의 시제가 힌트다 — 과거·현재진행이면 위협 탐지, 미래·가정이면 취약점 관리. 또 하나 자주 틀리는 것이 **"GuardDuty를 쓰려면 VPC Flow Logs를 먼저 켜야 한다"**는 오해다. GuardDuty는 흐름 데이터를 서비스 내부 경로로 직접 받으므로, 사용자가 Flow Logs를 활성화하거나 S3에 저장할 필요가 전혀 없다. 반대로 *사용자가 Flow Logs를 껐다고 해서 GuardDuty의 네트워크 탐지가 멈추지도 않는다.*

> 📚 **사례**: 2019년 Capital One 침해는 GuardDuty가 무엇을 보는 서비스인지 이해하는 데 교과서적인 사건이다. 공격자는 잘못 구성된 웹 방화벽 뒤의 EC2 워크로드를 SSRF로 유도해 **인스턴스 메타데이터 서비스(IMDS)에서 IAM 역할의 임시 자격증명을 꺼냈고**, 그 자격증명으로 S3 버킷의 데이터를 대량으로 읽어 갔다. 이 공격 경로를 GuardDuty 관점에서 쪼개 보면 각 단계가 서로 다른 데이터 소스에 흔적을 남긴다 — 자격증명이 AWS 밖 IP에서 사용된 사실은 **CloudTrail 관리 이벤트**에, 대량 객체 읽기는 **S3 데이터 이벤트**에, 외부로 나가는 이례적 트래픽은 **VPC Flow**에 남는다. GuardDuty가 이 사건 계열에 대응해 내놓는 대표 핀딩이 `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS`(EC2 역할 자격증명이 AWS 외부에서 사용됨)이다. 교훈은 두 가지다. 첫째, **역할 자격증명은 인스턴스를 벗어나는 순간 그냥 문자열**이므로 "인스턴스가 안전하니 역할도 안전하다"는 가정은 성립하지 않는다. 둘째, 예방 통제(IMDSv2 강제, SSRF 방어, 최소 권한)와 탐지 통제(GuardDuty)는 어느 하나로 대체되지 않는다 — 예방은 확률을 낮추고, 탐지는 예방이 실패한 뒤의 *시간*을 줄인다.

## 보호 플랜(Protection Plans): 기초 위에 얹는 확장 탐지

기초 소스 외에, 추가 데이터 소스를 켜는 *보호 플랜*들이 있다. 각각 별도 과금되고 별도 핀딩 유형을 생성한다:

- **S3 Protection**: CloudTrail S3 데이터 이벤트 분석 → 의심스러운 S3 접근 패턴
- **EKS Protection**: EKS 감사 로그 분석 → 쿠버네티스 API 수준 위협
- **Runtime Monitoring**: 경량 에이전트(EKS/ECS/EC2)로 **호스트 내부** 행위(프로세스, 파일, 네트워크) 가시성 → 컨테이너·인스턴스 런타임 위협
- **Malware Protection (EBS)**: 의심 EC2의 EBS 볼륨 스냅샷을 떠 멀웨어 스캔(에이전트 불필요)
- **Malware Protection for S3**: 업로드 객체 스캔
- **RDS Protection**: Aurora 로그인 활동 분석 → DB 자격증명 공격
- **Lambda Protection**: Lambda 네트워크 활동 분석

> ⚠️ **함정**: "GuardDuty를 켰는데 호스트 내부 침해(악성 프로세스)를 못 본다"는 시나리오의 답은 보통 **Runtime Monitoring 활성화**다. 기초 GuardDuty는 네트워크/API 관점만 본다. 또 "EC2가 멀웨어에 감염된 것 같다 → 스캔하라"는 **Malware Protection(EBS)**이다.

보호 플랜을 고를 때의 판단 기준을 한 표로 정리하면 다음과 같다. 시험은 "이 가시성이 없다 → 무엇을 켜야 하나"의 형태로 묻는다.

| 보이지 않는 것 | 켜야 할 것 | 데이터 획득 방식 |
|----------------|-----------|------------------|
| 인스턴스 안에서 실행된 프로세스·파일 변경 | **Runtime Monitoring** | 경량 에이전트(EKS/ECS Fargate/EC2) |
| EC2 디스크의 악성 파일 | **Malware Protection for EC2** | EBS **스냅샷을 떠서** 서비스 측에서 스캔(에이전트 불필요) |
| S3에 업로드된 악성 파일 | **Malware Protection for S3** | 업로드 시점 객체 스캔 |
| 쿠버네티스 API 수준 남용(권한 있는 파드, 익명 접근) | **EKS Protection**(감사 로그) | EKS control plane 감사 로그 |
| S3 객체 접근의 이상 패턴 | **S3 Protection** | CloudTrail S3 데이터 이벤트 |
| Aurora 로그인 무차별 대입·이상 로그인 | **RDS Protection** | Aurora 로그인 활동 |
| Lambda 함수의 이상 아웃바운드 통신 | **Lambda Protection** | Lambda 네트워크 활동 |

> 🔍 **더 깊이**: Malware Protection for EC2가 "에이전트 없이" 동작하는 방식은 시험보다 실무에서 더 중요한 함의를 갖는다. GuardDuty는 의심 인스턴스의 **EBS 볼륨 스냅샷을 서비스 계정 쪽으로 복제해 스캔**한다. 이것이 의미하는 바는 세 가지다. (1) 워크로드에 성능 영향이 사실상 없다 — 스캔은 인스턴스 밖에서 일어난다. (2) 감염된 호스트가 스캔을 방해하거나 결과를 조작할 수 없다 — 침해된 호스트 위에서 도는 안티바이러스가 갖는 근본적 신뢰 문제를 우회한다. (3) 대신 **볼륨이 고객 관리형 KMS 키로 암호화되어 있으면 GuardDuty 서비스 역할이 그 키를 쓸 수 있어야** 한다. "Malware Protection을 켰는데 특정 인스턴스만 스캔이 실패한다"의 흔한 원인이 KMS 키 정책이다. 스냅샷 보존 여부도 선택할 수 있는데, 포렌식을 위해 보존하면 그 스냅샷 자체가 민감 자산이 되므로 접근 통제를 따로 걸어야 한다.

## 핀딩(Finding)의 해부

핀딩은 GuardDuty 탐지의 산출물이다. 핀딩 타입은 일관된 명명 규칙을 따른다:

```
ThreatPurpose:ResourceTypeAffected/ThreatFamilyName.DetectionMechanism!Artifact

예) UnauthorizedAccess:EC2/SSHBruteForce
    Backdoor:EC2/C&CActivity.B!DNS
    CryptoCurrency:EC2/BitcoinTool.B!DNS
    Recon:IAMUser/UserPermissions
    Exfiltration:S3/AnomalousBehavior
    Trojan:EC2/DNSDataExfiltration
    PenTest:IAMUser/KaliLinux
    Policy:S3/BucketBlockPublicAccessDisabled
```

- **ThreatPurpose**(위협 목적): Backdoor, Behavior, CryptoCurrency, Exfiltration, Impact, PenTest, Persistence, Policy, PrivilegeEscalation, Recon, Stealth, Trojan, UnauthorizedAccess 등 — 공격 *단계/의도*를 나타낸다.
- **ResourceTypeAffected**: EC2, IAMUser, S3, EKSCluster, RDS, Lambda 등.
- **DetectionMechanism**: `.B!DNS`처럼 어떻게 탐지했는지(DNS 기반, etc).

각 핀딩은 **severity(심각도)** 점수 0.1~8.0+를 가진다: Low(1.0–3.9), Medium(4.0–6.9), High(7.0–8.9). 시험에서는 점수 자체보다 *어떤 핀딩이 어떤 위협을 의미하는지*가 중요하다.

> 💡 **관련 이론**: ThreatPurpose 분류는 사실상 **MITRE ATT&CK** 전술(Tactics) 매핑이다 — Recon(정찰), PrivilegeEscalation(권한 상승), Persistence(지속성), Exfiltration(유출), Impact(영향) 등은 ATT&CK의 킬체인 단계와 대응한다. 핀딩을 ATT&CK 관점에서 읽으면 "공격이 어느 단계까지 왔는가"를 판단해 대응 우선순위를 정할 수 있다.

### 실물 핀딩을 한 줄씩 읽는다 (1) — 자격증명 유출

이 주차의 진짜 역량은 핀딩 목록을 외우는 것이 아니라 **핀딩 하나를 받아 무슨 일이 일어났는지 재구성하는 것**이다. GuardDuty 핀딩 JSON의 뼈대를 실물로 보자.

```json
{
  "SchemaVersion": "2.0",
  "AccountId": "111122223333",
  "Region": "ap-northeast-2",
  "Id": "ac1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d",
  "Type": "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS",
  "Severity": 8,
  "Title": "Credentials created exclusively for an EC2 instance have been used from an external IP address.",
  "Resource": {
    "ResourceType": "AccessKey",
    "AccessKeyDetails": {
      "AccessKeyId": "ASIAEXAMPLEKEYID",
      "PrincipalId": "AROAEXAMPLE:i-0abc123def4567890",
      "UserType": "AssumedRole",
      "UserName": "app-server-role"
    }
  },
  "Service": {
    "ServiceName": "guardduty",
    "DetectorId": "12abc34d567e8fa901bc2d34e56789f0",
    "ResourceRole": "TARGET",
    "Action": {
      "ActionType": "AWS_API_CALL",
      "AwsApiCallAction": {
        "Api": "ListBuckets",
        "ServiceName": "s3.amazonaws.com",
        "CallerType": "Remote IP",
        "RemoteIpDetails": {
          "IpAddressV4": "198.51.100.24",
          "Country": { "CountryName": "Netherlands" },
          "Organization": { "Asn": "64500", "AsnOrg": "EXAMPLE-HOSTING" }
        }
      }
    },
    "Count": 14,
    "EventFirstSeen": "2026-03-14T02:11:07Z",
    "EventLastSeen": "2026-03-14T02:29:52Z"
  }
}
```

한 줄씩 무엇을 뜻하는지 풀면 이렇다.

| 필드 | 값이 말하는 것 |
|------|----------------|
| `Type` | 위협 목적은 **무단 접근**, 대상은 **IAMUser(자격증명)**, 위협 계열은 **InstanceCredentialExfiltration**, 그리고 `.OutsideAWS` — AWS *바깥* IP에서 사용됐다. 이 접미사가 결정적이다. `.InsideAWS`였다면 다른 AWS 계정·인스턴스에서 쓰였다는 뜻이고, 정상적인 크로스계정 아키텍처일 여지가 조금은 있다. `OutsideAWS`는 그 여지가 거의 없다. |
| `Severity: 8` | High 구간(7.0–8.9). 즉시 대응 대상. |
| `Resource.ResourceType: "AccessKey"` | 영향받은 것이 EC2 *인스턴스*가 아니라 **자격증명**이다. 그래서 인스턴스를 종료해도 문제가 끝나지 않는다. |
| `AccessKeyDetails.UserType: "AssumedRole"` + `PrincipalId`의 `:i-0abc...` | 이 임시 자격증명은 **인스턴스 프로파일을 통해 EC2에 발급된 역할 세션**이다. `PrincipalId` 뒤에 붙은 인스턴스 ID가 "어느 인스턴스에서 흘러나갔는가"를 그대로 알려준다. |
| `Service.ResourceRole: "TARGET"` | 이 리소스가 활동의 *대상*이었다는 뜻(반대는 `ACTOR`). 자격증명이 공격에 이용당한 쪽임을 나타낸다. |
| `Action.ActionType: "AWS_API_CALL"` | 네트워크 연결이나 DNS가 아니라 **CloudTrail에 기록된 API 호출**이 탐지 근거다. |
| `AwsApiCallAction.Api: "ListBuckets"` | 공격자의 첫 행동이 **S3 버킷 열거** — 전형적인 정찰이다. 다음 단계는 거의 항상 `GetObject`다. |
| `RemoteIpDetails` | 호출 IP·국가·ASN. 호스팅 사업자 ASN에서 온 호출은 사무실·CI가 아니라는 강한 신호다. |
| `Count: 14`, `EventFirstSeen/LastSeen` | **18분 사이에 14번**. 사람이 손으로 한 것이 아니라 스크립트가 돌았다는 뜻이며, 대응 시계는 이미 시작됐다. |

이 한 건에서 도출되는 대응 순서는 명확하다. (1) 해당 역할 세션 **무효화** — 액세스 키를 지우는 게 아니라 역할에 시점 기반 거부 정책(`aws:TokenIssueTime` 조건)을 붙이거나 역할 신뢰/권한을 즉시 축소한다. (2) 원본 인스턴스 **격리**(격리 SG로 이동, 종료 금지 — 메모리 증거가 사라진다). (3) **IMDSv2 강제** 여부 확인 — 이 유형의 유출은 대개 SSRF+IMDSv1에서 온다. (4) CloudTrail에서 그 세션이 실제로 무엇을 읽었는지 **범위 산정**. (5) Detective로 같은 IP·같은 역할이 건드린 다른 엔티티 추적(day2).

> ⚠️ **함정**: `Resource.ResourceType`이 `AccessKey`인 핀딩에 대해 "인스턴스를 종료(terminate)한다"를 정답으로 고르면 안 된다. 임시 자격증명은 이미 인스턴스 밖에 있고 만료 전까지 유효하므로, 인스턴스를 없애도 **자격증명은 계속 살아 있다**. 게다가 종료는 포렌식 증거(메모리·디스크 상태)를 파괴한다. 정답의 형태는 항상 "세션 무효화 + 인스턴스 격리(종료 아님) + 스냅샷"이다.

### 실물 핀딩을 한 줄씩 읽는다 (2) — DNS 기반 채굴 탐지

```json
{
  "Type": "CryptoCurrency:EC2/BitcoinTool.B!DNS",
  "Severity": 8,
  "Resource": {
    "ResourceType": "Instance",
    "InstanceDetails": {
      "InstanceId": "i-0abc123def4567890",
      "InstanceType": "c6i.8xlarge",
      "NetworkInterfaces": [
        { "PublicIp": "203.0.113.77", "VpcId": "vpc-0a1b2c3d", "SubnetId": "subnet-0e5f6a7b" }
      ],
      "Tags": [{ "Key": "Env", "Value": "prod" }]
    }
  },
  "Service": {
    "ResourceRole": "ACTOR",
    "Action": {
      "ActionType": "DNS_REQUEST",
      "DnsRequestAction": { "Domain": "pool.example-mining.net", "Protocol": "UDP", "Blocked": false }
    },
    "Count": 431
  }
}
```

읽는 법이 앞의 핀딩과 어떻게 다른지가 핵심이다.

- `!DNS` 접미사와 `ActionType: "DNS_REQUEST"` — 탐지 근거가 **도메인 질의**다. 실제 채굴 트래픽을 본 게 아니라, 채굴 풀로 알려진 도메인을 *물어봤다*는 사실을 잡은 것이다. 그래서 **VPC 기본 Route 53 Resolver를 쓰지 않으면 이 핀딩은 아예 생기지 않는다.**
- `ResourceRole: "ACTOR"` — 이번엔 인스턴스가 **행위 주체**다. 앞 핀딩(`TARGET`)과 정반대이며, 이 필드 하나로 "당한 쪽인가 하는 쪽인가"가 갈린다.
- `Blocked: false` — Route 53 Resolver DNS Firewall 같은 통제로 차단되지 않고 질의가 성공했다는 뜻. 차단됐다면 위험도 판단이 달라진다.
- `InstanceType: "c6i.8xlarge"` + `Env: prod` — 큰 컴퓨트 인스턴스가 채굴에 쓰이고 있다. 비용 관점 피해도 즉시 발생 중이다.
- `Count: 431` — 일회성 오탐이 아니라 지속적 활동이다.

> 📚 **사례**: 2018년 공개된 테슬라 AWS 계정의 암호화폐 채굴 사건은 이 핀딩 유형이 현실에서 어떤 모습인지 보여준다. 인증이 걸려 있지 않은 쿠버네티스 관리 콘솔이 인터넷에 노출돼 있었고, 공격자가 그 안에서 자격증명을 얻어 클라우드 자원에 채굴 소프트웨어를 올렸다. 주목할 점은 공격자가 **탐지를 피하려고** 채굴 풀을 공개 풀 대신 자체 서버로 두고, 비표준 포트를 쓰고, CPU 사용률을 낮게 유지했다는 것이다. 즉 "CPU 100%를 보고 알아채겠지"라는 운영 감각은 이미 통하지 않는다. 이것이 GuardDuty처럼 **DNS·네트워크 평판과 행위 이상**을 동시에 보는 탐지가 필요한 이유이고, 동시에 커스텀 DNS resolver를 쓰는 환경에서 DNS 기반 핀딩이 사각지대가 되는 것이 왜 실질적 위험인지도 설명한다.

### 핀딩 유형 → 의미 → 1차 대응 매핑

시험에서 반복 등장하는 핀딩을 "무엇을 시사하는가"와 "무엇을 먼저 하는가"로 묶어 외우는 것이 가장 효율적이다.

| 핀딩 유형 | 시사하는 상황 | 먼저 할 일 |
|-----------|---------------|------------|
| `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS` | 인스턴스 역할 자격증명이 AWS 밖에서 사용됨 — 침해 확정에 가까움 | 세션 무효화 → 인스턴스 격리 → IMDSv2 확인 → 범위 산정 |
| `UnauthorizedAccess:EC2/SSHBruteForce` / `RDPBruteForce` | 관리 포트가 인터넷에 열려 무차별 대입을 받는 중 | SG에서 관리 포트 폐쇄, SSM Session Manager로 전환 |
| `UnauthorizedAccess:EC2/MetadataDNSRebind` | DNS 리바인딩으로 **IMDS(169.254.169.254)에 접근 시도** — SSRF 계열 | IMDSv2 강제(`HttpTokens=required`), 홉 제한 축소, 앱 SSRF 점검 |
| `CryptoCurrency:EC2/BitcoinTool.B!DNS` | 인스턴스가 채굴 풀 도메인을 질의 — 대개 이미 침해됨 | 격리 → 스냅샷 → 초기 침투 경로 추적(비용 피해도 진행 중) |
| `Backdoor:EC2/C&CActivity.B!DNS` | 명령·제어(C2) 서버와 통신 시도 | 즉시 격리, 네트워크 아웃바운드 차단, 포렌식 |
| `Trojan:EC2/DNSDataExfiltration` | DNS 질의에 데이터를 실어 내보내는 유출 기법 | 격리, DNS Firewall 적용, 유출 범위 산정 |
| `Recon:IAMUser/UserPermissions`(및 `ResourcePermissions`, `NetworkPermissions`) | 자격증명이 권한 구조를 훑는 중 — **침투 직후 정찰** 단계 | 해당 주체의 최근 활동 전수 조사, 세션 검토 |
| `PrivilegeEscalation:IAMUser/AdministrativePermissions` | 주체가 자신에게 관리자급 권한을 붙이려 함 | 즉시 권한 변경 되돌리기, 주체 차단, 변경 이력 추적 |
| `Persistence:IAMUser/*` | 새 사용자·키·역할 등 **재진입 경로**를 심는 중 | 새로 생성된 자격증명·역할 전수 확인 후 제거 |
| `Stealth:IAMUser/CloudTrailLoggingDisabled` | **감사 로그를 끄려는 시도** — 흔적 지우기 | 로깅 즉시 복구, 조직 SCP로 재발 차단, 최우선 조사 |
| `Policy:IAMUser/RootCredentialUsage` | 루트 자격증명이 사용됨 | 사용 사유 확인, 루트 MFA·사용 금지 정책 점검 |
| `Exfiltration:S3/AnomalousBehavior` / `ObjectRead.Unusual` | 평소와 다른 규모·주체의 S3 읽기 | 주체·버킷 확인, 데이터 민감도 판단(Macie 연계) |
| `Discovery:S3/BucketEnumeration.Unusual` | 버킷 목록을 훑는 정찰 | 자격증명 출처 확인, 권한 축소 |
| `PenTest:IAMUser/KaliLinux` | 침투 테스트 배포판의 사용자 에이전트로 API 호출 | 승인된 모의해킹인지 확인 — 아니면 침해 |
| `Impact:EC2/PortSweep` | 인스턴스가 외부를 향해 포트 스윕 — **우리 자산이 공격 발판이 됨** | 격리, 아웃바운드 차단, 침해 조사 |

> 🎯 **시나리오**: "GuardDuty가 `Recon:IAMUser/UserPermissions`에 이어 `PrivilegeEscalation:IAMUser/AdministrativePermissions`, 그리고 `Persistence:IAMUser/*`를 순서대로 냈다"는 상황이 나오면, 이는 개별 알림 세 건이 아니라 **하나의 침해가 킬체인을 따라 진행 중**이라는 뜻이다 — 정찰 → 권한 상승 → 지속성 확보. 이때 "각 핀딩을 개별 티켓으로 처리한다"는 답은 오답이고, 정답은 **동일 주체·IP 기준으로 묶어 단일 인시던트로 격상**하고(Detective finding group, Security Hub 상관), 자격증명 무효화와 새로 생성된 지속성 아티팩트 제거를 함께 수행하는 것이다. ThreatPurpose를 ATT&CK 단계로 읽는 훈련이 여기서 값을 한다.

## 위협 인텔리전스: 알려진 악성 + 사용자 정의

GuardDuty는 AWS·서드파티(CrowdStrike, Proofpoint 등)가 큐레이션하는 위협 인텔 피드를 내장한다. 알려진 악성 IP·도메인과의 통신은 즉시 핀딩이 된다.

추가로 사용자가 직접 두 가지 리스트를 등록할 수 있다:
- **Trusted IP list(신뢰 IP)**: 이 IP들에서의 활동은 핀딩을 생성하지 않음(화이트리스트). 자사 사무실·VPN IP 등.
- **Threat IP list(위협 IP)**: 이 IP들과의 통신은 핀딩 생성(커스텀 블랙리스트). 자체 위협 인텔 통합.

```
GuardDuty 위협 평가
  ├─ AWS 큐레이션 인텔 (자동)
  ├─ Trusted IP list  → 매칭 시 핀딩 억제
  └─ Threat IP list   → 매칭 시 핀딩 생성
```

> ⚠️ **함정**: Trusted IP / Threat IP 리스트는 **위임 관리자(또는 개별 계정)** 수준에서 관리되며, 멤버 계정은 자체 리스트를 추가할 수 없다(조직 모드에서는 관리자가 중앙 관리). 또 GuardDuty는 *예방* 도구가 아니다 — Trusted IP에 넣어도 그 IP의 *접근을 허용*하는 게 아니라 *핀딩을 안 만드는* 것뿐이다. 접근 통제는 SG/NACL/WAF의 몫이다.

## 멀티계정: 위임 관리자(Delegated Administrator)

엔터프라이즈는 수십~수백 계정을 쓴다. GuardDuty를 계정마다 따로 켜고 따로 보는 것은 비현실적이다. **AWS Organizations + 위임 관리자** 패턴이 정답이다:

```
관리 계정(management) ──지정──▶ 위임 관리자 계정(보통 Security Tooling 계정)
                                      │
                                      ├─ 조직 전체 GuardDuty 활성화
                                      ├─ "Auto-enable for new accounts" 설정
                                      └─ 모든 멤버 핀딩을 중앙 집계·관리
```

- 관리 계정이 한 계정(권장: 별도 *Security Tooling* 계정)을 **GuardDuty 위임 관리자**로 지정.
- 위임 관리자는 조직 내 모든 계정에서 GuardDuty를 활성화하고, **자동 등록(auto-enable)**으로 신규 계정도 자동 포함.
- 멤버 계정의 핀딩은 위임 관리자 콘솔에 *집계*되어 단일 창에서 본다.

> 💡 **관련 이론**: 이는 AWS의 *멀티계정 보안 베이스라인* 모범사례다. 보안 도구(GuardDuty, Security Hub, Detective, Macie 등)는 워크로드 계정과 분리된 전용 *Security Tooling* 계정에 위임해, 워크로드 계정 관리자가 탐지를 끄거나 핀딩을 숨길 수 없게 한다(권한 분리). 위임 관리자 패턴은 관리 계정(루트 권한 집중)에 보안 운영 부담을 지우지 않으면서도 조직 전체 가시성을 준다.

> ⚠️ **함정**: 멤버 계정은 *자기 계정에서* GuardDuty를 비활성화할 수 없다(위임 관리자가 조직 모드로 강제 시). "신규 계정이 탐지 사각지대"라는 문제의 답은 **auto-enable 활성화**다. 또 위임 관리자 지정은 **관리 계정만** 할 수 있다.

### 실물 CLI: 켜기부터 조직 배포까지

콘솔 클릭은 시험에 나오지 않지만, CLI는 각 개념이 *어떤 단위로 존재하는지*를 드러내기 때문에 이해에 도움이 된다. 특히 GuardDuty의 모든 것이 **리전별 detector 하나**에 매달려 있다는 점이 CLI에서 명확해진다.

```bash
# 1) detector 생성 = 이 리전에서 GuardDuty 켜기.
#    detector는 리전마다 하나뿐이며, 이후 모든 명령이 detector-id를 요구한다.
aws guardduty create-detector \
  --enable \
  --finding-publishing-frequency FIFTEEN_MINUTES \
  --data-sources '{"S3Logs":{"Enable":true}}'

# 2) 지금 열려 있는 High 심각도 핀딩만 추리기 (severity 7 이상, 아직 아카이브 안 된 것)
DETECTOR=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)

aws guardduty list-findings \
  --detector-id "$DETECTOR" \
  --finding-criteria '{
    "Criterion": {
      "severity": { "GreaterThanOrEqual": 7 },
      "service.archived": { "Eq": ["false"] }
    }
  }' \
  --sort-criteria '{"AttributeName":"severity","OrderBy":"DESC"}'

# 3) 핀딩 본문 조회 — 위에서 본 JSON이 여기서 나온다
aws guardduty get-findings \
  --detector-id "$DETECTOR" \
  --finding-ids "ac1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d" \
  --query 'Findings[].{Type:Type,Sev:Severity,Actor:Service.ResourceRole,
                        Api:Service.Action.AwsApiCallAction.Api,
                        Ip:Service.Action.AwsApiCallAction.RemoteIpDetails.IpAddressV4,
                        Count:Service.Count}'
```

신뢰/위협 IP 목록은 S3에 올린 텍스트 파일을 가리키는 방식이다 — 목록 자체가 버전 관리 가능한 아티팩트가 된다.

```bash
aws guardduty create-ip-set \
  --detector-id "$DETECTOR" \
  --name corp-egress-ips --format TXT \
  --location s3://sec-intel-111122223333/trusted/corp-egress.txt \
  --activate

aws guardduty create-threat-intel-set \
  --detector-id "$DETECTOR" \
  --name internal-blocklist --format TXT \
  --location s3://sec-intel-111122223333/threat/blocklist.txt \
  --activate
```

조직 배포는 두 단계다. **관리 계정에서 위임**하고, **위임 관리자 계정에서 자동 활성화 정책**을 건다.

```bash
# (관리 계정에서 실행) 보안 계정을 GuardDuty 위임 관리자로 지정
aws guardduty enable-organization-admin-account --admin-account-id 999988887777

# (위임 관리자 계정에서 실행) 조직 전 계정 + 신규 계정 자동 포함
aws guardduty update-organization-configuration \
  --detector-id "$DETECTOR" \
  --auto-enable-organization-members ALL \
  --features '[{"Name":"RUNTIME_MONITORING","AutoEnable":"ALL"},
               {"Name":"EBS_MALWARE_PROTECTION","AutoEnable":"ALL"}]'
```

여기서 `--auto-enable-organization-members ALL`이 "기존 + 신규 전부", `NEW`가 "신규만", `NONE`이 "자동 활성화 안 함"이다. 시험에서 "신규 계정이 사각지대"라는 증상은 이 값이 `NEW`가 아니라 `NONE`이거나 아예 설정되지 않은 상태에 해당한다. 그리고 **보호 플랜(feature)마다 auto-enable을 따로 지정해야 한다** — 기초 GuardDuty만 자동으로 켜지고 Runtime Monitoring은 켜지지 않는 반쪽 배포가 흔한 실수다.

```
[ 멀티계정 GuardDuty 배선 ]

 Organizations 관리 계정
   │  enable-organization-admin-account (이 명령만 관리 계정 전용)
   ▼
 Security Tooling 계정 = GuardDuty 위임 관리자
   │  update-organization-configuration --auto-enable-organization-members ALL
   │  + feature별 AutoEnable (Runtime / Malware / EKS / RDS / Lambda)
   │
   ├── 멤버 계정 A (워크로드)  ─── 핀딩 ──┐
   ├── 멤버 계정 B (워크로드)  ─── 핀딩 ──┤
   └── 신규 계정 N (자동 등록) ─── 핀딩 ──┤
                                          ▼
                        위임 관리자 콘솔 = 전 계정 단일 핀딩 뷰
                                          │
                                          └─▶ Security Hub / EventBridge

 ※ 멤버 계정은 자기 detector를 끄지 못한다 = 워크로드 팀이 탐지를 무력화할 수 없다.
 ※ 리전마다 detector가 따로 있다 = 위임·auto-enable도 리전마다 적용해야 한다.
```

> ⚠️ **함정**: 위 다이어그램의 마지막 줄이 실무·시험 양쪽의 단골 사각지대다. **GuardDuty는 리전 서비스**이므로 서울 리전에 아무리 잘 배포해도 쓰지 않는 리전에서 벌어지는 활동은 보이지 않는다. 공격자가 평소 사용하지 않는 리전에서 인스턴스를 띄워 채굴하는 것은 고전적인 수법이며, 그래서 "쓰지 않는 리전에도 GuardDuty를 켠다"는 것이 베이스라인 권고다(비활동 리전은 분석할 데이터가 거의 없어 비용도 미미하다). 리전 자체를 막고 싶다면 그건 SCP(`aws:RequestedRegion` 조건)의 몫이며, 탐지와 예방을 각각 걸어야 한다.

### 운영: 노이즈를 줄이지 않으면 탐지는 실패한다

핀딩이 하루 수백 건 쌓이면 아무도 보지 않게 되고, 그 순간 GuardDuty는 켜져 있으나 없는 것과 같아진다. 노이즈 관리 수단은 세 가지이며 **성격이 다르다는 점**이 중요하다.

| 수단 | 하는 일 | 적절한 용도 | 위험 |
|------|---------|-------------|------|
| **Trusted IP list** | 해당 IP 관련 핀딩을 **아예 생성하지 않음** | 자사 사무실·VPN·모니터링 스캐너 출발지 | 그 IP가 침해되면 완전 무음 — 가장 위험한 선택 |
| **억제 규칙(filter + auto-archive)** | 핀딩은 *생성되되* 자동으로 아카이브 | 승인된 취약점 스캐너의 `Recon:EC2/Portscan` 등 | 조건이 넓으면 진짜 위협까지 묻힘 |
| **archive-findings** | 개별 핀딩을 사후에 닫음 | 조사 완료한 건의 정리 | 사후 조치라 재발 시 다시 뜸 |

```bash
# 승인된 내부 취약점 스캐너가 만드는 포트스캔 핀딩만 자동 아카이브
aws guardduty create-filter \
  --detector-id "$DETECTOR" \
  --name suppress-approved-scanner \
  --action ARCHIVE \
  --finding-criteria '{
    "Criterion": {
      "type": { "Eq": ["Recon:EC2/Portscan"] },
      "resource.instanceDetails.tags.value": { "Eq": ["security-scanner"] }
    }
  }'
```

> 🔍 **더 깊이**: Trusted IP list와 억제 규칙 중 무엇을 쓸지는 "나중에 그 사실을 알고 싶은가"로 결정한다. Trusted IP는 **증거 자체를 남기지 않는다** — 나중에 그 IP가 침해되어 조사할 때 "이 IP에서 무슨 일이 있었나"를 GuardDuty 핀딩으로는 되짚을 수 없다. 억제 규칙은 핀딩을 만들되 아카이브만 하므로, 필터를 풀면 과거 핀딩이 그대로 보인다. 그래서 실무 권고는 **가능한 한 억제 규칙을 쓰고 Trusted IP는 최소화**하는 것이다. 이는 로깅 일반의 원칙과 같다 — *보지 않기로 결정하는 것*과 *기록하지 않기로 결정하는 것*은 전혀 다른 무게를 가진다. 전자는 되돌릴 수 있고 후자는 되돌릴 수 없다.

> ⚠️ **함정**: 핀딩 발행 주기(`finding-publishing-frequency`)는 **기존 핀딩의 후속 발생**에만 적용된다. 기본값은 6시간이고 15분·1시간으로 줄일 수 있는데, **완전히 새로운 핀딩은 주기와 무관하게 즉시 EventBridge로 발행된다.** "자동 대응이 6시간 늦게 돈다"는 증상은 새 핀딩이 아니라 *반복 핀딩*을 트리거로 삼았을 때 나온다. 자동 격리 같은 즉시성이 필요한 대응을 설계할 때 이 차이를 모르면 파이프라인이 조용히 느려진다.

## 핀딩이 나온 뒤: 자동화 연계

핀딩은 보는 것으로 끝나면 안 된다. GuardDuty는 핀딩을 **Amazon EventBridge**로 발행한다(거의 실시간). 이를 트리거로:

```
GuardDuty Finding ──▶ EventBridge Rule ──▶ Lambda(격리/스냅샷/태깅)
                                        ├─▶ SNS(알림)
                                        ├─▶ Step Functions(대응 워크플로)
                                        └─▶ Security Hub(집계, 자동 통합)
```

예: `UnauthorizedAccess:EC2/SSHBruteForce` 핀딩 → EventBridge → Lambda가 해당 EC2를 격리 SG로 이동 + 포렌식 스냅샷 + 티켓 생성. 신규 핀딩은 EventBridge에 즉시, 기존 핀딩의 후속 발생은 기본 6시간(설정 가능 15분~) 간격으로 집계 발행된다.

> 🔍 **더 깊이**: GuardDuty 핀딩의 가치는 *상관(correlation)*과 *대응(response)*으로 완성된다. 단일 핀딩은 노이즈일 수 있으나, Detective로 조사하고(Day 2), Security Hub로 다른 탐지 결과와 상관하고(Day 4), EventBridge로 자동 대응을 걸 때 운영 가치를 낸다. GuardDuty를 "알람 생성기"로만 보면 절반만 쓰는 것이다 — 탐지→조사→대응의 파이프라인 입구로 설계해야 한다.

## 자주 틀리는 구분

- **GuardDuty vs CloudTrail**: CloudTrail은 *로그를 기록*, GuardDuty는 *로그를 분석해 위협 판단*. CloudTrail이 원천, GuardDuty가 해석자.
- **GuardDuty vs Inspector**: GuardDuty는 *런타임 위협*(지금 일어나는 악성 활동), Inspector는 *취약점*(악용 가능한 약점). 탐지 시점이 다르다(Day 3).
- **GuardDuty vs Macie**: Macie는 S3의 *민감 데이터(PII) 분류*, GuardDuty는 위협 행위. 목적이 다르다.
- **GuardDuty vs WAF/SG**: GuardDuty는 탐지(detect)만, 차단(prevent)은 안 한다. 차단은 다른 통제와 자동화로.
- **GuardDuty vs Security Lake/CloudTrail Lake**: 후자는 로그를 *모아 보관·질의*하는 데이터 계층, GuardDuty는 *판단*하는 분석 계층. GuardDuty는 원본 로그를 사용자에게 돌려주지 않는다.

## 정리하며

GuardDuty를 한 문장으로 요약하면 **"켜면 켜지는 관리형 위협 탐지"**지만, 실제 역량은 그 뒤에 있다. 켜는 것은 시작이고, 시험이 묻는 것은 대개 다음 네 가지 판단이다.

1. **가시성의 경계** — 기초 소스(CloudTrail·Flow·DNS)만으로는 호스트 내부도, 디스크의 멀웨어도, 쿠버네티스 API도 보이지 않는다. "무엇이 안 보이는가"에서 어떤 보호 플랜을 켤지가 결정된다. 그리고 커스텀 DNS resolver·비사용 리전처럼 *구성 때문에* 생기는 사각지대는 서비스를 켠다고 사라지지 않는다.
2. **핀딩 읽기** — `ThreatPurpose:Resource/Family.Mechanism!Artifact`라는 이름과 `Severity`·`ResourceRole`·`Action`·`Count` 몇 필드만으로 "당한 쪽인가 하는 쪽인가", "무엇을 근거로 탐지했나", "일회성인가 진행 중인가"가 읽힌다. 이 읽기가 곧 1차 대응 결정이다.
3. **역할의 한계** — GuardDuty는 탐지만 한다. 차단은 SG/NACL/WAF/DNS Firewall, 조사는 Detective, 집계는 Security Hub, 조치는 EventBridge 뒤의 자동화가 맡는다. Trusted IP는 *접근 허용*이 아니라 *핀딩 억제*라는 구분도 같은 맥락이다.
4. **조직 규모의 배포** — 위임 관리자(Security Tooling 계정) + auto-enable + 보호 플랜별 자동 활성화 + 전 리전. 이 네 가지가 갖춰져야 "조직 전체가 탐지되고 있다"고 말할 수 있다.

Capital One의 자격증명 유출도, 테슬라 계정의 채굴도, 그것을 *알아채는 데 걸린 시간*이 피해 규모를 결정했다. 탐지의 가치는 공격을 막는 데 있지 않고 **공격이 진행되는 시간을 줄이는 데** 있다 — 이 관점이 week9 전체를 관통한다.

## 한 줄 요약 체크리스트

- [ ] GuardDuty를 조직 위임 관리자(Security Tooling 계정)에서 켜고 auto-enable 했는가
- [ ] DNS 기반 탐지를 위해 VPC 기본 Route 53 Resolver를 쓰는가
- [ ] 호스트 내부 위협이 필요하면 Runtime Monitoring을, 멀웨어는 Malware Protection을 켰는가
- [ ] 핀딩을 EventBridge로 받아 알림·자동 대응에 연결했는가
- [ ] Trusted/Threat IP 리스트를 위협 인텔에 맞게 관리하는가

---

## 📝 연습 문제

**문제 1.** 보안팀이 50개 계정 조직에서 GuardDuty를 운영하려 한다. 신규로 생성되는 계정이 자동으로 탐지에 포함되고, 워크로드 계정 관리자가 GuardDuty를 끄지 못하게 하려면?

A) 관리 계정에서만 GuardDuty를 켜고 다른 계정은 수동 초대  
B) 별도 Security Tooling 계정을 GuardDuty 위임 관리자로 지정하고 조직 모드로 auto-enable을 켠다  
C) 각 계정 관리자에게 GuardDuty를 켜도록 이메일로 요청  
D) CloudTrail만 조직 추적으로 켜면 GuardDuty가 자동 활성화된다  

**정답: B**  
해설: 멀티계정 베이스라인의 정답은 전용 Security Tooling 계정을 위임 관리자로 지정하고 조직 모드 + auto-enable로 신규 계정까지 자동 포함하는 것이다. 조직 모드에서는 위임 관리자가 멤버 계정의 GuardDuty를 중앙 관리하므로 워크로드 관리자가 임의로 끌 수 없다. 수동 초대·이메일 요청은 누락·사각지대를 낳고, CloudTrail을 켠다고 GuardDuty가 자동으로 켜지지는 않는다.

---

**문제 2.** EC2 인스턴스 안에서 실행 중인 악성 프로세스와 파일 변경을 GuardDuty로 탐지하고 싶다. 기초 GuardDuty만으로는 보이지 않았다. 무엇을 해야 하는가?

A) VPC Flow Logs를 별도로 S3에 저장한다  
B) GuardDuty Runtime Monitoring을 활성화한다  
C) CloudTrail 데이터 이벤트를 켠다  
D) Inspector를 활성화한다  

**정답: B**  
해설: 기초 GuardDuty는 네트워크 흐름·DNS·API 관점만 분석하므로 호스트 *내부*의 프로세스·파일 행위는 보지 못한다. 호스트 런타임 가시성은 경량 에이전트를 배포하는 Runtime Monitoring이 제공한다. Flow Logs 저장은 GuardDuty 동작과 무관하고, CloudTrail 데이터 이벤트는 API/S3 관점이며, Inspector는 런타임 위협이 아닌 취약점 스캔 도구다.

---

**문제 3.** GuardDuty가 DNS 기반 데이터 유출(DNS exfiltration) 핀딩을 전혀 생성하지 않는다. 조사 결과 해당 VPC는 커스텀 외부 DNS resolver를 사용한다. 원인은?

A) GuardDuty는 DNS를 분석하지 않는다  
B) DNS 기반 탐지는 VPC 기본 Route 53 Resolver를 사용할 때만 동작하므로, 외부 resolver 사용 시 사각지대가 된다  
C) DNS exfiltration 핀딩은 유료 플랜에만 있다  
D) Trusted IP 리스트에 모든 IP가 등록되어 있다  

**정답: B**  
해설: GuardDuty의 DNS 쿼리 분석은 VPC 기본 DNS(Route 53 Resolver)를 통과하는 질의에만 적용된다. 커스텀/외부 DNS resolver를 사용하면 GuardDuty가 DNS 질의를 볼 수 없어 DNS 기반 핀딩이 누락된다. GuardDuty는 기초 소스로 DNS를 분석하므로 A는 틀리고, DNS exfiltration은 기초 핀딩이며, 모든 IP를 신뢰 목록에 넣는 비정상 구성은 시나리오와 무관하다.

---

**문제 4.** `CryptoCurrency:EC2/BitcoinTool.B!DNS` 핀딩이 발생했다. 이 핀딩이 알려주는 것과 가장 적절한 1차 대응은?

A) EC2가 비트코인 채굴/통신 활동을 보이며, EventBridge로 해당 인스턴스 격리·스냅샷 자동화를 트리거한다  
B) 단순 정보성 핀딩이므로 무시한다  
C) S3 버킷이 공개되었다는 의미다  
D) IAM 사용자의 권한이 과도하다는 의미다  

**정답: A**  
해설: 핀딩 명명 규칙상 ThreatPurpose가 CryptoCurrency, 대상이 EC2, DNS 기반 탐지(`.B!DNS`)이므로 인스턴스가 암호화폐 채굴/관련 도메인과 통신 중임을 뜻한다 — 흔히 침해의 강한 신호다. 적절한 대응은 핀딩을 EventBridge로 받아 인스턴스 격리·포렌식 스냅샷·티켓팅을 자동화하는 것이다. 무시는 위험하고, S3 공개나 IAM 과다 권한은 다른 핀딩 유형(Policy:S3, Recon:IAMUser 등)이다.

---

**문제 5.** GuardDuty의 Trusted IP list에 대한 설명으로 옳은 것은?

A) 등록된 IP로부터의 접근을 네트워크 수준에서 허용(allow)한다  
B) 등록된 IP의 활동에 대해 GuardDuty가 핀딩을 생성하지 않도록 억제하지만, 접근 자체를 허용하는 통제는 아니다  
C) 등록된 IP와의 통신을 무조건 차단한다  
D) 멤버 계정마다 자유롭게 추가할 수 있다  

**정답: B**  
해설: Trusted IP list는 해당 IP의 활동에 대한 핀딩 생성을 억제하는 탐지 측 설정일 뿐, 접근 허용/차단 같은 네트워크 예방 통제가 아니다. 접근 통제는 SG/NACL/WAF의 역할이다. 통신을 차단하는 것은 Threat IP list의 핀딩 생성과도 다른 개념이며, 조직 모드에서 이 리스트는 위임 관리자가 중앙 관리하므로 멤버가 임의 추가하지 못한다.

---

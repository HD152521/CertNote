# Day 2 - Amazon Detective: 핀딩 조사·근본원인, 동작 그래프, GuardDuty 연계

GuardDuty가 "무언가 잘못됐다"고 알려주면, 그 다음 질문은 항상 같다: **"정말 침해인가? 어디까지 번졌나? 어떻게 시작됐나?"** 이 *조사(investigation)* 단계가 Amazon Detective의 영역이다. GuardDuty가 *탐지(detect)*라면 Detective는 *조사(investigate)*다 — 핀딩 하나를 받아 그 주변의 행위 전체를 시각화하고, 근본 원인(root cause)과 영향 범위(blast radius)를 추적한다.

Detective의 핵심은 "흩어진 로그를 분석가가 손으로 짜맞추는 SQL 노가다를, 자동으로 구축된 **동작 그래프(behavior graph)**로 대체한다"는 것이다. 인시던트 조사에서 가장 비싼 자원은 분석가의 시간이다. Detective는 평소(수십 일치)의 데이터를 미리 그래프로 연결·집계해두어, 핀딩이 나온 순간 분석가가 "이 IAM 역할이 평소와 다르게 행동했나?", "이 IP는 언제부터 우리 환경과 통신했나?"를 클릭 몇 번으로 답하게 한다.

## 무엇을 먹고 무엇을 만드는가

Detective는 GuardDuty와 유사한 소스를 *조사 목적으로* 다시 수집·연결한다:

```
입력 소스
  ├─ VPC Flow Logs
  ├─ CloudTrail 관리 이벤트
  ├─ GuardDuty 핀딩
  ├─ EKS 감사 로그
  └─ (Detective가 내부적으로 정규화·연결)

출력
  └─ Behavior Graph(동작 그래프): 엔티티(Entity) + 관계(Relationship)
```

- **엔티티(Entity)**: IAM 사용자/역할, EC2 인스턴스, IP 주소, AWS 계정, 컨테이너, 유저 에이전트, S3 버킷 등 — 조사 대상이 되는 "노드".
- **관계(Relationship)**: "이 역할이 이 인스턴스에서 assume 됐다", "이 IP가 이 인스턴스와 통신했다" 같은 "엣지".

Detective는 이 그래프에 **시간축 + 베이스라인**을 입힌다. 즉 각 엔티티의 *평소 행동 프로파일*을 만들어두고, 핀딩 시점의 행동이 평소 대비 얼마나 벗어났는지를 보여준다.

> 💡 **관련 이론**: 이것이 보안 운영의 *triage(분류)*와 *root cause analysis*를 데이터로 푸는 방식이다. 전통적 SIEM은 분석가가 쿼리를 직접 작성해 상관관계를 찾지만, Detective는 *그래프 데이터 모델*로 엔티티 간 연결을 미리 구체화(materialize)해둔다. "이 자격증명이 처음 보는 지역에서 처음 보는 API를 호출했다" 같은 *최초 발생(first-time observation)*은 침해 조사의 핵심 신호인데, Detective는 이를 자동 하이라이트한다.

### 조사 도구를 고르는 축: 같은 로그, 다른 질문

CloudTrail·VPC Flow라는 *같은 원천*을 여러 서비스가 나눠 먹는다. 시험에서 이들을 구분하는 축은 데이터가 아니라 **답할 수 있는 질문의 형태**다.

| 도구 | 데이터를 어떻게 쥐고 있는가 | 잘 답하는 질문 | 못 하는 것 |
|------|---------------------------|----------------|-----------|
| **GuardDuty** | 스트림을 실시간 분석, 원본은 안 돌려줌 | "지금 악성 활동이 있는가" | 과거 임의 조건 질의 |
| **Detective** | 엔티티·관계 **그래프 + 베이스라인**을 미리 구축 | "이 주체가 평소와 뭐가 다른가", "어디까지 번졌나" | 핀딩 생성, 차단, 임의 SQL |
| **Athena(S3의 CloudTrail)** | 원본 파일을 그대로, 질의는 사용자가 작성 | "정확히 이 조건의 이벤트를 전부 뽑아라" | 베이스라인·관계 자동 제공 |
| **CloudTrail Lake** | 관리형 이벤트 데이터 저장소 + SQL | 장기 보존 감사 질의 | 시각적 관계 탐색 |
| **Security Lake** | OCSF 정규화된 중앙 데이터 레이크 | 서드파티 분석 도구에 데이터 공급 | 그 자체로는 조사 UI 아님 |

핵심 대비는 **Detective vs Athena**다. Athena는 "무엇을 물어야 할지 이미 아는" 분석가에게 강력하고, Detective는 **"무엇을 물어야 할지 모르는 첫 30분"**에 강력하다. 침해 조사의 초반은 언제나 후자다 — 무엇이 이상한지 모르는 상태에서 "이 역할의 평소 호출량은?", "이 IP는 언제 처음 나타났나?"를 즉답으로 얻는 것이 Detective의 값이다. 반대로 "특정 버킷에 대한 지난 90일간 모든 `GetObject`를 주체별로 집계"처럼 조건이 확정된 전수 조사는 Athena/CloudTrail Lake가 맞다.

> ⚠️ **함정**: "Detective로 90일 전 특정 API 호출을 SQL로 뽑아라" 같은 보기는 오답이다. Detective는 **질의 언어를 제공하지 않는다** — 미리 정해진 프로파일·타임라인·관계 뷰를 탐색하는 도구다. 반대로 "핀딩의 근본 원인과 영향 범위를 빠르게"에서 Athena를 고르는 것도 오답이다. 손으로 조인해야 하므로 *빠르게*라는 조건을 만족하지 못한다. 문제에 **"quickly / 빠르게 / 최소 운영 부담"**이 붙으면 관리형 그래프 쪽으로 기운다.

## 핀딩에서 조사로: 시각적 워크플로

조사는 보통 GuardDuty 핀딩 또는 Security Hub에서 시작해, "Investigate in Detective"로 점프한다:

```
GuardDuty 핀딩 (예: 비정상 API 호출)
   │  "Investigate in Detective"
   ▼
Detective: 해당 엔티티(IAM 역할) 프로파일 페이지
   ├─ API 호출량 시계열 (평소 vs 지금 — 급증?)
   ├─ 호출 위치(지역/IP) — 새 지역?
   ├─ 사용된 유저 에이전트 — 새 도구(예: 스크립트)?
   ├─ 연관 인스턴스·IP — 어디서 assume 됐나?
   └─ 시간 범위 슬라이더로 사건 전후 비교
```

분석가는 이 프로파일을 통해 "정상 운영의 우연한 급증"인지 "탈취된 자격증명의 악용"인지를 판단한다. 핵심 질문 패턴:
- **언제 처음 봤나** — 새 IP/지역/에이전트의 첫 등장 시점.
- **얼마나 벗어났나** — 호출량·실패율의 베이스라인 대비 편차.
- **어디까지 번졌나** — 한 엔티티에서 연결된 다른 엔티티(횡적 이동, lateral movement).

> ⚠️ **함정**: Detective는 *탐지*나 *차단*을 하지 않는다. 새 핀딩을 만들지 않고(그건 GuardDuty), 트래픽을 막지도 않는다(그건 WAF/SG). Detective는 *이미 있는* 핀딩·로그를 *조사·설명*하는 도구다. "위협을 자동 탐지하라"의 답은 GuardDuty이고, "핀딩의 근본 원인을 조사하라"의 답이 Detective다.

### 핀딩 한 건이 조사 질문 다섯 개로 분해되는 과정

Detective를 제대로 이해하려면 "핀딩의 어떤 필드가 그래프의 어떤 축이 되는가"를 봐야 한다. day1에서 본 자격증명 유출 핀딩을 다시 가져와, 각 필드가 조사에서 무엇으로 바뀌는지 따라가 보자.

```json
{
  "Type": "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS",
  "Severity": 8,
  "AccountId": "111122223333",
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
    "Action": {
      "ActionType": "AWS_API_CALL",
      "AwsApiCallAction": {
        "Api": "ListBuckets",
        "CallerType": "Remote IP",
        "RemoteIpDetails": {
          "IpAddressV4": "198.51.100.24",
          "Organization": { "Asn": "64500", "AsnOrg": "EXAMPLE-HOSTING" }
        }
      }
    },
    "EventFirstSeen": "2026-03-14T02:11:07Z",
    "EventLastSeen": "2026-03-14T02:29:52Z"
  }
}
```

| 핀딩의 필드 | Detective에서 무엇이 되는가 | 그래서 던지는 질문 |
|-------------|----------------------------|--------------------|
| `AccessKeyDetails.UserName: app-server-role` | **역할 엔티티**의 프로파일 페이지 | "이 역할의 평소 API 호출량·호출 목록은? 지금이 그 분포 안인가 밖인가" |
| `PrincipalId`의 `:i-0abc...` | 역할 ↔ **EC2 인스턴스** 엔티티 관계 | "이 역할은 원래 이 인스턴스에서만 assume 되나? 다른 곳에서도 됐나" |
| `RemoteIpDetails.IpAddressV4` | **IP 주소 엔티티** | "이 IP를 언제 처음 봤나? 이 IP가 우리 환경의 *다른* 역할·인스턴스와도 통신했나" |
| `AsnOrg: EXAMPLE-HOSTING` | IP 프로파일의 ASO(자율 시스템 조직) | "이 조직의 네트워크에서 온 호출이 과거에도 있었나 — 최초 등장인가" |
| `EventFirstSeen/LastSeen` | **시간 범위 스코프** | "이 18분 전후로 같은 엔티티가 무엇을 더 했나" |
| `Api: ListBuckets` | 역할 프로파일의 API 호출 분해 | "열거 다음에 실제 `GetObject`가 있었나 — 정찰에서 유출로 넘어갔나" |

여기서 결정적인 것은 **`ListBuckets` 다음에 무엇이 있었는가**다. 핀딩은 "열거를 했다"까지만 말하지만, 조사가 답해야 하는 것은 "그래서 무엇을 가져갔는가"다. 이 질문은 핀딩 안에 답이 없고, 같은 자격증명의 *전후 행위 전체*를 봐야만 답이 나온다 — 그것이 Detective의 존재 이유다.

> 🔍 **더 깊이**: 조사에서 가장 값비싼 판단은 "언제 멈출 것인가"다. 침해 범위 산정(scoping)은 자칫 무한히 확장된다 — 이 역할이 접근한 리소스, 그 리소스에 접근한 다른 주체, 그 주체가 만진 또 다른 리소스… 그래프는 원래 끝없이 뻗는다. 실무 조사는 **"침해 지표(IoC)가 끊기는 지점"**에서 멈춘다. 즉 공격자 IP·시간 창·자격증명이라는 세 축 중 어느 것과도 연결되지 않는 활동은 정상으로 간주하고 확장을 중단한다. Detective의 시간 범위 슬라이더와 엔티티 프로파일이 실질적으로 하는 일이 이 **경계 긋기**다. "언제까지 파야 하나"라는 질문에 데이터로 답을 주는 것이지, 그래프를 예쁘게 그려 주는 것이 목적이 아니다.

### 조사 지표(indicator): Detective가 자동으로 짚어 주는 이상 신호

Detective의 자동 조사는 대상 주체의 활동을 훑어 **지표(indicator)** 형태로 이상 신호를 뽑아낸다. 지표의 유형을 알면 "조사에서 무엇을 봐야 하는가"의 체크리스트가 된다.

| 지표 유형 | 무엇을 잡는가 | 왜 침해 신호인가 |
|-----------|---------------|------------------|
| **TTPs**(전술·기법) | MITRE ATT&CK 전술에 매핑되는 API 호출 패턴 | 정찰→권한상승→지속성의 *순서*가 보이면 우연이 아니다 |
| **새 지역(new geolocation)** | 이 주체가 처음 보는 지리적 위치에서 호출 | 자격증명이 원래 있어야 할 곳을 벗어남 |
| **새 ASO(new ASO)** | 처음 보는 자율 시스템 조직(호스팅 사업자 등)에서 호출 | 사무실·CI가 아닌 곳에서 온 호출 |
| **새 사용자 에이전트(new user agent)** | 처음 보는 SDK·CLI·스크립트 문자열 | 사람이 쓰던 도구가 아니라 공격 스크립트로 바뀜 |
| **플래그된 IP** | 위협 인텔에 등재된 IP와의 연결 | 알려진 악성 인프라 |
| **불가능한 이동(impossible travel)** | 물리적으로 불가능한 시간 간격의 지역 이동 | 같은 자격증명을 둘 이상이 동시에 쓰는 중 |
| **연관 핀딩/핀딩 그룹** | 같은 엔티티를 공유하는 다른 핀딩 | 단일 사건이 아니라 캠페인 |

> 💡 **관련 이론**: 이 지표들의 공통 문법은 **"최초 발생(first-time observation)"**이다. 보안 분석에서 "처음 보는 것"은 그 자체로 신호다 — 정상 운영은 반복적이고 공격은 새롭기 때문이다. 이것이 시그니처 기반 탐지가 놓치는 영역을 커버하는 이유이기도 하다. 공격 도구는 매번 바뀌지만 "이 자격증명이 이 지역에서 처음 쓰였다"는 사실은 도구와 무관하게 성립한다. 다만 대가가 있다 — 정상 변화(새 리전 확장, 새 CI 도입, 사무실 이전)도 똑같이 "처음"이므로, 지표는 **판정이 아니라 질문**으로 다뤄야 한다. 지표를 자동 차단의 트리거로 쓰면 정상 운영을 끊는다.

## GuardDuty와의 연계: 짝꿍 관계

Detective는 단독으로도 쓰지만, GuardDuty와 짝을 이룰 때 진가를 낸다:

```
GuardDuty (탐지)  ──핀딩──▶  Security Hub (집계)
     │                            │
     │  (둘 다 Detective 동작 그래프에 연결)
     ▼                            ▼
        Amazon Detective (조사)
        - GuardDuty 핀딩을 그래프 컨텍스트에 매핑
        - 핀딩 주변 행위 자동 수집·시각화
        - "이 핀딩이 다른 핀딩과 같은 자격증명/IP를 공유하나" 상관
```

- GuardDuty 핀딩이 Detective 그래프의 엔티티에 자동 연결되어, 핀딩 클릭 한 번으로 조사 컨텍스트로 진입.
- 여러 핀딩이 *같은 엔티티(IP, 역할)*를 공유하면 Detective가 이를 묶어 "캠페인" 수준으로 보게 함.
- **Finding groups**: Detective는 관련된 여러 핀딩·엔티티를 자동 그룹핑해 단일 조사 단위로 제시(개별 핀딩의 노이즈를 줄임).

> 💡 **관련 이론**: 이는 *alert fatigue(경보 피로)* 문제의 해법이다. 탐지 도구가 핀딩을 수백 개 쏟아내면 분석가는 마비된다. Detective의 finding group은 단일 공격 캠페인에서 파생된 다수 핀딩을 하나로 묶어 "조사할 단위"를 줄인다 — SOC 운영의 신호 대 잡음비를 높이는 핵심 메커니즘이다.

## 멀티계정 조사

Detective도 GuardDuty와 동일한 **Organizations + 위임 관리자** 모델을 쓴다. 권장 구성은 GuardDuty와 *같은* Security Tooling 계정을 Detective 위임 관리자로 지정하는 것이다:

```
관리 계정 ──지정──▶ Detective 위임 관리자(Security Tooling 계정)
                          │
                          └─ 조직 전 계정 데이터를 단일 동작 그래프로 통합
```

- 멤버 계정의 데이터가 *하나의* 동작 그래프에 모여, 계정 경계를 넘는 횡적 이동(예: 한 계정에서 탈취된 역할이 다른 계정 리소스에 접근)을 추적할 수 있다.
- GuardDuty·Security Hub·Detective의 위임 관리자를 동일 계정으로 정렬하면 조사 경험이 매끄럽다(데이터·권한 일관).

> ⚠️ **함정**: Detective를 켜면 즉시 풍부한 그래프가 생기는 게 아니다. 베이스라인을 형성하려면 **데이터 축적 기간(보통 2주 이상)**이 필요하다. "방금 Detective를 켰는데 과거 행위가 안 보인다"는 정상 — 활성화 *이후*부터 데이터를 쌓는다. 그래서 사고 *전에* 미리 켜두는 것이 모범이다.

```
[ 멀티계정 Detective 배선 ]

 Organizations 관리 계정
   │  enable-organization-admin-account  (관리 계정 전용)
   ▼
 Security Tooling 계정 = Detective 위임 관리자
   │  behavior graph 1개 (리전별)
   │  update-organization-configuration --auto-enable
   │
   ├── 멤버 계정 A ──┐
   ├── 멤버 계정 B ──┼── 로그·핀딩이 하나의 그래프로 병합
   └── 신규 계정 N ──┘
                    │
                    ▼
   계정 경계를 넘는 관계가 "보인다"
     예) 계정 A에서 탈취된 역할 → 계정 B 리소스 접근
         계정별 그래프였다면 이 엣지는 존재조차 하지 않는다

 ※ GuardDuty·Security Hub·Inspector의 위임 관리자와 같은 계정으로 정렬한다.
 ※ 그래프도 리전별이다 — 조사할 리전마다 Detective를 켜야 한다.
```

### 실물 CLI: 그래프 생성부터 자동 조사까지

```bash
# 1) 이 리전에 동작 그래프 생성 = Detective 켜기 (그래프는 리전당 하나)
aws detective create-graph --tags Owner=security-tooling

GRAPH=$(aws detective list-graphs --query 'GraphList[0].Arn' --output text)

# 2) (관리 계정) 보안 계정을 Detective 위임 관리자로 지정
aws detective enable-organization-admin-account --account-id 999988887777

# 3) (위임 관리자) 신규 조직 계정을 그래프에 자동 편입
aws detective update-organization-configuration \
  --graph-arn "$GRAPH" --auto-enable

# 4) 특정 IAM 역할에 대한 자동 조사 시작 — 사건 시간 창을 지정한다
aws detective start-investigation \
  --graph-arn "$GRAPH" \
  --entity-arn "arn:aws:iam::111122223333:role/app-server-role" \
  --scope-start-time 2026-03-14T00:00:00Z \
  --scope-end-time   2026-03-14T06:00:00Z

# 5) 조사 결과 요약과 지표 확인
aws detective get-investigation \
  --graph-arn "$GRAPH" --investigation-id "in-abc123def456"

aws detective list-indicators \
  --graph-arn "$GRAPH" --investigation-id "in-abc123def456"
```

`list-indicators`가 돌려주는 형태를 읽는 연습이 곧 조사 능력이다.

```json
{
  "investigationId": "in-abc123def456",
  "indicators": [
    {
      "indicatorType": "NEW_ASO",
      "indicatorDetail": {
        "newAsoDetail": { "aso": "EXAMPLE-HOSTING", "isNewForEntireAccount": true }
      }
    },
    {
      "indicatorType": "TTP_OBSERVED",
      "indicatorDetail": {
        "tTPsObservedDetail": {
          "tactic": "Discovery", "technique": "Cloud Infrastructure Discovery",
          "apiName": "ListBuckets", "apiSuccessCount": 12, "apiFailureCount": 0
        }
      }
    },
    {
      "indicatorType": "IMPOSSIBLE_TRAVEL",
      "indicatorDetail": {
        "impossibleTravelDetail": {
          "startingIpAddress": "203.0.113.10", "endingIpAddress": "198.51.100.24",
          "hourlyTimeDelta": 1
        }
      }
    }
  ]
}
```

세 지표가 함께 나왔다는 사실이 개별 지표보다 훨씬 강한 결론을 만든다.

- `NEW_ASO` + `isNewForEntireAccount: true` — 이 호스팅 사업자 네트워크에서 온 호출은 **계정 전체 역사에서 처음**이다. 이 역할만의 이례가 아니라 계정 차원의 이례라는 뜻이라 훨씬 무겁다.
- `TTP_OBSERVED`의 `tactic: Discovery` + `apiFailureCount: 0` — 정찰 단계이며 **실패 없이 다 성공했다**. 실패가 많으면 권한 없는 자의 더듬기이지만, 실패가 0이면 이 자격증명이 그 권한을 실제로 갖고 있다는 뜻이다. 즉 최소 권한이 지켜지지 않았다는 부수적 발견이기도 하다.
- `IMPOSSIBLE_TRAVEL`, 시간 간격 1시간 — 같은 자격증명이 물리적으로 오갈 수 없는 두 지점에서 사용됐다. **정상 사용자와 공격자가 동시에 같은 자격증명을 쓰고 있다**는 강한 증거이며, 이는 "레거시 배치가 갑자기 튀었다" 같은 양성 해석을 사실상 배제한다.

> 🎯 **시나리오**: "GuardDuty 핀딩 하나를 두고 팀이 '정상 배치 작업이 급증한 것 아니냐'와 '침해다'로 갈렸다. 최소한의 시간으로 판정하라"가 나오면, 답은 **해당 주체에 대해 Detective 조사를 열어 지표를 확인**하는 것이다. 특히 `IMPOSSIBLE_TRAVEL`이나 `NEW_ASO`가 계정 전체 기준 최초로 뜨면 정상 운영 가설은 무너진다. 여기서 "CloudTrail을 Athena로 쿼리해 확인한다"는 답은 *가능하지만 느리다* — 문제에 "빠르게/운영 부담 최소"가 붙어 있으면 오답 처리된다. 반대로 "GuardDuty 핀딩을 하나 더 기다린다"는 답은 대응 시간을 공격자에게 그냥 내주는 선택이다.

### 조사 플레이북: 탈취 의심 자격증명 30분

도구를 아는 것과 순서를 아는 것은 다르다. 자격증명 침해 의심 상황의 표준 순서는 다음과 같으며, 각 단계가 어느 서비스의 일인지가 시험의 실질 내용이다.

```
0분  핀딩 수신              GuardDuty → EventBridge → 온콜
     ↓
2분  1차 판정               핀딩 Type·ResourceRole·Count로 "당한 쪽/하는 쪽" 결정
     ↓
5분  봉쇄(containment)      역할 세션 무효화 · 인스턴스 격리 SG (종료 금지)
     ↓                      ※ 조사보다 봉쇄가 먼저다 — 조사 중에도 유출은 계속된다
10분 범위 산정(scoping)     Detective: 엔티티 프로파일 · 지표 · 시간 창 전후
     ↓
20분 횡적 이동 확인         Detective: 같은 IP·같은 역할이 닿은 다른 엔티티
     ↓                      계정 경계를 넘었는지 = 단일 그래프여야 보인다
25분 데이터 영향 판정       접근된 S3 버킷의 민감도 → Macie 분류 결과와 대조
     ↓
30분 근절·복구             자격증명 회전, 초기 침투 경로 차단(IMDSv2·패치·SG)
     ↓
사후  재발 방지             SCP·Config 규칙·탐지 규칙 보강, 타임라인 문서화
```

> ⚠️ **함정**: 이 순서에서 가장 자주 틀리는 것이 **봉쇄와 조사의 선후**다. "근본 원인을 먼저 파악한 뒤 조치한다"는 문장은 그럴듯하지만 실무·시험 모두에서 오답이다. 조사에는 시간이 걸리고 그동안 공격자는 계속 활동한다. 정답의 형태는 항상 **"되돌릴 수 있는 봉쇄를 먼저, 조사는 병행"**이다 — 세션 무효화와 격리 SG 이동은 오판이어도 복구 가능하지만, 유출된 데이터는 되돌릴 수 없다. 반대로 *되돌릴 수 없는* 조치(인스턴스 종료, 볼륨 삭제)를 조사 전에 하는 것도 오답이다. 기준은 "빠르게"가 아니라 **"가역적인가"**다.

> 📚 **사례**: 2021년 Codecov의 bash 업로더 변조 사건은 조사 단계가 왜 별도의 역량인지 보여준다. 공격자는 CI에서 실행되는 스크립트에 한 줄을 심어, 빌드 환경의 환경변수(즉 여러 고객사의 클라우드 자격증명·토큰)를 외부로 보냈다. 여기서 어려운 부분은 탐지가 아니라 **범위 산정**이었다 — "우리 CI가 그 스크립트를 언제부터 썼고, 그 기간에 어떤 시크릿이 환경변수로 있었으며, 그 시크릿으로 이후 무엇이 일어났는가"는 단일 알림으로 답할 수 없는 질문이다. 클라우드 쪽에서 이 질문에 답하는 방식이 정확히 Detective의 작업 형태다. 유출 의심 자격증명을 엔티티로 놓고, 유출 추정 시점 이후의 활동·최초 등장 IP·평소와 다른 API를 훑어 "실제로 사용됐는가"를 판정한다. 교훈은 명확하다. **자격증명이 유출됐다는 사실보다, 그것이 사용됐는지 여부가 대응의 규모를 결정한다.** 그리고 그 판정은 사고가 난 뒤에 도구를 켜서는 할 수 없다 — 유출 시점의 데이터가 그래프에 없기 때문이다.

## Detective Investigations(자동 조사)

최신 Detective는 IAM 사용자/역할에 대한 **자동 조사(Detective Investigations)**를 제공한다. 특정 자격증명을 지정하면, Detective가 MITRE ATT&CK 전술에 매핑해 의심 행위(권한 상승, 정찰 등)를 자동 분석하고 위험 요약을 생성한다. 분석가가 일일이 그래프를 파지 않아도 "이 역할이 위험한가"를 빠르게 판단할 단서를 준다.

> 🔍 **더 깊이**: 탐지-조사-대응 파이프라인에서 Detective의 위치를 정확히 잡는 것이 시험·실무 모두의 핵심이다. *탐지(GuardDuty)*는 "이상 신호"를, *집계(Security Hub)*는 "한 화면 모음"을, *조사(Detective)*는 "왜·어디까지·어떻게"를, *대응(EventBridge/Lambda/SSM)*은 "조치"를 담당한다. Detective를 "또 다른 탐지 도구"로 착각하면 시험에서 함정에 빠진다 — Detective는 핀딩을 *만들지 않고 설명한다*.

## 자주 틀리는 구분

- **Detective vs GuardDuty**: GuardDuty는 탐지(핀딩 생성), Detective는 조사(핀딩 설명·근본원인). Detective는 핀딩을 만들지 않는다.
- **Detective vs CloudTrail Lake/Athena**: Athena/CloudTrail Lake는 *수동 쿼리* 분석(SQL), Detective는 *미리 구축된 그래프*로 시각적 조사. Detective는 베이스라인·관계를 자동 제공.
- **Detective vs Security Hub**: Security Hub는 다수 도구의 핀딩을 *집계·표준화(ASFF)*, Detective는 *깊은 조사*. 집계 vs 심층.
- **Detective vs Inspector**: Inspector는 취약점(약점), Detective는 사건 조사(행위). 완전히 다른 축.
- **Detective vs Security Lake**: Security Lake는 로그를 OCSF로 정규화해 *공급*하는 데이터 레이크, Detective는 그 자체로 조사 UI를 제공하는 관리형 그래프. "서드파티 SIEM에 데이터를 넘겨라"면 Security Lake, "AWS 안에서 바로 조사하라"면 Detective.

## 정리하며

Detective를 시험 관점에서 붙잡는 문장은 하나다 — **"핀딩을 만들지 않고 설명한다."** 이 한 줄에서 나머지가 파생된다.

- 만들지 않으므로 **탐지 요구에는 답이 될 수 없고**(그건 GuardDuty), 차단도 하지 않는다(그건 SG/WAF).
- 설명하려면 **과거 데이터가 있어야** 하므로, 사고가 터진 뒤 켜면 늦다. "활성화 이후부터 축적"이라는 특성이 곧 "상시 켜 둔다"는 운영 원칙이 된다.
- 설명의 단위는 **엔티티와 관계**이므로, 계정 경계를 넘는 횡적 이동을 보려면 조직 전체가 **하나의 동작 그래프**에 들어와야 한다. 계정마다 따로 켠 Detective로는 그 엣지가 애초에 존재하지 않는다.
- 설명의 근거는 **베이스라인 대비 이탈**이므로, 지표는 판정이 아니라 질문이다. 새 지역·새 ASO·새 사용자 에이전트가 하나 뜬 것은 정상 변화일 수 있지만, 여럿이 겹치고 특히 *불가능한 이동*이 함께 뜨면 정상 가설은 무너진다.

그리고 조사 도구를 잘 쓰는 것보다 중요한 것이 순서다. **봉쇄는 조사보다 먼저, 단 가역적인 조치만.** 조사에 걸리는 시간만큼 공격자가 일하고, 되돌릴 수 없는 조치를 서두르면 증거가 사라진다. day3의 Inspector가 "터지기 전"을, 오늘의 Detective가 "터진 뒤"를 맡고, day4의 Security Hub가 둘을 한 화면에 묶는다.

## 한 줄 요약 체크리스트

- [ ] 사고 *전에* Detective를 켜 베이스라인을 미리 축적했는가
- [ ] GuardDuty·Security Hub와 같은 Security Tooling 계정에 Detective 위임 관리자를 정렬했는가
- [ ] 핀딩에서 "Investigate in Detective"로 조사 컨텍스트에 진입하는 워크플로를 갖췄는가
- [ ] finding group으로 관련 핀딩을 묶어 경보 피로를 줄이는가
- [ ] Detective를 탐지/차단이 아닌 조사 도구로 정확히 포지셔닝했는가

---

## 📝 연습 문제

**문제 1.** GuardDuty가 IAM 역할에 대한 비정상 API 호출 핀딩을 생성했다. 보안 분석가는 "이 자격증명이 언제부터 새 지역에서 활동했고, 어떤 리소스까지 접근했는지" 근본 원인과 영향 범위를 빠르게 파악하려 한다. 가장 적절한 도구는?

A) Amazon Inspector  
B) Amazon Detective  
C) AWS Config  
D) Amazon Macie  

**정답: B**  
해설: 핀딩의 근본 원인·영향 범위를 동작 그래프로 시각화해 "최초 발생 시점, 새 지역·IP, 연관 엔티티"를 추적하는 것은 Detective의 정확한 용도다. Inspector는 취약점 스캔, Config는 리소스 구성 이력, Macie는 S3 민감 데이터 분류로 모두 행위 기반 인시던트 조사와는 다른 목적이다.

---

**문제 2.** 팀이 침해 의심 후 Amazon Detective를 처음 활성화했는데, 사건 발생 이전의 풍부한 행위 데이터가 그래프에 보이지 않는다. 그 이유로 옳은 것은?

A) Detective가 잘못 구성되었다  
B) Detective는 활성화 이후부터 데이터를 축적하므로 베이스라인 형성에 시간이 필요하며, 사고 전 미리 켜두는 것이 모범이다  
C) Detective는 VPC Flow Logs만 분석하기 때문이다  
D) 위임 관리자를 지정하지 않았기 때문이다  

**정답: B**  
해설: Detective는 활성화 시점부터 데이터를 수집·연결하며 의미 있는 베이스라인을 만드는 데 보통 2주 이상이 걸린다. 따라서 사고가 터진 뒤 켜면 과거 컨텍스트가 부족하고, 사고 이전에 상시 켜두는 것이 정답이다. 구성 오류·소스 제한·위임 관리자 미지정 때문이 아니라 데이터 축적 특성 때문이다.

---

**문제 3.** Amazon Detective의 역할에 대한 설명으로 옳은 것은?

A) 자체적으로 새로운 위협 핀딩을 생성하고 악성 트래픽을 차단한다  
B) 기존 핀딩과 로그를 동작 그래프로 연결해 조사·근본원인 분석을 돕지만, 핀딩 생성이나 차단은 하지 않는다  
C) S3 버킷의 PII를 자동 분류한다  
D) EC2와 ECR의 CVE를 스캔한다  

**정답: B**  
해설: Detective는 조사 전용 도구로, GuardDuty가 만든 핀딩과 로그를 그래프로 묶어 "왜·어디까지·어떻게"를 분석한다. 핀딩 생성은 GuardDuty, 차단은 WAF/SG, PII 분류는 Macie, CVE 스캔은 Inspector의 역할이다. Detective를 탐지/차단 도구로 오인하는 것이 대표적 함정이다.

---

**문제 4.** SOC 분석가들이 GuardDuty 핀딩 폭증으로 경보 피로를 겪는다. Detective의 어떤 기능이 관련 핀딩·엔티티를 단일 조사 단위로 묶어 신호 대 잡음비를 높여 주는가?

A) Trusted IP list  
B) Finding groups  
C) Malware Protection  
D) Macie 분류  

**정답: B**  
해설: Detective의 finding groups는 같은 자격증명·IP 등 공통 엔티티를 공유하는 다수 핀딩을 하나의 조사 단위로 자동 그룹핑해 경보 피로를 줄인다. Trusted IP list는 GuardDuty의 핀딩 억제 설정이고, Malware Protection은 멀웨어 스캔, Macie는 데이터 분류로 핀딩 그룹핑과 무관하다.

---

**문제 5.** 한 계정에서 탈취된 IAM 역할이 다른 계정의 리소스에 접근한 횡적 이동(lateral movement)을, 계정 경계를 넘어 단일 화면에서 추적하려 한다. 가장 적절한 Detective 구성은?

A) 각 계정에서 Detective를 개별로 켜고 따로 조사  
B) Organizations 위임 관리자(Security Tooling 계정)로 모든 계정 데이터를 단일 동작 그래프에 통합  
C) Detective 대신 각 계정에서 CloudTrail을 Athena로 수동 쿼리  
D) GuardDuty만으로 충분하므로 Detective는 불필요  

**정답: B**  
해설: 계정 경계를 넘는 횡적 이동 추적은 모든 멤버 계정 데이터를 하나의 동작 그래프로 통합해야 가능하며, 이는 Organizations 위임 관리자 모델(GuardDuty·Security Hub와 동일 계정 정렬)로 달성한다. 계정별 개별 조사나 수동 Athena 쿼리는 통합 시야가 없어 비효율적이고, GuardDuty만으로는 깊은 조사·상관이 부족하다.

---

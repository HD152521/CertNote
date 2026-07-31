# Day 5 - Week 7 종합: 감사·구성 추적 시나리오 통합 복습

이번 주는 "사후에 진실을 재구성하는 능력" — 감사 추적(audit trail)을 다뤘다. 네 개의 기둥을 세웠다: **CloudTrail**(활동: 누가 무엇을 했나), **AWS Config**(구성: 리소스가 각 시점에 어떤 상태였나), **VPC Flow Logs·Resolver 쿼리 로그**(네트워크: 어떤 트래픽·DNS가 흘렀나), 그리고 **무결성·보존·중앙화**(이 증거를 신뢰할 수 있게 보관하는 법). 오늘은 이 조각들이 *하나의 침해 조사*에서 어떻게 맞물리는지를 시나리오로 엮는다.

> 📚 **사례**: 침해 대응 업계에서 오래 인용되는 통계적 사실이 하나 있다. 침해가 실제로 발생한 시점과 그것이 발견된 시점 사이의 간격 — 이른바 **체류 시간(dwell time)** — 이 여전히 수십 일 단위라는 것이다. 그리고 발견의 계기가 조직 내부의 탐지가 아니라 외부 통보(고객, 수사기관, 보안 연구자)인 경우가 상당한 비율을 차지한다. 이 두 사실을 겹쳐 놓으면 감사 로그의 진짜 요구사항이 나온다. **발견은 몇 달 뒤에 일어나고, 그때 우리가 가진 것은 그동안 쌓인 로그뿐이다.** 그래서 이번 주의 모든 설계 결정 — 데이터 이벤트를 미리 켜는 것, 보존 기간을 길게 잡는 것, 별도 계정에 격리하는 것 — 은 "오늘 유용한가"가 아니라 "석 달 뒤 아무 준비 없이 조사를 시작해야 할 때 유용한가"를 기준으로 판단해야 한다.

## 다섯 기둥 한눈에 정리

| 도구 | 답하는 질문 | 기본 활성화 | 핵심 함정 |
|------|------------|-----------|----------|
| CloudTrail 관리 이벤트 | 누가 제어 평면 API를 호출했나 | 예(Event history 90일) | 장기 보존은 trail 필요 |
| CloudTrail 데이터 이벤트 | 누가 객체/함수에 접근했나 | **아니오** | selector 추가·비용 |
| CloudTrail Lake | 코드 없이 SQL로 조사 | 아니오 | 최대 10년, 별도 비용 모델 |
| AWS Config | 리소스 상태·이력·관계 | 아니오(리전별) | 리전마다 recorder |
| VPC Flow Logs | IP 트래픽 메타데이터 | 아니오 | payload 없음, NAT 뒤 pkt-srcaddr |
| Resolver 쿼리 로그 | VPC 내 DNS 조회 | 아니오 | Resolver 우회 시 누락 |

### 각 도구가 답하지 *못하는* 질문

정답을 고르는 능력의 절반은 오답을 지우는 능력이다. 그리고 오답은 거의 항상 "그 도구가 답할 수 없는 질문에 그 도구를 가져다 붙인 것"이다.

| 질문 | 답하는 도구 | 자주 나오는 오답과 그 이유 |
|------|------------|---------------------------|
| 누가 이 보안 그룹을 열었나 | CloudTrail | Config — 상태는 알지만 행위자는 모른다 |
| 그게 며칠 동안 열려 있었나 | Config | CloudTrail — 점만 있고 구간이 없다 |
| 어떤 객체가 실제로 다운로드됐나 | CloudTrail **데이터 이벤트** | 관리 이벤트 — 객체 접근은 안 남는다 |
| 데이터가 얼마나 나갔나 | VPC Flow Logs | CloudTrail — 바이트 수를 모른다 |
| 패킷 안에 무엇이 있었나 | Traffic Mirroring | Flow Logs — 메타데이터뿐이다 |
| 어느 도메인으로 연결했나 | Resolver 쿼리 로그 | Flow Logs — IP만 있고 이름이 없다 |
| 인스턴스가 메타데이터에서 자격증명을 꺼냈나 | (Flow Log에 안 남음) | Flow Logs — 링크 로컬 통신은 기록 제외 |
| 이 로그가 변조되지 않았나 | 무결성 검증(digest) | 버전 관리 — 이력일 뿐 증명이 아니다 |
| 앞으로 이런 리소스를 못 만들게 하려면 | SCP·BPA(예방) | Config 교정 — 만들어진 뒤에 되돌릴 뿐 |

일곱 번째 줄이 특히 시험에서 잘 쓰인다. SSRF로 메타데이터에서 역할 자격증명을 훔쳐 가는 공격은 **네트워크 로그에 아무 흔적을 남기지 않고**, CloudTrail에는 "그 역할이 정상적으로 API를 호출했다"는 정상처럼 보이는 기록만 남는다. 이 조합에서 이상함이 드러나는 지점은 오직 하나 — *역할이 쓰인 위치*다. EC2 인스턴스 프로파일 역할의 자격증명이 그 인스턴스가 아닌 외부 IP에서 사용됐다면 그것이 유일하고 결정적인 신호다.

### 어떤 질문에 어떤 로그를 열 것인가

```
                        "무슨 일이 있었는가?"
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   제어 평면 질문           상태 질문              데이터 흐름 질문
   "누가 호출했나"        "어떤 구성이었나"       "무엇이 오갔나"
        │                       │                       │
   CloudTrail              AWS Config              VPC Flow Logs
   관리 이벤트             구성 타임라인            + Resolver 쿼리 로그
        │                       │                       │
        ├─ 객체·함수 접근?      ├─ 리소스 간 관계?      ├─ 도메인 맥락?
        │  → 데이터 이벤트      │  → relationships     │  → Resolver log
        │                       │                       │
        ├─ 실패한 시도?         ├─ 위반 여부?           ├─ 원본 인스턴스?
        │  → errorCode         │  → Config Rule       │  → pkt-srcaddr
        │                       │                       │
        └─ 이상 급증?           └─ 조직 전체?           └─ 나간 경로?
           → Insights             → Aggregator            → traffic-path

   ── 그리고 모든 가지의 전제:
      "그 로그가 켜져 있었고, 지워지지 않았고, 변조되지 않았는가"
      → 조직 트레일 · 별도 로깅 계정 · Object Lock · 무결성 검증
```

## 데이터 이벤트 vs 관리 이벤트: 끝까지 헷갈리지 말 것

가장 빈번한 시험 함정이다. 다음 표를 외워라:

| 작업 | 이벤트 종류 | 기본 기록? |
|------|-----------|-----------|
| `RunInstances`, `CreateBucket`, `AttachRolePolicy` | 관리(Management) | 예 |
| `ConsoleLogin`, `AssumeRole` | 관리 | 예 |
| S3 `GetObject`/`PutObject`/`DeleteObject` | 데이터(Data) | **아니오** |
| Lambda `Invoke` | 데이터 | **아니오** |
| DynamoDB `PutItem`/`GetItem` | 데이터 | **아니오** |

> ⚠️ **함정 재확인**: "누가 *버킷을 만들었나*"는 관리 이벤트(기본 기록). "누가 *버킷 안 객체를 다운로드했나*"는 데이터 이벤트(selector 필요). 이 한 문장으로 절반의 함정 문제를 풀 수 있다.

## 예방 vs 탐지 vs 대응: 통제 계층 매핑

Week 7 도구를 보안 통제 분류로 정리하면 답이 명확해진다:

- **예방(Preventive)**: SCP, IAM 정책, 보안 그룹/NACL, Object Lock, KMS 키 정책 — *애초에 막는다*.
- **탐지(Detective)**: CloudTrail, Config 규칙(평가), Flow Logs, Resolver 로그, GuardDuty — *일어난 일을 찾는다*.
- **대응(Responsive)**: Config 자동 교정(SSM Automation), EventBridge→Lambda, SNS 경보 — *되돌리거나 알린다*.

> 💡 **관련 이론**: 시험은 종종 "예방이냐 탐지냐"의 선택을 묻는다. 예: "퍼블릭 S3 버킷을 *막아라*"는 SCP/Block Public Access(예방)일 수도, Config 규칙+교정(탐지·대응)일 수도 있다. 핵심 단서는 *시점*이다 — "생성 자체를 거부"면 예방(SCP), "생성되면 되돌려라"면 탐지+대응(Config 교정). 둘은 배타적이지 않고 *계층으로 함께* 쓰는 것이 모범이다. 예방이 실패할 때를 대비해 탐지가, 탐지 후 자동 대응이 받친다.

## 통합 시나리오 1: S3 데이터 유출 침해 조사

> **상황**: 보안팀이 민감 데이터가 외부로 유출됐다는 제보를 받았다. 조사하라.

조사 흐름과 각 도구의 역할:

1. **무엇이, 누구에 의해 접근됐나** → CloudTrail **데이터 이벤트**(S3 `GetObject`)에서 해당 객체에 접근한 `userIdentity.arn`, `sourceIPAddress`, MFA 여부 확인. (단, 사전에 data event selector가 켜져 있어야 증거가 존재한다.)
2. **그 자격증명은 어떻게 얻어졌나** → CloudTrail **관리 이벤트**에서 `AssumeRole`, `ConsoleLogin`, 비정상 권한 부여(`AttachRolePolicy`) 추적.
3. **버킷이 언제부터 노출됐나** → AWS **Config** 구성 타임라인에서 버킷 정책·Block Public Access 설정이 언제 바뀌었는지 확인.
4. **데이터가 실제로 어디로 나갔나** → VPC **Flow Logs**(egress 볼륨, `pkt-srcaddr`로 원본 인스턴스, 목적지 IP).
5. **어떤 도메인/C2와 통신했나** → **Resolver 쿼리 로그**에서 의심 도메인 조회 상관.
6. **이 증거를 신뢰할 수 있나** → 로그가 별도 계정 + Object Lock + 무결성 검증으로 보호됐는지 확인(변조 가능성 배제).

> 🎯 **시나리오 포인트**: 단일 도구로는 그림이 안 그려진다. CloudTrail(누가/어떻게) + Config(언제부터 노출) + Flow Logs(얼마나 나갔나) + Resolver(어디로)를 *교차*해야 타임라인이 완성된다. 이 상관 분석이 가능한 전제가 4일차의 *중앙 집계*다.

### 실제 증거는 이렇게 생겼다

말로만 설명하면 시험장에서 로그 조각을 봤을 때 얼어붙는다. 위 여섯 단계가 실제 로그에서 어떤 모습인지 붙여 보자.

**1단계 — 누가 객체를 읽었나** (CloudTrail 데이터 이벤트)

```json
{
  "eventTime": "2026-06-24T08:31:10Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "GetObject",
  "sourceIPAddress": "203.0.113.10",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc",
    "accessKeyId": "ASIAEXAMPLEKEY",
    "sessionContext": {
      "sessionIssuer": { "arn": "arn:aws:iam::111122223333:role/AppRole" },
      "attributes": { "creationDate": "2026-06-24T08:14:22Z", "mfaAuthenticated": "false" }
    }
  },
  "resources": [{ "type": "AWS::S3::Object",
                  "ARN": "arn:aws:s3:::corp-sensitive/payroll.csv" }],
  "eventCategory": "Data"
}
```

여기서 눈이 멈춰야 할 곳은 `sourceIPAddress`다. 세션 이름이 `i-0abc`라는 것은 이 자격증명이 **EC2 인스턴스 프로파일**에서 나왔다는 뜻인데, 호출은 그 인스턴스의 사설 IP가 아니라 외부 IP에서 왔다. **인스턴스 역할의 자격증명이 인스턴스 밖에서 사용되고 있다** — 이 한 줄이 사실상 침해 확정 신호다.

**2단계 — 그 세션은 어떻게 만들어졌나** (CloudTrail 관리 이벤트, `creationDate`로 역추적)

```sql
SELECT eventtime, eventname, sourceipaddress, useridentity.type,
       json_extract_scalar(requestparameters, '$.roleSessionName') AS session_name
FROM cloudtrail_logs
WHERE eventname = 'AssumeRole'
  AND eventtime BETWEEN '2026-06-24T08:14:00Z' AND '2026-06-24T08:15:00Z';
```

**3단계 — 버킷은 언제부터 노출됐나** (Config 구성 타임라인)

```bash
aws configservice get-resource-config-history \
  --resource-type AWS::S3::Bucket --resource-id corp-sensitive \
  --query 'configurationItems[].{t:configurationItemCaptureTime,e:relatedEvents}'
```

버킷 정책·퍼블릭 액세스 차단 설정은 CI의 `supplementaryConfiguration`에 담긴다는 점을 기억할 것. 그리고 각 항목의 `relatedEvents`로 그 변경을 만든 CloudTrail 이벤트에 즉시 건너뛸 수 있다.

**4단계 — 실제로 얼마나 나갔나** (VPC Flow Logs)

```
2 111122223333 eni-0abc 10.0.1.20 198.51.100.66 51234 443 6 4210 6291456 1719218400 1719218460 ACCEPT OK
```

한 줄만 보면 6MB지만, 이것은 60초 집계 구간의 값이다. 반드시 구간 전체를 합산해야 한다.

```sql
SELECT pkt_srcaddr, dstaddr, sum(bytes) AS total_bytes,
       min(from_unixtime(start)) AS first_seen,
       max(from_unixtime("end"))  AS last_seen
FROM vpc_flow_logs
WHERE flow_direction = 'egress' AND action = 'ACCEPT'
  AND pkt_srcaddr = '10.0.1.20'
  AND date = '2026-06-24'
GROUP BY pkt_srcaddr, dstaddr
ORDER BY total_bytes DESC;
```

**5단계 — 그 IP는 무엇이었나** (Resolver 쿼리 로그)

```json
{
  "query_timestamp": "2026-06-24T08:29:55Z",
  "query_name": "malicious-c2.example.",
  "query_type": "A",
  "rcode": "NOERROR",
  "answers": [{ "Rdata": "198.51.100.66", "Type": "A" }],
  "srcaddr": "10.0.1.20",
  "srcids": { "instance": "i-0def456" }
}
```

Flow Log의 목적지 IP와 Resolver 로그의 응답 IP가 **일치**하고, 시각도 9초 차이다. 이 순간 "미상 IP로의 대량 전송"이 "알려진 C2 도메인으로의 유출"로 확정된다.

**6단계 — 이 증거를 믿을 수 있나**

```bash
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-audit-trail \
  --start-time 2026-06-24T00:00:00Z --end-time 2026-06-25T00:00:00Z
```

> 💡 **관련 이론**: 위 여섯 단계는 사실 디지털 포렌식의 고전적 절차 — *수집 → 검증 → 분석 → 재구성* — 을 클라우드 서비스로 옮긴 것이다. 그중 두 번째(검증)를 생략하는 조사가 놀랄 만큼 많은데, 이것이 법적 절차로 이어질 때 치명적이다. 상대가 "그 로그가 조작되지 않았다는 근거는?"이라고 물으면, 해시 체인 검증 결과 없이는 분석 전체가 흔들린다. **분석의 신뢰도는 가장 약한 고리에서 결정되고, 그 고리는 대개 증거의 무결성이다.** 그래서 실무 런북에서 `validate-logs`는 조사의 마지막이 아니라 *분석을 시작하기 전*에 돌리는 명령으로 배치된다.

> ⚠️ **함정**: 이 시나리오 전체가 성립하려면 **사건 이전에** 데이터 이벤트, Config recorder, Flow Logs, Resolver 쿼리 로그가 모두 켜져 있었어야 한다. 시험 지문이 "조사하라"로 시작하면 반사적으로 도구를 고르게 되지만, 실제로 자주 나오는 정답은 "그 로그가 켜져 있지 않았으므로 답할 수 없다 / 앞으로를 위해 지금 켜라"다. 로깅은 소급 적용되지 않는다는 원칙이 이번 주에 세 번 반복된 이유가 있다.

## 통합 시나리오 2: 보안 그룹 오구성 추적

> **상황**: 운영 중 갑자기 0.0.0.0/0:3389(RDP)이 열려 있다. 누가 언제 왜?

- **Config**: 보안 그룹의 구성 타임라인에서 정확히 *언제* 인바운드 규칙이 추가됐는지, 그 전후 CI 비교.
- **CloudTrail**: 같은 시각 `AuthorizeSecurityGroupIngress` 호출의 호출자·소스 IP·세션.
- **Config Rule**: `restricted-ssh`/`restricted-common-ports` 같은 관리형 규칙이 이 위반을 `NON_COMPLIANT`로 잡았어야 한다. 안 잡았다면 규칙 미배포.
- **자동 교정**: 향후 재발 시 SSM Automation으로 위험 규칙을 자동 회수하도록 conformance pack에 교정 연결.

> 💡 **관련 이론**: Config는 *상태와 시점*("3389이 열려 있었다, 14:02부터")을, CloudTrail은 *행위와 주체*("Alice의 역할이 14:02에 그 규칙을 추가했다")를 답한다. 이 둘의 결합이 감사의 본질 — *상태 변화*와 *그 원인 행위*를 잇는 것이다.

## 통합 시나리오 3: 변조 불가 중앙 감사 베이스라인 구축

> **상황**: 300개 계정 조직에 "어떤 관리자도 끌 수 없고, 루트조차 삭제 못 하며, 보안팀만 읽는" 감사 기반을 세워라.

정답 아키텍처(Week 7 전체의 종합):
1. 관리 계정에서 **organization trail**(멀티리전, 관리 이벤트 전체 + 필요한 데이터 이벤트) 생성 → 멤버 계정이 끌 수 없음.
2. 로그를 **별도 로깅 계정** S3 버킷으로 집계(버킷 정책: `aws:SourceOrgID` + `bucket-owner-full-control`).
3. 버킷에 **Object Lock Compliance**(보존 기간) + 버전 관리 + **SSE-KMS**(전용 CMK, 키 정책으로 복호화 주체 제한).
4. **로그 파일 무결성 검증** 활성화로 변조 증명.
5. **organization conformance pack**으로 Config 규칙(암호화·공개 차단 등) 일괄 배포 + 자동 교정.
6. **EventBridge**로 `StopLogging`/`DeleteTrail` 즉시 경보.

> 🔍 **더 깊이**: 이 베이스라인이 곧 AWS **Control Tower**의 Log Archive 계정 + 가드레일이 자동화하는 것이다. 시험에서 "다계정 감사·준수 기반을 *처음부터* 표준대로 세워라"면 Control Tower가, "기존 환경에 직접 구성하라"면 위의 수동 조립이 답이다. 어느 쪽이든 구성 요소(org trail, 로깅 계정, Object Lock, KMS, conformance pack)는 동일하다. Week 7에서 배운 모든 조각이 여기서 하나로 합쳐진다 — 이것이 "보안 로깅·모니터링"의 토대이며, 다음 주의 위협 탐지(GuardDuty, Security Hub, Detective)는 *이 토대 위에서* 자동 분석을 얹는 단계다.

```
[ Week 7 전체를 한 장으로 ]

  ┌─ 예방 ────────────────────────────────────────────────────┐
  │ SCP(로깅 무력화 금지) · Block Public Access · KMS 키 정책  │
  │ Object Lock Compliance · IMDSv2 강제                       │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ 수집 ─────────────────┴──────────────────────────────────┐
  │ CloudTrail 관리/데이터/Insights │ Config CI·규칙           │
  │ VPC Flow Logs(커스텀 형식)      │ Resolver 쿼리 로그       │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ 보관 ─────────────────┴──────────────────────────────────┐
  │ 로그 아카이브 계정 S3                                      │
  │  ├ 버킷 정책: SourceArn/SourceOrgID + bucket-owner-full   │
  │  ├ 버전 관리 + Object Lock(Compliance)                     │
  │  ├ SSE-KMS 전용 CMK(ViaService + 암호화 컨텍스트)          │
  │  └ 로그·digest 두 접두사를 동일하게 보호                    │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ 검증 ─────────────────┴──────────────────────────────────┐
  │ CloudTrail digest 해시 체인 + RSA 서명 (validate-logs)     │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ 분석 ─────────────────┴──────────────────────────────────┐
  │ Athena(파티션) · CloudTrail Lake · Config Advanced Query   │
  │ Aggregator · (다음 주: GuardDuty · Security Hub · Detective)│
  └────────────────────────┬──────────────────────────────────┘
  ┌─ 대응 ─────────────────┴──────────────────────────────────┐
  │ EventBridge → SNS/Lambda · Config 자동 교정(SSM Automation)│
  └───────────────────────────────────────────────────────────┘
```

## 통합 시나리오 4: 유출된 액세스 키로 시작된 침해

> **상황**: 외부 보안 연구자가 "귀사의 액세스 키가 공개 저장소에 노출돼 있다"고 통보했다. 노출된 키는 `AKIAEXAMPLEKEY`다. 무엇을, 어떤 순서로 하는가.

**즉시 조치**와 **조사**를 분리해서 진행하는 것이 원칙이다. 둘을 섞으면 조치가 증거를 지운다.

1. **봉쇄** — 키를 비활성화(삭제가 아니라 비활성화. 삭제하면 키 ID로 로그를 조회할 때 맥락이 줄어든다). 그 키를 가진 IAM 사용자에게 모든 것을 거부하는 인라인 정책을 붙여 즉시 차단하는 방법도 쓴다.
2. **범위 확정** — CloudTrail에서 그 키의 전체 활동을 시간 순으로 뽑는다.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAEXAMPLEKEY \
  --query 'Events[].{t:EventTime,n:EventName}' --output table
```

```sql
-- 90일을 넘어가면 lookup-events로는 안 되고 S3/Lake로 가야 한다
SELECT eventtime, eventsource, eventname, sourceipaddress, errorcode,
       json_extract_scalar(requestparameters, '$.userName') AS target_user
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLEKEY'
ORDER BY eventtime;
```

3. **지속성 탐색** — 공격자가 새로 만들어 둔 뒷문을 찾는다. 이것이 가장 자주 빠뜨리는 단계다.

```sql
SELECT eventtime, useridentity.arn, eventname, requestparameters
FROM cloudtrail_logs
WHERE eventname IN ('CreateUser', 'CreateAccessKey', 'CreateRole',
                    'AttachUserPolicy', 'AttachRolePolicy', 'PutUserPolicy',
                    'UpdateAssumeRolePolicy', 'CreateLoginProfile')
  AND eventtime >= '2026-06-24T00:00:00Z'
ORDER BY eventtime;
```

4. **데이터 접근 여부 확정** — 데이터 이벤트가 켜져 있었다면 어떤 객체가 읽혔는지, 안 켜져 있었다면 "확인 불가"를 명시적으로 기록한다.
5. **유출 여부 확정** — Flow Logs로 egress 볼륨을 확인한다.
6. **정리** — 그 키로 접근 가능했던 모든 시크릿을 회전한다. 접근 *사실*을 근거로 하지, 유출 *증거*를 기다리지 않는다.

> ⚠️ **함정**: 3단계를 건너뛰면 키 하나를 막고 사고를 종결한 뒤 며칠 만에 재침해를 겪는다. 공격자의 표준 절차는 "초기 접근으로 얻은 자격증명이 언제든 회수될 수 있다"고 가정하고 **즉시 다른 지속성 수단을 만드는 것**이다. 새 IAM 사용자, 기존 역할의 신뢰 정책에 자기 계정 추가, 콘솔 로그인 프로필 생성, Lambda 함수 백도어 등. 그래서 침해 대응의 마지막 질문은 언제나 "우리가 막은 것이 유일한 문이었는가"이며, 그 답은 CloudTrail의 IAM 쓰기 이벤트 목록에서만 나온다.

> 💡 **관련 이론**: 봉쇄와 조사가 충돌하는 순간이 반드시 온다 — 감염 인스턴스를 지금 종료하면 위협은 멈추지만 메모리와 로컬 증거가 사라진다. 정석은 **격리하되 파괴하지 않는 것**이다. 인스턴스를 종료하는 대신 모든 통신을 차단하는 보안 그룹으로 교체하고, EBS 스냅샷을 뜨고, 필요하면 인스턴스를 중지(stop)하되 종료(terminate)하지 않는다. 자격증명도 마찬가지로 삭제가 아니라 비활성화가 우선이다. **"멈추는 것"과 "지우는 것"은 다르고, 사고 대응에서 지우는 행위는 거의 항상 되돌릴 수 없다.**

## 통합 시나리오 5: 감사관 앞에 서기

> **상황**: 외부 감사관이 "지난 6개월간 감사 로그가 완전하고 변조되지 않았음을 증명하라"고 요구한다.

증명해야 할 것은 세 가지이며, 각각에 대응하는 증거가 다르다.

| 감사관의 질문 | 증명해야 할 것 | 제시할 증거 |
|--------------|---------------|------------|
| "빠짐없이 기록됐는가" | 완전성 | 조직 트레일 구성(멀티리전·전 계정), `IsLogging=true`, `LatestDeliveryError` 없음, 전 리전 Config recorder |
| "아무도 지우지 못하는가" | 불변성 | Object Lock Compliance 설정, 버킷 정책의 Delete Deny, 로깅 계정 분리, SCP |
| "내용이 바뀌지 않았는가" | 무결성 | `validate-logs` 결과 — 유효하지 않은 파일 0건, **찾을 수 없는 파일 0건** |

> 🎯 **시나리오 포인트**: 세 번째 행의 굵은 부분이 자주 간과된다. 감사 증빙으로 "검증 통과"만 제출하면 부족하다. 검증되지 않은 구간이 없다는 것, 즉 **누락이 0건**이라는 사실까지 함께 제시해야 완전한 증명이다. 무결성 검증은 "있는 것이 진짜임"을 보이는 도구이지 "없는 것이 없음"을 자동으로 보여 주지 않는다. 이 구분은 시험에서 "무결성 검증만으로 충분한가" 유형의 함정으로 나온다 — 답은 언제나 "아니오, 완전성과 불변성이 함께 필요하다"이다.

## 마무리 체크리스트

- [ ] 관리 이벤트 vs 데이터 이벤트 구분(특히 S3 객체·Lambda invoke는 데이터)
- [ ] CloudTrail Lake = 코드 없는 SQL 조사, 최대 10년
- [ ] 무결성 검증 = SHA-256 해시 체인 + RSA 서명 digest(변조 *증명*)
- [ ] Config = 상태·이력·관계, 리전별 recorder, 커스텀 규칙은 Lambda/Guard
- [ ] Conformance Pack = 규칙+교정 묶음, organization 단위 배포
- [ ] 자동 교정 = SSM Automation, 루프·중단 위험 주의
- [ ] Flow Logs = 메타데이터(payload 없음), pkt-srcaddr로 NAT 뒤 추적
- [ ] Resolver 쿼리 로그 = DNS 가시성, 우회 주의, DNS Firewall로 차단
- [ ] Object Lock Compliance = 루트조차 삭제 불가(예방)
- [ ] 별도 로깅 계정 + KMS 분리 = 격리 + 암호학적 접근 통제
- [ ] `userIdentity.type`별 조사 경로(특히 `AssumedRole` → `sessionContext`로 역추적)
- [ ] `AKIA`(장기 키) vs `ASIA`(임시 자격증명) 구분
- [ ] `errorCode` 폭증 = 권한 열거 정찰의 지문
- [ ] `lookup-events`는 관리 이벤트·90일만 — 데이터 이벤트는 Athena/Lake
- [ ] 교차계정 리소스 정책엔 `aws:SourceArn`/`SourceOrgID` + `bucket-owner-full-control`
- [ ] 로그와 digest는 **서로 다른 접두사** — 보호를 둘 다에 걸어야 한다
- [ ] `IsLogging=true`여도 `LatestDeliveryError`가 있으면 로그는 안 오고 있다
- [ ] Config `INSUFFICIENT_DATA`와 recorder 꺼진 리전은 위반으로 세어지지 않는다
- [ ] 차단형 통제는 언제나 관찰(ALERT/수동) → 자동 순서로 켠다

## 시험 직전 30초: 가장 자주 틀리는 갈림길

| 지문의 단서 | 정답 방향 |
|------------|----------|
| "객체를 누가 다운로드했나" | 데이터 이벤트(미리 켜져 있어야 함) |
| "버킷을 누가 만들었나" | 관리 이벤트(기본 기록) |
| "언제부터 열려 있었나" | AWS Config 구성 타임라인 |
| "코드 없이 SQL로 조사" | CloudTrail Lake |
| "최저 비용으로 장기 보존" | S3 trail + 수명주기 |
| "루트조차 삭제 불가" | Object Lock **Compliance** |
| "운영 유연성은 남기되 보호" | Object Lock **Governance** |
| "소송 대응, 기간 미정" | Legal Hold |
| "변조를 *증명*" | 로그 파일 무결성 검증 |
| "변조를 *예방*" | Object Lock |
| "패킷 내용 검사" | Traffic Mirroring |
| "어느 인스턴스가 유출했나(NAT 뒤)" | Flow Log `pkt-srcaddr` |
| "DNS 터널링 탐지" | Resolver 쿼리 로그 |
| "악성 도메인 차단" | Resolver DNS Firewall |
| "생성 자체를 거부" | SCP / Block Public Access(예방) |
| "생성되면 되돌려라" | Config 규칙 + SSM Automation 교정(탐지·대응) |
| "즉시 탐지·경보" | EventBridge(관리 이벤트) |
| "지난 분기 전체를 훑기" | Athena / CloudTrail Lake(배치) |
| "멤버 관리자가 끌 수 없게" | 조직 트레일 + SCP |
| "여러 소스를 공통 스키마로 정규화" | Security Lake(OCSF) |

## 정리하며

이번 주를 관통한 문장은 하나다 — **"기록되지 않은 것은 일어나지 않은 것이고, 지켜지지 않은 기록은 기록이 아니다."**

네 기둥은 각각 다른 질문에 답한다. CloudTrail은 *누가 무엇을 했는가*(점), Config는 *어떤 상태가 얼마나 지속됐는가*(선), Flow Logs와 Resolver 쿼리 로그는 *무엇이 어디로 흘렀는가*(흐름). 그리고 네 번째 기둥인 무결성·보존·중앙화가 앞의 셋을 증거로 만든다. 어느 하나도 단독으로는 침해를 설명하지 못하며, 넷이 같은 대상을 가리킬 때 비로소 결론이 선다.

시험 관점에서 반드시 몸에 붙여야 할 구분은 세 쌍이다. **관리 이벤트와 데이터 이벤트**(S3 객체·Lambda 호출은 데이터 — 기본 꺼짐), **예방과 탐지**("생성을 거부"면 SCP·BPA, "생성되면 되돌려라"면 Config 교정), **막는 것과 증명하는 것**(Object Lock은 막고, digest 해시 체인은 증명한다). 이 세 쌍만 정확히 나눠도 이 도메인 문항의 상당 부분이 풀린다.

마지막으로 실무에서 가장 값비싼 교훈 하나. 이번 주의 모든 통제는 **켠 시점부터만 유효하다.** 데이터 이벤트도, Config recorder도, Flow Logs도, Object Lock 보존 규칙도 소급되지 않는다. 그래서 "언제 켤 것인가"에 대한 유일하게 옳은 답은 언제나 "지금"이다 — 조사가 필요해진 순간에는 이미 늦었기 때문이다. 다음 주의 GuardDuty·Security Hub·Detective는 이 토대 위에 자동 분석을 얹는 단계이며, 토대가 비어 있으면 그 위에 아무리 좋은 도구를 올려도 볼 것이 없다.

---

## 📝 연습 문제

**문제 1.** S3 데이터 유출 침해를 조사하는데, 어느 자격증명이 민감 객체를 다운로드했는지 CloudTrail에서 찾을 수 없다. 사전에 무엇이 누락됐기 때문인가?

A) 로그 파일 무결성 검증  
B) trail에 S3 객체 수준 데이터 이벤트 selector  
C) Config recorder  
D) Resolver 쿼리 로깅  

**정답: B**  
해설: S3 `GetObject`는 데이터 이벤트로 기본 기록되지 않으므로, 사전에 trail에 S3 데이터 이벤트 selector(또는 advanced event selector)가 켜져 있어야 다운로드 주체를 추적할 수 있다. 무결성 검증은 변조 증명용, Config는 구성 상태, Resolver 로그는 DNS로 객체 접근 주체 추적과 무관하다. 데이터 이벤트는 사후에 소급 기록되지 않으므로 사전 활성화가 핵심이다.

---

**문제 2.** "퍼블릭 S3 버킷의 *생성 자체를 거부*하라"와 "퍼블릭 버킷이 *생성되면 자동으로 되돌려라*"는 각각 어떤 통제 유형인가?

A) 둘 다 예방 통제  
B) 전자는 예방(SCP/Block Public Access), 후자는 탐지+대응(Config 규칙 + 자동 교정)  
C) 전자는 대응, 후자는 예방  
D) 둘 다 탐지 통제  

**정답: B**  
해설: 시점이 단서다. "생성 자체를 거부"는 행위가 일어나기 전에 막는 예방 통제(SCP, S3 Block Public Access)이고, "생성되면 되돌려라"는 일어난 위반을 탐지(Config 규칙)하고 자동 교정(SSM Automation)으로 되돌리는 탐지+대응이다. 둘은 배타적이지 않고 계층으로 함께 쓰는 것이 모범이다.

---

**문제 3.** 보안 그룹에 0.0.0.0/0:3389이 열린 *시점*과 그 변경을 *일으킨 API 호출자*를 각각 어떤 서비스로 확인하는가?

A) 시점은 CloudTrail, 호출자는 Config  
B) 시점은 AWS Config 구성 타임라인, 호출자는 CloudTrail의 `AuthorizeSecurityGroupIngress` 이벤트  
C) 둘 다 VPC Flow Logs  
D) 둘 다 Resolver 쿼리 로그  

**정답: B**  
해설: Config는 리소스의 구성 항목(CI) 타임라인으로 규칙이 *언제* 추가됐는지(상태 변화 시점)를 보여주고, CloudTrail은 같은 시각의 `AuthorizeSecurityGroupIngress` 호출에서 *누가/어디서* 변경했는지(행위·주체)를 보여준다. 상태 변화는 Config, 원인 행위는 CloudTrail이라는 역할 구분이 핵심이다. Flow Logs·Resolver는 트래픽/DNS로 구성 변경 추적과 무관하다.

---

**문제 4.** 300개 계정 조직에 "멤버 관리자가 끌 수 없고, 루트조차 보존 기간 내 삭제 불가하며, 보안팀만 읽는" 감사 로그 기반을 직접 구성하려 한다. 올바른 구성 요소 조합은?

A) 각 계정 개별 trail + 단일 KMS 키 공유  
B) organization trail(멀티리전) → 별도 로깅 계정 S3(Object Lock Compliance + SSE-KMS 키 정책 분리 + SourceOrgID 버킷 정책) + 무결성 검증  
C) Event history 90일 + 버전 관리  
D) CloudWatch Logs만 + Governance 모드 Object Lock  

**정답: B**  
해설: organization trail은 멤버 관리자가 끌 수 없게 하고, 별도 로깅 계정은 운영 침해와 격리하며, Object Lock Compliance는 루트조차 보존 기간 내 삭제 불가, SSE-KMS 키 정책 분리는 복호화 주체를 보안팀으로 제한, SourceOrgID 버킷 정책은 confused deputy를 막고, 무결성 검증은 변조를 증명한다. 개별 trail은 일관성·강제성 부족, Event history는 90일·내보내기 불가, Governance 모드는 권한자가 우회 가능해 "루트조차 불가" 요구를 못 채운다.

---

**문제 5.** 침해 조사에서 "감염된 EC2가 외부 C2 서버와 통신했고, 어떤 도메인을 통해 연결했는지" 완전한 그림을 그리려 한다. 어떤 로그들의 *상관 분석*이 필요한가?

A) CloudTrail 관리 이벤트만으로 충분하다  
B) VPC Flow Logs(egress 볼륨·목적지 IP·pkt-srcaddr)와 Route 53 Resolver 쿼리 로그(조회 도메인)를 시간으로 상관 분석  
C) Config 구성 타임라인만  
D) S3 데이터 이벤트만  

**정답: B**  
해설: Flow Logs는 어느 인스턴스가 어떤 IP로 얼마나 egress했는지(pkt-srcaddr로 NAT 뒤 원본 특정)를, Resolver 쿼리 로그는 그 인스턴스가 어떤 도메인을 조회해 그 IP를 받았는지를 보여준다. 둘을 시간 기준으로 상관하면 "IP만으로는 모호한 통신"에 도메인 맥락이 더해져 C2 통신의 전체 그림이 완성된다. CloudTrail·Config·S3 이벤트는 네트워크·DNS 차원의 통신 경로를 직접 드러내지 못한다.

---

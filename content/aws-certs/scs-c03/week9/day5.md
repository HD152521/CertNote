# Day 5 - Week 9 종합: 위협 탐지 시나리오 통합 복습

이번 주는 위협 탐지(threat detection) 계층 전체를 다뤘다. GuardDuty(에이전트리스 위협 탐지), Detective(핀딩 조사·근본원인), Inspector(취약점 스캔), 그리고 Security Hub 중심의 통합 아키텍처. 오늘은 이들을 하나의 결정 체계로 묶는다. 시험은 개별 서비스 기능보다 *"이 상황에서 탐지의 어느 도구를, 어떤 역할로, 어디에 배치하는가"*를 묻는다. 핵심은 **목적(무엇을 알고 싶은가) × 통합(어떻게 한 파이프라인으로 묶는가)**의 2차원 사고다.

## 통합 결정 매트릭스: 요구 → 도구

| 요구/상황 | 1차 도구 | 핵심 이유 |
|-----------|----------|-----------|
| 자격증명 오남용·악성 통신을 실시간 탐지 | GuardDuty(기초) | 에이전트리스, CloudTrail/Flow/DNS 분석 |
| 호스트 내부 프로세스·파일 악성 행위 | GuardDuty Runtime Monitoring | 런타임 가시성(경량 에이전트) |
| EC2 멀웨어 감염 의심 스캔 | GuardDuty Malware Protection(EBS) | 스냅샷 기반, 에이전트 불필요 |
| EC2/ECR/Lambda의 CVE 취약점 발견 | Inspector | 지속 스캔 + 컨텍스트 우선순위 |
| 사후 공시 CVE까지 이미지 추적 | Inspector ECR continuous 스캔 | 푸시 후 재평가 |
| 핀딩의 근본원인·영향범위·횡적이동 조사 | Detective | 동작 그래프, 베이스라인 |
| 관련 핀딩을 묶어 경보 피로 감소 | Detective finding groups | 캠페인 단위 그룹핑 |
| 여러 도구 핀딩을 표준화·집계 | Security Hub(ASFF) | 단일 창 + 상관 |
| 규정 준수 컨트롤(CIS/FSBP) 평가 | Security Hub 표준 검사 | 구성 모범 평가 |
| 멀티리전 핀딩 단일 조회 | Security Hub aggregation Region | 크로스리전 집계 |
| 탐지→자동 대응(격리/패치/티켓) | Security Hub → EventBridge → Lambda/SSM | SOAR 단일화 |
| 신규 계정 자동 탐지 포함 | 위임 관리자 + auto-enable | 사각지대 제거 |
| S3 민감 데이터(PII) 분류 | Macie | 데이터 분류(위협 탐지 아님) |

> 💡 **관련 이론**: 이 매트릭스의 바탕은 NIST CSF의 *Detect* 기능과 *예방-탐지-대응*의 분업이다. 예방(IAM·암호화·WAF)이 뚫리는 것을 전제로, 탐지 계층은 "위협(GuardDuty) + 취약점(Inspector)"을 발견하고, 조사(Detective)로 의미를 부여하며, 집계·자동화(Security Hub+EventBridge)로 운영한다. 시험의 "best" 답은 보통 *목적에 맞는 전문 도구 + Security Hub 통합 + Security Tooling 계정 위임*이다.

## 데이터 소스 역매핑: "이 데이터가 없으면 무엇이 안 보이는가"

도구에서 데이터로 가는 방향은 day1~4에서 봤다. 시험 대비에는 **반대 방향**이 더 유용하다 — 문제는 대개 "이 구성 때문에 무언가가 안 보인다"의 형태로 나오기 때문이다.

| 데이터/전제 | 이것이 없으면 안 보이는 것 | 복구 방법 |
|-------------|---------------------------|-----------|
| VPC 기본 Route 53 Resolver | GuardDuty의 모든 **DNS 기반 핀딩**(`!DNS`, DNS 유출, 채굴 도메인) | 기본 resolver 사용, 또는 Route 53 Resolver 쿼리 로깅 별도 구성 |
| Runtime Monitoring 에이전트 | 호스트/컨테이너 **내부 프로세스·파일·명령 실행** | Runtime Monitoring 활성화 |
| S3 데이터 이벤트(S3 Protection) | S3 **객체 수준** 접근 이상 | GuardDuty S3 Protection 활성화 |
| EKS 감사 로그(EKS Protection) | 쿠버네티스 **API 수준** 남용 | EKS Protection 활성화 |
| SSM 관리 상태(또는 agentless) | Inspector의 **EC2 패키지 CVE** | SSM Agent·인스턴스 프로파일·SSM VPC 엔드포인트 |
| ECR continuous 스캔 | 푸시 **이후 공시된 CVE** | enhanced/continuous 스캔 활성화 |
| `lambdaCode` 스캔 | Lambda **코드 자체**의 취약점·하드코딩 시크릿 | 코드 스캔 별도 활성화 |
| Detective 사전 활성화 | 사건 **이전의 베이스라인·과거 행위** | 사고 전 상시 활성화(사후엔 복구 불가) |
| 비활동 리전의 탐지 | 그 리전에서 벌어지는 **모든 활동** | 전 리전 활성화 + SCP로 리전 제한 |
| aggregation Region | 다른 리전의 **모든 Security Hub 핀딩** | finding aggregator 구성 |
| auto-enable | **신규 계정 전체** | 서비스별·기능별 auto-enable |

> ⚠️ **함정**: 이 표에서 **되돌릴 수 없는 항목이 하나** 있다 — Detective의 사전 활성화다. 나머지는 지금 켜면 앞으로가 보이지만, Detective는 활성화 이전의 과거를 소급해 채워 주지 않는다. "침해가 의심되니 지금 Detective를 켜서 지난달 활동을 조사하겠다"는 설계는 성립하지 않으며, 시험에서 이 형태의 보기는 항상 오답이다. 같은 이유로 **로그 보존은 사고가 아니라 평시에 결정된다**.

## 목적 사고: "탐지하라" vs "조사하라" vs "막아라"

같은 사건도 *동사*에 따라 답이 갈린다. 문제의 동사를 먼저 읽어라:

- **"탐지(detect)하라"** → GuardDuty(위협) 또는 Inspector(취약점). 핀딩을 *생성*하는 도구.
- **"조사(investigate)·근본원인" ** → Detective. 핀딩을 *설명*하는 도구(생성 안 함).
- **"집계·표준화·단일 창"** → Security Hub. 핀딩을 *모으는* 도구.
- **"막아라(prevent/block)"** → WAF/SG/NACL/Network Firewall. 탐지 도구는 *차단하지 않는다*.
- **"자동 대응하라"** → EventBridge + Lambda/SSM/Step Functions.

> ⚠️ **함정 모음**:
> - Detective를 "탐지 도구"로 오인(실제로는 조사 — 핀딩 생성 안 함).
> - Security Hub를 "위협 탐지 도구"로 오인(실제로는 집계·오케스트레이션).
> - GuardDuty/Inspector를 "차단 도구"로 오인(탐지만 — 차단은 별도 자동화).
> - GuardDuty가 호스트 내부를 본다고 가정(기초는 네트워크/API만 — Runtime Monitoring 필요).
> - Inspector EC2 스캔이 SSM 관리 없이 된다고 가정(에이전트 기반은 SSM 필요).
> - 커스텀 DNS resolver에서 GuardDuty DNS 핀딩이 나온다고 가정(VPC 기본 resolver 필요).
> - ECR on-push만으로 사후 CVE를 잡는다고 가정(continuous 필요).
> - Security Hub 핀딩이 글로벌이라고 가정(리전별 — aggregation Region 필요).

## 핀딩 판독 드릴: JSON을 보고 상황을 재구성한다

이번 주의 실질 역량은 핀딩 이름을 외우는 것이 아니라 **핀딩을 읽어 무슨 일이 일어났는지 말하는 것**이다. 세 개의 실물 조각을 놓고 각각 무엇을 뜻하는지, 무엇을 먼저 해야 하는지를 붙여 본다.

### 케이스 1 — 인스턴스가 "하는 쪽"인가 "당한 쪽"인가

```json
{
  "Type": "Backdoor:EC2/C&CActivity.B!DNS",
  "Severity": 8,
  "Resource": { "ResourceType": "Instance",
    "InstanceDetails": { "InstanceId": "i-0abc123", "Tags": [{"Key":"Env","Value":"prod"}] } },
  "Service": {
    "ResourceRole": "ACTOR",
    "Action": { "ActionType": "DNS_REQUEST",
      "DnsRequestAction": { "Domain": "cdn-update.example-c2.net", "Blocked": false } },
    "Count": 88,
    "EventFirstSeen": "2026-03-12T18:04:00Z",
    "EventLastSeen": "2026-03-14T09:41:00Z"
  }
}
```

읽는 순서는 항상 **Type → ResourceRole → Action → Count/시간**이다.

- `Backdoor` + `C&CActivity` — 이미 백도어가 심겼고 **명령·제어 서버와 통신**하려 한다. 침투 이후 단계다.
- `ResourceRole: ACTOR` — 우리 인스턴스가 *행위 주체*다. 즉 이미 우리 쪽이 감염됐다.
- `!DNS` + `Blocked: false` — 도메인 질의가 성공했고, DNS 통제로 막히지 않았다.
- `Count: 88`, 이틀에 걸침 — **지속적 비콘(beacon)**이다. 일회성 오탐일 가능성이 매우 낮다.
- `Env: prod` — 영향 범위가 프로덕션이다.

1차 대응: **격리 SG로 이동(종료 금지) → EBS 스냅샷 → Malware Protection 스캔 → 초기 침투 경로 추적 → 같은 도메인을 질의한 다른 인스턴스 확인.** 마지막 항목이 중요하다 — 하나가 감염됐다면 같은 AMI·같은 배포에서 온 형제들도 의심 대상이다.

### 케이스 2 — 취약점 핀딩에서 "지금"과 "다음"을 가른다

```json
{
  "type": "PACKAGE_VULNERABILITY",
  "severity": "CRITICAL",
  "inspectorScore": 9.6,
  "exploitAvailable": "NO",
  "fixAvailable": "NO",
  "resources": [{ "type": "AWS_EC2_INSTANCE", "id": "i-0def456",
                  "details": { "awsEc2Instance": { "subnetId": "subnet-private-1" } } }]
}
```

같은 CRITICAL이라도 판단이 정반대로 간다.

- `exploitAvailable: NO` — 공개 익스플로잇이 아직 없다. 임박성이 낮다.
- `fixAvailable: NO` — **패치가 존재하지 않는다.** 즉 "빨리 패치하라"가 답이 될 수 없다.
- 프라이빗 서브넷 — 도달성이 낮다.

이 조합의 정답은 패치가 아니라 **보상 통제(compensating control)**다. 노출 경로 축소(SG·NACL), 네트워크 분리, WAF·Network Firewall 규칙, 그리고 벤더 패치가 나오는 시점까지의 모니터링 강화. 시험에서 `fixAvailable: NO`는 "패치 우선순위" 계열 보기를 전부 탈락시키는 신호다.

### 케이스 3 — S3 유출인가 정상 배치인가

```json
{
  "Type": "Exfiltration:S3/AnomalousBehavior",
  "Severity": 5,
  "Resource": { "ResourceType": "S3Bucket",
    "S3BucketDetails": [{ "Name": "customer-exports", "PublicAccess": { "EffectivePermission": "NOT_PUBLIC" } }] },
  "Service": {
    "ResourceRole": "TARGET",
    "Action": { "ActionType": "AWS_API_CALL",
      "AwsApiCallAction": { "Api": "GetObject", "CallerType": "Remote IP" } },
    "Count": 2417
  }
}
```

- `Severity: 5`(Medium) — 자동으로 최우선은 아니다. 그러나 심각도만 보고 넘기면 안 되는 이유가 아래에 있다.
- `NOT_PUBLIC` — 버킷은 공개가 아니다. **정당한 권한을 가진 주체가 읽었다**는 뜻이며, 이는 안심의 근거가 아니라 *내부자 또는 탈취된 자격증명*을 시사한다.
- `Count: 2417` — 규모가 정상 조회의 범위를 벗어난다.
- 버킷 이름 `customer-exports` — 데이터 민감도가 높을 가능성.

여기서 필요한 것은 **다른 축의 정보와의 결합**이다. (1) Macie로 그 버킷의 민감도를 확인하고, (2) Detective로 그 주체의 최초 등장·지역·사용자 에이전트를 보고, (3) Security Hub에서 같은 주체의 다른 핀딩과 상관한다. **단일 핀딩의 severity만으로 우선순위를 정하면 이런 건은 묻힌다** — day4의 automation rule로 "민감 데이터 태그가 붙은 리소스의 핀딩은 심각도 상향"을 걸어 두는 이유가 이것이다.

> 🎯 **시나리오**: "Medium 심각도 S3 이상 접근 핀딩이 하루 수십 건이라 SOC가 전부 넘긴다. 실제 유출을 놓치지 않으려면?"이 나오면 정답의 형태는 **리소스 민감도(Macie 분류·태그)를 심각도에 반영**하고, **주체 기준으로 핀딩을 묶어**(Detective finding group / Security Hub Insights) 단일 사건으로 보이게 하는 것이다. "심각도 임계값을 낮춰 전부 본다"는 오답이다 — 노이즈를 늘려 결과적으로 더 놓친다. **우선순위 문제를 임계값 조정으로 푸는 답은 거의 항상 오답이다.**

## 통합 시나리오 A: 단일 침해의 풀 파이프라인

> 🎯 **시나리오 A**: "인터넷 노출 EC2가 침해된 것으로 보인다. 사전에 약점을 알았어야 했고, 공격을 탐지하고, 근본원인을 조사하고, 자동으로 격리·티켓팅하고 싶다. 50개 계정 조직이다."
>
> **답**:
> 1. **Inspector**: 노출 EC2의 critical CVE를 지속 스캔으로 사전 식별(도달성·익스플로잇 가중 우선순위).
> 2. **GuardDuty**: `UnauthorizedAccess:EC2/SSHBruteForce` + 비정상 아웃바운드 탐지. 호스트 내부 의심 시 Runtime Monitoring, 멀웨어 의심 시 Malware Protection.
> 3. **Detective**: 침해 인스턴스 역할의 새 지역·새 API 정찰, 동일 IP의 다른 인스턴스 통신(횡적 이동) 조사.
> 4. **Security Hub**: 1~3 핀딩을 ASFF로 집계 → **EventBridge** → Lambda(격리 SG 이동 + 스냅샷 + 자격증명 회수) + Jira 티켓.
> 5. **베이스라인**: 모든 서비스 위임 관리자를 Security Tooling 계정으로 정렬 + auto-enable.

## 통합 시나리오 B: 멀티계정·멀티리전 탐지 베이스라인

> 🎯 **시나리오 B**: "수백 개 계정, 여러 리전. 신규 계정도 자동 포함하고, 워크로드 팀이 탐지를 끄지 못하게 하며, 모든 핀딩을 단일 창에서 보고, 로그는 침해자가 못 건드리게 보관하고 싶다."
>
> **답**:
> - **Security Tooling 계정**을 GuardDuty·Security Hub·Detective·Inspector·Macie·Access Analyzer의 **공통 위임 관리자**로 정렬.
> - 조직 모드 + **auto-enable**로 신규 계정 자동 포함, 멤버는 끄지 못함.
> - Security Hub **aggregation Region**으로 멀티리전 핀딩 단일 리전 집계.
> - **Log Archive 계정**에 CloudTrail/Config 로그 불변(write-once) 보관 — 탐지 계정과 분리(권한 분리).
> - 중앙 EventBridge 버스 → 대응 자동화 단일화.

## 통합 시나리오 C: 컨테이너 플랫폼의 탐지 사각지대

> 🎯 **시나리오 C**: "EKS 위에서 수백 개 서비스가 돈다. 이미지의 취약점, 클러스터 API 남용, 파드 안에서 실행되는 악성 프로세스를 모두 보고 싶다. 지금은 GuardDuty 기초만 켜져 있다."
>
> **답**: 이 요구는 서로 다른 계층이라 하나의 스위치로 해결되지 않는다.
> 1. **이미지 취약점** → Inspector **ECR 스캔(on-push + continuous)** + CI 게이트로 배포 차단.
> 2. **클러스터 API 남용**(권한 있는 컨테이너, 익명 접근 허용, `kube-system` 파드에서의 exec 등) → GuardDuty **EKS Protection**(감사 로그 분석).
> 3. **파드/노드 내부 프로세스·파일** → GuardDuty **Runtime Monitoring**(에이전트).
> 4. 집계·자동화 → Security Hub → EventBridge → 파드 격리·노드 코든(cordon)·티켓.
>
> 오답 유형은 두 가지다. "Inspector를 켜면 런타임 위협도 본다"(Inspector는 취약점만) 와 "GuardDuty 기초로 쿠버네티스 API 남용을 본다"(EKS Protection이 필요). **계층이 다르면 데이터 소스도 다르다**는 원칙이 여기서 그대로 적용된다.

> 📚 **사례**: 2018년 공개된 테슬라 AWS 환경의 채굴 사건이 이 시나리오의 실물이다. 인증 없이 인터넷에 노출된 쿠버네티스 관리 콘솔에서 시작해, 그 안에 저장된 클라우드 자격증명을 얻어 채굴 워크로드를 돌렸다. 이 경로를 탐지 계층에 대응시키면 각 단계가 다른 도구에 걸린다 — **노출된 관리 엔드포인트**는 Inspector의 네트워크 도달성 분석과 Security Hub 표준 컨트롤이, **클러스터 API 오남용**은 EKS Protection이, **채굴 도메인 질의**는 GuardDuty 기초의 DNS 분석이, **파드 내부의 채굴 프로세스**는 Runtime Monitoring이 잡는다. 그리고 공격자가 CPU 사용률을 낮게 유지하고 비표준 포트를 쓰며 탐지를 회피했다는 점이 중요하다 — **단일 신호에 의존하는 탐지는 회피된다.** 여러 계층에서 나온 약한 신호들이 한 리소스로 수렴할 때 비로소 판단이 서고, 그 수렴을 가능하게 하는 것이 ASFF 기반 집계다.

## 통합 시나리오 D: 위임과 권한 분리가 걸린 문항

> 🎯 **시나리오 D**: "감사에서 '워크로드 팀이 자기 계정의 탐지를 끄거나 로그를 지울 수 있다'는 지적을 받았다. 구조적으로 불가능하게 만들라."
>
> **답**: 이것은 기능이 아니라 **계정 구조와 위임**의 문제다.
> - 탐지 서비스는 전부 **Organizations 조직 모드 + Security Tooling 계정 위임 관리자**. 조직 모드에서 멤버 계정은 자기 detector를 끄지 못한다.
> - 로그는 **별도 Log Archive 계정**에 조직 추적(organization trail)으로 흘리고, 버킷은 워크로드 계정이 접근할 수 없는 정책 + 객체 잠금(불변 보관).
> - 추가로 **SCP**로 `guardduty:DeleteDetector`, `cloudtrail:StopLogging`, `config:DeleteConfigurationRecorder` 등을 조직 차원에서 거부한다.
>
> 여기서 "각 계정에 IAM 정책으로 금지한다"는 오답이다 — 계정 관리자가 그 정책을 스스로 지울 수 있기 때문이다. **자기 계정 안의 통제는 그 계정 관리자를 막지 못한다.** 조직 차원의 SCP와 계정 분리만이 구조적 보장이 된다.

## 배포 상태 점검: CLI 한 바퀴

"탐지가 제대로 배포되어 있는가"를 확인하는 최소 명령 묶음이다. 각 명령이 어떤 사각지대를 겨냥하는지가 곧 이번 주의 요약이다.

```bash
# GuardDuty: 조직 자동 활성화와 보호 플랜이 켜졌는가
DET=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)
aws guardduty describe-organization-configuration --detector-id "$DET" \
  --query '{AutoEnable:autoEnableOrganizationMembers,Features:features[].{N:name,A:autoEnable}}'

# Inspector: 스캔이 안 되는 자산과 그 이유
aws inspector2 list-coverage \
  --query 'coveredResources[?scanStatus.statusCode!=`ACTIVE`].{Id:resourceId,Why:scanStatus.reason}'

# Detective: 이 리전에 동작 그래프가 존재하는가 (없으면 조사 불가)
aws detective list-graphs --query 'GraphList[].{Arn:Arn,Created:CreatedTime}'

# Security Hub: 크로스리전 집계가 구성됐는가
aws securityhub list-finding-aggregators
aws securityhub get-finding-aggregator --finding-aggregator-arn <arn> \
  --query '{Region:FindingAggregationRegion,Mode:RegionLinkingMode}'

# Security Hub: 어떤 탐지기가 실제로 핀딩을 보내고 있는가 (통합 누락 확인)
aws securityhub get-findings --max-items 200 \
  --query 'Findings[].ProductFields."aws/securityhub/ProductName"' | sort -u
```

마지막 명령이 특히 유용하다. **핀딩을 보내고 있어야 할 제품이 목록에 없다면 그 통합이 꺼져 있는 것**이고, 콘솔에서 "Security Hub를 켰다"는 사실만으로는 드러나지 않는 사각지대다.

## 자주 틀리는 구분 총정리

**GuardDuty vs Inspector** — 위협(실제 악성 활동, 탐지) vs 취약점(악용 가능한 약점, 사전 예방). 시점이 다르다.

**GuardDuty vs Detective** — 탐지(핀딩 생성) vs 조사(핀딩 설명). Detective는 핀딩을 만들지 않는다.

**Detective vs Security Hub** — 심층 조사(좁고 깊게, 동작 그래프) vs 집계·표준화(넓고 얕게, ASFF). 보완적.

**Security Hub vs GuardDuty/Inspector** — 집계·오케스트레이션 허브 vs 전문 탐지기. Security Hub는 직접 위협을 탐지하지 않는다(표준 컨트롤 평가는 예외).

**탐지 도구 vs 예방 도구** — GuardDuty/Inspector/Detective/Security Hub는 *탐지·조사·집계*만. 차단은 WAF/SG/NACL/Network Firewall + 자동화의 몫.

**GuardDuty Malware Protection vs Inspector** — 전자는 *멀웨어*(악성 파일) 스캔, 후자는 *CVE 취약점* 스캔. 다른 대상.

**Macie vs 탐지 도구** — Macie는 S3 *민감 데이터 분류*(PII), 위협 탐지가 아니다.

## 가시성·운영: 탐지는 파이프라인으로 완성된다

탐지의 성숙도는 "핀딩이 나오는가"가 아니라 "핀딩이 *상관·조사·대응*으로 흐르는가"로 갈린다:

```
[예방 우회] → Inspector(약점) + GuardDuty(위협) → Security Hub(집계·ASFF)
                                                       ├─ Detective(조사)
                                                       └─ EventBridge → 자동 대응
                                                            (격리/패치/티켓/알림)
```

각 도구의 신호·통합:
- **GuardDuty**: 핀딩 → EventBridge(실시간) + Security Hub 자동 통합.
- **Inspector**: 발견 → Security Hub + EventBridge → SSM Patch Manager(교정).
- **Detective**: 조사 — 핀딩에서 "Investigate in Detective"로 진입.
- **Security Hub**: ASFF 집계 + Insights 상관 + automation rules + 단일 EventBridge 발행.

이 신호들은 다음 주(인시던트 대응)에서 *실제 격리·포렌식·복구* 워크플로로 연결된다 — 탐지는 대응의 입구다.

> 🔍 **더 깊이**: 탐지 계층 전체를 한 문장으로 요약하면 *"전문 도구로 발견하고, ASFF로 통합하고, Detective로 조사하고, EventBridge로 대응하며, Security Tooling 계정으로 위임한다"*이다. 시험에서 탐지 관련 "best" 답은 거의 항상 이 통합 패턴의 어느 조각이다. 함정은 대개 역할 혼동(조사를 탐지로, 집계를 탐지로, 탐지를 차단으로)이거나 활성화 전제 누락(SSM 미관리, 커스텀 DNS, on-push만, auto-enable 미설정, aggregation Region 미지정)이다. 동사와 전제를 먼저 읽어라.

## 문항을 푸는 순서: 결정 흐름도

시험장에서 실제로 돌리는 절차를 흐름으로 고정해 두면 흔들리지 않는다.

```
문항 읽기
   │
   ├─① 동사를 찾는다 ─────────────────────────────────────────┐
   │    탐지(detect)     → GuardDuty(위협) / Inspector(취약점) │
   │    조사(investigate)→ Detective                           │
   │    집계·표준화      → Security Hub (ASFF)                 │
   │    차단(block)      → SG/NACL/WAF/Network Firewall        │
   │    자동 대응        → EventBridge → Lambda/SSM/StepFn     │
   │    데이터 분류      → Macie                                │
   │                                                            │
   ├─② 대상 계층을 본다 ───────────────────────────────────────┤
   │    네트워크·API     → GuardDuty 기초                       │
   │    호스트 내부      → Runtime Monitoring                   │
   │    디스크의 악성파일→ Malware Protection                   │
   │    K8s API          → EKS Protection                       │
   │    패키지·이미지    → Inspector                            │
   │                                                            │
   ├─③ 전제가 깨졌는지 확인한다 ───────────────────────────────┤
   │    커스텀 DNS? → DNS 핀딩 없음                             │
   │    SSM 미관리? → Inspector EC2 스캔 없음                   │
   │    on-push만?  → 사후 CVE 누락                             │
   │    Detective 사후 활성화? → 과거 데이터 없음               │
   │                                                            │
   ├─④ 규모 조건을 본다 ───────────────────────────────────────┤
   │    "여러 계정"      → 위임 관리자 + auto-enable            │
   │    "여러 리전"      → aggregation Region / 전 리전 활성화  │
   │    "신규 계정"      → auto-enable                          │
   │    "끄지 못하게"    → 조직 모드 + SCP + 계정 분리          │
   │                                                            │
   └─⑤ 조치의 가역성을 본다 ──────────────────────────────────┘
        무인 자동화 가능: 격리 SG·태깅·스냅샷·세션 무효화
        사람 경유 필요  : 종료·삭제·권한 영구 회수
```

> ⚠️ **함정**: ③번을 건너뛰는 것이 가장 흔한 실점 경로다. 보기 자체는 다 그럴듯한데, 문항 지문 어딘가에 "커스텀 DNS 서버를 사용한다", "인스턴스는 인터넷 접근이 없는 서브넷에 있다", "이미지는 6개월 전 푸시됐다", "침해 의심 후 도구를 활성화했다" 같은 **전제를 깨는 한 문장**이 숨어 있다. 그 문장이 정답을 결정한다. 지문에서 기술 구성이 언급되면 그것은 배경 설명이 아니라 **조건**이다.

## 정리하며

week9는 "탐지 서비스 네 개"를 배운 주가 아니라 **탐지라는 기능이 어떻게 조립되는가**를 배운 주다. 마지막으로 세 층위로 정리한다.

**첫째, 역할의 분리.** GuardDuty는 행위를 보고 Inspector는 약점을 본다. Detective는 만들지 않고 설명하며, Security Hub는 탐지하지 않고 모은다. 그리고 이 넷 중 어느 것도 차단하지 않는다. 시험 문항의 동사 하나가 이 분리 위에서 답을 결정하고, 오답 보기의 대부분은 이 경계를 한 칸씩 옮겨 놓은 것들이다.

**둘째, 전제의 취약함.** 서비스를 켜는 것과 그것이 보고 있는 것은 다르다. 커스텀 DNS resolver 하나가 GuardDuty의 DNS 계열 탐지를 통째로 지우고, SSM 연결 경로 하나가 Inspector의 EC2 스캔을 통째로 지운다. 그리고 Detective의 과거 데이터는 사후에 복구할 방법이 아예 없다. **탐지의 실패는 대개 "안 켰다"가 아니라 "켰는데 안 보였다"의 형태로 온다.**

**셋째, 시간이 곧 피해다.** Capital One도, Codecov도, 테슬라 계정의 채굴도, 사후 보고서가 공통으로 지적한 것은 공격의 정교함이 아니라 **알아채고 대응하기까지 걸린 시간**이었다. 그래서 탐지 아키텍처의 마지막 조각은 언제나 자동화이고, 자동화의 마지막 조각은 가역성 판단이다 — 되돌릴 수 있는 조치는 기계에 맡겨 시간을 줄이고, 되돌릴 수 없는 조치는 사람을 거쳐 오판의 비용을 막는다.

다음 주(인시던트 대응)는 오늘 그린 파이프라인의 출구에서 시작한다. 격리·포렌식·근절·복구, 그리고 사후 개선까지 — **탐지는 대응의 입구이고, 대응이 없는 탐지는 관측일 뿐 통제가 아니다.**

## 한 줄 요약 체크리스트

- [ ] 문제의 동사(탐지/조사/집계/차단/대응)를 먼저 읽어 도구를 골랐는가
- [ ] GuardDuty 기초 vs 보호 플랜(Runtime/Malware)을 상황에 맞게 구분했는가
- [ ] Inspector 스캔 전제(SSM 관리, ECR continuous)를 확인했는가
- [ ] Detective를 탐지가 아닌 조사 도구로 정확히 포지셔닝했는가
- [ ] Security Hub를 집계·오케스트레이션 허브(ASFF)로 이해했는가
- [ ] 모든 탐지 서비스 위임 관리자를 Security Tooling 계정으로 정렬 + auto-enable 했는가
- [ ] aggregation Region·EventBridge 자동화로 멀티리전·자동대응을 묶었는가

---

## 📝 연습 문제

**문제 1.** 인터넷에 노출된 EC2가 침해된 것으로 보인다. 50개 계정 조직에서 (a) 사전에 약점을 알고, (b) 공격을 탐지하고, (c) 근본원인을 조사하고, (d) 자동으로 격리·티켓팅하려 한다. 가장 적절한 통합 설계는?

A) GuardDuty 하나만 켜고 나머지는 수동으로 처리한다  
B) Inspector(취약점) + GuardDuty(위협) + Detective(조사) + Security Hub 집계 → EventBridge → Lambda/SSM 자동 대응, 모두 Security Tooling 계정에 위임  
C) WAF와 Shield만으로 모든 것을 처리한다  
D) CloudTrail 로그를 Athena로 수동 쿼리해 사람이 분석한다  

**정답: B**  
해설: 네 요구가 서로 다른 탐지 기능에 대응하므로 전문 도구를 통합해야 한다. Inspector가 사전 약점을, GuardDuty가 공격을, Detective가 근본원인을 담당하고, Security Hub가 ASFF로 집계해 EventBridge로 격리·티켓 자동화를 트리거하며, 모든 서비스를 Security Tooling 계정에 위임해 멀티계정 일관성을 확보한다. GuardDuty 단독·WAF/Shield(예방)·수동 Athena 분석은 이 통합 요구를 충족하지 못한다.

---

**문제 2.** 한 분석가가 "Amazon Detective로 위협을 실시간 탐지하고 악성 트래픽을 차단하겠다"고 설계했다. 이 설계의 오류는?

A) Detective는 멀티계정에서 동작하지 않는다  
B) Detective는 탐지나 차단을 하지 않고, 기존 핀딩·로그를 조사·근본원인 분석하는 도구다 — 탐지는 GuardDuty, 차단은 WAF/SG의 역할이다  
C) Detective는 EC2만 지원한다  
D) Detective는 비용이 너무 비싸다  

**정답: B**  
해설: Detective는 핀딩을 생성하거나 트래픽을 차단하지 않으며, GuardDuty 등이 만든 핀딩과 로그를 동작 그래프로 조사해 "왜·어디까지·어떻게"를 분석하는 조사 전용 도구다. 위협 탐지는 GuardDuty, 차단은 WAF/SG/NACL의 역할이다. Detective는 멀티계정을 지원하며 EC2 외 다양한 엔티티를 다루므로 나머지 보기는 틀렸다.

---

**문제 3.** Inspector를 켰는데 일부 EC2가 스캔되지 않고, GuardDuty는 호스트 내부 악성 프로세스를 탐지하지 못한다. 두 문제의 올바른 해결 조합은?

A) Inspector는 SSM 관리 상태(또는 agentless) 확인, GuardDuty는 Runtime Monitoring 활성화  
B) 둘 다 VPC Flow Logs를 S3에 저장하면 해결된다  
C) Inspector는 ECR continuous를 켜고, GuardDuty는 Trusted IP를 추가한다  
D) 둘 다 Security Hub만 켜면 자동 해결된다  

**정답: A**  
해설: Inspector의 EC2 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 하므로 SSM 상태를 확인(또는 agentless 사용)해야 하고, GuardDuty 기초는 네트워크/API만 보므로 호스트 내부 프로세스 가시성은 Runtime Monitoring으로 확보한다. Flow Logs 저장·ECR continuous(이미지 대상)·Trusted IP(핀딩 억제)·Security Hub(집계)는 이 두 문제의 직접 해결책이 아니다.

---

**문제 4.** 멀티리전·다계정 조직에서 신규 계정이 자동으로 탐지에 포함되고, 모든 리전 핀딩을 단일 창에서 보며, 워크로드 팀이 탐지를 끄지 못하게 하려 한다. 가장 적절한 베이스라인은?

A) 각 계정·리전에서 서비스를 수동으로 켜고 콘솔을 번갈아 본다  
B) 탐지 서비스를 Security Tooling 계정에 위임 + auto-enable + Security Hub aggregation Region 구성  
C) 관리(management) 계정에서 모든 것을 직접 운영한다  
D) 핀딩을 이메일로만 받는다  

**정답: B**  
해설: 위임 관리자(Security Tooling 계정) + 조직 모드 auto-enable은 신규 계정 자동 포함과 멤버의 임의 비활성화 방지를 동시에 달성하고, Security Hub aggregation Region은 멀티리전 핀딩을 단일 리전에 집계한다. 수동 활성화·콘솔 순회는 사각지대를 낳고, 관리 계정 직접 운영은 권한 집중 위험이며, 이메일 수신만으로는 통합·자동화가 불가능하다.

---

**문제 5.** 다음 중 이번 주 탐지 통합에서 "함정"으로 자주 지적되는 항목이 아닌 것은?

A) Detective를 위협 탐지·차단 도구로 오인하는 것  
B) GuardDuty 기초만으로 호스트 내부 프로세스를 본다고 가정하는 것  
C) 모든 탐지 서비스의 위임 관리자를 동일 Security Tooling 계정으로 정렬하고 auto-enable을 켜는 것  
D) Security Hub 핀딩이 모든 리전에 글로벌로 보인다고 가정하는 것  

**정답: C**  
해설: 모든 탐지 서비스를 동일 Security Tooling 계정에 위임하고 auto-enable을 켜는 것은 함정이 아니라 *권장 베이스라인*이다 — 데이터·권한·조사 일관성과 신규 계정 자동 포함을 보장한다. 나머지는 모두 실제 빈출 함정이다: Detective는 조사 도구이지 탐지·차단이 아니고, GuardDuty 기초는 호스트 내부를 못 보며(Runtime Monitoring 필요), Security Hub 핀딩은 리전별이라 aggregation Region이 필요하다. 함정이 *아닌* 것을 고르는 문제이므로 정답은 위임 정렬 구성이다.

---

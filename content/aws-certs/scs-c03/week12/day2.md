# Day 2 - 도메인 3·4 통합 복습: 인프라 보안 ↔ 자격 증명·액세스 관리

도메인 3(인프라 보안, ~20%)과 도메인 4(IAM, ~16%)는 시험에서 가장 점수 비중이 큰 묶음이다. 둘의 관계는 명확하다 — **인프라 보안은 "어디로 갈 수 있는가(네트워크 경로)"를, IAM은 "무엇을 할 수 있는가(권한)"를** 통제한다. Specialty 답안은 거의 항상 *"네트워크 경계로 막고, 최소 권한 IAM으로 다시 막는다"*는 이중 통제를 요구한다. 오늘은 이 두 차원을 하나의 접근 통제 모델로 묶는다.

## 두 도메인이 시험에서 결합되는 방식

두 도메인이 합쳐 36%다. 결합 형태는 대략 여섯 가지로 수렴한다.

| 결합 형태 | 지문의 모양 | 답이 놓이는 자리 |
|---|---|---|
| 경로 차단형 | "이 트래픽만 통과시켜라" | SG / NACL / Endpoint 정책 / Network Firewall |
| 프라이빗 접근형 | "인터넷을 거치지 않고" | Gateway vs Interface Endpoint |
| 유출 방지형 | "우리 VPC·조직 밖으로 못 나가게" | Endpoint 정책 + `aws:SourceVpce` + SCP/RCP |
| 권한 판정형 | "왜 AccessDenied인가 / 왜 통과하는가" | 정책 평가 순서 6~7층 |
| 위임형 | "누구에게 어떻게 권한을 주는가" | AssumeRole·External ID·Identity Center·Roles Anywhere |
| 자격증명 배치형 | "키를 어디에 두는가" | 역할(인스턴스 프로파일/IRSA/실행 역할) + Secrets Manager |

지문의 마지막 문장이 *"어떻게 접근을 허용/차단하는가"*로 끝나면 앞의 셋, *"누가 무엇을 할 수 있게 하는가"*로 끝나면 뒤의 셋이다. 이 판별만으로 후보가 절반으로 줄어든다.

## 인프라 보안: 네트워크 경로 통제의 계층

| 통제 | 상태성 | 적용 단위 | 핵심 특징 |
|------|--------|-----------|-----------|
| Security Group | stateful | ENI/인스턴스 | 허용 규칙만. 응답 자동 허용. 다른 SG를 소스로 참조 가능 |
| NACL | stateless | 서브넷 | 허용+거부. 인/아웃 별도. 번호 순 평가. 응답 포트 명시 |
| VPC Endpoint (Gateway) | — | S3/DynamoDB **만** | 라우팅 테이블 항목. 무료. 엔드포인트 정책 |
| VPC Endpoint (Interface/PrivateLink) | — | 대부분 서비스·내 SaaS | ENI+프라이빗 IP. SG로 통제. 시간·데이터 과금 |
| Network Firewall | stateful | inspection VPC | IPS·도메인 필터·Suricata 규칙 |
| Route 53 Resolver DNS Firewall | — | VPC | 도메인 허용/차단 목록 |
| WAF | — | CloudFront·ALB·API GW 등 | L7 규칙(SQLi/XSS/rate-based/지역) |
| Shield Advanced | — | 엣지·리전 리소스 | L3/4 DDoS 완화·비용 보호·대응팀 지원 |

> 💡 **관련 이론**: SG는 stateful이라 인바운드를 허용하면 응답이 자동으로 나간다. NACL은 stateless라 인바운드 허용과 *아웃바운드 임시 포트(1024-65535)* 허용을 모두 명시해야 한다. 이 비대칭이 NACL 트러블슈팅 단골이다. 또한 NACL은 *명시적 거부*가 가능해 특정 IP 차단(blacklist)에 쓰이고, SG는 거부 규칙이 없어 화이트리스트만 가능하다. "특정 악성 IP를 서브넷 전체에서 차단" → NACL deny. 그리고 진행 중인 세션을 즉시 끊어야 할 때도 NACL이 답이다 — SG는 stateful이라 이미 성립된(established) 연결이 잠시 유지될 수 있다.

### 헷갈리는 짝: 어느 계층의 방어인가

| 위협 | 정답 통제 | 자주 나오는 오답 |
|---|---|---|
| SQLi·XSS·봇·특정 URI 대량 요청 | **WAF** (managed rule + rate-based) | Shield / NACL |
| L3/4 volumetric flood, 비용 급증 보호 | **Shield Advanced** | WAF만 |
| VPC 내부/이그레스 트래픽의 IPS·도메인 통제 | **Network Firewall** | SG / WAF |
| 악성 도메인 질의 차단 | **Route 53 Resolver DNS Firewall** | Network Firewall만 |
| 특정 IP 대역을 서브넷 전체에서 거부 | **NACL deny** | SG |
| 인스턴스 단위 화이트리스트 | **Security Group** | NACL |
| 서드파티 어플라이언스 인라인 삽입 | **Gateway Load Balancer** | NLB |

한 줄 정리: **L7 내용은 WAF, L3/4 물량은 Shield, VPC 내부 흐름은 Network Firewall, 도메인은 DNS Firewall, IP 블랙리스트는 NACL, 인스턴스 화이트리스트는 SG.**

> ⚠️ **함정**: Network Firewall은 **라우팅으로 트래픽을 강제 통과시켜야** 검사한다 — 배포만 하고 라우팅 테이블을 고치지 않으면 아무것도 안 본다. Transit Gateway로 stateful 검사를 할 때 **appliance mode**를 켜지 않으면 왕복 경로가 달라져 비대칭 흐름이 되고 검사가 오작동한다. 그리고 **CloudFront 범위 WAF와 Shield Advanced 정책은 us-east-1**에서 만들어야 한다.

### 트래픽 경로 결정 트리

```
"이 통신을 어떻게 허용/차단하는가?"
   │
   ├─ 인터넷에서 들어오는가?
   │     ├─ HTTP(S) 애플리케이션 계층 ──► CloudFront + WAF (+ Shield Advanced)
   │     │        └─ 오리진 우회 차단 ──► prefix list / 비밀 헤더 / OAC
   │     └─ L3/4 물량 공세 ────────────► Shield (Advanced면 비용 보호·대응팀)
   │
   ├─ VPC 안에서 AWS 서비스로 나가는가?
   │     ├─ S3 · DynamoDB ─────────────► Gateway Endpoint (무료) ★비용 문항의 정답
   │     └─ 그 외 서비스 · 내 SaaS ────► Interface Endpoint(PrivateLink)
   │            └─ 접근 대상 제한 ─────►   엔드포인트 정책 + 버킷 정책 aws:SourceVpce
   │
   ├─ VPC ↔ VPC / 온프레미스인가?
   │     ├─ 두 VPC만, 전이 불필요 ─────► Peering (전이 라우팅 불가)
   │     ├─ 다수 VPC 허브 ─────────────► Transit Gateway (검사 시 appliance mode)
   │     ├─ 온프레미스 암호화 ─────────► Site-to-Site VPN (IPsec)
   │     └─ 전용 대역폭 ───────────────► Direct Connect (+VPN으로 암호화)
   │
   └─ VPC 내부 흐름을 검사·차단해야 하는가?
         ├─ IP·포트 화이트리스트 ──────► Security Group
         ├─ IP 블랙리스트(서브넷) ─────► NACL deny
         ├─ 프로토콜·도메인·시그니처 ──► Network Firewall (라우팅 강제 필수)
         └─ DNS 질의 ──────────────────► Route 53 Resolver DNS Firewall
```

### 프라이빗 접근 3종 대조

| 축 | Gateway Endpoint | Interface Endpoint | NAT Gateway |
|---|---|---|---|
| 대상 | **S3·DynamoDB만** | 대부분 AWS 서비스·PrivateLink SaaS | 인터넷 전체 |
| 구현 | 라우팅 테이블 항목 | ENI + 프라이빗 IP | 관리형 NAT |
| 비용 | **무료** | 시간 + 데이터 | 시간 + 데이터 |
| 통제 수단 | 엔드포인트 정책 | 엔드포인트 정책 + **SG** | 없음(경로만) |
| 인터넷 경유 | 안 함 | 안 함 | **함** |
| "MOST cost-effective + private" | ★정답 | 후보 | 오답 |

이 표가 그대로 문항이 된다. **"인터넷 경유 없이" + "비용 최소" + "S3"** 세 단서가 동시에 나오면 답은 언제나 Gateway Endpoint다.

### 프라이빗 연결의 정석

퍼블릭 인터넷을 거치지 않고 AWS 서비스·다른 VPC에 접근하는 패턴:
- **S3/DynamoDB** → Gateway Endpoint(라우팅, 무료). 엔드포인트 정책으로 접근 버킷 제한.
- **그 외 AWS 서비스·내 SaaS** → Interface Endpoint(PrivateLink). 프라이빗 IP로 노출.
- **온프레미스 ↔ VPC** → Site-to-Site VPN(IPsec) 또는 Direct Connect(+VPN으로 암호화).
- **VPC ↔ VPC** → Peering(전이 불가) 또는 Transit Gateway(허브, 전이 가능).

핵심 함정: **VPC Endpoint를 만들어도 IAM/엔드포인트 정책이 허용해야 통신**한다. 그리고 엔드포인트 정책의 `aws:SourceVpce`·`aws:SourceVpc` 조건으로 S3 버킷이 *특정 VPC에서만* 접근되게 잠글 수 있다 — 데이터 유출(exfiltration) 방지의 핵심.

## IAM: 권한 평가의 논리

IAM 정책 평가는 시험에서 가장 정밀하게 묻는 영역이다. 평가 순서를 외워야 한다:

1. **명시적 Deny** → 어디든 하나라도 있으면 **즉시 거부**(최우선).
2. **SCP**(Organizations) → 권한의 *상한선(guardrail)*. SCP가 허용 안 하면 IAM Allow가 있어도 거부.
3. **Resource-based / Identity-based Allow** → 둘 중 하나라도 허용하면(교차 계정은 양쪽 필요) 허용.
4. **Permission Boundary** → 개별 사용자/역할의 *최대 권한* 제한.
5. 명시적 Allow 없으면 → **암묵적 거부**(기본).

> 💡 **관련 이론**: 핵심 정신 모델은 *"권한 = (Identity ∪ Resource Allow) ∩ SCP ∩ Permission Boundary − 모든 Deny"*. SCP와 Permission Boundary는 권한을 *부여하지 않는다* — 오직 상한선을 *제한*만 한다. 실제 권한은 여전히 identity/resource 정책이 부여해야 한다. "SCP를 붙였는데 왜 권한이 안 생기나" 같은 오해는 여기서 나온다.

### 정밀 버전: 여섯 층을 통과해야 ALLOW

week2에서 판 평가 엔진을 시험 답안 형태로 다시 세운다.

```
요청 = (Principal, Action, Resource, Condition Context)
   │
   ├─① 명시적 Deny ── 어느 정책 유형이든 Deny 하나면 ▶ DENY (즉시 종료)
   ├─② SCP ───────── 프린시펄 계정의 유효 SCP가 허용 안 하면 ▶ DENY
   ├─③ RCP ───────── 리소스 측 조직 상한이 허용 안 하면 ▶ DENY
   ├─④ 리소스 정책 ── 동일 계정 + 프린시펄 직접 지정 Allow면 통과 가능(예외 경로)
   ├─⑤ 권한 경계 ──── 경계가 허용 안 하면 ▶ DENY
   ├─⑥ 세션 정책 ──── 허용 안 하면 ▶ DENY
   └─⑦ 아이덴티티 정책 ── Allow 없으면 ▶ 암묵적 DENY
                              ▼
                            ALLOW

유효 권한 = (SCP ∩ RCP ∩ 권한경계 ∩ 세션정책) ∩ (IAM Allow ∪ 리소스정책 Allow) − (모든 Deny)
```

| 정책 유형 | 붙는 대상 | 권한 부여 | 권한 제한 | 관리 계정 적용 | 시험에서의 자리 |
|---|---|---|---|---|---|
| **SCP** | Root / OU / 계정 | ✗ | ○ (프린시펄 상한) | **✗** | 리전 잠금·보안 서비스 보호·루트 차단 |
| **RCP** | Root / OU / 계정 | ✗ | ○ (리소스 접근 상한) | ✗ | 조직 밖으로의 노출 차단 |
| **아이덴티티 IAM** | 사용자·그룹·역할 | ○ | ○ | ○ | 실제 권한 부여의 본체 |
| **리소스 정책** | S3·KMS·SQS·Lambda 등 | ○ (교차계정) | ○ | ○ | 교차 계정 공유·서비스 프린시펄 허용 |
| **권한 경계** | IAM 사용자·역할 | ✗ | ○ (개별 주체 상한) | ○ | 위임자에게 안전하게 IAM 권한 부여 |
| **세션 정책** | AssumeRole 세션 | ✗ | ○ (일시적 상한) | ○ | 페더레이션·임시 자격증명 축소 |

시험이 변형을 만들어 내는 원형 세 가지만 손에 익히면 된다.

**케이스 A — SCP Deny vs AdministratorAccess.** 계정 관리자가 `AdministratorAccess`를 갖고 리전 잠금 SCP가 붙은 OU에서 금지 리전에 EC2를 띄우려 한다. → **DENY.** ①에서 끝난다. IAM Allow의 강도는 의미가 없다. "관리자라서 통과한다"가 오답의 원형이다.

**케이스 B — 교차 계정 S3.** A 계정 역할이 B 계정 버킷을 읽는다. **양쪽 Allow가 모두 필요하다**(A의 IAM 정책 + B의 버킷 정책). 동일 계정 안에서만 리소스 정책 단독 Allow가 성립한다. 여기에 B의 OU에 RCP가 붙어 조직 외부 프린시펄을 막고 있다면, A가 같은 조직이면 통과하고 조직 밖이면 양쪽 Allow가 다 있어도 막힌다.

**케이스 C — 범위 판단.** "개발자가 만든 역할이 관리자 권한을 갖지 못하게" → **권한 경계**(주체 하나의 천장). "이 계정 전체에서 아무도 특정 리전을 못 쓰게" → **SCP**(계정·OU 범위). 한 줄 기준: **범위가 계정·OU면 SCP, 주체 하나면 권한 경계.** 이 둘을 바꿔 답하게 만드는 보기가 단골이다.

> ⚠️ **함정**: **SCP는 관리 계정의 프린시펄에 적용되지 않는다.** 그래서 "관리 계정에 워크로드를 두지 마라"는 취향이 아니라 구조적 필연이다. 같은 맥락에서 **서비스 연결 역할(SLR)이 AWS 서비스 자격으로 수행하는 호출도 SCP 평가에서 빠진다.** "SCP를 붙였는데 특정 경로만 계속 통과한다"는 지문이 나오면 이 두 예외를 먼저 의심하라. 또 RCP는 지원 서비스가 제한적이므로 "RCP로 모든 서비스의 조직 경계를 강제한다"는 서술은 틀린 보기다.

### AccessDenied를 진단하는 순서

"왜 안 되는가" 문항은 진단 순서를 그대로 답으로 요구한다.

```
AccessDenied 발생
   │
   ├─① 어떤 주체인가?  ── 페더레이션·AssumeRole이면 세션 정책·역할 체이닝 확인
   ├─② SCP/RCP에 걸렸나? ── 조직 가드레일(리전·서비스·태그 조건)
   ├─③ 명시적 Deny가 있나? ── 버킷 정책·KMS 키 정책·권한 경계 어디든 하나면 끝
   ├─④ 교차 계정인가? ── 양쪽 Allow가 다 있는가(한쪽만이면 실패)
   ├─⑤ KMS가 끼어 있나? ── S3 SSE-KMS 객체는 **키 정책도 허용**해야 읽힌다 ★단골
   ├─⑥ 조건 키가 안 맞나? ── MFA·SourceIp·SourceVpce·태그 조건
   └─⑦ 그래도 없으면 ── Allow 자체가 없는 암묵적 거부

도구: IAM Policy Simulator / 마지막 액세스 정보 / CloudTrail의 errorCode
```

⑤가 특히 자주 나온다. **"AdministratorAccess를 붙였는데 S3 객체를 못 읽는다"**의 답은 십중팔구 *버킷 정책의 explicit deny*, *SCP 차단*, 또는 *KMS 키 정책 미허용* 중 하나다. AdministratorAccess는 아이덴티티 정책 한 층일 뿐 다른 층을 뚫지 못한다.

> ⚠️ **함정**: 조건 키에도 함정이 있다. `aws:MultiFactorAuthPresent`는 **AssumeRole로 얻은 임시 자격증명에는 키 자체가 없을 수 있어** `Bool` 비교가 의도와 다르게 동작한다 — 정밀한 정책은 `BoolIfExists`를 쓴다. 그리고 VPC 엔드포인트를 경유하는 요청에는 `aws:SourceIp`가 기대대로 동작하지 않는다 — 이때는 `aws:SourceVpce`/`aws:SourceVpc`를 써야 한다.

### 교차 계정·임시 자격증명

- **AssumeRole**: 역할의 trust policy(누가 맡을 수 있나) + permission policy(맡으면 뭘 하나)를 분리. STS가 임시 키 발급.
- **External ID**: 서드파티가 내 역할을 맡을 때 *confused deputy* 방지.
- **Roles Anywhere**: 온프레미스 워크로드가 X.509 인증서로 IAM 역할 사용.
- **IAM Identity Center(SSO)**: 다계정·SAML/OIDC 페더레이션의 현행 권장. permission set으로 다계정 접근 중앙 관리.
- **Cognito**: 앱 사용자(end-user) 인증. Identity Pool로 임시 AWS 자격증명 부여.

> ⚠️ **자주 틀리는 구분**: 
> - **IAM 역할 = 직원·워크로드**(페더레이션/AssumeRole). **Cognito = 앱 사용자**. 혼동 금지.
> - **장기 액세스 키를 절대 인스턴스에 두지 말 것** → EC2는 *인스턴스 프로파일(역할)*, EKS는 *IRSA/Pod Identity*, Lambda는 *실행 역할*.
> - **SCP는 권한을 주지 않는다** — 상한만 제한.

> 🎯 **통합 시나리오 A**: "프라이빗 서브넷의 EC2가 특정 S3 버킷에만, 인터넷을 거치지 않고 접근해야 한다. 자격증명은 하드코딩 금지." 답: (1) **인프라 차원** — Gateway VPC Endpoint(S3) + 엔드포인트 정책으로 그 버킷만 허용 + 버킷 정책에 `aws:SourceVpce` 조건으로 그 엔드포인트에서만 접근. (2) **IAM 차원** — EC2 인스턴스 프로파일(역할)에 해당 버킷 GetObject만 부여. 네트워크 경로(endpoint)와 권한(역할)이 *동시에* 만족해야 통신. 두 도메인의 협력.

### 워크로드 유형별 자격증명 매핑

이 표는 문항에서 *그대로* 보기가 된다. 한 칸만 바꿔 오답을 만든다.

| 워크로드 | 정답 메커니즘 | 오답으로 쓰이는 것 |
|---|---|---|
| EC2 애플리케이션 | 인스턴스 프로파일(IAM 역할) + **IMDSv2** | 액세스 키를 파일·환경 변수에 |
| EKS 파드 | IRSA / EKS Pod Identity | 노드 역할에 광범위 권한 |
| ECS 태스크 | 태스크 역할(실행 역할과 구분) | 컨테이너 이미지에 키 내장 |
| Lambda | 실행 역할 | 환경 변수에 키 |
| 온프레미스·타 클라우드 | **IAM Roles Anywhere**(X.509) | 장기 IAM 사용자 키 |
| 직원(사람) 다계정 접근 | **IAM Identity Center** permission set | 계정별 IAM 사용자 |
| 앱 최종 사용자 | **Cognito**(User Pool 인증 / Identity Pool AWS 자격증명) | IAM 사용자 키를 앱에 내장 |
| 서드파티 SaaS | 교차 계정 역할 + trust policy + **External ID** | 액세스 키 공유 |
| CI/CD(GitHub Actions 등) | OIDC 페더레이션 역할 | 저장소 시크릿에 장기 키 |

> ⚠️ **함정**: **역할 체이닝(role chaining)**에는 제약이 있다 — 역할로 다시 역할을 맡으면 세션 최대 길이가 1시간으로 제한되고, 원래 역할의 `MaxSessionDuration` 설정은 적용되지 않는다. "왜 세션이 자꾸 1시간에 끊기나" 지문의 답이다. 그리고 **IMDSv2**는 세션 지향 방식으로 SSRF를 통한 자격증명 탈취를 어렵게 하고, **hop limit**을 1로 두면 컨테이너에서 호스트 메타데이터로의 접근을 줄인다 — 이건 *대응*이 아니라 *준비* 항목이다.

## 시크릿·키 관리(IAM의 연장)

자격증명·시크릿을 안전하게 다루는 것도 도메인 4의 영역:
- **Secrets Manager**: DB 자격증명 등 *자동 로테이션* 필요한 시크릿. Lambda 로테이터.
- **SSM Parameter Store**: 설정값·시크릿(SecureString). 로테이션 없음, 무료 티어.
- **인스턴스에 키 박지 말 것**: 역할 + 임시 자격증명이 정답.

| 축 | Secrets Manager | SSM Parameter Store (SecureString) |
|---|---|---|
| 자동 로테이션 | **내장(Lambda 로테이터)** | 없음(직접 구현) |
| 교차 계정 공유 | 리소스 정책 지원 | 제한적 |
| 리전 복제 | 지원 | 직접 처리 |
| 비용 | 시크릿당 과금 | 표준 티어 저렴 |
| 언제 고르나 | "**자동 로테이션**", "DB 자격증명" | "설정값", "로테이션 불필요", "**비용 최소**" |

한 줄 기준: **로테이션이 요구되면 Secrets Manager, 단순 시크릿·설정값이고 비용을 강조하면 Parameter Store.** 강조어(`MOST cost-effective`)가 붙으면 후자로 기운다.

> 🎯 **통합 시나리오 B**: "서드파티 모니터링 SaaS에 내 계정 읽기 권한을 주되, 그들이 내 역할을 안전하게만 맡게 하라." 답: 교차 계정 IAM 역할 생성 → trust policy에 그 SaaS 계정 Principal + **External ID** 조건. permission policy는 읽기 전용 최소 권한. 장기 키 공유 대신 AssumeRole로 임시 자격증명. External ID가 confused deputy 공격을 막는다.

## 두 도메인을 잇는 정신 모델

```
요청 도달 가능?  ──► [인프라: SG/NACL/Endpoint/라우팅]  ── 네트워크 경로 통과
       │
       ▼ (경로 OK)
요청 권한 있나?  ──► [IAM: Deny → SCP → Allow → Boundary]  ── 권한 평가 통과
       │
       ▼ (둘 다 OK)
        실제 동작 허용
```

> 🔍 **더 깊이**: 시험의 "best" 답이 항상 두 계층을 동시에 거는 이유는 *defense in depth*다. SG만으로 막으면 SG가 잘못 열렸을 때 무방비고, IAM만으로 막으면 네트워크 정찰을 허용한다. 데이터 유출 방지의 정점은 세 겹 — VPC Endpoint(경로 제한) + 엔드포인트/버킷 정책(`aws:SourceVpce` 조건) + IAM 최소 권한. 한 겹이 뚫려도 나머지가 막는다. Specialty는 "어느 하나"가 아니라 "이 조합"을 고르게 한다. 여기에 조직 규모가 붙으면 네 번째 겹으로 `aws:PrincipalOrgID` 기반 SCP/RCP가 들어온다 — *나가는 문은 SCP, 들어오는 문은 RCP*.

## 도메인 3·4 키워드 → 서비스 번역표

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---|---|
| "인터넷 경유 없이 S3/DynamoDB", "비용 최소" | Gateway VPC Endpoint(무료) |
| "인터넷 경유 없이 그 외 서비스·내 SaaS" | Interface Endpoint(PrivateLink) |
| "이 VPC에서만 버킷 접근 가능하게" | 버킷 정책 `aws:SourceVpce` / `aws:SourceVpc` |
| "특정 IP 대역을 서브넷 전체에서 차단" | NACL deny |
| "인스턴스 단위 허용 목록" | Security Group |
| "응답이 안 돌아온다"(인바운드는 열었는데) | NACL 아웃바운드 임시 포트 |
| "SQLi/XSS/봇/특정 경로 rate limit" | WAF (managed rule + rate-based) |
| "대규모 L3/4 flood, DDoS 비용 보호, 대응팀" | Shield Advanced |
| "VPC 이그레스에 IPS·도메인 통제" | Network Firewall (+라우팅 강제, TGW면 appliance mode) |
| "악성 도메인 질의 차단" | Route 53 Resolver DNS Firewall |
| "오리진에 직접 못 붙게" | CloudFront + OAC / 비밀 헤더 / prefix list |
| "다수 VPC를 허브로", "전이 라우팅" | Transit Gateway (Peering은 전이 불가) |
| "온프레미스와 전용 대역폭" | Direct Connect (+VPN으로 암호화) |
| "서드파티 어플라이언스를 인라인으로" | Gateway Load Balancer |
| "권한의 최대 경계", "조직 전체에서 못 하게" | SCP |
| "위임받은 사람이 자기 권한을 못 넘게" | 권한 경계 |
| "교차 계정 안전 위임", "confused deputy" | AssumeRole + trust policy + External ID |
| "다계정 SSO·SAML/OIDC 페더레이션" | IAM Identity Center |
| "온프레미스 서버가 IAM 역할을" | IAM Roles Anywhere(X.509) |
| "앱 최종 사용자 로그인" | Cognito |
| "DB 자격증명 자동 로테이션" | Secrets Manager |
| "설정값·시크릿, 로테이션 불요, 저비용" | Parameter Store SecureString |
| "SSRF로 메타데이터 탈취 방지" | IMDSv2 + hop limit |
| "누가 어떤 권한을 실제로 안 쓰는지" | IAM Access Analyzer(미사용 액세스) / 마지막 액세스 정보 |
| "조직 밖으로 리소스가 공유되지 못하게" | SCP·RCP + `aws:PrincipalOrgID` |

## 도메인 3·4 함정 총정리

> ⚠️ **네트워크 함정**:
> - **NACL은 stateless** → 아웃바운드 임시 포트(1024–65535)를 별도 허용.
> - SG는 **거부 규칙이 없다**(화이트리스트만) — IP 차단은 NACL.
> - SG는 stateful이라 **established 세션이 잠시 유지**될 수 있다 — 즉시 끊으려면 NACL 보조.
> - **Gateway Endpoint는 S3·DynamoDB뿐** — 다른 서비스에 쓴다는 보기는 오답.
> - VPC Endpoint를 만들어도 **엔드포인트/IAM/리소스 정책이 허용해야** 통신.
> - Network Firewall은 **라우팅으로 강제 통과**시켜야 검사한다.
> - TGW stateful 검사에 **appliance mode** 누락 시 비대칭 오작동.
> - **CloudFront 범위 WAF·Shield Advanced 정책은 us-east-1**.
> - VPC Peering은 **전이 라우팅 불가** — 3개 이상이면 TGW.
> - 엣지에 WAF를 걸어도 **오리진 직접 접근**을 막지 않으면 우회된다.

> ⚠️ **IAM 함정**:
> - **SCP·권한 경계·RCP·세션 정책은 권한을 부여하지 않는다** — 상한만 제한.
> - **명시적 Deny는 어디에 있든 최종** — AdministratorAccess도 이기지 못한다.
> - **SCP는 관리 계정 프린시펄에 미적용**, **서비스 연결 역할 호출도 평가에서 제외**.
> - **교차 계정은 양쪽 Allow 필요** — 동일 계정에서만 리소스 정책 단독 Allow가 성립.
> - SSE-KMS 객체 접근은 **버킷 정책 + KMS 키 정책**이 함께 허용해야 한다.
> - `aws:MultiFactorAuthPresent`는 키가 없을 수 있어 **`BoolIfExists`**를 쓴다.
> - VPC 엔드포인트 경유 요청에는 `aws:SourceIp`가 아니라 **`aws:SourceVpce`**.
> - **역할 체이닝은 최대 1시간** 세션.
> - 장기 액세스 키를 워크로드에 두지 말 것 — 역할 + 임시 자격증명.
> - IAM 역할=직원·워크로드, **Cognito=앱 사용자**.

> 📚 **사례**: **Capital One(2019)** 사건은 이 두 도메인이 어떻게 맞물리는지를 한 줄로 보여 준다. 웹 애플리케이션의 SSRF 취약점을 통해 인스턴스 메타데이터 서비스에 도달했고, 거기서 얻은 **인스턴스 역할의 임시 자격증명**으로 S3 데이터가 반출됐다. 네트워크 경계(도메인 3)를 넘은 것은 애플리케이션 계층의 결함이었지만, 실제 피해 규모를 결정한 것은 **그 역할이 가진 권한의 넓이**(도메인 4)였다. 교훈이 정확히 시험의 정답 형태와 겹친다 — ① IMDSv2·hop limit으로 메타데이터 접근을 어렵게 하고, ② 역할 권한을 필요한 버킷·필요한 액션으로 좁히고, ③ 버킷 정책의 `aws:SourceVpce`로 접근 경로 자체를 제한하고, ④ 이상 접근을 GuardDuty·CloudTrail 데이터 이벤트로 탐지한다. **경로 하나만 막거나 권한 하나만 좁히는 답은 이 사건을 막지 못했다는 점**이, Specialty가 항상 조합을 고르게 하는 이유다.

## 정리하며

도메인 3과 4를 한 문장으로 줄이면 **"경로가 닿아야 하고 권한이 있어야 한다 — 그리고 시험은 언제나 둘 다 잠근 답을 고른다"**이다.

읽는 요령을 셋만 남긴다. ① 지문이 *"인터넷 없이"*를 말하면 엔드포인트를, *"비용 최소"*를 덧붙이면 Gateway를 떠올린다. ② 지문이 *"왜 안 되는가"*를 물으면 명시적 Deny → SCP → 교차 계정 양쪽 Allow → KMS 키 정책 → 조건 키 순으로 훑는다. ③ 지문이 *"조직 전체"*, *"앞으로 만들어질"*을 말하면 계정 단위 도구는 오답이고 조직 도구(SCP·RCP·Firewall Manager·Identity Center)가 답이다.

마지막으로, 이 두 도메인에서 가장 비싼 실수는 지식의 부족이 아니라 **한 겹만 잠근 답을 고르는 것**이다. 보기 넷 중 하나가 "네트워크 + 권한 + 조건"을 함께 말하고 있다면, 그것이 대개 정답이다.

## 한 줄 요약 체크리스트

- [ ] SG=stateful/허용만, NACL=stateless/허용+거부의 차이와 NACL 임시 포트를 아는가
- [ ] 프라이빗 접근에 Gateway(S3/DDB) vs Interface(PrivateLink) Endpoint를 구분하는가
- [ ] `aws:SourceVpce`/`aws:SourceVpc` 조건으로 데이터 유출을 막는 패턴을 아는가
- [ ] IAM 평가 순서(Deny→SCP→Allow→Boundary)를 외웠는가
- [ ] SCP·Permission Boundary는 권한을 *제한*만 하고 부여하지 않음을 아는가
- [ ] 워크로드 자격증명=역할(인스턴스 프로파일/IRSA/실행 역할), 키 하드코딩 금지를 지키는가
- [ ] 교차 계정=AssumeRole+trust policy(+External ID), 앱 사용자=Cognito를 구분하는가

---

## 📝 연습 문제

**문제 1.** 프라이빗 서브넷의 EC2가 인터넷을 경유하지 않고 특정 S3 버킷에만 접근해야 하며, 자격증명 하드코딩은 금지다. 가장 적절한 설계는?

A) NAT Gateway로 인터넷 경유 후 액세스 키를 EC2에 저장  
B) S3 Gateway VPC Endpoint(엔드포인트 정책으로 해당 버킷만) + 버킷 정책 `aws:SourceVpce` 조건 + EC2 인스턴스 프로파일(역할)에 최소 권한  
C) 퍼블릭 서브넷으로 옮기고 보안 그룹만 잠근다  
D) IAM 사용자 액세스 키를 환경 변수로 주입  

**정답: B**  
해설: 인터넷 비경유 프라이빗 접근은 S3 Gateway Endpoint(라우팅 기반·무료)로 처리하고, 엔드포인트 정책으로 대상 버킷을 제한하며, 버킷 정책의 `aws:SourceVpce` 조건으로 그 엔드포인트에서만 접근하게 잠근다. 자격증명은 인스턴스 프로파일(역할)로 임시 발급해 하드코딩을 없앤다. NAT 경유·퍼블릭 이전은 인터넷을 거치고, 액세스 키 저장/주입은 하드코딩 금지 요구를 위반한다.

---

**문제 2.** Organizations에서 SCP로 특정 리전 외 모든 서비스를 거부했는데, 한 계정의 관리자가 자신에게 IAM full-admin 정책을 붙여도 그 리전에서 동작하지 못한다. 이유는?

A) IAM 정책이 손상됐다  
B) SCP는 권한 상한선(guardrail)이므로, SCP가 허용하지 않으면 IAM Allow가 있어도 거부된다  
C) Permission Boundary가 자동 적용됐다  
D) STS 토큰이 만료됐다  

**정답: B**  
해설: IAM 평가에서 SCP는 계정 내 모든 주체의 권한 상한을 정하는 guardrail이다. SCP가 해당 리전을 거부하면 IAM identity 정책이 full-admin이어도 실제 권한은 교집합으로 제한되어 거부된다. 정책 손상이나 토큰 만료가 아니며, Permission Boundary는 자동 적용되지 않는다. SCP는 권한을 부여하지 않고 제한만 한다는 원칙의 직접 사례다.

---

**문제 3.** 서드파티 SaaS가 고객 계정의 리소스를 읽도록 교차 계정 접근을 부여할 때, confused deputy 공격을 방지하는 권장 메커니즘은?

A) SaaS에 IAM 사용자 액세스 키를 발급  
B) 교차 계정 역할의 trust policy에 SaaS 계정 Principal과 함께 External ID 조건을 추가  
C) 버킷을 퍼블릭으로 공개  
D) Security Group으로 SaaS IP를 허용  

**정답: B**  
해설: 교차 계정 역할 위임 시 trust policy에 External ID 조건을 추가하면, 공격자가 다른 고객 컨텍스트로 역할을 가로채는 confused deputy를 방지한다. 장기 액세스 키 공유는 안티패턴이고, 버킷 공개는 보안을 무너뜨리며, Security Group은 네트워크 통제일 뿐 교차 계정 권한 위임 메커니즘이 아니다.

---

**문제 4.** 특정 악성 IP 대역을 서브넷 전체에서 차단해야 한다. 보안 그룹으로는 불가능했던 이유와 올바른 통제는?

A) 보안 그룹에는 명시적 거부 규칙이 없어 화이트리스트만 가능 — 서브넷 단위 명시적 deny가 가능한 NACL을 사용  
B) 보안 그룹이 stateless여서  
C) NACL은 인스턴스 단위라 부적합하므로 보안 그룹 유지  
D) 라우팅 테이블에서 IP를 차단  

**정답: A**  
해설: 보안 그룹은 허용 규칙만 가지므로 특정 IP를 거부할 수 없다(화이트리스트 모델). 서브넷 단위에서 명시적 deny가 가능한 NACL이 IP 블랙리스트에 적합하다. 보안 그룹은 stateful이고, NACL은 인스턴스가 아닌 서브넷 단위이며, 라우팅 테이블은 출발지 IP 기준 차단 도구가 아니다.

---

**문제 5.** 다음 워크로드 유형과 권장 자격증명 메커니즘의 연결 중 잘못된 것은?

A) EC2 애플리케이션 → 인스턴스 프로파일(IAM 역할)  
B) EKS 파드 → IRSA / Pod Identity(서비스 계정 ↔ IAM 역할)  
C) 모바일 앱 최종 사용자 → IAM 사용자 액세스 키를 앱에 내장  
D) 온프레미스 서버 → IAM Roles Anywhere(X.509 인증서)  

**정답: C**  
해설: 모바일 앱 최종 사용자에게 IAM 사용자 액세스 키를 내장하는 것은 심각한 안티패턴으로, Cognito Identity Pool을 통해 임시·범위 제한 AWS 자격증명을 부여해야 한다. EC2=인스턴스 프로파일, EKS=IRSA/Pod Identity, 온프레미스=Roles Anywhere는 모두 장기 키를 피하는 올바른 매핑이다.

---

**문제 6.** NACL을 새로 구성해 인바운드 HTTPS(443)를 허용했는데, 응답 트래픽이 클라이언트에 도달하지 못한다. 가장 가능성 높은 원인은?

A) 보안 그룹이 잘못됐다  
B) NACL은 stateless이므로 아웃바운드 임시 포트(1024-65535) 허용 규칙을 별도로 추가해야 한다  
C) 라우팅 테이블에 인터넷 게이트웨이가 없다  
D) DNS 해석이 실패했다  

**정답: B**  
해설: NACL은 stateless라 인바운드 허용만으로는 부족하고, 응답이 나가는 아웃바운드 임시 포트(ephemeral, 1024-65535) 범위를 명시적으로 허용해야 한다. 보안 그룹은 stateful이라 이 문제를 일으키지 않으며, 증상(응답만 막힘)은 라우팅 부재나 DNS 실패의 전형이 아니다. NACL 임시 포트 누락은 전형적인 함정이다.

---

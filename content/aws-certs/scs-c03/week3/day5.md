# Day 5 - Week 3 종합: 네트워크 격리와 트래픽 통제를 하나로

이번 주는 네트워크가 보안의 첫 방어선이라는 사실에서 출발했다. IAM이 "누가 무엇을 할 수 있는가"를 다룬다면, 네트워크는 그 이전에 "애초에 누가 어디까지 닿을 수 있는가"를 결정한다. 도달할 수 없으면 공격할 수 없다. 한 주 동안 본 네 가지 — VPC 설계, SG/NACL, Flow Logs, 프라이빗 연결 — 은 따로 떨어진 주제가 아니다. 하나의 방어 체계를 네 각도에서 본 것이다.

오늘은 이 넷을 하나의 시나리오에 녹여 통합 복습한다. 시험에서 마주칠 복합 문제는 거의 항상 여러 계층을 동시에 묻는다. "RDS가 인터넷에 노출됐다"는 한 문장 안에 라우팅, SG, NACL, Public IP가 모두 들어 있다. 계층을 분리해 사고하는 훈련이 합격선이다.

## 한 장으로 보는 네트워크 보안 스택

```
요청 →  [라우팅 테이블]  경로 없으면 도달 불가 (암묵적 차단)
        [NACL 인바운드]  서브넷 경계, stateless, Deny 가능, 번호순
        [보안 그룹 인바운드] ENI, stateful, Allow만, 종합 평가
        [리소스]         처리
        ── 모든 흐름은 [Flow Logs]가 메타데이터로 기록 ──
        외부 통신은 [NAT] 또는 [VPC Endpoint]로
        [Endpoint Policy + 버킷 정책] 데이터 경계 강제
```

| 계층 | 역할 | 핵심 한 줄 |
|------|------|-----------|
| 라우팅 | 도달 가능성 | 경로 없으면 못 간다 |
| NACL | 서브넷 광역 통제 | stateless, Deny 가능, first-match |
| 보안 그룹 | 리소스 정밀 통제 | stateful, Allow만, SG 참조 가능 |
| Flow Logs | 가시성 | 막지 않고 본다(ACCEPT/REJECT) |
| Endpoint | 사설 연결 | 인터넷 경로 제거 + 데이터 경계 |

> 💡 **관련 이론**: 이 스택 전체가 **Defense in Depth**의 구현이다. 어느 한 계층의 실수가 곧바로 침해로 이어지지 않도록 여러 겹을 둔다. SG를 잘못 열어도 라우팅이 막혀 있으면 도달 불가. 라우팅이 열려도 NACL이 막을 수 있다. 그리고 모든 계층의 결과는 Flow Logs로 관찰된다. 보안 설계의 목표는 "한 곳이 뚫려도 전체가 무너지지 않게" 하는 것이다.

### 패킷 한 개의 일생 — 들어올 때와 나갈 때

이번 주 내용을 한 장으로 붙이면 결국 이 그림이 된다. 들어오는 패킷과 나가는 패킷이 **서로 다른 관문 조합**을 지난다는 점이 핵심이다.

```
[ 들어오는 패킷 ]                        [ 나가는 패킷 ]

  인터넷                                   EC2 (10.0.10.5)
    │                                        │
  ┌─▼──────────┐                          ┌──▼──────────┐
  │    IGW     │ 라우팅에 경로 있어야       │ SG 아웃바운드 │ 기본 전체 허용
  └─┬──────────┘ (없으면 여기서 끝)        └──┬──────────┘
    │                                        │
  ┌─▼──────────┐                          ┌──▼──────────┐
  │NACL 인바운드│ stateless / Deny가능      │NACL 아웃바운드│ stateless
  │            │ 번호순 first-match        │             │ 임시포트 잊지 말 것
  └─┬──────────┘  → REJECT 기록            └──┬──────────┘
    │                                        │
  ┌─▼──────────┐                     ┌───────┴────────┐
  │ SG 인바운드 │ stateful / Allow만   │  라우팅이 결정  │
  │            │ SG 참조 가능         ├────────────────┤
  └─┬──────────┘  → REJECT 기록       │ 0.0.0.0/0→IGW  │ 양방향 노출
    │                                 │ 0.0.0.0/0→NAT  │ 유출 경로 됨
  ┌─▼──────────┐                      │ pl-xxx →vpce   │ 사설·정책 통제 ★
  │  EC2 처리   │                      │ ::/0   →eigw   │ IPv6 아웃바운드
  └─┬──────────┘                      └───────┬────────┘
    │ 응답 생성                                │
    │ (SG 아웃바운드는 평가 안 함 — 기억하므로)   ▼
    └──────────────────────────────────▶  목적지 / 정책 관문
                                            IAM ∩ 엔드포인트정책 ∩ 리소스정책

  ── 모든 흐름은 Flow Logs에 메타데이터로 남는다(ACCEPT/REJECT).
     들어오는 쪽은 "누가 시도했나", 나가는 쪽은 "무엇이 새 나갔나"를 답한다.
```

왼쪽과 오른쪽을 비교해 보면 이번 주의 논지가 드러난다. **인바운드 통제는 성숙해 있지만 아웃바운드 통제는 대개 비어 있다.** SG 아웃바운드는 기본이 전체 허용이고, NAT는 목적지를 가리지 않으며, 많은 조직이 "나가는 트래픽"에는 규칙을 걸지 않는다. 그런데 데이터 유출은 정확히 그 방향으로 일어난다. 4일차의 엔드포인트 정책이 중요한 이유가 이것이다 — 오른쪽 그림의 마지막 관문을 채워 넣는 유일한 도구이기 때문이다.

## 통합 시나리오 1: RDS 노출 사고 분석

> **상황**: 보안 스캐너가 "프로덕션 RDS가 인터넷에서 접근 가능"이라고 경고했다. 무엇을, 어떤 순서로 확인하고 차단하는가?

**도달 가능성 분석(순서대로)**:
1. **RDS PubliclyAccessible** — 켜져 있으면 퍼블릭 DNS·IP 부여됨. 끈다.
2. **라우팅 테이블** — 해당 서브넷에 0.0.0.0/0 → IGW 경로가 있나? Data Tier라면 없어야 정상.
3. **보안 그룹** — 인바운드 3306/5432가 0.0.0.0/0으로 열렸나? App SG 참조로 좁힌다.
4. **NACL** — 서브넷 경계에서 추가로 막을 수 있다.

> 🎯 **핵심**: 인터넷 도달이 성립하려면 **라우팅(IGW) + Public 주소 + SG/NACL 허용이 모두** 필요하다. 가장 근본적인 차단은 RDS를 인터넷 경로가 없는 Data Subnet에 두고 PubliclyAccessible을 끄는 것. SG만 좁히는 건 표면적 처방이다. Reachability Analyzer로 어느 계층이 경로를 열었는지 정확히 짚는다.

```sql
-- Flow Logs로 사고 전후 실제 접근 시도 확인
SELECT srcaddr, dstport, action, count(*)
FROM vpc_flow_logs
WHERE dstport IN (3306, 5432) AND srcaddr NOT LIKE '10.%'
GROUP BY srcaddr, dstport, action ORDER BY 4 DESC;
```

## 통합 시나리오 2: 데이터 유출 방지 설계

> **상황**: 민감 고객 데이터를 처리하는 워크로드. 침해되더라도 데이터가 외부로 새지 않게 설계하라.

```
1. 워크로드를 인터넷 경로 없는 App/Data Subnet에 배치
2. NAT 제거 → 무분별한 egress 차단
3. 필요한 AWS 서비스만 VPC Endpoint로 사설 연결
   (S3·DynamoDB = Gateway / KMS·SSM·Secrets = Interface)
4. S3 버킷 정책에 aws:SourceVpce 조건 → 그 엔드포인트만 허용
5. Endpoint Policy에 aws:PrincipalOrgID 조건 → 우리 조직만
6. Flow Logs(pkt-srcaddr 포함)로 모든 egress 감시
```

> 🔍 **더 깊이**: 이 설계의 묘미는 **IAM 침해 이후의 방어**다. 공격자가 인스턴스 자격증명을 탈취해도(Capital One처럼), 데이터를 빼낼 네트워크 경로가 없다. 외부 버킷으로 PutObject하려 해도 NAT가 없어 인터넷으로 못 나가고, 우리 버킷은 SourceVpce 조건으로 그 엔드포인트만 허용. 자격증명 탈취 = 즉시 데이터 유출이라는 등식을 끊는다. 이것이 IAM과 네트워크 격리가 함께 만드는 심층 방어다.

> 📚 **사례**: Capital One 사고를 이 설계로 되짚으면 — SSRF로 메타데이터 자격증명을 탈취한 것까지는 같다. 하지만 S3 접근이 VPC Endpoint + SourceVpce로만 가능하고 egress NAT가 없었다면, 탈취한 자격증명으로도 외부에서 데이터를 가져가기가 훨씬 어려웠다. 네트워크 격리는 "마지막 한 겹"으로 작동한다.

## 통합 시나리오 3: 연결이 안 된다는 신고 하나

> **상황**: "새로 배포한 App 서브넷의 EC2에서 S3 버킷을 읽지 못한다"는 신고가 들어왔다. 개발자는 IAM 권한 문제라고 주장한다. 무엇부터 확인하는가?

여기서 가장 흔한 실수는 **개발자의 가설을 그대로 받아들이는 것**이다. 먼저 확인할 것은 원인이 아니라 증상이다.

```
[ 신고 한 건을 계층으로 분해하는 절차 ]

  STEP 0  에러 메시지를 직접 본다 (전언 말고 원문)
          "Connection timed out"      → 네트워크 계층 (STEP 1~3)
          "AccessDenied"              → 정책 계층   (STEP 4~6)
          "Could not connect to endpoint / DNS" → 이름 해석 (STEP 3-b)
          "KMS ... AccessDenied"      → 대상이 S3가 아니라 KMS다

  STEP 1  라우팅   aws ec2 describe-route-tables
          · Gateway EP를 만들었다면 그 서브넷의 RT에 pl-xxxx 경로가 있나
          · NAT를 지웠는데 0.0.0.0/0 경로가 blackhole로 남아 있지 않나
  STEP 2  NACL     aws ec2 describe-network-acls
          · 인바운드/아웃바운드 양쪽 (임시 포트!)
          · Deny 규칙이 Allow보다 낮은 번호에 있지 않나
  STEP 3  SG / DNS
          3-a. Interface EP의 ENI SG가 443 인바운드를 허용하나
               (Gateway EP에는 SG가 없다 — 여기서 찾지 않는다)
          3-b. Private DNS + VPC의 enableDnsSupport/enableDnsHostnames
  ── 여기까지가 timeout의 영역. 통과했다면 패킷은 도달했다 ──
  STEP 4  엔드포인트 정책   Resource와 Condition을 본다
  STEP 5  리소스 정책       버킷 정책의 aws:SourceVpce에 이 vpce가 있나
                           SSE-KMS면 KMS 키 정책도
  STEP 6  IAM               인스턴스 프로파일 역할 + 권한 경계 + SCP

  ★ 증거는 Flow Logs가 준다
     로그에 행이 아예 없다  → STEP 1 (패킷이 오지도 않았다)
     REJECT가 찍혔다        → STEP 2~3
     ACCEPT만 있다          → STEP 4~6 (네트워크는 통과했다)
```

마지막 세 줄이 이 절차의 핵심 장치다. **Flow Logs가 계층을 즉시 갈라 준다.** ACCEPT만 있고 REJECT가 없는데 애플리케이션은 실패한다면 네트워크는 무죄이고, 그 시점부터는 SG를 아무리 열어도 증상이 바뀌지 않는다. 반대로 로그에 행 자체가 없다면 정책을 아무리 고쳐도 소용없다.

> 🎯 **시나리오**: "위 절차대로 갔더니 Flow Logs에 S3 엔드포인트로 향하는 ACCEPT가 정상적으로 찍혀 있고, 에러는 AccessDenied다. IAM 역할에는 `s3:GetObject`가 명시적으로 허용돼 있다. 다음은?" — 남은 후보는 엔드포인트 정책과 버킷 정책, 그리고 SCP다. 순서는 **좁혀 놓았을 가능성이 높은 것부터** — 최근에 데이터 경계 정책을 적용했다면 버킷 정책의 `aws:SourceVpce` 목록에 이 새 엔드포인트 ID가 빠졌을 가능성이 가장 크다. 새 VPC나 새 엔드포인트를 만들 때 기존 데이터 경계 정책의 허용 목록을 갱신하지 않아 생기는 실패가 실무에서 가장 흔한 유형이다. CloudTrail의 해당 API 이벤트에서 거부 사유와 요청의 `vpcEndpointId`를 확인하면 확정할 수 있다.

## 통합 시나리오 4: 계정이 늘어날 때 무너지는 격리

> **상황**: 계정이 셋에서 서른으로 늘었다. Transit Gateway로 전부 연결했더니 감사에서 "개발 계정에서 프로덕션 데이터베이스 서브넷으로 네트워크 경로가 존재한다"는 지적을 받았다.

이 지적이 나오는 이유는 TGW의 기본 동작 때문이다. 모든 연결을 하나의 라우팅 테이블에 넣으면 서로 통신 가능한 평면 네트워크가 되고, 계정 경계는 IAM에만 존재할 뿐 네트워크에는 존재하지 않게 된다.

```
[ 잘못된 구성 ]                    [ 라우팅 도메인을 나눈 구성 ]

   prod-vpc ─┐                       prod-vpc ─┐
   dev-vpc  ─┼─ TGW (RT 하나)         dev-vpc  ─┤   TGW
   shared   ─┘   전원 상호 통신        shared   ─┘
                                     · prod RT   : prod ↔ shared 만
   dev가 침해되면                      · dev RT    : dev  ↔ shared 만
   prod DB까지 네트워크로 도달          · shared RT : 양쪽 모두
                                     → dev와 prod 사이에 경로 자체가 없다
```

핵심은 **"연결했다"와 "통신 가능하다"를 분리하는 것**이다. TGW에 붙였다고 해서 서로 통신해야 할 이유는 없고, 라우팅 테이블을 용도별로 나누고 각 연결이 어느 테이블과 연관되는지·어디로 전파되는지를 명시하면 필요한 쌍만 통신하게 된다. 이것은 1일차의 "경로가 없으면 못 간다"를 다계정 규모로 확장한 것에 지나지 않는다.

> ⚠️ **함정**: 다계정 환경에서 또 하나 자주 놓치는 것이 **보안 그룹 참조의 경계**다. 같은 VPC 안이나 같은 리전의 Peering 너머로는 SG를 소스로 참조할 수 있지만, **Transit Gateway를 경유하는 트래픽에는 SG 참조가 적용되지 않는다.** 즉 TGW를 도입하는 순간 계층 간 규칙이 SG 참조에서 CIDR로 풀어헤쳐지고, 이때 1일차에서 말한 "계층별 연속 주소 계획"을 해 두었는지가 규칙 개수를 좌우한다. 주소 계획은 IP를 아끼는 일이 아니라 **미래의 규칙 개수를 정하는 일**이라는 점이 여기서 드러난다.

> 🔍 **더 깊이**: 네트워크 격리를 계정 확장에 맞춰 유지하는 일이 어려운 근본 이유는, 연결이 **한 번의 결정**인 반면 격리는 **지속적인 규율**이기 때문이다. 연결을 하나 추가하는 데는 5분이 걸리고 그 순간 아무 문제도 생기지 않는다. 문제는 그런 결정이 서른 번 쌓인 뒤에 드러나며, 그때는 무엇을 끊어도 어딘가가 망가진다. 그래서 성숙한 조직은 연결을 사람의 판단에 맡기지 않고 **구조로 강제한다** — TGW 라우팅 도메인을 미리 정의해 두고, 새 계정은 정해진 도메인에만 붙을 수 있게 하고, 그 규칙을 SCP와 Config 규칙으로 감시한다. "필요할 때 연결한다"가 아니라 "정해진 모양으로만 연결된다"가 확장 가능한 격리의 형태다.

## 자주 틀리는 비교 한 번에 정리

| 헷갈리는 쌍 | 핵심 구분 |
|-------------|-----------|
| SG vs NACL | stateful/stateless, Allow만/Deny가능, ENI/서브넷 |
| Gateway vs Interface EP | S3·DynamoDB 무료 라우팅 / 나머지 ENI 유료 |
| IGW vs NAT | 양방향 / 아웃바운드만 |
| NAT vs VPC Endpoint | 무분별 egress / 특정 서비스 사설 |
| Peering vs PrivateLink | CIDR 전체 노출 / 단일 서비스만 노출 |
| srcaddr vs pkt-srcaddr | NAT IP / NAT 이전 실제 원본 |
| ACCEPT vs REJECT (Flow Logs) | 성공 흐름 / 차단 흐름(정찰 신호) |

> ⚠️ **함정 모음**:
> - NACL 인바운드만 열고 임시 포트 아웃바운드를 안 열면 응답 안 옴(stateless).
> - SG로는 특정 IP 차단 불가(Deny 없음) → NACL Deny 사용.
> - 같은 서브넷 내부 통신은 NACL 미적용 → SG로만 격리.
> - Gateway Endpoint는 온프레미스에서 접근 불가(VPC 내부 전용).
> - Endpoint/버킷/IAM 정책은 AND 평가 → 하나라도 거부하면 거부.
> - Main Route Table에 IGW 경로 두면 미연결 서브넷이 의도치 않게 Public.

### 축별로 다시 보는 SG vs NACL

시험에서 이 둘은 "무엇이 다른가"가 아니라 "이 상황에서 어느 쪽이 답인가"로 나온다. 축을 나눠 두면 상황에서 축을 고르는 일이 쉬워진다.

| 축 | 보안 그룹 | 네트워크 ACL | 이 축이 답을 가르는 문제 유형 |
|----|----------|-------------|---------------------------|
| 적용 대상 | ENI(리소스) | 서브넷 경계 | "같은 서브넷 내 격리" → SG만 가능 |
| 상태 | Stateful(요청을 기억) | Stateless | "요청은 가는데 응답이 없다" → NACL |
| 규칙 종류 | Allow만 | Allow + **Deny** | "특정 IP 하나를 차단" → NACL |
| 평가 방식 | 전체 종합(OR) | 번호순 first-match | "Deny를 넣었는데 통과한다" → 번호 순서 |
| 소스 지정 | IP, **SG 참조**, 접두사 목록 | IP/CIDR만 | "IP가 계속 바뀌는 백엔드" → SG 참조 |
| 기본 동작 | 인바운드 차단 / 아웃바운드 허용 | 기본 NACL은 전부 허용 | "새 서브넷이 무방비" → 기본 NACL |
| 변경 즉시성 | 기존 연결은 추적으로 유지될 수 있음 | 다음 패킷부터 즉시 | "진행 중인 악성 세션 즉시 차단" → NACL |
| 규모 한계 | 규칙·연결 수 할당량 | 방향당 규칙 수 제한(수십 개) | "수백 개 IP 차단" → Network Firewall/WAF |

### 유출 경로와 그 차단 수단

이번 주에서 가장 실무적인 표가 이것이다. "데이터가 나갈 수 있는 문"과 각 문의 자물쇠를 짝지어 둔 것이다.

| 나가는 문 | 성립 조건 | 자물쇠 | 다룬 곳 |
|-----------|----------|--------|--------|
| IGW 직결 | 퍼블릭 IP + `0.0.0.0/0 → igw` | Private 서브넷 배치, IGW 경로 제거 | 1일차 |
| NAT Gateway | `0.0.0.0/0 → nat` | NAT 제거 → 엔드포인트로 대체 | 1·4일차 |
| Egress-only IGW | `::/0 → eigw` | IPv6 미사용 시 서브넷에 할당하지 않음 | 1일차 |
| Peering / TGW / VPN / DX | 상대편에 인터넷 경로 존재 | TGW 라우팅 도메인 분리, 상대편까지 감사 | 1·5일차 |
| VPC 엔드포인트 | 엔드포인트 경유 AWS API | **엔드포인트 정책**(`aws:ResourceOrgID`) | 4일차 |
| 우리 버킷으로의 외부 접근 | 인터넷·타 계정 직접 호출 | **버킷 정책**(`aws:SourceVpce`) | 4일차 |
| DNS 터널링 | 53/UDP 허용 | Resolver 쿼리 로그 + DNS Firewall | Week 7 |
| (탐지) 모든 경로 | — | Flow Logs egress 분석 | 3일차 |

표의 아래쪽 세 줄이 "인터넷을 다 지웠는데도 남는 것"이다. 인터넷 경로를 제거해도 AWS 서비스로 나가는 통로와 이름 해석 통로는 남아 있고, 그래서 zero-internet VPC의 마지막 자물쇠는 라우팅이 아니라 **정책**이 된다.

### 보기를 가르는 신호어

문제 지문에는 답을 지시하는 단어가 거의 항상 들어 있다. 자주 반복되는 대응 관계를 모아 두면 읽는 속도가 붙는다.

| 지문의 신호어 | 가리키는 답 |
|--------------|-----------|
| "응답이 돌아오지 않는다", "간헐적으로만 성공" | NACL 아웃바운드 임시 포트 |
| "특정 IP를 차단", "명시적으로 거부" | NACL Deny(낮은 번호) |
| "오토스케일링", "IP가 계속 바뀐다" | SG 참조 |
| "같은 서브넷 안에서" | SG(NACL은 미적용) |
| "가장 근본적인 차단", "most effective" | 라우팅 제거 / 서브넷 재배치 / PubliclyAccessible 해제 |
| "비용 효율적", "VPC 내부에서 S3" | Gateway Endpoint(무료) |
| "온프레미스에서 Direct Connect로" | Interface Endpoint + DNS 구성 |
| "우리 조직 계정만", "외부 계정으로 유출" | `aws:PrincipalOrgID` / `aws:ResourceOrgID` |
| "이 VPC를 거친 요청만" | 버킷 정책의 `aws:SourceVpce` |
| "패킷 내용을 검사" | Traffic Mirroring(Flow Logs 아님) |
| "실시간으로 차단" | Flow Logs 아님 — SG/NACL/Network Firewall |
| "어느 컴포넌트가 막았는지" | Reachability Analyzer |
| "의도치 않은 경로가 존재하는지 상시 감사" | Network Access Analyzer |
| "timeout"이 난다 | 연결 계층(라우팅·NACL·SG·DNS) |
| "AccessDenied"가 난다 | 정책 계층(엔드포인트·리소스·IAM) |

### 한 화면 감사 명령 모음

```bash
# ① 인터넷 경로를 가진 서브넷
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'RouteTables[?Routes[?starts_with(GatewayId || `x`, `igw-`)]].Associations[].SubnetId'

# ② 퍼블릭 IP를 가진 ENI 전수
aws ec2 describe-network-interfaces \
  --query 'NetworkInterfaces[?Association.PublicIp!=null].[NetworkInterfaceId,SubnetId,Association.PublicIp,Description]' \
  --output table

# ③ 0.0.0.0/0 인바운드를 가진 SG
aws ec2 describe-security-groups --filters "Name=ip-permission.cidr,Values=0.0.0.0/0" \
  --query 'SecurityGroups[].[GroupId,GroupName,VpcId]' --output table

# ④ 기본 NACL을 그대로 쓰는 서브넷 (사실상 무통제)
aws ec2 describe-network-acls --filters "Name=default,Values=true" \
  --query 'NetworkAcls[].Associations[].SubnetId'

# ⑤ flow log가 꺼져 있거나 비정상인 VPC
aws ec2 describe-flow-logs --query 'FlowLogs[?FlowLogStatus!=`ACTIVE`].[FlowLogId,ResourceId,FlowLogStatus]'

# ⑥ 엔드포인트 목록과 정책 적용 여부
aws ec2 describe-vpc-endpoints \
  --query 'VpcEndpoints[].[VpcEndpointId,ServiceName,VpcEndpointType,State,PrivateDnsEnabled]' \
  --output table
```

## 트러블슈팅 결정 트리

```
연결 안 됨?
 ├─ timeout (응답 자체 없음)
 │    → 라우팅 경로? → SG 인바운드? → NACL? → Reachability Analyzer
 ├─ 요청은 가는데 응답 없음
 │    → NACL 아웃바운드 임시 포트(1024-65535) 확인 (stateless)
 ├─ 특정 IP만 차단 안 됨
 │    → SG로 시도 중이면 불가, NACL Deny로 전환
 ├─ 엔드포인트 만들었는데 인터넷으로 샘
 │    → Private DNS + VPC DNS 속성 2개 확인
 └─ AccessDenied (네트워크는 됨)
      → Endpoint Policy / 버킷 정책 SourceVpce 조건 확인
```

> 🎯 **시나리오**: "온프레미스에서 DX로 S3에 접근하려는데 AccessDenied가 아니라 timeout이 난다." — timeout은 네트워크 도달 문제다. S3 **Gateway** Endpoint를 만들었다면 온프레미스에서 못 닿는다(VPC 내부 전용). **Interface** Endpoint로 바꾸고, 온프레미스 리졸버가 S3 도메인을 엔드포인트 사설 IP로 풀도록 Route 53 Resolver를 구성해야 한다. AccessDenied였다면 정책 문제지만, timeout이므로 연결 계층(엔드포인트 타입·DNS·라우팅)을 본다. **에러 유형으로 계층을 좁히는 것이 핵심**이다.

## Week 3 한 문단 요약

네트워크 보안은 도달 가능성을 통제하는 일이다. **라우팅**은 경로 없으면 못 가게 하는 보이지 않는 차단이고, **NACL**(stateless, Deny가능, 서브넷)과 **보안 그룹**(stateful, Allow만, ENI)이 두 겹의 방화벽을 이룬다. 흐른 트래픽은 **Flow Logs**가 메타데이터로 기록해 침해(REJECT 폭증=정찰, 의외의 대용량 egress=유출)를 사후에 읽게 한다. 외부 통신은 무분별한 NAT 대신 **VPC Endpoint**로 좁히고, **엔드포인트·버킷 정책의 SourceVpce·PrincipalOrgID 조건**으로 데이터 경계를 만들어 자격증명이 탈취돼도 데이터가 새지 않게 한다. 이 모든 계층이 함께 심층 방어를 이룬다.

## 정리하며

Week 3는 "막는 것(통제)"과 "보는 것(가시성)", 그리고 "경로 자체를 없애는 것(프라이빗 연결)"을 모두 다뤘다. 복합 문제를 만나면 항상 계층으로 분해하라 — 라우팅인가, SG인가, NACL인가, 정책인가. 에러가 timeout이면 연결 계층, AccessDenied면 정책 계층이다.

한 주를 관통한 문장 셋을 남긴다.

**첫째, 도달은 AND이고 차단은 OR다.** 인터넷 노출이 성립하려면 퍼블릭 주소·IGW 라우팅·NACL·SG·응답 경로·리스닝 프로세스가 모두 참이어야 하고, 방어자는 그중 하나만 끊으면 된다. 가장 값싸고 확실한 노드는 언제나 라우팅이다. 시험이 "가장 근본적인 조치"를 물으면 규칙을 좁히는 보기가 아니라 경로나 주소를 없애는 보기를 고른다.

**둘째, 비대칭 실패는 NACL만 만든다.** 요청은 통과했는데 응답이 막히는 형태는 요청을 기억하는 SG로는 구조적으로 만들어질 수 없다. 이 한 문장이 SG/NACL 문제의 절반을 즉시 정리하고, Flow Logs에서 왕복 한 쌍을 맞춰 보는 순간 눈으로 확인된다.

**셋째, 인바운드는 촘촘하고 아웃바운드는 비어 있다.** 대부분의 조직이 들어오는 트래픽에는 규칙을 걸지만 나가는 트래픽에는 걸지 않는다. 그런데 데이터 유출은 나가는 방향으로 일어난다. NAT를 지우고, 필요한 서비스만 엔드포인트로 열고, 엔드포인트 정책으로 "우리 조직 리소스로만" 제한하는 4일차의 설계가 이 빈칸을 채우는 유일한 방법이다. 그리고 그 설계의 진짜 가치는 **자격증명 탈취와 데이터 유출 사이의 등식을 끊는 것**에 있다.

이번 주에 만든 것은 결국 "경로를 명시적으로 허용한 것만 남기는" 구조다. 그 구조가 제대로 서 있는지 확인하는 도구도 함께 손에 넣었다 — 구성으로 판정하는 **Reachability Analyzer / Network Access Analyzer**, 실제 흐름으로 확인하는 **Flow Logs**, 그리고 정책 거부의 근거를 남기는 **CloudTrail**이다. 설계와 검증이 짝을 이룰 때에야 격리는 주장이 아니라 사실이 된다.

다음 Week 4에서는 인프라 보안의 두 번째 축 — 엣지 보호와 트래픽 검사(WAF, Shield, Network Firewall, CloudFront)를 본다. 오늘까지가 VPC "안"의 격리였다면, 다음은 VPC "경계"에서 들어오는 위협을 검사하고 걸러내는 능동적 방어다.

---

## 📝 연습 문제

**문제 1.** 프로덕션 RDS가 인터넷에서 접근 가능하다는 경고를 받았다. 가장 근본적인(표면적이 아닌) 차단 조치는?

A) 보안 그룹 인바운드의 0.0.0.0/0을 특정 IP로만 좁힌다  
B) RDS를 인터넷 경로가 없는 서브넷에 두고 PubliclyAccessible을 끈다  
C) NACL 아웃바운드 임시 포트를 차단한다  
D) RDS의 자동 백업을 비활성화한다  

**정답: B**  
해설: 인터넷 도달은 라우팅 경로와 퍼블릭 주소, 그리고 통제 허용이 모두 충족돼야 성립한다. 인터넷 경로가 없는 서브넷에 두고 퍼블릭 접근 설정을 끄면 경로와 주소 자체가 사라져 가장 근본적으로 차단된다. 보안 그룹만 좁히는 것은 다른 계층이 다시 열리면 무력화될 수 있는 표면적 처방이다.

---

**문제 2.** 침해된 인스턴스가 탈취한 자격증명으로 회사 S3 데이터를 외부 공격자 버킷으로 빼내려는 시나리오를 네트워크 설계로 막으려고 한다. 가장 효과적인 조합은?

A) NAT Gateway를 두되 보안 그룹 아웃바운드를 443만 허용한다  
B) NAT를 제거하고 필요한 AWS 서비스만 VPC Endpoint로 연결하며 버킷 정책에 SourceVpce 조건을 건다  
C) IAM 정책에서 S3 권한을 모두 제거한다  
D) CloudTrail 로깅을 강화한다  

**정답: B**  
해설: NAT를 제거하면 무분별한 아웃바운드 경로가 사라져 외부 버킷으로의 전송 자체가 막히고, 필요한 서비스만 엔드포인트로 연결한 뒤 버킷 정책에 엔드포인트 경유 조건을 걸면 회사 버킷은 그 경로로만 접근된다. 자격증명을 탈취해도 데이터가 빠져나갈 네트워크 경로가 없어진다. 로깅 강화는 탐지일 뿐 차단이 아니다.

---

**문제 3.** 연결 트러블슈팅 중 "요청은 나가는데 응답이 돌아오지 않는" 증상이 발생했다. 어느 계층을 가장 먼저 의심해야 하는가?

A) 보안 그룹 인바운드 규칙  
B) 라우팅 테이블의 로컬 경로  
C) NACL 아웃바운드의 임시 포트 허용 여부  
D) 엔드포인트 정책의 Resource 범위  

**정답: C**  
해설: 요청은 나가지만 응답만 안 오는 증상은 비저장 방식인 NACL이 응답 트래픽을 막는 전형적 패턴이다. NACL은 상태를 추적하지 않으므로 응답이 나가는 임시 포트 범위를 아웃바운드에 명시 허용해야 한다. 상태를 추적하는 보안 그룹은 응답을 자동 허용하므로 이 증상의 원인이 아니다.

---

**문제 4.** 온프레미스에서 Direct Connect로 S3에 접근하려는데 AccessDenied가 아니라 timeout이 발생한다. 가장 가능성 높은 원인은?

A) 버킷 정책의 SourceVpce 조건이 잘못 설정됨  
B) S3 Gateway Endpoint를 사용 중이라 온프레미스에서 도달할 수 없음  
C) IAM 정책에 s3:GetObject 권한이 없음  
D) KMS 키 정책이 복호화를 거부함  

**정답: B**  
해설: timeout은 정책 거부가 아니라 네트워크 도달 실패를 의미한다. Gateway Endpoint는 라우팅 기반이라 VPC 내부 전용이므로 온프레미스에서 직접 닿을 수 없다. 온프레미스 사설 접근에는 Interface Endpoint와 도메인을 사설 IP로 해석하는 DNS 구성이 필요하다. 정책 문제였다면 timeout이 아니라 AccessDenied가 발생한다.

---

**문제 5.** 다음 중 보안 그룹과 NACL의 차이를 올바르게 설명한 것을 모두 고른 조합은?

(가) 보안 그룹은 상태를 추적하고 NACL은 추적하지 않는다
(나) NACL은 명시적 Deny가 가능하지만 보안 그룹은 Allow만 가능하다
(다) 같은 서브넷 내부 통신에는 NACL이 적용되지 않는다
(라) 보안 그룹은 규칙 번호 순서로 첫 매치에서 평가를 종료한다

A) 가, 나, 다  
B) 가, 나, 라  
C) 나, 다, 라  
D) 가, 다, 라  

**정답: A**  
해설: 보안 그룹은 상태를 추적해 응답을 자동 허용하고 허용 규칙만 지원하며, NACL은 비저장 방식에 거부 규칙도 지원한다. 또 NACL은 서브넷 경계 트래픽만 검사하므로 같은 서브넷 내부 통신에는 적용되지 않는다. 규칙 번호 순서로 첫 매치에서 종료하는 것은 NACL의 평가 방식이며 보안 그룹은 모든 규칙을 종합 평가하므로 (라)는 틀렸다.

---

**문제 6.** Flow Logs 분석에서 "한 내부 호스트가 짧은 시간에 100개 이상의 서로 다른 외부 목적지와 통신"하는 패턴이 보였다. 가장 의심되는 활동과, 침해 호스트를 정확히 특정하기 위해 필요한 필드의 조합은?

A) 데이터 유출 의심 / srcaddr 필드  
B) C2 비콘 또는 횡적 이동 의심 / pkt-srcaddr 필드  
C) 정상 헬스 체크 / az-id 필드  
D) DDoS 공격 의심 / dstport 필드  

**정답: B**  
해설: 한 호스트가 다수의 서로 다른 목적지와 통신하는 패턴은 명령제어 비콘이나 내부 횡적 이동의 징후다. 그리고 NAT를 거치면 일반 출발지 주소 필드에 NAT 주소가 찍히므로, NAT 변환 이전의 실제 송신 호스트를 식별하려면 패킷 원본 출발지 주소 필드가 필요하다. 이 필드가 침해 호스트 특정의 열쇠다.

---

# Day 2 - 하이브리드 CI/CD: 온프레미스와 AWS를 하나의 배포 모델로 묶는 원리

클라우드로의 이전은 거의 한 번도 "전부 다, 한꺼번에"로 일어나지 않는다. 수십 년 묵은 COBOL 배치, 라이선스가 하드웨어에 묶인 레거시, 규제상 데이터센터를 떠날 수 없는 워크로드는 데이터센터(DC)에 남고, 신규 워크로드는 AWS로 간다. 그러면 즉시 한 가지 운영상의 통증이 생긴다. "두 환경에 두 개의 배포 파이프라인, 두 개의 자격 증명 체계, 두 개의 패치 도구, 두 개의 모니터링 스택을 따로 운영하면 팀이 두 배로 일하고 두 배로 실수한다. 어떻게 하나의 운영 모델로 양쪽을 묶을 것인가." 오늘은 5,000대 온프레미스 VM과 200대 EC2가 공존하고, 인바운드 인터넷이 완전히 차단된 보수적 보안 환경의 조직을 놓고, SSM Hybrid Activation·CodeDeploy On-Prem·IAM Roles Anywhere·PrivateLink가 어떻게 이 통증을 푸는지 — 그리고 그 밑에 깔린 네트워크·신원(identity)·암호 이론을 함께 판다.

DOP 시험에서 하이브리드는 "인터넷 차단 환경에서 DC 서버가 AWS API를 호출하려면", "정적 액세스 키 없이 DC 서버에 임시 자격 증명을 주려면", "EC2와 DC 서버를 단일 배포로 묶으려면", "Direct Connect만으로 회선이 암호화되는가" 같은 시나리오로 반복 등장한다. 각 선택지가 SSM·CodeDeploy·Roles Anywhere·PrivateLink·DX 중 무엇을 건드리는지 읽어내면 답이 보인다.

## Pull vs Push — 방화벽이 배포 아키텍처를 결정한다

하이브리드 배포의 모든 설계 결정은 한 가지 제약에서 출발한다. **온프레미스의 방화벽은 인바운드를 막는다.** DC 서버에 AWS가 명령을 "밀어 넣으려면(push)" 인바운드 포트를 열어야 하는데, 보안팀은 이를 거의 항상 거부한다. 그래서 하이브리드 운영은 거의 전부 **Pull 모델** — DC 서버의 에이전트가 AWS로 아웃바운드 연결을 걸어 명령을 "끌어오는" — 로 수렴한다.

이것이 SSM Agent와 CodeDeploy Agent가 동작하는 방식이다. 두 에이전트 모두 DC 서버에서 AWS 엔드포인트로 아웃바운드 HTTPS(443)를 열고, 그 연결을 통해 명령·아티팩트를 받는다. 인바운드 포트를 단 하나도 열지 않아도 된다 — 이것이 **bastion-less** 운영(SSM Session Manager로 베스천·22번 포트 제거)과 같은 사상이다.

> 💡 **관련 이론**: Pull 모델의 우위는 분산 시스템의 **연결 방향성(connection directionality)** 원리에서 나온다. 방화벽은 본질적으로 비대칭이다 — 아웃바운드는 허용하고 인바운드는 막는 것이 기본 정책이다. 그래서 NAT 뒤의 수많은 노드를 제어하려면, 중앙이 노드에 연결하는(push) 대신 노드가 중앙에 연결하게(pull) 설계하는 것이 정석이다. 이는 메시지 큐의 컨슈머가 브로커에서 끌어오는 패턴, IoT 기기가 MQTT 브로커로 아웃바운드 연결을 유지하는 패턴, GitOps 에이전트(Argo CD)가 클러스터 안에서 Git을 폴링하는 패턴과 같은 가족이다. 핵심 trade-off: Pull은 방화벽 친화적이고 확장성이 좋지만(중앙이 모든 노드 주소를 알 필요 없음), 명령 전파에 폴링 지연이 있다. Push는 즉시성이 좋지만 인바운드 경로와 노드 인벤토리를 요구한다. 하이브리드는 거의 항상 Pull을 택한다.

## 네트워크 토폴로지 — 인터넷 없이 AWS에 닿는 두 경로

인터넷이 차단된 환경에서 DC와 AWS를 잇는 데는 두 종류의 결정이 필요하다. **(1) 트래픽이 흐르는 회선**(연결성)과 **(2) AWS API에 닿는 방식**(엔드포인트)이다.

회선은 **Direct Connect(DX)**가 정석이다 — 통신사 회선으로 DC와 AWS를 사설 전용선으로 잇는다. 인터넷을 거치지 않아 지연·대역폭·일관성이 우수하다. 가용성을 위해 보통 DX를 이중화(10Gbps × 2)하고, DX 장애 시 **IPSec VPN을 백업**으로 둔다. 여러 VPC와 DC 경로를 한곳에 모으려면 **Transit Gateway(TGW)**를 허브로 둬 라우팅을 집중한다.

AWS API에 닿는 방식이 더 미묘하다. 인터넷이 막혔으니 `s3.amazonaws.com` 같은 퍼블릭 엔드포인트로는 갈 수 없다. **VPC Endpoint(PrivateLink)**가 답이다 — S3·ECR·SSM·Secrets Manager·CodeBuild 등의 API를 VPC 내부의 사설 IP로 노출하고, DC는 DX/TGW를 거쳐 그 사설 IP로 AWS API를 호출한다. 트래픽이 단 한 번도 인터넷으로 나가지 않는다.

> ⚠️ **함정**: **Direct Connect는 그 자체로 암호화되지 않는다.** 이것이 시험의 단골 함정이다. DX는 "사설 전용선"이라 안전하다고 착각하기 쉽지만, 물리적으로 분리됐을 뿐 회선 위 데이터는 평문이다. 규제상 회선 암호화가 필수면 **MACsec(MAC Security, IEEE 802.1AE)**을 DX 포트에 적용하거나(레이어 2 암호화, 10Gbps 이상 전용 연결에서 지원), **IPSec over DX**(DX 위에 VPN을 한 번 더 얹어 레이어 3 암호화)를 쓴다. "DX를 쓰는데 회선 암호화가 필요하다"의 답은 절대 "DX가 자동으로 한다"가 아니다 — MACsec 또는 IPSec over DX다. 참고로 VPN(IPSec)은 기본 암호화되지만 인터넷을 거치면 지연·대역폭이 DX보다 떨어진다.

> 🔍 **더 깊이**: DNS가 하이브리드의 숨은 난관이다. DC 서버가 VPC Endpoint의 사설 IP를 받으려면, `secretsmanager.ap-northeast-2.amazonaws.com`을 사설 IP로 해석해야 하는데 DC의 온프레 DNS는 이를 모른다. **Route 53 Resolver Inbound/Outbound Endpoint**가 양방향 해석을 잇는다 — Inbound Endpoint는 DC가 AWS 사설 호스팅 영역을 질의하게 하고, Outbound Endpoint는 AWS가 DC의 내부 도메인을 질의하게 한다. VPC Endpoint를 만들 때 "Private DNS enabled" 옵션이 핵심인데, 이게 켜져야 표준 AWS 엔드포인트 이름이 사설 IP로 해석된다. 시험에서 "PrivateLink Endpoint를 만들었는데 DC에서 여전히 퍼블릭 IP로 해석된다"의 원인은 대개 Resolver Endpoint 미설정 또는 Private DNS 미활성화다.

## SSM Hybrid Activation — DC 서버를 EC2처럼 다루기

5,000대 DC 서버를 EC2와 똑같이 패치하고 명령을 실행하려면, 그 서버들이 Systems Manager의 관리 대상이 돼야 한다. **SSM Hybrid Activation**이 이를 가능하게 한다.

흐름은 이렇다. (1) `create-activation`으로 활성화 코드(ActivationCode + ActivationId)를 발급받는다. (2) DC 서버에 SSM Agent를 깔고 그 코드로 등록(`-register`)한다. (3) 등록되면 서버는 `mi-xxxx` 형태의 관리형 인스턴스 ID를 받아 **EC2 인스턴스처럼** Run Command·Patch Manager·State Manager의 대상이 된다.

```bash
aws ssm create-activation \
  --description "OnPrem-DC-App" \
  --default-instance-name dc-app \
  --iam-role SSMServiceRole \
  --registration-limit 100

# 출력된 코드를 DC 서버에서
sudo amazon-ssm-agent -register \
  -code "ACTIVATION_CODE" -id "ACTIVATION_ID" -region ap-northeast-2
```

> ⚠️ **함정**: **활성화 토큰**과 **관리형 인스턴스 ID**를 혼동하기 쉽다. ActivationCode/ActivationId는 **만료일과 등록 횟수 한도가 있는 일회성 등록용 토큰**이다 — 서버를 SSM에 처음 등록할 때만 쓰고, 등록이 끝나면 의미가 없다. 반면 `mi-xxxx`는 **등록 후 서버에 영구적으로 붙는 관리형 인스턴스 ID**다. 시험에서 "활성화 코드가 만료됐는데 이미 등록된 서버는 어떻게 되나"의 답은 "이미 등록된 mi-xxxx는 영향 없이 계속 관리된다 — 활성화 토큰은 신규 등록에만 필요하다"이다. 또 registration-limit을 초과하면 더 이상 새 서버를 등록할 수 없으니, 대규모 등록은 한도를 넉넉히 잡거나 토큰을 여러 개 발급한다.

## CodeDeploy On-Prem — 단일 AppSpec으로 양쪽 배포

배포 통합의 핵심은 "EC2와 DC 서버에 **같은 배포 정의(AppSpec)**를 쓰는 것"이다. CodeDeploy는 On-Premises Instances를 지원해 이를 가능하게 한다.

(1) DC 서버를 CodeDeploy에 등록(`aws deploy register`)하고 — 자격 증명은 IAM User 또는 IAM Roles Anywhere로 발급. (2) 태그를 부여해 Deployment Group으로 묶는다. (3) AppSpec.yml은 EC2와 동일하게 작성한다. (4) 하나의 배포가 EC2 ASG와 DC 서버에 동시에 같은 릴리즈를 푼다.

```bash
aws deploy register \
  --instance-name dc-server-01 \
  --iam-user-arn arn:aws:iam::ACCT:user/CodeDeployUser \
  --tags Key=Env,Value=Prod

aws deploy add-tags-to-on-premises-instances \
  --instance-names dc-server-01 --tags Key=App,Value=Billing
```

> 🔍 **더 깊이**: CodeDeploy On-Prem의 가장 큰 구조적 한계는 **Auto Scaling 통합 불가**다. EC2 배포에서 CodeDeploy는 ASG와 연동해 새로 뜨는 인스턴스에 자동으로 최신 배포를 적용하지만, On-Prem 인스턴스는 정적 인벤토리다 — 서버가 자동으로 늘거나 줄지 않으니 등록·태깅을 사람(또는 별도 자동화)이 관리해야 한다. 또 Blue/Green 배포의 "새 인스턴스 집합을 띄워 트래픽을 시프트하는" 방식은 On-Prem에서 제한적이다(물리 서버를 즉석에서 복제할 수 없으니). 그래서 On-Prem은 주로 In-Place 배포(기존 서버에 새 버전 덮어쓰기)를 쓴다. 시험에서 "On-Prem 서버에 ASG 기반 자동 스케일 배포"라는 선택지가 나오면 오답이다 — On-Prem은 정적 인벤토리가 전제다.

## IAM Roles Anywhere — 정적 키를 X.509 인증서로 대체하기

DC 서버가 AWS API를 호출하려면 자격 증명이 필요하다. 전통적으로는 IAM User의 장기 액세스 키를 DC 서버에 심었는데, 이는 보안 안티패턴이다 — 키가 유출되면 무효화 전까지 계속 유효하고, 회전(rotation)을 사람이 챙겨야 하며, 5,000대에 흩뿌린 키를 추적하기 어렵다. **IAM Roles Anywhere**가 이를 근본적으로 바꾼다.

핵심 발상: DC가 이미 운영하는 **사내 PKI(공개키 기반구조)의 X.509 인증서**로 AWS에 신원을 증명하고, AWS는 그 대가로 **임시 자격 증명(STS 토큰)**을 발급한다. 정적 키가 DC 서버에 존재하지 않는다 — 서버는 자기 인증서로 인증하고 단명(short-lived)하는 토큰을 받아 쓴다.

```bash
# 사내 CA를 신뢰 앵커로 등록
aws rolesanywhere create-trust-anchor \
  --name CorpCA --source sourceType=CERTIFICATE_BUNDLE,...
# 이후 프로필+Role 연결 → DC 서버는 credential helper로 임시 자격 증명 획득
```

> 💡 **관련 이론**: IAM Roles Anywhere는 **신원 연합(identity federation)**과 **공개키 암호(PKI)** 이론의 결합이다. PKI의 핵심은 신뢰 사슬(chain of trust) — 루트 CA가 중간 CA를, 중간 CA가 서버 인증서를 서명하고, 검증자는 루트 CA만 신뢰하면 사슬 전체를 검증할 수 있다(RFC 5280, X.509 표준). Roles Anywhere의 "Trust Anchor"가 바로 이 루트/중간 CA를 AWS에 신뢰 앵커로 등록하는 것이다. 더 깊은 사상은 **단명 자격 증명(ephemeral credentials)**으로, "비밀은 짧게 살수록 안전하다"는 원칙이다. 정적 키는 시간이 흐를수록 유출 누적 확률이 커지지만, 매번 인증서로 받는 단명 토큰은 유출돼도 곧 만료된다. 이는 EC2의 인스턴스 프로파일, EKS의 IRSA/Pod Identity, OIDC 기반 GitHub Actions 연합과 같은 가족 — "정적 비밀을 단명 토큰으로 대체"라는 현대 클라우드 신원의 일관된 방향이다.

> 📚 **사례**: 2021년 **Codecov** 공급망 침해는 CI 도구의 Bash Uploader 스크립트가 변조돼, 수천 고객의 CI 환경 변수 — 그 안에 박혀 있던 **정적 클라우드 액세스 키·토큰** — 가 공격자 서버로 유출된 사건이다. 핵심 교훈은 "CI/배포 환경에 정적 장기 자격 증명을 두면, 그 환경이 침해될 때 키가 통째로 새고 무효화·추적이 어렵다"였다. 이 사건 이후 업계는 OIDC 연합(GitHub Actions ↔ AWS), IAM Roles Anywhere, IRSA/Pod Identity 같은 **단명·인증서 기반 자격 증명**으로 빠르게 이동했다. 시험에서 "DC 서버/CI에 정적 키를 두지 않으려면"의 답이 IAM Roles Anywhere인 이유가 바로 이 흐름이다.

## 시크릿·구성·모니터링 통합 — 한 도구로 양쪽을 덮기

자격 증명과 배포를 통합했으면, 나머지 운영 평면도 한 도구로 덮는다.

- **시크릿/구성**: Secrets Manager·Parameter Store를 PrivateLink로 DC에서 접근. 회전된 RDS 자격은 SSM Document로 DC 서버에 일괄 재배포. 인터넷이 막힌 빌드 환경에선 **CodeArtifact를 사내 npm/Maven 미러**로 써 외부 레지스트리 의존을 끊는다.
- **모니터링**: CloudWatch Agent를 EC2와 DC에 **동일 설정**으로 깔아(Hybrid Activation Role 사용) 메트릭·로그를 한곳에 집계. **X-Ray 데몬/ADOT Collector**를 DC에도 둬 DC→AWS를 가로지르는 요청의 End-to-End 트레이스를 잇는다.

> 🎯 **시나리오**: "인바운드 인터넷이 완전히 차단된 DC의 5,000대 서버가 (1) EC2와 동일하게 패치되고 (2) Secrets Manager에서 DB 자격을 조회하며 (3) 정적 키 없이 AWS API를 호출하고 (4) EC2와 단일 릴리즈로 배포돼야 한다." → (1) SSM Hybrid Activation으로 등록 후 Patch Manager. (2) Secrets Manager용 Interface VPC Endpoint(PrivateLink)를 DX/TGW 경유로 접근, Route 53 Resolver로 사설 DNS 해석. (3) IAM Roles Anywhere로 사내 CA 기반 단명 자격 증명. (4) CodeDeploy On-Prem에 DC 서버를 등록·태깅해 EC2 ASG와 같은 AppSpec으로 동시 배포(In-Place). 회선이 규제상 암호화 필수면 DX에 MACsec 또는 IPSec over DX 추가.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **방화벽의 인바운드 차단이 Pull 모델을 강제**하며 — SSM/CodeDeploy 에이전트가 아웃바운드로 끌어오는 — 이는 연결 방향성의 분산 시스템 원리다. 둘째, **인터넷 없이 AWS에 닿으려면 회선(DX+TGW)과 엔드포인트(PrivateLink) 두 결정**이 필요하고, Route 53 Resolver가 양방향 DNS를 잇는다. 셋째, **SSM Hybrid Activation으로 DC 서버를 EC2처럼** 패치·관리하되 활성화 토큰(일회성)과 mi-xxxx(영구)를 구분한다. 넷째, **CodeDeploy On-Prem이 단일 AppSpec으로 양쪽 배포**하되 ASG 통합 불가·정적 인벤토리라는 한계가 있다. 다섯째, **IAM Roles Anywhere가 정적 키를 X.509 인증서 기반 단명 자격 증명으로 대체**한다(Codecov 사건의 교훈) — 그리고 DX는 자동 암호화되지 않아 MACsec/IPSec over DX가 필요하다.

다음 글에서는 컨테이너로 무대를 옮겨 100개 넘는 마이크로서비스를 떠받치는 **대규모 ECS/EKS 운영**을 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 온프레미스 데이터센터의 방화벽이 인바운드를 차단하는 환경에서, SSM/CodeDeploy 에이전트가 동작하는 방식과 그 근본 원리는?

A) 중앙 AWS가 DC 서버로 명령을 밀어 넣는(push) 방식이며 인바운드 22/443 포트를 열어야 한다

B) DC 서버의 에이전트가 AWS로 아웃바운드 HTTPS(443)를 열어 명령·아티팩트를 끌어오는(pull) 방식이며, 방화벽의 비대칭성(아웃바운드 허용·인바운드 차단)을 활용해 인바운드 포트를 하나도 열지 않는다

C) DC 서버가 인터넷에 공개돼야 한다

D) VPN 없이는 불가능하다

**정답: B**

해설: 방화벽은 본질적으로 비대칭(아웃바운드 허용, 인바운드 차단)이므로, NAT 뒤 다수 노드를 제어하려면 노드가 중앙에 연결하는 Pull 모델이 정석이다. SSM/CodeDeploy 에이전트는 DC에서 AWS로 아웃바운드 443을 열어 명령을 끌어오므로 인바운드 포트를 하나도 열 필요가 없다(bastion-less와 같은 사상). Push(A)·인터넷 공개(C)·VPN 필수(D)는 하이브리드 운영의 전제와 어긋난다.

---

**문제 2.** Direct Connect 10Gbps 회선을 사용 중인데 규제상 회선 암호화가 필수다. 최소 변경으로 만족시키려면?

A) Direct Connect는 사설 전용선이므로 자동으로 암호화된다

B) DX는 그 자체로 암호화되지 않으므로 MACsec(레이어 2) 또는 IPSec over DX(레이어 3)를 추가해야 한다

C) S3 SSE-KMS만 켜면 회선이 암호화된다

D) TLS만 강제하면 된다

**정답: B**

해설: DX는 물리적으로 분리된 전용선일 뿐 회선 위 데이터는 평문이다 — 자동 암호화되지 않는다. 회선 암호화가 필요하면 MACsec(IEEE 802.1AE, 전용 연결의 레이어 2 암호화)을 DX 포트에 적용하거나 IPSec over DX(DX 위에 VPN을 얹은 레이어 3 암호화)를 쓴다. SSE-KMS(C)는 S3 저장 데이터 암호화이지 회선과 무관하고, TLS(D)는 애플리케이션 계층이라 "회선 암호화 필수"라는 규제 요구를 직접 충족한다고 보기 어렵다. 자동 암호화(A)는 가장 흔한 오답이다.

---

**문제 3.** SSM Hybrid Activation에서 ActivationCode/ActivationId(활성화 토큰)와 mi-xxxx(관리형 인스턴스 ID)의 관계로 가장 정확한 것은?

A) 둘은 같은 것이다

B) 활성화 토큰은 만료일·등록 한도가 있는 일회성 등록용 토큰이고, mi-xxxx는 등록 후 서버에 영구적으로 붙는 관리형 인스턴스 ID다 — 토큰이 만료돼도 이미 등록된 mi-xxxx는 영향 없이 계속 관리된다

C) mi-xxxx는 매 명령마다 새로 발급된다

D) 활성화 토큰은 영구적이고 mi-xxxx는 일회용이다

**정답: B**

해설: ActivationCode/ActivationId는 서버를 SSM에 처음 등록할 때만 쓰는 만료·한도 있는 일회성 토큰이고, 등록이 끝나면 의미가 없다. mi-xxxx는 등록 후 서버에 영구적으로 붙어 Run Command·Patch Manager·State Manager의 대상이 된다. 따라서 활성화 토큰이 만료돼도 이미 등록된 서버는 계속 관리되며, 토큰은 신규 등록에만 필요하다. 동일(A)·매 명령 발급(C)·관계 반대(D)는 틀리다.

---

**문제 4.** AWS EC2 ASG와 DC 서버를 하나의 배포로 같은 릴리즈를 동시에 푸는 표준 방법과 그 한계는?

A) Ansible만으로 가능하며 한계가 없다

B) CodeDeploy에 On-Premises Instances를 등록·태깅해 동일 AppSpec으로 EC2 ASG와 함께 배포하되, On-Prem은 Auto Scaling 통합 불가·정적 인벤토리라는 한계가 있어 주로 In-Place 배포를 쓴다

C) Lambda로 양쪽에 배포한다

D) SSM State Manager만으로 가능하다

**정답: B**

해설: CodeDeploy는 On-Premises Instances를 지원해 DC 서버를 등록·태깅하면 EC2와 동일한 AppSpec으로 하나의 배포에 묶을 수 있다. 다만 On-Prem은 ASG와 연동되지 않아 정적 인벤토리이며(서버가 자동으로 늘지 않음), Blue/Green의 새 인스턴스 집합 생성도 제한적이라 주로 In-Place 배포를 쓴다. "On-Prem에 ASG 기반 자동 스케일 배포"는 오답이다. Ansible 무한계(A)·Lambda(C)·State Manager(D)는 단일 AppSpec 통합 배포의 표준이 아니다.

---

**문제 5.** 5,000대 DC 서버에 정적 액세스 키를 심지 않고, 사내 PKI를 활용해 AWS API 호출용 임시 자격 증명을 부여하려면?

A) IAM User 장기 액세스 키를 각 서버에 배포

B) IAM Roles Anywhere — 사내 CA를 Trust Anchor로 등록하고 서버의 X.509 인증서로 인증해 STS 단명 자격 증명을 받는다

C) Cognito Identity Pool

D) STS GetSessionToken을 매번 수동 호출

**정답: B**

해설: IAM Roles Anywhere는 사내 PKI의 X.509 인증서로 AWS에 신원을 증명하고 임시 자격 증명을 받는다 — 정적 키가 서버에 존재하지 않는다. PKI의 신뢰 사슬(RFC 5280)을 Trust Anchor로 등록하고, "비밀은 짧게 살수록 안전하다"는 단명 자격 증명 원칙을 구현한다(IRSA·OIDC 연합과 같은 가족). 장기 키(A)는 Codecov류 유출 위험의 안티패턴, Cognito(C)는 앱 사용자 신원용, 수동 GetSessionToken(D)은 인증서 기반 자동화가 아니다.

---

**문제 6.** 인터넷이 차단된 DC 서버가 AWS Secrets Manager를 조회해야 한다. 최소 변경으로 사설 경로를 만들려면? 그리고 흔히 빠뜨리는 추가 설정은?

A) NAT Gateway를 추가해 인터넷으로 나간다

B) Secrets Manager용 Interface VPC Endpoint(PrivateLink)를 만들어 DX/TGW 경유로 사설 IP 접근하되, Route 53 Resolver Endpoint 설정과 Endpoint의 Private DNS 활성화로 DC에서 표준 엔드포인트 이름이 사설 IP로 해석되게 한다

C) Public Endpoint + IAM 정책

D) Lambda Proxy를 만든다

**정답: B**

해설: 인터넷 차단 환경에선 Interface VPC Endpoint(PrivateLink)로 Secrets Manager API를 VPC 내부 사설 IP로 노출하고 DX/TGW로 접근한다 — 트래픽이 인터넷으로 나가지 않는다. 흔히 빠뜨리는 것이 DNS다: Route 53 Resolver Endpoint와 Endpoint의 Private DNS 활성화가 없으면 DC가 여전히 퍼블릭 IP로 해석한다. NAT(A)·Public Endpoint(C)는 인터넷 경로를 요구하고, Lambda Proxy(D)는 불필요한 우회다.

---

**문제 7.** Codecov(2021) 공급망 침해가 하이브리드/CI 자격 증명 설계에 남긴 핵심 교훈은?

A) 컨테이너 이미지를 자주 스캔해야 한다

B) CI/배포 환경에 정적 장기 자격 증명을 두면 그 환경 침해 시 키가 통째로 유출되고 무효화·추적이 어려우므로, OIDC 연합·IAM Roles Anywhere·IRSA 같은 단명·인증서 기반 자격 증명으로 이동해야 한다

C) 모든 트래픽을 암호화해야 한다

D) 멀티 리전 백업이 필수다

**정답: B**

해설: Codecov 침해는 CI 업로더 스크립트 변조로 고객 CI 환경 변수에 박힌 정적 키·토큰이 통째로 유출된 사건이다. 교훈은 "정적 장기 자격 증명을 CI/배포 환경에 두지 말라"이며, 이후 업계는 OIDC 연합·IAM Roles Anywhere·IRSA/Pod Identity 같은 단명 자격 증명으로 이동했다. 이미지 스캔(A)·트래픽 암호화(C)·멀티 리전(D)은 다른 주제다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 방화벽의 인바운드 차단이 Pull 모델(아웃바운드로 끌어오는 SSM/CodeDeploy 에이전트)을 강제하며 이는 연결 방향성의 분산 시스템 원리다. 둘째, 인터넷 없이 AWS에 닿으려면 회선(DX+TGW, DX는 미암호화→MACsec/IPSec)과 엔드포인트(PrivateLink) 두 결정이 필요하고 Route 53 Resolver가 양방향 DNS를 잇는다. 셋째, SSM Hybrid Activation으로 DC 서버를 EC2처럼 관리하되 활성화 토큰(일회성·만료)과 mi-xxxx(영구)를 구분한다. 넷째, CodeDeploy On-Prem이 단일 AppSpec으로 양쪽 배포하되 ASG 통합 불가·정적 인벤토리·주로 In-Place라는 한계가 있다. 다섯째, IAM Roles Anywhere가 정적 키를 X.509 인증서 기반 단명 자격 증명으로 대체한다(Codecov 사건의 교훈, PKI 신뢰 사슬 RFC 5280).

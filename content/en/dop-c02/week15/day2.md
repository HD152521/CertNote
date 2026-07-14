# Day 2 - Hybrid CI/CD: Bridging On-Premises and AWS into One Deployment Model

Cloud migration rarely happens "all at once, all together." Decades-old COBOL batches, legacy with licenses tied to hardware, workloads that regulation forbids to leave the datacenter — they stay on-prem. New services go to AWS. Immediately: operational pain. "Two environments = two deployment pipelines, two credential systems, two patch tools, two monitoring stacks. If the team runs both, they double their work and double their mistakes. How do we unify operations?" Today: a realistic org with 5,000 on-prem VMs and 200 EC2s, strict security with inbound internet completely blocked. SSM Hybrid Activation·CodeDeploy On-Prem·IAM Roles Anywhere·PrivateLink solve this. Underneath: network, identity, crypto theory.

In DOP exams, hybrid appears as: "how does a DC server call AWS APIs when internet is blocked?", "how do you give DC servers temp credentials without static keys?", "how do you deploy to EC2 and DC servers as one?", "does Direct Connect encrypt the line?" Each touches SSM·CodeDeploy·Roles Anywhere·PrivateLink·DX.

## Pull vs Push — Firewall Determines Deployment Architecture

All hybrid design starts from one constraint: **On-prem firewalls block inbound.** To have AWS "push" commands into DC servers requires opening inbound ports — security teams usually refuse. Result: hybrid operations almost always converge on **Pull model** — DC server agents reach out to AWS (outbound connection) to "pull" commands.

This is how SSM Agent and CodeDeploy Agent work. Both open outbound HTTPS (443) from DC to AWS, receiving commands and artifacts over that connection. No inbound ports needed — this same philosophy as **bastion-less** ops (SSM Session Manager kills bastion + port 22).

> 💡 **Related theory**: Pull model's advantage flows from distributed systems' **connection directionality** principle. Firewalls are asymmetric by nature — outbound allowed, inbound blocked is the default policy. To manage many nodes behind NAT, the pattern is: nodes connect to center (pull) not center to nodes (push). Message queue consumers pull from broker; IoT devices maintain outbound MQTT; GitOps agents poll Git. Core trade-off: Pull is firewall-friendly, scales well (center doesn't need every node address), but command propagation has polling latency. Push is immediate but needs inbound paths and node inventory. Hybrid almost always chooses Pull.

## Network Topology — Two Decisions to Reach AWS Without Internet

Reaching AWS from internet-blocked DC requires two separate calls. **(1) The line carrying traffic** (connectivity) and **(2) How to reach AWS APIs** (endpoints).

**Direct Connect (DX)** is canonical for the line — telecom line bonds DC and AWS privately. No internet means superior latency, bandwidth, consistency. High availability usually means DX pairs (10Gbps × 2), with **IPSec VPN as backup** if DX fails. For multiple VPCs and DC paths, **Transit Gateway (TGW)** acts as hub, concentrating routing.

Reaching AWS APIs is subtler. Internet's blocked, so `s3.amazonaws.com` public endpoints are unreachable. **VPC Endpoint (PrivateLink)** is the answer — S3·ECR·SSM·Secrets Manager·CodeBuild APIs exposed inside VPC on private IPs, DC reaches those private IPs via DX/TGW. Traffic never leaves the internet.

> ⚠️ **Gotcha**: **Direct Connect does not encrypt by itself.** Classic trap. DX is a "private dedicated line" so it feels safe, but data on the line is cleartext. If regulation mandates line encryption, use **MACsec (MAC Security, IEEE 802.1AE)** on the DX port (layer 2, supported on 10Gbps+ dedicated connections) or **IPSec over DX** (layer 3, VPN over DX). "DX = auto-encrypted" is wrong. VPN (IPSec) encrypts by default but hits internet, so latency/bandwidth vs DX.

> 🔍 **Deeper**: DNS is a hidden gotcha in hybrid. DC servers need private IPs for VPC Endpoint names. `secretsmanager.ap-northeast-2.amazonaws.com` should resolve to private IP, but DC's on-prem DNS doesn't know that. **Route 53 Resolver Inbound/Outbound Endpoints** bridge both directions — Inbound lets DC query AWS private zones, Outbound lets AWS query DC internal domains. When making VPC Endpoint, **"Private DNS enabled"** is key — this makes standard AWS endpoint names resolve to private IPs. Exam gotcha: "PrivateLink Endpoint made but DC still resolves to public IP" — usually Resolver Endpoint unconfigured or Private DNS disabled.

## SSM Hybrid Activation — Treat DC Servers Like EC2

5,000 DC servers need to patch like EC2s, exist in Systems Manager as managed inventory. **SSM Hybrid Activation** enables this.

Flow: (1) `create-activation` issues activation code (ActivationCode + ActivationId). (2) SSM Agent on DC server, register with that code (`-register`). (3) Server gets `mi-xxxx` managed instance ID, becomes **EC2-like** target for Run Command·Patch Manager·State Manager.

```bash
aws ssm create-activation \
  --description "OnPrem-DC-App" \
  --default-instance-name dc-app \
  --iam-role SSMServiceRole \
  --registration-limit 100

# Output code to DC server
sudo amazon-ssm-agent -register \
  -code "ACTIVATION_CODE" -id "ACTIVATION_ID" -region ap-northeast-2
```

> ⚠️ **Gotcha**: **Activation token** vs **managed instance ID** — easy to confuse. ActivationCode/ActivationId are **one-time registration tokens with expiry and count limit.** Used only when registering a server first; after registration they're meaningless. `mi-xxxx` is **permanently attached after registration.** Exam: "activation code expired, what happens to already-registered server?" Answer: "mi-xxxx servers unaffected — continue managed. Activation token only needed for new registration." Exceed registration-limit and can't register more servers; large deployments scope the limit generous or issue multiple tokens.

## CodeDeploy On-Prem — Single AppSpec for Both Sides

Deployment unification's core: "EC2 and DC servers use **identical AppSpec**." CodeDeploy supports On-Premises Instances.

(1) Register DC server with CodeDeploy (`aws deploy register`), credentials via IAM User or Roles Anywhere. (2) Tag it; bundle into Deployment Group. (3) AppSpec identical to EC2. (4) Single deployment hits EC2 ASG and DC servers simultaneously.

```bash
aws deploy register \
  --instance-name dc-server-01 \
  --iam-user-arn arn:aws:iam::ACCT:user/CodeDeployUser \
  --tags Key=Env,Value=Prod

aws deploy add-tags-to-on-premises-instances \
  --instance-names dc-server-01 --tags Key=App,Value=Billing
```

> 🔍 **Deeper**: CodeDeploy On-Prem's biggest architectural limit is **no Auto Scaling integration.** EC2 deployment, CodeDeploy auto-applies latest to new instances spinning up. On-Prem is static inventory — servers don't auto-grow/shrink, so registration and tagging are manual or separate automation. Blue/Green's "spin new instance set, shift traffic" is also constrained on-prem (can't clone physical servers on-the-fly). On-Prem uses primarily In-Place deployment (overwrite code in-place). Exam: "On-Prem + ASG auto-scale deployment" is a trap answer.

## IAM Roles Anywhere — Replace Static Keys with X.509 Certificates

DC servers need AWS API credentials. Classically: long-lived IAM User access keys on the DC server — security anti-pattern. Key leaked, valid until revoked; rotation is manual; tracking 5,000 spread keys is hard. **IAM Roles Anywhere** fundamentally changes this.

Core idea: DC's **on-prem PKI (Public Key Infrastructure) X.509 certificates** prove identity to AWS; in return, AWS issues **temporary credentials (STS tokens).** No static keys exist on the server. Server authenticates with cert, gets short-lived token.

```bash
# Register on-prem CA as trust anchor
aws rolesanywhere create-trust-anchor \
  --name CorpCA --source sourceType=CERTIFICATE_BUNDLE,...
# Downstream: credential helper gets temp creds
```

> 💡 **Related theory**: Roles Anywhere combines **identity federation** + **PKI**. PKI's essence: trust chain — root CA signs intermediate, intermediate signs server cert, verifier trusts root alone, verifies whole chain (RFC 5280, X.509 standard). Roles Anywhere's "Trust Anchor" registers that root/intermediate as AWS's trust anchor. Deeper: **ephemeral credentials** — "secrets live short, die safer." Static keys accumulate leak risk over time; short-lived tokens leak and expire. Instance Profile (EC2), IRSA/Pod Identity (EKS), OIDC federation (GitHub Actions) all follow this — "replace static secrets with short-lived tokens." Codecov (2021) showed CI environment compromise's scope when static keys there; industry shifted to OIDC, Roles Anywhere, IRSA.

> 📚 **Case study**: **Codecov** (2021) supply chain: Bash Uploader script was compromised, exfiltrated **static cloud access keys from CI environment variables** to attacker server. Lesson: "Static long credentials in CI = full infrastructure key bleed on CI compromise." Industry moved to OIDC, Roles Anywhere, IRSA — **ephemeral, cert-based credentials.**

## Secret, Config, Monitoring Unification — One Tool Both Sides

Integrated credentials and deployment; integrate the rest.

- **Secrets/Config**: Secrets Manager·Parameter Store via PrivateLink DC access. Rotated RDS creds cascade to DC servers via SSM Document. Blocked-internet build? CodeArtifact as on-prem npm/Maven mirror cuts external registry dependency.
- **Monitoring**: CloudWatch Agent on EC2 and DC identical config (Hybrid Activation Role) collects metrics/logs centrally. X-Ray daemon/ADOT on DC traces end-to-end requests spanning DC→AWS.

> 🎯 **Scenario**: "5,000 DC servers inbound-internet-blocked: (1) patch like EC2, (2) query Secrets Manager via private route, (3) call AWS API stateless keys, (4) single release with EC2." → (1) SSM Hybrid Activation + Patch Manager. (2) Interface VPC Endpoint (PrivateLink) + Route 53 Resolver private DNS. (3) Roles Anywhere + on-prem CA. (4) CodeDeploy On-Prem + EC2 ASG same AppSpec (In-Place). Encryption: if required, MACsec or IPSec over DX.

## Summary

Today covered five. First, **firewall inbound block forces Pull model** — SSM/CodeDeploy agents outbound-pull commands. Second, **internet-blocked AWS reach needs line (DX+TGW) and endpoints (PrivateLink)**, Route 53 Resolver bridges DNS. Third, **SSM Hybrid Activation makes DC servers EC2-like**, distinguish activation token (one-time, expires) from mi-xxxx (permanent). Fourth, **CodeDeploy On-Prem unifies with EC2**, but ASG integration off-limits, static inventory. Fifth, **Roles Anywhere replaces static keys with X.509 cert-based ephemeral creds** (Codecov lesson), and DX needs MACsec/IPSec if line encryption required.

Next: containers scale to 100+ microservices, **large-scale ECS/EKS ops** at depth.

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

해설: 인터넷 차단 환경에선 Interface VPC Endpoint(PrivateLink)로 Secrets Manager API를 VPC 내부 사설 IP로 노출하고 DX/TGW로 접근한다 — 트래픽이 인터넷으로 나가지 않는다(Route 53 Resolver로 DNS 해석). 흔히 빠뜨리는 것이 DNS다: Route 53 Resolver Endpoint와 Endpoint의 Private DNS 활성화가 없으면 DC가 여전히 퍼블릭 IP로 해석한다. NAT(A)·Public Endpoint(C)는 인터넷 경로를 요구하고, Lambda Proxy(D)는 불필요한 우회다.

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

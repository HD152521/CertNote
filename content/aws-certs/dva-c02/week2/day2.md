# Day 7 - 개발자가 만져야 하는 네트워크 경계: Security Group, Key Pair, User Data

EC2 인스턴스를 만들고 나서 가장 자주 받는 질문은 두 가지다. "왜 SSH가 안 붙어요?"와 "왜 코드는 떴는데 80번 포트가 안 열려요?". 둘 다 답은 같다. 네트워크 통제와 부트스트랩 메커니즘을 잘못 이해해서다. SAA는 "어떤 SG를 어디에 둘 것인가"라는 아키텍처 시점에서 묻는다면, DVA는 "그 SG를 SDK·CLI로 어떻게 만들고, User Data 안에서 Secrets Manager를 어떻게 부르고, IMDSv2를 어떻게 강제하는가"까지 묻는다. 같은 보안 그룹이지만 코드 한 줄, ARN 하나의 차이가 시험 정답을 가른다.

오늘은 Security Group의 stateful 메커니즘이 정확히 어떻게 동작하는지, SSH 키 페어 인증의 TLS 핸드셰이크 단계까지 파헤치고, User Data가 cloud-init 위에서 어떤 순서로 돌아가는지를 본다. 개발자가 시험에서 만나는 "왜 권한이 없다는데 SG는 다 열려 있어요?" 같은 디버깅 시나리오는 결국 이 메커니즘을 끝까지 따라가 본 사람만 풀 수 있다.

## Security Group은 단순한 방화벽이 아니다 — connection tracking의 내부

대부분의 입문서가 "SG는 stateful이라 응답이 자동 허용된다"고 적고 끝낸다. 실제로 무슨 일이 일어나는지 보자. 클라이언트 `203.0.113.10:53241`이 EC2 `10.0.1.5:443`으로 TCP SYN을 보낸다. SG는 `Allow TCP 443 from 0.0.0.0/0` 규칙에 매치되면 패킷을 통과시킨다. 이때 SG는 단순히 패킷을 보내는 데 그치지 않고 **conntrack 테이블에 (src_ip=203.0.113.10, src_port=53241, dst_ip=10.0.1.5, dst_port=443, proto=TCP) 5-tuple을 등록**한다. 서버가 SYN-ACK로 응답할 때, 그 패킷의 5-tuple은 (src=10.0.1.5:443, dst=203.0.113.10:53241)이라 outbound 규칙을 본다. 그런데 conntrack에 매칭되는 inbound 흐름이 있으므로 SG는 outbound rule을 평가하지 않고 통과시킨다. 이게 "stateful"의 진짜 의미다.

이 메커니즘은 Linux 커널의 `nf_conntrack`(netfilter connection tracking)과 동일한 발상이다. AWS는 Nitro Card에 이 logic을 하드웨어로 구현해 호스트 OS의 부담 없이 ENI 단위로 stateful filtering을 한다. 그래서 SG 변경이 **즉시(수 초 이내) 적용**되고, 기존 진행 중인 TCP 연결도 새 규칙에 의해 끊긴다. NACL은 stateless라 conntrack을 안 쓰고, 패킷 하나하나 규칙을 평가한다. 그래서 NACL에는 ephemeral port(1024-65535) 범위를 outbound로 명시적으로 열어야 응답이 돌아온다.

| 차원 | Security Group | NACL |
|------|---------------|------|
| 적용 위치 | ENI (인스턴스 수준) | Subnet (서브넷 수준) |
| State | Stateful (conntrack) | Stateless (per-packet) |
| 규칙 종류 | Allow only | Allow + Deny |
| 평가 순서 | 모든 규칙 OR (allow 하나만 매칭되면 통과) | 번호 순서, 첫 매치 적용 |
| 응답 트래픽 | 자동 허용 | ephemeral port 명시 필요 |
| 기본 inbound | 모두 차단 | 기본 NACL은 모두 허용 |
| 기본 outbound | 모두 허용 | 기본 NACL은 모두 허용 |
| 자기 자신 참조 | 가능 (`sg-xxx ← sg-xxx`) | 불가 (CIDR만) |
| 한도 | 인스턴스당 5 SG, SG당 60 in + 60 out | 서브넷당 1 NACL, NACL당 20 in + 20 out (확장 가능) |

> 🔍 **더 깊이**: SG의 conntrack 테이블 크기는 인스턴스 타입에 따라 다르다. 기본 c5.large는 수십만 connection, c5n 같은 enhanced networking 인스턴스는 수백만 connection을 추적할 수 있다. 이 한도를 넘으면 새 연결이 drop된다. CloudWatch의 `conntrack_allowance_exceeded` 지표로 확인 가능. 만약 백엔드 API가 RPS는 충분한데 sporadic하게 connection refused가 난다면 conntrack 한도부터 의심해야 한다. m5.large 기준 약 350K, c5n.large는 약 1M 정도가 알려진 수치.

> 💡 **관련 이론**: SG의 stateful 모델은 1990년대 Cisco PIX 방화벽이 도입한 ASA(Adaptive Security Algorithm)와 BSD `pf`(packet filter, OpenBSD 2001)의 state-tracking 방식과 같은 계보다. RFC 5382(NAT Behavioral Requirements for TCP)가 stateful TCP NAT의 동작을 표준화했고, AWS의 ENI-level conntrack은 이 위에서 동작한다. UDP도 추적되지만 connection 개념이 없어 timeout 기반(기본 30초 idle)으로 만료된다. 그래서 DNS·NTP 같은 UDP 트래픽에서 응답이 늦으면 conntrack entry가 사라져 응답이 drop되는 corner case가 있다.

```python
import boto3

ec2 = boto3.client('ec2', region_name='ap-northeast-2')

# SG 생성 + 자기 자신 참조 (클러스터 내부 통신 패턴)
sg = ec2.create_security_group(
    GroupName='app-tier-sg',
    Description='App tier internal mesh',
    VpcId='vpc-0abc1234'
)
sg_id = sg['GroupId']

# 자기 자신을 소스로 — 같은 SG 멤버 간 모든 TCP 허용
ec2.authorize_security_group_ingress(
    GroupId=sg_id,
    IpPermissions=[{
        'IpProtocol': 'tcp',
        'FromPort': 0,
        'ToPort': 65535,
        'UserIdGroupPairs': [{'GroupId': sg_id}]
    }]
)
```

자기 자신을 소스로 참조하는 이 패턴은 Kafka cluster, Cassandra ring, Elasticsearch node 간 통신처럼 "같은 클러스터 멤버끼리는 다 열되, 외부는 막는다"를 표현할 때 표준이다. 새 노드가 추가되면 SG에 attach만 하면 자동으로 통신 가능해진다.

> ⚠️ **함정**: 시험에 "SG에서 deny 규칙으로 특정 IP 차단" 같은 보기가 나오면 무조건 오답이다. SG는 deny가 없다. 차단이 필요하면 NACL에 명시적 deny 규칙을 추가하거나, AWS Network Firewall이나 WAF로 처리한다. 또 "SG는 outbound도 stateful이므로 outbound 규칙만 닫으면 inbound 응답도 차단된다"도 자주 헷갈리는데, outbound와 inbound는 별개의 평가 차원이다. inbound로 들어온 요청의 응답은 outbound 규칙 무관 통과, outbound로 나간 요청의 응답은 inbound 규칙 무관 통과다.

## Security Group과 함께 보는 함정: PrivateLink, VPC Endpoint에서의 SG

VPC Endpoint(특히 Interface Endpoint, PrivateLink 기반)에도 SG를 붙인다. 여기서 가장 흔한 함정이 "Endpoint SG가 호출자(클라이언트)의 IP 또는 SG를 inbound로 허용하지 않아서 호출 실패"다. 예를 들어 Lambda를 VPC에 연결하고 Secrets Manager Interface Endpoint를 통해 GetSecretValue를 호출하려는데 `ConnectTimeoutError`가 난다. 콘솔에선 Lambda SG의 outbound는 0.0.0.0/0 다 열려 있다. 그런데 Endpoint SG의 inbound가 닫혀 있으면 Endpoint ENI까지 패킷이 도달했지만 거기서 drop된다.

```python
# Endpoint SG에 Lambda SG로부터의 HTTPS inbound 허용
ec2.authorize_security_group_ingress(
    GroupId='sg-endpoint',
    IpPermissions=[{
        'IpProtocol': 'tcp',
        'FromPort': 443,
        'ToPort': 443,
        'UserIdGroupPairs': [{'GroupId': 'sg-lambda'}]
    }]
)
```

## Key Pair: SSH 인증의 진짜 단계

키 페어 인증을 "공개키로 챌린지, 개인키로 서명"이라고 한 줄로 끝내는 자료가 많은데, 실제 단계는 더 세밀하다. SSH 프로토콜(RFC 4252, public key authentication)의 흐름을 보자.

```
1. Client → Server: SSH-2.0 banner 교환
2. Diffie-Hellman key exchange로 session key 생성
3. Server가 host key로 자기 신원 증명 (client는 known_hosts 비교)
4. Client → Server: SSH_MSG_USERAUTH_REQUEST (method=publickey, user=ec2-user)
5. Server: authorized_keys 파일에서 public key 매칭
6. Server → Client: SSH_MSG_USERAUTH_PK_OK (이 키 인정함)
7. Client: session_id를 자기 private key로 서명, 서명 전송
8. Server: 그 서명을 public key로 검증, 통과면 인증 완료
```

여기서 핵심은 **session_id가 매번 다르다**는 점이다. 같은 키로 100번 접속하면 100번 다른 데이터에 서명한다. 그래서 키 한 번 만든 걸로 replay attack이 불가능하다. EC2에서 AWS는 인스턴스 시작 시 cloud-init이 IMDS의 `public-keys/0/openssh-key`를 읽어 `~/.ssh/authorized_keys`에 자동 추가한다. 즉 키 페어를 "EC2에 등록"하면 실제로 일어나는 일은 "AMI에 cloud-init이 들어 있고, 그 cloud-init이 IMDS에서 public key를 가져와 OS 안에 심는다"이다.

> 🔍 **더 깊이**: AWS Key Pair는 기본적으로 RSA 2048-bit이지만 2021년부터 **ED25519**도 지원한다. ED25519는 elliptic curve 기반(Curve25519, DJB Bernstein 2011)으로 RSA 2048보다 키 길이가 짧고(256-bit), 서명 생성/검증이 빠르고, side-channel 공격에 더 강하다. 새 키를 만든다면 `KeyType=ed25519`를 명시하자. 또 EC2는 키를 분실해도 복구할 방법이 있다: ① 인스턴스 stop → ② EBS 루트 볼륨 detach → ③ 다른 인스턴스에 attach → ④ `/home/ec2-user/.ssh/authorized_keys`를 새 public key로 교체 → ⑤ 원래 인스턴스에 재attach → ⑥ start. 이 시퀀스는 시험에 가끔 나온다.

> 💡 **관련 이론**: SSH의 public key auth는 PKI(Public Key Infrastructure)의 발상을 두 당사자 사이로 압축한 것이다. CA(Certificate Authority)가 없고 trust on first use(TOFU, known_hosts)로 host key를 신뢰한다. 그래서 첫 접속 때 host key를 잘못 신뢰하면 그 뒤로 MITM 공격에 취약해진다. AWS는 콘솔이나 CLI(`aws ec2 get-console-output`)에서 인스턴스 부팅 로그를 받아 host fingerprint를 확인할 수 있게 해두었다. 보안 환경에선 첫 SSH 전에 콘솔에서 fingerprint를 확인하는 게 정석.

키 페어보다 더 안전한 대안이 있다. **EC2 Instance Connect**(2019년 출시)는 SSH 키를 IAM 권한으로 발급하고 60초간만 유효한 임시 키를 IMDS를 거치지 않고 EC2 안에 push한다. **Session Manager**(SSM Agent 기반)는 SSH 자체를 안 쓰고 HTTPS over WebSocket으로 shell session을 연다. 키도, 22번 포트 inbound도 필요 없다. 시험에 "프로덕션 EC2에 22번 포트를 절대 열고 싶지 않다"는 시나리오가 나오면 답은 거의 항상 Session Manager다.

```bash
# Session Manager로 접속 (포트 22 닫혀 있어도 가능)
aws ssm start-session --target i-0abc1234

# EC2 Instance Connect로 60초 짜리 임시 키 push
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-0abc1234 \
  --availability-zone ap-northeast-2a \
  --instance-os-user ec2-user \
  --ssh-public-key file://~/.ssh/id_ed25519.pub
```

> ⚠️ **함정**: "SSH 키를 GitHub에 실수로 push했다" → 키 회전 절차는 ① 새 키 페어 생성 → ② EBS root에 새 public key 주입(또는 SSM `aws ssm send-command`로 `authorized_keys` 교체) → ③ 인스턴스 재부팅 → ④ 노출된 키 페어 AWS에서 삭제 → ⑤ CloudTrail에서 그 키로 발생한 RunInstances·StartInstances 등 호출 감사. 키 페어 자체는 IAM 자격증명이 아니라 OS 레벨 인증이라 IAM 관점의 "compromised credential" 처리와 다르다는 점이 시험에 나온다.

## User Data와 cloud-init: 부팅 시퀀스의 끝단

User Data 16KB 제한, 1회 실행, 루트 권한은 다 외운다. 그런데 실제로 cloud-init 안에서 무슨 일이 일어나는지를 보면 시험 함정이 더 잘 보인다.

```
0. Nitro hypervisor가 인스턴스 슬롯 할당, EBS attach
1. UEFI bootloader → kernel 로드
2. systemd 시작
3. cloud-init-local.service (네트워크 없이 실행되는 초기화)
   - hostname 설정, /etc/hosts 갱신
4. cloud-init.service (네트워크 + IMDS 접근)
   - IMDS의 instance-id, IAM role, public-keys 등 fetch
   - public-keys를 ec2-user의 authorized_keys에 주입
5. cloud-config.service
   - user-data가 cloud-config YAML이면 여기서 적용
   - packages 설치, write_files, runcmd 등
6. cloud-final.service
   - user-data가 #!/bin/bash 스크립트면 여기서 실행
   - 로그는 /var/log/cloud-init-output.log
```

User Data 스크립트가 실패하는 가장 흔한 이유는 ① shebang 누락(첫 줄 `#!/bin/bash`), ② Windows CRLF 줄바꿈으로 인한 `^M: command not found`, ③ User Data 안에서 외부 리소스(S3, Secrets Manager)를 부르는데 IAM 인스턴스 프로파일이 attach 전이거나 권한이 없는 경우다. 디버깅의 첫 단계는 항상 `/var/log/cloud-init-output.log`를 보는 것.

```bash
# User Data 안에서 Secrets Manager로부터 DB 비밀번호 가져오기
#!/bin/bash
set -euxo pipefail

# 인스턴스 프로파일이 부여한 IAM role 자격증명으로 자동 호출
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id prod/app/db \
  --region ap-northeast-2 \
  --query SecretString --output text | jq -r '.password')

# 환경변수 파일에 주입 (chmod 600으로 권한 제한)
echo "DB_PASSWORD=${DB_PASSWORD}" >> /etc/app/secrets.env
chmod 600 /etc/app/secrets.env
chown app:app /etc/app/secrets.env

systemctl restart app.service
```

이 패턴이 시험의 "user-data에 DB 비밀번호를 박았다 → 어떻게 바꿔야 하나" 시나리오의 정답이다. 핵심은 ① 비밀번호 자체는 Secrets Manager에 있고, ② User Data 안에는 fetch 명령만 있고, ③ 권한은 IAM 인스턴스 프로파일이 부여한다. User Data 자체는 IMDS에서 누구나 읽을 수 있어 비밀번호 저장에 부적합하다.

> 🔍 **더 깊이**: User Data를 매 부팅마다 재실행하려면 cloud-init의 `scripts_per_boot` 모듈을 쓰거나, User Data를 mime-multipart로 구성해 `cloud-init-per` 디렉티브를 사용한다. 또 EC2 console의 "Stop → Edit user data → Start" 시퀀스로 User Data 변경 후 첫 부팅에 새 스크립트를 실행시키는 패턴도 있다. CloudFormation의 `cfn-init`은 User Data보다 더 정교한 metadata-driven 초기화를 제공한다. SSM State Manager는 인스턴스의 desired state를 지속적으로 유지하는 도구로, "한 번 실행"의 User Data보다 운영 측면에서 우월하다.

> 💡 **관련 이론**: cloud-init은 2009년 Canonical(Ubuntu)이 만든 오픈소스 초기화 프레임워크다. 지금은 AWS, GCP, Azure, OpenStack, 로컬 KVM, VMware vSphere 등 거의 모든 환경에서 동일한 YAML로 동작한다. 이 "한 번 쓰면 모든 클라우드"라는 가치 때문에 IaC와 자연스럽게 어울린다. AWS-specific한 cfn-init이나 SSM Agent는 cloud-init 위에 layer로 쌓이는 구조다.

```yaml
#cloud-config
# YAML 기반 declarative user-data 예시
package_update: true
packages:
  - nginx
  - awscli
  - jq

write_files:
  - path: /etc/nginx/conf.d/app.conf
    content: |
      server {
        listen 80;
        location / { proxy_pass http://localhost:8080; }
      }

runcmd:
  - systemctl enable --now nginx
  - aws s3 cp s3://my-bucket/app.tar.gz /opt/
  - tar xzf /opt/app.tar.gz -C /opt/
  - systemctl restart app
```

## IMDSv2 강제: 시험에 반드시 나오는 보안 강화

Capital One 사고(2019)는 SSRF로 IMDSv1을 노출시켜 IAM 역할 자격증명을 탈취한 사건이다. AWS는 그 직접적 결과로 2019년 11월 IMDSv2(session token 기반)를 도입했고, 2024년부터 새 EC2 인스턴스의 기본값을 IMDSv2 required로 바꿨다.

```bash
# 인스턴스 시작 시 IMDSv2 강제 + hop limit 1로 컨테이너 차단
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.micro \
  --metadata-options 'HttpTokens=required,HttpPutResponseHopLimit=1,InstanceMetadataTags=enabled' \
  ...
```

`HttpTokens=required`로 IMDSv1 비활성화, `HttpPutResponseHopLimit=1`로 Docker 컨테이너 안에서의 IMDS 접근을 차단(컨테이너 네트워크는 추가 hop을 거치므로). `InstanceMetadataTags=enabled`(2022년 추가)는 인스턴스의 태그를 IMDS에서 읽을 수 있게 하는 옵션이다. 코드 안에서 `aws ec2 describe-tags` API 호출 없이 태그를 읽을 수 있어 startup latency가 줄어든다.

```bash
# IMDSv2로 자격증명 가져오기 (PUT으로 토큰 받고 GET에 헤더 첨부)
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```

> ⚠️ **함정**: 시험에 "boto3·AWS SDK가 IMDSv2를 지원하느냐"는 시나리오가 나오면 답은 항상 "지원함(2019년 11월 이후 SDK 자동)". 하지만 SDK 버전이 너무 오래된 경우 IMDSv1만 시도하다 실패할 수 있다. AWS SDK for Python(botocore) 1.13.0 이상, AWS SDK for Java 2.x 이상이 안전한 기준. EKS의 IRSA(IAM Roles for Service Accounts)는 IMDS를 안 쓰고 OIDC + STS AssumeRoleWithWebIdentity로 자격증명을 받으므로 IMDS 옵션과 무관하다.

## VPC 안에서 본 SG와 NACL의 평가 순서

패킷이 EC2까지 도달하기까지 SG와 NACL이 어떻게 함께 일하는지를 보면 디버깅이 훨씬 빨라진다.

```
Inbound (외부 → EC2):
  Internet → IGW → Route Table → NACL (inbound rule)
       → Subnet → ENI의 SG (inbound rule) → EC2

Outbound (EC2 → 외부):
  EC2 → ENI의 SG (outbound rule) → Subnet → NACL (outbound rule)
       → Route Table → IGW → Internet
```

SG는 stateful이라 응답에 outbound rule을 다시 안 보지만, NACL은 stateless라 응답 방향(보통 ephemeral port 1024-65535)도 명시적으로 열어야 한다. 그래서 "SG는 다 열려 있는데 통신이 안 된다"는 시나리오의 답은 거의 항상 NACL의 ephemeral port 미허용이다.

> 📚 **사례**: 2020년 Vimeo의 한 엔지니어가 블로그에 "NACL에 outbound TCP 1024-65535를 빠뜨려서 응답이 모두 drop, 디버깅에 4시간"이라는 회고를 올렸다. SG만 보고 디버깅하다가 NACL을 보는 순간 답이 나왔다는 흔한 패턴. 시험 시나리오에서 "SG는 정상인데 connection timed out"이 보이면 NACL을 의심하자.

## 정리하며

오늘 본 그림은 세 가지다. 첫째, Security Group은 conntrack 기반 stateful firewall이고 SG를 자기 자신으로 참조하는 패턴이 클러스터 내부 통신의 표준이다. 둘째, Key Pair는 SSH 표준 위에서 동작하는 OS-level 인증이지 IAM이 아니며, 프로덕션에선 Session Manager나 EC2 Instance Connect로 22번 포트를 닫는 것이 현대적이다. 셋째, User Data는 cloud-init의 마지막 단계에서 1회 실행되고, 비밀번호는 절대 박지 말고 Secrets Manager + 인스턴스 프로파일 패턴을 써야 한다.

다음 글에서는 EC2가 디스크에 접근하는 layer — EBS, 인스턴스 스토어, 그리고 그 위의 EFS·FSx를 본다. 같은 "스토리지"라는 단어 안에 IOPS·throughput·durability·multi-attach가 어떻게 trade-off되는지가 시험의 핵심이다.

---

## 📝 연습 문제

**문제 1.** 한 개발자가 ECS 태스크가 Lambda에서 Secrets Manager Interface Endpoint를 호출하도록 설계했다. Lambda SG의 outbound는 0.0.0.0/0 다 열려 있는데 `ConnectTimeoutError`가 발생한다. 가장 가능성 있는 원인은?

A) Secrets Manager는 Interface Endpoint를 지원하지 않는다
B) Endpoint SG의 inbound에 Lambda SG로부터의 443 허용이 없다
C) IAM 권한이 부족하다
D) Lambda의 timeout이 너무 짧다

**정답: B**
해설: Interface Endpoint(PrivateLink)는 자체 ENI를 가지고 그 ENI에 SG가 attach된다. Lambda의 outbound가 0.0.0.0/0이어도 Endpoint SG의 inbound가 닫혀 있으면 Endpoint ENI에서 패킷이 drop된다. 해결은 Endpoint SG의 inbound에 Lambda SG를 소스로 TCP 443을 허용. C는 IAM이라면 보통 `AccessDeniedException`이 오지 timeout이 아니다. D는 일반 Secrets Manager 호출은 100ms 이내라 Lambda 기본 3초 timeout보다 훨씬 빠르다. Endpoint SG는 자주 빠뜨리는 함정.

---

**문제 2.** 한 회사가 EC2에서 SSH 키를 쓰지 않고 IAM으로 통제되는 shell access를 원한다. 22번 포트 inbound는 절대 열고 싶지 않다. 가장 적절한 솔루션은?

A) EC2 Instance Connect (Browser-based SSH)
B) Session Manager (SSM Agent + HTTPS over WebSocket)
C) Bastion Host + SSH
D) Direct Connect + VPN

**정답: B**
해설: Session Manager는 SSM Agent가 outbound HTTPS(443)로 SSM 서비스에 연결하고, AWS Console·CLI에서 그 세션 위로 shell을 연다. 22번 포트는 닫혀 있어도 동작하고, IAM 권한(`ssm:StartSession`)으로 누가 어느 인스턴스에 접근 가능한지 통제한다. CloudTrail에 모든 명령이 기록되므로 감사도 가능. A의 EC2 Instance Connect도 IAM 통제는 가능하지만 결국 22번 포트가 SG에서 EC2 Instance Connect 서비스 IP에서 열려 있어야 한다. C는 22번 포트가 어디든 열려야 함. D는 네트워크 연결 방식이지 shell 접근 방식이 아님.

---

**문제 3.** 한 EC2 인스턴스가 m5.large인데 sporadic하게 `Connection refused`가 발생한다. CPU·메모리는 여유롭고 애플리케이션 로그에는 에러가 없다. 가장 가능성 있는 원인은?

A) EBS IOPS 한도 초과
B) Conntrack 테이블 한도 초과 (CloudWatch `conntrack_allowance_exceeded` 지표 확인)
C) ALB의 deregistration delay
D) IMDSv2 토큰 만료

**정답: B**
해설: 각 EC2 인스턴스는 SG의 stateful conntrack 테이블이 인스턴스 타입별로 정해진 한도(m5.large 약 350K, c5n.large 약 1M)를 갖는다. 한도 초과 시 새 connection이 drop된다. CloudWatch agent의 `conntrack_allowance_exceeded` 지표로 확인. 해결은 ① 인스턴스 타입을 더 큰 것(c5n 계열)으로 변경, ② 애플리케이션이 connection pool을 효율적으로 재사용하도록 변경, ③ keep-alive로 connection 수 감소. A는 IO 한도 초과 시 latency가 늘지 connection refused는 아님. C는 ALB 동작과 무관. D는 메타데이터 조회와 무관.

---

**문제 4.** User Data 스크립트가 인스턴스 부팅 시 실행되지 않는다. 디버깅 첫 단계로 가장 적절한 것은?

A) AMI를 새로 만든다
B) `/var/log/cloud-init-output.log`와 `/var/log/cloud-init.log`를 확인한다
C) 인스턴스를 다른 AZ로 옮긴다
D) IAM 인스턴스 프로파일을 제거한다

**정답: B**
해설: User Data는 cloud-init의 마지막 단계(`cloud-final.service`)에서 실행되며, 모든 출력은 `/var/log/cloud-init-output.log`에, cloud-init 자체의 동작 로그는 `/var/log/cloud-init.log`에 기록된다. 가장 흔한 실패 원인은 ① shebang(`#!/bin/bash`) 누락, ② Windows CRLF 줄바꿈, ③ User Data 안에서 외부 리소스 호출 시 IAM 권한 부족, ④ User Data 크기 16KB 초과. EC2 콘솔의 "Get System Log"나 `aws ec2 get-console-output`으로도 일부 부팅 로그를 볼 수 있다.

---

**문제 5.** 한 회사가 EC2 인스턴스에 ED25519 키 페어를 사용하려고 한다. CLI로 생성하는 정확한 명령은?

A) `aws ec2 create-key-pair --key-name my-key --key-type ed25519 --query 'KeyMaterial' --output text > my-key.pem`
B) `aws ec2 create-key-pair --key-name my-key --key-format ed25519`
C) `aws iam create-key-pair --key-name my-key`
D) EC2 콘솔에서만 가능

**정답: A**
해설: `--key-type ed25519`로 명시. 출력은 PEM 포맷으로 받아 `my-key.pem`에 저장하고 `chmod 400 my-key.pem` 후 SSH 사용. ED25519는 RSA 2048보다 키가 짧고 서명·검증이 빠르며 side-channel 공격에 더 강하다. AWS는 2021년부터 ED25519 지원. C의 `aws iam create-key-pair`는 존재하지 않는 명령(IAM의 키는 access key이지 SSH 키가 아님).

---

**문제 6.** 한 EC2 인스턴스가 SSRF 공격으로 IMDSv1을 통해 IAM 역할 자격증명을 탈취당했다. 동일한 사고를 방지하는 가장 적절한 EC2 설정은?

A) IAM 역할을 제거한다
B) `MetadataOptions.HttpTokens=required, HttpPutResponseHopLimit=1`로 IMDSv2 강제 + 컨테이너 경유 접근 차단
C) Security Group에서 169.254.169.254를 차단한다
D) `ec2messages.amazonaws.com` endpoint를 사용한다

**정답: B**
해설: `HttpTokens=required`로 IMDSv1 비활성화 → SSRF 공격자는 PUT을 못 보내므로 토큰을 받지 못해 메타데이터 접근 차단. `HttpPutResponseHopLimit=1`로 추가 강화 → Docker 컨테이너 네트워크는 hop을 한 번 더 거치므로 컨테이너 안에서 IMDS 접근 차단. A는 애플리케이션이 IAM 권한을 못 쓰게 됨. C는 169.254.169.254가 link-local 주소라 SG로 통제 불가(SG는 ENI 외부 라우팅된 패킷만 봄). D는 SSM 통신용 endpoint로 IMDS와 무관.

---

**문제 7.** 다음 cloud-config YAML 중 매 부팅마다 실행되는 명령을 정의하는 부분은?

A) `runcmd`
B) `bootcmd`
C) `scripts_per_boot`
D) `write_files`

**정답: C**
해설: `runcmd`는 cloud-init "instance" frequency로 첫 부팅에 1회만 실행. `bootcmd`는 매 부팅마다 실행되지만 매우 이른 단계라 네트워크가 없을 수 있음. `scripts_per_boot`는 `/var/lib/cloud/scripts/per-boot/` 디렉터리의 스크립트를 매 부팅마다 실행. `write_files`는 명령이 아니라 파일 생성 디렉티브. User Data를 매 부팅마다 실행하려면 mime-multipart로 `text/x-shellscript-per-boot` 타입 part를 사용한다.

---

**문제 8.** Lambda 함수가 VPC에 연결돼 PrivateLink로 DynamoDB Gateway Endpoint를 호출하려 한다. Lambda SG와 Endpoint 설정에 대해 옳은 것은?

A) Gateway Endpoint(S3, DynamoDB)는 ENI가 없으므로 SG 적용이 안 되고, 대신 Route Table에 prefix list를 추가해 Lambda subnet의 outbound route를 endpoint로 보낸다
B) Gateway Endpoint도 ENI가 있어 SG로 통제한다
C) DynamoDB는 PrivateLink Interface Endpoint만 지원한다
D) Lambda가 VPC에 연결되면 DynamoDB 호출이 불가능하다

**정답: A**
해설: AWS의 VPC Endpoint는 두 종류다. **Gateway Endpoint**(S3, DynamoDB 한정)는 Route Table 항목으로 동작해 ENI나 SG 없이 트래픽을 endpoint로 라우팅. **Interface Endpoint**(PrivateLink, 대부분의 서비스)는 ENI를 만들고 그 ENI에 SG를 attach. DynamoDB는 2017년부터 Gateway Endpoint를 지원했고, 2023년 PrivateLink Interface Endpoint도 추가 지원. 시험에서 "Lambda가 VPC에 연결됐는데 DynamoDB 호출이 timeout"이라는 시나리오의 답은 거의 항상 Gateway Endpoint의 Route Table에 prefix list 누락이다.

---

## 📌 오늘의 요약

1. Security Group은 ENI 단위 stateful firewall, conntrack 테이블에 5-tuple을 추적해 응답 자동 허용. SG → SG 자기 자신 참조가 클러스터 내부 통신 표준 패턴.
2. NACL은 subnet 단위 stateless ACL, ephemeral port outbound 명시 필요. SG에 비해 디버깅 시 함정이 많다.
3. Key Pair는 SSH 표준의 public key auth를 EC2에 매핑한 것이고, ED25519가 모던 표준. 프로덕션에선 Session Manager로 22번 포트 자체를 닫는 것이 best practice.
4. User Data는 cloud-init의 마지막 단계에서 1회 실행, `/var/log/cloud-init-output.log`가 디버깅의 출발점. 비밀번호는 절대 박지 말고 Secrets Manager + 인스턴스 프로파일.
5. IMDSv2 강제(`HttpTokens=required` + `HttpPutResponseHopLimit=1`)는 SSRF 방어의 핵심. Capital One 사고 직후 도입된 메커니즘.

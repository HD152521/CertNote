# Day 10 - Week 2 종합: EC2 layer가 한 시스템 안에서 맞물리는 방식

Week 2에서 본 EC2의 모든 layer — Nitro·인스턴스 패밀리·AMI·Security Group·Key Pair·User Data·EBS·Instance Store·ALB·NLB·ASG — 는 따로 외워두면 잘 안 풀리는 시험이다. 시험 문제는 항상 시나리오로 나오고, 그 시나리오에서 "SG는 다 열려 있는데 왜 안 되지?", "왜 새 인스턴스가 ALB에서 안 보이지?", "왜 cross-AZ traffic 비용이 폭발했지?" 같은 질문이 던져진다. 이 질문들은 각 layer를 따로 보면 답이 안 나오고, **layer들이 어떻게 맞물려 동작하는지**를 봐야 풀린다.

오늘은 Week 2의 모든 개념을 한 production-grade 아키텍처 안에 묶고, 그 위에서 자주 만나는 함정과 시험 시나리오를 정리한다. 마지막엔 시나리오 기반 종합 연습 문제 12문항으로 실전 감각을 점검한다.

## 한 시스템 안에서 Week 2 전체가 어떻게 맞물리는가

전형적인 3-tier 웹 서비스를 EC2 위에 짓는다고 가정하자. 사용자 → CloudFront → ALB → ASG(EC2) → RDS Multi-AZ + ElastiCache 구조다. 이 구조 안에서 Week 2의 각 개념이 어디에 위치하는지를 본다.

```
                          [Route 53 (DNS, alias to ALB)]
                                       │
                                       ▼
                          [CloudFront (edge cache + WAF)]
                                       │
                                       ▼
                          [ALB in 3 AZs (cross-zone ON, ACM cert)]
            HTTPS:443  ┌──────┴──────┐
                       ▼             ▼
            (path /api/*)   (path /*)
                       │             │
                       ▼             ▼
            [api-tg]         [web-tg]
            (target=instance, /healthz)
                       │             │
            ┌──────────┴─────────────┴──────────┐
            ▼                                   ▼
     [ASG: Mixed Instance Policy]
     Min 3, Max 30, Desired 6
     ┌─ AZ-a ─┐  ┌─ AZ-b ─┐  ┌─ AZ-c ─┐
     │ EC2 #1 │  │ EC2 #3 │  │ EC2 #5 │
     │ EC2 #2 │  │ EC2 #4 │  │ EC2 #6 │
     │ gp3 root│  │ gp3 root│  │ gp3 root│
     │ io2 data│  │ io2 data│  │ io2 data│
     └────────┘  └────────┘  └────────┘
                       │
     IAM Instance Profile (S3 read, Secrets Manager read)
     User Data: Secrets Manager에서 DB pass fetch
     IMDSv2 required, hop-limit 1
                       │
                       ▼
     [Security Group: web-sg]
        Inbound:  443 from ALB SG
                  22  from Bastion SG
        Outbound: 3306 to db-sg, 6379 to cache-sg, 443 to 0.0.0.0/0
                       │
                       ▼
            ┌─ AZ-a ──┐   ┌─ AZ-b ──┐
     [RDS Multi-AZ Primary/Standby (synchronous), db-sg]
     [ElastiCache Redis Cluster (Multi-AZ, cache-sg)]
```

이 아키텍처에서 Week 2 각 개념이 어떻게 작동하는지 따라가 보자.

**시작점 - 사용자가 https://app.example.com 으로 요청**
1. Route 53이 DNS query를 받아 ALB의 alias record로 응답
2. ALB가 SNI로 `app.example.com` 인증서 제공 (ACM 발급, 자동 갱신)
3. ALB listener rule이 path-pattern으로 web-tg 또는 api-tg 결정
4. ALB가 healthy target 중 하나에 forward. cross-zone ON이라 AZ 균등 분산
5. ALB SG의 outbound → web-sg의 inbound 443 매칭
6. EC2 인스턴스의 nginx가 8080 → application으로 reverse-proxy

**Auto Scaling이 한 인스턴스를 더 띄울 때**
1. CloudWatch에 ALB RequestCountPerTarget 1500 → ASG의 Target Tracking이 desired +1
2. ASG가 launch template으로 새 EC2 시작. Mixed Instance Policy로 c5.large 또는 c5a.large 중 capacity-optimized
3. Nitro hypervisor가 호스트 할당, EBS gp3 root volume + io2 data volume attach
4. cloud-init이 IMDSv2 토큰 받아 메타데이터 fetch, IAM 인스턴스 프로파일의 자격증명 주입
5. User Data가 `aws secretsmanager get-secret-value`로 DB pass fetch, `/etc/app/secrets.env`에 chmod 600으로 저장
6. Lifecycle hook `EC2_INSTANCE_LAUNCHING`이 인스턴스를 Pending:Wait에 머물게 함
7. application이 시작되고 cache pre-warm 완료 후 `complete-lifecycle-action`
8. ASG가 인스턴스를 InService로 전환, ALB target group에 자동 등록
9. Health check `/healthz`가 5회 연속 200 → healthy. 이때부터 traffic 수신

**인스턴스가 죽거나 scale-in 될 때**
1. EC2 자체 상태 체크 fail, 또는 ALB가 unhealthy threshold 도달
2. ASG가 `HealthCheckType=ELB`이므로 그 인스턴스를 terminate 결정
3. Lifecycle hook `EC2_INSTANCE_TERMINATING`이 Terminating:Wait
4. SNS/SQS로 알림, Lambda가 로그를 S3 sync, application graceful shutdown
5. ALB의 deregistration delay 300초 동안 in-flight 요청 완료
6. `complete-lifecycle-action` 후 인스턴스 종료, EBS volume은 DeleteOnTermination=true면 같이 삭제

이 시퀀스에 등장한 모든 개념이 Week 2의 시험 범위다. 시험 문제는 이 시퀀스 어딘가에서 한 단계가 망가졌을 때를 시나리오로 묻는다.

## 자주 만나는 함정 정리

### 함정 1: SG는 다 열려 있는데 connection이 안 된다
보통 ① NACL의 ephemeral port outbound 누락, ② Endpoint SG(PrivateLink) inbound 누락, ③ conntrack 한도 초과(인스턴스 타입별), ④ Route Table에 IGW/NAT route 누락 중 하나. SG만 보지 말고 패킷 경로 전체를 따라가야 한다.

### 함정 2: 새 인스턴스가 ALB에서 5xx를 반환한다
Health check가 통과하는 시점과 application이 fully ready되는 시점이 다르다. health check path를 `/healthz`로 두고 application 안에서 ready flag가 true일 때만 200 응답하게 하거나, ASG의 lifecycle hook으로 warmup 시간 확보.

### 함정 3: cross-AZ 비용이 폭발한다
NLB cross-zone을 켜두고 AZ별 target 수가 다르거나, 두 AWS 계정의 ZoneName 매핑이 달라 PrivateLink가 cross-AZ로 흐를 때. ZoneId 기준으로 align해야 함.

### 함정 4: EBS snapshot 복원 후 응답이 느리다
Lazy load 때문이다. Fast Snapshot Restore를 켜거나 `dd`로 모든 block을 한 번 read.

### 함정 5: User Data에 비밀번호를 박았다가 보안 감사 지적
IMDS에서 누구나 읽을 수 있다. Secrets Manager + 인스턴스 프로파일로 변경.

### 함정 6: Spot 회수율이 높아 production이 자주 다운
`lowest-price` strategy → `capacity-optimized` 또는 `price-capacity-optimized`로 변경. 여러 instance type을 Override에 등록.

### 함정 7: HDD 볼륨을 부팅 디스크로 시도
st1·sc1은 부팅 불가. SSD(gp2/gp3/io1/io2)만 부팅 가능.

### 함정 8: 두 EC2가 같은 EBS volume에 동시 access
일반 gp3로는 불가. io1/io2 + Nitro + 같은 AZ + Multi-Attach + cluster file system 필요. 보통 EFS가 더 맞는 답.

### 함정 9: Instance store에 중요 데이터 저장 후 stop
영구 데이터 소멸. 영구 저장이 필요하면 EBS, 공유가 필요하면 EFS·S3.

### 함정 10: IMDSv1 사용 중 SSRF 공격
IMDSv2 강제 (`HttpTokens=required`, `HttpPutResponseHopLimit=1`). Capital One 사고의 원인.

### 함정 11: ALB target group의 `target-type=ip`인데 보안 그룹이 매치 안 됨
IP 타입은 SG 참조가 인스턴스 단위 target과 다르게 동작. ENI의 SG를 정확히 inbound로 허용해야 함.

### 함정 12: ASG의 desired capacity를 수동으로 바꿔도 scaling policy가 다시 되돌림
Target Tracking이 켜져 있으면 매번 metric을 보고 desired를 다시 조정. 수동 조정이 필요하면 정책 일시 정지 또는 `suspend-processes`.

## Week 2 헷갈리는 비교 정리

| A | B | 핵심 차이 |
|---|---|---------|
| Instance Store | EBS | 임시(호스트 종속) vs 영구(네트워크 디스크) |
| Stop | Terminate | EBS 보존(옵션) vs 기본 삭제(DeleteOnTermination) |
| Stop | Hibernate | RAM 소멸 vs RAM을 EBS에 dump 후 stop |
| Reboot | Stop+Start | 같은 호스트 vs 다른 호스트(public IP 변경) |
| Reserved Instance | Savings Plan | 인스턴스 패밀리·리전 commit vs 시간당 dollar commit |
| Standard RI | Convertible RI | 패밀리 고정 vs 패밀리 교환 가능(가격 ↑) |
| Compute SP | EC2 Instance SP | 다양한 서비스 적용 vs 특정 패밀리·리전만 |
| Public IP | Elastic IP | 휘발성·무료 vs 고정·미사용 시 과금·2024년부터 사용 중에도 과금 |
| Security Group | NACL | 인스턴스 stateful Allow only vs subnet stateless Allow+Deny |
| ALB | NLB | L7 HTTP routing vs L4 TCP/UDP 고정 EIP |
| ALB | API Gateway | LB로 Lambda 호출 vs API 관리 기능 풍부 |
| Cluster PG | Spread PG | 같은 랙(저지연) vs 다른 랙(HA) |
| Cluster PG | Partition PG | 단일 그룹 vs 여러 파티션(Cassandra rack-awareness) |
| Target Tracking | Step Scaling | 자동 목표값 추적 vs 명시적 임계값 step |
| gp3 | gp2 | IOPS·throughput 독립 설정 vs 크기 종속 |
| io1 | io2 | 99.9% vs 99.999% durability + IOPS:GB 1:50 vs 1:500 |
| EBS | EFS | block 단일 인스턴스 vs NFS 다중 인스턴스 |
| EFS | FSx for Lustre | 일반 NFS vs HPC 병렬 FS |
| Cross-Zone ALB | Cross-Zone NLB | 기본 ON·무료 vs 기본 OFF·켜면 cross-AZ data transfer 비용 |
| Sticky ALB | Sticky NLB | 쿠키 기반 vs Source IP affinity |
| IMDSv1 | IMDSv2 | GET만 → SSRF 취약 vs PUT 토큰 + GET 헤더 안전 |
| User Data | cfn-init | 1회 부트스트랩 vs CloudFormation metadata 기반 정교한 초기화 |
| Lifecycle Hook (Launching) | Lifecycle Hook (Terminating) | warmup 동안 InService 지연 vs graceful shutdown 동안 종료 지연 |
| capacity-optimized | lowest-price | 회수율 낮음(production) vs 비용 낮음(batch) |

## Week 2 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **EC2** | Elastic Compute Cloud |
| **AMI** | Amazon Machine Image |
| **EBS** | Elastic Block Store |
| **EFS** | Elastic File System |
| **FSx** | (제품군 - Lustre·Windows·NetApp ONTAP·OpenZFS) |
| **EIP** | Elastic IP |
| **IMDS** | Instance Metadata Service (v1/v2) |
| **ELB** | Elastic Load Balancing |
| **ALB / NLB / CLB / GWLB** | Application/Network/Classic/Gateway Load Balancer |
| **ASG** | Auto Scaling Group |
| **RI** | Reserved Instance |
| **SP** | Savings Plan |
| **PG** | Placement Group |
| **NACL** | Network Access Control List |
| **DLM** | Data Lifecycle Manager |
| **FSR** | Fast Snapshot Restore |
| **SNI** | Server Name Indication |
| **TLS** | Transport Layer Security |
| **ACM** | AWS Certificate Manager |
| **mTLS** | mutual TLS (client certificate) |
| **VPC** | Virtual Private Cloud |
| **IGW** | Internet Gateway |
| **NAT** | Network Address Translation |
| **IOPS** | Input/Output Operations Per Second |
| **EFA** | Elastic Fabric Adapter |
| **DEK** | Data Encryption Key (KMS envelope encryption) |
| **AES-XTS** | Advanced Encryption Standard - XEX-based Tweaked-codebook with ciphertext Stealing |
| **CMK** | Customer Master Key (KMS) |
| **LCU/NLCU/GLCU** | Load Balancer Capacity Unit (ALB/NLB/GWLB) |
| **MRK** | Multi-Region Key (KMS) |

## DVA 특화 시험 포인트 (SAA와 다른 부분)

DVA는 SAA와 같은 EC2 범위를 다루지만 시험 문제의 시점이 다르다. 같은 ASG라도 DVA는 ① IMDSv2 토큰을 어떻게 boto3에서 다루는지, ② CodeDeploy의 Blue/Green이 ALB target group을 어떻게 조작하는지, ③ Lambda에서 EFS를 어떻게 마운트하는지, ④ User Data 안에서 Secrets Manager 호출 시 인스턴스 프로파일 권한 attach 시점이 언제인지 같은 코드·SDK·옵션 이름 레벨까지 묻는다.

| DVA 시점 |
|----------|
| boto3에서 IMDSv2 토큰 자동 처리 (botocore 1.13+) |
| Lambda → EFS mount (access point 필요) |
| ALB → Lambda 직접 호출 (event 형식이 API Gateway와 다름) |
| User Data 안에서 인스턴스 프로파일로 Secrets Manager 호출 |
| CodeDeploy가 ASG + ALB와 통합되는 메커니즘 |
| Lifecycle hook의 SNS/SQS notification target |
| EBS Multi-Region snapshot copy 시 KMS Multi-Region Key |

## 정리하며

Week 2는 EC2 layer 전체를 봤다. EC2 자체의 가상화·인스턴스 패밀리·AMI에서 시작해, 그 위의 네트워크 통제(SG, Key Pair, User Data), 디스크 layer(EBS, Instance Store, EFS/FSx), 그리고 트래픽 분산 layer(ALB/NLB, ASG)까지 한 production 아키텍처가 어떻게 짜이는지를 따라왔다. 이 전체가 시험에선 한 시나리오 안에 묶여서 나오므로, 각 layer를 따로 외우는 것보다 "한 인스턴스가 트래픽을 받기까지의 전체 경로"를 머릿속에 그릴 수 있어야 한다.

Week 3부터는 이 EC2 layer 위에 IAM·Lambda·DynamoDB·API Gateway·CodePipeline 같은 DVA-특화 layer가 쌓인다. EC2 layer가 단단히 정리돼 있어야 그 위의 개발자-시점 layer가 잘 올라간다.

---

## 📝 Week 2 종합 연습 문제 (시나리오 12문항)

**문제 1.** 한 e-commerce 회사의 ALB + ASG production 시스템이 매일 오후 7시 sale 시작 시 first 5분간 RPS가 평소의 20배로 spike한다. Target Tracking(CPU 60%) scaling policy를 쓰는데 사용자들이 5xx를 받고 있다. 가장 적절한 개선은?

A) ASG의 min size를 늘린다
B) Predictive Scaling + Scheduled Scaling으로 6:55에 미리 desired를 늘리고, Step Scaling으로 spike 시 공격적 scale-out
C) Target Tracking의 목표값을 30%로 낮춘다
D) NLB로 옮긴다

**정답: B**
해설: Target Tracking은 metric을 보고 반응형으로 조정하는데, 30초 단위 CloudWatch + scale-out에 인스턴스 boot 2-3분 = 총 3-5분 지연. 5분 spike에는 이미 늦었다. **Scheduled Scaling**으로 6:55에 desired를 미리 늘려두면(predictive scaling은 학습된 pattern이 있다면 자동) 인스턴스가 warmed up 상태에서 spike를 받음. + Step Scaling으로 spike 시 +5 같은 공격적 추가. C는 평소에 인스턴스 낭비. D는 ALB의 HTTP 기능을 잃음.

---

**문제 2.** 한 회사가 EC2 인스턴스에서 매일 자정에 ML training을 돌리고 결과를 S3에 업로드한다. 비용을 최소화하면서 작업이 24시간 안에만 끝나면 된다. 가장 적절한 구매 옵션은?

A) On-Demand 시간당 사용
B) Reserved Instance 1년 약정
C) Spot Instance + checkpoint를 S3에 정기 저장
D) Dedicated Host

**정답: C**
해설: 매일 새벽 짧은 시간만 사용 + checkpoint로 회수 대응 가능 → Spot 적합. 90% 절감. 회수 시 2분 사전 통보를 IMDS `/latest/meta-data/spot/instance-action`에서 받아 현재 progress를 S3에 sync하고 graceful shutdown. 다음 실행 때 checkpoint에서 resume. A는 매일 다 비용. B는 짧은 시간 사용에 RI 약정 낭비. D는 BYOL 라이선스 한정 비싸다.

---

**문제 3.** 한 개발자가 EC2 인스턴스의 IMDS에서 IAM 자격증명을 가져오려는데 `curl http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole`가 401을 반환한다. 가장 가능성 있는 원인은?

A) 인스턴스에 IAM Role이 attach 안 됨
B) IMDSv2 required인데 `curl`이 IMDSv1 GET만 사용 (PUT으로 토큰 먼저 받아야 함)
C) Security Group에서 169.254.169.254가 차단
D) NACL이 link-local 트래픽을 차단

**정답: B**
해설: 2024년 이후 새 인스턴스는 기본이 IMDSv2 required. 토큰 없이 GET하면 401. 정확한 방법:
```bash
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```
A라면 404. C/D는 169.254.169.254가 link-local이라 SG/NACL 통제 불가.

---

**문제 4.** 한 회사가 EC2를 두 대 운영하고 같은 디렉터리에서 read·write 해야 한다. 동시 access가 필요하고, 두 EC2가 다른 AZ에 있다. 가장 적절한 솔루션은?

A) EBS volume을 두 EC2에 attach (Multi-Attach 사용)
B) EFS file system을 두 EC2에 NFS로 마운트
C) S3 버킷에 file sync
D) Instance Store

**정답: B**
해설: EFS는 NFSv4.1 기반으로 multi-AZ 자동 복제, 수천 클라이언트 동시 access 지원. 일반 EBS Multi-Attach는 ① io1/io2만, ② 같은 AZ만, ③ cluster-aware FS 필요한 까다로운 제약. 두 AZ에 EC2가 있으므로 Multi-Attach는 불가능. C는 file system semantics가 아니라 object store. D는 호스트 종속.

---

**문제 5.** 한 회사가 ALB로 마이크로서비스를 운영한다. `api.example.com/orders/*`는 orders 서비스로, `api.example.com/users/*`는 users 서비스로 보내야 한다. 두 서비스는 각각 ASG로 운영된다. 가장 정확한 구성은?

A) 두 ALB를 만들어 각 서비스에 하나씩
B) 한 ALB의 한 listener에 두 target group을 만들고, listener rule로 path-pattern matching: `/orders/*` → orders-tg, `/users/*` → users-tg
C) NLB로 옮긴다
D) Route 53으로 path 분기

**정답: B**
해설: ALB는 path-pattern · host-header 기반 routing이 native. listener rule을 priority 순으로 등록하고 각 rule이 target group에 forward. C의 NLB는 L4라 path 모름. D의 Route 53은 DNS라 path 분기 불가(host name만 가능). A는 비용 낭비 + 운영 복잡도 증가. ALB 1개로 충분.

---

**문제 6.** 한 EC2 인스턴스가 user-data 안에서 `aws s3 cp s3://bucket/app.tar.gz /opt/`를 호출하는데 `Unable to locate credentials` 에러가 발생한다. 가장 가능성 있는 원인은?

A) S3 버킷이 존재하지 않음
B) 인스턴스에 IAM Instance Profile이 attach 안 됨, 또는 그 Role에 `s3:GetObject` 권한이 없음
C) 인스턴스의 region이 잘못됨
D) IMDSv2 토큰 만료

**정답: B**
해설: AWS CLI/SDK는 자격증명을 ① 명시적 access key, ② 환경변수, ③ ~/.aws/credentials, ④ IMDS의 인스턴스 프로파일 순으로 탐색한다. `Unable to locate credentials`는 그 어느 것도 못 찾았다는 의미. EC2 인스턴스는 보통 인스턴스 프로파일을 통해 IAM Role의 임시 자격증명을 받는데, 프로파일이 attach 안 됐거나 권한이 없으면 이 에러. A라면 `NoSuchBucket`, C라면 `endpoint not found` 비슷한 에러, D는 IMDSv2 토큰 만료 시 SDK가 자동 재발급(botocore 1.13+).

---

**문제 7.** 한 회사가 production EC2의 EBS volume(미암호화 gp2)을 암호화하려고 한다. downtime을 최소화하려면?

A) `modify-volume --encrypted` 명령으로 직접
B) Snapshot 생성 → `copy-snapshot --encrypted`로 암호화 복사 → 암호화된 snapshot에서 새 volume 생성 → 짧은 downtime 동안 detach/attach 교체
C) AWS Support에 변환 요청
D) 새 인스턴스를 만들고 데이터를 rsync

**정답: B**
해설: 표준 5단계 절차. 실행 중인 volume 직접 암호화 불가. 정확한 명령:
```bash
aws ec2 create-snapshot --volume-id vol-original
aws ec2 copy-snapshot --source-snapshot-id snap-orig --encrypted --kms-key-id alias/aws/ebs
aws ec2 create-volume --snapshot-id snap-encrypted --availability-zone same-az --volume-type gp3
# 짧은 downtime: detach old, attach new
```
대안: RDS라면 encrypted read replica 만들고 promote (거의 무중단). D는 데이터 동기화 위험.

---

**문제 8.** 한 회사가 새 인스턴스가 ALB target group에 등록되자마자 traffic을 받아 application warm-up 전 5xx를 반환한다. 가장 적절한 대응은?

A) ASG의 `HealthCheckGracePeriod`를 300초로 늘린다
B) ASG에 `EC2_INSTANCE_LAUNCHING` Lifecycle Hook을 등록하고, 인스턴스 안에서 warmup 완료 시 `complete-lifecycle-action` 호출
C) ALB의 health check path를 `/`로 변경
D) target group의 deregistration delay를 늘린다

**정답: B**
해설: Lifecycle Hook이 정확한 도구. 인스턴스를 Pending:Wait에 머물게 해 InService로의 전환을 지연. warmup(JVM warm, cache preload) 완료 후 명시적 신호로 진행. A의 grace period는 health check를 보류하지 종료 시점만 조정. C는 부적합 (`/`가 항상 200이면 false positive). D는 종료 시점 무관. 대안으로 application의 `/healthz`를 ready flag 통제하에 두는 패턴도 자주 쓰임.

---

**문제 9.** 한 회사가 NLB로 게임 서버 traffic을 분산한다. 사용자는 5개 AZ에 골고루 분포하는데, 각 AZ의 인스턴스 수가 다르다(AZ-a 10대, AZ-b 5대, AZ-c 2대). traffic이 불균등하다는 보고가 들어왔다. 가장 적절한 조치는?

A) NLB의 cross-zone load balancing 활성화 (단, cross-AZ data transfer 비용 발생)
B) ALB로 변경
C) AZ별 인스턴스 수를 동일하게 맞춘다
D) Route 53 weighted routing

**정답: A**
해설: NLB는 cross-zone이 기본 OFF로, 각 NLB node가 같은 AZ의 target에만 traffic을 분배. AZ-a 10대 / AZ-b 5대 / AZ-c 2대일 때 traffic은 1/3씩 가지만 AZ-c의 2대는 부하 집중. cross-zone을 켜면 모든 target이 동일 부하를 받지만 cross-AZ data transfer 비용 발생(GB당 $0.01 양방향). C도 해결책이지만 ASG가 AZ별로 균등 배치하는 게 항상 보장되진 않음. B의 ALB는 HTTP 한정이라 게임 traffic에 부적합. D는 DNS layer라 즉시 반영 안 됨.

---

**문제 10.** 한 ML팀이 Lambda 함수에서 2GB ML 모델을 load해야 한다. Lambda layer 한도(250MB)를 초과한다. 가장 적절한 솔루션은?

A) Lambda 대신 EC2 사용
B) Lambda에 EFS access point를 mount하고 EFS에 모델 파일 저장
C) S3에 모델을 두고 cold start마다 download
D) 모델을 quantize해서 250MB 아래로

**정답: B**
해설: Lambda는 2020년부터 EFS 마운트 지원. EFS access point를 통해 같은 VPC + subnet에서 mount하면 함수 안에서 일반 파일 IO로 모델 access. ZIP/Layer 한도 우회. Cold start latency가 EFS mount 시간만큼 추가되지만 2GB download보다는 훨씬 빠름. C는 매 cold start에 2GB 다운로드 → latency 폭발. A는 serverless 장점 포기. D는 정확도 손실. 단 EFS access point + VPC config 필요.

---

**문제 11.** 한 인스턴스가 sporadic하게 `Connection refused`를 반환한다. CPU·메모리는 여유 있고 SG는 다 열려 있다. CloudWatch에서 `conntrack_allowance_exceeded` 지표가 발생한다. 가장 적절한 대응은?

A) Conntrack 한도 초과. 인스턴스 타입을 더 큰 것(c5n 같은 enhanced networking)으로 변경하거나 application의 connection pool 효율화, keep-alive 사용
B) AWS Support에 quota 증가 요청
C) ASG max size를 늘린다
D) Security Group에 더 많은 규칙 추가

**정답: A**
해설: SG는 conntrack 테이블에 5-tuple을 저장해 stateful filtering. 인스턴스 타입별 한도가 있고(m5.large 약 350K, c5n.large 약 1M) 한도 초과 시 새 connection drop. 해결은 ① 더 큰 인스턴스 (특히 c5n·m5n 계열 enhanced networking), ② keep-alive로 connection 재사용, ③ connection pool 효율 개선. B의 conntrack은 hard limit이라 quota 증액 불가. C는 인스턴스 자체를 추가하지 한 인스턴스의 conntrack은 변함 없음. D는 무관.

---

**문제 12.** 한 회사가 EC2 production을 ALB + ASG로 운영한다. CodeDeploy로 Blue/Green 배포를 설정하려는데, ALB의 어떤 기능을 사용하는가?

A) Listener rule의 weighted forward로 두 target group(Blue/Green)에 traffic 분배, CodeDeploy가 weight를 시간에 따라 0/100 → 100/0으로 조정
B) ALB를 두 개 만들어 Route 53 weighted routing
C) NLB로 변경 후 source IP affinity 사용
D) Sticky session

**정답: A**
해설: CodeDeploy의 Blue/Green deployment(ALB integration)는 listener의 weighted forward를 활용한다. 새 Green target group을 만들고, CodeDeploy가 listener rule의 forward action에 두 target group의 weight를 조정. 예: 시작 Blue 100/Green 0 → Linear10PercentEvery1Minute → Blue 0/Green 100 → 검증 후 Blue terminate. 단일 ALB에서 동작. CodeDeploy는 추가로 ASG에 새 인스턴스를 띄워 Green을 채움. B는 DNS TTL 때문에 즉각 전환 불가. C/D는 무관.

---

## 📊 Week 2 자기 평가

| 점수 | 평가 |
|------|------|
| 11-12 | 우수 - Week 3 진행, EC2 layer 완전 이해 |
| 8-10 | 양호 - 틀린 문제 복습 후 진행, 특히 함정 12가지 재점검 |
| 5-7 | 보통 - EC2 layer 재학습 권장, 특히 ASG·lifecycle hook |
| 0-4 | 미흡 - Week 2 처음부터 다시. SG·EBS·ALB 각 layer 정독 |

## 📌 Week 2 전체 요약

1. EC2 가상화는 Nitro System(전용 하드웨어 카드)으로 진화했고, Firecracker microVM이 Lambda·Fargate의 기반. 인스턴스 패밀리(M·C·R·I·D·P·G·T)와 Graviton(g 접미사) 칩 선택이 비용 최적화의 출발점.
2. Security Group은 ENI 단위 stateful firewall(conntrack 기반). NACL은 subnet 단위 stateless. IMDSv2 강제(`HttpTokens=required`)가 SSRF 방어 표준.
3. User Data는 cloud-init의 마지막 단계 1회 실행, 16KB 한도. 비밀번호 절대 박지 말고 Secrets Manager + 인스턴스 프로파일.
4. EBS는 AZ 종속 분산 블록 스토리지. gp3가 default, io2/Block Express는 critical DB. snapshot은 S3 incremental + Snapshot Archive(75% 절감). KMS envelope encryption.
5. Instance Store는 호스트 NVMe 직결 microsecond latency지만 stop/terminate 시 소멸. 영구 저장 금지.
6. 공유 파일은 EBS Multi-Attach가 아니라 EFS(NFS multi-AZ). HPC는 FSx for Lustre, Windows는 FSx for Windows, enterprise는 FSx for NetApp ONTAP.
7. ALB(L7 HTTP routing)와 NLB(L4 TCP/UDP 고정 EIP)의 선택은 워크로드 프로토콜 기반. ALB cross-zone 기본 ON·무료, NLB 기본 OFF·켜면 비용.
8. ASG는 reconciliation loop, Lifecycle Hook으로 warmup·graceful shutdown 통제. Target Tracking이 default scaling policy. Mixed Instance Policy + capacity-optimized Spot이 production 표준.
9. Blue/Green 배포는 ALB의 weighted forward와 CodeDeploy의 통합으로 native 구현.
10. 시험 시나리오는 layer 간 연결을 묻는다. "SG는 열려 있는데 안 된다"는 NACL/Endpoint SG/conntrack/Route Table 중 하나, "5xx"는 health check timing/warmup/IAM 권한 중 하나로 좁히는 습관이 정답률을 결정한다.

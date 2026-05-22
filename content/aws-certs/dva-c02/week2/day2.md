# Day 7 - EC2: 보안 그룹, 키 페어, 사용자 데이터

📅 날짜: 2026년 5월 25일 (월요일)  
🎯 주제: EC2 보안 및 초기화  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 보안 그룹의 개념과 인바운드/아웃바운드 규칙을 설정할 수 있다
- 키 페어를 생성하고 EC2에 SSH 접속할 수 있다
- 사용자 데이터(User Data)로 인스턴스 초기화를 자동화한다

---

## 📖 이론 내용

### 1. 보안 그룹 (Security Group)

보안 그룹은 EC2 인스턴스의 가상 방화벽으로, 인바운드(들어오는) 및 아웃바운드(나가는) 트래픽을 제어합니다.

**보안 그룹의 특징:**
- **상태 저장(Stateful)**: 인바운드 허용 시 응답 트래픽은 자동 허용
- **허용 규칙만 가능**: Deny 규칙 없음 (기본 모든 인바운드 차단, 모든 아웃바운드 허용)
- 하나의 인스턴스에 여러 보안 그룹 연결 가능
- 리전/VPC에 종속적
- 다른 보안 그룹을 소스로 참조 가능

**보안 그룹 규칙 구성:**
- **유형**: SSH, HTTP, HTTPS, 사용자 지정 TCP 등
- **프로토콜**: TCP, UDP, ICMP
- **포트 범위**: 단일 포트 또는 범위
- **소스/대상**: IP 주소, CIDR 블록, 다른 보안 그룹

**⭐ 시험 핵심: 보안 그룹 vs NACL 비교**

| 특성 | 보안 그룹 | NACL |
|------|-----------|------|
| 적용 대상 | 인스턴스 수준 | 서브넷 수준 |
| 상태 | 상태 저장 (Stateful) | 상태 비저장 (Stateless) |
| 규칙 유형 | 허용만 가능 | 허용/거부 모두 가능 |
| 규칙 처리 | 모든 규칙 평가 | 번호 순서대로 처리 |

### 2. 키 페어 (Key Pair)

키 페어는 EC2 인스턴스에 안전하게 접속하기 위한 암호화 키 쌍입니다.

**키 페어 구성:**
- **공개 키(Public Key)**: AWS에 저장, 인스턴스의 authorized_keys에 등록
- **개인 키(Private Key)**: 사용자가 보관 (.pem 또는 .ppk 파일)

**접속 방법:**
```bash
# Linux/macOS: SSH 접속
ssh -i "my-key-pair.pem" ec2-user@<public-ip>

# 키 파일 권한 설정 (필수)
chmod 400 my-key-pair.pem

# Windows: PuTTY 사용 시 .ppk로 변환 필요
```

**운영체제별 기본 사용자:**
- Amazon Linux: `ec2-user`
- Ubuntu: `ubuntu`
- CentOS: `centos`
- Windows: `Administrator` (RDP로 접속)

### 3. EC2 사용자 데이터 (User Data)

인스턴스 최초 시작 시 자동으로 실행되는 스크립트입니다.

**특징:**
- 루트 권한으로 실행
- 최초 부팅 시 **1회만** 실행 (기본값)
- 최대 16KB 크기
- Base64로 인코딩되어 전달

**사용 예시:**
```bash
#!/bin/bash
# 시스템 업데이트
yum update -y

# Apache 웹 서버 설치 및 시작
yum install -y httpd
systemctl start httpd
systemctl enable httpd

# 웹 페이지 생성
echo "<h1>Hello from EC2!</h1>" > /var/www/html/index.html
echo "<p>Instance ID: $(curl -s http://169.254.169.254/latest/meta-data/instance-id)</p>" >> /var/www/html/index.html
```

---

## 🧠 알아두면 좋은 심화 이론

### VPC 네트워크 구조 (EC2의 배경 지식 - 시험 빈출)

```
VPC (10.0.0.0/16)
├── Public Subnet  (10.0.1.0/24) — Internet Gateway 연결
│     └── EC2 (퍼블릭 IP) + ALB
├── Private Subnet (10.0.2.0/24) — NAT Gateway로 외부 통신
│     └── EC2 (앱 서버), RDS
└── Database Subnet (10.0.3.0/24) — 외부 차단
```

| 구성 요소 | 역할 |
|----------|------|
| **Internet Gateway** | 퍼블릭 서브넷 ↔ 인터넷 |
| **NAT Gateway** | 프라이빗 서브넷 → 인터넷 (단방향) |
| **Route Table** | 서브넷의 트래픽 경로 결정 |
| **VPC Endpoint** | NAT 없이 AWS 서비스 접근 (S3·DynamoDB Gateway, 나머지 Interface) |

### 퍼블릭 IP vs Elastic IP (시험 함정)

| 항목 | 퍼블릭 IP | Elastic IP (EIP) |
|------|----------|------------------|
| 부여 시점 | 인스턴스 시작 시 자동 | 명시적 할당 |
| 지속성 | 중지 시 변경 | 고정 |
| 비용 | 무료 | 인스턴스 미연결 시 과금 (2024년부터 연결돼도 시간당 과금) |
| 한도 | - | 리전당 5개 (Soft limit) |

> ⚠️ **함정**: "EIP를 할당받았는데 인스턴스에 안 붙이면 무료" → 틀림. 미사용 EIP는 과금. 또한 2024년 2월부터 **모든 IPv4 퍼블릭 IP에 시간당 과금**.

### 배치 그룹 (Placement Group) - 3가지 유형

| 유형 | 배치 | 사용 사례 |
|------|------|-----------|
| **Cluster** | 동일 AZ, 저지연·고대역 | HPC, 빅데이터 |
| **Spread** | AZ 내 별도 하드웨어 분산 | 중요 시스템 고가용성 (AZ당 7개 한계) |
| **Partition** | 여러 파티션으로 분리 | 분산 워크로드 (Hadoop, Cassandra) |

### IMDS hop limit (보안 시나리오 시험 출제)

```bash
# 컨테이너에서 호스트 IMDS 접근 차단 (hop limit = 1)
aws ec2 modify-instance-metadata-options \
  --instance-id i-xxx \
  --http-put-response-hop-limit 1 \
  --http-tokens required
```

- `http-tokens required` → IMDSv2 강제
- `hop-limit 1` → 컨테이너(Docker NAT)에서 IMDS 우회 차단
- 보안팀이 SCP로 강제하는 경우 많음

### 보안 그룹 추가 디테일

- 최대 60개 인바운드 규칙 / 60개 아웃바운드 규칙
- 인스턴스 하나에 최대 5개 SG 부착
- **변경 즉시 적용** (기존 연결까지 즉시 영향)
- 한 SG가 자기 자신을 참조 가능 (`sg-xxx ← sg-xxx`) — 클러스터 내부 통신 패턴

### NAT Gateway vs NAT Instance (시험에 자주 출제)

| 항목 | NAT Gateway | NAT Instance |
|------|-------------|--------------|
| 관리 | AWS 관리 | 고객 관리 (EC2 인스턴스) |
| 대역폭 | 최대 45 Gbps (자동) | 인스턴스 타입에 따라 |
| 가용성 | AZ 내 고가용 | 단일 EC2 (직접 HA 구성 필요) |
| 권장 | ✅ 현재 표준 | 거의 안 씀 |

### 실무 사례 - 3-Tier 보안 그룹 구성

```
[ALB-SG]    Inbound: 443/0.0.0.0/0
              Outbound: → App-SG
[App-SG]    Inbound: 8080/ALB-SG
              Outbound: → DB-SG
[DB-SG]     Inbound: 3306/App-SG
              Outbound: (Deny all)
```

> 💡 보안 그룹 체이닝(다른 SG 참조)으로 IP 관리 없이 계층 분리.

### User Data 추가 시나리오

- **재실행 강제**: `mime-multipart` 헤더로 매 부팅 시 실행 가능 → `cloud-config: scripts_per_boot`
- **CloudFormation cfn-init**: User Data보다 강력한 초기화 (메타데이터 기반)
- 로그: `/var/log/cloud-init-output.log`에서 실행 결과 확인

### 관련 서비스 Cross-Reference

- **SG ↔ NACL** → VPC 보안 양대축
- **키 페어 ↔ EC2 Instance Connect / Session Manager** → SSH 키 없이 접속
- **User Data ↔ AWS Systems Manager State Manager** → 지속적 설정 관리
- **IAM 역할 ↔ EC2 인스턴스 프로파일** → [Week 1 Day 4]에서 다룸

---

## 아키텍처 다이어그램

```
EC2 보안 그룹 구조
================================

인터넷
  |
  v
[보안 그룹 - WebServer-SG]
  인바운드 규칙:
  - HTTP (80)  : 0.0.0.0/0 허용
  - HTTPS (443): 0.0.0.0/0 허용
  - SSH (22)   : 203.0.113.0/24 허용 (관리자 IP만)
  아웃바운드:
  - 모든 트래픽: 0.0.0.0/0 허용
  |
  v
[EC2 인스턴스 - 웹 서버]
  |
  v
[보안 그룹 - DB-SG]
  인바운드 규칙:
  - MySQL(3306): WebServer-SG만 허용
  아웃바운드:
  - 모든 트래픽: 0.0.0.0/0 허용
  |
  v
[RDS 데이터베이스]
  (다른 보안 그룹 참조로 세밀한 제어)


SSH 키 페어 인증 과정
================================

[사용자 로컬]          [EC2 인스턴스]
개인 키 (.pem)          공개 키 (authorized_keys)
     |                        |
     +------ SSH 연결 시도 -->+
     |                        |
     |<-- 챌린지(Challenge) --+
     |                        |
     +-- 개인 키로 서명 ----->+
     |                        |
     |<--- 인증 성공 ----------+
     |                        |
[SSH 세션 시작]


EC2 초기화 흐름 (User Data)
================================

인스턴스 시작
    |
    v
부팅 프로세스
    |
    v
Cloud-init 실행
    |
    v
User Data 스크립트 실행 (루트 권한)
    |
    v
서비스 시작 / 소프트웨어 설치
    |
    v
인스턴스 준비 완료
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **보안 그룹은 Stateful**: 인바운드 허용 시 응답 자동 허용, Deny 규칙 없음
2. ⭐ **NACL은 Stateless**: 인바운드/아웃바운드 모두 명시적 규칙 필요
3. ⭐ **보안 그룹 체이닝**: 다른 보안 그룹을 소스로 참조 가능 (IP 관리 불필요)
4. ⭐ **키 페어 분실**: 개인 키를 잃어버리면 복구 불가, 새 키로 교체 필요
5. ⭐ **User Data**: 최초 1회만 실행, 루트 권한, 최대 16KB

---

## 💻 실제 예시

```bash
# 보안 그룹 생성
aws ec2 create-security-group \
  --group-name WebServerSG \
  --description "Security group for web servers" \
  --vpc-id vpc-12345678

# 인바운드 HTTP 규칙 추가
aws ec2 authorize-security-group-ingress \
  --group-id sg-12345678 \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# 인바운드 SSH 규칙 추가 (특정 IP만)
aws ec2 authorize-security-group-ingress \
  --group-id sg-12345678 \
  --protocol tcp \
  --port 22 \
  --cidr 203.0.113.0/32

# 키 페어 생성
aws ec2 create-key-pair \
  --key-name my-key-pair \
  --query 'KeyMaterial' \
  --output text > my-key-pair.pem

chmod 400 my-key-pair.pem

# User Data와 함께 인스턴스 시작
aws ec2 run-instances \
  --image-id ami-0c9c942bd7bf113a2 \
  --instance-type t3.micro \
  --key-name my-key-pair \
  --security-group-ids sg-12345678 \
  --user-data file://userdata.sh

# userdata.sh 내용:
cat << 'EOF' > userdata.sh
#!/bin/bash
yum update -y
yum install -y httpd
systemctl start httpd
systemctl enable httpd
echo "<h1>Hello AWS Developer!</h1>" > /var/www/html/index.html
EOF
```

---

## 📝 연습 문제

**문제 1.** 보안 그룹에 대한 올바른 설명은?

A) 서브넷 수준에서 적용된다  
B) 허용(Allow)과 거부(Deny) 규칙을 모두 가질 수 있다  
C) 상태 저장(Stateful)으로 인바운드 허용 시 응답이 자동 허용된다  
D) 각 인스턴스에는 하나의 보안 그룹만 연결할 수 있다  

**정답: C**  
해설: 보안 그룹은 상태 저장(Stateful) 방식으로 동작하여 인바운드 트래픽이 허용되면 해당 응답 트래픽은 자동으로 허용됩니다. NACL이 서브넷 수준에 적용됩니다.

---

**문제 2.** EC2 인스턴스의 SSH 접속을 위한 키 페어에서 AWS가 보관하는 것은?

A) 개인 키(.pem 파일)  
B) 공개 키  
C) 대칭 암호화 키  
D) 세션 토큰  

**정답: B**  
해설: AWS는 공개 키를 보관하고, 사용자는 개인 키(.pem 파일)를 보관합니다. 개인 키는 AWS에 저장되지 않으므로 분실 시 복구가 불가합니다.

---

**문제 3.** EC2 사용자 데이터(User Data)에 대한 올바른 설명은?

A) 인스턴스 재시작 시마다 실행된다  
B) 일반 사용자 권한으로 실행된다  
C) 최대 1MB까지 지원된다  
D) 인스턴스 최초 시작 시 한 번만 실행된다  

**정답: D**  
해설: User Data는 기본적으로 인스턴스 최초 시작 시 1회만 실행되며, 루트 권한으로 실행됩니다. 크기는 최대 16KB입니다.

---

**문제 4.** 웹 서버 보안 그룹에서 허용해야 하는 인바운드 트래픽으로 올바른 것은?

A) 포트 22(SSH)를 0.0.0.0/0에서 허용  
B) 포트 80과 443을 0.0.0.0/0에서 허용  
C) 모든 트래픽을 모든 IP에서 허용  
D) 포트 3306(MySQL)을 0.0.0.0/0에서 허용  

**정답: B**  
해설: 공개 웹 서버는 HTTP(80)와 HTTPS(443)를 모든 IP에서 허용해야 합니다. SSH(22)는 관리자 IP에서만, MySQL(3306)은 애플리케이션 서버에서만 허용해야 합니다.

---

**문제 5.** EC2 인스턴스의 Ubuntu 기본 SSH 사용자명은?

A) root  
B) admin  
C) ec2-user  
D) ubuntu  

**정답: D**  
해설: Ubuntu AMI의 기본 SSH 사용자는 "ubuntu"입니다. Amazon Linux는 "ec2-user", CentOS는 "centos"를 사용합니다.

---

## 📌 오늘의 요약

1. 보안 그룹은 EC2의 가상 방화벽으로, Stateful 방식으로 허용 규칙만 지원한다
2. 보안 그룹 vs NACL: 인스턴스 레벨 vs 서브넷 레벨, Stateful vs Stateless
3. 키 페어: AWS는 공개 키 보관, 사용자는 개인 키(.pem) 보관 (분실 시 복구 불가)
4. User Data는 인스턴스 최초 시작 시 1회 실행되는 초기화 스크립트 (루트 권한, 최대 16KB)
5. 보안 그룹 체이닝으로 IP 대신 다른 보안 그룹을 소스로 참조하면 관리가 편리하다

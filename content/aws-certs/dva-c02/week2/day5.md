# Day 10 - Week 2 복습 + 연습문제

📅 날짜: 2026년 5월 28일 (목요일)  
🎯 주제: EC2 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EC2 관련 전체 내용을 정리하고 취약점을 파악한다
- 시험 형식의 EC2 문제를 풀어 실력을 점검한다

---

## 📖 Week 2 핵심 정리

### EC2 인스턴스 유형 암기
```
M = Most (범용)     → 웹서버, 앱서버
C = Compute (컴퓨팅) → 게임서버, 과학계산
R = RAM (메모리)     → 대용량 DB, 캐시
I = I/O (스토리지)   → NoSQL DB, 데이터웨어하우스
G = GPU (가속)       → ML/AI, 그래픽 렌더링
T = Turbo (버스트)   → 개발/테스트 환경
```

### EC2 구매 옵션 요약
```
온디맨드   : 유연, 비쌈         → 단기/불규칙 워크로드
예약       : 72% 절감           → 안정적/예측 가능
절약 플랜  : 72% 절감, 더 유연  → 다양한 인스턴스 유형
스팟       : 90% 절감, 회수 가능 → 배치처리, 내결함성
전용 호스트: 물리 서버 전용     → 라이선스, 규정 준수
```

### 보안 그룹 vs NACL
```
보안 그룹:  인스턴스 수준, Stateful,  허용만,  모든 규칙 평가
NACL:       서브넷 수준,  Stateless, 허용+거부, 번호 순서 처리
```

### EBS 볼륨 유형 요약
```
gp3: 범용 SSD, 독립 IOPS 설정, 권장
gp2: 범용 SSD, IOPS=크기×3
io2: 고성능 SSD, 64,000 IOPS, 99.999% 내구성
st1: HDD, 처리량 최적화, 부팅 불가
sc1: HDD, 저비용, 부팅 불가
인스턴스 스토어: 임시, 가장 빠름, 중지/종료 시 소멸
```

### 로드 밸런서 비교
```
ALB: 7계층, URL/호스트 라우팅, Lambda, 마이크로서비스
NLB: 4계층, 초고성능, 고정 IP, 게임/금융
CLB: 구형, 레거시, 마이그레이션 권장
```

---

## 🧠 Week 2 시험 함정 & 약어

### Week 2 헷갈리기 쉬운 비교

| A | B | 핵심 |
|---|---|------|
| 인스턴스 스토어 | EBS | 임시 vs 영구, 호스트 종속 vs 네트워크 |
| Stop | Terminate | EBS 보존 vs 삭제(기본) |
| Stop | Hibernate | RAM 소멸 vs RAM 보존(EBS) |
| Reboot | Stop+Start | 호스트 유지 vs 새 호스트 |
| 전용 호스트 | 전용 인스턴스 | 물리 서버 통째 vs 격리만 |
| Standard RI | Convertible RI | 패밀리 고정 vs 교환 가능 |
| Compute Savings Plan | EC2 Instance Savings Plan | 전 서비스 vs 특정 패밀리 |
| 퍼블릭 IP | Elastic IP | 휘발성 vs 고정·과금 |
| 보안 그룹 | NACL | 인스턴스·Stateful vs 서브넷·Stateless |
| ALB | NLB | 7계층·HTTP vs 4계층·TCP/UDP |
| Cluster PG | Spread PG | 저지연 모음 vs HW 분산 |
| Target Tracking | Step Scaling | 단일 목표값 vs 임계값별 |
| EBS gp3 | io2 | 기본 IOPS 3000 vs 최대 64000 |
| Cross-Zone (ALB) | Cross-Zone (NLB) | 기본 ON vs 기본 OFF |
| Sticky (ALB) | Sticky (NLB) | 쿠키 기반 vs Source IP |

### Week 2 시험 함정 12가지

1. **HDD(st1/sc1)는 부팅 볼륨 불가**
2. **EBS는 AZ 종속** — 다른 AZ로 가려면 스냅샷 경유
3. **AMI는 리전 종속** — 다른 리전 가려면 복사
4. **인스턴스 스토어는 Reboot은 유지, Stop/Terminate는 소멸**
5. **Hibernate는 루트 EBS 암호화 필수 + 인스턴스 타입 제한**
6. **User Data는 최초 1회만, 16KB 제한, 루트 권한**
7. **SG는 Stateful, NACL은 Stateless** (NACL은 응답 포트도 명시 필요)
8. **SG는 Deny 규칙 없음, NACL만 Deny 가능**
9. **SG는 인스턴스 수준, NACL은 서브넷 수준**
10. **2분 전 스팟 회수 알림**: IMDS + EventBridge
11. **NLB만 EIP 지원** (ALB는 DNS만)
12. **ALB Cross-Zone 기본 ON·무료**, NLB는 기본 OFF·유료

### Week 2 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **EC2** | Elastic Compute Cloud |
| **AMI** | Amazon Machine Image |
| **EBS** | Elastic Block Store |
| **EFS** | Elastic File System |
| **FSx** | (제품군 - Lustre/Windows/ONTAP/OpenZFS) |
| **EIP** | Elastic IP |
| **ELB** | Elastic Load Balancing |
| **ALB / NLB / CLB / GWLB** | Application/Network/Classic/Gateway LB |
| **ASG** | Auto Scaling Group |
| **RI** | Reserved Instance |
| **SP** | Savings Plan |
| **PG** | Placement Group |
| **NACL** | Network ACL |
| **DLM** | Data Lifecycle Manager |
| **FSR** | Fast Snapshot Restore |
| **SNI** | Server Name Indication |
| **TLS** | Transport Layer Security |
| **ACM** | AWS Certificate Manager |
| **VPC** | Virtual Private Cloud |
| **IGW** | Internet Gateway |
| **NAT** | Network Address Translation |
| **IOPS** | Input/Output Operations Per Second |

---

## 아키텍처 다이어그램 - Week 2 전체 통합

```
완전한 EC2 기반 웹 서비스 아키텍처
================================

인터넷
  |
  v
[Route 53]
  |
  v
[ALB - Application Load Balancer]
  | (HTTP/HTTPS, URL 라우팅)
  |
  +--/api/*---->[API Target Group]
  |
  +--/static/*->[S3 직접 서빙]
  |
  +--/----->[Web Target Group]

[Auto Scaling Group]
Min=2, Max=10, Desired=4

  +------------AZ-a-----------+  +----------AZ-b-----------+
  |                           |  |                          |
  | [EC2 t3.large]  #1        |  | [EC2 t3.large]  #3      |
  | - gp3 루트 볼륨 (30GB)    |  | - gp3 루트 볼륨 (30GB)  |
  | - io2 데이터 볼륨 (500GB) |  | - io2 데이터 볼륨       |
  | - 보안그룹: Web-SG        |  | - 보안그룹: Web-SG      |
  |   (80, 443: 0.0.0.0/0)   |  |                          |
  |   (22: 관리자 IP)          |  |                          |
  |                           |  |                          |
  | [EC2 t3.large]  #2        |  | [EC2 t3.large]  #4      |
  +---------------------------+  +--------------------------+
                |
                v
  [RDS MySQL - Multi-AZ]
  보안그룹: DB-SG (3306: Web-SG만)
  
  [ElastiCache - Redis]
  보안그룹: Cache-SG (6379: Web-SG만)

사용자 데이터로 초기화:
#!/bin/bash
yum update -y
yum install -y httpd
systemctl start httpd
systemctl enable httpd
```

---

## 📝 Week 2 종합 연습문제

**문제 1.** 메모리 집약적 인메모리 데이터베이스에 가장 적합한 인스턴스 유형은?

A) c5.2xlarge  
B) r5.4xlarge  
C) t3.2xlarge  
D) i3.2xlarge  

**정답: B** - r(RAM) 계열이 메모리 최적화 인스턴스입니다.

---

**문제 2.** 스팟 인스턴스 회수 2분 전에 받는 알림 방식은?

A) AWS SNS 알림  
B) EC2 인스턴스 메타데이터 + EventBridge  
C) CloudWatch 경보  
D) SES 이메일 알림  

**정답: B** - 스팟 중단 알림은 인스턴스 메타데이터(/latest/meta-data/spot/termination-notice)와 EC2 EventBridge 이벤트로 수신됩니다.

---

**문제 3.** 다음 중 EC2 인스턴스 스토어의 올바른 사용 사례는?

A) 데이터베이스 영구 스토리지  
B) 중요한 사용자 파일 저장  
C) 고성능 임시 캐시 데이터  
D) 장기 로그 아카이브  

**정답: C** - 인스턴스 스토어는 임시이므로 영구 보존이 필요없는 캐시, 버퍼, 스크래치 데이터에 적합합니다.

---

**문제 4.** ALB에서 특정 URL 경로를 다른 서버로 보내는 기능은?

A) 스티키 세션  
B) 경로 기반 라우팅  
C) 교차 영역 로드 밸런싱  
D) 느린 시작  

**정답: B** - ALB의 경로 기반 라우팅으로 /api/*, /auth/*, /static/* 등을 각각 다른 타겟 그룹으로 라우팅할 수 있습니다.

---

**문제 5.** Auto Scaling Group의 쿨다운 기간(Cooldown Period) 목적은?

A) 새 인스턴스의 소프트웨어 설치 시간 확보  
B) 이전 확장 활동의 효과가 나타날 시간을 주어 과도한 확장 방지  
C) ELB 헬스 체크 실행 대기  
D) CloudWatch 지표 업데이트 대기  

**정답: B** - 쿨다운 기간은 확장 활동 후 새로운 확장/축소 활동을 방지하여 이전 변경의 효과를 측정할 시간을 줍니다.

---

**문제 6.** EC2 인스턴스 구매 옵션 중 물리적 서버를 고객 전용으로 사용하는 옵션은?

A) 예약 인스턴스  
B) 전용 인스턴스  
C) 전용 호스트  
D) 스팟 인스턴스  

**정답: C** - 전용 호스트는 특정 물리적 서버 전체를 고객이 단독으로 사용합니다. 전용 인스턴스는 전용 하드웨어에서 실행되지만 물리 서버 수준의 가시성은 없습니다.

---

**문제 7.** EBS gp3 볼륨의 기본 IOPS는?

A) 100  
B) 3,000  
C) 6,000  
D) 16,000  

**정답: B** - gp3 볼륨의 기본 IOPS는 3,000이며 최대 16,000까지 독립적으로 설정 가능합니다.

---

**문제 8.** NLB에서 고정 IP 주소를 사용해야 하는 이유는?

A) DNS 이름을 기억하기 어려워서  
B) 방화벽 규칙에 IP를 등록하는 기업 환경 요구사항  
C) ALB보다 빠른 연결을 위해  
D) IPv6를 사용하기 위해  

**정답: B** - NLB는 Elastic IP를 지원하여 고정 IP 주소를 사용할 수 있습니다. 이는 방화벽 화이트리스트에 IP를 등록해야 하는 기업 환경에서 유용합니다.

---

**문제 9.** EC2 보안 그룹에서 다른 보안 그룹을 소스로 참조하는 이유는?

A) 더 많은 인스턴스에 규칙을 적용하기 위해  
B) IP 주소 관리 없이 다른 보안 그룹의 인스턴스만 허용하기 위해  
C) 규칙 수를 줄이기 위해  
D) 리전 간 트래픽을 허용하기 위해  

**정답: B** - 보안 그룹을 소스로 참조하면 IP 주소 변경과 관계없이 해당 보안 그룹에 속한 인스턴스의 트래픽만 허용할 수 있어 관리가 편리합니다.

---

**문제 10.** User Data에 대한 올바른 설명은?

A) 인스턴스 재시작마다 실행된다  
B) 비루트 권한으로 실행된다  
C) 인스턴스 초기 시작 시 1회 실행되며 루트 권한을 가진다  
D) 최대 1MB까지 스크립트를 실행할 수 있다  

**정답: C** - User Data는 인스턴스 최초 시작 시 1회만 실행되며, 루트 사용자 권한으로 실행됩니다. 크기 제한은 16KB입니다.

---

**문제 11.** EBS 스냅샷에 대한 올바른 설명은?

A) EBS 볼륨과 동일한 AZ에만 저장된다  
B) 증분식으로 S3에 저장된다  
C) 스냅샷 생성 중에는 볼륨 사용이 불가하다  
D) 스냅샷에서 다른 볼륨 유형의 볼륨을 생성할 수 없다  

**정답: B** - EBS 스냅샷은 Amazon S3에 증분식으로 저장됩니다. 스냅샷 생성 중에도 볼륨을 계속 사용할 수 있으며, 다른 볼륨 유형으로 복원도 가능합니다.

---

**문제 12.** ALB의 교차 영역 로드 밸런싱(Cross-Zone Load Balancing)에 대한 설명은?

A) ALB에서는 기본으로 활성화되어 추가 비용 없음  
B) 모든 AZ에 동일한 수의 인스턴스가 있어야 사용 가능  
C) NLB에서만 지원된다  
D) 비용이 매우 높아 사용을 권장하지 않는다  

**정답: A** - ALB에서는 교차 영역 로드 밸런싱이 기본으로 활성화되어 있으며 추가 비용이 없습니다. NLB에서는 비활성화가 기본값이며 활성화 시 비용이 발생합니다.

---

## 📊 Week 2 자기 평가

| 점수 | 평가 |
|------|------|
| 10-12 | 우수 - Week 3 진행 |
| 7-9 | 양호 - 틀린 문제 복습 후 진행 |
| 4-6 | 보통 - EC2 섹션 재학습 권장 |
| 0-3 | 미흡 - Week 2 처음부터 재학습 |

## 📌 오늘의 요약

1. EC2 인스턴스: M(범용), C(컴퓨팅), R(메모리), I(스토리지), G(GPU), T(버스트) 패밀리
2. EBS: gp3(권장, 독립 IOPS), io2(고성능), st1/sc1(HDD, 부팅 불가)
3. 인스턴스 스토어: 가장 빠른 임시 스토리지, 중지/종료 시 소멸
4. ALB(7계층): URL/호스트 라우팅, NLB(4계층): 고성능, 고정 IP
5. ASG + ALB: 자동 확장, 비정상 인스턴스 교체로 고가용성 달성

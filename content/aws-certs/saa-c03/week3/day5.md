# Day 15 - Week 3 복습 + 시나리오 문제 10

📅 날짜: Week 3 (Day 5)
🎯 주제: EC2 + ELB + ASG 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 컴퓨팅·스토리지·로드밸런싱·스케일링을 통합 시나리오로 이해한다
- 시험 빈출 함정 5개를 외운다

---

## 🧩 사전 지식 (CS 기초)

- **탄력성(Elasticity) vs 확장성(Scalability)**: 즉시 늘었다 줄었다(Elasticity), 끝없이 커질 수 있음(Scalability).
- **3-Tier 아키텍처**: Web(ALB) → App(EC2/ECS) → DB(RDS). SAA의 기본 그림.

---

## 📖 한 주 핵심 정리

1. **인스턴스 패밀리**: C/M/R/I/G/T.
2. **구매 옵션**: On-Demand → SP Compute → SP EC2 / RI → Spot.
3. **블록(EBS) / 인스턴스 스토어(휘발성) / 파일(EFS/FSx)**.
4. **ALB=L7 / NLB=L4 / GLB=L3**.
5. **ASG = Launch Template + Min/Max/Desired + Multi-AZ + Target Tracking**.
6. **Lifecycle Hook + Warm Pool + Mixed Instances**가 운영 고도화.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **gp3 vs gp2** | 신상, 저렴, 빠름 | 구버전 |
| **EFS vs FSx** | Linux NFS | Windows/HPC/Multi-protocol |
| **ALB vs NLB** | HTTP L7 | TCP/UDP L4 고정 IP |
| **Cross-Zone ALB vs NLB** | 기본 ON 무료 | 기본 OFF |
| **Target Tracking vs Step** | 단순·권장 | 세밀 제어 |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 표준 SAA 3-Tier ]

  Internet
    ↓
  Route 53
    ↓
  CloudFront (옵션)
    ↓
  ALB (Multi-AZ, WAF, ACM)
    ↓
  ASG: EC2 (Mixed Instances + Spot, Multi-AZ)
    ↓
  RDS Multi-AZ + Read Replica
  EFS / S3

  운영:
   - SSM Session Manager 접속
   - CloudWatch / Flow Logs
   - Lifecycle Hooks
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** 인메모리 캐시(대용량 RAM):

A) C 패밀리 B) R 패밀리 C) I 패밀리 D) T 패밀리

**정답: B**.

---

**문제 2.** 야간 배치(중단 OK), 최대 절감:

A) Spot B) RI 3y C) On-Demand D) Dedicated

**정답: A**.

---

**문제 3.** 컨테이너에서 동적 포트 사용 → ELB는?

A) CLB B) ALB C) NLB D) GLB

**정답: B**.

---

**문제 4.** 게임 서버 UDP + 고정 IP:

A) ALB B) NLB C) GLB D) CloudFront

**정답: B**.

---

**문제 5.** ASG 새 AMI로 점진 교체:

A) Instance Refresh B) Lifecycle Hook C) Suspended Process D) ELB Drain

**정답: A**.

---

**문제 6.** ASG의 비정상 인스턴스를 ALB 헬스 체크 기반으로 교체:

A) EC2 헬스 체크만 B) ELB 헬스 체크 활성 C) Custom만 D) CloudWatch Alarm

**정답: B**.

---

**문제 7.** Windows 파일 공유 + AD:

A) EFS B) FSx Windows C) FSx Lustre D) S3

**정답: B**.

---

**문제 8.** ML 학습 데이터셋 + S3 연동 + 초고속 병렬:

A) EFS Max I/O B) FSx Lustre C) FSx ONTAP D) gp3 EBS

**정답: B**.

---

**문제 9.** EBS 볼륨을 다른 AZ에 옮기려면?

A) detach & attach B) 스냅샷 → 복원 (다른 AZ) C) 자동 마이그레이션 D) DataSync

**정답: B**.

---

**문제 10.** TCP 화이트리스트 + 고객사가 ALB 사용 중. 고정 IP 요구. 정답?

A) ALB의 EIP B) NLB로 변경 (각 AZ EIP) C) NAT Gateway IP D) CloudFront

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. SAA의 "복원력·고성능" 도메인 핵심은 ELB + ASG + 적절한 스토리지 선택.
2. 다음 주는 **S3 + CloudFront + 스토리지 게이트웨이** — 데이터/콘텐츠 계층의 모든 것.

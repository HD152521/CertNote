# Day 5 - Week 10 복습 + 시나리오 10문제

📅 날짜: Week 10 (Day 5)
🎯 주제: 백업·DR·고가용성 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 10 핵심 개념 한 줄 요약

1. **EBS Snapshot = Incremental**. AMI 삭제 ≠ Snapshot 자동 삭제
2. **DLM = EBS/AMI 자동 백업·정리** (태그 기반)
3. **AWS Backup = 다수 서비스 통합 + 컴플라이언스**. Vault Lock(Compliance)는 영구 변경 불가
4. **Multi-AZ = HA (동기 복제)**, **Read Replica = 읽기 확장 (비동기)**
5. **Cross-Region DR = Cross-Region Read Replica 또는 Aurora Global DB**
6. **PITR (RDS/Aurora/DDB/S3)** = 임의 시점 복원
7. **S3 Replication: Versioning 필수**, CRR(리전)/SRR(같은 리전)/RTC(15분 SLA)
8. **Storage Gateway 3종**: File(NFS/SMB)/Volume(iSCSI)/Tape(VTL)
9. **AWS DRS = 워크로드 페일오버** (CDP). 평소 비용 ↓
10. **자동 대응 = 보안 도구 → EventBridge → SSM Automation/Lambda**

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | DLM | AWS Backup |
|------|-----|------------|
| 지원 | EBS/AMI만 | 다수 서비스 |
| 컴플라이언스 | X | Audit Manager |
| Cross-Account | 제한적 | 완전 지원 |
| 비용 | 무료 | 관리 비용 + Storage |

| 항목 | Multi-AZ | Read Replica |
|------|----------|--------------|
| 목적 | HA | 읽기 확장 |
| 복제 | 동기 | 비동기 |
| 읽기 가능 | X (Standby 접근 X) | O |
| Cross-Region | X | O |
| 페일오버 | 자동 | 수동 promote |

| 항목 | S3 CRR | DRS | DataSync |
|------|--------|-----|----------|
| 대상 | S3 객체 | 워크로드(EC2) | 파일/오브젝트 |
| 동작 | 비동기 복제 | CDP | 1회/정기 전송 |
| RPO | 분 단위 | 초 단위 | 작업 단위 |

---

## 📝 시나리오 10문제

**문제 1.** AMI를 삭제했는데 비용이 줄지 않는다. 원인은?

A) AWS 청구 지연
B) 연관 EBS Snapshot은 자동 삭제 X — 수동 또는 DLM 정책으로 정리 필요
C) Backup
D) IAM 권한

**정답: B**
해설: 시험 빈출 함정. AMI deregister ≠ Snapshot 자동 삭제. 별도 정리 필요.

---

**문제 2.** 회사가 RDS/EBS/DynamoDB/EFS를 한 정책으로 통합 백업 + 컴플라이언스 보고하려 한다. 어떤 도구?

A) DLM
B) AWS Backup + Backup Audit Manager
C) Lambda
D) Snapshot 수동

**정답: B**
해설: DLM은 EBS/AMI만. AWS Backup이 다수 서비스 + 컴플라이언스 자동화.

---

**문제 3.** Ransomware로 운영 계정 백업까지 삭제되는 시나리오를 막으려면?

A) IAM
B) Cross-Account Backup + Central Vault에 Vault Lock(Compliance 모드)
C) S3
D) MFA

**정답: B**
해설: Compliance Vault Lock + Cross-Account로 별도 계정 격리. 사용자도 해제 불가.

---

**문제 4.** "단일 AZ 장애에서 자동 복구"가 목적. 어떤 RDS 기능?

A) Read Replica
B) Multi-AZ
C) Snapshot
D) PITR

**정답: B**
해설: Multi-AZ가 정확히 HA용. 1~2분 자동 페일오버.

---

**문제 5.** 운영 중 DB 읽기 부하 폭증. 비용 효율적 해결?

A) DB 크기 ↑
B) Read Replica 추가
C) Multi-AZ
D) Snapshot

**정답: B**
해설: Read Replica가 정확한 도구. 별도 endpoint로 읽기 분산. Multi-AZ는 읽기 분산 X.

---

**문제 6.** 글로벌 사용자에게 빠른 읽기 + 리전 단위 DR이 필요하다. 어떤 도구?

A) Multi-AZ
B) Aurora Global Database (최대 5 Secondary, RPO < 1초)
C) Read Replica만
D) DynamoDB

**정답: B**
해설: Aurora Global Database가 정확한 사용 사례.

---

**문제 7.** S3 데이터를 다른 리전 DR에 자동 복제하려 한다. 필요한 것은?

A) DataSync 주기 실행
B) CRR + 양쪽 Versioning 활성화 + IAM Role
C) Storage Gateway
D) Manual

**정답: B**
해설: S3 CRR이 표준. Versioning은 양쪽 필수.

---

**문제 8.** 회사가 데이터센터를 AWS로 DR로 페일오버 가능하게 하면서 평소 비용 최소화하려 한다. 어떤 도구?

A) S3 Replication
B) AWS Elastic Disaster Recovery (DRS) - Staging 작게, 페일오버 시 큰 인스턴스
C) Storage Gateway
D) DataSync

**정답: B**
해설: DRS의 정확한 사용 사례. CDP + 비용 효율.

---

**문제 9.** S3 객체에 5년간 변경·삭제 불가를 강제하려면?

A) IAM
B) S3 Object Lock Compliance Mode + 5년 retention
C) Replication
D) Versioning만

**정답: B**
해설: Object Lock Compliance 모드는 영구 불가. Ransomware/내부자 방어.

---

**문제 10.** 큰 EBS Snapshot에서 새 볼륨 만들었는데 첫 IO가 느리다. 해결?

A) Snapshot 다시
B) Fast Snapshot Restore (FSR) - 백그라운드 미리 hydrate
C) 무시
D) 인스턴스 ↑

**정답: B**
해설: FSR이 정확한 도구. 일반 Snapshot은 lazy load. FSR로 즉시 최대 IO. 단, 비용 ↑.

---

## 🔮 다음 주 예고 (Week 11)

Week 11은 **성능·비용 최적화** — Compute Optimizer, Trusted Advisor, Cost Explorer, Savings Plans.

- Day 1: Compute Optimizer, Right Sizing, EC2 인스턴스 패밀리
- Day 2: Trusted Advisor 5개 체크 카테고리
- Day 3: Cost Explorer, AWS Budgets, Cost Allocation Tag
- Day 4: Savings Plans, Reserved Instances, Spot 운영
- Day 5: Week 11 복습 + 시나리오 10문제

> 💡 비용·성능 최적화(12%) — 운영자의 일상 업무.

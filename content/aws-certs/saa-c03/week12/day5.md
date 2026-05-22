# Day 60 - 최종 모의고사 + 시험 D-Day 체크리스트

📅 날짜: Week 12 (Day 5)
🎯 주제: 시험 직전 점검과 모의고사
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 65문항 시험 시간 관리 전략을 익힌다
- 시험 직전 체크리스트로 자신감을 올린다
- 종합 모의고사 15문항으로 마무리 점검한다

---

## 🧩 사전 지식 (CS 기초)

- **시험 전략**: 130분 / 65문 = 약 2분/문항. 길고 복잡한 문제는 표시 후 넘기고 재방문.

---

## 📖 시험 D-Day 체크리스트

### 시험 전날

- [ ] 신분증 2개 준비 (영문 1개 포함, OnVUE 원격 시).
- [ ] OnVUE 환경 점검 (웹캠·마이크·인터넷·방해 차단).
- [ ] 충분한 수면.
- [ ] 시험 시작 30분 전 체크인.

### 시험 중 전략

1. **2분 룰**: 한 문제 2분 초과면 표시 후 넘김.
2. **키워드 매칭**: "초저지연" "고정 IP" 같은 신호어로 정답 후보 축소.
3. **두 번 부정 보기 제거**: 명백히 틀린 보기 제거 → 50:50.
4. **공동 책임·기본값 함정** 의심.
5. 답 바꾸지 말 것 (확실한 정보 없을 때).

### 시간 분배

- 1차 65문 = 1시간 30분.
- 2차 표시 문제 = 30분.
- 마지막 점검 = 10분.

---

## 📌 핵심 영역 마지막 정리 7

1. **공동 책임**: managed 서비스일수록 AWS 책임 ↑.
2. **VPC**: SG/NACL·NAT·Endpoint·TGW.
3. **데이터**: S3 클래스·Aurora vs DDB·DAX/Redis.
4. **서버리스/컨테이너**: Lambda·HTTP API·Fargate.
5. **메시징**: SQS/SNS/EventBridge/Kinesis.
6. **보안**: IAM·KMS·Secrets·Cognito·WAF·GuardDuty.
7. **복원력·DR**: Multi-AZ·Multi-Region·DR 4단계·Route 53.

---

## 📝 최종 모의고사 15문항

**문제 1.** EC2 → S3 접근 권장:

A) Access Key B) IAM Role / Instance Profile C) Bucket public D) NAT

**정답: B**.

---

**문제 2.** SQL 주입 차단:

A) Shield B) WAF C) NACL D) GuardDuty

**정답: B**.

---

**문제 3.** 글로벌 NoSQL 액티브-액티브:

A) Aurora Global B) DDB Global Tables C) DocumentDB D) MemoryDB

**정답: B**.

---

**문제 4.** μs DDB 응답:

A) ElastiCache B) DAX C) MemoryDB D) Aurora

**정답: B**.

---

**문제 5.** 글로벌 게임 UDP 가속:

A) CloudFront B) Global Accelerator C) Route 53 Latency D) NAT

**정답: B**.

---

**문제 6.** 자동 비밀 회전:

A) Parameter Store B) Secrets Manager C) KMS D) IAM DB

**정답: B**.

---

**문제 7.** 패턴 모름 S3:

A) Standard B) Intelligent-Tiering C) IA D) Glacier

**정답: B**.

---

**문제 8.** S3 가시화·BPA·KMS·OAC 표준 노출:

A) S3 정적 호스팅 public B) CloudFront + OAC C) ALB + EC2 D) Lambda URL

**정답: B**.

---

**문제 9.** 24/7 EC2 자유 패밀리 할인:

A) RI Standard B) Compute SP C) Spot D) Convertible

**정답: B**.

---

**문제 10.** RDS 비밀 자동 회전:

A) Parameter Store B) Secrets Manager C) KMS D) IAM DB Auth

**정답: B**.

---

**문제 11.** 다중 컨슈머 재생 클릭스트림:

A) SQS B) Kinesis Data Streams C) SNS D) EventBridge

**정답: B**.

---

**문제 12.** Lambda 콜드 스타트 제거:

A) Reserved Concurrency B) Provisioned Concurrency C) Memory ↑ D) ARM

**정답: B**.

---

**문제 13.** "RTO ~0 / RPO ~0":

A) Backup-Restore B) Pilot Light C) Warm Standby D) Active-Active

**정답: D**.

---

**문제 14.** 50개 VPC + 온프레 라우팅 허브:

A) Peering B) Transit Gateway C) VPN only D) IGW

**정답: B**.

---

**문제 15.** EKS Pod IAM:

A) Instance Profile B) IRSA C) Task Role D) KMS Grant

**정답: B**.

---

## 📌 시험 직전 메시지

- 시나리오 키워드 → 서비스 매핑이 SAA의 핵심.
- 어려운 문제는 표시하고 넘기기.
- 마지막에 확신 없는 답은 바꾸지 않기.
- "보안 → IAM/KMS/WAF" "복원력 → Multi-AZ + DR" "고성능 → CDN/Cache/Right service" "비용 → SP/Spot/IT" 4축으로 시야를 잡으면 80% 풀린다.

**Fighting!! 합격을 응원합니다.**

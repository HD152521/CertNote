# Day 20 - Week 4 복습 + 시나리오 10문항

📅 날짜: Week 4 (Day 5)
🎯 주제: 하이브리드 클라우드 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Outposts·Local Zones·Wavelength·Storage Gateway·Snow·Anywhere를 시나리오로 구분
- 데이터 주권·지연·연결성 요구를 정확히 매핑

---

## 📖 Week 4 핵심 7개

1. Outposts = 데이터센터 AWS 랙
2. Local Zones = 대도시 1ms / Wavelength = 5G 엣지
3. Storage Gateway 4종: S3 File · FSx File · Volume · Tape
4. DataSync = 회선 있음 정기, Snow = 회선 부족·PB·격리
5. EKS Anywhere = 자체 K8s·air-gap / ECS Anywhere = AWS CP + 온프레 노드
6. EKS on Outposts = AWS Managed + 데이터센터
7. EKS Connector로 외부 K8s 콘솔 가시화

---

## 🔄 비교표

| A | B | 차이 |
|---|---|------|
| **Outposts** vs **Local Zones** | 고객 DC vs AWS 대도시 | 데이터 주권 |
| **Local Zones** vs **Wavelength** | 일반 인터넷 vs 5G | 디바이스 종류 |
| **S3 File** vs **FSx File** | NFS/SMB·S3 vs SMB·FSx Win | AD/ACL = FSx |
| **Volume** vs **Tape** | 블록 iSCSI vs VTL | 백업 SW = Tape |
| **DataSync** vs **Snow** | 회선 정기 vs 물리 PB | 격리=Snow |
| **EKS Anywhere** vs **ECS Anywhere** | 자체 CP·air-gap vs AWS CP·연결 필요 | 운영 모델 |

---

## 📝 시나리오 10문항

---

**문제 1.** 의료 영상 데이터 반출 금지 + AWS 서비스. Best?

A) Local Zones
B) Outposts
C) Wavelength
D) Snow

**정답: B**
해설: 데이터 주권 = Outposts.

---

**문제 2.** LA 게임 사용자에게 1ms 지연. Best?

A) Outposts
B) Local Zones
C) Wavelength
D) CloudFront

**정답: B**
해설: 대도시 = Local Zones.

---

**문제 3.** 5G 자율주행 디바이스. Best?

A) CloudFront
B) Wavelength
C) Local Zones
D) Outposts

**정답: B**
해설: 5G 엣지 = Wavelength.

---

**문제 4.** 100TB 일회성, 회선 100Mbps. Best?

A) DataSync
B) Snowball Edge ×2
C) Storage Gateway
D) Direct Connect 회선

**정답: B**
해설: 회선 협소 + 대량 = Snow.

---

**문제 5.** Windows AD 파일 공유 클라우드 백업·캐시. Best?

A) S3 File Gateway
B) FSx File Gateway
C) Volume Gateway
D) Tape Gateway

**정답: B**
해설: AD/ACL = FSx File Gateway.

---

**문제 6.** 기존 NetBackup + S3/Glacier 백엔드. Best?

A) Tape Gateway
B) S3 File Gateway
C) DataSync
D) Snow

**정답: A**
해설: 기존 백업 SW + 테이프 인터페이스 = Tape Gateway.

---

**문제 7.** 격리된 군용 환경, 자체 K8s 운영. Best?

A) ECS Anywhere
B) EKS Anywhere
C) EKS on Outposts
D) Fargate

**정답: B**
해설: Air-gap + 자체 K8s = EKS Anywhere.

---

**문제 8.** 회사 ECS 클러스터에 일부 온프레 노드 추가. Best?

A) EKS Anywhere
B) ECS Anywhere
C) Outposts
D) Direct Connect만

**정답: B**
해설: ECS Anywhere가 외부 노드 등록.

---

**문제 9.** 1TB씩 매주 S3 동기화 + 자동 검증 + 회선 있음. Best?

A) Snow
B) DataSync 스케줄
C) Storage Gateway 상시
D) Tape Gateway

**정답: B**
해설: 정기 + 검증 = DataSync.

---

**문제 10.** Outposts에 항상 필요한 것은?

A) Direct Connect
B) AWS 리전과 Service Link 연결
C) Internet Gateway
D) Public IP

**정답: B**
해설: Outposts는 Disconnect 모드 X. Service Link 필수.

---

## 📌 다음 주 예고

**Week 5: 글로벌 아키텍처**
- Multi-Region 패턴
- Route 53 라우팅 7종
- CloudFront 심화·OAC·Origin Failover
- Global Accelerator vs CloudFront

---

## 📌 오늘의 요약

1. 데이터 주권 = Outposts, 지연 1ms = Local Zones, 5G = Wavelength
2. SG 4종은 인터페이스(NFS/SMB/iSCSI/VTL)로 구분
3. 회선 협소·격리 = Snow, 회선 OK·정기 = DataSync
4. EKS Anywhere = air-gap, ECS Anywhere = AWS Managed CP
5. EKS on Outposts = Managed + 데이터센터

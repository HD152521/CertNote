# Day 3 - Snow Family와 대규모 데이터 전송: 물리학이 인터넷을 이기는 순간

1988년 컴퓨터 과학자 앤드류 타넨바움이 남긴 말이 있다. "스테이션왜건 가득 자기 테이프를 채워 고속도로를 달리는 것의 대역폭을 절대 과소평가하지 마라." 30년이 지난 지금도 이 원칙은 유효하다. 100Mbps 인터넷 회선으로 1PB를 전송하면 약 926일(2.5년)이 걸린다. AWS Snowball Edge 12.5대에 나눠 담아 페덱스로 보내면 2주면 충분하다. 물리적 데이터 이동이 인터넷을 압도하는 임계점이 분명히 존재하고, Snow Family는 그 임계점 이후의 솔루션이다. 오늘은 Snow Family의 각 장비 특성, 내부 보안 아키텍처, DataSync와 Storage Gateway와의 선택 기준, 그리고 엣지 컴퓨팅 활용까지 SAP-C02 수준으로 다룬다.

## Snow Family의 탄생 배경: 네트워크 대역폭의 한계

클라우드 마이그레이션 초기에 모든 것을 네트워크로 전송하려다 실패한 프로젝트들이 있었다. 페타바이트급 데이터를 보유한 기업들이 10Gbps DX를 구축해도 1PB 전송에 이론상 11일, 실제로는 22~30일이 걸렸다. 전송 중 회선 불안정으로 재시작하면 더 길어진다. 해상, 오지, 군사 지역처럼 안정적인 네트워크 연결 자체가 불가능한 환경도 있었다.

> 💡 **관련 이론**: 물리적 데이터 이동의 효율성은 **단순 비교**로 계산할 수 있다. 회선 유효 처리량 = 명목 대역폭 × 효율(보통 50~70%). 100Mbps 회선의 실효 처리량 ≈ 50~70Mbps. 1TB를 100Mbps 실효로 전송 = 약 22시간. 1PB라면 약 2,200시간 = 92일. 같은 1PB를 Snowball Edge 13대(각 80TB)로 보내면 배송 왕복 약 2주. 이 임계점이 약 10TB/100Mbps 조합 정도다. 연결 대역폭이 1Gbps이면 임계점이 100TB로 올라간다.

AWS Snow Family는 2015년 re:Invent에서 처음 발표됐다. 초기에는 단순 데이터 이동 장치였으나 이후 엣지 컴퓨팅(EC2, Lambda 실행), GPU 옵션(ML 추론), 소형화(Snowcone)까지 발전했다.

## Snow Family 3종 비교

### Snowcone: 가장 작은 엣지 디바이스

```
무게: 4.5파운드 (2.1kg)
크기: 소형 책 정도
용량: 8TB HDD 또는 14TB SSD (Snowcone SSD)
컴퓨팅: 2 vCPU, 4GB RAM
전원: USB-C 충전 또는 배터리
```

Snowcone은 드론, 차량, 배낭에 들어갈 수 있는 크기다. 재난 현장, 원격 지역, 군사 작전에서 소량 데이터를 수집하고 제한된 컴퓨팅을 실행하는 용도로 설계됐다. 배터리로 동작하므로 전원 인프라가 없는 환경에서도 사용 가능하다.

**DataSync 에이전트 내장**: Snowcone에는 DataSync 에이전트가 사전 설치되어 있다. 네트워크 연결이 복원되면 Snowcone이 자동으로 수집한 데이터를 S3로 동기화할 수 있다. 데이터를 AWS로 물리 배송하거나 네트워크로 전송하는 두 가지 방식 모두 가능하다.

### Snowball Edge: 메인스트림 데이터 이동 장치

```
무게: 약 22kg
크기: 산업용 케이스
용량: 80TB (Storage Optimized) / 28TB (Compute Optimized)
컴퓨팅:
  - Storage Optimized: 40 vCPU, 80GB RAM, 1TB NVMe SSD
  - Compute Optimized: 104 vCPU, 416GB RAM, 28TB NVMe SSD, 선택적 GPU
전원: 표준 산업용 전원 콘센트
```

> 🔍 **더 깊이**: Snowball Edge는 내부적으로 Nitro 기반 컴퓨팅 노드를 포함한다. Compute Optimized 모델의 104 vCPU는 물리 코어 52개의 하이퍼스레딩이다. GPU 옵션(NVIDIA V100 Tensor Core)은 ML 추론, 비디오 분석, 이미지 처리를 현장에서 실행하는 데 사용된다. 이 GPU 성능은 AWS us-east-1의 p3.2xlarge EC2 인스턴스와 동급이다.

**Snowball Edge 클러스터**: 여러 대의 Snowball Edge를 클러스터로 구성하면 데이터가 분산 저장되어 단일 장비 장애 시에도 데이터가 보호된다. 최대 16대까지 클러스터 구성이 가능하다.

### Snowmobile: 엑사바이트급 — 그리고 2024년 단종

Snowmobile은 45피트 길이의 트럭에 탑재된 100PB 저장 컨테이너다. 전력은 이동식 발전기에서 공급하고, 데이터 보호를 위해 GPS 추적, 경비원, 24시간 모니터링이 제공됐다. 실제 배포 사례는 매우 제한적이었고, 대규모 클라우드 마이그레이션의 현실에서 Snowball 다수 병렬 사용이 더 실용적임이 밝혀지면서 2024년 단종됐다.

> 📚 **사례**: Netflix가 2016년 AWS로 마이그레이션할 때 수십 PB의 미디어 콘텐츠를 물리 이동했다. Snowmobile 발표 직전 시기였기 때문에 실제로는 다수의 Snowball을 병렬로 사용했다. 각 Snowball 80TB × 병렬 12대 = 960TB/배치. 여러 배치를 반복해 수 주에 걸쳐 이전을 완료했다. 이 경험이 Snowball Edge 개발의 요구사항으로 이어졌다.

## Snow 장비의 보안 아키텍처

Snow Family 장비가 고객 데이터를 물리적으로 이동하므로 분실·도난에 대한 보안이 핵심이다.

**암호화**: 모든 데이터는 장비에 기록되기 전에 **256-bit AES** 암호화가 적용된다. 암호화 키는 AWS KMS가 관리하며, 장비에는 키 자체가 아닌 **암호화된 키 재료(Encrypted Key Material)**만 저장된다. 장비가 AWS 데이터센터로 반환되어 KMS 서버에 연결될 때만 복호화 키가 복원된다.

**Tamper-Evident 설계**: 장비 케이스에 물리적 변조 감지 기능이 내장되어 있다. 비정상적인 방법으로 케이스를 열면 내부 보안 칩이 암호화 키를 자동으로 파기한다.

**NIST 800-88 데이터 소거**: AWS가 S3 import를 완료한 후 장비를 재사용하기 전에 NIST SP 800-88 표준에 따라 데이터를 완전 소거한다. 이 표준은 미국 정부가 민감 데이터 소거 방법으로 공식 인정한 절차다.

> 💡 **관련 이론**: NIST SP 800-88 "Guidelines for Media Sanitization"은 세 가지 소거 수준을 정의한다. **Clear**: 단순 덮어쓰기(소프트웨어). **Purge**: 암호화 소거 또는 블록 소거(하드웨어 명령). **Destroy**: 물리적 파괴(분쇄, 소각). Snow 장비는 Purge 수준의 암호화 소거를 사용한다. AES-256으로 암호화된 데이터의 키를 삭제하면 데이터는 이론적으로 복원 불가능한 상태가 된다.

## Snow 엣지 컴퓨팅: 네트워크 없이 AWS API를

Snowball Edge의 진정한 차별점은 EC2와 Lambda를 장비 자체에서 실행할 수 있다는 것이다. 이는 네트워크 연결이 단절된 환경에서도 AWS API를 사용하는 코드를 그대로 실행할 수 있음을 의미한다.

```
[선박 위 Snowball Edge]
  AWS CLI: aws s3 cp sensor.data s3://local-bucket/  ← 로컬 S3에 저장
  EC2 실행: 선박 센서 데이터 실시간 분석 Lambda
  항구 도착 시: 수집된 데이터 → AWS로 전송
```

**지원하는 AWS 서비스 (로컬)**:
- EC2 (AMI 기반 인스턴스)
- AWS Lambda (Python, Node.js)
- AWS IoT Greengrass
- Amazon SageMaker Edge
- Amazon EKS Anywhere
- S3 호환 스토리지 API

> 🎯 **시나리오**: 해양 석유 시추 플랫폼이 수백 개의 센서에서 실시간 데이터를 수집한다. 위성 인터넷(VSAT)은 대역폭이 5Mbps로 제한되어 모든 센서 데이터를 실시간 전송하는 것이 불가능하다. Snowball Edge Compute Optimized를 플랫폼에 배치하면 로컬 EC2와 Lambda가 센서 데이터를 실시간으로 분석해 이상 패턴만 감지한다. 이상 감지 결과(작은 데이터)는 VSAT로 즉시 전송하고, 원시 센서 데이터는 Snowball에 누적됐다가 보급선이 올 때 물리적으로 AWS로 전송된다.

## 데이터 전송 방법 선택 가이드

SAP-C02에서 가장 자주 등장하는 "어떤 데이터 전송 방법을 쓸 것인가" 문제를 풀기 위한 의사결정 트리:

```
데이터베이스 마이그레이션인가?
  └── YES → AWS DMS (Database Migration Service)

서버 자체를 이전(Lift and Shift)하는가?
  └── YES → AWS MGN (Application Migration Service)

파일/오브젝트 데이터 이전인가?
  ├── 네트워크 대역폭이 충분한가? (1Gbps 이상 + 데이터 100TB 미만)
  │   └── YES → AWS DataSync
  ├── 네트워크가 제한적이거나 데이터가 매우 크거나 물리 격리 환경인가?
  │   └── YES → AWS Snow Family
  └── 상시적으로 온프레미스에서 클라우드를 마운트해서 쓰는가?
      └── YES → AWS Storage Gateway
```

**네트워크 vs Snow 전환점 계산**:
```
전환점 = 데이터 크기(TB) ÷ (회선 속도(Gbps) × 86400 × 일수 / 8 / 1024)

예: 데이터 500TB, 회선 100Mbps:
실효 속도 = 100Mbps × 0.6 = 60Mbps = 0.06Gbps
500TB / (0.06 × 86400 / 8 / 1024 × 초단위) ≈ 926시간 ≈ 38일

Snow(Snowball 7대 × 80TB = 560TB):
배송 + 데이터 적재 + 반송 + AWS import ≈ 14-21일

→ Snow가 2배 빠름
```

> 📚 **사례**: 기상청이 30년치 기상 레이더 데이터(약 2PB)를 온프레미스에서 AWS S3로 이전했다. 기존 10Gbps 내부 회선의 20%만 마이그레이션에 사용 가능했으므로 실효 2Gbps. 2PB를 2Gbps로 전송 = 약 23일(이론) + 재전송 여유 = 약 40일. Snowball Edge 26대를 4배치로 나눠 약 3주만에 완료했다. DataSync로 이후 신규 데이터를 계속 동기화하는 하이브리드 패턴을 사용했다.

## DataSync 심층: 단순 복사가 아니다

DataSync는 단순한 파일 복사 도구가 아니다. 엔터프라이즈급 데이터 전송에 필요한 여러 기능을 포함한다.

**자동 무결성 검증**: 전송된 모든 파일에 체크섬을 계산해 소스와 목적지의 데이터가 정확히 일치하는지 검증한다. 네트워크 오류로 인한 데이터 손상을 자동으로 감지하고 재전송한다.

**병렬 전송**: 단일 DataSync 작업이 멀티스레드로 여러 파일을 동시에 전송한다. 1Gbps DX에서 DataSync의 실효 처리량이 단순 cp 명령 대비 30~50% 높다.

**증분 전송**: 이전에 전송된 파일 중 변경된 파일만 재전송한다. 정기 백업과 DR 동기화에서 전송 시간과 비용을 크게 줄인다.

**지원 소스/목적지**: 온프레미스 NFS, SMB, HDFS ↔ AWS S3, EFS, FSx for Windows, FSx for Lustre, FSx for NetApp ONTAP. AWS 서비스 간(S3 → EFS) 전송도 지원한다.

> 🔍 **더 깊이**: DataSync 에이전트는 온프레미스에 VMware/KVM/Hyper-V 가상 머신으로 배포된다. 에이전트는 소스(NFS/SMB) 파일 시스템을 스캔하고 변경 사항을 감지하는 데 inotify(Linux 파일 시스템 이벤트 알림 API)와 유사한 메커니즘을 사용한다. 에이전트는 AWS에서 중앙 관리되며, AWS 콘솔에서 전송 작업 상태, 처리량, 오류를 모니터링할 수 있다.

## AWS Transfer Family: SFTP 엔드포인트 서비스

데이터 전송 관련 서비스 중 혼동하기 쉬운 Transfer Family를 명확히 구분한다.

**Transfer Family는 SFTP/FTP/FTPS/AS2 서버를 AWS 관리형으로 제공**한다. 외부 파트너(공급업체, 고객사)가 SFTP로 S3 또는 EFS에 파일을 업로드/다운로드하는 것이 핵심 사용 사례다.

```
외부 공급업체 → SFTP 클라이언트 → Transfer Family 엔드포인트 → S3/EFS
```

내부 마이그레이션 도구(DataSync)나 상시 마운트 도구(Storage Gateway)와 달리, Transfer Family는 **외부 파트너와의 파일 교환 표준**을 위한 것이다.

## 다른 클라우드와의 비교

| 항목 | AWS Snow Family | GCP Transfer Appliance | Azure Data Box |
|------|----------------|------------------------|----------------|
| 최소 용량 | 8TB (Snowcone) | 40TB | 8TB |
| 최대 용량 | 80TB (Snowball) | 480TB | 120TB (Data Box Heavy) |
| 엣지 컴퓨팅 | 지원 (EC2, Lambda) | 미지원 | 제한적 |
| 보안 소거 | NIST 800-88 | 소거 인증서 제공 | NIST 800-88 |
| GPU 옵션 | Snowball Compute (V100) | 없음 | 없음 |
| 가격 모델 | 장비 사용일 × 일 요금 | 장비 사용 기간 요금 | 장비 사용 기간 요금 |

## 실전 CLI: Snow Job 생성과 데이터 적재

```bash
# Snowball Edge Job 생성 (CLI)
aws snowball create-job \
  --job-type IMPORT \
  --resources '{"S3Resources":[{"BucketArn":"arn:aws:s3:::migration-bucket","KeyRange":{}}]}' \
  --description "Production Data Migration 2024" \
  --address-id ADID123456789 \
  --kms-key-arn "arn:aws:kms:us-east-1:ACCT:key/KEY-ID" \
  --role-arn "arn:aws:iam::ACCT:role/SnowballRole" \
  --snowball-type EDGE_STORAGE_OPTIMIZED \
  --shipping-option SECOND_DAY

# 장비 도착 후: 장비의 로컬 S3 API로 데이터 적재
# 1. Snowball Edge 클라이언트로 장비 잠금 해제
snowballEdge unlock-device \
  --endpoint https://192.168.1.5 \
  --manifest-file /path/to/snowball_manifest.bin \
  --unlock-code UNLOCK-CODE

# 2. 로컬 자격증명 얻기
snowballEdge list-access-keys \
  --endpoint https://192.168.1.5 \
  --manifest-file /path/to/manifest.bin \
  --unlock-code UNLOCK-CODE

# 3. 로컬 S3 API로 데이터 업로드 (장비의 로컬 IP 사용)
aws s3 cp /data/large-file.tar s3://local-bucket/ \
  --endpoint-url http://192.168.1.5:8080 \
  --region snow

# 4. 대용량: 멀티파트 업로드 + 병렬 처리
aws s3 cp /data/ s3://local-bucket/ \
  --recursive \
  --endpoint-url http://192.168.1.5:8080 \
  --region snow \
  --sse aws:kms

# DataSync로 정기 동기화 설정
aws datasync create-task \
  --source-location-arn arn:aws:datasync:ap-northeast-2:ACCT:location/loc-src \
  --destination-location-arn arn:aws:datasync:ap-northeast-2:ACCT:location/loc-dst \
  --name "Weekly-Backup-Task" \
  --schedule '{"ScheduleExpression":"cron(0 1 ? * SUN *)"}' \
  --options '{"VerifyMode":"ONLY_FILES_TRANSFERRED","TransferMode":"CHANGED"}'
```

Snow Family와 DataSync는 서로 경쟁하는 서비스가 아니라 보완하는 서비스다. 대규모 초기 마이그레이션에 Snow를 사용하고, 이후 지속적인 증분 동기화에 DataSync를 사용하는 패턴이 가장 일반적이다. SAP-C02에서 이 조합의 판단 기준은 세 가지다: 대역폭 크기, 데이터 크기, 전송의 일회성 vs 반복성.

---

## 📝 연습 문제

**문제 1.** 헬스케어 기업이 15년치 의료 영상 데이터 800TB를 온프레미스에서 AWS S3로 이전해야 한다. 데이터센터의 AWS DX 회선은 1Gbps다. 이전 완료 후에는 신규 영상만 매주 S3로 동기화할 계획이다. 가장 효율적인 구성은?

A) DataSync로 전체 800TB 전송 + 이후 DataSync 정기 동기화
B) Snowball Edge 10대(각 80TB)로 초기 800TB 이전 + 이후 DataSync 주간 증분 동기화
C) Storage Gateway S3 File로 전체 800TB 전송
D) Site-to-Site VPN 추가 + DataSync 가속

**정답: B**
해설: 1Gbps × 실효 70% = 700Mbps로 800TB를 전송하면 약 25일이 필요하다. Snowball Edge 10대(800TB)를 동시 배포하면 데이터 적재 3~4일 + 배송 왕복 7일 = 약 10~14일로 완료된다. 2배 빠른 초기 이전이 가능하다. 이후 DataSync로 주간 증분 동기화를 자동화하면 운영 부담이 최소화된다. DataSync만으로(A) 800TB를 전송하면 25일 이상 소요되고 DX 대역폭의 상당 부분을 마이그레이션이 점유한다. Storage Gateway(C)는 상시 마운트를 위한 서비스이지 대량 일회성 이전에 최적화되어 있지 않다. VPN 추가(D)는 대역폭이 DX보다 낮아 도움이 안 된다.

---

**문제 2.** 에너지 회사가 북극 탐사 선박에서 수집한 지진 탐사 데이터(약 60TB)를 AWS로 전송해야 한다. 선박의 위성 인터넷은 2Mbps로 제한된다. 동시에 선박 위에서 실시간 지진 데이터 분석이 필요하다. 가장 적합한 솔루션은?

A) DataSync + 위성 인터넷
B) Snowball Edge Compute Optimized (엣지 분석 + 항구 귀환 시 데이터 이전)
C) AWS Outposts (선박에 배치)
D) Site-to-Site VPN + 위성 인터넷

**정답: B**
해설: 2Mbps로 60TB를 전송하면 약 2,800일(7.7년)이 걸린다. 물리 이동이 유일한 현실적 선택이다. Snowball Edge Compute Optimized는 104 vCPU와 선택적 GPU로 선박 위에서 EC2와 Lambda를 실행해 실시간 지진 데이터 분석이 가능하다. 항구 귀환 시 장비를 AWS로 발송해 S3 import를 완료한다. DataSync + 위성(A)과 VPN + 위성(D)은 2Mbps 제한으로 현실적으로 불가능하다. Outposts(C)는 최소 1U 서버이고 항상 AWS Service Link 연결이 필요한데 선박의 2Mbps로는 Service Link 유지도 어렵다.

---

**문제 3.** 영화 스튜디오가 매일 밤 디지털 필름 촬영 원본(약 5TB/일)을 온프레미스 NAS에서 S3로 백업한다. 회선은 10Gbps DX가 있다. 백업 완료 후 S3와 NAS 파일이 정확히 일치하는지 자동 검증이 필요하다. 최적 솔루션은?

A) Snowball Edge 매일 발송
B) AWS DataSync (매일 야간 실행, 자동 무결성 검증 포함)
C) S3 File Gateway + S3 Lifecycle
D) S3 REST API 직접 업로드 스크립트

**정답: B**
해설: 10Gbps DX로 5TB/일은 충분히 전송 가능하다(이론상 1.1시간, 실제 2~3시간). DataSync는 전송 후 자동 체크섬 검증으로 무결성을 보장한다. 매일 야간 스케줄로 cron 자동화도 가능하다. Snowball을 매일 발송(A)하는 것은 5TB/일 × 10Gbps DX 환경에서 완전히 과한 비용이다. S3 File Gateway(C)는 상시 마운트로 실시간 저장에 적합하지만 자동 무결성 검증이 DataSync만큼 강력하지 않다. 직접 스크립트(D)는 병렬 처리 최적화와 자동 재시도, 무결성 검증을 모두 직접 구현해야 한다.

---

**문제 4.** AWS Snow 장비가 분실되었다. 데이터 유출 위험은?

A) 데이터가 평문으로 저장되므로 완전한 유출 위험이 있다
B) 256-bit AES 암호화 + KMS 키 관리로 인해 물리 장비만으로 데이터 복호화 불가능
C) S3에서 데이터를 원격으로 삭제하면 장비의 데이터도 삭제된다
D) 장비를 원격으로 잠글 수 있다

**정답: B**
해설: Snow 장비의 모든 데이터는 기록 전에 256-bit AES로 암호화된다. 암호화 키는 AWS KMS에 있으며 장비에는 암호화된 키 재료만 있다. 장비가 AWS 데이터센터에 연결되지 않은 상태에서는 복호화 키를 얻을 수 없으므로 물리 장비만 있어도 데이터를 읽을 수 없다. 또한 물리 변조 시 보안 칩이 키를 자동 파기한다. C는 S3와 장비의 데이터가 연동되지 않는다(장비 내 데이터는 독립). D는 Snow 장비에 원격 잠금 기능이 없다.

---

**문제 5.** DataSync와 AWS Storage Gateway S3 File Gateway 중 "온프레미스 서버가 주기적으로 S3에 파일을 저장하고 읽어야 한다"는 요구사항에 더 적합한 것은?

A) DataSync
B) S3 File Gateway
C) 두 서비스 모두 동일하게 적합
D) 두 서비스 모두 부적합, Snowball 사용

**정답: B**
해설: "주기적으로 저장하고 읽는다"는 상시적 하이브리드 접근이 필요한 패턴이다. S3 File Gateway는 NFS/SMB로 마운트해 애플리케이션이 로컬 파일 시스템처럼 S3를 사용하게 한다. DataSync는 배치 전송으로 특정 시점에 파일을 동기화하는 도구지, 실시간으로 파일을 읽고 쓰는 상시 마운트를 제공하지 않는다. DataSync는 마이그레이션, 정기 백업, DR 동기화에 적합하다.

---

**문제 6.** 자동차 제조사가 공장 QA 카메라 100대에서 수집한 이미지로 ML 결함 탐지를 실행한다. 공장 LAN은 있지만 인터넷 연결이 없다. 이미지는 공장 서버에 저장되고 ML 추론 결과는 QA 시스템으로 전달된다. 결과 이미지와 레이블은 주기적으로 AWS로 보내 모델 재학습에 사용한다. 가장 적합한 아키텍처는?

A) AWS Outposts Rack + Direct Connect
B) Snowball Edge Compute Optimized (엣지 ML 추론) + 주기적 Snowball 교체로 데이터 전송
C) Local Zones (공장 근처 도시)
D) EC2 온디맨드 + Site-to-Site VPN

**정답: B**
해설: 인터넷이 없는 환경에서 ML 추론을 실행하고 데이터를 주기적으로 AWS로 보내는 것이 요구사항이다. Snowball Edge Compute Optimized는 GPU 옵션으로 ML 추론(SageMaker Edge Manager와 연동)을 공장 내에서 실행할 수 있다. 이미지 데이터를 로컬에 저장하고 정기적으로(예: 주 1회) 장비를 교체해 AWS로 데이터를 발송한다. Outposts(A)는 Service Link가 항상 필요한데 인터넷이 없는 환경에서는 Service Link 유지가 어렵다. Local Zones(C)는 AWS가 운영하는 도시 시설이므로 공장 내 ML 추론에 부적합하다. EC2 + VPN(D)은 인터넷이 없는 환경에서 불가능하다.

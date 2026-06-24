# Day 3 - 고성능 도메인은 왜 "데이터를 사용자에게 얼마나 가까이 두나"로 환원되나

SAA 시험에서 고성능 아키텍처(영역 3)는 24%다. 보안이 "허용/차단" 판정, 복원력이 "장애 반경" 문제였다면, 고성능 도메인은 **"지연(latency)을 줄이고 처리량(throughput)을 늘리려면 데이터·연산을 어디에 두고 어떻게 병렬화하나"**라는 위치·병렬 문제다. 수험생이 "DAX는 μs, FSx Lustre는 ML"처럼 단편적으로 외우다 막히는 이유는, 시험이 묻는 게 서비스 이름이 아니라 **"이 워크로드의 병목이 어디이고, 그 병목을 캐시·근접·병렬·전용 하드웨어 중 무엇으로 푸나"**이기 때문이다.

고성능 도메인의 모든 선택은 두 가지 큰 레버로 환원된다. 하나는 **데이터를 소비 지점에 가까이 두는 것**(캐시·CDN·엣지·읽기 사본), 다른 하나는 **일을 잘게 쪼개 병렬로 처리하는 것**(샤딩·분산 스토리지·여러 컨슈머)이다. 이 글은 도메인 3을 컴퓨팅·스토리지·데이터베이스·네트워크/글로벌·메시징/스트림이라는 다섯 축으로 다시 엮으며, 각 축에서 "근접"과 "병렬"이라는 두 레버가 어떻게 작동하는지를 본다.

> 💡 **관련 이론**: 고성능 설계의 한계는 **Amdahl의 법칙**으로 정해진다 — 시스템의 일부만 병렬화 가능하다면, 아무리 코어를 늘려도 전체 속도 향상은 **직렬 부분(순차적으로만 실행되는 비율)의 역수**를 넘지 못한다. 직렬 부분이 5%면 무한히 병렬화해도 최대 20배밖에 빨라지지 않는다. 이 법칙이 클라우드 성능 설계에 주는 교훈은 "병목(직렬 구간)을 먼저 제거하라"는 것이다. DynamoDB Hot Partition, 단일 NAT Gateway, 캐시 미스 같은 직렬 병목이 전체를 좌우하므로, 인스턴스를 늘리기 전에 이 병목부터 풀어야 한다. 또한 **지연과 처리량은 별개 축**이다 — 처리량을 늘려도(더 많은 코어) 한 요청의 지연은 줄지 않으며, 지연은 근접·캐시로만 줄어든다.

## 컴퓨팅 성능은 "올바른 칩과 배치"로 갈린다

컴퓨팅 성능의 핵심은 워크로드 특성에 맞는 인스턴스 타입과 물리적 배치를 고르는 것이다. **Cluster Placement Group**은 인스턴스들을 같은 랙·같은 AZ에 물리적으로 모아 노드 간 네트워크 지연을 최소화한다 — HPC·분산 학습처럼 노드 간 통신이 잦은 워크로드에 필수다(반대로 Spread는 장애 격리를 위해 흩고, Partition은 대규모 분산 시스템용이다). 칩 선택도 키워드로 갈린다 — **Graviton**(ARM 기반, 가격 대비 성능 우수), **P/G 패밀리**(GPU, 그래픽·범용 가속), **Inferentia**(ML 추론 전용), **Trainium**(ML 학습 전용)이다. **Lambda Provisioned Concurrency**는 함수를 미리 초기화해 둬 **콜드 스타트**(처음 호출 시 런타임 초기화 지연)를 제거한다.

> 🔍 **더 깊이**: Lambda 콜드 스타트의 정체는 **실행 환경 부트스트랩 시간**이다. Lambda는 요청이 없으면 실행 환경을 내려 두고, 새 요청이 오면 ① 컨테이너 같은 격리 환경을 띄우고 ② 런타임(Node/Python/JVM 등)을 로드하고 ③ 함수 코드를 초기화한 뒤 핸들러를 실행한다. 이 ①~③이 콜드 스타트로, JVM처럼 무거운 런타임은 수백 ms~수 초가 걸린다. **Provisioned Concurrency**는 이 환경을 미리 N개 띄워 "따뜻하게" 유지해 콜드 스타트를 없앤다. 혼동하기 쉬운 **Reserved Concurrency**는 다른 개념이다 — 그건 동시 실행 수의 상한을 예약·격리하는 것(다른 함수가 계정 한도를 다 써 버리는 것을 방지)이지 콜드 스타트 제거가 아니다. 시험에서 "콜드 스타트 제거"는 무조건 Provisioned다.

> ⚠️ **함정**: Placement Group 세 종류를 혼동하면 틀린다. "노드 간 **최저 지연**·HPC"면 **Cluster**(한곳에 모음), "**장애 격리**·고가용성"이면 **Spread**(서로 다른 하드웨어에 흩음, 그룹당 AZ별 7개 제한), "대규모 분산 DB·랙 단위 격리"면 **Partition**이다. Cluster는 모아 두므로 그 영역에 문제가 생기면 함께 죽을 위험이 있어, 지연과 격리는 트레이드오프 관계다.

## 스토리지 성능은 "IOPS·처리량·병렬 접근" 중 무엇이 병목인가로 갈린다

스토리지 성능 키워드는 워크로드가 요구하는 차원이 무엇인지로 정렬된다. **gp3**는 범용 SSD의 기본값으로, gp2와 달리 IOPS·처리량을 용량과 독립적으로 프로비저닝할 수 있고 더 싸다(시험에서 "EBS 디폴트는 gp3"가 단골). 미션 크리티컬 DB가 극한의 IOPS를 요구하면 **io2 Block Express**다. 여러 인스턴스가 **동시에 같은 파일 시스템을 병렬로** 읽어야 하면 공유 파일 스토리지가 필요한데 — **EFS**(다중 AZ Linux NFS, 자동 확장)와 **FSx for Lustre**(HPC·ML용 초고속 병렬 파일 시스템, S3와 직접 연동)로 갈린다. 대용량 객체를 멀리서 빠르게 올려야 하면 **S3 Transfer Acceleration**(CloudFront 엣지를 경유해 업로드 가속)이다.

> 💡 **관련 이론**: FSx for Lustre가 ML 학습에서 압도적인 이유는 **병렬 파일 시스템(parallel file system)** 아키텍처에 있다. Lustre는 메타데이터 서버와 다수의 객체 스토리지 타깃(OST)으로 파일을 잘게 스트라이핑해 분산 저장하므로, 수백 개의 컴퓨트 노드가 한 데이터셋을 동시에 읽어도 단일 디스크 대역폭에 막히지 않고 수백 GB/s의 집계 처리량을 낸다. 일반 NFS(EFS)는 단일 마운트 타깃을 통하는 구조라 이런 극한 병렬에는 못 미친다. 게다가 FSx Lustre는 S3를 백엔드로 직접 연결(lazy load)해, S3의 대용량 데이터셋을 학습 시점에 빠르게 끌어온다 — "S3 데이터 + 초고속 병렬 + ML/HPC"가 정확히 Lustre의 정답 신호다.

> ⚠️ **함정**: 공유 스토리지 선택에서 EFS와 FSx를 뭉뚱그리면 틀린다. "여러 Linux 인스턴스가 공유, 자동 확장, 관리 간단"이면 **EFS**, "HPC/ML, S3 연동, 극한 병렬 처리량"이면 **FSx for Lustre**, "Windows 공유(SMB)"면 **FSx for Windows File Server**, "NetApp ONTAP 기능"이면 **FSx for ONTAP**다. 또 EBS는 단일 인스턴스 블록 스토리지라(Multi-Attach io1/io2 예외 제외) "여러 인스턴스 동시 공유"에는 기본적으로 부적합하다.

## 데이터베이스 성능은 "읽기를 어디서 받나, 얼마나 가까운 캐시에 두나"로 갈린다

DB 성능의 첫 레버는 **읽기 부하 분산**이다. **RDS Read Replica / Aurora Reader**는 읽기 전용 사본으로 읽기 트래픽을 프라이머리에서 떼어 낸다. 두 번째 레버는 **캐싱 — 데이터를 메모리에 두어 디스크 왕복을 없애는 것**이다. **DAX**(DynamoDB Accelerator)는 DynamoDB 앞단의 전용 캐시로 읽기를 **마이크로초(μs)** 단위로 떨어뜨린다(ElastiCache는 ms 단위라 차원이 다르다). **ElastiCache Redis**는 세션·리더보드·rich 자료구조 캐싱, **MemoryDB**는 Redis 호환이되 **영속성(durability)**을 보장하는 인메모리 DB(캐시가 아니라 primary DB로 쓸 수 있음)다. 검색·로그 분석은 **OpenSearch**다.

> 🔍 **더 깊이**: DAX가 DynamoDB를 μs로 가속하는 비결은 **읽기 경로에서 네트워크 홉과 직렬화를 제거**하는 데 있다. DynamoDB 직접 호출은 매 요청마다 HTTPS로 DynamoDB 엔드포인트에 가서 결과를 받아 오므로 한 자릿수 ms가 걸린다. DAX는 애플리케이션과 같은 VPC 안의 인메모리 클러스터로, 캐시 히트 시 디스크는커녕 DynamoDB까지 가지 않고 메모리에서 즉시 응답해 μs를 낸다. DAX는 **read-through/write-through** 캐시라, 미스 시 자동으로 DynamoDB에서 읽어 채우고 쓰기는 DynamoDB와 캐시에 함께 반영한다. 단 DAX는 DynamoDB 전용이고 결과적 일관성 읽기에 최적이라, 강한 일관성 읽기가 많은 워크로드에는 이점이 줄어든다. "DynamoDB + μs 읽기"는 DAX의 유일한 정답 신호다.

> ⚠️ **함정**: ElastiCache와 MemoryDB를 같은 것으로 보면 틀린다. **ElastiCache**는 휘발성 캐시(노드가 죽으면 데이터 손실 가능)로 DB 앞단 가속에 쓰고, **MemoryDB**는 다중 AZ 트랜잭션 로그로 **영속성을 보장**해 인메모리 속도를 내면서도 primary 데이터 저장소로 쓸 수 있다. "인메모리 속도 + 데이터 유실 불가(영속)"면 MemoryDB, "DB 앞 캐시 + 세션/리더보드"면 ElastiCache다. 또 DAX는 DynamoDB 전용이라 RDS/Aurora 캐싱에는 ElastiCache를 써야 한다.

## 네트워크·글로벌과 메시징 — 데이터를 사용자에게, 일을 컨슈머에게 가까이

전 세계 사용자에게 빠른 응답을 주려면 데이터를 엣지로 밀어야 한다. **CloudFront**는 HTTP/HTTPS 콘텐츠(정적 파일·동영상·API)를 전 세계 엣지 로케이션에 캐시해 사용자 근처에서 응답한다. **Global Accelerator**는 다르다 — 캐시가 아니라 **AWS의 글로벌 백본 네트워크로 TCP/UDP 트래픽을 가속**하고 고정 애니캐스트 IP를 제공한다(게임·VoIP처럼 비-HTTP, 캐시 불가, 고정 IP 필요). "HTTP 캐시"면 CloudFront, "UDP/TCP 가속·고정 IP·비-HTTP"면 Global Accelerator다. 더 극단적 근접이 필요하면 **Local Zones**(대도시에 컴퓨팅을 두어 한 자릿수 ms), **Wavelength**(5G 통신사 엣지)다.

메시징·스트림은 **소비 패턴**으로 갈린다. **SQS**는 폭증을 흡수하는 단순 큐(한 메시지를 한 컨슈머가 처리 후 삭제), **Kinesis Data Streams**는 여러 컨슈머가 **같은 스트림을 독립적으로 읽고 재생(replay)**할 수 있는 스트림(보존 기간 동안 다시 읽기 가능), **Firehose**는 스트림을 S3/Redshift 등에 **자동 적재**, **Managed Flink**는 스트림 실시간 분석이다.

> 💡 **관련 이론**: CloudFront가 빠른 근본 원리는 캐시 히트 시 **왕복 거리(propagation delay)를 물리적으로 줄이는 것**이다. 빛은 광섬유에서 1km당 약 5μs가 걸리므로, 서울 사용자가 버지니아 오리진(약 11,000km)에 직접 가면 왕복만 100ms 이상이 붙는다. CloudFront가 서울 엣지에 콘텐츠를 캐시해 두면 그 거리가 수십 km로 줄어 왕복이 수 ms가 된다. 반면 Global Accelerator는 캐시할 수 없는(동적·실시간) 트래픽이라 거리를 줄일 순 없지만, 사용자를 가장 가까운 엣지에서 받아 **공용 인터넷 대신 AWS 전용 백본**으로 태워 패킷 손실·홉 수를 줄여 지연을 안정화한다. 둘 다 "사용자에게 가까이"라는 같은 목표를 캐시(CloudFront)와 경로 최적화(GA)라는 다른 방식으로 푼다.

> ⚠️ **함정**: SQS와 Kinesis를 혼동하면 틀린다. **여러 컨슈머가 같은 데이터를 독립적으로 처리·재생**해야 하면 **Kinesis Data Streams**다(SQS는 메시지를 한 컨슈머가 가져가면 삭제되어 재생 불가). "클릭스트림을 분석팀·추천팀·저장팀이 각자 처리" 같은 fan-out + replay 시나리오는 Kinesis가 정답이다. 반대로 "작업을 한 번씩만 처리, 폭증 흡수"면 SQS다. 또 NAT Gateway는 처리량·비용 병목이 될 수 있어 S3/DynamoDB 접근은 **Gateway Endpoint**(무료)로 NAT를 우회하는 게 성능·비용 양쪽 정답이다.

## 다른 클라우드의 고성능 서비스 비교

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| HTTP CDN | CloudFront | Azure CDN / Front Door | Cloud CDN |
| 네트워크 가속(비-HTTP) | Global Accelerator | Front Door(Anycast) | Cloud Load Balancing(Anycast) |
| 인메모리 캐시 | ElastiCache / MemoryDB | Azure Cache for Redis | Memorystore |
| HPC 병렬 파일 시스템 | FSx for Lustre | Azure Managed Lustre | Parallelstore / Filestore |
| 스트림 처리 | Kinesis / MSK | Event Hubs | Pub/Sub / Dataflow |
| ARM 가성비 칩 | Graviton | Cobalt / Ampere Altra | Tau T2A(Ampere) |

세 클라우드 모두 "엣지 캐시 + 백본 가속 + 인메모리 캐시 + 병렬 파일 + 스트림 + ARM 칩"이라는 같은 성능 도구함을 갖췄다. AWS의 특징은 도구가 잘게 쪼개져(CloudFront vs GA, ElastiCache vs MemoryDB, DAX 전용 캐시) 워크로드별로 정밀하게 고를 수 있다는 점이고, 시험이 이 미세 구분을 집요하게 묻는 이유다.

> 🔍 **더 깊이**: DynamoDB의 **Hot Partition** 문제는 고성능 도메인의 대표 안티패턴이다. DynamoDB는 파티션 키 해시로 데이터를 여러 물리 파티션에 분산하는데, 특정 키(예: "오늘 날짜"나 "인기 상품 ID")에 트래픽이 몰리면 그 파티션만 처리 한도에 부딪혀 throttling이 발생한다 — 다른 파티션은 한가한데도 전체가 느려지는, Amdahl 법칙의 직렬 병목과 같은 현상이다. 해결책은 파티션 키를 **균등 분포**하도록 설계하는 것이다(고카디널리티 키 사용, 또는 write sharding으로 키에 무작위 접미사 추가). 인스턴스를 늘려 풀 수 있는 문제가 아니라 **데이터 모델링으로 푸는 병목**이라는 점이 핵심이고, 시험에서 "DynamoDB 특정 키 throttling"이 보이면 PK 분산이 정답이다.

## CLI로 직접 확인하기

```bash
# Lambda Provisioned Concurrency 설정 (콜드 스타트 제거)
aws lambda put-provisioned-concurrency-config --function-name api-fn \
  --qualifier prod --provisioned-concurrent-executions 50

# DAX 클러스터 생성 (DynamoDB μs 읽기)
aws dax create-cluster --cluster-name orders-dax --node-type dax.r5.large \
  --replication-factor 3 --iam-role-arn arn:aws:iam::...:role/DaxRole

# Cluster Placement Group 생성 (HPC 저지연)
aws ec2 create-placement-group --group-name hpc-cluster --strategy cluster

# FSx for Lustre + S3 연동 생성
aws fsx create-file-system --file-system-type LUSTRE \
  --storage-capacity 1200 --lustre-configuration ImportPath=s3://ml-data/

# S3 Gateway Endpoint 생성 (NAT 우회, 무료)
aws ec2 create-vpc-endpoint --vpc-id vpc-123 --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-abc
```

## 정리하며

고성능 도메인(24%)은 "데이터·연산을 소비 지점에 얼마나 가까이 두고(근접), 얼마나 잘게 쪼개 병렬화하나(병렬)"라는 두 레버로 환원된다. ① **컴퓨팅**은 칩(Graviton/GPU/Inferentia/Trainium)과 배치(Cluster=저지연, Spread=격리), 콜드 스타트는 Provisioned Concurrency다. ② **스토리지**는 차원별로 — IOPS는 io2 Block Express, 병렬 공유는 EFS(범용)·FSx Lustre(ML/HPC+S3), 기본은 gp3다. ③ **DB**는 읽기 분산(Read Replica)과 캐싱(DAX=μs 전용, ElastiCache=ms 캐시, MemoryDB=영속)이다. ④ **글로벌**은 CloudFront(HTTP 캐시) vs Global Accelerator(TCP/UDP 백본 가속·고정 IP), 메시징은 SQS(단순 큐) vs Kinesis(다중 컨슈머·재생)다. Hot Partition·NAT 병목은 인스턴스 증설이 아니라 데이터 모델·Gateway Endpoint로 푸는 직렬 병목임을 기억하자.

다음 글에서는 도메인 4 비용 최적화를 "비용은 설계가 결정한다"는 원리로 다시 엮는다.

---

## 📝 연습 문제

**문제 1.** 대용량 데이터셋으로 ML 모델을 학습하며, 데이터는 S3에 있고 수백 개 노드가 초고속 병렬로 읽어야 한다. 가장 적합한 스토리지는?

A) EFS Max I/O B) FSx for Lustre C) FSx for ONTAP D) gp3 EBS

**정답: B**

해설: **FSx for Lustre**는 병렬 파일 시스템 아키텍처로 수백 노드가 한 데이터셋을 동시에 읽어도 수백 GB/s의 집계 처리량을 내며, **S3를 백엔드로 직접 연동**해 대용량 학습 데이터를 빠르게 끌어온다 — "S3 + 초고속 병렬 + ML/HPC"의 정답이다. EFS(A)는 단일 마운트 타깃 NFS라 극한 병렬에 못 미치고, ONTAP(C)은 NetApp 기능용 범용 파일 서비스, gp3(D)는 단일 인스턴스 블록 스토리지라 다중 노드 공유에 부적합하다.

---

**문제 2.** DynamoDB를 읽는 애플리케이션에서 마이크로초(μs) 단위 응답이 필요하다. 적절한 것은?

A) DAX B) ElastiCache Redis C) MemoryDB D) GSI 추가

**정답: A**

해설: **DAX**는 DynamoDB 전용 인메모리 가속기로, 캐시 히트 시 DynamoDB까지 가지 않고 같은 VPC의 메모리에서 즉시 응답해 **마이크로초** 단위를 낸다. ElastiCache(B)는 범용 캐시지만 밀리초(ms) 단위이고 DynamoDB 통합이 자동이 아니며, MemoryDB(C)는 영속 인메모리 DB지 DynamoDB 가속기가 아니고, GSI(D)는 쿼리 패턴을 늘릴 뿐 읽기 지연을 μs로 떨어뜨리지 않는다. "DynamoDB + μs" = DAX가 유일한 정답 신호.

---

**문제 3.** 글로벌 멀티플레이어 게임이 UDP 기반 실시간 트래픽의 지연을 줄이고 고정 IP가 필요하다. 적절한 서비스는?

A) CloudFront B) Global Accelerator C) NLB만 사용 D) Route 53 Latency

**정답: B**

해설: **Global Accelerator**는 캐시할 수 없는 TCP/UDP 트래픽을 AWS 전용 백본으로 가속하고 **고정 애니캐스트 IP**를 제공해, 게임·VoIP 같은 실시간 비-HTTP 워크로드에 적합하다. CloudFront(A)는 HTTP/HTTPS 콘텐츠 캐시 서비스라 UDP 게임 트래픽에 맞지 않고, NLB만(C)으로는 글로벌 백본 가속과 고정 애니캐스트 IP를 얻지 못하며, Route 53 Latency(D)는 DNS 라우팅일 뿐 패킷 경로를 가속하지 않는다. "UDP/TCP 가속 + 고정 IP + 비-HTTP" = Global Accelerator.

---

**문제 4.** HPC 워크로드에서 노드 간 네트워크 지연을 최소화해야 한다. 적절한 Placement Group 전략은?

A) Cluster B) Spread C) Partition D) Multi-AZ 분산

**정답: A**

해설: **Cluster Placement Group**은 인스턴스를 같은 랙·같은 AZ에 물리적으로 모아 노드 간 네트워크 지연과 대역폭을 최적화해 HPC·분산 학습에 적합하다. Spread(B)는 서로 다른 하드웨어에 흩어 장애를 격리하는 정반대 목적, Partition(C)은 대규모 분산 시스템의 랙 단위 격리용, Multi-AZ 분산(D)은 AZ를 넘기므로 노드 간 지연이 오히려 커진다. "노드 간 최저 지연/HPC" = Cluster. 단 모아 두는 만큼 장애 격리와는 트레이드오프다.

---

**문제 5.** 하나의 클릭스트림을 분석팀·추천팀·아카이브팀이 각자 독립적으로 처리하고, 필요 시 과거 데이터를 재생(replay)해야 한다. 적절한 서비스는?

A) SQS B) Kinesis Data Streams C) SNS D) EventBridge

**정답: B**

해설: **Kinesis Data Streams**는 여러 컨슈머가 같은 스트림을 독립적으로 읽고, 보존 기간 동안 과거 레코드를 **재생(replay)**할 수 있어 fan-out + replay 시나리오의 정답이다. SQS(A)는 한 컨슈머가 메시지를 가져가면 삭제되어 재생·다중 독립 처리가 불가능하고, SNS(C)는 발행 시점에만 푸시(재생 없음), EventBridge(D)는 규칙 기반 라우팅이지 스트림 재생 저장소가 아니다. "다중 컨슈머 독립 처리 + 재생" = Kinesis Data Streams.

---

## 📌 핵심 요약

고성능 도메인(24%)은 데이터·연산을 소비 지점에 가까이 두고(근접) 잘게 쪼개 병렬화하는(병렬) 두 레버로 환원된다. 컴퓨팅은 칩(Graviton/GPU/Inferentia/Trainium)과 배치(Cluster=저지연, Spread=격리)·Provisioned Concurrency(콜드 스타트), 스토리지는 io2(IOPS)·EFS/FSx Lustre(병렬 공유, Lustre는 S3+ML)·gp3(기본)로 갈린다. DB는 읽기 분산(Read Replica)과 캐싱(DAX=μs 전용, ElastiCache=ms, MemoryDB=영속), 글로벌은 CloudFront(HTTP 캐시) vs Global Accelerator(TCP/UDP 백본·고정 IP), 메시징은 SQS(단순 큐) vs Kinesis(다중 컨슈머·재생)다. Hot Partition·NAT 병목은 증설이 아니라 PK 분산·Gateway Endpoint로 푸는 직렬 병목임이 Amdahl 법칙의 교훈이다.

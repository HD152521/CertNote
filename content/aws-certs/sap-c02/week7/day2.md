# Day 2 - EKS의 내부 해부 — 노드 그룹, IRSA, Karpenter가 만드는 운영 표준

`kubectl get nodes`를 처음 EKS 클러스터에서 쳐본 사람은 잠시 멍해진다. 컨트롤 플레인이 어디 있는지, 노드가 왜 갑자기 두 개씩 떴는지, Pod가 ENI를 한 칸씩 잡아먹는 이유가 뭔지 — 매니지드 K8s를 쓴다고 해서 K8s가 사라지는 건 아니다. 다만 etcd 백업이나 컨트롤 플레인 패치처럼 운영의 가장 흉한 부분이 AWS 쪽으로 넘어갈 뿐이다. SAP 시험은 이 "남은 부분"을 정확히 짚어낸다. Managed Node Group의 자동 드레인이 어떻게 동작하는지, IRSA가 STS의 어떤 API를 부르는지, Karpenter가 ASG를 안 거치고 EC2를 어떻게 만드는지가 한 도메인에 두세 문제씩 깔린다.

이 글에서는 EKS의 데이터 플레인을 세 층으로 쪼개서 본다. **노드를 어떻게 띄우는가(노드 그룹)**, **Pod에 어떻게 권한을 주는가(IRSA·Pod Identity)**, **수요에 맞춰 노드를 어떻게 자동 조정하는가(Karpenter)**. 여기에 VPC CNI·EBS CSI 같은 Addon이 어떻게 매니지드 형태로 들어오는지를 곁들인다. 어제 그린 ECS·EKS·Fargate 지도가 EKS 안으로 들어와서 어떻게 채워지는지를 보는 시간이다.

## 노드 그룹 세 가지 — 같은 클러스터, 다른 운영 모델

EKS 클러스터 하나에는 노드 그룹을 여러 개 섞어서 붙일 수 있다. 종류는 셋이고, 차이는 "AWS가 어디까지 책임지는가"로 갈린다.

```
[EKS Control Plane (AWS 매니지드, $0.10/h)]
              │
              ▼
┌────────────────────────────────────────────────┐
│ Managed Node Group                             │
│  ├─ Launch Template (인스턴스 타입·AMI·SG)      │
│  ├─ ASG는 AWS가 자동 생성·관리                  │
│  └─ 노드 드레인·롤링 업데이트 자동              │
├────────────────────────────────────────────────┤
│ Self-Managed Node Group                        │
│  ├─ 사용자가 직접 ASG·Launch Template 작성      │
│  ├─ AMI 패치·드레인 모두 사용자 책임             │
│  └─ 커스텀 OS, 특수 커널, GPU 드라이버 핀닝 가능 │
├────────────────────────────────────────────────┤
│ Fargate Profile                                │
│  ├─ 노드 자체가 없음 (Pod별 micro VM)            │
│  ├─ Selector(namespace + label)로 Pod 매칭     │
│  └─ DaemonSet·HostPath·GPU 미지원              │
└────────────────────────────────────────────────┘
```

**Managed Node Group(MNG)**은 가장 흔한 표준이다. 사용자가 인스턴스 타입(t3.medium, m5.xlarge 등)·AMI 종류(EKS Optimized AL2023 또는 Bottlerocket)·desired/min/max만 지정하면, AWS가 ASG를 뒤에서 만들어 라이프사이클을 자동화한다. 노드 교체 시 `kubectl drain`을 알아서 호출해 PodDisruptionBudget을 존중하고, 롤링 업데이트도 한 줄 명령으로 처리된다. **Self-Managed Node Group**은 그 모든 자동화를 사용자가 직접 ASG·SSM Patch Manager로 구현해야 한다. 굳이 이걸 쓰는 경우는 GPU 드라이버 버전을 핀닝하거나 RHEL·Ubuntu Pro 같은 비표준 AMI를 써야 할 때다.

**Fargate Profile**은 노드 자체를 없앤다. namespace + label 셀렉터로 매칭된 Pod는 각자 자기만의 Firecracker micro VM에서 뜬다. 운영 부담은 0에 가깝지만, 노드 개념이 없기 때문에 DaemonSet(노드당 1개 보장)이 동작하지 않고, HostPath 볼륨·GPU·EBS 동적 프로비저닝 일부도 제한된다. 보통은 `kube-system` 같은 시스템 Pod는 MNG에 두고, 비즈니스 워크로드 일부만 Fargate Profile로 넘기는 혼합 패턴을 쓴다.

> 💡 **관련 이론**: Managed Node Group이 노드를 교체할 때 호출하는 흐름은 **K8s의 graceful shutdown 표준**을 그대로 따른다. ① `Cordon`으로 새 Pod 스케줄 막기 → ② `Drain`으로 기존 Pod에 `SIGTERM` 전송 → ③ `preStop` 훅 실행 → ④ `terminationGracePeriodSeconds`(기본 30초) 동안 대기 → ⑤ `SIGKILL`. 이 흐름이 PodDisruptionBudget(PDB) 제약을 만나면 다음 Pod로 넘어가지 않고 대기한다. AWS의 MNG는 이 모든 단계를 자동화하지만, 사용자가 PDB를 잘못 설정하면 노드 교체가 영원히 끝나지 않는 함정이 있다.

> 🔍 **더 깊이**: EKS Optimized AMI는 두 갈래가 있다. **Amazon Linux 2023(AL2023)** 기반과 **Bottlerocket** 기반이다. Bottlerocket은 AWS가 컨테이너 전용으로 만든 minimal OS인데, SSH가 없고 root 파일시스템이 read-only이며, 업데이트는 atomic 이미지 단위(A/B 파티션)다. 이 설계는 ChromeOS·CoreOS의 영향을 받았다. 컨테이너 호스트를 "범용 서버"가 아니라 "컨테이너만 돌리는 어플라이언스"로 보는 철학이고, 공격 표면이 매우 작다. 보안 규제가 강한 금융·헬스케어에서 점점 더 표준이 되어가고 있다.

## IRSA — OIDC 위에 얹은 세련된 임시 자격 증명

EKS에서 Pod이 S3나 DynamoDB를 호출해야 한다면, 가장 나쁜 답이 "노드 Instance Profile에 권한을 주는 것"이다. 그 노드 위의 모든 Pod이 권한을 공유하게 되어 blast radius가 무한히 커진다. 2019년 Capital One 사고의 본질도 SSRF로 노드의 메타데이터 엔드포인트(169.254.169.254)에 접근해 EC2 Instance Profile의 자격 증명을 탈취한 사건이었다. K8s 세계에서는 **Pod별로** IAM Role을 매핑해야 안전하고, AWS가 그걸 위해 만든 표준이 IRSA(IAM Roles for Service Accounts)다.

IRSA의 동작은 한마디로 **OIDC + STS AssumeRoleWithWebIdentity**다.

```
1. EKS 클러스터 생성 시 OIDC Provider URL 부여
   (예: oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE)
2. 운영자가 그 OIDC URL을 IAM의 Identity Provider로 등록
3. IAM Role의 Trust Policy:
     "이 OIDC가 발급한 토큰 중 sub == system:serviceaccount:ns:sa-name"
4. K8s ServiceAccount에 annotation:
     eks.amazonaws.com/role-arn: arn:aws:iam::123:role/s3-read
5. Pod이 그 SA를 쓰면, AWS SDK는 Projected ServiceAccount Token을
   /var/run/secrets/eks.amazonaws.com/serviceaccount/token 에서 읽음
6. SDK가 STS:AssumeRoleWithWebIdentity 호출 → 임시 키 발급 → 호출
```

핵심은 4단계의 ServiceAccount annotation과 6단계의 **AssumeRoleWithWebIdentity** API다. 이 API는 OAuth 2.0의 OIDC 토큰을 IAM 임시 자격 증명으로 교환하는 표준 흐름이고, 같은 메커니즘이 GitHub Actions의 OIDC 인증, GCP의 Workload Identity Federation에서도 쓰인다. AWS는 토큰 만료를 보통 1시간으로 잡고, SDK가 자동으로 갱신한다.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/s3-read
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      serviceAccountName: s3-reader   # ← 이 한 줄이 IRSA의 전부
      containers:
        - name: app
          image: my/app:1
```

> 💡 **관련 이론**: AssumeRoleWithWebIdentity는 OAuth 2.0의 **Token Exchange**(RFC 8693)와 같은 계열의 발상이다. 외부 IdP가 발급한 단명 토큰을 내부 권한 토큰과 교환하는 패턴인데, K8s에서는 ServiceAccount Token이 외부 토큰 역할을 한다. K8s 1.21부터 도입된 **Projected ServiceAccount Token**은 audience·expirationSeconds를 지정할 수 있어서, 토큰이 STS 외 다른 서비스에 잘못 전달되어도 거부된다. 이 audience 검증이 IRSA 보안의 핵심이고, OIDC 표준의 `aud` 클레임 검증과 동일한 원리다.

> 🔍 **더 깊이**: IRSA가 처음 나왔을 때(2019)는 클러스터마다 OIDC Provider를 IAM에 등록해야 했다. 클러스터 100개면 100개 등록이고, IAM Role의 Trust Policy도 클러스터별로 따로 써야 한다. 2023년 발표된 **EKS Pod Identity**는 OIDC를 빼고, EKS Auth API가 직접 Pod의 신원을 STS에 증명하는 방식이다. Trust Policy가 `pods.eks.amazonaws.com` 단일 principal을 신뢰하면 끝나서, 같은 Role을 여러 클러스터에서 재사용하기 쉽다. 다만 동작 원리는 EKS Auth API에 의존하므로 OIDC Federation의 표준성·이식성은 IRSA가 더 높다. SAP 시험은 둘 다 "Pod별 IAM" 정답으로 인정하지만, 시나리오가 "표준 OIDC"·"멀티 클라우드 호환"을 강조하면 IRSA, "다중 EKS 클러스터 권한 재사용"·"간소화"를 강조하면 Pod Identity가 답이다.

| 항목 | IRSA | Pod Identity |
|------|------|--------------|
| 신뢰 모델 | OIDC Provider per cluster | EKS Auth API (단일 principal) |
| Trust Policy 작성 | 클러스터마다 작성 | 단일 정책 재사용 |
| 표준 호환 | OIDC 표준 (멀티 클라우드 친화) | EKS 전용 |
| 토큰 발급 경로 | sts:AssumeRoleWithWebIdentity | EKS Auth → STS |
| 도입 시기 | 2019 | 2023 |
| Fargate 지원 | 가능 | 가능 |

> 📚 **사례**: 2023년 Datadog은 1,000개 이상의 K8s 클러스터를 운영하는데, IRSA의 클러스터별 OIDC 등록이 너무 번거로워 자체 IAM Federation 레이어를 만들어 썼다. EKS Pod Identity 발표 후 일부 클러스터를 마이그레이션해 운영 코드를 절반 가까이 줄였다고 KubeCon 2024에서 공유했다. 다중 클러스터 환경의 권한 재사용성이 Pod Identity의 진짜 가치라는 사례.

## Karpenter — ASG를 건너뛴 직접 프로비저닝

전통적인 K8s의 노드 오토스케일러는 **Cluster Autoscaler(CA)**다. Pending Pod가 생기면 적합한 ASG를 골라 desired count를 늘리고, ASG가 EC2를 띄우면 K8s가 노드로 등록한다. 이 흐름은 잘 동작하지만 두 가지 약점이 있다. 첫째, ASG는 인스턴스 타입이 고정된다. m5.large ASG에는 m5.large 노드만 뜬다. 둘째, 노드가 뜨기까지 ASG → EC2 → cloud-init → K8s join 단계를 모두 거쳐 분 단위가 걸린다.

**Karpenter**(2021 v0.5, 2023년 v1 GA, 2024년 1.0)는 이 두 가지를 다르게 푼다.

```
[Pending Pod 발생]
      │
[Karpenter Controller가 Pod requests·affinity 분석]
      │
      │ Pod이 4 vCPU·8GB·spot·zone-a 요구
      ▼
[NodePool·EC2NodeClass의 후보군에서 최적 인스턴스 선택]
   - 예: c6i.xlarge spot $0.03/h vs m5.xlarge spot $0.04/h
   - "충분히 큰 가장 싼 것" 룰
      │
      ▼
[EC2 Fleet API 직접 호출] ← ASG를 건너뜀
      │
[노드 부팅·K8s join]
      │
[Pod 스케줄링 완료] — 보통 30~60초
      │
[유휴 노드 감지 → Consolidation으로 통합·종료] ← 지속적 비용 최적화
```

핵심 차이는 ASG를 건너뛴다는 점과 **인스턴스 타입을 매번 새로 고른다는 점**이다. Karpenter는 EC2 Spot Price·On-Demand Price·가용 영역을 실시간으로 평가해 그 시점에 가장 싼 적합 인스턴스를 만든다. 어제는 c6i.xlarge spot이 가장 쌌어도, 오늘은 m6a.xlarge spot이 더 쌀 수 있다. Cluster Autoscaler는 ASG에 묶여 이 유연성이 없다.

**Consolidation**은 또 다른 강점이다. Pod이 줄어들어 노드 4개에 띄엄띄엄 남으면, Karpenter는 이걸 노드 2개로 통합해 비용을 줄인다. 통합 시점에 PDB를 존중하고, `do-not-disrupt` annotation으로 보호된 Pod은 건드리지 않는다. 이 동작은 K8s의 graceful shutdown 표준을 그대로 사용하므로 사용자 코드 변경 없이 적용된다.

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-cpu
          operator: In
          values: ["4", "8", "16"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
```

이 NodePool 하나로 "c·m·r 시리즈 중 4·8·16 vCPU, Spot 우선, 노드 활용률 낮으면 통합"이라는 정책을 선언한다. ASG로는 이 유연성을 구현하기 어렵다.

> 💡 **관련 이론**: Karpenter의 인스턴스 선택은 **multi-dimensional bin packing**의 휴리스틱 해법이다. 정확한 최적해는 NP-hard지만, Karpenter는 "충분히 큰 + 가장 싼" 그리디 전략으로 수십 ms 안에 의사결정한다. 구글 Borg의 cell scheduler 논문(EuroSys 2015)에서도 비슷한 그리디 + priority 함수 접근이 쓰였다. 이론적 최적은 아니지만 실용적 sub-optimal로 충분히 좋은 비용 절감을 만들어낸다.

> 🔍 **더 깊이**: Karpenter는 **CNCF Sandbox 프로젝트**이고, AWS가 주도하지만 Azure·GCP에서도 동작 가능한 구조다. 실제로 Azure가 Karpenter Provider for Azure를 2024년에 GA했고, GCP 쪽 구현도 활발히 진행 중이다. 이는 K8s 생태계의 흥미로운 변화로, "오토스케일러도 표준화"라는 방향이다. SAP 시험은 여전히 AWS Provider 시나리오만 출제하지만, 실무에서 Karpenter를 도입하면 멀티 클라우드 마이그레이션의 일부 부담이 줄어든다.

> 📚 **사례**: 2023년 Adobe는 EKS 위 워크로드에 Cluster Autoscaler를 쓰다 Karpenter로 전환해 노드 프로비저닝 시간을 평균 3분에서 40초로 줄였다. Spot 혼합으로 컴퓨트 비용을 약 30% 절감했고, Consolidation 덕에 야간 트래픽 감소 시간대에 노드 수를 자동으로 60% 줄였다. AWS re:Invent 2023 CON402 세션 발표.

| 항목 | Cluster Autoscaler | Karpenter |
|------|--------------------|-----------|
| 노드 프로비저닝 | ASG 경유 | EC2 Fleet API 직접 |
| 인스턴스 타입 | ASG 고정 | 매번 최적 선택 |
| 스케일아웃 속도 | 1~3분 | 30초~1분 |
| Spot 혼합 | ASG에 직접 설정 | NodePool에 capacity-type만 |
| 노드 통합(Consolidation) | 약함 (스케일다운만) | 강함 (재배치 + 통합) |
| 멀티 인스턴스 패밀리 | 어려움 (ASG 여러 개 필요) | 한 NodePool로 가능 |

## VPC CNI와 Pod IP의 슬롯 경쟁

EKS의 기본 네트워킹은 **AWS VPC CNI**다. 다른 K8s 배포의 Calico·Flannel과 달리, Pod에 VPC IP를 직접 할당한다. 장점은 VPC 보안 그룹·NACL이 Pod에 그대로 적용되고, EC2와 동일한 라우팅으로 외부와 통신할 수 있다는 점이다. 단점은 **Pod IP가 노드의 ENI 슬롯을 잡아먹는다**는 점이다.

각 EC2 인스턴스 타입은 ENI 개수 한도와 ENI당 IP 개수 한도가 정해져 있다. 예를 들어 t3.medium은 ENI 3개 × IP 6개 = 최대 17 Pod IP(노드 자체 IP 1개 제외)다. m5.large는 약 29개. 이 한도 때문에 작은 인스턴스에 Pod을 빽빽이 못 띄운다.

해결책이 **Prefix Delegation**이다. ENI에 단일 IP가 아니라 /28 prefix(16개 IP)를 할당받아서 ENI당 IP를 16배로 늘린다. t3.medium 기준으로 17개 → 110개까지 늘어난다. 활성화 한 줄로 끝나고, VPC 서브넷에 충분한 IP 여유만 있으면 적용 가능하다.

```bash
kubectl set env daemonset aws-node -n kube-system \
  ENABLE_PREFIX_DELEGATION=true
```

이외에도 **Custom Networking**(Pod IP를 별도 서브넷에서 할당해 본 서브넷 IP 고갈 회피)·**Security Groups for Pods**(Pod별 SG 부여, 일부 인스턴스 타입에 한정)·**IPv6 모드** 등 EKS 특화 네트워킹 옵션이 있다.

> ⚠️ **함정**: SAP에서 "EKS Pod이 더 이상 스케줄링되지 않는다, 노드 자원은 충분한데"라는 시나리오의 정답은 거의 항상 **Pod IP 슬롯 고갈**이다. 표면적으로는 CPU·메모리가 남았지만, ENI 슬롯이 다 차서 신규 Pod에 IP를 못 준다. 해결은 ① Prefix Delegation 활성화, ② 더 큰 인스턴스, ③ Custom Networking 중 하나. 가장 운영 부담 적은 답은 ①.

## EKS Addons — 매니지드 K8s 컴포넌트의 새 세대

K8s는 자체로는 빈 캔버스에 가깝다. DNS·네트워킹·스토리지·로드밸런서를 모두 외부 컴포넌트로 채워야 한다. EKS는 이 컴포넌트들을 **EKS Addons**라는 매니지드 형태로 제공한다.

| Addon | 역할 | 대안 |
|-------|------|------|
| **VPC CNI** | Pod 네트워킹 (Pod IP = VPC IP) | Calico, Cilium |
| **CoreDNS** | 클러스터 내부 DNS | 동일 (CoreDNS 표준) |
| **kube-proxy** | Service → Pod IP 라우팅 | iptables/ipvs |
| **EBS CSI Driver** | EBS PersistentVolume 동적 프로비저닝 | (필수) |
| **EFS CSI Driver** | EFS 마운트 | FSx for Lustre CSI |
| **AWS Load Balancer Controller** | Ingress → ALB, Service → NLB 자동 생성 | (사실상 표준) |
| **EKS Pod Identity Agent** | Pod Identity 자격 증명 발급 | IRSA |
| **CloudWatch Container Insights** | 메트릭·로그 통합 | Prometheus + Grafana |

EBS CSI Driver는 EKS 1.23부터 in-tree EBS 플러그인이 제거되어 **사실상 필수**가 되었다. PVC가 EBS Volume을 자동 생성·연결하려면 CSI Driver Addon이 깔려 있어야 한다. 클러스터 업그레이드 시 이걸 놓치면 PV 생성이 멈춰서 데이터베이스·캐시 같은 stateful 워크로드가 무너진다.

```bash
aws eks create-addon \
  --cluster-name prod \
  --addon-name aws-ebs-csi-driver \
  --service-account-role-arn arn:aws:iam::123:role/eks-ebs-csi
```

> 📚 **사례**: 2023년 한 핀테크가 EKS 1.22에서 1.23으로 업그레이드하면서 EBS CSI Driver Addon 설치를 깜빡했다. 기존 Pod은 잘 돌았지만 새 StatefulSet 배포 시 PVC가 영원히 Pending에 머물러 결제 시스템 일부가 지연됐다. AWS 공식 업그레이드 체크리스트에는 "1.23+에서는 EBS CSI 필수"라는 항목이 있지만, 운영팀이 변경 영향 평가를 충분히 안 한 사례. 그 이후 회사는 모든 EKS 클러스터 업그레이드에 ADR(Architecture Decision Record) 검토를 의무화했다.

## EKS 업그레이드 — 마이너 한 단계씩, 노드는 ±1까지

EKS Control Plane 업그레이드는 **한 마이너 버전씩만** 올라간다(1.27 → 1.28, 1.29로 두 단계는 불가). 노드 그룹은 Control Plane과 **±1 마이너 버전** 차이까지만 허용된다. 즉 Control Plane이 1.28이면 노드는 1.27·1.28·1.29 중 하나여야 한다(아직 1.29가 없으면 1.27·1.28).

전형적 업그레이드 흐름:

```
1. Addon 호환 버전 확인 (VPC CNI, CoreDNS, kube-proxy)
2. Control Plane 1.27 → 1.28
3. Addon 업그레이드 (1.28 호환 버전으로)
4. 노드 그룹 1.27 → 1.28 (MNG는 자동 롤링, Self-Managed는 수동)
5. 다음 마이너 버전으로 반복
```

K8s는 분기당 한 번 새 마이너 버전이 나오고, 보안 패치는 보통 14개월 정도 유지된다. EKS는 그보다 약간 더 길게 지원하지만, 결국 매년 두세 번은 업그레이드가 필요하다. 운영 부담을 더 낮추려면 **EKS Auto Mode**(2024년 GA)를 고려할 수 있는데, 이건 컨트롤 플레인뿐 아니라 노드·Addon까지 AWS가 매니지드로 운영하는 새 모델이다.

> 🎯 **시나리오**: "한 회사가 EKS 클러스터를 50개 운영한다. 각 클러스터를 분기마다 한 번씩 업그레이드해야 하는데, 운영팀 인력이 부족하다. 노드·Addon 운영까지 AWS에 맡기고 싶다. 어느 옵션이 적합한가?" — 답은 **EKS Auto Mode**. 컨트롤 플레인·노드·Addon·Karpenter까지 모두 AWS 매니지드로 들어가, 사용자는 Workload YAML만 관리하면 된다. 기존 EKS보다 단가는 약간 높지만, 50개 클러스터 운영 인건비를 따지면 손익분기점이 빠르게 잡힌다.

## 다른 매니지드 K8s와 비교

EKS의 위치를 객관적으로 보려면 GCP의 GKE, Azure의 AKS와 비교해보는 게 좋다.

| 차원 | EKS | GKE | AKS |
|------|-----|-----|-----|
| Control Plane 비용 | $0.10/h | Standard $0.10/h, Autopilot 포함 | 무료(Free tier), $0.10/h(Uptime SLA) |
| Auto 모드 | EKS Auto Mode (2024) | GKE Autopilot (2021) | AKS Automatic (Preview) |
| 노드 자동 프로비저닝 | Karpenter (오픈소스, 별도 설치) | NAP(Node Auto-Provisioning) 내장 | AKS Node Auto-Provisioning (Preview) |
| Pod별 IAM | IRSA, Pod Identity | Workload Identity Federation | Azure AD Workload Identity |
| 최신 K8s 지원 | 보통 1~2분기 뒤 | 가장 빠름 (Rapid Channel) | 1~2분기 뒤 |
| 컨트롤 플레인 SLA | 99.95% | 99.5% (Standard), 99.95% (Autopilot) | 99.95% (Uptime SLA) |

GCP의 GKE Autopilot이 "운영 부담 0" 방향으로 가장 앞서 갔고, AWS는 2024년 EKS Auto Mode로 뒤따라잡았다. Azure는 기본 Free tier로 가격은 가장 친화적이지만, K8s 자체 운영 성숙도는 상대적으로 낮다는 평이 많다.

> 📚 **사례**: 2022년 Spotify는 사내 일부 워크로드를 GKE에서 EKS로 마이그레이션하면서, Workload Identity Federation을 IRSA로 옮기는 작업이 가장 큰 비용 항목이었다. 두 시스템 모두 OIDC 기반이지만 sub claim 포맷이 미묘하게 달라서 ServiceAccount 매니페스트의 annotation을 모두 다시 작성해야 했다. K8s가 표준이어도 클라우드 통합 레이어는 표준화되지 않았다는 일관된 교훈.

## EKS Anywhere — 컨트롤 플레인까지 온프레로 내려보내기

어제 잠깐 다뤘던 EKS Anywhere는 EKS의 컨트롤 플레인까지 온프레미스에 두는 옵션이다. 내부적으로 **EKS Distro(EKS-D)**라는 오픈소스 K8s 배포판을 쓰는데, AWS가 EKS에서 검증한 K8s + 컴포넌트(coredns·etcd·kube-proxy·CNI) 조합을 그대로 패키징한 것이다. 같은 K8s 버전이 클라우드와 온프레에서 동일하게 동작한다는 게 보장의 핵심이다.

VMware vSphere, Bare Metal, Snow, Nutanix 위에서 배포 가능하고, 에어갭(완전 격리) 환경도 지원한다. 단점은 운영을 사용자가 다 한다는 점이다(컨트롤 플레인 업그레이드·etcd 백업). 그래서 "공장 100개에 흩어진 게이트웨이"·"방위·금융 격리 환경" 같은 시나리오에서만 의미가 있고, 일반 워크로드에는 EKS(클라우드)가 항상 더 단순하다.

## 정리하며

오늘은 EKS의 데이터 플레인을 셋으로 쪼개 봤다. **노드 그룹**으로 Pod이 실행될 곳을 정하고, **IRSA·Pod Identity**로 Pod별 권한을 안전하게 부여하고, **Karpenter**로 노드 수와 인스턴스 타입을 동적으로 조정한다. 여기에 **VPC CNI Prefix Delegation**으로 IP 슬롯을 늘리고, **EBS CSI Addon**으로 영구 볼륨을 다루는 게 표준 패턴이다.

내일은 Fargate의 과금 구조와 비용 최적화를 본다. ECS·EKS 어디서든 데이터 플레인으로 쓰일 수 있는 Fargate의 진짜 단가가 어떻게 산정되고, Compute Savings Plans와 Graviton·Spot을 어떻게 조합하면 같은 워크로드를 절반 가격에 돌릴 수 있는지를 다룬다.

---

## 📝 연습 문제

**문제 1.** EKS Pod이 S3에 접근해야 한다. 운영팀은 Pod별 최소 권한을 표준으로 유지하면서 클러스터를 30개 이상 운영한다. 같은 IAM Role을 여러 클러스터에서 재사용하기 쉬운 방법은?

A) EC2 Instance Profile에 S3 권한 부여
B) IRSA (IAM Roles for Service Accounts)
C) EKS Pod Identity
D) Secrets Manager로 액세스 키 주입

**정답: C**
해설: 두 키워드를 분해해야 한다. "Pod별 IAM"은 IRSA·Pod Identity 둘 다 만족하지만, "다중 클러스터 권한 재사용"이 결정적이다. IRSA는 클러스터마다 OIDC Provider를 IAM에 등록해야 하고 Trust Policy도 클러스터별로 작성한다. Pod Identity는 단일 principal(`pods.eks.amazonaws.com`)을 신뢰하면 끝나서 같은 Role을 모든 클러스터에서 재사용할 수 있다. A는 노드의 모든 Pod이 권한 공유로 최소 권한 위반. D는 키 회전·노출 위험. 추가 학습: 표준 OIDC 호환·멀티 클라우드 친화가 더 강조되면 IRSA가 답이 된다.

---

**문제 2.** 가변 트래픽을 처리하는 EKS 클러스터에서 다음 요구를 모두 만족해야 한다. ① 스케일아웃이 1분 안에 완료 ② Pod requests를 보고 인스턴스 타입을 매번 최적 선택 ③ Spot 혼합 자동 처리 ④ 노드 활용률이 낮을 때 자동 통합. 어떤 도구가 적합한가?

A) Cluster Autoscaler + ASG
B) Horizontal Pod Autoscaler만
C) Karpenter
D) EKS Managed Node Group + Spot Allocation

**정답: C**
해설: 네 요구를 모두 만족하는 건 Karpenter다. CA는 ASG에 묶여 인스턴스 타입이 고정되고 스케일아웃이 분 단위. HPA는 Pod 수 조정 도구로 노드 프로비저닝과는 다른 층. MNG + Spot은 ASG 기반이라 Karpenter의 통합·재배치 기능이 없다. 함정: "Karpenter는 EKS 전용 아니냐"는 오해. Karpenter는 CNCF Sandbox 프로젝트로 Azure·GCP에서도 동작 가능하지만 SAP 시험에서는 EKS Provider 시나리오만 출제된다. 추가: Karpenter Consolidation은 PDB를 존중하므로 안전하게 적용 가능.

---

**문제 3.** EKS 노드의 CPU·메모리는 충분한데 새 Pod이 더 이상 스케줄링되지 않는다. 노드 자원이 아니라 다른 한계에 걸린 것 같다. 가장 운영 부담 적은 해결책은?

A) 더 큰 인스턴스로 노드 그룹 교체
B) VPC CNI에 Prefix Delegation 활성화
C) Calico CNI로 교체
D) Custom Networking 구성

**정답: B**
해설: 증상은 명확하다. AWS VPC CNI는 Pod에 VPC IP를 직접 할당하는데, 각 인스턴스의 ENI 슬롯 한도(예: t3.medium은 약 17개)에 걸린다. Prefix Delegation은 ENI에 /28 prefix(16 IP)를 할당해 슬롯을 16배 늘려서, 환경 변수 한 줄 변경(`ENABLE_PREFIX_DELEGATION=true`)으로 적용 가능하다. A는 가능하지만 노드 교체·비용 증가. C는 CNI 교체로 운영 변화가 크고 VPC SG·라우팅 통합이 깨질 수 있음. D는 별도 서브넷·라우팅 설계 필요. 추가: Prefix Delegation 적용 시 VPC 서브넷에 IP 여유 확인 필수.

---

**문제 4.** EKS Fargate Profile에서 다음 중 **사용 가능한** 것은?

A) DaemonSet
B) HostPath 볼륨
C) GPU 워크로드
D) IRSA를 통한 Pod별 IAM Role

**정답: D**
해설: Fargate Profile은 노드 개념이 없는 micro VM 기반이라 A(노드당 1개 보장 DaemonSet)·B(노드 호스트 파일시스템 접근 HostPath)·C(GPU 인스턴스) 모두 지원 안 된다. IRSA는 K8s ServiceAccount → IAM Role 매핑이므로 노드 유무와 무관하게 동작한다. Fargate Profile에서도 동일하게 사용 가능. 추가: Fargate Pod도 Pod Identity Agent를 통해 Pod Identity 사용 가능. 함정: "Fargate라서 IAM이 안 된다"는 오해를 정답으로 고르지 말 것.

---

**문제 5.** EKS 1.22에서 1.24로 업그레이드하려 한다. 가장 정확한 절차는?

A) Control Plane을 1.22 → 1.24로 한 번에 올림
B) 노드 그룹을 먼저 1.24로 올린 뒤 Control Plane 업그레이드
C) Control Plane을 1.22 → 1.23 → 1.24로 한 단계씩, 각 단계마다 노드 그룹과 Addon 호환 확인
D) 새 1.24 클러스터를 만들고 워크로드를 마이그레이션

**정답: C**
해설: EKS는 마이너 버전을 한 단계씩만 업그레이드할 수 있고, 노드 그룹은 Control Plane과 ±1 마이너 차이까지 허용된다. A는 EKS API가 거부. B는 노드가 Control Plane보다 앞서면 호환성 깨짐. D는 가능하지만 운영 부담·다운타임이 크고 SAP 시험은 더 운영 부담 적은 표준 절차를 답으로 묻는다. 추가: 각 단계마다 VPC CNI·CoreDNS·kube-proxy 호환 버전 업그레이드 필수. EBS CSI Driver는 1.23+에서 사실상 필수.

---

**문제 6.** 한 회사가 EKS 클러스터 50개를 운영하는데 각 클러스터를 분기마다 업그레이드하기 어렵다. 컨트롤 플레인뿐 아니라 노드·Addon 운영도 AWS에 맡기는 가장 새로운 옵션은?

A) EKS + Karpenter + IRSA
B) EKS Auto Mode
C) ECS Fargate로 전환
D) EKS Anywhere

**정답: B**
해설: EKS Auto Mode(2024년 GA)는 Control Plane뿐 아니라 노드 그룹·Karpenter·핵심 Addon까지 AWS가 매니지드로 운영하는 모델이다. 사용자는 Workload YAML만 관리하면 된다. A는 사용자가 Karpenter·Addon을 직접 운영. C는 K8s 표준을 포기해야 함. D는 컨트롤 플레인을 온프레로 가져가는 정반대 방향. 추가: Auto Mode는 단가가 약간 더 높지만 50개 클러스터 인건비 대비 손익분기점이 빠르게 잡힌다.

---

**문제 7.** EKS Pod이 ECR에서 이미지 Pull은 잘 되는데, 애플리케이션 코드가 DynamoDB 호출 시 AccessDenied. 원인은?

A) Node Instance Profile에 ECR 권한이 없음
B) ServiceAccount에 매핑된 IAM Role에 DynamoDB 권한이 없음
C) VPC Endpoint 미설정
D) 보안 그룹에서 443 차단

**정답: B**
해설: 이미지 Pull은 Node의 kubelet이 ECR을 호출하는 흐름으로 Node Instance Profile 권한을 쓴다. 정상 동작하므로 그쪽은 문제 없음. 애플리케이션 코드의 AWS API 호출은 **IRSA로 매핑된 IAM Role**을 사용한다. ServiceAccount → IAM Role 매핑의 권한이 빠진 것이 정답. A는 ECR 이미지 Pull이 정상이라는 사실로 반박됨. C는 latency/비용 최적화이지 권한 문제와 무관. D는 timeout 에러가 났을 것. 추가: ECS의 Task Role vs Execution Role과 동일한 패턴이 EKS에서는 IRSA vs Node Instance Profile로 나타난다.

---

## 📌 오늘의 요약

1. **노드 그룹 3종**: Managed(표준·자동) / Self-Managed(커스텀 AMI·드라이버) / Fargate Profile(노드 없음)
2. **IRSA = OIDC + AssumeRoleWithWebIdentity**, **Pod Identity = EKS Auth로 간소화**, 다중 클러스터 권한 재사용에 Pod Identity 우위
3. **Karpenter = ASG 미사용 + 매번 최적 인스턴스 + Consolidation**, Cluster Autoscaler의 약점을 모두 보완
4. **VPC CNI Prefix Delegation**으로 Pod IP 슬롯 16배, ENI 슬롯 고갈이 SAP 단골 함정
5. **EBS CSI Driver Addon**은 EKS 1.23+ 사실상 필수, 업그레이드 시 빠뜨리면 PVC Pending
6. **EKS Auto Mode**(2024)로 컨트롤 플레인·노드·Addon 전부 매니지드, 클러스터 다수 운영 시 손익분기점 빠름
7. **EKS Anywhere = EKS-D 기반**, 컨트롤 플레인까지 온프레, 에어갭 환경 지원

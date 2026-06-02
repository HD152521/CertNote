# Day 32 - EKS 심화 — 노드 그룹, IRSA, Karpenter

📅 날짜: Week 7 (Day 2)
🎯 주제: EKS 운영의 표준 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EKS 노드 그룹 3가지(Managed/Self-Managed/Fargate Profile) 차이를 안다
- IRSA 동작 메커니즘과 Pod Identity와의 차이를 이해한다
- Karpenter의 동작 원리와 Cluster Autoscaler 대비 장점을 안다
- EKS Addons·VPC CNI·CoreDNS·EBS CSI Driver의 역할 정리

---

## 🧩 사전 지식 (CS 기초)

- **OIDC(OpenID Connect)**: OAuth 2.0 기반 신원 인증 표준. EKS 클러스터마다 OIDC Provider URL이 부여되고 IRSA가 이걸로 STS AssumeRole을 한다.
- **CNI(Container Network Interface)**: Pod 네트워킹 플러그인 표준. EKS의 기본은 AWS VPC CNI (Pod IP를 VPC IP로 직접 할당).
- **CRD(Custom Resource Definition)**: Kubernetes API를 확장하는 리소스. Karpenter는 NodePool·EC2NodeClass CRD를 사용한다.
- **Bin Packing**: 노드 자원에 Pod를 최대한 효율적으로 채우는 알고리즘. Karpenter가 이 관점에서 최적화한다.

---

## 📖 이론 내용

### 1. EKS 노드 그룹 3가지

| 종류 | 관리 | 적용 사례 |
|------|------|----------|
| **Managed Node Group** | AWS가 ASG·AMI·드레인 자동화 | 표준·기본값 |
| **Self-Managed Node Group** | 사용자가 ASG·AMI·드레인 | 커스텀 AMI/특수 OS |
| **Fargate Profile** | 노드 자체가 없음 (Pod별 micro VM) | 운영 부담 0, 시스템 Pod 제외 |

#### Managed Node Group 핵심
- Launch Template으로 인스턴스 타입·태그 지정
- 자동 노드 드레인·종료 (롤링 업데이트)
- Spot 지원 (`--capacity-type SPOT`)

### 2. IRSA (IAM Roles for Service Accounts)

**메커니즘**:
1. 클러스터의 OIDC Provider URL을 IAM에 신뢰 ID로 등록
2. ServiceAccount에 `eks.amazonaws.com/role-arn` annotation 부여
3. Pod 안에서 토큰 파일을 STS AssumeRoleWithWebIdentity로 자동 교환
4. Pod이 임시 자격 증명으로 AWS API 호출

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3-reader
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/s3-read
```

### 3. EKS Pod Identity (2023 신규)

- IRSA의 후속 — OIDC Provider 설정 불필요
- 클러스터에 **Pod Identity Agent Addon** 설치 후 Pod Identity Association 생성
- IRSA보다 더 간단·다중 클러스터 권한 재사용 쉬움
- 기존 IRSA도 계속 지원

| 항목 | IRSA | Pod Identity |
|------|------|-------------|
| 신뢰 모델 | OIDC Provider per cluster | 단일 신뢰 정책 |
| 설정 단계 | 다소 복잡 | 간단 |
| 다중 클러스터 권한 재사용 | 어려움 | 쉬움 |

### 4. Karpenter (오픈소스, AWS 주도)

**Cluster Autoscaler 대비 장점**:
- ASG 의존 없이 직접 EC2 Fleet API로 노드 프로비저닝 → 더 빠름 (10초~1분)
- Pod requests를 보고 **최적 인스턴스 타입**을 자동 선택
- Bin Packing으로 노드 통합·축소 → 비용 절감
- Spot 혼합 자동 처리

**핵심 CRD**:
- **NodePool**: 어떤 Pod에 어떤 노드를 띄울지 정책
- **EC2NodeClass**: AMI·서브넷·보안 그룹 등 EC2 세부 설정

### 5. EKS Addons (관리형)

| Addon | 역할 |
|-------|------|
| **VPC CNI** | Pod 네트워킹 (Pod IP = VPC IP) |
| **CoreDNS** | 클러스터 DNS |
| **kube-proxy** | 서비스 라우팅 |
| **EBS CSI Driver** | EBS 볼륨 동적 프로비저닝 |
| **EFS CSI Driver** | EFS 마운트 |
| **AWS Load Balancer Controller** | ALB/NLB Ingress 자동 생성 |
| **CloudWatch Container Insights** | 모니터링 |

### 6. 네트워킹 핵심

- **VPC CNI**: Pod IP가 VPC IP라 EC2 인스턴스의 ENI 슬롯에 영향
  - 큰 인스턴스일수록 Pod IP 많이 띄울 수 있음
  - **Prefix Delegation**으로 IP 슬롯 16배로 늘림
- **Security Groups for Pods**: Pod별 SG 부여 (특정 인스턴스 타입 한정)
- **Custom Networking**: Pod IP를 별도 서브넷에서

### 7. EKS 업그레이드

- Control Plane: 한 마이너 버전씩만 (1.27 → 1.28)
- Node Group: Control Plane과 ±1 마이너 버전
- Blue/Green: 새 노드 그룹 만들고 점진 이전

---

## 🧠 알아두면 좋은 심화 이론

### Karpenter vs Cluster Autoscaler

| 항목 | Cluster Autoscaler | Karpenter |
|------|-------------------|-----------|
| 의존성 | ASG 필수 | 직접 EC2 API |
| 스케일아웃 속도 | 수 분 | 수십 초 |
| 인스턴스 선택 | ASG 고정 타입 | Pod requests 보고 최적 선택 |
| Bin Packing | 약함 | 강함 (노드 통합) |
| Spot 통합 | ASG 설정 필요 | 자동 |

### EKS Auto Mode (2024년 말 신규)

- 컨트롤 플레인 + 데이터 플레인 모두 매니지드 (Karpenter 내장)
- Node·Addon·Storage·Networking 자동 관리
- "EKS의 완전 매니지드 버전"

### Fargate Profile 제한

- DaemonSet 미지원
- HostPath/EmptyDir 제한
- GPU·고밀도·Stateful 워크로드 부적합

---

## 🏗️ 다이어그램 — Karpenter 동작

```
1. Pod 생성 요청 (Pending)
       │
2. Karpenter Controller 감지
       │
3. Pod requests·affinity 분석 → 최적 인스턴스 타입 결정
   (Spot + On-Demand 후보 평가)
       │
4. EC2 Fleet API로 노드 직접 생성
   (ASG 거치지 않음 → 빠름)
       │
5. 노드 등록 후 Pod 스케줄링
       │
6. (선택) Idle 노드 통합 → 비용 절감
```

---

## ⭐ 핵심 포인트

1. ⭐ Managed NG = 표준, Self-Managed = 커스텀, Fargate = 운영 0
2. ⭐ **IRSA = OIDC + AssumeRoleWithWebIdentity → Pod별 IAM**
3. ⭐ Pod Identity = IRSA 후속 (더 간단)
4. ⭐ **Karpenter = ASG 없이 직접 EC2, Bin Packing, Spot 자동**
5. ⭐ VPC CNI Prefix Delegation으로 Pod IP 슬롯 확장
6. ⭐ EBS CSI Driver 1.23+ 필수 (Static Provisioning 외)
7. ⭐ EKS Auto Mode = 모든 게 매니지드

---

## 💻 실제 예시 - IRSA 생성 (eksctl)

```bash
eksctl create iamserviceaccount \
  --cluster=mycluster \
  --namespace=default \
  --name=s3-reader \
  --role-name=eks-s3-reader \
  --attach-policy-arn=arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess \
  --approve
```

### Karpenter NodePool 정의

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
          values: ["c","m","r"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot","on-demand"]
      nodeClassRef:
        name: default
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenUnderutilized
```

---

## 📝 연습 문제

**문제 1.** EKS Pod이 S3에 접근할 때 가장 안전·표준적인 방법?

A) Node Instance Profile에 S3 권한
B) 액세스 키 시크릿
C) IRSA
D) Bucket Policy 0.0.0.0/0

**정답: C**
해설: IRSA가 Pod별 IAM Role을 부여하는 표준.

---

**문제 2.** 가변 트래픽 EKS 클러스터에 빠르고 비용 효율적인 노드 오토스케일러는?

A) Cluster Autoscaler + ASG
B) Karpenter
C) HPA만으로 충분
D) EC2 Spot Fleet 직접

**정답: B**
해설: Karpenter는 ASG 의존 없이 직접 EC2 API로 빠르게 프로비저닝하고 Bin Packing·Spot 통합으로 비용↓.

---

**문제 3.** EKS Pod 네트워킹에서 t3.medium 인스턴스에 띄울 수 있는 Pod IP 수를 늘리고 싶다.

A) 더 큰 인스턴스로 교체
B) VPC CNI Prefix Delegation 활성화
C) Security Group for Pods
D) Custom Networking

**정답: B**
해설: Prefix Delegation은 ENI당 /28 prefix를 할당해 IP 슬롯 ~16배. 기존 인스턴스 그대로 가능.

---

**문제 4.** EKS Fargate Profile의 제한이 아닌 것은?

A) DaemonSet 미지원
B) GPU 지원 제한
C) Pod별 IAM Role 미지원
D) HostPath 제한

**정답: C**
해설: IRSA를 통한 Pod별 IAM은 Fargate에서도 동작. 다른 항목은 제한 사항.

---

**문제 5.** IRSA의 후속·간소화된 신규 방식은?

A) EC2 Instance Profile
B) EKS Pod Identity
C) Cognito
D) Secrets Manager

**정답: B**
해설: Pod Identity는 OIDC Provider 없이 더 간단한 신뢰 모델로 동작.

---

**문제 6.** EKS 1.23부터 EBS 영구 볼륨을 동적 생성하려면 무엇이 필요한가?

A) 추가 작업 없음
B) EBS CSI Driver Addon 설치
C) NFS 사용
D) EFS만 가능

**정답: B**
해설: 1.23부터 in-tree EBS 플러그인이 제거되어 EBS CSI Driver가 필수.

---

## 📌 오늘의 요약

1. 노드 그룹 = Managed/Self-Managed/Fargate
2. IRSA = OIDC + AssumeRoleWithWebIdentity, Pod Identity는 후속
3. Karpenter = 빠른 스케일·Bin Packing·Spot 자동
4. VPC CNI는 Pod IP = VPC IP (Prefix Delegation 활용)
5. EBS CSI·CoreDNS·VPC CNI는 EKS Addon으로 관리

# Day 6 - 가상화 관리: 하이퍼바이저·KVM·컨테이너로 한 서버를 여럿처럼 쓰기

지금까지는 **한 대의 하드웨어 위에 한 개의 리눅스**를 전제하고 패키지·커널·장치를 다뤘다. 오늘은 그 전제를 깬다. **가상화(virtualization)**란 물리 자원을 논리적으로 쪼개어 한 대의 서버가 여러 대인 것처럼 동작하게 만드는 기술이며, 실기에서는 **KVM/virsh 명령**과 **Docker 명령**이 단답·작업형으로 직접 나온다.

가상화는 두 갈래다. **가상 머신(VM)**은 게스트마다 자기 커널과 완전한 OS를 갖고 그 아래 **하이퍼바이저**가 하드웨어를 나눠준다. **컨테이너**는 게스트 OS 없이 호스트 커널을 공유하며 커널 기능(namespace·cgroup)으로 프로세스를 격리한다.

핵심 통찰: **커널을 새로 띄우느냐, 빌려 쓰느냐**가 둘을 가르는 유일한 분기점이다. VM은 커널을 새로 부팅하므로 무겁고(수 GB, 수십 초) 대신 완전히 다른 OS도 돌린다. 컨테이너는 가볍고(수십 MB, 1초 이내) 대신 **리눅스 컨테이너는 리눅스 커널 위에서만** 돈다.

## 전가상화와 반가상화

게스트가 하드웨어에 접근하려 할 때 그 요청을 누가 어떻게 받느냐로 방식이 갈린다.

| 구분 | 전가상화(Full) | 반가상화(Para) |
|------|---------------|----------------|
| 게스트 OS 수정 | **불필요**(있는 그대로 설치) | **필요**(커널 수정) |
| 하드웨어 접근 | 하이퍼바이저가 가로채 처리 | 게스트가 **하이퍼콜**로 직접 요청 |
| 게스트 OS 제약 | Windows 등 수정 불가 OS도 가능 | 오픈소스 커널만 현실적 |
| 대표 예 | KVM, VMware ESXi, Xen HVM | Xen PV |

> 💡 **개념**: 전가상화는 게스트를 "속인다". 게스트 커널은 진짜 하드웨어 위에 있다고 믿고 특권 명령을 실행하는데 하이퍼바이저가 그것을 가로채(trap) 대신 처리한다 — Windows처럼 소스를 손댈 수 없는 OS를 돌리는 이유다. 반가상화는 게스트 커널을 수정해 특권 명령 대신 **하이퍼콜(hypercall)**로 부탁하게 만든다.

> 🔍 **더 깊이**: 전가상화의 성능 문제는 Intel **VT-x**·AMD **AMD-V**가 해결했다. CPU가 게스트 모드를 직접 제공해 가로채기 비용을 없앴고, 그래서 전가상화가 표준이 됐다. 반가상화는 I/O 영역(virtio)에만 남았다.

```bash
grep -E 'vmx|svm' /proc/cpuinfo     # Intel=vmx, AMD=svm 플래그가 보이면 지원
grep -c -E 'vmx|svm' /proc/cpuinfo  # 지원 논리 코어 수(0이면 미지원 또는 BIOS 비활성)
```

## 하이퍼바이저 Type 1 vs Type 2

**하이퍼바이저(VMM)**는 가상 머신을 만들고 물리 자원을 나눠주는 계층이다. 하드웨어 바로 위인가, 호스트 OS 위인가로 갈린다.

| 구분 | **Type 1 (베어메탈)** | **Type 2 (호스트형)** |
|------|----------------------|----------------------|
| 위치 | 하드웨어 **바로 위** | 호스트 OS **위의 응용 프로그램** |
| 호스트 OS / 성능 | 불필요 / 높음 | 필요 / 낮음 |
| 용도 | 서버·데이터센터·클라우드 | 데스크톱·개발·학습 |
| 대표 예 | **Xen, VMware ESXi, Hyper-V, KVM** | **VirtualBox, VMware Workstation** |

```
[Type 1]                    [Type 2]
+------------------+        +------------------+
| VM  | VM  | VM   |        | VM  | VM         |
+------------------+        +------------------+
|   하이퍼바이저   |        | 하이퍼바이저(앱) |
+------------------+        +------------------+
|     하드웨어     |        |    호스트 OS     |
+------------------+        +------------------+
                            |     하드웨어     |
                            +------------------+
```

Type 2는 게스트의 요청이 **하이퍼바이저 → 호스트 OS → 하드웨어**로 한 단계를 더 거쳐 느리다. 서버실은 Type 1, 내 노트북은 Type 2가 정석이다.

> ⚠️ **함정**: **KVM의 분류**가 헷갈리는 지점이다. KVM은 커널 모듈이라 "호스트 OS 위"처럼 보이지만, 적재되는 순간 **리눅스 커널 자체가 하이퍼바이저로 변신**한다. 그래서 통상 **Type 1**으로 분류하며, 시험 보기도 "KVM = Type 1, VirtualBox = Type 2"가 표준이다.

## KVM — 리눅스 커널이 곧 하이퍼바이저

**KVM(Kernel-based Virtual Machine)**은 커널 2.6.20부터 메인라인에 포함된 리눅스 표준 가상화다. 핵심은 **커널 모듈**이라는 점 — 어제 배운 모듈 관리가 그대로 적용된다.

```bash
lsmod | grep kvm       # kvm, kvm_intel(또는 kvm_amd)가 보여야 한다
modprobe kvm_intel     # Intel CPU용 KVM 모듈 적재
ls -l /dev/kvm         # KVM이 노출하는 문자 장치(crw-rw----)
```

| 구성 요소 | 역할 |
|-----------|------|
| **KVM**(kvm.ko, kvm_intel/kvm_amd.ko) | 커널 모듈. CPU·메모리 가상화를 **하드웨어 가속**으로 처리 |
| **QEMU** | 사용자 공간 에뮬레이터. 디스크·NIC·그래픽 등 **주변 장치 에뮬레이션** |
| **libvirt / libvirtd** | 가상화 관리 **추상화 계층**(API·데몬) |
| **virsh** / **virt-manager** | libvirt의 **명령행** / **GUI** 클라이언트 |

> 💡 **개념**: KVM과 QEMU는 경쟁자가 아니라 **분업 관계**다. KVM은 CPU·메모리만 하드웨어 가속으로 담당하고, 디스크 컨트롤러·NIC·VGA 같은 주변 장치는 QEMU가 흉내 낸다. "KVM은 CPU, QEMU는 장치"로 외운다.

```bash
# RHEL/CentOS/Rocky 계열
dnf install qemu-kvm libvirt virt-install virt-manager
# Debian/Ubuntu 계열
apt install qemu-kvm libvirt-daemon-system virtinst virt-manager
systemctl enable --now libvirtd      # 공통: libvirt 데몬 기동
```

### virsh — 가상 머신 관리 명령

`virsh`는 실기 단답의 핵심이다. libvirt에서 가상 머신 하나를 **도메인(domain)**이라 부른다.

```bash
virsh list                  # 실행 중인 도메인만
virsh list --all            # 정지된 것까지 전부
virsh start vm1             # 시작
virsh shutdown vm1          # 정상 종료(ACPI 신호 전달)
virsh destroy vm1           # 강제 종료(전원 코드 뽑기) — 삭제 아님!
virsh undefine vm1          # 도메인 정의 삭제(제거)
virsh suspend vm1           # 일시 정지(메모리 유지)
virsh resume vm1            # 정지 해제
virsh dominfo vm1           # 상태·CPU·메모리 정보
virsh dumpxml vm1 > vm1.xml # 설정을 XML로 내보내기 (반대: virsh define vm1.xml)
virsh autostart vm1         # 호스트 부팅 시 자동 시작
```

> ⚠️ **함정**: `virsh destroy`는 이름과 달리 **가상 머신을 지우지 않는다.** 전원 코드를 뽑듯 강제로 끄는 것이며, 디스크와 정의는 남아 `virsh start`로 다시 켤 수 있다. 등록을 지우는 명령은 `virsh undefine`이다.

> 🔍 **더 깊이**: libvirt가 존재하는 이유는 **추상화**다. `virsh` 명령은 KVM뿐 아니라 Xen·LXC에도 통하며 접속 URI만 바꾸면 된다. 도메인 XML은 `/etc/libvirt/qemu/`, 디스크 이미지 기본 저장소는 `/var/lib/libvirt/images/`다.

새 VM은 `virt-install`로, 디스크 이미지는 `qemu-img`로 만든다. 형식 중 `raw`는 단순해 빠르지만 처음부터 전체 용량을 차지하고, **`qcow2`**는 실제 쓴 만큼만 커지는 **씬 프로비저닝**과 **스냅샷**을 지원해 기본 선택지다.

```bash
qemu-img create -f qcow2 /var/lib/libvirt/images/vm1.qcow2 20G
qemu-img info /var/lib/libvirt/images/vm1.qcow2

virt-install --name vm1 --memory 2048 --vcpus 2 \
  --disk path=/var/lib/libvirt/images/vm1.qcow2,size=20 \
  --cdrom /iso/Rocky-9.iso --network bridge=br0 --graphics vnc
```

## 컨테이너 — 커널을 공유하는 격리

컨테이너는 **게스트 OS를 띄우지 않는다.** 호스트 커널을 그대로 쓰면서 커널의 두 기능으로 프로세스를 가둔다.

| 커널 기능 | 하는 일 |
|-----------|---------|
| **namespace** | 무엇을 **볼 수 있는가**를 격리(PID·네트워크·마운트·호스트명·사용자·IPC) |
| **cgroup**(control group) | 자원을 **얼마나 쓸 수 있는가**를 제한(CPU·메모리·I/O) |

| 비교 | 가상 머신(VM) | 컨테이너 |
|------|---------------|----------|
| 커널 | 게스트마다 **별도 커널** | 호스트 커널 **공유** |
| 크기 / 부팅 | 수 GB / 수십 초 | 수십~수백 MB / 1초 이내 |
| 격리 강도 | **강함**(하드웨어 수준) | 상대적으로 약함(커널 공유) |
| 다른 OS | Windows 등 가능 | **리눅스 컨테이너는 리눅스만** |
| 대표 | KVM, VirtualBox | Docker, Podman, LXC |

두 기능은 "시야와 한도"다. **namespace는 시야**를 좁혀 컨테이너 안에서 `ps`를 치면 자기 프로세스만, `ip addr`을 치면 자기 인터페이스만 보인다. **cgroup은 한도**를 정해 한 컨테이너가 호스트 자원을 잡아먹지 못하게 한다.

> ⚠️ **함정**: "컨테이너는 가벼운 가상 머신"이라는 표현은 시험에서 **오답**이다. 컨테이너에는 게스트 커널도 하이퍼바이저도 없다. 그래서 리눅스 호스트 위에서 Windows 컨테이너를 돌릴 수 없고, 커널 취약점이 뚫리면 격리도 함께 뚫린다.

> 📚 **유래/사례**: 컨테이너의 뿌리는 1979년 유닉스 `chroot`다. 리눅스에서 cgroup·namespace가 커널에 들어오며 기반이 갖춰졌고 LXC가 이를 묶었으며, 2013년 Docker가 **이미지와 레지스트리**라는 유통 개념을 얹으며 폭발적으로 퍼졌다 — 격리 기술보다 "배포 방식"이 혁신이었다.

## Docker — 이미지와 컨테이너

Docker를 이해하는 열쇠는 **이미지와 컨테이너의 구분**이다.

| 개념 | 정의 |
|------|------|
| **이미지(image)** | 읽기 전용 템플릿(계층 구조). 실행되지 않음 — 설치 파일에 해당 |
| **컨테이너(container)** | 이미지 위에 **쓰기 가능 계층**을 얹은 실행 인스턴스 |
| **레지스트리(registry)** | 이미지를 보관·배포하는 저장소(Docker Hub 등) |

```bash
docker pull nginx:1.25                       # 레지스트리에서 이미지 내려받기(태그 지정)
docker images                                # 로컬 이미지 목록
docker run -d -p 8080:80 --name web nginx    # 컨테이너 생성 + 실행
docker ps                                    # 실행 중인 컨테이너 (전부: docker ps -a)
docker exec -it web /bin/bash                # 실행 중인 컨테이너에서 명령 실행(셸 접속)
docker logs -f web                           # 컨테이너 표준출력 로그(실시간)
docker stop web                              # 정상 정지
docker rm web                                # 컨테이너 삭제(정지 상태여야 함)
docker rmi nginx                             # 이미지 삭제
docker build -t myapp:1.0 .                  # Dockerfile로 이미지 빌드
```

| 옵션 | 의미 |
|------|------|
| `-d` | detached, 백그라운드 실행 |
| `-it` | 대화형(`-i` 표준입력 유지 + `-t` 유사 터미널) |
| `-p 호스트:컨테이너` | 포트 매핑(publish) |
| `-v 호스트경로:컨테이너경로` | 볼륨·바인드 마운트 |
| `--name` / `-e KEY=VALUE` / `--rm` | 이름 지정 / 환경 변수 / 종료 시 자동 삭제 |

> ⚠️ **함정**: **`docker rm`(컨테이너 삭제)과 `docker rmi`(이미지 삭제)**를 바꿔 쓰는 문제가 반드시 나온다 — `i`가 붙으면 image다. 또 `-p 8080:80`은 **호스트 포트가 앞, 컨테이너 포트가 뒤**이며 순서를 뒤집은 보기가 단골 오답이다.

컨테이너가 삭제되면 **쓰기 계층이 통째로 사라지므로** 보존할 데이터는 **볼륨**으로 밖에 둔다. `-v /host/data:/var/lib/mysql`처럼 호스트 디렉터리를 연결하면(바인드 마운트) 컨테이너를 지워도 데이터가 남는다.

### Dockerfile — 이미지를 코드로 정의하기

Dockerfile은 이미지를 만드는 절차를 적은 텍스트 파일이며, 각 지시어가 이미지의 한 **계층(layer)**이 된다.

```dockerfile
FROM ubuntu:22.04                 # 베이스 이미지(반드시 첫 지시어)
ENV APP_HOME=/app                 # 환경 변수
WORKDIR /app                      # 작업 디렉터리(없으면 생성)
COPY ./src /app                   # 호스트 파일을 이미지로 복사
RUN apt-get update && apt-get install -y python3   # 빌드 시점에 실행
EXPOSE 8080                       # 사용할 포트를 문서화
CMD ["python3", "app.py"]         # 컨테이너 시작 시 실행할 기본 명령
```

| 지시어 | 역할 |
|--------|------|
| `FROM` | 베이스 이미지 지정(**항상 첫 줄**) |
| `RUN` | **빌드 시점**에 명령 실행(결과가 이미지에 남음) |
| `COPY` / `ADD` | 파일 복사(`ADD`는 URL·자동 압축 해제 지원) |
| `WORKDIR` / `ENV` / `USER` | 작업 디렉터리 / 환경 변수 / 실행 사용자 |
| `EXPOSE` | 노출 포트 문서화(실제 개방은 `-p`) |
| `CMD` / `ENTRYPOINT` | **실행 시점**의 기본 명령(덮어쓰기 가능) / 고정 실행 파일 |

> ⚠️ **함정**: **`RUN`과 `CMD`의 시점**이 다르다. `RUN`은 `docker build` 중 실행되어 결과가 이미지에 굳고, `CMD`는 `docker run` 할 때 실행되며 여러 번 써도 **마지막 하나만** 유효하다. `EXPOSE`는 **문서화일 뿐** 외부 접근을 열지 않는다.

**Podman**은 RHEL 8부터 Docker를 대체하는 기본 컨테이너 엔진이다. **데몬리스**(상주 데몬 dockerd 없이 컨테이너를 직접 띄움)와 **루트리스**(일반 사용자 권한 실행)가 차이점이며, 옵션은 Docker 호환이라 `podman run -d -p 8080:80 nginx`가 그대로 통한다. 시스템 컨테이너 계열 **LXC/LXD**도 알아둔다.

```bash
# 직접 쳐보기 — 가상화 지원과 격리 기능 관찰 (안전: 조회 위주)
grep -c -E 'vmx|svm' /proc/cpuinfo    # CPU 가상화 지원 코어 수(0이면 미지원)
lsmod | grep kvm                       # KVM 모듈 적재 여부
ls -l /dev/kvm 2>/dev/null || echo "KVM 미사용"
lsns | head                            # 시스템의 namespace 목록
ls /sys/fs/cgroup | head               # cgroup 계층
virsh list --all 2>/dev/null || echo "libvirt 미설치"
docker ps -a 2>/dev/null || echo "Docker 미설치"
```

## VirtualBox — Type 2의 대표

**VirtualBox**는 오라클이 배포하는 대표적 Type 2 하이퍼바이저다. GUI 외에 **`VBoxManage`** 명령행 도구를 제공하며, `VBoxManage <하위명령> <VM이름> [옵션]` 구조로 일관된다.

```bash
VBoxManage list vms                          # 등록된 VM 목록(실행 중만: list runningvms)
VBoxManage showvminfo "vm1"                  # VM 상세 정보
VBoxManage startvm "vm1" --type headless     # GUI 없이 백그라운드로 시작
VBoxManage controlvm "vm1" acpipowerbutton   # 정상 종료 요청(강제: poweroff)
VBoxManage modifyvm "vm1" --memory 2048      # 설정 변경(메모리)
VBoxManage snapshot "vm1" take "before-update"   # 스냅샷 생성
```

함께 설치하는 **Guest Additions**는 게스트 안에 넣는 보조 드라이버로 해상도 자동 조절·클립보드 공유·공유 폴더를 가능하게 한다(VMware Tools와 같은 역할).

## 암기 팁

가상화 문제는 **"같은 일을 하는 다른 도구의 명령"**을 짝짓거나 비슷한 이름을 뒤바꾼 보기로 나온다. 세 도구의 대응은 `전체 목록`=`virsh list --all`/`docker ps -a`/`VBoxManage list vms`, `강제 종료`=`virsh destroy`/`docker kill`/`controlvm poweroff`, `삭제`=`virsh undefine`/`docker rm`/`unregistervm` 순으로 묶어 외운다.

| 헷갈리는 짝 | 구분법 |
|-------------|--------|
| `docker rm` vs `docker rmi` | `i`가 붙으면 **image** 삭제 |
| `virsh destroy` vs `undefine` | destroy=**강제 종료**, undefine=**정의 삭제** |
| `RUN` vs `CMD` | RUN=**빌드 시점**, CMD=**실행 시점** |
| Type 1 vs Type 2 | 아래가 **하드웨어**면 1, **호스트 OS**면 2 |
| 전가상화 vs 반가상화 | 게스트 커널 수정이 **불필요**면 전, **필요**면 반 |
| VM vs 컨테이너 | 커널이 **따로** 있으면 VM, **공유**하면 컨테이너 |

## 마무리

가상화의 갈림길은 게스트가 **자기 커널을 갖는가(VM)**, **호스트 커널을 공유하는가(컨테이너)** 하나뿐이다. VM 쪽은 게스트 수정이 필요 없는 **전가상화**(KVM·ESXi)와 커널을 고치는 **반가상화**(Xen PV), 하드웨어 바로 위의 **Type 1**(Xen·ESXi·Hyper-V·KVM)과 호스트 OS 위의 **Type 2**(VirtualBox)로 나뉜다. 리눅스 표준 **KVM**은 커널 모듈이 CPU·메모리를 가속하고 주변 장치는 **QEMU**, 관리는 **libvirt**·`virsh`가 맡으며 **`destroy`(강제 종료)**와 **`undefine`(정의 삭제)** 구분이 실기의 핵심이다. **컨테이너**는 namespace와 cgroup만으로 성립하며 Docker에서는 **`rm`**/**`rmi`**, `-p 호스트:컨테이너`, Dockerfile의 `RUN`(빌드)·`CMD`(실행)을 익힌다.

## 📝 연습 문제

**문제 1.** 전가상화(Full Virtualization)와 반가상화(Para Virtualization)의 차이로 가장 정확한 것은?

A) 전가상화는 게스트 OS 커널 수정이 필요하고, 반가상화는 필요 없다

B) 전가상화는 게스트 OS를 수정하지 않고 그대로 쓰며, 반가상화는 게스트 커널을 수정해 하이퍼콜로 요청한다

C) 전가상화는 컨테이너 기술이고, 반가상화는 가상 머신 기술이다

D) 두 방식 모두 게스트 OS 없이 동작한다

**정답: B**

해설: 전가상화는 하이퍼바이저가 특권 명령을 가로채 대신 처리하므로 게스트 OS를 수정하지 않아도 되며, 그래서 Windows처럼 소스를 고칠 수 없는 OS도 돌릴 수 있다. 반가상화는 게스트 커널을 수정해 하이퍼콜로 하이퍼바이저에 직접 요청하므로 오버헤드가 적은 대신 커널 수정이 필요하다. A는 둘을 뒤바꿨고, C·D는 가상화 방식과 무관한 서술이다.

---

**문제 2.** Type 1(베어메탈) 하이퍼바이저와 Type 2(호스트형) 하이퍼바이저의 분류가 올바르게 짝지어진 것은?

A) Type 1: VirtualBox / Type 2: KVM

B) Type 1: KVM, Xen, VMware ESXi / Type 2: VirtualBox, VMware Workstation

C) Type 1: Docker / Type 2: Podman

D) Type 1과 Type 2 모두 호스트 OS 위에서 동작한다

**정답: B**

해설: Type 1은 하드웨어 바로 위에서 동작하는 베어메탈 방식으로 KVM·Xen·VMware ESXi·Hyper-V가 해당하고, Type 2는 호스트 OS 위에 응용 프로그램처럼 설치하는 방식으로 VirtualBox·VMware Workstation이 해당한다. A는 둘을 뒤바꿨고, C의 Docker·Podman은 하이퍼바이저가 아니라 컨테이너 엔진이며, D는 Type 1의 정의와 모순된다.

---

**문제 3.** KVM에 대한 설명으로 옳지 않은 것은?

A) 리눅스 커널 모듈로 동작하며 `lsmod | grep kvm`으로 적재 여부를 확인할 수 있다

B) CPU·메모리 가상화를 담당하고 디스크·네트워크 등 주변 장치 에뮬레이션은 QEMU가 맡는다

C) Intel VT-x나 AMD-V 같은 CPU의 하드웨어 가상화 지원을 활용한다

D) 게스트마다 별도의 커널 없이 호스트 커널을 공유하는 컨테이너 기술이다

**정답: D**

해설: D는 컨테이너(Docker·Podman·LXC)에 대한 설명이다. KVM은 가상 머신 기술이므로 게스트마다 자기 커널을 가진 완전한 OS를 부팅한다. A는 KVM이 커널 모듈(kvm, kvm_intel/kvm_amd)이라는 사실, B는 KVM과 QEMU의 분업 관계, C는 하드웨어 가상화 지원 활용으로 모두 옳은 설명이다.

---

**문제 4.** 실행 중인 가상 머신 `vm1`을 강제로 종료(전원 차단)하는 virsh 명령은?

A) `virsh undefine vm1`

B) `virsh destroy vm1`

C) `virsh suspend vm1`

D) `virsh dumpxml vm1`

**정답: B**

해설: `virsh destroy`는 이름과 달리 도메인을 삭제하는 것이 아니라 전원 코드를 뽑듯 강제로 종료하는 명령이며, 디스크와 정의가 남아 `virsh start`로 다시 켤 수 있다. A의 `undefine`은 도메인 정의를 삭제하고, C의 `suspend`는 메모리를 유지한 채 일시 정지하며, D의 `dumpxml`은 설정을 XML로 내보낸다. 정상 종료는 `virsh shutdown`이다.

---

**문제 5.** 가상 머신(VM)과 컨테이너의 근본적 차이로 가장 적절한 것은?

A) VM은 커널을 공유하고 컨테이너는 게스트마다 커널을 갖는다

B) VM은 게스트마다 별도의 커널과 OS를 부팅하지만, 컨테이너는 호스트 커널을 공유하고 namespace·cgroup으로 격리한다

C) VM은 리눅스에서만, 컨테이너는 Windows에서만 동작한다

D) 컨테이너는 하이퍼바이저 위에서만 실행된다

**정답: B**

해설: VM은 하이퍼바이저 위에서 게스트 커널을 새로 부팅하므로 무겁지만 격리가 강하고 다른 OS도 돌릴 수 있다. 컨테이너는 호스트 커널을 공유하면서 namespace(시야 격리)와 cgroup(자원 제한)으로 프로세스를 가두므로 가볍고 빠르다. A는 둘을 뒤바꿨고, C는 사실과 다르며, D는 컨테이너가 하이퍼바이저 없이 커널 기능만으로 성립한다는 점과 모순된다.

---

**문제 6.** Docker에서 컨테이너를 백그라운드로 실행하면서 호스트의 8080 포트를 컨테이너의 80 포트로 연결하는 명령으로 올바른 것은?

A) `docker run -d -p 80:8080 nginx`

B) `docker run -d -p 8080:80 nginx`

C) `docker run -it -v 8080:80 nginx`

D) `docker build -d -p 8080:80 nginx`

**정답: B**

해설: `-p` 옵션은 `호스트포트:컨테이너포트` 순서이므로 호스트 8080을 컨테이너 80에 연결하려면 `-p 8080:80`이고, `-d`는 백그라운드(detached) 실행이다. A는 순서를 뒤집었고, C의 `-v`는 볼륨 마운트 옵션이며 `-it`는 대화형 실행이라 요구 조건과 다르다. D의 `docker build`는 이미지를 빌드하는 명령이라 컨테이너 실행에 쓰지 않는다.

---

**문제 7.** Docker 명령과 그 역할이 잘못 짝지어진 것은?

A) `docker images` — 로컬에 저장된 이미지 목록을 본다

B) `docker exec -it web /bin/bash` — 실행 중인 컨테이너에서 셸을 연다

C) `docker rmi nginx` — nginx라는 이름의 컨테이너를 삭제한다

D) `docker logs -f web` — 컨테이너의 출력 로그를 실시간으로 본다

**정답: C**

해설: `docker rmi`는 **이미지(image)**를 삭제하는 명령이고 컨테이너를 삭제하는 명령은 `docker rm`이다. 끝의 `i`가 image를 뜻한다고 기억하면 헷갈리지 않는다. A는 이미지 목록 조회, B는 실행 중인 컨테이너 안에서 명령을 실행하는 `exec`(`-i` 표준입력 유지 + `-t` 유사 터미널), D는 표준출력 로그를 `-f`로 이어 보는 것으로 모두 옳다.

---

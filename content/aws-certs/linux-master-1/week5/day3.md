# Day 3 - LVM과 스왑: PV·VG·LV 계층 · pvcreate부터 lvextend·resize2fs · mkswap·swapon

Day 2의 파티션 방식에는 치명적 한계가 있다. **파티션은 한 번 크기를 정하면 늘리기가 까다롭다.** `/home`이 가득 찼는데 옆 파티션에 여유가 있어도, 물리적으로 인접하지 않으면 빌려올 방법이 없다. 데이터 디렉터리를 여러 디스크에 걸쳐 하나로 쓰고 싶어도 불가능하다.

**LVM(Logical Volume Manager)** 은 이 경직성을 깬다. 물리 디스크들을 하나의 "저장 풀(pool)"로 묶고, 그 풀에서 원하는 만큼 잘라 논리 볼륨을 만든다. 디스크를 추가하면 풀이 커지고, 볼륨이 모자라면 풀에서 더 떼어와 **무중단으로 확장**할 수 있다. 리눅스마스터 1급 실기는 이 LVM의 3계층 구조(PV→VG→LV)와 확장 명령 순서를 집요하게 묻는다.

후반부의 **스왑(swap)** 은 별개 주제지만 "디스크를 메모리처럼 쓰는 영역"이라는 점에서 저장 관리의 한 축이다. `mkswap`·`swapon`·`swapoff`와 `/proc/swaps`를 함께 정리한다.

핵심 직관: **LVM은 디스크 ↔ 볼륨 사이에 "추상화 계층"을 끼워, 물리적 제약에서 논리적 사용을 분리한다.** 이 한 문장이 PV/VG/LV가 왜 존재하는지를 설명한다.

## LVM의 3계층: PV → VG → LV

LVM은 아래에서 위로 세 단계를 쌓는다.

| 계층 | 약자 | 정체 | 비유 |
|------|------|------|------|
| **물리 볼륨** | **PV** (Physical Volume) | LVM에 편입된 디스크/파티션 | 물탱크에 붓는 **물병들** |
| **볼륨 그룹** | **VG** (Volume Group) | PV들을 묶은 저장 풀 | 물병을 합친 **물탱크** |
| **논리 볼륨** | **LV** (Logical Volume) | VG에서 잘라낸 사용 단위 | 탱크에서 따라낸 **컵들** |

흐름: 디스크/파티션을 `pvcreate`로 PV로 만들고 → 여러 PV를 `vgcreate`로 묶어 VG를 만들고 → VG에서 `lvcreate`로 LV를 잘라낸다 → LV를 `mkfs`로 포맷하고 마운트해서 쓴다.

```bash
# 전체 생성 흐름 (디스크 sdb, sdc 사용 예)
pvcreate /dev/sdb1 /dev/sdc1        # 1) 두 파티션을 PV로
vgcreate myvg /dev/sdb1 /dev/sdc1   # 2) myvg라는 VG로 묶기
lvcreate -L 10G -n mylv myvg        # 3) myvg에서 10G짜리 LV 'mylv' 생성
mkfs.ext4 /dev/myvg/mylv            # 4) 포맷
mount /dev/myvg/mylv /mnt/data      # 5) 마운트
```

> 💡 **개념**: LV의 장치 경로는 두 형태로 나타난다 — `/dev/<VG이름>/<LV이름>`(예: `/dev/myvg/mylv`)과 `/dev/mapper/<VG>-<LV>`(예: `/dev/mapper/myvg-mylv`). 둘은 같은 것을 가리키는 별칭이다. fstab에는 어느 쪽을 써도 되지만 LV 역시 고유 UUID가 있어 `blkid`로 확인 가능하다.

> 🔍 **더 깊이**: VG는 공간을 **PE(Physical Extent)** 라는 고정 크기 덩어리(기본 4MB)로 쪼개 관리한다. LV의 크기는 사실 PE의 정수배다. `lvcreate -l 100 myvg`처럼 소문자 `-l`을 쓰면 "PE 개수"로, 대문자 `-L 400M`을 쓰면 "용량"으로 지정한다. PE 개념 덕분에 LV가 여러 PV에 흩어져 있어도 연속된 하나의 볼륨처럼 보인다.

> 📚 **유래/사례**: LVM의 진짜 위력은 "디스크를 끄지 않고" 용량을 다룬다는 점이다. 운영 중인 서버의 `/var`가 가득 찼을 때, 새 디스크를 PV로 추가해 VG를 키우고(`vgextend`) LV를 늘린(`lvextend`) 뒤 파일시스템까지 확장하면 — 서비스 중단 없이 공간이 늘어난다. 전통적 파티션으로는 불가능한 이 유연성이 LVM이 서버에서 표준이 된 이유다.

## LV 확장: lvextend와 resize2fs/xfs_growfs

가장 자주 출제되는 시나리오가 **LV 확장**이다. 두 단계로 나뉘는 게 핵심이다.

1. **LV(컨테이너) 자체를 늘린다** — `lvextend`
2. **그 위의 파일시스템을 늘린다** — `resize2fs`(ext) 또는 `xfs_growfs`(xfs)

```bash
# VG에 여유가 있을 때 LV를 5G 더 늘리기
lvextend -L +5G /dev/myvg/mylv     # +5G 추가 (절대값은 -L 15G)
resize2fs /dev/myvg/mylv           # ext4 파일시스템을 LV 크기에 맞춤
# xfs라면:
xfs_growfs /mnt/data               # (마운트포인트 지정, 온라인 확장)

# 두 단계를 한 번에 (ext만, -r = resize fs까지):
lvextend -r -L +5G /dev/myvg/mylv
```

> 💡 **개념**: **LV를 늘려도 그 위 파일시스템은 자동으로 안 커진다.** `lvextend`는 "그릇"을 키울 뿐이고, 그릇 안의 "내용물(파일시스템)"은 `resize2fs`/`xfs_growfs`로 따로 늘려야 한다. 이 2단계를 빠뜨려 "LV는 커졌는데 `df`상 용량은 그대로"인 게 단골 함정이다. 시험: "lvextend 후 ext4 용량 반영 명령은?" → `resize2fs`.

> ⚠️ **함정**: `resize2fs`(ext4)는 **온라인(마운트 상태)에서 확장**이 가능하고 **축소는 반드시 언마운트** 후에만 된다. 반면 **xfs는 축소 자체가 불가능**하다(`xfs_growfs`는 확장 전용). 그래서 "xfs LV를 줄이려면?" → 백업 후 재생성밖에 없다. 확장 인자도 다르다 — `resize2fs`는 장치 경로를, `xfs_growfs`는 마운트포인트를 받는다.

> 🔍 **더 깊이**: VG에 여유 공간이 없으면 LV를 늘리기 전에 **VG부터 키워야** 한다. 새 디스크를 `pvcreate`로 PV로 만든 뒤 `vgextend myvg /dev/sdd1`로 VG에 편입하면 VG의 가용 PE가 늘어난다. `vgdisplay myvg`의 "Free PE / Size"로 여유를 확인한다. 전체 순서: pvcreate → vgextend → lvextend → resize2fs.

```bash
# 직접 쳐보기 — LVM 상태 조회 3종
pvs / pvdisplay        # PV 목록 / 상세
vgs / vgdisplay        # VG 목록 / 상세 (Free PE 확인)
lvs / lvdisplay        # LV 목록 / 상세
lsblk                  # 디스크-PV-LV 관계 트리
```

## LVM 명령어 한눈에 정리

계층별 주요 명령을 표로 묶어둔다 — 단답 대비용.

| 동작 | PV | VG | LV |
|------|----|----|-----|
| 생성 | `pvcreate` | `vgcreate` | `lvcreate` |
| 조회(간략/상세) | `pvs`/`pvdisplay` | `vgs`/`vgdisplay` | `lvs`/`lvdisplay` |
| 확장 | — | `vgextend` | `lvextend` |
| 축소/제거 | `pvremove` | `vgreduce`/`vgremove` | `lvreduce`/`lvremove` |
| 이름변경 | — | `vgrename` | `lvrename` |

> ⚠️ **함정**: `lvcreate`에서 `-L`(대문자, 용량: `-L 10G`)과 `-l`(소문자, PE개수/백분율: `-l 100` 또는 `-l 100%FREE`)을 혼동하지 말 것. "VG의 남은 공간 전부로 LV 생성"은 `lvcreate -l 100%FREE -n mylv myvg`다. 그리고 `-n`은 LV 이름 지정 옵션이다.

> 💡 **개념**: LVM 스냅샷(`lvcreate -s`)은 특정 시점의 LV를 "동결"해 백업 중 일관성을 보장한다. CoW(Copy-on-Write)로 변경분만 따로 저장하므로 처음엔 거의 공간을 안 먹는다. 백업 도중 원본이 바뀌어도 스냅샷은 그 순간을 유지한다.

## 스왑(swap) — 디스크를 가상 메모리로

**스왑**은 물리 메모리(RAM)가 부족할 때 당장 안 쓰는 메모리 페이지를 디스크로 잠시 내보내(swap out) RAM을 확보하는 영역이다. 스왑은 **파일시스템이 아니다** — 마운트하지 않고, 전용 포맷(`mkswap`)으로 초기화한 뒤 커널에 등록(`swapon`)해서 쓴다.

스왑은 두 형태가 가능하다:
- **스왑 파티션**: 파티션 타입을 `82`로 만든 전용 파티션
- **스왑 파일**: 일반 파일을 스왑으로 사용(유연하지만 약간 느림)

```bash
# 스왑 파티션 만들기
mkswap /dev/sdb2           # 파티션을 스왑 영역으로 초기화
swapon /dev/sdb2           # 활성화
swapoff /dev/sdb2          # 비활성화

# 스왑 파일 만들기 (2GB)
dd if=/dev/zero of=/swapfile bs=1M count=2048   # 또는 fallocate -l 2G /swapfile
chmod 600 /swapfile        # 보안상 600 권장
mkswap /swapfile
swapon /swapfile

# 상태 확인
swapon -s          # 또는 cat /proc/swaps
free -h            # Swap 행에서 총량/사용량 확인
```

> 💡 **개념**: `mkswap`은 파일시스템을 만드는 게 아니라 **스왑 시그니처와 헤더를 쓰는** 별도 작업이다. 그래서 스왑은 `mount`가 아니라 `swapon`으로 켠다. "스왑 영역을 초기화하는 명령은?" → `mkswap`, "활성화는?" → `swapon`이 정석 단답.

> ⚠️ **함정**: 스왑을 부팅 시 자동 활성화하려면 fstab에 등록한다. 단 형식이 일반 파일시스템과 다르다 — **마운트포인트 자리에 `none`(또는 `swap`), 타입에 `swap`, 옵션에 `sw`**, pass·dump는 0이다:
> ```
> /dev/sdb2  none  swap  sw  0  0
> /swapfile  none  swap  sw  0  0
> ```
> 등록 후 `swapon -a`로 fstab의 모든 스왑을 일괄 활성화한다.

> 🔍 **더 깊이**: 커널이 얼마나 적극적으로 스왑을 쓸지는 `vm.swappiness`(0~100, 기본 60)로 조절한다. 값이 낮으면 RAM을 최대한 쓰고 스왑을 아끼며, 높으면 일찍부터 스왑으로 밀어낸다. `sysctl vm.swappiness=10`으로 임시 변경, `/etc/sysctl.conf`에 적어 영구화한다. 데이터베이스 서버는 스왑 발생 시 성능이 급락하므로 swappiness를 낮게 잡는 경우가 많다.

> 📚 **유래/사례**: 스왑 크기는 한때 "RAM의 2배"가 정설이었지만, RAM이 수십 GB인 현대 시스템에선 의미가 옅어졌다. 다만 **하이버네이션(hibernate, RAM 전체를 디스크로 저장)** 을 쓰려면 스왑이 RAM 이상이어야 한다 — RAM 내용을 통째로 담아야 하기 때문이다. 이 예외는 알아둘 만하다.

```bash
# 직접 쳐보기 — 스왑 전체 흐름
free -h                    # 현재 메모리/스왑
swapon -s                  # 활성 스왑 목록
fallocate -l 1G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
swapon -s                  # /swapfile이 추가됐는지
swapoff /swapfile          # 정리
```

## 마무리

오늘의 두 기둥: **LVM**과 **스왑**. LVM은 **PV(디스크)→VG(풀)→LV(사용단위)** 3계층으로, 생성은 `pvcreate→vgcreate→lvcreate`, 확장은 **`lvextend`(그릇) + `resize2fs`/`xfs_growfs`(내용물)** 2단계가 핵심이다(VG 부족 시 `vgextend` 선행). xfs는 축소 불가·`xfs_growfs`는 마운트포인트 인자, ext4 `resize2fs`는 온라인 확장 가능. 스왑은 파일시스템이 아니라 `mkswap`으로 초기화하고 `swapon`으로 켜며, fstab에는 `none swap sw 0 0`으로 등록한다. 다음 Day 4에서는 RAID 레벨별 패리티와 mdadm, 디스크 쿼터, 그리고 fsck·df·du·lsblk·blkid 점검 도구를 다룬다.

## 📝 연습 문제

**문제 1.** LVM의 구성 계층을 아래에서 위로(물리→논리) 올바른 순서로 나열한 것은?

A) LV → VG → PV
B) PV → LV → VG
C) PV → VG → LV
D) VG → PV → LV

**정답: C**

해설: 디스크/파티션을 PV(Physical Volume)로 만들고, 여러 PV를 묶어 VG(Volume Group) 풀을 만들며, VG에서 잘라내 LV(Logical Volume)를 만든다. 생성 명령도 pvcreate→vgcreate→lvcreate 순이다.

---

**문제 2.** `lvextend -L +5G /dev/myvg/mylv`로 LV를 늘린 뒤, 그 위 ext4 파일시스템의 용량까지 실제로 반영하려면 추가로 실행해야 하는 명령은?

A) `mkfs.ext4 /dev/myvg/mylv`
B) `resize2fs /dev/myvg/mylv`
C) `xfs_growfs /dev/myvg/mylv`
D) `mount -a`

**정답: B**

해설: lvextend는 LV(그릇)만 키운다. ext 계열 파일시스템 용량을 LV 크기에 맞추려면 `resize2fs`를 따로 실행해야 한다. xfs라면 `xfs_growfs`(마운트포인트 인자)를 쓴다.

---

**문제 3.** 스왑 영역(swap)에 대한 설명으로 옳지 않은 것은?

A) `mkswap`으로 스왑 시그니처를 기록해 초기화한다
B) `swapon`으로 활성화하고 `swapoff`로 비활성화한다
C) 일반 파일시스템처럼 `mount` 명령으로 디렉터리에 마운트해서 사용한다
D) 스왑 파티션뿐 아니라 일반 파일(스왑 파일)도 스왑으로 쓸 수 있다

**정답: C**

해설: 스왑은 파일시스템이 아니므로 마운트하지 않는다. `mkswap`으로 초기화하고 `swapon`으로 커널에 등록해 사용한다. 활성 스왑은 `swapon -s`나 `/proc/swaps`로 확인한다.

---

**문제 4.** 기존 VG에 남은 공간이 없을 때, 새 디스크 `/dev/sdd1`을 추가해 LV를 확장하려 한다. 올바른 명령 순서는?

A) lvextend → pvcreate → vgextend → resize2fs
B) pvcreate → vgextend → lvextend → resize2fs
C) vgextend → pvcreate → lvextend → resize2fs
D) pvcreate → lvextend → vgextend → resize2fs

**정답: B**

해설: 새 디스크를 PV로 만들고(`pvcreate`), VG에 편입해 풀을 키우고(`vgextend`), LV를 늘린 뒤(`lvextend`), 파일시스템을 확장(`resize2fs`)한다.

---

**문제 5.** `/etc/fstab`에 스왑 파티션 `/dev/sdb2`를 부팅 시 자동 활성화하도록 등록할 때 올바른 형식은?

A) `/dev/sdb2  /swap  swap  defaults  0  2`
B) `/dev/sdb2  none   swap  sw        0  0`
C) `/dev/sdb2  swap   ext4  sw        1  1`
D) `/dev/sdb2  /mnt   swap  auto      0  1`

**정답: B**

해설: 스왑은 마운트포인트가 없으므로 `none`(또는 swap), 타입은 `swap`, 옵션은 `sw`, dump·pass는 모두 0이다. `swapon -a`로 일괄 활성화한다.

---

**문제 6.** VG의 남은 공간 전부를 사용해 LV를 만드는 명령으로 옳은 것은?

A) `lvcreate -L 100% -n mylv myvg`
B) `lvcreate -l 100%FREE -n mylv myvg`
C) `lvextend -L 100% myvg`
D) `vgcreate -l 100%FREE mylv myvg`

**정답: B**

해설: `-l`(소문자)은 PE 개수/백분율 지정으로 `100%FREE`는 VG의 남은 공간 전부를 의미한다. `-n`은 LV 이름, `-L`(대문자)은 절대 용량 지정이다.

---

**문제 7.** xfs 파일시스템으로 포맷된 LV에 대한 설명으로 옳은 것은?

A) `xfs_growfs`로 확장과 축소가 모두 가능하다
B) `resize2fs`로 온라인 확장이 가능하다
C) `xfs_growfs`로 확장만 가능하며 축소는 불가능하다
D) 마운트된 상태에서는 확장할 수 없다

**정답: C**

해설: xfs는 `xfs_growfs`(마운트포인트 인자)로 온라인 확장만 가능하고 축소는 지원하지 않는다. 줄이려면 백업 후 재생성해야 한다. `resize2fs`는 ext 계열 전용이다.

---

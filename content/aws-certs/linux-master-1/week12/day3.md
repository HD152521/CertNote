# Day 3 - 디스크·LVM·권한 작업형: 시나리오를 명령 순서로 풀어내기

실기 시스템 작업형에서 가장 배점이 크고 단계가 많은 영역이 **디스크 관리**다. "새 디스크를 추가해 `/data`에 마운트하고 부팅 후에도 유지되게 하라"는 한 문장이 사실은 **파티션 생성 → 파일시스템 생성 → 마운트 → fstab 등록**이라는 4단계 명령 흐름을 요구한다. 여기에 **LVM(Logical Volume Manager)**까지 더해지면 "물리 볼륨 → 볼륨 그룹 → 논리 볼륨 → 확장"의 또 다른 명령 체인이 생긴다. 그리고 권한 작업형은 `chmod`/`umask`/특수 권한(SetUID·SetGID·Sticky bit)을 시나리오에 맞게 조합하는 능력을 본다. 오늘은 이 세 작업 흐름을 **순서가 있는 명령 시퀀스**로 통째로 외우고, 각 단계에서 어떤 명령·옵션이 들어가는지 정밀하게 익힌다. 작업형은 순서가 틀리면 전체가 무너지므로, 흐름 암기가 핵심이다.

## 일반 디스크 작업: 파티션 → 파일시스템 → 마운트 → fstab

새 디스크 `/dev/sdb`를 추가해 `/data`에 마운트하는 표준 4단계 흐름이다.

```bash
# [0단계] 디스크 인식 확인
fdisk -l                 # 전체 디스크·파티션 목록
lsblk                    # 블록 장치를 트리로 보기

# [1단계] 파티션 생성 (fdisk 또는 parted)
fdisk /dev/sdb
# 대화형: n(새 파티션) → p(주 파티션) → 번호 → 크기 → w(저장)

# [2단계] 파일시스템 생성(포맷)
mkfs -t ext4 /dev/sdb1   # ext4로 포맷
mkfs.ext4 /dev/sdb1      # 위와 동일
mkfs -t xfs /dev/sdb1    # xfs로 포맷
mkfs.xfs /dev/sdb1       # 위와 동일

# [3단계] 마운트 지점 만들고 마운트
mkdir /data
mount /dev/sdb1 /data    # 임시 마운트(재부팅 시 사라짐)
mount -t ext4 /dev/sdb1 /data   # 타입 명시

# [4단계] fstab 등록(영구 마운트)
# /etc/fstab에 추가:
# /dev/sdb1   /data   ext4   defaults   0 2
mount -a                 # fstab 전체 다시 마운트(문법 검증 겸용)
df -h                    # 마운트 결과 확인
```

| 단계 | 명령 | 목적 |
|------|------|------|
| 1 파티션 | `fdisk /dev/sdb` | 디스크를 파티션으로 분할 |
| 2 포맷 | `mkfs -t ext4 /dev/sdb1` | 파일시스템 생성 |
| 3 마운트 | `mount /dev/sdb1 /data` | 디렉터리에 연결 |
| 4 영구화 | `/etc/fstab` 등록 + `mount -a` | 부팅 시 자동 마운트 |

> 💡 **개념**: "디스크를 추가해 마운트" 작업은 항상 **파티션 → 포맷(mkfs) → 마운트(mount) → fstab 등록**의 순서다. 이 4단계 중 하나라도 빠지면 작업이 완성되지 않는다. 특히 "부팅 후에도 유지"라는 조건이 있으면 반드시 fstab 등록까지 해야 한다.

> ⚠️ **함정**: 포맷은 파티션(`/dev/sdb1`)에 하는 것이지 디스크 전체(`/dev/sdb`)에 하는 게 아니다. 또 `mount`만 하면 재부팅 시 사라진다 — 영구 마운트는 `/etc/fstab` 등록이 필수다. `mount -a`는 fstab의 모든 항목을 다시 마운트하므로 fstab 작성 후 검증용으로 쓴다.

```bash
# 스왑 파티션/파일 만들기
mkswap /dev/sdb2         # 스왑 영역 생성
swapon /dev/sdb2         # 스왑 활성화
swapon -s                # 활성 스왑 목록
free -h                  # 메모리·스왑 사용량
# fstab: /dev/sdb2  none  swap  sw  0 0
```

> 🔍 **더 깊이**: 마운트 정보 확인은 `mount`(현재 마운트 목록), `df -h`(용량·사용률), `lsblk`(장치 트리), `blkid`(UUID·타입)로 한다. UUID로 마운트하려면 `blkid`로 UUID를 알아내 fstab에 `UUID=...` 형태로 적는다. 장치명(`/dev/sdb1`)은 디스크 추가 시 바뀔 수 있어 UUID가 더 안전하다.

## LVM 작업: PV → VG → LV → 확장

LVM은 디스크를 유연하게 묶고 나누는 계층 구조다. **물리 볼륨(PV) → 볼륨 그룹(VG) → 논리 볼륨(LV)** 순서로 쌓는다.

```bash
# [1단계] 물리 볼륨(PV) 생성 — 디스크/파티션을 LVM용으로 초기화
pvcreate /dev/sdb /dev/sdc
pvscan                   # PV 목록
pvdisplay                # PV 상세 정보

# [2단계] 볼륨 그룹(VG) 생성 — PV들을 하나로 묶음
vgcreate vg_data /dev/sdb /dev/sdc
vgscan
vgdisplay                # VG 상세(여유 공간 확인)

# [3단계] 논리 볼륨(LV) 생성 — VG에서 잘라냄
lvcreate -L 10G -n lv_app vg_data    # 10GB짜리 lv_app 생성
lvcreate -l 100%FREE -n lv_all vg_data  # 남은 공간 전부
lvscan
lvdisplay                # LV 상세, 경로는 /dev/vg_data/lv_app

# [4단계] 파일시스템 생성 + 마운트
mkfs -t ext4 /dev/vg_data/lv_app
mkdir /app
mount /dev/vg_data/lv_app /app
# fstab: /dev/vg_data/lv_app  /app  ext4  defaults  0 2
```

| 계층 | 생성 명령 | 표시 명령 | 의미 |
|------|-----------|-----------|------|
| PV | `pvcreate` | `pvdisplay` | 디스크를 LVM용으로 초기화 |
| VG | `vgcreate` | `vgdisplay` | PV들을 묶은 저장 풀 |
| LV | `lvcreate` | `lvdisplay` | VG에서 잘라낸 논리 디스크 |

> 💡 **개념**: LVM 생성 순서는 **pvcreate → vgcreate → lvcreate**다. 명령 접두어가 `pv`, `vg`, `lv`로 계층을 나타낸다. 만들 때는 위에서 아래로(PV→VG→LV), 지울 때는 반대로(LV→VG→PV) 진행한다.

LVM의 진짜 강점은 **무중단 확장**이다.

```bash
# VG에 새 디스크(PV) 추가
pvcreate /dev/sdd
vgextend vg_data /dev/sdd    # VG에 PV 추가(용량 확장)

# LV 크기 늘리기
lvextend -L +5G /dev/vg_data/lv_app      # 5GB 추가
lvextend -L 20G /dev/vg_data/lv_app      # 총 20GB로
lvextend -l +100%FREE /dev/vg_data/lv_app  # 남은 공간 전부

# ★ LV를 늘린 뒤 파일시스템도 확장해야 실제 용량 증가
resize2fs /dev/vg_data/lv_app    # ext2/3/4용
xfs_growfs /app                  # xfs용 (마운트 지점 지정)

# 한 번에: lvextend -r 옵션 (resize 자동)
lvextend -L +5G -r /dev/vg_data/lv_app
```

> 📚 **빈출**: LV를 확장하는 명령은 `lvextend`다. 그런데 **LV만 늘리면 파일시스템은 그대로**이므로, ext 계열은 `resize2fs`, xfs는 `xfs_growfs`로 파일시스템까지 늘려야 실제 용량이 반영된다. 이 "두 단계"를 빠뜨리는 게 대표적 실수다. `lvextend -r`을 쓰면 resize까지 자동으로 처리한다.

> ⚠️ **함정**: VG 확장은 `vgextend`(PV 추가), LV 확장은 `lvextend`다. 이름이 비슷해 헷갈린다. `vgextend`는 풀을 키우고, `lvextend`는 논리 디스크를 키운다. xfs는 줄일 수 없고(축소 불가) 늘리기만 가능하다는 것도 함정 포인트다.

## 권한 작업형: umask / 특수 권한

### umask: 새 파일·디렉터리의 기본 권한 제어

`umask`는 새로 생성되는 파일·디렉터리의 권한에서 **빼낼 비트**를 지정한다.

```bash
umask              # 현재 umask 출력 (예: 0022)
umask 022          # umask 설정
umask 027          # 더 엄격하게

# 계산: 파일 기본 666, 디렉터리 기본 777에서 umask를 뺌
# umask 022 → 파일 644(rw-r--r--), 디렉터리 755(rwxr-xr-x)
# umask 077 → 파일 600(rw-------), 디렉터리 700(rwx------)
```

| umask | 새 파일 권한 | 새 디렉터리 권한 |
|-------|--------------|------------------|
| 022 | 644 | 755 |
| 027 | 640 | 750 |
| 077 | 600 | 700 |
| 002 | 664 | 775 |

> 💡 **개념**: umask는 "기본 권한에서 **빼는** 마스크"다. 파일은 666에서, 디렉터리는 777에서 umask 값을 뺀다. umask 022면 파일은 666-022=644, 디렉터리는 777-022=755가 된다. 파일에 실행 비트(x)가 기본으로 안 붙는 이유는 시작값이 666이기 때문이다.

### 특수 권한: SetUID / SetGID / Sticky bit

일반 rwx 위에 추가되는 3개의 특수 권한이 실기 단골이다.

```bash
# SetUID (4000) — 실행 시 파일 소유자 권한으로 동작
chmod 4755 /path/program     # rwsr-xr-x
chmod u+s /path/program      # 기호 방식
# 예: /usr/bin/passwd (일반 사용자가 shadow를 고칠 수 있게)

# SetGID (2000) — 실행 시 그룹 권한 / 디렉터리는 그룹 상속
chmod 2755 /path/program     # rwxr-sr-x
chmod g+s /shared_dir        # 디렉터리: 새 파일이 그룹을 상속
# 예: 공유 디렉터리에서 팀 그룹 유지

# Sticky bit (1000) — 디렉터리: 소유자만 자기 파일 삭제 가능
chmod 1777 /tmp              # rwxrwxrwt
chmod +t /shared_dir         # 기호 방식
# 예: /tmp (누구나 쓰지만 남의 파일은 못 지움)
```

| 특수 권한 | 8진수 | 기호 | 표시 위치 | 효과 |
|-----------|-------|------|-----------|------|
| SetUID | 4000 | `u+s` | 소유자 x자리 `s` | 소유자 권한으로 실행 |
| SetGID | 2000 | `g+s` | 그룹 x자리 `s` | 그룹 권한 실행/그룹 상속 |
| Sticky | 1000 | `+t` | 기타 x자리 `t` | 본인 파일만 삭제 가능 |

`ls -l`에서 권한 문자로 구분한다:
- `-rwsr-xr-x` → SetUID (소유자 x 자리에 s)
- `-rwxr-sr-x` → SetGID (그룹 x 자리에 s)
- `drwxrwxrwt` → Sticky bit (기타 x 자리에 t)

> 📚 **빈출**: 특수 권한 8진수는 일반 권한 앞에 한 자리 더 붙인다. `chmod 4755`의 맨 앞 `4`가 SetUID, `2`가 SetGID, `1`이 Sticky bit다. `/tmp`가 `1777`(Sticky), `/usr/bin/passwd`가 `4755`(SetUID)인 것을 외워라.

> 🔍 **더 깊이**: 대문자 `S`/`T`가 보이면(예: `rwSr--r--`) 그건 해당 위치에 **실행 권한(x)이 없는** 상태에서 특수 비트만 켜진 것으로, 보통 의도치 않은 설정이다. 소문자 `s`/`t`는 실행 권한이 함께 있는 정상 상태다.

## 직접 쳐보기

```bash
# 디스크 상태 확인 (안전한 조회 명령)
lsblk
df -h
blkid
mount | column -t

# LVM 상태 확인 (LVM 설치된 환경에서)
pvscan; vgscan; lvscan
vgdisplay 2>/dev/null

# umask 실험
umask                    # 현재 값 확인
mkdir testdir && touch testfile
ls -ld testdir testfile  # 권한 확인
umask 077
mkdir testdir2 && touch testfile2
ls -ld testdir2 testfile2  # 더 엄격해진 권한 확인

# 특수 권한 확인
ls -l /usr/bin/passwd    # rwsr-xr-x (SetUID)
ls -ld /tmp              # rwxrwxrwt (Sticky)
```

## 작업 순서 암기 카드

| 시나리오 | 명령 순서 |
|----------|-----------|
| 새 디스크 마운트 | `fdisk` → `mkfs -t ext4` → `mount` → fstab 등록 |
| 영구 마운트 보장 | `/etc/fstab`에 추가 후 `mount -a` |
| 스왑 추가 | `mkswap` → `swapon` |
| LVM 생성 | `pvcreate` → `vgcreate` → `lvcreate` |
| LVM 용량 확장 | `vgextend`(PV추가) → `lvextend` → `resize2fs`/`xfs_growfs` |
| 새 파일 기본권한 644 | `umask 022` |
| 소유자 권한으로 실행 | `chmod 4755`(SetUID) |
| 공유 디렉터리 그룹 상속 | `chmod g+s` (SetGID) |
| /tmp식 안전 공유 | `chmod 1777` (Sticky) |

디스크·LVM 작업형은 "순서를 외우면 풀린다". 각 단계의 명령 접두어(pv/vg/lv)와 마무리 단계(fstab, resize2fs)를 절대 빠뜨리지 마라. 다음 날은 프로세스·스케줄링·systemd 작업형으로 시스템 운영의 나머지 절반을 채운다.

## 📝 연습 문제

**문제 1.** 새 파티션 `/dev/sdb1`을 ext4로 포맷하는 명령으로 옳은 것은?

A) fdisk -t ext4 /dev/sdb1
B) mkfs -t ext4 /dev/sdb1
C) mount -t ext4 /dev/sdb1
D) fsck -t ext4 /dev/sdb1

**정답: B**

해설: 파일시스템 생성(포맷)은 `mkfs -t ext4`(또는 `mkfs.ext4`)로 한다. `fdisk`는 파티션 생성, `mount`는 마운트, `fsck`는 파일시스템 검사 도구다.

---

**문제 2.** 부팅 시 자동으로 마운트되도록 디스크를 영구 등록하려면 어느 파일을 수정해야 하는가?

A) /etc/mtab
B) /etc/fstab
C) /etc/sysctl.conf
D) /proc/mounts

**정답: B**

해설: 부팅 시 자동 마운트는 `/etc/fstab`에 등록한다. `/etc/mtab`과 `/proc/mounts`는 현재 마운트 상태를 보여주는 파일이며, `/etc/sysctl.conf`는 커널 파라미터 설정 파일이다.

---

**문제 3.** LVM 구성 시 가장 먼저 디스크를 LVM용으로 초기화하는 명령은?

A) vgcreate
B) lvcreate
C) pvcreate
D) mkfs

**정답: C**

해설: LVM은 PV→VG→LV 순으로 만들며, 가장 먼저 `pvcreate`로 디스크/파티션을 물리 볼륨으로 초기화한다. `vgcreate`는 볼륨 그룹, `lvcreate`는 논리 볼륨 생성이다.

---

**문제 4.** 논리 볼륨 `lv_app`을 5GB 확장한 뒤 ext4 파일시스템까지 실제로 늘리려면 lvextend 다음에 실행할 명령은?

A) xfs_growfs /dev/vg_data/lv_app
B) vgextend /dev/vg_data/lv_app
C) resize2fs /dev/vg_data/lv_app
D) mkfs.ext4 /dev/vg_data/lv_app

**정답: C**

해설: ext2/3/4 파일시스템 확장은 `resize2fs`로 한다. `xfs_growfs`는 xfs 전용, `vgextend`는 VG에 PV를 추가하는 명령, `mkfs.ext4`는 포맷(기존 데이터 삭제)이다.

---

**문제 5.** `umask` 값이 022일 때 새로 생성되는 일반 파일의 권한은?

A) 755
B) 644
C) 600
D) 666

**정답: B**

해설: 파일의 기본 권한 666에서 umask 022를 빼면 644(rw-r--r--)가 된다. 755는 디렉터리(777-022)의 결과, 600은 umask 077일 때, 666은 umask가 000일 때 파일 권한이다.

---

**문제 6.** `/usr/bin/passwd`처럼 실행 시 파일 소유자(root)의 권한으로 동작하게 하는 특수 권한과 8진수 표현은?

A) Sticky bit, 1755
B) SetGID, 2755
C) SetUID, 4755
D) SetUID, 2755

**정답: C**

해설: SetUID는 8진수 4000으로, `chmod 4755`처럼 일반 권한 앞에 4를 붙인다. 실행 시 프로세스가 파일 소유자 권한을 갖는다. SetGID는 2000, Sticky bit는 1000이다.

---

**문제 7.** `/tmp`처럼 누구나 파일을 만들 수 있지만 자기 파일만 삭제할 수 있게 하는 특수 권한 설정 명령은?

A) chmod 4777 /tmp
B) chmod 2777 /tmp
C) chmod 1777 /tmp
D) chmod 0777 /tmp

**정답: C**

해설: Sticky bit(8진수 1000)를 설정하면 디렉터리 안에서 본인 소유 파일만 삭제할 수 있다. `chmod 1777 /tmp`가 정답이며 `ls -ld`에서 `rwxrwxrwt`로 표시된다. 4는 SetUID, 2는 SetGID다.

---

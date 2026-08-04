# Day 5 - Week 5 종합 복습: 파일시스템·파티션·LVM·스왑·RAID·쿼터 총정리와 실전 연습

## 📌 핵심 정리

- 한 문장 흐름: **물리 디스크 → 파티션 → (선택: RAID/LVM) → mkfs → mount/fstab → 쿼터·점검**.
- Day1은 데이터 표현(inode·블록·저널), Day2는 공간 구획과 연결(파티션·mkfs·fstab)이다.
- Day3은 유연성과 가상메모리(LVM 3계층·확장 2단계·스왑), Day4는 안전성·공정성·진단(RAID·쿼터·점검).
- 최빈출 6종: **fstab 6필드 · LVM 확장 2단계 · RAID 최소 디스크 · 쿼터 soft/hard · df vs du · fsck 언마운트**.
- 명령을 외우되 **"어느 계층에서 무엇을 푸는가"**로 묶어 기억하면 변형 문제에도 흔들리지 않는다.

## 전체 흐름 한눈에 — 디스크에서 운영까지

```
[물리 디스크]
   │  fdisk/gdisk/parted (파티션)
   ▼
[파티션]  ──(여러 장)──> [RAID: mdadm] 또는 [LVM: pvcreate→vgcreate→lvcreate]
   │
   ▼  mkfs.ext4 / mkfs.xfs (포맷)
[파일시스템]
   │  mount (일시) / /etc/fstab (영구)
   ▼
[마운트된 디렉터리]
   │  quota (사용량 제한) / df·du·fsck (점검)
   ▼
[운영]
```

| 단계 | 도구 | Day |
|------|------|-----|
| 파일시스템 이해(inode/블록/저널) | stat, tune2fs, dumpe2fs | Day1 |
| 파티션 | fdisk, gdisk, parted | Day2 |
| 포맷 | mkfs.*, mke2fs | Day2 |
| 마운트/영구화 | mount, umount, /etc/fstab | Day2 |
| 유연한 볼륨 | pvcreate, vgcreate, lvcreate, lvextend | Day3 |
| 가상메모리 | mkswap, swapon, swapoff | Day3 |
| 중복성 | mdadm (RAID) | Day4 |
| 사용량 제한 | quotacheck, quotaon, edquota | Day4 |
| 점검 | fsck, df, du, lsblk, blkid | Day4 |

## Day 1 핵심 재정리 — 파일시스템과 구조

- **inode**: 파일의 메타데이터(권한·소유자·크기·블록포인터·타임스탬프). **파일 이름은 inode에 없다** — 부모 디렉터리가 "이름→inode번호"를 보유.
- **블록**: 공간 할당 최소 단위(보통 4KB). 작은 파일도 한 블록 점유 → 내부 단편화.
- **슈퍼블록**: FS 전체 지도. 손상 시 백업 슈퍼블록으로 `fsck -b` 복구.
- **저널링**: 크래시 복구용. ext3/4 기본 `ordered`는 **메타데이터 일관성** 보장(데이터 무손실 아님). 모드: journal > ordered > writeback.
- **ext 계보**: ext2(무저널) → ext3(저널) → ext4(익스텐트·파일16TB·FS1EB).
- **xfs**: 대용량·확장전용(shrink불가). **btrfs**: CoW·스냅샷·체크섬.
- **inode 고갈**: 용량 남아도 파일 생성 실패 → `df -i`로 진단.

> 💡 **개념 복습**: `df -h`(용량)와 `df -i`(inode)는 다른 것을 본다. "용량 충분한데 파일 못 만듦" = inode 고갈, "용량 부족" = 블록 고갈. 둘을 분리해 진단하는 습관이 중요하다.

## Day 2 핵심 재정리 — 파티션·마운트·fstab

- **MBR vs GPT**: MBR=2TB·주4개·단일백업, GPT=무제한·128개·UUID·앞뒤이중백업. MBR 논리 파티션은 5번부터.
- **도구**: fdisk(MBR중심), gdisk(GPT전용), parted(둘다·스크립트). fdisk는 `w`로 저장, `q`로 취소.
- **타입 코드**: 83=Linux, 82=swap, 8e=LVM, fd=RAID.
- **mkfs**: `mkfs.ext4 /dev/sdb1` = `mkfs -t ext4 ...`. 기존 데이터 삭제.
- **mount/umount**: umount 거부("busy") = 사용 중 프로세스(`fuser -m`/`lsof`). `umount -l`=lazy.
- **/etc/fstab 6필드**: **장치(UUID)·마운트포인트·타입·옵션·dump(0)·pass(루트1/나머지2/안함0)**.

> ⚠️ **함정 복습**: fstab 6필드 순서와 5·6번 값(dump=거의0, pass=루트1·나머지2·swap0)은 최빈출. 수정 후 `mount -a`로 검증하지 않으면 부팅 실패 위험.

표로 fstab 한 번 더:

```
UUID=abc  /data  ext4  defaults       0  2    ← 일반 FS
UUID=def  /      ext4  defaults       0  1    ← 루트(pass=1)
/dev/sdb2 none   swap  sw             0  0    ← 스왑(pass=0)
```

## Day 3 핵심 재정리 — LVM·스왑

- **LVM 3계층**: PV(디스크)→VG(풀)→LV(사용단위). 생성: `pvcreate→vgcreate→lvcreate`.
- **LV 확장 2단계**: `lvextend`(그릇) + `resize2fs`(ext) 또는 `xfs_growfs`(xfs, 마운트포인트 인자). VG 부족 시 `vgextend` 선행.
- **명령 매핑**: 조회 `pvs/vgs/lvs`, 확장 `vgextend/lvextend`. `-L`(용량)/`-l`(PE·%, `100%FREE`).
- **스왑**: 파일시스템 아님. `mkswap`(초기화)→`swapon`(활성)→`swapoff`. fstab: `none swap sw 0 0`. `swapon -s`/`free -h`로 확인.

> 💡 **개념 복습**: "LV 늘렸는데 `df`상 그대로" = `resize2fs`/`xfs_growfs` 누락. 그릇과 내용물은 따로 늘린다. xfs는 축소 불가.

## Day 4 핵심 재정리 — RAID·쿼터·점검

RAID 표(최빈출, 통째로):

| 레벨 | 방식 | 최소 디스크 | 고장 허용 | 효율 |
|------|------|-------------|-----------|------|
| 0 | 스트라이프 | 2 | 0 | 100% |
| 1 | 미러 | 2 | 1 | 50% |
| 5 | 분산 패리티 | 3 | 1 | (N-1)/N |
| 6 | 이중 패리티 | 4 | 2 | (N-2)/N |
| 10 | 미러+스트라이프 | 4 | 쌍당1 | 50% |

- **mdadm**: `--create --level --raid-devices`. 상태 `/proc/mdstat`, `mdadm --detail`.
- **쿼터**: fstab `usrquota`→remount→`quotacheck`→`quotaon`→`edquota`. soft(유예·경고) vs hard(즉시차단). 블록·inode 한계 별도.
- **점검**: df(FS용량)·du(경로용량)·lsblk(장치트리)·blkid(UUID)·fsck(무결성, **언마운트 필수**). xfs 복구는 `xfs_repair`.

> ⚠️ **함정 복습**: 최소 디스크 수(0·1=2, 5=3, 6·10=4)와 "RAID1·0은 패리티 없음"이 단골. fsck는 언마운트 상태에서만.

## 핵심 명령어 통합 치트시트

```bash
# 파티션
fdisk /dev/sdb        # MBR (n/d/t/p/w/q)
gdisk /dev/sdb        # GPT
parted /dev/sdb --script mklabel gpt mkpart primary ext4 0% 100%

# 포맷 & 마운트
mkfs.ext4 /dev/sdb1
mount /dev/sdb1 /mnt/data
umount /mnt/data
blkid /dev/sdb1       # UUID 확인 → fstab 등록 → mount -a

# LVM
pvcreate /dev/sdb1; vgcreate vg0 /dev/sdb1; lvcreate -L 10G -n lv0 vg0
lvextend -L +5G /dev/vg0/lv0; resize2fs /dev/vg0/lv0
vgextend vg0 /dev/sdc1

# 스왑
mkswap /dev/sdb2; swapon /dev/sdb2; swapon -s

# RAID
mdadm --create /dev/md0 --level=5 --raid-devices=3 /dev/sd{b,c,d}1
cat /proc/mdstat

# 쿼터
quotacheck -cugm /home; quotaon /home; edquota -u user1; repquota /home

# 점검
df -hT; df -i; du -sh /var; lsblk -f; fsck -y /dev/sdb1
```

> 📚 **연결 시야**: 실무에서는 이 계층들이 겹쳐 쌓인다. 전형적 구성은 **디스크들 → mdadm RAID → LVM PV → VG → LV → ext4/xfs → mount → quota**. 즉 RAID로 안전성을, LVM으로 유연성을, 파일시스템으로 데이터 구조를, 쿼터로 공정성을 각각 담당시킨다. 각 계층이 독립적으로 한 가지 문제를 푸는 설계 철학을 이해하면 응용 문제도 풀린다.

아래 12문항으로 점검하자.

## 📖 용어

- **inode** : 파일의 권한·소유자·크기·블록 위치를 담는 메타데이터 구조. 파일명은 여기 없다.
- **슈퍼블록** : 파일시스템 전체의 지도. 깨지면 백업 사본으로 `fsck -b` 복구한다.
- **저널링 ordered 모드** : ext의 기본값. **메타데이터 일관성**만 보장하고 데이터 무손실은 보장하지 않는다.
- **inode 고갈** : 용량은 남았는데 inode를 다 써서 파일을 못 만드는 상태. `df -i`로 진단한다.
- **MBR / GPT** : 2TB·주 파티션 4개 한계의 옛 테이블과, 128개·사실상 무제한의 현대 테이블.
- **파티션 타입 코드** : 83=Linux, 82=swap, 8e=LVM, fd=RAID.
- **fstab 6필드** : 장치(UUID)·마운트포인트·타입·옵션·dump·pass. pass는 루트 1, 나머지 2, 안 함 0.
- **`mount -a`** : fstab을 전부 적용해 보는 검증 명령. 재부팅 전 필수 절차다.
- **PV / VG / LV** : LVM의 세 계층 — 편입된 디스크, 그것을 묶은 풀, 풀에서 잘라낸 사용 단위.
- **확장 2단계** : `lvextend`로 그릇을 키우고 `resize2fs`/`xfs_growfs`로 내용물을 키운다. 둘 다 해야 `df`에 반영된다.
- **스왑** : RAM 부족 시 페이지를 대피시키는 디스크 영역. `mkswap`으로 만들고 `swapon`으로 켠다.
- **패리티** : 데이터의 XOR 합. RAID 5·6만 쓰며, 죽은 디스크의 내용을 되계산하는 근거다.
- **`/proc/mdstat`** : 소프트웨어 RAID의 상태와 재구축 진행률을 보여주는 파일.
- **soft / hard limit** : 유예기간 동안 경고만 하는 한계와, 즉시 쓰기를 막는 절대 상한.
- **`df` vs `du`** : 파일시스템 메타데이터로 남은 용량을 보는 것과, 경로를 순회해 점유량을 세는 것.
- **`fsck` / `xfs_repair`** : 파일시스템 무결성 검사·복구 도구. fsck는 언마운트 필수, xfs는 전용 도구를 쓴다.

## 📝 연습 문제

**문제 1.** 리눅스 파일시스템에서 파일의 이름이 저장되는 위치로 옳은 것은?

A) 해당 파일의 inode 내부
B) 파일이 속한 부모 디렉터리의 데이터
C) 파일시스템 슈퍼블록
D) 파일의 첫 데이터 블록

**정답: B**

해설: 이름은 inode에 없고, 부모 디렉터리가 "이름→inode번호" 매핑으로 보유한다. inode는 권한·소유자·크기·블록포인터 등 메타데이터만 담는다.

---

**문제 2.** ext3/ext4의 기본 저널링 모드인 ordered가 보장하는 것은?

A) 사용자 데이터의 완전 무손실
B) 파일시스템 메타데이터의 일관성
C) 삭제 파일의 복구
D) 디스크의 물리적 무결성

**정답: B**

해설: ordered는 메타데이터만 저널링해 FS 구조의 일관성을 보장한다. 데이터까지 보호하려면 데이터를 이중 기록하는 journal 모드를 써야 한다.

---

**문제 3.** MBR 파티션 방식의 특성으로 옳지 않은 것은?

A) 최대 디스크 크기는 2TB로 제한된다
B) 주 파티션을 최대 4개까지 만들 수 있다
C) 파티션 식별에 GUID를 사용한다
D) 논리 파티션은 5번부터 번호가 매겨진다

**정답: C**

해설: GUID 기반 식별은 GPT의 특성이다. MBR은 섹터 번호 기반이며 2TB·주4개 제한과 논리 파티션 5번 시작이 특징이다.

---

**문제 4.** `/etc/fstab`에서 루트 파일시스템(`/`)의 6번째 필드(fsck pass)에 지정할 값은?

A) 0
B) 1
C) 2
D) 3

**정답: B**

해설: 루트는 1(가장 먼저 검사), 나머지 검사 대상은 2, 검사 안 할 것(swap 등)은 0이다.

---

**문제 5.** LVM 구성 요소를 물리에서 논리 순서로 올바르게 나열한 것은?

A) LV → VG → PV
B) PV → VG → LV
C) VG → PV → LV
D) PV → LV → VG

**정답: B**

해설: PV(디스크)를 VG(풀)로 묶고, VG에서 LV(사용단위)를 잘라낸다. 생성 명령도 pvcreate→vgcreate→lvcreate 순이다.

---

**문제 6.** `lvextend`로 LV를 늘린 뒤 ext4 파일시스템 용량을 실제로 반영하는 명령은?

A) `mkfs.ext4`
B) `xfs_growfs`
C) `resize2fs`
D) `mount -a`

**정답: C**

해설: lvextend는 LV(그릇)만 키운다. ext4는 `resize2fs`로, xfs는 `xfs_growfs`로 파일시스템을 따로 확장해야 한다.

---

**문제 7.** 스왑 영역에 대한 설명으로 옳은 것은?

A) `mount` 명령으로 디렉터리에 마운트해 사용한다
B) `mkswap`으로 초기화하고 `swapon`으로 활성화한다
C) ext4 파일시스템의 한 종류다
D) 활성 스왑은 `df -h`로 확인한다

**정답: B**

해설: 스왑은 파일시스템이 아니다. `mkswap`으로 시그니처를 기록하고 `swapon`으로 활성화하며, `swapon -s`나 `free -h`로 확인한다.

---

**문제 8.** RAID 5의 최소 디스크 수와 동시 고장 허용 디스크 수로 옳은 것은?

A) 2장, 1장
B) 3장, 1장
C) 4장, 2장
D) 4장, 1장

**정답: B**

해설: RAID 5는 분산 패리티를 위해 최소 3장이 필요하고 1장 고장까지 복구한다. 2장 동시 고장 허용은 RAID 6(최소 4장)이다.

---

**문제 9.** RAID 레벨에 대한 설명으로 옳지 않은 것은?

A) RAID 0은 내결함성이 없다
B) RAID 1은 미러링이며 패리티를 사용하지 않는다
C) RAID 6은 두 장의 동시 고장을 허용한다
D) RAID 10은 패리티를 분산 저장해 용량 효율이 높다

**정답: D**

해설: RAID 10은 미러+스트라이프로 용량 효율 50%이며 패리티를 쓰지 않는다. 패리티 분산은 RAID 5/6의 방식이다.

---

**문제 10.** 디스크 쿼터의 soft limit에 대한 설명으로 옳은 것은?

A) 초과 즉시 쓰기를 차단한다
B) 유예기간 동안 초과를 허용하며 경고한다
C) inode에는 적용되지 않는다
D) 그룹에만 적용된다

**정답: B**

해설: soft limit은 초과해도 유예기간(grace period) 동안 쓰기를 허용하며 경고한다. 즉시 차단하는 것은 hard limit이다.

---

**문제 11.** `df`와 `du`의 차이로 옳은 것은?

A) df는 경로별 사용량, du는 FS 전체 용량을 본다
B) df는 FS 단위 전체/여유 용량, du는 특정 경로의 실제 사용량을 본다
C) 둘은 완전히 동일하다
D) df는 inode만, du는 블록만 본다

**정답: B**

해설: df는 마운트된 파일시스템 단위로 전체·여유 용량을, du는 디렉터리를 순회해 특정 경로가 차지하는 용량을 보여준다.

---

**문제 12.** 파일시스템 무결성 검사 도구 fsck 사용 시 주의사항으로 옳은 것은?

A) 반드시 마운트된 상태에서 검사한다
B) 반드시 언마운트(또는 읽기전용) 상태에서 검사한다
C) 검사 전 반드시 mkfs로 재포맷한다
D) ext4에서는 동작하지 않는다

**정답: B**

해설: 마운트된 FS를 fsck하면 검사 중 내용이 변해 손상될 수 있으므로 언마운트 상태에서 검사해야 한다. xfs는 fsck.xfs가 동작하지 않고 `xfs_repair`로 복구한다.

---

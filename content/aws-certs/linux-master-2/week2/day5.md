# Day 5 - Week 2 종합 복습: 설치에서 부팅까지 한 줄로

## 📌 핵심 정리

- 흐름은 **디스크 → 파티션 → 파일 시스템 → 마운트 → 부팅**이다. 이 순서가 이번 주의 뼈대다.
- 짝을 외운다 — **BIOS·MBR** / **UEFI·GPT·ESP**. 문항 상당수가 이 짝짓기를 묻는다.
- 숫자를 외운다 — MBR **2TB·주 파티션 4개**, FAT32 **단일 파일 4GB**, 런레벨 **0 종료·6 재시작**.
- **저널링은 ext3부터**, **inode에 파일 이름은 없다** — 이 둘은 단독 문항으로 자주 나온다.
- 명령의 **단계**를 구분한다: `fdisk`(나누기) → `mkfs`(씌우기) → `mount`(붙이기) → `fstab`(영구화).

## 한 장 정리

```text
  물리 디스크  /dev/sda
       │
       │  ① 나누기      fdisk · gdisk · parted
       ▼
  파티션      /dev/sda1  /dev/sda2  swap
       │
       │  ② 씌우기      mkfs.ext4 · mkfs.xfs
       ▼
  파일 시스템  ext4 · XFS · FAT32
       │
       │  ③ 붙이기      mount → 일시적
       ▼                /etc/fstab → 영구적
  디렉터리 트리  /  /home  /var
       │
       │  ④ 부팅        BIOS/UEFI → GRUB2 → 커널 → initramfs → systemd
       ▼
  로그인 화면
```

## 짝짓기로 외우는 것

| 왼쪽 | 오른쪽 | 비고 |
|------|--------|------|
| BIOS | MBR | 부트로더가 디스크 첫 섹터에 |
| UEFI | GPT + ESP | Secure Boot 지원 |
| ext3 | 저널링 도입 | ext2에는 없다 |
| XFS | RHEL 7+ 기본 | 대용량에 강함 |
| Btrfs | SUSE 기본 | 스냅샷·압축 |
| LILO | 설정 후 재설치 필요 | 옛 부트로더 |
| GRUB2 | `/etc/default/grub` 편집 | `grub.cfg`는 자동 생성 |
| 런레벨 3 | `multi-user.target` | 텍스트 |
| 런레벨 5 | `graphical.target` | GUI |

## 숫자 정리

| 숫자 | 무엇 |
|------|------|
| **2TB** | MBR이 다룰 수 있는 최대 디스크 크기 |
| **4개** | MBR의 주 파티션 최대 개수 |
| **1개** | 디스크당 확장 파티션 개수 |
| **5번** | 논리 파티션 번호가 시작하는 숫자 |
| **4GB** | FAT32의 단일 파일 크기 한계 |
| **1~2배** | 고전적인 swap 크기 기준(메모리 대비) |
| **0 / 6** | 런레벨 종료 / 재시작 |
| **1** | init(systemd)의 PID |

## 헷갈리는 짝 대조

| 구분 | A | B | 가르는 기준 |
|------|---|---|-----------|
| 주 vs 확장 파티션 | 데이터를 담는다 | **껍데기**, 논리를 담는다 | 직접 저장 가능한가 |
| `/dev/hda` vs `/dev/sda` | 옛 IDE | SATA·SCSI·USB | 인터페이스 종류 |
| ext2 vs ext3 | 저널링 없음 | **저널링 있음** | 장애 복구 속도 |
| FAT32 vs exFAT | 4GB 제한 | 제한 없음 | 단일 파일 크기 |
| `mount` vs `/etc/fstab` | 지금만 | **재부팅 후에도** | 영구성 |
| `mkfs` vs `fsck` | 새로 만든다 | 검사·복구한다 | 만드나 고치나 |
| BIOS vs UEFI | MBR·2TB | GPT·Secure Boot | 펌웨어 세대 |
| init vs systemd | 런레벨 숫자 | target 이름 | 부팅 관리 방식 |

## 자주 틀리는 지점

1. **"확장 파티션에 파일을 저장한다"** → 아니다. 껍데기일 뿐이고 실제 저장은 논리 파티션이 한다.
2. **"논리 파티션은 3번부터"** → **5번부터**다. 주 파티션이 몇 개든 상관없다.
3. **"inode에 파일 이름이 있다"** → 없다. 이름은 디렉터리가 관리한다.
4. **"ext2도 저널링을 지원한다"** → 아니다. **ext3부터**다.
5. **"`grub.cfg`를 직접 고친다"** → 자동 생성 파일이라 덮어써진다. `/etc/default/grub`을 고친다.
6. **"런레벨 0이 재시작"** → 0은 **종료**, 6이 재시작이다.
7. **"`mount`만 하면 계속 유지된다"** → 재부팅하면 사라진다. `/etc/fstab`에 적어야 한다.

## 명령어 정리

| 명령 | 하는 일 |
|------|--------|
| `fdisk -l` | 디스크와 파티션 목록 |
| `lsblk` | 디스크 구조를 트리로 |
| `mkfs.ext4 /dev/sdb1` | 파일 시스템 생성 |
| `mount /dev/sdb1 /data` | 마운트 |
| `umount /data` | 마운트 해제 |
| `df -h` / `df -i` | 용량 / inode 사용량 |
| `fsck /dev/sdb1` | 파일 시스템 검사 |
| `systemctl get-default` | 현재 기본 target |
| `grub2-mkconfig -o …` | GRUB 설정 재생성 |

> 다음 주는 드디어 명령을 직접 두드린다 — 셸 첫걸음부터 파일·디렉터리·계정 명령까지 다룬다.

## 📖 용어

- **파티션 테이블** : 디스크가 어떻게 나뉘어 있는지 기록한 표. MBR과 GPT 두 방식이 있다.
- **ESP** : EFI 시스템 파티션. UEFI 부팅에서 부트로더를 담는 영역.
- **initramfs** : 루트 파일 시스템을 마운트하기 위해 먼저 올리는 임시 파일 시스템.
- **저널링** : 변경 내용을 미리 기록해 장애 복구를 빠르게 하는 기법.
- **하드 링크** : 같은 inode를 가리키는 여러 이름.
- **target** : systemd가 런레벨을 대신해 쓰는 시스템 상태 단위.

## 📝 연습 문제

**문제 1.** 다음 중 리눅스에서 새 디스크를 사용하기까지의 순서로 알맞은 것은?

A) mkfs → fdisk → mount  
B) mount → mkfs → fdisk  
C) fdisk → mount → mkfs  
D) fdisk → mkfs → mount  

**정답: D**  
해설: 먼저 `fdisk` 같은 도구로 디스크를 파티션으로 나누고, `mkfs`로 그 파티션에 파일 시스템을 만든 다음, `mount`로 디렉터리에 연결해야 사용할 수 있습니다. 재부팅 후에도 유지하려면 `/etc/fstab`에 등록합니다.

---

**문제 2.** 다음 중 논리 파티션에 부여되는 장치 번호가 시작하는 숫자로 알맞은 것은?

A) 1  
B) 3  
C) 5  
D) 8  

**정답: C**  
해설: MBR 방식에서 주 파티션은 1~4번을 사용하고, 확장 파티션 안의 논리 파티션은 주 파티션을 몇 개 만들었는지와 무관하게 항상 5번부터 번호가 붙습니다. 예를 들어 주 파티션이 두 개뿐이어도 첫 논리 파티션은 `/dev/sda5`가 됩니다.

---

**문제 3.** 다음 중 파일 시스템의 오류를 검사하고 복구하는 명령으로 알맞은 것은?

A) fsck  
B) mkfs  
C) lsblk  
D) fdisk  

**정답: A**  
해설: `fsck`(file system check)는 파일 시스템의 무결성을 검사하고 손상된 부분을 복구합니다. 검사 중 손상을 막기 위해 마운트를 해제한 상태에서 실행하는 것이 원칙입니다. `mkfs`는 새로 만들고, `fdisk`는 파티션을 나누며, `lsblk`는 구조를 보여줍니다.

---

**문제 4.** 다음 중 BIOS·UEFI와 파티션 방식의 연결로 알맞은 것은?

A) BIOS — GPT, UEFI — MBR  
B) BIOS — MBR, UEFI — GPT  
C) 둘 다 MBR만 사용한다  
D) 둘 다 GPT만 사용한다  

**정답: B**  
해설: 전통적인 BIOS는 MBR 파티션 방식과 함께 사용하며 부트로더를 디스크 첫 섹터에 둡니다. UEFI는 GPT 방식과 짝을 이루고 EFI 시스템 파티션(ESP)에 부트로더를 저장하며, Secure Boot 같은 보안 기능을 제공합니다.

---

**문제 5.** 다음 중 GRUB2에서 설정을 변경한 뒤 반드시 수행해야 하는 작업으로 알맞은 것은?

A) 시스템을 포맷한다  
B) `/boot/grub2/grub.cfg`를 직접 편집한다  
C) LILO를 다시 설치한다  
D) `grub2-mkconfig` 또는 `update-grub`으로 설정을 재생성한다  

**정답: D**  
해설: `/etc/default/grub`을 수정한 뒤에는 `grub2-mkconfig -o /boot/grub2/grub.cfg`(레드햇 계열) 또는 `update-grub`(데비안 계열)을 실행해 실제 읽히는 `grub.cfg`를 다시 만들어야 반영됩니다. `grub.cfg`는 자동 생성 파일이라 직접 편집하면 다음 갱신 때 덮어써집니다.

---

**문제 6.** 다음 중 시스템을 텍스트 모드의 다중 사용자 환경으로 부팅하도록 지정하는 systemd target으로 알맞은 것은?

A) rescue.target  
B) graphical.target  
C) multi-user.target  
D) reboot.target  

**정답: C**  
해설: `multi-user.target`은 옛 런레벨 3에 해당하며 X 윈도 없이 텍스트 기반 다중 사용자 환경으로 부팅합니다. 서버에서 흔히 사용하는 설정입니다. `graphical.target`은 런레벨 5의 GUI 환경, `rescue.target`은 런레벨 1의 복구 모드, `reboot.target`은 런레벨 6의 재시작입니다.

# Day 4 - 부트 매니저: 전원을 켠 순간부터 로그인까지

## 📌 핵심 정리

- 부팅 순서는 **펌웨어(BIOS/UEFI) → 부트로더 → 커널 → initramfs → init(systemd) → 로그인**이다.
- **BIOS는 MBR**을, **UEFI는 GPT와 ESP**를 짝으로 쓴다.
- 리눅스의 표준 부트로더는 **GRUB2**이며, 그 이전에는 **LILO**를 썼다.
- GRUB2에서 사람이 고치는 파일은 **`/etc/default/grub`** 이고, `grub.cfg`는 **직접 편집하지 않는다.**
- 옛 **런레벨**은 systemd에서 **target**으로 바뀌었다. `3`=텍스트, `5`=GUI에 해당한다.

## 부팅의 여섯 단계

```text
 1. 전원 인가
        ▼
 2. 펌웨어 (BIOS 또는 UEFI)     POST — 하드웨어 자체 점검
        ▼                       부팅할 장치 선택
 3. 부트로더 (GRUB2)            커널을 찾아 메모리에 올린다
        ▼
 4. 커널 로드                   하드웨어 초기화
        ▼
 5. initramfs                  루트 파일 시스템을 마운트할 임시 도구 모음
        ▼
 6. init / systemd (PID 1)      서비스 시작 → 로그인 화면
```

- **PID 1** 은 커널이 띄우는 **첫 번째 프로세스**다. 예전엔 `init`, 지금은 대부분 `systemd`다.
- **initramfs**가 필요한 이유: 루트 파일 시스템이 담긴 디스크의 드라이버가 아직 없을 수 있다. 그 드라이버를 담은 임시 파일 시스템을 먼저 메모리에 올린다.

## BIOS와 UEFI

| 구분 | BIOS | UEFI |
|------|------|------|
| 등장 | 오래됨 | 현대적 대체품 |
| 파티션 방식 | **MBR** | **GPT** |
| 부트로더 위치 | 디스크 첫 섹터(MBR) | **ESP**(EFI 시스템 파티션) |
| 디스크 한계 | 2TB | 사실상 없음 |
| 화면 | 텍스트 | 그래픽·마우스 가능 |
| 보안 기능 | 없음 | **Secure Boot** |

- **POST(Power-On Self-Test)** 는 펌웨어가 하는 하드웨어 자체 점검이다. 메모리·키보드·디스크가 정상인지 본다.
- **Secure Boot**는 서명되지 않은 부트로더의 실행을 막는 기능이다. 리눅스 설치 시 이것 때문에 막히는 경우가 있다.

## 부트로더

| 이름 | 설명 |
|------|------|
| **LILO** | LInux LOader. 옛 부트로더. **설정을 바꾸면 다시 설치해야** 반영된다 |
| **GRUB** (legacy) | LILO를 대체. 부팅 시 편집 가능 |
| **GRUB2** | **현재 표준.** 설정 구조가 GRUB과 다르다 |

> LILO와 GRUB의 결정적 차이: LILO는 `/etc/lilo.conf`를 고친 뒤 **`lilo` 명령으로 다시 써 넣어야** 하지만, GRUB은 설정 파일을 읽어 동작하므로 그 과정이 필요 없다.

### GRUB2 설정 파일

| 파일 | 역할 | 직접 고치나? |
|------|------|------------|
| `/etc/default/grub` | 기본 타임아웃, 기본 메뉴 등 | **여기를 고친다** |
| `/etc/grub.d/` | 메뉴 항목을 만드는 스크립트 | 필요할 때만 |
| `/boot/grub2/grub.cfg` | 실제로 읽히는 최종 설정 | **직접 고치지 않는다** |

```bash
# /etc/default/grub 을 고친 뒤 반드시 실행해 grub.cfg 를 다시 만든다
grub2-mkconfig -o /boot/grub2/grub.cfg     # 레드햇 계열
update-grub                                 # 데비안 계열
```

- `grub.cfg`는 **자동 생성되는 파일**이다. 직접 고쳐도 다음 갱신 때 덮어써진다.
- 자주 쓰는 설정: `GRUB_TIMEOUT`(메뉴 대기 시간), `GRUB_DEFAULT`(기본 선택 항목).

## 런레벨과 systemd target

옛 System V 방식의 **런레벨**은 시스템의 동작 모드를 숫자로 나타냈다.

| 런레벨 | 뜻 | systemd target |
|-------|-----|----------------|
| 0 | 시스템 종료 | `poweroff.target` |
| 1 | 단일 사용자 모드(복구) | `rescue.target` |
| 3 | **텍스트 다중 사용자** | `multi-user.target` |
| 5 | **GUI 다중 사용자** | `graphical.target` |
| 6 | 재시작 | `reboot.target` |

- **0=종료, 6=재시작**을 먼저 외우면 나머지가 정리된다. 이 둘을 기본값으로 두면 부팅이 끝나지 않는다.
- **3과 5의 차이는 X 윈도(GUI)의 유무**다.
- 2와 4는 배포판마다 쓰임이 다르거나 비워둔다.

```bash
systemctl get-default              # 현재 기본 target
systemctl set-default multi-user.target   # 텍스트 모드로 부팅하게 변경
systemctl isolate graphical.target        # 지금 즉시 GUI 모드로 전환
```

> 내일은 이번 주에 다룬 설치·파티션·파일 시스템·부팅을 한 장으로 묶는다.

## 📖 용어

- **POST** : 전원을 켰을 때 펌웨어가 수행하는 하드웨어 자체 점검.
- **BIOS** : 전통적인 펌웨어. MBR 파티션과 짝을 이룬다.
- **UEFI** : BIOS를 대체한 현대적 펌웨어. GPT·ESP·Secure Boot를 지원한다.
- **부트로더(Boot Loader)** : 커널을 찾아 메모리에 올리는 프로그램. GRUB2가 표준이다.
- **LILO** : GRUB 이전에 쓰이던 부트로더. 설정 변경 후 재설치가 필요하다.
- **initramfs** : 루트 파일 시스템을 마운트하기 위해 먼저 메모리에 올리는 임시 파일 시스템.
- **PID 1** : 커널이 띄우는 첫 프로세스. init 또는 systemd가 여기 해당한다.
- **런레벨(Runlevel)** : 시스템의 동작 모드를 나타내는 숫자. 0=종료, 3=텍스트, 5=GUI, 6=재시작.
- **target** : systemd에서 런레벨을 대체하는 개념.

## 📝 연습 문제

**문제 1.** 다음 중 리눅스의 부팅 순서로 알맞은 것은?

A) 부트로더 → BIOS → 커널 → init  
B) BIOS/UEFI → 커널 → 부트로더 → init  
C) BIOS/UEFI → 부트로더 → 커널 → init  
D) 커널 → BIOS/UEFI → 부트로더 → init  

**정답: C**  
해설: 전원을 켜면 펌웨어(BIOS 또는 UEFI)가 POST로 하드웨어를 점검하고 부팅 장치를 찾습니다. 그다음 부트로더(GRUB2)가 실행되어 커널을 메모리에 올리고, 커널이 initramfs를 거쳐 하드웨어를 초기화한 뒤 첫 프로세스인 init(또는 systemd)를 실행합니다.

---

**문제 2.** 다음 중 systemd 환경에서 그래픽 로그인 화면으로 부팅되는 target으로 알맞은 것은?

A) graphical.target  
B) multi-user.target  
C) rescue.target  
D) poweroff.target  

**정답: A**  
해설: `graphical.target`은 옛 런레벨 5에 해당하며 X 윈도를 포함한 그래픽 환경으로 부팅합니다. `multi-user.target`은 런레벨 3에 해당하는 텍스트 모드, `rescue.target`은 런레벨 1의 복구 모드, `poweroff.target`은 런레벨 0의 시스템 종료입니다.

---

**문제 3.** 다음 중 GRUB2 사용 시 관리자가 직접 편집해야 하는 설정 파일로 알맞은 것은?

A) /boot/grub2/grub.cfg  
B) /etc/lilo.conf  
C) /etc/inittab  
D) /etc/default/grub  

**정답: D**  
해설: `/etc/default/grub`에서 타임아웃과 기본 메뉴 항목 등을 설정한 뒤 `grub2-mkconfig`(또는 `update-grub`)로 `grub.cfg`를 다시 생성합니다. `grub.cfg`는 자동 생성되는 파일이라 직접 수정해도 다음 갱신 때 덮어써집니다. `lilo.conf`는 옛 LILO 부트로더의 설정 파일입니다.

---

**문제 4.** 다음 중 UEFI 펌웨어와 함께 사용되는 파티션 방식으로 알맞은 것은?

A) MBR  
B) GPT  
C) 확장 파티션  
D) 논리 파티션  

**정답: B**  
해설: UEFI는 GPT 파티션 방식과 짝을 이루며, 부트로더를 담기 위한 EFI 시스템 파티션(ESP)을 별도로 둡니다. MBR은 전통적인 BIOS와 함께 사용되며 2TB·주 파티션 4개의 제약이 있습니다. 확장과 논리는 MBR 안에서 파티션을 나누는 방식입니다.

---

**문제 5.** 다음 중 런레벨과 그 의미의 연결로 알맞지 않은 것은?

A) 0 — 시스템 재시작  
B) 1 — 단일 사용자 모드  
C) 3 — 텍스트 다중 사용자 모드  
D) 5 — 그래픽 다중 사용자 모드  

**정답: A**  
해설: 런레벨 0은 시스템 종료이고 재시작은 6입니다. 이 둘은 기본 런레벨로 지정하면 부팅이 끝나지 않으므로 특히 주의해야 합니다. 1은 복구용 단일 사용자 모드, 3은 GUI 없는 텍스트 모드, 5는 X 윈도가 동작하는 그래픽 모드입니다.

# Day 3 - 윈도 매니저 · 디스플레이 매니저 · 데스크톱 환경

## 📌 핵심 정리

- 셋은 **하는 일이 다르다** — **윈도 매니저는 창**, **디스플레이 매니저는 로그인 화면**, **데스크톱 환경은 전체 묶음**이다.
- **윈도 매니저**: KWin · Mutter · Metacity · Xfwm · **Windowmaker · Afterstep** · Enlightenment · Fluxbox · twm
- **디스플레이 매니저**: **XDM · GDM · KDM · SDDM · LightDM**
- **데스크톱 환경**: **GNOME · KDE · Xfce · LXDE · MATE · Cinnamon · CDE**
- **이름을 섞어 놓고 "종류가 다른 것"** 을 고르게 하는 문제가 반복 출제된다.

## 셋의 자리

![데스크톱 환경이 윈도 매니저를 포함하고 그 아래를 디스플레이 매니저와 X 서버가 떠받치는 구조](/diagrams/desktop-wm-dm.svg)

| 구분 | 하는 일 | 없으면 |
|------|--------|-------|
| **윈도 매니저** | **창의 테두리·이동·크기 조절** | 창을 옮기지도 닫지도 못한다 |
| **디스플레이 매니저** | **그래픽 로그인 화면** | 텍스트로 로그인한 뒤 `startx` |
| **데스크톱 환경** | 위 전부 + 패널·파일관리자·응용프로그램 | 창만 뜨고 통합 환경이 없다 |

> **데스크톱 환경은 윈도 매니저를 포함한다.** 포함 관계가 있다는 점이 셋을 가르는 핵심이다.

### 전원을 켠 뒤 나타나는 순서

```text
   부팅 완료 (graphical.target)
        │
        ▼
   ① 디스플레이 매니저 시작     X 서버를 띄우고 로그인 화면을 그린다      ← GDM · SDDM · LightDM
        │   아이디·비밀번호 입력, 세션 종류 선택
        ▼
   ② 세션 시작                 데스크톱 환경이 올라온다                  ← GNOME · KDE · Xfce
        │
        ├── 윈도 매니저         창 테두리·배치                           ← Mutter · KWin · Xfwm
        ├── 패널 · 바탕화면
        └── 파일 관리자 등      사용자가 여는 프로그램                    ← Nautilus · Dolphin · Thunar
        │
        ▼
   ③ 로그아웃                  세션이 끝나고 ① 의 로그인 화면으로 돌아간다
```

| 구분 | 동작하는 때 | 사용자 눈에 보이는 것 |
|------|-----------|-------------------|
| **디스플레이 매니저** | **로그인 전**과 로그아웃 뒤 | 로그인 화면 하나 |
| **윈도 매니저** | **로그인 뒤 내내** | 창마다 붙은 제목 표시줄·테두리·버튼 |
| **데스크톱 환경** | 로그인 뒤 내내 | 패널, 메뉴, 바탕화면, 설정 창 전부 |

- **디스플레이 매니저와 데스크톱 환경은 따로 고를 수 있다.** 로그인 화면에서 세션을 골라 GDM으로 들어가 KDE를 쓰는 것도 가능하다. 표의 "딸린 곳"은 **기본 짝**일 뿐이다.
- **윈도 매니저는 데스크톱 환경 없이도 혼자 쓸 수 있다.** 반대로 데스크톱 환경은 윈도 매니저 없이 성립하지 않는다. 가벼운 시스템에서 Fluxbox나 twm만 띄워 쓰는 것이 앞의 경우다.
- "디스플레이 매니저"라는 이름 때문에 **모니터 해상도를 관리하는 것**으로 오해하기 쉽다. 하는 일은 **로그인**이다.

## 윈도 매니저

창의 **테두리를 그리고 이동·크기 조절·최소화**를 담당한다.

| 윈도 매니저 | 딸린 곳 |
|-----------|--------|
| **KWin** | **KDE** |
| **Mutter** | **GNOME 3 이상** |
| **Metacity** | GNOME 2 |
| **Xfwm** | **Xfce** |
| **Openbox** | LXDE |
| Marco | MATE |
| Muffin | Cinnamon |
| **Windowmaker** | 단독 (NeXTSTEP 스타일) |
| **Afterstep** | 단독 |
| **Enlightenment** | 단독 |
| **Fluxbox**, Blackbox | 단독 (가볍다) |
| **FVWM**, **twm** | 아주 오래된 기본 |
| Compiz | 3D 효과 전용 |

- **`twm`(Tab Window Manager)** 은 X에 기본 포함된 가장 단순한 윈도 매니저다.
- **Windowmaker · Afterstep · Fluxbox · Enlightenment** 는 데스크톱 환경에 딸리지 않고 **단독으로 쓰는** 윈도 매니저다. 이름이 낯설어 보기에 자주 등장한다.

### 이름에 단서가 있는 것과 없는 것

| 단서 | 해당하는 이름 | 주의 |
|------|------------|------|
| **끝이 `wm`** (window manager) | t**wm**, FV**WM**, Xf**wm**, IceWM | 가장 확실한 단서 |
| **끝이 `Win`** | K**Win** | KDE의 윈도 매니저 |
| **끝이 `box`** | Open**box**, Flux**box**, Black**box** | 가벼운 윈도 매니저 계보 |
| **단서가 없다 — 외워야 한다** | **Mutter, Metacity, Marco, Muffin** | 넷 다 GNOME 계보의 윈도 매니저 |
| **단서가 없다 — 외워야 한다** | **Windowmaker, Afterstep, Enlightenment** | 단독 윈도 매니저 |

| 윈도 매니저 | 한 줄 내력 |
|-----------|----------|
| **Metacity → Mutter** | GNOME 2의 Metacity를 GNOME 3에서 Mutter가 이었다 |
| **Marco** | MATE가 Metacity를 이어받아 붙인 이름 |
| **Muffin** | Cinnamon이 Mutter를 이어받아 붙인 이름 |
| **Windowmaker · Afterstep** | 둘 다 **NeXTSTEP**의 화면을 본뜬 것 — 그래서 함께 나온다 |
| **Fluxbox** | **Blackbox**를 바탕으로 만들었다 |
| **FVWM** | **twm**에서 갈라져 나왔다 |

- **M으로 시작하는 넷은 윈도 매니저인데 `MATE`만 데스크톱 환경**이다. `Metacity · Mutter · Marco · MATE` 같은 보기에서 다른 하나는 MATE다.
- 창들을 한 화면으로 합성하면서 **반투명·그림자·창 전환 효과**를 내는 것을 **컴포지팅**이라 한다. Compiz가 이 효과로 유명했고, 지금은 KWin·Mutter가 스스로 한다.

## 디스플레이 매니저

부팅 후 나타나는 **그래픽 로그인 화면**을 담당한다. 로그인에 성공하면 세션을 시작해 준다.

| 디스플레이 매니저 | 딸린 곳 |
|----------------|--------|
| **XDM** | X 윈도의 **기본**. 가장 단순하다 |
| **GDM** | **GNOME** (GNOME Display Manager) |
| **KDM** | 예전 **KDE** |
| **SDDM** | 현재 **KDE Plasma** |
| **LightDM** | **우분투**, Xfce — 가볍다 |
| LXDM | LXDE |

- 이름 앞 글자가 힌트다 — **G**DM은 GNOME, **K**DM은 KDE, **X**DM은 X의 기본이다.
- 디스플레이 매니저를 쓰지 않으면 **텍스트로 로그인한 뒤 `startx`** 로 X를 띄운다.

| 이름 | 풀네임 | 덧붙일 것 |
|------|-------|----------|
| **XDM** | X Display Manager | X와 함께 제공되는 원조. 꾸밈이 거의 없다 |
| **GDM** | GNOME Display Manager | 지금의 우분투 기본판도 GNOME을 쓰므로 GDM이다 |
| **KDM** | KDE Display Manager | KDE 4까지 |
| **SDDM** | Simple Desktop Display Manager | KDE Plasma 5부터 KDM의 자리를 이었다 |
| **LightDM** | (Light + DM) | 특정 데스크톱에 묶이지 않는 가벼운 것. Xfce 계열에서 흔하고 예전 우분투의 기본이었다 |

- 디스플레이 매니저가 하는 일은 셋이다 — **X 서버를 띄우고, 사용자를 인증하고, 고른 세션을 시작한다.**
- 원격 컴퓨터의 로그인 화면을 내 X 서버에 띄우는 데 쓰는 프로토콜이 **XDMCP(X Display Manager Control Protocol)** 다. 이름 그대로 디스플레이 매니저와 짝을 이룬다.
- 지금 어느 것이 돌고 있는지는 `systemctl status display-manager`로 확인한다.
- 디스플레이 매니저는 **한 번에 하나만** 켠다. 둘을 설치했더라도 부팅 때 뜨는 것은 하나다.

## 데스크톱 환경

윈도 매니저에 **패널·파일 관리자·설정 도구·기본 응용 프로그램**까지 묶어 하나의 통합 환경으로 제공한다.

| 데스크톱 환경 | 툴킷 | 윈도 매니저 | 파일 관리자 |
|-------------|------|-----------|-----------|
| **GNOME** | **GTK+** | Mutter | **Nautilus** |
| **KDE (Plasma)** | **Qt** | **KWin** | **Dolphin** |
| **Xfce** | GTK+ | Xfwm | **Thunar** |
| **LXDE** | GTK+ | Openbox | PCManFM |
| LXQt | Qt | Openbox | PCManFM-Qt |
| MATE | GTK+ | Marco | Caja |
| Cinnamon | GTK+ | Muffin | Nemo |
| **CDE** | **Motif** | — | — |

- **GNOME과 KDE가 양대 산맥**이다. **GNOME은 GTK+, KDE는 Qt** 기반이라는 짝이 핵심이다.
- **Xfce와 LXDE는 가벼운** 환경으로 오래된 컴퓨터에 쓰인다.
- **CDE(Common Desktop Environment)** 는 전통적인 상용 유닉스의 표준 데스크톱으로 Motif 기반이다.

| 환경 | 내력 · 성격 |
|------|-----------|
| **KDE** | **1996년** 시작. 이름은 K Desktop Environment에서 왔고 지금의 데스크톱은 **KDE Plasma**라 부른다 |
| **GNOME** | **1997년** 시작. **GNU 프로젝트**의 데스크톱이다 |
| **Xfce** | 가벼움이 목표. 처음에는 XForms로 만들었다가 GTK+로 옮겼다 |
| **LXDE** | **L**ightweight **X**11 **D**esktop **E**nvironment — 이름부터 "가벼운" |
| **LXQt** | LXDE를 **Qt**로 다시 만든 것 |
| **MATE** | **GNOME 2**를 이어 가려고 갈라져 나왔다 |
| **Cinnamon** | **GNOME 3**에서 갈라져 나왔다. 리눅스 민트가 만든다 |
| **CDE** | 1990년대 상용 유닉스 회사들이 함께 정한 표준. 윈도 매니저는 `dtwm`이다 |

- **가벼운 순서**를 물으면 대체로 **LXDE · Xfce 쪽이 가볍고 GNOME · KDE 쪽이 무겁다.**
- **툴킷으로 묶으면** GTK+ 쪽이 GNOME·Xfce·LXDE·MATE·Cinnamon, Qt 쪽이 **KDE·LXQt** 둘이다. "Qt 기반 데스크톱 환경"을 고르라면 이 둘 가운데서 나온다.

### 데스크톱 환경에 딸린 프로그램

데스크톱 환경은 파일 관리자 말고도 기본 프로그램을 한 벌 갖고 있다. **용도를 주고 프로그램을 고르게 하는** 문항이 이 영역에서 나온다.

| 용도 | GNOME 쪽 | KDE 쪽 |
|------|---------|-------|
| 파일 관리자 | **Nautilus** | **Dolphin** (예전에는 Konqueror) |
| 터미널 | GNOME Terminal | **Konsole** |
| 텍스트 편집기 | **gedit** | **Kate**, KWrite |
| **문서(PDF) 보기** | **Evince** | **Okular** |
| **이미지 보기** | **eog** (Eye of GNOME) | Gwenview |
| 동영상 재생 | Totem | Dragon Player |
| 음악 재생 | Rhythmbox | Amarok |

| 용도 | 데스크톱에 묶이지 않고 널리 쓰는 프로그램 |
|------|----------------------------------|
| **이미지 편집** | **GIMP** (사진 편집) |
| **오피스** | **LibreOffice** — Writer(문서) · Calc(스프레드시트) · Impress(프레젠테이션) · Draw(그리기) |
| **웹 브라우저** | **Firefox**, Chromium |
| 동영상 재생 | VLC |

- **"보기"와 "편집"을 가른다.** eog·Gwenview는 이미지를 **보는** 프로그램, GIMP는 **편집하는** 프로그램이다. Evince·Okular는 PDF를 **보는** 프로그램이다.
- LibreOffice의 넷은 **Writer–문서, Calc–표 계산, Impress–발표, Draw–그림**으로 짝짓는다.
- 이 프로그램들은 **X 클라이언트**다. 윈도 매니저도 디스플레이 매니저도 아니므로, 분류 문제에 끼어 있으면 "응용 프로그램" 칸에 넣는다.

## 섞어 놓고 고르게 하는 문제

> **"다음 중 종류가 나머지 셋과 다른 것은?"**
> `KWin · Xfce · Windowmaker · Afterstep`
> → **Xfce** 다. 나머지 셋은 **윈도 매니저**인데 Xfce만 **데스크톱 환경**이다.

| 섞이면 이렇게 가른다 | |
|------|------|
| **KWin, Mutter, Xfwm, Windowmaker, Afterstep, Fluxbox** | **윈도 매니저** |
| **XDM, GDM, KDM, SDDM, LightDM** | **디스플레이 매니저** (**끝이 DM**) |
| **GNOME, KDE, Xfce, LXDE, MATE, CDE** | **데스크톱 환경** |
| **Nautilus, Dolphin, Thunar, PCManFM** | **파일 관리자** |

- **끝이 `DM`이면 디스플레이 매니저**라는 규칙이 가장 쉬운 단서다.
- **Xfce와 Xfwm을 혼동하지 않는다.** **Xfce는 데스크톱 환경, Xfwm은 그 윈도 매니저**다. 한 글자 차이로 보기에 함께 나온다.

### 가르는 순서

이름 네 개를 받으면 아래 순서로 걸러 낸다.

```text
   ① 끝이 DM 인가?               → 디스플레이 매니저   (XDM · GDM · KDM · SDDM · LightDM · LXDM)
   ② 끝이 wm · Win · box 인가?   → 윈도 매니저         (twm · FVWM · Xfwm · KWin · Openbox · Fluxbox)
   ③ GNOME · KDE · Xfce · LXDE · LXQt · MATE · Cinnamon · CDE 인가?   → 데스크톱 환경
   ④ 남은 것 중 Mutter · Metacity · Marco · Muffin · Windowmaker · Afterstep · Enlightenment · Compiz
                                  → 윈도 매니저 (단서 없는 이름)
   ⑤ Nautilus · Dolphin · Thunar · PCManFM · Caja · Nemo            → 파일 관리자
```

| 보기 | 다른 하나 | 이유 |
|------|---------|------|
| `GDM · SDDM · LXDE · LightDM` | **LXDE** | 끝이 DM이 아니다 — 데스크톱 환경 |
| `Mutter · Metacity · Marco · MATE` | **MATE** | 나머지는 윈도 매니저 |
| `Nautilus · Dolphin · Thunar · Mutter` | **Mutter** | 나머지는 파일 관리자 |
| `GNOME · Xfce · LXDE · KDE` (툴킷 기준) | **KDE** | 혼자 Qt, 나머지는 GTK+ |
| `Fluxbox · Openbox · Enlightenment · LXQt` | **LXQt** | 나머지는 윈도 매니저 |
| `KDE · KDM · KWin · Konsole` 가운데 윈도 매니저 | **KWin** | KDE는 환경, KDM은 로그인, Konsole은 터미널 |

- **같은 머리글자로 시작하는 이름을 한 보기에 모으는** 것이 단골 수법이다. K로 시작하는 넷, X로 시작하는 Xfce·Xfwm·XDM, G로 시작하는 GNOME·GDM·GTK+를 각각 갈라 둔다.
- **LXDE와 LXDM**도 한 글자 차이다. **E로 끝나면 환경(Environment), M으로 끝나면 매니저**다.

> 내일은 X를 실제로 실행하고 원격 화면을 띄우는 방법을 다룬다.

## 📖 용어

- **윈도 매니저** : 창의 테두리와 이동·크기 조절을 담당하는 프로그램.
- **디스플레이 매니저** : 그래픽 로그인 화면을 제공하고 세션을 시작하는 프로그램.
- **데스크톱 환경** : 윈도 매니저에 패널·파일 관리자·응용 프로그램을 묶은 통합 환경.
- **KWin / Mutter / Xfwm** : 각각 KDE·GNOME·Xfce의 윈도 매니저.
- **GDM / SDDM / LightDM** : 각각 GNOME·KDE Plasma·우분투에서 쓰는 디스플레이 매니저.
- **twm** : X에 기본 포함된 가장 단순한 윈도 매니저.
- **CDE** : Motif 기반의 전통적인 상용 유닉스 데스크톱 환경.
- **파일 관리자** : 파일과 폴더를 그래픽으로 다루는 프로그램. Nautilus, Dolphin, Thunar 등.

## 📝 연습 문제

**문제 1.** 다음 중 종류가 나머지 셋과 다른 것으로 알맞은 것은?

A) KWin  
B) Windowmaker  
C) Afterstep  
D) Xfce  

**정답: D**  
해설: KWin, Windowmaker, Afterstep은 모두 창의 테두리와 이동을 담당하는 윈도 매니저입니다. 반면 Xfce는 윈도 매니저에 패널과 파일 관리자까지 묶은 데스크톱 환경이며, Xfce가 사용하는 윈도 매니저는 Xfwm입니다.

---

**문제 2.** 다음 중 그래픽 로그인 화면을 제공하는 디스플레이 매니저에 해당하는 것으로 알맞은 것은?

A) Mutter  
B) GDM  
C) Nautilus  
D) Thunar  

**정답: B**  
해설: GDM은 GNOME Display Manager의 줄임말로 부팅 후 그래픽 로그인 화면을 띄우고 세션을 시작합니다. Mutter는 GNOME의 윈도 매니저이고 Nautilus와 Thunar는 각각 GNOME과 Xfce의 파일 관리자입니다.

---

**문제 3.** 다음 중 KDE 데스크톱 환경에서 사용하는 윈도 매니저로 알맞은 것은?

A) Mutter  
B) Xfwm  
C) KWin  
D) Openbox  

**정답: C**  
해설: KDE는 KWin을 윈도 매니저로 사용하며 툴킷은 Qt입니다. Mutter는 GNOME, Xfwm은 Xfce, Openbox는 LXDE에서 사용하는 윈도 매니저입니다.

---

**문제 4.** 다음 중 창의 테두리를 그리고 창의 이동과 크기 조절을 담당하는 것으로 알맞은 것은?

A) 윈도 매니저  
B) 디스플레이 매니저  
C) 파일 관리자  
D) 툴킷  

**정답: A**  
해설: X 윈도 자체는 창의 모양이나 조작 방식을 정하지 않기 때문에 윈도 매니저가 그 역할을 맡습니다. 디스플레이 매니저는 로그인 화면을, 파일 관리자는 파일과 폴더 탐색을, 툴킷은 버튼과 메뉴 같은 위젯을 담당합니다.

---

**문제 5.** 다음 중 GNOME 데스크톱 환경에서 사용하는 파일 관리자로 알맞은 것은?

A) Dolphin  
B) Thunar  
C) Nautilus  
D) PCManFM  

**정답: C**  
해설: GNOME은 Nautilus를 기본 파일 관리자로 사용합니다. Dolphin은 KDE, Thunar는 Xfce, PCManFM은 LXDE의 파일 관리자이며 각 데스크톱 환경이 자신의 툴킷에 맞는 파일 관리자를 함께 제공합니다.

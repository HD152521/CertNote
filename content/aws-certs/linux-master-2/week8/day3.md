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

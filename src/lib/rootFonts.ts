import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

// 두 루트 레이아웃((ko)·(en))이 같은 글꼴 인스턴스를 공유한다 — next/font 는 모듈 스코프에서 한 번만
// 호출돼야 하므로 레이아웃 파일이 아니라 여기에 둔다.
export const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
// D2Coding — 코드블록의 아스키 다이어그램(─ │ ├ ▼) 정렬 때문에 self-host 한다.
//
// 이전에는 JetBrains Mono(subsets: ['latin'])를 썼는데, 다운로드되는 글리프가 라틴뿐이라
// 박스드로잉·화살표·기하도형·한글이 전부 OS 기본 고정폭으로 '글자 단위 폴백'됐다. 한 줄 안에서
// 두 폰트의 자간이 섞이니 고정폭 전제가 깨져 다이어그램 세로줄이 어긋났다(콘텐츠 실측: 다이어그램
// 코드블록 1,374개, 그중 64%가 한글 혼용). D2Coding 은 라틴·박스드로잉·한글을 1:2 폭으로 모두
// 담아 이 폴백 자체를 없앤다.
//
// 파일을 라틴/한글로 쪼갠 이유: 한글 음절 11,172자가 용량의 대부분(406KB)이다. 폰트 스택에
// 라틴을 먼저 두면 브라우저가 글리프 필요 여부로 판단해, 한글이 없는 화면(대시보드 배지 등)은
// 92KB 만 받는다. 두 파일 모두 같은 원본이라 섞여도 폭이 어긋나지 않는다.
// preload=false: 코드블록은 대개 첫 화면 밖이라 LCP 를 막지 않게 한다.
// 라이선스: SIL OFL 1.1 — src/app/fonts/LICENSE-D2Coding.txt
export const d2Latin = localFont({
  src: '../app/fonts/D2Coding-latin.woff2',
  variable: '--font-mono-d2-latin',
  display: 'swap',
  preload: false,
});
export const d2Korean = localFont({
  src: '../app/fonts/D2Coding-korean.woff2',
  variable: '--font-mono-d2-korean',
  display: 'swap',
  preload: false,
});

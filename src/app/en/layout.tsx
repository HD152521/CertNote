import { HtmlLang } from '@/components/HtmlLang';

// 영어판 전체(/en, /en/<slug>, /en/<slug>/weekN/dayM)의 문서 언어를 "en" 으로 맞춘다.
// 루트 레이아웃의 <html lang="ko"> 가 영어 페이지에도 그대로 나가 본문 언어와 엇갈리던 문제.
export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HtmlLang lang="en" />
      {children}
    </>
  );
}

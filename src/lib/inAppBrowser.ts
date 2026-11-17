// 앱 안 웹뷰(에브리타임·카카오톡·인스타그램 등)에서는 구글이 OAuth 를 막는다(403 disallowed_useragent).
// 그 화면에서 구글 로그인을 눌러도 로그인이 끝나지 않으므로, 감지되면 "외부 브라우저로 열어 주세요" 안내를 띄운다.
// 판정은 User-Agent 문자열만 본다 — 오탐(일반 브라우저를 웹뷰로 오인)이 있어도 안내 문구만 보이고 버튼은 그대로 동작한다.

const NAMED_IN_APP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|everytime|DaumApps|; wv\)/i;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (NAMED_IN_APP.test(userAgent)) return true;
  // iOS 웹뷰: 모바일 WebKit 인데 Safari/·CriOS/·FxiOS/ 토큰이 없다.
  const isIos = /iPhone|iPad|iPod/.test(userAgent);
  if (isIos && /AppleWebKit/.test(userAgent) && !/Safari\/|CriOS\/|FxiOS\/|EdgiOS\//.test(userAgent)) return true;
  return false;
}

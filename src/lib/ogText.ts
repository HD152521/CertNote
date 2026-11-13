const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** OG 카드(ImageResponse)는 한글 폰트가 없어 한글이 깨진다. 영어 카드에서 한글이 든 문구는 대체 문구로 바꾼다. */
export function ogEnglishSafe(text: string, fallback: string): string {
  return HANGUL.test(text) ? fallback : text;
}

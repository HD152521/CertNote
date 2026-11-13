import type { Metadata } from 'next';
import { enInfoPathOf, koInfoPathOf } from './enEdition';
import { hreflangPair } from './i18n';

// 정보 페이지의 canonical + hreflang(ko↔en). 한국어판·영어판 어느 쪽에서 불러도 같은 languages 객체가
// 나온다(상호 참조·자기 참조). 짝이 없는 경로는 hreflang 없이 canonical 만 낸다.
export function infoAlternates(path: string): NonNullable<Metadata['alternates']> {
  const en = enInfoPathOf(path) ?? (koInfoPathOf(path) ? path : undefined);
  const ko = koInfoPathOf(path) ?? (en ? path : undefined);
  if (!ko || !en) return { canonical: path };
  return { canonical: path, languages: hreflangPair(ko, en) };
}

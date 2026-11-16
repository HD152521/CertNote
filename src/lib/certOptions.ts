import { listCerts } from './content';
import { DEFAULT_CATEGORY, EN_CATEGORY } from './category';
import type { CertOption } from '@/components/AuthForm';

/**
 * 가입·온보딩·계정 프로필의 "목표 자격증" 선택지. 영어 화면용 이름(nameEn·codeEn)도 함께 싣는다 —
 * 리눅스마스터·SQLD 는 한국어 이름이라 영어 화면에서 그대로 쓰면 한글이 남는다. 서버로 가는 값은 slug 라 같다.
 */
export async function listCertOptions(): Promise<CertOption[]> {
  const [metas, enMetas] = await Promise.all([listCerts(DEFAULT_CATEGORY), listCerts(EN_CATEGORY)]);
  const en = new Map(enMetas.map((m) => [m.slug, m]));
  return metas.map((m) => ({
    slug: m.slug,
    code: m.code,
    name: m.name,
    codeEn: en.get(m.slug)?.code,
    nameEn: en.get(m.slug)?.name,
  }));
}

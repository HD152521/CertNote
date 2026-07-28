import { toSafeJsonLdString } from '@/lib/structuredData';

// 구조화 데이터(JSON-LD)를 <script> 태그로 렌더링하는 공용 컴포넌트. 현재 데이터 소스
// (콘텐츠 마크다운·meta.json)엔 '<'가 등장하지 않아 이스케이프 전후 바이트가 동일하지만,
// 향후 콘텐츠에 '<'가 섞여도 안전하도록 모든 JSON-LD 출력에 일괄 적용한다
// (직렬화 로직은 src/lib/structuredData.ts#toSafeJsonLdString — React 없이 단위 테스트 가능).
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toSafeJsonLdString(data) }} />;
}

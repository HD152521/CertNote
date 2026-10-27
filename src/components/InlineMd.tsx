import { tokenizeInlineMd } from '@/lib/quiz/inlineMd';

// 퀴즈 문자열의 **굵게**·`코드`·*기울임* 만 React 요소로 바꾼다(src/lib/quiz/inlineMd.ts).
// HTML 을 주입하지 않으므로 원문에 태그가 섞여 있어도 글자로 보인다.
export function InlineMd({ text }: { text: string }) {
  return (
    <>
      {tokenizeInlineMd(text).map((tok, i) => {
        if (tok.kind === 'strong') return <strong key={i} className="font-semibold text-fg">{tok.value}</strong>;
        if (tok.kind === 'em') return <em key={i}>{tok.value}</em>;
        if (tok.kind === 'code') {
          return (
            <code key={i} className="rounded border border-border bg-[var(--code-bg)] px-1 py-px font-mono text-[0.88em]">
              {tok.value}
            </code>
          );
        }
        return <span key={i}>{tok.value}</span>;
      })}
    </>
  );
}

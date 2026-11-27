import type { CSSProperties } from "react";

const WORD = "結果発表";

/** 最終問の後の結果発表の画面。文字を 1 字ずつ落とし、そろったら弾ませる（reduced motion では止まる） */
export function FinaleScreen({ size }: { readonly size: "host" | "guest" }) {
  return (
    <div className={`finale finale--${size}`}>
      <p className="finale__kicker">RESULT</p>
      <h1 className="finale__word" aria-label={WORD}>
        {Array.from(WORD, (char, i) => (
          <span key={i} aria-hidden="true" style={{ "--i": i } as CSSProperties}>
            {char}
          </span>
        ))}
      </h1>
    </div>
  );
}

import type { Label, PublicOption } from "../question-set/model.ts";
import type { RevealedOption } from "../venue/protocol.ts";

/** 行の構成（写真・選択肢の説明）は正解発表の前後で変わらない。ラベルは写真に重ねるので、写真の座標と大きさも変わらない */
export function OptionCard({
  option,
  revealed,
  label,
  size,
}: {
  readonly option: PublicOption;
  /** 正解発表中だけ渡す。option と同じ表示位置のもの */
  readonly revealed?: RevealedOption;
  /** 写真当ての問題だけ、正解発表の前後を通して写真の隅に出すラベル。渡すと中央の大きなラベルを出さず、写真の下に誰の写真かを出す */
  readonly label?: Label;
  readonly size: "host" | "guest";
}) {
  const tone = revealed === undefined ? undefined : revealed.correct ? "correct" : "dim";
  const className = `option-card option-card--${size}${tone === undefined ? "" : ` option-card--${tone}`} px`;
  return (
    <div className={className} data-label={revealed?.label ?? label}>
      <div className="option-card__media">
        <img className="option-card__photo" src={option.image} alt="" />
        {label !== undefined ? <div className="label-chip">{label}</div> : revealed !== undefined && <div className="label-bar">{revealed.label}</div>}
      </div>
      {option.note !== null && <p className="option-note">{option.note}</p>}
      {label !== undefined && <p className="option-caption">{revealed?.caption}</p>}
    </div>
  );
}

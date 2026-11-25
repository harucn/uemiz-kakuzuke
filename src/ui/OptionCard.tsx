import type { PublicOption } from "../question-set/model.ts";
import type { RevealedOption } from "../venue/protocol.ts";

/** 行の構成（写真・選択肢の説明）は正解発表の前後で変わらない。ラベルは写真に重ねるので、写真の座標と大きさも変わらない */
export function OptionCard({
  option,
  revealed,
  size,
}: {
  readonly option: PublicOption;
  /** 正解発表中だけ渡す。option と同じ表示位置のもの */
  readonly revealed?: RevealedOption;
  readonly size: "host" | "guest";
}) {
  const tone = revealed === undefined ? undefined : revealed.correct ? "correct" : "dim";
  const className = `option-card option-card--${size}${tone === undefined ? "" : ` option-card--${tone}`} px`;
  return (
    <div className={className} data-label={revealed?.label}>
      <div className="option-card__media">
        <img className="option-card__photo" src={option.image} alt="" />
        {revealed !== undefined && <div className="label-bar">{revealed.label}</div>}
      </div>
      <p className="option-note">{option.note}</p>
    </div>
  );
}

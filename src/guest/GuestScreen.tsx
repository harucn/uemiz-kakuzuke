import { useEffect } from "react";
import { preload } from "react-dom";
import { deckOf, type Intro, type Outro } from "../deck/cursor.ts";
import type { PublicQuestionSet } from "../question-set/model.ts";
import { CardSlot, useCardTurn } from "../ui/CardSlot.tsx";
import { Celebration } from "../ui/Celebration.tsx";
import { FinaleScreen } from "../ui/FinaleScreen.tsx";
import { IntroScreen } from "../ui/IntroScreen.tsx";
import { OptionCard } from "../ui/OptionCard.tsx";
import type { VenueView } from "../venue/protocol.ts";
import { useVenue } from "../venue/useVenue.ts";
import { LEAK_CANARY } from "./leak-canary.ts";
import { VIEW_ONLY_NOTE } from "./view-only-note.ts";

type QuestionPhase = Exclude<VenueView, { readonly phase: "title" | Intro | Outro }>;

/** 届いた画面を手元の問題セットで出せないとき（中身のない画面・問題番号がない）はタイトル画面にする */
function shownOf(view: VenueView | null, set: PublicQuestionSet): QuestionPhase | Intro | Outro | null {
  if (view === null || view.phase === "title") return null;
  if (view.phase === "rules" || view.phase === "prizes") return deckOf(set).intro.includes(view.phase) ? view.phase : null;
  if (view.phase === "finale" || view.phase === "awards") return deckOf(set).outro.includes(view.phase) ? view.phase : null;
  return set.questions[view.index] !== undefined ? view : null;
}

export function GuestScreen({ set }: { readonly set: PublicQuestionSet }) {
  const { view, connection, celebration } = useVenue("guest");
  const shown = shownOf(view, set);
  const index = shown === null || typeof shown === "string" ? null : shown.index;
  // 最終問の後の画面では次に出る問題がないので先読みしない
  const upcoming = shown === "finale" || shown === "awards" ? null : index === null ? 0 : index + 1;
  for (const option of upcoming === null ? [] : (set.questions[upcoming]?.options ?? [])) preload(option.image, { as: "image" });

  // 正解発表では写真の位置を動かさないよう、問題が変わったときだけ戻す。scrollTo は Promise を返すブラウザがあるので、片付け関数と取り違えないよう値を返さない
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [index]);

  return (
    <main className="guest" aria-label="参加者画面" data-leak-canary={LEAK_CANARY}>
      <p role="status" className="venue-status">
        {connection === "lost" ? "再接続中" : null}
      </p>
      {shown === null ? (
        <div className="guest-cover">
          <h1 className="guest-cover__title">{set.title}</h1>
          <p className="guest-cover__note">
            {VIEW_ONLY_NOTE.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
        </div>
      ) : shown === "finale" ? (
        <>
          <FinaleScreen size="guest" />
          {celebration !== null && <Celebration key={celebration} kind="finale" />}
        </>
      ) : shown === "awards" ? (
        <IntroScreen set={set} screen="awards" size="guest" />
      ) : typeof shown === "string" ? (
        // 司会画面はルールとランクと景品を 1 画面ずつ出すが、スマホは縦にスクロールできるので両方を並べ、どちらの間も読み返せるようにする
        deckOf(set).intro.map((screen) => <IntroScreen key={screen} set={set} screen={screen} size="guest" />)
      ) : (
        <QuestionView key={shown.index} set={set} view={shown} celebration={celebration} />
      )}
    </main>
  );
}

function QuestionView({
  set,
  view,
  celebration,
}: {
  readonly set: PublicQuestionSet;
  readonly view: QuestionPhase;
  readonly celebration: string | null;
}) {
  const { index } = view;
  const question = set.questions[index];
  const reveal = view.phase === "revealed" ? view.reveal : null;
  const { turning, onTurned } = useCardTurn(reveal !== null);
  const last = question.options.length - 1;
  return (
    <>
      <h1 className="guest-title">
        <small>STAGE {index + 1}</small>
        {question.title}
      </h1>
      <p className="guest-desc">{question.description}</p>
      <div className="guest-opts">
        {question.options.map((o, i) => (
          <CardSlot key={i} face={reveal === null ? "asking" : "revealed"} order={i} onTurned={i === last ? onTurned : undefined}>
            <OptionCard size="guest" option={o} revealed={reveal?.options[i]} label={question.labels?.[i]} />
          </CardSlot>
        ))}
      </div>
      {reveal !== null && !turning && (
        <div className="guest-reveal px">
          <p className="guest-reveal__headline">{reveal.headline}！</p>
          <p className="guest-reveal__text">{reveal.explanation}</p>
        </div>
      )}
      {celebration !== null && !turning && <Celebration key={celebration} />}
    </>
  );
}

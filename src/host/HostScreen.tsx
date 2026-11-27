import { useEffect, useRef } from "react";
import { preload } from "react-dom";
import { boundsOf, deckOf, type Deck, type Intro, type Position } from "../deck/cursor.ts";
import type { PublicQuestionSet } from "../question-set/model.ts";
import { CardSlot, useCardTurn } from "../ui/CardSlot.tsx";
import { Celebration } from "../ui/Celebration.tsx";
import { IntroScreen } from "../ui/IntroScreen.tsx";
import { OptionCard } from "../ui/OptionCard.tsx";
import { positionOf } from "../venue/machine.ts";
import type { Intent, VenueView } from "../venue/protocol.ts";
import { useVenue } from "../venue/useVenue.ts";
import { toggleFullscreen, useIsFullscreen } from "./fullscreen.ts";
import { useExpiryWatch, useHostGate } from "./gate.ts";
import { HostLogin } from "./HostLogin.tsx";
import { installHostKeys } from "./keymap.ts";
import { QrCode } from "./QrCode.tsx";

type Operate = ((intent: Intent) => void) | null;

export function HostScreen({ set }: { readonly set: PublicQuestionSet }) {
  const { gate, login, expire } = useHostGate();
  switch (gate.kind) {
    case "checking":
      return <HostChecking failures={gate.failures} />;
    case "locked":
      return <HostLogin error={gate.error} onSubmit={login} />;
    case "open":
      return <HostVenue set={set} onExpired={expire} />;
  }
}

/** 事前レンダリングの HTML もこれ。ログイン済みかを確かめられないうちは何も出さず、確かめ直している間は「再接続中」を出す */
function HostChecking({ failures }: { readonly failures: number }) {
  return (
    <main className="host-stage" aria-label="司会画面">
      <p role="status" className="venue-status">
        {failures > 0 ? "再接続中" : null}
      </p>
    </main>
  );
}

/** useVenue("host") を呼ぶのはここだけ。ログインするまでマウントしないので、ログイン前は会場への接続を開かない */
function HostVenue({ set, onExpired }: { readonly set: PublicQuestionSet; readonly onExpired: () => void }) {
  const { view, connection, celebration, operate } = useVenue("host");
  useExpiryWatch(connection, onExpired);
  useEffect(() => installHostKeys(window, (intent) => operate?.(intent)), [operate]);
  const position = view === null ? null : positionOf(view);
  const upcoming = position === null ? null : typeof position === "number" ? position + 1 : 0;
  for (const option of upcoming === null ? [] : (set.questions[upcoming]?.options ?? [])) preload(option.image, { as: "image" });
  // 全画面にするのは枠ではなくページ全体。枠の 16:9 の寸法計算をそのまま使えて、画面の比が 16:9 でなくても崩れない
  const stage = useRef<HTMLElement>(null);
  const onFullscreen = () => void toggleFullscreen(stage.current!);

  return (
    <main ref={stage} className="host-stage" aria-label="司会画面">
      <p role="status" className="venue-status">
        {connection === "lost" ? "再接続中" : null}
      </p>
      {view === null ? null : view.phase === "title" ? (
        <div className="host host--title">
          <TitleStage set={set} operate={operate} onFullscreen={onFullscreen} />
        </div>
      ) : view.phase === "rules" || view.phase === "prizes" ? (
        <IntroStage set={set} screen={view.phase} operate={operate} onFullscreen={onFullscreen} />
      ) : (
        <Stage key={view.index} set={set} view={view} celebration={celebration} operate={operate} onFullscreen={onFullscreen} />
      )}
    </main>
  );
}

function TitleStage({
  set,
  operate,
  onFullscreen,
}: {
  readonly set: PublicQuestionSet;
  readonly operate: Operate;
  readonly onFullscreen: () => void;
}) {
  // 会場の状態は接続後にしか届かないので、ここは必ずクライアントで動く。origin は本番とプレビューで違うのでビルド時には決められない
  const guestUrl = new URL("/", window.location.origin).href;
  return (
    <>
      <div className="host-cover">
        <div className="host-cover__text">
          <h1 className="host-cover__title">{set.title}</h1>
        </div>
        <QrCode value={guestUrl} label="参加者画面の QR コード" />
      </div>
      <div className="host-foot host-foot--title">
        <Controls position="title" deck={deckOf(set)} operate={operate} onFullscreen={onFullscreen} />
      </div>
    </>
  );
}

function IntroStage({
  set,
  screen,
  operate,
  onFullscreen,
}: {
  readonly set: PublicQuestionSet;
  readonly screen: Intro;
  readonly operate: Operate;
  readonly onFullscreen: () => void;
}) {
  return (
    <div className="host">
      <IntroScreen set={set} screen={screen} size="host" />
      <div className="host-foot host-foot--title">
        <Controls position={screen} deck={deckOf(set)} operate={operate} onFullscreen={onFullscreen} />
      </div>
    </div>
  );
}

function Stage({
  set,
  view,
  celebration,
  operate,
  onFullscreen,
}: {
  readonly set: PublicQuestionSet;
  readonly view: Exclude<VenueView, { readonly phase: "title" | Intro }>;
  readonly celebration: string | null;
  readonly operate: Operate;
  readonly onFullscreen: () => void;
}) {
  const { index } = view;
  const { questions } = set;
  const question = questions[index];
  const reveal = view.phase === "revealed" ? view.reveal : null;
  const { turning, onTurned } = useCardTurn(reveal !== null);
  // めくり終えるまでは問題の説明のまま。最後の 1 枚がめくれてから正解と解説を打ち始める
  const message = reveal === null || turning ? { who: "Q.", text: question.description } : { who: `${reveal.headline}！`, text: reveal.explanation };
  const last = question.options.length - 1;

  return (
    <>
      <div className="host">
        <h1 className="host-title">
          <small>STAGE {index + 1}</small>
          {question.title}
        </h1>
        <div className="host-opts">
          {question.options.map((o, i) => (
            <CardSlot key={i} face={reveal === null ? "asking" : "revealed"} order={i} onTurned={i === last ? onTurned : undefined}>
              <OptionCard size="host" option={o} revealed={reveal?.options[i]} label={question.labels?.[i]} />
            </CardSlot>
          ))}
        </div>
        <div className="host-foot">
          <div className="msg px" aria-live="polite">
            <span className="who">{message.who}</span>
            <Typed key={message.text} text={message.text} />
            <span className="caret" aria-hidden="true" />
          </div>
          <Controls position={index} deck={deckOf(set)} operate={operate} onFullscreen={onFullscreen} />
        </div>
      </div>
      {/* 16:9 の枠の外に置き、表示中の画面（全画面ならその画面）の下の端から打ち上げる。最後の 1 枚をめくり終えてから出す */}
      {celebration !== null && !turning && <Celebration key={celebration} />}
    </>
  );
}

/** 正解発表ボタンは問題の画面にだけ出す（状態機械も問題の前の画面の正解発表を無視する）。会場につながっていない間は全画面以外を押せない */
function Controls({
  position,
  deck,
  operate,
  onFullscreen,
}: {
  readonly position: Position;
  readonly deck: Deck;
  readonly operate: Operate;
  readonly onFullscreen: () => void;
}) {
  const fullscreen = useIsFullscreen();
  const { canPrev, canNext } = boundsOf(position, deck);
  return (
    <div className="host-btns">
      <button type="button" className="btn px" aria-label="前へ" disabled={operate === null || !canPrev} onClick={() => operate?.({ type: "prev" })}>
        ◀
      </button>
      {typeof position === "number" && (
        <button type="button" className="btn btn-go px" disabled={operate === null} onClick={() => operate?.({ type: "reveal" })}>
          正解発表
        </button>
      )}
      <button type="button" className="btn px" aria-label="次へ" disabled={operate === null || !canNext} onClick={() => operate?.({ type: "next" })}>
        ▶
      </button>
      <button type="button" className="btn btn-sq px" aria-label="全画面" aria-pressed={fullscreen} onClick={onFullscreen}>
        ⛶
      </button>
    </div>
  );
}

/** 全文を最初から DOM に置き、1 文字ずつ現れる見た目だけを CSS で付ける（reduced motion では止まる） */
function Typed({ text }: { readonly text: string }) {
  return (
    <span className="typed">
      {Array.from(text, (char, i) => (
        <span key={i} style={{ animationDelay: `${i * 45}ms` }}>
          {char}
        </span>
      ))}
    </span>
  );
}

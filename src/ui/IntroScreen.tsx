import type { Intro } from "../deck/cursor.ts";
import type { PublicQuestionSet } from "../question-set/model.ts";

/** "awards" は最終問の後にランクと景品をもう一度出す画面。表彰で読み上げる */
type Screen = Intro | "awards";

const HEADINGS: Record<Screen, { readonly kicker: string; readonly title: string }> = {
  rules: { kicker: "HOW TO PLAY", title: "ルール" },
  prizes: { kicker: "PRIZE", title: "ランクと景品" },
  awards: { kicker: "RESULT", title: "ランクと景品" },
};

/** ルールの画面とランクと景品の画面の見出しと本文。司会画面は 1 画面に 1 つ、参加者画面は全部を 1 画面に並べるので、見出しの階層と寸法を size で変える */
export function IntroScreen({
  set,
  screen,
  size,
}: {
  readonly set: PublicQuestionSet;
  readonly screen: Screen;
  readonly size: "host" | "guest";
}) {
  const heading = HEADINGS[screen];
  const Heading = size === "host" ? "h1" : "h2";
  return (
    <>
      <Heading className={`${size}-title`}>
        <small>{heading.kicker}</small>
        {heading.title}
      </Heading>
      <div className={`intro intro--${size}`}>
        {screen === "rules" ? (
          <ol className="intro-rules">
            {set.rules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ol>
        ) : (
          <table className="intro-prizes">
            <tbody>
              {set.prizes.map((p, i) => (
                <tr key={i}>
                  <th scope="row">{p.rank}</th>
                  <td>{p.condition}</td>
                  <td>{p.prize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

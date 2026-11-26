import { answerOf, type Question, type QuestionSet } from "../question-set/model.ts";
import type { VenueState } from "./machine.ts";
import type { RevealView, VenueView } from "./protocol.ts";

export function revealView(q: Question): RevealView {
  const answer = answerOf(q);
  return {
    headline: `正解は ${answer}`,
    explanation: q.explanation,
    options: q.options.map((o) => ({
      label: o.label,
      correct: o.label === answer,
      caption: o.caption,
    })),
  };
}

/** 画面へ配る状態を作る唯一の関数。toPublic と同じ許可リスト方式で、正解は revealed の枝でだけ読む */
export function viewOf(state: VenueState, set: QuestionSet): VenueView {
  switch (state.phase) {
    case "title":
    case "rules":
    case "prizes":
      return { phase: state.phase };
    case "asking":
      return { phase: "asking", index: state.index };
    case "revealed":
      return { phase: "revealed", index: state.index, run: state.run, reveal: revealView(set.questions[state.index]) };
  }
}

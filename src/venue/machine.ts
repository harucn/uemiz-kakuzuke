import { move, type Deck, type Intro, type Outro, type Position } from "../deck/cursor.ts";
import type { Intent } from "./protocol.ts";

export type VenueState =
  | { readonly phase: "title" }
  | { readonly phase: Intro }
  | { readonly phase: Outro }
  | { readonly phase: "asking"; readonly index: number }
  /** run は正解発表を押した回数 */
  | { readonly phase: "revealed"; readonly index: number; readonly run: number };

export const TITLE: VenueState = { phase: "title" };

export function positionOf(state: VenueState): Position {
  return "index" in state ? state.index : state.phase;
}

function at(position: Position): VenueState {
  return typeof position === "number" ? { phase: "asking", index: position } : { phase: position };
}

/** 状態が変わらないときは同じオブジェクトを返す（会場は保存も配信もしない） */
export function step(state: VenueState, intent: Intent, deck: Deck): VenueState {
  switch (intent.type) {
    case "next":
    case "prev": {
      const from = positionOf(state);
      const to = move(from, intent.type === "next" ? 1 : -1, deck);
      return to === from ? state : at(to);
    }
    case "reveal":
      // 問題の前後の画面の Space・Enter はリモコンの連打で第 1 問の正解発表まで進まないよう無視する
      if (!("index" in state)) return state;
      return state.phase === "asking"
        ? { phase: "revealed", index: state.index, run: 1 }
        : { phase: "revealed", index: state.index, run: state.run + 1 };
  }
}

import { describe, expect, it } from "vitest";
import { secretFields, secretStrings } from "../../src/question-set/model.ts";
import type { VenueState } from "../../src/venue/machine.ts";
import { parseServerFrame } from "../../src/venue/protocol.ts";
import { viewOf } from "../../src/venue/view.ts";
import { findSecrets } from "../leak.ts";
import { venueSet } from "./fixtures.ts";

const indexes = venueSet.questions.map((_, i) => i);
const askingStates: readonly VenueState[] = [{ phase: "title" }, { phase: "rules" }, { phase: "prizes" }, ...indexes.map((index) => ({ phase: "asking", index }) as const)];
const revealedStates = indexes.map((index) => ({ phase: "revealed", index, run: 1 }) as const);
const allSecrets = secretStrings(venueSet);

function secretsIn(state: VenueState): ReadonlySet<string> {
  return new Set(findSecrets(JSON.stringify(viewOf(state, venueSet)), allSecrets).map((hit) => hit.secret));
}

const keysOf = (value: object) => Object.keys(value).sort();

describe("正解情報の関所", () => {
  it("出題中の状態は正解情報を含まない", () => {
    for (const state of askingStates) {
      expect([...secretsIn(state)], JSON.stringify(state)).toEqual([]);
    }
  });

  it("正解発表した問題の正解情報だけを含む", () => {
    for (const state of revealedStates) {
      const own = secretFields(venueSet.questions[state.index]).map((f) => f.value);
      // 陽性対照: 発表した問題の秘密がすべて見つかるので、上の「含まない」が走査の不具合で通っているのではない
      expect([...secretsIn(state)].sort(), `第 ${state.index + 1} 問`).toEqual([...own].sort());
    }
  });

  it("問題の前の画面と出題中の状態は画面の種類と問題番号だけを持つ", () => {
    expect(keysOf(viewOf({ phase: "title" }, venueSet))).toEqual(["phase"]);
    expect(viewOf({ phase: "rules" }, venueSet)).toEqual({ phase: "rules" });
    expect(viewOf({ phase: "prizes" }, venueSet)).toEqual({ phase: "prizes" });
    for (const index of indexes) {
      expect(keysOf(viewOf({ phase: "asking", index }, venueSet))).toEqual(["index", "phase"]);
    }
  });

  it("正解発表中の状態は画面の種類・問題番号・発表回数・正解情報だけを持つ", () => {
    for (const state of revealedStates) {
      const view = viewOf(state, venueSet);
      expect(keysOf(view)).toEqual(["index", "phase", "reveal", "run"]);
      if (view.phase !== "revealed") throw new Error("revealed のはず");
      expect(keysOf(view.reveal)).toEqual(["explanation", "headline", "options"]);
      for (const option of view.reveal.options) {
        expect(keysOf(option)).toEqual(["correct", "label"]);
      }
    }
  });

  it("全状態の view が会場からのフレームとして読める", () => {
    for (const state of [...askingStates, ...revealedStates]) {
      const frame = { type: "snapshot", cause: "operated", publicVersion: "v", view: viewOf(state, venueSet) } as const;
      expect(parseServerFrame(JSON.stringify(frame)), JSON.stringify(state)).toEqual(frame);
    }
  });
});

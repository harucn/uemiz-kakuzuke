import { describe, expect, it } from "vitest";
import { boundsOf, clampIndex, deckOf, move, type Deck, type Position } from "../../src/deck/cursor.ts";

const three: Deck = { total: 3, intro: [] };
const one: Deck = { total: 1, intro: [] };
const withRules: Deck = { total: 3, intro: ["rules"] };
const withIntro: Deck = { total: 3, intro: ["rules", "prizes"] };

describe("move", () => {
  it("タイトル画面の次は第 1 問、第 1 問の前はタイトル画面", () => {
    expect(move("title", 1, three)).toBe(0);
    expect(move(0, -1, three)).toBe("title");
  });

  it("ルールがあるとタイトル画面 → ルール画面 → 第 1 問の順に進み、同じ順に戻る", () => {
    expect(move("title", 1, withRules)).toBe("rules");
    expect(move("rules", 1, withRules)).toBe(0);
    expect(move(0, -1, withRules)).toBe("rules");
    expect(move("rules", -1, withRules)).toBe("title");
  });

  it("ランクと景品もあるとルール画面の次に挟む", () => {
    expect(move("rules", 1, withIntro)).toBe("prizes");
    expect(move("prizes", 1, withIntro)).toBe(0);
    expect(move(0, -1, withIntro)).toBe("prizes");
    expect(move("prizes", -1, withIntro)).toBe("rules");
  });

  it("steps within range", () => {
    expect(move(0, 1, three)).toBe(1);
    expect(move(2, -1, three)).toBe(1);
  });

  it("returns the same position at either end", () => {
    expect(move("title", -1, three)).toBe("title");
    expect(move(2, 1, three)).toBe(2);
    expect(move(0, 1, one)).toBe(0);
  });

  it("clamps an out-of-range index before stepping", () => {
    expect(move(-5, 1, three)).toBe(1);
    expect(move(-5, -1, three)).toBe("title");
    expect(move(9, -1, three)).toBe(1);
    expect(move(9, 1, three)).toBe(2);
  });
});

describe("boundsOf", () => {
  it("disables prev on the title and next on the last question", () => {
    expect(boundsOf("title", three)).toEqual({ canPrev: false, canNext: true });
    expect(boundsOf(0, three)).toEqual({ canPrev: true, canNext: true });
    expect(boundsOf(2, three)).toEqual({ canPrev: true, canNext: false });
    expect(boundsOf("title", one)).toEqual({ canPrev: false, canNext: true });
    expect(boundsOf(0, one)).toEqual({ canPrev: true, canNext: false });
    expect(boundsOf("rules", withRules)).toEqual({ canPrev: true, canNext: true });
  });

  it("agrees with move: a disabled direction leaves the position unchanged", () => {
    const cases: readonly [Deck, readonly Position[]][] = [
      [three, ["title", 0, 1, 2]],
      [withRules, ["title", "rules", 0, 1, 2]],
      [withIntro, ["title", "rules", "prizes", 0, 1, 2]],
    ];
    for (const [deck, positions] of cases) {
      for (const p of positions) {
        const { canPrev, canNext } = boundsOf(p, deck);
        expect(move(p, -1, deck) !== p).toBe(canPrev);
        expect(move(p, 1, deck) !== p).toBe(canNext);
      }
    }
  });
});

describe("deckOf", () => {
  it("ルールとランクと景品は 1 つ以上書いたものだけ、ルール・ランクと景品の順に挟む", () => {
    expect(deckOf({ rules: [], prizes: [], questions: [1, 2] })).toEqual({ total: 2, intro: [] });
    expect(deckOf({ rules: [], prizes: [{}], questions: [1, 2] })).toEqual({ total: 2, intro: ["prizes"] });
    expect(deckOf({ rules: ["写真を見て当てる"], prizes: [{}], questions: [1, 2] })).toEqual({ total: 2, intro: ["rules", "prizes"] });
  });
});

describe("clampIndex", () => {
  it("keeps in-range values and clamps the rest", () => {
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(3, 3)).toBe(2);
  });
});

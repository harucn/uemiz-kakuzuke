import { describe, expect, it } from "vitest";
import { formatIssues, parseQuestionSet, type ParseResult } from "../../src/question-set/parse";
import { imageUrl } from "./fixtures";

const title = "2026 忘年会 格付けチェック";

const images = new Map([
  ["テーブルワイン.jpg", imageUrl("/images/aaa.jpg")],
  ["ボルドー.jpg", imageUrl("/images/bbb.jpg")],
  ["A5.jpg", imageUrl("/images/ccc.jpg")],
  ["輸入牛.jpg", imageUrl("/images/ddd.jpg")],
  ["国産牛.jpg", imageUrl("/images/eee.jpg")],
]);

const table = { label: "A", image: "テーブルワイン.jpg", note: "チリ産の赤ワイン", rank: 2 };
const bordeaux = { label: "B", image: "ボルドー.jpg", note: "フランス産の赤ワイン", rank: 1 };
const wine = {
  title: "ワイン",
  description: "高いワインはどちら？",
  explanation: "B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。",
  options: [table, bordeaux],
};

const a5 = { label: "A", image: "A5.jpg", note: "霜降りの牛肉", rank: 1 };
const imported = { label: "B", image: "輸入牛.jpg", note: "赤身の牛肉", rank: 3 };
const domestic = { label: "C", image: "国産牛.jpg", note: "脂の多い牛肉", rank: 2 };
const beef = {
  title: "牛肉",
  description: "高い牛肉はどれ？",
  explanation: "A が A5 ランク。",
  options: [a5, imported, domestic],
};

function issuesOf(result: ParseResult) {
  if (result.ok) throw new Error("expected the question set to fail validation");
  return result.issues;
}

function codesAndPaths(result: ParseResult) {
  return issuesOf(result).map((issue) => [issue.code, issue.path]);
}

describe("問題セットのデータ形式", () => {
  it("正しい問題セットは検証を通る", () => {
    expect(parseQuestionSet({ title, questions: [wine, beef] }, images)).toStrictEqual({
      ok: true,
      set: {
        title: "2026 忘年会 格付けチェック",
        rules: [],
        prizes: [],
        questions: [
          {
            title: "ワイン",
            description: "高いワインはどちら？",
            explanation: "B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。",
            options: [
              { label: "A", image: "/images/aaa.jpg", note: "チリ産の赤ワイン", rank: 2 },
              { label: "B", image: "/images/bbb.jpg", note: "フランス産の赤ワイン", rank: 1 },
            ],
          },
          {
            title: "牛肉",
            description: "高い牛肉はどれ？",
            explanation: "A が A5 ランク。",
            options: [
              { label: "A", image: "/images/ccc.jpg", note: "霜降りの牛肉", rank: 1 },
              { label: "B", image: "/images/ddd.jpg", note: "赤身の牛肉", rank: 3 },
              { label: "C", image: "/images/eee.jpg", note: "脂の多い牛肉", rank: 2 },
            ],
          },
        ],
      },
    });
  });

  it("タイトルがない問題セットは検証に失敗する", () => {
    const issues = issuesOf(parseQuestionSet({ questions: [wine] }, images));
    expect(issues.map((i) => [i.code, i.path, i.message])).toStrictEqual([["shape", ["title"], "必須の項目です"]]);
  });

  it.each([
    ["空文字", ""],
    ["空白だけ", "  　"],
  ])("タイトルが空の問題セットは検証に失敗する（%s）", (_, value) => {
    expect(codesAndPaths(parseQuestionSet({ title: value, questions: [wine] }, images))).toStrictEqual([["shape", ["title"]]]);
  });

  it("問題が 0 件の問題セットは検証に失敗する", () => {
    expect(codesAndPaths(parseQuestionSet({ title, questions: [] }, images))).toStrictEqual([["shape", ["questions"]]]);
  });

  it.each([
    ["title", ""],
    ["description", "   "],
    ["explanation", ""],
    ["explanation", " \n "],
  ])("問題名・説明・解説が空の問題は検証に失敗する（%s: %j）", (field, value) => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, [field]: value }] }, images);
    expect(codesAndPaths(result)).toStrictEqual([["shape", ["questions", 0, field]]]);
  });

  it.each([
    ["image", ""],
    ["image", "  "],
  ])("写真が空の選択肢は検証に失敗する（%s: %j）", (field, value) => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, options: [table, { ...bordeaux, [field]: value }] }] }, images);
    expect(codesAndPaths(result)).toStrictEqual([["shape", ["questions", 0, "options", 1, field]]]);
  });

  it.each([
    ["空文字", ""],
    ["空白だけ", " 　"],
  ])("選択肢の説明が空の選択肢は検証に失敗する（%s）", (_, value) => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, options: [table, { ...bordeaux, note: value }] }] }, images);
    expect(codesAndPaths(result)).toStrictEqual([["shape", ["questions", 0, "options", 1, "note"]]]);
  });

  it("選択肢の説明がない選択肢は検証に失敗する", () => {
    const { note: _, ...withoutNote } = bordeaux;
    const issues = issuesOf(parseQuestionSet({ title, questions: [{ ...wine, options: [table, withoutNote] }] }, images));
    expect(issues.map((i) => [i.code, i.path, i.message])).toStrictEqual([
      ["shape", ["questions", 0, "options", 1, "note"], "必須の項目です"],
    ]);
  });

  it("複数の誤りはまとめて報告される", () => {
    const broken = {
      ...beef,
      explanation: "",
      options: [a5, { ...imported, rank: 1, image: "ない.jpg" }, domestic],
    };
    expect(codesAndPaths(parseQuestionSet({ title, questions: [wine, broken] }, images))).toStrictEqual([
      ["shape", ["questions", 1, "explanation"]],
      ["image-missing", ["questions", 1, "options", 1, "image"]],
      ["rank-permutation", ["questions", 1, "options"]],
    ]);
  });
});

describe("選択肢の数と作者が付けるラベル", () => {
  it("選択肢が 1 個の問題は検証に失敗する", () => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, options: [{ ...bordeaux }] }] }, images);
    expect(codesAndPaths(result)).toStrictEqual([["shape", ["questions", 0, "options"]]]);
  });

  it("選択肢が 4 個の問題は検証に失敗する", () => {
    const fourth = { ...table, rank: 4 };
    const result = parseQuestionSet({ title, questions: [{ ...beef, options: [a5, imported, domestic, fourth] }] }, images);
    expect(codesAndPaths(result)).toStrictEqual([["shape", ["questions", 0, "options"]]]);
  });

  it("ラベルがない選択肢は検証に失敗する", () => {
    const { label: _, ...unlabeled } = bordeaux;
    const issues = issuesOf(parseQuestionSet({ title, questions: [{ ...wine, options: [table, unlabeled] }] }, images));
    expect(issues.map((i) => [i.code, i.path, i.message])).toStrictEqual([
      ["shape", ["questions", 0, "options", 1, "label"], "必須の項目です"],
    ]);
  });

  it("A・B・C 以外のラベルは検証に失敗する", () => {
    const issues = issuesOf(parseQuestionSet({ title, questions: [{ ...wine, options: [table, { ...bordeaux, label: "D" }] }] }, images));
    expect(issues.map((i) => [i.code, i.path])).toStrictEqual([["shape", ["questions", 0, "options", 1, "label"]]]);
    expect(issues[0]!.message).toContain("D");
  });

  it("ラベルが重複する問題は検証に失敗する", () => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, options: [table, { ...bordeaux, label: "A" }] }] }, images);
    expect(issuesOf(result)).toStrictEqual([
      {
        code: "label-permutation",
        path: ["questions", 0, "options"],
        message: "label は A〜B を 1 回ずつ使ってください（A, A）",
      },
    ]);
  });

  it("選択肢数を超えるラベルを使う問題は検証に失敗する", () => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, options: [table, { ...bordeaux, label: "C" }] }] }, images);
    expect(issuesOf(result)).toStrictEqual([
      {
        code: "label-permutation",
        path: ["questions", 0, "options"],
        message: "label は A〜B を 1 回ずつ使ってください（A, C）",
      },
    ]);
  });

  it("ラベルは書いた値になり表示順は書いた順になる", () => {
    const result = parseQuestionSet({ title, questions: [{ ...beef, options: [imported, domestic, a5] }] }, images);
    if (!result.ok) throw new Error(formatIssues(result.issues));
    expect(result.set.questions[0].options.map((o) => [o.label, o.note])).toStrictEqual([
      ["B", "赤身の牛肉"],
      ["C", "脂の多い牛肉"],
      ["A", "霜降りの牛肉"],
    ]);
  });
});

describe("選択肢の順位", () => {
  it("rank 1 がない問題は検証に失敗する", () => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, options: [table, { ...bordeaux, rank: 3 }] }] }, images);
    expect(issuesOf(result)).toStrictEqual([
      {
        code: "rank-permutation",
        path: ["questions", 0, "options"],
        message: "rank は 1〜2 を 1 回ずつ使ってください（2, 3）",
      },
    ]);
  });

  it("rank が重複する問題は検証に失敗する", () => {
    const result = parseQuestionSet({ title, questions: [{ ...beef, options: [a5, { ...imported, rank: 1 }, domestic] }] }, images);
    expect(issuesOf(result)).toStrictEqual([
      {
        code: "rank-permutation",
        path: ["questions", 0, "options"],
        message: "rank は 1〜3 を 1 回ずつ使ってください（1, 1, 2）",
      },
    ]);
  });
});

describe("写真の指定と公開名", () => {
  it("指定した写真がない選択肢は検証に失敗する", () => {
    const withoutBordeaux = new Map([...images].filter(([file]) => file !== "ボルドー.jpg"));
    const issues = issuesOf(parseQuestionSet({ title, questions: [wine] }, withoutBordeaux));
    expect(issues.map((i) => [i.code, i.path])).toStrictEqual([
      ["image-missing", ["questions", 0, "options", 1, "image"]],
    ]);
    expect(issues[0]!.message).toContain("ボルドー.jpg");
  });
});

describe("問題名と説明に正解情報を含めない", () => {
  it("説明に解説を含む問題は検証に失敗する", () => {
    const result = parseQuestionSet({ title, questions: [{ ...wine, description: "ヒント: B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。" }] }, images);
    expect(issuesOf(result)).toStrictEqual([
      {
        code: "public-text-leak",
        path: ["questions", 0, "description"],
        message: "参加者に見える文に解説「B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。」が含まれています",
      },
    ]);
  });

  it("問題名に別の問題の解説を含む問題は検証に失敗する", () => {
    const result = parseQuestionSet({ title, questions: [wine, { ...beef, title: "B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。" }] }, images);
    expect(issuesOf(result)).toStrictEqual([
      {
        code: "public-text-leak",
        path: ["questions", 1, "title"],
        message: "参加者に見える文に解説「B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。」が含まれています",
      },
    ]);
  });

  it("タイトルに解説を含む問題セットは検証に失敗する", () => {
    const result = parseQuestionSet({ title: "B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。", questions: [wine] }, images);
    expect(issuesOf(result)).toStrictEqual([
      { code: "public-text-leak", path: ["title"], message: "参加者に見える文に解説「B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。」が含まれています" },
    ]);
  });

  it("ルールは書いた順に読み、省略すると空にする", () => {
    const rules = ["写真を見て、値段の高いものを当てる", "答えは手元の紙に書く"];
    const result = parseQuestionSet({ title, rules, questions: [wine] }, images);
    expect(result.ok && result.set.rules).toStrictEqual(rules);
  });

  it.each([
    ["空のルール", [""], ["rules", 0]],
    ["リストでない", "写真を見て当てる", ["rules"]],
  ])("ルールの形が誤っている問題セットは検証に失敗する（%s）", (_, rules, path) => {
    expect(codesAndPaths(parseQuestionSet({ title, rules, questions: [wine] }, images))).toStrictEqual([["shape", path]]);
  });

  it("ランクと景品は書いた順に読み、省略すると空にする", () => {
    const prizes = [
      { rank: "1流", condition: "4問正解", prize: "景品を3つ" },
      { rank: "3流", condition: "1問以下", prize: "景品を1つ" },
    ];
    const result = parseQuestionSet({ title, prizes, questions: [wine] }, images);
    expect(result.ok && result.set.prizes).toStrictEqual(prizes);
    const omitted = parseQuestionSet({ title, questions: [wine] }, images);
    expect(omitted.ok && omitted.set.prizes).toStrictEqual([]);
  });

  it("景品が空のランクは検証に失敗する", () => {
    const prizes = [{ rank: "1流", condition: "4問正解", prize: "" }];
    expect(codesAndPaths(parseQuestionSet({ title, prizes, questions: [wine] }, images))).toStrictEqual([["shape", ["prizes", 0, "prize"]]]);
  });

  it("景品に写真のファイル名を含む問題セットは検証に失敗する", () => {
    const prizes = [{ rank: "1流", condition: "4問正解", prize: "ボルドーを1本" }];
    expect(issuesOf(parseQuestionSet({ title, prizes, questions: [wine] }, images))).toStrictEqual([
      { code: "public-text-leak", path: ["prizes", 0, "prize"], message: "参加者に見える文に写真のファイル名「ボルドー」が含まれています" },
    ]);
  });

  it("ルールに解説や写真のファイル名を含む問題セットは検証に失敗する", () => {
    const rules = ["写真を見て当てる", "ボルドーは高い"];
    expect(issuesOf(parseQuestionSet({ title, rules, questions: [wine] }, images))).toStrictEqual([
      { code: "public-text-leak", path: ["rules", 1], message: "参加者に見える文に写真のファイル名「ボルドー」が含まれています" },
    ]);
  });

  it("選択肢の説明に解説を含む問題は検証に失敗する", () => {
    const options = [{ ...table, note: "B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。" }, bordeaux];
    expect(issuesOf(parseQuestionSet({ title, questions: [{ ...wine, options }] }, images))).toStrictEqual([
      {
        code: "public-text-leak",
        path: ["questions", 0, "options", 0, "note"],
        message: "参加者に見える文に解説「B は 1本 5万円のシャトー・マルゴー。A はスーパーで買える赤ワインでした。」が含まれています",
      },
    ]);
  });

  it("選択肢の説明に銘柄を書いた問題は検証を通る", () => {
    const options = [table, { ...bordeaux, note: "シャトー・マルゴー" }];
    expect(parseQuestionSet({ title, questions: [{ ...wine, options }] }, images).ok).toBe(true);
  });

  it("選択肢の説明に写真のファイル名を含む問題は検証に失敗する", () => {
    const options = [table, { ...bordeaux, note: "フランス・ボルドーの赤ワイン" }];
    expect(issuesOf(parseQuestionSet({ title, questions: [{ ...wine, options }] }, images))).toStrictEqual([
      {
        code: "public-text-leak",
        path: ["questions", 0, "options", 1, "note"],
        message: "参加者に見える文に写真のファイル名「ボルドー」が含まれています",
      },
    ]);
  });

  it("正解情報を含まない問題名と説明は検証を通る", () => {
    expect(parseQuestionSet({ title, questions: [wine, beef] }, images).ok).toBe(true);
  });
});

describe("formatIssues", () => {
  it("prints one line per issue with the YAML path, aligned on the longest path", () => {
    expect(
      formatIssues([
        { code: "image-missing", path: ["questions", 0, "options", 1, "image"], message: "写真 ボルドー.jpg が画像フォルダにありません" },
        { code: "rank-permutation", path: ["questions", 2, "options"], message: "rank は 1〜3 を 1 回ずつ使ってください（1, 1, 2）" },
        { code: "public-text-leak", path: ["questions", 0, "description"], message: "参加者に見える文に価格「1本 5万円」が含まれています" },
      ]),
    ).toBe(
      [
        "  questions[0].options[1].image  写真 ボルドー.jpg が画像フォルダにありません",
        "  questions[2].options           rank は 1〜3 を 1 回ずつ使ってください（1, 1, 2）",
        "  questions[0].description       参加者に見える文に価格「1本 5万円」が含まれています",
      ].join("\n"),
    );
  });

  it("reports input that is not a mapping as one issue for the whole file", () => {
    const issues = issuesOf(parseQuestionSet(null, images));
    expect(issues.map((i) => [i.code, i.path])).toStrictEqual([["shape", []]]);
    expect(formatIssues(issues)).toBe("  (ファイル全体)  title: と questions: を持つ形で書いてください");
  });
});

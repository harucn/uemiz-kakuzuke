import { z } from "zod";
import {
  secretFields,
  type ImageUrl,
  type Label,
  type Options,
  type QuestionSet,
  type Rank,
  type SecretKind,
} from "./model.ts";

export type IssueCode = "shape" | "rank-permutation" | "label-permutation" | "image-missing" | "public-text-leak";
export interface Issue {
  readonly code: IssueCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}
export type ParseResult =
  | { readonly ok: true; readonly set: QuestionSet }
  | { readonly ok: false; readonly issues: readonly Issue[] };

const typed = (kind: string) => ({
  error: (issue: { readonly input?: unknown }) =>
    issue.input === undefined ? "必須の項目です" : `${kind}で書いてください`,
});

const oneOf = <const T extends readonly [string, ...string[]]>(values: T, rule: string) =>
  z.enum(values, {
    error: (issue) => (issue.input === undefined ? "必須の項目です" : `${rule}（${String(issue.input)}）`),
  });

const LABELS = ["A", "B", "C"] as const satisfies readonly Label[];
const text = z.string(typed("文字列")).trim().min(1, "空にはできません");
const rank = z.number(typed("数値")).int("整数で書いてください");
const label = oneOf(LABELS, "label は A・B・C のどれかにしてください");
const optionCount = "選択肢は 2 個か 3 個にしてください";

const setSchema = z.object(
  {
    title: text,
    rules: z.array(text, typed("リスト")).optional(),
    prizes: z
      .array(z.object({ rank: text, condition: text, prize: text }, typed("{ rank, condition, prize } の形")), typed("リスト"))
      .optional(),
    questions: z
      .array(
        z.object(
          {
            title: text,
            description: text,
            explanation: text,
            options: z
              .array(
                z.object(
                  { label, image: text, note: text, rank },
                  typed("{ label, image, note, rank } の形"),
                ),
                typed("リスト"),
              )
              .min(2, optionCount)
              .max(3, optionCount),
          },
          typed("{ title, description, explanation, options } の形"),
        ),
        typed("リスト"),
      )
      .min(1, "問題を 1 問以上書いてください"),
  },
  typed("title: と questions: を持つ形"),
);
type ValidInput = z.output<typeof setSchema>;

type LeakKind = SecretKind | "image";
const KIND_NAMES: Record<LeakKind, string> = { explanation: "解説", image: "写真のファイル名" };

export function parseQuestionSet(input: unknown, images: ReadonlyMap<string, ImageUrl>): ParseResult {
  const shape = setSchema.safeParse(input);
  const issues: Issue[] = [
    ...(shape.success ? [] : shape.error.issues.map(shapeIssue)),
    ...crossFieldIssues(input, images),
  ];
  if (!shape.success || issues.length > 0) return { ok: false, issues };
  return { ok: true, set: toQuestionSet(shape.data, images) };
}

/** 1 行に 1 件。ファイル名の見出しは呼び出し側（Vite プラグイン）が付ける */
export function formatIssues(issues: readonly Issue[]): string {
  const paths = issues.map((issue) => formatPath(issue.path));
  const width = Math.max(...paths.map((p) => p.length));
  return issues.map((issue, i) => `  ${paths[i].padEnd(width)}  ${issue.message}`).join("\n");
}

function formatPath(path: readonly (string | number)[]): string {
  if (path.length === 0) return "(ファイル全体)";
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? p : `.${p}`)).join("");
}

function shapeIssue(issue: z.core.$ZodIssue): Issue {
  return {
    code: "shape",
    path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
    message: issue.message,
  };
}

/** 形の誤りがあっても、各規則は自分が読む項目さえ正しければ検査する（誤りを全件まとめて報告するため） */
function* crossFieldIssues(input: unknown, images: ReadonlyMap<string, ImageUrl>): Generator<Issue> {
  const questions = items(at(input, "questions"));
  const secrets = secretsIn(questions);
  yield* leaksIn(at(input, "title"), ["title"], secrets);
  for (const [i, rule] of items(at(input, "rules")).entries()) yield* leaksIn(rule, ["rules", i], secrets);
  for (const [i, prize] of items(at(input, "prizes")).entries()) {
    for (const field of ["rank", "condition", "prize"] as const) yield* leaksIn(at(prize, field), ["prizes", i, field], secrets);
  }
  for (const [i, q] of questions.entries()) {
    const options = items(at(q, "options"));

    for (const [j, o] of options.entries()) {
      const file = valid(text, at(o, "image"));
      if (file !== undefined && !images.has(file)) {
        yield {
          code: "image-missing",
          path: ["questions", i, "options", j, "image"],
          message: `写真 ${file} が画像フォルダにありません`,
        };
      }
    }

    const counted = options.length >= 2 && options.length <= 3;
    const ranks = options.map((o) => valid(rank, at(o, "rank")));
    if (counted && ranks.every((r) => r !== undefined)) {
      const sorted = [...ranks].sort((a, b) => a - b);
      if (sorted.some((r, k) => r !== k + 1)) {
        yield {
          code: "rank-permutation",
          path: ["questions", i, "options"],
          message: `rank は 1〜${ranks.length} を 1 回ずつ使ってください（${ranks.join(", ")}）`,
        };
      }
    }

    const labels = options.map((o) => valid(label, at(o, "label")));
    if (counted && labels.every((l) => l !== undefined)) {
      const sorted = [...labels].sort();
      if (sorted.some((l, k) => l !== LABELS[k])) {
        yield {
          code: "label-permutation",
          path: ["questions", i, "options"],
          message: `label は A〜${LABELS[labels.length - 1]} を 1 回ずつ使ってください（${labels.join(", ")}）`,
        };
      }
    }

    for (const field of ["title", "description"] as const) {
      yield* leaksIn(at(q, field), ["questions", i, field], secrets);
    }
    for (const [j, o] of options.entries()) {
      yield* leaksIn(at(o, "note"), ["questions", i, "options", j, "note"], secrets);
    }
  }
}

function* leaksIn(value: unknown, path: Issue["path"], secrets: ReadonlyMap<string, LeakKind>): Generator<Issue> {
  const shown = valid(text, value);
  if (shown === undefined) return;
  for (const [secret, kind] of secrets) {
    if (shown.includes(secret)) {
      yield { code: "public-text-leak", path, message: `参加者に見える文に${KIND_NAMES[kind]}「${secret}」が含まれています` };
    }
  }
}

function secretsIn(questions: readonly unknown[]): ReadonlyMap<string, LeakKind> {
  const secrets = new Map<string, LeakKind>();
  for (const q of questions) {
    const fields = secretFields({ explanation: at(q, "explanation") });
    for (const { kind, value } of fields) {
      const secret = valid(text, value);
      if (secret !== undefined && !secrets.has(secret)) secrets.set(secret, kind);
    }
  }
  // 解説と同じ名前の写真は解説として報告するので、写真のファイル名は最後に足す
  for (const q of questions) {
    for (const o of items(at(q, "options"))) {
      const base = valid(text, valid(text, at(o, "image"))?.replace(/\.[^.]*$/, ""));
      if (base !== undefined && !secrets.has(base)) secrets.set(base, "image");
    }
  }
  return secrets;
}

function at(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function items(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function valid<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/** 全規則を通った入力だけを受け取る。ブランド型と Rank・Options への絞り込みはここでだけ行う */
function toQuestionSet(input: ValidInput, images: ReadonlyMap<string, ImageUrl>): QuestionSet {
  const questions = input.questions.map((q) => ({
    title: q.title,
    description: q.description,
    explanation: q.explanation,
    options: q.options.map((o) => ({
      label: o.label,
      image: images.get(o.image)!,
      note: o.note,
      rank: o.rank as Rank,
    })) as unknown as Options,
  }));
  return { title: input.title, rules: input.rules ?? [], prizes: input.prizes ?? [], questions } as unknown as QuestionSet;
}

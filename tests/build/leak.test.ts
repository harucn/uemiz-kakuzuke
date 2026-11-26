import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "vite";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { LEAK_CANARY } from "../../src/guest/leak-canary";
import {
  PUBLIC_OPTION_KEYS,
  PUBLIC_QUESTION_KEYS,
  PUBLIC_SET_KEYS,
  secretStrings,
  toPublic,
  type PublicQuestionSet,
} from "../../src/question-set/model";
import { kakuzukeQuestions, loadQuestionSet } from "../../src/question-set/vite-plugin";
import { findSecrets } from "../leak";

const root = path.resolve(import.meta.dirname, "../..");
const clientDir = path.join(root, "dist/client");
const BINARY_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".otf"]);

interface ClientFile {
  /** dist/client からの相対パス（/ 区切り） */
  readonly path: string;
  /** バイナリは中身を読まず、パスだけ検査する */
  readonly text: string | undefined;
}

const files: readonly ClientFile[] = readdirSync(clientDir, { recursive: true, encoding: "utf8" })
  .filter((relative) => statSync(path.join(clientDir, relative)).isFile())
  .map((relative) => ({
    path: relative.split(path.sep).join("/"),
    text: BINARY_EXTENSIONS.has(path.extname(relative).toLowerCase())
      ? undefined
      : readFileSync(path.join(clientDir, relative), "utf8"),
  }));

function textOf(file: string): string {
  const text = files.find((f) => f.path === file)?.text;
  if (text === undefined) throw new Error(`dist/client/${file} がありません`);
  return text;
}

/** 見つかった箇所を「ファイル: 「秘密」 …前後の文字…」の形で返す。パスとファイルの中身の両方を探す */
function leaksIn(file: ClientFile, secrets: readonly string[]): string[] {
  return [
    ...findSecrets(file.path, secrets).map((hit) => `${file.path}（パス）: 「${hit.secret}」 …${hit.context}…`),
    ...findSecrets(file.text ?? "", secrets).map((hit) => `${file.path}: 「${hit.secret}」 …${hit.context}…`),
  ];
}

// ビルドと同じ問題ファイルを読む。KAKUZUKE_CONTENT_DIR の扱いはプラグインの locate と同じ
const set = loadQuestionSet(root);
const { questions } = set;
const secrets = secretStrings(set);
const contentDir = path.resolve(root, process.env.KAKUZUKE_CONTENT_DIR ?? "content");
const authored = parseYaml(readFileSync(path.join(contentDir, "questions.yaml"), "utf8")) as {
  readonly questions: readonly { readonly options: readonly { readonly image: string }[] }[];
};
const imageNames = [...new Set(authored.questions.flatMap((q) => q.options.map((o) => o.image)))];

type Hook<F> = F | { readonly handler: F } | undefined;

function handlerOf<F extends (...args: never[]) => unknown>(hook: Hook<F>): F {
  if (hook === undefined) throw new Error("プラグインにフックがありません");
  return typeof hook === "function" ? hook : hook.handler;
}

/** プラグインのフックを client 環境として直接呼び、virtual:kakuzuke/public の load の出力を読んで返す */
async function publicData(): Promise<PublicQuestionSet> {
  const plugin = kakuzukeQuestions();
  const context = {
    environment: { name: "client" },
    error(message: string): never {
      throw new Error(message);
    },
  };
  await handlerOf(plugin.configResolved).call(context as never, { root } as ResolvedConfig);
  const id = await handlerOf(plugin.resolveId).call(context as never, "virtual:kakuzuke/public", undefined, {
    isEntry: false,
  } as never);
  if (typeof id !== "string") throw new Error(`virtual:kakuzuke/public が解決されません（${String(id)}）`);
  const loaded = await handlerOf(plugin.load).call(context as never, id);
  if (typeof loaded !== "string") throw new Error("virtual:kakuzuke/public の load が文字列を返しません");
  const json = /^export default (.*);$/m.exec(loaded)?.[1];
  if (json === undefined) throw new Error(`export default の形ではありません: ${loaded.slice(0, 80)}`);
  return JSON.parse(json) as PublicQuestionSet;
}

describe("参加者に届くデータに正解情報を含めない", () => {
  it("秘密リストが空でなく件数が一致する", () => {
    const expected = new Set(questions.map((q) => q.explanation));
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets).toHaveLength(expected.size);
    expect(new Set(secrets)).toEqual(expected);
  });

  it("陽性対照: クライアント JS から LEAK_CANARY が見つかる", () => {
    const scripts = files.filter((f) => /\.m?js$/.test(f.path));
    expect(scripts.length).toBeGreaterThan(0);
    const found = scripts.some((f) => findSecrets(f.text ?? "", [LEAK_CANARY]).length > 0);
    expect(found, `dist/client の JS ${scripts.length} 本のどれからも LEAK_CANARY が見つからない`).toBe(true);
  });

  it("陽性対照: 参加者画面の HTML から LEAK_CANARY が見つかる", () => {
    const found = findSecrets(textOf("index.html"), [LEAK_CANARY]).length > 0;
    expect(found, "dist/client/index.html から LEAK_CANARY が見つからない").toBe(true);
  });

  // 秘密文字列を実際に見つけられることは、viewOf の単体テストの陽性対照で確かめている
  it("本検査: どのファイルにも秘密文字列がない", () => {
    expect(files.length).toBeGreaterThan(0);
    const leaks = files.flatMap((f) => leaksIn(f, secrets));
    expect(leaks, "参加者に届くファイルに秘密文字列がある").toEqual([]);
  });

  it("本検査: 写真の元のファイル名がどのファイルの中身とパスにもない", () => {
    expect(imageNames.length).toBeGreaterThan(0);
    const baseNames = imageNames.map((name) => path.basename(name, path.extname(name)));
    const leaks = files.flatMap((f) => leaksIn(f, baseNames));
    expect(leaks, "写真の元のファイル名が dist/client に現れる").toEqual([]);
  });

  it("本検査: dist/client/images の画像は指定された写真の種類と一致する", () => {
    const published = [...new Set(questions.flatMap((q) => q.options.map((o) => o.image.slice(1))))].sort();
    const emitted = files.filter((f) => f.path.startsWith("images/")).map((f) => f.path).sort();
    expect(emitted).toEqual(published);
  });

  it("公開データの構造: virtual:kakuzuke/public の出力が toPublic と一致し、キーが許可リストと完全一致する", async () => {
    const data = await publicData();

    expect(data).toStrictEqual(toPublic(set));
    expect(Object.keys(data).sort()).toEqual([...PUBLIC_SET_KEYS].sort());
    for (const [i, question] of data.questions.entries()) {
      expect(Object.keys(question).sort()).toEqual([...PUBLIC_QUESTION_KEYS].sort());
      for (const option of question.options) {
        expect(Object.keys(option).sort()).toEqual([...PUBLIC_OPTION_KEYS].sort());
        expect(option).not.toHaveProperty("rank");
        if (set.questions[i].mode === "price") expect(option.note).toEqual(expect.stringMatching(/\S/));
        else expect(option.note).toBeNull();
      }
    }
  });

  it("参加者に届くデータの選択肢はラベルを持たない", async () => {
    const data = await publicData();
    expect(data.questions.length).toBeGreaterThan(0);
    for (const question of data.questions) {
      for (const option of question.options) expect(option).not.toHaveProperty("label");
    }
  });

  it("参加者に届くデータで、写真当て以外の問題はラベルを持たない", async () => {
    const data = await publicData();
    for (const [i, question] of data.questions.entries()) {
      if (set.questions[i].mode === "price") expect(question.labels, `第 ${i + 1} 問`).toBeNull();
      else expect(question.labels).toEqual(set.questions[i].options.map((o) => o.label));
    }
  });
});

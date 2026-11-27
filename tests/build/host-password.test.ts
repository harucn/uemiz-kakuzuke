import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { sessionToken } from "../../src/venue/host-auth";
import { findSecrets } from "../leak";

const root = path.resolve(import.meta.dirname, "../..");
const distDir = path.join(root, "dist");
const DEV_VARS = "server/.dev.vars";

// vite preview と同じく、ビルドが書き出したファイルから読む
const devVarsPath = path.join(distDir, DEV_VARS);
const password = existsSync(devVarsPath) ? parseEnv(readFileSync(devVarsPath, "utf8")).HOST_PASSWORD : undefined;

/** dist からの相対パス（/ 区切り）と、値が見つかった位置。値そのものは持たない */
async function hits(): Promise<{ readonly file: string; readonly at: string }[]> {
  const secrets = [password!, await sessionToken(password!)];
  return readdirSync(distDir, { recursive: true, encoding: "utf8" })
    .filter((relative) => statSync(path.join(distDir, relative)).isFile())
    .flatMap((relative) => {
      const file = relative.split(path.sep).join("/");
      const text = readFileSync(path.join(distDir, relative), "utf8");
      return [
        ...findSecrets(file, secrets).map(() => ({ file, at: "パス" })),
        ...findSecrets(text, secrets).map((hit) => ({ file, at: `${hit.index} 文字目` })),
      ];
    });
}

describe("司会のパスワードを dist/server/.dev.vars の外に出さない", () => {
  if (!password) {
    if (process.env.CI === "true") {
      it("CI では dist/server/.dev.vars に HOST_PASSWORD が要る", () => {
        expect.fail("HOST_PASSWORD を設定してビルドする");
      });
    } else {
      it.skip("dist/server/.dev.vars に HOST_PASSWORD がないので漏洩検査を飛ばす", () => {});
    }
    return;
  }

  it("陽性対照: dist/server/.dev.vars からパスワードが見つかる", async () => {
    expect((await hits()).some((hit) => hit.file === DEV_VARS)).toBe(true);
  });

  it("本検査: ほかの dist のファイルにパスワードとセッションの Cookie の値がない", async () => {
    const leaks = (await hits()).filter((hit) => hit.file !== DEV_VARS).map((hit) => `${hit.file}: ${hit.at}`);
    expect(leaks).toEqual([]);
  });
});

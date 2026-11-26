import { expect, type Page } from "@playwright/test";
import type { Question } from "../../src/question-set/model.ts";

/** 選択肢の n 番目（表示順） */
export const optionCard = (page: Page, index: number) => page.locator(".option-card").nth(index);
export const optionPhoto = (page: Page, index: number) => optionCard(page, index).locator("img");
export const optionNote = (page: Page, index: number) => optionCard(page, index).locator(".option-note");

/** どの写真がどのラベルかを読み取れる要素: ラベルの帯、data-label 属性、ラベルを含む代替テキスト */
export function labelTraces(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...[...document.querySelectorAll(".label-bar")].map((el) => `.label-bar「${el.textContent}」`),
    ...[...document.querySelectorAll("[data-label]")].map((el) => `data-label="${el.getAttribute("data-label")}"`),
    ...[...document.querySelectorAll("img")].filter((img) => /選択肢\s*[ABC]/.test(img.alt)).map((img) => `alt="${img.alt}"`),
  ]);
}

export async function expectNoLabels(page: Page) {
  expect(await labelTraces(page), "画面に置かれたラベル").toEqual([]);
}

/** 正解発表前のラベル: 写真当て以外は何も置かない。写真当ては表示順の各写真の左上に、問題データのとおりのラベルだけを出し、誰の写真かはまだ出さない */
export async function expectLabelsBeforeReveal(page: Page, q: Pick<Question, "mode" | "options">) {
  if (q.mode === "price") return expectNoLabels(page);
  await expect(page.locator(".label-bar")).toHaveCount(0);
  for (const [i, o] of q.options.entries()) {
    await expect(optionCard(page, i).locator(".label-chip")).toHaveText(o.label);
    await expect(optionCard(page, i)).toHaveAttribute("data-label", o.label);
    await expect(optionCard(page, i).locator(".option-caption")).toHaveText("");
  }
}

/** 選択肢が問題データの表示順に写真と選択肢の説明つきで表示され、写真が読み込み済み。説明のない選択肢（写真当て）は写真の下に何も出ない */
export async function expectOptions(page: Page, options: readonly { readonly image: string; readonly note: string | null }[]) {
  await expect(page.locator(".option-card")).toHaveCount(options.length);
  for (const [i, o] of options.entries()) {
    await expect(optionPhoto(page, i)).toHaveAttribute("src", o.image);
    if (o.note === null) await expect(optionNote(page, i)).toHaveCount(0);
    else await expect(optionNote(page, i)).toHaveText(o.note);
    await expect.poll(() => optionPhoto(page, i).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  }
}

/** 正解発表後の表示順 index 番目の選択肢のラベル。写真当ては左上の小さいラベルだけで中央に重ねず、写真の下に誰の写真かを出す。ほかは中央の大きなラベル */
export async function expectRevealedOption(
  page: Page,
  index: number,
  q: Pick<Question, "mode">,
  o: { readonly label: string; readonly caption: string | null },
) {
  const card = optionCard(page, index);
  if (q.mode === "price") {
    await expect(card.locator(".label-bar")).toHaveText(o.label);
    return;
  }
  await expect(card.locator(".label-chip")).toHaveText(o.label);
  await expect(card.locator(".label-bar")).toHaveCount(0);
  await expect(card.locator(".option-caption")).toHaveText(o.caption!);
}

/** 正解発表のめくりが終わるまで待つ。めくっている間の座標は回転を含み、表と裏の 2 枚が重なっているので、測る前に呼ぶ */
export async function settleCards(page: Page) {
  await page.locator(".card-slot").evaluateAll((slots) => Promise.all(slots.flatMap((slot) => slot.getAnimations().map((a) => a.finished))));
}

/** 表示順の写真の src と座標・大きさ */
export async function photoBoxes(page: Page) {
  await settleCards(page);
  return page
    .locator(".option-card img")
    .evaluateAll((imgs: HTMLImageElement[]) => imgs.map((img) => ({ src: img.getAttribute("src"), box: img.getBoundingClientRect().toJSON() })));
}

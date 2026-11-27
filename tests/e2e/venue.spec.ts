import { expect, test } from "@playwright/test";
import { connectVenue, resetVenue, skipIfRemote, type VenueClient } from "./venue.ts";

const clients: VenueClient[] = [];
function connect(...args: Parameters<typeof connectVenue>) {
  const client = connectVenue(...args);
  clients.push(client);
  return client;
}

test.beforeEach(async ({ baseURL }) => {
  skipIfRemote();
  await resetVenue(baseURL!);
});
test.afterEach(() => {
  for (const client of clients.splice(0)) client.close();
});

test("すべての画面を閉じても状態が残る", async ({ baseURL }) => {
  const host = connect(baseURL!, "host");
  const guest = connect(baseURL!, "guest");
  await host.next();
  await guest.next();
  for (let i = 0; i < 4; i++) {
    host.send({ type: "next" });
    await host.next();
  }
  expect(host.frames.at(-1)!.view).toEqual({ phase: "asking", index: 3 });
  host.close();
  guest.close();

  const reopened = connect(baseURL!, "host");

  expect(await reopened.next()).toMatchObject({ cause: "joined", view: { phase: "asking", index: 3 } });
});

test("次へが 2 つの参加者画面に届く", async ({ baseURL }) => {
  const guests = [connect(baseURL!, "guest"), connect(baseURL!, "guest")];
  const host = connect(baseURL!, "host");
  await Promise.all([...guests, host].map((client) => client.next()));

  host.send({ type: "next" });
  const received = await Promise.all(guests.map((guest) => guest.next(1000)));

  const operated = await host.next();
  expect(operated).toMatchObject({ cause: "operated", view: { phase: "asking", index: 0 } });
  expect(received).toEqual([operated, operated]);
});

test("ログインせずに司会としてつなぐと拒否される", async ({ baseURL }) => {
  const bare = connect(baseURL!, "host", { cookie: null });

  await expect(bare.next()).rejects.toThrow("host の接続に失敗した");
  expect(bare.frames).toEqual([]);
  expect(await connect(baseURL!, "host").next()).toMatchObject({ cause: "joined", view: { phase: "title" } });
});

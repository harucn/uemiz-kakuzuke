import handler from "@tanstack/react-start/server-entry";
import { hostSession, isHost } from "./venue/host-auth.ts";
import { HOST_SESSION_PATH, roleOf, VENUE_NAME, VENUE_PATH } from "./venue/protocol.ts";

export { Venue } from "./venue/durable-object.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === HOST_SESSION_PATH) return hostSession(request, env.HOST_PASSWORD);
    if (url.pathname === VENUE_PATH) {
      // DO へ渡す分岐の中で認可するので、検証を通らずに DO へ届く経路を作れない
      if (roleOf(url) === "host" && !(await isHost(request, env.HOST_PASSWORD))) return new Response(null, { status: 401 });
      return env.VENUE.getByName(VENUE_NAME).fetch(request);
    }
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;

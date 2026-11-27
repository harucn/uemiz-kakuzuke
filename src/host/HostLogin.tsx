import { useFormStatus } from "react-dom";
import type { Gate } from "./gate.ts";

const MESSAGES = {
  wrong: "パスワードが違います",
  network: "サーバーにつながりませんでした。もう一度ログインしてください",
} as const;

export function HostLogin({
  error,
  onSubmit,
}: {
  readonly error: Extract<Gate, { readonly kind: "locked" }>["error"];
  readonly onSubmit: (password: string) => Promise<void>;
}) {
  return (
    <main className="host-stage" aria-label="司会画面">
      <form className="host-login px" action={(data) => onSubmit(String(data.get("password") ?? ""))}>
        <label className="host-login__field">
          パスワード
          <input className="host-login__input" type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        {error !== null && (
          <p role="alert" className="host-login__error">
            {MESSAGES[error]}
          </p>
        )}
        <LoginButton />
      </form>
    </main>
  );
}

function LoginButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-go px" disabled={pending}>
      ログイン
    </button>
  );
}

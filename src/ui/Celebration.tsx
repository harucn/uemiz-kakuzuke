import { create, type Options } from "canvas-confetti";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { palette } from "../styles/tokens.ts";

const COLORS = [palette.red, palette.green, palette.pink, palette.gold];
/** canvas の 1 ドットが占める CSS ピクセルの下限 */
const MIN_DOT = 2;
/** 画面の幅に並ぶドットの数。1280px 幅で 1 ドット 2px になり、画面が広いほどドットも大きくして、画面に対する紙吹雪の大きさを保つ */
const DOTS_ACROSS = 640;
/** 下の値は、高さ 360 ドット（1280×720 の画面）のときの canvas-confetti の設定。速さと重力は画面の高さに比例させる */
const BASE_HEIGHT = 360;
/** 左下と右下から同時に 1 回だけ打つ */
const PARTICLE_COUNT = 180;
const SPREAD_DEG = 70;
/** 初速と、1 フレームごとに残る速さの割合。初速を抑えて減速をゆるくし、飛ぶ距離（初速 / (1 - DECAY)）は保つ */
const START_VELOCITY = 20;
const DECAY = 0.94;
/** 左下からの打ち上げの角度（水平から）。右下は左右対称 */
const ANGLE_DEG = 60;
/** 紙吹雪の大きさ（canvas-confetti の scalar）。ドット単位なので、画面に対する大きさは画面の幅によらない */
const SCALAR = 0.65;
const GRAVITY = 0.6;
/** 紙吹雪が消えるまでのフレーム数（60fps で 6 秒）。canvas-confetti は時間とともに薄くして消す */
const TICKS = 360;

const REDUCE = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = matchMedia(REDUCE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => matchMedia(REDUCE).matches,
    () => true,
  );
}

/** 画面の下の左右の端から打ち上げる紙吹雪（canvas-confetti）。粗い canvas を拡大して、ドット絵の画面に合わせる。
 * 再生し直すときは key を変えて作り直す。終わった後も要素は残し、絵だけ消す */
export function Celebration() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dot = Math.max(MIN_DOT, canvas.clientWidth / DOTS_ACROSS);
    canvas.width = Math.floor(canvas.clientWidth / dot);
    canvas.height = Math.floor(canvas.clientHeight / dot);
    const scale = canvas.height / BASE_HEIGHT;
    const confetti = create(canvas, { resize: false, useWorker: false });
    const shot = (fromLeft: boolean): Options => ({
      particleCount: PARTICLE_COUNT,
      spread: SPREAD_DEG,
      startVelocity: START_VELOCITY * scale,
      decay: DECAY,
      gravity: GRAVITY * scale,
      angle: fromLeft ? ANGLE_DEG : 180 - ANGLE_DEG,
      origin: { x: fromLeft ? 0 : 1, y: 1 },
      colors: COLORS,
      shapes: ["square"],
      scalar: SCALAR,
      ticks: TICKS,
    });
    void confetti(shot(true));
    void confetti(shot(false));
    return () => confetti.reset();
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={ref} className="celebration" data-testid="celebration" aria-hidden="true" />;
}

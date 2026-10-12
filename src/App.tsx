import { useCallback, useEffect, useRef, useState } from "react";
import Controls, { type Zone } from "./components/Controls";
import PixelImg from "./components/PixelImg";
import { EndScreen, PauseOverlay, StartScreen } from "./components/Screens";
import { FACE_URL, ICON_FALLBACK, ICON_URL } from "./game/assets";
import { Game, type EndInfo, type Phase } from "./game/engine";
import {
  loadSave,
  pushScore,
  shrinkImage,
  writeSave,
  type SaveData,
} from "./game/storage";

const RATIO = 9 / 16;

function useFitBox() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      let bw = h * RATIO;
      let bh = h;
      if (bw > w) {
        bw = w;
        bh = w / RATIO;
      }
      setBox({ w: Math.floor(bw), h: Math.floor(bh) });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener("orientationchange", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", compute);
    };
  }, []);
  return { ref, box };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const saveRef = useRef<SaveData>(loadSave());
  const [save, setSave] = useState<SaveData>(saveRef.current);
  const [phase, setPhase] = useState<Phase>("ready");
  const [end, setEnd] = useState<EndInfo | null>(null);
  const { ref: wrapRef, box } = useFitBox();

  const faceSrc = save.face ?? FACE_URL;

  /* ---------------- boot the engine once ---------------- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = new Game(cv);
    gameRef.current = g;
    g.setBest(saveRef.current.best);
    g.onPhase = (p, info) => {
      setPhase(p);
      if (info) {
        setEnd(info);
        const next = pushScore(saveRef.current, {
          score: info.score,
          win: info.win,
          date: Date.now(),
        });
        saveRef.current = next;
        setSave(next);
        g.setBest(next.best);
      }
    };
    return () => {
      g.destroy();
      gameRef.current = null;
    };
  }, []);

  /* ---------------- rider face image ---------------- */
  useEffect(() => {
    const g = gameRef.current;
    const img = new Image();
    img.decoding = "sync";
    img.onload = () => {
      if (gameRef.current) gameRef.current.faceImg = img;
    };
    img.src = faceSrc;
    if (g && img.complete) g.faceImg = img;
  }, [faceSrc]);

  const releaseInput = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.setLeft(false);
    g.setRight(false);
    g.setBoost(false);
  }, []);

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const set = (z: Zone, v: boolean) => {
      const g = gameRef.current;
      if (!g) return;
      if (z === "left") g.setLeft(v);
      else if (z === "right") g.setRight(v);
      else g.setBoost(v);
    };

    const zoneOf = (k: string): Zone | null => {
      if (k === "ArrowLeft" || k === "a" || k === "A") return "left";
      if (k === "ArrowRight" || k === "d" || k === "D") return "right";
      if (k === "ArrowUp" || k === "w" || k === "W") return "boost";
      return null;
    };

    const down = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const z = zoneOf(e.key);
      if (z || e.key === " ") e.preventDefault();
      if (z) {
        set(z, true);
        return;
      }
      if (e.repeat) return;
      if (e.key === " " || e.key === "Enter") {
        if (g.phase === "ready" || g.phase === "over") {
          releaseInput();
          g.start();
        }
        return;
      }
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        if (g.phase === "playing" || g.phase === "paused") {
          releaseInput();
          g.togglePause();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      const z = zoneOf(e.key);
      if (z) set(z, false);
    };
    const blur = () => {
      releaseInput();
      const g = gameRef.current;
      if (g && g.phase === "playing") g.togglePause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [releaseInput]);

  /* ---------------- handlers ---------------- */
  const onZone = useCallback(
    (z: Zone, v: boolean) => {
      const g = gameRef.current;
      if (!g) return;
      if (z === "left") g.setLeft(v);
      else if (z === "right") g.setRight(v);
      else g.setBoost(v);
    },
    [],
  );

  const start = useCallback(() => {
    releaseInput();
    setEnd(null);
    gameRef.current?.start();
  }, [releaseInput]);

  const toMenu = useCallback(() => {
    releaseInput();
    setEnd(null);
    gameRef.current?.toMenu();
  }, [releaseInput]);

  const togglePause = useCallback(() => {
    releaseInput();
    gameRef.current?.togglePause();
  }, [releaseInput]);

  const pickFace = useCallback(async (file: File) => {
    try {
      const data = await shrinkImage(file, 128);
      const next = { ...saveRef.current, face: data };
      saveRef.current = next;
      writeSave(next);
      setSave(next);
    } catch {
      /* ignore */
    }
  }, []);

  const inGame =
    phase === "playing" ||
    phase === "countdown" ||
    phase === "ending" ||
    phase === "paused";
  const showStart = phase === "ready";
  const showEnd = phase === "over" && !!end;
  const showPause = phase === "paused";

  return (
    <div
      dir="rtl"
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 0%, #1a1a3a 0%, #0a0a16 55%, #05050c 100%)",
      }}
    >
      {/* ---------------- top bar ---------------- */}
      <header className="relative z-20 flex h-[38px] shrink-0 items-center justify-between bg-[#12122a] px-3"
        style={{ boxShadow: "0 3px 0 #06060d, inset 0 -2px 0 #26264a" }}>
        <div className="flex items-center gap-2">
          <PixelImg
            src={ICON_URL}
            fallback={ICON_FALLBACK}
            className="h-[24px] w-[24px] rounded-[4px] text-[15px]"
          />
          <span className="retro text-[13px] font-black text-[#ffd24a]">وائل السريع</span>
        </div>
        <div className="flex items-center gap-2">
          {inGame && (
            <button
              type="button"
              onClick={togglePause}
              aria-label="إيقاف مؤقت"
              className="pixbtn flex h-[26px] w-[34px] items-center justify-center rounded-[4px] bg-[#2f6fd0] text-[13px]"
              style={{ boxShadow: "inset 0 -3px 0 #17407e, 0 0 0 2px #0b0b16" }}
            >
              {phase === "paused" ? "▶" : "❚❚"}
            </button>
          )}
          {(phase === "playing" || phase === "paused" || phase === "over") && (
            <button
              type="button"
              onClick={toMenu}
              aria-label="القائمة"
              className="pixbtn flex h-[26px] w-[34px] items-center justify-center rounded-[4px] bg-[#5a5a80] text-[13px]"
              style={{ boxShadow: "inset 0 -3px 0 #3a3a55, 0 0 0 2px #0b0b16" }}
            >
              🏠
            </button>
          )}
        </div>
      </header>

      {/* ---------------- game viewport ---------------- */}
      <main ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scanlines vignette"
          style={{ width: box.w || 1, height: box.h || 1 }}
        >
          <canvas
            ref={canvasRef}
            className="pixelated block h-full w-full"
            style={{ imageRendering: "pixelated" }}
          />

          {showStart && (
            <StartScreen
              faceSrc={faceSrc}
              best={save.best}
              scores={save.scores}
              onStart={start}
              onFace={pickFace}
            />
          )}
          {showPause && (
            <PauseOverlay
              onResume={togglePause}
              onRestart={start}
              onMenu={toMenu}
            />
          )}
          {showEnd && end && (
            <EndScreen
              info={end}
              scores={save.scores}
              faceSrc={faceSrc}
              onRestart={start}
              onMenu={toMenu}
            />
          )}
        </div>

        {/* desktop hint */}
        <div className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 gap-3 text-[11px] font-bold text-[#5a5a86] md:flex">
          <span className="retro-sm">◄ ► للتحرك</span>
          <span className="retro-sm">↑ توربو</span>
          <span className="retro-sm">مسافة للبدء</span>
          <span className="retro-sm">P إيقاف</span>
        </div>
      </main>

      {/* ---------------- touch controls ---------------- */}
      <Controls onZone={onZone} dim={!inGame} />
    </div>
  );
}

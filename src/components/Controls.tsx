import { useCallback, useEffect, useRef, useState } from "react";

export type Zone = "left" | "right" | "boost";

interface Props {
  onZone: (zone: Zone, down: boolean) => void;
  dim?: boolean;
}

const ZONES: Zone[] = ["left", "boost", "right"];

export default function Controls({ onZone, dim }: Props) {
  const pointers = useRef(new Map<number, Zone>());
  const [active, setActive] = useState<Record<Zone, boolean>>({
    left: false,
    right: false,
    boost: false,
  });

  const apply = useCallback(() => {
    const set = new Set(pointers.current.values());
    const next = {
      left: set.has("left"),
      right: set.has("right"),
      boost: set.has("boost"),
    };
    setActive(next);
    ZONES.forEach((z) => onZone(z, next[z]));
  }, [onZone]);

  /* safety net: never let a button stick if the finger is lifted off-window */
  useEffect(() => {
    const clear = () => {
      if (!pointers.current.size) return;
      pointers.current.clear();
      setActive({ left: false, right: false, boost: false });
      onZone("left", false);
      onZone("right", false);
      onZone("boost", false);
    };
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, [onZone]);

  const zoneAt = (x: number, y: number): Zone | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const hit = el?.closest("[data-zone]") as HTMLElement | null;
    return (hit?.dataset.zone as Zone | undefined) ?? null;
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const z = zoneAt(e.clientX, e.clientY);
    if (!z) return;
    pointers.current.set(e.pointerId, z);
    apply();
  };

  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const z = zoneAt(e.clientX, e.clientY);
    if (z) {
      pointers.current.set(e.pointerId, z);
      apply();
    }
  };

  const up = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    apply();
  };

  const base =
    "pixbtn relative flex items-center justify-center select-none touch-none rounded-[6px] transition-[transform,filter]";

  return (
    <div
      className="relative z-20 w-full select-none touch-none px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      style={{ background: "linear-gradient(#16162a,#0b0b16)" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* decorative screws */}
      <div className="mb-2 flex items-center justify-between px-2 text-[10px] font-bold tracking-widest text-[#4c4c70]">
        <span className="retro-sm">◀ يسار</span>
        <span className="retro-sm text-[#6c6c96]">توربو</span>
        <span className="retro-sm">يمين ▶</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          data-zone="left"
          aria-label="يسار"
          className={`${base} h-[86px] flex-1`}
          style={{
            background: active.left ? "#2f6fd0" : "#1b2f5c",
            boxShadow: active.left
              ? "inset 0 -3px 0 #17407e, 0 0 0 3px #0b0b16, 0 0 0 5px #6fa8ff"
              : "inset 0 -5px 0 #12244a, 0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52",
            opacity: dim ? 0.55 : 1,
          }}
        >
          <span className="text-3xl leading-none">◀</span>
        </button>

        <button
          type="button"
          data-zone="boost"
          aria-label="توربو"
          className={`${base} h-[86px] w-[27%] max-w-[120px]`}
          style={{
            background: active.boost ? "#ff8a2e" : "#7a2f10",
            boxShadow: active.boost
              ? "inset 0 -3px 0 #a34d0d, 0 0 0 3px #0b0b16, 0 0 0 5px #ffd24a"
              : "inset 0 -5px 0 #5c2109, 0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52",
            opacity: dim ? 0.55 : 1,
          }}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="text-2xl">🔥</span>
            <span className="mt-1 text-[10px] font-extrabold">توربو</span>
          </span>
        </button>

        <button
          type="button"
          data-zone="right"
          aria-label="يمين"
          className={`${base} h-[86px] flex-1`}
          style={{
            background: active.right ? "#2f6fd0" : "#1b2f5c",
            boxShadow: active.right
              ? "inset 0 -3px 0 #17407e, 0 0 0 3px #0b0b16, 0 0 0 5px #6fa8ff"
              : "inset 0 -5px 0 #12244a, 0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52",
            opacity: dim ? 0.55 : 1,
          }}
        >
          <span className="text-3xl leading-none">▶</span>
        </button>
      </div>
    </div>
  );
}

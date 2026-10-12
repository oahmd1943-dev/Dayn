import { useState } from "react";
import { ICON_FALLBACK, ICON_URL } from "../game/assets";
import PixelImg from "./PixelImg";
import type { EndInfo } from "../game/engine";
import type { ScoreEntry } from "../game/storage";

/* --------------------------- bits --------------------------- */

export function FaceBadge({
  src,
  size,
  anim,
  glow = "#e03535",
}: {
  src: string;
  size: number;
  anim?: "shake" | "nod";
  glow?: string;
}) {
  const animCls = anim === "shake" ? "anim-shake-head" : anim === "nod" ? "anim-nod" : "";
  return (
    <div
      className="relative shrink-0 rounded-[10%]"
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 3px #0b0b16, 0 0 0 6px ${glow}, 0 0 18px ${glow}66`,
        background: "#12122a",
      }}
    >
      <img
        src={src}
        alt="وائل"
        draggable={false}
        className={`pixelated h-full w-full rounded-[10%] object-cover ${animCls}`}
      />
    </div>
  );
}

function PixButton({
  children,
  onClick,
  color = "#e03535",
  size = "lg",
}: {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
  size?: "lg" | "md";
}) {
  const h = size === "lg" ? "h-[58px] text-xl" : "h-[42px] text-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixbtn ${h} w-full rounded-[6px]`}
      style={{
        background: color,
        boxShadow: `inset 0 -6px 0 rgba(0,0,0,0.35), 0 0 0 3px #0b0b16, 0 0 0 6px ${
          size === "lg" ? "#f5c531" : "#3a3a52"
        }`,
      }}
    >
      <span className="retro">{children}</span>
    </button>
  );
}

export function ScoreTable({ scores }: { scores: ScoreEntry[] }) {
  if (!scores.length) {
    return (
      <p className="retro-sm py-3 text-center text-[11px] text-[#7d7da8]">
        لا توجد نتائج بعد — كن أول المتسابقين!
      </p>
    );
  }
  const medals = ["🥇", "🥈", "🥉", "4", "5", "6", "7", "8"];
  return (
    <ul className="flex flex-col gap-[3px]">
      {scores.slice(0, 5).map((s, i) => (
        <li
          key={`${s.date}-${i}`}
          className="flex items-center gap-2 rounded-[4px] bg-[#15152b] px-2 py-[5px] text-[12px] font-bold"
          style={{ boxShadow: "inset 0 0 0 2px #26264a" }}
        >
          <span className="w-5 text-center text-[13px]">{medals[i]}</span>
          <span
            className={`flex-1 text-right ${i === 0 ? "text-[#ffd24a]" : "text-[#dcdcf0]"}`}
          >
            {s.score.toLocaleString("en-US")}
          </span>
          <span className={`text-[10px] ${s.win ? "text-[#7dffa1]" : "text-[#ff8a8a]"}`}>
            {s.win ? "🏁 وصل" : "💥 حادث"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[8px] bg-[#141428]/95 p-3 ${className}`}
      style={{ boxShadow: "0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52" }}
    >
      {children}
    </div>
  );
}

/* ------------------------ start screen ---------------------- */

export function StartScreen({
  faceSrc,
  best,
  scores,
  onStart,
  onFace,
  compact,
}: {
  faceSrc: string;
  best: number;
  scores: ScoreEntry[];
  onStart: () => void;
  onFace: (f: File) => void;
  compact?: boolean;
}) {
  const [help, setHelp] = useState(false);
  const faceSize = compact ? 62 : 78;
  const iconSize = compact ? 54 : 70;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center overflow-y-auto bg-[#07070f]/78 px-3 py-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[340px] flex-1 flex flex-col items-center gap-3">
        {/* title */}
        <div className="mt-1 text-center">
          <h1
            className="retro text-[34px] leading-none font-black tracking-tight text-[#ffd24a]"
            style={{ WebkitTextStroke: "0px" }}
          >
            وائل السريع
          </h1>
          <div className="mt-1 h-[6px] w-full anim-shine rounded bg-[#e03535]" />
          <p className="retro-sm mt-2 text-[11px] font-bold tracking-[3px] text-[#9ad7ff]">
            WAEL THE FAST · 8-BIT RACE
          </p>
        </div>

        {/* hero */}
        <div className="flex w-full items-center justify-center gap-3">
          <div className="anim-float">
            <FaceBadge src={faceSrc} size={faceSize} glow="#e03535" />
          </div>
          <PixelImg
            src={ICON_URL}
            fallback={ICON_FALLBACK}
            className={`rounded-[8px] text-[30px]`}
            style={{
              width: iconSize,
              height: iconSize,
              boxShadow: "0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52",
            }}
          />
        </div>

        {/* message */}
        <div
          className="w-full rounded-[6px] bg-[#1d1d3a] px-3 py-2 text-center"
          style={{ boxShadow: "0 0 0 3px #0b0b16, 0 0 0 5px #e03535" }}
        >
          <p className="retro text-[14px] font-black text-white">
            هيا يا وائل، يجب أن لا تتأخر!
          </p>
          <p className="retro-sm mt-1 text-[10px] text-[#9ad7ff]">
            ٣٠ ثانية فقط · اصنع طريقك بين السيارات
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-2">
          {[
            { k: "أفضل نتيجة", v: best.toLocaleString("en-US"), c: "#ffd24a" },
            { k: "الوقت", v: "٣٠ ث", c: "#7dffa1" },
            { k: "السيارات", v: "٣٥+", c: "#ff9a9a" },
          ].map((s) => (
            <div
              key={s.k}
              className="rounded-[6px] bg-[#15152b] py-2 text-center"
              style={{ boxShadow: "inset 0 0 0 2px #26264a" }}
            >
              <div className="retro text-[15px] font-black" style={{ color: s.c }}>
                {s.v}
              </div>
              <div className="retro-sm text-[9px] text-[#8b8bb4]">{s.k}</div>
            </div>
          ))}
        </div>

        <Panel className="w-full">
          <p className="retro-sm mb-2 text-center text-[11px] font-black tracking-wider text-[#ffd24a]">
            🏆 أفضل النتائج
          </p>
          <ScoreTable scores={scores} />
        </Panel>

        <div className="mt-auto w-full pt-1">
          <PixButton onClick={onStart}>▶ ابدأ اللعب</PixButton>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setHelp((v) => !v)}
              className="pixbtn h-[38px] flex-1 rounded-[6px] bg-[#2a2a4a] text-[12px] font-bold text-white"
              style={{ boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.35), 0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52" }}
            >
              ❔ كيف تلعب
            </button>
            <label
              className="pixbtn h-[38px] flex-1 cursor-pointer rounded-[6px] bg-[#2a2a4a] text-center text-[12px] font-bold leading-[38px] text-white"
              style={{ boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.35), 0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52" }}
            >
              📷 صورة وائل
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFace(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {help && (
            <Panel className="anim-pop mt-2">
              <ul className="space-y-1 text-[11px] leading-relaxed text-[#c9c9e8]">
                <li>🕹️ استخدم زرَي <b className="text-white">يسار</b> و<b className="text-white">يمين</b> أسفل الشاشة، أو أسهم لوحة المفاتيح.</li>
                <li>🔥 اضغط <b className="text-[#ffd24a]">توربو</b> (أو السهم للأعلى) لزيادة السرعة ومضاعفة النقاط.</li>
                <li>⚡ المرور بجانب السيارة عن قرب يمنحك نقاط «قريب!» ويشحن التوربو.</li>
                <li>🏁 اقطع خط النهاية قبل انتهاء الـ٣٠ ثانية.</li>
                <li>⚠️ الاصطدام بأي سيارة = نهاية فورية.</li>
                <li>⏸️ زر الإيقاف أعلى الشاشة، أو مفتاح P.</li>
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- end screen ----------------------- */

export function EndScreen({
  info,
  scores,
  faceSrc,
  onRestart,
  onMenu,
}: {
  info: EndInfo;
  scores: ScoreEntry[];
  faceSrc: string;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const win = info.win;
  const title = win ? "أحسنت! وصلت في الوقت المحدد" : "تأخرت كالعادة يا عزيزي";
  const sub = win
    ? `تبقّى لك ${Math.ceil(info.timeLeft)} ثانية — سائق محترف!`
    : info.reason === "crash"
      ? "اصطدمت بسيارة… حاول مرة أخرى"
      : "انتهى الوقت قبل الوصول لخط النهاية";

  const stats = [
    { k: "الوقت المتبقي", v: `${Math.ceil(info.timeLeft)} ث`, c: "#7dffa1" },
    { k: "سيارات تجاوزتها", v: String(info.overtakes), c: "#9ad7ff" },
    { k: "مرات قريب!", v: String(info.nearMisses), c: "#ffd24a" },
    { k: "أطول سلسلة", v: `×${info.maxCombo}`, c: "#ff9ad4" },
  ];

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center overflow-y-auto bg-[#07070f]/82 px-3 py-4 backdrop-blur-[2px]">
      <div className="flex w-full max-w-[340px] flex-1 flex-col items-center gap-3">
        <div className="anim-pop mt-1 flex flex-col items-center">
          <FaceBadge
            src={faceSrc}
            size={92}
            anim={win ? "nod" : "shake"}
            glow={win ? "#4fbf6a" : "#e03535"}
          />
          <h2
            className="retro mt-3 text-center text-[19px] leading-tight font-black"
            style={{ color: win ? "#7dffa1" : "#ff8a8a" }}
          >
            {title}
          </h2>
          <p className="retro-sm mt-1 text-center text-[11px] text-[#c9c9e8]">{sub}</p>
        </div>

        <Panel className="w-full text-center">
          <p className="retro-sm text-[10px] tracking-widest text-[#8b8bb4]">النقاط</p>
          <p className="retro text-[38px] leading-none font-black text-[#ffd24a]">
            {info.score.toLocaleString("en-US")}
          </p>
          {info.newRecord ? (
            <p className="retro anim-blink mt-1 text-[12px] font-black text-white">
              ★ رقم قياسي جديد ★
            </p>
          ) : (
            <p className="retro-sm mt-1 text-[10px] text-[#8b8bb4]">
              أفضل نتيجة: {info.best.toLocaleString("en-US")}
            </p>
          )}
        </Panel>

        <div className="grid w-full grid-cols-2 gap-2">
          {stats.map((s) => (
            <div
              key={s.k}
              className="rounded-[6px] bg-[#15152b] py-2 text-center"
              style={{ boxShadow: "inset 0 0 0 2px #26264a" }}
            >
              <div className="retro text-[15px] font-black" style={{ color: s.c }}>
                {s.v}
              </div>
              <div className="retro-sm text-[9px] text-[#8b8bb4]">{s.k}</div>
            </div>
          ))}
        </div>

        <Panel className="w-full">
          <p className="retro-sm mb-2 text-center text-[11px] font-black tracking-wider text-[#ffd24a]">
            🏆 أفضل النتائج
          </p>
          <ScoreTable scores={scores} />
        </Panel>

        <div className="mt-auto w-full pt-1 pb-1">
          <PixButton onClick={onRestart}>🔄 إعادة اللعبة</PixButton>
          <button
            type="button"
            onClick={onMenu}
            className="pixbtn mt-2 h-[40px] w-full rounded-[6px] bg-[#2a2a4a] text-[13px] font-bold text-white"
            style={{ boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.35), 0 0 0 3px #0b0b16, 0 0 0 5px #3a3a52" }}
          >
            🏠 القائمة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- pause --------------------------- */

export function PauseOverlay({
  onResume,
  onRestart,
  onMenu,
}: {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#07070f]/80 px-6 backdrop-blur-[2px]">
      <p className="retro anim-pop text-[26px] font-black text-[#ffd24a]">إيقاف مؤقت</p>
      <div className="w-full max-w-[240px] space-y-2">
        <PixButton onClick={onResume} color="#2f9e4f">
          ▶ متابعة
        </PixButton>
        <PixButton onClick={onRestart} color="#2f6fd0" size="md">
          🔄 إعادة اللعبة
        </PixButton>
        <PixButton onClick={onMenu} color="#5a5a80" size="md">
          🏠 القائمة
        </PixButton>
      </div>
    </div>
  );
}

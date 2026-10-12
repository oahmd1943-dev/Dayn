import { useState } from "react";

/** Pixel-art <img> that falls back to an emoji tile if the file is missing. */
export default function PixelImg({
  src,
  fallback = "🏍️",
  className = "",
  style,
  alt = "",
}: {
  src: string;
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        className={`flex items-center justify-center bg-[#12122a] ${className}`}
        style={{ ...style, fontSize: "70%" }}
        aria-hidden
      >
        <span className="retro-sm leading-none">{fallback}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setBroken(true)}
      className={`pixelated object-cover ${className}`}
      style={style}
    />
  );
}

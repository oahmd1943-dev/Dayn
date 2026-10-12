/* ---------------- localStorage save data ---------------- */

export interface ScoreEntry {
  score: number;
  win: boolean;
  date: number;
}

export interface SaveData {
  best: number;
  scores: ScoreEntry[];
  face: string | null;
}

const KEY = "wael-racer-save-v1";

const EMPTY: SaveData = { best: 0, scores: [], face: null };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      best: typeof parsed.best === "number" ? parsed.best : 0,
      scores: Array.isArray(parsed.scores) ? parsed.scores.slice(0, 10) : [],
      face: typeof parsed.face === "string" ? parsed.face : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full / disabled — ignore */
  }
}

export function pushScore(data: SaveData, entry: ScoreEntry): SaveData {
  const scores = [...data.scores, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const next: SaveData = {
    ...data,
    scores,
    best: Math.max(data.best, entry.score),
  };
  writeSave(next);
  return next;
}

/** Downscale an uploaded picture to a small square data-url so it fits in localStorage. */
export function shrinkImage(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingEnabled = true;
        // cover-crop to a square focused on the upper part (the face)
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - s) / 2;
        const sy = Math.max(0, (img.naturalHeight - s) / 2 - s * 0.06);
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

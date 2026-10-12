/* ===========================================================
   وائل السريع — Pixel art sprite factory
   All sprites are pre-rendered once into offscreen canvases
   so the game loop only ever does cheap drawImage calls.
   =========================================================== */

export const VW = 180;
export const VH = 320;

export const PAL = {
  road: "#5c5c68",
  roadDark: "#4b4b57",
  roadLight: "#6b6b78",
  line: "#e9e9f2",
  rumbleA: "#d33a3a",
  rumbleB: "#f2f2f2",
  grassA: "#3f9e42",
  grassB: "#358b39",
  grassDark: "#2a7030",
  leaf: "#1d6b2c",
  leafHi: "#2f9140",
  trunk: "#6b4523",
  ink: "#14141c",
  metal: "#9aa0ad",
  metalDark: "#5d6472",
  glass: "#7fd0e8",
  glassDark: "#2b6f8c",
  red: "#e03535",
  redDark: "#a41f1f",
  yellow: "#f5c531",
  white: "#f6f6f6",
};

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

type Ctx = CanvasRenderingContext2D;

function px(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

/* ------------------------- CARS --------------------------- */

export const CAR_COLORS: Array<{ body: string; shade: string; hi: string }> = [
  { body: "#e04b3c", shade: "#9e2b22", hi: "#ff8a7a" }, // أحمر
  { body: "#3f7ee0", shade: "#24509c", hi: "#8fbaff" }, // أزرق
  { body: "#f0c419", shade: "#b08a08", hi: "#ffe98a" }, // أصفر
  { body: "#4fbf6a", shade: "#2b8244", hi: "#a5f0bb" }, // أخضر
  { body: "#e8e8ee", shade: "#a4a4b2", hi: "#ffffff" }, // أبيض
];

const CAR_W = 20;
const CAR_H = 30;

function buildCar(cols: { body: string; shade: string; hi: string }) {
  const { canvas, ctx } = makeCanvas(CAR_W, CAR_H);
  const c = ctx;
  // tires
  px(c, 0, 13, 4, 8, PAL.ink);
  px(c, 16, 13, 4, 8, PAL.ink);
  px(c, 0, 23, 4, 4, PAL.ink);
  px(c, 16, 23, 4, 4, PAL.ink);
  // body block
  px(c, 2, 3, 16, 22, cols.body);
  px(c, 3, 2, 14, 1, cols.body);
  px(c, 4, 1, 12, 1, cols.body);
  px(c, 3, 25, 14, 2, cols.shade);
  // roof shading
  px(c, 2, 3, 2, 21, cols.shade);
  px(c, 16, 3, 2, 21, cols.shade);
  px(c, 4, 3, 12, 1, cols.hi);
  // rear window
  px(c, 5, 5, 10, 6, PAL.glassDark);
  px(c, 6, 6, 8, 4, PAL.glass);
  px(c, 6, 9, 8, 1, PAL.glassDark);
  // trunk line
  px(c, 4, 13, 12, 1, cols.shade);
  // tail lights
  px(c, 3, 16, 4, 3, "#ff5a3c");
  px(c, 13, 16, 4, 3, "#ff5a3c");
  px(c, 3, 16, 1, 3, "#ffd08a");
  px(c, 16, 16, 1, 3, "#ffd08a");
  // plate
  px(c, 8, 19, 4, 2, PAL.white);
  // bumper
  px(c, 3, 22, 14, 3, PAL.metalDark);
  px(c, 3, 22, 14, 1, PAL.metal);
  return canvas;
}

const TRUCK_W = 24;
const TRUCK_H = 44;

function buildTruck(cols: { body: string; shade: string; hi: string }) {
  const { canvas, ctx } = makeCanvas(TRUCK_W, TRUCK_H);
  const c = ctx;
  px(c, 0, 12, 4, 10, PAL.ink);
  px(c, 20, 12, 4, 10, PAL.ink);
  px(c, 0, 32, 4, 8, PAL.ink);
  px(c, 20, 32, 4, 8, PAL.ink);
  // container
  px(c, 2, 2, 20, 30, cols.body);
  px(c, 2, 2, 3, 30, cols.shade);
  px(c, 19, 2, 3, 30, cols.shade);
  px(c, 4, 2, 16, 2, cols.hi);
  for (let y = 8; y < 30; y += 5) px(c, 4, y, 16, 1, cols.shade);
  // rear doors
  px(c, 5, 6, 14, 22, cols.shade);
  px(c, 6, 7, 12, 20, cols.body);
  px(c, 11, 7, 2, 20, cols.shade);
  // bumper + lights
  px(c, 2, 32, 20, 4, PAL.metalDark);
  px(c, 2, 32, 20, 1, PAL.metal);
  px(c, 3, 33, 3, 2, "#ff5a3c");
  px(c, 18, 33, 3, 2, "#ff5a3c");
  return canvas;
}

/* ------------------------- BIKE --------------------------- */

export const BIKE_W = 22;
export const BIKE_H = 34;

function buildBikeBody() {
  const { canvas, ctx } = makeCanvas(BIKE_W, BIKE_H);
  const c = ctx;
  const R = PAL.red;
  const RD = PAL.redDark;

  // collar / neck
  px(c, 7, 8, 8, 2, "#2b1d16");
  // shoulders
  px(c, 4, 10, 14, 3, R);
  px(c, 3, 12, 16, 2, R);
  // arms
  px(c, 2, 13, 4, 5, R);
  px(c, 16, 13, 4, 5, R);
  px(c, 2, 13, 4, 1, "#ff7b6b");
  px(c, 16, 13, 4, 1, "#ff7b6b");
  // gloves + grips
  px(c, 1, 17, 4, 3, PAL.ink);
  px(c, 17, 17, 4, 3, PAL.ink);
  px(c, 0, 18, 2, 2, PAL.metal);
  px(c, 20, 18, 2, 2, PAL.metal);
  // mirrors
  px(c, 1, 9, 3, 2, PAL.metal);
  px(c, 18, 9, 3, 2, PAL.metal);
  // torso
  px(c, 4, 14, 14, 9, R);
  px(c, 4, 14, 2, 9, RD);
  px(c, 16, 14, 2, 9, RD);
  // racing stripe
  px(c, 7, 15, 8, 2, PAL.yellow);
  px(c, 7, 19, 8, 2, PAL.yellow);
  // hips
  px(c, 5, 23, 12, 3, RD);
  // seat / tail
  px(c, 4, 25, 14, 3, R);
  px(c, 5, 27, 12, 3, RD);
  px(c, 6, 27, 3, 2, "#ffdada");
  px(c, 13, 27, 3, 2, "#ffdada");
  // exhausts
  px(c, 2, 27, 4, 4, PAL.metal);
  px(c, 16, 27, 4, 4, PAL.metal);
  px(c, 2, 30, 4, 2, PAL.metalDark);
  px(c, 16, 30, 4, 2, PAL.metalDark);
  // rear wheel
  px(c, 7, 29, 8, 5, PAL.ink);
  px(c, 8, 30, 6, 4, "#26262f");
  return canvas;
}

/* ----------------------- SCENERY -------------------------- */

function buildTree() {
  const { canvas, ctx } = makeCanvas(18, 24);
  const c = ctx;
  px(c, 7, 16, 4, 8, PAL.trunk);
  px(c, 8, 16, 1, 8, "#8a5a30");
  px(c, 3, 4, 12, 13, PAL.leaf);
  px(c, 5, 2, 8, 2, PAL.leaf);
  px(c, 1, 7, 16, 6, PAL.leaf);
  px(c, 2, 5, 5, 4, PAL.leafHi);
  px(c, 10, 8, 5, 3, PAL.leafHi);
  px(c, 4, 15, 10, 2, "#124d1e");
  return canvas;
}

function buildBush() {
  const { canvas, ctx } = makeCanvas(12, 8);
  const c = ctx;
  px(c, 2, 2, 8, 6, PAL.leaf);
  px(c, 1, 4, 10, 4, PAL.leaf);
  px(c, 3, 1, 5, 2, PAL.leafHi);
  px(c, 1, 7, 10, 1, "#124d1e");
  return canvas;
}

function buildRock() {
  const { canvas, ctx } = makeCanvas(10, 8);
  const c = ctx;
  px(c, 2, 2, 6, 5, PAL.metalDark);
  px(c, 1, 4, 8, 3, PAL.metalDark);
  px(c, 3, 2, 3, 2, PAL.metal);
  return canvas;
}

function buildSign() {
  const { canvas, ctx } = makeCanvas(14, 18);
  const c = ctx;
  px(c, 6, 8, 2, 10, PAL.metalDark);
  px(c, 1, 1, 12, 8, "#f0f0f0");
  px(c, 1, 1, 12, 1, PAL.ink);
  px(c, 1, 8, 12, 1, PAL.ink);
  px(c, 1, 1, 1, 8, PAL.ink);
  px(c, 12, 1, 1, 8, PAL.ink);
  px(c, 3, 4, 8, 2, PAL.rumbleA);
  return canvas;
}

/* --------------------- SPRITE CACHE ----------------------- */

export interface SpriteSet {
  cars: HTMLCanvasElement[];
  truck: HTMLCanvasElement;
  bike: HTMLCanvasElement;
  tree: HTMLCanvasElement;
  bush: HTMLCanvasElement;
  rock: HTMLCanvasElement;
  sign: HTMLCanvasElement;
}

let cache: SpriteSet | null = null;

export function getSprites(): SpriteSet {
  if (cache) return cache;
  cache = {
    cars: CAR_COLORS.map(buildCar),
    truck: buildTruck(CAR_COLORS[1]),
    bike: buildBikeBody(),
    tree: buildTree(),
    bush: buildBush(),
    rock: buildRock(),
    sign: buildSign(),
  };
  return cache;
}

export function resetSprites() {
  cache = null;
}

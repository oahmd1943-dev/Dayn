/* ===========================================================
   وائل السريع — Game engine (vanilla canvas, no libraries)
   =========================================================== */

import {
  BIKE_H,
  BIKE_W,
  getSprites,
  PAL,
  VH,
  VW,
  type SpriteSet,
} from "./sprites";

export type Phase =
  | "ready"
  | "countdown"
  | "playing"
  | "paused"
  | "ending"
  | "over";

export type LoseReason = "crash" | "time";

export interface EndInfo {
  win: boolean;
  reason: LoseReason | null;
  score: number;
  timeLeft: number;
  overtakes: number;
  nearMisses: number;
  maxCombo: number;
  best: number;
  newRecord: boolean;
}

export interface Snapshot {
  phase: Phase;
  score: number;
  timeLeft: number;
  progress: number;
  boost: number;
  combo: number;
  overtakes: number;
  speed: number;
}

/* ------------------------- tuning ------------------------- */
const ROAD_L = 26;
const ROAD_W = 128;
const LANES = 4;
const LANE_W = ROAD_W / LANES;
const laneX = (i: number) => ROAD_L + i * LANE_W + LANE_W / 2;

const PLAYER_Y = 250;
const GAME_TIME = 30;
const FINISH_DIST = 4900;
const BIKE_HALF_W = 8;
const BIKE_TOP = 14;
const BIKE_BOT = 15;
const COUNTDOWN_TIME = 1.9;

interface Car {
  d: number;
  x: number;
  speed: number;
  w: number;
  h: number;
  sprite: number;
  truck: boolean;
  passed: boolean;
  grazed: boolean;
}

interface Prop {
  d: number;
  x: number;
  kind: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  col: string;
  g: number;
  spin: number;
  rot: number;
  kind: 0 | 1; // 0 = chunk, 1 = confetti
}

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  col: string;
  size: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Game {
  private ctx: CanvasRenderingContext2D;
  private sp: SpriteSet;
  private raf = 0;
  private last = 0;
  private acc = 0;

  phase: Phase = "ready";
  onPhase: ((p: Phase, e: EndInfo | null) => void) | null = null;
  faceImg: HTMLImageElement | null = null;
  best = 0;

  /* input */
  private inLeft = false;
  private inRight = false;
  private inBoost = false;

  /* world */
  private t = 0;
  private timeLeft = GAME_TIME;
  private distance = 0;
  private speed = 0;
  private boostMul = 1;
  private cars: Car[] = [];
  private props: Prop[] = [];
  private parts: Particle[] = [];
  private pops: Popup[] = [];
  private nextPropD = 0;
  private spawnT = 0;
  private prevFree: number[] = [0, 1, 2, 3];

  /* player */
  private px = 0;
  private pvx = 0;
  private tilt = 0;
  private wreck = false;
  private wreckRot = 0;
  private wreckY = 0;
  private wheelie = 0;

  /* meta */
  private score = 0;
  private combo = 0;
  private comboT = 0;
  private maxCombo = 0;
  private overtakes = 0;
  private nearMisses = 0;
  private boost = 40;
  private boosting = false;

  /* fx */
  private shake = 0;
  private flash = 0;
  private flashCol = "#ffffff";
  private timescale = 1;
  private endDelay = 0;
  private result: "win" | "lose" | null = null;
  private reason: LoseReason | null = null;
  private countdown = 0;
  private banner = "";
  private bannerT = 0;
  private blink = 0;
  private prePause: Phase = "playing";

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = VW;
    canvas.height = VH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.sp = getSprites();
    this.hardReset();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  setBest(v: number) {
    this.best = v;
  }

  private setPhase(p: Phase, end: EndInfo | null = null) {
    this.phase = p;
    this.onPhase?.(p, end);
  }

  private hardReset() {
    this.t = 0;
    this.timeLeft = GAME_TIME;
    this.distance = 0;
    this.speed = 0;
    this.boostMul = 1;
    this.cars = [];
    this.props = [];
    this.parts = [];
    this.pops = [];
    this.nextPropD = 200;
    this.spawnT = 0.4;
    this.prevFree = [0, 1, 2, 3];
    this.px = laneX(1) + 16;
    this.pvx = 0;
    this.tilt = 0;
    this.wreck = false;
    this.wreckRot = 0;
    this.wreckY = 0;
    this.wheelie = 0;
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.overtakes = 0;
    this.nearMisses = 0;
    this.boost = 40;
    this.boosting = false;
    this.shake = 0;
    this.flash = 0;
    this.timescale = 1;
    this.endDelay = 0;
    this.result = null;
    this.reason = null;
    this.banner = "";
    this.bannerT = 0;
    this.hidePlayer = false;
    this.inLeft = false;
    this.inRight = false;
    this.inBoost = false;
    this.blink = 0;
    this.phase = "ready";
  }

  /* ---------------------- public api ---------------------- */

  toMenu() {
    this.hardReset();
    this.setPhase("ready");
  }

  start() {
    this.hardReset();
    this.phase = "countdown";
    this.countdown = COUNTDOWN_TIME;
    this.speed = 90;
    this.setPhase("countdown");
  }

  restart() {
    this.start();
  }

  togglePause() {
    if (this.phase === "playing" || this.phase === "countdown") {
      this.prePause = this.phase;
      this.setPhase("paused");
    } else if (this.phase === "paused") {
      this.setPhase(this.prePause === "countdown" ? "countdown" : "playing");
    }
  }

  setLeft(v: boolean) {
    this.inLeft = v;
  }
  setRight(v: boolean) {
    this.inRight = v;
  }
  setBoost(v: boolean) {
    this.inBoost = v;
  }

  /* ------------------------ loop -------------------------- */

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.acc += dt;
    const step = 1 / 60;
    let guard = 0;
    while (this.acc >= step && guard < 4) {
      this.update(step);
      this.acc -= step;
      guard++;
    }
    if (guard === 4) this.acc = 0;
    this.render();
  };

  private update(rawDt: number) {
    this.blink += rawDt;
    this.shake = Math.max(0, this.shake - rawDt * 34);
    this.flash = Math.max(0, this.flash - rawDt * 2.6);
    if (this.bannerT > 0) this.bannerT -= rawDt;
    if (this.phase === "paused") return;

    if (this.timescale < 1) {
      this.timescale = Math.min(1, this.timescale + rawDt * 1.6);
    }
    const dt = rawDt * this.timescale;

    switch (this.phase) {
      case "ready":
      case "over":
        this.updateAttract(rawDt, dt, this.phase === "over");
        return;
      case "countdown":
        this.updateCountdown(rawDt, dt);
        return;
      case "ending":
        this.updateEnding(rawDt, dt);
        return;
      case "playing":
        break;
      default:
        return;
    }

    /* ------------------ playing ------------------ */
    this.t += rawDt;
    this.timeLeft -= rawDt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.lose("time");
      return;
    }

    const diff = clamp(this.t / 25, 0, 1);
    const baseSpeed = 148 + 124 * diff;

    const wantBoost = this.inBoost && this.boost > 1;
    this.boosting = wantBoost;
    this.boostMul = lerp(this.boostMul, wantBoost ? 1.55 : 1, rawDt * 6);
    if (wantBoost) {
      this.boost = Math.max(0, this.boost - rawDt * 32);
      if (Math.random() < rawDt * 70) this.exhaust(true);
    }

    this.speed = lerp(this.speed, baseSpeed * this.boostMul, rawDt * 4);
    this.distance += this.speed * dt;
    this.score += ((this.speed * dt) / 10) * (this.boosting ? 2 : 1);

    if (this.comboT > 0) {
      this.comboT -= rawDt;
      if (this.comboT <= 0) this.combo = 0;
    }

    this.steer(rawDt, 1);
    this.updateProps();
    this.updateCars(dt, false);

    if (this.distance < FINISH_DIST - 420) {
      this.spawnT -= rawDt;
      if (this.spawnT <= 0) {
        this.spawnWave();
        this.spawnT = lerp(1.02, 0.5, diff) * rand(0.88, 1.12);
      }
    }

    if (Math.random() < rawDt * 22) this.exhaust(false);
    this.updateParticles(dt);

    if (this.distance >= FINISH_DIST) this.win();
  }

  /* ----------------------- states ------------------------- */

  private hidePlayer = false;

  private updateAttract(rawDt: number, dt: number, over: boolean) {
    this.hidePlayer = over;
    this.speed = lerp(this.speed, over ? 120 : 74, rawDt * 3);
    this.distance += this.speed * dt;
    if (!over) {
      this.px = laneX(1) + 16 + Math.sin(this.t * 0.75) * 26;
      this.tilt = Math.cos(this.t * 0.75) * 0.08;
    }
    this.t += rawDt;
    this.updateProps();
    if (!over && Math.random() < rawDt * 0.7) this.spawnWave(true);
    this.updateCars(dt, true);
    if (Math.random() < rawDt * 18) this.exhaust(false);
    this.updateParticles(dt);
  }

  private updateCountdown(rawDt: number, dt: number) {
    this.countdown -= rawDt;
    this.speed = lerp(this.speed, 130, rawDt * 2.6);
    this.distance += this.speed * dt;
    this.t += rawDt;
    this.steer(rawDt, 0.5);
    this.updateProps();
    this.updateCars(dt, true);
    if (Math.random() < rawDt * 20) this.exhaust(false);
    this.updateParticles(dt);
    if (this.countdown <= 0) {
      this.banner = "انطلق!";
      this.bannerT = 0.8;
      this.flash = 0.45;
      this.flashCol = "#ffffff";
      this.setPhase("playing");
    }
  }

  private updateEnding(rawDt: number, dt: number) {
    this.endDelay -= rawDt;
    const win = this.result === "win";
    this.speed = lerp(this.speed, win ? 320 : 20, rawDt * (win ? 1.4 : 5));
    this.distance += this.speed * dt;
    this.t += rawDt;
    if (this.wreck) {
      this.wreckRot += rawDt * 7;
      this.wreckY = Math.min(24, this.wreckY + 110 * rawDt);
      this.px = clamp(this.px + this.pvx * rawDt, ROAD_L + 6, ROAD_L + ROAD_W - 6);
      this.pvx *= 0.93;
      if (Math.random() < rawDt * 26) this.exhaust(false);
    }
    if (this.wheelie > 0) this.wheelie += rawDt;
    this.updateProps();
    this.updateCars(dt, true);
    this.updateParticles(dt);
    if (this.endDelay <= 0) this.finishEnd();
  }

  /* ----------------------- systems ------------------------ */

  private steer(dt: number, authority: number) {
    const dir = (this.inRight ? 1 : 0) - (this.inLeft ? 1 : 0);
    const maxV = (128 + 46 * clamp(this.t / 25, 0, 1)) * authority;
    this.pvx = lerp(this.pvx, dir * maxV, dt * (dir === 0 ? 13 : 18));
    this.px += this.pvx * dt;
    const minX = ROAD_L + BIKE_HALF_W + 2;
    const maxX = ROAD_L + ROAD_W - BIKE_HALF_W - 2;
    if (this.px < minX) {
      this.px = minX;
      this.pvx = 0;
    } else if (this.px > maxX) {
      this.px = maxX;
      this.pvx = 0;
    }
    this.tilt = lerp(this.tilt, clamp(this.pvx / maxV, -1, 1) * 0.2, dt * 9);
  }

  private updateProps() {
    while (this.nextPropD < this.distance + 360) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const r = Math.random();
      const kind = r < 0.55 ? 0 : r < 0.8 ? 1 : r < 0.92 ? 2 : 3;
      const w = kind === 0 ? 18 : kind === 1 ? 12 : kind === 2 ? 10 : 14;
      // grass strips are 0..20 and 160..180 — keep props fully on the grass
      const leftMax = 20 - w;
      const x =
        side < 0
          ? leftMax > 0
            ? rand(0, leftMax)
            : 0
          : rand(160, Math.max(161, VW - w - 1));
      this.props.push({ d: this.nextPropD, x, kind });
      this.nextPropD += rand(26, 62);
    }
    if (this.props.length > 60) this.props.splice(0, this.props.length - 60);
    const cut = this.distance - 90;
    if (this.props.length && this.props[0].d < cut) {
      this.props = this.props.filter((p) => p.d > cut);
    }
  }

  private pathOK(blocked: number[]) {
    const free: number[] = [];
    for (let i = 0; i < LANES; i++) if (!blocked.includes(i)) free.push(i);
    if (!free.length) return false;
    if (!this.prevFree.length) return true;
    return free.some((f) => this.prevFree.some((p) => Math.abs(f - p) <= 1));
  }

  private spawnWave(attract = false) {
    const diff = clamp(this.t / 25, 0, 1);
    const count = !attract && Math.random() < 0.18 + 0.5 * diff ? 2 : 1;

    let lanes: number[] = [];
    for (let a = 0; a < 14; a++) {
      const pool = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      const pick = pool.slice(0, count);
      if (this.pathOK(pick)) {
        lanes = pick;
        break;
      }
    }
    if (!lanes.length) return;

    const free: number[] = [];
    for (let i = 0; i < LANES; i++) if (!lanes.includes(i)) free.push(i);
    this.prevFree = free;

    const truck = !attract && Math.random() < 0.1 + 0.12 * diff;
    const carSpeed = attract
      ? 20
      : (52 + 30 * diff - (truck ? 16 : 0)) * rand(0.94, 1.06);
    const spawnD = this.distance + PLAYER_Y + 80;

    lanes.forEach((lane, i) => {
      this.cars.push({
        d: spawnD - i * 8,
        x: laneX(lane),
        speed: carSpeed,
        w: truck ? 24 : 20,
        h: truck ? 44 : 30,
        sprite: (Math.random() * 5) | 0,
        truck,
        passed: false,
        grazed: false,
      });
    });
  }

  private updateCars(dt: number, ghost: boolean) {
    const arr = this.cars;
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      c.d += c.speed * dt;
      const y = PLAYER_Y - (c.d - this.distance);

      if (!ghost && this.phase === "playing" && !this.wreck) {
        const cy0 = y + 3;
        const cy1 = y + c.h - 4;
        const cx0 = c.x - c.w / 2 + 2;
        const cx1 = c.x + c.w / 2 - 2;
        const bx0 = this.px - BIKE_HALF_W;
        const bx1 = this.px + BIKE_HALF_W;
        const by0 = PLAYER_Y - BIKE_TOP;
        const by1 = PLAYER_Y + BIKE_BOT;
        if (bx1 > cx0 && bx0 < cx1 && by1 > cy0 && by0 < cy1) {
          this.crash(c);
          return;
        }
        if (!c.grazed && y > PLAYER_Y - c.h * 0.5 && y < PLAYER_Y + 10) {
          if (Math.abs(c.x - this.px) < c.w / 2 + BIKE_HALF_W + 12) {
            c.grazed = true;
            this.nearMiss(c, y);
          }
        }
      }
      if (!c.passed && y > PLAYER_Y + 26) {
        c.passed = true;
        if (!ghost && this.phase === "playing" && !this.wreck) {
          this.overtakes++;
          this.boost = Math.min(100, this.boost + 3);
          this.score += 25 * (this.boosting ? 2 : 1);
        }
      }
      if (y > VH + 80) arr.splice(i, 1);
    }
  }

  private nearMiss(c: Car, y: number) {
    this.combo = Math.min(6, this.combo + 1);
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboT = 2.6;
    const gain = 50 * this.combo * (this.boosting ? 2 : 1);
    this.score += gain;
    this.nearMisses++;
    this.boost = Math.min(100, this.boost + 16);
    this.shake = Math.max(this.shake, 2.2 + this.combo * 0.5);
    this.flash = Math.max(this.flash, 0.16);
    this.flashCol = "#ffffff";
    this.pops.push({
      x: this.px,
      y: y - 8,
      text: this.combo > 1 ? `قريب! ×${this.combo}` : "قريب!",
      life: 0.85,
      col: this.combo > 2 ? "#ffd24a" : "#bdf5ff",
      size: this.combo > 2 ? 10 : 9,
    });
    const sx = c.x + (this.px < c.x ? -c.w / 2 : c.w / 2);
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      this.parts.push({
        x: sx,
        y: y + 14,
        vx: Math.cos(a) * rand(20, 95),
        vy: Math.sin(a) * rand(20, 95) - 40,
        life: rand(0.18, 0.42),
        max: 0.42,
        size: rand(1, 2.4),
        col: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#ffd24a" : "#9fe8ff",
        g: 130,
        spin: 0,
        rot: 0,
        kind: 0,
      });
    }
  }

  private exhaust(boosting: boolean) {
    this.parts.push({
      x: this.px + rand(-4, 4),
      y: PLAYER_Y + 16,
      vx: rand(-14, 14),
      vy: rand(40, 95),
      life: boosting ? rand(0.14, 0.3) : rand(0.2, 0.42),
      max: 0.42,
      size: boosting ? rand(2, 4) : rand(1.5, 3),
      col: boosting
        ? ["#fff3b0", "#ffb02e", "#ff5f2e", "#ff2e6b"][(Math.random() * 4) | 0]
        : "#c9c9d6",
      g: boosting ? -30 : 20,
      spin: 0,
      rot: 0,
      kind: 0,
    });
  }

  private updateParticles(dt: number) {
    const arr = this.parts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        arr.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.rot += p.spin * dt;
      if (p.kind === 1) p.x += Math.sin(p.rot * 4) * 18 * dt;
    }
    if (arr.length > 300) arr.splice(0, arr.length - 300);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt;
      p.y -= dt * 22;
      if (p.life <= 0) this.pops.splice(i, 1);
    }
  }

  /* --------------------- end states ----------------------- */

  private buzz(ms: number | number[]) {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* not supported */
    }
  }

  private crash(c: Car) {
    this.buzz([40, 50, 90]);
    this.result = "lose";
    this.reason = "crash";
    this.wreck = true;
    this.wreckRot = 0;
    this.wreckY = 0;
    this.pvx = this.px < c.x ? -80 : 80;
    this.shake = 16;
    this.flash = 1;
    this.flashCol = "#ffd9a0";
    this.timescale = 0.3;
    this.endDelay = 1.3;
    this.combo = 0;
    this.comboT = 0;
    for (let i = 0; i < 48; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(30, 215);
      this.parts.push({
        x: this.px + rand(-6, 6),
        y: PLAYER_Y + rand(-8, 10),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: rand(0.35, 1.0),
        max: 1.0,
        size: rand(1.5, 4),
        col: ["#ffffff", "#ffd24a", "#ff7a2e", "#e03535", "#5b5b68"][
          (Math.random() * 5) | 0
        ],
        g: 260,
        spin: 0,
        rot: 0,
        kind: 0,
      });
    }
    for (let i = 0; i < 16; i++) {
      this.parts.push({
        x: this.px + rand(-8, 8),
        y: PLAYER_Y + rand(-8, 8),
        vx: rand(-40, 40),
        vy: rand(-90, -20),
        life: rand(0.5, 1.1),
        max: 1.1,
        size: rand(3, 6),
        col: "#4a4a55",
        g: -20,
        spin: 0,
        rot: 0,
        kind: 0,
      });
    }
    this.pops.push({
      x: this.px,
      y: PLAYER_Y - 26,
      text: "بوووم!",
      life: 1.2,
      col: "#ff6b4a",
      size: 15,
    });
    this.setPhase("ending");
  }

  private win() {
    this.buzz(30);
    this.result = "win";
    this.reason = null;
    this.shake = 6;
    this.flash = 0.9;
    this.flashCol = "#ffffff";
    this.endDelay = 1.7;
    this.wheelie = 0.001;
    this.speed = 300;
    const bonus = Math.ceil(this.timeLeft) * 100 + 500;
    this.score += bonus;
    this.pops.push({
      x: VW / 2,
      y: PLAYER_Y - 44,
      text: `خط النهاية! +${bonus}`,
      life: 1.6,
      col: "#7dffa1",
      size: 12,
    });
    for (let i = 0; i < 120; i++) {
      this.parts.push({
        x: rand(0, VW),
        y: rand(-90, -4),
        vx: rand(-25, 25),
        vy: rand(30, 95),
        life: rand(0.9, 2.1),
        max: 2.1,
        size: rand(2, 3.5),
        col: ["#e03535", "#f5c531", "#3f7ee0", "#4fbf6a", "#ffffff", "#ff7ad9"][
          (Math.random() * 6) | 0
        ],
        g: 55,
        spin: rand(-6, 6),
        rot: rand(0, 6),
        kind: 1,
      });
    }
    this.setPhase("ending");
  }

  private lose(reason: LoseReason) {
    this.result = "lose";
    this.reason = reason;
    this.endDelay = 1.0;
    this.shake = 6;
    this.flash = 0.5;
    this.flashCol = "#ff8a8a";
    this.pops.push({
      x: VW / 2,
      y: 130,
      text: "انتهى الوقت!",
      life: 1.1,
      col: "#ff9a9a",
      size: 14,
    });
    this.setPhase("ending");
  }

  private finishEnd() {
    const score = Math.floor(this.score);
    const newRecord = score > this.best && score > 0;
    if (newRecord) this.best = score;
    this.setPhase("over", {
      win: this.result === "win",
      reason: this.reason,
      score,
      timeLeft: Math.max(0, this.timeLeft),
      overtakes: this.overtakes,
      nearMisses: this.nearMisses,
      maxCombo: this.maxCombo,
      best: this.best,
      newRecord,
    });
  }

  /* ----------------------- rendering ---------------------- */

  private render() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = PAL.grassA;
    c.fillRect(0, 0, VW, VH);

    if (this.shake > 0.05) {
      c.translate(
        Math.round(rand(-this.shake, this.shake) * 0.5),
        Math.round(rand(-this.shake, this.shake) * 0.5),
      );
    }

    this.drawScenery(c);

    const fy = PLAYER_Y - (FINISH_DIST - this.distance);
    if (fy > -40 && fy < VH + 40) this.drawFinish(c, fy);

    this.drawProps(c);

    for (const car of this.cars) {
      const y = PLAYER_Y - (car.d - this.distance);
      if (y < -60 || y > VH + 40) continue;
      const cx = Math.round(car.x - car.w / 2);
      const cy = Math.round(y);
      c.globalAlpha = 0.22;
      c.fillStyle = "#000";
      c.fillRect(cx, cy + car.h - 3, car.w, 3);
      c.globalAlpha = 1;
      c.drawImage(car.truck ? this.sp.truck : this.sp.cars[car.sprite], cx, cy);
    }

    this.drawPlayer(c);
    this.drawParticles(c);
    this.drawSpeedLines(c);
    this.drawPopups(c);

    c.setTransform(1, 0, 0, 1, 0, 0);

    if (this.flash > 0.01) {
      c.globalAlpha = Math.min(0.75, this.flash * 0.55);
      c.fillStyle = this.flashCol;
      c.fillRect(0, 0, VW, VH);
      c.globalAlpha = 1;
    }

    if (this.phase === "playing" && this.timeLeft < 5.5 && this.timeLeft > 0) {
      const a = 0.1 + Math.abs(Math.sin(this.blink * 7)) * 0.16;
      c.globalAlpha = a;
      c.fillStyle = "#ff2222";
      c.fillRect(0, 0, VW, 10);
      c.fillRect(0, VH - 10, VW, 10);
      c.fillRect(0, 0, 8, VH);
      c.fillRect(VW - 8, 0, 8, VH);
      c.globalAlpha = 1;
    }

    this.drawHud(c);
    this.drawBanners(c);
  }

  private drawScenery(c: CanvasRenderingContext2D) {
    const step = 8;
    const startIdx = Math.floor(this.distance / step);
    for (let i = -1; i < VH / step + 2; i++) {
      const idx = startIdx + i;
      c.fillStyle = idx % 2 === 0 ? PAL.grassA : PAL.grassB;
      c.fillRect(0, idx * step - this.distance, VW, step);
    }
    c.fillStyle = PAL.road;
    c.fillRect(ROAD_L, 0, ROAD_W, VH);
    const rstep = 16;
    const ridx = Math.floor(this.distance / rstep);
    c.fillStyle = PAL.roadLight;
    for (let i = -1; i < VH / rstep + 2; i++) {
      const idx = ridx + i;
      if (idx % 2 === 0) c.fillRect(ROAD_L, idx * rstep - this.distance, ROAD_W, rstep);
    }
    const pstep = 16;
    const pidx = Math.floor(this.distance / pstep);
    for (let i = -1; i < VH / pstep + 2; i++) {
      const idx = pidx + i;
      const y = idx * pstep - this.distance;
      c.fillStyle = idx % 2 === 0 ? PAL.rumbleA : PAL.rumbleB;
      c.fillRect(ROAD_L - 5, y, 5, 8);
      c.fillRect(ROAD_L + ROAD_W, y, 5, 8);
    }
    c.fillStyle = PAL.line;
    const dstep = 28;
    const off = this.distance % dstep;
    for (let i = 1; i < LANES; i++) {
      const x = ROAD_L + i * LANE_W - 1;
      for (let y = -dstep; y < VH + dstep; y += dstep) {
        c.fillRect(x, y + off - 12, 2, 14);
      }
    }
    c.fillStyle = "#3b3b46";
    c.fillRect(ROAD_L - 1, 0, 1, VH);
    c.fillRect(ROAD_L + ROAD_W, 0, 1, VH);
  }

  private drawProps(c: CanvasRenderingContext2D) {
    for (const p of this.props) {
      const y = PLAYER_Y - (p.d - this.distance);
      if (y < -30 || y > VH + 20) continue;
      const spr =
        p.kind === 0
          ? this.sp.tree
          : p.kind === 1
            ? this.sp.bush
            : p.kind === 2
              ? this.sp.rock
              : this.sp.sign;
      c.drawImage(spr, Math.round(p.x), Math.round(y));
    }
  }

  private drawFinish(c: CanvasRenderingContext2D, y: number) {
    const s = 8;
    const top = Math.round(y);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < ROAD_W / s; i++) {
        c.fillStyle = (i + row) % 2 === 0 ? "#f6f6f6" : "#1a1a22";
        c.fillRect(ROAD_L + i * s, top + row * s, s, s);
      }
    }
    c.fillStyle = PAL.metal;
    c.fillRect(ROAD_L - 6, top - 4, 5, 28);
    c.fillRect(ROAD_L + ROAD_W + 1, top - 4, 5, 28);
    c.fillStyle = PAL.rumbleA;
    c.fillRect(ROAD_L - 6, top - 4, 5, 5);
    c.fillRect(ROAD_L + ROAD_W + 1, top - 4, 5, 5);
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    if (this.hidePlayer) return;
    const x = Math.round(this.px);
    const y = PLAYER_Y;

    c.globalAlpha = 0.25;
    c.fillStyle = "#000";
    c.fillRect(x - 8, y + 27, 16, 3);
    c.globalAlpha = 1;

    c.save();
    c.translate(x, y + 14 + this.wreckY);
    let rot = this.tilt;
    if (this.wreck) rot = this.wreckRot;
    else if (this.wheelie > 0) rot = -0.32;
    c.rotate(rot);

    if (this.boosting && !this.wreck) {
      const f = 9 + Math.sin(this.blink * 40) * 4;
      c.fillStyle = "#ff8a2e";
      c.fillRect(-4, 12, 3, f);
      c.fillRect(1, 12, 3, f * 0.7);
      c.fillStyle = "#ffe08a";
      c.fillRect(-3, 12, 2, f * 0.5);
    }

    c.drawImage(this.sp.bike, -BIKE_W / 2, -BIKE_H + 14);

    if (!this.wreck) {
      // big chibi arcade head so the hero's face really reads
      const rx = 8.6;
      const ry = 8.2;
      const hy = -27;
      c.save();
      c.beginPath();
      c.ellipse(0, hy + ry, rx, ry, 0, 0, Math.PI * 2);
      c.clip();
      const face = this.faceImg;
      if (face && face.complete && face.naturalWidth > 0) {
        c.drawImage(face, -rx, hy, rx * 2, ry * 2 + 1);
      } else {
        c.fillStyle = "#c98b5e";
        c.fillRect(-rx, hy, rx * 2, ry * 2);
      }
      c.fillStyle = "#2a1c14";
      c.fillRect(-rx - 1, hy - 1, rx * 2 + 2, 5);
      c.fillRect(-rx - 1, hy + 3, 2, 4);
      c.fillRect(rx - 1, hy + 3, 2, 4);
      c.restore();
      c.strokeStyle = "#14141c";
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(0, hy + ry, rx, ry, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  private drawParticles(c: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      c.globalAlpha = p.kind === 1 ? 1 : a;
      c.fillStyle = p.col;
      if (p.kind === 1) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.7);
        c.restore();
      } else {
        const s = Math.max(1, p.size * (a * 0.6 + 0.4));
        c.fillRect(
          Math.round(p.x - s / 2),
          Math.round(p.y - s / 2),
          Math.ceil(s),
          Math.ceil(s),
        );
      }
    }
    c.globalAlpha = 1;
  }

  private drawSpeedLines(c: CanvasRenderingContext2D) {
    const intensity = clamp((this.speed - 175) / 165, 0, 1) + (this.boosting ? 0.7 : 0);
    if (intensity < 0.25) return;
    c.globalAlpha = Math.min(0.5, intensity * 0.35);
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 7; i++) {
      const seed = i * 97.13;
      const x = ROAD_L + 4 + ((seed * 13.7) % (ROAD_W - 10));
      const y = ((this.blink * 900 + seed * 211) % (VH + 60)) - 30;
      c.fillRect(Math.round(x), Math.round(y), 1, 14 + intensity * 12);
    }
    c.globalAlpha = 1;
  }

  private drawPopups(c: CanvasRenderingContext2D) {
    for (const p of this.pops) {
      c.globalAlpha = clamp(p.life * 1.6, 0, 1);
      this.text(c, p.text, p.x, p.y, p.size, p.col, "center");
      c.globalAlpha = 1;
    }
  }

  /* ------------------------- HUD -------------------------- */

  private drawHud(c: CanvasRenderingContext2D) {
    if (this.phase === "ready") return;
    c.fillStyle = "rgba(8,8,20,0.74)";
    c.fillRect(0, 0, VW, 32);
    c.fillStyle = "#000";
    c.fillRect(0, 32, VW, 1);

    const sc = Math.floor(this.score);
    this.text(c, "النقاط", VW - 5, 9, 8, "#9ad7ff", "right");
    this.text(c, String(sc), VW - 6, 23, 15, "#ffffff", "right");
    this.text(c, "الأفضل", 5, 9, 8, "#ffd98a", "left");
    this.text(c, String(this.best), 6, 21, 11, "#ffe9bd", "left");

    const tl = Math.max(0, this.timeLeft);
    const tCol = tl > 12 ? "#7dffa1" : tl > 5 ? "#ffd24a" : "#ff5a5a";
    const pulse = tl <= 5 && Math.sin(this.blink * 12) > 0 ? "#ffffff" : tCol;
    this.text(
      c,
      tl >= 9.95 ? String(Math.ceil(tl)) : tl.toFixed(1),
      VW / 2,
      21,
      16,
      pulse,
      "center",
    );

    const w = VW - 16;
    c.fillStyle = "#22222e";
    c.fillRect(8, 25, w, 5);
    c.fillStyle = tCol;
    c.fillRect(9, 26, Math.max(0, (w - 2) * (tl / GAME_TIME)), 3);
    c.strokeStyle = "#000";
    c.lineWidth = 1;
    c.strokeRect(8.5, 25.5, w - 1, 4);

    if (this.phase !== "over") {
      c.fillStyle = "#22222e";
      c.fillRect(8, 36, 74, 4);
      c.fillStyle = this.boosting ? "#fff3b0" : "#3fc0ff";
      c.fillRect(9, 37, Math.max(0, 72 * (this.boost / 100)), 2);
      this.text(c, "توربو", 86, 42, 8, "#9ad7ff", "left");

      const prog = clamp(this.distance / FINISH_DIST, 0, 1);
      c.fillStyle = "#22222e";
      c.fillRect(106, 36, 66, 4);
      c.fillStyle = "#f5c531";
      c.fillRect(107, 37, Math.max(0, 64 * prog), 2);
      c.fillStyle = "#f6f6f6";
      c.fillRect(170, 34, 2, 8);
      c.fillStyle = "#1a1a22";
      c.fillRect(172, 34, 3, 4);
      c.fillRect(172, 38, 3, 4);
    }

    if (this.combo > 1 && this.comboT > 0) {
      const pop = 1 + Math.sin(this.blink * 14) * 0.08;
      c.save();
      c.translate(26, 58);
      c.scale(pop, pop);
      this.text(c, `×${this.combo}`, 0, 0, 16, "#ffd24a", "center");
      c.restore();
    }
  }

  private drawBanners(c: CanvasRenderingContext2D) {
    if (this.phase === "countdown") {
      const n = Math.ceil(this.countdown / 0.5);
      const label = n <= 1 ? "انطلق!" : String(n - 1);
      const frac = (this.countdown % 0.5) / 0.5;
      const scale = 1.5 + (1 - frac) * 0.45;
      c.save();
      c.translate(VW / 2, 152);
      c.scale(scale, scale);
      this.text(c, label, 0, 0, 26, n <= 1 ? "#7dffa1" : "#ffd24a", "center");
      c.restore();
      this.text(c, "استعد يا وائل", VW / 2, 184, 10, "#ffffff", "center");
    }
    if (this.bannerT > 0 && this.banner) {
      c.globalAlpha = clamp(this.bannerT * 2, 0, 1);
      this.text(c, this.banner, VW / 2, 118, 20, "#7dffa1", "center");
      c.globalAlpha = 1;
    }
    if (this.phase === "ending" && this.result === "win") {
      this.text(c, "أحسنت!", VW / 2, 108, 22, "#7dffa1", "center");
    }
  }

  private text(
    c: CanvasRenderingContext2D,
    str: string,
    x: number,
    y: number,
    size: number,
    col: string,
    align: CanvasTextAlign = "left",
  ) {
    c.font = `bold ${size}px Tahoma, "Segoe UI", system-ui, sans-serif`;
    c.textAlign = align;
    c.textBaseline = "alphabetic";
    c.fillStyle = "rgba(0,0,0,0.9)";
    c.fillText(str, x + 1, y + 1);
    c.fillStyle = col;
    c.fillText(str, x, y);
  }
}

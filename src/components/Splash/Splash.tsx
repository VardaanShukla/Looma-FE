import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LightTile } from "./LoomaTile";
import "./Splash.css";

// A developer lost in their own code, and then the thought of Looma. Black, then fragments
// of code fade in all around: a merge conflict, a stack trace, "who wrote this?", drifting
// and glitching. In the middle a thought types itself, "what is this code even doing?",
// stops, erases, and types "looma." in orange instead. The noise stills; the word and then
// every fragment break into points of light that pour inward along curving lines into one
// spark, which swells as they arrive. The tile rises out of the spark with a beam above it
// and light on the floor; thin lines grow out from it to a ring of nodes with signals
// running along them, sparks drift, and the name lights up letter by letter.
//
// Leaving, the splash fades to the dashboard underneath.
//
// When this browser has to sign in, the sign-in panel slides in from the right and the tile
// moves into the left half. Click or press any key to skip ahead.

// Milliseconds from the start at normal speed. The CSS holds the same times for the tile and
// the name; both run PACE times slower than written, so the story has room to breathe.
const PACE = 1.45;
const NOISE_IN = [0, 700]; // the fragments fade in
const ASK = [380, 1350]; // the first thought types itself
const STILL = [1600, 1950]; // the noise slows and stops
const ERASE = [1650, 1900]; // the first thought is erased
const IDEA = [1980, 2280]; // "looma." types itself
const POUR = [2380, 3450]; // the fragments break into light and pour into the spark
const SPARK = [2380, 3650]; // the spark swells as the light arrives
const FLOOR = [3450, 3700]; // the reflection on the floor
const BEAM = [3550, 4300]; // the tile pops in (CSS) and the beam above it shines
const NETWORK = [3700, 4600]; // the lines grow out to the nodes
const MOTES = [3800, 4700]; // the sparks drift in
const NAME_AT = 4380; // the first letter starts decoding
const LETTER_STEP = 170; // the next letter starts this much later
const DECODE_MS = 420; // how long a letter flickers through code before it locks
const LINGER_MS = 650; // how long it stays when there's no signing in
const SPLIT_MS = 750; // the sign-in panel slides in or out
// Milliseconds from the start of the exit, once the panel is out: the splash fades to the
// dashboard underneath.
const EXIT_MS = 700;
const NAME = "LOOMA";
// The name is in, every letter locked: wait here for signing in, if needed. Worked out from
// the name's timing so a pause for signing in can never catch a letter mid-decode.
const READY_AT = NAME_AT + (NAME.length - 1) * LETTER_STEP + DECODE_MS + 60;
const QUESTION = "what is this code even doing?";
const ANSWER = "looma.";

// What a confused afternoon looks like. Lines with a problem in them glow red.
const FRAGMENTS = [
  "<<<<<<< HEAD",
  ">>>>>>> feature/login",
  "CONFLICT (content): Merge conflict in cart.py",
  "TypeError: Cannot read properties of null",
  "Traceback (most recent call last):",
  "- return total(items)",
  "+ return total(items, off) or 0",
  "// TODO: why does this work??",
  "# don't touch this",
  "who wrote this?",
  "git rebase --continue",
  "HEAD detached at 4be1e02",
  "fix fix final FINAL v2",
  "useEffect(() => { load() }, [])",
  "if (user && !user.id) return",
  "await fetch(url).then((r) => r.json())",
  "def apply_discount(cart, code):",
  "SELECT * FROM orders WHERE paid = 0",
  "14 files changed, 892 insertions(+)",
  "catch (e) { /* ignore */ }",
  "x = x + 1  # ???",
  "const tmp2 = data.filter(Boolean)",
  "self.cache[key] = None",
  "npm WARN deprecated",
  "[skip ci] wip",
  "export default function App()",
  "undefined is not a function",
  "git log --oneline | head",
  "return null; // for now",
  "merge branch 'dev' into dev",
];
const TROUBLE = /error|conflict|traceback|<<<<|>>>>|undefined|warn|^- /i;
const GLYPHS = "{}[]()<>=;:+-*/#$%&_|01?!";
// Moments the whole screen glitches at once, building as the confusion does (story ms).
const BURSTS = [560, 980, 1260, 1460, 1580];
const BURST_MS = 110;

type Phase = "intro" | "ready" | "holding" | "exit";

// A fragment of code adrift, placed as a fraction of the screen.
type Fragment = { text: string; fx: number; fy: number; depth: number; vx: number; vy: number; glitch: boolean; trouble: boolean; width: number; leaves: number };
// A point of light that leaves a fragment (or the thought) and pours into the spark along a
// curve: where along the text it starts, when it leaves, how long it takes, and how far the
// curve bows out.
type Grain = { from: number; u: number; dy: number; at: number; dur: number; bow: number; size: number };
type Mote = { a: number; r: number; size: number; phase: number; drift: number };
// A node in the ring around the tile, with where its line leaves the tile.
type Hub = { a: number; r: number; phase: number; speed: number };

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const span = (t: number, [from, to]: number[]) => clamp01((t - from) / (to - from));
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
const easeInCubic = (k: number) => k ** 3;
const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

type Props = {
  // Whether to wait for signing in once the name is in: null while not known yet (it
  // waits), true to show the panel, false to carry on (after signing in, too).
  hold: boolean | null;
  // The sign-in form, shown in the panel on the right.
  panel?: ReactNode;
  onDone: () => void;
};

export default function Splash({ hold, panel, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [skipped, setSkipped] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const holdRef = useRef(hold);
  holdRef.current = hold;
  // The form stays in the panel while it slides back out after signing in.
  const kept = useRef(panel);
  if (panel) kept.current = panel;

  useEffect(() => {
    rootRef.current!.style.setProperty("--pace", String(PACE));
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const root = rootRef.current!;
    let finished = false;
    let frame = 0;
    const timers: number[] = [];

    // How far the panel is in, 0 to 1, and how far along the story is, in milliseconds.
    // The story pauses at READY_AT while waiting to sign in.
    let split = 0;
    let story = 0;
    // When the exit started (the panel then has to leave first) and when the tile went.
    let exitAt = -1;
    let leaveAt = -1;
    let phaseNow: Phase = "intro";
    const moveTo = (next: Phase) => {
      if (phaseNow === next) return;
      phaseNow = next;
      setPhase(next);
    };
    const setSplit = (value: number) => {
      split = value;
      root.style.setProperty("--split", String(easeInOutCubic(split)));
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };
    // Skipping jumps to the next resting point: the sign-in panel, or the dashboard.
    const skip = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      if (story < READY_AT) {
        story = READY_AT;
        setSkipped(true);
      } else if (holdRef.current === false && split === 0) finish();
    };
    window.addEventListener("keydown", skip);
    root.addEventListener("pointerdown", skip);

    // Where the pointer is, -1 to 1 across the screen, and where the scene has eased to.
    const pointer = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer);

    let width = 0;
    let height = 0;
    let fragments: Fragment[] = [];
    let grains: Grain[] = [];
    let motes: Mote[] = [];
    let nodes: Hub[] = [];
    // Fragment -1 is the thought in the middle.
    const THOUGHT = -1;
    const beamCanvas = document.createElement("canvas");
    const beamCtx = beamCanvas.getContext("2d")!;
    // Film grain: a tile of noise, laid over the picture at a new offset every frame.
    const grain = document.createElement("canvas");
    grain.width = grain.height = 160;
    {
      const g = grain.getContext("2d")!;
      const data = g.createImageData(160, 160);
      for (let i = 0; i < data.data.length; i += 4) {
        const v = Math.random() * 255;
        data.data[i] = v;
        data.data[i + 1] = v * 0.9;
        data.data[i + 2] = v * 0.85;
        data.data[i + 3] = 255;
      }
      g.putImageData(data, 0, 0);
    }
    const grainPattern = ctx.createPattern(grain, "repeat");

    const codeFont = (size: number) => `500 ${size.toFixed(1)}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    const fragmentSize = (f: Fragment) => (width < 640 ? 9.5 : 11) + f.depth * (width < 640 ? 4 : 6);
    const thoughtSize = () => Math.max(17, Math.min(26, width * 0.018));
    // Text widths change once the fonts load, so they're measured again then.
    const measure = () => {
      for (const f of fragments) {
        ctx.font = codeFont(fragmentSize(f));
        f.width = ctx.measureText(f.text).width;
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      beamCanvas.width = Math.max(1, Math.round(width / 4));
      beamCanvas.height = Math.max(1, Math.round(height / 4));
      // Fewer fragments on a small screen, and none over the thought in the middle.
      const count = width < 640 ? 16 : width < 1100 ? 24 : FRAGMENTS.length;
      fragments = [];
      // Placed one by one where they don't cover each other or the thought, with room for
      // their drift.
      const taken: { x: number; y: number; w: number }[] = [];
      for (const text of FRAGMENTS.slice(0, count)) {
        const depth = Math.random();
        const w = text.length * ((width < 640 ? 9.5 : 11) + depth * (width < 640 ? 4 : 6)) * 0.62;
        let fx = 0;
        let fy = 0;
        for (let tries = 0; tries < 80; tries++) {
          fx = 0.03 + Math.random() * Math.max(0.05, 0.94 - w / width);
          fy = 0.06 + Math.random() * 0.88;
          const x = fx * width;
          const y = fy * height;
          const overThought = Math.abs(x + w / 2 - width / 2) < w / 2 + Math.min(260, width * 0.3) && Math.abs(y - height / 2) < 60;
          const overOther = taken.some((o) => x < o.x + o.w + 28 && o.x < x + w + 28 && Math.abs(y - o.y) < 26);
          if (!overThought && !overOther) break;
        }
        taken.push({ x: fx * width, y: fy * height, w });
        fragments.push({
          text,
          fx,
          fy,
          depth,
          vx: (Math.random() - 0.5) * 0.008 * (0.4 + depth),
          vy: (Math.random() - 0.5) * 0.004 * (0.4 + depth),
          glitch: Math.random() < 0.6,
          trouble: TROUBLE.test(text),
          width: 0,
          // Far fragments go first, so the light seems to come from everywhere at once.
          leaves: POUR[0] + 120 + (1 - depth) * 380 + Math.random() * 260,
        });
      }
      measure();
      grains = [];
      // The thought goes first, straight into the spark.
      for (let i = 0; i < 46; i++) {
        grains.push({ from: THOUGHT, u: Math.random(), dy: (Math.random() - 0.5) * 18, at: POUR[0] + Math.random() * 120, dur: 380 + Math.random() * 220, bow: (Math.random() - 0.5) * 0.4, size: 0.9 + Math.random() * 1.2 });
      }
      fragments.forEach((f, from) => {
        const n = Math.min(20, Math.ceil(f.text.length * 0.55));
        for (let i = 0; i < n; i++) {
          // Every curve bows the same way, so the light swirls in like water down a drain.
          grains.push({ from, u: Math.random(), dy: (Math.random() - 0.5) * 8, at: f.leaves + Math.random() * 200, dur: 700 + Math.random() * 450, bow: 0.38 + Math.random() * 0.34, size: 0.7 + Math.random() * 0.9 + f.depth * 0.5 });
        }
      });
      motes = Array.from({ length: 70 }, () => ({
        a: Math.random() * Math.PI * 2,
        r: 0.5 + Math.random() * 1.1,
        size: 0.5 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.0001,
      }));
      const hubs = width < 640 ? 9 : 14;
      nodes = Array.from({ length: hubs }, (_, i) => ({
        a: (i / hubs) * Math.PI * 2 + (Math.random() - 0.5) * 0.35,
        r: 1.05 + Math.random() * 0.75,
        phase: Math.random(),
        speed: 0.00035 + Math.random() * 0.0004,
      }));
    };
    resize();
    window.addEventListener("resize", resize);
    document.fonts?.ready.then(() => !finished && measure());

    // The tile's slot on screen (it doesn't move while the tile inside it pops in).
    const geometry = () => {
      const box = slotRef.current?.getBoundingClientRect();
      const size = box?.width || 200;
      const left = box ? box.left : width / 2 - size / 2;
      const top = box ? box.top : height / 2 - size / 2;
      return { size, left, top, cx: left + size / 2, cy: top + size / 2, bottom: top + size };
    };

    // A round bloom of warm light.
    const bloom = (x: number, y: number, radius: number, strength: number) => {
      if (strength <= 0 || radius <= 0) return;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(255, 247, 238, ${0.95 * strength})`);
      glow.addColorStop(0.14, `rgba(255, 176, 120, ${0.55 * strength})`);
      glow.addColorStop(0.45, `rgba(232, 89, 12, ${0.2 * strength})`);
      glow.addColorStop(1, "rgba(232, 89, 12, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    // Where a fragment sits at time `t`: it drifts, and slows to a stop as the noise stills.
    const driftClock = (t: number) => (t < STILL[0] ? t : STILL[0] + (STILL[1] - STILL[0]) * 0.5 * easeOutCubic(span(t, STILL)));
    const fragmentAt = (f: Fragment, t: number) => {
      const c = driftClock(t);
      return { x: f.fx * width + f.vx * c, y: f.fy * height + f.vy * c };
    };

    // The thought in the middle: typed, erased, typed again, with a caret.
    const thought = (t: number, cx: number, cy: number) => {
      let text = "";
      let idea = false;
      if (t >= IDEA[0]) {
        idea = true;
        // The newest letter flickers through code for a moment before it settles.
        const typed = span(t, IDEA) * ANSWER.length;
        const whole = Math.floor(typed);
        text = ANSWER.slice(0, whole);
        if (whole < ANSWER.length && typed - whole > 0.15) text += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      } else if (t >= ERASE[0]) {
        text = QUESTION.slice(0, Math.round((1 - span(t, ERASE)) * QUESTION.length));
      } else {
        text = QUESTION.slice(0, Math.round(span(t, ASK) * QUESTION.length));
      }
      // The answer breaks into light as the pour begins.
      const gone = easeInCubic(span(t, [POUR[0], POUR[0] + 260]));
      const strength = span(t, [ASK[0] - 200, ASK[0]]) * (1 - gone);
      if (strength <= 0) return;
      const size = thoughtSize();
      ctx.font = idea ? `600 ${size * 1.9}px Unbounded, Manrope, sans-serif` : `500 ${size}px Manrope, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      // Laid out as if the whole line were there, so typing doesn't shift it.
      const full = ctx.measureText(idea ? ANSWER : QUESTION).width;
      const x = cx - full / 2;
      ctx.globalCompositeOperation = "source-over";
      if (idea) {
        ctx.shadowColor = `rgba(255, 122, 26, ${0.8 * strength})`;
        ctx.shadowBlur = 34;
        ctx.fillStyle = `rgba(255, 150, 80, ${strength})`;
      } else {
        ctx.fillStyle = `rgba(245, 238, 230, ${0.92 * strength})`;
      }
      ctx.fillText(text, x, cy);
      ctx.shadowBlur = 0;
      // The caret blinks while nothing is being typed.
      const typing = (t > ASK[0] && t < ASK[1]) || (t > ERASE[0] && t < ERASE[1]) || (t > IDEA[0] && t < IDEA[1]);
      if (t < POUR[0] && (typing || Math.floor(t / 420) % 2 === 0)) {
        const caretX = x + ctx.measureText(text).width + 3;
        ctx.fillStyle = idea ? `rgba(255, 150, 80, ${strength})` : `rgba(245, 238, 230, ${0.8 * strength})`;
        const tall = idea ? size * 1.9 : size;
        ctx.fillRect(caretX, cy - tall * 0.62, idea ? 3 : 2, tall * 1.24);
      }
      return full;
    };

    // The fragments of code, drifting, glitching, and fading as their light leaves them.
    // How hard the screen is glitching at `t`: a burst, 0 to 1, or nothing.
    const burstAt = (t: number) => {
      for (const at of BURSTS) if (t >= at && t < at + BURST_MS) return 1 - (t - at) / BURST_MS;
      return 0;
    };
    const scramble = (text: string, rate: number) =>
      [...text].map((c) => (c !== " " && Math.random() < rate ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : c)).join("");

    const noise = (t: number) => {
      const shown = easeOutCubic(span(t, NOISE_IN));
      if (shown <= 0) return;
      // The confusion builds until the thought arrives, then the noise stills.
      const restless = (0.55 + 0.65 * span(t, [200, 1500])) * (1 - span(t, STILL));
      const burst = burstAt(t) * (1 - span(t, STILL));
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const f of fragments) {
        const left = 1 - easeInOutCubic(span(t, [f.leaves, f.leaves + 360]));
        if (left <= 0) continue;
        const { x, y } = fragmentAt(f, t);
        const size = fragmentSize(f);
        ctx.font = codeFont(size);
        let text = f.text;
        let jx = 0;
        let split = 0;
        const wild = f.glitch && restless > 0;
        // Now and then a line blinks out.
        if (wild && Math.random() < 0.025 * restless) continue;
        if ((wild && Math.random() < 0.55) || burst > 0) {
          text = scramble(f.text, 0.14 * restless + 0.3 * burst);
          jx = (Math.random() - 0.5) * (4 * restless + 26 * burst);
          // A slip sideways with the colour coming apart.
          if (Math.random() < 0.05 * restless + 0.6 * burst) split = 2 + Math.random() * (3 + 5 * burst);
        }
        // Near fragments are brighter; the light leaving makes them flare before they go.
        const flare = 1 + 1.4 * span(t, [f.leaves - 120, f.leaves + 80]) * left;
        const alpha = (0.16 + f.depth * 0.36) * shown * left * Math.min(flare, 1.8) * (1 + burst * 0.6);
        if (split > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgba(255, 40, 60, ${alpha * 0.8})`;
          ctx.fillText(text, x + jx - split, y);
          ctx.fillStyle = `rgba(40, 200, 255, ${alpha * 0.6})`;
          ctx.fillText(text, x + jx + split, y);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = f.trouble ? `rgba(248, 113, 113, ${alpha})` : `rgba(236, 226, 214, ${alpha})`;
        ctx.fillText(text, x + jx, y);
      }
      // In a burst, bands of the picture tear sideways.
      if (burst > 0) {
        const dpr = canvas.width / width;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 0; i < 5; i++) {
          const band = (4 + Math.random() * 22) * dpr;
          const top = Math.random() * (canvas.height - band);
          const shift = (Math.random() - 0.5) * 60 * dpr * burst;
          ctx.drawImage(canvas, 0, top, canvas.width, band, shift, top, canvas.width, band);
        }
        ctx.restore();
      }
    };

    // The points of light pouring into the spark, each along its own curve, quickening as it
    // goes, with a short tail behind it.
    const pour = (t: number, cx: number, cy: number, thoughtWidth: number) => {
      if (t < POUR[0] || t > POUR[1] + 200) return 0;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      let arrived = 0;
      for (const g of grains) {
        const k = span(t, [g.at, g.at + g.dur]);
        if (k >= 1) {
          arrived++;
          continue;
        }
        if (k <= 0) continue;
        let sx: number;
        let sy: number;
        if (g.from === THOUGHT) {
          sx = cx - thoughtWidth / 2 + g.u * thoughtWidth;
          sy = cy + g.dy;
        } else {
          const f = fragments[g.from];
          const at = fragmentAt(f, g.at);
          sx = at.x + g.u * f.width;
          sy = at.y + g.dy;
        }
        const dx = cx - sx;
        const dy = cy - sy;
        // The curve's bend: off to one side of the straight line in.
        const bx = (sx + cx) / 2 - dy * g.bow;
        const by = (sy + cy) / 2 + dx * g.bow;
        const point = (p: number) => {
          const q = 1 - p;
          return { x: q * q * sx + 2 * q * p * bx + p * p * cx, y: q * q * sy + 2 * q * p * by + p * p * cy };
        };
        const p = easeInOutCubic(k);
        const tail = Math.max(0, p - 0.025 - 0.09 * Math.sin(Math.PI * k));
        const head = point(p);
        const back = point(tail);
        const mid = point((p + tail) / 2);
        const alpha = Math.sin(Math.PI * Math.min(1, k * 1.05)) ** 0.6;
        const color = `${Math.round(mix(236, 150, k))}, ${Math.round(mix(220, 70, k))}`;
        const line = ctx.createLinearGradient(back.x, back.y, head.x, head.y);
        line.addColorStop(0, `rgba(255, ${color}, 0)`);
        line.addColorStop(1, `rgba(255, ${color}, ${alpha})`);
        ctx.strokeStyle = line;
        ctx.lineWidth = g.size;
        ctx.beginPath();
        ctx.moveTo(back.x, back.y);
        ctx.quadraticCurveTo(mid.x, mid.y, head.x, head.y);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 240, 225, ${alpha})`;
        ctx.fillRect(head.x - g.size * 0.6, head.y - g.size * 0.6, g.size * 1.2, g.size * 1.2);
      }
      return arrived / grains.length;
    };

    // The soft beam above the tile, wide at its foot and narrowing as it climbs.
    const beam = (x: number, top: number, base: number, size: number, strength: number) => {
      if (strength <= 0) return;
      const w = beamCanvas.width;
      const h = beamCanvas.height;
      const q = w / width;
      beamCtx.globalCompositeOperation = "source-over";
      beamCtx.clearRect(0, 0, w, h);
      const foot = size * 0.6 * q;
      const tip = size * 0.1 * q;
      const body = beamCtx.createLinearGradient(x * q - foot, 0, x * q + foot, 0);
      body.addColorStop(0, "rgba(255, 122, 26, 0)");
      body.addColorStop(0.4, "rgba(255, 150, 90, 0.22)");
      body.addColorStop(0.5, "rgba(255, 220, 190, 0.5)");
      body.addColorStop(0.6, "rgba(255, 150, 90, 0.22)");
      body.addColorStop(1, "rgba(255, 122, 26, 0)");
      beamCtx.fillStyle = body;
      beamCtx.beginPath();
      beamCtx.moveTo(x * q - tip, 0);
      beamCtx.lineTo(x * q + tip, 0);
      beamCtx.lineTo(x * q + foot, base * q);
      beamCtx.lineTo(x * q - foot, base * q);
      beamCtx.closePath();
      beamCtx.fill();
      beamCtx.globalCompositeOperation = "destination-in";
      const fade = beamCtx.createLinearGradient(0, 0, 0, base * q);
      const peak = clamp01(top / base);
      fade.addColorStop(0, "rgba(0, 0, 0, 0)");
      fade.addColorStop(peak * 0.7, "rgba(0, 0, 0, 0.55)");
      fade.addColorStop(peak, "rgba(0, 0, 0, 1)");
      fade.addColorStop(1, "rgba(0, 0, 0, 0)");
      beamCtx.fillStyle = fade;
      beamCtx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = strength;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(beamCanvas, 0, 0, width, height);
      ctx.globalAlpha = 1;
    };

    // The reflection on the floor under the tile: a thin glowing line, with a wider haze.
    const floorLight = (cx: number, y: number, size: number, strength: number) => {
      if (strength <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(cx, y);
      for (const [ry, alpha] of [[0.14, 0.12], [0.04, 0.5]]) {
        ctx.save();
        ctx.scale(1, ry);
        const r = size * 1.05;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255, 200, 160, ${alpha * strength})`);
        g.addColorStop(0.45, `rgba(255, 122, 26, ${alpha * 0.5 * strength})`);
        g.addColorStop(1, "rgba(232, 89, 12, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }
      ctx.restore();
    };

    // The AI lines: from the tile's edge out to a ring of nodes, drawn outward as they grow,
    // with signals running out along them and back.
    const network = (cx: number, cy: number, size: number, grow: number, strength: number) => {
      if (strength <= 0) return;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const spread = width < 640 ? 0.85 : 1;
      const placed = nodes.map((n) => {
        const sway = Math.sin(time * 0.0006 + n.phase * 6) * 0.03;
        const a = n.a + sway - lean.x * 0.04;
        return { n, a, x: cx + Math.cos(a) * n.r * size * 1.25 * spread, y: cy + Math.sin(a) * n.r * size * 0.95 * spread };
      });
      placed.forEach(({ n, a, x, y }, i) => {
        // From just outside the tile.
        const sx = cx + Math.cos(a) * size * 0.62;
        const sy = cy + Math.sin(a) * size * 0.62;
        const reach = easeOutCubic(clamp01(grow * 1.6 - n.phase * 0.6));
        if (reach <= 0) return;
        const ex = mix(sx, x, reach);
        const ey = mix(sy, y, reach);
        const line = ctx.createLinearGradient(sx, sy, ex, ey);
        line.addColorStop(0, `rgba(255, 150, 90, ${0.32 * strength})`);
        line.addColorStop(1, `rgba(255, 150, 90, ${0.1 * strength})`);
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // A few neighbours are linked too, like a net.
        const next = placed[(i + 1) % placed.length];
        if (reach >= 1 && i % 2 === 0) {
          ctx.strokeStyle = `rgba(255, 150, 90, ${0.07 * strength})`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(next.x, next.y);
          ctx.stroke();
        }
        if (reach < 1) return;
        // The node, and a signal running out and back.
        ctx.fillStyle = `rgba(255, 200, 160, ${0.7 * strength})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        const run = (time * n.speed + n.phase) % 1;
        const p = run < 0.5 ? run * 2 : 2 - run * 2;
        const glow = Math.sin(Math.PI * p);
        ctx.fillStyle = `rgba(255, 236, 214, ${0.85 * strength * glow})`;
        ctx.beginPath();
        ctx.arc(mix(sx, x, p), mix(sy, y, p), 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    // Sparks adrift around the tile, twinkling.
    const adrift = (cx: number, cy: number, size: number, strength: number) => {
      if (strength <= 0) return;
      ctx.globalCompositeOperation = "lighter";
      for (const mote of motes) {
        const a = mote.a + time * mote.drift;
        const x = cx + Math.cos(a) * mote.r * size * 1.3 - lean.x * 10 * mote.size;
        const y = cy + Math.sin(a) * mote.r * size * 0.95 - Math.sin(time * 0.0004 + mote.phase) * 6;
        const twinkle = 0.45 + 0.55 * Math.sin(time * 0.0022 + mote.phase * 3);
        ctx.fillStyle = `rgba(255, 214, 180, ${strength * twinkle * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, mote.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // The whole picture at story time `t`, `out` milliseconds into the exit (or -1).
    let time = 0;
    const draw = (t: number, out: number) => {
      const m = geometry();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#050302";
      ctx.fillRect(0, 0, width, height);

      if (out < 0) {
        noise(t);
        const thoughtWidth = thought(t, m.cx, m.cy) ?? 0;
        // Before the pour the thought's width isn't drawn any more; keep the last one.
        if (thoughtWidth) lastThought = thoughtWidth;
        const arrived = pour(t, m.cx, m.cy, lastThought);
        // The spark: a pinpoint as the answer breaks up, swelling as the light arrives, then
        // flaring as the tile rises out of it and settling into the glow behind the tile.
        const swell = t >= POUR[1] + 200 ? 1 : arrived;
        const spark = span(t, [SPARK[0], SPARK[0] + 200]) * (0.35 + 0.65 * swell);
        const flare = span(t, [3350, 3600]) * (1 - easeInOutCubic(span(t, [3600, 4400])));
        bloom(m.cx, m.cy, 18 + m.size * 0.9 * swell + m.size * 0.6 * flare, Math.max(0, spark * (1 - span(t, [3600, 4000]) * 0.7) + flare * 0.6));
        floorLight(m.cx, m.bottom + m.size * 0.38, m.size, easeOutCubic(span(t, FLOOR)));
        // The beam is brightest as the tile pops in and has all but gone by the time it rests.
        const beamK = easeOutCubic(span(t, BEAM)) * (1 - 0.85 * easeInOutCubic(span(t, [4300, 5200])));
        beam(m.cx, m.top - m.size * 0.5, m.cy, m.size, 0.9 * beamK);
        network(m.cx, m.cy, m.size, span(t, NETWORK), easeOutCubic(span(t, [NETWORK[0], NETWORK[0] + 400])));
        adrift(m.cx, m.cy, m.size, easeOutCubic(span(t, MOTES)));
      } else {
        // Leaving: the light around the tile fades out with the rest.
        const fade = 1 - easeInOutCubic(span(out, [0, 500]));
        floorLight(m.cx, m.bottom + m.size * 0.38, m.size, fade);
        network(m.cx, m.cy, m.size, 1, fade);
        adrift(m.cx, m.cy, m.size, 1 - easeInOutCubic(span(out, [0, 400])));
      }

      // The grain, faint, over everything.
      if (grainPattern) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.05;
        ctx.save();
        ctx.translate(Math.random() * 160, Math.random() * 160);
        ctx.fillStyle = grainPattern;
        ctx.fillRect(-160, -160, width + 320, height + 320);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";
    };
    let lastThought = 0;

    // The name: each letter flickers through code characters, then locks into place and
    // lights up (the CSS does the light). Driven from the story, so skipping lands on it whole.
    const letters = [...root.querySelectorAll<HTMLElement>(".splash__letter")];
    const spell = (t: number) => {
      letters.forEach((el, i) => {
        const start = NAME_AT + i * LETTER_STEP;
        const state = t < start ? "0" : t < start + DECODE_MS ? "1" : "2";
        if (el.dataset.s !== state) el.dataset.s = state;
        const shown = state === "1" ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : NAME[i];
        if (el.textContent !== shown) el.textContent = shown;
      });
    };

    const cleanup = () => {
      finished = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      root.removeEventListener("pointerdown", skip);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No motion: the tile in place with its floor light, the panel simply there until
      // signed in, then a quick fade.
      time = 6000;
      const still = () => {
        draw(READY_AT + 2000, -1);
        spell(READY_AT + 2000);
      };
      timers.push(window.setTimeout(still, 30));
      window.addEventListener("resize", still);
      const check = () => {
        if (finished) return;
        story = READY_AT;
        if (holdRef.current === true) {
          setSplit(1);
          still();
          moveTo("holding");
        } else if (holdRef.current === false) {
          setSplit(0);
          moveTo("exit");
          timers.push(window.setTimeout(finish, 400));
          return;
        }
        timers.push(window.setTimeout(check, 100));
      };
      check();
      return () => {
        window.removeEventListener("resize", still);
        cleanup();
      };
    }

    let last = performance.now();
    const tick = (now: number) => {
      if (finished) return;
      const dt = Math.min(now - last, 32);
      last = now;
      time += dt;
      // The scene follows the pointer with a lag, as a heavy thing would.
      const ease = 1 - Math.exp(-dt / 300);
      lean.x += (pointer.x - lean.x) * ease;
      lean.y += (pointer.y - lean.y) * ease;
      root.style.setProperty("--lean-x", lean.x.toFixed(3));
      root.style.setProperty("--lean-y", lean.y.toFixed(3));
      const hold = holdRef.current;

      // The panel slides towards where it should be.
      const wantSplit = story >= READY_AT && hold === true && exitAt < 0 ? 1 : 0;
      if (split !== wantSplit) {
        setSplit(wantSplit > split ? Math.min(1, split + dt / SPLIT_MS) : Math.max(0, split - dt / SPLIT_MS));
      }
      // The story waits at READY_AT until it's known whether to sign in, and while signing in.
      if (story < READY_AT || hold === false) story += dt / PACE;
      if (exitAt < 0 && hold === false && story >= READY_AT + (split > 0 ? 0 : LINGER_MS)) exitAt = now;
      // The tile goes once the panel is out of the way.
      if (exitAt >= 0 && leaveAt < 0 && split === 0) {
        leaveAt = now;
        moveTo("exit");
      }
      if (exitAt < 0) moveTo(story < READY_AT ? "intro" : split === 1 ? "holding" : "ready");

      const out = leaveAt >= 0 ? now - leaveAt : -1;
      draw(Math.min(story, READY_AT + 4000), out);
      if (out < 0) spell(story);
      if (out >= EXIT_MS) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return cleanup;
  }, []);

  // The form takes the keyboard once the panel is in.
  useEffect(() => {
    if (phase === "holding") panelRef.current?.querySelector("input")?.focus();
  }, [phase]);

  return (
    <div ref={rootRef} className={`splash splash--${phase}${skipped ? " splash--skipped" : ""}`}>
      <canvas ref={canvasRef} className="splash__canvas" aria-hidden="true" />
      <div className="splash__title">
        {/* The slot holds the tile's place while the tile pops into it. */}
        <div ref={slotRef} className="splash__slot">
          <div className="splash__rise">
            <div className="splash__sway">
              <LightTile />
            </div>
          </div>
          <div className="splash__words">
            <h1 className="splash__name" aria-label="Looma">
              {[...NAME].map((letter, i) => (
                <span key={i} className="splash__letter" style={{ "--i": i, "--r": NAME.length - 1 - i } as CSSProperties} aria-hidden="true">
                  {letter}
                </span>
              ))}
            </h1>
            <p className="splash__tagline">Every project, change and plan in one place</p>
          </div>
        </div>
      </div>
      <p className="splash__hint">Click or press any key to skip</p>
      {kept.current && (
        <div ref={panelRef} className="splash__panel" inert={phase !== "holding" ? true : undefined}>
          {kept.current}
        </div>
      )}
    </div>
  );
}

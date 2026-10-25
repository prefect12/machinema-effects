/* =====================================================================
 * mv.js — 确定性动画视频运行时（Motion Video runtime）
 *
 * 核心契约：画面只是时间 t 的纯函数。
 *   - 禁止用 Date.now / performance.now / requestAnimationFrame 的时间驱动动画
 *   - 禁止用 Math.random（用 MV.rng(seed)）
 *   - 所有动画都在 scene 的 draw(s) 里根据 s.t / s.lt 计算
 * 预览：直接用浏览器打开 index.html（底部有时间轴，可拖动 / 空格播放）
 * 渲染：node <skill>/scripts/render.mjs index.html
 * ===================================================================== */
(function () {
  'use strict';
  const MV = {};
  const Q = new URLSearchParams(location.search);
  const RENDER = Q.has('render');
  MV.isRender = RENDER;

  // ------------------------------------------------------------------ 配置
  const cfg = { width: 1920, height: 1080, fps: 30, duration: 10, bg: '#000' };
  MV.cfg = cfg;
  MV.config = function (o) { Object.assign(cfg, o); layout(); return cfg; };

  // ------------------------------------------------------------------ 数学 / 缓动
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const map = (v, a, b, c, d, clampIt = true) => {
    let p = (v - a) / (b - a); if (clampIt) p = clamp(p); return c + (d - c) * p;
  };
  const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
  Object.assign(MV, { clamp, lerp, map, smooth, TAU: Math.PI * 2 });

  const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1, c4 = (2 * Math.PI) / 3, c5 = (2 * Math.PI) / 4.5;
  const bounceOut = (x) => { const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
  const E = {
    linear: (x) => x,
    inSine: (x) => 1 - Math.cos((x * Math.PI) / 2), outSine: (x) => Math.sin((x * Math.PI) / 2),
    inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
    inQuad: (x) => x * x, outQuad: (x) => 1 - (1 - x) * (1 - x),
    inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    inCubic: (x) => x * x * x, outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inQuart: (x) => x ** 4, outQuart: (x) => 1 - Math.pow(1 - x, 4),
    inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
    inQuint: (x) => x ** 5, outQuint: (x) => 1 - Math.pow(1 - x, 5),
    inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
    inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inOutExpo: (x) => x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    inCirc: (x) => 1 - Math.sqrt(1 - x * x), outCirc: (x) => Math.sqrt(1 - Math.pow(x - 1, 2)),
    inOutCirc: (x) => x < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2,
    inBack: (x) => c3 * x ** 3 - c1 * x * x, outBack: (x) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2),
    inOutBack: (x) => x < 0.5 ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2 : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,
    outElastic: (x) => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1,
    inOutElastic: (x) => x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2 : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1,
    outBounce: bounceOut, inBounce: (x) => 1 - bounceOut(1 - x),
  };
  MV.ease = E;

  /** tw(t, t0, t1, ease) → 0..1：在 [t0,t1] 内按缓动推进，之外钳制。最常用的函数。 */
  MV.tw = (t, t0, t1, ease = E.inOutCubic) => {
    if (typeof ease === 'string') ease = E[ease];
    return ease(clamp((t - t0) / Math.max(1e-6, t1 - t0)));
  };
  /** env(t, t0, t1, fin, fout) → 0..1：进入淡入、离开淡出的包络 */
  MV.env = (t, t0, t1, fin = 0.4, fout = 0.4, ease = E.inOutSine) =>
    Math.min(MV.tw(t, t0, t0 + fin, ease), 1 - MV.tw(t, t1 - fout, t1, ease));
  /** 关键帧插值：MV.keys(t, [[0,0],[1,100,'outBack'],[2,50]]) */
  MV.keys = (t, ks) => {
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      const [tb, vb, e] = ks[i]; const [ta, va] = ks[i - 1];
      if (t <= tb) return lerp(va, vb, MV.tw(t, ta, tb, e || E.inOutCubic));
    }
    return ks[ks.length - 1][1];
  };
  /** 解析弹簧：从 0 到 1 的阻尼弹簧，t 为秒。适合弹出、落地。 */
  MV.spring = (t, { k = 170, c = 14, m = 1, v0 = 0 } = {}) => {
    if (t <= 0) return 0;
    const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m));
    if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0 - v0) / wd) * Math.sin(wd * t)); }
    return 1 - Math.exp(-w0 * t) * (1 + (w0 - v0) * t);
  };
  /** 交错：第 i 个元素（共 n 个）在整体进度 p 下的局部进度，spread 控制错开程度 */
  MV.stagger = (p, i, n, spread = 0.5) => {
    const each = 1 - spread; const start = n <= 1 ? 0 : (i / (n - 1)) * spread;
    return clamp((p - start) / each);
  };

  // ------------------------------------------------------------------ 随机 / 噪声
  MV.rng = function (seed = 1) {
    let a = (seed >>> 0) || 1;
    const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (a2, b2) => a2 + (b2 - a2) * r();
    r.int = (a2, b2) => Math.floor(a2 + (b2 - a2 + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return r;
  };
  /** 无状态哈希随机：MV.hash(i, j) → 0..1，同样输入永远同样输出 */
  MV.hash = (a, b = 0, c = 0) => {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
  };
  // Perlin improved noise 3D
  const P = new Uint8Array(512);
  { const r = MV.rng(1337); const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => { const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v); };
  /** MV.noise(x,y,z) → 约 -1..1 的平滑噪声 */
  MV.noise = function (x, y = 0, z = 0) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    return lerp(lerp(lerp(grad(P[AA] & 15, x, y, z), grad(P[BA] & 15, x - 1, y, z), u),
      lerp(grad(P[AB] & 15, x, y - 1, z), grad(P[BB] & 15, x - 1, y - 1, z), u), v),
      lerp(lerp(grad(P[AA + 1] & 15, x, y, z - 1), grad(P[BA + 1] & 15, x - 1, y, z - 1), u),
        lerp(grad(P[AB + 1] & 15, x, y - 1, z - 1), grad(P[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w);
  };
  MV.fbm = (x, y = 0, z = 0, oct = 4) => { let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * MV.noise(x * f, y * f, z * f); a *= 0.5; f *= 2; } return s; };
  /** 手持感/呼吸感抖动：返回 {x,y,r} */
  MV.shake = (t, amp = 6, freq = 1.2, seed = 0) => ({
    x: MV.fbm(t * freq, seed + 11.3) * amp * 2, y: MV.fbm(t * freq, seed + 47.9) * amp * 2,
    r: MV.fbm(t * freq, seed + 91.1) * amp * 0.004,
  });

  // ------------------------------------------------------------------ 颜色
  MV.hex2rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join('');
    const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  MV.rgba = (hex, a = 1) => { const [r, g, b] = MV.hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  MV.mix = (h1, h2, p) => { const a = MV.hex2rgb(h1), b = MV.hex2rgb(h2);
    return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(p))).toString(16).padStart(2, '0')).join(''); };
  /** 多色渐变采样：MV.ramp(['#00f','#0ff','#fff'], 0.3) */
  MV.ramp = (cols, p) => { p = clamp(p) * (cols.length - 1); const i = Math.min(cols.length - 2, Math.floor(p));
    return MV.mix(cols[i], cols[i + 1], p - i); };

  // ------------------------------------------------------------------ 形状 / 点云
  const pointCache = new Map();
  /** 把任意绘制内容采样成点：draw(ctx,w,h)，返回以中心为原点的 [{x,y}] */
  MV.shapePoints = function (key, w, h, draw, step = 6) {
    const k = key + '|' + w + '|' + h + '|' + step; if (pointCache.has(k)) return pointCache.get(k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; draw(g, w, h);
    const d = g.getImageData(0, 0, w, h).data; const pts = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      if (d[(y * w + x) * 4 + 3] > 128) pts.push({ x: x - w / 2, y: y - h / 2 }); }
    pointCache.set(k, pts); return pts;
  };
  /** 文字点云：MV.textPoints('OpenAI', {size:260, font:'700 260px "PingFang SC"', step:5}) */
  MV.textPoints = function (text, { size = 240, font, step = 6, weight = 700, family = MV.FONT.sans } = {}) {
    font = font || `${weight} ${size}px ${family}`;
    const probe = document.createElement('canvas').getContext('2d'); probe.font = font;
    const w = Math.ceil(probe.measureText(text).width + size * 0.4), h = Math.ceil(size * 1.5);
    return MV.shapePoints('T:' + text + font, w, h, (g) => {
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2); }, step);
  };
  /** 斐波那契球面：返回 [{x,y,z}]，单位球 */
  MV.spherePoints = (n) => { const out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      out.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r }); } return out; };
  /** 把点集重采样成恰好 n 个（用于两形状之间 morph），确定性 */
  MV.resample = (pts, n, seed = 7) => { if (!pts.length) return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    const r = MV.rng(seed), out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = pts[i < pts.length ? Math.floor((i / n) * pts.length) : Math.floor(r() * pts.length)];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out; };
  /** 3D 旋转+透视投影：返回 {x,y,s(缩放),z} */
  MV.project = (p, { rx = 0, ry = 0, rz = 0, fov = 900, cx = 0, cy = 0, scale = 1 } = {}) => {
    let { x, y, z } = p; x *= scale; y *= scale; z = (z || 0) * scale;
    let c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c];
    c = Math.cos(rx); s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(rz); s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c];
    const k = fov / (fov + z); return { x: cx + x * k, y: cy + y * k, s: k, z };
  };

  // ------------------------------------------------------------------ 发光精灵（高性能粒子）
  const spriteCache = new Map();
  /** 预渲染的柔光点，配合 ctx.globalCompositeOperation='lighter' 使用：
   *  MV.dot(ctx, x, y, r, '#8ff', alpha) —— 比 shadowBlur 快 50 倍 */
  MV.sprite = (color, core = 0.25) => {
    const k = color + core; if (spriteCache.has(k)) return spriteCache.get(k);
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, '#fff'); gr.addColorStop(core * 0.5, color); gr.addColorStop(core, MV.rgba(color, 0.55));
    gr.addColorStop(0.55, MV.rgba(color, 0.12)); gr.addColorStop(1, MV.rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S); spriteCache.set(k, cv); return cv;
  };
  MV.dot = (ctx, x, y, r, color = '#fff', a = 1, core) => {
    if (a <= 0.003 || r <= 0) return; ctx.globalAlpha = a; const s = MV.sprite(color, core);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; };
  /** 大面积柔光（光晕 / 体积光） */
  MV.glow = (ctx, x, y, r, color, a = 0.5) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, MV.rgba(color, a)); g.addColorStop(0.4, MV.rgba(color, a * 0.35)); g.addColorStop(1, MV.rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };

  // ------------------------------------------------------------------ 文字
  MV.FONT = {
    sans: '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif',
    serif: '"Songti SC","Noto Serif SC","STSong",serif',
    mono: '"JetBrains Mono","SF Mono","Menlo","Consolas",monospace',
    display: '"Avenir Next","Helvetica Neue","PingFang SC",sans-serif',
    round: '"Arial Rounded MT Bold","Yuanti SC","PingFang SC",sans-serif',
  };
  /** 打字机：返回当前应显示的子串（按字符，中文友好） */
  MV.typed = (str, t, t0, cps = 14) => { const a = [...str]; return a.slice(0, clamp(Math.floor((t - t0) * cps), 0, a.length)).join(''); };
  /** 光标闪烁 */
  MV.caret = (t, rate = 1.1) => (t * rate) % 1 < 0.55;
  /** 数字滚动：MV.count(t, t0, t1, 0, 2023950) → '2,023,950' */
  MV.count = (t, t0, t1, a, b, { ease = E.outCubic, decimals = 0, sep = true } = {}) => {
    const v = lerp(a, b, MV.tw(t, t0, t1, ease));
    const s = v.toFixed(decimals); return sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s; };
  /** 画文字（带 letterSpacing / 对齐 / 透明度 / 模糊入场） */
  MV.text = (ctx, str, x, y, { size = 48, weight = 500, family = MV.FONT.sans, color = '#fff', align = 'center',
    baseline = 'middle', alpha = 1, spacing = 0, blur = 0, font } = {}) => {
    if (alpha <= 0) return; ctx.save(); ctx.globalAlpha = alpha * ctx.globalAlpha;
    ctx.font = font || `${weight} ${size}px ${family}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
    if (spacing) ctx.letterSpacing = spacing + 'px'; if (blur > 0.2) ctx.filter = `blur(${blur}px)`;
    ctx.fillText(str, x, y); ctx.restore(); };
  /** 逐字入场：每个字符错开上浮+淡入+去模糊，高级感标题的标配 */
  MV.textReveal = (ctx, str, x, y, p, opt = {}) => {
    const { size = 64, weight = 600, family = MV.FONT.sans, color = '#fff', spacing = 0, align = 'center',
      spread = 0.6, rise = 0.5, blur = 10, alpha = 1 } = opt;
    const chars = [...str]; ctx.save(); ctx.font = `${weight} ${size}px ${family}`;
    const ws = chars.map((c) => ctx.measureText(c).width + spacing); const W = ws.reduce((a, b) => a + b, 0) - spacing;
    let cx = align === 'center' ? x - W / 2 : align === 'right' ? x - W : x;
    chars.forEach((c, i) => { const q = E.outCubic(MV.stagger(p, i, chars.length, spread));
      if (q > 0) MV.text(ctx, c, cx, y + (1 - q) * size * rise, { size, weight, family, color, align: 'left', alpha: q * alpha, blur: (1 - q) * blur });
      cx += ws[i]; });
    ctx.restore(); return W; };
  /** 自动换行，返回行数组 */
  MV.wrap = (ctx, str, maxW) => { const lines = []; let cur = '';
    for (const ch of [...str]) { if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
    if (cur) lines.push(cur); return lines; };

  // ------------------------------------------------------------------ 形状工具
  MV.rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  /** 药丸标签 / 卡片：MV.pill(ctx, x, y, '文字', {bg, fg, stroke}) 返回宽度 */
  MV.pill = (ctx, x, y, str, { size = 28, bg = '#fff', fg = '#222', stroke = null, lw = 3, pad = 18, weight = 600,
    family = MV.FONT.sans, align = 'left', alpha = 1, radius } = {}) => {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${weight} ${size}px ${family}`;
    const w = ctx.measureText(str).width + pad * 2, h = size * 1.6; const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    MV.rr(ctx, x0, y - h / 2, w, h, radius ?? h / 2); ctx.fillStyle = bg; ctx.fill();
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(str, x0 + pad, y + 1);
    ctx.restore(); return w; };
  /** 描线动画：沿路径画出 p 比例（用于图表、线条出现） */
  MV.drawPath = (ctx, pts, p) => { if (pts.length < 2 || p <= 0) return;
    let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    let rem = L * clamp(p); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && rem > 0; i++) { const d = seg[i - 1];
      if (rem >= d) ctx.lineTo(pts[i][0], pts[i][1]); else { const q = rem / d;
        ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], q), lerp(pts[i - 1][1], pts[i][1], q)); }
      rem -= d; }
    ctx.stroke(); };
  /** 相机：在中心点缩放/平移/旋转，fn 内绘制世界坐标 */
  MV.camera = (ctx, { x = 0, y = 0, zoom = 1, rot = 0 } = {}, fn) => {
    ctx.save(); ctx.translate(cfg.width / 2, cfg.height / 2); ctx.rotate(rot); ctx.scale(zoom, zoom);
    ctx.translate(-cfg.width / 2 - x, -cfg.height / 2 - y); fn(); ctx.restore(); };

  // ------------------------------------------------------------------ 图片资源（可选）
  const assets = []; MV.img = (src) => { const im = new Image(); im.src = src; assets.push(im.decode().catch(() => {})); return im; };

  // ------------------------------------------------------------------ 场景系统
  const scenes = []; const layers = { pre: [], post: [] }; const seekHooks = [];
  /** MV.scene(name, start, end, draw, {z}) — draw(s) 每帧调用，s 字段：
   *  t 全局秒, lt 场景内秒, p 场景进度0..1, dur, ctx, W, H, frame, env(fin,fout) 进出包络 */
  MV.scene = (name, start, end, draw, opt = {}) => { scenes.push({ name, start, end, draw, z: opt.z || 0 }); };
  /** 每帧在所有场景之前 / 之后执行（背景、HUD、全局字幕等） */
  MV.before = (fn) => layers.pre.push(fn);
  MV.after = (fn) => layers.post.push(fn);
  /** DOM / GSAP 等外部系统同步：MV.onSeek(t => tl.seek(t)) */
  MV.onSeek = (fn) => seekHooks.push(fn);
  MV.gsap = (tl) => { tl.pause(0); seekHooks.push((t) => tl.seek(t, false)); return tl; };
  /** 节拍登记：MV.beat(t, '发生了什么', 'pop' 或 {sfx:'boom', vol:0.4} 或 A=>{…})
   *  每个节拍 = 屏幕上一次“观众能说出来的变化”。第三个参数自动在该时刻播放音效。
   *  render.mjs --beats 会检查节拍间隔（>1.6s 报警）并渲染每个节拍的前后对比图。 */
  const beats = []; MV.beats = beats;
  MV.beat = (t, label, sfx) => { beats.push({ t, label, sfx }); return t; };
  // ------------------------------------------------------------------ 角色调度：有目的的移动
  /** MV.actor —— 让角色“有目标地”移动：看向目标 → 走/跑/跳过去 → 到达、停稳 → 做事 → 奔向下一个目标。
   *  const bot = MV.actor({ x: 300, y: 700 })
   *    .wait(0.6)                      // 停住（身体完全静止，只有呼吸/眨眼）
   *    .look(900)                      // 眼睛先看向目标，身体转过去（约 0.3s）
   *    .walkTo(900, 'go')              // 走过去：时长 = 距离 / 速度，自动起步和刹车，腿的步频跟着速度
   *    .act(0.8, 'catch')              // 到达后做一件事（label 用来切换表情/动作）
   *    .hopTo(1250, 520)               // 跳到另一处：预备压扁 → 腾空弧线 → 落地压扁 → 回弹 → 停稳
   *    .runTo(1600).jump(140).waitUntil(9.5).moveTo(800, 400, 1.2);
   *  const st = bot.at(lt);  // → { x, y, facing, moving(0..1), gait(步相位), bob, sq(挤压), lift(离地高度), look(-1..1), label, p(当前动作进度) }
   *  画角色时：位置用 st.x/st.y - st.lift，朝向 st.facing，腿相位用 st.gait（只在 moving>0 时摆动），挤压用 st.sq。 */
  const actorsReg = []; MV.actors = actorsReg;
  /** name：角色名（审片图里用）；t0：这个角色时间轴的起点（= 所在场景的开始时间，at(lt) 用场景内时间） */
  MV.actor = function ({ x = 0, y = 0, facing = 1, speed = 380, runSpeed = 820, stride = 120, name, t0: T0 = 0 } = {}) {
    const acts = []; let cur = { x, y, facing, t: 0, look: 0 };
    const push = (a) => { acts.push({ ...a, t0: cur.t, x0: cur.x, y0: cur.y, f0: cur.facing }); cur = { x: a.x1 ?? cur.x, y: a.y1 ?? cur.y, facing: a.f1 ?? cur.facing, t: cur.t + a.dur, look: a.look1 ?? 0 }; return api; };
    const api = {
      wait(d = 0.5, label = 'idle') { return push({ type: 'wait', dur: d, label }); },
      act(d = 0.6, label = 'act') { return push({ type: 'wait', dur: d, label }); },
      waitUntil(t, label = 'idle') { return t > cur.t ? push({ type: 'wait', dur: t - cur.t, label }) : api; },
      look(tx, d = 0.3, label = 'look') { const f = tx === cur.x ? cur.facing : Math.sign(tx - cur.x); return push({ type: 'look', dur: d, label, f1: f, look1: f }); },
      walkTo(tx, label = 'walk', o = {}) { const dist = Math.abs(tx - cur.x); if (dist < 1) return api; const v = o.speed || speed;
        return push({ type: 'move', dur: dist / v + 0.35, label, x1: tx, f1: Math.sign(tx - cur.x), stride: o.stride || stride, run: false }); },
      runTo(tx, label = 'run', o = {}) { const dist = Math.abs(tx - cur.x); if (dist < 1) return api; const v = o.speed || runSpeed;
        return push({ type: 'move', dur: dist / v + 0.3, label, x1: tx, f1: Math.sign(tx - cur.x), stride: (o.stride || stride) * 1.5, run: true }); },
      hopTo(tx, ty = cur.y, label = 'hop', o = {}) { const dist = Math.hypot(tx - cur.x, ty - cur.y); const air = o.air || Math.min(0.75, 0.32 + dist / 1800);
        return push({ type: 'hop', dur: 0.14 + air + 0.32, air, h: o.height ?? (40 + dist * 0.12), label, x1: tx, y1: ty, f1: tx === cur.x ? cur.facing : Math.sign(tx - cur.x) }); },
      jump(h = 140, label = 'jump') { return api.hopTo(cur.x, cur.y, label, { height: h, air: 0.5 }); },
      /** 匀滑移动（飞行器、漂浮物、被传送带带走），ease 默认 inOutCubic */
      moveTo(tx, ty = cur.y, d = 1, label = 'move', ease = 'inOutCubic') { return push({ type: 'glide', dur: d, ease, label, x1: tx, y1: ty, f1: tx === cur.x ? cur.facing : Math.sign(tx - cur.x) }); },
      get end() { return cur.t; }, get pos() { return { x: cur.x, y: cur.y }; },
      timeline() { return acts.map((a) => ({ type: a.type, label: a.label, t0: a.t0, dur: a.dur, x0: a.x0, x1: a.x1 ?? a.x0, y0: a.y0, y1: a.y1 ?? a.y0 })); },
      at(t) {
        let a = acts[0]; for (const q of acts) if (t >= q.t0) a = q;
        const base = { x: cur.x, y: cur.y, facing: cur.facing, moving: 0, gait: 0, bob: 0, sq: 0, lift: 0, look: 0, label: 'idle', p: 1 };
        if (!a) return base; const lt = t - a.t0, p = clamp(lt / a.dur);
        if (t >= a.t0 + a.dur && a === acts[acts.length - 1]) return { ...base, label: a.label, facing: a.f1 ?? a.f0 };
        const o = { x: a.x0, y: a.y0, facing: a.f0, moving: 0, gait: 0, bob: 0, sq: 0, lift: 0, look: 0, label: a.label, p };
        if (a.type === 'look') { o.facing = lt > a.dur * 0.4 ? a.f1 : a.f0; o.look = (a.f1 || 1) * E.outCubic(p); }
        else if (a.type === 'move') { const q = E.inOutSine(p), dist = Math.abs(a.x1 - a.x0); o.x = lerp(a.x0, a.x1, q); o.facing = a.f1;
          o.moving = Math.min(1, Math.sin(Math.PI * p) * 3); const travelled = q * dist; o.gait = travelled / a.stride;
          o.bob = Math.abs(Math.sin(o.gait * Math.PI)) * (a.run ? 14 : 6) * o.moving; o.look = a.f1 * 0.6; o.sq = a.run ? -0.04 * o.moving : 0; }
        else if (a.type === 'hop') { const pre = 0.14, rel = lt - pre, land = rel - a.air; o.facing = a.f1;
          if (lt < pre) o.sq = 0.22 * E.outQuad(lt / pre);
          else if (rel < a.air) { const k = rel / a.air; o.x = lerp(a.x0, a.x1, k); o.y = lerp(a.y0, a.y1, k); o.lift = a.h * 4 * k * (1 - k); o.sq = -0.16 * Math.sin(Math.PI * k); o.look = a.f1 * 0.5; }
          else { o.x = a.x1; o.y = a.y1; o.sq = 0.25 * Math.exp(-land * 10) * Math.cos(land * 26); } }
        else if (a.type === 'glide') { const q = E[a.ease] ? E[a.ease](p) : p; o.x = lerp(a.x0, a.x1, q); o.y = lerp(a.y0, a.y1, q); o.facing = a.f1; }
        if (t >= a.t0 + a.dur) { o.x = a.x1 ?? a.x0; o.y = a.y1 ?? a.y0; o.lift = 0; o.moving = 0; o.bob = 0; }
        return o; },
    };
    api.name = name || ('角色' + (actorsReg.length + 1)); api.T0 = T0; actorsReg.push(api);
    return api;
  };

  // ------------------------------------------------------------------ 导演层：节奏网格 / 情绪曲线 / 镜头表
  const tempo = { bpm: 0, offset: 0, beatsPerBar: 4 };
  /** 设定全片速度：MV.tempo(96) —— 之后 MV.bt(n) 是第 n 拍的时间，剪辑点、节拍尽量落在拍子上 */
  MV.tempo = (bpm, offset = 0, beatsPerBar = 4) => { Object.assign(tempo, { bpm, offset, beatsPerBar }); return tempo; };
  MV.bt = (n) => tempo.offset + (n * 60) / (tempo.bpm || 60);
  MV.bar = (n, beat = 0) => MV.bt(n * tempo.beatsPerBar + beat);
  /** 把时间吸附到最近的拍（div=2 半拍，div=4 十六分） */
  MV.snap = (t, div = 1) => { if (!tempo.bpm) return t; const b = 60 / tempo.bpm / div; return tempo.offset + Math.round((t - tempo.offset) / b) * b; };
  /** 律动：每拍开头为 1，随后指数衰减。用于让光晕/缩放/HUD 跟着音乐一跳一跳 */
  MV.pulse = (t, { div = 1, decay = 7 } = {}) => { if (!tempo.bpm) return 0; const b = 60 / tempo.bpm / div; const ph = (((t - tempo.offset) % b) + b) % b; return Math.exp(-ph * decay); };
  const arcPts = []; MV.arcPts = arcPts;
  /** 情绪曲线（起承转合）：MV.arc([{at:0,name:'起',tension:2},{at:12,name:'承',tension:4},…,{at:44,name:'高潮',tension:10,hit:true},{at:52,name:'合',tension:3}])
   *  tension 0–10。配乐 A.score 不传 sections 时自动跟随这条曲线；hit:true 处自动“静默一拍 → 爆发”。 */
  MV.arc = (pts) => { arcPts.splice(0, arcPts.length, ...pts.slice().sort((a, b) => a.at - b.at)); return arcPts; };
  /** 当前张力 0..1（在关键点之间平滑插值） */
  MV.tension = (t) => { if (!arcPts.length) return 0.5; if (t <= arcPts[0].at) return arcPts[0].tension / 10;
    for (let i = 1; i < arcPts.length; i++) if (t <= arcPts[i].at) { const a = arcPts[i - 1], b = arcPts[i];
      return lerp(a.tension, b.tension, E.inOutSine(clamp((t - a.at) / Math.max(0.01, b.at - a.at)))) / 10; }
    return arcPts[arcPts.length - 1].tension / 10; };
  MV.act = (t) => { let n = arcPts[0]; for (const p of arcPts) if (t >= p.at) n = p; return n ? n.name : ''; };
  const seqs = []; MV.seqList = seqs;
  /** 段落（连续的一场戏，8–20 秒）：同一个空间/同一批物体在里面不断累积、升级，最后“溢出/变形”成下一段。
   *  MV.seq(t0, t1, { name, place:'仓库', grows:'一个文件夹 → 箱子蹦出 → 堆满仓库 → 日志淹没成海', exit:'transform'|'camera'|'morph'|'match'|'cut'|'iris'|… })
   *  exit 说明这一段怎么变成下一段：transform（本段的东西长成下一段，如日志涨成海）、camera（镜头穿进某物/飞到别处）、morph（粒子重组）、
   *  match（相同形状/动作接续）——这四种是“连续”；其余（cut/wipe/dip/iris/fade…）都算“换页”，全片要少用 */
  MV.seq = (t0, t1, o = {}) => { seqs.push({ t0, t1, ...o }); return t0; };
  const shots = []; MV.shotList = shots;
  /** 机位登记（一个段落里可以有多个机位；trans:'camera' 表示镜头连续运动过去，不是切）：MV.shot(t, {size:'wide'|'full'|'medium'|'close'|'extreme'|'insert'|'pov'|'aerial', move:'static'|'push'|'pull'|'pan'|'track'|'tilt'|'orbit'|'handheld'|'crane', trans:'cut'|'whip'|'zoom'|'iris'|'wipe'|'ink'|'morph'|'match'|'flash'|'dip'|'glitch'|'slice'|'fade', note:'…'})
   *  render.mjs --plan 会检查景别/转场多样性、镜头长度与张力的关系、剪辑点是否卡在拍子上 */
  MV.shot = (t, o = {}) => { shots.push({ t, ...o }); return t; };
  MV.sceneAt = (t) => scenes.filter((s) => t >= s.start && t < s.end).map((s) => s.name);
  MV.scenes = scenes;

  // ------------------------------------------------------------------ 后期：颗粒 / 暗角 / 色差
  const post = { grain: 0, vignette: 0, vignetteColor: '#000', scanlines: 0, tint: null };
  MV.post = (o) => Object.assign(post, o);
  let grainTiles = null;
  function makeGrain() { grainTiles = [];
    for (let k = 0; k < 6; k++) { const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g = cv.getContext('2d'), im = g.createImageData(S, S), r = MV.rng(99 + k);
      for (let i = 0; i < S * S; i++) { const v = r() * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
      g.putImageData(im, 0, 0); grainTiles.push(cv); } }
  function drawPost(fctx, frame) {
    const W = cfg.width, H = cfg.height; fctx.clearRect(0, 0, W, H);
    if (post.tint) { fctx.fillStyle = post.tint; fctx.fillRect(0, 0, W, H); }
    if (post.vignette > 0) { const g = fctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.0);
      g.addColorStop(0, MV.rgba(post.vignetteColor, 0)); g.addColorStop(1, MV.rgba(post.vignetteColor, post.vignette));
      fctx.fillStyle = g; fctx.fillRect(0, 0, W, H); }
    if (post.grain > 0) { if (!grainTiles) makeGrain(); fctx.save(); fctx.globalAlpha = post.grain; fctx.globalCompositeOperation = 'overlay';
      const tile = grainTiles[frame % grainTiles.length]; fctx.fillStyle = fctx.createPattern(tile, 'repeat');
      fctx.translate((frame * 37) % 256, (frame * 91) % 256); fctx.fillRect(-256, -256, W + 512, H + 512); fctx.restore(); }
    if (post.scanlines > 0) { fctx.fillStyle = `rgba(0,0,0,${post.scanlines})`; for (let y = 0; y < H; y += 4) fctx.fillRect(0, y, W, 1); }
  }

  // ------------------------------------------------------------------ DOM 搭建
  let stage, canvas, ctx, fx, fctx, dom;
  function layout() {
    if (!stage) return; const { width: W, height: H } = cfg;
    for (const el of [stage, canvas, fx, dom]) { el.style.width = W + 'px'; el.style.height = H + 'px'; }
    canvas.width = fx.width = W; canvas.height = fx.height = H;
    if (!RENDER) fit();
  }
  function build() {
    const css = document.createElement('style');
    css.textContent = `html,body{margin:0;background:${RENDER ? cfg.bg : '#111'};overflow:hidden}
#mv-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;background:${cfg.bg}}
#mv-stage>*{position:absolute;left:0;top:0}#mv-dom{pointer-events:none}#mv-fx{pointer-events:none}
#mv-ui{position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;gap:10px;align-items:center;padding:0 12px;
background:#1b1b1b;color:#ddd;font:12px/1 ui-monospace,monospace;z-index:9}
#mv-ui input[type=range]{flex:1}#mv-ui button{background:#333;color:#eee;border:0;padding:6px 10px;border-radius:4px;cursor:pointer}`;
    document.head.appendChild(css);
    stage = document.createElement('div'); stage.id = 'mv-stage';
    canvas = document.createElement('canvas'); canvas.id = 'mv-canvas';
    dom = document.getElementById('mv-dom') || document.createElement('div'); dom.id = 'mv-dom';
    fx = document.createElement('canvas'); fx.id = 'mv-fx';
    stage.append(canvas, dom, fx); document.body.appendChild(stage);
    ctx = canvas.getContext('2d'); fctx = fx.getContext('2d');
    MV.ctx = ctx; MV.canvas = canvas; MV.dom = dom; MV.stage = stage;
    layout(); if (!RENDER) buildUI();
  }
  MV.W = () => cfg.width; MV.H = () => cfg.height;

  // ------------------------------------------------------------------ 每帧绘制
  let curT = 0;
  function renderFrame(t) {
    curT = t; const W = cfg.width, H = cfg.height, frame = Math.round(t * cfg.fps);
    for (const h of seekHooks) h(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = cfg.bg; ctx.fillRect(0, 0, W, H);
    const base = { t, W, H, ctx, frame, fps: cfg.fps };
    for (const f of layers.pre) { ctx.save(); f(base); ctx.restore(); }
    const act = scenes.filter((s) => t >= s.start && t < s.end).sort((a, b) => a.z - b.z);
    for (const sc of act) {
      const lt = t - sc.start, dur = sc.end - sc.start;
      const s = Object.assign({}, base, { lt, dur, p: clamp(lt / dur), name: sc.name,
        env: (fin = 0.5, fout = 0.5) => MV.env(lt, 0, dur, fin, fout) });
      ctx.save(); try { sc.draw(s); } catch (e) { console.error('[scene ' + sc.name + ']', e); } ctx.restore();
    }
    for (const f of layers.post) { ctx.save(); f(base); ctx.restore(); }
    drawPost(fctx, frame);
    if (ui) ui.sync(t);
  }
  MV.frame = renderFrame;

  // ------------------------------------------------------------------ 音频：离线合成（OfflineAudioContext）
  let audioFn = null; MV.audio = (fn) => { audioFn = fn; };
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  /** 'A4' → 440；数字直接当频率 */
  MV.hz = (n) => { if (typeof n === 'number') return n; const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
    const s = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return 440 * Math.pow(2, (s + (+m[3] + 1) * 12 - 69) / 12); };
  const CHORD = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus2: [0, 2, 7],
    sus4: [0, 5, 7], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], dim: [0, 3, 6], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9] };
  /** 'Am7' → 该和弦从 octave 起的频率数组 */
  MV.chord = (name, oct = 3) => { const m = /^([A-G][#b]?)(.*)$/.exec(name); const root = MV.hz(m[1] + oct);
    return (CHORD[m[2]] || CHORD['']).map((i) => root * Math.pow(2, i / 12)); };

  function makeSynth(ac, dur) {
    const A = { ac, dur, sr: ac.sampleRate };
    const master = ac.createGain(); master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.05;
    master.connect(comp); comp.connect(lim); lim.connect(ac.destination);
    // 混响：程序生成的脉冲响应
    const conv = ac.createConvolver(); const irLen = Math.floor(ac.sampleRate * 3.2);
    const ir = ac.createBuffer(2, irLen, ac.sampleRate); const r = MV.rng(5);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / irLen, 3.2); }
    conv.buffer = ir; const wet = ac.createGain(); wet.gain.value = 0.32; conv.connect(wet); wet.connect(master);
    // 总线：music / sfx 可分别控制
    const bus = (v) => { const g = ac.createGain(); g.gain.value = v; g.connect(master); const s = ac.createGain(); s.gain.value = 1; s.connect(conv); return { dry: g, rev: s }; };
    A.music = bus(0.8); A.sfx = bus(1.0);
    // 白噪声缓冲
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); { const d = nb.getChannelData(0); const rr = MV.rng(3); for (let i = 0; i < d.length; i++) d[i] = rr() * 2 - 1; }
    const noise = (t, d) => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t, 0); s.stop(t + d + 0.05); return s; };
    const out = (node, busName = 'sfx', rev = 0.25, pan = 0) => { const b = A[busName]; let n = node;
      if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
      n.connect(b.dry); if (rev > 0) { const g = ac.createGain(); g.gain.value = rev; n.connect(g); g.connect(b.rev); } };
    const envGain = (t, a, d, peak, rel = 0.05) => { const g = ac.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, d - rel));
      g.gain.exponentialRampToValueAtTime(0.0001, t + d); return g; };
    const perc = (t, peak, decay) => { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decay); return g; };
    const ok = (t) => t >= 0 && t < dur;

    // ---------- 乐器（music 总线）
    /** 柔和铺底：多振荡器去谐 + 低通，慢起慢收 */
    A.pad = (t, d, notes, { vol = 0.07, type = 'sawtooth', cutoff = 1400, attack = 1.2, release = 1.5, detune = 9, pan = 0, rev = 0.6, pump = 0, vibrato = false } = {}) => {
      if (!ok(t)) return; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.6;
      const g = envGain(t, attack, d + release, vol, release); f.connect(g); out(g, 'music', rev, pan);
      let lfoG = null; if (vibrato) { const lfo = ac.createOscillator(); lfo.frequency.value = 5.2; lfoG = ac.createGain(); lfoG.gain.value = 9; lfo.connect(lfoG); lfo.start(t); lfo.stop(t + d + release + 0.1); }
      if (pump) { const pg = ac.createGain(); f.disconnect(); f.connect(pg); pg.connect(g); for (let x = t; x < t + d; x += pump) { pg.gain.setValueAtTime(0.3, x); pg.gain.linearRampToValueAtTime(1, x + pump * 0.6); } }
      for (const n of notes) for (const dt of [-detune, 0, detune]) { const o = ac.createOscillator(); o.type = type;
        o.frequency.value = MV.hz(n); o.detune.value = dt; if (lfoG) lfoG.connect(o.detune); const og = ac.createGain(); og.gain.value = 1 / (notes.length * 2.2);
        o.connect(og); og.connect(f); o.start(t); o.stop(t + d + release + 0.1); } };
    /** 拨弦 / 琶音音符 */
    A.pluck = (t, note, { vol = 0.12, decay = 0.6, type = 'triangle', cutoff = 3200, pan = 0, rev = 0.35, bus = 'music' } = {}) => {
      if (!ok(t)) return; const o = ac.createOscillator(); o.type = type; o.frequency.value = MV.hz(note);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(300, t + decay);
      const g = perc(t, vol, decay); o.connect(f); f.connect(g); out(g, bus, rev, pan); o.start(t); o.stop(t + decay + 0.05); };
    /** 钟 / 钢片琴（FM） */
    A.bell = (t, note, { vol = 0.1, decay = 2.2, ratio = 3.5, index = 2.5, pan = 0, rev = 0.5, bus = 'music' } = {}) => {
      if (!ok(t)) return; const f0 = MV.hz(note); const car = ac.createOscillator(); car.frequency.value = f0;
      const mod = ac.createOscillator(); mod.frequency.value = f0 * ratio; const mg = ac.createGain();
      mg.gain.setValueAtTime(f0 * index, t); mg.gain.exponentialRampToValueAtTime(1, t + decay);
      mod.connect(mg); mg.connect(car.frequency); const g = perc(t, vol, decay); car.connect(g); out(g, bus, rev, pan);
      car.start(t); mod.start(t); car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05); };
    /** 贝斯 */
    A.bass = (t, d, note, { vol = 0.16, type = 'sine', cutoff = 500 } = {}) => {
      if (!ok(t)) return; const o = ac.createOscillator(); o.type = type; o.frequency.value = MV.hz(note);
      const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = MV.hz(note) * 2; const g2 = ac.createGain(); g2.gain.value = 0.25;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; const g = envGain(t, 0.02, d, vol, 0.08);
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); out(g, 'music', 0.05); o.start(t); o2.start(t); o.stop(t + d + 0.1); o2.stop(t + d + 0.1); };
    A.kick = (t, { vol = 0.5, bus = 'music' } = {}) => { if (!ok(t)) return; const o = ac.createOscillator(); o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12); const g = perc(t, vol, 0.35); o.connect(g); out(g, bus, 0.02); o.start(t); o.stop(t + 0.4); };
    A.snare = (t, { vol = 0.18, bus = 'music' } = {}) => { if (!ok(t)) return; const n = noise(t, 0.2); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
      const g = perc(t, vol, 0.18); n.connect(f); f.connect(g); out(g, bus, 0.2); const o = ac.createOscillator(); o.frequency.value = 190; const g2 = perc(t, vol * 0.6, 0.08); o.connect(g2); out(g2, bus, 0.1); o.start(t); o.stop(t + 0.1); };
    A.hat = (t, { vol = 0.05, open = false, bus = 'music', pan = 0.15 } = {}) => { if (!ok(t)) return; const n = noise(t, 0.3); const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
      const g = perc(t, vol, open ? 0.25 : 0.045); n.connect(f); f.connect(g); out(g, bus, 0.05, pan); };
    // ---------- 更多乐器
    /** 钢琴（泛音叠加 + 琴槌噪声） */
    A.piano = (t, note, { vol = 0.12, decay = 1.6, pan = 0, rev = 0.35, bus = 'music', bright = 1 } = {}) => {
      if (!ok(t)) return; const f0 = MV.hz(note); const g = perc(t, vol, decay); const f = ac.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(1600 * bright + f0 * 2, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, f0 * 1.5), t + decay); f.connect(g); out(g, bus, rev, pan);
      [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12], [4.01, 'sine', 0.05]].forEach(([m, type, amp]) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f0 * m;
        const og = ac.createGain(); og.gain.value = amp; o.connect(og); og.connect(f); o.start(t); o.stop(t + decay + 0.05); });
      const n = noise(t, 0.02); const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000; const ng = perc(t, vol * 0.12, 0.02); n.connect(nf); nf.connect(ng); out(ng, bus, 0.1, pan); };
    /** 马林巴（卡通/轻快） */
    A.marimba = (t, note, { vol = 0.12, pan = 0, bus = 'music', rev = 0.25 } = {}) => { if (!ok(t)) return; const f0 = MV.hz(note); const g = ac.createGain(); g.gain.value = vol; out(g, bus, rev, pan);
      [[1, 1, 0.5], [4, 0.25, 0.08], [10, 0.06, 0.03]].forEach(([m, amp, dd]) => { const o = ac.createOscillator(); o.frequency.value = f0 * m; const og = ac.createGain();
        og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.0001, t + dd); o.connect(og); og.connect(g); o.start(t); o.stop(t + dd + 0.02); }); };
    /** 弦乐铺底（带颤音） */
    A.strings = (t, d, notes, { vol = 0.05, pan = 0, cutoff = 2200, attack = 0.6, release = 1.2 } = {}) => A.pad(t, d, notes, { vol, type: 'sawtooth', cutoff, attack, release, detune: 14, rev: 0.7, pan, vibrato: true });
    /** 铜管（滤波包络打开） */
    A.brass = (t, d, note, { vol = 0.07, pan = 0 } = {}) => { if (!ok(t)) return; const f0 = MV.hz(note); const f = ac.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(2400, t + 0.12); f.frequency.linearRampToValueAtTime(1400, t + d);
      const g = envGain(t, 0.06, d + 0.2, vol, 0.2); f.connect(g); out(g, 'music', 0.45, pan);
      for (const dt of [-6, 6]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0; o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + d + 0.3); } };
    /** 小提琴（弓弦乐器建模）：锯齿波 + 琴弓起音 + 延迟颤音 + 共鸣箱共振峰 + 弓毛摩擦噪声
     *  A.violin(t, d, note, {vol, vibrato, bow}) —— 也适用于大提琴（音低一个八度）、二胡（vibrato 调大） */
    A.violin = (t, d, note, { vol = 0.1, vibrato = 1, bow = 1, pan = 0, rev = 0.45, bus = 'music', attack = 0.07 } = {}) => {
      if (!ok(t)) return; const f0 = MV.hz(note), rel = Math.min(0.35, d * 0.5);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.55, t + attack * 0.6);
      g.gain.linearRampToValueAtTime(vol, t + attack + 0.12); g.gain.setValueAtTime(vol, t + Math.max(attack + 0.12, d - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + d + rel);
      // 共鸣箱：几个共振峰 + 高频滚降
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5500; lp.Q.value = 0.3;
      const peaks = [[280, 4, 5], [1000, 3, 3.5], [2800, 5, 4], [4500, 3, -3]].map(([fr, q, gn]) => { const b = ac.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = fr; b.Q.value = q; b.gain.value = gn; return b; });
      let node = lp; for (const b of peaks) { node.connect(b); node = b; } node.connect(g); out(g, bus, rev, pan);
      // 延迟颤音：先直音，0.25s 后揉弦逐渐加深
      const lfo = ac.createOscillator(); lfo.frequency.value = 5.6; const lg = ac.createGain(); lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(0, t + Math.min(0.25, d * 0.3)); lg.gain.linearRampToValueAtTime(f0 * 0.006 * vibrato, t + Math.min(0.6, d * 0.7)); lfo.connect(lg); lfo.start(t); lfo.stop(t + d + rel + 0.05);
      for (const [dt, a] of [[-4, 0.5], [3, 0.5], [0, 0.35]]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0; o.detune.value = dt;
        lg.connect(o.frequency); const og = ac.createGain(); og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + d + rel + 0.05); }
      // 弓毛摩擦：起音处明显，持续时很轻
      const n = noise(t, d + rel); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f0 * 3); bp.Q.value = 2;
      const ng = ac.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(vol * 0.35 * bow, t + 0.03); ng.gain.exponentialRampToValueAtTime(vol * 0.06 * bow, t + attack + 0.1);
      ng.gain.setValueAtTime(vol * 0.06 * bow, t + Math.max(attack + 0.1, d)); ng.gain.exponentialRampToValueAtTime(0.0001, t + d + rel); n.connect(bp); bp.connect(ng); ng.connect(lp); };
    A.tom = (t, { vol = 0.3, pitch = 1, bus = 'music' } = {}) => { if (!ok(t)) return; const o = ac.createOscillator(); o.frequency.setValueAtTime(190 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(80 * pitch, t + 0.3); const g = perc(t, vol, 0.45); o.connect(g); out(g, bus, 0.3); o.start(t); o.stop(t + 0.5); };
    A.crash = (t, { vol = 0.14, bus = 'music' } = {}) => { if (!ok(t)) return; const n = noise(t, 2.6); const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4500;
      const g = perc(t, vol, 2.4); n.connect(f); f.connect(g); out(g, bus, 0.4); };
    A.clap = (t, { vol = 0.14, bus = 'music' } = {}) => { for (const dt of [0, 0.012, 0.024]) { const tt = t + dt; if (!ok(tt)) continue; const n = noise(tt, 0.12);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; const g = perc(tt, vol * (dt ? 0.6 : 1), dt > 0.02 ? 0.12 : 0.02); n.connect(f); f.connect(g); out(g, bus, 0.25); } };

    // ---------- 编曲引擎
    const STYLE = {
      ambient:    { pad: ['sawtooth', 0.055, 500, 1600, 1.2, 1.8], bassEvery: 'bar', bassVol: 0.09, arp: 'bell', arpRate: 1, lead: 'bell', leadAt: 0.5, rhythm: 'slow', drums: null, swing: 0 },
      cinematic:  { pad: ['sawtooth', 0.06, 500, 2600, 0.8, 1.4], strings: true, bassEvery: 'bar', bassVol: 0.13, arp: 'pluck', arpRate: 2, lead: 'strings', leadAt: 0.45, rhythm: 'slow', drums: 'cinematic', swing: 0 },
      epic:       { pad: ['sawtooth', 0.065, 600, 3000, 0.5, 1.2], strings: true, bassEvery: 'beat', bassVol: 0.14, arp: 'pluck', arpRate: 2, lead: 'brass', leadAt: 0.5, rhythm: 'slow', drums: 'epic', swing: 0 },
      lofi:       { pad: ['triangle', 0.045, 900, 2200, 0.15, 0.5], bassEvery: 'beat', bassVol: 0.12, arp: 'piano', arpRate: 1, lead: 'piano', leadAt: 0.4, rhythm: 'mid', drums: 'lofi', swing: 0.12 },
      piano:      { pad: ['triangle', 0.028, 700, 1600, 0.8, 1.5], bassEvery: 'bar', bassVol: 0.07, arp: 'piano', arpRate: 1, lead: 'piano', leadAt: 0.25, rhythm: 'slow', drums: null, swing: 0 },
      playful:    { pad: ['square', 0.026, 1200, 2400, 0.05, 0.2], bassEvery: 'beat', bassVol: 0.12, arp: 'marimba', arpRate: 2, lead: 'marimba', leadAt: 0.35, rhythm: 'fast', drums: 'bouncy', swing: 0.08 },
      electronic: { pad: ['sawtooth', 0.05, 700, 3200, 0.05, 0.3], pump: true, bassEvery: 'eighth', bassVol: 0.12, arp: 'pluck', arpRate: 4, lead: 'pluck', leadAt: 0.5, rhythm: 'fast', drums: 'four', swing: 0 },
      tense:      { pad: ['sawtooth', 0.06, 400, 1400, 0.6, 1.0], bassEvery: 'eighth', bassVol: 0.1, arp: 'pluck', arpRate: 4, lead: null, leadAt: 2, rhythm: 'slow', drums: 'pulse', swing: 0 },
    };
    const DRUMS = {
      lofi: { k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], kv: 0.32, sv: 0.1, hv: 0.03, snare: 'snare' },
      bouncy: { k: [0, 8, 11], s: [4, 12], h: [2, 6, 10, 14], kv: 0.35, sv: 0.12, hv: 0.04, snare: 'clap' },
      four: { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14], oh: true, kv: 0.42, sv: 0.12, hv: 0.05, snare: 'clap' },
      cinematic: { k: [0, 10], s: [8], h: [0, 4, 8, 12], kv: 0.4, sv: 0.16, hv: 0.025, snare: 'snare' },
      epic: { k: [0, 8], s: [12], h: [], toms: [0, 3, 6, 8, 11, 14], kv: 0.5, sv: 0.2, hv: 0, snare: 'snare' },
      pulse: { k: [0, 4, 8, 12], s: [], h: [...Array(16).keys()], kv: 0.28, sv: 0, hv: 0.018 },
    };
    const RHY = { slow: [[0, 2], [2, 1], [3, 1], [4, 3], [7, 1]], mid: [[0, 1], [1, 0.5], [1.5, 1.5], [3, 1], [4, 1], [5, 1], [6, 2]],
      fast: [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1], [4, 0.5], [4.5, 0.5], [5, 1], [6, 0.5], [6.5, 1.5]] };
    const play = (inst, t, f, v, len) => {
      if (inst === 'bell') A.bell(t, f, { vol: v * 0.8, decay: 2.2 }); else if (inst === 'pluck') A.pluck(t, f, { vol: v, decay: Math.min(0.7, len * 1.5 + 0.1) });
      else if (inst === 'piano') A.piano(t, f, { vol: v * 1.2, decay: Math.max(0.8, len * 1.5) }); else if (inst === 'marimba') A.marimba(t, f, { vol: v * 1.3 });
      else if (inst === 'strings') A.pad(t, Math.max(0.2, len), [f], { type: 'sawtooth', vol: v * 0.55, attack: 0.08, release: 0.5, cutoff: 2600, vibrato: true, detune: 6, rev: 0.55 });
      else if (inst === 'brass') A.brass(t, Math.max(0.2, len * 0.9), f, { vol: v * 0.8 });
      else if (inst === 'violin') A.violin(t, Math.max(0.25, len * 0.95), f, { vol: v * 1.1 }); };
    /** 一键配乐（有主旋律、会随情绪起伏）：
     *  A.score({ style, bpm, chords, sections:[{at, energy, hit}], start, end, vol, seed, lead })
     *  - lead：覆盖主旋律乐器 'violin' | 'piano' | 'bell' | 'pluck' | 'marimba' | 'strings' | 'brass'（片中有人拉小提琴，就用 lead:'violin'）
     *  - style：ambient 纪录片 | cinematic 电影 | epic 史诗 | lofi 生活叙事 | piano 抒情 | playful 卡通 | electronic 科技 | tense 紧张
     *  - 不传 sections 时自动跟随 MV.arc 情绪曲线（推荐）；energy/张力决定编制：
     *    0–0.2 只有铺底 · 0.2+ 贝斯 · 0.35+ 琶音 · 0.45+ 主旋律 · 0.6+ 鼓 · 0.85+ 全编制（十六分镲、镲片、定音鼓）
     *  - 能量陡升自动加 riser + 镲片；陡降自动变成“breakdown”；hit 点自动“静默一拍 → 爆发” */
    A.score = (opt = {}) => {
      const st = Object.assign({}, STYLE[opt.style || 'cinematic'] || STYLE.cinematic, opt.lead ? { lead: opt.lead, leadAt: opt.leadAt ?? 0.3 } : {});
      const bpm = opt.bpm || tempo.bpm || 90, beat = 60 / bpm, bpc = opt.beatsPerChord || 4, bar = beat * bpc;
      const start = opt.start ?? (tempo.bpm ? tempo.offset : 0), end = opt.end ?? dur, chords = opt.chords || ['Am', 'F', 'C', 'G'], vol = opt.vol ?? 1, oct = opt.key ?? 3;
      const energyAt = (t) => { if (opt.sections) { let e = opt.sections[0].energy; for (const x of opt.sections) if (t >= x.at) e = x.energy; return e; }
        return arcPts.length ? MV.tension(t) : opt.energy ?? 0.6; };
      // 调式与音阶
      const m0 = /^([A-G][#b]?)(.*)$/.exec(chords[0]); const minor = /^m(?!aj)/.test(m0[2]);
      const keyHz = MV.hz(m0[1] + '4'); const SC = [];
      for (let o = -1; o <= 2; o++) for (const x of minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]) SC.push(keyHz * Math.pow(2, o + x / 12));
      const nearest = (f) => { let bi = 0, bd = 1e9; SC.forEach((x, i) => { const dd = Math.abs(Math.log(x / f)); if (dd < bd) { bd = dd; bi = i; } }); return bi; };
      const R = MV.rng(opt.seed || 21);
      // 主题动机：2 小节，强拍用和弦音，弱拍用经过音，最后一个音回到根音
      const rh = RHY[st.rhythm] || RHY.mid; let dg = R.int(0, 2);
      const motif = rh.map(([b, d], k) => { if (k) dg = clamp(dg + R.pick([-1, 1, 1, 2, -2, 0]), 0, 5); return { b, d, deg: dg, strong: b % 2 === 0 }; });
      motif[motif.length - 1].deg = 0; motif[motif.length - 1].last = true;
      const noteHz = (deg, ch, strong) => { const tones = MV.chord(ch, 5); const base = tones[((deg % tones.length) + tones.length) % tones.length] * Math.pow(2, Math.floor(deg / tones.length));
        if (strong) return base; const i = nearest(base) + (deg % 2 ? 1 : -1); return SC[clamp(i, 0, SC.length - 1)]; };
      let prevE = null; let i = 0;
      for (let t = start; t < end - 0.01; t += bar, i++) {
        const e = clamp(energyAt(t + 0.01)), eNext = clamp(energyAt(t + bar + 0.01)), ch = chords[i % chords.length], cf = MV.chord(ch, oct), d = Math.min(bar, end - t);
        const [pt, pv, c0, c1, pa, pr] = st.pad;
        A.pad(t, d, cf, { type: pt, vol: pv * vol * (0.6 + 0.6 * e), cutoff: lerp(c0, c1, e), attack: Math.min(pa, bar * 0.5), release: pr, pump: st.pump && e > 0.6 ? beat : 0 });
        if (st.strings && e > 0.45) A.strings(t, d, cf.map((f) => f * 2), { vol: 0.03 * vol * e, cutoff: 1600 + e * 2000 });
        if (e > 0.2) { const root = cf[0] / 2, stp = st.bassEvery === 'bar' ? bar : st.bassEvery === 'beat' ? beat : beat / 2;
          for (let b = 0, k = 0; b < d - 0.01; b += stp, k++) A.bass(t + b, stp * 0.92, root * (st.bassEvery === 'eighth' && k % 2 ? 2 : 1), { vol: st.bassVol * vol * (0.7 + 0.4 * e) }); }
        if (e > 0.35 && st.arp) { const stp = beat / st.arpRate, arp = [...cf.map((f) => f * 2), cf[0] * 4];
          for (let b = 0, k = 0; b < d - 0.01; b += stp, k++) play(st.arp, t + b + (k % 2 ? st.swing * stp : 0), arp[(k * 2 + i) % arp.length], 0.04 * vol * e, stp); }
        if (st.lead && e >= st.leadAt) { const pb = i % 8, lift = pb === 4 || pb === 5 ? 2 : 0, half = i % 2;
          for (const nt of motif) { if (nt.b < bpc * half || nt.b >= bpc * (half + 1)) continue; const tt = t + (nt.b - bpc * half) * beat; if (tt >= t + d) continue;
            let deg = nt.deg + lift; if (nt.last && pb === 3) deg += 2; play(st.lead, tt, noteHz(deg, ch, nt.strong), 0.07 * vol * (0.7 + 0.5 * e), nt.d * beat); } }
        if (st.drums && e > 0.6) { const P = DRUMS[st.drums], s16 = beat / 4;
          for (let k = 0; k < 4 * bpc; k++) { const k16 = k % 16, tt = t + k * s16 + (k % 2 ? st.swing * s16 * 2 : 0); if (tt >= end) break;
            if (P.k.includes(k16)) A.kick(tt, { vol: P.kv * vol });
            if (P.s.includes(k16)) (P.snare === 'clap' ? A.clap : A.snare)(tt, { vol: P.sv * vol });
            if (P.hv && (P.h.includes(k16) || (e > 0.85 && k16 % 2 === 1))) A.hat(tt, { vol: P.hv * vol * (k16 % 4 ? 0.7 : 1) });
            if (P.oh && k16 % 4 === 2 && e > 0.75) A.hat(tt, { vol: P.hv * 1.2 * vol, open: true });
            if (P.toms && e > 0.8 && P.toms.includes(k16)) A.tom(tt, { pitch: 1 - (k16 / 16) * 0.4, vol: 0.3 * vol }); }
          if (e > 0.85 && i % 2 === 0) A.crash(t, { vol: 0.1 * vol }); }
        if (eNext - e >= 0.3 && t + bar < end) A.riser(t + bar * 0.25, bar * 0.75, { vol: Math.min(0.1, 0.06 * vol * (eNext - e) * 2) });
        if (prevE !== null && e - prevE >= 0.3) A.crash(t, { vol: 0.13 * vol });
        if (prevE !== null && prevE - e >= 0.3) A.swell(t - Math.min(bar, 1.5), Math.min(bar, 1.5), { vol: 0.08 * vol });
        prevE = e; }
      const hits = (opt.hits || []).concat(opt.sections ? opt.sections.filter((x) => x.hit).map((x) => x.at) : arcPts.filter((p) => p.hit).map((p) => p.at));
      for (const h of hits) { A.hush(h - beat, beat); A.boom(h, { vol: 0.5 * vol }); A.crash(h, { vol: 0.16 * vol }); A.subdrop(h, { vol: 0.25 * vol }); }
    };

    // ---------- 闪避 / 静默（自动化音乐总线音量）
    const busBase = { music: 0.8, sfx: 1.0 };
    /** 让音乐在 [t, t+d] 压低到 level（旁白、关键台词、低谷时刻） */
    A.duck = (t, d, { level = 0.3, fade = 0.2, bus = 'music' } = {}) => { if (!ok(t)) return; const b = A[bus], base = busBase[bus];
      for (const [g, bv] of [[b.dry.gain, base], [b.rev.gain, 1]]) { g.setValueAtTime(bv, t); g.linearRampToValueAtTime(bv * level, t + fade);
        g.setValueAtTime(bv * level, Math.max(t + fade, t + d - fade)); g.linearRampToValueAtTime(bv, t + d); } };
    /** 音乐完全静默 d 秒（高潮前“憋一口气”的那一拍） */
    A.hush = (t, d = 0.5) => A.duck(t, d, { level: 0.0001, fade: Math.min(0.04, d / 4) });

    // ---------- 外部音频（用户提供的 mp3/wav）：MV.loadAudio('bgm', 'music.mp3') 后使用
    A.sample = (t, key, { vol = 1, offset = 0, dur: dd, rate = 1, bus = 'sfx', rev = 0, pan = 0, fadeIn = 0.01, fadeOut = 0.05 } = {}) => {
      const buf = A.buffers[key]; if (!buf || !ok(t)) return; const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
      const len = Math.min(dd ?? (buf.duration - offset) / rate, dur - t); const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + fadeIn);
      g.gain.setValueAtTime(vol, t + Math.max(fadeIn, len - fadeOut)); g.gain.linearRampToValueAtTime(0, t + len); s.connect(g); out(g, bus, rev, pan); s.start(t, offset, len * rate + 0.05); };
    /** 整首背景音乐（走 music 总线，所以 duck/hush 同样生效） */
    A.track = (key, { start = 0, vol = 0.8, offset = 0, fadeIn = 1, fadeOut = 2 } = {}) => A.sample(start, key, { vol, offset, bus: 'music', fadeIn, fadeOut });

    // ---------- 音效（sfx 总线）
    /** 呼啸：滤波噪声扫频，转场用；up=true 上扬 */
    A.whoosh = (t, d = 0.6, { vol = 0.25, up = true, pan = 0, from = null, to = null } = {}) => { if (!ok(t)) return;
      const n = noise(t, d); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(from || (up ? 300 : 3000), t); f.frequency.exponentialRampToValueAtTime(to || (up ? 3500 : 250), t + d);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      n.connect(f); f.connect(g); out(g, 'sfx', 0.3, pan); };
    /** 上升音（高潮前的蓄力） */
    A.riser = (t, d = 2, { vol = 0.12 } = {}) => { if (!ok(t)) return; A.whoosh(t, d, { vol: vol * 1.3, up: true, from: 200, to: 6000 });
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + d);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(4000, t + d);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + d * 0.95); g.gain.linearRampToValueAtTime(0, t + d + 0.02);
      o.connect(f); f.connect(g); out(g, 'sfx', 0.4); o.start(t); o.stop(t + d + 0.05); };
    /** 低频冲击：大标题落地 / 关键时刻 */
    A.boom = (t, { vol = 0.5 } = {}) => { if (!ok(t)) return; const o = ac.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      const g = perc(t, vol, 1.6); o.connect(g); out(g, 'sfx', 0.4); o.start(t); o.stop(t + 1.7);
      const n = noise(t, 0.6); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g2 = perc(t, vol * 0.5, 0.5); n.connect(f); f.connect(g2); out(g2, 'sfx', 0.5); };
    A.impact = A.boom;
    /** 气泡弹出（卡通元素出现） */
    A.pop = (t, { vol = 0.22, pitch = 1, pan = 0 } = {}) => { if (!ok(t)) return; const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(400 * pitch, t); o.frequency.exponentialRampToValueAtTime(1100 * pitch, t + 0.06);
      const g = perc(t, vol, 0.12); o.connect(g); out(g, 'sfx', 0.1, pan); o.start(t); o.stop(t + 0.15); };
    /** UI 点击 / 滴答 */
    A.click = (t, { vol = 0.15, pitch = 1, pan = 0 } = {}) => { if (!ok(t)) return; const n = noise(t, 0.03); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3500 * pitch; f.Q.value = 3;
      const g = perc(t, vol, 0.03); n.connect(f); f.connect(g); out(g, 'sfx', 0.05, pan); };
    /** 键盘打字声：从 t 开始持续 d 秒，每秒 cps 下 */
    A.typing = (t, d, { cps = 12, vol = 0.1 } = {}) => { const r = MV.rng(Math.floor(t * 100)); for (let x = 0; x < d; x += 1 / cps * r.range(0.6, 1.4)) A.click(t + x, { vol: vol * r.range(0.6, 1), pitch: r.range(0.7, 1.3), pan: r.range(-0.2, 0.2) }); };
    /** 界面提示音 */
    A.blip = (t, note = 'E6', { vol = 0.08, pan = 0 } = {}) => A.pluck(t, note, { vol, decay: 0.18, type: 'sine', cutoff: 8000, bus: 'sfx', rev: 0.15, pan });
    /** 成功：上行琶音 */
    A.success = (t, { vol = 0.1, root = 'C5' } = {}) => { const f = MV.hz(root); [0, 4, 7, 12].forEach((s, i) => A.bell(t + i * 0.07, f * Math.pow(2, s / 12), { vol, decay: 1.2, bus: 'sfx', rev: 0.4 })); };
    /** 失败 / 报错：低沉双音 */
    A.error = (t, { vol = 0.1 } = {}) => { [0, 0.14].forEach((dt) => { if (!ok(t + dt)) return; const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = 140;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = perc(t + dt, vol, 0.12); o.connect(f); f.connect(g); out(g, 'sfx', 0.1); o.start(t + dt); o.stop(t + dt + 0.14); }); };
    /** 闪烁 / 魔法：一串随机高音铃 */
    A.sparkle = (t, d = 1, { vol = 0.05, density = 14 } = {}) => { const r = MV.rng(Math.floor(t * 97)); for (let x = 0; x < d; x += 1 / density * r.range(0.5, 1.5))
      A.bell(t + x, 1200 + r() * 2400, { vol: vol * r.range(0.4, 1), decay: 0.8, ratio: 2.01, index: 1.2, bus: 'sfx', rev: 0.6, pan: r.range(-0.7, 0.7) }); };
    /** 滑音（卡通跳跃 / 惊讶） */
    A.slide = (t, from = 300, to = 900, d = 0.25, { vol = 0.12, type = 'sine' } = {}) => { if (!ok(t)) return; const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + d); const g = envGain(t, 0.01, d, vol, 0.05); o.connect(g); out(g, 'sfx', 0.15); o.start(t); o.stop(t + d + 0.05); };
    /** 嘟—（笨拙 / 失落）*/
    A.womp = (t, { vol = 0.12 } = {}) => A.slide(t, 320, 120, 0.5, { vol, type: 'triangle' });
    /** 心跳 / 时钟滴答 */
    A.tick = (t, { vol = 0.08 } = {}) => A.click(t, { vol, pitch: 0.6 });
    /** 背景环境底噪（夜晚、太空、机房），d 秒 */
    A.ambience = (t, d, { vol = 0.03, cutoff = 600 } = {}) => { if (!ok(t)) return; const n = noise(t, d); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      const g = envGain(t, 1.5, d, vol, 1.5); n.connect(f); f.connect(g); out(g, 'sfx', 0.3); };
    // ---------- 拟音（Foley）与氛围
    A.footstep = (t, { vol = 0.12, surface = 'hard', pan = 0 } = {}) => { if (!ok(t)) return; const n = noise(t, 0.1); const f = ac.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = surface === 'soft' ? 400 : surface === 'wet' ? 1300 : 900; f.Q.value = 1.5; const g = perc(t, vol, surface === 'wet' ? 0.13 : 0.07); n.connect(f); f.connect(g); out(g, 'sfx', 0.1, pan);
      const o = ac.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.06); const g2 = perc(t, vol * 0.6, 0.07); o.connect(g2); out(g2, 'sfx', 0.05, pan); o.start(t); o.stop(t + 0.1); };
    /** 连续脚步：d 秒内每秒 rate 步（走 ≈ 2，跑 ≈ 3.2） */
    A.steps = (t, d = 1.5, { rate = 2, ...o } = {}) => { for (let x = 0, k = 0; x < d; x += 1 / rate, k++) A.footstep(t + x, { ...o, vol: (o.vol ?? 0.12) * (k % 2 ? 0.85 : 1), pan: k % 2 ? -0.1 : 0.1 }); };
    A.knock = (t, { n = 3, gap = 0.18, vol = 0.3 } = {}) => { for (let k = 0; k < n; k++) { const tt = t + k * gap; if (!ok(tt)) continue; const o = ac.createOscillator();
      o.frequency.setValueAtTime(180, tt); o.frequency.exponentialRampToValueAtTime(90, tt + 0.05); const g = perc(tt, vol, 0.09); o.connect(g); out(g, 'sfx', 0.2); o.start(tt); o.stop(tt + 0.12);
      const nn = noise(tt, 0.03); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; const g2 = perc(tt, vol * 0.4, 0.03); nn.connect(f); f.connect(g2); out(g2, 'sfx', 0.1); } };
    A.door = (t, { vol = 0.15, creak = true } = {}) => { if (!ok(t)) return; if (creak) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t);
      o.frequency.linearRampToValueAtTime(140, t + 0.35); o.frequency.linearRampToValueAtTime(70, t + 0.7); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 8;
      const g = envGain(t, 0.05, 0.75, vol * 0.6, 0.15); o.connect(f); f.connect(g); out(g, 'sfx', 0.3); o.start(t); o.stop(t + 0.8); } A.knock(t + (creak ? 0.75 : 0), { n: 1, vol: vol * 1.6 }); };
    A.heartbeat = (t, { n = 4, bpm = 70, vol = 0.4 } = {}) => { const p = 60 / bpm; for (let k = 0; k < n; k++) for (const [dt, v] of [[0, 1], [0.16, 0.7]]) { const tt = t + k * p + dt; if (!ok(tt)) continue;
      const o = ac.createOscillator(); o.frequency.setValueAtTime(70, tt); o.frequency.exponentialRampToValueAtTime(40, tt + 0.1); const g = perc(tt, vol * v, 0.16); o.connect(g); out(g, 'sfx', 0.05); o.start(tt); o.stop(tt + 0.2); } };
    A.rain = (t, d = 3, { vol = 0.06, heavy = 0.5 } = {}) => { if (!ok(t)) return; const n = noise(t, d); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500 + heavy * 1500; f.Q.value = 0.5;
      const g = envGain(t, Math.min(1, d / 3), d, vol, Math.min(1, d / 3)); n.connect(f); f.connect(g); out(g, 'sfx', 0.3); const r = MV.rng(Math.floor(t * 31));
      for (let x = 0; x < d; x += 0.06 + r() * 0.12) if (r() < 0.5 + heavy * 0.4) A.click(t + x, { vol: vol * r.range(0.3, 0.9), pitch: r.range(0.8, 2), pan: r.range(-0.8, 0.8) }); };
    A.wind = (t, d = 3, { vol = 0.07 } = {}) => { if (!ok(t)) return; const n = noise(t, d); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; const r = MV.rng(Math.floor(t * 13));
      f.frequency.setValueAtTime(400, t); for (let x = 0; x < d; x += 0.8) f.frequency.linearRampToValueAtTime(300 + r() * 900, t + x + 0.8);
      const g = envGain(t, Math.min(1.2, d / 3), d, vol, Math.min(1.2, d / 3)); n.connect(f); f.connect(g); out(g, 'sfx', 0.4); };
    A.thunder = (t, { vol = 0.5 } = {}) => { if (!ok(t)) return; const n = noise(t, 3); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 2.5); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
      g.gain.setValueAtTime(vol * 0.5, t + 0.4); g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 3); n.connect(f); f.connect(g); out(g, 'sfx', 0.6); A.boom(t, { vol: vol * 0.6 }); };
    /** 钟表滴答（嘀-嗒交替） */
    A.clock = (t, d = 2, { vol = 0.08, rate = 1 } = {}) => { for (let x = 0, k = 0; x < d; x += 1 / rate, k++) A.click(t + x, { vol, pitch: k % 2 ? 0.55 : 0.75 }); };
    A.shutter = (t, { vol = 0.25 } = {}) => { A.click(t, { vol, pitch: 1.8 }); A.click(t + 0.07, { vol: vol * 0.8, pitch: 1.2 }); if (!ok(t)) return; const n = noise(t, 0.1);
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000; const g = perc(t, vol * 0.3, 0.09); n.connect(f); f.connect(g); out(g, 'sfx', 0.1); };
    /** 水滴 */
    A.drop = (t, { vol = 0.2, pitch = 1 } = {}) => { if (!ok(t)) return; const o = ac.createOscillator(); o.frequency.setValueAtTime(600 * pitch, t); o.frequency.exponentialRampToValueAtTime(1600 * pitch, t + 0.08);
      const g = perc(t, vol, 0.15); o.connect(g); out(g, 'sfx', 0.5); o.start(t); o.stop(t + 0.2); };
    A.coin = (t, { vol = 0.1 } = {}) => { A.bell(t, 988, { vol, decay: 0.3, ratio: 1, index: 0.5, bus: 'sfx', rev: 0.2 }); A.bell(t + 0.08, 1319, { vol, decay: 0.8, ratio: 1, index: 0.5, bus: 'sfx', rev: 0.3 }); };
    A.glass = (t, { vol = 0.1 } = {}) => { A.bell(t, 2400, { vol, decay: 1.5, ratio: 2.76, index: 1.5, bus: 'sfx', rev: 0.5 }); A.bell(t + 0.01, 3200, { vol: vol * 0.6, decay: 1.2, ratio: 1.5, index: 1, bus: 'sfx', rev: 0.5 }); };
    /** 手机通知（双音） */
    A.notify = (t, { vol = 0.08 } = {}) => { A.blip(t, 'A5', { vol }); A.blip(t + 0.12, 'E6', { vol }); };
    /** 倒放镲片：从无到有涨上来，在 t+d 处结束——放在转场/爆发点之前 */
    A.swell = (t, d = 1.5, { vol = 0.15 } = {}) => { if (!ok(Math.max(0, t))) return; t = Math.max(0, t); const n = noise(t, d); const f = ac.createBiquadFilter(); f.type = 'highpass';
      f.frequency.setValueAtTime(8000, t); f.frequency.exponentialRampToValueAtTime(2500, t + d); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + d * 0.97); g.gain.linearRampToValueAtTime(0, t + d + 0.02); n.connect(f); f.connect(g); out(g, 'sfx', 0.5); };
    /** 低频下潜（震撼时刻的“嗡——”） */
    A.subdrop = (t, { vol = 0.5 } = {}) => { if (!ok(t)) return; const o = ac.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.6);
      const g = perc(t, vol, 1.8); o.connect(g); out(g, 'sfx', 0.1); o.start(t); o.stop(t + 1.9); };
    /** 数字故障 */
    A.glitch = (t, d = 0.4, { vol = 0.12 } = {}) => { const r = MV.rng(Math.floor(t * 101)); for (let x = 0; x < d; x += 0.02 + r() * 0.05) { const tt = t + x; if (!ok(tt)) continue;
      const o = ac.createOscillator(); o.type = r() < 0.5 ? 'square' : 'sawtooth'; o.frequency.value = r.range(80, 2400); const g = perc(tt, vol * r.range(0.4, 1), 0.03 + r() * 0.04);
      o.connect(g); out(g, 'sfx', 0.05, r.range(-0.6, 0.6)); o.start(tt); o.stop(tt + 0.08); } };
    A.zap = (t, { vol = 0.12 } = {}) => A.slide(t, 2200, 180, 0.22, { vol, type: 'sawtooth' });
    /** 魔法 / 灵感闪现 */
    A.magic = (t, { vol = 0.08 } = {}) => { A.sparkle(t, 1.2, { vol: vol * 0.7 }); [0, 4, 7, 11, 14].forEach((x, i) => A.bell(t + i * 0.06, MV.hz('C6') * Math.pow(2, x / 12), { vol, decay: 1.5, bus: 'sfx', rev: 0.6 })); };
    /** 掌声：d 秒，density 越大越热烈，自动渐强渐弱 */
    A.applause = (t, d = 4, { vol = 0.18, density = 40 } = {}) => { const r = MV.rng(Math.floor(t * 57)); const n = Math.floor(d * density);
      for (let k = 0; k < n; k++) { const x = r() * d, env = Math.sin(Math.PI * Math.min(1, x / d * 1.15)) ** 0.6; const tt = t + x; if (!ok(tt)) continue;
        const nn = noise(tt, 0.05); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = r.range(900, 2600); f.Q.value = 1.2;
        const g = perc(tt, vol * env * r.range(0.3, 1) * 0.5, 0.04); nn.connect(f); f.connect(g); out(g, 'sfx', 0.35, r.range(-0.9, 0.9)); } };
    /** 人群低语（观众席、街道、咖啡馆） */
    A.crowd = (t, d = 4, { vol = 0.04 } = {}) => { if (!ok(t)) return; const n = noise(t, d); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
      const f2 = ac.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 1100; f2.gain.value = 6; const g = envGain(t, Math.min(1, d / 3), d, vol, Math.min(1, d / 3));
      n.connect(f); f.connect(f2); f2.connect(g); out(g, 'sfx', 0.4); };
    /** 断弦 / 绷断（紧张时刻的“嘣”） */
    A.snap = (t, { vol = 0.3 } = {}) => { if (!ok(t)) return; A.slide(t, 1400, 90, 0.35, { vol: vol * 0.6, type: 'sawtooth' }); A.click(t, { vol, pitch: 2 }); A.boom(t, { vol: vol * 0.5 }); };
    /** 冲击帧专用：低频 + 镲片 + 下潜，一次到位 */
    A.hit = (t, { vol = 0.5 } = {}) => { A.boom(t, { vol }); A.crash(t, { vol: vol * 0.3, bus: 'sfx' }); A.subdrop(t, { vol: vol * 0.5 }); };
    return A;
  }

  // 把 {sfx:'名字', ...参数} 映射到各音效函数的真实签名
  function callSfx(A, t, name, o) {
    const dur = { whoosh: 0.6, riser: 1.5, sparkle: 1, typing: 1, ambience: 3, rain: 3, wind: 3, clock: 2, glitch: 0.4, swell: 1.5, steps: 1.5 };
    const note = { bell: 'A5', blip: 'E6', pluck: 'A4' };
    if (name in dur) return A[name](t, o.d ?? dur[name], o);
    if (name in note) return A[name](t, o.note ?? note[name], o);
    if (name === 'slide') return A.slide(t, o.from ?? 300, o.to ?? 900, o.d ?? 0.25, o);
    if (name === 'pad') return A.pad(t, o.d ?? 2, o.notes ?? MV.chord('Am', 3), o);
    if (name === 'bass') return A.bass(t, o.d ?? 0.5, o.note ?? 'A2', o);
    return A[name](t, o);
  }
  const audioFiles = {};
  /** 载入外部音频（相对 index.html 的路径）：MV.loadAudio('bgm', 'music.mp3')；在 MV.audio 里用 A.track('bgm') / A.sample(t, 'bgm') */
  MV.loadAudio = (key, url) => { audioFiles[key] = url; };
  const loadBuf = (url) => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer';
    x.onload = () => (x.status === 0 || x.status === 200 ? res(x.response) : rej(new Error('无法读取 ' + url))); x.onerror = () => rej(new Error('无法读取 ' + url)); x.send(); });
  async function renderAudio(sampleRate = 48000) {
    const len = Math.ceil(cfg.duration * sampleRate);
    const ac = new OfflineAudioContext(2, len, sampleRate); const A = makeSynth(ac, cfg.duration);
    A.buffers = {}; for (const [k, u] of Object.entries(audioFiles)) { try { A.buffers[k] = await ac.decodeAudioData(await loadBuf(u)); } catch (e) { console.error('[audio] ' + e.message); } }
    if (audioFn) await audioFn(A);
    for (const b of beats) { if (!b.sfx) continue;
      if (typeof b.sfx === 'function') b.sfx(A, b.t);
      else if (typeof b.sfx === 'string') { if (A[b.sfx]) callSfx(A, b.t, b.sfx, {}); }
      else if (A[b.sfx.sfx]) callSfx(A, b.t, b.sfx.sfx, b.sfx); }
    const buf = await ac.startRendering();
    // 头尾淡入淡出，防爆音
    const L = buf.getChannelData(0), R = buf.getChannelData(1), fadeN = Math.floor(sampleRate * 0.03);
    for (let i = 0; i < fadeN; i++) { const g = i / fadeN; L[i] *= g; R[i] *= g; L[len - 1 - i] *= g; R[len - 1 - i] *= g; }
    return buf;
  }
  function wavBytes(buf) {
    const n = buf.length, ch = 2, sr = buf.sampleRate, bytes = new Uint8Array(44 + n * ch * 2), v = new DataView(bytes.buffer);
    const W = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    W(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); W(8, 'WAVE'); W(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    W(36, 'data'); v.setUint32(40, n * ch * 2, true); const L = buf.getChannelData(0), R = buf.getChannelData(1); let o = 44;
    for (let i = 0; i < n; i++) { for (const x of [L[i], R[i]]) { v.setInt16(o, Math.max(-1, Math.min(1, x)) * 32767, true); o += 2; } }
    return bytes;
  }

  // ------------------------------------------------------------------ 预览 UI
  let ui = null, playing = false, playT0 = 0, wall0 = 0, actx = null, asrc = null, abuf = null;
  function fit() { const s = Math.min(innerWidth / cfg.width, (innerHeight - 44) / cfg.height);
    stage.style.transform = `translate(${(innerWidth - cfg.width * s) / 2}px,${(innerHeight - 44 - cfg.height * s) / 2}px) scale(${s})`; }
  function buildUI() {
    const bar = document.createElement('div'); bar.id = 'mv-ui';
    bar.innerHTML = `<button id=mv-play>▶</button><button id=mv-snd>🔈 声音</button><input id=mv-seek type=range min=0 step=0.001><span id=mv-time></span><span id=mv-scene style="color:#8c8"></span>`;
    document.body.appendChild(bar); const seek = bar.querySelector('#mv-seek'), time = bar.querySelector('#mv-time'), sc = bar.querySelector('#mv-scene');
    const snd = bar.querySelector('#mv-snd'); let sound = false;
    seek.max = cfg.duration; seek.oninput = () => { stop(); MV.seek(+seek.value); };
    const play = () => { if (curT >= cfg.duration - 0.05) curT = 0; playing = true; playT0 = curT; wall0 = performance.now();
      if (sound && abuf) { actx = actx || new AudioContext(); asrc = actx.createBufferSource(); asrc.buffer = abuf; asrc.connect(actx.destination); asrc.start(0, curT); }
      bar.querySelector('#mv-play').textContent = '❚❚'; loop(); };
    const stop = () => { playing = false; if (asrc) { try { asrc.stop(); } catch (e) {} asrc = null; } bar.querySelector('#mv-play').textContent = '▶'; };
    const loop = () => { if (!playing) return; const t = playT0 + (performance.now() - wall0) / 1000; // 仅预览用真实时间
      if (t >= cfg.duration) { renderFrame(cfg.duration - 1e-3); return stop(); } renderFrame(t); requestAnimationFrame(loop); };
    bar.querySelector('#mv-play').onclick = () => (playing ? stop() : play());
    snd.onclick = async () => { sound = !sound; snd.textContent = sound ? '🔊 渲染中…' : '🔈 声音'; if (sound && !abuf) abuf = await renderAudio(44100); snd.textContent = sound ? '🔊 声音' : '🔈 声音'; if (playing) { stop(); play(); } };
    addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
      if (e.code === 'ArrowRight') { stop(); MV.seek(Math.min(cfg.duration, curT + (e.shiftKey ? 5 : 1 / cfg.fps))); }
      if (e.code === 'ArrowLeft') { stop(); MV.seek(Math.max(0, curT - (e.shiftKey ? 5 : 1 / cfg.fps))); } });
    addEventListener('resize', fit);
    ui = { sync: (t) => { seek.value = t; time.textContent = `${t.toFixed(2)}s / ${cfg.duration}s  f${Math.round(t * cfg.fps)}`; sc.textContent = MV.sceneAt(t).join(' + '); } };
  }

  // ------------------------------------------------------------------ 渲染器接口（render.mjs 调用）
  MV.seek = (t) => renderFrame(clamp(t, 0, cfg.duration));
  let readyResolve; const ready = new Promise((r) => (readyResolve = r));
  window.__mv = {
    ready, config: () => ({ ...cfg, scenes: scenes.map(({ name, start, end }) => ({ name, start, end })), beats: beats.map(({ t, label }) => ({ t, label })), arc: arcPts, shots, seqs, tempo, hasVoice: false, actors: actorsReg.map((a) => ({ name: a.name, t0: a.T0, acts: a.timeline() })) }),
    seek: (t) => { MV.seek(t); return true; },
    hasAudio: () => !!audioFn,
    audio: async () => { const b = wavBytes(await renderAudio(48000)); window.__wav = b; return b.length; },
    audioChunk: (o, n) => { const s = window.__wav.subarray(o, o + n); let bin = ''; for (let i = 0; i < s.length; i += 0x8000) bin += String.fromCharCode.apply(null, s.subarray(i, i + 0x8000)); return btoa(bin); },
    errors: [],
  };
  addEventListener('error', (e) => window.__mv.errors.push(String(e.message)));

  /** 在所有 MV.scene 定义完之后调用：MV.start() */
  MV.start = async function () {
    build(); await document.fonts.ready; await Promise.all(assets);
    // 预热字体：让中文字体真正加载
    ctx.font = `20px ${MV.FONT.sans}`; ctx.fillText('预热', -100, -100);
    MV.seek(Q.has('t') ? +Q.get('t') : 0); readyResolve(true);
  };
  window.MV = MV;
})();

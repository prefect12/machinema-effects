#!/usr/bin/env node
/**
 * render.mjs — 把基于 mv.js 的 index.html 逐帧确定性渲染成 mp4（含合成音频）
 *
 * 用法：
 *   node render.mjs index.html                       # 完整渲染 → final.mp4
 *   node render.mjs index.html --sheet 24            # 均匀抽 24 帧拼成联系表 review/sheet.png（快速自检，强烈推荐）
 *   node render.mjs index.html --snap 3.2,10,15.5    # 指定时刻静帧 → review/snaps.png
 *   node render.mjs index.html --plan                # 导演检查：起承转合曲线、段落连续性、换页频率 + 每段 4 帧 review/seqs*.png
 *   node render.mjs index.html --review              # 审片包：--plan + 残影图 + 事件时间轴 + 角色运动自动诊断 + 审片表 review/critique.md
 *   node render.mjs index.html --beats               # 节拍密度检查 + 每个节拍前后对比图 review/beats*.png
 *   node render.mjs index.html --strip 20,23         # 20–23s 每 0.25s 一帧的连续条带（查“卡住”）
 *   node render.mjs index.html --snap 31 --full      # 额外输出 1920×1080 原尺寸 PNG（检查角色/文字细节、遮挡、瑕疵）
 * 项目目录里有 voice.wav（按 video-voiceover 流程准备并核对版本）时自动混入旁白并让音乐避让；--no-voice 关闭。
 *   node render.mjs index.html --from 10 --to 20 --out part.mp4   # 只渲染一段
 *   node render.mjs index.html --scale 0.5           # 半分辨率草稿（更快）
 * 选项：--out FILE  --workers N(默认 CPU/2，最多 6)  --no-audio  --crf 17  --audio-only
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', 'package.json'));
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const opt = { _: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const nx = argv[i + 1];
    if (nx === undefined || nx.startsWith('--')) opt[k] = true; else { opt[k] = nx; i++; } }
  else opt._.push(a);
}
const html = path.resolve(opt._[0] || 'index.html');
if (!fs.existsSync(html)) { console.error('找不到 ' + html); process.exit(1); }
const projDir = path.dirname(html);
const reviewDir = path.join(projDir, 'review');

function findChrome() {
  const c = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) for (const d of fs.readdirSync(cache).filter((d) => /^chromium-\d+/.test(d)).sort().reverse()) {
    c.push(path.join(cache, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'));
    c.push(path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    c.push(path.join(cache, d, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    c.push(path.join(cache, d, 'chrome-linux/chrome'));
  }
  return c.find((p) => p && fs.existsSync(p));
}

async function launch() {
  const executablePath = findChrome() || chromium.executablePath();
  return chromium.launch({ executablePath, headless: true,
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-web-security', '--allow-file-access-from-files',
      '--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--enable-unsafe-swiftshader'] });
}

async function openPage(browser, scale = 1) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await page.goto(pathToFileURL(html).href + '?render=1', { waitUntil: 'load' });
  const ok = await page.waitForFunction(() => window.__mv && window.__mv.ready, null, { timeout: 30000 }).catch(() => null);
  if (!ok) { console.error('页面没有调用 MV.start() 或加载失败：\n' + logs.join('\n')); process.exit(2); }
  await page.evaluate(() => window.__mv.ready);
  const cfg = await page.evaluate(() => window.__mv.config());
  await page.setViewportSize({ width: cfg.width, height: cfg.height });
  const cdp = await page.context().newCDPSession(page);
  // Pin logical viewport even at 1x: macOS Chrome can otherwise cap a 4K screenshot to the host window height.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: cfg.width, height: cfg.height, deviceScaleFactor: scale, mobile: false });
  return { page, cdp, cfg, logs };
}

async function shot(cdp, fmt = 'jpeg', quality = 95) {
  const r = await cdp.send('Page.captureScreenshot', { format: fmt, quality: fmt === 'jpeg' ? quality : undefined, optimizeForSpeed: true, captureBeyondViewport: false });
  return Buffer.from(r.data, 'base64');
}

async function seek(page, t) { await page.evaluate((t) => window.__mv.seek(t), t); }

function ffmpeg(args, input) {
  return new Promise((res, rej) => { const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))); p.on('error', rej); if (input) input(p.stdin); });
}

async function contactSheet(browser, files, caps, out, cfg, colsOpt) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const cols = colsOpt || (files.length <= 6 ? 3 : files.length <= 16 ? 4 : 6); const tw = 480, th = Math.round(tw * cfg.height / cfg.width);
  const cells = files.map((f, i) => `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${caps[i]}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;background:#222;font:14px ui-monospace,monospace;color:#ddd}
  main{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;padding:6px}figure{margin:0}img{width:${tw}px;height:${th}px;display:block}
  figcaption{padding:3px 2px}</style><main>${cells}</main>`);
  await page.waitForLoadState('load');
  await page.screenshot({ path: out, fullPage: true, type: 'png' }); await page.close();
}

async function stills(times, { out = null, labels = null, cols = null } = {}) {
  fs.mkdirSync(reviewDir, { recursive: true });
  const browser = await launch(); const { page, cdp, cfg, logs } = await openPage(browser);
  const files = [], caps = [];
  for (let i = 0; i < times.length; i++) { const tt = Math.max(0, Math.min(times[i], cfg.duration - 1 / cfg.fps)); await seek(page, tt);
    const f = path.join(reviewDir, `t_${tt.toFixed(2)}.jpg`); fs.writeFileSync(f, await shot(cdp, 'jpeg', 88)); files.push(f);
    if (opt.full) { const pf = path.join(reviewDir, `full_${tt.toFixed(2)}.png`); fs.writeFileSync(pf, await shot(cdp, 'png')); console.log('全分辨率：' + pf); }
    caps.push(labels ? labels[i] : `${tt.toFixed(2)}s · ` + (await page.evaluate((t) => window.MV.sceneAt(t).join('+'), tt))); }
  const sheets = []; const per = cols ? cols * 6 : 999;
  for (let k = 0; k * per < files.length; k++) {
    const name = out ? out.replace('.png', files.length > per ? `_${k + 1}.png` : '.png') : (opt.sheet ? 'sheet.png' : 'snaps.png');
    const sheet = path.join(reviewDir, name);
    await contactSheet(browser, files.slice(k * per, (k + 1) * per), caps.slice(k * per, (k + 1) * per), sheet, cfg, cols); sheets.push(sheet); }
  await browser.close();
  for (const f of files) fs.rmSync(f, { force: true });
  if (logs.length) console.log('⚠️ 页面报错/警告：\n' + [...new Set(logs)].slice(0, 20).join('\n'));
  console.log('联系表：\n  ' + sheets.join('\n  ') + '\n→ 请用看图工具逐张打开检查');
  return cfg;
}

async function audioOnly(page, out) {
  const has = await page.evaluate(() => window.__mv.hasAudio());
  if (!has) return null;
  const n = await page.evaluate(() => window.__mv.audio()); const parts = []; const CH = 3 << 20;
  for (let o = 0; o < n; o += CH) parts.push(Buffer.from(await page.evaluate(([o, c]) => window.__mv.audioChunk(o, c), [o, CH]), 'base64'));
  fs.writeFileSync(out, Buffer.concat(parts)); return out;
}

async function full() {
  const t0 = Date.now(); const scale = +(opt.scale || 1);
  const browser = await launch();
  const probe = await openPage(browser); const cfg = probe.cfg;
  const fps = +(opt.fps || cfg.fps); const from = +(opt.from || 0), to = Math.min(+(opt.to || cfg.duration), cfg.duration);
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps); const total = f1 - f0;
  const out = path.resolve(projDir, opt.out || 'final.mp4');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-'));
  // 音频
  let wav = null;
  if (!opt['no-audio']) { process.stdout.write('合成音频… '); wav = await audioOnly(probe.page, path.join(tmp, 'audio.wav')); console.log(wav ? 'OK' : '（页面未定义 MV.audio，无声）'); }
  if (opt['audio-only']) { const o = path.resolve(projDir, opt.out || 'audio.wav'); if (wav) fs.copyFileSync(wav, o); console.log(o); await browser.close(); return; }
  await probe.page.close();
  const W = Math.max(1, Math.min(+(opt.workers || Math.min(6, Math.floor(os.cpus().length / 2))), Math.ceil(total / 30)));
  console.log(`渲染 ${cfg.width}x${cfg.height}@${fps}fps  ${from}s→${to}s  共 ${total} 帧  ${W} 个并行 worker`);
  const per = Math.ceil(total / W); let done = 0; const allLogs = new Set();
  const segs = [];
  let lastPct = -1;
  const prog = setInterval(() => { const pct = Math.floor((done / total) * 10) * 10; if (pct === lastPct) return; lastPct = pct;
    const el = (Date.now() - t0) / 1000; console.log(`  ${pct}%  ${done}/${total} 帧  ${(done / el).toFixed(1)} fps  已用 ${el.toFixed(0)}s`); }, 1000);
  await Promise.all(Array.from({ length: W }, async (_, w) => {
    const a = f0 + w * per, b = Math.min(f1, a + per); if (a >= b) return;
    const { page, cdp, logs } = await openPage(browser, scale); const seg = path.join(tmp, `seg${String(w).padStart(2, '0')}.mp4`); segs[w] = seg;
    await ffmpeg(['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium',
      '-crf', String(opt.crf || 17), '-pix_fmt', 'yuv420p', '-r', String(fps), seg], async (stdin) => {
      for (let f = a; f < b; f++) { await seek(page, f / fps); const buf = await shot(cdp);
        if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r)); done++; }
      stdin.end(); });
    logs.forEach((l) => allLogs.add(l)); await page.close();
  }));
  clearInterval(prog); console.log();
  await browser.close();
  const list = path.join(tmp, 'list.txt'); fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  const video = path.join(tmp, 'video.mp4'); await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
  const voice = path.join(projDir, 'voice.wav');
  if (wav && fs.existsSync(voice) && !opt['no-voice']) {
    console.log('混入旁白 voice.wav（音乐与音效自动避让人声）');
    await ffmpeg(['-y', '-i', video, '-ss', String(from), '-t', String(to - from), '-i', wav, '-ss', String(from), '-t', String(to - from), '-i', voice,
      '-filter_complex', '[2:a]aformat=channel_layouts=stereo,aresample=48000,asplit=2[v1][v2];[1:a][v1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=400[duck];[duck][v2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  } else if (wav) await ffmpeg(['-y', '-i', video, '-ss', String(from), '-t', String(to - from), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  else await ffmpeg(['-y', '-i', video, '-c', 'copy', '-movflags', '+faststart', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (allLogs.size) console.log('⚠️ 页面报错/警告：\n' + [...allLogs].slice(0, 20).join('\n'));
  console.log(`✅ ${out}  （${((Date.now() - t0) / 1000).toFixed(0)}s）`);
}

async function probeCfg() { const b = await launch(); const { cfg } = await openPage(b); await b.close(); return cfg; }


// ---------------------------------------------------------------- 导演检查：情绪曲线 / 镜头表 / 卡点
const SIZE_ZH = { wide: '远景', full: '全景', medium: '中景', close: '近景特写', extreme: '大特写', insert: '插入特写', pov: '主观', aerial: '航拍' };
function tensionAt(arc, t) { if (!arc.length) return 0.5; if (t <= arc[0].at) return arc[0].tension / 10;
  for (let i = 1; i < arc.length; i++) if (t <= arc[i].at) { const a = arc[i - 1], b = arc[i]; const p = Math.min(1, Math.max(0, (t - a.at) / Math.max(0.01, b.at - a.at)));
    return (a.tension + (b.tension - a.tension) * (-(Math.cos(Math.PI * p) - 1) / 2)) / 10; }
  return arc[arc.length - 1].tension / 10; }
async function planReport() {
  const cfg = await probeCfg(); const D = cfg.duration, arc = cfg.arc || [], tempo = cfg.tempo || {};
  const shots = [...(cfg.shots || [])].sort((a, b) => a.t - b.t); const bad = [], warn = [];
  console.log(`\n🎬 导演检查  时长 ${D}s`);
  // 1) 情绪曲线
  if (!arc.length) bad.push('没有 MV.arc 情绪曲线——先设计起承转合，再写画面');
  else {
    const bars = '▁▂▃▄▅▆▇█'; let line = '';
    for (let i = 0; i < 64; i++) line += bars[Math.min(7, Math.floor(tensionAt(arc, (i / 63) * D) * 7.99))];
    console.log('情绪曲线 ' + line); console.log('         ' + arc.map((p) => `${p.name}@${(+p.at).toFixed(1)}s(${p.tension})`).join(' → '));
    const peak = arc.reduce((m, p) => (p.tension > m.tension ? p : m), arc[0]); const pos = peak.at / D;
    if (pos < 0.5 || pos > 0.9) bad.push(`高潮「${peak.name}」在 ${Math.round(pos * 100)}% 处，应在 55–90% 之间`);
    let hasDip = false; for (let i = 1; i < arc.length - 1; i++) { const before = Math.max(...arc.slice(0, i).map((p) => p.tension)); const after = Math.max(...arc.slice(i + 1).map((p) => p.tension));
      if (before - arc[i].tension >= 3 && after - arc[i].tension >= 3) hasDip = true; }
    if (!hasDip) warn.push('曲线没有“低谷”（先升 → 跌落 ≥3 → 再升到高潮）。故事片几乎一定需要一个低谷；纪录片可以用“危机/转折”代替');
    const last = arc[arc.length - 1]; if (peak.tension - last.tension < 3) warn.push('结尾没有明显回落，缺少“合”的收束感');
    if (arc[0].tension > 5) warn.push('开场张力过高，后面没有上升空间');
    if (peak.tension < 8) warn.push(`最高张力只有 ${peak.tension}，高潮不够“高”`);
    if (!arc.some((p) => p.hit)) warn.push('没有 hit 点：在高潮处设 {hit:true}，配乐会自动“静默一拍 → 爆发”');
  }
  // 2) 段落与连续性（动画 ≠ 一页一页换画面）
  const CONT = new Set(['camera', 'transform', 'morph', 'match', 'zoom']);
  const seqs = [...(cfg.seqs || [])].sort((a, b) => a.t0 - b.t0); const beatsAll = [...(cfg.beats || [])].map((x) => x.t).sort((a, b) => a - b);
  if (!seqs.length) bad.push('没有 MV.seq 段落——先把全片分成 3–7 段“连续的戏”，每段写清楚：在哪个空间、什么东西在累积升级、怎么变成下一段');
  else {
    console.log(`\n段落 ${seqs.length} 个，平均 ${(D / seqs.length).toFixed(1)}s/段`);
    seqs.forEach((q, i) => { const len = q.t1 - q.t0, nb = beatsAll.filter((t) => t >= q.t0 && t < q.t1).length;
      console.log(`  §${i + 1} ${q.t0.toFixed(1).padStart(5)}–${q.t1.toFixed(1).padEnd(5)} ${len.toFixed(1).padStart(4)}s  ${(q.name || '').padEnd(8)} 地点:${q.place || '?'}  节拍${nb}  →${q.exit || '?'}\n       累积：${q.grows || '（未写）'}`);
      if (len < 6) warn.push(`§${i + 1}「${q.name}」只有 ${len.toFixed(1)}s——太碎。一段戏至少 8 秒，让同一批东西在里面长大、变化`);
      if (len > 24) warn.push(`§${i + 1}「${q.name}」长达 ${len.toFixed(0)}s——中间要有明显的升级（数量翻倍、镜头推近、局面失控），或拆成两段`);
      if (!q.grows) warn.push(`§${i + 1} 没写 grows（这段里什么在累积升级？）`);
      if (nb < len / 1.8) warn.push(`§${i + 1} 只有 ${nb} 个节拍，段内变化太少（至少每 1.6s 一个）`); });
    if (D >= 30 && seqs.length < 3) bad.push(`只有 ${seqs.length} 个段落——${D}s 的片子需要 3–7 段戏（起/承/转/高潮/合），每段一个空间、一条升级链`);
    if (D / seqs.length < 8) bad.push(`段落太碎：平均 ${(D / seqs.length).toFixed(1)}s 一段。动画是“同一个世界在连续变化”，平均应 10–15s 一段`);
    const lens = seqs.map((q) => q.t1 - q.t0), mean = lens.reduce((a, b) => a + b, 0) / lens.length, sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    if (seqs.length >= 3 && sd < 1.2) warn.push(`段落长度几乎一样（${lens.map((x) => x.toFixed(0)).join('/')}s）——这是机械均分。长短要跟着故事走：铺垫可长、转折可短、高潮饱满、结尾收得干净`);
    const places = new Set(seqs.map((q) => (q.place || '').trim()).filter(Boolean));
    if (seqs.length >= 3 && places.size <= 1) bad.push(`全片 ${seqs.length} 段都在同一个空间「${[...places][0] || '?'}」——段内要连续，但每段应进入一个新空间（可以是想象的：钻进代码里、依赖仓库、日志的海、记忆里），段与段靠“生长/穿越”连起来`);
    else if (seqs.length >= 4 && places.size < Math.ceil(seqs.length / 2)) warn.push(`只有 ${places.size} 个空间用于 ${seqs.length} 段——多进入几个新空间，片子才有“旅程感”和奇观`);
    const exits = seqs.slice(0, -1).map((q) => q.exit || 'cut'); const cont = exits.filter((e) => CONT.has(e)).length;
    if (exits.length && cont / exits.length < 0.5) bad.push(`段落之间只有 ${cont}/${exits.length} 是连续过渡——至少一半要用 transform（本段的东西长成下一段）/ camera（镜头穿过去）/ morph / match`);
  }
  // 换页频率：所有“非连续”的切换（段落出口 + 段内机位切换）
  const pageTurns = shots.filter((x, i) => i > 0 && !CONT.has(x.trans || 'cut')).length + (shots.length ? 0 : seqs.slice(0, -1).filter((q) => !CONT.has(q.exit || 'cut')).length);
  const every = D / Math.max(1, pageTurns);
  console.log(`\n“换页”（整幅画面被替换）${pageTurns} 次，平均 ${every.toFixed(1)}s 一次（你的参考片约 12s 一次）`);
  if (every < 8) bad.push(`换页太频繁：平均 ${every.toFixed(1)}s 换一幅画——这就是 PPT 感。把相邻的画面合并成同一空间里的连续变化，用镜头运动（trans:'camera'）代替切换`);
  if (shots.length) { const L = shots.map((x, i) => ({ ...x, len: (shots[i + 1] ? shots[i + 1].t : D) - x.t }));
    const sizes = new Set(L.map((x) => x.size)); if (sizes.size < 3) warn.push(`景别只有 ${[...sizes].join('/')}——用镜头推拉在同一场景里得到远/中/特写`);
    if (!L.some((x) => ['close', 'extreme'].includes(x.size))) warn.push('没有近景/特写：情绪时刻要把镜头推到脸上（连续推近，不是切过去）'); }
  // 张力高的地方，靠“画面内变化更密”加速，而不是切得更快
  if (arc.length && beatsAll.length > 6) { const dens = (lo, hi) => { let n = 0, T = 0; for (let t = 0; t < D; t += 0.5) { const te = tensionAt(arc, t); if (te >= lo && te < hi) { T += 0.5; n += beatsAll.filter((b) => b >= t && b < t + 0.5).length; } } return T ? n / T : 0; };
    const hiD = dens(0.7, 1.01), loD = dens(0, 0.4); console.log(`节拍密度：高张力段 ${hiD.toFixed(2)}/s，低张力段 ${loD.toFixed(2)}/s（高张力应明显更密）`);
    if (loD && hiD < loD * 1.2) warn.push('高潮段的节拍密度没有明显高于平静段——高潮要让画面里的事情发生得更快、更多'); }
  if (!tempo.bpm) warn.push('没有设置 MV.tempo(bpm)：关键动作无法卡在音乐拍子上');
  // 每段 4 帧：一眼看出“同一空间在升级”还是“一页页换画面”
  if (seqs.length) { const times = [], labels = [];
    seqs.forEach((q, i) => [0.08, 0.36, 0.64, 0.92].forEach((f, k) => { times.push(+(q.t0 + (q.t1 - q.t0) * f).toFixed(2)); labels.push(`§${i + 1} ${q.name || ''} · ${k + 1}/4`); }));
    await stills(times, { out: 'seqs.png', labels, cols: 4 });
    console.log('↑ 每行是一个段落的 4 个时刻。检查：同一行的 4 帧应该是“同一个空间里东西越来越多/越来越失控/镜头越推越近”，而不是 4 张不同的画。'); }
  console.log(bad.length ? '\n❌ 必须修改：\n - ' + bad.join('\n - ') : '\n✅ 结构检查通过');
  if (warn.length) console.log('\n⚠️ 建议改进：\n - ' + warn.join('\n - '));
}

// ---------------------------------------------------------------- 审片包：把“运动”变成看得见的图，供自我判断
async function captureFrames(times, prefix) {
  fs.mkdirSync(reviewDir, { recursive: true });
  const browser = await launch(); const { page, cdp, cfg } = await openPage(browser); const files = [];
  for (let i = 0; i < times.length; i++) { const tt = Math.max(0, Math.min(times[i], cfg.duration - 1 / cfg.fps)); await seek(page, tt);
    const f = path.join(reviewDir, `${prefix}_${i}.jpg`); fs.writeFileSync(f, await shot(cdp, 'jpeg', 80)); files.push(f); }
  await browser.close(); return files;
}
async function composeInPage(width, height, script, data, out) {
  const browser = await launch(); const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<canvas id=c width=${width} height=${height}></canvas><style>body{margin:0;background:#111}</style>`);
  await page.evaluate(script, data); await page.locator('#c').screenshot({ path: out }); await browser.close(); }
async function reviewReport() {
  const cfg = await probeCfg(); const D = cfg.duration, seqs = [...(cfg.seqs || [])].sort((a, b) => a.t0 - b.t0), beats = [...(cfg.beats || [])].sort((a, b) => a.t - b.t);
  const actors = cfg.actors || []; const notes = [];
  console.log('\n🎞  审片包（把运动画成图，用来判断“动得对不对”）');
  // 1) 残影图：每段按 0.25s 采样叠加 —— 背景清晰、移动的东西留下残影轨迹
  const segs = seqs.length ? seqs : [{ t0: 0, t1: D, name: '全片' }];
  const trailImgs = [];
  for (let i = 0; i < segs.length; i++) { const q = segs[i]; const n = Math.min(48, Math.max(8, Math.round((q.t1 - q.t0) / 0.25)));
    const times = Array.from({ length: n }, (_, k) => q.t0 + ((k + 0.5) / n) * (q.t1 - q.t0)); const files = await captureFrames(times, `trail${i}`);
    const out = path.join(reviewDir, `trail_${i + 1}.png`);
    await composeInPage(960, 540, async ({ imgs, label }) => { const c = document.getElementById('c'), g = c.getContext('2d');
      const load = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = src; });
      const ims = await Promise.all(imgs.map(load)); ims.forEach((im, k) => { g.globalAlpha = 1 / (k + 1); g.drawImage(im, 0, 0, 960, 540); });
      g.globalAlpha = 0.35; g.drawImage(ims[ims.length - 1], 0, 0, 960, 540); g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, 960, 34); g.fillStyle = '#fff'; g.font = '18px sans-serif'; g.fillText(label, 10, 23); },
      { imgs: files.map((f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64')), label: `§${i + 1} ${q.name || ''} ${q.t0.toFixed(1)}–${q.t1.toFixed(1)}s 残影（移动的东西留下轨迹）` }, out);
    files.forEach((f) => fs.rmSync(f, { force: true })); trailImgs.push(out); }
  // 2) 事件时间轴：情绪曲线 / 段落 / 角色位置曲线与动作 / 节拍，同一条时间轴
  const W = 1800, rowH = 90, Hh = 200 + actors.length * rowH + 120;
  const acts = actors.map((a) => ({ name: a.name, list: a.acts.map((x) => ({ ...x, g0: a.t0 + x.t0, g1: a.t0 + x.t0 + x.dur })) }));
  await composeInPage(W, Hh, ({ D, arc, seqs, beats, acts, W, rowH }) => { const c = document.getElementById('c'), g = c.getContext('2d'); const L = 150, R = W - 20, X = (t) => L + (t / D) * (R - L);
    g.fillStyle = '#16181d'; g.fillRect(0, 0, W, c.height); g.font = '14px sans-serif';
    for (let t = 0; t <= D; t += 5) { g.fillStyle = '#333'; g.fillRect(X(t), 0, 1, c.height); g.fillStyle = '#888'; g.fillText(t + 's', X(t) + 3, 14); }
    // 情绪曲线
    g.fillStyle = '#aaa'; g.fillText('情绪', 10, 70); g.strokeStyle = '#f2c46d'; g.lineWidth = 2; g.beginPath();
    const tens = (t) => { if (!arc.length) return 0.5; if (t <= arc[0].at) return arc[0].tension / 10; for (let i = 1; i < arc.length; i++) if (t <= arc[i].at) { const a = arc[i - 1], b = arc[i], p = (t - a.at) / Math.max(.01, b.at - a.at); return (a.tension + (b.tension - a.tension) * p) / 10; } return arc[arc.length - 1].tension / 10; };
    for (let t = 0; t <= D; t += D / 400) { const y = 110 - tens(t) * 80; t ? g.lineTo(X(t), y) : g.moveTo(X(t), y); } g.stroke();
    // 段落
    seqs.forEach((q, i) => { g.fillStyle = i % 2 ? '#2a3140' : '#243a33'; g.fillRect(X(q.t0), 120, X(q.t1) - X(q.t0), 26); g.fillStyle = '#ddd'; g.fillText(`§${i + 1} ${q.name || ''}`, X(q.t0) + 4, 138); });
    g.fillStyle = '#aaa'; g.fillText('段落', 10, 138);
    // 角色：位置曲线（上下=左右位置）+ 动作条
    acts.forEach((a, k) => { const y0 = 160 + k * rowH; g.fillStyle = '#aaa'; g.fillText(a.name, 10, y0 + 40);
      const xs = a.list.flatMap((x) => [x.x0, x.x1]); const mn = Math.min(...xs), mx = Math.max(...xs) || mn + 1; const Y = (v) => y0 + 70 - ((v - mn) / Math.max(1, mx - mn)) * 60;
      a.list.forEach((x) => { const col = x.type === 'wait' ? '#3b3f48' : x.type === 'look' ? '#6b5b95' : x.type === 'hop' ? '#e2725b' : x.type === 'glide' ? '#5b8cff' : '#6fbf8e';
        g.fillStyle = col; g.fillRect(X(x.g0), y0 + 74, Math.max(2, X(x.g1) - X(x.g0) - 1), 10);
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(x.g0), Y(x.x0)); g.lineTo(X(x.g1), Y(x.x1)); g.stroke();
        if (x.type !== 'wait' && x.type !== 'look') { g.fillStyle = '#ccc'; g.font = '11px sans-serif'; g.fillText(x.label, X(x.g0), y0 + 96); g.font = '14px sans-serif'; } }); });
    // 节拍
    const yb = 160 + acts.length * rowH + 20; g.fillStyle = '#aaa'; g.fillText('节拍', 10, yb + 20);
    beats.forEach((b) => { g.fillStyle = '#35e0c2'; g.fillRect(X(b.t) - 1, yb, 3, 30); });
    g.fillStyle = '#777'; g.fillText('角色行：白线=左右位置随时间（台阶=有目的：移动→停住→移动；锯齿=来回晃）  色条：灰=停 紫=看 绿=走跑 橙=跳 蓝=滑行', L, c.height - 12);
  }, { D, arc: cfg.arc || [], seqs, beats, acts, W, rowH }, path.join(reviewDir, 'timeline.png'));
  // 2b) 路径图：角色在世界里走过的路线（不受镜头影响）。点 = 每 0.2s 的位置；点越稀越快；大圆 = 停留（越大停越久）
  if (acts.length) await composeInPage(1600, 420 * acts.length, ({ acts }) => { const c = document.getElementById('c'), g = c.getContext('2d'); g.fillStyle = '#16181d'; g.fillRect(0, 0, c.width, c.height);
    acts.forEach((a, k) => { const top = k * 420, pts = []; a.list.forEach((x) => { const n = Math.max(1, Math.round(x.dur / 0.2)); for (let i = 0; i <= n; i++) { const p = i / n;
        pts.push({ x: x.x0 + (x.x1 - x.x0) * p, y: x.y0 + (x.y1 - x.y0) * p - (x.type === 'hop' ? Math.sin(Math.PI * p) * 60 : 0), t: x.g0 + x.dur * p, type: x.type }); } });
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y); const mnx = Math.min(...xs), mxx = Math.max(...xs), mny = Math.min(...ys), mxy = Math.max(...ys);
      const sc = Math.min(1500 / Math.max(1, mxx - mnx), 300 / Math.max(1, mxy - mny), 1.5); const X = (v) => 50 + (v - mnx) * sc, Y = (v) => top + 60 + (v - mny) * sc;
      g.fillStyle = '#ddd'; g.font = '18px sans-serif'; g.fillText(`${a.name} 的路径（世界坐标；颜色从蓝到橙 = 时间先后）`, 20, top + 30);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y)))); g.stroke();
      const T = pts[pts.length - 1].t || 1; pts.forEach((q) => { const h = 220 - (q.t / T) * 200; g.fillStyle = `hsl(${h},80%,60%)`; g.beginPath(); g.arc(X(q.x), Y(q.y), 3, 0, 7); g.fill(); });
      a.list.forEach((x) => { if (x.type === 'wait' && x.dur > 0.25) { g.strokeStyle = 'rgba(255,220,120,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(X(x.x0), Y(x.y0), 6 + x.dur * 5, 0, 7); g.stroke();
          g.fillStyle = '#ffdc78'; g.font = '12px sans-serif'; g.fillText(`${x.dur.toFixed(1)}s ${x.label}`, X(x.x0) + 8, Y(x.y0) - 10 - x.dur * 5); }
        if (x.type !== 'wait' && x.type !== 'look') { g.fillStyle = '#9fe6c0'; g.font = '12px sans-serif'; g.fillText(`→ ${x.label}`, X(x.x1) + 6, Y(x.y1) + 18); } }); });
  }, { acts }, path.join(reviewDir, 'paths.png'));
  // 3) 自动诊断
  const GENERIC = new Set(['walk', 'run', 'hop', 'move', 'go', 'jump', 'idle', 'act', 'look', '走', '跑', '跳', '移动']);
  acts.forEach((a) => { const moves = a.list.filter((x) => ['move', 'hop', 'glide'].includes(x.type) && Math.abs(x.x1 - x.x0) > 20);
    const generic = moves.filter((x) => GENERIC.has(String(x.label).toLowerCase())); if (generic.length) notes.push(`「${a.name}」有 ${generic.length} 次移动只写了空标签（${[...new Set(generic.map((x) => x.label))].join('/')}）——每次移动的 label 要写成“为什么”：扑向 bug、去开门、躲到箱子后`);
    let rev = 0; for (let i = 1; i < moves.length; i++) { const d0 = Math.sign(moves[i - 1].x1 - moves[i - 1].x0), d1 = Math.sign(moves[i].x1 - moves[i].x0); if (d0 && d1 && d0 !== d1 && moves[i].g0 - moves[i - 1].g1 < 3) rev++; }
    if (moves.length >= 4 && rev / (moves.length - 1) > 0.5) notes.push(`「${a.name}」移动方向频繁折返（${rev}/${moves.length - 1} 次掉头）——看 timeline.png 里是不是锯齿；折返必须有剧情理由（被吓退、追的东西换了方向），否则就是在乱晃`);
    const holds = a.list.filter((x) => x.type === 'wait' && x.dur > 2.5); if (holds.length) notes.push(`「${a.name}」有 ${holds.length} 次停顿超过 2.5s（${holds.map((x) => x.g0.toFixed(1) + 's').join(', ')}）——停顿时画面里要有别的事发生，或者缩短`); });
  if (acts.length) { const keyT = acts.flatMap((a) => a.list.filter((x) => x.type !== 'wait').flatMap((x) => [x.g0, x.g1]));
    const spans = acts.map((a) => [a.list[0]?.g0 ?? 0, a.list[a.list.length - 1]?.g1 ?? 0]); const inSpan = beats.filter((b) => spans.some(([s0, s1]) => b.t >= s0 && b.t <= s1));
    const linked = inSpan.filter((b) => keyT.some((k) => Math.abs(k - b.t) < 0.2)).length; const pct = inSpan.length ? linked / inSpan.length : 1;
    console.log(`角色出场期间的节拍与角色动作对齐：${linked}/${inSpan.length}（${(pct * 100).toFixed(0)}%）`);
    if (pct < 0.3) notes.push(`只有 ${(pct * 100).toFixed(0)}% 的节拍落在角色动作的开始/到达时刻——声音和事件应该由动作触发（BOT.end），而不是另排时间表`); }
  else notes.push('没有用 MV.actor 登记任何角色：有角色的片子，角色位移一律用 MV.actor 编排（审片图才能分析它的运动）');
  // 4) 审片表
  const tpl = fs.readFileSync(path.join(HERE, '../references/critique.md'), 'utf8');
  fs.writeFileSync(path.join(reviewDir, 'critique.md'), `# 审片记录（逐项填写，附图作证）\n\n自动诊断：\n${notes.length ? notes.map((x) => '- ' + x).join('\n') : '- 无'}\n\n审片图：timeline.png、paths.png、${trailImgs.map((f) => path.basename(f)).join('、')}、seqs.png（--plan 生成）\n\n` + tpl.split('<!-- 模板开始 -->')[1]);
  console.log('残影图：\n  ' + trailImgs.join('\n  ')); console.log('时间轴：' + path.join(reviewDir, 'timeline.png')); if (acts.length) console.log('路径图：' + path.join(reviewDir, 'paths.png'));
  console.log(notes.length ? '\n⚠️ 自动诊断：\n - ' + notes.join('\n - ') : '\n✅ 自动诊断未发现角色运动问题');
  console.log(`\n→ 现在请逐张打开这些图，按 ${path.join(reviewDir, 'critique.md')} 的问题逐条作答并打分；任何一项 < 4 分都要修改后重新 --review。`);
}

async function beatsReport() {
  const cfg = await probeCfg(); const beats = [...(cfg.beats || [])].sort((a, b) => a.t - b.t);
  if (!beats.length) { console.log('❌ 没有登记任何节拍。请用 MV.beat(t, "发生了什么", "音效") 登记每一个画面变化。'); process.exit(3); }
  const pts = [0, ...beats.map((b) => b.t), cfg.duration]; const gaps = [];
  for (let i = 1; i < pts.length; i++) { const last = i === pts.length - 1; // 片尾淡出允许 2.5s
    if (pts[i] - pts[i - 1] > (last ? 2.5 : 1.6)) gaps.push([pts[i - 1], pts[i]]); }
  console.log(`节拍 ${beats.length} 个，平均间隔 ${(cfg.duration / beats.length).toFixed(2)}s`);
  beats.forEach((b) => console.log(`  ${b.t.toFixed(2).padStart(6)}s  ${b.label}`));
  { const iv = []; for (let i = 1; i < beats.length; i++) { const d = beats[i].t - beats[i - 1].t; if (d > 0.05) iv.push(d); }
    const m = iv.reduce((a, b) => a + b, 0) / Math.max(1, iv.length), sd = Math.sqrt(iv.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, iv.length));
    const round = beats.filter((b) => Math.abs(b.t * 10 - Math.round(b.t * 10)) < 1e-6).length / beats.length;
    if (iv.length > 8 && sd / m < 0.28) console.log(`\n⚠️ 节拍间隔几乎等距（平均 ${m.toFixed(2)}s，波动只有 ${(sd / m * 100).toFixed(0)}%）——像是按时间表排出来凑数的，而不是来自画面里的真实动作。\n   节拍时间应该从动作推出来：角色到达/落地/碰撞的时刻（MV.actor 的 .end）、物体出现的时刻，然后声音和其他物体的反应都挂在这个时刻上。`); }
  if (gaps.length) { console.log('\n❌ 以下区间超过 1.6s 没有节拍（观众会觉得“卡住了”），必须补充新的画面事件：');
    gaps.forEach(([a, b]) => console.log(`  ${a.toFixed(2)}s → ${b.toFixed(2)}s（${(b - a).toFixed(1)}s）`)); }
  else console.log('\n✅ 节拍密度合格');
  const times = [], labels = [];
  for (const b of beats) { times.push(b.t - 0.2, b.t + 0.3, b.t + 0.8); labels.push(`${b.t.toFixed(2)}s 前 · ${b.label}`, `+0.3s`, `+0.8s`); }
  await stills(times, { out: 'beats.png', labels, cols: 6 });
  console.log('↑ 每 3 格一组：节拍前 / +0.3s / +0.8s。若一组三格看起来几乎一样，这个节拍就是假的——让变化更大、更明显（位置/大小/姿势/构图级别的变化）。');
}

(async () => {
  if (opt.review) { await planReport(); await reviewReport(); }
  else if (opt.plan) await planReport();
  else if (opt.beats) await beatsReport();
  else if (opt.strip) { const [a, b, st] = String(opt.strip).split(',').map(Number); const step = st || 0.25; const ts = [];
    for (let t = a; t <= b + 1e-6; t += step) ts.push(+t.toFixed(3)); await stills(ts, { out: `strip_${a}-${b}.png`, cols: 4 }); }
  else if (opt.snap) await stills(String(opt.snap).split(',').map(Number));
  else if (opt.sheet) {
    const cfg = await probeCfg();
    const n = +opt.sheet === 1 || opt.sheet === true ? 24 : +opt.sheet; const d = cfg.duration;
    await stills(Array.from({ length: n }, (_, i) => +(((i + 0.5) / n) * d).toFixed(2)));
  } else await full();
})().catch((e) => { console.error(e); process.exit(1); });

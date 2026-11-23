'use strict';
/* 산행지도 — 산행 기록 · GPX 고도 그래프 · 경로 이탈 경고 · 나침반 · 날씨
   (yskimss/trekker(Apache-2.0)의 기능 구성을 참고해 웹앱용으로 새로 작성. app.js 다음에 읽힌다)
   app.js 전역: map, db, $, openSheet, closeSheet, head, esc, fmtKm, showInfo, alertSheet, SyncCore, saveData,
               drawTracks, trackStats, isHidden, ICON, meMarker, watchId */
Object.assign(ICON, {
  steps: S('<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>'),
  chart: S('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 11.207a.5.5 0 0 1 .146-.353l2-2a.5.5 0 0 1 .708 0l3.292 3.292a.5.5 0 0 0 .708 0l4.292-4.292a.5.5 0 0 1 .854.353V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/>'),
  w_sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
  w_part: S('<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  w_cloud: S('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  w_fog: S('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/>'),
  w_drizzle: S('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 19v1"/><path d="M8 14v1"/><path d="M16 19v1"/><path d="M16 14v1"/><path d="M12 21v1"/><path d="M12 16v1"/>'),
  w_rain: S('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>'),
  w_snow: S('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/>'),
  w_storm: S('<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>'),
});

/* ---------- 공통 ---------- */
const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const dirName = deg => DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const pad2 = n => String(n).padStart(2, '0');
const hhmm = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600); return h ? `${h}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}` : `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };
const dist2 = (a, b) => map.distance([a[0], a[1]], [b[0], b[1]]);
/* 한 점에서 선(점 목록)까지 가장 가까운 거리(m)와 그 위치(앞 점 번호 + 비율) */
function nearestOnLine(lat, lng, coords){
  const k = Math.cos(lat * Math.PI / 180) * 111320, K = 110540;
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 1; i < coords.length; i++) {
    const ax = (coords[i-1][1] - lng) * k, ay = (coords[i-1][0] - lat) * K, bx = (coords[i][1] - lng) * k, by = (coords[i][0] - lat) * K;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy, d = Math.sqrt(x * x + y * y);
    if (d < best) { best = d; bi = i - 1; bt = t; }
  }
  if (coords.length === 1) best = map.distance([lat, lng], [coords[0][0], coords[0][1]]);
  return { d:best, i:bi, t:bt };
}
/* 소리(웹 오디오). 아이폰은 사용자가 버튼을 누를 때 한 번 깨워 둬야 난다 */
let actx = null;
function wakeAudio(){ try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch(e){} }
function beep(freqs){
  if (!actx) return;
  try {
    let t = actx.currentTime;
    freqs.forEach(f => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.3); t += 0.33; });
  } catch(e){}
  if (navigator.vibrate) try { navigator.vibrate([300, 120, 300]); } catch(e){}
}

/* ---------- 아래쪽 판(도크): 고도 그래프 · 기록판 · 안내 띠를 위아래로 쌓는다 ---------- */
const dock = document.createElement('div'); dock.id = 'dock'; document.body.appendChild(dock);
const elevBox = document.createElement('div'); elevBox.id = 'elev'; elevBox.className = 'panel'; dock.appendChild(elevBox);
const recBox = document.createElement('div'); recBox.id = 'rec'; recBox.className = 'panel'; dock.appendChild(recBox);
dock.appendChild($('info'));
/* 오른쪽 버튼 줄이 아래쪽 판에 가리지 않도록, 남는 높이만큼만 쓰고 넘치면 왼쪽으로 한 줄 더 */
function fitTools(){
  const tools = $('tools'), top = tools.getBoundingClientRect().top;
  // 아래쪽 판은 버튼이 두 줄(한 줄 4개)로 들어갈 만큼만 높이를 쓰고, 넘치면 판 안에서 밀어 본다
  const bt = $('bList').offsetHeight + 9;
  dock.style.maxHeight = Math.max(200, window.innerHeight - top - 4 * bt - 24) + 'px';
  const free = (dock.offsetHeight ? dock.getBoundingClientRect().top : window.innerHeight) - top - 12;
  tools.style.maxHeight = Math.max(130, free) + 'px';
}
if (window.ResizeObserver) new ResizeObserver(fitTools).observe(dock);
let rzT = null;
window.addEventListener('resize', () => { fitTools(); clearTimeout(rzT); rzT = setTimeout(() => { if (elevTrack) renderElev(); }, 200); }); setTimeout(fitTools, 0);

/* =====================================================================
   1) GPX 고도 그래프
   ===================================================================== */
let elevTrack = null, elevData = null, elevDot = null, elevFull = false, elevStep = 500, elevCursor = null;
const eleCache = new Map(); // 고도 없는 경로를 Open-Meteo로 채운 결과(이 기기 메모리에만)
/* 경로를 거리-고도 자료로 바꾼다. 고도가 빠진 점은 앞뒤로 이어서 채운다 */
function profileOf(t, fill){
  const n = t.coords.length, cum = new Array(n).fill(0);
  for (let i = 1; i < n; i++) cum[i] = cum[i-1] + dist2(t.coords[i-1], t.coords[i]);
  let ele = t.coords.map(c => c[2]);
  if (fill) ele = fill;
  const known = ele.map((e, i) => e != null ? i : -1).filter(i => i >= 0);
  if (known.length < 2) return { cum, ele:null, total:cum[n-1] || 0 };
  const out = ele.slice();
  for (let i = 0; i < n; i++) if (out[i] == null) {
    let a = -1, b = -1; for (const k of known) { if (k < i) a = k; else { b = k; break; } }
    out[i] = a < 0 ? ele[b] : b < 0 ? ele[a] : ele[a] + (ele[b] - ele[a]) * ((cum[i] - cum[a]) / ((cum[b] - cum[a]) || 1));
  }
  return { cum, ele:out, total:cum[n-1] };
}
function elevSummary(p){
  let up = 0, down = 0, ref = p.ele[0], hi = -Infinity, lo = Infinity;
  p.ele.forEach(e => { hi = Math.max(hi, e); lo = Math.min(lo, e); const d = e - ref; if (Math.abs(d) >= 3) { if (d > 0) up += d; else down -= d; ref = e; } });
  return { up, down, hi, lo, start:p.ele[0], end:p.ele[p.ele.length - 1] };
}
async function fetchEle(t){
  if (eleCache.has(t.id)) return eleCache.get(t.id);
  const n = t.coords.length, idx = [];
  const m = Math.min(100, n); for (let j = 0; j < m; j++) idx.push(Math.round(j * (n - 1) / Math.max(1, m - 1)));
  const u = `https://api.open-meteo.com/v1/elevation?latitude=${idx.map(i => t.coords[i][0].toFixed(5)).join(',')}&longitude=${idx.map(i => t.coords[i][1].toFixed(5)).join(',')}`;
  const r = await fetch(u); if (!r.ok) throw new Error('응답 ' + r.status);
  const d = await r.json(); if (!d || !Array.isArray(d.elevation) || d.elevation.length !== idx.length) throw new Error('고도 자료 없음');
  const fill = new Array(n).fill(null); idx.forEach((i, j) => { const e = +d.elevation[j]; if (isFinite(e)) fill[i] = Math.round(e); });
  eleCache.set(t.id, fill); return fill;
}
function openElev(t){
  elevTrack = t; elevFull = false; elevCursor = null; showInfo(null);
  elevData = profileOf(t);
  renderElev();
  if (!elevData.ele && t.coords.length > 1) {
    fetchEle(t).then(fill => { if (elevTrack !== t) return; elevData = profileOf(t, fill); elevData.filled = true; renderElev(); })
      .catch(() => { if (elevTrack !== t) return; elevData.failed = true; renderElev(); });
  }
}
function onTrackGone(id){
  if (elevTrack && elevTrack.id === id) closeElev();
  if (rec.follow && rec.follow.id === id) { rec.follow = null; rec.near = null; rec.offNow = false; renderRec(); }
}
const recBusy = () => rec.state !== 'off' || recOpen;
function closeElev(){ elevTrack = elevData = null; elevBox.innerHTML = ''; elevBox.style.display = 'none'; if (elevDot) { map.removeLayer(elevDot); elevDot = null; } }
function chartSvg(p, W, H, big){
  const padL = big ? 52 : 6, padR = 6, padT = 8, padB = big ? 26 : 6;
  const s = elevSummary(p), lo = Math.floor((s.lo - 10) / 10) * 10, hi = Math.ceil((s.hi + 10) / 10) * 10;
  const X = d => padL + (d / (p.total || 1)) * (W - padL - padR), Y = e => padT + (1 - (e - lo) / ((hi - lo) || 1)) * (H - padT - padB);
  const step = Math.max(1, Math.floor(p.ele.length / 600));
  let d = `M${X(0).toFixed(1)},${Y(p.ele[0]).toFixed(1)}`;
  for (let i = step; i < p.ele.length; i += step) d += `L${X(p.cum[i]).toFixed(1)},${Y(p.ele[i]).toFixed(1)}`;
  d += `L${X(p.total).toFixed(1)},${Y(p.ele[p.ele.length - 1]).toFixed(1)}`;
  const area = d + `L${X(p.total).toFixed(1)},${H - padB}L${X(0).toFixed(1)},${H - padB}Z`;
  let axis = '';
  if (big) {
    for (let k = 0; k <= 3; k++) { const e = lo + (hi - lo) * k / 3, y = Y(e).toFixed(1);
      axis += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="#ddd"/><text x="${padL - 6}" y="${+y + 6}" text-anchor="end" font-size="16" fill="#787878">${Math.round(e)}</text>`; }
    const km = p.total / 1000, tick = km > 10 ? 2 : km > 4 ? 1 : 0.5;
    for (let v = 0; v <= km + 1e-9; v += tick) axis += `<text x="${X(v * 1000).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="16" fill="#787878">${+v.toFixed(1)}</text>`;
  }
  return { svg:`<svg class="echart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">${axis}<path d="${area}" fill="rgba(232,56,40,.16)"/><path d="${d}" fill="none" stroke="#E83828" stroke-width="2.5" vector-effect="non-scaling-stroke"/><line class="ecur" x1="-10" x2="-10" y1="${padT}" y2="${H - padB}" stroke="#1f1f1f" stroke-width="1.5"/><circle class="edot" cx="-10" cy="-10" r="6" fill="#1a73e8" stroke="#fff" stroke-width="2.5"/><circle class="eme" cx="-10" cy="-10" r="6" fill="#0a8f5a" stroke="#fff" stroke-width="2.5"/></svg>`, X, Y, padL, padR, W };
}
function gradeAt(p, i){ // 앞뒤 50m 구간의 경사(%)
  let a = i, b = i;
  while (a > 0 && p.cum[i] - p.cum[a] < 50) a--;
  while (b < p.cum.length - 1 && p.cum[b] - p.cum[i] < 50) b++;
  const dx = p.cum[b] - p.cum[a]; return dx > 5 ? (p.ele[b] - p.ele[a]) / dx * 100 : 0;
}
function idxAtDist(p, d){ let lo = 0, hi = p.cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (p.cum[m] < d) lo = m + 1; else hi = m; } return lo; }
function segTable(p, step){
  const rows = []; let start = 0;
  while (start < p.total - 1) {
    const end = Math.min(p.total, start + step), a = idxAtDist(p, start), b = idxAtDist(p, end);
    let up = 0, down = 0; for (let i = a + 1; i <= b; i++) { const d = p.ele[i] - p.ele[i-1]; if (d > 0) up += d; else down -= d; }
    const g = (p.ele[b] - p.ele[a]) / ((p.cum[b] - p.cum[a]) || 1) * 100;
    rows.push(`<tr><td>${(start / 1000).toFixed(2)}~${(end / 1000).toFixed(2)}</td><td>${Math.round(up) ? '+' + Math.round(up) : '0'}</td><td>${Math.round(down) ? '-' + Math.round(down) : '0'}</td><td style="color:${Math.abs(g) >= 20 ? 'var(--red)' : 'inherit'};font-weight:${Math.abs(g) >= 20 ? 700 : 400}">${g >= 0 ? '+' : ''}${g.toFixed(0)}%</td><td>${Math.round(p.ele[b])}</td></tr>`);
    start = end;
  }
  return `<table class="etab"><tr><th>구간 km</th><th>오름</th><th>내림</th><th>경사</th><th>끝 고도</th></tr>${rows.join('')}</table>`;
}
function renderElev(){
  const t = elevTrack, p = elevData; if (!t) return;
  elevBox.style.display = 'block';
  const top = `<div class="phead"><b class="grow">${esc(t.name)}</b><button class="pbtn" id="eFit">경로 전체</button><button class="px" id="eX">${ICON.x}</button></div>`;
  if (!p.ele) {
    elevBox.innerHTML = top + `<p class="pline">${fmtKm(p.total)}${t.coords.length < 2 ? ' · 지점만 있는 파일' : p.failed ? ' · 고도 정보가 없고, 인터넷이 안 돼 채우지 못했어요' : ' · 고도 정보가 없어 지형 자료로 채우는 중…'}</p>`;
  } else {
    const s = elevSummary(p), W = elevBox.clientWidth - 28 || 340;
    const c = chartSvg(p, W, elevFull ? 200 : 110, elevFull);
    elevBox.innerHTML = top +
      `<p class="pline">${fmtKm(p.total)} · 오르막 <b>${Math.round(s.up)} m</b> · 내리막 ${Math.round(s.down)} m · 최고 ${Math.round(s.hi)} m · 최저 ${Math.round(s.lo)} m</p>
       <div class="ewrap">${c.svg}</div>
       <p class="pline" id="eRead">${elevFull ? '그래프를 누르거나 밀면 그 지점이 지도에 보여요' : `출발 ${Math.round(s.start)} m → 도착 ${Math.round(s.end)} m`}${p.filled ? ' <small>(고도는 지형 자료로 채운 값)</small>' : ''}</p>` +
      (elevFull ? `<div class="seg">${[250, 500, 1000].map(v => `<button class="${v === elevStep ? 'sel' : ''}" data-step="${v}">${v < 1000 ? v + 'm' : '1km'}</button>`).join('')}</div>${segTable(p, elevStep)}
         <button class="sub" id="eLess">그래프 작게</button>` : `<button class="sub" id="eMore">${ICON.chart} 자세히 (구간별 경사)</button>`);
    const svg = elevBox.querySelector('.echart'), cur = svg.querySelector('.ecur'), dot = svg.querySelector('.edot');
    const pick = ev => {
      const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (c.W / r.width);
      const d = Math.max(0, Math.min(p.total, (x - c.padL) / (c.W - c.padL - c.padR) * p.total)), i = idxAtDist(p, d);
      elevCursor = i; const cx = c.X(p.cum[i]), cy = c.Y(p.ele[i]);
      cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      const g = gradeAt(p, i);
      $('eRead').innerHTML = `<b>${(p.cum[i] / 1000).toFixed(2)} km</b> · 고도 <b>${Math.round(p.ele[i])} m</b> · 경사 ${g >= 0 ? '+' : ''}${g.toFixed(0)}% · 남은 ${fmtKm(p.total - p.cum[i])}`;
      const ll = [t.coords[i][0], t.coords[i][1]];
      if (!elevDot) elevDot = L.circleMarker(ll, { radius:9, color:'#fff', weight:3, fillColor:'#1a73e8', fillOpacity:1, interactive:false }).addTo(map);
      else elevDot.setLatLng(ll);
      if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll, { animate:false });
    };
    let down = false;
    svg.addEventListener('pointerdown', e => { down = true; try { svg.setPointerCapture(e.pointerId); } catch(x){} pick(e); e.preventDefault(); });
    svg.addEventListener('pointermove', e => { if (down) pick(e); });
    svg.addEventListener('pointerup', () => { down = false; });
    svg.addEventListener('pointercancel', () => { down = false; });
    if (elevCursor != null && elevCursor < p.ele.length) { const cx = c.X(p.cum[elevCursor]); cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); dot.setAttribute('cx', cx); dot.setAttribute('cy', c.Y(p.ele[elevCursor])); }
    elevBox._chart = c; markMeOnChart();
    elevBox.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { elevStep = +b.dataset.step; renderElev(); });
    if ($('eMore')) $('eMore').onclick = () => { elevFull = true; renderElev(); };
    if ($('eLess')) $('eLess').onclick = () => { elevFull = false; renderElev(); };
  }
  $('eX').onclick = closeElev;
  $('eFit').onclick = () => map.fitBounds(trackBounds(t), { padding:[40,40] });
}
/* 기록 중이고 따라가는 경로가 그래프의 경로면, 내 위치를 그래프에 초록 점으로 */
function markMeOnChart(){
  const c = elevBox._chart; if (!c || !elevData || !elevData.ele) return;
  const me = elevBox.querySelector('.eme'); if (!me) return;
  if (rec.near && rec.follow === elevTrack && rec.near.d < 60) {
    const p = elevData, i = rec.near.i, d = p.cum[i] + (p.cum[Math.min(i + 1, p.cum.length - 1)] - p.cum[i]) * rec.near.t;
    const j = idxAtDist(p, d); me.setAttribute('cx', c.X(d)); me.setAttribute('cy', c.Y(p.ele[j]));
  } else { me.setAttribute('cx', -10); me.setAttribute('cy', -10); }
}

/* =====================================================================
   2) 산행 기록 + 3) 경로 이탈 경고
   ===================================================================== */
const REC_KEY = 'sanhaeng-rec-v1';
const rec = { state:'off', pts:[], dist:0, up:0, down:0, elapsed:0, since:0, startAt:0, follow:null, followId:null, near:null,
              off:0, offAlarmAt:0, offNow:false, eleRef:null, eleSm:null, acc:null, speed:null, msg:'', msgUntil:0 };
let recWatch = null, recTick = null, recLine = null, recLineW = null, wakeLock = null, recSavedAt = 0;
function recSave(force){
  if (!force && Date.now() - recSavedAt < 10000) return;
  recSavedAt = Date.now();
  try {
    if (rec.state === 'off') localStorage.removeItem(REC_KEY);
    else localStorage.setItem(REC_KEY, JSON.stringify({ state:rec.state, pts:rec.pts, dist:rec.dist, up:rec.up, down:rec.down,
      elapsed:rec.elapsed + (rec.state === 'run' ? Date.now() - rec.since : 0), startAt:rec.startAt, followId:rec.follow ? rec.follow.id : null }));
  } catch(e){}
}
function recElapsed(){ return rec.elapsed + (rec.state === 'run' ? Date.now() - rec.since : 0); }
function recFlash(msg, color){ rec.msg = `<span style="color:${color || '#0a8f5a'}">${msg}</span>`; rec.msgUntil = Date.now() + 3000; renderRec(); }
async function keepAwake(on){
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch(e){ wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && rec.state === 'run') keepAwake(true); });
function drawRecLine(){
  const ll = rec.pts.map(p => [p[0], p[1]]);
  if (!recLine) { recLineW = L.polyline(ll, { color:'#fff', weight:9, opacity:.9, interactive:false }).addTo(map); recLine = L.polyline(ll, { color:'#D81B60', weight:5, interactive:false }).addTo(map); }
  else { recLineW.setLatLngs(ll); recLine.setLatLngs(ll); }
}
function clearRecLine(){ if (recLine) { map.removeLayer(recLine); map.removeLayer(recLineW); recLine = recLineW = null; } }
function pickFollow(lat, lng){ // 보이는 경로 중 200m 안에서 가장 가까운 것
  let best = null, bd = 200;
  db.tracks.forEach(t => { if (isHidden('t:', t.id) || t.coords.length < 2) return; const n = nearestOnLine(lat, lng, t.coords); if (n.d < bd) { bd = n.d; best = t; } });
  return best;
}
function onRecPos(p){
  if (cmpOn) setHeading(heading != null ? heading : gpsHeading);
  const c = p.coords, acc = c.accuracy; rec.acc = acc;
  if (c.speed != null && c.speed >= 0) rec.speed = c.speed;
  if (rec.state !== 'run') { renderRec(); return; }
  const pt = [+c.latitude.toFixed(6), +c.longitude.toFixed(6), c.altitude != null ? Math.round(c.altitude) : null, Date.now()];
  if (!rec.follow && db.tracks.length) { rec.follow = (elevTrack && elevTrack.coords.length > 1) ? elevTrack : pickFollow(pt[0], pt[1]); }
  // 경로 이탈: 20m 넘게 벗어난 위치가 두 번 연속이면 경고(오차가 40m 넘는 위치는 판단하지 않음)
  if (rec.follow && rec.follow.coords.length > 1) {
    rec.near = nearestOnLine(pt[0], pt[1], rec.follow.coords);
    if (acc <= 40) {
      if (rec.near.d > 20) rec.off++; else if (rec.near.d < 15) { if (rec.offNow) recFlash('경로로 돌아왔어요'); rec.off = 0; rec.offNow = false; }
      if (rec.off >= 2 && (!rec.offNow || Date.now() - rec.offAlarmAt > 60000)) { rec.offNow = true; rec.offAlarmAt = Date.now(); beep([880, 660, 880]); }
    }
    markMeOnChart();
  }
  // 기록할 점 고르기: 오차 30m 넘는 위치는 버리고, 앞 점에서 충분히(5m 또는 오차 절반) 움직였을 때만
  if (acc > 30) { renderRec(); return; }
  const last = rec.pts[rec.pts.length - 1];
  if (last) {
    const d = dist2(last, pt), dt = (pt[3] - last[3]) / 1000;
    if (d < Math.max(5, acc / 2)) { renderRec(); return; }
    if (dt > 0 && d / dt > 15) { renderRec(); return; } // 시속 54km 넘는 튐은 버림
    rec.dist += d;
    if (rec.speed == null || c.speed == null) rec.speed = dt > 0 ? d / dt : null;
  }
  // 오르막: 고도는 흔들리므로 부드럽게 한 뒤 4m 넘게 바뀐 것만 더한다
  if (pt[2] != null) {
    rec.eleSm = rec.eleSm == null ? pt[2] : rec.eleSm * 0.7 + pt[2] * 0.3;
    if (rec.eleRef == null) rec.eleRef = rec.eleSm;
    const dz = rec.eleSm - rec.eleRef; if (Math.abs(dz) >= 4) { if (dz > 0) rec.up += dz; else rec.down -= dz; rec.eleRef = rec.eleSm; }
  }
  rec.pts.push(pt); drawRecLine(); recSave(); renderRec();
}
function onRecErr(e){ if (e.code === 1) { recFlash('위치 권한이 꺼져 있어요', 'var(--red)'); } }
function startWatch(){
  if (recWatch === null && navigator.geolocation) recWatch = navigator.geolocation.watchPosition(onRecPos, onRecErr, { enableHighAccuracy:true, maximumAge:0, timeout:30000 });
  if (watchId === null) $('bLocate').onclick();   // 지도에 내 위치(파란 점)도 켠다
  showInfo(null);                                  // 위치 글은 기록판이 보여 준다
}
function stopWatch(){ if (recWatch !== null) navigator.geolocation.clearWatch(recWatch); recWatch = null; }
function recStart(){
  wakeAudio();
  if (rec.state === 'off') Object.assign(rec, { pts:[], dist:0, up:0, down:0, elapsed:0, startAt:Date.now(), follow:null, near:null, off:0, offNow:false, eleRef:null, eleSm:null, speed:null });
  rec.state = 'run'; rec.since = Date.now(); rec.msgUntil = 0;
  startWatch(); keepAwake(true); drawRecLine(); recSave(true);
  clearInterval(recTick); recTick = setInterval(renderRec, 1000); renderRec();
}
function recPause(){ rec.elapsed += Date.now() - rec.since; rec.state = 'pause'; keepAwake(false); recSave(true); renderRec(); }
function recFinish(){
  const was = rec.state; if (was === 'run') recPause();
  if (rec.pts.length < 2) {
    openSheet(head('기록 끝내기') + `<p style="line-height:1.5;margin-top:0">기록된 위치가 ${rec.pts.length}개뿐이라 경로로 저장할 수 없어요.</p>
      <button class="big" id="rqDrop">기록 버리기</button><button class="sub" data-close>계속 기록하기</button>`);
    $('rqDrop').onclick = () => { closeSheet(); recReset(); };
    return;
  }
  const d = new Date(rec.startAt);
  openSheet(head('기록 저장') + `<p style="margin-top:0">${fmtKm(rec.dist)} · ${hhmm(recElapsed())} · 오르막 ${Math.round(rec.up)} m</p>
    <input type="text" id="rqName" maxlength="60">
    <button class="big" id="rqSave">경로로 저장</button><button class="sub" data-close>아직 안 끝남 (닫기)</button><button class="sub" id="rqDrop" style="color:var(--red)">저장하지 않고 버리기</button>
    <p class="note">저장하면 GPX 경로 목록에 들어가고, 동기화를 켰다면 다른 기기에도 생겨요.</p>`);
  $('rqName').value = `기록 ${d.getMonth() + 1}월 ${d.getDate()}일 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  $('rqSave').onclick = () => {
    const t = SyncCore.cleanTrack({ id:SyncCore.newId(), name:$('rqName').value, coords:rec.pts.map(p => [p[0], p[1], p[2]]), wpts:[] });
    if (!t) return;
    db.tracks.push(t);
    if (!saveData()) { db.tracks.pop(); return; }
    drawTracks(); closeSheet(); recReset(); openElev(t);
  };
  $('rqDrop').onclick = () => { if ($('rqDrop').dataset.sure) { closeSheet(); recReset(); } else { $('rqDrop').dataset.sure = 1; $('rqDrop').textContent = '정말 버릴까요? 한 번 더 누르면 지워져요'; } };
}
function recReset(){
  rec.state = 'off'; rec.pts = []; rec.follow = null; rec.near = null; stopWatch(); keepAwake(false); clearInterval(recTick);
  clearRecLine(); recSave(true); recOpen = false; renderRec(); markMeOnChart();
}
let recOpen = false;
const setH = (el, h) => { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } };
function renderRec(){
  $('bRec').classList.toggle('on', rec.state === 'run');
  $('bRec').classList.toggle('pause', rec.state === 'pause');
  if (!recOpen && rec.state === 'off') { recBox.style.display = 'none'; return; }
  recBox.style.display = 'block';
  if (!recBox._built) {
    recBox._built = true;
    recBox.innerHTML = `<div class="stats"><div><small>거리</small><span id="rDist"></span></div><div><small>시간</small><span id="rTime"></span></div>
      <div><small>속도</small><span id="rSpd"></span></div><div><small>오르막</small><span id="rUp"></span></div></div>
      <p class="pline" id="rStat"></p><p class="pline small" id="rFol"><span id="rFolT"></span> <button class="link" id="rFollow"></button></p><div class="rrow" id="rRow"></div>`;
    $('rFollow').onclick = chooseFollow;
  }
  const hasEle = rec.pts.some(p => p[2] != null);
  setH($('rDist'), rec.dist >= 1000 ? `<b>${(rec.dist / 1000).toFixed(2)}</b><i>km</i>` : `<b>${Math.round(rec.dist)}</b><i>m</i>`);
  setH($('rTime'), `<b>${hhmm(recElapsed())}</b>`);
  setH($('rSpd'), `<b>${rec.state === 'run' && rec.speed != null ? (rec.speed * 3.6).toFixed(1) : '-'}</b><i>km/h</i>`);
  setH($('rUp'), `<b>${hasEle ? Math.round(rec.up) : '-'}</b><i>m</i>`);
  let status;
  if (Date.now() < rec.msgUntil) status = rec.msg;
  else if (rec.offNow && rec.near) status = `<b style="color:var(--red)">경로를 벗어났어요! (${Math.round(rec.near.d)} m)</b>`;
  else if (rec.state === 'off') status = rec.acc == null ? '시작을 누르면 지나간 길을 기록해요' : `시작을 누르면 기록해요 · GPS 오차 ±${Math.round(rec.acc)} m`;
  else if (rec.acc == null) status = 'GPS 신호를 찾는 중…';
  else status = `${rec.state === 'run' ? '기록 중' : '일시정지'} · GPS 오차 ±${Math.round(rec.acc)} m${rec.state === 'run' && !wakeLock ? ' · <span style="color:var(--red)">화면을 켜 두세요</span>' : ''}`;
  setH($('rStat'), status);
  const fol = rec.follow && db.tracks.includes(rec.follow) ? rec.follow : null;
  if (fol) {
    let left = '';
    if (rec.near && rec.near.d < 60) { const p = profileOf(fol), i = rec.near.i; left = ` · 끝까지 ${fmtKm(p.total - (p.cum[i] + (p.cum[Math.min(i + 1, p.cum.length - 1)] - p.cum[i]) * rec.near.t))}`; }
    setH($('rFolT'), `따라가는 경로: <b>${esc(fol.name)}</b>${left}`); setH($('rFollow'), '바꾸기');
  } else { setH($('rFolT'), '따라가는 경로 없음'); setH($('rFollow'), '고르기'); }
  $('rFol').style.display = (fol || (rec.state !== 'off' && db.tracks.some(t => t.coords.length > 1))) ? 'block' : 'none';
  const main = rec.state === 'run' ? `<button class="rbtn pause" id="rMain">❚❚ 일시정지</button>` : rec.state === 'pause' ? `<button class="rbtn go" id="rMain">▶ 계속</button>` : `<button class="rbtn go" id="rMain">● 시작</button>`;
  const row = `${main}<button class="rbtn stop" id="rStop" ${rec.state === 'off' ? 'disabled' : ''}>■ 종료·저장</button>${rec.state === 'off' ? `<button class="rbtn x" id="rClose">${ICON.x}</button>` : ''}`;
  if ($('rRow')._h !== row) {
    setH($('rRow'), row);
    $('rMain').onclick = () => rec.state === 'run' ? recPause() : recStart();
    $('rStop').onclick = recFinish;
    if ($('rClose')) $('rClose').onclick = () => { recOpen = false; stopWatch(); renderRec(); };
  }
}
function chooseFollow(){
  const list = db.tracks.filter(t => t.coords.length > 1);
  openSheet(head('따라갈 경로') + list.map(t => `<button class="opt ${rec.follow === t ? 'sel' : ''}" data-id="${esc(t.id)}"><span>${esc(t.name)}<small>${statText(t)}</small></span></button>`).join('')
    + `<button class="sub" id="fNone">따라가지 않음 (이탈 경고 끄기)</button><p class="note">기록 중 이 경로에서 20m 넘게 벗어나면 화면에 경고하고 소리를 내요.</p>`);
  $('sheet').querySelectorAll('.opt').forEach(b => b.onclick = () => { rec.follow = db.tracks.find(t => t.id === b.dataset.id) || null; rec.near = null; rec.off = 0; rec.offNow = false; closeSheet(); renderRec(); });
  $('fNone').onclick = () => { rec.follow = null; rec.near = null; rec.offNow = false; closeSheet(); renderRec(); };
}
/* 오른쪽 버튼 줄에 '기록' 버튼 */
const bRec = document.createElement('button'); bRec.className = 'tbtn'; bRec.id = 'bRec'; bRec.title = '산행 기록'; bRec.innerHTML = ICON.steps;
$('tools').insertBefore(bRec, $('bList'));
bRec.onclick = () => { if (rec.state !== 'off') { recOpen = true; renderRec(); return; } recOpen = !recOpen; if (recOpen) { startWatch(); wakeAudio(); } else stopWatch(); renderRec(); };
/* 앱이 꺼졌다 켜져도 기록이 이어지게: 남은 기록이 있으면 일시정지 상태로 되살린다 */
(() => {
  let s; try { s = JSON.parse(localStorage.getItem(REC_KEY)); } catch(e){ s = null; }
  if (!s || !Array.isArray(s.pts) || (s.state !== 'run' && s.state !== 'pause')) return;
  Object.assign(rec, { state:'pause', pts:s.pts.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])), dist:+s.dist || 0, up:+s.up || 0, down:+s.down || 0,
    elapsed:+s.elapsed || 0, startAt:+s.startAt || Date.now(), follow:db.tracks.find(t => t.id === s.followId) || null });
  recOpen = true; drawRecLine(); renderRec(); recFlash('앱이 다시 열려서 기록을 일시정지했어요. ▶ 계속을 누르세요', '#e07a00'); rec.msgUntil = Date.now() + 15000;
})();

/* =====================================================================
   3-2) 나침반: 휴대폰이 향한 방향을 내 위치 점에 부채꼴로, 버튼에 북쪽 바늘로
   ===================================================================== */
const cmp = document.createElement('button'); cmp.id = 'bCompass'; cmp.title = '나침반';
cmp.innerHTML = `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#fff" stroke="#BFBFBF" stroke-width="2"/><g class="needle"><path d="M22 5 27 22H17Z" fill="#E83828"/><path d="M22 39 27 22H17Z" fill="#9E9E9E"/><text x="22" y="15.5" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">N</text></g></svg><span id="cmpDeg"></span>`;
document.body.appendChild(cmp);
let heading = null, cmpOn = false, gpsHeading = null;
function setHeading(h){
  heading = h;
  cmp.querySelector('.needle').setAttribute('transform', `rotate(${h == null ? 0 : -h} 22 22)`);
  $('cmpDeg').textContent = h == null ? '' : `${dirName(h)} ${Math.round(h)}°`;
  const el = meMarker && meMarker.getElement && meMarker.getElement();
  if (el) {
    let cone = el.querySelector('.cone');
    if (h == null) { if (cone) cone.remove(); return; }
    if (!cone) { cone = document.createElement('div'); cone.className = 'cone'; el.insertBefore(cone, el.firstChild); }
    cone.style.transform = `translate(-50%,-100%) rotate(${h}deg)`;
  }
}
function onOrient(e){
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return;
  hasSensor = true;
  const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  setHeading(((h + so) % 360 + 360) % 360);
}
async function compassOn(){
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { alertSheet('방향 센서 권한을 허용하지 않아 나침반을 켤 수 없어요. 사파리를 완전히 닫았다가 다시 열고 나침반을 누르면 다시 물어봐요.'); return; }
    }
  } catch(e){}
  cmpOn = true; cmp.classList.add('on');
  window.addEventListener('deviceorientationabsolute', onOrient); window.addEventListener('deviceorientation', onOrient);
  if (watchId === null) $('bLocate').onclick();
  cmpGps(true);
  setTimeout(() => { if (cmpOn && heading == null) $('cmpDeg').textContent = '센서 없음 · 걸으면 진행방향'; }, 2500);
}
function compassOff(){ cmpOn = false; cmp.classList.remove('on'); window.removeEventListener('deviceorientationabsolute', onOrient); window.removeEventListener('deviceorientation', onOrient); cmpGps(false); setHeading(null); }
cmp.onclick = () => cmpOn ? compassOff() : compassOn();
/* 방향 센서가 없는 기기(맥 등)는 걸을 때 GPS 진행방향을 쓴다 (나침반을 켰을 때만 위치를 본다) */
let cmpGeo = null, hasSensor = false;
function cmpGps(on){
  if (on && cmpGeo === null && navigator.geolocation) cmpGeo = navigator.geolocation.watchPosition(p => {
    const h = p.coords.heading;
    if (!hasSensor && h != null && isFinite(h) && (p.coords.speed || 0) > 0.5) gpsHeading = h;
    if (cmpOn) setHeading(hasSensor ? heading : gpsHeading);
  }, () => {}, { enableHighAccuracy:true, maximumAge:5000 });
  if (!on && cmpGeo !== null) { navigator.geolocation.clearWatch(cmpGeo); cmpGeo = null; }
}

/* =====================================================================
   4) 날씨 · 바람 · 미세먼지 (Open-Meteo, 키 필요 없음. 위치는 약 1km 단위로 줄여서 보낸다)
   ===================================================================== */
const wx = document.createElement('button'); wx.id = 'wx'; wx.innerHTML = '<span class="wxl">날씨</span>'; document.body.appendChild(wx);
let wxData = null, wxAt = 0, wxPos = null, wxBusy = false;
const WCODE = c => c === 0 ? ['맑음', 'w_sun'] : c <= 2 ? ['구름 조금', 'w_part'] : c === 3 ? ['흐림', 'w_cloud'] : c <= 48 ? ['안개', 'w_fog'] : c <= 57 ? ['이슬비', 'w_drizzle']
  : c <= 67 ? ['비', 'w_rain'] : c <= 77 ? ['눈', 'w_snow'] : c <= 82 ? ['소나기', 'w_rain'] : c <= 86 ? ['눈 소나기', 'w_snow'] : ['뇌우', 'w_storm'];
const WIND = [ // 산행 참고(바람 세기, m/s)
  [4, '양호', '#0a8f5a', '산행에 문제 없는 바람이에요.'],
  [7, '약간 강함', '#7CB342', '능선에서는 체감온도가 떨어져요. 바람막이를 챙기세요.'],
  [10, '강함', '#e07a00', '능선·정상에서 몸이 흔들릴 수 있어요. 모자·장비가 날리지 않게 하세요.'],
  [14, '매우 강함', '#E83828', '능선 이동이 위험해요. 바람을 피하는 길로 다니세요.'],
  [Infinity, '산행 자제', '#7b2cbf', '걷기 힘들 정도의 바람이에요. 산행을 미루세요.'],
];
const windLv = v => WIND.find(w => v < w[0]);
const PM10 = v => v <= 30 ? ['좋음', '#1a73e8'] : v <= 80 ? ['보통', '#0a8f5a'] : v <= 150 ? ['나쁨', '#e07a00'] : ['매우 나쁨', '#E83828'];
const PM25 = v => v <= 15 ? ['좋음', '#1a73e8'] : v <= 35 ? ['보통', '#0a8f5a'] : v <= 75 ? ['나쁨', '#e07a00'] : ['매우 나쁨', '#E83828'];
const arrow = (deg, col, sz) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" style="transform:rotate(${(deg + 180) % 360}deg)"><path d="M12 2 19 20 12 16 5 20Z" fill="${col}" stroke="#fff" stroke-width="1.2"/></svg>`;
function wxWhere(){ return meMarker ? meMarker.getLatLng() : map.getCenter(); }
async function wxFetch(force){
  if (wxBusy || document.visibilityState !== 'visible') return;
  const c = wxWhere();
  if (!force && wxData && Date.now() - wxAt < 10 * 60000 && wxPos && map.distance(wxPos, c) < 5000) return;
  wxBusy = true;
  const la = c.lat.toFixed(2), lo = c.lng.toFixed(2);
  try {
    const [f, a] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&daily=sunrise,sunset&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=2`).then(r => r.ok ? r.json() : null),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${la}&longitude=${lo}&current=pm10,pm2_5&timezone=Asia%2FSeoul`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (f && f.current && isFinite(f.current.temperature_2m)) { wxData = { f, a }; wxAt = Date.now(); wxPos = L.latLng(c.lat, c.lng); }
  } catch(e){}
  wxBusy = false; wxRender();
}
function wxRender(){
  if (!wxData) { wx.innerHTML = `<span class="wxl">${navigator.onLine ? '날씨…' : '날씨 (인터넷 없음)'}</span>`; return; }
  const cu = wxData.f.current, [wt, wi] = WCODE(cu.weather_code), wl = windLv(cu.wind_speed_10m);
  const pm = wxData.a && wxData.a.current && isFinite(wxData.a.current.pm10) ? PM10(wxData.a.current.pm10) : null;
  const old = Date.now() - wxAt > 30 * 60000;
  wx.innerHTML = `<span class="wxi">${ICON[wi]}</span><b>${Math.round(cu.temperature_2m)}°</b>${arrow(cu.wind_direction_10m, wl[2], 22)}<b style="color:${wl[2]}">${cu.wind_speed_10m.toFixed(1)}</b><small>m/s</small>`
    + (pm ? `<span class="pm" style="background:${pm[1]}">${pm[0]}</span>` : '') + (old ? '<small style="color:var(--red)">옛 정보</small>' : '');
  wx.title = wt;
}
function wxSheet(){
  if (!wxData) { wxFetch(true); alertSheet('날씨를 불러오는 중이거나 인터넷이 안 돼요. 잠시 뒤 다시 눌러 주세요.'); return; }
  const f = wxData.f, cu = f.current, [wt, wi] = WCODE(cu.weather_code), wl = windLv(cu.wind_speed_10m), gl = windLv(cu.wind_gusts_10m || 0);
  const ac = wxData.a && wxData.a.current, p10 = ac && isFinite(ac.pm10) ? PM10(ac.pm10) : null, p25 = ac && isFinite(ac.pm2_5) ? PM25(ac.pm2_5) : null;
  const now = Date.now(), hs = (f.hourly && f.hourly.time) || [];
  let start = hs.findIndex(t => new Date(t + ':00+09:00').getTime() > now - 3600000); if (start < 0) start = 0;
  const hrs = hs.slice(start, start + 12).map((t, j) => { const i = start + j, w = WCODE(f.hourly.weather_code[i]), ws = f.hourly.wind_speed_10m[i];
    return `<tr><td>${t.slice(11, 13)}시</td><td><span class="ti2">${ICON[w[1]]}</span>${w[0]}</td><td>${Math.round(f.hourly.temperature_2m[i])}°</td><td>${f.hourly.precipitation_probability[i] ?? '-'}%</td><td style="color:${windLv(ws)[2]};font-weight:700">${ws.toFixed(1)}</td></tr>`; }).join('');
  const sr = f.daily && f.daily.sunrise ? f.daily.sunrise[0].slice(11) : '-', ss = f.daily && f.daily.sunset ? f.daily.sunset[0].slice(11) : '-';
  const d = new Date(wxAt);
  openSheet(head('날씨') + `<div class="wxbig"><span class="wxi">${ICON[wi]}</span><b>${Math.round(cu.temperature_2m)}°</b><span>${wt}<small>체감 ${Math.round(cu.apparent_temperature)}° · 강수 ${cu.precipitation} mm</small></span></div>
    <p class="stat" style="border-left:6px solid ${wl[2]}">바람 <b>${dirName(cu.wind_direction_10m)}풍 ${cu.wind_speed_10m.toFixed(1)} m/s</b> ${arrow(cu.wind_direction_10m, wl[2], 26)} · 순간 ${(cu.wind_gusts_10m || 0).toFixed(1)} m/s
      <small><b style="color:${wl[2]}">${wl[1]}</b> — ${wl[3]}${gl !== wl ? ` 순간 바람은 '${gl[1]}' 수준이에요.` : ''}</small></p>
    ${p10 || p25 ? `<p class="stat">미세먼지 ${p10 ? `<b style="color:${p10[1]}">${p10[0]}</b> (${Math.round(ac.pm10)}㎍/㎥)` : '-'} · 초미세먼지 ${p25 ? `<b style="color:${p25[1]}">${p25[0]}</b> (${Math.round(ac.pm2_5)}㎍/㎥)` : '-'}</p>` : ''}
    <p class="stat">해 뜨는 시각 ${sr} · 해 지는 시각 <b>${ss}</b></p>
    <h3>앞으로 12시간</h3><table class="etab"><tr><th>시각</th><th>날씨</th><th>기온</th><th>비 올 확률</th><th>바람 m/s</th></tr>${hrs}</table>
    <p class="note">${meMarker ? '내 위치' : '지도 가운데'} 근처(${wxPos.lat.toFixed(2)}, ${wxPos.lng.toFixed(2)}) 기준 · ${d.getHours()}:${pad2(d.getMinutes())}에 받은 Open-Meteo 예보예요. 산 위는 이보다 더 춥고 바람이 셀 수 있어요. 바람 단계는 산행 참고용이에요.</p>
    <button class="sub" id="wxNow">지금 다시 받기</button>`);
  $('wxNow').onclick = async () => { $('wxNow').textContent = '받는 중…'; await wxFetch(true); wxSheet(); };
}
wx.onclick = wxSheet;
let wxMoveT = null;
map.on('moveend', () => { clearTimeout(wxMoveT); wxMoveT = setTimeout(() => wxFetch(false), 3000); });
setInterval(() => wxFetch(false), 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wxFetch(false); });
window.addEventListener('online', () => wxFetch(true));
setTimeout(() => wxFetch(true), 1500); wxRender();

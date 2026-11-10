'use strict';
/* 접속 제한 규칙(CSP)에 걸린 요청을 기록해 둔다 → "앱 점검" 화면에서 보여 준다 */
const cspLog = [];
document.addEventListener('securitypolicyviolation', e => { if (cspLog.length < 20) cspLog.push(e.violatedDirective + ' → ' + String(e.blockedURI).slice(0, 60)); });
/* ---------- 아이콘 (Lucide, 인라인) ---------- */
const S = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICON = {
  x: S('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  tent: S('<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>'),
  droplet: S('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'),
  car: S('<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>'),
  mountain: S('<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>'),
  flag: S('<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>'),
  pin: S('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
  route: S('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
};
const TYPES = [
  {k:'camp', label:'야영·대피소', icon:'tent'},
  {k:'water', label:'물', icon:'droplet'},
  {k:'park', label:'주차', icon:'car'},
  {k:'peak', label:'정상·전망', icon:'mountain'},
  {k:'start', label:'출발·도착', icon:'flag'},
  {k:'etc', label:'기타', icon:'pin'},
];
const typeOf = k => TYPES.find(t => t.k === k) || TYPES[5];

/* ---------- 저장 (기기에 먼저 저장하고, 동기화를 켜면 다른 기기와 맞춘다) ---------- */
const KEY = 'sanhaeng-map-v1';
function load(){ try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e){ return {}; } }
const db = Object.assign({ marks:[], tracks:[], gone:{}, base:'vbase', view:null }, load());
db.marks = SyncCore.cleanList(db.marks, SyncCore.cleanMark);   // 저장돼 있던 자료도 형식을 검사해서 쓴다
db.tracks = SyncCore.cleanList(db.tracks, SyncCore.cleanTrack);
db.gone = SyncCore.cleanGone(db.gone);                          // 지운 기록: 다른 기기에서도 지워지게 남겨 둔다
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function save(quiet){
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch(e){ if (!quiet) alertSheet('저장 공간이 부족해서 저장하지 못했어요. 목록에서 안 쓰는 GPX를 지워 주세요.'); return false; }
}
function saveData(){ const ok = save(); syncSoon(); return ok; } // 표시·경로가 바뀌었을 때
function removeMark(id){ db.marks = db.marks.filter(x => x.id !== id); db.gone['m:' + id] = Date.now(); saveData(); drawMarks(); }
function removeTrack(id){ db.tracks = db.tracks.filter(x => x.id !== id); db.gone['t:' + id] = Date.now(); saveData(); drawTracks(); }

/* ---------- 지도 ---------- */
const VKEY = '9F35E2D2-DD0E-4503-ADF5-ACA296DF46B3'; // 브이월드 개발키 (malgu38-cmd.github.io 전용, 만료 2027-05-04)
const VW = (layer, ext) => L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VKEY}/${layer}/{z}/{y}/{x}.${ext}`, {maxZoom:19, maxNativeZoom:19, minZoom:6, attribution:'© 브이월드(국토교통부)'});
/* 국토지리정보원 지도는 좌표계가 달라(EPSG:5179) 이 지도를 고를 때만 지도 좌표계를 바꾼다.
   확대 단계는 z = L단계 + 1 로 맞춰서 지도를 바꿔도 보던 위치와 축척이 거의 그대로다. */
const NKEY = '1830EC6B035E8287F81404C36BD5488DB65EDE61DC'; // 국토지리정보원 키 (malgu38-cmd.github.io 전용, 2026-11-05 발급)
const NG_TM = (() => {
  const a=6378137, f=1/298.257222101, k0=0.9996, lat0=38*Math.PI/180, lon0=127.5*Math.PI/180, FE=1000000, FN=2000000;
  const n=f/(2-f), n2=n*n, n3=n2*n, n4=n3*n, e=2*Math.sqrt(n)/(1+n), A=a/(1+n)*(1+n2/4+n4/64);
  const al=[n/2-2*n2/3+5*n3/16+41*n4/180, 13*n2/48-3*n3/5+557*n4/1440, 61*n3/240-103*n4/140, 49561*n4/161280];
  const be=[n/2-2*n2/3+37*n3/96-n4/360, n2/48+n3/15-437*n4/1440, 17*n3/480-37*n4/840, 4397*n4/161280];
  const de=[2*n-2*n2/3-2*n3+116*n4/45, 7*n2/3-8*n3/5-227*n4/45, 56*n3/15-136*n4/35, 4279*n4/630];
  const xiEta = (lat, dl) => {
    const s=Math.sin(lat), t=Math.sinh(Math.atanh(s)-e*Math.atanh(e*s));
    const x0=Math.atan2(t,Math.cos(dl)), h0=Math.atanh(Math.sin(dl)/Math.sqrt(1+t*t));
    let x=x0, h=h0;
    al.forEach((v,i)=>{ const j=2*(i+1); x+=v*Math.sin(j*x0)*Math.cosh(j*h0); h+=v*Math.cos(j*x0)*Math.sinh(j*h0); });
    return [x,h];
  };
  const M0=k0*A*xiEta(lat0,0)[0];
  return {
    forward(lat,lng){ const [x,h]=xiEta(lat*Math.PI/180,lng*Math.PI/180-lon0); return [FE+k0*A*h, FN+k0*A*x-M0]; },
    inverse(E,N){
      const x=(N-FN+M0)/(k0*A), h=(E-FE)/(k0*A); let x1=x, h1=h;
      be.forEach((v,i)=>{ const j=2*(i+1); x1-=v*Math.sin(j*x)*Math.cosh(j*h); h1-=v*Math.cos(j*x)*Math.sinh(j*h); });
      const chi=Math.asin(Math.sin(x1)/Math.cosh(h1)); let lat=chi;
      de.forEach((v,i)=>{ lat+=v*Math.sin(2*(i+1)*chi); });
      return [lat*180/Math.PI, (lon0+Math.atan2(Math.sinh(h1),Math.cos(x1)))*180/Math.PI];
    }
  };
})();
const NG_RES0 = 133693.44; // z=0일 때 픽셀당 미터 (L05=2088.96 = z6)
const NG_CRS = L.extend({}, L.CRS.Earth, {
  code:'EPSG:5179',
  projection:{
    project: ll => { const [x,y] = NG_TM.forward(ll.lat, ll.lng); return L.point(x,y); },
    unproject: p => { const [lat,lng] = NG_TM.inverse(p.x, p.y); return L.latLng(lat,lng); },
    bounds: L.bounds([-200000,-28024123.62],[31824123.62,4000000]),
  },
  transformation: new L.Transformation(1, 200000, -1, 4000000),
  scale: z => Math.pow(2,z) / NG_RES0,
  zoom: s => Math.log2(s * NG_RES0),
  wrapLng: undefined, wrapLat: undefined, infinite:false,
});
const NGLayer = L.TileLayer.extend({
  getTileUrl(c){
    const m = 'L' + String(this._getZoomForUrl() - 1).padStart(2,'0');
    return `https://map.ngii.go.kr/openapi/Gettile.do?apikey=${NKEY}&service=WMTS&request=GetTile&version=1.0.0&layer=${this.options.ngLayer}&style=korean&format=image/png&tilematrixset=korean&tilematrix=${m}&tilerow=${c.y}&tilecol=${c.x}`;
  }
});
const NG = ngLayer => new NGLayer('', {ngLayer, minZoom:6, maxZoom:19, maxNativeZoom:19, bounds:[[32,123.5],[39.5,132.5]], attribution:'© 국토지리정보원'});
const BASES = {
  vbase:{ name:'브이월드 일반', desc:'한국 지도, 한글 지명 (국토교통부)', layer: () => VW('Base', 'png') },
  vsat: { name:'브이월드 위성', desc:'한국 항공사진 + 지명', layer: () => L.layerGroup([VW('Satellite', 'jpeg'), VW('Hybrid', 'png')]) },
  ngii: { name:'국토지리정보원 일반', desc:'등고선·한글 지명 (정부 공식 지도)', crs:NG_CRS, layer: () => NG('korean_map') },
  ngiib:{ name:'국토지리정보원 큰글씨', desc:'글자가 큰 지도', crs:NG_CRS, layer: () => NG('lowV_map') },
  topo: { name:'등산지도', desc:'등고선 포함 (OpenTopoMap)', layer: () => L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {subdomains:'abc', maxZoom:17, maxNativeZoom:17, attribution:'© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)'}) },
  osm:  { name:'일반지도', desc:'길·건물 위주 (OpenStreetMap)', layer: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap'}) },
  sat:  { name:'위성사진', desc:'항공·위성 영상 (Esri)', layer: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, maxNativeZoom:18, attribution:'Tiles © Esri'}) },
};
const v0 = db.view || { lat:36.5, lng:127.8, z:7 };
const map = L.map('map', { zoomControl:false, attributionControl:true, tap:true }).setView([v0.lat, v0.lng], v0.z);
L.control.scale({ imperial:false, position:'bottomleft' }).addTo(map);
/* 화면 높이 측정(앱 점검 화면에 표시). 2026-11-10 미러링 초반에 맨 아래 흰 띠가 보였으나 재현되지 않아 보정은 넣지 않았다. */
const isHomeApp = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
function screenInfo(){
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe), out = { vh:probe.offsetHeight, top:parseFloat(cs.paddingTop) || 0, bottom:parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  const portrait = window.innerHeight >= window.innerWidth;
  out.screen = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  out.inner = window.innerHeight; out.doc = document.documentElement.clientHeight;
  return out;
}
let baseLayer = null;
/* 지도 그림이 깨져서 오면 저장해 둔 것을 지우고 한 번 다시 받는다.
   (서버가 '거부' 같은 글자를 보냈는데 그것이 그림 자리에 저장돼 버린 경우를 스스로 고친다) */
function watchTiles(layer){
  if (layer.eachLayer) { layer.eachLayer(watchTiles); return; }
  layer.on('tileerror', e => {
    const t = e.tile;
    if (!t || t._again || !t.src || !('caches' in window)) return;
    t._again = true; const url = t.src;
    caches.open('sanhaeng-tiles-v1').then(c => c.delete(url)).then(() => { t.src = url; }).catch(() => {});
  });
}
function setBase(k){
  if (!BASES[k]) k = 'vbase';
  if (baseLayer) map.removeLayer(baseLayer);
  const crs = BASES[k].crs || L.CRS.EPSG3857;
  if (map.options.crs !== crs) { // 좌표계를 바꾸고 같은 위치를 다시 그린다 (표시·경로도 함께 다시 계산됨)
    const c = map.getCenter(), z = map.getZoom();
    map.options.crs = crs;
    map._resetView(c, z);
  }
  baseLayer = BASES[k].layer();
  watchTiles(baseLayer);
  baseLayer.addTo(map);
  db.base = k; save();
}
setBase(db.base);
map.on('moveend', () => { const c = map.getCenter(); db.view = { lat:+c.lat.toFixed(6), lng:+c.lng.toFixed(6), z:map.getZoom() }; save(); });

/* ---------- 공통 UI ---------- */
const $ = id => document.getElementById(id);
function openSheet(html){ $('sheet').innerHTML = html; $('sheet').style.display = 'block'; $('sheetBg').style.display = 'block';
  $('sheet').querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet); }
function closeSheet(){ $('sheet').style.display = 'none'; $('sheetBg').style.display = 'none'; }
$('sheetBg').onclick = closeSheet;
const head = (t) => `<h2>${t}<button class="x" data-close>${ICON.x}</button></h2>`;
function alertSheet(msg){ openSheet(head('알림') + `<p style="line-height:1.5">${msg}</p><button class="big" data-close>확인</button>`); }
let mode = null; // 'pin' | 'ruler' | null
function setMode(m, text){
  mode = m;
  $('bPin').classList.toggle('on', m === 'pin');
  $('bRuler').classList.toggle('on', m === 'ruler');
  $('banner').style.display = m ? 'flex' : 'none';
  if (m) $('bannerText').textContent = text;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtKm = m => m >= 1000 ? (m/1000).toFixed(2) + ' km' : Math.round(m) + ' m';
function showInfo(html){ const el = $('info'); if (html){ el.innerHTML = html; el.style.display = 'block'; } else el.style.display = 'none'; }

/* ---------- 지도 종류 ---------- */
$('bLayers').onclick = () => {
  openSheet(head('지도 종류') + Object.entries(BASES).map(([k,b]) =>
    `<button class="opt ${db.base===k?'sel':''}" data-k="${k}"><span>${b.name}<small>${b.desc}</small></span></button>`).join('') +
    `<p class="note">브이월드는 한국 지명이 정확하고, 국토지리정보원과 등산지도에는 등고선이 있어요. 한 번 본 지역은 신호가 없어도 다시 볼 수 있어요.</p>`);
  $('sheet').querySelectorAll('.opt').forEach(b => b.onclick = () => { setBase(b.dataset.k); closeSheet(); });
};

/* ---------- 내 위치 ---------- */
let watchId = null, meMarker = null, meCircle = null, follow = false, firstFix = false;
$('bLocate').onclick = () => {
  if (watchId !== null && follow) { stopLocate(); return; }
  if (watchId !== null) { follow = true; $('bLocate').classList.add('on'); if (meMarker) map.setView(meMarker.getLatLng(), Math.max(map.getZoom(), 15)); return; }
  if (!navigator.geolocation) { alertSheet('이 브라우저는 위치 기능을 지원하지 않아요.'); return; }
  follow = true; firstFix = true; $('bLocate').classList.add('on');
  showInfo('위치를 찾는 중…');
  watchId = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy:true, maximumAge:5000, timeout:20000 });
};
function stopLocate(){
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null; follow = false; $('bLocate').classList.remove('on');
  if (meMarker) { map.removeLayer(meMarker); map.removeLayer(meCircle); meMarker = meCircle = null; }
  showInfo(null);
}
function onPos(p){
  const ll = [p.coords.latitude, p.coords.longitude], acc = p.coords.accuracy;
  if (!meMarker) {
    meCircle = L.circle(ll, { radius:acc, color:'#1a73e8', weight:1, fillOpacity:.12 }).addTo(map);
    meMarker = L.marker(ll, { icon:L.divIcon({ className:'', html:'<div class="me"></div>', iconSize:[22,22], iconAnchor:[11,11] }), interactive:false }).addTo(map);
  } else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(acc); }
  if (firstFix) { map.setView(ll, Math.max(map.getZoom(), 15)); firstFix = false; }
  else if (follow) map.panTo(ll, { animate:true });
  const alt = p.coords.altitude != null ? ` · 고도 <b>${Math.round(p.coords.altitude)} m</b>` : '';
  if (mode !== 'ruler') showInfo(`위도 ${ll[0].toFixed(5)} · 경도 ${ll[1].toFixed(5)}${alt}<br><span style="color:var(--gray);font-size:18px">오차 약 ±${Math.round(acc)} m · 버튼 다시 누르면 위치 끄기</span>`);
}
function onPosErr(e){
  const msg = e.code === 1 ? '위치 권한이 꺼져 있어요. 아이폰 설정 → 개인정보 보호 → 위치 서비스 → Safari 웹 사이트를 "앱을 사용하는 동안"으로 바꿔 주세요.'
            : e.code === 3 ? '위치를 찾는 데 시간이 오래 걸려요. 하늘이 트인 곳에서 다시 눌러 보세요.' : '위치를 가져오지 못했어요.';
  stopLocate(); alertSheet(msg);
}
map.on('dragstart', () => { if (follow) { follow = false; $('bLocate').classList.remove('on'); } });

/* ---------- 내 표시(마커) ---------- */
const markLayer = L.layerGroup().addTo(map);
function pinIcon(k){ return L.divIcon({ className:'', html:`<div class="pin">${ICON[typeOf(k).icon]}</div>`, iconSize:[44,44], iconAnchor:[22,44], popupAnchor:[0,-40] }); }
function drawMarks(){
  markLayer.clearLayers();
  db.marks.forEach(m => {
    const mk = L.marker([m.lat, m.lng], { icon:pinIcon(m.type) }).addTo(markLayer);
    if (m.name) mk.bindTooltip(esc(m.name), { permanent:true, direction:'right', offset:[14,-26], className:'mlabel' });
    mk.bindPopup(() => {
      const d = document.createElement('div');
      d.innerHTML = `<b>${esc(m.name || typeOf(m.type).label)}</b><br><span style="color:#787878;font-size:18px">${typeOf(m.type).label} · ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}</span><br>`;
      const b = document.createElement('button'); b.textContent = '이 표시 지우기';
      b.onclick = () => removeMark(m.id);
      d.appendChild(b); return d;
    });
  });
}
drawMarks();
$('bPin').onclick = () => { if (mode === 'pin') setMode(null); else setMode('pin', '표시할 곳을 지도에서 누르세요'); };
function addMarkSheet(latlng){
  let sel = 'etc';
  openSheet(head('표시 추가') +
    `<div class="types">${TYPES.map(t => `<button data-k="${t.k}" class="${t.k===sel?'sel':''}">${ICON[t.icon]}${t.label}</button>`).join('')}</div>
     <input type="text" id="mName" placeholder="이름 (예: 계곡 물 뜨는 곳)" maxlength="40">
     <button class="big" id="mSave">저장</button><button class="sub" data-close>취소</button>`);
  $('sheet').querySelectorAll('.types button').forEach(b => b.onclick = () => {
    sel = b.dataset.k; $('sheet').querySelectorAll('.types button').forEach(x => x.classList.toggle('sel', x === b)); });
  $('mSave').onclick = () => {
    const ll = L.latLng(latlng).wrap();
    const m = SyncCore.cleanMark({ id:SyncCore.newId(), type:sel, name:$('mName').value, lat:ll.lat, lng:ll.lng });
    if (m) { db.marks.push(m); saveData(); drawMarks(); }
    closeSheet(); setMode(null);
  };
}

/* ---------- 거리 재기 ---------- */
let rulerPts = [], rulerLine = null, rulerDots = L.layerGroup().addTo(map);
function rulerTotal(){ let s = 0; for (let i = 1; i < rulerPts.length; i++) s += map.distance(rulerPts[i-1], rulerPts[i]); return s; }
function rulerUpdate(){
  if (rulerLine) map.removeLayer(rulerLine);
  rulerLine = rulerPts.length > 1 ? L.polyline(rulerPts, { color:'#E83828', weight:5, dashArray:'10 8' }).addTo(map) : null;
  showInfo(rulerPts.length < 2 ? '지점을 차례로 누르세요' : `총 거리 <b>${fmtKm(rulerTotal())}</b> · 지점 ${rulerPts.length}개`);
}
function rulerClear(){ rulerPts = []; rulerDots.clearLayers(); if (rulerLine) map.removeLayer(rulerLine); rulerLine = null; }
$('bRuler').onclick = () => {
  if (mode === 'ruler') { setMode(null); rulerClear(); showInfo(null); return; }
  setMode('ruler', '지점을 차례로 눌러 거리를 재요'); rulerClear(); rulerUpdate();
};

/* ---------- 지도 누르기 ---------- */
map.on('click', e => {
  if (mode === 'pin') addMarkSheet(e.latlng);
  else if (mode === 'ruler') {
    rulerPts.push(e.latlng);
    L.circleMarker(e.latlng, { radius:8, color:'#fff', weight:3, fillColor:'#E83828', fillOpacity:1 }).addTo(rulerDots);
    rulerUpdate();
  }
});
$('bannerBtn').onclick = () => { if (mode === 'ruler') { rulerClear(); showInfo(null); } setMode(null); };

/* ---------- GPX ---------- */
const trackLayer = L.layerGroup().addTo(map);
const TRACK_COLORS = ['#E83828', '#1a73e8', '#7b2cbf', '#e07a00', '#0a8f5a'];
function parseGpx(text, fname){
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('GPX 파일을 읽지 못했어요.');
  const pick = tag => Array.from(xml.getElementsByTagName(tag));
  let pts = pick('trkpt'); if (!pts.length) pts = pick('rtept');
  const coords = pts.map(p => { const e = p.getElementsByTagName('ele')[0];
    return [+(+p.getAttribute('lat')).toFixed(6), +(+p.getAttribute('lon')).toFixed(6), e ? Math.round(+e.textContent) : null]; })
    .filter(c => isFinite(c[0]) && isFinite(c[1]));
  const wpts = pick('wpt').map(w => { const n = w.getElementsByTagName('name')[0];
    return { lat:+w.getAttribute('lat'), lng:+w.getAttribute('lon'), name:n ? n.textContent.trim() : '' }; });
  const nm = (xml.querySelector('trk > name, rte > name, metadata > name') || {}).textContent;
  if (!coords.length && !wpts.length) throw new Error('파일 안에 경로나 지점이 없어요.');
  const t = SyncCore.cleanTrack({ id:SyncCore.newId(), name:(nm && nm.trim()) || fname.replace(/\.gpx$/i, ''), coords, wpts });
  if (!t) throw new Error('파일 안에 경로나 지점이 없어요.');
  return t;
}
function trackStats(t){
  let dist = 0, up = 0, down = 0, hi = null, lo = null, prevE = null;
  t.coords.forEach((c, i) => {
    if (i) dist += map.distance([t.coords[i-1][0], t.coords[i-1][1]], [c[0], c[1]]);
    if (c[2] != null) {
      hi = hi == null ? c[2] : Math.max(hi, c[2]); lo = lo == null ? c[2] : Math.min(lo, c[2]);
      if (prevE != null) { const d = c[2] - prevE; if (Math.abs(d) >= 3) { if (d > 0) up += d; else down -= d; prevE = c[2]; } } else prevE = c[2];
    }
  });
  return { dist, up, down, hi, lo };
}
function statText(t){
  const s = trackStats(t);
  return `${fmtKm(s.dist)}` + (s.hi != null ? ` · 오르막 ${Math.round(s.up)} m · 최고 ${s.hi} m` : '');
}
function drawTracks(){
  trackLayer.clearLayers();
  db.tracks.forEach((t, i) => {
    const col = TRACK_COLORS[i % TRACK_COLORS.length];
    if (t.coords.length > 1) {
      L.polyline(t.coords.map(c => [c[0], c[1]]), { color:'#fff', weight:9, opacity:.85 }).addTo(trackLayer);
      L.polyline(t.coords.map(c => [c[0], c[1]]), { color:col, weight:5 }).addTo(trackLayer)
        .bindPopup(`<b>${esc(t.name)}</b><br>${statText(t)}`);
    }
    t.wpts.forEach(w => L.circleMarker([w.lat, w.lng], { radius:8, color:'#fff', weight:3, fillColor:col, fillOpacity:1 })
      .addTo(trackLayer).bindPopup(`<b>${esc(w.name || '지점')}</b><br><span style="font-size:18px;color:#787878">${esc(t.name)}</span>`));
  });
}
function trackBounds(t){ const all = t.coords.map(c => [c[0], c[1]]).concat(t.wpts.map(w => [w.lat, w.lng])); return L.latLngBounds(all); }
drawTracks();
$('bGpx').onclick = () => $('gpxFile').click();
$('gpxFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const t = parseGpx(await f.text(), f.name);
    db.tracks.push(t);
    if (!saveData()) { db.tracks.pop(); return; }
    drawTracks();
    map.fitBounds(trackBounds(t), { padding:[40,40] });
    showInfo(`<b>${esc(t.name)}</b><br>${statText(t)}`);
  } catch(err) { alertSheet(err.message); }
};

/* ---------- 목록 ---------- */
$('bList').onclick = openList;
function openList(){
  const ms = db.marks.map(m => `<div class="row"><span class="name">${esc(m.name || typeOf(m.type).label)}<small>${typeOf(m.type).label}</small></span>
      <button data-go-m="${esc(m.id)}">보기</button><button class="del" data-del-m="${esc(m.id)}">지우기</button></div>`).join('') || '<div class="empty">아직 없어요. 오른쪽 핀 버튼으로 추가하세요.</div>';
  const ts = db.tracks.map(t => `<div class="row"><span class="name">${esc(t.name)}<small>${statText(t)}</small></span>
      <button data-go-t="${esc(t.id)}">보기</button><button class="del" data-del-t="${esc(t.id)}">지우기</button></div>`).join('') || '<div class="empty">아직 없어요. 경로 버튼으로 GPX 파일을 불러오세요.</div>';
  openSheet(head('내 목록') + `<h3>내 표시 (${db.marks.length})</h3>${ms}<h3>GPX 경로 (${db.tracks.length})</h3>${ts}
    <h3>기기 간 동기화</h3><div id="syBox">${syncHtml()}</div>
    <h3>백업</h3>
    <button class="sub" id="bExport">백업 파일로 내보내기</button>
    <button class="sub" id="bImport">백업 파일 불러오기</button>
    <p class="note">표시와 경로는 이 기기에 저장돼요. 동기화를 켜지 않았다면 사파리 방문 기록·데이터를 지울 때 함께 사라지니 가끔 백업해 두세요.</p>
    <h3>점검</h3>
    <button class="sub" id="bCheck">앱 점검 (지도·검색이 안 될 때)</button>`);
  const sh = $('sheet');
  sh.querySelectorAll('[data-go-m]').forEach(b => b.onclick = () => { const m = db.marks.find(x => x.id === b.dataset.goM); if (!m) return openList(); closeSheet(); map.setView([m.lat, m.lng], Math.max(map.getZoom(), 15)); });
  sh.querySelectorAll('[data-del-m]').forEach(b => b.onclick = () => { removeMark(b.dataset.delM); openList(); });
  sh.querySelectorAll('[data-go-t]').forEach(b => b.onclick = () => { const t = db.tracks.find(x => x.id === b.dataset.goT); if (!t) return openList(); closeSheet(); map.fitBounds(trackBounds(t), { padding:[40,40] }); showInfo(`<b>${esc(t.name)}</b><br>${statText(t)}`); });
  sh.querySelectorAll('[data-del-t]').forEach(b => b.onclick = () => { removeTrack(b.dataset.delT); openList(); });
  $('bExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ marks:db.marks, tracks:db.tracks }, null, 1)], { type:'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `산행지도_백업_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove();
  };
  $('bImport').onclick = () => $('backupFile').click();
  $('bCheck').onclick = runCheck;
  bindSync();
}
$('backupFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()) || {};
    const have = new Set(db.marks.map(m => m.id).concat(db.tracks.map(t => t.id)));
    const take = (list, fn, pre, into) => SyncCore.cleanList(list, fn).forEach(x => { // 백업 파일도 형식을 검사한 것만 받는다
      if (have.has(x.id)) return;
      if (hasOwn(db.gone, pre + x.id)) x.id = SyncCore.newId();      // 지웠던 것을 백업에서 되살릴 때는 새 번호로
      have.add(x.id); into.push(x);
    });
    take(d.marks, SyncCore.cleanMark, 'm:', db.marks); take(d.tracks, SyncCore.cleanTrack, 't:', db.tracks);
    saveData(); drawMarks(); drawTracks(); openList();
  } catch(err) { alertSheet('백업 파일을 읽지 못했어요.'); }
};

/* ---------- 장소 검색 (브이월드 검색 API) ----------
   브이월드 서버가 주는 코드는 앱 저장 공간(표시·동기화 열쇠)에 손댈 수 없는 격리된 틀(search.html) 안에서만 실행한다.
   틀이 돌려준 결과는 믿지 않고, 글자·숫자인지 검사한 뒤에만 쓴다. */
let sFrame = null, sReady = null, sN = 0;
const sWait = new Map();
window.addEventListener('message', e => {
  if (!sFrame || e.source !== sFrame.contentWindow || !e.data || typeof e.data !== 'object') return;
  if (e.data.kind === 'vw-ready' && sFrame._ok) sFrame._ok();
  if (e.data.kind === 'vw-result' && sWait.has(e.data.id)) { const f = sWait.get(e.data.id); sWait.delete(e.data.id); f(e.data.data); }
});
function searchFrame(){
  if (sReady) return sReady;
  sReady = new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    const t = setTimeout(() => { f.remove(); sFrame = null; sReady = null; reject(new Error('frame')); }, 8000);
    f._ok = () => { clearTimeout(t); resolve(); };
    sFrame = f; f.src = 'search.html'; document.body.appendChild(f);
  });
  return sReady;
}
function jsonp(params){
  return searchFrame().then(() => new Promise(resolve => {
    const id = ++sN; sWait.set(id, resolve);
    setTimeout(() => { if (sWait.delete(id)) resolve(null); }, 9000);
    sFrame.contentWindow.postMessage({ kind:'vw-search', id, params:Object.assign({ key:VKEY }, params) }, '*');
  })).catch(() => null);
}
const itemsOf = d => { const it = d && d.response && d.response.status === 'OK' && d.response.result && d.response.result.items; return Array.isArray(it) ? it.filter(i => i && typeof i === 'object') : []; };
const sTxt = v => (typeof v === 'string' ? v.slice(0, 120) : '');
const sPt = i => (i.point && typeof i.point === 'object' ? { lat:parseFloat(i.point.y), lng:parseFloat(i.point.x) } : { lat:NaN, lng:NaN });
const sAddr = i => (i.address && typeof i.address === 'object' ? i.address : {});
async function searchPlaces(q){
  const near = map.getCenter();
  const [pl, rd, pc, ds] = await Promise.all([
    jsonp({ query:q, type:'place' }),
    jsonp({ query:q, type:'address', category:'road' }),
    jsonp({ query:q, type:'address', category:'parcel' }),
    jsonp({ query:q, type:'district', category:'L4' }),
  ]);
  const out = [];
  const qq = q.replace(/\s/g,'');
  db.marks.filter(m => (m.name || '').replace(/\s/g,'').includes(qq)).forEach(m => out.push({ tag:'내 표시', title:m.name, sub:typeOf(m.type).label, lat:m.lat, lng:m.lng }));
  itemsOf(pl).forEach(i => { const a = sAddr(i); out.push(Object.assign({ tag:'장소', title:sTxt(i.title), sub:sTxt(a.road) || sTxt(a.parcel) || sTxt(i.category) }, sPt(i))); });
  itemsOf(rd).concat(itemsOf(pc)).forEach(i => { const a = sAddr(i); out.push(Object.assign({ tag:'주소', title:sTxt(a.road) || sTxt(a.parcel), sub:sTxt(a.road) && sTxt(a.parcel) ? '지번 ' + sTxt(a.parcel) : '' }, sPt(i))); });
  itemsOf(ds).forEach(i => out.push(Object.assign({ tag:'지역', title:sTxt(i.title), sub:'' }, sPt(i))));
  for (let i = out.length - 1; i >= 0; i--) { const r = out[i]; if (!r.title || !(Math.abs(r.lat) <= 90) || !(Math.abs(r.lng) <= 180)) out.splice(i, 1); }
  // 같은 이름이 1km 안에 여러 개면 하나만, 지금 보는 곳과 가까운 순(내 표시는 맨 위)
  const uniq = [];
  out.forEach(r => { if (!uniq.some(u => u.title === r.title && map.distance([u.lat,u.lng],[r.lat,r.lng]) < 1000)) uniq.push(r); });
  return uniq.map(r => Object.assign(r, { d: map.distance(near, [r.lat, r.lng]) }))
    .sort((a, b) => (a.tag === '내 표시' ? -1 : 0) - (b.tag === '내 표시' ? -1 : 0) || a.d - b.d).slice(0, 30);
}
let hitMarker = null;
function showHit(r){
  if (hitMarker) map.removeLayer(hitMarker);
  hitMarker = L.marker([r.lat, r.lng], { icon:L.divIcon({ className:'', html:'<div class="hit"></div>', iconSize:[26,26], iconAnchor:[13,13], popupAnchor:[0,-12] }) }).addTo(map);
  const d = document.createElement('div');
  d.innerHTML = `<b>${esc(r.title)}</b>${r.sub ? `<br><span style="color:#787878;font-size:18px">${esc(r.sub)}</span>` : ''}<br>`;
  const b = document.createElement('button'); b.textContent = '여기에 표시 추가';
  b.style.cssText = 'border-color:#E83828;background:#E83828;color:#fff;font-weight:700';
  b.onclick = () => { map.closePopup(); const name = r.tag === '주소' ? '' : r.title; addMarkSheet(L.latLng(r.lat, r.lng)); const inp = $('mName'); if (inp) inp.value = name; };
  d.appendChild(b);
  hitMarker.bindPopup(d).on('popupclose', () => {});
  map.setView([r.lat, r.lng], Math.max(map.getZoom(), 16));
  setTimeout(() => hitMarker && hitMarker.openPopup(), 350);
}
let lastQ = '', lastRes = [];
function resultsHtml(list){
  if (!list) return '';
  if (!list.length) return `<p class="empty" style="line-height:1.5">찾은 곳이 없어요.<br>캠핑장·식당 이름은 안 나올 때가 많아요. <b>도로명 주소</b>(예: 민주지산로 765)나 <b>산 이름·면 이름</b>으로 찾아 보세요.</p>`;
  return list.map((r, i) => `<button class="res" data-i="${i}"><span class="tag">${r.tag}</span>${esc(r.title)}<small>${esc(r.sub || '')}${r.sub ? ' · ' : ''}지금 화면에서 ${fmtKm(r.d)}</small></button>`).join('');
}
function openSearch(){
  openSheet(head('장소 검색') + `<form class="sbox" id="sForm"><input type="text" id="sQ" enterkeyhint="search" placeholder="산·주소·지명 (예: 민주지산)" value="${esc(lastQ)}"><button type="submit">찾기</button></form>
    <div id="sRes">${resultsHtml(lastQ ? lastRes : null)}</div>
    <p class="note">산·마을·면 이름, 도로명 주소, 내가 저장한 표시 이름으로 찾을 수 있어요. 인터넷이 될 때만 돼요.</p>`);
  const bind = () => $('sRes').querySelectorAll('.res').forEach(b => b.onclick = () => { closeSheet(); showHit(lastRes[+b.dataset.i]); });
  bind();
  $('sForm').onsubmit = async e => {
    e.preventDefault();
    const q = $('sQ').value.trim(); if (!q) return;
    $('sQ').blur(); $('sRes').innerHTML = '<p class="empty">찾는 중…</p>';
    try { lastRes = await searchPlaces(q); } catch (err) { lastRes = []; }
    lastQ = q; $('sRes').innerHTML = resultsHtml(lastRes); bind();
  };
  if (!lastQ) setTimeout(() => $('sQ').focus(), 100);
}
$('bSearch').onclick = openSearch;

/* ---------- 기기 간 동기화 (깃허브 비공개 저장소 trail-map-data) ----------
   열쇠는 이 기기에만 두고 깃허브로만 보낸다. 백업 파일·주소창에는 넣지 않는다. */
const SYNC_KEY = 'sanhaeng-sync-v1';
const SYNC_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'; // 개발할 때만: 내 컴퓨터의 시험용 서버
const SYNC_REPO = { api: SYNC_LOCAL ? location.origin + '/mockapi' : 'https://api.github.com', owner:'malgu38-cmd', repo:'trail-map-data' };
const sy = Object.assign({ token:'', last:0 }, (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch(e){ return {}; } })());
if (typeof sy.token !== 'string') sy.token = '';
if (typeof sy.last !== 'number') sy.last = 0;
let syState = sy.token ? 'idle' : 'off', syPending = null, syRunning = false, syAgain = false, syDirty = false, syTimer = null, syLastRun = 0;
const sySkip = new Set(); // 저장 공간이 부족해 이 기기에 받지 못한 경로
const listOpen = () => $('sheet').style.display === 'block' && !!$('syBox'); // 목록 창이 지금 보이는지
const syncIo = token => SyncCore.makeIo(Object.assign({ token, fetchFn:(u, o) => fetch(u, o) }, SYNC_REPO));
function sySave(){ try { localStorage.setItem(SYNC_KEY, JSON.stringify({ token:sy.token, last:sy.last })); } catch(e){} }
function syTime(t){ const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`; }
function sySet(state){
  syState = state;
  $('bList').classList.toggle('warn', state === 'auth' || state === 'access' || state === 'confirm');
  if (listOpen()) { $('syBox').innerHTML = syncHtml(); bindSync(); }
}
function syncHtml(){
  if (!sy.token) return `<p class="note" style="margin-top:0">맥과 아이폰의 표시·경로를 자동으로 맞춰요. 깃허브에서 만든 열쇠를 아래 칸에 붙여 넣으세요.</p>
    <input type="password" id="syTok" placeholder="열쇠 붙여 넣기" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false">
    <button class="big" id="syOn">연결</button><p class="note" id="syMsg" style="color:var(--red)"></p>`;
  const last = `<small>${sy.last ? '마지막으로 맞춘 때: ' + syTime(sy.last) : '아직 한 번도 맞추지 못했어요'}</small>`;
  const T = ({
    idle:    ['', '동기화됨' + last],
    busy:    ['', '동기화하는 중…' + last],
    wait:    ['', '인터넷이 안 돼요. 연결되면 자동으로 맞춰요.' + last],
    limit:   ['', '깃허브가 잠시 요청을 막았어요. 조금 뒤에 다시 맞춰요.' + last],
    err:     ['', '이번에는 맞추지 못했어요. 조금 뒤에 다시 해 볼게요.' + last],
    auth:    ['bad', '열쇠가 맞지 않거나 지워졌어요. 연결을 끊고 열쇠를 다시 넣어 주세요.'],
    access:  ['bad', '저장소에 쓸 수 없어요. 열쇠를 만들 때 저장소 trail-map-data 와 쓰기 권한(Contents: Read and write)을 골랐는지 확인해 주세요.'],
    confirm: ['bad', '다른 기기에서 지운 항목이 있어요. 확인해 주세요.'],
  })[syState] || ['', '동기화 대기 중' + last];
  const skip = sySkip.size ? `<p class="note">저장 공간이 부족해서 경로 ${sySkip.size}개는 이 기기에 받지 못했어요. 안 쓰는 경로를 지운 뒤 "지금 동기화"를 눌러 주세요.</p>` : '';
  return `<p class="stat ${T[0]}">${T[1]}</p>${skip}`
    + (syState === 'confirm' ? '<button class="big" id="syAskBtn">지운 항목 확인하기</button>' : '<button class="sub" id="syNow">지금 동기화</button>')
    + '<button class="sub" id="syOff">연결 끊기</button>';
}
function bindSync(){
  const on = $('syOn');
  if (on) on.onclick = async () => {
    const tok = $('syTok').value.trim(), msg = $('syMsg');
    if (tok.length < 20 || /\s/.test(tok)) { msg.textContent = '열쇠를 처음부터 끝까지 복사해서 붙여 넣어 주세요.'; return; }
    on.disabled = true; on.textContent = '확인하는 중…'; msg.textContent = '';
    try {
      await syncIo(tok).checkAccess();
      sy.token = tok; sy.last = 0; sySave(); sySet('idle'); syncRun();
    } catch (e) {
      on.disabled = false; on.textContent = '연결';
      msg.textContent = e.code === 'offline' ? '인터넷이 안 돼요. 연결된 곳에서 다시 눌러 주세요.'
        : e.code === 'auth' ? '열쇠가 맞지 않아요. 다시 복사해서 붙여 넣어 주세요.'
        : e.code === 'access' ? '이 열쇠로는 저장소 trail-map-data 에 들어갈 수 없어요. 열쇠를 만들 때 그 저장소를 골랐는지 확인해 주세요.'
        : '확인하지 못했어요. 조금 뒤에 다시 눌러 주세요.';
    }
  };
  const now = $('syNow'); if (now) now.onclick = () => { sySkip.clear(); syncRun(); };
  const ask = $('syAskBtn'); if (ask) ask.onclick = () => { closeSheet(); askSyncDelete(); };
  const off = $('syOff'); if (off) off.onclick = () => {
    sy.token = ''; sy.last = 0; syPending = null; syDirty = false; clearTimeout(syTimer);
    try { localStorage.removeItem(SYNC_KEY); } catch(e){}
    sySet('off');
  };
}
/* 저장소에서 받은 변경을 이 기기에 반영한다. 통째로 바꾸지 않고 더하고 빼기만 해서, 동기화 도중에 추가한 표시가 사라지지 않는다. */
function applySync(res){
  let ch = false;
  for (const k of Object.keys(res.gone)) if (!hasOwn(db.gone, k)) { db.gone[k] = res.gone[k]; ch = true; }
  const dm = new Set(res.removeMarkIds), dt = new Set(res.removeTrackIds);
  if (db.marks.some(m => dm.has(m.id))) { db.marks = db.marks.filter(m => !dm.has(m.id)); ch = true; }
  if (db.tracks.some(t => dt.has(t.id))) { db.tracks = db.tracks.filter(t => !dt.has(t.id)); ch = true; }
  res.addMarks.forEach(m => { if (!hasOwn(db.gone, 'm:' + m.id) && !db.marks.some(x => x.id === m.id)) { db.marks.push(m); ch = true; } });
  if (ch) save(true);
  res.addTracks.forEach(t => {
    if (hasOwn(db.gone, 't:' + t.id) || db.tracks.some(x => x.id === t.id)) return;
    db.tracks.push(t);
    if (save(true)) ch = true; else { db.tracks.pop(); sySkip.add(t.id); } // 저장 공간이 모자라면 이 경로만 건너뛴다(지운 것으로 치지 않음)
  });
  if (ch) { drawMarks(); drawTracks(); if (listOpen()) openList(); }
}
async function syncRun(opts){
  if (!sy.token) return;
  if (syRunning) { syAgain = true; return; }
  syRunning = true; syAgain = false; syDirty = false; syLastRun = Date.now(); clearTimeout(syTimer);
  const token = sy.token;
  sySet('busy');
  let state = 'idle';
  try {
    for (let i = 0; ; i++) {
      try {
        const snap = { marks:db.marks.slice(), tracks:db.tracks.slice(), gone:Object.assign({}, db.gone) };
        const res = await SyncCore.syncOnce(syncIo(token), snap, { skip:sySkip, allowDelete:!!(opts && opts.allowDelete === true) });
        if (sy.token !== token) { syRunning = false; return; }          // 도중에 연결을 끊었으면 아무것도 반영하지 않는다
        if (res.needConfirm) { syPending = res.needConfirm; state = 'confirm'; break; }
        syPending = null; applySync(res); sy.last = Date.now(); sySave(); break;
      } catch (e) {
        if (sy.token !== token) { syRunning = false; return; }
        if (e && e.partial) applySync(e.partial);
        if (e && e.code === 'conflict' && i < 3) { await new Promise(r => setTimeout(r, 500 * (i + 1))); continue; } // 다른 기기와 동시에 저장: 다시 읽어 합친다
        throw e;
      }
    }
  } catch (e) {
    const c = e && e.code;
    state = c === 'offline' ? 'wait' : c === 'auth' ? 'auth' : c === 'access' ? 'access' : c === 'busy' ? 'limit' : 'err';
    if (state === 'err' || state === 'limit') syTimer = setTimeout(syncRun, 60000);
  }
  syRunning = false; sySet(state);
  if (state === 'confirm') askSyncDelete();
  else if (state === 'idle' && (syAgain || syDirty)) syTimer = setTimeout(syncRun, 800);
}
function syncSoon(){ if (!sy.token) return; syDirty = true; if (syRunning) { syAgain = true; return; } clearTimeout(syTimer); syTimer = setTimeout(syncRun, 2000); }
/* 한꺼번에 여러 개가 지워지는 경우: 먼저 물어본다 */
function askSyncDelete(){
  if (!syPending) return;
  if ($('sheet').style.display === 'block') return; // 다른 창을 쓰는 중이면 끼어들지 않는다(목록 버튼의 빨간 점과 목록 화면에서 확인)
  const mi = new Set(syPending.markIds), ti = new Set(syPending.trackIds);
  const names = db.marks.filter(m => mi.has(m.id)).map(m => m.name || typeOf(m.type).label).concat(db.tracks.filter(t => ti.has(t.id)).map(t => t.name));
  if (!names.length) { syPending = null; syncRun(); return; }
  openSheet(head('지운 항목 확인') + `<p style="line-height:1.5;margin-top:0">다른 기기에서 지운 항목이 <b>${names.length}개</b> 있어요. 이 기기에서도 지울까요?</p>
    <p class="note" style="margin-top:0">${names.slice(0, 8).map(esc).join(', ')}${names.length > 8 ? ` 외 ${names.length - 8}개` : ''}</p>
    <button class="big" id="syDel">이 기기에서도 지우기</button><button class="sub" id="syKeep">지우지 않고 남겨 두기</button>
    <p class="note">남겨 두면 다른 기기에도 다시 생겨요.</p>`);
  $('syDel').onclick = () => { closeSheet(); syncRun({ allowDelete:true }); };
  $('syKeep').onclick = () => { // 새 번호를 붙여 새 항목으로 남긴다(지운 기록은 옛 번호에만 해당)
    db.marks.forEach(m => { if (mi.has(m.id)) m.id = SyncCore.newId(); });
    db.tracks.forEach(t => { if (ti.has(t.id)) t.id = SyncCore.newId(); });
    syPending = null; save(); drawMarks(); drawTracks(); closeSheet(); syncRun();
  };
}
$('bList').classList.toggle('warn', false);
if (sy.token) setTimeout(syncRun, 1200);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sy.token && (syDirty || Date.now() - syLastRun > 30000)) syncRun(); });
window.addEventListener('online', () => { if (sy.token) syncRun(); });

/* ---------- 앱 점검: 지도·검색이 안 될 때 어디서 막혔는지 이 기기에서 직접 확인 ---------- */
async function runCheck(){
  openSheet(head('앱 점검') + '<p class="empty">점검하는 중… 20초쯤 걸릴 수 있어요.</p>');
  const rows = [];
  const line = (name, ok, detail) => rows.push(`<div class="row"><span class="name">${esc(name)}<small>${esc(detail || '')}</small></span><b style="white-space:nowrap;color:${ok === null ? 'var(--gray)' : ok ? '#0a8f5a' : 'var(--red)'}">${ok === null ? '' : ok ? '정상' : '안 됨'}</b></div>`);
  const limit = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('시간 초과')), ms))]);
  const timed = async fn => { const t = Date.now(); try { return [true, String(await fn()), Date.now() - t]; } catch (e) { return [false, ((e && e.name) || '오류') + ': ' + ((e && e.message) || e), Date.now() - t]; } };
  const img = url => limit(new Promise((res, rej) => { const i = new Image(); i.onload = () => res('받음'); i.onerror = () => rej(new Error('그림을 받지 못함')); i.src = url; }), 12000);
  const ll = L.latLng(35.5 + Math.random() * 2, 127 + Math.random() * 1.5); // 저장돼 있지 않을 만한 곳을 새로 받아 본다
  const xy = (crs, z) => crs.latLngToPoint(ll, z).divideBy(256).floor();
  const p = xy(L.CRS.EPSG3857, 13), q = xy(NG_CRS, 13), p2 = xy(L.CRS.EPSG3857, 14);
  const ua = navigator.userAgent, os = (/OS (\d+[_\d]*) like Mac/.exec(ua) || /Mac OS X (\d+[_\d]*)/.exec(ua) || [])[1];
  const home = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  line('기기', null, `${/iPhone|iPad/.test(ua) ? '아이폰/아이패드' : '컴퓨터'} · 시스템 ${os ? os.replace(/_/g, '.') : '알 수 없음'} · ${home ? '홈 화면 앱' : '브라우저'} · 인터넷 ${navigator.onLine ? '연결됨' : '끊김'}`);
  const tests = [
    ['브이월드 지도 그림', `https://api.vworld.kr/req/wmts/1.0.0/${VKEY}/Base/13/${p.y}/${p.x}.png`],
    ['국토지리정보원 지도 그림', `https://map.ngii.go.kr/openapi/Gettile.do?apikey=${NKEY}&service=WMTS&request=GetTile&version=1.0.0&layer=korean_map&style=korean&format=image/png&tilematrixset=korean&tilematrix=L12&tilerow=${q.y}&tilecol=${q.x}`],
    ['등산지도 그림', `https://a.tile.opentopomap.org/13/${p.x}/${p.y}.png`],
    ['일반지도 그림', `https://tile.openstreetmap.org/13/${p.x}/${p.y}.png`],
    ['위성사진 그림', `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/13/${p.y}/${p.x}`],
  ];
  const res = await Promise.all(tests.map(t => timed(() => img(t[1]))));
  tests.forEach((t, i) => line(t[0], res[i][0], `${res[i][1]} · ${res[i][2]}ms`));
  // 서버까지 연결 자체가 되는지 (오프라인 저장 장치를 거치지 않는 요청)
  const vs = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=1&page=1&format=json&errorformat=json&type=place&query=${encodeURIComponent('서울')}&key=${VKEY}`;
  let r = await timed(() => limit(fetch(vs, { mode:'no-cors', cache:'no-store' }), 12000).then(() => '연결됨'));
  line('브이월드 서버 연결', r[0], `${r[1]} · ${r[2]}ms`);
  r = await timed(() => limit(fetch('https://map.ngii.go.kr/', { mode:'no-cors', cache:'no-store' }), 12000).then(() => '연결됨'));
  line('국토지리정보원 서버 연결', r[0], `${r[1]} · ${r[2]}ms`);
  // 브이월드가 실제로 뭐라고 답하는지 (응답 번호와 내용)
  r = await timed(async () => {
    const f = await limit(fetch(`https://api.vworld.kr/req/wmts/1.0.0/${VKEY}/Base/14/${p2.y}/${p2.x}.png`, { cache:'no-store' }), 12000);
    const ct = f.headers.get('content-type') || '종류 없음';
    const body = ct.indexOf('image') === 0 ? (await f.blob()).size + 'B' : (await f.text()).replace(/\s+/g, ' ').slice(0, 90);
    if (!f.ok || ct.indexOf('image') !== 0) throw new Error(`응답 ${f.status} · ${ct} · ${body}`);
    return `응답 ${f.status} · ${ct} · ${body}`;
  });
  line('브이월드 응답 내용', r[0], `${r[1]} · ${r[2]}ms`);
  // 국토지리정보원이 실제로 뭐라고 답하는지 (등록 주소가 안 실려 가면 Access_Denied)
  r = await timed(async () => {
    const f = await limit(fetch(tests[1][1].replace(/tilecol=(\d+)/, (m, c) => 'tilecol=' + (+c + 1)), { cache:'no-store' }), 12000);
    const ct = f.headers.get('content-type') || '종류 없음';
    const body = ct.indexOf('image') === 0 ? (await f.blob()).size + 'B' : (await f.text()).replace(/\s+/g, ' ').slice(0, 90);
    if (!f.ok || ct.indexOf('image') !== 0) throw new Error(`응답 ${f.status} · ${ct} · ${body}`);
    return `응답 ${f.status} · ${ct} · ${body}`;
  });
  line('국토지리정보원 응답 내용', r[0], `${r[1]} · ${r[2]}ms`);
  // 브이월드의 다른 주소들도 막혔는지
  for (const u of ['https://api.vworld.kr/', 'https://www.vworld.kr/', 'https://map.vworld.kr/']) {
    r = await timed(() => limit(fetch(u, { mode:'no-cors', cache:'no-store' }), 12000).then(() => '연결됨'));
    line(u.replace('https://', '').replace('/', '') + ' 연결', r[0], `${r[1]} · ${r[2]}ms`);
  }
  // 이 기기가 인터넷으로 나가는 위치 (해외 경유·VPN·비공개 릴레이면 한국 정부 서버가 막을 수 있음)
  r = await timed(async () => {
    const t = await (await limit(fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache:'no-store' }), 12000)).text();
    const g = k => (new RegExp('^' + k + '=(.*)$', 'm').exec(t) || [])[1] || '?';
    return `나라 ${g('loc')} · 주소 ${g('ip')} · 경유지 ${g('colo')} · warp ${g('warp')}`;
  });
  line('인터넷 나가는 위치', r[0] ? null : false, `${r[1]} · ${r[2]}ms`);
  r = await timed(async () => { const d = await jsonp({ query:'서울', type:'place' }); if (d === null) throw new Error('응답 없음'); const st = d && d.response && d.response.status; if (st !== 'OK') throw new Error('상태 ' + String(st).slice(0, 30)); return `결과 ${itemsOf(d).length}건`; });
  line('장소 검색', r[0], `${r[1]} · ${r[2]}ms`);
  let sw = '없음', cache = '';
  try { sw = navigator.serviceWorker && navigator.serviceWorker.controller ? '켜짐' : '꺼짐'; const ks = await caches.keys(); const n = ks.includes('sanhaeng-tiles-v1') ? (await (await caches.open('sanhaeng-tiles-v1')).keys()).length : 0; cache = ` · ${ks.join(', ')} · 저장된 그림 ${n}장`; } catch (e) { cache = ' · 저장소 확인 실패'; }
  line('오프라인 저장', null, sw + cache);
  const si = screenInfo();
  line('화면 높이', null, `기기 ${si.screen} · 앱이 받은 높이 ${si.inner} · 문서 ${si.doc} · 100vh ${si.vh} · 위 여백 ${si.top} · 아래 여백 ${si.bottom} · 지도 ${$('map').offsetHeight}`);
  line('동기화', null, sy.token ? `연결됨 · 상태 ${syState}` : '연결 안 함');
  line('접속 제한에 걸린 요청', cspLog.length ? false : true, cspLog.length ? cspLog.join(' / ') : '없음');
  openSheet(head('앱 점검') + rows.join('') + `<p class="note">${syTime(Date.now())} 점검. 안 되는 항목이 있으면 이 화면을 캡처해 두세요.</p><button class="sub" id="ckAgain">다시 점검</button>`);
  $('ckAgain').onclick = runCheck;
}

/* ---------- 오프라인 (본 지역 지도 저장) ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

'use strict';
/* 산행지도 기기 간 동기화 — 화면과 무관한 부분 (자료 검사, 합치기 규칙, 깃허브 저장소 읽고 쓰기)
   저장소 구조:  data.json = { v:1, marks:[...], gone:{ "m:<id>":시각, "t:<id>":시각 } }
                 tracks/<id>.json = GPX 경로 하나 (한 번 올리면 내용이 바뀌지 않음)
   규칙: 추가된 것은 모두 남긴다. 지운 것은 gone 에 기록이 있을 때만 지운다(없다고 지우지 않는다). */
const SyncCore = (() => {
  const ID = /^[a-z0-9]{1,32}$/i;
  const GONE_KEY = /^[mt]:[a-z0-9]{1,32}$/i;
  const TYPES = ['camp', 'water', 'park', 'peak', 'start', 'danger', 'toilet', 'food', 'valley', 'home', 'work', 'etc'];
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isNum = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  const text = (v, max) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const r6 = v => +v.toFixed(6);

  /* ----- 자료 검사: 밖에서 들어온 자료(동기화·백업 파일)는 반드시 이 함수들을 거친다 ----- */
  function cleanMark(m){
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !ID.test(m.id)) return null;
    if (!isNum(m.lat, -90, 90) || !isNum(m.lng, -180, 180)) return null;
    return { id:m.id, type:TYPES.includes(m.type) ? m.type : 'etc', name:text(m.name, 60), lat:r6(m.lat), lng:r6(m.lng) };
  }
  function cleanTrack(t){
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !ID.test(t.id)) return null;
    const src = Array.isArray(t.coords) ? t.coords : [], wsrc = Array.isArray(t.wpts) ? t.wpts : [];
    if (src.length > 200000 || wsrc.length > 5000) return null;
    const coords = [], wpts = [];
    for (const c of src) {
      if (!Array.isArray(c) || !isNum(c[0], -90, 90) || !isNum(c[1], -180, 180)) continue;
      coords.push([r6(c[0]), r6(c[1]), isNum(c[2], -1000, 10000) ? Math.round(c[2]) : null]);
    }
    for (const w of wsrc) {
      if (!w || typeof w !== 'object' || !isNum(w.lat, -90, 90) || !isNum(w.lng, -180, 180)) continue;
      wpts.push({ lat:r6(w.lat), lng:r6(w.lng), name:text(w.name, 80) });
    }
    if (!coords.length && !wpts.length) return null;
    return { id:t.id, name:text(t.name, 120) || '경로', coords, wpts };
  }
  function cleanGone(g){
    const out = {};
    if (!g || typeof g !== 'object' || Array.isArray(g)) return out;
    let n = 0;
    for (const k of Object.keys(g)) {
      if (!GONE_KEY.test(k) || !isNum(g[k], 0, 1e14)) continue;
      out[k] = Math.round(g[k]);
      if (++n >= 20000) break;
    }
    return out;
  }
  function cleanList(list, fn){
    const seen = new Set(), out = [];
    for (const x of Array.isArray(list) ? list : []) { const c = fn(x); if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } }
    return out;
  }

  /* ----- 새 번호: 시각 + 무작위 2자 (한 기기 안에서는 겹치지 않고, 기기끼리도 사실상 겹치지 않음) ----- */
  let lastT = 0;
  function newId(){
    const t = Math.max(Date.now(), lastT + 1); lastT = t;
    return t.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  }

  /* ----- 합치기 ----- */
  function canon(marks, gone){
    const ms = marks.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const g = {}; Object.keys(gone).sort().forEach(k => { g[k] = gone[k]; });
    return JSON.stringify({ v:1, marks:ms, gone:g });
  }
  /* local = { marks, trackIds, gone } (이 기기), remote = 같은 모양 (저장소) */
  function plan(local, remote){
    const gone = Object.assign({}, remote.gone);
    for (const k of Object.keys(local.gone)) if (!has(gone, k) || local.gone[k] < gone[k]) gone[k] = local.gone[k];
    const localIds = new Set(local.marks.map(m => m.id));
    const marks = [], addMarks = [], removeMarkIds = [];
    for (const m of local.marks) { if (has(gone, 'm:' + m.id)) removeMarkIds.push(m.id); else marks.push(m); }
    for (const m of remote.marks) if (!localIds.has(m.id) && !has(gone, 'm:' + m.id)) { marks.push(m); addMarks.push(m); }
    const lt = new Set(local.trackIds), rt = new Set(remote.trackIds);
    const dead = id => has(gone, 't:' + id);
    return {
      gone, marks, addMarks, removeMarkIds,
      removeTrackIds: local.trackIds.filter(dead),
      tracksDown: remote.trackIds.filter(id => !lt.has(id) && !dead(id)),
      tracksUp: local.trackIds.filter(id => !rt.has(id) && !dead(id)),
      tracksDelRemote: remote.trackIds.filter(dead),
      dataChanged: canon(marks, gone) !== canon(remote.marks, remote.gone),
    };
  }

  /* ----- 깃허브 저장소 읽고 쓰기 ----- */
  class SyncError extends Error { constructor(code){ super(code); this.code = code; } }
  function b64enc(str){
    const u = new TextEncoder().encode(str); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64dec(b){
    const s = atob(String(b).replace(/\s/g, '')), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return new TextDecoder().decode(u);
  }
  function makeIo({ api, owner, repo, token, fetchFn }){
    const base = `${api}/repos/${owner}/${repo}`;
    async function req(method, path, body, raw){
      const headers = { Authorization:'Bearer ' + token, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' };
      if (body) headers['Content-Type'] = 'application/json';
      try { return await fetchFn(base + path, { method, headers, cache:'no-store', body: body ? JSON.stringify(body) : undefined }); }
      catch (e) { throw new SyncError('offline'); }
    }
    function fail(r){
      if (r.status === 401) return new SyncError('auth');
      if (r.status === 429) return new SyncError('busy');
      if (r.status === 403) return new SyncError(r.headers.get('x-ratelimit-remaining') === '0' || r.headers.get('retry-after') ? 'busy' : 'access');
      if (r.status === 404) return new SyncError('access');
      return new SyncError('server');
    }
    return {
      async checkAccess(){
        const r = await req('GET', '');
        if (!r.ok) throw fail(r);
        const j = await r.json().catch(() => null);
        if (j && j.permissions && j.permissions.push === false) throw new SyncError('access');
      },
      async getData(){
        const r = await req('GET', '/contents/data.json');
        if (r.status === 404) return { data:null, sha:null };
        if (!r.ok) throw fail(r);
        const j = await r.json();
        let data = null;
        try { data = JSON.parse(b64dec(j.content)); } catch (e) { data = null; } // 깨진 파일은 빈 것으로 보고 덮어쓴다(이전 내용은 저장소 기록에 남음)
        return { data, sha: typeof j.sha === 'string' ? j.sha : null };
      },
      async putData(textBody, sha){
        const body = { message:'동기화: 표시', content:b64enc(textBody) };
        if (sha) body.sha = sha;
        const r = await req('PUT', '/contents/data.json', body);
        if (r.status === 409 || r.status === 422) throw new SyncError('conflict');
        if (!r.ok) throw fail(r);
      },
      async listTracks(){
        const r = await req('GET', '/contents/tracks');
        if (r.status === 404) return [];
        if (!r.ok) throw fail(r);
        const j = await r.json(), out = [];
        for (const f of Array.isArray(j) ? j : []) {
          const m = f && f.type === 'file' && typeof f.name === 'string' && /^([a-z0-9]{1,32})\.json$/i.exec(f.name);
          if (m && typeof f.sha === 'string') out.push({ id:m[1], sha:f.sha });
        }
        return out;
      },
      async getTrack(id){
        const r = await req('GET', `/contents/tracks/${id}.json`, null, true);
        if (r.status === 404) return null;
        if (!r.ok) throw fail(r);
        let t = null;
        try { t = cleanTrack(JSON.parse(await r.text())); } catch (e) { t = null; }
        return t && t.id === id ? t : null;
      },
      async putTrack(t){
        const r = await req('PUT', `/contents/tracks/${t.id}.json`, { message:'동기화: 경로 추가', content:b64enc(JSON.stringify(t)) });
        if (r.status === 422) return;            // 이미 올라가 있음 (내용이 바뀌지 않는 파일이라 그대로 둔다)
        if (r.status === 409) throw new SyncError('conflict');
        if (!r.ok) throw fail(r);
      },
      async delTrack(id, sha){
        const r = await req('DELETE', `/contents/tracks/${id}.json`, { message:'동기화: 경로 삭제', sha });
        if (r.status === 404) return;
        if (r.status === 409 || r.status === 422) throw new SyncError('conflict');
        if (!r.ok) throw fail(r);
      },
    };
  }

  /* ----- 한 번 맞추기 -----
     snap = { marks, tracks, gone } (이 기기의 지금 자료, 읽기만 함)
     결과 = 이 기기에 적용할 변경 { gone, addMarks, removeMarkIds, addTracks, removeTrackIds, skipped, needConfirm }
     도중에 실패하면 오류에 e.partial(거기까지의 결과)을 붙여 던진다. */
  async function syncOnce(io, snap, opts){
    opts = opts || {};
    const res = { gone:{}, addMarks:[], removeMarkIds:[], addTracks:[], removeTrackIds:[], skipped:0, needConfirm:null };
    try {
      const got = await io.getData();
      const rd = got.data && typeof got.data === 'object' ? got.data : {};
      const rTracks = await io.listTracks();
      const remote = { marks:cleanList(rd.marks, cleanMark), gone:cleanGone(rd.gone), trackIds:rTracks.map(t => t.id) };
      const p = plan({ marks:snap.marks, trackIds:snap.tracks.map(t => t.id), gone:snap.gone }, remote);
      const nDel = p.removeMarkIds.length + p.removeTrackIds.length;
      if (nDel >= (opts.confirmAt || 5) && !opts.allowDelete) { // 한꺼번에 많이 지워지는 경우는 먼저 물어본다
        res.needConfirm = { markIds:p.removeMarkIds, trackIds:p.removeTrackIds };
        return res;
      }
      res.gone = p.gone; res.addMarks = p.addMarks; res.removeMarkIds = p.removeMarkIds; res.removeTrackIds = p.removeTrackIds;
      for (const id of p.tracksDown) {
        if (opts.skip && opts.skip.has(id)) { res.skipped++; continue; }
        const t = await io.getTrack(id);
        if (t) res.addTracks.push(t);
      }
      if (p.dataChanged) await io.putData(canon(p.marks, p.gone), got.sha);
      for (const id of p.tracksUp) await io.putTrack(snap.tracks.find(t => t.id === id));
      const shaOf = new Map(rTracks.map(t => [t.id, t.sha]));
      for (const id of p.tracksDelRemote) await io.delTrack(id, shaOf.get(id));
      return res;
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError('server');
      err.partial = res;
      throw err;
    }
  }

  return { cleanMark, cleanTrack, cleanGone, cleanList, newId, canon, plan, makeIo, syncOnce, SyncError, b64enc, b64dec };
})();
if (typeof module !== 'undefined') module.exports = SyncCore;

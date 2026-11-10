'use strict';
/* 산행지도 장소 검색 틀.
   이 페이지는 앱이 sandbox(격리) 속성을 붙여 숨은 틀로 연다. 그래서 여기서 실행되는 브이월드 코드는
   앱의 저장 공간(표시, 동기화 열쇠)과 같은 주소의 다른 앱 자료를 읽을 수 없다. 검색어를 받아 결과만 돌려준다. */
(() => {
  const ALLOW = ['query', 'type', 'category', 'key'];
  let n = 0;
  window.addEventListener('message', e => {
    const m = e.data;
    if (e.source !== window.parent || !m || m.kind !== 'vw-search' || !m.params || typeof m.params !== 'object') return;
    const cb = '__vw' + (++n), sc = document.createElement('script');
    const q = new URLSearchParams({ service:'search', request:'search', version:'2.0', crs:'EPSG:4326', size:'10', page:'1', format:'json', errorformat:'json', callback:cb });
    ALLOW.forEach(k => { if (typeof m.params[k] === 'string') q.set(k, m.params[k].slice(0, 200)); });
    let finished = false;
    const done = v => {
      if (finished) return; finished = true;
      delete window[cb]; sc.remove(); clearTimeout(t);
      let data = null; try { data = JSON.parse(JSON.stringify(v)); } catch (err) { data = null; }
      e.source.postMessage({ kind:'vw-result', id:m.id, data }, e.origin);
    };
    const t = setTimeout(() => done(null), 8000);
    window[cb] = d => done(d);
    sc.onerror = () => done(null);
    sc.src = 'https://api.vworld.kr/req/search?' + q.toString();
    document.head.appendChild(sc);
  });
  window.parent.postMessage({ kind:'vw-ready' }, '*');
})();

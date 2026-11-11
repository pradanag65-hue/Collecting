'use strict';
/* ============ konfigurasi ============ */
const API_URL = '';   // opsional: tempel URL Web App (.../exec) di sini agar tidak perlu diisi di HP

/* ============ util ============ */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ic = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const pad = n => String(n).padStart(2, '0');
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLNS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const parseIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const HARI_P = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const fmtTgl = v => { const d = parseIso(v); return d ? `${HARI_P[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}` : ''; };
const hm = s => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const tt = s => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? pad(+m[1]) + ':' + m[2] : ''; };
const mins = r => { const a = hm(r.jam_mulai), b = hm(r.jam_selesai); if (a == null || b == null) return 0; let d = b - a; if (d < 0) d += 1440; return d; };
const dur = m => { const h = Math.floor(m / 60), n = m % 60; return !m ? '0 m' : (h ? h + ' j' : '') + (h && n ? ' ' : '') + (n ? n + ' m' : ''); };
const locs = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

/* ============ state ============ */
let cfg = ls.get('st_cfg', {}); if (API_URL) cfg.url = API_URL;
let ses = ls.get('st_ses', null);
let selMode = false, sel = new Set(), lp = false, lpT, lpXY = [0, 0];
let fQ = '', fFrom = '', fTo = '', reminded = false;
let S = null, L = [], R = { m: isoToday().slice(0, 7) }, tab = 'surat', cur = 'login', lgMode = 'in';
const dk = () => 'st_draft_' + ses.user.username, ck = () => 'st_cache_' + ses.user.username;

function blank() {
  return {
    id: '', nama: ses.user.nama || '', jabatan: ses.user.jabatan || 'STAFF', tgl: isoToday(), j1: '', j2: '', lokasi: '',
    lap: [0, 1, 2].map(() => ({ t: '', img: '', fid: '', dirty: false })),
    sig: [['Mengetahui', 'Kepala Bagian SDM'], ['Menyetujui', 'Manajer / Kepala'], ['Pemberi Tugas', ''], ['Dibuat oleh', '']]
      .map(([a, b]) => ({ a, b, n: '', img: '', fid: '', dirty: false }))
  };
}
function migrate(x) {   // data lama: urutan TTD "Yang diberi tugas" lalu "Pemberi Tugas"
  if (x.sig && x.sig[2] && /diberi tugas/i.test(x.sig[2].b || '')) {
    const m = x.sig[2], p = x.sig[3]; m.a = 'Dibuat oleh'; m.b = '';
    if (p) { if (/atasan langsung/i.test(p.b || '')) p.b = ''; x.sig[2] = p; x.sig[3] = m; }
  }
  return x;
}
/* ============ riwayat isian (saran) ============ */
let H = null;
const hk = () => 'st_hist_' + ses.user.username;
const histDef = () => ({ lokasi: [], jabatan: [], kegiatan: [], pejabat: [], ttd: [0, 1, 2, 3].map(() => ({ a: [], b: [], n: [] })) });
function histGet() { if (!H) H = Object.assign(histDef(), ls.get(hk(), {})); return H; }
async function loadHist() {
  if (!ses) return;
  try { H = Object.assign(histDef(), (await api('riwayat')).data); ls.set(hk(), H); if (cur === 'edit' && S) S.sig.forEach((_, i) => renderQf(i)); } catch (e) {}
}
/* isi cepat pejabat: satu ketukan mengisi nama + jabatan + tanda tangan */
let simg = null; const simgK = () => 'st_simg_' + ses.user.username;
async function sigImg(fid) {
  simg = simg || ls.get(simgK(), {});
  if (simg[fid]) return simg[fid];
  try {
    const r = await api('img', { fid });
    if (r.img) { simg[fid] = r.img; const ks = Object.keys(simg); while (ks.length > 12) delete simg[ks.shift()]; ls.set(simgK(), simg); return r.img; }
  } catch (e) {}
  return '';
}
const nz = v => String(v || '').trim().toLowerCase();
function renderQf(i) {
  const box = document.querySelector(`.qfs[data-ps="${i}"]`); if (!box || !S || !S.sig[i]) return;
  const s = S.sig[i], h = histGet().pejabat || [];
  const items = (i === 3 ? h.filter(p => p.i === 3 && p.fid).slice(0, 1)
    : h.filter(p => p.i === i && p.n && !(nz(p.n) === nz(s.n) && nz(p.b) === nz(s.b))).slice(0, 5));
  box._items = items;
  box.innerHTML = items.length ? '<span class="ql">Isi cepat</span>' + items.map((p, k) =>
    `<button type="button" class="qf" data-k="${k}">${ic(i === 3 ? 'pen' : 'user')}<span>${i === 3 ? 'Pakai TTD terakhir' : esc(p.n) + (p.b ? ' · ' + esc(p.b) : '')}</span></button>`).join('') : '';
}
async function applyQf(i, k) {
  const box = document.querySelector(`.qfs[data-ps="${i}"]`), p = box && box._items && box._items[k]; if (!p) return;
  const s = S.sig[i]; let img = '';
  if (p.fid) {
    snack('Mengambil tanda tangan…'); img = await sigImg(p.fid); $('snack').classList.remove('show');
    if (!img) snack('Tanda tangan belum terambil (offline?)' + (i < 3 ? ', nama tetap terisi' : ''));
  }
  if (i === 3) { if (!img) return; } else { s.n = p.n; s.b = p.b; if (p.a) s.a = p.a; }
  s.img = img; s.dirty = true; saveDraft(); renderSig();
}
function front(arr, v) {
  v = String(v || '').trim(); if (!v) return;
  const k = v.toLowerCase(), i = arr.findIndex(x => x.toLowerCase() === k);
  if (i >= 0) arr.splice(i, 1); arr.unshift(v); if (arr.length > 60) arr.length = 60;
}
function learn(x) {
  const h = histGet();
  locs(x.lokasi).forEach(v => front(h.lokasi, v)); front(h.jabatan, x.jabatan); x.lap.forEach(l => front(h.kegiatan, l.t));
  x.sig.forEach((g, i) => { if (!h.ttd[i]) return; front(h.ttd[i].a, g.a); front(h.ttd[i].b, g.b); if (i !== 3) front(h.ttd[i].n, g.n); });
  ls.set(hk(), h);
}
function sgList(t) {
  const h = histGet(), k = t.dataset.sg;
  if (k === 'lokasi') return h.lokasi; if (k === 'jabatan') return h.jabatan; if (k === 'kegiatan') return h.kegiatan;
  if (k === 'ttd') { const o = h.ttd[+t.dataset.i]; return o ? o[t.dataset.k] || [] : []; }
  return [];
}
function showSg(e) {
  const t = e.target; if (!ses || !t.dataset || !t.dataset.sg) return;
  const q = t.value.trim().toLowerCase(), used = new Set();
  if (t.dataset.sg === 'lokasi') document.querySelectorAll('.lk').forEach(el => { if (el !== t) used.add(el.value.trim().toLowerCase()); });
  const items = sgList(t).filter(v => { const l = v.toLowerCase(); return l !== q && !used.has(l) && (!q || l.includes(q)); }).slice(0, 8);
  const fld = t.closest('.fld'); if (!fld) return;
  let box = fld.nextElementSibling;
  if (!box || !box.classList.contains('sugs')) { box = document.createElement('div'); box.className = 'sugs'; fld.after(box); }
  box.innerHTML = items.map(v => `<button type="button" class="sug">${ic('hist')}<span>${esc(v)}</span></button>`).join('');
  box.hidden = !items.length; box._t = t;
}
document.addEventListener('focusin', showSg);
document.addEventListener('input', showSg);
document.addEventListener('focusout', e => {
  const f = e.target.closest && e.target.closest('.fld'); if (!f) return;
  setTimeout(() => { const b = f.nextElementSibling; if (b && b.classList.contains('sugs') && document.activeElement !== e.target) b.hidden = true; }, 220);
});
['pointerdown', 'mousedown'].forEach(ev => document.addEventListener(ev, e => { if (e.target.closest('.sugs')) e.preventDefault(); }, true));
document.addEventListener('click', e => {
  const c = e.target.closest('.sug'); if (!c) return;
  const box = c.parentElement, t = box._t; if (!t) return;
  t.value = c.querySelector('span').textContent; t.dispatchEvent(new Event('input', { bubbles: true })); box.hidden = true;
});

let dt; function saveDraft() { if (!S || !ses || S.id) return; clearTimeout(dt); dt = setTimeout(() => { if (S && ses && !S.id) ls.set(dk(), S); }, 300); }

/* ============ UI dasar ============ */
let sbT;
function snack(m, act, fn) {
  const s = $('snack'); s.innerHTML = `<span>${esc(m)}</span>${act ? `<button id="sbA">${esc(act)}</button>` : ''}`;
  s.classList.add('show'); if (act) $('sbA').onclick = () => { s.classList.remove('show'); fn && fn(); };
  clearTimeout(sbT); sbT = setTimeout(() => s.classList.remove('show'), 3400);
}
function openSheet(html) {
  $('bs').innerHTML = '<div class="grab"></div>' + html; $('bs').hidden = false; $('scrim').hidden = false;
  requestAnimationFrame(() => { $('bs').classList.add('in'); $('scrim').classList.add('in'); });
}
function closeSheet() { $('bs').classList.remove('in'); $('scrim').classList.remove('in'); setTimeout(() => { $('bs').hidden = true; $('scrim').hidden = true; }, 190); }
$('scrim').onclick = closeSheet;
function confirmSheet(title, msg, ok) {
  return new Promise(res => {
    openSheet(`<h3>${esc(title)}</h3><p class="mut">${esc(msg)}</p><div class="acts end"><button class="btn txt" id="csNo">Batal</button><button class="btn dng" id="csOk">${esc(ok)}</button></div>`);
    $('csNo').onclick = () => { closeSheet(); res(false); }; $('csOk').onclick = () => { closeSheet(); res(true); };
  });
}
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('.btn,.ib,.fab,.nav button,.tix,.chip,.photo,.row-item,.rr'); if (!t || t.disabled) return;
  const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
  s.className = 'ripple'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  t.appendChild(s); setTimeout(() => s.remove(), 520);
});

/* ============ API ============ */
async function api(action, data = {}) {
  if (!cfg.url) throw new Error('Alamat server belum diatur');
  let j;
  try {
    const r = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action, token: ses && ses.token, ...data }) });
    j = await r.json();
  } catch (e) { const er = new Error('Tidak bisa terhubung ke server'); er.net = true; throw er; }
  if (!j.ok) {
    if (j.error === 'Sesi habis') { logout(); throw new Error('Sesi habis, silakan masuk lagi'); }
    throw new Error(j.error || 'Gagal');
  }
  return j;
}

/* ============ navigasi ============ */
const VIEWS = ['login', 'home', 'edit', 'prev'];
function setView(v) {
  cur = v; VIEWS.forEach(x => $('s_' + x).hidden = x !== v);
  document.body.classList.toggle('noNav', v !== 'home');
  if (v === 'home') setTab(tab);
  if (v === 'edit') fillEditor();
  if (v === 'prev') build();
  window.scrollTo(0, 0);
}
function go(v) { history.pushState({ v, d: ((history.state && history.state.d) || 0) + 1 }, ''); setView(v); }
function goHome() { tab = 'surat'; const d = (history.state && history.state.d) || 0; if (d > 0) history.go(-d); else setView('home'); }
window.addEventListener('popstate', e => {
  if (!ses) return setView('login');
  const v = e.state && e.state.v; setView(v && v !== 'login' ? v : 'home');
});
function setTab(t) {
  tab = t;
  ['surat', 'rekap', 'akun'].forEach(x => { $('tab_' + x).hidden = x !== t; $('n_' + x).classList.toggle('on', x === t); });
  if (t !== 'surat') { selMode = false; sel.clear(); }
  renderHead();
  if (t === 'surat') renderList(); if (t === 'rekap') renderRekap(); if (t === 'akun') renderAkun();
}
['surat', 'rekap', 'akun'].forEach(t => $('n_' + t).onclick = () => setTab(t));
function renderHead() {
  $('selBtn').hidden = !(tab === 'surat' && (L.length || selMode));
  $('selBtn').innerHTML = ic(selMode ? 'x' : 'checks');
  $('hHi').textContent = selMode ? sel.size + ' dipilih' : 'Halo, ' + String(ses.user.nama || '').split(' ')[0];
  $('hTitle').textContent = selMode ? 'Pilih surat' : { surat: 'Surat saya', rekap: 'Rekap', akun: 'Akun' }[tab];
  $('fab').hidden = tab !== 'surat' || selMode;
  $('selbar').hidden = !selMode;
  $('selN').textContent = sel.size + ' surat'; $('selPrint').disabled = !sel.size; $('selEdit').disabled = !sel.size; $('selShare').disabled = !sel.size;
}
$('edBack').onclick = () => history.back(); $('pvBack').onclick = () => history.back();
$('edPrev').onclick = () => go('prev');
$('refBtn').onclick = () => { snack('Memuat…'); loadList(); loadHist(); };

/* ============ masuk / daftar ============ */
function setMode(m) {
  lgMode = m; $('segIn').classList.toggle('on', m === 'in'); $('segUp').classList.toggle('on', m === 'up');
  document.querySelectorAll('.up-only').forEach(e => e.hidden = m !== 'up');
  $('lgGo').textContent = m === 'in' ? 'Masuk' : 'Daftar'; $('lgErr').textContent = '';
  $('lgPass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
}
$('segIn').onclick = () => setMode('in'); $('segUp').onclick = () => setMode('up');
$('lgGo').onclick = async () => {
  const b = $('lgGo'), user = $('lgUser').value.trim(), pw = $('lgPass').value, label = b.textContent;
  $('lgErr').textContent = '';
  if (!cfg.url) { $('lgErr').textContent = 'Atur alamat server dulu (tombol di bawah)'; return; }
  if (!user || !pw) { $('lgErr').textContent = 'Isi username dan kata sandi'; return; }
  b.disabled = true; b.textContent = 'Tunggu…';
  try {
    const r = lgMode === 'in' ? await api('login', { username: user, password: pw })
      : await api('register', { username: user, password: pw, nama: $('upNama').value, jabatan: $('upJab').value, kode: $('upKode').value });
    startSession(r);
  } catch (e) { $('lgErr').textContent = e.message; }
  b.disabled = false; b.textContent = label;
};
$('lgPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('lgGo').click(); });
function startSession(r) {
  ses = { token: r.token, user: r.user }; ls.set('st_ses', ses);
  ['lgUser', 'lgPass', 'upNama', 'upJab', 'upKode'].forEach(i => $(i).value = '');
  L = ls.get(ck(), []); tab = 'surat'; S = null; H = null; reminded = false;
  history.replaceState({ v: 'home' }, ''); setView('home'); loadList(true); loadHist();
}
function logout() {
  ses = null; S = null; L = []; H = null; reminded = false; ls.del('st_ses'); setMode('in'); history.replaceState({ v: 'login' }, ''); setView('login');
}
function serverSheet() {
  openSheet(`<h3>Alamat server</h3><p class="mut">URL Web App Apps Script (berakhiran /exec).</p>
    <div class="fld"><input id="svUrl" placeholder=" " value="${esc(cfg.url || '')}" autocapitalize="none" spellcheck="false"><label for="svUrl">URL Web App</label></div>
    <div class="acts end"><button class="btn txt" id="svNo">Batal</button><button class="btn" id="svOk">Simpan dan tes</button></div>`);
  $('svNo').onclick = closeSheet;
  $('svOk').onclick = async () => {
    cfg = { url: $('svUrl').value.trim() }; ls.set('st_cfg', cfg);
    try { await api('ping'); closeSheet(); snack('Server terhubung'); } catch (e) { snack('Gagal: ' + e.message); }
  };
}
$('srvLink').onclick = serverSheet;

/* ============ daftar surat ============ */
async function loadList(quiet) {
  if (!ses) return;
  try { const r = await api('list'); L = r.data; ls.set(ck(), L); }
  catch (e) { if (ses && !quiet) snack(e.message + ' (menampilkan data tersimpan)'); }
  const n = updBadge();
  if (cur === 'home') { if (tab === 'surat') renderList(); if (tab === 'rekap') renderRekap(); }
  if (n && !reminded && cur === 'home') { reminded = true; snack(n + ' surat belum lengkap fotonya', 'Lihat', () => { fDoc = 'miss'; setTab('surat'); }); }
  qSync(true);
}
/* status dokumentasi (foto kegiatan) */
let fDoc = 'all';
const docSt = r => r.foto === undefined ? 'unk' : (!r.foto ? 'no' : r.foto >= r.tot ? 'ok' : 'part');
const matchQ = r => { if (!fQ) return true; const hay = (r.tanggal + ' ' + fmtTgl(r.tanggal) + ' ' + (r.lokasi || '')).toLowerCase(); return fQ.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t)); };
const inRange = r => (!fFrom || r.tanggal >= fFrom) && (!fTo || r.tanggal <= fTo);
const visible = () => L.filter(r => (fDoc === 'all' || (fDoc === 'miss' ? (docSt(r) === 'no' || docSt(r) === 'part') : docSt(r) === 'ok')) && matchQ(r) && inRange(r));
function updBadge() {
  const n = L.filter(r => docSt(r) === 'no' || docSt(r) === 'part').length, b = $('bdgSurat');
  if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; }
  try { if (navigator.setAppBadge) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) {}
  return n;
}
const docTag = r => { const t = docSt(r); return t === 'ok' ? `<span class="tag ok">${ic('check')}Foto lengkap</span>` : t === 'part' ? `<span class="tag warn">Foto ${r.foto}/${r.tot}</span>` : t === 'no' ? '<span class="tag no">Belum ada foto</span>' : ''; };
const docTxt = r => { const t = docSt(r); return t === 'ok' ? ' · Foto lengkap' : t === 'part' ? ` · Foto ${r.foto}/${r.tot}` : t === 'no' ? ' · <span class="mis">Belum ada foto</span>' : ''; };
function renderList() {
  renderQ(); updBadge(); $('srchBox').hidden = !L.length;
  const d = ls.get(dk(), null), hasDraft = d && !d.id && (locs(d.lokasi).length || d.lap.some(l => l.t || l.img));
  $('draftBox').innerHTML = hasDraft ? `<button class="draft" id="drBtn"><span style="color:var(--acc)">${ic('doc')}</span><div><b>Draf belum disimpan</b><span>${esc(locs(d.lokasi)[0] || 'Tanpa lokasi')} · ketuk untuk melanjutkan</span></div></button>` : '';
  if (hasDraft) $('drBtn').onclick = () => { S = migrate(d); go('edit'); };
  if (!L.length) {
    $('docFilter').innerHTML = '';
    $('list').innerHTML = `<div class="empty"><svg viewBox="0 0 96 96" fill="none"><path d="M14 24h68a6 6 0 0 1 6 6v10a9 9 0 0 0 0 16v10a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V56a9 9 0 0 0 0-16V30a6 6 0 0 1 6-6z" fill="var(--surf2)"/><path d="M36 32v32" stroke="var(--acc)" stroke-width="3" stroke-dasharray="5 5" stroke-linecap="round"/><path d="M48 42h24M48 50h24M48 58h14" stroke="var(--mut)" stroke-width="3" stroke-linecap="round"/></svg><b>Belum ada surat</b>Ketuk "Buat form" untuk mulai mencatat.</div>`;
    return;
  }
  const nOk = L.filter(r => docSt(r) === 'ok').length, nMiss = L.filter(r => docSt(r) === 'no' || docSt(r) === 'part').length;
  $('docFilter').innerHTML = [['all', 'Semua', L.length], ['miss', 'Belum lengkap', nMiss], ['ok', 'Foto lengkap', nOk]]
    .map(([k, n, c]) => `<button type="button" class="chip f${fDoc === k ? ' on' : ''}" data-f="${k}">${n} ${c}</button>`).join('') + `<button type="button" class="chip f${fFrom || fTo ? ' on' : ''}" data-f="date">${ic('cal')}Tanggal</button>`;
  const V = visible();
  if (!V.length) { $('list').innerHTML = '<div class="empty"><b>Tidak ada surat</b>Tidak ada surat di filter ini.</div>'; renderHead(); return; }
  let html = (fQ || fFrom || fTo || fDoc !== 'all') ? `<p class="mut" style="margin:0 4px 8px;font-size:13px">${V.length} dari ${L.length} surat</p>` : '', last = '';
  V.forEach(r => {
    const d = parseIso(r.tanggal), key = r.tanggal.slice(0, 7), lk = locs(r.lokasi), m = mins(r);
    if (key !== last) { last = key; html += `<h4 class="grp">${d ? BLN[d.getMonth()] + ' ' + d.getFullYear() : 'Tanpa tanggal'}</h4>`; }
    html += `<div class="tix${selMode && sel.has(r.id) ? ' sel' : ''}" data-o="${esc(r.id)}" role="button" tabindex="0"><div class="stub"><b>${d ? pad(d.getDate()) : '--'}</b><small>${d ? HARI[d.getDay()] : ''}</small></div>
      <div class="main"><b>${esc(lk.join(' · ') || 'Tanpa lokasi')}</b><span>${esc(tt(r.jam_mulai) || '--:--')} – ${esc(tt(r.jam_selesai) || '--:--')}</span>
      <div class="tags"><span class="tag">${dur(m)}</span><span class="tag">${r.kegiatan} kegiatan</span>${docTag(r)}</div></div>
      ${selMode ? `<span class="cb">${ic('check')}</span>` : `<button class="ib x" data-x="${esc(r.id)}" aria-label="Hapus">${ic('trash')}</button>`}</div>`;
  });
  $('list').innerHTML = html; renderHead();
}
$('docFilter').addEventListener('click', e => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'date') { $('dateRow').hidden = !$('dateRow').hidden; return; }
  fDoc = b.dataset.f; if (selMode) sel.clear(); renderList();
});
$('fq').addEventListener('input', e => { fQ = e.target.value.trim(); renderList(); });
$('fFrom').addEventListener('change', e => { fFrom = e.target.value; renderList(); });
$('fTo').addEventListener('change', e => { fTo = e.target.value; renderList(); });
$('fReset').onclick = () => { fFrom = fTo = ''; $('fFrom').value = $('fTo').value = ''; renderList(); };
$('list').addEventListener('click', async e => {
  if (lp) { lp = false; return; }
  const x = e.target.closest('[data-x]'), o = e.target.closest('[data-o]');
  if (selMode) { if (o) { const id = o.dataset.o; sel.has(id) ? sel.delete(id) : sel.add(id); renderList(); } return; }
  try {
    if (x) {
      e.stopPropagation();
      if (await confirmSheet('Hapus surat ini?', 'Surat beserta foto dan tanda tangannya akan dihapus permanen.', 'Hapus')) {
        await api('delete', { id: x.dataset.x }); L = L.filter(r => r.id !== x.dataset.x); ls.set(ck(), L); renderList(); snack('Surat dihapus');
      }
    } else if (o) await openView(o.dataset.o);
  } catch (err) { snack(err.message); }
});
/* tekan lama = masuk mode pilih */
$('list').addEventListener('pointerdown', e => {
  const o = e.target.closest('[data-o]'); if (!o || selMode || e.target.closest('[data-x]')) return;
  lpXY = [e.clientX, e.clientY]; clearTimeout(lpT);
  lpT = setTimeout(() => { lp = true; setTimeout(() => lp = false, 900); sel.clear(); sel.add(o.dataset.o); selMode = true; renderList(); if (navigator.vibrate) navigator.vibrate(15); }, 480);
});
$('list').addEventListener('pointermove', e => { if (Math.hypot(e.clientX - lpXY[0], e.clientY - lpXY[1]) > 10) clearTimeout(lpT); });
['pointerup', 'pointercancel'].forEach(ev => $('list').addEventListener(ev, () => clearTimeout(lpT)));
$('list').addEventListener('contextmenu', e => { if (e.target.closest('[data-o]')) e.preventDefault(); });
$('selBtn').onclick = () => { selMode = !selMode; sel.clear(); renderList(); };
/* ---- ubah massal (semua atau beberapa tanggal yang dipilih) ---- */
let BK = null;
const SLOT = ['Mengetahui', 'Menyetujui', 'Pemberi Tugas', 'Dibuat oleh'];
function bulkSheet() {
  const ids = L.filter(r => sel.has(r.id)).map(r => r.id);
  if (!ids.length) return snack('Pilih surat dulu');
  if (ids.length > 60) return snack('Maksimal 60 surat sekali ubah');
  BK = { ids, jabatan: '', sig: [0, 1, 2, 3].map(() => ({ a: '', b: '', n: '', fid: '' })) };
  openSheet(`<h3>Ubah ${ids.length} surat</h3><p class="mut">Isi hanya bagian yang mau diganti. Kolom kosong tidak diubah.</p>
    <div class="bkbody"><div class="fld"><input id="bkJab" data-sg="jabatan" placeholder=" "><label for="bkJab">Jabatan pegawai</label></div>
    ${[0, 1, 2, 3].map(i => `<div class="bkslot"><b>${SLOT[i]}</b><div class="qfs" data-bs="${i}"></div>
      <div class="two"><div class="fld"><input data-bk="${i}.a" data-sg="ttd" data-i="${i}" data-k="a" placeholder=" "><label>Judul</label></div><div class="fld"><input data-bk="${i}.b" data-sg="ttd" data-i="${i}" data-k="b" placeholder=" "><label>Jabatan</label></div></div>
      ${i < 3 ? `<div class="fld"><input data-bk="${i}.n" data-sg="ttd" data-i="${i}" data-k="n" placeholder=" "><label>Nama</label></div>` : ''}</div>`).join('')}</div>
    <div class="acts end"><button class="btn txt" id="bkNo">Batal</button><button class="btn" id="bkOk">Terapkan ke ${ids.length} surat</button></div>`);
  const h = histGet().pejabat || [];
  [0, 1, 2, 3].forEach(i => {
    const box = document.querySelector(`.qfs[data-bs="${i}"]`), items = i === 3 ? h.filter(p => p.i === 3 && p.fid).slice(0, 1) : h.filter(p => p.i === i && p.n).slice(0, 5);
    box._items = items;
    box.innerHTML = items.length ? '<span class="ql">Isi cepat</span>' + items.map((p, k) => `<button type="button" class="qf" data-k="${k}">${ic(i === 3 ? 'pen' : 'user')}<span>${i === 3 ? 'Pakai TTD terakhir' : esc(p.n) + (p.b ? ' · ' + esc(p.b) : '')}</span></button>`).join('') : '';
  });
  $('bkNo').onclick = closeSheet;
  $('bkOk').onclick = async () => {
    const set = {}; if (BK.jabatan) set.jabatan = BK.jabatan;
    set.sig = BK.sig.map((g, i) => { const o = { i }; if (g.a) o.a = g.a; if (g.b) o.b = g.b; if (g.n && i < 3) o.n = g.n; if (g.fid) o.fid = g.fid; return o; }).filter(o => Object.keys(o).length > 1);
    if (!set.jabatan && !set.sig.length) return snack('Belum ada yang diisi');
    const b = $('bkOk'); b.disabled = true; b.textContent = 'Menerapkan…';
    try {
      const r = await api('bulk', { ids: BK.ids, set }); closeSheet(); selMode = false; sel.clear(); BK = null;
      loadList(true); loadHist(); renderList(); snack(r.n + ' surat diperbarui');
    } catch (e) { snack('Gagal: ' + e.message); b.disabled = false; b.textContent = 'Terapkan'; }
  };
}
$('bs').addEventListener('input', e => {
  const t = e.target; if (!BK) return;
  if (t.id === 'bkJab') BK.jabatan = t.value.trim();
  else if (t.dataset.bk) { const [i, k] = t.dataset.bk.split('.'); BK.sig[+i][k] = t.value.trim(); if (k === 'n') BK.sig[+i].fid = ''; }
});
$('bs').addEventListener('click', e => {
  const q = e.target.closest('.qfs[data-bs] .qf'); if (!q || !BK) return;
  const box = q.parentElement, i = +box.dataset.bs, p = box._items[+q.dataset.k]; if (!p) return;
  const g = BK.sig[i], set = (k, v) => { const el = document.querySelector(`[data-bk="${i}.${k}"]`); if (el) el.value = v; };
  if (i < 3) { g.a = p.a || ''; g.b = p.b || ''; g.n = p.n || ''; set('a', g.a); set('b', g.b); set('n', g.n); }
  g.fid = p.fid || '';
  box.querySelectorAll('.qf').forEach(x => x.classList.toggle('on', x === q));
});
$('selEdit').onclick = bulkSheet;
$('selAll').onclick = () => { const v = visible(); if (v.length && v.every(r => sel.has(r.id))) v.forEach(r => sel.delete(r.id)); else v.forEach(r => sel.add(r.id)); renderList(); };
const imgMissing = d => d.lap.filter(l => l.fid && !l.img).length + d.sig.filter(g => g.fid && !g.img).length;
async function fetchFull(id) {   // ulangi bila ada foto/TTD yang belum terbawa
  let d;
  for (let t = 0; t < 3; t++) {
    d = (await api('get', { id })).data;
    if (!imgMissing(d)) return d;
    await new Promise(r => setTimeout(r, 700));
  }
  return d;
}
/* layar menyiapkan cetak: tiket berjalan di garis rute */
let prepAbort = false;
function prepShow(txt, sub, noCancel) { $('prepTxt').textContent = txt; $('prepSub').textContent = sub || ''; $('prepNo').hidden = noCancel === true; $('prep').hidden = false; }
function prepHide() { $('prep').hidden = true; }
$('prepNo').onclick = () => { prepAbort = true; prepHide(); snack('Cetak dibatalkan'); };
const stopped = () => { if (prepAbort) throw new Error('__batal'); };
$('selPrint').onclick = async () => {
  if (sel.size > 20) return snack('Maksimal 20 surat sekali cetak');
  const ids = L.filter(r => sel.has(r.id)).sort((a, b) => a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : hm(a.jam_mulai) - hm(b.jam_mulai)).map(r => r.id);
  if (!ids.length) return;
  const b = $('selPrint'); b.disabled = true; prepAbort = false;
  try {
    const data = [];
    prepShow(`Menyiapkan 0 dari ${ids.length} surat…`, 'Mengambil data dan foto');
    for (let i = 0; i < ids.length; i += 2) {
      data.push(...await Promise.all(ids.slice(i, i + 2).map(fetchFull))); stopped();
      prepShow(`Menyiapkan ${Math.min(i + 2, ids.length)} dari ${ids.length} surat…`, 'Mengambil data dan foto');
    }
    const miss = data.reduce((n, d) => n + imgMissing(d), 0);
    if (miss) {
      prepHide();
      if (!await confirmSheet('Ada gambar yang belum terambil', miss + ' foto atau tanda tangan gagal diambil dari Drive. Cetak tetap dilanjutkan?', 'Tetap cetak')) { b.disabled = !sel.size; return; }
    }
    prepShow('Menyusun lembar cetak…', 'Memuat foto dan tanda tangan'); stopped();
    $('batchPrint').innerHTML = data.map(d => `<div class="paper">${sheetHtml(fromServer(d))}</div>`).join('');
    document.body.dataset.print = 'batch';
    const imgs = [...document.querySelectorAll('#batchPrint img')];
    await Promise.all(imgs.map(im => im.decode ? im.decode().catch(() => {}) : (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250))));
    stopped(); prepHide(); window.print();
  } catch (err) { prepHide(); delete document.body.dataset.print; if (err.message !== '__batal') snack(err.message); }
  b.disabled = !sel.size;
};
/* ---- bagikan PDF (WhatsApp dan lainnya) ---- */
const libs = {};
function loadScript(src) {
  return libs[src] || (libs[src] = new Promise((res, rej) => {
    const el = document.createElement('script'); el.src = src; el.onload = res;
    el.onerror = () => { delete libs[src]; rej(new Error('Pustaka PDF gagal dimuat. Perlu internet.')); }; document.head.appendChild(el);
  }));
}
async function buildPdf(list, onP) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true }), host = document.createElement('div');
  host.className = 'xrender'; document.body.appendChild(host);
  try {
    let first = true;
    for (let i = 0; i < list.length; i++) {
      if (onP) onP(i + 1, list.length);
      host.innerHTML = `<div class="paper">${sheetHtml(list[i])}</div>`;
      const el = host.firstChild;
      await Promise.all([...el.querySelectorAll('img')].map(im => im.decode ? im.decode().catch(() => {}) : 0));
      const cv = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }), hPx = Math.floor(cv.width * 297 / 210);
      for (let y = 0; y < cv.height; y += hPx) {
        const sl = document.createElement('canvas'); sl.width = cv.width; sl.height = Math.min(hPx, cv.height - y);
        sl.getContext('2d').drawImage(cv, 0, y, cv.width, sl.height, 0, 0, cv.width, sl.height);
        if (!first) doc.addPage(); first = false;
        doc.addImage(sl.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 210, sl.height * 210 / cv.width);
      }
    }
    return doc.output('blob');
  } finally { host.remove(); }
}
function pdfReady(blob, name) {
  openSheet(`<h3>PDF siap</h3><p class="mut">${esc(name)} · ${Math.max(1, Math.round(blob.size / 1024))} KB</p>
    <div class="acts end"><button class="btn tonal" id="pdDl">Unduh</button><button class="btn" id="pdSh">${ic('share')}Bagikan</button></div>`);
  const dl = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  $('pdDl').onclick = () => { dl(); closeSheet(); snack('PDF diunduh'); };
  $('pdSh').onclick = async () => {
    const f = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: name }); closeSheet(); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    dl(); closeSheet(); snack('Berbagi tidak didukung di sini. PDF diunduh, kirim dari file manager.');
  };
}
$('selShare').onclick = async () => {
  if (sel.size > 20) return snack('Maksimal 20 surat sekali bagikan');
  const ids = L.filter(r => sel.has(r.id)).sort((a, b) => a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : hm(a.jam_mulai) - hm(b.jam_mulai)).map(r => r.id);
  if (!ids.length) return;
  prepAbort = false;
  try {
    const data = [];
    prepShow(`Menyiapkan 0 dari ${ids.length} surat…`, 'Mengambil data dan foto');
    for (let i = 0; i < ids.length; i += 2) {
      data.push(...await Promise.all(ids.slice(i, i + 2).map(fetchFull))); stopped();
      prepShow(`Menyiapkan ${Math.min(i + 2, ids.length)} dari ${ids.length} surat…`, 'Mengambil data dan foto');
    }
    const list = data.map(fromServer), blob = await buildPdf(list, (n, t) => { stopped(); prepShow(`Membuat PDF ${n} dari ${t}…`, 'Menyusun halaman'); });
    prepHide();
    pdfReady(blob, list.length === 1 ? `Form-Setoran-${list[0].tgl}.pdf` : `Form-Setoran-${list[0].tgl}-sd-${list[list.length - 1].tgl}.pdf`);
  } catch (e) { prepHide(); if (e.message !== '__batal') snack(e.message); }
};
$('fab').onclick = () => { S = blank(); saveDraft(); go('edit'); };

function fromServer(d) {
  const bl = blank();
  return migrate({
    id: d.id, nama: d.nama, jabatan: d.jabatan, tgl: String(d.tgl || '').slice(0, 10), j1: tt(d.j1), j2: tt(d.j2), lokasi: d.lokasi || '',
    lap: d.lap.map(l => ({ t: l.t, img: l.img, fid: l.fid, dirty: false })),
    sig: bl.sig.map((def, i) => d.sig[i] ? { a: d.sig[i].a, b: d.sig[i].b, n: d.sig[i].n, img: d.sig[i].img, fid: d.sig[i].fid, dirty: false } : def)
  });
}
/* ketuk surat: langsung tampil siap cetak */
async function openView(id) {
  snack('Membuka…');
  S = fromServer((await api('get', { id })).data);
  $('snack').classList.remove('show'); go('prev');
}

/* ============ editor ============ */
[['nama', 'nama'], ['jabatan', 'jabatan'], ['tgl', 'tgl'], ['j1', 'j1'], ['j2', 'j2']].forEach(([id, k]) =>
  $(id).addEventListener('input', () => { if (S) { S[k] = $(id).value; saveDraft(); } }));
document.querySelectorAll('.lk').forEach(el => el.addEventListener('input', () => {
  if (S) { S.lokasi = [0, 1, 2].map(i => $('lk' + i).value.trim()).join('\n'); saveDraft(); }
}));
function fillEditor() {
  if (!S) S = blank();
  ['nama', 'jabatan', 'tgl', 'j1', 'j2'].forEach(k => $(k).value = S[k] || '');
  const l = String(S.lokasi || '').split('\n'); [0, 1, 2].forEach(i => $('lk' + i).value = l[i] || '');
  $('edTitle').textContent = S.id ? 'Ubah surat' : 'Surat baru';
  renderLap(); renderSig(); renderCopyBox(); updJamWarn(); renderStampSeg();
}
/* foto: dikecilkan + stempel waktu dan lokasi (bisa dimatikan di tab Akun) */
function getPos() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res(p.coords), () => res(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 });
  });
}
/* mode stempel: off = tanpa stempel, time = waktu saja, full = waktu + koordinat + alamat lengkap */
const STAMP_LBL = { off: 'Tanpa stempel', time: 'Waktu saja', full: 'Waktu + alamat' };
const stampMode = () => ls.get('st_stamp2', null) || (ls.get('st_stamp', true) === false ? 'off' : 'full');
function renderStampSeg() { const m = stampMode(); document.querySelectorAll('#stampSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); }
$('stampSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b) return;
  ls.set('st_stamp2', b.dataset.m); renderStampSeg();
  snack(b.dataset.m === 'off' ? 'Foto tidak diberi stempel (cocok untuk foto yang sudah ber-watermark)' : b.dataset.m === 'time' ? 'Foto diberi stempel tanggal dan jam' : 'Foto diberi stempel waktu dan alamat lengkap');
});
const geoCache = ls.get('st_geo', {});
async function addrOf(lat, lon) {   // koordinat -> alamat lengkap (OpenStreetMap Nominatim)
  const k = lat.toFixed(4) + ',' + lon.toFixed(4); if (geoCache[k]) return geoCache[k];
  try {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=id&lat=${lat}&lon=${lon}`, { signal: ac.signal });
    clearTimeout(tm);
    const a = String((await r.json()).display_name || '').replace(/,\s*Indonesia$/i, '').trim();
    if (a) { geoCache[k] = a; const ks = Object.keys(geoCache); while (ks.length > 40) delete geoCache[ks.shift()]; ls.set('st_geo', geoCache); }
    return a;
  } catch (e) { return ''; }
}
function wrapLines(x, text, maxW, maxLines) {
  const lines = []; let cur = '';
  for (const w of String(text).split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w;
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); }
  return lines;
}
function drawStamp(x, w, h, head, addr) {
  const fs = Math.max(11, Math.round(w * 0.03)), pd = Math.round(fs * .6), lh = Math.round(fs * 1.32);
  x.font = `600 ${fs}px Arial`;
  const lines = [head].concat(addr ? wrapLines(x, addr, w - 2 * pd, 3) : []), bar = lines.length * lh + pd * 2 - (lh - fs);
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, h - bar, w, bar);
  x.fillStyle = '#fff'; x.textBaseline = 'top';
  lines.forEach((t, i) => x.fillText(t, pd, h - bar + pd + i * lh));
}
async function compress(file, cb) {
  const mode = stampMode(), stamp = mode !== 'off', when = new Date(file.lastModified || Date.now());
  const recent = Math.abs(Date.now() - when.getTime()) < 10 * 60000;   // koordinat hanya dipakai untuk foto yang baru diambil
  let pos = null, addr = '';
  if (stamp) {
    snack('Memproses foto…');
    if (recent) { pos = await getPos(); if (pos && mode === 'full') { snack('Mencari alamat…'); addr = await addrOf(pos.latitude, pos.longitude); } }
  }
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const r = Math.min(1, 700 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = im.width * r; c.height = im.height * r;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
      if (stamp) {
        let t = `${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
        if (pos) t += ` · ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;
        drawStamp(x, c.width, c.height, t, addr); $('snack').classList.remove('show');
      }
      cb(c.toDataURL('image/jpeg', .72));
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function renderLap() {
  $('lap').innerHTML = S.lap.map((l, i) => `<div class="kg"><div class="kgh"><span class="num">${i + 1}</span><b>Kegiatan</b><button class="ib" data-a="dl" data-i="${i}" aria-label="Hapus kegiatan">${ic('trash')}</button></div>
    <div class="fld"><textarea class="lt" data-sg="kegiatan" data-i="${i}" rows="2" placeholder=" ">${esc(l.t)}</textarea><label>Uraian kegiatan</label></div>
    ${l.img ? `<img src="${l.img}" alt="Foto kegiatan ${i + 1}"><div class="chips"><label class="chip">Ganti foto<input type="file" accept="image/*" class="lf" data-i="${i}" hidden></label><button class="chip" data-a="rf" data-i="${i}">Hapus foto</button></div>`
      : `<label class="photo">${ic('camera')}Ambil atau pilih foto<input type="file" accept="image/*" class="lf" data-i="${i}" hidden></label>`}</div>`).join('');
}
$('lap').addEventListener('input', e => { if (e.target.classList.contains('lt')) { S.lap[e.target.dataset.i].t = e.target.value; saveDraft(); } });
$('lap').addEventListener('change', e => {
  if (e.target.classList.contains('lf') && e.target.files[0]) {
    const i = e.target.dataset.i;
    compress(e.target.files[0], d => { S.lap[i].img = d; S.lap[i].dirty = true; saveDraft(); renderLap(); });
  }
});
$('lap').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]'); if (!b) return; const i = +b.dataset.i;
  if (b.dataset.a === 'dl') S.lap.splice(i, 1); else { S.lap[i].img = ''; S.lap[i].dirty = true; }
  saveDraft(); renderLap();
});
$('addL').onclick = () => { S.lap.push({ t: '', img: '', fid: '', dirty: false }); saveDraft(); renderLap(); };

function renderSig() {
  $('sig').innerHTML = S.sig.map((s, i) => `<div class="sgh">${esc(s.a || s.b || 'Tanda tangan ' + (i + 1))}<small>${esc(s.a && s.b ? s.b : '')}</small></div>
    <div class="qfs" data-ps="${i}"></div>
    <div class="two"><div class="fld"><input data-i="${i}" data-k="a" data-sg="ttd" value="${esc(s.a)}" placeholder=" "><label>Judul</label></div><div class="fld"><input data-i="${i}" data-k="b" data-sg="ttd" value="${esc(s.b)}" placeholder=" "><label>Jabatan</label></div></div>
    ${i === 3 ? '<p class="hint" style="margin-top:8px">Nama otomatis dari kolom Nama.</p>' : `<div class="fld"><input data-i="${i}" data-k="n" data-sg="ttd" value="${esc(s.n)}" placeholder=" "><label>Nama</label></div>`}
    <canvas class="pad" data-i="${i}"></canvas><div class="acts" style="margin-top:8px"><button class="chip" data-c="${i}">Hapus tanda tangan</button></div>`).join('');
  document.querySelectorAll('canvas.pad').forEach(initPad);
  S.sig.forEach((_, i) => renderQf(i));
}
$('sig').addEventListener('input', e => { const t = e.target; if (t.dataset.k) { S.sig[t.dataset.i][t.dataset.k] = t.value; saveDraft(); } });
$('sig').addEventListener('click', e => {
  const q = e.target.closest('.qf'); if (q) { applyQf(+q.parentElement.dataset.ps, +q.dataset.k); return; }
  const b = e.target.closest('button[data-c]'); if (!b) return;
  const s = S.sig[b.dataset.c]; s.img = ''; s.dirty = true; saveDraft(); renderSig();
});
function initPad(cv) {
  const i = cv.dataset.i, r = cv.getBoundingClientRect(), dp = window.devicePixelRatio || 1;
  cv.width = r.width * dp; cv.height = r.height * dp;
  const x = cv.getContext('2d'); x.scale(dp, dp); x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111';
  if (S.sig[i].img) { const im = new Image(); im.onload = () => x.drawImage(im, 0, 0, r.width, r.height); im.src = S.sig[i].img; }
  let dr = false; const p = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.onpointerdown = e => { dr = true; cv.setPointerCapture(e.pointerId); const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); };
  cv.onpointermove = e => { if (!dr) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); };
  const end = () => { if (!dr) return; dr = false; S.sig[i].img = cv.toDataURL('image/png'); S.sig[i].dirty = true; saveDraft(); };
  cv.onpointerup = end; cv.onpointercancel = end;
}

function payload() {
  const m = o => ({ img: o.dirty ? o.img : '', fid: o.dirty ? '' : o.fid });
  return {
    id: S.id, nama: S.nama, jabatan: S.jabatan, tgl: S.tgl, j1: S.j1, j2: S.j2, lokasi: S.lokasi,
    lap: S.lap.map(l => ({ t: l.t, ...m(l) })), sig: S.sig.map(g => ({ a: g.a, b: g.b, n: g.n, ...m(g) }))
  };
}
$('saveBtn').onclick = async () => {
  if (!String(S.nama).trim()) return snack('Isi nama dulu');
  const w = checkSurat(); if (w.length && !await warnSheet(w)) return;
  const b = $('saveBtn'); b.disabled = true; b.textContent = 'Menyimpan…';
  const data = payload(), wasNew = !S.id; let r = null;
  try { r = await api('save', { data }); }
  catch (e) {
    if (e.net && qAdd(data)) {
      if (wasNew) ls.del(dk());
      learn(S); b.disabled = false; b.textContent = 'Simpan'; goHome();
      snack('Belum ada sinyal. Surat disimpan di HP dan dikirim otomatis nanti.'); return;
    }
    snack('Gagal menyimpan: ' + e.message + '. Draf aman di HP.'); b.disabled = false; b.textContent = 'Simpan'; return;
  }
  if (wasNew) ls.del(dk());
  try { S = fromServer((await api('get', { id: r.id })).data); } catch (e) {}
  learn(S); loadHist(); loadList(true); goHome(); snack('Tersimpan ke spreadsheet');
  b.disabled = false; b.textContent = 'Simpan';
};

/* ============ antrean offline ============ */
const qk = () => 'st_q_' + ses.user.username;
const qGet = () => ls.get(qk(), []);
let qBusy = false;
function qSet(a) { try { localStorage.setItem(qk(), JSON.stringify(a)); return true; } catch (e) { return false; } }
function qAdd(data) { const a = qGet(); a.push({ qid: 'q' + Date.now() + Math.random().toString(36).slice(2, 6), at: Date.now(), data }); return qSet(a); }
async function qSync(quiet) {
  if (!ses || qBusy || !qGet().length || navigator.onLine === false) return;
  qBusy = true; let ok = 0;
  try {
    for (const it of qGet()) {
      if (it.err) continue;
      try { await api('save', { data: it.data }); ok++; qSet(qGet().filter(x => x.qid !== it.qid)); }
      catch (e) { if (e.net) break; it.err = e.message; qSet(qGet().map(x => x.qid === it.qid ? it : x)); }
    }
  } finally { qBusy = false; }
  renderQ();
  if (ok) { snack(ok + ' surat terkirim ke spreadsheet'); loadList(true); loadHist(); }
}
function renderQ() {
  const box = $('qBox'); if (!box || !ses) return; const a = qGet();
  box.innerHTML = a.length ? '<h4 class="grp">Menunggu dikirim</h4>' + a.map(it => {
    const d = it.data, dt = parseIso(d.tgl), lk = locs(d.lokasi);
    return `<div class="tix pend" data-q="${esc(it.qid)}" role="button" tabindex="0"><div class="stub"><b>${dt ? pad(dt.getDate()) : '--'}</b><small>${dt ? HARI[dt.getDay()] : ''}</small></div>
      <div class="main"><b>${esc(lk.join(' · ') || 'Tanpa lokasi')}</b><span>${esc(tt(d.j1) || '--:--')} – ${esc(tt(d.j2) || '--:--')}</span>
      <div class="tags"><span class="tag ${it.err ? 'no' : 'warn'}">${it.err ? 'Gagal kirim' : 'Menunggu sinyal'}</span></div></div></div>`;
  }).join('') : '';
}
$('qBox').addEventListener('click', e => {
  const t = e.target.closest('[data-q]'); if (!t) return;
  const it = qGet().find(x => x.qid === t.dataset.q); if (!it) return;
  openSheet(`<h3>Menunggu dikirim</h3><p class="mut">${it.err ? 'Gagal dikirim: ' + esc(it.err) : 'Surat ini tersimpan di HP dan belum masuk ke spreadsheet.'}</p>
    <div class="acts end"><button class="btn txt" id="qDel">Hapus</button><button class="btn" id="qGo">Kirim sekarang</button></div>`);
  $('qDel').onclick = () => { qSet(qGet().filter(x => x.qid !== it.qid)); closeSheet(); renderQ(); snack('Dihapus dari antrean'); };
  $('qGo').onclick = () => { closeSheet(); qSet(qGet().map(x => { if (x.qid === it.qid) delete x.err; return x; })); qSync(); };
});
window.addEventListener('online', () => qSync());
setInterval(() => qSync(true), 60000);

/* ============ cek isian janggal ============ */
function jamIssues(j1, j2) {
  const a = hm(j1), b = hm(j2), w = [];
  if (a == null || b == null) { if (j1 || j2) w.push('Jam mulai atau selesai belum lengkap.'); return w; }
  const m = mins({ jam_mulai: j1, jam_selesai: j2 });
  if (m === 0) w.push('Jam mulai dan selesai sama.');
  else { if (b < a) w.push('Jam selesai lebih awal dari jam mulai (dihitung melewati tengah malam).'); if (m > 720) w.push('Durasi ' + dur(m) + ' lebih dari 12 jam.'); }
  return w;
}
function updJamWarn() { const w = jamIssues(S.j1, S.j2), el = $('jamWarn'); el.textContent = w.join(' '); el.hidden = !w.length; }
['j1', 'j2'].forEach(id => $(id).addEventListener('input', () => { if (S) updJamWarn(); }));
function checkSurat() {
  const w = [];
  if (!S.tgl) w.push('Tanggal belum diisi.');
  else {
    const d = parseIso(S.tgl), n = new Date();
    if (d && d > new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1)) w.push('Tanggal ada di masa depan (' + fmtTgl(S.tgl) + ').');
    if (L.some(r => r.tanggal === S.tgl && r.id !== S.id)) w.push('Sudah ada surat lain di ' + fmtTgl(S.tgl) + '.');
  }
  if (hm(S.j1) == null || hm(S.j2) == null) w.push('Jam mulai atau jam selesai belum diisi.'); else w.push(...jamIssues(S.j1, S.j2));
  if (!locs(S.lokasi).length) w.push('Lokasi belum diisi.');
  const kg = S.lap.filter(l => String(l.t || '').trim() || l.img || l.fid);
  if (!kg.length) w.push('Belum ada kegiatan.');
  else { const nf = kg.filter(l => !l.img && !l.fid).length; if (nf) w.push(nf + ' kegiatan belum ada foto.'); }
  if (!S.sig[3].img && !S.sig[3].fid) w.push('Tanda tangan "Dibuat oleh" belum ada.');
  return w;
}
function warnSheet(w) {
  return new Promise(res => {
    openSheet(`<h3>Cek dulu sebelum simpan</h3><ul class="wl">${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="acts end"><button class="btn txt" id="wkNo">Perbaiki</button><button class="btn" id="wkOk">Tetap simpan</button></div>`);
    $('wkNo').onclick = () => { closeSheet(); res(false); }; $('wkOk').onclick = () => { closeSheet(); res(true); };
  });
}

/* ============ salin & buat beberapa tanggal ============ */
function copyOf(x) {
  return { ...blank(), nama: x.nama, jabatan: x.jabatan, j1: x.j1, j2: x.j2, lokasi: x.lokasi,
    lap: x.lap.map(l => ({ t: l.t, img: '', fid: '', dirty: false })),
    sig: x.sig.map(g => ({ a: g.a, b: g.b, n: g.n, img: g.img || '', fid: '', dirty: !!g.img })) };
}
async function copyFromId(id) {
  try {
    snack('Menyalin…'); S = copyOf(fromServer((await api('get', { id })).data)); saveDraft(); fillEditor();
    snack('Disalin. Ganti tanggal, jam, dan foto.');
  } catch (e) { snack(e.message); }
}
function renderCopyBox() {
  const b = $('copyBox'); if (!b) return;
  if (S.id || !L.length) { b.innerHTML = ''; return; }
  const l = L[0];
  b.innerHTML = `<button class="cbtn" id="cpLast">${ic('copy')}<span><b>Salin dari surat terakhir</b><small>${esc(fmtTgl(l.tanggal))} · ${esc(locs(l.lokasi)[0] || 'Tanpa lokasi')}</small></span></button>
    <button class="cbtn" id="cpPick">${ic('doc')}<span><b>Pilih surat lain</b></span></button>
    <button class="cbtn" id="cpMulti">${ic('cal')}<span><b>Buat beberapa tanggal</b></span></button>`;
}
$('copyBox').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'cpLast' && L[0]) copyFromId(L[0].id);
  if (b.id === 'cpPick') {
    openSheet(`<h3>Salin dari surat</h3><div class="bkbody">${L.slice(0, 20).map(r => `<div class="rr" data-cp="${esc(r.id)}"><div class="x"><span>${esc(locs(r.lokasi).join(' · ') || 'Tanpa lokasi')}</span><small>${esc(fmtTgl(r.tanggal))} · ${esc(tt(r.jam_mulai))}–${esc(tt(r.jam_selesai))}</small></div></div>`).join('')}</div>`);
  }
  if (b.id === 'cpMulti') multiSheet(L[0] && L[0].id);
});
$('bs').addEventListener('click', e => { const r = e.target.closest('[data-cp]'); if (r) { closeSheet(); copyFromId(r.dataset.cp); } });
function toEdit() { history.replaceState({ v: 'edit', d: (history.state && history.state.d) || 1 }, ''); setView('edit'); }
let MC = null;
function mcDraw() {
  const [y, m] = MC.ym.split('-').map(Number), n = new Date(y, m, 0).getDate(), off = (new Date(y, m - 1, 1).getDay() + 6) % 7, have = new Set(L.map(r => r.tanggal)), td = isoToday();
  let h = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => `<b>${d}</b>`).join('') + '<i></i>'.repeat(off);
  for (let d = 1; d <= n; d++) { const k = `${y}-${pad(m)}-${pad(d)}`; h += `<button type="button" data-d="${k}" class="${MC.dates.has(k) ? 'on ' : ''}${have.has(k) ? 'has ' : ''}${k === td ? 'td' : ''}"${have.has(k) ? ' disabled' : ''}>${d}</button>`; }
  $('mcCal').innerHTML = h; $('mcMon').textContent = BLN[m - 1] + ' ' + y;
  $('mcOk').textContent = MC.dates.size ? `Buat ${MC.dates.size} surat` : 'Buat surat'; $('mcOk').disabled = !MC.dates.size;
}
function multiSheet(srcId) {
  if (!srcId) return snack('Belum ada surat untuk disalin');
  const r0 = L.find(r => r.id === srcId) || L[0];
  MC = { src: r0.id, ym: R.m || isoToday().slice(0, 7), dates: new Set() };
  openSheet(`<h3>Buat beberapa tanggal</h3><p class="mut">Isi dan tanda tangan disalin dari surat sumber. Foto diisi belakangan. Tanggal yang sudah ada suratnya dicoret.</p>
    <div class="bkbody"><div class="fld fix"><select id="mcSrc">${L.slice(0, 30).map(r => `<option value="${esc(r.id)}"${r.id === r0.id ? ' selected' : ''}>${esc(fmtTgl(r.tanggal))} · ${esc(locs(r.lokasi)[0] || 'Tanpa lokasi')}</option>`).join('')}</select><label for="mcSrc">Salin dari</label></div>
    <div class="pager" style="margin:12px 0 4px"><button class="ib" id="mcPrev" aria-label="Bulan sebelumnya">${ic('back')}</button><b id="mcMon"></b><button class="ib" id="mcNext" aria-label="Bulan berikutnya">${ic('chev')}</button></div>
    <div class="cal" id="mcCal"></div>
    <div class="acts" style="margin:0 0 6px"><button class="chip" id="mcWd">Senin sampai Jumat</button><button class="chip" id="mcClr">Kosongkan</button></div>
    <div class="two"><div class="fld fix"><input id="mcJ1" type="time" placeholder=" " value="${esc(tt(r0.jam_mulai))}"><label for="mcJ1">Mulai</label></div><div class="fld fix"><input id="mcJ2" type="time" placeholder=" " value="${esc(tt(r0.jam_selesai))}"><label for="mcJ2">Selesai</label></div></div></div>
    <div class="acts end"><button class="btn txt" id="mcNo">Batal</button><button class="btn" id="mcOk">Buat surat</button></div>`);
  mcDraw();
  const mon = d => { const [y, m] = MC.ym.split('-').map(Number), x = new Date(y, m - 1 + d, 1); MC.ym = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; mcDraw(); };
  $('mcCal').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; const k = b.dataset.d; MC.dates.has(k) ? MC.dates.delete(k) : MC.dates.add(k); mcDraw(); };
  $('mcPrev').onclick = () => mon(-1); $('mcNext').onclick = () => mon(1);
  $('mcWd').onclick = () => {
    const [y, m] = MC.ym.split('-').map(Number), have = new Set(L.map(r => r.tanggal));
    for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) { const w = new Date(y, m - 1, d).getDay(), k = `${y}-${pad(m)}-${pad(d)}`; if (w >= 1 && w <= 5 && !have.has(k)) MC.dates.add(k); }
    mcDraw();
  };
  $('mcClr').onclick = () => { MC.dates.clear(); mcDraw(); };
  $('mcSrc').onchange = () => { MC.src = $('mcSrc').value; const r = L.find(x => x.id === MC.src); if (r) { $('mcJ1').value = tt(r.jam_mulai); $('mcJ2').value = tt(r.jam_selesai); } };
  $('mcNo').onclick = closeSheet;
  $('mcOk').onclick = async () => {
    const dates = [...MC.dates].sort(), j1 = $('mcJ1').value, j2 = $('mcJ2').value;
    if (!dates.length) return; if (dates.length > 31) return snack('Maksimal 31 tanggal');
    closeSheet(); prepShow(`Membuat ${dates.length} surat…`, 'Menyalin isi dan tanda tangan', true);
    try {
      const r = await api('clone', { id: MC.src, dates, j1, j2 }); prepHide(); await loadList(true); goHome();
      snack(r.ids.length + ' surat dibuat. Lengkapi fotonya di tiap tanggal.');
    } catch (e) { prepHide(); snack('Gagal: ' + e.message); }
  };
}

/* ============ pratinjau & cetak form ============ */
function sheetHtml(x) {
  const cols = 3, rows = [];
  for (let i = 0; i < x.lap.length; i += cols) rows.push(x.lap.slice(i, i + cols));
  const tb = rows.map(r => { r = r.slice(); while (r.length < cols) r.push(null);
    return '<tr>' + r.map(l => `<td>${l ? esc(l.t) : ''}</td>`).join('') + '</tr><tr>' + r.map(l => `<td class="ph">${l && l.img ? `<img src="${l.img}">` : ''}</td>`).join('') + '</tr>'; }).join('');
  const jam = x.j1 || x.j2 ? `${x.j1 || ''} s/d ${x.j2 || ''}` : '';
  const lk = locs(x.lokasi).slice(0, 3); while (lk.length < 3) lk.push('');   // terisi dirapatkan dulu, lalu dinomori berurutan
  const row = f => '<tr>' + x.sig.map(f).join('') + '</tr>';
  const sg = '<table class="sgt">'
    + row(g => `<td class="st"><div>${esc(g.a)}</div><div class="jb">${esc(g.b)}</div></td>`)
    + row(g => `<td class="si">${g.img ? `<img src="${g.img}">` : ''}</td>`)
    + row((g, i) => `<td class="sn">${esc(i === 3 ? x.nama : g.n)}</td>`) + '</table>';
  return `<h1>FORM PENGAMBILAN SETORAN</h1>
  <div>Yang bertanda tangan di bawah ini :</div>
  <div class="f"><b>Nama</b>:<span>${esc(x.nama)}</span></div>
  <div class="f"><b>Jabatan</b>:<span>${esc(x.jabatan)}</span></div>
  <div class="f"><b>Tanggal</b>:<span>${fmtTgl(x.tgl)}</span></div>
  <div class="f"><b>Pukul</b>:<span>${esc(jam)}</span></div>
  <div class="tl">Lokasi :</div>${lk.map((v, i) => `<div class="ln"><span class="no">${i + 1}.</span><span class="v">${esc(v)}</span></div>`).join('')}
  <hr><h2>LAPORAN PENGAMBILAN SETORAN</h2><table>${tb}</table>${sg}`;
}
function build() { $('sheet').innerHTML = sheetHtml(S); fit(); }
function fit() {
  const w = $('stage').clientWidth - 24, k = Math.min(1, w / $('sheet').offsetWidth);
  $('sheet').style.transform = `scale(${k})`; $('stage').style.height = ($('sheet').offsetHeight * k + 40) + 'px';
}
window.addEventListener('resize', () => { if (cur === 'prev') fit(); });
function doPrint(kind) { document.body.dataset.print = kind; try { window.print(); } catch (e) { snack('Cetak tidak tersedia di browser ini'); } }
window.addEventListener('afterprint', () => { delete document.body.dataset.print; });
$('prn').onclick = () => doPrint('form');
$('pvEdit').onclick = () => go('edit');
$('pvCopy').onclick = () => {
  openSheet(`<h3>Salin surat ini</h3><p class="mut">Isi dan tanda tangan ikut disalin. Foto diisi belakangan.</p>
    <div class="acts" style="flex-direction:column"><button class="btn tonal wide" id="pcOne">Jadikan surat baru</button><button class="btn tonal wide" id="pcMany">Buat beberapa tanggal</button></div>`);
  $('pcOne').onclick = () => { closeSheet(); S = copyOf(S); toEdit(); snack('Disalin. Ganti tanggal, jam, dan foto.'); };
  $('pcMany').onclick = () => { closeSheet(); if (!S.id) return snack('Simpan surat dulu'); multiSheet(S.id); };
};
$('pvShare').onclick = async () => {
  prepAbort = false;
  try {
    prepShow('Membuat PDF…', 'Menyusun halaman'); const blob = await buildPdf([S], () => stopped());
    prepHide(); pdfReady(blob, `Form-Setoran-${S.tgl || 'surat'}.pdf`);
  } catch (e) { prepHide(); if (e.message !== '__batal') snack(e.message); }
};

/* ============ rekap ============ */
function monthRows() { return L.filter(r => (r.tanggal || '').slice(0, 7) === R.m).sort((a, b) => a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : hm(a.jam_mulai) - hm(b.jam_mulai)); }
function monthLabel() { const [y, m] = R.m.split('-'); return BLN[+m - 1] + ' ' + y; }
function lokStats(rows) {
  const c = {}; rows.forEach(r => locs(r.lokasi).forEach(n => { const k = n.toLowerCase(); (c[k] = c[k] || { n, c: 0 }).c++; }));
  return Object.values(c).sort((a, b) => b.c - a.c);
}
function renderRekap() {
  const rows = monthRows(), tot = rows.reduce((a, r) => a + mins(r), 0), keg = rows.reduce((a, r) => a + (+r.kegiatan || 0), 0), lk = lokStats(rows), mx = lk.length ? lk[0].c : 1;
  $('tab_rekap').innerHTML = `<div class="pager"><button class="ib" data-m="-1" aria-label="Bulan sebelumnya"><span style="display:contents">${ic('back')}</span></button><b>${monthLabel()}</b><button class="ib" data-m="1" aria-label="Bulan berikutnya">${ic('chev')}</button></div>
  <div class="stats"><div class="stat hl"><b>${rows.length}</b><span>Form</span></div><div class="stat"><b>${dur(tot)}</b><span>Total jam</span></div><div class="stat"><b>${keg}</b><span>Kegiatan</span></div></div>
  ${rows.length && rows.every(r => r.foto !== undefined) ? `<p class="note" style="margin:10px 4px 0">${rows.filter(r => docSt(r) === 'ok').length} dari ${rows.length} surat sudah lengkap dokumentasinya${rows.some(r => docSt(r) !== 'ok') ? ' · <a href="#" id="rkMiss" style="color:var(--acc);font-weight:700">lihat yang belum</a>' : ''}</p>` : ''}
  ${rows.length ? `<div class="panel"><h3>Lokasi terbanyak</h3>${lk.slice(0, 6).map(x => `<div class="lb"><span class="nm">${esc(x.n)}</span><span class="tr"><i style="width:${Math.max(6, x.c / mx * 100)}%"></i></span><em>${x.c}</em></div>`).join('') || '<p class="mut">Belum ada lokasi.</p>'}</div>
  <div class="panel"><h3>Rincian</h3>${rows.map(r => { const d = parseIso(r.tanggal); return `<div class="rr" data-o="${esc(r.id)}"><div class="d"><b>${d ? pad(d.getDate()) : '--'}</b><small>${d ? HARI[d.getDay()] : ''}</small></div><div class="x"><span>${esc(locs(r.lokasi).join(' · ') || 'Tanpa lokasi')}</span><small>${esc(tt(r.jam_mulai) || '--:--')} – ${esc(tt(r.jam_selesai) || '--:--')} · ${r.kegiatan} kegiatan${docTxt(r)}</small></div><div class="r">${dur(mins(r))}</div></div>`; }).join('')}</div>
  <div class="acts"><button class="btn" id="rkPrint">${ic('print')}Cetak rekap</button><button class="btn tonal" id="rkCsv">${ic('down')}Unduh CSV</button></div>`
    : `<div class="empty"><b>Belum ada data</b>Tidak ada surat di bulan ${monthLabel()}.</div>`}`;
}
$('tab_rekap').addEventListener('click', async e => {
  const m = e.target.closest('[data-m]'), o = e.target.closest('[data-o]');
  if (m) { const [y, mo] = R.m.split('-'), d = new Date(+y, +mo - 1 + +m.dataset.m, 1); R.m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; renderRekap(); }
  else if (o) { try { await openView(o.dataset.o); } catch (err) { snack(err.message); } }
  else if (e.target.closest('#rkPrint')) { buildRekapPrint(); doPrint('rekap'); }
  else if (e.target.closest('#rkCsv')) downloadCsv();
  else if (e.target.closest('#rkMiss')) { e.preventDefault(); fDoc = 'miss'; setTab('surat'); }
});
function buildRekapPrint() {
  const rows = monthRows(), tot = rows.reduce((a, r) => a + mins(r), 0), keg = rows.reduce((a, r) => a + (+r.kegiatan || 0), 0);
  $('rekapPrint').innerHTML = `<h1>REKAP FORM PENGAMBIL SETORAN</h1>
  <div class="f"><b>Periode</b>:&nbsp;${monthLabel()}</div><div class="f"><b>Nama</b>:&nbsp;${esc(ses.user.nama)}</div><div class="f"><b>Jabatan</b>:&nbsp;${esc(ses.user.jabatan || '')}</div>
  <table><colgroup><col style="width:9mm"><col style="width:27mm"><col style="width:27mm"><col style="width:17mm"><col><col style="width:17mm"><col style="width:15mm"></colgroup>
  <thead><tr><th>No</th><th>Tanggal</th><th>Pukul</th><th>Durasi</th><th>Lokasi</th><th>Kegiatan</th><th>Foto</th></tr></thead>
  <tbody>${rows.map((r, i) => { const d = parseIso(r.tanggal); return `<tr><td>${i + 1}</td><td>${d ? HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BLNS[d.getMonth()] : ''}</td><td>${esc(tt(r.jam_mulai))} – ${esc(tt(r.jam_selesai))}</td><td>${dur(mins(r))}</td><td>${esc(locs(r.lokasi).join(', '))}</td><td>${r.kegiatan}</td><td>${r.foto === undefined ? '' : r.foto + '/' + r.tot}</td></tr>`; }).join('')}</tbody>
  <tfoot><tr><td colspan="3">Total (${rows.length} form)</td><td>${dur(tot)}</td><td></td><td>${keg}</td><td></td></tr></tfoot></table>
  <div class="ttd">Dibuat oleh,<div></div>${esc(ses.user.nama)}</div>`;
}
function downloadCsv() {
  const rows = monthRows(); if (!rows.length) return snack('Tidak ada data bulan ini');
  const data = [['Tanggal', 'Mulai', 'Selesai', 'Durasi (menit)', 'Lokasi', 'Jumlah kegiatan', 'Foto terisi', 'Kegiatan terisi', 'Dokumentasi', 'Pembuat']]
    .concat(rows.map(r => [r.tanggal, tt(r.jam_mulai), tt(r.jam_selesai), mins(r), locs(r.lokasi).join(' | '), r.kegiatan, r.foto === undefined ? '' : r.foto, r.tot === undefined ? '' : r.tot, { ok: 'Lengkap', part: 'Sebagian', no: 'Belum ada', unk: '' }[docSt(r)], ses.user.nama]));
  const txt = '\ufeff' + data.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = `rekap-setoran-${R.m}.csv`; document.body.appendChild(a); a.click(); a.remove(); snack('CSV diunduh');
}

/* ============ akun ============ */
function renderAkun() {
  const u = ses.user;
  $('tab_akun').innerHTML = `<div class="me"><div class="av">${esc((u.nama || '?').trim().charAt(0).toUpperCase())}</div><div><b>${esc(u.nama)}</b><span>@${esc(u.username)}${u.jabatan ? ' · ' + esc(u.jabatan) : ''}</span></div></div>
  <div style="margin-top:10px"><button class="row-item" id="akStamp">${ic('camera')}Stempel foto<span class="rt">${STAMP_LBL[stampMode()]}</span></button><button class="row-item" id="akPass">${ic('key')}Ganti kata sandi</button><button class="row-item" id="akSrv">${ic('link')}Alamat server</button><button class="row-item dng" id="akOut">${ic('out')}Keluar</button></div>
  <p class="note">Surat, foto, dan rekap hanya bisa dilihat dan diubah oleh akun ini.</p>`;
  $('akStamp').onclick = () => { const o = ['off', 'time', 'full'], m = o[(o.indexOf(stampMode()) + 1) % 3]; ls.set('st_stamp2', m); renderAkun(); snack('Stempel foto: ' + STAMP_LBL[m]); };
  $('akSrv').onclick = serverSheet;
  $('akOut').onclick = async () => { if (await confirmSheet('Keluar dari akun?', 'Draf yang belum disimpan tetap aman di HP ini.', 'Keluar')) logout(); };
  $('akPass').onclick = () => {
    openSheet(`<h3>Ganti kata sandi</h3>
      <div class="fld"><input id="pwOld" type="password" placeholder=" " autocomplete="current-password"><label for="pwOld">Kata sandi lama</label></div>
      <div class="fld"><input id="pwNew" type="password" placeholder=" " autocomplete="new-password"><label for="pwNew">Kata sandi baru (min. 6 karakter)</label></div>
      <div class="acts end"><button class="btn txt" id="pwNo">Batal</button><button class="btn" id="pwOk">Simpan</button></div>`);
    $('pwNo').onclick = closeSheet;
    $('pwOk').onclick = async () => {
      try { const r = await api('passwd', { lama: $('pwOld').value, baru: $('pwNew').value }); ses.token = r.token; ls.set('st_ses', ses); closeSheet(); snack('Kata sandi diganti'); }
      catch (e) { snack(e.message); }
    };
  };
}

/* ============ mulai ============ */
(function boot() {
  setMode('in');
  if (ses && cfg.url) { L = ls.get(ck(), []); history.replaceState({ v: 'home' }, ''); setView('home'); loadList(true); loadHist(); }
  else { ses = null; history.replaceState({ v: 'login' }, ''); setView('login'); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (ses) { renderQ(); setTimeout(() => qSync(true), 1500); }
})();

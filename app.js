'use strict';
const DRAFT = 'sl_draft_v2', CFG = 'sl_cfg_v2';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTgl = v => { if (!v) return ''; const [y, m, d] = v.split('-'); return +d + '/' + +m + '/' + y; };

/* ---------- state ---------- */
const blank = () => ({
  id: '', nama: '', jabatan: 'STAFF', tgl: '', j1: '', j2: '', tugas: '',
  lap: [0, 1, 2].map(() => ({ t: '', img: '', fid: '', dirty: false })),
  sig: [
    { a: 'Mengetahui', b: 'Kepala Bagian SDM', n: '' },
    { a: 'Menyetujui', b: 'Manajer / Kepala', n: '' },
    { a: '', b: 'Yang diberi tugas,', n: '' },
    { a: 'Pemberi Tugas', b: 'Atasan Langsung', n: '' }
  ].map(s => ({ ...s, img: '', fid: '', dirty: false }))
});
let S = blank(), cfg = { url: '', token: '' };
try { const d = localStorage.getItem(DRAFT); if (d) S = Object.assign(blank(), JSON.parse(d)); } catch (e) {}
try { const c = localStorage.getItem(CFG); if (c) cfg = JSON.parse(c); } catch (e) {}

let tm;
function saveDraft() { clearTimeout(tm); tm = setTimeout(() => { try { localStorage.setItem(DRAFT, JSON.stringify(S)); } catch (e) {} }, 300); }
let tt;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- API Apps Script ---------- */
async function api(action, params = {}, body = null) {
  if (!cfg.url) throw new Error('URL Web App belum diisi');
  const q = new URLSearchParams({ action, token: cfg.token, ...params });
  const opt = body ? { method: 'POST', body: JSON.stringify({ action, token: cfg.token, ...body }) } : {};
  const r = await fetch(body ? cfg.url : cfg.url + '?' + q, opt);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Gagal');
  return j;
}

/* ---------- tab ---------- */
function show(p) {
  ['L', 'E', 'V'].forEach(k => { $('p' + k).hidden = k !== p; $('t' + k).classList.toggle('on', k === p); });
  if (p === 'V') { build(); }
  if (p === 'L') loadList();
  window.scrollTo(0, 0);
}
$('tL').onclick = () => show('L'); $('tE').onclick = () => show('E'); $('tV').onclick = () => show('V');
$('goV').onclick = () => show('V'); $('back').onclick = () => show('E');

/* ---------- field umum ---------- */
['nama', 'jabatan', 'tgl', 'j1', 'j2'].forEach(k => {
  const el = $(k); el.value = S[k] || '';
  el.addEventListener('input', () => { S[k] = el.value; saveDraft(); });
});
/* lokasi (maks. 3) disimpan di kolom "tugas", dipisah baris baru */
const locs = () => { const a = String(S.tugas || '').split('\n'); while (a.length < 3) a.push(''); return a.slice(0, 3); };
function fillLoc() { locs().forEach((v, i) => $('lk' + i).value = v); }
document.querySelectorAll('.lk').forEach(el => el.addEventListener('input', () => {
  S.tugas = [0, 1, 2].map(i => $('lk' + i).value.trim()).join('\n'); saveDraft();
}));
function fillFields() { ['nama', 'jabatan', 'tgl', 'j1', 'j2'].forEach(k => $(k).value = S[k] || ''); fillLoc(); renderLap(); renderSig(); }

/* ---------- foto ---------- */
function compress(file, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const r = Math.min(1, 700 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = im.width * r; c.height = im.height * r;
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', .72));
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}

/* ---------- laporan ---------- */
function renderLap() {
  $('lap').innerHTML = S.lap.map((l, i) => `<div class="item"><label>Kegiatan ${i + 1}</label>
  <textarea rows="2" data-i="${i}" class="lt" placeholder="Cth: Cek administrasi, menerima &amp; collecting Pos Jombor">${esc(l.t)}</textarea>
  ${l.img ? `<img src="${l.img}" alt="Foto kegiatan ${i + 1}">` : ''}
  <div class="acts"><label class="btn" style="margin:0;color:var(--ink)">${l.img ? 'Ganti foto' : 'Ambil / pilih foto'}<input type="file" accept="image/*" data-i="${i}" class="lf" hidden></label>
  ${l.img ? `<button class="btn" data-i="${i}" data-a="rf">Hapus foto</button>` : ''}
  <button class="btn del" data-i="${i}" data-a="dl">Hapus</button></div></div>`).join('');
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

/* ---------- tanda tangan ---------- */
function renderSig() {
  $('sig').innerHTML = S.sig.map((s, i) => `<div class="item"><div class="row"><div><label>Judul atas</label><input data-i="${i}" data-k="a" value="${esc(s.a)}"></div><div><label>Jabatan</label><input data-i="${i}" data-k="b" value="${esc(s.b)}"></div></div>
  ${i === 2 ? '<p class="mut" style="font-size:13px;margin:8px 0 0">Nama otomatis dari kolom Nama di atas.</p>' : `<label>Nama</label><input data-i="${i}" data-k="n" value="${esc(s.n)}">`}
  <label>Tanda tangan (gambar di kotak)</label><canvas class="pad" data-i="${i}"></canvas>
  <div class="acts"><button class="btn" data-c="${i}">Hapus TTD</button></div></div>`).join('');
  document.querySelectorAll('canvas.pad').forEach(initPad);
}
$('sig').addEventListener('input', e => { const t = e.target; if (t.dataset.k) { S.sig[t.dataset.i][t.dataset.k] = t.value; saveDraft(); } });
$('sig').addEventListener('click', e => {
  const b = e.target.closest('button[data-c]'); if (!b) return;
  const s = S.sig[b.dataset.c]; s.img = ''; s.dirty = true; saveDraft(); renderSig();
});
function initPad(cv) {
  const i = cv.dataset.i, r = cv.getBoundingClientRect(), dp = window.devicePixelRatio || 1;
  cv.width = r.width * dp; cv.height = r.height * dp;
  const x = cv.getContext('2d'); x.scale(dp, dp); x.lineWidth = 2; x.lineCap = 'round'; x.strokeStyle = '#111';
  if (S.sig[i].img) { const im = new Image(); im.onload = () => x.drawImage(im, 0, 0, r.width, r.height); im.src = S.sig[i].img; }
  let dr = false;
  const p = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.onpointerdown = e => { dr = true; cv.setPointerCapture(e.pointerId); const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); };
  cv.onpointermove = e => { if (!dr) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); };
  const end = () => { if (!dr) return; dr = false; S.sig[i].img = cv.toDataURL('image/png'); S.sig[i].dirty = true; saveDraft(); };
  cv.onpointerup = end; cv.onpointercancel = end;
}

/* ---------- pratinjau & cetak ---------- */
function build() {
  const cols = 3, rows = [];
  for (let i = 0; i < S.lap.length; i += cols) rows.push(S.lap.slice(i, i + cols));
  const tb = rows.map(r => { r = r.slice(); while (r.length < cols) r.push(null);
    return '<tr>' + r.map(l => `<td>${l ? esc(l.t) : ''}</td>`).join('') + '</tr><tr>' +
      r.map(l => `<td class="ph">${l && l.img ? `<img src="${l.img}">` : ''}</td>`).join('') + '</tr>'; }).join('');
  const jam = S.j1 || S.j2 ? `${S.j1 || ''} s/d ${S.j2 || ''}` : '';
  const sg = S.sig.map((s, i) => `<div><div>${esc(s.a)}&nbsp;</div><div>${esc(s.b)}</div><div class="im">${s.img ? `<img src="${s.img}">` : ''}</div><div class="nm">${esc(i === 2 ? S.nama : s.n) || '&nbsp;'}</div></div>`).join('');
  const lk = locs();
  $('sheet').innerHTML = `<h1>SURAT PERINTAH LEMBUR</h1>
  <div style="text-align:left">Yang bertanda tangan di bawah ini :</div>
  <div class="f"><b>Nama</b>:<span>${esc(S.nama)}</span></div>
  <div class="f"><b>Jabatan</b>:<span>${esc(S.jabatan)}</span></div>
  <div class="f"><b>Tanggal</b>:<span>${fmtTgl(S.tgl)}</span></div>
  <div class="f"><b>Pukul</b>:<span>${esc(jam)}</span></div>
  <div class="tl">Lokasi :</div>
  ${lk.map(v => `<div class="ln">${esc(v)}</div>`).join('')}
  <hr><h2>LAPORAN TUGAS LEMBUR KARYAWAN</h2>
  <table>${tb}</table><div class="sg">${sg}</div>`;
  fit();
}
function fit() {
  const w = $('stage').clientWidth, k = Math.min(1, w / $('sheet').offsetWidth);
  $('sheet').style.transform = `scale(${k})`;
  $('stage').style.height = ($('sheet').offsetHeight * k + 24) + 'px';
}
window.addEventListener('resize', () => { if (!$('pV').hidden) fit(); });
$('prn').onclick = () => { try { window.print(); } catch (e) { toast('Cetak tidak tersedia di browser ini'); } };

/* ---------- spreadsheet ---------- */
function payload() {
  const m = o => ({ img: o.dirty ? o.img : '', fid: o.dirty ? '' : o.fid });
  return {
    id: S.id, nama: S.nama, jabatan: S.jabatan, tgl: S.tgl, j1: S.j1, j2: S.j2, tugas: S.tugas,
    lap: S.lap.map(l => ({ t: l.t, ...m(l) })),
    sig: S.sig.map(s => ({ a: s.a, b: s.b, n: s.n, ...m(s) }))
  };
}
$('saveBtn').onclick = async () => {
  if (!S.nama.trim()) return toast('Isi nama dulu');
  const b = $('saveBtn'); b.disabled = true; b.textContent = 'Menyimpan…';
  try {
    const r = await api('save', {}, { data: payload() });
    await openRec(r.id, true);
    toast('Tersimpan ke spreadsheet');
  } catch (e) { toast('Gagal: ' + e.message + ' (draft tetap aman di HP)'); }
  b.disabled = false; b.textContent = 'Simpan ke spreadsheet';
};
async function openRec(id, stay) {
  const r = await api('get', { id });
  const d = r.data;
  S = { id: d.id, nama: d.nama, jabatan: d.jabatan, tgl: d.tgl, j1: d.j1, j2: d.j2, tugas: d.tugas,
    lap: d.lap.map(l => ({ t: l.t, img: l.img, fid: l.fid, dirty: false })),
    sig: d.sig.map(s => ({ a: s.a, b: s.b, n: s.n, img: s.img, fid: s.fid, dirty: false })) };
  saveDraft(); fillFields(); if (!stay) show('E');
}
async function loadList() {
  const box = $('list');
  if (!cfg.url) { box.innerHTML = '<p class="mut">Isi URL Web App di bawah untuk menyambung ke spreadsheet.</p>'; return; }
  box.innerHTML = '<p class="mut">Memuat…</p>';
  try {
    const r = await api('list');
    box.innerHTML = r.data.length ? r.data.map(x => `<div class="rec"><div class="t"><b>${esc(x.nama)}</b><small>${esc(fmtTgl(x.tanggal))} · ${esc(x.jam_mulai)}–${esc(x.jam_selesai)}</small></div>
      <button class="btn" data-o="${esc(x.id)}">Buka</button><button class="btn del" data-d="${esc(x.id)}">Hapus</button></div>`).join('')
      : '<p class="mut">Belum ada surat tersimpan.</p>';
  } catch (e) { box.innerHTML = `<p class="mut">Gagal memuat: ${esc(e.message)}</p>`; }
}
$('list').addEventListener('click', async e => {
  const o = e.target.closest('[data-o]'), d = e.target.closest('[data-d]');
  try {
    if (o) { toast('Membuka…'); await openRec(o.dataset.o); }
    if (d && confirm('Hapus surat ini dari spreadsheet?')) { await api('delete', {}, { id: d.dataset.d }); toast('Terhapus'); loadList(); }
  } catch (err) { toast('Gagal: ' + err.message); }
});
$('newBtn').onclick = () => { S = blank(); saveDraft(); fillFields(); show('E'); };
$('refBtn').onclick = loadList;
$('cfgUrl').value = cfg.url || ''; $('cfgTok').value = cfg.token || '';
$('cfgSave').onclick = async () => {
  cfg = { url: $('cfgUrl').value.trim(), token: $('cfgTok').value.trim() };
  try { localStorage.setItem(CFG, JSON.stringify(cfg)); } catch (e) {}
  try { await api('ping'); toast('Terhubung ke spreadsheet'); loadList(); } catch (e) { toast('Gagal tersambung: ' + e.message); }
};

/* ---------- init ---------- */
fillFields();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (cfg.url) loadList();

/* Jardim-app V7 — aplicação pessoal local-first (sem servidor, sem serviços pagos) */
"use strict";

/* ================= Constantes ================= */
const APP_VERSION = "V7.0";
const KEY = "jardinagem-v1-data";           // chave mantida desde a V1 para preservar dados
const SCHEMA = 7;
const CAL_START = 6, CAL_END = 22;          // limites fixos do calendário (06:00–22:00)
const STATES = ["Agendado", "Em curso", "Em pausa", "Concluído", "Cancelado"];
const STATUS_CLS = { "Agendado": "st-agendado", "Em curso": "st-curso", "Em pausa": "st-pausa", "Concluído": "st-concluido", "Cancelado": "st-cancelado" };
const COST_CATS = ["Combustível", "Manutenção", "Reparação", "Consumíveis", "Materiais", "Trabalhos", "Outros"];
const CHARGEABLE_DEFAULT = ["Materiais", "Consumíveis"];
const PAY_METHODS = ["Numerário", "Transferência bancária", "MB WAY", "Cartão", "Outro"];
const FREQS = ["Pontual", "Semanal", "Quinzenal", "Mensal", "Trimestral", "Semestral", "Anual"];
const FREQ_STEP = { Semanal: { d: 7 }, Quinzenal: { d: 14 }, Mensal: { m: 1 }, Trimestral: { m: 3 }, Semestral: { m: 6 }, Anual: { m: 12 } };
const FREQ_PER_YEAR = { Semanal: 52, Quinzenal: 26, Mensal: 12, Trimestral: 4, Semestral: 2, Anual: 1 };
const RESCHED_REASONS = ["Más condições climatéricas", "Solicitado pelo cliente", "Cliente ausente", "Sobreposição de trabalhos", "Outro"];
const QUOTE_STATES = ["Rascunho", "Enviado", "Aceite", "Recusado", "Convertido"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function defaultSettings() {
  return {
    companyName: "", legalName: "", nif: "", address: "", postal: "", local: "", phone: "", email: "", iban: "", logo: null,
    hourlyRate: 25, minPrice: 50, weeklyCapacity: 40, materialMargin: 10,
    workStart: "08:00", workEnd: "18:00",
    backupIntervalDays: 30, lastBackup: null,
    serviceTypes: ["Corte de relva", "Corte de sebes", "Desmatação", "Instalação de rega"],
    docNote: "Documento sem valor fiscal."
  };
}
function emptyData() {
  return { schema: SCHEMA, settings: defaultSettings(), clients: [], jobs: [], sessions: [], costs: [], payments: [], quotes: [], equipment: [] };
}

/* ================= Estado global ================= */
let data = emptyData();
let storageLocked = false;      // impede gravações quando os dados guardados não puderam ser lidos
let recoveryRaw = null;         // texto original guardado, para descarregar em caso de erro
const ui = {
  route: "calendar", more: null, jobsTab: "jobs", jobFilter: "Todos", jobSearch: "", clientSearch: "",
  calView: "week", calDate: new Date(), homeFrom: null, homeTo: null,
  edit: {}, finTab: "costs", finPeriod: "month", costCat: "Todas"
};

/* ================= Utilitários ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const val = id => document.getElementById(id)?.value ?? "";
function uid(p) { return p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function escBr(s) { return esc(s).replace(/\n/g, "<br>"); }
function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? "").trim().replace(/[\s€]/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
const n0 = v => { const n = parseNum(v); return Number.isFinite(n) ? n : 0; };
const round2 = v => Math.round((n0(v) + Number.EPSILON) * 100) / 100;
const sum = (arr, f) => arr.reduce((a, x) => a + n0(f(x)), 0);
const MONEY_FMT = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
function money(v) { return MONEY_FMT.format(round2(v)); }
function fmtNum(v, d = 2) { return n0(v).toFixed(d).replace(".", ","); }
function inputNum(v) { if (v === "" || v == null || !Number.isFinite(parseNum(v))) return ""; return fmtNum(v, 2).replace(/,00$/, "").replace(/(,\d)0$/, "$1"); }
function fmtH(h) {
  const m = Math.round(n0(h) * 60), neg = m < 0, a = Math.abs(m);
  const hh = Math.floor(a / 60), mm = a % 60;
  return (neg ? "−" : "") + (mm ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`);
}
function isTouch() { return window.matchMedia?.("(pointer:coarse)").matches; }

/* ================= Datas (sempre dd/mm/aaaa e 24 h) ================= */
const pad = n => String(n).padStart(2, "0");
function toDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getTime());
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v);
  const s = String(v).trim();
  let m;
  const mk = (y, mo, d, h, mi) => {
    const x = new Date(y, mo - 1, d, h || 0, mi || 0);
    return x.getFullYear() === y && x.getMonth() === mo - 1 && x.getDate() === d ? x : null;
  };
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/))) return mk(+m[1], +m[2], +m[3], +m[4], +m[5]);
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?$/))) return mk(+m[3], +m[2], +m[1], +m[4], +m[5]);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d; }
  return null;
}
function iso(d) { const x = toDate(d); return x ? x.toISOString() : null; }
function dayKey(d) { const x = toDate(d); return x ? `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` : ""; }
function localInput(d) { const x = toDate(d); return x ? `${dayKey(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}` : ""; }
function fmtDate(d) { const x = toDate(d); return x ? `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}` : ""; }
function fmtTime(d) { const x = toDate(d); return x ? `${pad(x.getHours())}:${pad(x.getMinutes())}` : ""; }
function fmtDT(d) { const x = toDate(d); return x ? `${fmtDate(x)} ${fmtTime(x)}` : ""; }
function fmtDayShort(d) { const x = toDate(d); return x ? `${WEEKDAYS[x.getDay()]} ${pad(x.getDate())}/${pad(x.getMonth() + 1)}` : ""; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonthsClamp(d, n) {
  const x = new Date(d), day = x.getDate();
  x.setDate(1); x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}
function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function shiftByFreq(d, freq, i) {
  const st = FREQ_STEP[freq], x = toDate(d);
  if (!st || !i || !x) return x;
  return st.d ? addDays(x, st.d * i) : addMonthsClamp(x, st.m * i);
}
function hoursBetween(a, b) { return (toDate(b) - toDate(a)) / 36e5; }
function roundUpMinutes(d, step = 5) { const x = new Date(d); x.setSeconds(0, 0); x.setMinutes(Math.ceil(x.getMinutes() / step) * step); return x; }
function hmToHours(s) { const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] + (+m[2]) / 60 : NaN; }
function hourOf(d) { return d.getHours() + d.getMinutes() / 60; }
function inRange(d, r) { const x = toDate(d); return !!x && x >= r.from && x <= r.to; }

/* ================= Fotografias em IndexedDB ================= */
const PhotoDB = (() => {
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("IndexedDB indisponível"));
      const r = indexedDB.open("jardim-app", 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" }).createIndex("owner", "owner");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function store(mode) {
    const db = await open(), t = db.transaction("photos", mode);
    return { st: t.objectStore("photos"), done: new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("Operação cancelada")); }) };
  }
  const api = {
    async put(recs) { const { st, done } = await store("readwrite"); [].concat(recs).forEach(r => st.put(r)); await done; },
    async list(owner) { const { st } = await store("readonly"); const r = await reqP(st.index("owner").getAll(owner)); return r.sort((a, b) => String(a.date).localeCompare(String(b.date))); },
    async all() { const { st } = await store("readonly"); return reqP(st.getAll()); },
    async del(ids) { const { st, done } = await store("readwrite"); [].concat(ids).forEach(id => st.delete(id)); await done; },
    async delOwner(owner) { const recs = await api.list(owner); if (recs.length) await api.del(recs.map(r => r.id)); },
    async clear() { const { st, done } = await store("readwrite"); st.clear(); await done; }
  };
  return api;
})();

function readFileAsDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Imagem inválida")); im.src = src; }); }
async function compressImage(file, max = 1400, q = 0.72, png = false) {
  const im = await loadImage(await readFileAsDataURL(file));
  const s = Math.min(1, max / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
  const ctx = c.getContext("2d");
  if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL(png ? "image/png" : "image/jpeg", q);
}

/* ================= Leitura, migração e gravação ================= */
const okId = x => typeof x === "string" && /^[\w-]{1,80}$/.test(x);
function stripVersion(v) { const x = { ...v }; delete x.versions; delete x.photos; delete x.photoIds; return x; }

/** Converte dados de qualquer versão anterior (V1–V6) para o esquema V7.
 *  Devolve { data, photos } — as fotografias saem do JSON e vão para IndexedDB. */
function migrate(p) {
  const d = emptyData(), photos = [];
  const s = { ...defaultSettings(), ...(p.settings && typeof p.settings === "object" ? p.settings : {}) };
  delete s.fixedPrice;
  s.serviceTypes = (Array.isArray(s.serviceTypes) ? s.serviceTypes : []).map(x => String(x).trim()).filter(x => x && x.toLowerCase() !== "outro");
  s.backupIntervalDays = Math.max(30, n0(s.backupIntervalDays) || 30);
  ["hourlyRate", "minPrice", "weeklyCapacity", "materialMargin"].forEach(k => s[k] = n0(s[k]));
  if (!/^\d{2}:\d{2}$/.test(s.workStart)) s.workStart = "08:00";
  if (!/^\d{2}:\d{2}$/.test(s.workEnd)) s.workEnd = "18:00";
  d.settings = s;
  const arr = k => Array.isArray(p[k]) ? p[k] : [];
  const idMap = {};
  const fixId = (x, pre) => { if (okId(x)) return x; const n = uid(pre); if (x != null) idMap[String(x)] = n; return n; };
  const ref = x => (x == null || x === "") ? "" : (okId(x) ? x : (idMap[String(x)] || ""));

  d.clients = arr("clients").filter(c => c && typeof c === "object").map(c => ({
    id: fixId(c.id, "c"), number: String(c.number || ""), name: String(c.name || "Cliente"), company: c.company || "", nif: c.nif || "",
    phone: c.phone || "", email: c.email || "", address: c.address || "", postal: c.postal || "", local: c.local || "", notes: c.notes || "",
    createdAt: c.createdAt || new Date().toISOString()
  }));

  d.jobs = arr("jobs").filter(j => j && typeof j === "object").map(j => {
    const id = fixId(j.id, "j");
    let parts;
    if (Array.isArray(j.parts) && j.parts.length) {
      parts = j.parts.map(x => ({ start: iso(x.start), end: iso(x.end), plannedStart: x.plannedStart ? iso(x.plannedStart) : null, plannedEnd: x.plannedEnd ? iso(x.plannedEnd) : null, state: STATES.includes(x.state) ? x.state : "Agendado" }));
    } else {
      const segs = Array.isArray(j.segments) && j.segments.length ? j.segments : [{ start: j.start, end: j.end }];
      const legacy = STATES.includes(j.status) ? j.status : "Agendado";
      const sst = Array.isArray(j.segmentStates) ? j.segmentStates : [];
      parts = segs.map((x, i) => ({ start: iso(x.start), end: iso(x.end), plannedStart: null, plannedEnd: null, state: STATES.includes(sst[i]) ? sst[i] : (legacy === "Concluído" || legacy === "Cancelado" ? legacy : (i === 0 && (legacy === "Em curso" || legacy === "Em pausa") ? legacy : "Agendado")) }));
    }
    parts = parts.filter(x => x.start && x.end);
    if (!parts.length) { const n = new Date(); parts = [{ start: n.toISOString(), end: new Date(n.getTime() + 36e5).toISOString(), plannedStart: null, plannedEnd: null, state: "Agendado" }]; }
    const ptype = j.priceType === "fixed" ? "fixed" : "hourly";
    const nj = {
      id, number: String(j.number || ""), clientId: ref(j.clientId),
      serviceTypes: Array.isArray(j.serviceTypes) ? j.serviceTypes.map(String) : (j.type && j.type !== "Outro" ? [String(j.type)] : []),
      description: j.description || "", notes: j.notes || "",
      estimatedHours: n0(j.estimatedHours), priceType: ptype,
      hourlyRate: n0(j.hourlyRate ?? s.hourlyRate), price: n0(j.price), minCharge: n0(j.minCharge),
      parts, status: "Agendado", recurrence: null, quoteId: j.quoteId || null,
      createdAt: j.createdAt || new Date().toISOString(), completedAt: j.completedAt || null, cancelledAt: j.cancelledAt || null,
      reschedules: Array.isArray(j.reschedules) ? j.reschedules : []
    };
    if (j.recurrence && FREQ_STEP[j.recurrence.frequency]) {
      nj.recurrence = { frequency: j.recurrence.frequency, seriesId: j.recurrence.seriesId || null, index: n0(j.recurrence.index ?? (n0(j.recurrenceIndex) - 1)), anchor: j.recurrence.anchor || null };
    }
    (Array.isArray(j.quotedMaterials) ? j.quotedMaterials : []).forEach(m => d.costs.push({
      id: uid("cst"), date: nj.createdAt, category: "Materiais", description: m.description || "Material orçamentado",
      amount: n0(m.cost), margin: n0(m.margin ?? s.materialMargin), chargeable: ptype === "hourly", jobId: id, clientId: nj.clientId, fromQuote: true
    }));
    nj.status = deriveStatus(nj);
    return nj;
  });

  // séries periódicas antigas sem identificador: agrupa por cliente+serviços+frequência
  const legacySeries = {};
  d.jobs.forEach(j => {
    if (j.recurrence && !j.recurrence.seriesId) {
      const k = `${j.clientId}|${j.serviceTypes.join(",")}|${j.recurrence.frequency}|${j.createdAt.slice(0, 16)}`;
      legacySeries[k] = legacySeries[k] || uid("ser");
      j.recurrence.seriesId = legacySeries[k];
    }
  });

  d.sessions = arr("sessions").filter(x => x && x.start).map(x => ({
    id: fixId(x.id, "s"), jobId: ref(x.jobId), partIndex: Math.max(0, Math.round(n0(x.partIndex ?? x.segmentIndex))),
    start: iso(x.start), end: x.end ? iso(x.end) : null, active: !!x.active && !x.end
  })).filter(x => x.start);
  // apenas uma sessão ativa
  let seen = false;
  d.sessions.forEach(x => { if (x.active) { if (seen) { x.active = false; x.end = x.end || new Date().toISOString(); } seen = true; } });

  arr("costs").forEach(c => {
    if (!c) return;
    d.costs.push({
      id: fixId(c.id, "cst"), date: iso(c.date) || new Date().toISOString(), category: COST_CATS.includes(c.category) ? c.category : (c.category === "Manutenção" ? "Manutenção" : "Outros"),
      description: c.description || "", amount: n0(c.amount), margin: n0(c.margin ?? s.materialMargin),
      chargeable: c.chargeable != null ? !!c.chargeable : !!c.jobId, jobId: ref(c.jobId), clientId: ref(c.clientId), equipmentId: ref(c.equipmentId)
    });
  });
  d.payments = arr("payments").filter(x => x && x.jobId).map(x => ({
    id: fixId(x.id, "pay"), jobId: ref(x.jobId), amount: n0(x.amount), method: x.method || "Outro",
    date: iso(toDate(x.date) || new Date()), groupId: x.groupId || null, notes: x.notes || ""
  }));

  const year = new Date().getFullYear();
  d.quotes = arr("quotes").filter(q => q && typeof q === "object").map(q => {
    const id = fixId(q.id, "q");
    (Array.isArray(q.photos) ? q.photos : []).forEach((ph, i) => { if (typeof ph === "string" && ph.startsWith("data:image")) photos.push({ id: uid("ph"), owner: "quote:" + id, data: ph, date: new Date(Date.now() + i).toISOString() }); });
    return {
      id, number: String(q.number || ""), version: Math.max(1, n0(q.version) || 1),
      status: QUOTE_STATES.includes(q.status) ? q.status : "Rascunho",
      date: iso(q.date) || new Date().toISOString(), createdAt: q.createdAt || iso(q.date) || new Date().toISOString(),
      clientId: ref(q.clientId), services: Array.isArray(q.services) ? q.services.map(String) : [],
      description: q.description || "", expectedHours: n0(q.expectedHours), hourlyRate: n0(q.hourlyRate ?? s.hourlyRate),
      materials: (Array.isArray(q.materials) ? q.materials : []).map(m => ({ description: m.description || "", cost: n0(m.cost), margin: n0(m.margin ?? s.materialMargin) })),
      frequency: FREQS.includes(q.frequency) ? q.frequency : "Pontual", valid: Math.max(1, n0(q.valid) || 30), notes: q.notes || "",
      versions: (Array.isArray(q.versions) ? q.versions : []).map(stripVersion),
      convertedAt: q.convertedAt || null, jobIds: Array.isArray(q.jobIds) ? q.jobIds : (q.jobId ? [q.jobId] : [])
    };
  });

  const oldMaint = arr("maintenance");
  d.equipment = arr("equipment").filter(e => e && typeof e === "object").map(e => {
    const id = fixId(e.id, "e");
    const tasks = Array.isArray(e.tasks) ? e.tasks.map(t => ({ id: okId(t.id) ? t.id : uid("t"), name: t.name || "Manutenção", months: n0(t.months), hours: n0(t.hours) })) : [];
    if (!Array.isArray(e.tasks) && (n0(e.maintenanceMonths) || n0(e.maintenanceHours))) tasks.push({ id: uid("t"), name: "Manutenção geral", months: n0(e.maintenanceMonths), hours: n0(e.maintenanceHours) });
    const log = Array.isArray(e.log) ? e.log : oldMaint.filter(m => m.equipmentId === e.id).map(m => ({ id: uid("ml"), date: dayKey(toDate(m.date)) || dayKey(new Date()), taskId: tasks[0]?.id || "", notes: m.notes || m.description || "" }));
    return {
      id, type: e.type || "Equipamento", brand: e.brand || "", model: e.model || "", serial: e.serial || "",
      purchaseDate: dayKey(toDate(e.purchaseDate || e.date)) || "", supplier: e.supplier || "", price: n0(e.price),
      warrantyEnd: dayKey(toDate(e.warrantyEnd)) || "", notes: e.notes || "", tasks, log
    };
  });

  // fotografias antigas guardadas no JSON
  arr("photos").forEach((ph, i) => {
    if (ph && typeof ph.data === "string" && ph.data.startsWith("data:image") && ph.jobId)
      photos.push({ id: okId(ph.id) ? ph.id : uid("ph"), owner: "job:" + ref(ph.jobId), data: ph.data, date: iso(ph.date) || new Date(Date.now() + i).toISOString() });
  });

  // numeração
  let cmax = 0, jmax = 0;
  d.clients.forEach(c => cmax = Math.max(cmax, n0(String(c.number).replace(/\D/g, ""))));
  d.jobs.forEach(j => jmax = Math.max(jmax, n0(String(j.number).replace(/\D/g, ""))));
  d.clients.forEach(c => { if (!/^C\d+$/.test(c.number)) c.number = `C${pad4(++cmax)}`; });
  d.jobs.forEach(j => { if (!/^#\d+$/.test(j.number)) j.number = `#${pad4(++jmax)}`; });
  const qmax = {};
  d.quotes.forEach(q => { const m = q.number.match(/^(\d{4})\/(\d{3,})$/); if (m) qmax[m[1]] = Math.max(qmax[m[1]] || 0, +m[2]); });
  d.quotes.forEach(q => { if (!/^\d{4}\/\d{3,}$/.test(q.number)) { const y = toDate(q.date)?.getFullYear() || year; qmax[y] = (qmax[y] || 0) + 1; q.number = `${y}/${String(qmax[y]).padStart(3, "0")}`; } });

  d.jobs.forEach(j => j.status = deriveStatus(j, d.sessions));
  d.schema = SCHEMA;
  return { data: d, photos };
}
const pad4 = n => String(n).padStart(4, "0");

function loadData() {
  let raw;
  try { raw = localStorage.getItem(KEY); }
  catch (e) { storageLocked = true; return { data: emptyData(), error: "O navegador não permite aceder ao armazenamento local." }; }
  if (raw === null) return { data: emptyData(), fresh: true };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.clients) || !Array.isArray(parsed.jobs)) throw new Error("estrutura inválida");
    const res = migrate(parsed);
    return { data: res.data, photos: res.photos, migrated: parsed.schema !== SCHEMA || res.photos.length > 0 };
  } catch (e) {
    console.error("Jardim-app: dados ilegíveis", e);
    storageLocked = true; recoveryRaw = raw;
    return { data: emptyData(), error: "Os dados guardados não puderam ser lidos. As gravações estão bloqueadas para não os substituir." };
  }
}

function save() {
  if (storageLocked) { toast("Gravação bloqueada: resolva primeiro o aviso de dados em Mais › Definições."); return false; }
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { console.error(e); toast("Não foi possível gravar: o armazenamento está cheio ou indisponível. Faça um backup."); return false; }
}
/** Aplica uma alteração e grava; se a gravação falhar, repõe o estado anterior. */
function commit(fn) {
  const before = JSON.stringify(data);
  try { fn(); }
  catch (e) { data = JSON.parse(before); console.error(e); toast("Erro: " + e.message); return false; }
  if (!save()) { data = JSON.parse(before); return false; }
  return true;
}

/* ================= Entidades e cálculos ================= */
const client = id => data.clients.find(c => c.id === id);
const clientName = id => client(id)?.name || "Cliente removido";
const job = id => data.jobs.find(j => j.id === id);
const quote = id => data.quotes.find(q => q.id === id);
const equip = id => data.equipment.find(e => e.id === id);
function nextNumber(arr, prefix) { let m = 0; arr.forEach(x => m = Math.max(m, n0(String(x.number || "").replace(/\D/g, "")))); return prefix + pad4(m + 1); }
function nextQuoteNumber(year = new Date().getFullYear()) {
  let m = 0;
  data.quotes.forEach(q => { const r = String(q.number).match(/^(\d{4})\/(\d{3,})$/); if (r && +r[1] === year) m = Math.max(m, +r[2]); });
  return `${year}/${String(m + 1).padStart(3, "0")}`;
}
function serviceNames(j) { return j?.serviceTypes || []; }
function jobLabel(j) { return j ? `${j.number} · ${clientName(j.clientId)} · ${serviceNames(j).join(", ") || "Trabalho"}` : "Trabalho removido"; }

function deriveStatus(j, sessions = data.sessions) {
  const st = j.parts.map(p => p.state);
  if (st.some(x => x === "Em curso")) return "Em curso";
  if (st.every(x => x === "Cancelado")) return "Cancelado";
  if (st.every(x => x === "Concluído" || x === "Cancelado")) return "Concluído";
  if (st.some(x => x === "Em pausa")) return "Em pausa";
  if (st.some(x => x === "Concluído") || sessions.some(s => s.jobId === j.id)) return "Em pausa";
  return "Agendado";
}
function updateStatus(j) {
  j.status = deriveStatus(j);
  if (j.status === "Concluído") j.completedAt = j.completedAt || new Date().toISOString();
  else j.completedAt = null;
}
function jobStartDate(j) { return j.parts.reduce((m, p) => { const d = toDate(p.start); return !m || d < m ? d : m; }, null); }
function partHours(p) { return Math.max(0, hoursBetween(p.start, p.end)); }
function scheduledHours(j) { return sum(j.parts.filter(p => p.state !== "Cancelado"), partHours); }
function sessionHours(s, now = Date.now()) { const e = s.end ? toDate(s.end).getTime() : now; return Math.max(0, (e - toDate(s.start).getTime()) / 36e5); }
const jobSessions = id => data.sessions.filter(s => s.jobId === id).sort((a, b) => toDate(a.start) - toDate(b.start));
const workedHours = id => sum(jobSessions(id), s => sessionHours(s));
const activeSession = () => data.sessions.find(s => s.active);
const paidFor = id => sum(data.payments.filter(p => p.jobId === id), p => p.amount);
const jobCosts = id => data.costs.filter(c => c.jobId === id);
function costClientValue(c) { return c.chargeable ? n0(c.amount) * (1 + n0(c.margin) / 100) : 0; }
const chargeableTotal = id => sum(jobCosts(id), costClientValue);
const internalCostTotal = id => sum(jobCosts(id), c => c.amount);
function isWorked(j) { return j.status === "Em curso" || j.status === "Em pausa" || j.status === "Concluído" || workedHours(j.id) > 0; }

/** Mão de obra: à hora usa horas reais (ou estimadas se ainda não houver registo); aplica o mínimo quando concluído ou ainda previsto. */
function laborValue(j) {
  if (j.priceType === "fixed") return n0(j.price);
  const wh = workedHours(j.id), rate = n0(j.hourlyRate), min = n0(j.minCharge);
  if (j.status === "Concluído") return Math.max(min, (wh > 0 ? wh : n0(j.estimatedHours)) * rate);
  if (wh > 0) return wh * rate;
  return Math.max(min, n0(j.estimatedHours) * rate);
}
function estimatedLabor(j) { return j.priceType === "fixed" ? n0(j.price) : Math.max(n0(j.minCharge), n0(j.estimatedHours) * n0(j.hourlyRate)); }
function jobCharge(j) { return j.status === "Cancelado" ? sum(data.payments.filter(p => p.jobId === j.id), p => p.amount) : laborValue(j) + chargeableTotal(j.id); }
function jobEstimatedValue(j) { return estimatedLabor(j) + chargeableTotal(j.id); }
function jobOutstanding(j) { return j.status === "Cancelado" ? 0 : Math.max(0, round2(jobCharge(j) - paidFor(j.id))); }
/** Valor em dívida: só trabalhos já iniciados ou concluídos */
function jobDue(j) { return isWorked(j) ? jobOutstanding(j) : 0; }
function jobResult(j) { return jobCharge(j) - internalCostTotal(j.id); }
function effectiveRate(j) { const wh = workedHours(j.id); return wh > 0 ? laborValue(j) / wh : null; }
function clientDue(id) { return sum(data.jobs.filter(j => j.clientId === id), jobDue); }
function quoteLabor(q) { return n0(q.expectedHours) * n0(q.hourlyRate); }
function matClient(m) { return n0(m.cost) * (1 + n0(m.margin) / 100); }
function quoteMaterials(q) { return sum(q.materials || [], matClient); }
function quoteTotal(q) { return quoteLabor(q) + quoteMaterials(q); }
function quoteExpiry(q) { return addDays(toDate(q.date) || new Date(), n0(q.valid) || 30); }
function quoteDisplayState(q) { return (q.status === "Rascunho" || q.status === "Enviado") && endOfDay(quoteExpiry(q)) < new Date() ? "Expirado" : q.status; }
function outsideWorkHours(parts) {
  const a = hmToHours(data.settings.workStart), b = hmToHours(data.settings.workEnd);
  return parts.some(p => { const s = toDate(p.start), e = toDate(p.end); return hourOf(s) < a || hourOf(e) > b || dayKey(s) !== dayKey(e) && hourOf(e) > 0; });
}
function maintenanceStatus(e) {
  const today = startOfDay(new Date());
  return (e.tasks || []).filter(t => n0(t.months) > 0).map(t => {
    const last = (e.log || []).filter(l => l.taskId === t.id).map(l => toDate(l.date)).filter(Boolean).sort((a, b) => b - a)[0] || toDate(e.purchaseDate);
    if (!last) return { task: t, next: null, state: "unknown" };
    const next = addMonthsClamp(last, n0(t.months));
    const days = Math.round((next - today) / 864e5);
    return { task: t, last, next, days, state: days < 0 ? "overdue" : days <= 15 ? "soon" : "ok" };
  });
}
/* ================= Ícones ================= */
const ICON = {
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M6.5 3.5l3 .5 1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5.5 3c0 1-1 2-2 2C10 19.5 4.5 14 4.5 5.5c0-1 1-2 2-2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 20V10l8-6 8 6v10"/><path d="M4 20h16M9 20v-5h6v5"/></svg>',
  jobs: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/></svg>',
  clients: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 5a3.3 3.3 0 0 1 0 6.5M18 14.5c2 .7 3.2 2.5 3.5 5.5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>',
  backup: '<svg viewBox="0 0 24 24"><path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.7A3.7 3.7 0 0 1 17.5 18.5"/><path d="M12 11v8M9 14l3-3 3 3"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
const ico = n => `<span class="ico" aria-hidden="true">${ICON[n] || ""}</span>`;

/* ================= Avisos rápidos ================= */
function toast(msg, ms = 3000) {
  const root = document.getElementById("toast-root");
  if (!root) { console.log(msg); return; }
  const x = document.createElement("div");
  x.className = "toast"; x.setAttribute("role", "status"); x.textContent = msg;
  root.append(x);
  setTimeout(() => x.classList.add("out"), ms - 300);
  setTimeout(() => x.remove(), ms);
}

/* ================= Janelas (pilha) =================
   Cada janela fica por cima da anterior; um aviso de confirmação não apaga o formulário que está por baixo. */
const layers = [];
function openModal(opts) {
  const layer = { ...opts, el: document.createElement("div") };
  layer.el.className = "modal-backdrop" + (opts.small ? " small" : "");
  layer.el.innerHTML = `<section class="modal${opts.wide ? " wide" : ""}" role="dialog" aria-modal="true"><header class="modal-head"><h2></h2><button type="button" class="close" data-act="close-modal" aria-label="Fechar">✕</button></header><div class="modal-content"></div><footer class="modal-footer" hidden></footer></section>`;
  document.getElementById("modal-root").append(layer.el);
  layers.push(layer);
  paintLayer(layer);
  document.body.classList.add("has-modal");
  fitViewport();
  return layer;
}
function paintLayer(layer) {
  const content = $(".modal-content", layer.el), sc = content.scrollTop;
  $(".modal-head h2", layer.el).textContent = typeof layer.title === "function" ? layer.title() : layer.title;
  content.innerHTML = typeof layer.body === "function" ? layer.body() : layer.body;
  const f = typeof layer.footer === "function" ? layer.footer() : (layer.footer || "");
  const ft = $(".modal-footer", layer.el);
  ft.innerHTML = f ? `<div class="actions">${f}</div>` : ""; ft.hidden = !f;
  content.scrollTop = sc;
  layer.onMount?.(layer);
}
function closeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i < 0) return;
  layers.splice(i, 1); layer.el.remove();
  if (!layers.length) document.body.classList.remove("has-modal");
  layer.onClose?.();
}
function closeModal() { const l = layers[layers.length - 1]; if (l) closeLayer(l); }
function closeAllModals() { while (layers.length) closeModal(); }
function topLayer() { return layers[layers.length - 1]; }
function hasOpenForm() { return layers.some(l => !l.live); }
/** Atualiza o ecrã principal e as janelas de consulta (formulários abertos não são tocados). */
function refreshUI() { render(); layers.forEach(l => { if (l.live) { const t = l.exists ? l.exists() : true; if (t) paintLayer(l); else closeLayer(l); } }); }

function confirmDialog(message, { ok = "Confirmar", cancel = "Cancelar", danger = false, title = "Jardim-app" } = {}) {
  return new Promise(res => {
    let done = false;
    const layer = openModal({
      title, small: true,
      body: `<p class="confirm-msg">${escBr(message)}</p>`,
      footer: `<button type="button" class="btn ghost" data-act="dlg" data-v="0">${esc(cancel)}</button><button type="button" class="btn ${danger ? "danger" : "primary"}" data-act="dlg" data-v="1">${esc(ok)}</button>`,
      onClose: () => finish(false)
    });
    function finish(v) { if (done) return; done = true; closeLayer(layer); res(v); }
    layer.resolve = v => finish(v === "1");
  });
}
function choiceDialog(message, options, title = "Jardim-app") {
  return new Promise(res => {
    let done = false;
    const layer = openModal({
      title, small: true,
      body: `<p class="confirm-msg">${escBr(message)}</p><div class="choice-list">${options.map(o => `<button type="button" class="btn ${o.cls || "ghost"} block" data-act="dlg" data-v="${esc(o.v)}">${esc(o.label)}</button>`).join("")}</div>`,
      onClose: () => finish(null)
    });
    function finish(v) { if (done) return; done = true; closeLayer(layer); res(v); }
    layer.resolve = v => finish(v);
  });
}
function pickDateDialog(title, initial, mode = "datetime", note = "") {
  return new Promise(res => {
    let done = false;
    const layer = openModal({
      title, small: true,
      body: `${note ? `<p class="muted">${esc(note)}</p>` : ""}${fDate("Data e hora", "dlg-date", initial, { mode, cls: "full" })}`,
      footer: `<button type="button" class="btn ghost" data-act="dlg" data-v="0">Cancelar</button><button type="button" class="btn primary" data-act="dlg" data-v="1">Confirmar</button>`,
      onClose: () => finish(null)
    });
    function finish(v) { if (done) return; done = true; const d = v ? readDate("dlg-date") : null; closeLayer(layer); res(d); }
    layer.resolve = v => finish(v === "1");
  });
}

/* ================= Delegação de eventos ================= */
const ACT = {}, CHANGE = {};
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (!t || t.disabled) return;
  const f = ACT[t.dataset.act];
  if (!f) return;
  if (t.tagName === "A" && !t.getAttribute("href")?.startsWith("tel:") && !t.getAttribute("href")?.startsWith("mailto:")) e.preventDefault();
  f(t.dataset, t, e);
});
document.addEventListener("input", e => { const f = CHANGE[e.target.dataset?.input]; if (f) f(e.target, e); });
document.addEventListener("change", e => {
  const t = e.target;
  if (t.closest?.(".stepper")) clampStepper(t);
  const f = CHANGE[t.dataset?.change];
  if (f) f(t, e);
});
ACT["close-modal"] = () => closeModal();
ACT.dlg = d => topLayer()?.resolve?.(d.v);

/* ================= Campos de formulário ================= */
function fld(label, id, inner, cls = "") { return `<div class="field ${cls}">${label ? `<label for="${id}">${label}</label>` : ""}${inner}</div>`; }
function fText(label, id, value = "", o = {}) {
  return fld(label, id, `<input id="${id}" type="${o.type || "text"}" value="${esc(value)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.mode ? ` inputmode="${o.mode}"` : ""}${o.input ? ` data-input="${o.input}"` : ""}${o.change ? ` data-change="${o.change}"` : ""} ${o.attrs || ""} autocomplete="off">`, o.cls);
}
function fNum(label, id, value, o = {}) { return fText(label, id, inputNum(value), { ...o, mode: "decimal" }); }
function fArea(label, id, value = "", o = {}) { return fld(label, id, `<textarea id="${id}" rows="${o.rows || 3}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""} ${o.attrs || ""}>${esc(value)}</textarea>`, o.cls); }
function fSelect(label, id, options, value, o = {}) {
  const opts = options.map(x => typeof x === "object" ? x : { v: x, l: x });
  return fld(label, id, `<select id="${id}"${o.change ? ` data-change="${o.change}"` : ""} ${o.attrs || ""}>${o.empty ? `<option value="">${esc(o.empty)}</option>` : ""}${opts.map(x => `<option value="${esc(x.v)}"${String(x.v) === String(value ?? "") ? " selected" : ""}>${esc(x.l)}</option>`).join("")}</select>`, o.cls);
}
function fStepper(label, id, value, o = {}) {
  return fld(label, id, `<div class="stepper"><input id="${id}" type="text" inputmode="numeric" value="${esc(value)}" data-min="${o.min ?? 1}" data-max="${o.max ?? 999}"${o.change ? ` data-change="${o.change}"` : ""}><div class="stepper-btns"><button type="button" data-act="step" data-t="${id}" data-d="1" aria-label="Aumentar">▲</button><button type="button" data-act="step" data-t="${id}" data-d="-1" aria-label="Diminuir">▼</button></div></div>`, o.cls);
}
function clampStepper(el) {
  const min = +el.dataset.min, max = +el.dataset.max;
  let v = Math.round(n0(el.value));
  if (!Number.isFinite(v) || v < min) v = min;
  if (v > max) v = max;
  el.value = v;
}
ACT.step = d => {
  const el = document.getElementById(d.t);
  if (!el) return;
  el.value = Math.round(n0(el.value) || +el.dataset.min) + Number(d.d);
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
function fChecks(name, options, selected = []) {
  return `<div class="checks">${options.map(o => { const x = typeof o === "object" ? o : { v: o, l: o }; return `<label class="chk"><input type="checkbox" name="${name}" value="${esc(x.v)}"${selected.includes(x.v) ? " checked" : ""}><span>${esc(x.l)}</span></label>`; }).join("")}</div>`;
}
function checkedValues(name) { return $$(`input[name="${name}"]:checked`).map(x => x.value); }
function fToggle(label, id, checked, o = {}) {
  return `<label class="toggle ${o.cls || ""}"><input type="checkbox" id="${id}"${checked ? " checked" : ""}${o.change ? ` data-change="${o.change}"` : ""}><span>${label}</span></label>`;
}

/* ---- Campo de data/hora com calendário próprio (formato pt-PT) ---- */
function fDate(label, id, value, o = {}) {
  const mode = o.mode || "datetime", d = toDate(value);
  return fld(label, id, `<button type="button" id="${id}" class="dt-input" data-act="pick" data-mode="${mode}" data-value="${d ? (mode === "date" ? dayKey(d) : localInput(d)) : ""}"${o.change ? ` data-change="${o.change}"` : ""}${o.i != null ? ` data-i="${o.i}"` : ""}${o.disabled ? " disabled" : ""}><span class="dt-text">${dtText(d, mode)}</span>${ico("cal")}</button>`, o.cls);
}
function dtText(d, mode) { return d ? esc(mode === "date" ? fmtDate(d) : fmtDT(d)) : `<span class="ph">${mode === "date" ? "dd/mm/aaaa" : "dd/mm/aaaa hh:mm"}</span>`; }
function readDate(id) { const el = document.getElementById(id); return el ? toDate(el.dataset.value) : null; }
function setDate(id, d) {
  const el = typeof id === "string" ? document.getElementById(id) : id;
  if (!el) return;
  const mode = el.dataset.mode, x = toDate(d);
  el.dataset.value = x ? (mode === "date" ? dayKey(x) : localInput(x)) : "";
  $(".dt-text", el).innerHTML = dtText(x, mode);
}
ACT.pick = (d, t) => openPicker(t);

function openPicker(btn) {
  const mode = btn.dataset.mode;
  const sel = toDate(btn.dataset.value) || (mode === "date" ? startOfDay(new Date()) : roundUpMinutes(new Date(), 5));
  let view = new Date(sel.getFullYear(), sel.getMonth(), 1);
  const el = document.createElement("div");
  el.className = "picker-backdrop";
  document.getElementById("picker-root").append(el);
  const mins = [...Array(12).keys()].map(i => i * 5);
  if (!mins.includes(sel.getMinutes())) { mins.push(sel.getMinutes()); mins.sort((a, b) => a - b); }
  const close = () => el.remove();
  const paint = () => {
    const first = startOfWeek(view), todayK = dayKey(new Date()), selK = dayKey(sel);
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = addDays(first, i), k = dayKey(d);
      cells += `<button type="button" class="pk-day${d.getMonth() !== view.getMonth() ? " other" : ""}${k === todayK ? " today" : ""}${k === selK ? " sel" : ""}${d.getDay() === 0 || d.getDay() === 6 ? " wknd" : ""}" data-k="${k}">${d.getDate()}</button>`;
    }
    el.innerHTML = `<div class="picker" role="dialog" aria-label="Escolher data">
      <div class="pk-head"><button type="button" data-pk="prev" aria-label="Mês anterior">‹</button><strong>${MONTHS[view.getMonth()]} ${view.getFullYear()}</strong><button type="button" data-pk="next" aria-label="Mês seguinte">›</button></div>
      <div class="pk-grid">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(w => `<span class="pk-wd">${w}</span>`).join("")}${cells}</div>
      ${mode === "datetime" ? `<div class="pk-time"><span>Hora</span><select data-pk-h aria-label="Hora">${[...Array(24).keys()].map(h => `<option value="${h}"${h === sel.getHours() ? " selected" : ""}>${pad(h)}</option>`).join("")}</select><b>:</b><select data-pk-m aria-label="Minutos">${mins.map(m => `<option value="${m}"${m === sel.getMinutes() ? " selected" : ""}>${pad(m)}</option>`).join("")}</select></div>` : ""}
      <div class="pk-sel">${WEEKDAYS[sel.getDay()]}, ${mode === "date" ? fmtDate(sel) : fmtDT(sel)}</div>
      <div class="pk-actions"><button type="button" class="btn ghost" data-pk="today">Hoje</button><span class="sp"></span><button type="button" class="btn ghost" data-pk="cancel">Cancelar</button><button type="button" class="btn primary" data-pk="ok">OK</button></div></div>`;
  };
  paint();
  el.addEventListener("click", e => {
    if (e.target === el) return close();
    const day = e.target.closest("[data-k]");
    if (day) { const d = toDate(day.dataset.k); sel.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); view = new Date(d.getFullYear(), d.getMonth(), 1); paint(); return; }
    const a = e.target.closest("[data-pk]")?.dataset.pk;
    if (a === "prev") { view.setMonth(view.getMonth() - 1); paint(); }
    else if (a === "next") { view.setMonth(view.getMonth() + 1); paint(); }
    else if (a === "today") { const t = new Date(); sel.setFullYear(t.getFullYear(), t.getMonth(), t.getDate()); view = new Date(t.getFullYear(), t.getMonth(), 1); paint(); }
    else if (a === "cancel") close();
    else if (a === "ok") {
      setDate(btn, sel); close();
      const f = CHANGE[btn.dataset.change]; if (f) f(btn);
    }
  });
  el.addEventListener("change", e => {
    e.stopPropagation();
    if (e.target.matches("[data-pk-h]")) sel.setHours(+e.target.value);
    if (e.target.matches("[data-pk-m]")) sel.setMinutes(+e.target.value);
    $(".pk-sel", el).textContent = `${WEEKDAYS[sel.getDay()]}, ${fmtDT(sel)}`;
  });
}

/* ---- Pesquisa de cliente (lista só aparece ao escrever) ---- */
function clientPicker(prefix, selectedId = "", o = {}) {
  const c = client(selectedId);
  return `<div class="field client-picker ${o.cls ?? "full"}"><label for="${prefix}-cs">Cliente${o.optional ? "" : " *"}</label><div class="cp-wrap"><input id="${prefix}-cs" type="search" value="${c ? esc(`${c.number} — ${c.name}`) : ""}" placeholder="Pesquisar por nome ou n.º de cliente" autocomplete="off" data-input="cp-search" data-prefix="${prefix}"${o.disabled ? " disabled" : ""}><input type="hidden" id="${prefix}-client" value="${esc(c ? c.id : "")}"${o.change ? ` data-cp-change="${o.change}"` : ""}><div class="cp-results" id="${prefix}-cr" hidden></div></div>${o.disabled || o.noNew ? "" : `<button type="button" class="link-btn" data-act="client-new" data-prefix="${prefix}">+ Novo cliente</button>`}</div>`;
}
CHANGE["cp-search"] = el => {
  const p = el.dataset.prefix, box = document.getElementById(p + "-cr"), hidden = document.getElementById(p + "-client");
  if (hidden.value) { hidden.value = ""; CHANGE[hidden.dataset.cpChange]?.(hidden); }
  const q = el.value.trim().toLowerCase();
  if (!q) { box.hidden = true; return; }
  const arr = data.clients.filter(c => `${c.name} ${c.number} ${c.company} ${c.phone}`.toLowerCase().includes(q)).slice(0, 12);
  box.innerHTML = arr.map(c => `<button type="button" class="cp-opt" data-act="cp-choose" data-prefix="${p}" data-id="${esc(c.id)}"><b>${esc(c.number)}</b> ${esc(c.name)}${c.company ? ` <span class="muted">${esc(c.company)}</span>` : ""}</button>`).join("") || `<div class="cp-empty">Nenhum cliente encontrado.</div>`;
  box.hidden = false;
};
ACT["cp-choose"] = d => {
  const c = client(d.id);
  if (!c) return;
  document.getElementById(d.prefix + "-cs").value = `${c.number} — ${c.name}`;
  const h = document.getElementById(d.prefix + "-client");
  h.value = c.id;
  document.getElementById(d.prefix + "-cr").hidden = true;
  CHANGE[h.dataset.cpChange]?.(h);
};

/* ---- Tipos de serviço (caixas de seleção + "Outro" com texto) ---- */
function serviceChecks(prefix, selected = []) {
  const types = data.settings.serviceTypes || [];
  const other = selected.find(s => /^Outro(:|$)/.test(s));
  const extras = selected.filter(s => !types.includes(s) && !/^Outro(:|$)/.test(s));
  const list = [...types, ...extras];
  return `<fieldset class="field full"><legend>Tipo de serviço *</legend><div class="checks">${list.map(t => `<label class="chk"><input type="checkbox" name="${prefix}-svc" value="${esc(t)}"${selected.includes(t) ? " checked" : ""}><span>${esc(t)}</span></label>`).join("")}<div class="chk-other"><label class="chk"><input type="checkbox" name="${prefix}-svc" value="Outro"${other ? " checked" : ""} data-change="svc-other" data-prefix="${prefix}"><span>Outro</span></label><input type="text" id="${prefix}-svc-other" placeholder="Qual? (opcional)" value="${esc(other ? other.replace(/^Outro:?\s*/, "") : "")}"${other ? "" : " disabled"}></div></div></fieldset>`;
}
CHANGE["svc-other"] = el => { const t = document.getElementById(el.dataset.prefix + "-svc-other"); t.disabled = !el.checked; if (el.checked) t.focus(); };
function getServices(prefix) {
  const arr = checkedValues(prefix + "-svc");
  const i = arr.indexOf("Outro"), txt = val(prefix + "-svc-other").trim();
  if (i >= 0 && txt) arr[i] = `Outro: ${txt}`;
  return arr;
}

/* ---- Teclado no telemóvel: as janelas acompanham a área visível ---- */
function fitViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight, t = vv ? vv.offsetTop : 0;
  document.documentElement.style.setProperty("--vvh", h + "px");
  document.documentElement.style.setProperty("--vvt", t + "px");
}
window.visualViewport?.addEventListener("resize", fitViewport);
window.visualViewport?.addEventListener("scroll", fitViewport);
window.addEventListener("resize", fitViewport);
document.addEventListener("focusin", e => {
  if (e.target.matches?.(".modal input, .modal textarea, .modal select")) setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
});

/* ---- Pequenos componentes ---- */
const pill = s => `<span class="pill ${STATUS_CLS[s] || "st-neutral"}">${esc(s)}</span>`;
const btn = (label, act, attrs = "", cls = "ghost") => `<button type="button" class="btn ${cls}" data-act="${act}" ${attrs}>${label}</button>`;
const iconBtn = (name, act, attrs = "", title = "", cls = "") => `<button type="button" class="icon-btn ${cls}" data-act="${act}" ${attrs} title="${esc(title)}" aria-label="${esc(title)}">${ico(name)}</button>`;
function empty(text, action = "") { return `<div class="empty"><p>${esc(text)}</p>${action}</div>`; }
function mapsLink(c) { const q = [c.address, c.postal, c.local].filter(Boolean).join(", "); return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : ""; }
/* ================= Estrutura principal ================= */
const MORE_TITLES = { finance: "Finanças", equipment: "Equipamentos", settings: "Definições" };
function titleFor() {
  if (ui.route === "more") return MORE_TITLES[ui.more] || "Mais";
  return { home: "Painel", calendar: "Calendário", jobs: "Trabalhos", clients: "Clientes" }[ui.route] || "Calendário";
}
function render() {
  const m = document.getElementById("main");
  if (!m) return;
  document.getElementById("app-version").textContent = APP_VERSION;
  document.getElementById("page-title").textContent = titleFor();
  $$(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.route === ui.route));
  renderSessionBar();
  ({ home: renderHome, calendar: renderCalendar, jobs: renderJobs, clients: renderClients, more: renderMore }[ui.route] || renderCalendar)(m);
}
ACT.nav = d => { ui.route = d.route; if (d.route === "more") ui.more = d.more || null; if (d.tab) ui.jobsTab = d.tab; closeAllModals(); render(); window.scrollTo(0, 0); };

/* Barra fixa da sessão em curso (picagem de ponto) */
function renderSessionBar() {
  const bar = document.getElementById("session-bar");
  const s = activeSession(), j = s && job(s.jobId);
  if (!s || !j) { bar.hidden = true; bar.innerHTML = ""; document.body.classList.remove("has-session"); return; }
  bar.hidden = false; document.body.classList.add("has-session");
  bar.innerHTML = `<button type="button" class="sb-main" data-act="open-job" data-id="${j.id}"><span class="sb-dot"></span><span class="sb-txt"><b>${esc(j.number)} ${esc(clientName(j.clientId))}</b><small>${j.parts.length > 1 ? `Parte ${s.partIndex + 1} · ` : ""}desde ${fmtTime(s.start)}</small></span><span class="sb-time" data-live-since="${esc(s.start)}">${fmtH(sessionHours(s))}</span></button><button type="button" class="btn pause-btn" data-act="part-pause" data-id="${j.id}" data-i="${s.partIndex}">${ico("pause")}Pausar</button>`;
}
function tick() {
  $$("[data-live-since]").forEach(el => el.textContent = fmtH(hoursBetween(el.dataset.liveSince, new Date())));
  $$(".now-line").forEach(el => { const H = n0(el.dataset.h); el.style.top = ((hourOf(new Date()) - CAL_START) * H) + "px"; });
}

/* ================= Painel ================= */
function periodRange() {
  const today = new Date();
  return {
    from: ui.homeFrom ? startOfDay(toDate(ui.homeFrom)) : startOfDay(addDays(today, -29)),
    to: ui.homeTo ? endOfDay(toDate(ui.homeTo)) : endOfDay(today)
  };
}
CHANGE["home-from"] = el => { ui.homeFrom = el.dataset.value || null; render(); };
CHANGE["home-to"] = el => { ui.homeTo = el.dataset.value || null; render(); };
ACT["home-preset"] = d => {
  const t = new Date();
  if (d.p === "30") { ui.homeFrom = ui.homeTo = null; }
  else if (d.p === "month") { ui.homeFrom = dayKey(new Date(t.getFullYear(), t.getMonth(), 1)); ui.homeTo = dayKey(t); }
  else if (d.p === "prev") { ui.homeFrom = dayKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)); ui.homeTo = dayKey(new Date(t.getFullYear(), t.getMonth(), 0)); }
  else if (d.p === "year") { ui.homeFrom = dayKey(new Date(t.getFullYear(), 0, 1)); ui.homeTo = dayKey(t); }
  render();
};

function weekLoad(ref = new Date()) {
  const ws = startOfWeek(ref), we = addDays(ws, 7), days = [0, 0, 0, 0, 0, 0, 0];
  data.jobs.forEach(j => j.parts.forEach(p => {
    if (p.state === "Cancelado") return;
    const s = toDate(p.start), e = toDate(p.end);
    if (e <= ws || s >= we) return;
    for (let i = 0; i < 7; i++) {
      const ds = addDays(ws, i), de = addDays(ws, i + 1);
      const ov = Math.min(e, de) - Math.max(s, ds);
      if (ov > 0) days[i] += ov / 36e5;
    }
  }));
  const worked = sum(data.sessions, s => { const a = toDate(s.start), b = s.end ? toDate(s.end) : new Date(); return Math.max(0, (Math.min(b, we) - Math.max(a, ws)) / 36e5); });
  return { days, total: days.reduce((a, b) => a + b, 0), worked, from: ws };
}

function homeAlerts() {
  const out = [], now = new Date(), s = activeSession();
  if (s && sessionHours(s) >= 10) { const j = job(s.jobId); out.push({ lvl: "bad", text: `A sessão de ${j ? j.number : "trabalho"} está ativa há ${fmtH(sessionHours(s))}. Esqueceu-se de pausar?`, act: `data-act="session-edit" data-id="${s.id}"`, label: "Corrigir" }); }
  let overdue = 0;
  data.jobs.forEach(j => j.parts.forEach(p => { if ((p.state === "Agendado" || p.state === "Em pausa") && toDate(p.end) < startOfDay(now)) overdue++; }));
  if (overdue) out.push({ lvl: "warn", text: `${overdue} ${overdue === 1 ? "parte de trabalho por concluir" : "partes de trabalho por concluir"} de dias anteriores. Aparecem no dia de hoje no calendário.`, act: `data-act="cal-today"`, label: "Ver" });
  data.equipment.forEach(e => maintenanceStatus(e).forEach(m => { if (m.state === "overdue" || m.state === "soon") out.push({ lvl: m.state === "overdue" ? "bad" : "warn", text: `${e.type}${e.brand ? " " + e.brand : ""}: ${m.task.name} ${m.state === "overdue" ? "em atraso desde" : "prevista para"} ${fmtDate(m.next)}.`, act: `data-act="nav" data-route="more" data-more="equipment"`, label: "Abrir" }); }));
  data.quotes.forEach(q => { if (q.status === "Enviado") { const d = Math.round((quoteExpiry(q) - startOfDay(now)) / 864e5); if (d <= 3) out.push({ lvl: d < 0 ? "bad" : "warn", text: `Orçamento ${q.number} (${clientName(q.clientId)}) ${d < 0 ? "expirou" : "expira"} a ${fmtDate(quoteExpiry(q))}.`, act: `data-act="nav" data-route="jobs" data-tab="quotes"`, label: "Ver" }); } });
  const lb = toDate(data.settings.lastBackup), iv = Math.max(30, n0(data.settings.backupIntervalDays));
  if (!lb || (now - lb) / 864e5 >= iv) out.push({ lvl: "warn", text: lb ? `Último backup a ${fmtDate(lb)}.` : "Ainda não foi feito nenhum backup.", act: `data-act="backup-export"`, label: "Fazer backup" });
  return out;
}

function renderHome(m) {
  const R = periodRange();
  const jobsP = data.jobs.filter(j => j.status !== "Cancelado" && inRange(jobStartDate(j), R));
  const worked = jobsP.filter(isWorked);
  const earned = sum(worked, jobCharge);
  const costs = sum(data.costs.filter(c => inRange(c.date, R)), c => c.amount);
  const received = sum(data.payments.filter(p => inRange(p.date, R)), p => p.amount);
  const result = earned - costs;
  const plannedH = sum(jobsP, j => j.estimatedHours), plannedV = sum(jobsP, jobEstimatedValue);
  const workedH = sum(jobsP, j => workedHours(j.id));
  const toReceive = sum(worked, jobDue);
  const paidJobs = worked.filter(j => jobCharge(j) > 0 && jobDue(j) <= 0.005);
  const partJobs = worked.filter(j => jobDue(j) > 0.005 && paidFor(j.id) > 0);
  const unpaidJobs = worked.filter(j => jobDue(j) > 0.005 && paidFor(j.id) <= 0);
  const wl = weekLoad(), cap = n0(data.settings.weeklyCapacity) || 40, free = Math.max(0, cap - wl.total);
  const fixed = fixedPriceAnalysis(R);
  const alerts = homeAlerts();
  const debtors = data.clients.map(c => ({ c, v: clientDue(c.id) })).filter(x => x.v > 0.005).sort((a, b) => b.v - a.v).slice(0, 5);
  const isDefault = !ui.homeFrom && !ui.homeTo;

  m.innerHTML = `
  <section class="period">
    <div class="period-dates">${fDate("De", "home-from", R.from, { mode: "date", change: "home-from" })}${fDate("Até", "home-to", R.to, { mode: "date", change: "home-to" })}</div>
    <div class="chips">${[["30", "Últimos 30 dias"], ["month", "Este mês"], ["prev", "Mês passado"], ["year", "Este ano"]].map(([k, l]) => `<button type="button" class="chip${k === "30" && isDefault ? " on" : ""}" data-act="home-preset" data-p="${k}">${l}</button>`).join("")}</div>
  </section>
  ${alerts.length ? `<section class="alerts">${alerts.map(a => `<div class="alert ${a.lvl}"><span>${esc(a.text)}</span>${a.act ? `<button type="button" class="btn small ghost" ${a.act}>${esc(a.label)}</button>` : ""}</div>`).join("")}</section>` : ""}
  <section class="dash">
    <article class="card dash-balance">
      <h3>Ganhos e custos</h3>
      <div class="result ${result >= 0 ? "pos" : "neg"}"><span>Resultado</span><strong>${money(result)}</strong></div>
      ${hbars([{ l: "Trabalhado", v: earned, c: "var(--leaf)" }, { l: "Custos", v: costs, c: "var(--soil)" }, { l: "Recebido", v: received, c: "var(--sky)" }])}
      <p class="note">Trabalhado: valor real dos trabalhos iniciados ou concluídos no período. Custos: tudo o que foi gasto no período.</p>
    </article>
    <article class="card dash-week">
      <h3>Esta semana</h3>
      <div class="week-ring">${ring(wl.total, cap, `${fmtH(free)}`, "livres")}<div class="ring-legend"><div><i style="background:var(--leaf)"></i>Agendadas <b>${fmtH(wl.total)}</b></div><div><i style="background:var(--line-strong)"></i>Livres <b>${fmtH(free)}</b></div><div><i style="background:var(--sky)"></i>Trabalhadas <b>${fmtH(wl.worked)}</b></div><div class="muted">Capacidade ${fmtH(cap)}</div></div></div>
      ${weekBars(wl)}
    </article>
    <article class="card dash-pay">
      <h3>Pagamentos</h3>
      ${stackBar([{ l: "Pagos", v: sum(paidJobs, jobCharge), n: paidJobs.length, c: "var(--st-green)" }, { l: "Parciais", v: sum(partJobs, jobDue), n: partJobs.length, c: "var(--st-orange)" }, { l: "Por pagar", v: sum(unpaidJobs, jobDue), n: unpaidJobs.length, c: "var(--st-red)" }])}
      <div class="kv"><span>Por receber no período</span><b>${money(toReceive)}</b></div>
      ${debtors.length ? `<h4>Clientes com valores em dívida</h4><ul class="debtors">${debtors.map(x => `<li><button type="button" data-act="client-open" data-id="${x.c.id}"><span>${esc(x.c.name)}</span><b>${money(x.v)}</b></button></li>`).join("")}</ul>` : ""}
    </article>
    <article class="card dash-plan">
      <h3>Previsto e realizado</h3>
      ${pairBars("Horas", plannedH, workedH, fmtH)}
      ${pairBars("Valor", plannedV, earned, money)}
      <p class="note">${jobsP.length} ${jobsP.length === 1 ? "trabalho" : "trabalhos"} no período. Previsto: horas estimadas e valor agendado. Realizado: horas registadas e valor trabalhado.</p>
    </article>
    <article class="card dash-trend">
      <h3>Evolução</h3>
      ${trendChart(R)}
    </article>
    <article class="card dash-fixed">
      <h3>Trabalhos a preço fixo</h3>
      ${fixed.length ? `<p class="note">Valor por hora real, comparado com o seu preço/hora (${money(data.settings.hourlyRate)}).</p><ul class="fixed-list">${fixed.map(f => `<li class="${f.rate < n0(data.settings.hourlyRate) ? "below" : "ok"}"><div><b>${esc(f.label)}</b><small>${money(f.value)} em ${fmtH(f.hours)}${f.count > 1 ? ` · ${f.count} visitas` : ""}</small></div><strong>${money(f.rate)}/h</strong></li>`).join("")}</ul>` : `<p class="muted">Sem trabalhos a preço fixo com horas registadas neste período.</p>`}
    </article>
  </section>
  <section class="today-sec">
    <div class="section-head"><h2>Hoje</h2><button type="button" class="btn ghost small" data-act="cal-today">Abrir calendário</button></div>
    ${todayList()}
  </section>`;
}
function fixedPriceAnalysis(R) {
  const groups = {};
  data.jobs.filter(j => j.priceType === "fixed" && j.status !== "Cancelado" && inRange(jobStartDate(j), R)).forEach(j => {
    const h = workedHours(j.id);
    if (h <= 0) return;
    const k = j.recurrence?.seriesId || j.id;
    const g = groups[k] = groups[k] || { label: `${clientName(j.clientId)} — ${serviceNames(j).join(", ")}`, value: 0, hours: 0, count: 0 };
    g.value += n0(j.price); g.hours += h; g.count++;
  });
  return Object.values(groups).map(g => ({ ...g, rate: g.value / g.hours })).sort((a, b) => a.rate - b.rate);
}
function todayList() {
  const now = new Date(), today = startOfDay(now), tomorrow = addDays(today, 1);
  const items = calItems(today, tomorrow).sort((a, b) => a.s - b.s);
  if (!items.length) return empty("Não há trabalhos para hoje.", `<button type="button" class="btn primary" data-act="job-new">${ico("plus")}Novo trabalho</button>`);
  return `<div class="stack">${items.map(it => {
    const { j, p, idx } = it;
    return `<article class="card today-item ${STATUS_CLS[p.state]}"><div class="ti-time">${fmtTime(it.s)}<small>${fmtTime(it.e)}</small></div><div class="ti-body"><b>${esc(j.number)} ${esc(clientName(j.clientId))}</b><span>${esc(serviceNames(j).join(", "))}${j.parts.length > 1 ? ` · parte ${idx + 1}/${j.parts.length}` : ""}</span>${it.carried ? `<small class="carried">Por concluir desde ${fmtDate(it.orig)}</small>` : ""}<div class="actions">${partButtons(j, p, idx, true)}${btn("Abrir", "open-job", `data-id="${j.id}" data-i="${idx}"`)}</div></div>${pill(p.state)}</article>`;
  }).join("")}</div>`;
}

/* ---- Gráficos simples em SVG/CSS (sem bibliotecas externas) ---- */
function hbars(rows) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.v)));
  return `<div class="hbars">${rows.map(r => `<div class="hb"><span>${r.l}</span><div class="hb-track"><i style="width:${Math.max(r.v > 0 ? 2 : 0, Math.abs(r.v) / max * 100)}%;background:${r.c}"></i></div><b>${money(r.v)}</b></div>`).join("")}</div>`;
}
function ring(value, total, big, small) {
  const r = 42, c = 2 * Math.PI * r, f = total > 0 ? Math.min(1, value / total) : 0, over = value > total;
  return `<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${esc(big)} ${esc(small)}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line-strong)" stroke-width="11"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${over ? "var(--st-red)" : "var(--leaf)"}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${f * c} ${c}" transform="rotate(-90 50 50)"/><text x="50" y="49" text-anchor="middle" class="ring-big">${esc(big)}</text><text x="50" y="63" text-anchor="middle" class="ring-small">${esc(small)}</text></svg>`;
}
function weekBars(wl) {
  const max = Math.max(1, ...wl.days, (hmToHours(data.settings.workEnd) - hmToHours(data.settings.workStart)) || 8);
  const tk = dayKey(new Date());
  return `<div class="wbars">${wl.days.map((h, i) => { const d = addDays(wl.from, i); return `<button type="button" class="wb${dayKey(d) === tk ? " today" : ""}" data-act="cal-goto" data-day="${dayKey(d)}"><div class="wb-col"><i style="height:${h / max * 100}%"></i></div><span>${WEEKDAYS[d.getDay()]}</span><small>${h ? fmtH(h) : "–"}</small></button>`; }).join("")}</div>`;
}
function stackBar(rows) {
  const tot = rows.reduce((a, r) => a + r.v, 0);
  return `<div class="stackbar">${tot > 0 ? rows.map(r => r.v > 0 ? `<i style="flex:${r.v};background:${r.c}"></i>` : "").join("") : `<i style="flex:1;background:var(--line)"></i>`}</div><div class="stack-legend">${rows.map(r => `<div><i style="background:${r.c}"></i><span>${r.l} (${r.n})</span><b>${money(r.v)}</b></div>`).join("")}</div>`;
}
function pairBars(label, a, b, f) {
  const max = Math.max(1e-9, a, b);
  return `<div class="pair"><div class="pair-l">${label}</div><div class="pb"><span>Previsto</span><div class="hb-track"><i style="width:${a / max * 100}%;background:var(--line-strong)"></i></div><b>${f(a)}</b></div><div class="pb"><span>Realizado</span><div class="hb-track"><i style="width:${b / max * 100}%;background:var(--leaf)"></i></div><b>${f(b)}</b></div></div>`;
}
function trendChart(R) {
  const days = Math.round((R.to - R.from) / 864e5) + 1, monthly = days > 120;
  const buckets = [];
  let cur = monthly ? new Date(R.from.getFullYear(), R.from.getMonth(), 1) : startOfWeek(R.from);
  while (cur <= R.to && buckets.length < 24) { const next = monthly ? new Date(cur.getFullYear(), cur.getMonth() + 1, 1) : addDays(cur, 7); buckets.push({ from: cur, to: next, earn: 0, cost: 0 }); cur = next; }
  const find = d => buckets.find(b => d >= b.from && d < b.to);
  data.jobs.filter(j => j.status !== "Cancelado" && isWorked(j) && inRange(jobStartDate(j), R)).forEach(j => { const b = find(jobStartDate(j)); if (b) b.earn += jobCharge(j); });
  data.costs.filter(c => inRange(c.date, R)).forEach(c => { const b = find(toDate(c.date)); if (b) b.cost += n0(c.amount); });
  const max = Math.max(1, ...buckets.map(b => Math.max(b.earn, b.cost)));
  const W = 320, H = 150, pb = 24, bw = (W - 10) / buckets.length;
  const bars = buckets.map((b, i) => {
    const x = 5 + i * bw, w = Math.max(2, bw / 2 - 3), he = b.earn / max * (H - pb - 10), hc = b.cost / max * (H - pb - 10);
    const lab = monthly ? MONTHS[b.from.getMonth()].slice(0, 3) : `${pad(b.from.getDate())}/${pad(b.from.getMonth() + 1)}`;
    return `<rect x="${x + 2}" y="${H - pb - he}" width="${w}" height="${he}" rx="2" fill="var(--leaf)"><title>${lab}: ganhos ${money(b.earn)}</title></rect><rect x="${x + 2 + w + 1}" y="${H - pb - hc}" width="${w}" height="${hc}" rx="2" fill="var(--soil)"><title>${lab}: custos ${money(b.cost)}</title></rect>${buckets.length <= 12 || i % 2 === 0 ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="axis">${lab}</text>` : ""}`;
  }).join("");
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ganhos e custos por ${monthly ? "mês" : "semana"}"><line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line-strong)"/>${bars}</svg><div class="legend"><span><i style="background:var(--leaf)"></i>Ganhos</span><span><i style="background:var(--soil)"></i>Custos</span><span class="muted">por ${monthly ? "mês" : "semana"}</span></div>`;
}

/* ================= Calendário ================= */
/** Partes de trabalho num intervalo + partes não concluídas de dias anteriores, que "avançam" para hoje. */
function calItems(from, to) {
  const items = [];
  data.jobs.forEach(j => j.parts.forEach((p, idx) => {
    const s = toDate(p.start), e = toDate(p.end);
    if (e > from && s < to) items.push({ j, p, idx, s, e });
  }));
  const today = startOfDay(new Date());
  if (today >= from && today < to) {
    data.jobs.forEach(j => j.parts.forEach((p, idx) => {
      if (!(p.state === "Agendado" || p.state === "Em pausa")) return;
      const s = toDate(p.start), e = toDate(p.end);
      if (e >= today) return;
      const ns = new Date(today); ns.setHours(s.getHours(), s.getMinutes(), 0, 0);
      items.push({ j, p, idx, s: ns, e: new Date(ns.getTime() + Math.min(e - s, 8 * 36e5)), carried: true, orig: s });
    }));
  }
  return items;
}
function hourHeight() {
  const min = ui.calView === "day" ? 30 : 22;
  if (ui.calFit && ui.calFit.view === ui.calView && ui.calFit.w === window.innerWidth && ui.calFit.h === window.innerHeight) return Math.max(min, ui.calFit.H);
  const avail = window.innerHeight - (window.innerWidth < 760 ? 430 : 300);
  return Math.max(min, Math.min(56, Math.floor(avail / (CAL_END - CAL_START))));
}
/** Mede o espaço que sobra no ecrã e ajusta a altura de cada hora para o dia inteiro (06–22) caber sem deslocar. */
function fitCalendar() {
  const body = document.querySelector(".cal-body");
  if (!body) return;
  const top = body.getBoundingClientRect().top + window.scrollY;
  const nav = document.querySelector(".bottom-nav")?.offsetHeight || 64;
  const bar = document.getElementById("session-bar");
  const sess = bar && !bar.hidden ? bar.offsetHeight + 10 : 0;
  const legend = 40;
  const H = Math.min(56, Math.floor((window.innerHeight - top - nav - sess - legend - 14) / (CAL_END - CAL_START)));
  const cur = n0(getComputedStyle(body.parentElement).getPropertyValue("--hh"));
  ui.calFit = { view: ui.calView, w: window.innerWidth, h: window.innerHeight, H };
  if (Math.abs(Math.max(ui.calView === "day" ? 30 : 22, H) - cur) >= 1) {
    const g = document.querySelector(".cal-grid");
    if (g) g.outerHTML = hourGrid();
  }
}
let calResizeT = null;
window.addEventListener("resize", () => { clearTimeout(calResizeT); calResizeT = setTimeout(() => { if (ui.route === "calendar" && !layers.length) render(); }, 200); });
function calLabel() {
  const d = ui.calDate;
  if (ui.calView === "day") return `${WEEKDAYS[d.getDay()]}, ${fmtDate(d)}`;
  if (ui.calView === "month") return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const ws = startOfWeek(d), we = addDays(ws, 6);
  return `${pad(ws.getDate())}/${pad(ws.getMonth() + 1)} – ${fmtDate(we)}`;
}
function renderCalendar(m) {
  m.innerHTML = `
  <div class="cal-top">
    <div class="actions"><button type="button" class="btn primary" data-act="job-new">${ico("plus")}Novo trabalho</button><button type="button" class="btn ghost" data-act="nav" data-route="jobs" data-tab="quotes">${ico("doc")}Converter orçamento</button></div>
    <div class="cal-bar">
      <div class="cal-nav"><button type="button" class="icon-btn" data-act="cal-shift" data-n="-1" aria-label="Anterior">‹</button><strong>${calLabel()}</strong><button type="button" class="icon-btn" data-act="cal-shift" data-n="1" aria-label="Seguinte">›</button><button type="button" class="btn ghost small" data-act="cal-today">Hoje</button></div>
      <div class="seg">${[["day", "Dia"], ["week", "Semana"], ["month", "Mês"]].map(([v, l]) => `<button type="button" class="${ui.calView === v ? "on" : ""}" data-act="cal-view" data-v="${v}">${l}</button>`).join("")}</div>
    </div>
  </div>
  ${ui.calView === "month" ? monthGrid() : hourGrid()}
  <div class="legend">${STATES.map(s => `<span><i class="${STATUS_CLS[s]}"></i>${s}</span>`).join("")}<span><i class="carried-swatch"></i>Por concluir</span></div>`;
  if (ui.calView !== "month") fitCalendar();
}
ACT["cal-shift"] = d => {
  const n = +d.n, x = ui.calDate;
  ui.calDate = ui.calView === "day" ? addDays(x, n) : ui.calView === "week" ? addDays(x, 7 * n) : new Date(x.getFullYear(), x.getMonth() + n, 1);
  render();
};
ACT["cal-view"] = d => { ui.calView = d.v; render(); };
ACT["cal-today"] = () => { ui.route = "calendar"; ui.calDate = new Date(); if (ui.calView === "month") ui.calView = "week"; closeAllModals(); render(); };
ACT["cal-goto"] = d => { ui.route = "calendar"; ui.calDate = toDate(d.day); ui.calView = "day"; render(); window.scrollTo(0, 0); };
ACT["cal-slot"] = d => { const s = toDate(d.day); s.setHours(+d.h, 0, 0, 0); openJobForm({ start: s }); };

function layoutLanes(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], end = 0;
  const flush = () => { const lanes = []; cluster.forEach(it => { let l = lanes.findIndex(x => x <= +it.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = +it.e; it.lane = l; }); cluster.forEach(it => it.lanes = lanes.length); cluster = []; end = 0; };
  items.forEach(it => { if (cluster.length && +it.s >= end) flush(); cluster.push(it); end = Math.max(end, +it.e); });
  if (cluster.length) flush();
}
function hourGrid() {
  const H = hourHeight(), rows = CAL_END - CAL_START;
  const days = ui.calView === "day" ? [startOfDay(ui.calDate)] : [...Array(7)].map((_, i) => addDays(startOfWeek(ui.calDate), i));
  const tk = dayKey(new Date()), ws = hmToHours(data.settings.workStart), we = hmToHours(data.settings.workEnd);
  const compact = ui.calView === "week" && window.innerWidth < 760;
  const cols = days.map(d => {
    const ds = new Date(d); ds.setHours(CAL_START, 0, 0, 0);
    const de = new Date(d); de.setHours(CAL_END, 0, 0, 0);
    const items = calItems(startOfDay(d), addDays(startOfDay(d), 1));
    layoutLanes(items);
    const ev = items.map(it => {
      const s = new Date(Math.max(it.s, ds)), e = new Date(Math.min(it.e, de));
      const outside = it.e <= ds || it.s >= de;
      const top = outside ? (it.s >= de ? rows * H - 18 : 0) : (s - ds) / 36e5 * H;
      const h = outside ? 18 : Math.max(16, (e - s) / 36e5 * H - 2);
      const w = 100 / it.lanes, left = it.lane * w;
      const st = it.p.state, j = it.j;
      const label = compact ? `<b>${esc(j.number.replace(/^#0*(?=\d)/, "#"))}</b>` : `<b>${esc(j.number)} ${esc(clientName(j.clientId))}</b>${h > 30 ? `<span>${esc(serviceNames(j).join(", "))}</span>` : ""}${h > 46 ? `<span>${fmtTime(it.s)}–${fmtTime(it.e)}${j.parts.length > 1 ? ` · parte ${it.idx + 1}/${j.parts.length}` : ""}</span>` : ""}`;
      return `<button type="button" class="ev ${STATUS_CLS[st]}${it.carried ? " carried" : ""}" style="top:${top}px;height:${h}px;left:calc(${left}% + 1px);width:calc(${w}% - 2px)" data-act="open-job" data-id="${j.id}" data-i="${it.idx}" title="${esc(`${j.number} ${clientName(j.clientId)} · ${serviceNames(j).join(", ")} · ${fmtTime(it.s)}–${fmtTime(it.e)} · ${st}`)}">${label}</button>`;
    }).join("");
    const offA = Math.max(0, Math.min(rows, ws - CAL_START)) * H, offB = Math.max(0, Math.min(rows, CAL_END - we)) * H;
    const isToday = dayKey(d) === tk, nowH = hourOf(new Date());
    const slots = [...Array(rows)].map((_, i) => `<button type="button" class="slot" style="top:${i * H}px;height:${H}px" data-act="cal-slot" data-day="${dayKey(d)}" data-h="${CAL_START + i}" aria-label="Novo trabalho ${pad(CAL_START + i)}:00"></button>`).join("");
    return `<div class="cal-col${isToday ? " is-today" : ""}"><div class="off" style="top:0;height:${offA}px"></div><div class="off" style="bottom:0;height:${offB}px"></div>${slots}${ev}${isToday && nowH >= CAL_START && nowH <= CAL_END ? `<div class="now-line" data-h="${H}" style="top:${(nowH - CAL_START) * H}px"></div>` : ""}</div>`;
  }).join("");
  const heads = days.map(d => `<button type="button" class="cal-dh${dayKey(d) === tk ? " today" : ""}" data-act="cal-goto" data-day="${dayKey(d)}"><span>${WEEKDAYS[d.getDay()]}</span><b>${d.getDate()}</b></button>`).join("");
  const labels = [...Array(rows + 1)].map((_, i) => `<span style="top:${i * H}px">${pad(CAL_START + i)}:00</span>`).join("");
  return `<div class="cal-grid ${ui.calView}" style="--hh:${H}px;--cols:${days.length}"><div class="cal-heads"><div></div>${heads}</div><div class="cal-body" style="height:${rows * H}px"><div class="cal-times">${labels}</div>${cols}</div></div>`;
}
function monthGrid() {
  const y = ui.calDate.getFullYear(), mo = ui.calDate.getMonth(), first = startOfWeek(new Date(y, mo, 1)), tk = dayKey(new Date());
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = addDays(first, i);
    if (i === 35 && d.getMonth() !== mo) break;
    const items = calItems(startOfDay(d), addDays(startOfDay(d), 1)).sort((a, b) => a.s - b.s);
    const shown = items.slice(0, 3);
    cells += `<button type="button" class="mc${d.getMonth() !== mo ? " other" : ""}${dayKey(d) === tk ? " today" : ""}" data-act="cal-goto" data-day="${dayKey(d)}"><span class="mc-d">${d.getDate()}</span>${shown.map(it => `<span class="mc-ev ${STATUS_CLS[it.p.state]}${it.carried ? " carried" : ""}">${fmtTime(it.s)}<em> ${esc(it.j.number)}</em></span>`).join("")}${items.length > 3 ? `<span class="mc-more">+${items.length - 3}</span>` : ""}</button>`;
  }
  return `<div class="month"><div class="month-head">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(w => `<span>${w}</span>`).join("")}</div><div class="month-grid">${cells}</div></div>`;
}
/* ================= Trabalhos: lista ================= */
function nextPart(j) {
  return j.parts.map((p, idx) => ({ p, idx })).filter(x => x.p.state !== "Concluído" && x.p.state !== "Cancelado").sort((a, b) => toDate(a.p.start) - toDate(b.p.start))[0] || null;
}
function seriesJobs(j) { return j.recurrence ? data.jobs.filter(x => x.recurrence?.seriesId === j.recurrence.seriesId).sort((a, b) => a.recurrence.index - b.recurrence.index) : [j]; }

function renderJobs(m) {
  const openQ = data.quotes.filter(q => ["Rascunho", "Enviado", "Aceite"].includes(q.status)).length;
  const tabs = `<div class="subtabs"><button type="button" class="${ui.jobsTab === "jobs" ? "on" : ""}" data-act="jobs-tab" data-v="jobs">Trabalhos</button><button type="button" class="${ui.jobsTab === "quotes" ? "on" : ""}" data-act="jobs-tab" data-v="quotes">Orçamentos${openQ ? ` <span class="count">${openQ}</span>` : ""}</button></div>`;
  if (ui.jobsTab === "quotes") { m.innerHTML = tabs + quotesHTML(); return; }
  const filters = ["Todos", "Agendado", "Em curso", "Em pausa", "Concluído", "Por receber", "Cancelado"];
  m.innerHTML = `${tabs}<div class="actions"><button type="button" class="btn primary" data-act="job-new">${ico("plus")}Novo trabalho</button><button type="button" class="btn ghost" data-act="quote-new">${ico("plus")}Novo orçamento</button></div>
  <input type="search" id="job-search" class="search" placeholder="Pesquisar por cliente, n.º ou serviço" value="${esc(ui.jobSearch)}" data-input="job-search" autocomplete="off">
  <div class="chips scroll">${filters.map(f => `<button type="button" class="chip${ui.jobFilter === f ? " on" : ""}" data-act="job-filter" data-v="${f}">${f}</button>`).join("")}</div>
  <div id="job-list"></div>`;
  renderJobList();
}
ACT["jobs-tab"] = d => { ui.jobsTab = d.v; render(); };
ACT["job-filter"] = d => { ui.jobFilter = d.v; render(); };
CHANGE["job-search"] = el => { ui.jobSearch = el.value; renderJobList(); };
function renderJobList() {
  const box = document.getElementById("job-list");
  if (!box) return;
  const q = ui.jobSearch.trim().toLowerCase();
  let arr = data.jobs.filter(j => !q || `${j.number} ${clientName(j.clientId)} ${client(j.clientId)?.number || ""} ${serviceNames(j).join(" ")} ${j.description}`.toLowerCase().includes(q));
  const f = ui.jobFilter;
  if (f === "Por receber") arr = arr.filter(j => jobDue(j) > 0.005);
  else if (f !== "Todos") arr = arr.filter(j => j.status === f);
  if (!arr.length) { box.innerHTML = empty(data.jobs.length ? "Nenhum trabalho corresponde à pesquisa." : "Ainda não existem trabalhos.", data.jobs.length ? "" : `<button type="button" class="btn primary" data-act="job-new">${ico("plus")}Criar o primeiro trabalho</button>`); return; }
  const nd = j => { const n = nextPart(j); return n ? toDate(n.p.start) : jobStartDate(j); };
  const asc = (a, b) => nd(a) - nd(b), desc = (a, b) => toDate(b.completedAt || jobStartDate(b)) - toDate(a.completedAt || jobStartDate(a));
  const groups = f === "Todos"
    ? [["A decorrer", arr.filter(j => j.status === "Em curso" || j.status === "Em pausa").sort(asc)], ["Agendados", arr.filter(j => j.status === "Agendado").sort(asc)], ["Concluídos", arr.filter(j => j.status === "Concluído").sort(desc)], ["Cancelados", arr.filter(j => j.status === "Cancelado").sort(desc)]]
    : [["", arr.sort(f === "Concluído" || f === "Cancelado" ? desc : asc)]];
  box.innerHTML = groups.filter(g => g[1].length).map(([t, list]) => `${t ? `<h3 class="group-title">${t} <span>${list.length}</span></h3>` : ""}<div class="stack">${list.map(jobCard).join("")}</div>`).join("");
}
function jobCard(j) {
  const np = nextPart(j), wh = workedHours(j.id), est = n0(j.estimatedHours), due = jobDue(j), ch = jobCharge(j);
  const s = activeSession(), running = s && s.jobId === j.id;
  const pct = est > 0 ? Math.min(100, wh / est * 100) : 0;
  const when = np ? `${fmtDayShort(np.p.start)}, ${fmtTime(np.p.start)}–${fmtTime(np.p.end)}${j.parts.length > 1 ? ` · parte ${np.idx + 1}/${j.parts.length}` : ""}` : `${fmtDate(j.completedAt || jobStartDate(j))}`;
  const quick = running ? partButtons(j, j.parts[s.partIndex], s.partIndex, true) : np ? partButtons(j, np.p, np.idx, true) : "";
  return `<article class="card job-card ${STATUS_CLS[j.status]}">
    <div class="jc-top"><button type="button" class="jc-open" data-act="open-job" data-id="${j.id}"><span class="jc-title"><b>${esc(j.number)}</b> ${esc(clientName(j.clientId))}</span><span class="jc-sub">${esc(serviceNames(j).join(", ") || "—")}</span></button>${pill(j.status)}</div>
    <div class="jc-meta"><span>${when}</span><span>${fmtH(wh)} de ${fmtH(est)}</span><span>${money(ch)}${due > 0.005 ? ` · <b class="due">${money(due)} por receber</b>` : ""}</span></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="actions">${quick}${due > 0.005 ? btn("Pagamento", "pay-new", `data-job="${j.id}"`) : ""}${btn("Abrir", "open-job", `data-id="${j.id}"`)}</div>
  </article>`;
}
function partButtons(j, p, i, compact = false) {
  if (!p || j.status === "Cancelado" || p.state === "Cancelado") return "";
  const s = activeSession(), running = s && s.jobId === j.id && s.partIndex === i, a = `data-id="${j.id}" data-i="${i}"`;
  if (running) return btn(ico("pause") + "Pausar", "part-pause", a, "warn") + btn(ico("check") + "Concluir", "part-done", a);
  if (p.state === "Agendado" || p.state === "Em pausa") return btn(ico("play") + (p.state === "Em pausa" ? "Retomar" : "Iniciar"), "part-start", a, "primary") + (compact ? "" : btn(ico("check") + "Concluir", "part-done", a) + btn("Reagendar", "part-resched", a));
  if (p.state === "Concluído" && !compact) return btn("Reabrir", "part-reopen", a);
  return "";
}

/* ================= Formulário de trabalho (novo, editar, converter orçamento) ================= */
let JF = null;
function openJobForm(o = {}) {
  if (!data.clients.length) {
    openModal({ title: "Primeiro cliente", small: true, body: `<p>Para criar um trabalho é necessário ter pelo menos um cliente.</p>`, footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="client-new-replace">Criar cliente</button>` });
    return;
  }
  const S = data.settings, j = o.jobId ? job(o.jobId) : null, q = o.quoteId ? quote(o.quoteId) : null;
  const start0 = o.start ? toDate(o.start) : roundUpMinutes(new Date(), 5);
  const est = j ? j.estimatedHours : q ? (q.expectedHours || "") : "";
  const firstDur = (n0(est) || 1) * 36e5;
  JF = {
    jobId: j?.id || null, quoteId: q?.id || null, fixedTouched: !!j && j.priceType === "fixed",
    parts: j ? j.parts.map(p => ({ start: toDate(p.start), end: toDate(p.end), manual: false })) : [{ start: start0, end: new Date(start0.getTime() + firstDur), manual: false }]
  };
  const ptype = j ? j.priceType : "hourly";
  const rate = j ? j.hourlyRate : q ? q.hourlyRate : S.hourlyRate;
  const minC = j ? j.minCharge : S.minPrice;
  const price = j ? j.price : q ? quoteLabor(q) : Math.max(n0(S.minPrice), n0(est) * n0(rate));
  if (q) JF.fixedTouched = true;
  const freq = q ? q.frequency : "Pontual";
  const title = j ? `Editar trabalho ${j.number}` : q ? `Converter orçamento ${q.number}` : "Novo trabalho";
  const matBlock = q && q.materials.length ? `<div class="full sub-block"><h4>Materiais do orçamento</h4><ul class="mini-list">${q.materials.map(m => `<li><span>${esc(m.description || "Material")}</span><b>${money(matClient(m))}</b></li>`).join("")}</ul>${fToggle("Registar estes materiais como custos imputados ao cliente", "jf-mat", true, { change: "jf-calc" })}<div id="jf-mat-all-wrap"${freq === "Pontual" ? " hidden" : ""}>${fToggle("Repetir os materiais em todas as ocorrências", "jf-mat-all", false)}</div></div>` : "";
  const recBlock = j
    ? (j.recurrence ? `<p class="info full">Ocorrência ${j.recurrence.index + 1} de uma série ${j.recurrence.frequency.toLowerCase()}. As alterações aplicam-se só a esta ocorrência.</p>` : "")
    : `<div class="full sub-block"><h4>Periodicidade</h4><div class="form-grid">${fSelect("Repetição", "jf-freq", FREQS, freq, { change: "jf-freq" })}<div id="jf-occ-wrap"${freq === "Pontual" ? " hidden" : ""}>${fStepper("N.º de ocorrências", "jf-occ", FREQ_PER_YEAR[freq] || 1, { min: 1, max: 520, change: "jf-occ" })}</div></div><div id="jf-period-wrap" class="chips"${freq === "Pontual" ? " hidden" : ""}><span class="muted small">Período do acordo:</span>${[[3, "3 meses"], [6, "6 meses"], [12, "1 ano"], [24, "2 anos"]].map(([mm, l]) => `<button type="button" class="chip" data-act="jf-period" data-m="${mm}">${l}</button>`).join("")}</div><div id="jf-rec-preview" class="rec-preview"></div></div>`;
  openModal({
    title, wide: true,
    body: `<div class="form-grid">
      ${q ? `<p class="info full">Os dados do orçamento ${esc(q.number)} (versão ${q.version}) foram transferidos. Defina a data, as partes e a periodicidade.</p>` : ""}
      ${clientPicker("jf", j?.clientId || q?.clientId || o.clientId || "")}
      ${serviceChecks("jf", j?.serviceTypes || q?.services || [])}
      ${fText("Descrição (opcional)", "jf-desc", j?.description ?? q?.description ?? "", { cls: "full" })}
      ${fNum("N.º de horas estimadas *", "jf-est", est, { input: "jf-est", ph: "Ex.: 2,5" })}
      ${fStepper("N.º de partes do trabalho", "jf-n", JF.parts.length, { min: 1, max: 30, change: "jf-n" })}
      <div class="full" id="jf-parts"></div>
      <fieldset class="field full"><legend>Preço</legend><div class="seg wide"><label><input type="radio" name="jf-ptype" value="hourly"${ptype === "hourly" ? " checked" : ""} data-change="jf-calc"><span>À hora</span></label><label><input type="radio" name="jf-ptype" value="fixed"${ptype === "fixed" ? " checked" : ""} data-change="jf-calc"><span>Preço fixo</span></label></div></fieldset>
      <div class="full form-grid" id="jf-hourly">${fNum("Preço/hora (€)", "jf-rate", rate, { input: "jf-calc" })}${fNum("Valor mínimo a cobrar (€)", "jf-min", minC, { input: "jf-calc" })}</div>
      <div class="full form-grid" id="jf-fixed">${fNum("Valor fixo (€)", "jf-price", price, { input: "jf-price" })}<p class="muted small">Pré-preenchido com o maior valor entre o preço mínimo e horas × preço/hora.</p></div>
      <div class="full calc-box" id="jf-calcbox"></div>
      ${matBlock}
      ${recBlock}
      ${fArea("Notas", "jf-notes", j?.notes ?? q?.notes ?? "", { cls: "full" })}
    </div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="jf-save">${j ? "Gravar alterações" : q ? "Criar trabalho" : "Guardar trabalho"}</button>`,
    onMount: () => { paintJFParts(); jfCalc(); paintRecPreview(); },
    onClose: () => { JF = null; }
  });
}
ACT["client-new-replace"] = () => { closeModal(); openClientForm(); };
function jfShare() { const est = parseNum(val("jf-est")); return est > 0 ? est / JF.parts.length : 1; }
function jfReflow() { const sh = jfShare(); JF.parts.forEach(p => { if (!p.manual) p.end = new Date(p.start.getTime() + sh * 36e5); }); }
function paintJFParts() {
  const box = document.getElementById("jf-parts");
  if (!box || !JF) return;
  box.innerHTML = `<div class="parts">${JF.parts.map((p, i) => `<div class="part"><div class="part-h"><b>Parte ${i + 1}</b><small>${WEEKDAYS[p.start.getDay()]} · ${fmtH(hoursBetween(p.start, p.end))}</small></div><div class="form-grid two">${fDate("Início", `jf-ps-${i}`, p.start, { change: "jf-ps", i })}${fDate("Fim", `jf-pe-${i}`, p.end, { change: "jf-pe", i })}</div></div>`).join("")}</div><div class="parts-total" id="jf-ptotal"></div>`;
  paintJFTotal();
}
function paintJFTotal() {
  const el = document.getElementById("jf-ptotal");
  if (!el || !JF) return;
  const tot = sum(JF.parts, p => hoursBetween(p.start, p.end)), est = parseNum(val("jf-est"));
  el.innerHTML = `Agendado: <b>${fmtH(tot)}</b>${est > 0 ? ` · Estimado: <b>${fmtH(est)}</b>${Math.abs(tot - est) > 0.01 ? ` <span class="warn-txt">${tot > est ? "excede" : "faltam"} ${fmtH(Math.abs(tot - est))}</span>` : ` <span class="ok-txt">✓</span>`}` : ""}`;
}
CHANGE["jf-ps"] = el => {
  const i = +el.dataset.i, d = readDate(el.id);
  if (!d || !JF) return;
  JF.parts[i].start = d; JF.parts[i].end = new Date(d.getTime() + jfShare() * 36e5); JF.parts[i].manual = false;
  paintJFParts(); paintRecPreview();
};
CHANGE["jf-pe"] = el => {
  const i = +el.dataset.i, d = readDate(el.id);
  if (!d || !JF) return;
  if (d <= JF.parts[i].start) { toast("O fim tem de ser depois do início."); setDate(el, JF.parts[i].end); return; }
  JF.parts[i].end = d; JF.parts[i].manual = true; paintJFParts();
};
CHANGE["jf-est"] = () => { if (!JF) return; jfReflow(); paintJFParts(); jfCalc(); };
CHANGE["jf-n"] = el => {
  if (!JF) return;
  const n = +el.value, cur = JF.parts.length;
  if (n < cur && JF.jobId && data.sessions.some(s => s.jobId === JF.jobId && s.partIndex >= n)) { toast("Não é possível remover partes que já têm horas registadas."); el.value = cur; return; }
  if (n > cur) for (let i = cur; i < n; i++) { const s = addDays(JF.parts[i - 1].start, 1); JF.parts.push({ start: s, end: s, manual: false }); }
  else JF.parts = JF.parts.slice(0, n);
  JF.parts.forEach(p => p.manual = false);
  jfReflow(); paintJFParts();
};
function jfPtype() { return $('input[name="jf-ptype"]:checked')?.value || "hourly"; }
function jfMaterials() { const q = JF?.quoteId && quote(JF.quoteId); return q && $("#jf-mat")?.checked ? quoteMaterials(q) : 0; }
function jfCalc() {
  if (!JF) return;
  const t = jfPtype(), hEl = document.getElementById("jf-hourly"), fEl = document.getElementById("jf-fixed");
  if (!hEl) return;
  hEl.hidden = t !== "hourly"; fEl.hidden = t !== "fixed";
  const est = n0(val("jf-est")), rate = n0(val("jf-rate")), min = n0(val("jf-min"));
  if (t === "fixed" && !JF.fixedTouched) document.getElementById("jf-price").value = inputNum(Math.max(n0(data.settings.minPrice), est * (rate || n0(data.settings.hourlyRate))));
  const labor = t === "hourly" ? Math.max(min, est * rate) : n0(val("jf-price")), mats = jfMaterials();
  document.getElementById("jf-calcbox").innerHTML = `<div class="kv"><span>${t === "hourly" ? `Mão de obra estimada (${fmtH(est)} × ${money(rate)})${est * rate < min ? " · aplica-se o mínimo" : ""}` : "Valor acordado"}</span><b>${money(labor)}</b></div>${mats ? `<div class="kv"><span>Materiais (preço ao cliente)</span><b>${money(mats)}</b></div><div class="kv total"><span>Total previsto</span><b>${money(labor + mats)}</b></div>` : ""}${t === "hourly" ? `<p class="muted small">O valor final é calculado com as horas efetivamente registadas.</p>` : ""}`;
}
CHANGE["jf-calc"] = jfCalc;
CHANGE["jf-price"] = () => { if (JF) { JF.fixedTouched = true; jfCalc(); } };
CHANGE["jf-freq"] = el => {
  const f = el.value, rec = f !== "Pontual";
  document.getElementById("jf-occ-wrap").hidden = !rec;
  document.getElementById("jf-period-wrap").hidden = !rec;
  const mw = document.getElementById("jf-mat-all-wrap"); if (mw) mw.hidden = !rec;
  if (rec) document.getElementById("jf-occ").value = FREQ_PER_YEAR[f] || 1;
  paintRecPreview();
};
CHANGE["jf-occ"] = () => paintRecPreview();
ACT["jf-period"] = d => { const f = val("jf-freq"); document.getElementById("jf-occ").value = Math.max(1, Math.round((FREQ_PER_YEAR[f] || 1) * (+d.m) / 12)); paintRecPreview(); };
function paintRecPreview() {
  const box = document.getElementById("jf-rec-preview");
  if (!box || !JF) return;
  const f = val("jf-freq");
  if (!f || f === "Pontual") { box.innerHTML = ""; return; }
  const n = Math.max(1, Math.round(n0(val("jf-occ")))), first = JF.parts[0].start;
  const list = [...Array(Math.min(n, 8))].map((_, i) => shiftByFreq(first, f, i)), last = shiftByFreq(first, f, n - 1);
  box.innerHTML = `<p><b>${n} ${n === 1 ? "ocorrência" : "ocorrências"}</b>, de ${fmtDate(first)} a ${fmtDate(last)}, sempre às ${fmtTime(first)}.</p><div class="rec-dates">${list.map(d => `<span class="${d.getDay() === 0 || d.getDay() === 6 ? "wknd" : ""}">${WEEKDAYS[d.getDay()]} ${fmtDate(d)}</span>`).join("")}${n > 8 ? "<span>…</span>" : ""}</div><p class="muted small">Datas calculadas a partir da primeira. Os fins de semana aparecem assinalados; cada ocorrência pode ser reagendada depois.</p>`;
}

ACT["jf-save"] = () => saveJobForm();
async function saveJobForm() {
  const F = JF;
  if (!F) return;
  const S = data.settings;
  const clientId = val("jf-client");
  if (!clientId || !client(clientId)) return toast("Selecione o cliente na pesquisa.");
  const services = getServices("jf");
  if (!services.length) return toast("Selecione pelo menos um tipo de serviço.");
  const est = parseNum(val("jf-est"));
  if (!(est > 0)) return toast("Indique o n.º de horas estimadas.");
  for (const [i, p] of F.parts.entries()) if (!p.start || !p.end || p.end <= p.start) return toast(`Verifique o início e o fim da parte ${i + 1}.`);
  const ptype = jfPtype(), rate = parseNum(val("jf-rate")), minC = parseNum(val("jf-min")), price = parseNum(val("jf-price"));
  if (ptype === "hourly" && !(rate >= 0)) return toast("Indique o preço/hora.");
  if (ptype === "fixed" && !(price >= 0)) return toast("Indique o valor fixo.");
  const minS = n0(S.minPrice);
  if (ptype === "hourly") {
    if (Math.abs(rate - n0(S.hourlyRate)) > 0.004 && !(await confirmDialog(`O preço/hora deste trabalho (${money(rate)}) é diferente do definido (${money(S.hourlyRate)}). Confirmar a alteração?`))) return;
    if (n0(minC) < minS - 0.004 && !(await confirmDialog(`O valor mínimo deste trabalho (${money(minC)}) é inferior ao preço mínimo definido (${money(minS)}). Confirmar?`))) return;
  } else if (price < minS - 0.004 && !(await confirmDialog(`O valor fixo (${money(price)}) é inferior ao preço mínimo definido (${money(minS)}). Confirmar?`))) return;
  const partsISO = F.parts.map(p => ({ start: p.start.toISOString(), end: p.end.toISOString() }));
  if (outsideWorkHours(partsISO) && !(await confirmDialog(`O agendamento fica fora do horário de funcionamento (${S.workStart}–${S.workEnd}). Gravar mesmo assim?`, { ok: "Gravar fora do horário" }))) return;
  const tot = sum(F.parts, p => hoursBetween(p.start, p.end));
  if (Math.abs(tot - est) > 0.01 && !(await confirmDialog(`Nº de horas agendadas não corresponde às estimadas.\nAgendadas: ${fmtH(tot)} · Estimadas: ${fmtH(est)}`, { ok: "Gravar assim" }))) return;
  if (JF !== F) return;
  const base = {
    clientId, serviceTypes: services, description: val("jf-desc").trim(), notes: val("jf-notes").trim(), estimatedHours: est, priceType: ptype,
    hourlyRate: Number.isFinite(rate) ? rate : n0(S.hourlyRate), minCharge: ptype === "hourly" ? n0(minC) : 0, price: ptype === "fixed" ? price : 0
  };
  if (F.jobId) {
    const ok = commit(() => {
      const j = job(F.jobId), old = j.parts;
      Object.assign(j, base);
      j.parts = partsISO.map((p, i) => ({ ...p, plannedStart: old[i]?.plannedStart || null, plannedEnd: old[i]?.plannedEnd || null, state: old[i]?.state || "Agendado" }));
      j.updatedAt = new Date().toISOString();
      updateStatus(j);
    });
    if (!ok) return;
    closeModal();
    ui.route = "calendar"; ui.calDate = new Date(F.parts[0].start);
    refreshUI(); toast("Trabalho atualizado.");
    return;
  }
  const freq = val("jf-freq") || "Pontual", occ = freq === "Pontual" ? 1 : Math.max(1, Math.round(n0(val("jf-occ"))));
  const q = F.quoteId ? quote(F.quoteId) : null, matCharge = !!$("#jf-mat")?.checked, matAll = !!$("#jf-mat-all")?.checked;
  if (occ > 60 && !(await confirmDialog(`Vão ser criados ${occ} trabalhos. Continuar?`))) return;
  const created = [];
  const ok = commit(() => {
    const seriesId = freq !== "Pontual" ? uid("ser") : null;
    for (let i = 0; i < occ; i++) {
      const parts = partsISO.map(p => { const s = shiftByFreq(p.start, freq, i), dur = toDate(p.end) - toDate(p.start); return { start: s.toISOString(), end: new Date(s.getTime() + dur).toISOString(), plannedStart: null, plannedEnd: null, state: "Agendado" }; });
      const j = { id: uid("j"), number: nextNumber(data.jobs, "#"), ...base, parts, status: "Agendado", recurrence: seriesId ? { frequency: freq, seriesId, index: i, anchor: partsISO } : null, quoteId: q?.id || null, createdAt: new Date().toISOString(), completedAt: null, cancelledAt: null, reschedules: [] };
      data.jobs.push(j); created.push(j);
      if (q && (i === 0 || matAll)) q.materials.forEach(m => data.costs.push({ id: uid("cst"), date: new Date().toISOString(), category: "Materiais", description: m.description || "Material", amount: n0(m.cost), margin: n0(m.margin), chargeable: matCharge, jobId: j.id, clientId, fromQuote: true }));
    }
    if (q) { q.status = "Convertido"; q.convertedAt = new Date().toISOString(); q.jobIds = created.map(j => j.id); }
  });
  if (!ok) return;
  closeAllModals();
  ui.route = "calendar"; ui.calDate = toDate(created[0].parts[0].start);
  render();
  toast(occ > 1 ? `${occ} trabalhos agendados (${created[0].number} a ${created[created.length - 1].number}).` : `Trabalho ${created[0].number} agendado.`);
}

/* ================= Detalhe do trabalho ================= */
ACT["open-job"] = d => openJobDetail(d.id);
ACT["job-new"] = d => openJobForm({ clientId: d.client || "" });
ACT["job-edit"] = d => openJobForm({ jobId: d.id });
function openJobDetail(id) {
  if (!job(id)) return;
  const ex = layers.find(l => l.key === "job:" + id);
  if (ex) { paintLayer(ex); return; }
  openModal({
    key: "job:" + id, live: true, wide: true, exists: () => !!job(id),
    title: () => `Trabalho ${job(id)?.number || ""}`,
    body: () => jobDetailBody(id),
    footer: () => `${btn(ico("edit") + "Editar", "job-edit", `data-id="${id}"`)}${btn(ico("doc") + "Nota de serviços", "doc-job", `data-id="${id}"`, "primary")}`,
    onMount: () => loadPhotoGrid("job:" + id, "jd-photos")
  });
}
function jobDetailBody(id) {
  const j = job(id);
  if (!j) return empty("Este trabalho já não existe.");
  const S = data.settings, c = client(j.clientId) || {};
  const wh = workedHours(id), ch = jobCharge(j), pd = paidFor(id), due = jobOutstanding(j), ic = internalCostTotal(id), er = effectiveRate(j);
  const s = activeSession(), ses = jobSessions(id), costs = jobCosts(id), pays = data.payments.filter(p => p.jobId === id).sort((a, b) => toDate(a.date) - toDate(b.date));
  const q = j.quoteId && quote(j.quoteId);
  const addr = [c.address, c.postal, c.local].filter(Boolean).join(", ");
  const parts = j.parts.map((p, i) => {
    const running = s && s.jobId === id && s.partIndex === i, ph = sum(ses.filter(x => x.partIndex === i), x => sessionHours(x));
    return `<div class="part-row ${STATUS_CLS[p.state]}"><div class="pr-main"><div class="pr-title"><b>${j.parts.length > 1 ? `Parte ${i + 1}` : "Agendamento"}</b>${pill(p.state)}</div><div>${fmtDayShort(p.start)}, ${fmtTime(p.start)}–${fmtTime(p.end)} <span class="muted">(${fmtH(partHours(p))})</span></div>${p.plannedStart && p.plannedStart !== p.start ? `<div class="muted small">Inicialmente agendado para ${fmtDT(p.plannedStart)}</div>` : ""}${running ? `<div class="live">A decorrer desde ${fmtTime(s.start)}: <b data-live-since="${esc(s.start)}">${fmtH(sessionHours(s))}</b></div>` : ph ? `<div class="muted small">Horas registadas: ${fmtH(ph)}</div>` : ""}</div><div class="actions">${partButtons(j, p, i)}</div></div>`;
  }).join("");
  return `
  <div class="jd-head">${pill(j.status)}<div><div class="jd-svc">${esc(serviceNames(j).join(", ") || "—")}</div>${j.description ? `<div class="muted">${esc(j.description)}</div>` : ""}${j.recurrence ? `<div class="muted small">Periódico (${esc(j.recurrence.frequency.toLowerCase())}) · ocorrência ${j.recurrence.index + 1} de ${seriesJobs(j).length}</div>` : ""}${q ? `<div class="muted small">Criado a partir do orçamento ${esc(q.number)}</div>` : ""}</div></div>
  <section class="jd-client"><div><b>${esc(c.name || "Cliente removido")}</b> <span class="muted">${esc(c.number || "")}</span>${addr ? `<div class="muted small">${esc(addr)}</div>` : ""}${c.phone ? `<div class="muted small">${esc(c.phone)}</div>` : ""}</div><div class="icon-row">${c.phone ? `<a class="icon-btn" href="tel:${esc(c.phone.replace(/\s/g, ""))}" aria-label="Telefonar">${ico("phone")}</a>` : ""}${c.email ? `<a class="icon-btn" href="mailto:${esc(c.email)}" aria-label="Enviar email">${ico("mail")}</a>` : ""}${addr ? `<a class="icon-btn" href="${esc(mapsLink(c))}" target="_blank" rel="noopener" aria-label="Abrir mapa">${ico("map")}</a>` : ""}${c.id ? btn("Ficha do cliente", "client-open", `data-id="${c.id}"`, "ghost small") : ""}</div></section>
  <section class="tiles">
    <div class="tile"><span>Estimado</span><b>${fmtH(j.estimatedHours)}</b></div>
    <div class="tile"><span>Agendado</span><b>${fmtH(scheduledHours(j))}</b></div>
    <div class="tile"><span>Realizado</span><b>${fmtH(wh)}</b></div>
    <div class="tile"><span>${j.priceType === "fixed" ? "Preço fixo" : "Preço/hora acordado"}</span><b>${j.priceType === "fixed" ? money(j.price) : money(j.hourlyRate) + "/h"}</b>${j.priceType === "hourly" && n0(j.minCharge) ? `<small>mínimo ${money(j.minCharge)}</small>` : ""}</div>
    <div class="tile strong"><span>Valor a cobrar</span><b>${money(ch)}</b><small>${j.priceType === "hourly" ? (wh > 0 ? `${fmtH(wh)} × ${money(j.hourlyRate)}` : "estimado") : "valor acordado"}${chargeableTotal(id) ? ` + materiais ${money(chargeableTotal(id))}` : ""}</small></div>
    <div class="tile"><span>Pago</span><b>${money(pd)}</b></div>
    <div class="tile ${due > 0.005 ? "bad" : ""}"><span>Em falta</span><b>${money(due)}</b>${!isWorked(j) && due > 0 ? "<small>trabalho ainda não iniciado</small>" : ""}</div>
    <div class="tile"><span>Custos (reais)</span><b>${money(ic)}</b></div>
    <div class="tile"><span>Resultado</span><b class="${ch - ic >= 0 ? "pos" : "neg"}">${money(ch - ic)}</b></div>
  </section>
  ${j.priceType === "fixed" && er != null ? `<div class="rate-check ${er < n0(S.hourlyRate) ? "below" : "ok"}">Valor por hora real: <b>${money(er)}/h</b> · o seu preço/hora é ${money(S.hourlyRate)}${er < n0(S.hourlyRate) ? ". O valor acordado está abaixo do seu preço/hora." : "."}</div>` : ""}
  <section class="jd-sec"><div class="section-head"><h3>${j.parts.length > 1 ? "Partes" : "Execução"}</h3>${j.status !== "Cancelado" ? btn(ico("plus") + "Parte", "part-add", `data-id="${id}"`, "ghost small") : ""}</div><div class="stack">${parts}</div></section>
  <section class="jd-sec"><div class="section-head"><h3>Horas registadas</h3>${btn(ico("plus") + "Registar horas", "session-new", `data-id="${id}"`, "ghost small")}</div>${ses.length ? `<ul class="rows">${ses.map(x => `<li><div><b>${fmtDayShort(x.start)}</b> ${fmtTime(x.start)}–${x.end ? fmtTime(x.end) : "a decorrer"}${j.parts.length > 1 ? ` <span class="muted">· parte ${x.partIndex + 1}</span>` : ""}</div><span class="r-val">${fmtH(sessionHours(x))}</span>${iconBtn("edit", "session-edit", `data-id="${x.id}"`, "Editar horas")}${iconBtn("trash", "session-del", `data-id="${x.id}"`, "Eliminar registo", "danger")}</li>`).join("")}</ul>` : `<p class="muted small">Ainda sem horas registadas. Use Iniciar/Pausar ou registe manualmente.</p>`}</section>
  <section class="jd-sec"><div class="section-head"><h3>Custos e materiais</h3>${btn(ico("plus") + "Custo", "cost-new", `data-job="${id}"`, "ghost small")}</div>${costs.length ? `<ul class="rows">${costs.map(x => `<li><div><b>${esc(x.description || x.category)}</b> <span class="muted small">${esc(x.category)} · ${fmtDate(x.date)}</span><div class="muted small">${x.chargeable ? `Custo ${money(x.amount)} · ao cliente ${money(costClientValue(x))} (+${fmtNum(x.margin, 1).replace(",0", "")}%)` : `Custo interno, não imputado ao cliente`}</div></div><span class="r-val">${money(x.amount)}</span>${iconBtn("edit", "cost-edit", `data-id="${x.id}"`, "Editar custo")}${iconBtn("trash", "cost-del", `data-id="${x.id}"`, "Eliminar custo", "danger")}</li>`).join("")}</ul>` : `<p class="muted small">Sem custos associados.</p>`}</section>
  <section class="jd-sec"><div class="section-head"><h3>Pagamentos</h3>${j.status !== "Cancelado" ? btn(ico("plus") + "Pagamento", "pay-new", `data-job="${id}"`, "ghost small") : ""}</div>${pays.length ? `<ul class="rows">${pays.map(x => `<li><div><b>${fmtDate(x.date)}</b> <span class="muted">${esc(x.method)}</span>${x.notes ? `<div class="muted small">${esc(x.notes)}</div>` : ""}</div><span class="r-val">${money(x.amount)}</span>${iconBtn("edit", "pay-edit", `data-id="${x.id}"`, "Editar pagamento")}${iconBtn("trash", "pay-del", `data-id="${x.id}"`, "Eliminar pagamento", "danger")}</li>`).join("")}</ul>` : `<p class="muted small">Sem pagamentos registados.</p>`}</section>
  <section class="jd-sec"><div class="section-head"><h3>Fotografias</h3>${btn(ico("camera") + "Adicionar", "photo-add", `data-owner="job:${id}"`, "ghost small")}</div><div class="photo-grid" id="jd-photos"><p class="muted small">A carregar…</p></div></section>
  ${j.reschedules.length ? `<section class="jd-sec"><h3>Reagendamentos</h3><ul class="hist">${j.reschedules.map(r => `<li><b>${fmtDate(r.date)}</b> · ${r.part ? `parte ${esc(r.part)}` : ""} ${r.from?.start ? `${fmtDT(r.from.start)} → ` : ""}${r.to?.start ? fmtDT(r.to.start) : ""}<div class="muted small">${esc(r.reason || "")}${r.description ? ` — ${esc(r.description)}` : ""}</div></li>`).join("")}</ul></section>` : ""}
  <section class="jd-end">${j.status === "Cancelado" ? btn("Reativar trabalho", "job-reactivate", `data-id="${id}"`) : btn("Cancelar trabalho", "job-cancel", `data-id="${id}"`, "danger-ghost")}${j.recurrence ? btn("Renovar série", "series-renew", `data-id="${id}"`) : ""}${btn(ico("trash") + "Eliminar", "job-delete", `data-id="${id}"`, "danger-ghost")}</section>`;
}

/* ================= Picagem de ponto ================= */
ACT["part-start"] = d => startPart(d.id, +d.i);
ACT["part-pause"] = d => pausePart(d.id, +d.i);
ACT["part-done"] = d => completePart(d.id, +d.i);
ACT["part-reopen"] = d => reopenPart(d.id, +d.i);
ACT["part-resched"] = d => openReschedule(d.id, +d.i);
ACT["part-add"] = d => openAddPart(d.id);

async function startPart(jobId, i) {
  const j = job(jobId), p = j?.parts[i];
  if (!p) return;
  let act = activeSession();
  if (act && act.jobId === jobId && act.partIndex === i) return;
  if (act) {
    const aj = job(act.jobId);
    if (!(await confirmDialog(`Está a decorrer ${aj ? aj.number + " " + clientName(aj.clientId) : "outro trabalho"}${aj && aj.parts.length > 1 ? ` (parte ${act.partIndex + 1})` : ""}. Só pode estar um trabalho ativo de cada vez.\nPausar esse trabalho e iniciar este?`, { ok: "Pausar e iniciar" }))) return;
  }
  const now = new Date(), sched = toDate(p.start), prior = data.sessions.some(s => s.jobId === jobId && s.partIndex === i);
  let startAt = now;
  if (!prior && Math.abs(now - sched) > 15 * 60000) {
    const c = await choiceDialog(`Hora agendada: ${fmtDT(sched)}.\nQuando começou?`, [{ v: "now", label: `Agora (${fmtTime(now)})`, cls: "primary" }, { v: "other", label: "Indicar a hora real de início" }], "Iniciar trabalho");
    if (!c) return;
    if (c === "other") {
      const d = await pickDateDialog("Hora real de início", sched < now ? sched : now, "datetime", "Pode indicar uma hora no passado, para que as contas reflitam o que aconteceu.");
      if (!d) return;
      if (d > new Date()) { toast("A hora de início não pode ser no futuro."); return; }
      startAt = d;
    }
  }
  act = activeSession();
  const ok = commit(() => {
    if (act) {
      const endAt = startAt > toDate(act.start) ? startAt : new Date();
      act.end = endAt.toISOString(); act.active = false;
      const aj = job(act.jobId);
      if (aj) { if (aj.parts[act.partIndex]?.state === "Em curso") aj.parts[act.partIndex].state = "Em pausa"; updateStatus(aj); }
    }
    if (!prior) {
      const dur = toDate(p.end) - toDate(p.start);
      p.plannedStart = p.plannedStart || p.start; p.plannedEnd = p.plannedEnd || p.end;
      p.start = startAt.toISOString(); p.end = new Date(startAt.getTime() + dur).toISOString();
    }
    data.sessions.push({ id: uid("s"), jobId, partIndex: i, start: startAt.toISOString(), end: null, active: true });
    p.state = "Em curso";
    updateStatus(j);
  });
  if (ok) { refreshUI(); toast(`${j.number}${j.parts.length > 1 ? ` · parte ${i + 1}` : ""} iniciado às ${fmtTime(startAt)}.`); }
}
function pausePart(jobId, i) {
  const s = activeSession(), j = job(jobId);
  if (!j) return;
  const ok = commit(() => {
    if (s && s.jobId === jobId && s.partIndex === i) { s.end = new Date().toISOString(); s.active = false; }
    if (j.parts[i].state === "Em curso") j.parts[i].state = "Em pausa";
    updateStatus(j);
  });
  if (ok) { refreshUI(); toast("Pausado. Horas registadas."); }
}
async function completePart(jobId, i) {
  const j = job(jobId), p = j?.parts[i];
  if (!p) return;
  const s = activeSession(), running = s && s.jobId === jobId && s.partIndex === i;
  const has = data.sessions.some(x => x.jobId === jobId && x.partIndex === i);
  let addSched = false;
  if (!running && !has) {
    const c = await choiceDialog(`${j.parts.length > 1 ? `A parte ${i + 1}` : "Este trabalho"} não tem horas registadas. Como quer concluir?`, [{ v: "sched", label: `Registar o horário agendado (${fmtTime(p.start)}–${fmtTime(p.end)}, ${fmtH(partHours(p))})`, cls: "primary" }, { v: "none", label: "Concluir sem registar horas" }], "Concluir");
    if (!c) return;
    addSched = c === "sched";
  }
  const ok = commit(() => {
    if (running) { s.end = new Date().toISOString(); s.active = false; }
    if (addSched) data.sessions.push({ id: uid("s"), jobId, partIndex: i, start: p.start, end: p.end, active: false });
    p.state = "Concluído";
    updateStatus(j);
  });
  if (ok) { refreshUI(); toast(j.status === "Concluído" ? `Trabalho ${j.number} concluído. A nota de serviços está disponível no detalhe.` : `Parte ${i + 1} concluída.`); }
}
function reopenPart(jobId, i) {
  const j = job(jobId);
  const ok = commit(() => { j.parts[i].state = data.sessions.some(x => x.jobId === jobId && x.partIndex === i) ? "Em pausa" : "Agendado"; updateStatus(j); });
  if (ok) { refreshUI(); toast("Parte reaberta."); }
}

/* ---- Registo manual / correção de horas ---- */
ACT["session-new"] = d => openSessionForm({ jobId: d.id });
ACT["session-edit"] = d => openSessionForm({ sessionId: d.id });
function openSessionForm({ jobId, sessionId }) {
  const s = sessionId ? data.sessions.find(x => x.id === sessionId) : null;
  const j = job(s ? s.jobId : jobId);
  if (!j) return;
  const pi = s ? s.partIndex : (nextPart(j)?.idx ?? 0), p = j.parts[pi] || j.parts[0];
  openModal({
    title: s ? "Corrigir horas" : "Registar horas", small: true,
    body: `<div class="form-grid">${j.parts.length > 1 ? fSelect("Parte", "sf-part", j.parts.map((x, i) => ({ v: i, l: `Parte ${i + 1} · ${fmtDate(x.start)}` })), pi, { cls: "full" }) : ""}${fDate("Entrada", "sf-start", s ? s.start : p.start)}${fDate("Saída", "sf-end", s ? (s.end || roundUpMinutes(new Date(), 5)) : p.end)}${s?.active ? `<p class="info full">Esta sessão está a decorrer. Ao gravar, fica terminada na hora de saída indicada e a parte passa a "Em pausa".</p>` : ""}</div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="sf-save" data-id="${j.id}" data-s="${s?.id || ""}">Gravar horas</button>`
  });
}
ACT["sf-save"] = async d => {
  const j = job(d.id);
  if (!j) return;
  const st = readDate("sf-start"), en = readDate("sf-end"), pi = j.parts.length > 1 ? +val("sf-part") : 0;
  if (!st || !en || en <= st) return toast("A saída tem de ser depois da entrada.");
  if (en > new Date(Date.now() + 5 * 60000) && !(await confirmDialog("A hora de saída está no futuro. Gravar mesmo assim?"))) return;
  if (data.sessions.some(x => x.id !== d.s && toDate(x.start) < en && (x.end ? toDate(x.end) : new Date()) > st) && !(await confirmDialog("Este período sobrepõe-se a outro registo de horas. Gravar mesmo assim?"))) return;
  if (hoursBetween(st, en) > 14 && !(await confirmDialog(`Registo de ${fmtH(hoursBetween(st, en))} seguidas. Está correto?`))) return;
  const ok = commit(() => {
    let s = d.s ? data.sessions.find(x => x.id === d.s) : null;
    if (!s) { s = { id: uid("s"), jobId: j.id }; data.sessions.push(s); }
    const oldPart = s.partIndex, wasActive = !!s.active;
    Object.assign(s, { partIndex: pi, start: st.toISOString(), end: en.toISOString(), active: false });
    if (wasActive && j.parts[oldPart]?.state === "Em curso") j.parts[oldPart].state = "Em pausa";
    if (j.parts[pi].state === "Agendado") j.parts[pi].state = "Em pausa";
    updateStatus(j);
  });
  if (ok) { closeModal(); refreshUI(); toast("Horas gravadas."); }
};
ACT["session-del"] = async d => {
  const s = data.sessions.find(x => x.id === d.id);
  if (!s || !(await confirmDialog("Eliminar este registo de horas?", { ok: "Eliminar", danger: true }))) return;
  const ok = commit(() => {
    data.sessions = data.sessions.filter(x => x.id !== d.id);
    const j = job(s.jobId);
    if (j) {
      const p = j.parts[s.partIndex];
      if (p && (p.state === "Em curso" || p.state === "Em pausa")) p.state = data.sessions.some(x => x.jobId === j.id && x.partIndex === s.partIndex) ? "Em pausa" : "Agendado";
      updateStatus(j);
    }
  });
  if (ok) { refreshUI(); toast("Registo eliminado."); }
};

/* ---- Reagendar ---- */
function openReschedule(jobId, i) {
  const j = job(jobId), p = j?.parts[i];
  if (!p) return;
  const later = j.parts.map((x, k) => k).filter(k => k > i && (j.parts[k].state === "Agendado" || j.parts[k].state === "Em pausa"));
  openModal({
    title: `Reagendar ${j.number}${j.parts.length > 1 ? ` · parte ${i + 1}` : ""}`,
    body: `<div class="form-grid"><p class="info full">Agendamento atual: ${fmtDayShort(p.start)}, ${fmtTime(p.start)}–${fmtTime(p.end)}</p>${fDate("Nova data e hora", "rs-start", p.start)}${fNum("Duração (horas)", "rs-dur", round2(partHours(p)))}${fSelect("Motivo *", "rs-reason", RESCHED_REASONS, "", { empty: "Selecionar motivo", change: "rs-reason", cls: "full" })}<div class="full" id="rs-other-wrap" hidden>${fText("Descrição do motivo (opcional)", "rs-other", "", { cls: "full" })}</div>${later.length ? `<div class="full">${fToggle(`Mover também ${later.length === 1 ? "a parte seguinte" : `as ${later.length} partes seguintes`} pelo mesmo intervalo`, "rs-shift", false)}</div>` : ""}</div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="rs-save" data-id="${jobId}" data-i="${i}">Reagendar</button>`
  });
}
CHANGE["rs-reason"] = el => { document.getElementById("rs-other-wrap").hidden = el.value !== "Outro"; };
ACT["rs-save"] = async d => {
  const j = job(d.id), i = +d.i, p = j?.parts[i];
  if (!p) return;
  const reason = val("rs-reason");
  if (!reason) return toast("Indique o motivo do reagendamento.");
  const ns = readDate("rs-start"), dur = parseNum(val("rs-dur"));
  if (!ns || !(dur > 0)) return toast("Verifique a nova data e a duração.");
  const ne = new Date(ns.getTime() + dur * 36e5), shift = !!$("#rs-shift")?.checked, delta = ns - toDate(p.start);
  if (outsideWorkHours([{ start: ns, end: ne }]) && !(await confirmDialog(`O novo horário fica fora do horário de funcionamento (${data.settings.workStart}–${data.settings.workEnd}). Gravar mesmo assim?`))) return;
  const ok = commit(() => {
    const from = { start: p.start, end: p.end };
    p.plannedStart = p.plannedStart || p.start; p.plannedEnd = p.plannedEnd || p.end;
    p.start = ns.toISOString(); p.end = ne.toISOString();
    if (shift) j.parts.forEach((x, k) => { if (k > i && (x.state === "Agendado" || x.state === "Em pausa")) { x.start = new Date(toDate(x.start).getTime() + delta).toISOString(); x.end = new Date(toDate(x.end).getTime() + delta).toISOString(); } });
    j.reschedules.push({ date: new Date().toISOString(), part: i + 1, from, to: { start: p.start, end: p.end }, shifted: shift, reason, description: reason === "Outro" ? val("rs-other").trim() : "" });
  });
  if (ok) { closeModal(); ui.calDate = ns; refreshUI(); toast("Trabalho reagendado."); }
};

/* ---- Acrescentar parte (continuação noutro dia) ---- */
function openAddPart(jobId) {
  const j = job(jobId);
  const last = j.parts.reduce((m, p) => toDate(p.start) > toDate(m.start) ? p : m, j.parts[0]);
  const s = addDays(toDate(last.start), 1), rest = Math.max(0.5, n0(j.estimatedHours) - workedHours(jobId) - sum(j.parts.filter(p => p.state === "Agendado"), partHours));
  openModal({
    title: `Nova parte · ${j.number}`, small: true,
    body: `<div class="form-grid"><p class="info full">Use para continuar o trabalho noutro dia.</p>${fDate("Início", "ap-start", s)}${fNum("Duração (horas)", "ap-dur", round2(rest))}</div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="ap-save" data-id="${jobId}">Acrescentar parte</button>`
  });
}
ACT["ap-save"] = async d => {
  const j = job(d.id), st = readDate("ap-start"), dur = parseNum(val("ap-dur"));
  if (!st || !(dur > 0)) return toast("Verifique a data e a duração.");
  const en = new Date(st.getTime() + dur * 36e5);
  if (outsideWorkHours([{ start: st, end: en }]) && !(await confirmDialog("A nova parte fica fora do horário de funcionamento. Gravar mesmo assim?"))) return;
  const ok = commit(() => { j.parts.push({ start: st.toISOString(), end: en.toISOString(), plannedStart: null, plannedEnd: null, state: "Agendado" }); updateStatus(j); });
  if (ok) { closeModal(); refreshUI(); toast(`Parte ${j.parts.length} acrescentada.`); }
};

/* ---- Cancelar, reativar, eliminar, renovar série ---- */
ACT["job-cancel"] = async d => {
  const j = job(d.id);
  if (!j) return;
  const future = j.recurrence ? seriesJobs(j).filter(x => x.recurrence.index > j.recurrence.index && x.status === "Agendado") : [];
  let targets = [j];
  if (future.length) {
    const c = await choiceDialog(`${j.number} faz parte de uma série periódica.`, [{ v: "one", label: "Cancelar só esta ocorrência" }, { v: "all", label: `Cancelar esta e as ${future.length} seguintes`, cls: "danger" }], "Cancelar trabalho");
    if (!c) return;
    if (c === "all") targets = [j, ...future];
  } else if (!(await confirmDialog(`Cancelar o trabalho ${j.number}? O registo fica no histórico.${j.parts.some(p => p.state === "Concluído") ? "\nAs partes já concluídas mantêm-se." : ""}`, { ok: "Cancelar trabalho", cancel: "Voltar", danger: true }))) return;
  const ok = commit(() => targets.forEach(x => {
    const s = activeSession();
    if (s && s.jobId === x.id) { s.end = new Date().toISOString(); s.active = false; }
    x.parts.forEach(p => { if (p.state !== "Concluído") p.state = "Cancelado"; });
    x.cancelledAt = new Date().toISOString();
    updateStatus(x);
  }));
  if (ok) { refreshUI(); toast(targets.length > 1 ? `${targets.length} trabalhos cancelados.` : "Trabalho cancelado."); }
};
ACT["job-reactivate"] = d => {
  const j = job(d.id);
  const ok = commit(() => { j.parts.forEach(p => { if (p.state === "Cancelado") p.state = "Agendado"; }); j.cancelledAt = null; updateStatus(j); });
  if (ok) { refreshUI(); toast("Trabalho reativado."); }
};
ACT["job-delete"] = async d => {
  const j = job(d.id);
  if (!j) return;
  if (data.payments.some(p => p.jobId === j.id)) return toast("Não é possível eliminar: existem pagamentos registados neste trabalho. Pode cancelá-lo.");
  const nc = jobCosts(j.id).length, ns = jobSessions(j.id).length;
  if (!(await confirmDialog(`Eliminar definitivamente o trabalho ${j.number}?${ns || nc ? `\nSão também eliminados ${ns} registo(s) de horas e ${nc} custo(s).` : ""}`, { ok: "Eliminar", danger: true }))) return;
  const ok = commit(() => {
    data.jobs = data.jobs.filter(x => x.id !== j.id);
    data.sessions = data.sessions.filter(x => x.jobId !== j.id);
    data.costs = data.costs.filter(x => x.jobId !== j.id);
    data.quotes.forEach(q => q.jobIds = (q.jobIds || []).filter(x => x !== j.id));
  });
  if (ok) { PhotoDB.delOwner("job:" + j.id).catch(() => { }); refreshUI(); toast("Trabalho eliminado."); }
};
ACT["series-renew"] = d => {
  const j = job(d.id), f = j.recurrence.frequency, list = seriesJobs(j), last = list[list.length - 1];
  openModal({
    title: "Renovar série periódica", small: true,
    body: `<p class="muted">Série ${esc(f.toLowerCase())} de ${esc(clientName(j.clientId))}. Última ocorrência: ${fmtDate(last.parts[0].start)}. As novas ocorrências mantêm o horário, a duração e o preço da última.</p>${fStepper("Ocorrências a acrescentar", "sr-n", FREQ_PER_YEAR[f] || 1, { min: 1, max: 520 })}`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="sr-save" data-id="${j.id}">Renovar</button>`
  });
};
ACT["sr-save"] = d => {
  const j = job(d.id), list = seriesJobs(j), last = list[list.length - 1], f = last.recurrence.frequency, n = Math.max(1, Math.round(n0(val("sr-n"))));
  const anchor = last.recurrence.anchor, base = anchor ? 0 : last.recurrence.index, ap = anchor || last.parts.map(p => ({ start: p.start, end: p.end }));
  const created = [];
  const ok = commit(() => {
    for (let k = last.recurrence.index + 1; k <= last.recurrence.index + n; k++) {
      const parts = ap.map(p => { const s = shiftByFreq(p.start, f, k - base), dur = toDate(p.end) - toDate(p.start); return { start: s.toISOString(), end: new Date(s.getTime() + dur).toISOString(), plannedStart: null, plannedEnd: null, state: "Agendado" }; });
      const nj = { id: uid("j"), number: nextNumber(data.jobs, "#"), clientId: last.clientId, serviceTypes: [...last.serviceTypes], description: last.description, notes: last.notes, estimatedHours: last.estimatedHours, priceType: last.priceType, hourlyRate: last.hourlyRate, minCharge: last.minCharge, price: last.price, parts, status: "Agendado", recurrence: { ...last.recurrence, index: k }, quoteId: null, createdAt: new Date().toISOString(), completedAt: null, cancelledAt: null, reschedules: [] };
      data.jobs.push(nj); created.push(nj);
    }
  });
  if (ok) { closeModal(); refreshUI(); toast(`${created.length} ocorrências acrescentadas, até ${fmtDate(created[created.length - 1].parts[0].start)}.`); }
};

/* ================= Fotografias ================= */
function pickImages(multiple = true) {
  return new Promise(res => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.multiple = multiple; inp.hidden = true;
    document.body.append(inp);
    inp.addEventListener("change", async () => {
      const files = [...inp.files], out = [];
      if (files.length) toast("A preparar fotografias…", 1500);
      for (const f of files) { try { out.push(await compressImage(f)); } catch (e) { console.warn(e); } }
      inp.remove(); res(out);
    }, { once: true });
    inp.click();
  });
}
ACT["photo-add"] = async d => {
  const imgs = await pickImages();
  if (!imgs.length) return;
  try {
    await PhotoDB.put(imgs.map((x, k) => ({ id: uid("ph"), owner: d.owner, data: x, date: new Date(Date.now() + k).toISOString() })));
    refreshUI(); toast(`${imgs.length} fotografia(s) adicionada(s).`);
  } catch (e) { toast("Não foi possível guardar as fotografias: " + e.message); }
};
ACT["photo-del"] = async d => {
  if (!(await confirmDialog("Eliminar esta fotografia?", { ok: "Eliminar", danger: true }))) return;
  try { await PhotoDB.del(d.id); refreshUI(); toast("Fotografia eliminada."); } catch (e) { toast("Erro ao eliminar: " + e.message); }
};
ACT["photo-view"] = (d, t) => {
  const src = t.querySelector("img")?.src;
  if (!src) return;
  const el = document.createElement("div");
  el.className = "viewer"; el.innerHTML = `<img src="${src}" alt=""><button type="button" class="close" aria-label="Fechar">✕</button>`;
  el.addEventListener("click", () => el.remove());
  document.getElementById("picker-root").append(el);
};
async function loadPhotoGrid(owner, elId, deletable = true) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const recs = await PhotoDB.list(owner);
    const box = document.getElementById(elId);
    if (!box) return;
    box.innerHTML = recs.length ? recs.map(r => `<div class="ph"><button type="button" class="ph-img" data-act="photo-view"><img src="${r.data}" alt="Fotografia de ${fmtDate(r.date)}" loading="lazy"></button>${deletable ? `<button type="button" class="ph-del" data-act="photo-del" data-id="${esc(r.id)}" aria-label="Eliminar fotografia">✕</button>` : ""}</div>`).join("") : `<p class="muted small">Sem fotografias.</p>`;
  } catch (e) { el.innerHTML = `<p class="muted small">Não foi possível ler as fotografias (${esc(e.message)}).</p>`; }
}
/* ================= Orçamentos ================= */
const QPILL = { Rascunho: "q-draft", Enviado: "q-sent", Aceite: "q-ok", Recusado: "q-no", Convertido: "q-conv", Expirado: "q-exp" };
function quotesHTML() {
  const list = [...data.quotes].sort((a, b) => toDate(b.date) - toDate(a.date));
  return `<div class="actions"><button type="button" class="btn primary" data-act="quote-new">${ico("plus")}Novo orçamento</button></div><div class="stack">${list.length ? list.map(quoteCard).join("") : empty("Ainda não existem orçamentos.")}</div>`;
}
function quoteCard(q) {
  const st = quoteDisplayState(q), open = q.status !== "Convertido";
  return `<article class="card quote-card">
    <div class="qc-top"><div><b>${esc(q.number)}</b> <span class="muted small">versão ${q.version}</span><div>${esc(clientName(q.clientId))}</div><div class="muted small">${esc(q.services.join(", "))}</div></div><div class="qc-state"><span class="pill ${QPILL[st]}">${st}</span>${open ? iconBtn("edit", "quote-edit", `data-id="${q.id}"`, "Editar orçamento") : ""}</div></div>
    <div class="qc-meta"><span>Emitido a ${fmtDate(q.date)}</span><span>Válido até ${fmtDate(quoteExpiry(q))}</span>${q.frequency !== "Pontual" ? `<span>${esc(q.frequency)}</span>` : ""}<b>${money(quoteTotal(q))}</b></div>
    <div class="actions">${btn(ico("doc") + "PDF", "quote-pdf", `data-id="${q.id}"`)}${open && q.status !== "Recusado" ? btn("Converter em trabalho", "quote-convert", `data-id="${q.id}"`, "primary") : ""}${open ? `<label class="mini-select"><span class="sr">Estado</span><select data-change="quote-status" data-id="${q.id}">${["Rascunho", "Enviado", "Aceite", "Recusado"].map(s => `<option${s === q.status ? " selected" : ""}>${s}</option>`).join("")}</select></label>${iconBtn("trash", "quote-del", `data-id="${q.id}"`, "Eliminar orçamento", "danger")}` : `<span class="muted small">Convertido a ${fmtDate(q.convertedAt)}${q.jobIds?.length ? ` · ${q.jobIds.map(id => job(id)?.number).filter(Boolean).slice(0, 4).join(", ")}${q.jobIds.length > 4 ? "…" : ""}` : ""}</span>`}</div>
  </article>`;
}
CHANGE["quote-status"] = el => { if (commit(() => { quote(el.dataset.id).status = el.value; })) { render(); toast(`Estado alterado para ${el.value}.`); } };
ACT["quote-new"] = d => openQuoteForm(null, d.client || "");
ACT["quote-edit"] = d => openQuoteForm(d.id);
ACT["quote-convert"] = d => openJobForm({ quoteId: d.id });
ACT["quote-del"] = async d => {
  const q = quote(d.id);
  if (!q || !(await confirmDialog(`Eliminar o orçamento ${q.number}? Esta ação não pode ser anulada.`, { ok: "Eliminar", danger: true }))) return;
  if (commit(() => { data.quotes = data.quotes.filter(x => x.id !== q.id); })) { PhotoDB.delOwner("quote:" + q.id).catch(() => { }); refreshUI(); toast("Orçamento eliminado."); }
};

let QF = null;
function openQuoteForm(id, clientId = "") {
  if (!data.clients.length) { openJobForm(); return; }
  const q = id ? quote(id) : null, S = data.settings;
  QF = { id: q?.id || null, photos: [], removed: [], loaded: !q };
  openModal({
    title: q ? `Editar orçamento ${q.number}` : "Novo orçamento", wide: true,
    body: `<div class="form-grid">
      <div class="full q-headinfo"><div><span>N.º</span><b>${q ? esc(q.number) : nextQuoteNumber()}</b></div><div><span>Versão</span><b>${q ? q.version + 1 : 1}</b></div><div><span>Data da proposta</span><b>${fmtDate(new Date())}</b></div></div>
      ${clientPicker("qf", q?.clientId || clientId)}
      ${serviceChecks("qf", q?.services || [])}
      ${fArea("Descrição dos trabalhos", "qf-desc", q?.description || "", { cls: "full" })}
      ${fNum("N.º de horas esperadas *", "qf-hours", q?.expectedHours ?? "", { input: "qf-calc", ph: "Ex.: 4" })}
      ${fNum("Preço/hora (€)", "qf-rate", q?.hourlyRate ?? S.hourlyRate, { input: "qf-calc" })}
      ${fSelect("Periodicidade", "qf-freq", FREQS, q?.frequency || "Pontual")}
      ${fStepper("Validade (dias)", "qf-valid", q?.valid || 30, { min: 1, max: 365 })}
      <div class="full sub-block"><div class="section-head"><h4>Materiais</h4>${btn(ico("plus") + "Material", "qf-mat-add", "", "ghost small")}</div><div id="qf-mats">${(q?.materials || []).map(matRow).join("")}</div><p class="muted small">Indique o custo de compra; o preço ao cliente inclui a margem definida (${fmtNum(S.materialMargin, 1).replace(",0", "")}%).</p></div>
      <div class="full calc-box" id="qf-totals"></div>
      <div class="full sub-block"><div class="section-head"><h4>Fotografias do local</h4>${btn(ico("camera") + "Adicionar", "qf-photo-add", "", "ghost small")}</div><div class="photo-grid" id="qf-photos"></div></div>
      ${fArea("Notas e condições", "qf-notes", q?.notes || "", { cls: "full" })}
    </div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="qf-save">${q ? "Gravar nova versão" : "Gravar orçamento"}</button>`,
    onMount: () => {
      qfCalc(); paintQFPhotos();
      if (q) PhotoDB.list("quote:" + q.id).then(r => { if (QF?.id !== q.id) return; QF.photos = r.map(x => ({ id: x.id, data: x.data })); QF.loaded = true; paintQFPhotos(); }).catch(() => { if (QF) { QF.loaded = true; paintQFPhotos(); } });
    },
    onClose: () => { QF = null; }
  });
}
function matRow(m = {}) {
  const margin = m.margin ?? data.settings.materialMargin;
  return `<div class="mat-row" data-margin="${n0(margin)}"><input class="m-desc" aria-label="Descrição do material" placeholder="Descrição do material" value="${esc(m.description || "")}"><input class="m-cost" aria-label="Custo (€)" inputmode="decimal" placeholder="Custo €" value="${inputNum(m.cost)}" data-input="qf-calc"><span class="m-client" title="Preço ao cliente">${money(matClient({ cost: m.cost, margin }))}</span><button type="button" class="icon-btn danger" data-act="qf-mat-del" aria-label="Remover material">${ico("trash")}</button></div>`;
}
function readMats() { return $$("#qf-mats .mat-row").map(r => ({ description: $(".m-desc", r).value.trim(), cost: n0($(".m-cost", r).value), margin: n0(r.dataset.margin) })).filter(x => x.description || x.cost > 0); }
function qfCalc() {
  const box = document.getElementById("qf-totals");
  if (!box) return;
  $$("#qf-mats .mat-row").forEach(r => $(".m-client", r).textContent = money(matClient({ cost: n0($(".m-cost", r).value), margin: n0(r.dataset.margin) })));
  const draft = { expectedHours: n0(val("qf-hours")), hourlyRate: n0(val("qf-rate")), materials: readMats() };
  const l = quoteLabor(draft), m = quoteMaterials(draft), t = l + m, min = n0(data.settings.minPrice);
  box.innerHTML = `<div class="kv"><span>Mão de obra (${fmtH(draft.expectedHours)} × ${money(draft.hourlyRate)})</span><b>${money(l)}</b></div><div class="kv"><span>Materiais (preço ao cliente)</span><b>${money(m)}</b></div><div class="kv total"><span>Total do orçamento</span><b>${money(t)}</b></div>${t > 0 && t < min ? `<p class="warn-txt small">Abaixo do preço mínimo (${money(min)}).</p>` : ""}<p class="muted small">No documento enviado ao cliente aparece o valor do serviço, sem as horas.</p>`;
}
CHANGE["qf-calc"] = qfCalc;
ACT["qf-mat-add"] = () => { document.getElementById("qf-mats").insertAdjacentHTML("beforeend", matRow()); $$("#qf-mats .m-desc").pop()?.focus(); qfCalc(); };
ACT["qf-mat-del"] = (d, t) => { t.closest(".mat-row").remove(); qfCalc(); };
function paintQFPhotos() {
  const box = document.getElementById("qf-photos");
  if (!box || !QF) return;
  if (!QF.loaded) { box.innerHTML = `<p class="muted small">A carregar…</p>`; return; }
  box.innerHTML = QF.photos.length ? QF.photos.map((p, k) => `<div class="ph"><button type="button" class="ph-img" data-act="photo-view"><img src="${p.data}" alt="Fotografia ${k + 1}"></button><button type="button" class="ph-del" data-act="qf-photo-del" data-k="${k}" aria-label="Remover fotografia">✕</button></div>`).join("") : `<p class="muted small">Sem fotografias. Registam o estado do local antes do trabalho.</p>`;
}
ACT["qf-photo-add"] = async () => { const imgs = await pickImages(); if (!QF || !imgs.length) return; imgs.forEach(x => QF.photos.push({ id: null, data: x, isNew: true })); paintQFPhotos(); };
ACT["qf-photo-del"] = d => { const p = QF?.photos[+d.k]; if (!p) return; if (p.id) QF.removed.push(p.id); QF.photos.splice(+d.k, 1); paintQFPhotos(); };
ACT["qf-save"] = async () => {
  const F = QF;
  if (!F) return;
  const S = data.settings, clientId = val("qf-client");
  if (!client(clientId)) return toast("Selecione o cliente na pesquisa.");
  const services = getServices("qf");
  if (!services.length) return toast("Selecione pelo menos um tipo de serviço.");
  const hours = parseNum(val("qf-hours")), rate = parseNum(val("qf-rate"));
  if (!(hours > 0)) return toast("Indique o n.º de horas esperadas.");
  if (!(rate >= 0)) return toast("Indique o preço/hora.");
  if (!F.loaded) return toast("Aguarde o carregamento das fotografias.");
  const mats = readMats(), total = quoteTotal({ expectedHours: hours, hourlyRate: rate, materials: mats });
  if (Math.abs(rate - n0(S.hourlyRate)) > 0.004 && !(await confirmDialog(`O preço/hora (${money(rate)}) é diferente do definido (${money(S.hourlyRate)}). Confirmar?`))) return;
  if (total < n0(S.minPrice) - 0.004 && !(await confirmDialog(`O total do orçamento (${money(total)}) é inferior ao preço mínimo (${money(S.minPrice)}). Gravar mesmo assim?`))) return;
  if (QF !== F) return;
  let q;
  const ok = commit(() => {
    const now = new Date().toISOString();
    const fields = { clientId, services, description: val("qf-desc").trim(), expectedHours: hours, hourlyRate: rate, materials: mats, frequency: val("qf-freq") || "Pontual", valid: Math.max(1, Math.round(n0(val("qf-valid")))), notes: val("qf-notes").trim() };
    if (F.id) {
      q = quote(F.id);
      q.versions = (q.versions || []).map(stripVersion);
      q.versions.push(stripVersion(q));
      Object.assign(q, fields, { version: q.version + 1, date: now });
    } else {
      q = { id: uid("q"), number: nextQuoteNumber(), version: 1, status: "Rascunho", date: now, createdAt: now, ...fields, versions: [], convertedAt: null, jobIds: [] };
      data.quotes.push(q);
    }
  });
  if (!ok) return;
  try {
    const news = F.photos.filter(p => p.isNew).map((p, k) => ({ id: uid("ph"), owner: "quote:" + q.id, data: p.data, date: new Date(Date.now() + k).toISOString() }));
    if (news.length) await PhotoDB.put(news);
    if (F.removed.length) await PhotoDB.del(F.removed);
  } catch (e) { toast("O orçamento foi gravado, mas houve um erro com as fotografias: " + e.message, 5000); }
  closeModal();
  ui.route = "jobs"; ui.jobsTab = "quotes";
  refreshUI();
  toast(F.id ? `Orçamento ${q.number} gravado (versão ${q.version}).` : `Orçamento ${q.number} criado.`);
};

/* ================= Clientes ================= */
function renderClients(m) {
  m.innerHTML = `<div class="actions"><button type="button" class="btn primary" data-act="client-new">${ico("plus")}Novo cliente</button>${btn("Novo pagamento", "pay-new")}</div><input type="search" id="client-search" class="search" placeholder="Pesquisar por nome, n.º ou telefone" value="${esc(ui.clientSearch)}" data-input="client-search" autocomplete="off"><div id="client-list"></div>`;
  renderClientList();
}
CHANGE["client-search"] = el => { ui.clientSearch = el.value; renderClientList(); };
function renderClientList() {
  const box = document.getElementById("client-list");
  if (!box) return;
  const q = ui.clientSearch.trim().toLowerCase();
  const arr = data.clients.filter(c => !q || `${c.name} ${c.number} ${c.company} ${c.phone} ${c.email}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  if (!arr.length) { box.innerHTML = empty(data.clients.length ? "Nenhum cliente corresponde à pesquisa." : "Ainda não existem clientes.", data.clients.length ? "" : `<button type="button" class="btn primary" data-act="client-new">${ico("plus")}Criar o primeiro cliente</button>`); return; }
  box.innerHTML = `<div class="stack">${arr.map(c => {
    const dues = data.jobs.filter(j => j.clientId === c.id && jobDue(j) > 0.005).sort((a, b) => jobStartDate(a) - jobStartDate(b)), tot = sum(dues, jobDue);
    const n = data.jobs.filter(j => j.clientId === c.id).length;
    return `<article class="card client-card"><div class="cc-top"><button type="button" class="cc-open" data-act="client-open" data-id="${c.id}"><span class="muted small">${esc(c.number)}</span><b>${esc(c.name)}</b>${c.company ? `<span class="muted small">${esc(c.company)}</span>` : ""}</button><div class="icon-row">${iconBtn("edit", "client-edit", `data-id="${c.id}"`, "Editar cliente")}${iconBtn("trash", "client-del", `data-id="${c.id}"`, "Eliminar cliente", "danger")}</div></div>
      ${c.phone || c.email ? `<div class="muted small">${esc([c.phone, c.email].filter(Boolean).join(" · "))}</div>` : ""}
      ${dues.length ? `<ul class="dues">${dues.map(j => `<li><button type="button" data-act="open-job" data-id="${j.id}"><span>${esc(j.number)} · ${esc(serviceNames(j).join(", "))} <small>${fmtDate(jobStartDate(j))}</small></span><b>${money(jobDue(j))}</b></button></li>`).join("")}</ul>` : ""}
      <div class="cc-total"><span>Total em dívida</span><b class="${tot > 0.005 ? "due" : ""}">${money(tot)}</b></div>
      <div class="actions"><span class="muted small">${n} ${n === 1 ? "trabalho" : "trabalhos"}</span><span class="sp"></span>${tot > 0.005 ? btn("Pagamento", "pay-new", `data-client="${c.id}"`) : ""}${btn("Abrir", "client-open", `data-id="${c.id}"`)}</div></article>`;
  }).join("")}</div>`;
}
ACT["client-new"] = d => openClientForm(null, d.prefix || "");
ACT["client-edit"] = d => openClientForm(d.id);
function openClientForm(id, prefix = "") {
  const c = id ? client(id) : null;
  openModal({
    title: c ? `Editar cliente ${c.number}` : "Novo cliente",
    body: `<div class="form-grid">${c ? "" : `<p class="info full">Vai ser atribuído o n.º <b>${nextNumber(data.clients, "C")}</b>, que identifica o cliente mesmo que haja nomes iguais.</p>`}${fText("Nome *", "cf-name", c?.name || "", { cls: "full" })}${fText("Empresa", "cf-company", c?.company || "")}${fText("NIF", "cf-nif", c?.nif || "", { mode: "numeric" })}${fText("Telefone", "cf-phone", c?.phone || "", { type: "tel" })}${fText("Email", "cf-email", c?.email || "", { type: "email" })}${fText("Morada", "cf-address", c?.address || "", { cls: "full" })}${fText("Código postal", "cf-postal", c?.postal || "", { ph: "0000-000" })}${fText("Localidade", "cf-local", c?.local || "")}${fArea("Notas", "cf-notes", c?.notes || "", { cls: "full", rows: 2 })}</div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="cf-save" data-id="${c?.id || ""}" data-prefix="${esc(prefix)}">${c ? "Gravar alterações" : "Criar cliente"}</button>`
  });
}
ACT["cf-save"] = d => {
  const name = val("cf-name").trim();
  if (!name) return toast("Indique o nome do cliente.");
  const email = val("cf-email").trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast("O email não parece válido.");
  let c;
  const f = { name, company: val("cf-company").trim(), nif: val("cf-nif").trim(), phone: val("cf-phone").trim(), email, address: val("cf-address").trim(), postal: val("cf-postal").trim(), local: val("cf-local").trim(), notes: val("cf-notes").trim() };
  const ok = commit(() => {
    if (d.id) { c = client(d.id); Object.assign(c, f); }
    else { c = { id: uid("c"), number: nextNumber(data.clients, "C"), ...f, createdAt: new Date().toISOString() }; data.clients.push(c); }
  });
  if (!ok) return;
  closeModal();
  if (!d.id && d.prefix && document.getElementById(d.prefix + "-client")) {
    document.getElementById(d.prefix + "-cs").value = `${c.number} — ${c.name}`;
    const h = document.getElementById(d.prefix + "-client");
    h.value = c.id;
    CHANGE[h.dataset.cpChange]?.(h);
  }
  refreshUI();
  toast(d.id ? "Cliente atualizado." : `Cliente ${c.number} criado.`);
};
ACT["client-del"] = async d => {
  const c = client(d.id);
  if (!c) return;
  const deps = data.jobs.some(j => j.clientId === c.id) || data.quotes.some(q => q.clientId === c.id) || data.costs.some(x => x.clientId === c.id);
  if (deps) return toast("Não é possível eliminar este cliente: tem trabalhos, orçamentos ou custos associados.", 4500);
  if (!(await confirmDialog(`Pretende avançar com a eliminação de ${c.number} — ${c.name}?`, { ok: "Eliminar", danger: true }))) return;
  if (commit(() => { data.clients = data.clients.filter(x => x.id !== c.id); })) { refreshUI(); toast("Cliente eliminado."); }
};
ACT["client-open"] = d => {
  if (!client(d.id)) return;
  const ex = layers.find(l => l.key === "client:" + d.id);
  if (ex) { closeLayer(ex); }
  openModal({ key: "client:" + d.id, live: true, wide: true, exists: () => !!client(d.id), title: () => `${client(d.id)?.number || ""} · ${client(d.id)?.name || ""}`, body: () => clientDetailBody(d.id), footer: () => `${btn(ico("edit") + "Editar", "client-edit", `data-id="${d.id}"`)}${btn(ico("doc") + "Extrato", "doc-statement", `data-id="${d.id}"`)}` });
};
function clientDetailBody(id) {
  const c = client(id);
  if (!c) return empty("Este cliente já não existe.");
  const jobs = data.jobs.filter(j => j.clientId === id).sort((a, b) => jobStartDate(b) - jobStartDate(a));
  const worked = jobs.filter(j => j.status !== "Cancelado" && isWorked(j));
  const quotes = data.quotes.filter(q => q.clientId === id).sort((a, b) => toDate(b.date) - toDate(a.date));
  const pays = data.payments.filter(p => job(p.jobId)?.clientId === id).sort((a, b) => toDate(b.date) - toDate(a.date));
  const addr = [c.address, c.postal, c.local].filter(Boolean).join(", "), due = clientDue(id);
  return `<section class="jd-client"><div>${c.company ? `<div>${esc(c.company)}</div>` : ""}${c.nif ? `<div class="muted small">NIF ${esc(c.nif)}</div>` : ""}${addr ? `<div class="muted small">${esc(addr)}</div>` : ""}${c.phone ? `<div class="muted small">${esc(c.phone)}</div>` : ""}${c.email ? `<div class="muted small">${esc(c.email)}</div>` : ""}</div><div class="icon-row">${c.phone ? `<a class="icon-btn" href="tel:${esc(c.phone.replace(/\s/g, ""))}" aria-label="Telefonar">${ico("phone")}</a>` : ""}${c.email ? `<a class="icon-btn" href="mailto:${esc(c.email)}" aria-label="Enviar email">${ico("mail")}</a>` : ""}${addr ? `<a class="icon-btn" href="${esc(mapsLink(c))}" target="_blank" rel="noopener" aria-label="Abrir mapa">${ico("map")}</a>` : ""}</div></section>
  ${c.notes ? `<p class="note-box">${escBr(c.notes)}</p>` : ""}
  <section class="tiles three"><div class="tile"><span>Trabalhado</span><b>${money(sum(worked, jobCharge))}</b></div><div class="tile"><span>Pago</span><b>${money(sum(pays, p => p.amount))}</b></div><div class="tile ${due > 0.005 ? "bad" : ""}"><span>Em dívida</span><b>${money(due)}</b></div></section>
  <div class="actions">${btn(ico("plus") + "Trabalho", "job-new", `data-client="${id}"`, "primary")}${btn(ico("plus") + "Orçamento", "quote-new", `data-client="${id}"`)}${btn("Pagamento", "pay-new", `data-client="${id}"`)}</div>
  <section class="jd-sec"><h3>Trabalhos</h3>${jobs.length ? `<ul class="rows link-rows">${jobs.map(j => `<li><button type="button" data-act="open-job" data-id="${j.id}"><div><b>${esc(j.number)}</b> ${esc(serviceNames(j).join(", "))}<div class="muted small">${fmtDate(jobStartDate(j))} · ${money(jobCharge(j))}${jobDue(j) > 0.005 ? ` · <span class="due">${money(jobDue(j))} em dívida</span>` : ""}</div></div>${pill(j.status)}</button></li>`).join("")}</ul>` : `<p class="muted small">Sem trabalhos.</p>`}</section>
  <section class="jd-sec"><h3>Orçamentos</h3>${quotes.length ? `<ul class="rows">${quotes.map(q => `<li><div><b>${esc(q.number)}</b> <span class="muted small">v${q.version} · ${fmtDate(q.date)}</span><div class="muted small">${esc(q.services.join(", "))}</div></div><span class="r-val">${money(quoteTotal(q))}</span><span class="pill ${QPILL[quoteDisplayState(q)]}">${quoteDisplayState(q)}</span>${iconBtn("doc", "quote-pdf", `data-id="${q.id}"`, "Ver PDF")}</li>`).join("")}</ul>` : `<p class="muted small">Sem orçamentos.</p>`}</section>
  <section class="jd-sec"><h3>Pagamentos</h3>${pays.length ? `<ul class="rows">${pays.map(p => `<li><div><b>${fmtDate(p.date)}</b> ${esc(job(p.jobId)?.number || "")} <span class="muted small">${esc(p.method)}</span></div><span class="r-val">${money(p.amount)}</span>${iconBtn("edit", "pay-edit", `data-id="${p.id}"`, "Editar pagamento")}</li>`).join("")}</ul>` : `<p class="muted small">Sem pagamentos.</p>`}</section>`;
}

/* ================= Pagamentos ================= */
ACT["pay-new"] = d => openPaymentForm({ jobId: d.job || null, clientId: d.client || null });
function openPaymentForm({ jobId, clientId }) {
  const j = jobId ? job(jobId) : null;
  if (j) {
    const out = jobOutstanding(j);
    openModal({
      title: `Pagamento · ${j.number}`, small: true,
      body: `<div class="form-grid"><div class="info full"><b>${esc(jobLabel(j))}</b><br>A cobrar ${money(jobCharge(j))} · pago ${money(paidFor(j.id))} · em falta <b>${money(out)}</b>${!isWorked(j) ? "<br>O trabalho ainda não foi iniciado: fica registado como pagamento adiantado." : ""}</div><fieldset class="field full"><legend>Pagamento</legend><div class="seg wide"><label><input type="radio" name="pf-kind" value="total" checked data-change="pf-kind"><span>Total</span></label><label><input type="radio" name="pf-kind" value="partial" data-change="pf-kind"><span>Parcial</span></label></div></fieldset>${fNum("Valor (€) *", "pf-amount", round2(out), { attrs: `readonly data-out="${round2(out)}"` })}${fSelect("Forma de pagamento *", "pf-method", PAY_METHODS, "Transferência bancária")}${fDate("Data", "pf-date", new Date())}${fText("Notas", "pf-notes", "", { cls: "full" })}</div>`,
      footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="pf-save-one" data-job="${j.id}">Registar pagamento</button>`
    });
    return;
  }
  openModal({
    title: "Novo pagamento",
    body: `<div class="form-grid">${clientPicker("pf", clientId || "", { change: "pf-client" })}<div class="full" id="pf-jobs"></div>${fNum("Valor recebido (€) *", "pf-amount", "", { input: "pf-amount" })}${fSelect("Forma de pagamento *", "pf-method", PAY_METHODS, "Transferência bancária")}${fDate("Data", "pf-date", new Date())}${fText("Notas", "pf-notes", "", { cls: "full" })}<div class="full" id="pf-alloc"></div></div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="pf-save-multi">Registar pagamento</button>`,
    onMount: () => { PF.touched = false; paintPayJobs(); }
  });
}
const PF = { touched: false };
CHANGE["pf-kind"] = el => {
  const a = document.getElementById("pf-amount");
  if (el.value === "total") { a.value = inputNum(a.dataset.out); a.readOnly = true; }
  else { a.readOnly = false; a.focus(); a.select(); }
};
ACT["pf-save-one"] = d => {
  const j = job(d.job), amount = parseNum(val("pf-amount")), out = jobOutstanding(j);
  if (!(amount > 0)) return toast("Indique o valor.");
  if (amount > out + 0.01) return toast(`O valor excede o montante em falta (${money(out)}).`);
  if (commit(() => data.payments.push({ id: uid("pay"), jobId: j.id, amount: round2(amount), method: val("pf-method"), date: (readDate("pf-date") || new Date()).toISOString(), groupId: null, notes: val("pf-notes").trim() }))) {
    closeModal(); refreshUI(); toast(amount >= out - 0.01 ? `Pagamento total registado. ${j.number} está pago.` : `Pagamento parcial de ${money(amount)} registado.`);
  }
};
CHANGE["pf-client"] = () => { PF.touched = false; paintPayJobs(); };
CHANGE["pf-sel"] = () => { payTotals(); };
CHANGE["pf-amount"] = () => { PF.touched = true; payTotals(); };
function payOpenJobs(cid) { return data.jobs.filter(j => j.clientId === cid && j.status !== "Cancelado" && jobOutstanding(j) > 0.005).sort((a, b) => jobStartDate(a) - jobStartDate(b)); }
function paintPayJobs() {
  const box = document.getElementById("pf-jobs");
  if (!box) return;
  const cid = val("pf-client");
  if (!cid) { box.innerHTML = `<p class="muted small">Pesquise o cliente para ver os trabalhos em aberto.</p>`; payTotals(); return; }
  const list = payOpenJobs(cid);
  box.innerHTML = list.length ? `<fieldset class="field"><legend>Trabalhos em aberto</legend><div class="pay-jobs">${list.map(j => `<label class="pay-job"><input type="checkbox" name="pf-job" value="${j.id}"${isWorked(j) ? " checked" : ""} data-change="pf-sel"><span><b>${esc(j.number)}</b> ${esc(serviceNames(j).join(", "))}<small>${fmtDate(jobStartDate(j))}${isWorked(j) ? "" : " · ainda não realizado"}</small></span><b>${money(jobOutstanding(j))}</b></label>`).join("")}</div></fieldset>` : `<p class="muted small">Este cliente não tem trabalhos em aberto.</p>`;
  payTotals();
}
function payAllocation(amount) {
  const sel = checkedValues("pf-job").map(job).filter(Boolean).sort((a, b) => jobStartDate(a) - jobStartDate(b));
  let left = round2(amount);
  return { sel, alloc: sel.map(j => { const v = Math.min(left, jobOutstanding(j)); left = round2(left - v); return { j, v: round2(v) }; }).filter(x => x.v > 0), left };
}
function payTotals() {
  const box = document.getElementById("pf-alloc"), a = document.getElementById("pf-amount");
  if (!box || !a) return;
  const sel = checkedValues("pf-job").map(job).filter(Boolean), tot = sum(sel, jobOutstanding);
  if (!PF.touched) a.value = sel.length ? inputNum(tot) : "";
  const amount = n0(a.value);
  if (!sel.length || !(amount > 0)) { box.innerHTML = sel.length ? "" : ""; return; }
  const r = payAllocation(amount);
  box.innerHTML = `<div class="calc-box"><div class="kv"><span>Total selecionado em falta</span><b>${money(tot)}</b></div>${r.alloc.map(x => `<div class="kv"><span>${esc(x.j.number)} ${x.v >= jobOutstanding(x.j) - 0.005 ? "(fica pago)" : "(parcial)"}</span><b>${money(x.v)}</b></div>`).join("")}${r.left > 0.005 ? `<p class="warn-txt small">O valor excede o total em falta em ${money(r.left)}.</p>` : ""}<p class="muted small">O valor é distribuído pelos trabalhos mais antigos primeiro.</p></div>`;
}
ACT["pf-save-multi"] = () => {
  const cid = val("pf-client"), amount = parseNum(val("pf-amount"));
  if (!cid) return toast("Selecione o cliente.");
  if (!checkedValues("pf-job").length) return toast("Selecione pelo menos um trabalho.");
  if (!(amount > 0)) return toast("Indique o valor recebido.");
  const r = payAllocation(amount);
  if (r.left > 0.005) return toast(`O valor excede o total em falta dos trabalhos selecionados em ${money(r.left)}.`);
  const groupId = r.alloc.length > 1 ? uid("grp") : null, date = (readDate("pf-date") || new Date()).toISOString(), method = val("pf-method"), notes = val("pf-notes").trim();
  if (commit(() => r.alloc.forEach(x => data.payments.push({ id: uid("pay"), jobId: x.j.id, amount: x.v, method, date, groupId, notes })))) {
    closeModal(); refreshUI(); toast(`Pagamento de ${money(amount)} registado em ${r.alloc.length} ${r.alloc.length === 1 ? "trabalho" : "trabalhos"}.`);
  }
};
ACT["pay-edit"] = d => {
  const p = data.payments.find(x => x.id === d.id);
  if (!p) return;
  const j = job(p.jobId);
  openModal({
    title: "Editar pagamento", small: true,
    body: `<div class="form-grid"><div class="info full">${esc(jobLabel(j))}</div>${fNum("Valor (€) *", "pe-amount", p.amount)}${fSelect("Forma de pagamento", "pe-method", PAY_METHODS, p.method)}${fDate("Data", "pe-date", p.date)}${fText("Notas", "pe-notes", p.notes || "", { cls: "full" })}</div>`,
    footer: `${btn(ico("trash") + "Eliminar", "pay-del", `data-id="${p.id}"`, "danger-ghost")}<span class="sp"></span>${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="pe-save" data-id="${p.id}">Gravar</button>`
  });
};
ACT["pe-save"] = d => {
  const p = data.payments.find(x => x.id === d.id), j = job(p.jobId), amount = parseNum(val("pe-amount"));
  if (!(amount > 0)) return toast("Indique o valor.");
  const max = (j ? jobOutstanding(j) : 0) + n0(p.amount);
  if (j && j.status !== "Cancelado" && amount > max + 0.01) return toast(`O valor excede o montante em falta (${money(max)}).`);
  if (commit(() => Object.assign(p, { amount: round2(amount), method: val("pe-method"), date: (readDate("pe-date") || toDate(p.date)).toISOString(), notes: val("pe-notes").trim() }))) { closeModal(); refreshUI(); toast("Pagamento atualizado."); }
};
ACT["pay-del"] = async d => {
  const p = data.payments.find(x => x.id === d.id);
  if (!p || !(await confirmDialog(`Eliminar o pagamento de ${money(p.amount)} (${fmtDate(p.date)})?`, { ok: "Eliminar", danger: true }))) return;
  if (commit(() => { data.payments = data.payments.filter(x => x.id !== d.id); })) {
    layers.filter(l => !l.live).forEach(l => { if ($('[data-act="pe-save"]', l.el)) closeLayer(l); });
    refreshUI(); toast("Pagamento eliminado.");
  }
};

/* ================= Custos ================= */
ACT["cost-new"] = d => openCostForm({ jobId: d.job || null, equipmentId: d.equip || null });
ACT["cost-edit"] = d => openCostForm({ costId: d.id });
let CF = null;
function openCostForm({ jobId, costId, equipmentId }) {
  const c = costId ? data.costs.find(x => x.id === costId) : null;
  const j = (c ? c.jobId : jobId) ? job(c ? c.jobId : jobId) : null;
  const mode = c ? (c.jobId ? "job" : c.equipmentId ? "equipment" : c.clientId ? "client" : "general") : (j ? "job" : equipmentId ? "equipment" : "general");
  const cat = c ? c.category : j ? "Materiais" : equipmentId ? "Manutenção" : "Combustível";
  CF = { id: c?.id || null, fixedJob: !c && !!jobId, jobId: j?.id || "", clientId: c?.clientId || j?.clientId || "", equipmentId: c?.equipmentId || equipmentId || "", chargeTouched: !!c };
  openModal({
    title: c ? "Editar custo" : "Novo custo",
    body: `<div class="form-grid">${fSelect("Categoria *", "co-cat", COST_CATS, cat, { change: "co-cat" })}${fNum("Custo (€) *", "co-amount", c?.amount ?? "", { input: "co-calc", ph: "Valor pago" })}${fText("Descrição", "co-desc", c?.description || "", { cls: "full", ph: "Ex.: bico de rega, gasóleo, fio de roçadora" })}${fDate("Data", "co-date", c?.date || new Date(), { mode: "date" })}
      ${CF.fixedJob ? `<div class="info full">Associado a <b>${esc(jobLabel(j))}</b></div>` : `<fieldset class="field full"><legend>Associar a</legend><div class="seg wide">${[["general", "Geral"], ["client", "Cliente"], ["job", "Trabalho"], ["equipment", "Equipamento"]].map(([v, l]) => `<label><input type="radio" name="co-mode" value="${v}"${mode === v ? " checked" : ""} data-change="co-mode"><span>${l}</span></label>`).join("")}</div></fieldset><div class="full" id="co-assoc"></div>`}
      <div class="full sub-block" id="co-charge-wrap">${fToggle("Imputar ao cliente (o cliente paga este material)", "co-charge", c ? c.chargeable : CHARGEABLE_DEFAULT.includes(cat), { change: "co-charge" })}<div class="form-grid two">${fNum("Margem (%)", "co-margin", c?.margin ?? data.settings.materialMargin, { input: "co-calc" })}<div class="calc-box" id="co-client"></div></div></div>
    </div>`,
    footer: `${c ? btn(ico("trash") + "Eliminar", "cost-del", `data-id="${c.id}"`, "danger-ghost") + '<span class="sp"></span>' : ""}${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="co-save">Gravar custo</button>`,
    onMount: () => { paintCostAssoc(); coCalc(); },
    onClose: () => { CF = null; }
  });
}
function coMode() { return CF?.fixedJob ? "job" : ($('input[name="co-mode"]:checked')?.value || "general"); }
function paintCostAssoc() {
  const box = document.getElementById("co-assoc");
  if (box && CF) {
    const m = coMode();
    if (m === "general") box.innerHTML = `<p class="muted small">Custo geral do negócio (ex.: combustível, manutenção), sem imputação a cliente.</p>`;
    else if (m === "client") {
      const jobs = CF.clientId ? data.jobs.filter(j => j.clientId === CF.clientId && j.status !== "Cancelado").sort((a, b) => jobStartDate(b) - jobStartDate(a)) : [];
      box.innerHTML = `${clientPicker("co", CF.clientId, { change: "co-client" })}${CF.clientId ? fSelect("Trabalho do cliente", "co-cjob", jobs.map(j => ({ v: j.id, l: `${j.number} · ${fmtDate(jobStartDate(j))} · ${serviceNames(j).join(", ")}` })), CF.jobId, { empty: "Sem trabalho específico", change: "co-cjob", cls: "full" }) : ""}`;
    } else if (m === "job") {
      const jobs = data.jobs.filter(j => j.status !== "Cancelado" || j.id === CF.jobId).sort((a, b) => jobStartDate(b) - jobStartDate(a)).slice(0, 200);
      box.innerHTML = fSelect("Trabalho *", "co-job", jobs.map(j => ({ v: j.id, l: jobLabel(j) })), CF.jobId, { empty: "Selecionar trabalho", change: "co-job", cls: "full" });
    } else {
      box.innerHTML = data.equipment.length ? fSelect("Equipamento *", "co-equip", data.equipment.map(e => ({ v: e.id, l: `${e.type} ${e.brand} ${e.model}`.trim() })), CF.equipmentId, { empty: "Selecionar equipamento", change: "co-equip", cls: "full" }) : `<p class="muted small">Ainda não há equipamentos registados.</p>`;
    }
  }
  const wrap = document.getElementById("co-charge-wrap");
  if (wrap) wrap.hidden = !coJobId();
  coCalc();
}
function coJobId() { const m = coMode(); return m === "job" ? CF?.jobId : m === "client" ? CF?.jobId : ""; }
CHANGE["co-mode"] = () => { if (coMode() !== "client" && coMode() !== "job") CF.jobId = ""; paintCostAssoc(); };
CHANGE["co-client"] = el => {
  CF.clientId = el.value; CF.jobId = "";
  if (el.value) paintCostAssoc();
  else { document.getElementById("co-cjob")?.closest(".field")?.remove(); const w = document.getElementById("co-charge-wrap"); if (w) w.hidden = true; }
};
CHANGE["co-cjob"] = el => { CF.jobId = el.value; paintCostAssoc(); };
CHANGE["co-job"] = el => { CF.jobId = el.value; CF.clientId = job(el.value)?.clientId || ""; paintCostAssoc(); };
CHANGE["co-equip"] = el => { CF.equipmentId = el.value; };
CHANGE["co-cat"] = el => { if (CF && !CF.chargeTouched) { const t = document.getElementById("co-charge"); if (t) t.checked = CHARGEABLE_DEFAULT.includes(el.value); } coCalc(); };
CHANGE["co-charge"] = () => { if (CF) CF.chargeTouched = true; coCalc(); };
function coCalc() {
  const box = document.getElementById("co-client");
  if (!box) return;
  const on = $("#co-charge")?.checked, a = n0(val("co-amount")), mg = n0(val("co-margin"));
  box.innerHTML = on ? `<div class="kv"><span>Preço ao cliente</span><b>${money(a * (1 + mg / 100))}</b></div>` : `<p class="muted small">Custo interno: conta para o resultado, não é cobrado.</p>`;
}
CHANGE["co-calc"] = coCalc;
ACT["co-save"] = () => {
  const F = CF;
  if (!F) return;
  const amount = parseNum(val("co-amount"));
  if (!(amount > 0)) return toast("Indique o valor do custo.");
  const m = coMode();
  if (m === "job" && !F.jobId) return toast("Selecione o trabalho.");
  if (m === "client" && !F.clientId) return toast("Selecione o cliente.");
  if (m === "equipment" && !F.equipmentId) return toast("Selecione o equipamento.");
  const jobId = (m === "job" || m === "client") ? F.jobId : "";
  const rec = {
    category: val("co-cat"), amount: round2(amount), description: val("co-desc").trim(), date: (readDate("co-date") || new Date()).toISOString(),
    jobId, clientId: m === "client" || m === "job" ? (F.clientId || job(jobId)?.clientId || "") : "", equipmentId: m === "equipment" ? F.equipmentId : "",
    chargeable: !!jobId && !!$("#co-charge")?.checked, margin: n0(val("co-margin"))
  };
  if (commit(() => { if (F.id) Object.assign(data.costs.find(x => x.id === F.id), rec); else data.costs.push({ id: uid("cst"), ...rec }); })) {
    closeModal(); refreshUI(); toast(F.id ? "Custo atualizado." : "Custo registado.");
  }
};
ACT["cost-del"] = async d => {
  const c = data.costs.find(x => x.id === d.id);
  if (!c || !(await confirmDialog(`Eliminar o custo "${c.description || c.category}" (${money(c.amount)})?`, { ok: "Eliminar", danger: true }))) return;
  if (commit(() => { data.costs = data.costs.filter(x => x.id !== d.id); })) {
    layers.filter(l => !l.live && $('[data-act="co-save"]', l.el)).forEach(closeLayer);
    refreshUI(); toast("Custo eliminado.");
  }
};
/* ================= Mais ================= */
function renderMore(m) {
  if (ui.more === "finance") return renderFinance(m);
  if (ui.more === "equipment") return renderEquipment(m);
  if (ui.more === "settings") return renderSettings(m);
  const due = sum(data.jobs, jobDue), mt = data.equipment.reduce((a, e) => a + maintenanceStatus(e).filter(x => x.state !== "ok" && x.state !== "unknown").length, 0);
  m.innerHTML = `${storageLocked ? `<div class="alert bad"><span>Os dados guardados não puderam ser lidos. Abra Definições para resolver.</span></div>` : ""}<div class="menu">
    <button type="button" class="card menu-item" data-act="nav" data-route="more" data-more="finance"><b>Finanças</b><span>Custos, pagamentos e exportação</span><em>${money(due)} por receber</em></button>
    <button type="button" class="card menu-item" data-act="nav" data-route="more" data-more="equipment"><b>Equipamentos</b><span>Garantias, faturas e manutenções</span><em>${data.equipment.length} registados${mt ? ` · ${mt} manutenção(ões) a fazer` : ""}</em></button>
    <button type="button" class="card menu-item" data-act="nav" data-route="more" data-more="settings"><b>Definições</b><span>Empresa, preços, horário, serviços e backup</span><em>Último backup: ${data.settings.lastBackup ? fmtDate(data.settings.lastBackup) : "nunca"}</em></button>
  </div>`;
}
const backLink = () => `<button type="button" class="back" data-act="nav" data-route="more" data-more="">${ico("back")}Mais</button>`;

/* ---- Finanças ---- */
function finRange() {
  const t = new Date();
  if (ui.finPeriod === "month") return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: endOfDay(t) };
  if (ui.finPeriod === "year") return { from: new Date(t.getFullYear(), 0, 1), to: endOfDay(t) };
  return { from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) };
}
ACT["fin-period"] = d => { ui.finPeriod = d.v; render(); };
ACT["fin-tab"] = d => { ui.finTab = d.v; render(); };
ACT["fin-cat"] = d => { ui.costCat = d.v; render(); };
function renderFinance(m) {
  const R = finRange();
  const costs = data.costs.filter(c => inRange(c.date, R)).sort((a, b) => toDate(b.date) - toDate(a.date));
  const pays = data.payments.filter(p => inRange(p.date, R)).sort((a, b) => toDate(b.date) - toDate(a.date));
  const worked = data.jobs.filter(j => j.status !== "Cancelado" && isWorked(j) && inRange(jobStartDate(j), R));
  const earned = sum(worked, jobCharge), ct = sum(costs, c => c.amount), rec = sum(pays, p => p.amount);
  const byCat = COST_CATS.map(cat => ({ l: cat, v: sum(costs.filter(c => c.category === cat), c => c.amount), c: "var(--soil)" })).filter(x => x.v > 0);
  const shown = ui.costCat === "Todas" ? costs : costs.filter(c => c.category === ui.costCat);
  m.innerHTML = `${backLink()}
  <div class="chips">${[["month", "Este mês"], ["year", "Este ano"], ["all", "Tudo"]].map(([v, l]) => `<button type="button" class="chip${ui.finPeriod === v ? " on" : ""}" data-act="fin-period" data-v="${v}">${l}</button>`).join("")}</div>
  <section class="tiles">
    <div class="tile"><span>Trabalhado</span><b>${money(earned)}</b></div><div class="tile"><span>Recebido</span><b>${money(rec)}</b></div>
    <div class="tile"><span>Custos</span><b>${money(ct)}</b></div><div class="tile"><span>Resultado</span><b class="${earned - ct >= 0 ? "pos" : "neg"}">${money(earned - ct)}</b></div>
    <div class="tile bad"><span>Por receber (total)</span><b>${money(sum(data.jobs, jobDue))}</b></div>
  </section>
  ${byCat.length ? `<article class="card"><h3>Custos por categoria</h3>${hbars(byCat)}</article>` : ""}
  <div class="actions">${btn(ico("plus") + "Custo", "cost-new", "", "primary")}${btn(ico("plus") + "Pagamento", "pay-new", "", "primary")}</div>
  <div class="subtabs"><button type="button" class="${ui.finTab === "costs" ? "on" : ""}" data-act="fin-tab" data-v="costs">Custos (${costs.length})</button><button type="button" class="${ui.finTab === "pays" ? "on" : ""}" data-act="fin-tab" data-v="pays">Pagamentos (${pays.length})</button></div>
  ${ui.finTab === "costs" ? `<div class="chips scroll">${["Todas", ...COST_CATS].map(c => `<button type="button" class="chip${ui.costCat === c ? " on" : ""}" data-act="fin-cat" data-v="${c}">${c}</button>`).join("")}</div>
    ${shown.length ? `<ul class="rows card-list">${shown.map(c => `<li><div><b>${esc(c.description || c.category)}</b> <span class="muted small">${esc(c.category)} · ${fmtDate(c.date)}</span><div class="muted small">${c.jobId ? esc(jobLabel(job(c.jobId))) : c.equipmentId ? esc(equip(c.equipmentId)?.type || "Equipamento") : c.clientId ? esc(clientName(c.clientId)) : "Geral"}${c.chargeable ? ` · ao cliente ${money(costClientValue(c))}` : ""}</div></div><span class="r-val">${money(c.amount)}</span>${iconBtn("edit", "cost-edit", `data-id="${c.id}"`, "Editar custo")}${iconBtn("trash", "cost-del", `data-id="${c.id}"`, "Eliminar custo", "danger")}</li>`).join("")}</ul>` : empty("Sem custos neste período.")}`
    : (pays.length ? `<ul class="rows card-list">${pays.map(p => `<li><div><b>${fmtDate(p.date)}</b> ${esc(job(p.jobId)?.number || "")} · ${esc(clientName(job(p.jobId)?.clientId))}<div class="muted small">${esc(p.method)}${p.notes ? ` · ${esc(p.notes)}` : ""}</div></div><span class="r-val">${money(p.amount)}</span>${iconBtn("edit", "pay-edit", `data-id="${p.id}"`, "Editar pagamento")}${iconBtn("trash", "pay-del", `data-id="${p.id}"`, "Eliminar pagamento", "danger")}</li>`).join("")}</ul>` : empty("Sem pagamentos neste período."))}
  <div class="actions export">${btn("Exportar custos (CSV)", "csv", 'data-k="costs"')}${btn("Exportar pagamentos (CSV)", "csv", 'data-k="payments"')}</div>`;
}

/* ---- Equipamentos ---- */
function renderEquipment(m) {
  m.innerHTML = `${backLink()}<div class="actions">${btn(ico("plus") + "Equipamento", "eq-new", "", "primary")}</div>
  ${data.equipment.length ? `<div class="stack">${data.equipment.map(e => {
    const ms = maintenanceStatus(e), w = toDate(e.warrantyEnd), wOk = w && endOfDay(w) >= new Date();
    return `<article class="card eq-card"><div class="cc-top"><button type="button" class="cc-open" data-act="eq-open" data-id="${e.id}"><b>${esc(e.type)}</b><span class="muted">${esc([e.brand, e.model].filter(Boolean).join(" "))}</span></button><div class="icon-row">${iconBtn("edit", "eq-edit", `data-id="${e.id}"`, "Editar equipamento")}${iconBtn("trash", "eq-del", `data-id="${e.id}"`, "Eliminar equipamento", "danger")}</div></div>
      <div class="muted small">${w ? `<span class="${wOk ? "ok-txt" : ""}">Garantia ${wOk ? "até" : "terminou a"} ${fmtDate(w)}</span>` : "Sem data de garantia"}${e.purchaseDate ? ` · comprado a ${fmtDate(e.purchaseDate)}` : ""}</div>
      ${ms.length ? `<ul class="maint">${ms.map(x => `<li class="${x.state}"><span>${esc(x.task.name)}</span><small>${x.next ? `${x.state === "overdue" ? "em atraso desde" : "próxima"} ${fmtDate(x.next)}` : "indique a data de compra ou registe a última"}</small></li>`).join("")}</ul>` : ""}
      <div class="actions">${btn("Registar manutenção", "eq-log", `data-id="${e.id}"`)}${btn("Abrir", "eq-open", `data-id="${e.id}"`)}</div></article>`;
  }).join("")}</div>` : empty("Ainda não existem equipamentos.", `<button type="button" class="btn primary" data-act="eq-new">${ico("plus")}Registar equipamento</button>`)}`;
}
ACT["eq-new"] = () => openEquipForm();
ACT["eq-edit"] = d => openEquipForm(d.id);
let EF = null;
function taskRow(t = {}) { return `<div class="task-row" data-id="${esc(t.id || "")}"><input class="t-name" aria-label="Tarefa" placeholder="Ex.: troca de óleo" value="${esc(t.name || "")}"><label class="t-n"><input class="t-months" inputmode="numeric" aria-label="Meses" value="${t.months ? esc(t.months) : ""}" placeholder="—"><span>meses</span></label><label class="t-n"><input class="t-hours" inputmode="numeric" aria-label="Horas de uso" value="${t.hours ? esc(t.hours) : ""}" placeholder="—"><span>horas</span></label><button type="button" class="icon-btn danger" data-act="ef-task-del" aria-label="Remover tarefa">${ico("trash")}</button></div>`; }
function openEquipForm(id) {
  const e = id ? equip(id) : null;
  EF = { id: e?.id || null, photos: [], removed: [], loaded: !e };
  openModal({
    title: e ? "Editar equipamento" : "Novo equipamento", wide: true,
    body: `<div class="form-grid">${fText("Tipo de equipamento *", "ef-type", e?.type || "", { ph: "Ex.: corta-relva, roçadora" })}${fText("Marca", "ef-brand", e?.brand || "")}${fText("Modelo", "ef-model", e?.model || "")}${fText("N.º de série", "ef-serial", e?.serial || "")}${fDate("Data de compra", "ef-pdate", e?.purchaseDate || "", { mode: "date" })}${fText("Fornecedor", "ef-supplier", e?.supplier || "")}${fNum("Preço (€)", "ef-price", e?.price || "")}${fDate("Fim da garantia", "ef-wend", e?.warrantyEnd || "", { mode: "date" })}
      <div class="full sub-block"><div class="section-head"><h4>Manutenções periódicas</h4>${btn(ico("plus") + "Tarefa", "ef-task-add", "", "ghost small")}</div><div id="ef-tasks">${(e?.tasks?.length ? e.tasks : [{}]).map(taskRow).join("")}</div><p class="muted small">Intervalo em meses (gera avisos). As horas de uso são informativas.</p></div>
      <div class="full sub-block"><div class="section-head"><h4>Fatura e fotografias</h4>${btn(ico("camera") + "Adicionar", "ef-photo-add", "", "ghost small")}</div><div class="photo-grid" id="ef-photos"></div><p class="muted small">Fotografe a fatura de compra para efeitos de garantia.</p></div>
      ${fArea("Notas", "ef-notes", e?.notes || "", { cls: "full" })}</div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="ef-save">${e ? "Gravar alterações" : "Gravar equipamento"}</button>`,
    onMount: () => { paintEFPhotos(); if (e) PhotoDB.list("equip:" + e.id).then(r => { if (EF?.id !== e.id) return; EF.photos = r.map(x => ({ id: x.id, data: x.data })); EF.loaded = true; paintEFPhotos(); }).catch(() => { if (EF) { EF.loaded = true; paintEFPhotos(); } }); },
    onClose: () => { EF = null; }
  });
}
ACT["ef-task-add"] = () => document.getElementById("ef-tasks").insertAdjacentHTML("beforeend", taskRow());
ACT["ef-task-del"] = (d, t) => t.closest(".task-row").remove();
function paintEFPhotos() {
  const box = document.getElementById("ef-photos");
  if (!box || !EF) return;
  box.innerHTML = !EF.loaded ? `<p class="muted small">A carregar…</p>` : EF.photos.length ? EF.photos.map((p, k) => `<div class="ph"><button type="button" class="ph-img" data-act="photo-view"><img src="${p.data}" alt="Fotografia ${k + 1}"></button><button type="button" class="ph-del" data-act="ef-photo-del" data-k="${k}" aria-label="Remover fotografia">✕</button></div>`).join("") : `<p class="muted small">Sem fotografias.</p>`;
}
ACT["ef-photo-add"] = async () => { const imgs = await pickImages(); if (!EF || !imgs.length) return; imgs.forEach(x => EF.photos.push({ id: null, data: x, isNew: true })); paintEFPhotos(); };
ACT["ef-photo-del"] = d => { const p = EF?.photos[+d.k]; if (!p) return; if (p.id) EF.removed.push(p.id); EF.photos.splice(+d.k, 1); paintEFPhotos(); };
ACT["ef-save"] = async () => {
  const F = EF;
  if (!F) return;
  const type = val("ef-type").trim();
  if (!type) return toast("Indique o tipo de equipamento.");
  if (!F.loaded) return toast("Aguarde o carregamento das fotografias.");
  const tasks = $$("#ef-tasks .task-row").map(r => ({ id: r.dataset.id || uid("t"), name: $(".t-name", r).value.trim(), months: Math.max(0, Math.round(n0($(".t-months", r).value))), hours: Math.max(0, Math.round(n0($(".t-hours", r).value))) })).filter(t => t.name);
  let e;
  const rec = { type, brand: val("ef-brand").trim(), model: val("ef-model").trim(), serial: val("ef-serial").trim(), purchaseDate: dayKey(readDate("ef-pdate")), supplier: val("ef-supplier").trim(), price: n0(val("ef-price")), warrantyEnd: dayKey(readDate("ef-wend")), notes: val("ef-notes").trim(), tasks };
  const ok = commit(() => {
    if (F.id) { e = equip(F.id); Object.assign(e, rec); }
    else { e = { id: uid("e"), ...rec, log: [] }; data.equipment.push(e); }
  });
  if (!ok) return;
  try {
    const news = F.photos.filter(p => p.isNew).map((p, k) => ({ id: uid("ph"), owner: "equip:" + e.id, data: p.data, date: new Date(Date.now() + k).toISOString() }));
    if (news.length) await PhotoDB.put(news);
    if (F.removed.length) await PhotoDB.del(F.removed);
  } catch (err) { toast("Equipamento gravado, mas houve um erro com as fotografias: " + err.message, 5000); }
  closeModal(); refreshUI(); toast(F.id ? "Equipamento atualizado." : "Equipamento registado.");
};
ACT["eq-del"] = async d => {
  const e = equip(d.id);
  if (!e || !(await confirmDialog(`Pretende avançar com a eliminação de ${e.type}${e.brand ? " " + e.brand : ""}? As fotografias da fatura também são eliminadas.`, { ok: "Eliminar", danger: true }))) return;
  if (commit(() => { data.equipment = data.equipment.filter(x => x.id !== e.id); data.costs.forEach(c => { if (c.equipmentId === e.id) c.equipmentId = ""; }); })) { PhotoDB.delOwner("equip:" + e.id).catch(() => { }); refreshUI(); toast("Equipamento eliminado."); }
};
ACT["eq-open"] = d => {
  if (!equip(d.id)) return;
  openModal({
    key: "equip:" + d.id, live: true, wide: true, exists: () => !!equip(d.id),
    title: () => equip(d.id)?.type || "Equipamento",
    body: () => {
      const e = equip(d.id), ms = maintenanceStatus(e), costs = data.costs.filter(c => c.equipmentId === e.id);
      return `<section class="tiles three"><div class="tile"><span>Marca e modelo</span><b>${esc([e.brand, e.model].filter(Boolean).join(" ") || "—")}</b></div><div class="tile"><span>Compra</span><b>${e.purchaseDate ? fmtDate(e.purchaseDate) : "—"}</b>${e.price ? `<small>${money(e.price)}${e.supplier ? " · " + esc(e.supplier) : ""}</small>` : ""}</div><div class="tile"><span>Garantia até</span><b>${e.warrantyEnd ? fmtDate(e.warrantyEnd) : "—"}</b></div></section>
      ${e.serial ? `<p class="muted small">N.º de série: ${esc(e.serial)}</p>` : ""}${e.notes ? `<p class="note-box">${escBr(e.notes)}</p>` : ""}
      <section class="jd-sec"><div class="section-head"><h3>Manutenções</h3>${btn(ico("plus") + "Registar", "eq-log", `data-id="${e.id}"`, "ghost small")}</div>${ms.length ? `<ul class="maint">${ms.map(x => `<li class="${x.state}"><span>${esc(x.task.name)} <small>a cada ${x.task.months} meses${x.task.hours ? ` / ${x.task.hours} h` : ""}</small></span><small>${x.next ? `próxima ${fmtDate(x.next)}` : "sem data de referência"}</small></li>`).join("")}</ul>` : `<p class="muted small">Sem tarefas periódicas definidas.</p>`}
      ${(e.log || []).length ? `<ul class="rows">${[...e.log].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(l => `<li><div><b>${fmtDate(l.date)}</b> ${esc(e.tasks.find(t => t.id === l.taskId)?.name || "Manutenção")}${l.notes ? `<div class="muted small">${esc(l.notes)}</div>` : ""}</div>${iconBtn("trash", "eq-log-del", `data-id="${e.id}" data-l="${l.id}"`, "Eliminar registo", "danger")}</li>`).join("")}</ul>` : ""}</section>
      ${costs.length ? `<section class="jd-sec"><h3>Custos associados</h3><ul class="rows">${costs.map(c => `<li><div><b>${fmtDate(c.date)}</b> ${esc(c.description || c.category)}</div><span class="r-val">${money(c.amount)}</span>${iconBtn("edit", "cost-edit", `data-id="${c.id}"`, "Editar custo")}</li>`).join("")}</ul><p class="muted small">Total: ${money(sum(costs, c => c.amount))}</p></section>` : ""}
      <section class="jd-sec"><div class="section-head"><h3>Fatura e fotografias</h3>${btn(ico("camera") + "Adicionar", "photo-add", `data-owner="equip:${e.id}"`, "ghost small")}</div><div class="photo-grid" id="eq-photos"><p class="muted small">A carregar…</p></div></section>`;
    },
    footer: () => `${btn(ico("edit") + "Editar", "eq-edit", `data-id="${d.id}"`)}${btn(ico("plus") + "Custo", "cost-new", `data-equip="${d.id}"`)}`,
    onMount: () => loadPhotoGrid("equip:" + d.id, "eq-photos")
  });
};
ACT["eq-log"] = d => {
  const e = equip(d.id);
  openModal({
    title: `Manutenção · ${e.type}`, small: true,
    body: `<div class="form-grid">${fSelect("Tarefa", "ml-task", [...e.tasks.map(t => ({ v: t.id, l: t.name })), { v: "", l: "Outra / reparação" }], e.tasks[0]?.id || "", { cls: "full" })}${fDate("Data", "ml-date", new Date(), { mode: "date" })}${fNum("Custo (€, opcional)", "ml-cost", "")}${fText("Notas", "ml-notes", "", { cls: "full", ph: "Ex.: óleo 10W30, filtro de ar" })}</div><p class="muted small">Se indicar um custo, fica registado em Finanças na categoria Manutenção.</p>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="ml-save" data-id="${e.id}">Registar</button>`
  });
};
ACT["ml-save"] = d => {
  const e = equip(d.id), date = readDate("ml-date");
  if (!date) return toast("Indique a data.");
  const cost = n0(val("ml-cost")), taskId = val("ml-task"), notes = val("ml-notes").trim(), tname = e.tasks.find(t => t.id === taskId)?.name || "Manutenção";
  if (commit(() => {
    e.log = e.log || []; e.log.push({ id: uid("ml"), date: dayKey(date), taskId, notes });
    if (cost > 0) data.costs.push({ id: uid("cst"), date: date.toISOString(), category: "Manutenção", description: `${e.type}: ${tname}${notes ? " — " + notes : ""}`, amount: round2(cost), margin: 0, chargeable: false, jobId: "", clientId: "", equipmentId: e.id });
  })) { closeModal(); refreshUI(); toast("Manutenção registada."); }
};
ACT["eq-log-del"] = async d => {
  if (!(await confirmDialog("Eliminar este registo de manutenção?", { ok: "Eliminar", danger: true }))) return;
  if (commit(() => { const e = equip(d.id); e.log = e.log.filter(l => l.id !== d.l); })) refreshUI();
};

/* ---- Definições (cada quadro edita-se de forma independente) ---- */
const TIME_OPTS = (() => { const o = []; for (let h = 5; h <= 23; h++) for (const mi of [0, 30]) o.push(`${pad(h)}:${pad(mi)}`); return o; })();
function settingsCard(key, title, inner, foot = "") {
  const on = !!ui.edit[key];
  return `<article class="card set-card${on ? " editing" : ""}" id="set-${key}"><div class="section-head"><h3>${title}</h3>${on ? `<span class="muted small">A editar</span>` : iconBtn("edit", "set-edit", `data-k="${key}"`, "Editar " + title)}</div><fieldset class="set-fields"${on ? "" : " disabled"}>${inner}</fieldset>${on ? `<div class="actions end">${btn("Cancelar", "set-cancel", `data-k="${key}"`)}<button type="button" class="btn primary" data-act="set-save" data-k="${key}">Gravar alterações</button></div>` : foot}</article>`;
}
function renderSettings(m) {
  const s = data.settings, logo = ui.logoDraft !== undefined ? ui.logoDraft : s.logo;
  m.innerHTML = `${backLink()}
  ${storageLocked ? `<article class="card alert-card"><h3>Dados guardados ilegíveis</h3><p>Não foi possível ler os dados que estavam guardados neste dispositivo. Para não os perder, a app não grava nada até resolver. Pode descarregar o conteúdo original (para análise), restaurar um backup, ou começar com dados vazios.</p><div class="actions">${recoveryRaw ? btn("Descarregar dados originais", "recovery-download") : ""}${btn("Restaurar backup", "backup-import", "", "primary")}${btn("Começar com dados vazios", "recovery-reset", "", "danger-ghost")}</div></article>` : ""}
  ${settingsCard("company", "Empresa", `<div class="form-grid">${fText("Nome comercial", "s-company", s.companyName)}${fText("Nome legal", "s-legal", s.legalName)}${fText("NIF", "s-nif", s.nif, { mode: "numeric" })}${fText("Telefone", "s-phone", s.phone, { type: "tel" })}${fText("Email", "s-email", s.email, { type: "email" })}${fText("IBAN (aparece nos documentos)", "s-iban", s.iban)}${fText("Morada", "s-address", s.address, { cls: "full" })}${fText("Código postal", "s-postal", s.postal)}${fText("Localidade", "s-local", s.local)}${fText("Nota de rodapé dos documentos", "s-docnote", s.docNote, { cls: "full" })}</div>
    <div class="logo-row"><div class="logo-prev" id="s-logo-prev">${logo ? `<img src="${logo}" alt="Logótipo">` : `<span class="muted small">Sem logótipo</span>`}</div>${ui.edit.company ? `<div class="actions">${btn("Escolher logótipo (PNG/JPG)", "logo-pick")}${logo ? btn(ico("trash") + "Remover", "logo-remove", "", "danger-ghost") : ""}</div>` : ""}</div>`)}
  ${settingsCard("pricing", "Preços e horário", `<div class="form-grid">${fNum("Preço/hora (€)", "s-rate", s.hourlyRate)}${fNum("Preço mínimo por trabalho (€)", "s-min", s.minPrice)}${fNum("Margem sobre materiais (%)", "s-margin", s.materialMargin)}${fNum("Capacidade semanal (horas)", "s-cap", s.weeklyCapacity)}${fSelect("Início do horário", "s-ws", TIME_OPTS, s.workStart)}${fSelect("Fim do horário", "s-we", TIME_OPTS, s.workEnd)}</div><p class="muted small">O calendário mostra sempre das 06:00 às 22:00; fora do horário fica a cinzento escuro. Pode gravar trabalhos fora do horário, com confirmação. A margem é aplicada ao custo dos materiais imputados ao cliente (ex.: custo 10 € + 10% = 11 € ao cliente).</p>`)}
  ${settingsCard("services", "Tipos de serviço", `${fArea("Um serviço por linha", "s-services", (s.serviceTypes || []).join("\n"), { rows: 6 })}<p class="muted small">A opção "Outro", com texto livre, está sempre disponível.</p>`)}
  ${settingsCard("backup", "Cópia de segurança", `${fStepper("Lembrar de fazer backup a cada (dias, mínimo 30)", "s-bk", Math.max(30, n0(s.backupIntervalDays)), { min: 30, max: 365 })}`, `<p>Último backup: <b>${s.lastBackup ? fmtDT(s.lastBackup) : "nunca"}</b></p><div class="actions">${btn(ico("backup") + "Fazer backup agora", "backup-export", "", "primary")}${btn("Restaurar backup", "backup-import")}</div><p class="muted small">O backup é um ficheiro .json com todos os dados e fotografias. No iPhone, escolha "Guardar em Ficheiros" e depois iCloud Drive, OneDrive ou Google Drive. Para mudar de telemóvel, instale a app no novo aparelho e use "Restaurar backup".</p>`)}
  <article class="card"><h3>Exportar dados (CSV)</h3><p class="muted small">Ficheiros para Excel ou para importar noutro programa. Separador ";" e datas dd/mm/aaaa.</p><div class="actions">${btn("Trabalhos", "csv", 'data-k="jobs"')}${btn("Pagamentos", "csv", 'data-k="payments"')}${btn("Custos", "csv", 'data-k="costs"')}${btn("Clientes", "csv", 'data-k="clients"')}</div></article>
  <article class="card"><h3>Armazenamento</h3><div id="storage-info" class="muted small">A calcular…</div></article>
  <p class="about">Jardim-app ${APP_VERSION} · dados guardados apenas neste dispositivo</p>`;
  storageInfo();
}
ACT["set-edit"] = d => { ui.edit[d.k] = true; render(); document.getElementById("set-" + d.k)?.scrollIntoView({ block: "start", behavior: "smooth" }); };
ACT["set-cancel"] = d => { ui.edit[d.k] = false; if (d.k === "company") ui.logoDraft = undefined; render(); };
ACT["logo-pick"] = () => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/png,image/jpeg"; inp.hidden = true; document.body.append(inp);
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; inp.remove();
    if (!f) return;
    if (!/image\/(png|jpeg)/.test(f.type)) return toast("O logótipo deve ser PNG ou JPG.");
    try { ui.logoDraft = await compressImage(f, 600, 0.9, f.type === "image/png"); paintLogoPreview(); } catch (e) { toast("Não foi possível ler a imagem."); }
  }, { once: true });
  inp.click();
};
ACT["logo-remove"] = () => { ui.logoDraft = null; paintLogoPreview(); };
function paintLogoPreview() {
  const box = document.getElementById("s-logo-prev");
  if (!box) return;
  const logo = ui.logoDraft !== undefined ? ui.logoDraft : data.settings.logo;
  box.innerHTML = logo ? `<img src="${logo}" alt="Logótipo">` : `<span class="muted small">Sem logótipo (grave para confirmar)</span>`;
}
ACT["set-save"] = d => {
  const k = d.k, s = data.settings;
  let next = {};
  if (k === "company") {
    next = { companyName: val("s-company").trim(), legalName: val("s-legal").trim(), nif: val("s-nif").trim(), phone: val("s-phone").trim(), email: val("s-email").trim(), iban: val("s-iban").trim(), address: val("s-address").trim(), postal: val("s-postal").trim(), local: val("s-local").trim(), docNote: val("s-docnote").trim() };
    if (ui.logoDraft !== undefined) next.logo = ui.logoDraft;
  } else if (k === "pricing") {
    const ws = val("s-ws"), we = val("s-we");
    if (hmToHours(we) <= hmToHours(ws)) return toast("O fim do horário tem de ser depois do início.");
    const nums = { hourlyRate: parseNum(val("s-rate")), minPrice: parseNum(val("s-min")), materialMargin: parseNum(val("s-margin")), weeklyCapacity: parseNum(val("s-cap")) };
    if (Object.values(nums).some(v => !(v >= 0))) return toast("Verifique os valores numéricos.");
    next = { ...nums, workStart: ws, workEnd: we };
  } else if (k === "services") {
    const list = [...new Set(val("s-services").split("\n").map(x => x.trim()).filter(x => x && x.toLowerCase() !== "outro"))];
    if (!list.length) return toast("Indique pelo menos um tipo de serviço.");
    next = { serviceTypes: list };
  } else if (k === "backup") next = { backupIntervalDays: Math.max(30, Math.round(n0(val("s-bk")))) };
  if (commit(() => Object.assign(s, next))) { ui.edit[k] = false; if (k === "company") ui.logoDraft = undefined; render(); toast("Alterações gravadas."); }
};
async function storageInfo() {
  const box = document.getElementById("storage-info");
  if (!box) return;
  let txt = `Dados: ${(new Blob([JSON.stringify(data)]).size / 1024).toFixed(0)} KB (limite do navegador ≈ 5 000 KB).`;
  try {
    const n = (await PhotoDB.all()).length;
    txt += ` Fotografias: ${n}.`;
    if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); txt += ` Espaço usado no total: ${(e.usage / 1048576).toFixed(1)} MB.`; }
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    txt += persisted ? " Armazenamento protegido contra limpeza automática." : ` <button type="button" class="link-btn" data-act="persist">Proteger contra limpeza automática</button>`;
  } catch (e) { }
  if (document.getElementById("storage-info")) box.innerHTML = txt;
}
ACT.persist = async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? "Armazenamento protegido." : "O navegador não concedeu a proteção. No iPhone, use a app a partir do ecrã principal."); storageInfo(); };

/* ================= Backup ================= */
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.rel = "noopener";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/** No telemóvel abre a folha de partilha (Guardar em Ficheiros, iCloud, Drive…); no PC descarrega. */
async function deliverFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; }
    catch (e) {
      if (e.name === "AbortError") return "cancel";
      return new Promise(res => {
        const l = openModal({ title: "Ficheiro pronto", small: true, body: `<p>${esc(name)}</p>`, footer: `<button type="button" class="btn ghost" data-act="dlg" data-v="dl">Descarregar</button><button type="button" class="btn primary" data-act="dlg" data-v="share">Partilhar / Guardar</button>`, onClose: () => res("cancel") });
        l.resolve = async v => {
          closeLayer(l);
          if (v === "share") { try { await navigator.share({ files: [file], title }); res("shared"); } catch (err) { res(err.name === "AbortError" ? "cancel" : (downloadBlob(blob, name), "downloaded")); } }
          else { downloadBlob(blob, name); res("downloaded"); }
        };
      });
    }
  }
  downloadBlob(blob, name);
  return "downloaded";
}
async function buildBackup(markDate) {
  let photos = [];
  try { photos = await PhotoDB.all(); } catch (e) { if (!(await confirmDialog("Não foi possível ler as fotografias. Fazer backup só dos dados?"))) return null; }
  const snap = JSON.parse(JSON.stringify(data));
  if (markDate) snap.settings.lastBackup = markDate.toISOString();
  return { app: "Jardim-app", version: APP_VERSION, schema: SCHEMA, exportedAt: new Date().toISOString(), data: snap, photos };
}
ACT["backup-export"] = async () => {
  const now = new Date(), payload = await buildBackup(now);
  if (!payload) return;
  const name = `backup_Jardim-app_${dayKey(now)}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  const r = await deliverFile(new Blob([JSON.stringify(payload)], { type: "application/json" }), name, "Backup Jardim-app");
  if (r === "cancel") return toast("Backup cancelado.");
  if (!storageLocked) { data.settings.lastBackup = now.toISOString(); save(); }
  closeAllModals(); render();
  toast(`Backup de ${fmtDT(now)} criado (${payload.photos.length} fotografias incluídas).`, 4500);
};
ACT["backup-import"] = () => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json"; inp.hidden = true; document.body.append(inp);
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; inp.remove();
    if (!f) return;
    let obj;
    try { obj = JSON.parse(await f.text()); } catch (e) { return toast("O ficheiro não é um backup válido."); }
    const incoming = obj && obj.app === "Jardim-app" && obj.data ? obj.data : obj;
    if (!incoming || !Array.isArray(incoming.clients) || !Array.isArray(incoming.jobs)) return toast("O ficheiro não tem a estrutura de um backup do Jardim-app.");
    let res;
    try { res = migrate(incoming); } catch (e) { return toast("Não foi possível converter o backup: " + e.message); }
    const extra = (Array.isArray(obj.photos) ? obj.photos : []).filter(p => p && okId(p.id) && typeof p.owner === "string" && typeof p.data === "string" && p.data.startsWith("data:image")).map(p => ({ id: p.id, owner: p.owner, data: p.data, date: p.date || new Date().toISOString() }));
    const photos = [...extra, ...res.photos];
    const when = obj.exportedAt || incoming.settings?.lastBackup;
    const msg = `Backup ${when ? `de ${fmtDT(when)}` : "sem data"}: ${res.data.clients.length} clientes, ${res.data.jobs.length} trabalhos, ${res.data.quotes.length} orçamentos, ${photos.length} fotografias.\n\nOs dados atuais deste dispositivo vão ser substituídos. Antes disso, é descarregada automaticamente uma cópia dos dados atuais.`;
    if (!(await confirmDialog(msg, { ok: "Restaurar", danger: true, title: "Restaurar backup" }))) return;
    try {
      if (storageLocked && recoveryRaw) downloadBlob(new Blob([recoveryRaw], { type: "application/json" }), `dados_originais_Jardim-app_${dayKey(new Date())}.json`);
      else if (data.clients.length || data.jobs.length) { const cur = await buildBackup(null); if (cur) downloadBlob(new Blob([JSON.stringify(cur)], { type: "application/json" }), `antes_do_restauro_Jardim-app_${dayKey(new Date())}.json`); }
    } catch (e) { if (!(await confirmDialog("Não foi possível guardar a cópia dos dados atuais. Continuar mesmo assim?", { danger: true }))) return; }
    try { await PhotoDB.clear(); if (photos.length) await PhotoDB.put(photos); }
    catch (e) { if (!(await confirmDialog(`Erro ao restaurar as fotografias (${e.message}). Restaurar só os dados?`, { danger: true }))) return; }
    const prev = data, prevLock = storageLocked;
    data = res.data; storageLocked = false;
    if (!save()) { data = prev; storageLocked = prevLock; return; }
    recoveryRaw = null;
    closeAllModals(); ui.route = "calendar"; render();
    toast("Backup restaurado.", 4000);
  }, { once: true });
  inp.click();
};
ACT["recovery-download"] = () => { if (recoveryRaw) downloadBlob(new Blob([recoveryRaw], { type: "application/json" }), `dados_originais_Jardim-app_${dayKey(new Date())}.json`); };
ACT["recovery-reset"] = async () => {
  if (!(await confirmDialog("Começar com dados vazios? Os dados ilegíveis serão apagados deste dispositivo. Descarregue-os primeiro se quiser guardá-los.", { ok: "Começar do zero", danger: true }))) return;
  storageLocked = false; recoveryRaw = null; data = emptyData();
  if (save()) { render(); toast("A app foi reiniciada com dados vazios."); }
};
function checkBackupReminder() {
  if (storageLocked || layers.length) return;
  const lb = toDate(data.settings.lastBackup), iv = Math.max(30, n0(data.settings.backupIntervalDays));
  if (!data.clients.length && !data.jobs.length) return;
  if (lb && (Date.now() - lb) / 864e5 < iv) return;
  try { if (sessionStorage.getItem("jardim-backup-reminder")) return; sessionStorage.setItem("jardim-backup-reminder", "1"); } catch (e) { }
  confirmDialog(lb ? `O último backup foi a ${fmtDate(lb)}. Está na altura de fazer uma nova cópia de segurança.` : "Ainda não fez nenhuma cópia de segurança. Se o telemóvel avariar ou for perdido, os dados só podem ser recuperados a partir de um backup.", { ok: "Fazer backup", cancel: "Mais tarde", title: "Cópia de segurança" }).then(ok => { if (ok) ACT["backup-export"](); });
}

/* ================= Exportação CSV ================= */
function csvCell(v) { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
const csvN = v => fmtNum(v, 2);
ACT.csv = d => {
  const now = dayKey(new Date());
  let rows, name;
  if (d.k === "jobs") {
    name = `trabalhos_${now}.csv`;
    rows = [["N.º trabalho", "N.º cliente", "Cliente", "Serviços", "Descrição", "Estado", "Tipo de preço", "Preço/hora", "Preço fixo", "Início", "Horas estimadas", "Horas realizadas", "Valor a cobrar", "Pago", "Em falta", "Custos reais", "Resultado"]];
    [...data.jobs].sort((a, b) => jobStartDate(a) - jobStartDate(b)).forEach(j => rows.push([j.number, client(j.clientId)?.number || "", clientName(j.clientId), serviceNames(j).join(", "), j.description, j.status, j.priceType === "fixed" ? "Fixo" : "À hora", csvN(j.hourlyRate), j.priceType === "fixed" ? csvN(j.price) : "", fmtDT(jobStartDate(j)), csvN(j.estimatedHours), csvN(workedHours(j.id)), csvN(jobCharge(j)), csvN(paidFor(j.id)), csvN(jobOutstanding(j)), csvN(internalCostTotal(j.id)), csvN(jobResult(j))]));
  } else if (d.k === "payments") {
    name = `pagamentos_${now}.csv`;
    rows = [["Data", "N.º trabalho", "N.º cliente", "Cliente", "Valor", "Forma de pagamento", "Notas"]];
    [...data.payments].sort((a, b) => toDate(a.date) - toDate(b.date)).forEach(p => { const j = job(p.jobId); rows.push([fmtDate(p.date), j?.number || "", client(j?.clientId)?.number || "", clientName(j?.clientId), csvN(p.amount), p.method, p.notes]); });
  } else if (d.k === "costs") {
    name = `custos_${now}.csv`;
    rows = [["Data", "Categoria", "Descrição", "Custo", "Imputado ao cliente", "Margem %", "Valor ao cliente", "N.º trabalho", "Cliente", "Equipamento"]];
    [...data.costs].sort((a, b) => toDate(a.date) - toDate(b.date)).forEach(c => rows.push([fmtDate(c.date), c.category, c.description, csvN(c.amount), c.chargeable ? "Sim" : "Não", c.chargeable ? csvN(c.margin) : "", c.chargeable ? csvN(costClientValue(c)) : "", job(c.jobId)?.number || "", c.clientId ? clientName(c.clientId) : (job(c.jobId) ? clientName(job(c.jobId).clientId) : ""), equip(c.equipmentId)?.type || ""]));
  } else {
    name = `clientes_${now}.csv`;
    rows = [["N.º cliente", "Nome", "Empresa", "NIF", "Telefone", "Email", "Morada", "Código postal", "Localidade", "Em dívida"]];
    data.clients.forEach(c => rows.push([c.number, c.name, c.company, c.nif, c.phone, c.email, c.address, c.postal, c.local, csvN(clientDue(c.id))]));
  }
  const csv = "\ufeff" + rows.map(r => r.map(csvCell).join(";")).join("\r\n");
  deliverFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), name, name).then(r => { if (r !== "cancel") toast(`${name} exportado.`); });
};

/* ================= Documentos (orçamento, nota de serviços, extrato) ================= */
function companyBlock() {
  const s = data.settings;
  return `<div class="doc-company">${s.logo ? `<img class="doc-logo" src="${s.logo}" alt="">` : ""}<div><b>${esc(s.companyName || s.legalName || "")}</b>${s.legalName && s.companyName && s.legalName !== s.companyName ? `<div>${esc(s.legalName)}</div>` : ""}${s.nif ? `<div>NIF ${esc(s.nif)}</div>` : ""}${[s.address, s.postal, s.local].some(Boolean) ? `<div>${esc([s.address, [s.postal, s.local].filter(Boolean).join(" ")].filter(Boolean).join(", "))}</div>` : ""}${s.phone || s.email ? `<div>${esc([s.phone, s.email].filter(Boolean).join(" · "))}</div>` : ""}</div></div>`;
}
function docHead(title, metaRows) { return `<header class="doc-head">${companyBlock()}<div class="doc-meta"><h1>${esc(title)}</h1>${metaRows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></header>`; }
function openDoc(title, html) {
  const root = document.getElementById("doc-root");
  root.innerHTML = `<div class="doc-toolbar"><button type="button" class="btn ghost" data-act="doc-close">${ico("back")}Fechar</button><span class="sp"></span><button type="button" class="btn primary" data-act="doc-print">Imprimir / Guardar PDF</button></div><div class="doc-scroll"><article class="doc-page">${html}${data.settings.docNote ? `<footer class="doc-foot">${esc(data.settings.docNote)}</footer>` : ""}</article><p class="doc-hint">Para obter o PDF, toque em "Imprimir / Guardar PDF". No PC e Android escolha "Guardar como PDF". No iPhone, na pré-visualização de impressão, use o botão Partilhar para guardar ou enviar o PDF.</p></div>`;
  root.hidden = false;
  document.body.classList.add("has-doc");
  document.title = title;
  root.scrollTop = 0;
}
ACT["doc-close"] = () => { const r = document.getElementById("doc-root"); r.hidden = true; r.innerHTML = ""; document.body.classList.remove("has-doc"); document.title = "Jardim-app"; };
ACT["doc-print"] = () => window.print();
function photoBlock(title, recs) { return recs.length ? `<section class="doc-sec"><h2>${esc(title)}</h2><div class="doc-photos">${recs.map(r => `<figure><img src="${r.data}" alt=""><figcaption>${fmtDate(r.date)}</figcaption></figure>`).join("")}</div></section>` : ""; }
function clientDocBlock(c, opts = {}) {
  if (!c) return "";
  const addr = [c.address, [c.postal, c.local].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `<section class="doc-sec doc-client"><h2>Cliente</h2><p><b>${esc(c.name)}</b> <span class="muted">(${esc(c.number)})</span>${c.company ? `<br>${esc(c.company)}` : ""}${(opts.nif ?? true) && c.nif ? `<br>NIF ${esc(c.nif)}` : ""}${(opts.address ?? true) && addr ? `<br>${esc(addr)}` : ""}${(opts.contacts ?? true) && (c.phone || c.email) ? `<br>${esc([c.phone, c.email].filter(Boolean).join(" · "))}` : ""}</p></section>`;
}

ACT["quote-pdf"] = async d => {
  const q = quote(d.id);
  if (!q) return;
  let photos = [];
  try { photos = await PhotoDB.list("quote:" + q.id); } catch (e) { }
  const c = client(q.clientId), l = quoteLabor(q), m = quoteMaterials(q), S = data.settings;
  const per = q.frequency !== "Pontual" ? ` por intervenção (${q.frequency.toLowerCase()})` : "";
  const html = `${docHead("Orçamento", [["N.º", q.number], ["Versão", String(q.version)], ["Data", fmtDate(q.date)], ["Válido até", fmtDate(quoteExpiry(q))]])}
    ${clientDocBlock(c)}
    <section class="doc-sec"><h2>Trabalhos propostos</h2><p><b>${esc(q.services.join(", "))}</b></p>${q.description ? `<p>${escBr(q.description)}</p>` : ""}${q.frequency !== "Pontual" ? `<p>Periodicidade: ${esc(q.frequency)}</p>` : ""}</section>
    <section class="doc-sec"><table class="doc-table"><thead><tr><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody><tr><td>Serviço${q.services.length ? ` — ${esc(q.services.join(", "))}` : ""}</td><td class="num">${money(l)}</td></tr>${(q.materials || []).map(x => `<tr><td>${esc(x.description || "Material")}</td><td class="num">${money(matClient(x))}</td></tr>`).join("")}</tbody><tfoot>${m ? `<tr><td>Total materiais</td><td class="num">${money(m)}</td></tr>` : ""}<tr class="grand"><td>Total${per}</td><td class="num">${money(l + m)}</td></tr></tfoot></table></section>
    ${q.notes ? `<section class="doc-sec"><h2>Notas e condições</h2><p>${escBr(q.notes)}</p></section>` : ""}
    ${photoBlock("Estado do local", photos)}
    ${S.iban ? `<p class="doc-small">Pagamento por transferência: IBAN ${esc(S.iban)}</p>` : ""}
    <section class="doc-sign"><div><span>O prestador</span></div><div><span>Aceito o orçamento (cliente) e data</span></div></section>`;
  openDoc(`Orcamento ${q.number.replace("/", "-")} ${c?.name || ""}`.trim(), html);
};

const NOTE_FIELDS = [["clientAddress", "Morada do cliente", true], ["clientContacts", "Contactos do cliente", false], ["clientNif", "NIF do cliente", true], ["dates", "Datas de execução", true], ["sessions", "Detalhe de horas (entradas e saídas)", false], ["description", "Descrição", true], ["hours", "Total de horas", true], ["rate", "Preço/hora", true], ["materials", "Materiais", true], ["payments", "Pagamentos e valor em falta", true], ["notes", "Notas", false]];
ACT["doc-job"] = d => {
  const j = job(d.id);
  if (!j) return;
  openModal({
    title: `Nota de serviços · ${j.number}`, wide: true,
    body: `<p class="muted">Escolha a informação a incluir. Este documento descreve os trabalhos e valores; não é uma fatura.</p><div class="checks two">${NOTE_FIELDS.map(([k, l, def]) => `<label class="chk"><input type="checkbox" id="nf-${k}"${def ? " checked" : ""}><span>${l}</span></label>`).join("")}</div><div class="section-head"><h4>Fotografias a incluir</h4><button type="button" class="link-btn" data-act="nf-all">Selecionar todas</button></div><div class="photo-grid select" id="nf-photos"><p class="muted small">A carregar…</p></div>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="nf-gen" data-id="${j.id}">Gerar documento</button>`,
    onMount: async () => {
      try {
        const recs = await PhotoDB.list("job:" + j.id), box = document.getElementById("nf-photos");
        if (box) box.innerHTML = recs.length ? recs.map(r => `<label class="ph pick"><input type="checkbox" name="nf-ph" value="${esc(r.id)}"><img src="${r.data}" alt=""><span>${fmtDate(r.date)}</span></label>`).join("") : `<p class="muted small">Este trabalho não tem fotografias.</p>`;
      } catch (e) { }
    }
  });
};
ACT["nf-all"] = () => $$('input[name="nf-ph"]').forEach(x => x.checked = true);
ACT["nf-gen"] = async d => {
  const j = job(d.id), c = client(j.clientId), on = k => !!document.getElementById("nf-" + k)?.checked;
  const sel = checkedValues("nf-ph");
  let photos = [];
  if (sel.length) { try { photos = (await PhotoDB.list("job:" + j.id)).filter(r => sel.includes(r.id)); } catch (e) { } }
  const wh = workedHours(j.id), lab = laborValue(j), mats = jobCosts(j.id).filter(x => x.chargeable), ch = jobCharge(j), pd = paidFor(j.id), out = jobOutstanding(j);
  const ses = jobSessions(j.id), S = data.settings;
  const dates = [...new Set((ses.length ? ses.map(s => s.start) : j.parts.filter(p => p.state !== "Cancelado").map(p => p.start)).map(fmtDate))];
  const html = `${docHead("Nota de serviços", [["Trabalho", j.number], ["Data", fmtDate(new Date())], ["Estado", j.status]])}
    ${clientDocBlock(c, { address: on("clientAddress"), contacts: on("clientContacts"), nif: on("clientNif") })}
    <section class="doc-sec"><h2>Trabalhos realizados</h2><p><b>${esc(serviceNames(j).join(", "))}</b></p>${on("description") && j.description ? `<p>${escBr(j.description)}</p>` : ""}${on("dates") ? `<p>${dates.length > 1 ? "Datas" : "Data"}: ${dates.join(", ")}</p>` : ""}</section>
    ${on("sessions") && ses.length ? `<section class="doc-sec"><h2>Registo de horas</h2><table class="doc-table"><thead><tr><th>Data</th><th>Entrada</th><th>Saída</th><th class="num">Horas</th></tr></thead><tbody>${ses.map(s => `<tr><td>${fmtDate(s.start)}</td><td>${fmtTime(s.start)}</td><td>${s.end ? fmtTime(s.end) : "—"}</td><td class="num">${fmtH(sessionHours(s))}</td></tr>`).join("")}</tbody></table></section>` : ""}
    <section class="doc-sec"><h2>Valores</h2><table class="doc-table"><tbody>
      <tr><td>Mão de obra${j.priceType === "hourly" ? `${on("hours") ? ` — ${fmtH(wh > 0 ? wh : j.estimatedHours)}` : ""}${on("rate") ? ` × ${money(j.hourlyRate)}/h` : ""}${n0(j.minCharge) && lab <= n0(j.minCharge) + 0.005 ? " (valor mínimo)" : ""}` : `${on("hours") && wh > 0 ? ` — ${fmtH(wh)}` : ""} (valor acordado)`}</td><td class="num">${money(lab)}</td></tr>
      ${on("materials") ? mats.map(x => `<tr><td>${esc(x.description || x.category)}</td><td class="num">${money(costClientValue(x))}</td></tr>`).join("") : (mats.length ? `<tr><td>Materiais</td><td class="num">${money(sum(mats, costClientValue))}</td></tr>` : "")}
    </tbody><tfoot><tr class="grand"><td>Total</td><td class="num">${money(ch)}</td></tr>${on("payments") ? `${pd ? `<tr><td>Pago</td><td class="num">${money(pd)}</td></tr>` : ""}<tr><td>${out > 0.005 ? "Valor em falta" : "Situação"}</td><td class="num">${out > 0.005 ? money(out) : "Pago"}</td></tr>` : ""}</tfoot></table></section>
    ${on("notes") && j.notes ? `<section class="doc-sec"><h2>Notas</h2><p>${escBr(j.notes)}</p></section>` : ""}
    ${photoBlock("Fotografias", photos)}
    ${S.iban && out > 0.005 ? `<p class="doc-small">Pagamento por transferência: IBAN ${esc(S.iban)}</p>` : ""}`;
  closeModal();
  openDoc(`Nota de servicos ${j.number.replace("#", "")} ${c?.name || ""}`.trim(), html);
};

ACT["doc-statement"] = d => {
  const t = new Date();
  openModal({
    title: "Extrato do cliente", small: true,
    body: `<div class="form-grid">${fDate("De", "st-from", new Date(t.getFullYear(), t.getMonth(), 1), { mode: "date" })}${fDate("Até", "st-to", t, { mode: "date" })}<div class="full">${fToggle("Mostrar só trabalhos com valores em falta", "st-due", false)}</div></div><p class="muted small">Útil para clientes que pagam ao mês: lista os trabalhos do período, os pagamentos e o saldo.</p>`,
    footer: `${btn("Cancelar", "close-modal")}<button type="button" class="btn primary" data-act="st-gen" data-id="${d.id}">Gerar extrato</button>`
  });
};
ACT["st-gen"] = d => {
  const c = client(d.id), from = readDate("st-from"), to = readDate("st-to");
  if (!from || !to || to < from) return toast("Verifique o período.");
  const R = { from: startOfDay(from), to: endOfDay(to) }, onlyDue = $("#st-due")?.checked;
  let jobs = data.jobs.filter(j => j.clientId === c.id && j.status !== "Cancelado" && isWorked(j) && inRange(jobStartDate(j), R)).sort((a, b) => jobStartDate(a) - jobStartDate(b));
  if (onlyDue) jobs = jobs.filter(j => jobDue(j) > 0.005);
  const pays = data.payments.filter(p => job(p.jobId)?.clientId === c.id && inRange(p.date, R)).sort((a, b) => toDate(a.date) - toDate(b.date));
  const html = `${docHead("Extrato", [["Período", `${fmtDate(R.from)} a ${fmtDate(R.to)}`], ["Data", fmtDate(new Date())]])}${clientDocBlock(c)}
    <section class="doc-sec"><h2>Trabalhos</h2>${jobs.length ? `<table class="doc-table"><thead><tr><th>Data</th><th>Trabalho</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Em falta</th></tr></thead><tbody>${jobs.map(j => `<tr><td>${fmtDate(jobStartDate(j))}</td><td>${esc(j.number)} ${esc(serviceNames(j).join(", "))}</td><td class="num">${money(jobCharge(j))}</td><td class="num">${money(paidFor(j.id))}</td><td class="num">${money(jobDue(j))}</td></tr>`).join("")}</tbody><tfoot><tr class="grand"><td colspan="2">Total do período</td><td class="num">${money(sum(jobs, jobCharge))}</td><td class="num">${money(sum(jobs, j => paidFor(j.id)))}</td><td class="num">${money(sum(jobs, jobDue))}</td></tr></tfoot></table>` : `<p>Sem trabalhos no período.</p>`}</section>
    ${pays.length ? `<section class="doc-sec"><h2>Pagamentos recebidos no período</h2><table class="doc-table"><tbody>${pays.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${esc(job(p.jobId)?.number || "")} · ${esc(p.method)}</td><td class="num">${money(p.amount)}</td></tr>`).join("")}</tbody></table></section>` : ""}
    <section class="doc-sec"><table class="doc-table"><tfoot><tr class="grand"><td>Saldo total em dívida (todos os períodos)</td><td class="num">${money(clientDue(c.id))}</td></tr></tfoot></table></section>
    ${data.settings.iban ? `<p class="doc-small">Pagamento por transferência: IBAN ${esc(data.settings.iban)}</p>` : ""}`;
  closeModal();
  openDoc(`Extrato ${c.number} ${c.name} ${dayKey(R.from)}`, html);
};

/* ================= Arranque ================= */
async function init() {
  fitViewport();
  const res = loadData();
  data = res.data;
  if (res.photos?.length) {
    try { await PhotoDB.put(res.photos); }
    catch (e) { storageLocked = true; recoveryRaw = localStorage.getItem(KEY); toast("Não foi possível mover as fotografias para o novo armazenamento. Nada foi alterado.", 6000); }
  }
  if (!storageLocked && (res.migrated || res.photos?.length)) { if (save()) toast(`Dados atualizados para a ${APP_VERSION}.`); }
  document.querySelectorAll(".bottom-nav button").forEach(b => b.addEventListener("click", () => { ui.route = b.dataset.route; if (b.dataset.route === "more") ui.more = null; closeAllModals(); render(); window.scrollTo(0, 0); }));
  document.getElementById("backup-btn").addEventListener("click", () => ACT["backup-export"]());
  render();
  if (res.error) toast(res.error, 6000);
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); if (!layers.length) render(); } });
  setTimeout(checkBackupReminder, 1500);
  if (navigator.storage?.persist) navigator.storage.persisted?.().then(p => { if (!p) navigator.storage.persist().catch(() => { }); }).catch(() => { });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("./sw.js").then(r => r.update?.()).catch(() => { });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      if (hasOpenForm()) toast("Nova versão instalada. Feche e volte a abrir a app para a usar.", 6000);
      else location.reload();
    });
  }
}
init();

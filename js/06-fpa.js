/* ============================================================
   gestordestock — 06-fpa.js
   PLAN FP&A (presupuesto por mes × línea) — importación y agregados
   ------------------------------------------------------------
   Objetivo: dejar de conciliar a mano entre el Excel de FP&A y la app.
   El plan se importa desde .xlsx/.xls/.csv con una plantilla fija
   (se descarga desde la app), se guarda VERSIONADO dentro del estado
   (db.fpa, sincroniza como todo lo demás) y se compara contra ventas,
   compras y stock reales usando la misma capa de 05-metrics.js.

   Columnas (encabezados en EN o ES, sin importar mayúsculas/acentos):
     Mes | Línea | Idioma (opcional) | Ventas plan | Margen % plan |
     Compras plan | Stock objetivo
   · Mes: 2026-01, 01/2026, ene-2026, Jan 2026 o fecha de Excel.
   · Línea: se normaliza con el mismo canon que el resto de la app
     ("One Piece Card Game" == "One Piece TCG").
   · Margen %: 33, 33% o 0,33 (todo es 33%).
   · Ventas plan = ingreso neto (productos + envío + cargos cobrados),
     el mismo concepto que el P&L.
   · Stock objetivo = stock a costo FIFO esperado al CIERRE de ese mes.
   ============================================================ */

function fpaVersions(){ return (db.fpa && Array.isArray(db.fpa.versions)) ? db.fpa.versions : []; }
function fpaVigente(){
  const vs = fpaVersions(); if(!vs.length) return null;
  return vs.find(v=> v.id===db.fpa.vigente) || vs[vs.length-1];
}
function fpaNorm(s){ return String(s==null?"":s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9%]+/g," ").trim(); }

/* ---------- Encabezados tolerantes (EN / ES) ---------- */
const FPA_COLS = {
  mes:       ["mes","month","periodo","period","fecha","date"],
  linea:     ["linea","line","saga","juego","game","categoria","category"],
  idioma:    ["idioma","language","lang"],
  ventas:    ["ventas plan","ventas","sales plan","sales","revenue plan","revenue","ingreso neto plan","net revenue plan"],
  unidades:  ["unidades plan","unidades","units plan","units","cantidad plan","cantidad","qty plan","qty"],   // v89: opcional → precio plan = ventas / unidades
  margen:    ["margen % plan","margen plan","margen %","margen","margin % plan","margin plan","margin %","margin","gm %","gm"],
  compras:   ["compras plan","compras","purchases plan","purchases"],
  stock:     ["stock objetivo","stock plan","stock","target stock","stock target","inventory target"]
};
function fpaHeaderMap(headerRow){
  const map = {};
  const hs = (headerRow||[]).map(fpaNorm);
  Object.keys(FPA_COLS).forEach(k=>{
    // primero coincidencia exacta con el alias más específico, después "empieza con"
    for(const alias of FPA_COLS[k]){
      const a = fpaNorm(alias);
      let i = hs.findIndex((h,idx)=> h===a && !Object.values(map).includes(idx));
      if(i<0) i = hs.findIndex((h,idx)=> h.startsWith(a) && !Object.values(map).includes(idx));
      if(i>=0){ map[k]=i; break; }
    }
  });
  return map;
}

/* ---------- Mes ---------- */
const FPA_MON = {jan:1,ene:1,feb:2,mar:3,apr:4,abr:4,may:5,jun:6,jul:7,aug:8,ago:8,sep:9,set:9,oct:10,nov:11,dec:12,dic:12};
function fpaMonth(v){
  if(v==null || v==="") return "";
  if(typeof v==="number" && v>20000 && v<80000){           // fecha serial de Excel
    const d = new Date(Math.round((v-25569)*86400000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
  }
  if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}`;
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?/);           // 2026-01 / 2026-01-31
  if(m && +m[2]>=1 && +m[2]<=12) return `${m[1]}-${String(+m[2]).padStart(2,"0")}`;
  m = s.match(/^(\d{1,2})[-\/.](\d{4})$/);                                 // 01/2026
  if(m && +m[1]>=1 && +m[1]<=12) return `${m[2]}-${String(+m[1]).padStart(2,"0")}`;
  m = s.match(/^([a-záéíóú]{3,})[\s\-\/.]*(\d{2,4})$/);                    // ene-2026 / Jan 2026
  if(m){ const mo = FPA_MON[fpaNorm(m[1]).slice(0,3)]; if(mo){ const y = m[2].length===2 ? "20"+m[2] : m[2]; return `${y}-${String(mo).padStart(2,"0")}`; } }
  return "";
}

/* ---------- Línea (mismo canon que sagaDe) ---------- */
function fpaLinea(v){
  const raw = String(v==null?"":v).trim();
  if(!raw) return { linea:"", known:false };
  for(const s of SAGA_CANON){ if(s.re.test(raw)) return { linea:s.canon, known:true }; }
  const hit = sagasUnicas().find(x=> fpaNorm(x)===fpaNorm(raw));
  return hit ? { linea:hit, known:true } : { linea:raw, known:false };
}
function fpaIdioma(v){
  const n = fpaNorm(v); if(!n) return "";
  if(/^(jp|jap|japanese|japones)/.test(n)) return "JP";
  if(/^(es|esp|sp|spanish|espanol|castellano)/.test(n)) return "ESP";
  if(/^(kor|kr|cor|korean|coreano)\b/.test(n)) return "KOR";
  if(/^(en|eng|ing|english|ingles)\b/.test(n)) return "EN";
  return "?";
}
function fpaNum(v){ if(v==null || v==="") return null; if(typeof v==="number") return v; const n = parseNum(v); return isNaN(n) ? null : n; }
function fpaPct(v){
  if(v==null || v==="") return null;
  if(typeof v==="number") return v>1.5 ? v/100 : v;                        // 33 -> 0,33 · 0,33 queda
  const s = String(v), n = parseNum(s);
  if(s.includes("%")) return n/100;
  return n>1.5 ? n/100 : n;
}

/* ============================================================
   PARSER: array de filas (aoa) -> { rows, errors, unknownLines, months }
   ============================================================ */
function fpaParseAoa(aoa){
  const out = { rows:[], errors:[], unknownLines:[], months:[], lines:[], missingCols:[] };
  const hi = (aoa||[]).findIndex(r=> (r||[]).some(c=> String(c||"").trim()!==""));
  if(hi<0){ out.errors.push({ row:0, msg:t("fpa.err.empty") }); return out; }
  const map = fpaHeaderMap(aoa[hi]);
  ["mes","linea","ventas"].forEach(k=>{ if(map[k]==null) out.missingCols.push(k); });
  if(out.missingCols.length){ out.errors.push({ row:hi+1, msg:t("fpa.err.cols",{cols:out.missingCols.map(k=>t("fpa.col."+k)).join(", ")}) }); return out; }
  const unknown = new Set(), months = new Set(), lines = new Set(), seen = {};
  for(let i=hi+1;i<aoa.length;i++){
    const r = aoa[i]||[];
    if(!r.some(c=> String(c==null?"":c).trim()!=="")) continue;             // fila vacía
    const mes = fpaMonth(r[map.mes]);
    const L = fpaLinea(r[map.linea]);
    const idioma = map.idioma!=null ? fpaIdioma(r[map.idioma]) : "";
    const ventas = fpaNum(r[map.ventas]);
    if(!mes){ out.errors.push({ row:i+1, msg:t("fpa.err.month",{v:String(r[map.mes]==null?"":r[map.mes])}) }); continue; }
    if(!L.linea){ out.errors.push({ row:i+1, msg:t("fpa.err.line") }); continue; }
    if(idioma==="?"){ out.errors.push({ row:i+1, msg:t("fpa.err.lang",{v:String(r[map.idioma])}) }); continue; }
    if(ventas==null) continue;                                              // sin plan ese mes/juego: se saltea (la plantilla lo permite)
    const key = mes+"|"+L.linea+"|"+idioma;
    if(seen[key]){ out.errors.push({ row:i+1, msg:t("fpa.err.dup",{row:seen[key]}) }); continue; }
    seen[key] = i+1;
    if(!L.known) unknown.add(L.linea);
    months.add(mes); lines.add(L.linea);
    out.rows.push({ mes, linea:L.linea, idioma,
      ventas: round2(ventas),
      margenPct: map.margen!=null ? fpaPct(r[map.margen]) : null,
      unidades: map.unidades!=null ? fpaNum(r[map.unidades]) : null,
      compras: map.compras!=null ? fpaNum(r[map.compras]) : null,
      stockObj: map.stock!=null ? fpaNum(r[map.stock]) : null });
  }
  out.unknownLines = [...unknown].sort();
  out.months = [...months].sort();
  out.lines = [...lines].sort();
  return out;
}

/* ============================================================
   AGREGADOS del plan para un período y un corte.
   Margen % del plan = Σ(ventas × margen%) / Σ(ventas con margen): razón de sumas.
   Stock objetivo = el del ÚLTIMO mes del período que tenga dato, por línea.
   ============================================================ */
/* ============================================================
   PLAN "A LA FECHA" (v87)
   ------------------------------------------------------------
   Antes el plan se filtraba por MES entero: con el mes en curso, se
   comparaban 23 días reales contra el plan de 30 y el faltante salía
   como "desvío" (y los meses futuros de "Todo" contaban plan sin real).
   Ahora, para comparar real vs plan (opts.alaFecha), cada mes pesa por
   la fracción de días que el período realmente cubre, con tope en HOY:
     plan a la fecha = plan del mes × días cubiertos / días del mes.
   La proyección de cierre y el semáforo del mes siguen usando el plan
   del mes COMPLETO (ahí la pregunta es "¿a fin de mes llego?").
   ============================================================ */
function fpaHoyIso(){ return finIso(finAnchor()); }
function fpaDiasEntre(a, b){ return Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00"))/864e5) + 1; }
/* Qué parte del mes mk cae dentro de [fromIso, toIso]. Devuelve {frac, dias, dim}. */
function fpaCoberturaMes(mk, fromIso, toIso){
  const [y,m] = mk.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  const ms = mk+"-01", me = mk+"-"+String(dim).padStart(2,"0");
  const a = (fromIso && fromIso>ms) ? fromIso : ms;
  const b = (toIso && toIso<me) ? toIso : me;
  if(b < a) return { frac:0, dias:0, dim };
  const dias = Math.min(dim, fpaDiasEntre(a, b));
  return { frac: dias/dim, dias, dim };
}
function fpaRowsFor(ver, r, d, opts){
  if(!ver) return [];
  d = d || {}; opts = opts || {};
  let fromIso = r && r.from ? r.from : "", toIso = r && r.to ? r.to : "";
  if(opts.alaFecha){ const hoy = fpaHoyIso(); if(!toIso || toIso > hoy) toIso = hoy; }
  const from = fromIso.slice(0,7), to = toIso.slice(0,7);
  const out = [];
  (ver.filas||[]).forEach(x=>{
    if(from && x.mes<from) return;
    if(to && x.mes>to) return;
    if(d.linea && x.linea!==d.linea) return;
    if(d.idioma && x.idioma!==d.idioma) return;
    if(!opts.alaFecha){ out.push(x); return; }
    const c = fpaCoberturaMes(x.mes, fromIso, toIso);
    if(c.frac<=0) return;
    if(c.frac>=1){ out.push(x); return; }
    // copia prorrateada: ventas/compras son flujos del mes; el stock objetivo es un saldo y no se prorratea
    out.push(Object.assign({}, x, {
      ventas: x.ventas!=null ? x.ventas*c.frac : x.ventas,
      compras: x.compras!=null ? x.compras*c.frac : x.compras,
      unidades: x.unidades!=null ? x.unidades*c.frac : x.unidades,
      _frac:c.frac, _dias:c.dias, _dim:c.dim
    }));
  });
  return out;
}
function fpaHasIdioma(ver){ return !!(ver && (ver.filas||[]).some(x=> x.idioma)); }
function fpaAggregate(rows){
  const A = { ventas:0, compras:0, comprasAny:false, margenW:0, margenBase:0, stockObj:0, stockAny:false, months:new Set(), byLinea:{}, byMonth:{},
              unidades:0, unidadesAny:false, ventasConU:0 };
  const lastStock = {};   // linea -> {mes, valor por idioma}
  (rows||[]).forEach(x=>{
    A.ventas += x.ventas||0; A.months.add(x.mes);
    if(x.compras!=null){ A.compras += x.compras; A.comprasAny = true; }
    if(x.margenPct!=null){ A.margenW += (x.ventas||0)*x.margenPct; A.margenBase += (x.ventas||0); }
    const e = A.byLinea[x.linea] = A.byLinea[x.linea] || { ventas:0, compras:0, comprasAny:false, margenW:0, margenBase:0, stockObj:null, unidades:0, unidadesAny:false, ventasConU:0 };
    e.ventas += x.ventas||0;
    if(x.unidades!=null && x.unidades>0){ e.unidades += x.unidades; e.unidadesAny = true; e.ventasConU += x.ventas||0; A.unidades += x.unidades; A.unidadesAny = true; A.ventasConU += x.ventas||0; }
    if(x.compras!=null){ e.compras += x.compras; e.comprasAny = true; }
    if(x.margenPct!=null){ e.margenW += (x.ventas||0)*x.margenPct; e.margenBase += (x.ventas||0); }
    const mm = A.byMonth[x.mes] = A.byMonth[x.mes] || { ventas:0, compras:0, stockObj:0, stockAny:false };
    mm.ventas += x.ventas||0; if(x.compras!=null) mm.compras += x.compras;
    if(x.stockObj!=null){ mm.stockObj += x.stockObj; mm.stockAny = true; }
    if(x.stockObj!=null){
      const ls = lastStock[x.linea];
      if(!ls || x.mes>ls.mes) lastStock[x.linea] = { mes:x.mes, v:x.stockObj };
      else if(x.mes===ls.mes) ls.v += x.stockObj;                        // mismo mes, otro idioma
    }
  });
  Object.keys(lastStock).forEach(l=>{ A.byLinea[l].stockObj = lastStock[l].v; A.stockObj += lastStock[l].v; A.stockAny = true; });
  A.margenPct = A.margenBase>0 ? A.margenW/A.margenBase : null;
  Object.values(A.byLinea).forEach(e=> e.margenPct = e.margenBase>0 ? e.margenW/e.margenBase : null);
  A.ventas = round2(A.ventas); A.compras = round2(A.compras); A.stockObj = round2(A.stockObj);
  return A;
}
/* Plan del período con los filtros compartidos (null si no hay plan vigente). */
/* Plan del período con los filtros compartidos, A LA FECHA (v87).
   `parcial` lista los meses que entraron prorrateados: {mes, dias, dim}. */
function fpaForQuery(q){
  const ver = fpaVigente(); if(!ver) return null;
  const rows = fpaRowsFor(ver, { from:q.from, to:q.to }, { linea:q.linea, idioma:q.idioma }, { alaFecha:true });
  const pm = {};
  rows.forEach(x=>{ if(x._frac!=null) pm[x.mes] = { mes:x.mes, dias:x._dias, dim:x._dim }; });
  return { ver, rows, A:fpaAggregate(rows), parcial:Object.values(pm) };
}
/* Texto corto para avisar que un mes del plan está prorrateado: "Sep 26: 23 de 30 días". */
function fpaParcialTxt(parcial){
  return (parcial||[]).map(p=> t("plan.partial.item",{m:finMonthLabel(p.mes), d:p.dias, n:p.dim})).join(", ");
}

/* ============================================================
   PLANTILLA descargable (v82): SOLO 3 columnas — Mes | Juego | Ventas plan.
   Lo demás (stock necesario, cuánto comprar, cierre estimado) lo calcula
   la app. El parser sigue aceptando las columnas opcionales viejas
   (margen, compras, stock objetivo, idioma) para no romper planes ya
   importados, pero la plantilla ya no las pide.
   ============================================================ */
function fpaDownloadTemplate(){
  if(!window.XLSX){ toast(t("pnl.tt.noxlsx"),"warn"); return; }
  const y = finAnchor().getFullYear();
  const hdr = [t("fpa.col.mes"), t("fpa.col.linea"), t("fpa.col.ventas"), t("fpa.col.unidades")];   // v89: unidades opcional
  const lines = sagasUnicas(); if(!lines.length) lines.push("Pokémon TCG");
  const aoa = [hdr];
  for(let m=1;m<=12;m++) lines.forEach(l=> aoa.push([`${y}-${String(m).padStart(2,"0")}`, l, "", ""]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{wch:10},{wch:24},{wch:16},{wch:16}];
  const help = XLSX.utils.aoa_to_sheet([[t("fpa.tpl.h1")],[""],[t("fpa.tpl.l1")],[t("fpa.tpl.l2")],[t("fpa.tpl.l4")],[t("fpa.tpl.lunits")],[""],[t("fpa.tpl.l7")]]);
  help["!cols"] = [{wch:110}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plan");
  XLSX.utils.book_append_sheet(wb, help, t("fpa.tpl.sheet"));
  XLSX.writeFile(wb, `Plan_ventas_${y}.xlsx`);
}

/* ============================================================
   IMPORTACIÓN: archivo -> vista previa -> versión nueva (vigente)
   ============================================================ */
function fpaPickFile(){
  if(!isAdmin()){ toast(t("fpa.err.admin"),"warn"); return; }
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".xlsx,.xls,.csv";
  inp.onchange = ()=>{ const f = inp.files && inp.files[0]; if(f) fpaReadFile(f); };
  inp.click();
}
function fpaReadFile(file){
  if(!window.XLSX){ toast(t("pnl.tt.noxlsx"),"warn"); return; }
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      const wb = XLSX.read(new Uint8Array(fr.result), { type:"array", cellDates:false });
      // Hoja "Plan" si existe; si no, la primera
      const sn = wb.SheetNames.find(n=> fpaNorm(n)==="plan") || wb.SheetNames[0];
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header:1, raw:true, defval:"" });
      fpaPreview(file.name, fpaParseAoa(aoa));
    }catch(e){ console.warn(e); toast(t("fpa.err.read",{msg:(e&&e.message)||e}),"warn"); }
  };
  fr.readAsArrayBuffer(file);
}
function fpaPreview(fname, parsed){
  const ok = parsed.rows.length>0;
  const errList = parsed.errors.slice(0,12).map(e=>`<li>${e.row?t("fpa.row",{n:e.row})+": ":""}${esc(e.msg)}</li>`).join("")
                + (parsed.errors.length>12 ? `<li>${t("fpa.moreerrors",{n:parsed.errors.length-12})}</li>` : "");
  /* Vista previa como matriz mes × juego (antes: primeras 8 filas, que con
     meses en 0 al principio no mostraban nada útil). */
  const pvMonths = parsed.months, pvLines = parsed.lines, cell = {};
  parsed.rows.forEach(x=>{ const k = x.mes+"|"+x.linea; cell[k] = (cell[k]||0) + (x.ventas||0); });
  const fmtC = v=> v>0 ? moneyRound(v) : "—";
  const colTot = pvLines.map(l=> pvMonths.reduce((a,m)=> a+(cell[m+"|"+l]||0), 0));
  const sample = pvMonths.map(m=>{
    const vals = pvLines.map(l=> cell[m+"|"+l]||0), tot = vals.reduce((a,v)=>a+v,0);
    return `<tr><td style="white-space:nowrap">${esc(finMonthLabel(m))}</td>${vals.map(v=>`<td class="num">${fmtC(v)}</td>`).join("")}<td class="num"><b>${fmtC(tot)}</b></td></tr>`;
  }).join("");
  const sampleHead = `<tr><th>${t("fin.th.month")}</th>${pvLines.map(l=>`<th class="r">${esc(l)}</th>`).join("")}<th class="r">${t("common.total")}</th></tr>`;
  const sampleFoot = `<tr><td>${t("common.total")}</td>${colTot.map(v=>`<td class="num">${fmtC(v)}</td>`).join("")}<td class="num"><b>${fmtC(colTot.reduce((a,v)=>a+v,0))}</b></td></tr>`;
  const defName = String(fname||"plan").replace(/\.(xlsx|xls|csv)$/i,"");
  const body = `
    <p class="hint" style="margin:0 0 12px">${ok ? t("fpa.pv.summary",{rows:parsed.rows.length, months:parsed.months.length, lines:parsed.lines.length, file:esc(fname)}) : t("fpa.pv.nothing")}</p>
    ${parsed.unknownLines.length ? `<div class="banner warn" style="margin-bottom:12px">${t("fpa.pv.unknown",{list:esc(parsed.unknownLines.join(", "))})}</div>` : ""}
    ${parsed.errors.length ? `<div class="banner warn" style="margin-bottom:12px"><b>${t("fpa.pv.errors",{n:parsed.errors.length})}</b><ul style="margin:6px 0 0 18px;padding:0">${errList}</ul></div>` : ""}
    ${ok ? `<div class="table-scroll" style="margin-bottom:12px;max-height:52vh;overflow:auto"><table class="fintbl"><thead>${sampleHead}</thead><tbody>${sample}</tbody><tfoot>${sampleFoot}</tfoot></table></div>
    <div class="field"><label for="fpa_name">${t("fpa.pv.name")}</label><input class="inp" id="fpa_name" value="${esc(defName)}"></div>` : ""}`;
  const buttons = [{ label:t("common.cancel"), cls:"btn", act:closeModal }];
  if(ok) buttons.push({ label:t("fpa.pv.import"), cls:"btn primary", act:()=>{
    const nombre = (document.getElementById("fpa_name").value||defName).trim() || defName;
    const ver = { id:uid(), nombre, archivo:fname, importado:new Date().toISOString(),
                  filas:parsed.rows, errores:parsed.errors.length, lineasDesconocidas:parsed.unknownLines };
    db.fpa.versions.push(ver); db.fpa.vigente = ver.id;
    save(); closeModal(); toast(t("fpa.tt.imported",{name:nombre, n:parsed.rows.length}));
    if(typeof setView==="function") setView("plan");
  }});
  buildModal(t("fpa.pv.title"), body, buttons, true);
}
function fpaSetVigente(id){ if(fpaVersions().some(v=>v.id===id)){ db.fpa.vigente=id; save(); render(); } }
function fpaDeleteVersion(id){
  const v = fpaVersions().find(x=>x.id===id); if(!v) return;
  if(!confirm(t("fpa.del.confirm",{name:v.nombre}))) return;
  db.fpa.versions = fpaVersions().filter(x=>x.id!==id);
  if(db.fpa.vigente===id) db.fpa.vigente = db.fpa.versions.length ? db.fpa.versions[db.fpa.versions.length-1].id : null;
  save(); render();
}

/* ============================================================
   PLAN DEL MES (v82) — el semáforo del Panel
   ------------------------------------------------------------
   Responde UNA pregunta: ¿llegamos al plan de este mes, y si no, por qué?
   Por juego:
     Pendiente   = plan − vendido en el mes
     Disponible  = (stock + tránsito) valuado a PRECIO DE VENTA
                   (el plan está en ventas; comparar contra stock a costo
                   sería mezclar peras con manzanas)
     Ritmo       = ingreso neto de los últimos 30 días ÷ 30
     Capacidad   = ritmo × días que faltan
     Cierre est. = vendido + mín(capacidad, disponible)
                   → no se puede vender lo que no hay
   Diagnóstico:
     done  · ya se cumplió el plan
     ok    · el cierre estimado llega al plan
     stock · no llega y el tope es la MERCADERÍA  → comprar
     pace  · no llega y el tope es el RITMO (hay stock) → vender más
     miss  · el mes terminó por debajo del plan
     noplan· vendió pero no está en el plan
   ============================================================ */
function pmPrecioVentaMap(){
  /* Precio de venta por producto: precio de lista → precio promedio real de
     los últimos 90 días → costo FIFO × markup del juego. Devuelve también de
     dónde salió, para avisar cuando es estimado. */
  const today = new Date(); today.setHours(12,0,0,0);
  const d90 = new Date(today); d90.setDate(d90.getDate()-89);
  const rows = finSaleLines({ from:finIso(d90), to:finIso(today) });
  const byProd = {}, bySaga = {};
  rows.forEach(r=>{
    const e = byProd[r.productoId] = byProd[r.productoId] || { rev:0, u:0 };
    e.rev += r.revenue; e.u += r.cantidad;
    const g = bySaga[r.saga] = bySaga[r.saga] || { rev:0, cogs:0 };
    g.rev += r.revenue; g.cogs += r.cogs;
  });
  return function(p, store){
    const lista = (p.precioVentaPorTienda && p.precioVentaPorTienda[store]) || p.precioVenta || 0;
    if(lista>0) return { precio:lista, est:false };
    const e = byProd[p.id];
    if(e && e.u>0 && e.rev>0) return { precio:e.rev/e.u, est:true };
    const L = fifoLayers(p, store), u = L.reduce((a,x)=>a+x.cantidad,0);
    const costoU = u>0 ? L.reduce((a,x)=>a+x.cantidad*x.costoUnit,0)/u : (p.ultimoCosto||0);
    const g = bySaga[sagaDe(p)];
    const mk = (g && g.cogs>0 && g.rev>g.cogs) ? g.rev/g.cogs : 1;
    return { precio:costoU*mk, est:true };
  };
}

/* Stock + tránsito valuado a PRECIO DE VENTA, por juego (v87: extraído de fpaPlanMes
   para que el Resumen proyecte el cierre con el MISMO tope de stock que el Plan).
   d opcional: {linea, idioma} filtra productos como el resto de Finanzas. */
function pmStockPorJuego(d){
  d = d || {};
  const precio = pmPrecioVentaMap();
  const stk = {};
  productosVendibles().forEach(p=>{
    if(!finProdMatch(p, d)) return;
    const sg = sagaDe(p); if(!sg || sg==="—") return;
    const e = stk[sg] = stk[sg] || { v:0, u:0, tv:0, tu:0, est:0, tot:0 };
    (d.soc ? [d.soc] : STORE_IDS).forEach(s=>{   // v93: con sociedad, sólo su stock
      const u = stockDe(p,s), tu = transitoDe(p,s);
      if(u<=0 && tu<=0) return;
      const pr = precio(p,s);
      e.u += Math.max(0,u); e.v += Math.max(0,u)*pr.precio;
      e.tu += tu; e.tv += tu*pr.precio;
      const w = (Math.max(0,u)+tu)*pr.precio; e.tot += w; if(pr.est) e.est += w;
    });
  });
  return stk;
}

function fpaPlanMes(){
  const ver = fpaVigente();
  const today = new Date(); today.setHours(12,0,0,0);
  const y = today.getFullYear(), mo = today.getMonth();
  const dim = new Date(y, mo+1, 0).getDate(), day = today.getDate(), rem = dim - day;
  const mk = finIso(today).slice(0,7);
  const base = { ver, mk, day, dim, rem };
  if(!ver) return Object.assign(base, { estado:"noplan" });
  const planRows = (ver.filas||[]).filter(x=> x.mes===mk);
  if(!planRows.length) return Object.assign(base, { estado:"nomonth" });

  const planBy = {};
  planRows.forEach(x=>{ planBy[x.linea] = (planBy[x.linea]||0) + (x.ventas||0); });
  const M = finAggregate(finSaleLines({ from:finIso(new Date(y,mo,1)), to:finIso(today) }));
  const d30 = new Date(today); d30.setDate(d30.getDate()-29);
  const L30 = finAggregate(finSaleLines({ from:finIso(d30), to:finIso(today) }));

  /* Stock y tránsito a precio de venta, por juego */
  const stk = pmStockPorJuego();

  const keys = new Set(Object.keys(planBy).filter(k=> planBy[k]>0));     // plan en 0 = sin plan: no se lista si tampoco vendió
  Object.keys(M.bySaga).forEach(k=>{ if((M.bySaga[k].net||0)>0.005) keys.add(k); });
  // v87: también los juegos que venden (ritmo 30 días) aunque este mes todavía no: su
  // cierre estimado suma. Así el total coincide con la proyección del Resumen.
  Object.keys(L30.bySaga).forEach(k=>{ if((L30.bySaga[k].net||0)>0.005) keys.add(k); });
  let estimadoV = 0, totalV = 0;
  const lineas = [...keys].map(k=>{
    const plan = round2(planBy[k]||0);
    const real = round2((M.bySaga[k]||{}).net||0);
    const ritmo = ((L30.bySaga[k]||{}).net||0)/30;
    const s = stk[k] || { v:0, u:0, tv:0, tu:0, est:0, tot:0 };
    estimadoV += s.est; totalV += s.tot;
    const disp = s.v + s.tv;
    const cap = ritmo*rem;
    const pend = Math.max(0, plan - real);
    const cierre = round2(real + Math.min(cap, disp));
    const x = { linea:k, plan, real, ritmo, stockV:round2(s.v), stockU:s.u, transV:round2(s.tv), transU:s.tu,
                disp:round2(disp), pend:round2(pend), cierre, comprar:0, porDia:0, ritmoCorto:false };
    if(plan<=0) x.estado = "noplan";
    else if(real>=plan) x.estado = "done";
    else if(cierre >= plan) x.estado = "ok";
    else if(rem<=0) x.estado = "miss";
    else if(disp < pend && disp < cap){
      x.estado = "stock"; x.comprar = round2(pend - disp); x.ritmoCorto = cap < pend;
    } else { x.estado = "pace"; x.porDia = round2(pend/rem); }
    return x;
  });
  const ORD = { stock:0, pace:1, miss:2, ok:3, done:4, noplan:5 };
  lineas.sort((a,b)=> (ORD[a.estado]-ORD[b.estado]) || (Math.max(b.plan,b.real)-Math.max(a.plan,a.real)));

  const conPlan = lineas.filter(x=> x.plan>0);
  const T = {
    plan: round2(conPlan.reduce((a,x)=>a+x.plan,0)),
    real: round2(lineas.reduce((a,x)=>a+x.real,0)),
    cierre: round2(lineas.reduce((a,x)=>a+x.cierre,0)),
    disp: round2(lineas.reduce((a,x)=>a+x.disp,0)),
    comprar: round2(lineas.reduce((a,x)=>a+x.comprar,0))
  };
  return Object.assign(base, { estado:"ok", lineas, T,
    stockLineas: lineas.filter(x=>x.estado==="stock"),
    paceLineas: lineas.filter(x=>x.estado==="pace"),
    precioEstimadoPct: totalV>0 ? estimadoV/totalV : 0 });
}

/* Tarjeta reutilizable: Panel (compact) y pestaña Plan (completa). */
function planMesCardHTML(opts){
  opts = opts || {};
  const P = fpaPlanMes();
  const mesLbl = finMonthLabel(P.mk);
  const head = (sub)=> `<div class="phead"><h3>${t("pm.title",{m:esc(mesLbl)})}</h3>
      <span class="hint">${sub}</span>
      ${opts.compact?`<button type="button" class="btn ghost sm" data-goto-plan>${t("pm.detail")}</button>`:""}</div>`;

  if(P.estado==="noplan" || P.estado==="nomonth"){
    const msg = P.estado==="noplan" ? t("pm.empty.noplan") : t("pm.empty.nomonth",{m:esc(mesLbl)});
    return `<div class="panel pm-card">${head("")}
      <div class="pm-empty"><p>${msg}</p>
        <div class="pm-empty-btns"><button type="button" class="btn" data-fpa-tpl>${t("plan.btn.template")}</button>
        <button type="button" class="btn primary" data-fpa-import>${t("plan.btn.import")}</button></div></div></div>`;
  }

  const T = P.T;
  const pctReal = T.plan>0 ? T.real/T.plan : 0;
  const llega = T.cierre >= T.plan - 0.005;
  /* Titular en lenguaje llano */
  let titular = t("pm.h.sold",{real:`<b>${moneyRound(T.real)}</b>`, plan:`<b>${moneyRound(T.plan)}</b>`, pct:fmtPct(pctReal,0)}) + " "
    + t(llega ? "pm.h.reach" : "pm.h.short",{cierre:`<b>${moneyRound(T.cierre)}</b>`});
  const acciones = [];
  if(P.stockLineas.length) acciones.push(t("pm.h.buy",{v:`<b>${moneyRound(T.comprar)}</b>`, list:esc(P.stockLineas.map(x=>x.linea).join(", "))}));
  if(P.paceLineas.length) acciones.push(t("pm.h.pace",{list:esc(P.paceLineas.map(x=>x.linea).join(", "))}));

  const chip = (x)=>{
    const map = { done:["pos","pm.st.done"], ok:["pos","pm.st.ok"], stock:["neg","pm.st.stock"], pace:["warn","pm.st.pace"], miss:["neg","pm.st.miss"], noplan:["flat","pm.st.noplan"] };
    const [cls,key] = map[x.estado];
    return `<span class="chip-st ${cls}">${t(key)}</span>`;
  };
  const accion = (x)=>{
    if(x.estado==="stock") return t("pm.a.buy",{v:moneyRound(x.comprar)}) + (x.ritmoCorto?` <span class="pm-note">${t("pm.a.alsopace")}</span>`:"");
    if(x.estado==="pace") return t("pm.a.pace",{need:moneyRound(x.porDia), now:moneyRound(x.ritmo)});
    if(x.estado==="miss") return t("pm.a.miss",{v:moneyRound(x.plan-x.real)});
    if(x.estado==="ok") return t("pm.a.ok");
    if(x.estado==="done") return t("pm.a.done");
    return t("pm.a.noplan");
  };
  const visibles = opts.compact ? 6 : Infinity;
  const nOcultas = Math.max(0, P.lineas.length - visibles);
  const rowsVis = opts.compact ? P.lineas.slice(0,visibles) : P.lineas;
  const rowsHTML = rowsVis.map(x=>{
    const pr = x.plan>0 ? Math.min(1, x.real/x.plan) : 0;
    return `<tr>
      <td><b>${esc(x.linea)}</b></td>
      <td class="num">${x.plan>0?moneyRound(x.plan):"—"}</td>
      <td class="num">${moneyRound(x.real)}${x.plan>0?`<div class="pm-bar"><span style="width:${(pr*100).toFixed(0)}%"></span></div>`:""}</td>
      <td class="num">${moneyRound(x.disp)}<div class="pm-sub">${qty(x.stockU)} u${x.transU>0?` · ${t("pm.transit",{u:qty(x.transU)})}`:""}</div></td>
      <td class="num">${moneyRound(x.cierre)}</td>
      <td>${chip(x)}<div class="pm-sub">${accion(x)}</div></td>
    </tr>`;
  }).join("");

  const headline = `<div class="pm-headline ${llega?"pos":"neg"}">
      <p>${titular}</p>
      ${acciones.length?`<ul>${acciones.map(a=>`<li>${a}</li>`).join("")}</ul>`:""}
    </div>`;
  /* Panel (compact): sólo el titular con las acciones; la tabla por juego vive
     en la pestaña Plan de ventas ("Ver detalle"). */
  if(opts.compact) return `<div class="panel pm-card pm-compact">
    ${head(t("pm.sub",{d:P.day, n:P.dim, ver:esc(P.ver.nombre)}))}
    ${headline}
  </div>`;
  return `<div class="panel pm-card">
    ${head(t("pm.sub",{d:P.day, n:P.dim, ver:esc(P.ver.nombre)}))}
    ${headline}
    <div class="table-scroll"><table class="fintbl pm-tbl">
      <thead><tr><th>${t("fpa.col.linea")}</th><th class="r">${t("pm.th.plan")}</th><th class="r">${t("pm.th.sold")}</th>
        <th class="r">${t("pm.th.stock")}</th><th class="r">${t("pm.th.close")}</th><th>${t("pm.th.status")}</th></tr></thead>
      <tbody>${rowsHTML}</tbody>
      <tfoot><tr><td>${t("common.total")}</td><td class="num">${moneyRound(T.plan)}</td><td class="num">${moneyRound(T.real)}</td>
        <td class="num">${moneyRound(T.disp)}</td><td class="num">${moneyRound(T.cierre)}</td><td></td></tr></tfoot>
    </table></div>
    ${nOcultas?`<p class="pm-foot"><button type="button" class="linkbtn" data-goto-plan>${t("pm.more",{n:nOcultas})}</button></p>`:""}
    <p class="fin-help">${t("pm.help")}${P.precioEstimadoPct>0.05?" "+t("pm.help.est",{p:fmtPct(P.precioEstimadoPct,0)}):""}</p>
  </div>`;
}

/* Clicks de la tarjeta por delegación: funciona igual en el Panel y en la
   pestaña Plan sin tocar el router. */
document.addEventListener("click", (e)=>{
  const el = e.target.closest && e.target.closest(".pm-card [data-goto-plan], .pm-card [data-fpa-tpl], .pm-card [data-fpa-import]");
  if(!el) return;
  e.preventDefault(); e.stopPropagation();
  if(el.hasAttribute("data-goto-plan")){ if(typeof setView==="function") setView("plan"); return; }
  if(el.hasAttribute("data-fpa-tpl")) fpaDownloadTemplate();
  else if(el.hasAttribute("data-fpa-import")) fpaPickFile();
}, true);

/* ============================================================
   DESVÍO PRECIO / VOLUMEN / MIX (v89)
   ------------------------------------------------------------
   Sólo con juegos que tengan "Unidades plan" (si no, no hay precio plan).
   Para cada juego i: Up, Pp = plan (unidades, precio = ventas/unidades);
   Ua, Pa = real. P̄p = precio promedio del plan (Σ ventas plan / Σ Up).
     Volumen = (ΣUa − ΣUp) × P̄p          ¿se vendió más o menos cantidad total?
     Mix     = Σ Ua,i × Pp,i − ΣUa × P̄p  ¿se vendió más de lo caro o de lo barato?
     Precio  = Σ Ua,i × (Pa,i − Pp,i)     ¿a qué precio se vendió cada juego?
   Volumen + Mix + Precio = Real − Plan de esos juegos (cierra exacto).
   Lo vendido en juegos sin plan de unidades va aparte ("fuera del análisis").
   El plan viene A LA FECHA (fpaForQuery), igual que el resto de la pantalla.
   ============================================================ */
function fpaDesvioPVM(q){
  const F = fpaForQuery(q); if(!F || !F.A.unidadesAny) return null;
  const A = finAggregate(finSaleLines(q));
  const lines = Object.keys(F.A.byLinea).filter(k=> F.A.byLinea[k].unidadesAny);
  let Up=0, Rp=0, Ua=0, Ra=0, UaPp=0, precio=0;
  const rows = lines.map(k=>{
    const pl = F.A.byLinea[k], rl = A.bySaga[k] || { units:0, net:0 };
    const up = pl.unidades, rp = pl.ventasConU, pp = up>0 ? rp/up : 0;
    const ua = rl.units||0, ra = rl.net||0, pa = ua>0 ? ra/ua : 0;
    Up+=up; Rp+=rp; Ua+=ua; Ra+=ra; UaPp += ua*pp;
    const efPrecio = ua*(pa-pp), efCant = (ua-up)*pp;
    precio += efPrecio;
    return { linea:k, up, pp, rp, ua, pa, ra, efCant:round2(efCant), efPrecio:round2(efPrecio), total:round2(ra-rp) };
  }).sort((a,b)=> Math.abs(b.total)-Math.abs(a.total));
  const Pbar = Up>0 ? Rp/Up : 0;
  const volumen = (Ua-Up)*Pbar, mix = UaPp - Ua*Pbar;
  const fuera = round2(A.net - Ra);   // ventas de juegos sin unidades en el plan
  return { rows, Up, Ua, Rp:round2(Rp), Ra:round2(Ra), Pbar, volumen:round2(volumen), mix:round2(mix), precio:round2(precio),
           fuera, parcial:F.parcial, sinUnidades: Object.keys(F.A.byLinea).filter(k=> !F.A.byLinea[k].unidadesAny) };
}

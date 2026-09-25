/* ============================================================
   gestordestock — 11f-view-gastos.js
   VISTA: Gastos de estructura (v83)
   ------------------------------------------------------------
   Costos que NO dependen de un producto ni de una venta: alquiler,
   sueldos, servicios, software, honorarios, marketing, etc.
   Existen aunque no vendas una sola caja. Viajan al P&L por debajo del
   margen de contribución y dan el RESULTADO OPERATIVO.

   Modelo (db.gastos, sincroniza como todo lo demás):
     categorias: [{ id, k (clave i18n, sólo las de fábrica) | nombre, grupo:"adm"|"com" }]
     fijos:      [{ id, concepto, cat, soc, monto, desde:"YYYY-MM", hasta:"YYYY-MM"|"" }]
                 → se cargan UNA vez y se devengan solos cada mes.
                   Cambiar el monto "desde tal mes" parte el gasto en dos
                   tramos, así los meses anteriores no se reescriben.
     puntuales:  [{ id, concepto, cat, soc, monto, mes:"YYYY-MM", nota }]
                 → aguinaldo, una reparación, una campaña puntual.

   Criterio contable: DEVENGADO por mes. Un gasto de septiembre pesa
   entero en septiembre aunque el filtro sea MTD (1 al 23): es el costo
   del mes, no se prorratea por días.
   Sociedad: "" = compartido. Con foco en una sociedad, el P&L toma sus
   gastos directos + los compartidos prorrateados por su % del ingreso
   neto del período.
   Juego / idioma / país / vendedor: los gastos de estructura no se
   asignan a esos cortes; con esos filtros el P&L los muestra aparte.
   ============================================================ */
if(typeof ADMIN_VIEWS!=="undefined" && !ADMIN_VIEWS.includes("gastos")) ADMIN_VIEWS.push("gastos");

const GX_CATS_DEF = [
  { id:"alquiler",   k:"gx.cat.alquiler",   grupo:"adm" },
  { id:"sueldos",    k:"gx.cat.sueldos",    grupo:"adm" },
  { id:"servicios",  k:"gx.cat.servicios",  grupo:"adm" },
  { id:"software",   k:"gx.cat.software",   grupo:"adm" },
  { id:"honorarios", k:"gx.cat.honorarios", grupo:"adm" },
  { id:"impuestos",  k:"gx.cat.impuestos",  grupo:"adm" },
  { id:"bancarios",  k:"gx.cat.bancarios",  grupo:"adm" },
  { id:"seguros",    k:"gx.cat.seguros",    grupo:"adm" },
  { id:"marketing",  k:"gx.cat.marketing",  grupo:"com" },
  { id:"mantenimiento", k:"gx.cat.mantenimiento", grupo:"adm" },
  { id:"logistica",  k:"gx.cat.logistica",  grupo:"com" },
  { id:"otros",      k:"gx.cat.otros",      grupo:"adm" }
];
/* v89: "amort" y "fin" van DEBAJO del EBITDA (amortizaciones; intereses, comisiones
   bancarias, diferencia de cambio). No cuentan como gasto de estructura ni para el
   punto de equilibrio operativo: bajan del resultado operativo al resultado neto. */
const GX_GRUPOS = ["adm","com","amort","fin","imp"];
const GX_BAJO = ["amort","fin","imp"];   // v91: "imp" = impuesto a las ganancias, cargado a mano como un gasto más
function gxGrupo(cat){ const g = gxCat(cat).grupo; return GX_GRUPOS.includes(g) ? g : "adm"; }
function gxEsEstructura(cat){ return !GX_BAJO.includes(gxGrupo(cat)); }
/* v91: ya no hay tasa configurable. El impuesto se carga como gasto (categoría del grupo "imp"). */

function gxDb(){
  if(!db.gastos || typeof db.gastos!=="object") db.gastos = {};
  const g = db.gastos;
  if(!Array.isArray(g.categorias) || !g.categorias.length) g.categorias = GX_CATS_DEF.map(c=> Object.assign({}, c));
  /* Categorías de fábrica agregadas después (v84: Mantenimiento): se suman UNA vez a
     las cuentas que ya tenían categorías guardadas, antes de "Otros". catsVer evita
     volver a agregarlas si el usuario las borra. */
  if((g.catsVer||1) < 2){
    ["mantenimiento"].forEach(id=>{
      if(g.categorias.some(c=> c.id===id)) return;
      const def = GX_CATS_DEF.find(c=> c.id===id), iOtros = g.categorias.findIndex(c=> c.id==="otros");
      g.categorias.splice(iOtros<0 ? g.categorias.length : iOtros, 0, Object.assign({}, def));
    });
    g.catsVer = 2;
  }
  if(!Array.isArray(g.fijos)) g.fijos = [];
  if(!Array.isArray(g.puntuales)) g.puntuales = [];
  return g;
}
function gxHasAny(){ const g = db.gastos; return !!(g && ((g.fijos||[]).length || (g.puntuales||[]).length)); }
function gxCat(id){ return gxDb().categorias.find(c=> c.id===id) || gxDb().categorias.find(c=> c.id==="otros") || { id:"otros", k:"gx.cat.otros", grupo:"adm" }; }
function gxCatLabel(id){ const c = gxCat(id); return c.nombre || (c.k ? t(c.k) : id); }
function gxSocLabel(s){ return s ? storeName(s) : t("gx.soc.shared"); }

/* ---------- Meses ---------- */
function gxAddM(mk, n){ const [y,m] = mk.split("-").map(Number); const d = new Date(y, m-1+n, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function gxMonthEnd(mk){ const [y,m] = mk.split("-").map(Number); return finIso(new Date(y, m, 0)); }
function gxParseMonth(v){ return (typeof fpaMonth==="function") ? fpaMonth(v) : (/^\d{4}-\d{2}$/.test(String(v||"").trim()) ? String(v).trim() : ""); }

/* ============================================================
   EXPANSIÓN: fijos + puntuales → renglones por mes
   Los fijos se devengan hasta el mes en curso (no se proyecta futuro);
   los puntuales cargados a un mes futuro sí cuentan en ese mes.
   ============================================================ */
function gxItems(mFrom, mTo){
  const g = gxDb(), cur = finCurMonth(), out = [];
  mFrom = mFrom || "0000-00"; mTo = mTo || "9999-99";
  g.fijos.forEach(f=>{
    if(!f.desde) return;
    let a = f.desde > mFrom ? f.desde : mFrom;
    let b = mTo; if(f.hasta && f.hasta < b) b = f.hasta; if(b > cur) b = cur;
    for(let m=a, guard=0; m<=b && guard<600; m=gxAddM(m,1), guard++)
      out.push({ mes:m, concepto:f.concepto, cat:f.cat, soc:f.soc||"", monto:+f.monto||0, origen:"fijo", ref:f.id });
  });
  g.puntuales.forEach(p=>{
    if(p.mes>=mFrom && p.mes<=mTo) out.push({ mes:p.mes, concepto:p.concepto, cat:p.cat, soc:p.soc||"", monto:+p.monto||0, origen:"puntual", ref:p.id, nota:p.nota||"" });
  });
  return out;
}

/* ============================================================
   AGREGADO del período (lo que consume el P&L).
   soc = null → todo. soc = "akira" → directos de Akira + compartidos × % de ingreso.
   ============================================================ */
function gxPeriod(from, to, soc){
  const mFrom = from ? from.slice(0,7) : "", mTo = to ? to.slice(0,7) : "";
  let share = 1;
  if(soc){
    const all = pnlAggregate(from, to, null), mine = pnlAggregate(from, to, soc);
    share = all.net>0 ? mine.net/all.net : 1/Math.max(1, STORE_IDS.length);
  }
  const R = { total:0, adm:0, com:0, amort:0, fin:0, imp:0, byCat:{}, byCatBajo:{}, byMonth:{}, items:[], share, soc:soc||null };
  gxItems(mFrom, mTo).forEach(it=>{
    let w = 1;
    if(soc){ if(it.soc===soc) w = 1; else if(!it.soc) w = share; else return; }
    const v = round2(it.monto*w); if(!v) return;
    const grupo = gxGrupo(it.cat);
    if(GX_BAJO.includes(grupo)){   // debajo del EBITDA: no es estructura
      R[grupo] += v; R.byCatBajo[it.cat] = (R.byCatBajo[it.cat]||0) + v;
      R.items.push(Object.assign({}, it, { asignado:v, grupo })); return;
    }
    R.total += v; R[grupo] += v;
    R.byCat[it.cat] = (R.byCat[it.cat]||0) + v;
    R.byMonth[it.mes] = (R.byMonth[it.mes]||0) + v;
    R.items.push(Object.assign({}, it, { asignado:v, grupo }));
  });
  R.total = round2(R.total); R.adm = round2(R.adm); R.com = round2(R.com); R.amort = round2(R.amort); R.fin = round2(R.fin); R.imp = round2(R.imp);
  return R;
}

/* P&L + gastos de estructura. Devuelve una COPIA de P (pnlAggregate cachea el
   original) con opex, opexAdm, opexCom, ebit. show=false si hay filtros de
   juego/idioma/país/vendedor (no se asignan a esos cortes). */
function gxPnL(P, from, to, soc){
  const any = gxHasAny();
  const blocked = finDimsActive();
  if(!any || blocked) return Object.assign({}, P, { opex:0, opexAdm:0, opexCom:0, ebit:P.contrib, ebitPct:P.contribPct, show:false, blocked:any&&blocked, gx:null });
  const G = gxPeriod(from, to, soc);
  const ebit = round2(P.contrib - G.total);   // = EBITDA (resultado operativo antes de amortizaciones)
  /* v89/v91: cascada hasta el resultado neto. El impuesto es lo que se cargó como gasto
     en categorías del grupo "imp" (no se calcula con una tasa). */
  const ebitOp = round2(ebit - G.amort), ebt = round2(ebitOp - G.fin);
  const tax = round2(G.imp), neto = round2(ebt - tax), tasa = 0;
  const hasBajo = G.amort>0.005 || Math.abs(G.fin)>0.005 || Math.abs(G.imp)>0.005;
  return Object.assign({}, P, { opex:G.total, opexAdm:G.adm, opexCom:G.com, ebit, ebitPct: P.net>0 ? ebit/P.net : 0, show:true, blocked:false, gx:G,
    sinGx: gxMesesSinEstructura(P, G),
    amort:G.amort, fin:G.fin, ebitOp, ebt, tasa, tax, neto, netoPct: P.net>0 ? neto/P.net : 0, hasBajo });
}
/* v87: meses del período que TIENEN ventas pero NO tienen ningún gasto de estructura
   cargado. Su "resultado operativo" sería la contribución pelada (sobreestimado): la
   UI lo marca en vez de mostrarlo como un resultado sano. */
function gxMesesSinEstructura(P, G){
  const bm = (P && P.byMonth) || {};
  return Object.keys(bm).filter(mk=>{
    const s = bm[mk] || {};
    const vendio = (s.units||0) > 0 || Math.abs(s.net||0) > 0.005;
    return vendio && !(((G && G.byMonth && G.byMonth[mk]) || 0) > 0.005);
  }).sort();
}

/* Punto de equilibrio y resultado operativo de UN mes (v88: compartido por Gastos y
   Resumen, así los dos muestran el mismo número). pe = gastos del mes / contribución %
   del mes. Mes con ventas y sin gastos cargados → sinGx (no hay resultado que mostrar). */
function gxBreakEvenMes(mk, soc){
  const items = gxItems(mk, mk);
  let total = round2(items.filter(x=> gxEsEstructura(x.cat)).reduce((a,x)=>a+x.monto,0));   // v89: sin amort/financieros
  const bajo = round2(items.filter(x=> !gxEsEstructura(x.cat)).reduce((a,x)=>a+x.monto,0));
  const P = pnlAggregate(mk+"-01", gxMonthEnd(mk), soc||null, { linea:"", idioma:"", pais:"", vend:"" });
  // v93: por sociedad → sus gastos + su parte de los compartidos (mismo reparto que el P&L)
  if(soc) total = gxPeriod(mk+"-01", gxMonthEnd(mk), soc).total;
  const ebit = round2(P.contrib - total);
  const sinGx = total<=0.005 && (P.units>0 || P.net>0);
  const pe = (!sinGx && total>0.005 && P.contribPct>0) ? round2(total / P.contribPct) : null;
  return { mk, items, total, bajo, P, ebit, sinGx, pe };
}

/* ============================================================
   VISTA
   ============================================================ */
let gxMes = null;   // mes que se está mirando (YYYY-MM); null = mes en curso

function gxEmptyHTML(){
  return `<div class="panel gx-empty">
    <h3>${t("gx.empty.title")}</h3>
    <p>${t("gx.empty.sub")}</p>
    <ol class="plan-steps">
      <li>${t("gx.empty.s1")}</li><li>${t("gx.empty.s2")}</li><li>${t("gx.empty.s3")}</li>
    </ol>
    <div class="gx-empty-btns">
      <button class="btn primary" data-gx-newfijo>${ICO.plus}${t("gx.btn.fijo")}</button>
      <button class="btn" data-gx-newpunt>${ICO.plus}${t("gx.btn.punt")}</button>
    </div>
  </div>`;
}

function viewGastos(){
  const g = gxDb();
  const cur = finCurMonth();
  const mk = gxMes || cur;
  const hasAny = gxHasAny();
  /* Sin gastos, los botones viven sólo en el estado vacío (no duplicados arriba). */
  const head = `
  <div class="head"><div class="title"><h2>${t("gx.title")}</h2><p>${t("gx.sub")}</p></div>
    ${hasAny ? `<div class="actions gx-actions">
      <button class="btn" data-gx-newpunt>${ICO.plus}${t("gx.btn.punt")}</button>
      <button class="btn primary" data-gx-newfijo>${ICO.plus}${t("gx.btn.fijo")}</button>
    </div>` : ""}
  </div>`;
  if(!hasAny) return head + gxEmptyHTML();

  /* --- Selector de mes --- */
  const nav = `<div class="gx-nav">
    <button class="btn ghost sm" data-gx-mes="${gxAddM(mk,-1)}" aria-label="${t("gx.prev")}">‹</button>
    <b>${esc(t("gx.month",{m:gxMonthName(mk)}))}</b>
    <button class="btn ghost sm" data-gx-mes="${gxAddM(mk,1)}" aria-label="${t("gx.next")}">›</button>
    ${mk!==cur?`<button class="btn ghost sm" data-gx-mes="${cur}">${t("gx.today")}</button>`:""}
    <button class="btn ghost sm gx-catsbtn" data-gx-cats>${t("gx.btn.cats")}</button>
  </div>`;

  /* --- KPIs del mes --- */
  const BE = gxBreakEvenMes(mk);
  const items = BE.items, total = BE.total, P = BE.P, ebit = BE.ebit, sinGxMes = BE.sinGx, pe = BE.pe;
  const fijos = round2(items.filter(x=>x.origen==="fijo").reduce((a,x)=>a+x.monto,0));
  const kpis = `<div class="kpis">
    <div class="kpi"><div class="lbl">${t("gx.kpi.total")}</div><div class="val">${bigMoney(total)}</div>
      <div class="sub">${t("gx.kpi.split",{f:moneyRound(fijos), p:moneyRound(total-fijos)})}</div></div>
    <div class="kpi"><div class="lbl">${t("gx.kpi.pctnet")}</div><div class="val">${P.net>0?fmtPct(total/P.net,0):"—"}</div>
      <div class="sub">${t("gx.kpi.net",{v:moneyRound(P.net)})}</div></div>
    <div class="kpi"><div class="lbl">${t("gx.kpi.ebit")}</div><div class="val ${sinGxMes?"warn-ink":(ebit<0?"neg":"")}">${sinGxMes?"—":bigMoney(ebit)}</div>
      <div class="sub">${sinGxMes ? t("gx.nogx.kpi") : t("gx.kpi.ebitsub",{c:moneyRound(P.contrib)})}</div></div>
    <div class="kpi ${pe!=null && P.net<pe?"warn":""}"><div class="lbl">${t("gx.kpi.be")}</div><div class="val">${pe!=null?bigMoney(pe):"—"}</div>
      <div class="sub">${pe!=null ? (P.net>=pe ? t("gx.kpi.beok") : t("gx.kpi.beko",{v:moneyRound(pe-P.net)})) : (sinGxMes ? t("gx.nogx.be") : t("gx.kpi.benodata"))}</div></div>
  </div>`;

  /* --- Gastos del mes, agrupados por categoría --- */
  const byCat = {};
  items.forEach(x=>{ (byCat[x.cat] = byCat[x.cat] || []).push(x); });
  const catOrder = g.categorias.map(c=>c.id).filter(id=> byCat[id]).concat(Object.keys(byCat).filter(id=> !g.categorias.some(c=>c.id===id)));
  /* v88: contexto para detectar fugas. Por categoría: % del ingreso neto del mes y
     variación contra el PROMEDIO de los 3 meses anteriores que tengan gastos cargados
     (si ninguno tiene, no hay contra qué comparar). Subir es malo: rojo. */
  const prev3 = [3,2,1].map(i=> gxAddM(mk,-i));
  const prevItems = gxItems(prev3[0], prev3[2]);
  const prevMeses = prev3.filter(m=> prevItems.some(x=> x.mes===m && x.monto));
  const prevCat = {}; prevItems.forEach(x=>{ prevCat[x.cat] = (prevCat[x.cat]||0) + x.monto; });
  const pctIng = v=> P.net>0 ? fmtPct(v/P.net, 1) : "—";
  const vsAvg = (id, v)=>{
    if(!prevMeses.length) return `<span class="gx-ctx">—</span>`;
    const avg = (prevCat[id]||0) / prevMeses.length;
    if(avg<=0.005) return `<span class="gx-ctx up" title="${esc(t("gx.ctx.newtip"))}">${t("gx.ctx.new")}</span>`;
    const d = (v-avg)/avg;
    if(Math.abs(d)<0.05) return `<span class="gx-ctx" title="${esc(t("gx.ctx.avgtip",{v:moneyRound(avg)}))}">≈ ${t("gx.ctx.same")}</span>`;
    return `<span class="gx-ctx ${d>0?"up":"down"}" title="${esc(t("gx.ctx.avgtip",{v:moneyRound(avg)}))}">${d>0?"▲ +":"▼ −"}${nfDec(0).format(Math.abs(d)*100)}%</span>`;
  };
  const rowsMes = catOrder.map(id=>{
    const list = byCat[id].sort((a,b)=> b.monto-a.monto);
    const sub = round2(list.reduce((a,x)=>a+x.monto,0));
    return `<tr class="gx-catrow"><td colspan="3"><b>${esc(gxCatLabel(id))}</b> <span class="gx-grp">${t("gx.grp."+gxGrupo(id))}</span>${gxCat(id).presupuesto>0?` <span class="gx-ctx ${sub>gxCat(id).presupuesto+0.005?"up":""}" title="${esc(t("gx.bud.tip"))}">${t("gx.bud.chip",{v:moneyRound(gxCat(id).presupuesto)})}</span>`:""}</td><td class="num"><b>${moneyRound(sub)}</b></td><td class="num"><b>${pctIng(sub)}</b></td><td class="num">${vsAvg(id, sub)}</td><td></td></tr>`
      + list.map(x=>`<tr>
        <td class="gx-ind">${esc(x.concepto)}${x.nota?`<div class="pm-sub">${esc(x.nota)}</div>`:""}</td>
        <td>${esc(gxSocLabel(x.soc))}</td>
        <td><span class="chip-st ${x.origen==="fijo"?"flat":"warn"}">${t("gx.orig."+x.origen)}</span></td>
        <td class="num">${moneyRound(x.monto)}</td>
        <td class="num gx-ctx">${pctIng(x.monto)}</td><td></td>
        <td class="gx-act">${iconBtn(`data-gx-edit="${x.origen}:${esc(x.ref)}"`, ICO.edit, t("common.edit"))}</td>
      </tr>`).join("");
  }).join("");
  /* v89: recurrentes de monto variable del mes anterior que todavía no se cargaron este mes */
  const prevMk = gxAddM(mk,-1);
  const yaEste = new Set(g.puntuales.filter(x=> x.mes===mk).map(x=> (x.cat+"|"+String(x.concepto).trim().toLowerCase())));
  const pendRec = g.puntuales.filter(x=> x.mes===prevMk && x.recurrente && !yaEste.has(x.cat+"|"+String(x.concepto).trim().toLowerCase()));
  window._gxPendRec = pendRec;
  const pendHTML = pendRec.length ? `<div class="banner warn" style="margin:0 0 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <span>${t("gx.rec.pend",{n:pendRec.length, m:esc(gxMonthName(mk))})}</span>
      ${pendRec.map((x,i)=> `<button type="button" class="btn sm" data-gx-rec="${i}">${esc(x.concepto)} · ${t("gx.rec.last",{v:moneyRound(x.monto)})}</button>`).join("")}
    </div>` : "";
  /* v89: categorías que pasaron su presupuesto mensual */
  const overBud = catOrder.map(id=>{ const c = gxCat(id), sub = byCat[id].reduce((a,x)=>a+x.monto,0);
    return (c.presupuesto>0 && sub > c.presupuesto + 0.005) ? { id, sub, bud:c.presupuesto } : null; }).filter(Boolean);
  const budHTML = overBud.length ? `<div class="banner" style="margin:0 0 14px">${t("gx.bud.over",{l: overBud.map(o=> `<b>${esc(gxCatLabel(o.id))}</b> (+${moneyRound(o.sub-o.bud)}, ${fmtPct((o.sub-o.bud)/o.bud,0)})`).join(", ")})}</div>` : "";
  const totPrevAvg = prevMeses.length ? prevItems.filter(x=> gxEsEstructura(x.cat)).reduce((a,x)=>a+x.monto,0)/prevMeses.length : 0;
  const tblMes = `<div class="u-mb5 panel">
    <div class="phead"><h3>${t("gx.mes.title",{m:esc(gxMonthName(mk))})}</h3>
      <button class="btn ghost sm" data-gx-newpunt="${mk}">${ICO.plus}${t("gx.btn.puntmes")}</button></div>
    ${(pendHTML||budHTML) ? `<div style="padding:14px 18px 0">${pendHTML}${budHTML}</div>` : ""}
    ${items.length ? `${prevMeses.length?"":`<p class="hint" style="margin:0;padding:12px 18px 4px;font-size:var(--fs-sm)">${t("gx.ctx.noprev")}</p>`}<div class="table-scroll"><table class="fintbl gx-tbl">
      <thead><tr><th>${t("gx.th.concept")}</th><th>${t("gx.th.soc")}</th><th>${t("gx.th.type")}</th><th class="r">${t("gx.th.amount")}</th><th class="r">${t("gx.th.pctnet")}</th><th class="r" title="${esc(t("gx.th.vsavgtip"))}">${t("gx.th.vsavg")}</th><th></th></tr></thead>
      <tbody>${rowsMes}</tbody>
      <tfoot>${BE.bajo>0.005?`<tr class="gx-bajo"><td colspan="3">${t("gx.bajo.row")}</td><td class="num">${moneyRound(BE.bajo)}</td><td class="num">${pctIng(BE.bajo)}</td><td></td><td></td></tr>`:""}<tr><td colspan="3">${t("gx.total.estructura")}</td><td class="num">${moneyRound(total)}</td><td class="num">${pctIng(total)}</td><td class="num">${prevMeses.length&&totPrevAvg>0.005?(()=>{ const d=(total-totPrevAvg)/totPrevAvg; return Math.abs(d)<0.05?`<span class="gx-ctx">≈ ${t("gx.ctx.same")}</span>`:`<span class="gx-ctx ${d>0?"up":"down"}">${d>0?"▲ +":"▼ −"}${nfDec(0).format(Math.abs(d)*100)}%</span>`; })():`<span class="gx-ctx">—</span>`}</td><td></td></tr></tfoot>
    </table></div>` : `<div class="cempty">${t("gx.mes.empty")}</div>`}
  </div>`;

  /* --- Gastos fijos (todos, activos y finalizados) --- */
  const fijosAll = g.fijos.slice().sort((a,b)=>{
    const ea = (a.hasta && a.hasta<cur) ? 1 : 0, eb = (b.hasta && b.hasta<cur) ? 1 : 0;
    return (ea-eb) || gxCatLabel(a.cat).localeCompare(gxCatLabel(b.cat)) || String(a.concepto).localeCompare(String(b.concepto)) || (a.desde<b.desde?-1:1);
  });
  const rowsFijos = fijosAll.map(f=>{
    const ended = f.hasta && f.hasta < cur, future = f.desde > cur;
    const st = ended ? ["flat","gx.st.ended"] : future ? ["warn","gx.st.future"] : ["pos","gx.st.active"];
    return `<tr class="${ended?"gx-ended":""}">
      <td>${esc(f.concepto)}</td><td>${esc(gxCatLabel(f.cat))}</td><td>${esc(gxSocLabel(f.soc))}</td>
      <td class="num">${moneyRound(f.monto)}</td>
      <td>${esc(gxMonthName(f.desde))} → ${f.hasta?esc(gxMonthName(f.hasta)):t("gx.nohasta")}</td>
      <td><span class="chip-st ${st[0]}">${t(st[1])}</span></td>
      <td class="gx-act">${iconBtn(`data-gx-edit="fijo:${esc(f.id)}"`, ICO.edit, t("common.edit"))}</td>
    </tr>`;
  }).join("");
  const activos = g.fijos.filter(f=> f.desde<=cur && (!f.hasta || f.hasta>=cur));
  const tblFijos = `<div class="u-mb5 panel">
    <div class="phead"><h3>${t("gx.fijos.title")}</h3><span class="hint">${t("gx.fijos.sub",{n:activos.length, v:moneyRound(activos.reduce((a,f)=>a+(+f.monto||0),0))})}</span></div>
    ${g.fijos.length ? `<div class="table-scroll"><table class="fintbl gx-tbl">
      <thead><tr><th>${t("gx.th.concept")}</th><th>${t("gx.th.cat")}</th><th>${t("gx.th.soc")}</th><th class="r">${t("gx.th.monthly")}</th><th>${t("gx.th.valid")}</th><th>${t("gx.th.status")}</th><th></th></tr></thead>
      <tbody>${rowsFijos}</tbody></table></div>` : `<div class="cempty">${t("gx.fijos.empty")}</div>`}
  </div>`;

  /* --- Últimos 6 meses por categoría --- */
  const months0 = [5,4,3,2,1,0].map(i=> gxAddM(mk,-i));
  const hist = gxItems(months0[0], months0[5]).filter(x=> gxEsEstructura(x.cat));   // v89: sólo estructura
  const mat = {}, colT = {};
  hist.forEach(x=>{ mat[x.cat] = mat[x.cat] || {}; mat[x.cat][x.mes] = (mat[x.cat][x.mes]||0) + x.monto; colT[x.mes] = (colT[x.mes]||0) + x.monto; });
  const cats6 = g.categorias.map(c=>c.id).filter(id=> mat[id]).concat(Object.keys(mat).filter(id=> !g.categorias.some(c=>c.id===id)));
  const netM0 = months0.map(m=> pnlAggregate(m+"-01", gxMonthEnd(m), null, { linea:"", idioma:"", pais:"", vend:"" }));
  // v88: sin meses vacíos al principio (ni gastos ni ventas)
  const i0 = Math.max(0, months0.findIndex((m,i)=> colT[m] || netM0[i].units>0));
  const months = months0.slice(i0), netM = netM0.slice(i0);
  const tblHist = cats6.length ? `<div class="u-mb5 panel chart">
    <p class="ctitle">${t("gx.hist.title")}</p><p class="csub">${t("gx.hist.sub")}</p>
    <div class="table-scroll"><table class="fintbl gx-hist">
      <colgroup><col class="gx-hist-cat">${months.map(()=>`<col>`).join("")}</colgroup>
      <thead><tr><th>${t("gx.th.cat")}</th>${months.map(m=>`<th class="r">${esc(finMonthLabel(m))}</th>`).join("")}</tr></thead>
      <tbody>${cats6.map(id=>`<tr><td>${esc(gxCatLabel(id))}</td>${months.map(m=>`<td class="num">${mat[id][m]?moneyRound(mat[id][m]):"—"}</td>`).join("")}</tr>`).join("")}</tbody>
      <tfoot>
        <tr><td>${t("common.total")}</td>${months.map(m=>`<td class="num">${colT[m]?moneyRound(colT[m]):"—"}</td>`).join("")}</tr>
        <tr class="gx-ebitrow"><td>${t("gx.kpi.ebit")}</td>${months.map((m,i)=>{ const e = round2(netM[i].contrib - (colT[m]||0)); const has = netM[i].units>0 || colT[m];
          if(netM[i].units>0 && !colT[m]) return `<td class="num" title="${esc(t("gx.nogx.tip"))}"><span class="kpi-tag">${t("gx.nogx.cell")}</span></td>`;   // v87: ventas sin estructura cargada
          return `<td class="num ${has?(e<0?"neg":"pos"):""}">${has?moneyRound(e):"—"}</td>`; }).join("")}</tr>
      </tfoot>
    </table></div>
  </div>` : "";

  return head + nav + kpis + tblMes + tblFijos + tblHist + `<p class="fin-notes">${t("gx.notes")}</p>`;
}
function gxMonthName(mk){ if(!mk) return "—"; const [y,m] = mk.split("-"); return `${t("cal.mon."+((+m)-1))} ${y}`; }

function wireGastos(){
  const m = document.getElementById("main"); if(!m) return;
  m.querySelectorAll("[data-gx-newfijo]").forEach(b=> b.onclick=()=> gxFijoModal(null));
  m.querySelectorAll("[data-gx-newpunt]").forEach(b=> b.onclick=()=> gxPuntualModal(null, b.dataset.gxNewpunt || gxMes || finCurMonth()));
  // v89: cargar un recurrente pendiente, con concepto/categoría/sociedad del mes anterior y su monto como referencia
  m.querySelectorAll("[data-gx-rec]").forEach(b=> b.onclick=()=>{ const x = (window._gxPendRec||[])[+b.dataset.gxRec]; if(x) gxPuntualModal(null, gxMes || finCurMonth(), { concepto:x.concepto, cat:x.cat, soc:x.soc, monto:x.monto, recurrente:true }); });
  m.querySelectorAll("[data-gx-cats]").forEach(b=> b.onclick=gxCatsModal);
  m.querySelectorAll("[data-gx-mes]").forEach(b=> b.onclick=()=>{ gxMes = b.dataset.gxMes===finCurMonth() ? null : b.dataset.gxMes; render(); });
  m.querySelectorAll("[data-gx-edit]").forEach(b=> b.onclick=()=>{
    const [tipo, id] = b.dataset.gxEdit.split(":");
    if(tipo==="fijo") gxFijoModal(id); else gxPuntualModal(id);
  });
}

/* ============================================================
   MODALES
   ============================================================ */
function gxCatOptions(sel){
  return gxDb().categorias.map(c=> `<option value="${esc(c.id)}" ${c.id===sel?"selected":""}>${esc(gxCatLabel(c.id))}</option>`).join("");
}
function gxSocOptions(sel){
  return `<option value="" ${!sel?"selected":""}>${t("gx.soc.shared")}</option>`
    + STORE_IDS.map(s=> `<option value="${esc(s)}" ${s===sel?"selected":""}>${esc(storeName(s))}</option>`).join("");
}
function gxVal(id){ const el = document.getElementById(id); return el ? el.value : ""; }
function gxErr(msg){ const e = document.getElementById("gx_err"); if(e){ e.textContent = msg; e.hidden = false; } }

/* Gasto fijo mensual. Al editar el monto se puede elegir "desde qué mes":
   si es posterior al inicio, se parte en dos tramos y la historia queda intacta. */
function gxFijoModal(id){
  const g = gxDb(), f = id ? g.fijos.find(x=> x.id===id) : null;
  const cur = finCurMonth();
  const body = `
    <div class="u-cols2 u-p0 grid-form">
      <div class="u-span2 field"><label for="gx_c">${t("gx.f.concept")}</label>
        <input class="inp" id="gx_c" value="${esc(f?f.concepto:"")}" placeholder="${esc(t("gx.f.conceptph"))}"></div>
      <div class="field"><label for="gx_cat">${t("gx.th.cat")}</label><select class="inp" id="gx_cat">${gxCatOptions(f?f.cat:"alquiler")}</select></div>
      <div class="field"><label for="gx_soc">${t("gx.th.soc")}</label><select class="inp" id="gx_soc">${gxSocOptions(f?f.soc:"")}</select></div>
      <div class="field"><label for="gx_m">${t("gx.f.monthly")}</label><input class="inp num" id="gx_m" inputmode="decimal" value="${f?f.monto:""}"></div>
      <div class="field"><label for="gx_d">${t("gx.f.from")}</label><input class="inp" id="gx_d" type="month" value="${esc(f?f.desde:cur)}"></div>
      ${f ? `<div class="field"><label for="gx_ap">${t("gx.f.applyfrom")}</label><input class="inp" id="gx_ap" type="month" value="${esc(f.desde>cur?f.desde:cur)}">
        <div class="pm-sub">${t("gx.f.applyhint")}</div></div>` : ""}
      <div class="field"><label for="gx_h">${t("gx.f.to")}</label><input class="inp" id="gx_h" type="month" value="${esc(f&&f.hasta?f.hasta:"")}">
        <div class="pm-sub">${t("gx.f.tohint")}</div></div>
    </div>
    <p class="u-m0 u-mt3 banner warn" id="gx_err" hidden></p>`;
  const buttons = [];
  if(f){
    buttons.push({ label:t("gx.btn.delete"), cls:"btn danger", act:()=>{
      if(!confirm(t("gx.cf.delfijo",{c:f.concepto}))) return;
      g.fijos = g.fijos.filter(x=> x.id!==f.id); save(); closeModal(); toast(t("gx.tt.deleted")); render();
    }});
    if(!f.hasta || f.hasta>=cur) buttons.push({ label:t("gx.btn.end"), cls:"btn", act:()=>{
      const last = gxAddM(cur,-1);
      f.hasta = last < f.desde ? f.desde : last;
      save(); closeModal(); toast(t("gx.tt.ended",{m:gxMonthName(f.hasta)})); render();
    }});
  }
  buttons.push({ label:t("common.cancel"), cls:"btn", act:closeModal });
  buttons.push({ label:t("common.save"), cls:"btn primary", act:()=>{
    const concepto = gxVal("gx_c").trim(), cat = gxVal("gx_cat"), soc = gxVal("gx_soc");
    const monto = round2(parseNum(gxVal("gx_m")));
    const desde = gxParseMonth(gxVal("gx_d")), hastaRaw = gxVal("gx_h").trim(), hasta = hastaRaw ? gxParseMonth(hastaRaw) : "";
    if(!concepto) return gxErr(t("gx.err.concept"));
    if(!(monto>0)) return gxErr(t("gx.err.amount"));
    if(!desde) return gxErr(t("gx.err.from"));
    if(hastaRaw && !hasta) return gxErr(t("gx.err.to"));
    if(hasta && hasta<desde) return gxErr(t("gx.err.range"));
    if(!f){
      g.fijos.push({ id:uid(), concepto, cat, soc, monto, desde, hasta });
    } else {
      const ap = gxParseMonth(gxVal("gx_ap"));
      const montoCambio = Math.abs(monto - (+f.monto||0)) >= 0.005;
      if(montoCambio && ap && ap > desde && (!hasta || ap <= hasta)){
        // Tramo viejo hasta el mes anterior; tramo nuevo desde "ap" con el monto nuevo.
        g.fijos.push({ id:uid(), concepto, cat, soc, monto, desde:ap, hasta });
        Object.assign(f, { concepto, cat, soc, desde, hasta:gxAddM(ap,-1) });
      } else {
        Object.assign(f, { concepto, cat, soc, monto, desde, hasta });
      }
    }
    save(); closeModal(); toast(t("gx.tt.saved")); render();
  }});
  buildModal(f ? t("gx.md.editfijo") : t("gx.md.newfijo"), body, buttons);
}

function gxPuntualModal(id, mesDef, pre){
  // v89: pre = datos para precargar (recurrente pendiente: concepto, cat, soc, último monto)
  const g = gxDb(), p = id ? g.puntuales.find(x=> x.id===id) : null;
  const body = `
    <div class="u-cols2 u-p0 grid-form">
      <div class="u-span2 field"><label for="gx_c">${t("gx.f.concept")}</label>
        <input class="inp" id="gx_c" value="${esc(p?p.concepto:(pre?pre.concepto:""))}" placeholder="${esc(t("gx.f.conceptph2"))}"></div>
      <div class="field"><label for="gx_cat">${t("gx.th.cat")}</label><select class="inp" id="gx_cat">${gxCatOptions(p?p.cat:(pre?pre.cat:"otros"))}</select></div>
      <div class="field"><label for="gx_soc">${t("gx.th.soc")}</label><select class="inp" id="gx_soc">${gxSocOptions(p?p.soc:(pre?pre.soc:""))}</select></div>
      <div class="field"><label for="gx_m">${t("gx.th.amount")}</label><input class="inp num" id="gx_m" inputmode="decimal" value="${p?p.monto:""}" placeholder="${pre&&pre.monto?esc(t("gx.f.lastamt",{v:moneyRound(pre.monto)})):""}"></div>
      <div class="field"><label for="gx_d">${t("gx.f.month")}</label><input class="inp" id="gx_d" type="month" value="${esc(p?p.mes:(mesDef||finCurMonth()))}">
        <div class="pm-sub">${t("gx.f.monthhint")}</div></div>
      <div class="u-span2 field"><label for="gx_n">${t("gx.f.note")}</label><input class="inp" id="gx_n" value="${esc(p?p.nota||"":"")}"></div>
      <label class="field" style="grid-column:1/3;display:flex;gap:8px;align-items:flex-start;flex-direction:row"><input type="checkbox" id="gx_rec" ${(p?p.recurrente:(pre&&pre.recurrente))?"checked":""} style="margin-top:3px">
        <span><b>${t("gx.f.rec")}</b><span class="pm-sub" style="display:block">${t("gx.f.rechint")}</span></span></label>
    </div>
    <p class="u-m0 u-mt3 banner warn" id="gx_err" hidden></p>`;
  const buttons = [];
  if(p) buttons.push({ label:t("gx.btn.delete"), cls:"btn danger", act:()=>{
    if(!confirm(t("gx.cf.delpunt",{c:p.concepto}))) return;
    g.puntuales = g.puntuales.filter(x=> x.id!==p.id); save(); closeModal(); toast(t("gx.tt.deleted")); render();
  }});
  buttons.push({ label:t("common.cancel"), cls:"btn", act:closeModal });
  buttons.push({ label:t("common.save"), cls:"btn primary", act:()=>{
    const concepto = gxVal("gx_c").trim(), cat = gxVal("gx_cat"), soc = gxVal("gx_soc");
    const monto = round2(parseNum(gxVal("gx_m"))), mes = gxParseMonth(gxVal("gx_d")), nota = gxVal("gx_n").trim();
    if(!concepto) return gxErr(t("gx.err.concept"));
    if(!monto) return gxErr(t("gx.err.amount2"));
    if(!mes) return gxErr(t("gx.err.month"));
    const recurrente = !!(document.getElementById("gx_rec")||{}).checked;
    if(p) Object.assign(p, { concepto, cat, soc, monto, mes, nota, recurrente });
    else g.puntuales.push({ id:uid(), concepto, cat, soc, monto, mes, nota, recurrente });
    save(); closeModal(); toast(t("gx.tt.saved")); render();
  }});
  buildModal(p ? t("gx.md.editpunt") : t("gx.md.newpunt"), body, buttons);
}

/* Categorías: renombrar, elegir grupo (administración / comercialización),
   agregar nuevas y borrar las que no se usan. */
function gxCatsModal(){
  const g = gxDb();
  const used = new Set(g.fijos.map(f=>f.cat).concat(g.puntuales.map(p=>p.cat)));
  const rows = g.categorias.map(c=> `<tr data-gxcat="${esc(c.id)}">
      <td><input class="inp" data-gxcat-name value="${esc(gxCatLabel(c.id))}"></td>
      <td><select class="inp" data-gxcat-grp>${GX_GRUPOS.map(k=>`<option value="${k}" ${c.grupo===k?"selected":""}>${t("gx.grp."+k)}</option>`).join("")}</select></td>
      <td><input class="inp num" data-gxcat-bud inputmode="decimal" placeholder="—" value="${c.presupuesto?esc(String(c.presupuesto)):""}" style="width:110px"></td>
      <td>${(used.has(c.id) || c.id==="otros") ? `<span class="pm-sub">${t(c.id==="otros"?"gx.cats.fixed":"gx.cats.used")}</span>` : `<button type="button" class="btn ghost sm danger-ghost" data-gxcat-del>${t("gx.btn.delete")}</button>`}</td>
    </tr>`).join("");
  const body = `<p class="u-m0 u-mb3 hint">${t("gx.cats.sub")}</p>
    <div class="table-scroll"><table class="fintbl"><thead><tr><th>${t("gx.th.cat")}</th><th>${t("gx.cats.group")}</th><th class="r" title="${esc(t("gx.cats.budtip"))}">${t("gx.cats.bud")}</th><th></th></tr></thead>
    <tbody id="gx_cats">${rows}</tbody></table></div>
    <button type="button" class="u-mt3 btn ghost sm" id="gx_catadd">${ICO.plus}${t("gx.cats.add")}</button>`;
  buildModal(t("gx.cats.title"), body, [
    { label:t("common.cancel"), cls:"btn", act:closeModal },
    { label:t("common.save"), cls:"btn primary", act:()=>{
      const next = [];
      document.querySelectorAll("#gx_cats tr").forEach(tr=>{
        const id = tr.dataset.gxcat, name = tr.querySelector("[data-gxcat-name]").value.trim(), grupo = tr.querySelector("[data-gxcat-grp]").value;
        const budEl = tr.querySelector("[data-gxcat-bud]"), budN = budEl ? parseNum(budEl.value) : NaN;
        const presupuesto = (!isNaN(budN) && budN>0) ? round2(budN) : 0;   // v89: presupuesto mensual (0 = sin presupuesto)
        const old = g.categorias.find(c=> c.id===id);
        if(old){
          const c = Object.assign({}, old, { grupo, presupuesto }); delete c.nombre;
          const def = old.k ? t(old.k) : "";
          if(name && name!==def) c.nombre = name; else if(!old.k) c.nombre = old.nombre || name || id;
          next.push(c);
        } else if(name){ next.push({ id:"c_"+uid(), nombre:name, grupo, presupuesto }); }
      });
      g.categorias = next; save(); closeModal(); toast(t("gx.tt.saved")); render();
    }}
  ], true);
  const tb = document.getElementById("gx_cats");
  tb.addEventListener("click", e=>{ const b = e.target.closest("[data-gxcat-del]"); if(b) b.closest("tr").remove(); });
  document.getElementById("gx_catadd").onclick = ()=>{
    const tr = document.createElement("tr"); tr.dataset.gxcat = "";
    tr.innerHTML = `<td><input class="inp" data-gxcat-name placeholder="${esc(t("gx.cats.newph"))}"></td>
      <td><select class="inp" data-gxcat-grp>${GX_GRUPOS.map(k=>`<option value="${k}">${t("gx.grp."+k)}</option>`).join("")}</select></td>
      <td><input class="inp num" data-gxcat-bud inputmode="decimal" placeholder="—" style="width:110px"></td>
      <td><button type="button" class="btn ghost sm danger-ghost" data-gxcat-del>${t("gx.btn.delete")}</button></td>`;
    tb.appendChild(tr); tr.querySelector("input").focus();
  };
}

/* ============================================================
   gestordestock — 11d-view-plan.js
   VISTA: Plan de ventas (v82)
   ------------------------------------------------------------
   Arriba: el semáforo del mes en curso (06-fpa.js → planMesCardHTML),
   el mismo que se ve en el Panel pero con todos los juegos.
   Abajo: el histórico del período filtrado — ventas plan vs real por
   juego y mes a mes — y los controles de conciliación.
   El plan ahora es SOLO ventas por mes y juego. Stock necesario, cuánto
   comprar y cierre estimado los calcula la app; ya no se piden.
   País y vendedor no existen en el plan: acá se ignoran (también del
   lado real), así la comparación es manzanas con manzanas.
   ============================================================ */
function planQuery(){ const q = finQuery(); q.pais=""; q.vend=""; return q; }

/* Estado histórico de un juego: sólo ventas contra plan. */
function planStatus(x){
  if(x.planV<=0 && x.realV>0) return { cls:"flat", key:"plan.st.noplan" };
  const v = x.planV>0 ? (x.realV - x.planV)/x.planV : null;
  if(v==null) return { cls:"flat", key:"plan.st.ontrack" };
  if(v<=-0.15) return { cls:"neg", key:"plan.st.off" };
  if(v<=-0.05) return { cls:"warn", key:"plan.st.watch" };
  if(v>=0.05) return { cls:"pos", key:"plan.st.above" };
  return { cls:"flat", key:"plan.st.ontrack" };
}

function planEmptyHTML(){
  return `
  <div class="panel" style="padding:28px">
    <h3 class="u-m0 u-mb2">${t("plan.empty.title")}</h3>
    <p class="hint" style="margin:0 0 14px;max-width:70ch">${t("plan.empty.sub")}</p>
    <ol class="plan-steps">
      <li>${t("plan.empty.s1")}</li><li>${t("plan.empty.s2")}</li><li>${t("plan.empty.s3")}</li>
    </ol>
    <div class="u-flex u-gap3 u-wrap u-mt4">
      <button class="btn" data-fpa-tpl>${t("plan.btn.template")}</button>
      <button class="btn primary" data-fpa-import>${t("plan.btn.import")}</button>
    </div>
  </div>`;
}

function viewPlan(){
  const head = `
  <div class="head"><div class="title"><h2>${t("plan.title")}</h2><p>${t("plan.sub")}</p></div>
    <div class="u-gap2 actions">
      <button class="btn" data-fpa-tpl>${t("plan.btn.template")}</button>
      <button class="btn primary" data-fpa-import>${t("plan.btn.import")}</button>
    </div>
  </div>`;
  const ver = fpaVigente();
  if(!ver) return head + planEmptyHTML();

  const q = planQuery(), r = { from:q.from, to:q.to };
  const PF = fpaForQuery(q), PA = PF.A;
  const parcialBy = {}; (PF.parcial||[]).forEach(p=> parcialBy[p.mes] = p);
  const A = finAggregate(finSaleLines(q));
  const ignored = finFiltros.pais || finFiltros.vend;
  const noLangSplit = finFiltros.idioma && !fpaHasIdioma(ver);

  /* --- Versión --- */
  const vs = fpaVersions();
  const verCard = `
  <div class="panel chart plan-ver">
    <div class="u-flex u-between u-items-center u-gap3 u-wrap">
      <p class="u-m0 ctitle">${t("plan.ver.title")}</p>
      <div class="u-flex u-gap2 u-items-center">
        <label class="u-m0 hint" for="plan_ver">${t("plan.ver.version")}</label>
        <select class="inp" id="plan_ver" style="height:34px;min-width:180px">${vs.map(v=>`<option value="${esc(v.id)}" ${v.id===ver.id?"selected":""}>${esc(v.nombre)}${v.id===ver.id?" · "+t("plan.ver.current"):""}</option>`).slice().reverse().join("")}</select>
        <button class="btn ghost sm danger-ghost" data-fpa-del="${esc(ver.id)}" title="${t("plan.ver.delete")}" aria-label="${t("plan.ver.delete")}">${t("plan.ver.delete")}</button>
      </div>
    </div>
    <p class="csub" style="margin:10px 0 0">${t("plan.ver.meta",{file:esc(ver.archivo||"—"), date:fmtDate(ver.importado), rows:(ver.filas||[]).length, months:new Set((ver.filas||[]).map(x=>x.mes)).size, lines:new Set((ver.filas||[]).map(x=>x.linea)).size})}</p>
  </div>`;

  /* --- Juegos: unión de los del plan y los que vendieron --- */
  const lineSet = new Set(Object.keys(PA.byLinea));
  Object.keys(A.bySaga).forEach(k=>{ if((A.bySaga[k].net||0)>0.005) lineSet.add(k); });
  const lines = [...lineSet].map(k=>{
    const p = PA.byLinea[k] || { ventas:0 };
    const s = A.bySaga[k] || { net:0 };
    return { linea:k, planV:round2(p.ventas), realV:round2(s.net) };
  }).filter(x=> x.planV>0.005 || x.realV>0.005)   // v88: juego con plan 0 y sin ventas no es "En línea": no se lista
    .sort((a,b)=> Math.max(b.planV,b.realV) - Math.max(a.planV,a.realV));
  const scale = Math.max(1, ...lines.map(x=>Math.max(x.planV, x.realV))) * 1.08;

  /* --- Conciliación --- */
  const planLines = new Set(Object.keys(PA.byLinea));
  const orphanReal = lines.filter(x=> !planLines.has(x.linea) && x.realV>0);
  const orphanRealV = round2(orphanReal.reduce((a,x)=>a+x.realV,0));
  const planNoSales = lines.filter(x=> x.planV>0 && x.realV<=0);
  const monthKeys = (r.from && r.to) ? finMonthKeys(r, {byMonth:{}}, {byMonth:{}}) : [...PA.months].sort();
  const covered = monthKeys.filter(mk=> PA.months.has(mk)).length;
  const chk = (ok, label, value, cls)=> `<div class="plan-chk"><span>${label}</span><b class="${cls|| (ok?"pos":"warn")}">${ok?"✓ ":"! "}${value}</b></div>`;
  const checks = `
  <div class="panel chart">
    <p class="ctitle">${t("plan.chk.title")}</p>
    <p class="csub">${t("plan.chk.sub")}</p>
    ${chk(true, t("plan.chk.same"), money(A.net), "pos")}
    ${chk(!orphanReal.length, t("plan.chk.orphanreal"), orphanReal.length ? `${money(orphanRealV)} · ${esc(orphanReal.map(x=>x.linea).join(", "))}` : "0")}
    ${chk(!planNoSales.length, t("plan.chk.nosales"), planNoSales.length ? esc(planNoSales.map(x=>x.linea).join(", ")) : "0")}
    ${chk(covered===monthKeys.length, t("plan.chk.months"), t("plan.chk.monthsv",{a:covered,b:monthKeys.length}))}
    ${(ver.lineasDesconocidas||[]).length ? chk(false, t("plan.chk.unknown"), esc(ver.lineasDesconocidas.join(", "))) : ""}
  </div>`;

  /* --- Por juego (período filtrado) --- */
  const rowsHTML = lines.map(x=>{
    const st = planStatus(x);
    const vv = x.planV>0 ? (x.realV-x.planV)/x.planV : null;
    return `<tr class="${st.cls==="neg"?"plan-row-off":""}">
      <td><button type="button" class="linkbtn" data-plan-linea="${esc(x.linea)}" title="${t("fin.mix.tip")}">${esc(x.linea)}</button></td>
      <td class="drillable" data-drill="linea:${esc(x.linea)}" data-drill-ctx="plan" tabindex="0" title="${t("dr.tap")}"><div class="bullet" role="img" aria-label="${esc(t("plan.bullet.aria",{real:money(x.realV), plan:money(x.planV)}))}">
            <span class="br" style="width:${(x.realV/scale*100).toFixed(1)}%"></span>
            ${x.planV>0?`<span class="bp" style="left:${(x.planV/scale*100).toFixed(1)}%"></span>`:""}
          </div><div class="bullet-lbl">${finCompact(x.realV)} / ${x.planV>0?finCompact(x.planV):"—"}</div></td>
      <td class="num ${vv==null?"":(vv>=0?"pos":"neg")}"><b>${vv==null?"—":(vv>=0?"▲ +":"▼ −")+nfDec(0).format(Math.abs(vv)*100)+"%"}</b></td>
      <td><span class="chip-st ${st.cls}">${t(st.key)}</span></td>
    </tr>`;
  }).join("");
  const byLine = `
  <div class="u-mb5 panel chart">
    <p class="ctitle">${t("plan.line.title")}</p>
    <p class="csub">${t("plan.line.sub")} ${t("dr.hint.bullet")}${(PF.parcial&&PF.parcial.length)?" "+t("plan.partial.note",{m:fpaParcialTxt(PF.parcial)}):""}</p>
    <div class="fin-legend"><span><i class="lg-sales"></i>${t("plan.lg.real")}</span><span><i class="lg-plan"></i>${t("plan.lg.plan")}</span></div>
    ${lines.length ? `<div class="table-scroll"><table class="fintbl">
      <thead><tr><th>${t("an.sl.line")}</th><th style="min-width:200px">${t("plan.th.sales")}</th><th class="r">${t("plan.th.var")}</th><th>${t("plan.th.status")}</th></tr></thead>
      <tbody>${rowsHTML}</tbody>
      <tfoot><tr><td>${t("common.total")}</td><td class="num" style="text-align:left">${finCompact(A.net)} / ${finCompact(PA.ventas)}</td>
        <td class="num ${PA.ventas>0?(A.net>=PA.ventas?"pos":"neg"):""}">${PA.ventas>0?((A.net>=PA.ventas?"▲ +":"▼ −")+nfDec(0).format(Math.abs(A.net-PA.ventas)/PA.ventas*100)+"%"):"—"}</td><td></td></tr></tfoot>
    </table></div>` : `<div class="cempty">${t("plan.nodata")}</div>`}
    <p class="fin-help">${t("plan.line.help")}</p>
  </div>`;

  /* --- Mes a mes --- */
  let accP=0, accR=0;
  // v88: la tabla arranca en el primer mes con plan o con ventas (el control de cobertura usa todos)
  const monthKeysT = finTrimMeses(monthKeys, mk=> ((PA.byMonth[mk]||{}).ventas||0) || ((A.byMonth[mk]||{}).net||0));
  const mRows = monthKeysT.map(mk=>{
    const p = (PA.byMonth[mk]||{}).ventas||0, rr = (A.byMonth[mk]||{}).net||0;
    accP+=p; accR+=rr;
    const d = rr-p, dAcc = accR-accP;
    const pp = parcialBy[mk];
    return `<tr class="drillable" data-drill="m:${mk}" data-drill-ctx="plan" tabindex="0" title="${t("dr.tap")}"><td>${esc(finMonthLabel(mk))}${pp?` <span class="kpi-tag" title="${esc(t("plan.partial.tip"))}">${esc(t("plan.partial.tag",{d:pp.dias,n:pp.dim}))}</span>`:""}</td><td class="num">${p?moneyRound(p):"—"}</td><td class="num">${rr?moneyRound(rr):"—"}</td>
      <td class="num ${p? (d>=0?"pos":"neg"):""}">${p?(d>=0?"+":"−")+moneyRound(Math.abs(d)):"—"}</td>
      <td class="num ${accP?(dAcc>=0?"pos":"neg"):""}">${accP?(dAcc>=0?"+":"−")+moneyRound(Math.abs(dAcc)):"—"}</td></tr>`;
  }).join("");
  const monthly = monthKeysT.length ? `
  <div class="u-mb5 panel chart">
    <p class="ctitle">${t("plan.m.title")}</p>
    <p class="csub">${t("plan.m.sub")} ${t("dr.hint.rows")}${(PF.parcial&&PF.parcial.length)?" "+t("plan.partial.note",{m:fpaParcialTxt(PF.parcial)}):""}</p>
    <div class="table-scroll"><table class="fintbl">
      <thead><tr><th>${t("fin.th.month")}</th><th class="r">${t("plan.m.plan")}</th><th class="r">${t("plan.m.real")}</th><th class="r">${t("plan.m.var")}</th><th class="r">${t("plan.m.acc")}</th></tr></thead>
      <tbody>${mRows}</tbody>
    </table></div>
  </div>` : "";

  const notes = [
    ignored ? `<div class="u-mb3 banner">${t("plan.note.ignored")}</div>` : "",
    noLangSplit ? `<div class="u-mb3 banner warn">${t("plan.note.nolang")}</div>` : ""
  ].join("");

  return head
    + planMesCardHTML({})
    + (typeof simuladorHTML==="function" ? simuladorHTML() : "")
    + `<h3 class="pm-section">${t("pm.hist")}</h3>`
    + finFilterBarHTML() + notes
    + byLine + pvmHTML(q) + monthly
    + `<div class="u-mb5 chart-grid">${verCard}${checks}</div>`;
}

function wirePlan(){
  const m = document.getElementById("main"); if(!m) return;
  wireFinFilterBar();
  wireDrills();
  wireSimulador();   // v89
  m.querySelectorAll("[data-fpa-tpl]").forEach(b=> b.onclick=fpaDownloadTemplate);
  m.querySelectorAll("[data-fpa-import]").forEach(b=> b.onclick=fpaPickFile);
  m.querySelectorAll("[data-fpa-del]").forEach(b=> b.onclick=()=> fpaDeleteVersion(b.dataset.fpaDel));
  const sel = document.getElementById("plan_ver"); if(sel) sel.onchange=()=> fpaSetVigente(sel.value);
  m.querySelectorAll("[data-plan-linea]").forEach(b=> b.onclick=()=>{ const l=b.dataset.planLinea; finFiltros.linea = (finFiltros.linea===l?"":l); render(); });
}

/* ============================================================
   v89 — ¿POR QUÉ EL DESVÍO? Volumen, mix y precio (fpaDesvioPVM)
   ============================================================ */
function pvmHTML(q){
  const D = (typeof fpaDesvioPVM==="function") ? fpaDesvioPVM(q) : null;
  if(!D) return `<div class="u-mb5 panel chart"><p class="ctitle">${t("pvm.title")}</p>
    <p class="u-m0 csub">${t("pvm.nounits")}</p></div>`;
  const steps = [
    { k:t("pvm.plan"), v:D.Rp, base:true },
    { k:t("pvm.vol"), v:D.volumen, tip:t("pvm.vol.tip") },
    { k:t("pvm.mix"), v:D.mix, tip:t("pvm.mix.tip") },
    { k:t("pvm.price"), v:D.precio, tip:t("pvm.price.tip") },
    { k:t("pvm.real"), v:D.Ra, base:true }
  ];
  const maxEf = Math.max(1, ...steps.filter(s=>!s.base).map(s=>Math.abs(s.v)));
  const bar = s=> s.base ? "" : `<div class="pvm-track"><div class="pvm-bar ${s.v>=0?"pos":"neg"}" style="width:${(Math.abs(s.v)/maxEf*50).toFixed(1)}%;${s.v>=0?"left:50%":"right:50%"}"></div><i></i></div>`;
  const bridge = steps.map(s=> `<div class="pvm-row ${s.base?"base":""}" ${s.tip?`title="${esc(s.tip)}"`:""}>
      <span class="pvm-k">${esc(s.k)}</span>${s.base?`<span></span>`:bar(s)}
      <span class="num pvm-v ${s.base?"":(s.v>=0?"pos":"neg")}">${s.base?moneyRound(s.v):(s.v>=0?"+":"−")+moneyRound(Math.abs(s.v))}</span></div>`).join("");
  // Frase: cuál efecto explica más
  const ef = [["vol",D.volumen],["mix",D.mix],["price",D.precio]].sort((a,b)=> Math.abs(b[1])-Math.abs(a[1]))[0];
  const frase = Math.abs(D.Ra-D.Rp)<0.5 ? t("pvm.say.flat") : t("pvm.say."+ef[0]+(ef[1]>=0?".up":".down"),{v:moneyRound(Math.abs(ef[1]))});
  const rowsG = D.rows.map(r=> `<tr><td><b>${esc(r.linea)}</b></td>
      <td class="num">${qty(Math.round(r.up))}</td><td class="num">${qty(r.ua)}</td>
      <td class="num">${moneyRound(r.pp)}</td><td class="num">${r.ua?moneyRound(r.pa):"—"}</td>
      <td class="num ${r.efCant>=0?"pos":"neg"}">${r.efCant>=0?"+":"−"}${moneyRound(Math.abs(r.efCant))}</td>
      <td class="num ${r.efPrecio>=0?"pos":"neg"}">${r.efPrecio>=0?"+":"−"}${moneyRound(Math.abs(r.efPrecio))}</td></tr>`).join("");
  const notas = [
    D.parcial&&D.parcial.length ? t("plan.partial.note",{m:fpaParcialTxt(D.parcial)}) : "",
    Math.abs(D.fuera)>0.5 ? t("pvm.fuera",{v:moneyRound(D.fuera)}) : "",
    D.sinUnidades.length ? t("pvm.sinU",{l:D.sinUnidades.join(", ")}) : ""
  ].filter(Boolean).join(" ");
  return `<div class="u-mb5 panel chart">
    <p class="ctitle">${t("pvm.title")}</p>
    <p class="csub">${t("pvm.sub")}</p>
    <div class="pvm-say">${frase}</div>
    <div class="pvm">${bridge}</div>
    <div class="u-mt3 table-scroll"><table class="fintbl">
      <thead><tr><th>${t("fin.th.line")}</th><th class="r">${t("pvm.th.up")}</th><th class="r">${t("pvm.th.ua")}</th><th class="r">${t("pvm.th.pp")}</th><th class="r">${t("pvm.th.pa")}</th><th class="r" title="${esc(t("pvm.th.cant.tip"))}">${t("pvm.th.cant")}</th><th class="r">${t("pvm.th.precio")}</th></tr></thead>
      <tbody>${rowsG}</tbody></table></div>
    ${notas?`<p class="fin-help">${notas}</p>`:""}
  </div>`;
}

/* ============================================================
   v89 — SIMULADOR DE ESCENARIOS ("mes tipo")
   ------------------------------------------------------------
   Base = últimos 30 días reales, por juego (≈ un mes): unidades,
   precio promedio (ingreso neto / u), costo unitario FIFO y la
   proporción de costos variables de venta (comisiones, envío,
   horas) sobre el ingreso. Estructura = gastos del mes en curso.
   Escenario: U' = U × (1+vol) × (1+vol juego)   ← el vol por juego es el MIX
              P' = P × (1+precio)                 (el costo unitario no cambia)
   → Ingreso', COGS', variables', contribución', EBITDA', equilibrio.
   Todo se recalcula en el navegador sin guardar nada.
   ============================================================ */
function simBase(){
  const a = finAnchor(), f = new Date(a); f.setDate(f.getDate()-29);
  const A = finAggregate(finSaleLines({ from:finIso(f), to:finIso(a), linea:"", idioma:"", pais:"", vend:"", soc:null }));
  const stk = (typeof pmStockPorJuego==="function") ? pmStockPorJuego() : {};
  const games = Object.keys(A.bySaga).filter(k=> (A.bySaga[k].units||0)>0).map(k=>{
    const s = A.bySaga[k];
    return { k, u:s.units, p:s.net/s.units, c:s.cogs/s.units, vc: s.net>0 ? Math.max(0,(s.net - s.cogs - s.contrib)/s.net) : 0,
             disp: stk[k] ? (stk[k].u||0)+(stk[k].tu||0) : 0 };
  }).sort((x,y)=> y.u*y.p - x.u*x.p);
  // estructura: mes en curso; si no tiene gastos, el último mes que tenga
  let gx = 0;
  if(typeof gxBreakEvenMes==="function" && gxHasAny()){
    let mk = finCurMonth();
    for(let i=0;i<12;i++){ const B = gxBreakEvenMes(mk); if(B.total>0.005){ gx = B.total; break; } mk = gxAddM(mk,-1); }
  }
  const ver = fpaVigente(), cm = finCurMonth();
  const plan = ver ? (ver.filas||[]).filter(x=> x.mes===cm).reduce((s,x)=> s+(x.ventas||0), 0) : 0;
  return { games, gx, plan };
}
function simCalc(B, vol, pr, mix){
  let R=0, C=0, V=0; const faltan = [];
  B.games.forEach(g=>{
    const u = g.u*(1+vol)*(1+(mix[g.k]||0)), p = g.p*(1+pr);
    const r = u*p; R+=r; C+=u*g.c; V+=r*g.vc;
    if(u > g.disp + 0.5) faltan.push({ k:g.k, u:Math.ceil(u-g.disp) });
  });
  const gp = R-C, contrib = gp-V, cPct = R>0 ? contrib/R : 0;
  return { R, gp, gpPct: R>0?gp/R:0, contrib, cPct, ebitda: contrib-B.gx, pe: cPct>0 && B.gx>0 ? B.gx/cPct : null, faltan };
}
function simuladorHTML(){
  const B = simBase(); window._simBase = B;
  if(!B.games.length) return "";
  const mixRows = B.games.map(g=> `<label class="sim-mix"><span>${esc(g.k)}</span>
      <input class="inp num" type="number" step="5" value="0" data-sim-mix="${esc(g.k)}" aria-label="${esc(g.k)}"><em>%</em></label>`).join("");
  return `<div class="u-mb5 panel chart sim">
    <div class="u-flex u-between u-items-start u-gap3 u-wrap">
      <div><p class="ctitle">${t("sim.title")}</p><p class="u-m0 csub">${t("sim.sub")}</p></div>
      <button type="button" class="btn ghost sm" data-sim-reset>${t("sim.reset")}</button>
    </div>
    <div class="sim-grid">
      <div class="sim-in">
        <div class="sim-sl"><label for="sim_vol">${t("sim.vol")} <b id="sim_volv">0%</b></label><input type="range" id="sim_vol" min="-50" max="100" step="1" value="0"></div>
        <div class="sim-sl"><label for="sim_pr">${t("sim.price")} <b id="sim_prv">0%</b></label><input type="range" id="sim_pr" min="-30" max="30" step="1" value="0"></div>
        <p class="sim-h">${t("sim.mix")}</p>
        <div class="sim-mixes">${mixRows}</div>
      </div>
      <div class="sim-out" id="simOut" aria-live="polite"></div>
    </div>
    <p class="fin-help">${t("sim.help")}</p>
  </div>`;
}
function simRecalc(){
  const B = window._simBase, out = document.getElementById("simOut"); if(!B || !out) return;
  const vol = (+document.getElementById("sim_vol").value||0)/100, pr = (+document.getElementById("sim_pr").value||0)/100;
  document.getElementById("sim_volv").textContent = (vol>0?"+":"")+Math.round(vol*100)+"%";
  document.getElementById("sim_prv").textContent = (pr>0?"+":"")+Math.round(pr*100)+"%";
  const mix = {}; document.querySelectorAll("[data-sim-mix]").forEach(i=> mix[i.dataset.simMix] = (parseNum(i.value)||0)/100);
  const b = simCalc(B, 0, 0, {}), s = simCalc(B, vol, pr, mix);
  const d = (x,y,pct)=>{ const v = y-x; if(Math.abs(v) < (pct?0.0005:0.5)) return `<span class="sim-d">—</span>`;
    return `<span class="sim-d ${v>0?"pos":"neg"}">${v>0?"▲ +":"▼ −"}${pct?nfDec(1).format(Math.abs(v)*100)+" pp":moneyRound(Math.abs(v))}</span>`; };
  const row = (lbl, x, y, fmt, pct, cls)=> `<tr class="${cls||""}"><td>${lbl}</td><td class="num">${fmt(x)}</td><td class="num"><b>${fmt(y)}</b></td><td class="num">${d(x,y,pct)}</td></tr>`;
  const m = v=> moneyRound(v), pc = v=> fmtPct(v);
  let html = `<table class="fintbl"><thead><tr><th></th><th class="r">${t("sim.th.base")}</th><th class="r">${t("sim.th.scen")}</th><th class="r">${t("sim.th.diff")}</th></tr></thead><tbody>`
    + row(t("fin.s.sales"), b.R, s.R, m)
    + row(t("fin.kpi.gmpct"), b.gpPct, s.gpPct, pc, true)
    + row(t("an.kpi.contrib"), b.contrib, s.contrib, m, false, "total")
    + (B.gx>0 ? row(t("sim.gx"), -B.gx, -B.gx, m) + row(t("pnl.ebitda.short"), b.ebitda, s.ebitda, m, false, "total") : "")
    + `</tbody></table>`;
  const notes = [];
  if(B.gx>0){ notes.push(s.pe!=null ? (s.R>=s.pe ? t("sim.pe.ok",{v:moneyRound(s.pe)}) : t("sim.pe.ko",{v:moneyRound(s.pe), f:moneyRound(s.pe-s.R)})) : t("sim.pe.na")); }
  else notes.push(t("sim.nogx"));
  if(B.plan>0) notes.push(s.R>=B.plan ? t("sim.plan.ok",{v:moneyRound(B.plan)}) : t("sim.plan.ko",{v:moneyRound(B.plan), f:moneyRound(B.plan-s.R)}));
  if(s.faltan.length) notes.push(`<span class="neg">${t("sim.stock",{l:s.faltan.map(x=> esc(x.k)+" ("+qty(x.u)+" u)").join(", ")})}</span>`);
  out.innerHTML = html + `<ul class="sim-notes">${notes.map(n=>`<li>${n}</li>`).join("")}</ul>`;
}
function wireSimulador(){
  const root = document.querySelector(".sim"); if(!root) return;
  root.querySelectorAll("input").forEach(i=> i.oninput = simRecalc);
  const r = root.querySelector("[data-sim-reset]");
  if(r) r.onclick = ()=>{ root.querySelectorAll("input[type=range]").forEach(i=> i.value=0); root.querySelectorAll("[data-sim-mix]").forEach(i=> i.value=0); simRecalc(); };
  simRecalc();
}

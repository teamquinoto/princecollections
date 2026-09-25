/* ============================================================
   gestordestock — 11b-view-pnl.js
   Se carga DESPUÉS de 11-view-analisis.js (usa pnlAggregate,
   pnlWaterfallSVG, trendChartSVG, finFilterBarHTML).
   ------------------------------------------------------------
   Pestaña P&L (Estado de resultados). Bilingüe. Admin-only.
   v55:
     · Usa los MISMOS filtros que Análisis (finFiltros): período,
       línea, idioma, país y vendedor. Antes sólo tenía MTD/QTD/YTD.
     · QTD = trimestre calendario (antes: últimos 3 meses móviles).
     · Comparación contra el MISMO período del año anterior (antes:
       la ventana inmediatamente previa, que con estacionalidad engaña).
     · Tabla de estado de resultados con "% s/ ingreso neto" y año anterior.
     · Tendencia del RESULTADO (contribución), no del ingreso.
   ============================================================ */
let pnlDrill = null;    // vendedorId expandido en la tabla (drill-down)

/* Presupuesto del período (v87): UNA sola fuente.
   · Si hay plan FP&A vigente, el P&L compara contra ESE plan, a la fecha y con los
     mismos filtros de juego/idioma que usan Resumen y Plan de ventas. Así los tres
     dicen lo mismo. El plan FP&A no trae contribución: esa fila no se muestra.
   · Sólo si NO hay plan FP&A se usan los "Objetivos por mes" viejos de Configuración
     (legacy, empresa entera). */
function pnlBudget(from, to){
  if(typeof fpaVigente==="function" && fpaVigente()){
    const d = finDims(finFiltros);
    const F = fpaForQuery({ from, to, linea:d.linea, idioma:d.idioma });
    return { src:"fpa", net:round2(F.A.ventas), contrib:null, any:F.A.ventas>0, ver:F.ver, parcial:F.parcial };
  }
  // v104: los objetivos salen SOLO del plan de ventas (FP&A). Ya no hay objetivos manuales.
  return { src:"none", net:0, contrib:null, any:false };
}

/* Ventas de un vendedor en el período (drill-down), respetando los filtros activos. */
function pnlSellerSales(vid, from, to, soc){
  return finSaleLines(Object.assign({ from:from||"", to:to||"", soc:soc||null }, finDims(finFiltros), { vend:vid }))
    .map(r=>({ fecha:r.fecha, nombre:r.nombre||r.sku||"—", qty:r.cantidad, revenue:r.revenue, margin:round2(r.revenue-r.cogs) }))
    .sort((a,b)=> a.fecha<b.fecha?1:-1);
}

function viewPnL(){
  const r   = finRange();
  const soc = socFocoActual();
  const P   = pnlAggregate(r.from, r.to, soc);
  const pr  = finPriorRange(r);
  const Pp0 = pr ? pnlAggregate(pr.from, pr.to, soc) : null;
  // Sin ventas en el mismo período del año anterior no hay contra qué comparar:
  // se ocultan deltas y columnas (antes mostraba "año anterior 0" y variación = todo).
  const Pp  = (Pp0 && Pp0.units>0) ? Pp0 : null;
  /* v83: gastos de estructura → resultado operativo (copias; pnlAggregate cachea el original) */
  const O  = (typeof gxPnL==="function") ? gxPnL(P, r.from, r.to, soc) : null;
  const Op = (O && O.show && Pp) ? gxPnL(Pp, pr.from, pr.to, soc) : null;
  const showOpex = !!(O && O.show);
  const dimsOn = finDimsActive();
  const B   = pnlBudget(r.from, r.to);
  const pctNet = P.net>0 ? fmtPct(P.contribPct) : "—";
  const subTxt = soc ? t("pnl.sub.soc",{soc:esc(storeName(soc))}) : t("pnl.sub");

  const head = `
  <div class="head"><div class="title"><h2>${t("pnl.title")}</h2><p>${subTxt}</p></div>
    <div class="u-gap2 actions">
      ${isAdmin()?`<button class="btn primary" id="pnl_export">${t("pnl.export")}</button>`:""}
    </div>
  </div>
  ${finFilterBarHTML()}
  ${soc ? `<div class="u-mb3 banner">${t("pnl.socfocus",{soc:`<b>${esc(storeName(soc))}</b>`})}</div>` : ""}`;

  /* v88: los KPIs siguen la cascada del estado de resultados (Ingreso → Margen bruto →
     Contribución → Resultado operativo). El COGS ya está en el waterfall y en la tabla.
     El destacado es la última línea disponible: resultado operativo, o contribución si
     no hay gastos de estructura aplicables. */
  const kpis = `
  <div class="kpis">
    <div class="kpi"><div class="lbl">${t("pnl.kpi.net")}</div><div class="val">${bigMoney(P.net)}</div>
      <div class="sub">${t("pnl.kpi.cogssub",{n:qty(P.units)})}</div>${Pp?finDelta(P.net, Pp.net):""}</div>
    <div class="kpi"><div class="lbl">${t("pnl.kpi.gross")}</div><div class="val">${bigMoney(P.gp)}</div>
      <div class="sub">${P.net>0?fmtPct(P.gpPct):"—"} ${t("fin.ofnet")}</div>${(Pp&&Pp.net>0&&P.net>0)?finDelta(P.gpPct, Pp.gpPct, {kind:"pp"}):""}</div>
    <div class="kpi ${showOpex?"":"kpi-hero"}">
      <div class="lbl">${t("pnl.kpi.contrib")}</div>
      <div class="val ${P.contrib<0?"neg":""}">${bigMoney(P.contrib)}</div>
      <div class="sub">${t("pnl.kpi.contribsub",{p:pctNet})}</div>
      ${Pp?finDelta(P.contrib, Pp.contrib):""}</div>
    ${(showOpex && O.hasBajo) ? `<div class="kpi"><div class="lbl">${t("pnl.ebitda.short")}</div><div class="val ${O.ebit<0?"neg":""}">${bigMoney(O.ebit)}</div>
      <div class="sub">${P.net>0?fmtPct(O.ebitPct):"—"} ${t("fin.ofnet")}</div></div>
    <div class="kpi kpi-hero"><div class="lbl">${t("pnl.neto")}</div><div class="val ${O.neto<0?"neg":""}">${bigMoney(O.neto)}</div>
      <div class="sub">${t("pnl.neto.sub",{p:P.net>0?fmtPct(O.netoPct):"—"})}</div></div>` : ""}
    ${(showOpex && !O.hasBajo) ? `<div class="kpi kpi-hero"><div class="lbl">${t("gx.pnl.ebit")}${(O.sinGx&&O.sinGx.length)?` <span class="kpi-tag" title="${esc(t("gx.nogx.tip"))}">${t("gx.nogx.kpitag")}</span>`:""}</div><div class="val ${(O.sinGx&&O.sinGx.length)?"warn-ink":(O.ebit<0?"neg":"")}">${bigMoney(O.ebit)}</div>
      <div class="sub">${t("gx.pnl.ebitsub",{v:moneyRound(O.opex), p:P.net>0?fmtPct(O.ebitPct):"—"})}</div>${Op?finDelta(O.ebit, Op.ebit):""}</div>` : ""}
  </div>
  ${(O && O.blocked) ? `<div class="banner-under banner">${t("gx.pnl.blocked")}</div>` : ""}
  ${(showOpex && O.sinGx && O.sinGx.length) ? `<div class="banner-under banner warn">${t("gx.nogx.banner",{m:O.sinGx.map(finMonthLabel).join(", ")})}</div>` : ""}
  ${(pr && !Pp) ? `<p class="note-under finbar-note">${t("fin.delta.noprioronce",{from:fmtDate(pr.from),to:fmtDate(pr.to)})}</p>` : ""}`;

  const waterfall = `
  <div class="u-mb5 panel chart">
    <p class="ctitle">${t("pnl.wf.title")}</p>
    <p class="csub">${t("fin.wf.sub")}</p>
    ${P.units ? `<div class="u-scroll-x">${pnlWaterfallSVG(showOpex ? O : P)}</div>` : `<div class="cempty">${t("pnl.nodata")}</div>`}
  </div>`;

  /* --- Estado de resultados en tabla: importe, % s/ ingreso neto, año anterior, variación.
     Convención de signos ÚNICA (igual que el waterfall y el Excel): ingresos en
     positivo, costos en negativo. Así la columna de variación se lee siempre igual:
     "+" mejora el resultado, "−" lo empeora. --- */
  const pc = (v,base)=> base>0 ? fmtPct(v/base) : "—";
  const varCell = (cur, prev)=>{
    if(!Pp || prev==null) return `<td class="num">—</td>`;
    const d = cur-prev; if(Math.abs(d)<0.005) return `<td class="num">—</td>`;
    return `<td class="num ${d>0?"pos":"neg"}">${d>0?"+":"−"}${moneyRound(Math.abs(d))}</td>`;
  };
  // v88: vista de gestión en unidades enteras (los centavos quedan en el detalle y en el Excel)
  const row = (label, cur, prev, cls)=> `<tr class="${cls||""}"><td>${label}</td><td class="num">${moneyRound(cur)}</td><td class="num">${pc(Math.abs(cur),P.net)}</td>`
      + (Pp ? `<td class="num">${moneyRound(prev||0)}</td>${varCell(cur, prev)}` : "") + `</tr>`;
  const sell = X=> round2(X.costos.envio+X.costos.labor+X.costos.comision+X.costos.otro);
  const costBreak = ["envio","labor","comision","otro"].filter(k=> Math.abs(P.costos[k])>=0.005 || (Pp && Math.abs(Pp.costos[k])>=0.005))
      .map(k=> row(costoTipoLabel(k), -P.costos[k], Pp?-Pp.costos[k]:null, "ind")).join("");
  /* Gastos de estructura por grupo (administración / comercialización), con sus categorías indentadas. */
  const gxRows = grp=>{
    if(!showOpex) return "";
    const tot = grp==="com" ? O.opexCom : O.opexAdm, totP = Op ? (grp==="com" ? Op.opexCom : Op.opexAdm) : null;
    if(Math.abs(tot)<0.005 && !(totP && Math.abs(totP)>=0.005)) return "";
    const cats = [...new Set(Object.keys(O.gx.byCat).concat(Op ? Object.keys(Op.gx.byCat) : []))]
      .filter(id=> (gxCat(id).grupo==="com"?"com":"adm")===grp)
      .sort((a,b)=> (O.gx.byCat[b]||0)-(O.gx.byCat[a]||0));
    return row(t("gx.pnl."+grp), -tot, totP!=null?-totP:null)
      + cats.map(id=> row(esc(gxCatLabel(id)), -(O.gx.byCat[id]||0), Op?-(Op.gx.byCat[id]||0):null, "ind")).join("");
  };
  /* v89: debajo del EBITDA → amortizaciones, resultado operativo (EBIT), financieros,
     resultado antes de impuestos, provisión de impuesto y resultado neto. */
  const bajoRows = ()=>{
    if(!showOpex || !O.hasBajo) return "";
    const catRows = grp=> Object.keys(O.gx.byCatBajo).filter(id=> gxGrupo(id)===grp)
      .map(id=> row(esc(gxCatLabel(id)), -(O.gx.byCatBajo[id]||0), Op&&Op.gx?-((Op.gx.byCatBajo||{})[id]||0):null, "ind")).join("");
    const g = k=> Op && Op[k]!=null ? Op[k] : null;
    return row(t("pnl.amort"), -O.amort, g("amort")!=null?-g("amort"):null) + catRows("amort")
      + row(t("pnl.ebitop"), O.ebitOp, g("ebitOp"), "total")
      + row(t("pnl.fin"), -O.fin, g("fin")!=null?-g("fin"):null) + catRows("fin")
      + row(t("pnl.ebt"), O.ebt, g("ebt"), "total")
      + row(t("pnl.tax"), -O.tax, g("tax")!=null?-g("tax"):null) + catRows("imp")
      + row(t("pnl.neto"), O.neto, g("neto"), "total");
  };
  const statement = P.units ? `
  <div class="u-mb5 panel chart">
    <p class="ctitle">${t("fin.is.title")}</p>
    <p class="csub">${Pp ? t("fin.is.sub",{from:fmtDate(pr.from), to:fmtDate(pr.to)}) : (pr ? t("fin.is.subnodata") : t("fin.is.subnoprior"))}</p>
    <div class="table-scroll"><table class="fintbl">
      <thead><tr><th>${t("fin.is.concept")}</th><th class="r">${t("fin.is.amount")}</th><th class="r">${t("fin.is.pctnet")}</th>${Pp?`<th class="r">${t("fin.is.prior")}</th><th class="r">${t("fin.is.var")}</th>`:""}</tr></thead>
      <tbody>
        ${row(t("xl.is.sales"), P.sales, Pp?Pp.sales:null)}
        ${(Math.abs(P.shipping)>=0.005||(Pp&&Pp.shipping))?row(t("xl.is.shipping"), P.shipping, Pp?Pp.shipping:null, "ind"):""}
        ${(Math.abs(P.cargos)>=0.005||(Pp&&Pp.cargos))?row(t("xl.is.cargos"), P.cargos, Pp?Pp.cargos:null, "ind"):""}
        ${row(t("xl.is.net"), P.net, Pp?Pp.net:null, "sub")}
        ${row(t("xl.is.cogs"), -P.cogs, Pp?-Pp.cogs:null)}
        ${row(t("xl.is.gp"), P.gp, Pp?Pp.gp:null, "sub")}
        ${row(t("xl.is.comm"), -P.commission, Pp?-Pp.commission:null)}
        ${row(t("xl.is.selling"), -sell(P), Pp?-sell(Pp):null)}
        ${costBreak}
        ${row(t("xl.is.contrib"), P.contrib, Pp?Pp.contrib:null, showOpex?"sub":"total")}
        ${showOpex ? gxRows("adm") + gxRows("com") + row(t(O.hasBajo?"pnl.ebitda":"gx.pnl.ebit"), O.ebit, Op?Op.ebit:null, "total") + bajoRows() : ""}
      </tbody>
    </table></div>
  </div>` : "";

  /* --- Real vs presupuesto. El presupuesto es de la empresa entera: contra una
     sociedad o un corte (línea, idioma…) engaña, así que con foco o filtros se oculta. --- */
  const varRow=(label,act,bud)=>{ const d=act-bud, up=d>=0;
    return `<tr><td>${label}</td><td class="num">${moneyRound(act)}</td><td class="num">${moneyRound(bud)}</td>
      <td class="num ${up?"pos":"neg"}">${up?"▲ +":"▼ −"}${moneyRound(Math.abs(d))} ${bud!==0?"("+fmtPct(Math.abs(d/bud))+")":""}</td></tr>`; };
  // Con plan FP&A: juego/idioma sí se pueden comparar (el plan los tiene); país, vendedor
  // y sociedad no. Con los objetivos legacy (empresa entera), cualquier corte lo oculta.
  const dF = finDims(finFiltros);
  const varHidden = B.src==="fpa" ? !!(soc || dF.pais || dF.vend) : !!(soc || dimsOn);
  const varSrc = B.src==="fpa"
    ? t("pnl.var.src.fpa",{name:esc(B.ver.nombre)}) + ((B.parcial&&B.parcial.length) ? " " + t("plan.partial.note",{m:fpaParcialTxt(B.parcial)}) : "")
    : t("pnl.var.src.legacy");
  const variance = varHidden ? `<p class="u-m0 u-mb5 csub">${t("fin.var.hidden")}</p>` : `
  <div class="u-mb5 panel chart">
    <p class="ctitle">${t("pnl.var.title")}</p>
    ${B.any ? `<p class="csub">${varSrc}</p><div class="table-scroll"><table class="fintbl">
      <thead><tr><th></th><th class="r">${t("pnl.var.actual")}</th><th class="r">${t("pnl.var.budget")}</th><th class="r">${t("pnl.var.variance")}</th></tr></thead>
      <tbody>${varRow(t("pnl.kpi.net"),P.net,B.net)}${B.contrib!=null?varRow(t("pnl.kpi.contrib"),P.contrib,B.contrib):""}</tbody>
    </table></div>` : `<p class="u-m0 hint">${t(B.src==="fpa"?"pnl.var.nofpa":"pnl.var.nobudget")}</p>`}
  </div>`;

  /* --- Tendencia del resultado (contribución) --- */
  const months = finTrimMeses(finMonths(r, P, { byMonth:{} }), m=> m.net || m.units);   // v88
  const trend = months.map(m=>({ label:m.label, value: showOpex ? round2(m.contrib - (O.gx.byMonth[m.mk]||0)) : m.contrib, drill:"m:"+m.mk,
    muted: !!(showOpex && O.sinGx && O.sinGx.includes(m.mk)), note: t("gx.nogx.tip") }));

  /* --- Tabla por vendedor + drill-down --- */
  const sellerEntries = Object.entries(P.perVend).map(([vid,s])=>{
    const gm=round2(s.sales-s.cogs);
    const contrib=round2(gm + s.cargos + s.shipping - s.commission - s.costos);
    return { vid, nombre:s.nombre||"—", units:s.units, revenue:round2(s.sales), gm, gmPct:s.sales>0?gm/s.sales:null, contrib };
  }).sort((a,b)=> b.contrib - a.contrib);
  const tot = sellerEntries.reduce((a,x)=>({units:a.units+x.units, revenue:a.revenue+x.revenue, gm:a.gm+x.gm, contrib:a.contrib+x.contrib}),{units:0,revenue:0,gm:0,contrib:0});
  const sellerRows = sellerEntries.length ? sellerEntries.map(rw=>{
    const loss=rw.contrib<0, open=pnlDrill===rw.vid;
    let html = `<tr data-pnldrill="${esc(rw.vid)}" tabindex="0" style="cursor:pointer;${loss?"background:var(--neg-bg)":""}" aria-expanded="${open}">
      <td>${open?"▾ ":"▸ "}${esc(rw.nombre)}</td>
      <td class="num">${qty(rw.units)}</td>
      <td class="num">${moneyRound(rw.revenue)}</td>
      <td class="num">${moneyRound(rw.gm)}</td>
      <td class="num">${fmtPct(rw.gmPct)}</td>
      <td class="u-fw700 num ${loss?"neg":""}">${moneyRound(rw.contrib)}</td>
    </tr>`;
    if(open){
      const sales=pnlSellerSales(rw.vid, r.from, r.to, soc);
      const inner = sales.length ? sales.map(x=>`<tr>
          <td class="num">${esc(fmtDate(x.fecha))}</td><td>${esc(x.nombre)}</td>
          <td class="num">${qty(x.qty)}</td><td class="num">${money(x.revenue)}</td>
          <td class="num ${x.margin<0?"neg":""}">${money(x.margin)}</td>
        </tr>`).join("") : `<tr><td class="u-center u-muted u-p3" colspan="5">${t("pnl.nodata")}</td></tr>`;
      html += `<tr><td colspan="6" style="padding:0;background:var(--surface-2)"><div style="padding:6px 12px 10px">
        <table class="fintbl"><thead><tr>
          <th>${t("pnl.drill.date")}</th><th>${t("pnl.drill.product")}</th><th class="r">${t("pnl.drill.qty")}</th><th class="r">${t("pnl.th.revenue")}</th><th class="r">${t("pnl.drill.margin")}</th>
        </tr></thead><tbody>${inner}</tbody></table>
      </div></td></tr>`;
    }
    return html;
  }).join("") : `<tr><td class="u-center u-muted u-p5" colspan="6">${t("pnl.nodata")}</td></tr>`;

  const grid = `
  <div class="chart-grid">
    <div class="u-span-all panel chart">
      <p class="ctitle">${showOpex?t("gx.trend.title"):t("fin.trend.title")}</p>
      <p class="csub">${showOpex?t("gx.trend.sub"):t("fin.trend.sub")} ${t("dr.hint.month")}</p>
      ${trend.length ? trendChartSVG(trend, money, "var(--chart-1)") : `<div class="cempty">${t("pnl.nodata")}</div>`}
    </div>
    <div class="u-span-all panel chart">
      <p class="ctitle">${t("pnl.byseller.title")}</p>
      <p class="csub">${t("fin.byseller.sub")} · ${t("pnl.drill.hint")}</p>
      <div class="table-scroll"><table class="fintbl">
        <thead><tr>
          <th>${t("pnl.th.seller")}</th><th class="r">${t("pnl.th.units")}</th><th class="r">${t("pnl.th.revenue")}</th>
          <th class="r">${t("pnl.th.gross")}</th><th class="r">${t("pnl.th.marginpct")}</th><th class="r">${t("pnl.th.contrib")}</th>
        </tr></thead>
        <tbody>${sellerRows}</tbody>
        <tfoot><tr>
          <td>${t("common.total")}</td><td class="num">${qty(tot.units)}</td><td class="num">${moneyRound(tot.revenue)}</td>
          <td class="num">${moneyRound(tot.gm)}</td><td class="num">${tot.revenue>0?fmtPct(tot.gm/tot.revenue):"—"}</td>
          <td class="num ${tot.contrib<0?"neg":""}">${moneyRound(tot.contrib)}</td>
        </tr></tfoot>
      </table></div>
    </div>
  </div>`;

  const notes = `<p class="fin-notes">${t("pnl.notes")}</p>`;
  return head + kpis + waterfall + statement + variance + grid + notes;
}

function wirePnL(){
  const m = document.getElementById("main");
  if(!m) return;
  wireFinFilterBar();
  wireDrills();
  m.querySelectorAll("[data-pnldrill]").forEach(tr=>{
    const toggle=()=>{ const v=tr.dataset.pnldrill; pnlDrill=(pnlDrill===v)?null:v; render(); };
    tr.onclick=toggle;
    tr.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(); } };
  });
  const ex = document.getElementById("pnl_export");
  if(ex) ex.onclick=()=>{ const r=finRange(); exportPnL(r.from||"", r.to||"", socFocoActual()); };
}

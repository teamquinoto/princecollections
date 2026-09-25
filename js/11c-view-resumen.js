/* ============================================================
   gestordestock — 11c-view-resumen.js
   VISTA: Resumen ejecutivo
   ------------------------------------------------------------
   La foto del negocio en una pantalla:
     · 6 KPIs con tendencia de 12 meses, comparados contra el plan
       FP&A si hay uno vigente que cubra el período (si no, contra el
       mismo período del año anterior).
     · Dónde venimos bien y dónde venimos mal, por línea.
     · Riesgos calculados sobre stock, ventas, compras y plan.
     · Decisiones pendientes, cada una con su acción.
   Todo sale de 05-metrics.js / 06-fpa.js y respeta los filtros
   compartidos de Finanzas.
   ============================================================ */

/* Minigráfico de tendencia (SVG). values: números o null (mes sin dato). */
function sparkSVG(values, color){
  const vs = (values||[]).map(v=> (v==null||!isFinite(v)) ? null : v);
  const nums = vs.filter(v=>v!=null);
  if(nums.length<2) return `<div class="spark-empty"></div>`;
  const W=160, H=34, pad=3, min=Math.min(...nums), max=Math.max(...nums), dom=(max-min)||1;
  const x = i=> pad + i*(W-2*pad)/(vs.length-1), y = v=> H-pad-(v-min)/dom*(H-2*pad);
  let d="", pen=false;
  vs.forEach((v,i)=>{ if(v==null){ pen=false; return; } d += (pen?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)+" "; pen=true; });
  const li = vs.length-1 - [...vs].reverse().findIndex(v=>v!=null);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(li).toFixed(1)}" cy="${y(vs[li]).toFixed(1)}" r="2.6" fill="${color}"/></svg>`;
}

/* Últimos 12 meses hasta el fin del período (para los minigráficos). */
function resumenSeries(q){
  const r = finRange();
  const end = r.to ? new Date(r.to+"T12:00:00") : finAnchor();
  const from = finIso(new Date(end.getFullYear(), end.getMonth()-11, 1)), to = finIso(end);
  const q12 = Object.assign({}, q, { from, to });
  const rows = finSaleLines(q12);
  const A = finAggregate(rows), P = finPurchases(q12);
  const months = finMonths({from,to}, A, P);
  return { rows, months, from, to };
}

/* ---------- Riesgos: reglas explícitas, cada una con umbral y acción ---------- */
function resumenRiesgos(q, ctx){
  const out = [];
  const d = { linea:q.linea, idioma:q.idioma };
  const a = finAnchor(), iso = n=>{ const x=new Date(a); x.setDate(x.getDate()-n); return finIso(x); };
  const prods = productosVendibles().filter(p=> finProdMatch(p, d));

  // 1) Stock sin rotación: capas FIFO que entraron hace más de 90 días y siguen ahí
  const lim90 = iso(90); let agedV=0; const agedSkus=new Set();
  prods.forEach(p=> STORE_IDS.forEach(s=> fifoLayers(p,s).forEach(L=>{
    if(L.cantidad>0 && (L.fecha||"").slice(0,10) < lim90){ agedV += L.cantidad*L.costoUnit; agedSkus.add(p.id); }
  })));
  if(agedV>0.5 && ctx.S.valuation>0){
    const share = agedV/ctx.S.valuation;
    out.push({ sev: share>=0.25?"high":"med", title:t("rk.aged.t",{v:finCompact(agedV)}), desc:t("rk.aged.d",{n:agedSkus.size, p:fmtPct(share,0)}), go:"prod-aged", goLabel:t("rk.go.prod") });
  }

  // 2) Sin stock con demanda reciente (venta del último mes en riesgo)
  const r30 = finSaleLines(Object.assign({}, q, { from:iso(30), to:finIso(a) }));
  const dem = {};
  r30.forEach(x=>{ const e=dem[x.productoId]=dem[x.productoId]||{u:0,v:0}; e.u+=x.cantidad; e.v+=x.revenue; });
  const outSkus = prods.filter(p=> stockTotalP(p)<=0 && dem[p.id]);
  if(outSkus.length){
    const v = outSkus.reduce((s,p)=>s+dem[p.id].v,0), u = outSkus.reduce((s,p)=>s+dem[p.id].u,0);
    // v88: mismo universo que "Productos para reponer" (Decisiones / Panel): se dice cuántos
    // de esos se vendieron en los últimos 30 días, así los dos números se entienden juntos.
    const nRep = prods.filter(p=> typeof necesitaPedido==="function" ? necesitaPedido(p) : stockTotalP(p)<=0).length;
    out.push({ sev: outSkus.length>=5?"high":"med", title:t("rk.out.t2",{n:outSkus.length, m:Math.max(nRep, outSkus.length)}), desc:t("rk.out.d",{u:qty(u), v:finCompact(v)}), go:"prod-sin", goLabel:t("rk.go.reorder") });
  }

  // 3) Compras en tránsito hace más de 30 días
  const lim30 = iso(30); let trV=0, trN=0;
  (db.compras||[]).forEach(c=>{
    if(c.status!==INVOICE_STATUS.IN_TRANSIT || (normISO(c.fecha)||"") >= lim30) return;
    const v = (c.lineas||[]).reduce((s,l)=> finProdMatch(prodById(l.productoId), d) ? s+(l.cantidad||0)*((l.costoTotal!=null)?l.costoTotal:(l.precio||0)) : s, 0);
    if(v>0){ trV+=v; trN++; }
  });
  if(trN) out.push({ sev:"med", title:t("rk.transit.t",{v:finCompact(trV)}), desc:t("rk.transit.d",{n:trN}), go:"compras", goLabel:t("rk.go.purch") });

  // 4) Líneas con margen cayendo 3 meses seguidos y por debajo de su promedio de 12 meses
  const bySm = {};
  ctx.series.rows.forEach(x=>{ if(!x.saga) return; const k=x.saga+"|"+x.mes; const e=bySm[k]=bySm[k]||{net:0,cogs:0}; e.net+=x.net; e.cogs+=x.cogs; });
  const mks = ctx.series.months.map(m=>m.mk);
  const falling = [];
  const sagas = [...new Set(ctx.series.rows.map(x=>x.saga).filter(Boolean))];
  sagas.forEach(sg=>{
    const pct = mks.map(mk=>{ const e=bySm[sg+"|"+mk]; return (e && e.net>0) ? (e.net-e.cogs)/e.net : null; });
    const last = pct.slice(-4).filter(v=>v!=null);
    if(last.length<4) return;
    const tot = mks.reduce((acc,mk)=>{ const e=bySm[sg+"|"+mk]; if(e){ acc.n+=e.net; acc.c+=e.cogs; } return acc; },{n:0,c:0});
    const avg = tot.n>0 ? (tot.n-tot.c)/tot.n : null;
    if(last[1]<last[0] && last[2]<last[1] && last[3]<last[2] && avg!=null && last[3]<avg) falling.push({ sg, from:last[0], to:last[3] });
  });
  if(falling.length){
    const f = falling.sort((a,b)=> (a.to-a.from)-(b.to-b.from))[0];
    out.push({ sev:"med", title:t("rk.margin.t",{line:f.sg}), desc:t("rk.margin.d",{a:fmtPct(f.from,0), b:fmtPct(f.to,0), more: falling.length>1 ? t("rk.margin.more",{n:falling.length-1}) : ""}), go:"linea:"+f.sg, goLabel:t("rk.go.line") });
  }

  // 5) Comprando más de lo que se vende en el período
  if(ctx.A.net>0 && ctx.P.total > ctx.A.net*1.2){
    out.push({ sev: ctx.P.total > ctx.A.net*1.5 ? "high":"low", title:t("rk.buy.t",{r:nfDec(2).format(ctx.P.total/ctx.A.net)}), desc:t("rk.buy.d",{p:finCompact(ctx.P.total), s:finCompact(ctx.A.net)}), go:"analisis", goLabel:t("rk.go.analysis") });
  }

  // 6) Stock por encima del objetivo del plan
  if(ctx.plan && ctx.plan.A.stockAny){
    const over = Object.entries(ctx.plan.A.byLinea).filter(([k,e])=> e.stockObj>0 && (ctx.S.bySaga[k]||{valuation:0}).valuation > e.stockObj*1.2)
      .map(([k,e])=>({ k, ratio:(ctx.S.bySaga[k].valuation/e.stockObj), v:ctx.S.bySaga[k].valuation, obj:e.stockObj })).sort((a,b)=>b.ratio-a.ratio);
    if(over.length){
      const o = over[0];
      out.push({ sev: o.ratio>=1.5?"high":"med", title:t("rk.stockobj.t",{line:o.k, r:nfDec(1).format(o.ratio)}), desc:t("rk.stockobj.d",{v:finCompact(o.v), obj:finCompact(o.obj), more: over.length>1?t("rk.margin.more",{n:over.length-1}):""}), go:"plan", goLabel:t("rk.go.plan") });
    }
  }

  // 7) Ventas con margen negativo en el período
  if(ctx.negSales.n){
    out.push({ sev: ctx.negSales.n>=3?"high":"med", title:t("rk.neg.t",{n:ctx.negSales.n}), desc:t("rk.neg.d",{v:finCompact(Math.abs(ctx.negSales.loss))}), go:"ventas", goLabel:t("rk.go.sales") });
  }

  const ord = { high:0, med:1, low:2 };
  return out.sort((a,b)=> ord[a.sev]-ord[b.sev]);
}

/* Ventas del período cuyo margen de productos (ingreso − COGS) es negativo. */
function resumenNegSales(rows){
  const by = {};
  rows.forEach(x=>{ by[x.ventaId] = (by[x.ventaId]||0) + (x.revenue - x.cogs); });
  const neg = Object.values(by).filter(v=> v < -0.005);
  return { n:neg.length, loss:neg.reduce((a,v)=>a+v,0) };
}

function viewResumen(){
  const q = finQuery(), r = { from:q.from, to:q.to };
  const rows = finSaleLines(q), A = finAggregate(rows);
  const P = finPurchases(q), S = finStock(q);
  const pr = finPriorRange(r);
  const Ap0 = pr ? finAggregate(finSaleLines(Object.assign({}, q, pr))) : null;
  const Ap = (Ap0 && Ap0.units>0) ? Ap0 : null;
  const Pp = (Ap && pr) ? finPurchases(Object.assign({}, q, pr)) : null;
  // Plan: sólo si cubre el período y no hay filtros que el plan no tiene (país, vendedor)
  const plan0 = (!q.pais && !q.vend && !q.soc) ? fpaForQuery(q) : null;   // v93: el plan es de la empresa entera
  const plan = (plan0 && plan0.A.ventas>0) ? plan0 : null;
  const series = resumenSeries(q);
  const dioI = finDiasInventarioInfo(S, q), dio = dioI ? dioI.dias : null;
  // v87: cobertura en meses con la MISMA ventana real que los días de stock (antes: cogs de
  // 3 meses / 3, que con menos historia también inflaba la cobertura).
  const cobertura = dio!=null ? dio/30.4 : null;
  const negSales = resumenNegSales(rows);
  const M = series.months;
  // v88: las mini-tendencias arrancan en el primer mes con datos (antes: 10 meses en cero y un pico)
  const Ms = finTrimMeses(M, m=> m.net || m.purch);

  const vsPlan = { vs:t("plan.vs") };
  // v93: con sociedad y plan cargado no se dice "no hay plan": se explica por qué no se compara
  const _socPlan = !!(q.soc && fpaVigente());
  const modeTxt = _socPlan ? (Ap ? t("rs.mode.yoy") : "") : plan ? t("rs.mode.plan",{name:esc(plan.ver.nombre)}) + ((plan.parcial&&plan.parcial.length) ? " " + t("plan.partial.note",{m:fpaParcialTxt(plan.parcial)}) : "") : (Ap ? t("rs.mode.yoy") : t("rs.mode.none"));
  // v93: con una sociedad elegida no hay plan contra qué comparar (el plan FP&A es consolidado)
  const modeTxtSoc = (q.soc && fpaVigente()) ? " " + t("rs.mode.socnoplan",{s:esc(storeName(q.soc))}) : "";

  /* --- KPIs --- */
  const kpi = (label, val, sub, delta, spark, cls)=> `<div class="kpi rs-kpi"><div class="lbl">${label}</div><div class="val ${cls||""}">${val}</div>${delta||""}<div class="sub">${sub}</div>${spark||""}</div>`;
  const dVentas = plan ? finDelta(A.net, plan.A.ventas, vsPlan) : (Ap ? finDelta(A.net, Ap.net) : "");
  const dMargen = (plan && plan.A.margenPct!=null && A.net>0) ? finDelta(A.gpPct, plan.A.margenPct, Object.assign({kind:"pp"},vsPlan)) : ((Ap && Ap.net>0 && A.net>0) ? finDelta(A.gpPct, Ap.gpPct, {kind:"pp"}) : "");
  const dContrib = Ap ? finDelta(A.contrib, Ap.contrib) : "";
  const dCompras = (plan && plan.A.comprasAny && plan.A.compras>0) ? finDelta(P.total, plan.A.compras, Object.assign({polarity:"down"},vsPlan)) : (Pp && Pp.total>0 ? finDelta(P.total, Pp.total, {polarity:"neutral"}) : "");
  const dStock = (plan && plan.A.stockAny && plan.A.stockObj>0) ? finDelta(S.valuation, plan.A.stockObj, {polarity:"down", vs:t("plan.vs.target")}) : "";
  /* v88: el Resumen es EL lugar de los KPIs. Dos filas de cuatro:
     arriba la cascada del P&L (ingreso → margen bruto → contribución → resultado
     operativo); abajo operación y balance (punto de equilibrio del mes, compras,
     stock, días). Análisis ya no repite estas tarjetas. */
  const O = (typeof gxPnL==="function") ? gxPnL(A, q.from, q.to, q.soc) : null;
  let ebitVal = "—", ebitSub = t("rs.kpi.ebit.nogx"), ebitCls = "", ebitTag = "";
  if(O && O.show){
    const inc = O.sinGx && O.sinGx.length;
    // v90: con amortizaciones/financieros/impuestos cargados, la última línea es el resultado NETO
    const fin = O.hasBajo ? O.neto : O.ebit;
    ebitVal = bigMoney(fin);
    ebitSub = (O.hasBajo
        ? t("rs.kpi.neto.sub",{e:moneyRound(O.ebit), p:A.net>0?fmtPct(O.netoPct):"—"})
        : t("rs.kpi.ebit.sub",{v:moneyRound(O.opex), p:A.net>0?fmtPct(O.ebitPct):"—"}))
      + (inc ? " · " + t("rs.kpi.ebit.inc",{m:O.sinGx.map(finMonthLabel).join(", ")}) : "");
    ebitCls = inc ? "warn-ink" : (fin<0 ? "neg" : "");
    if(inc) ebitTag = `<span class="kpi-tag" title="${esc(t("gx.nogx.tip"))}">${t("gx.nogx.kpitag")}</span>`;
  } else if(O && O.blocked){ ebitSub = t("gx.pnl.blocked"); }
  // Punto de equilibrio del MES EN CURSO (mismo cálculo que Gastos de estructura)
  const BE = (typeof gxBreakEvenMes==="function" && gxHasAny()) ? gxBreakEvenMes(finCurMonth(), q.soc) : null;
  let beVal = "—", beSub = t("rs.kpi.be.nogx"), beCls = "";
  if(BE && BE.pe!=null){
    beVal = bigMoney(BE.pe);
    if(BE.P.net >= BE.pe){ beSub = t("rs.kpi.be.ok",{v:moneyRound(BE.P.net)}); }
    else {
      const PJ = finMonthProjection({ soc:q.soc });
      beSub = t("rs.kpi.be.ko",{v:moneyRound(BE.pe-BE.P.net)}) + " " + (PJ.projNet >= BE.pe ? t("rs.kpi.be.projok",{p:moneyRound(PJ.projNet)}) : t("rs.kpi.be.projko",{p:moneyRound(PJ.projNet)}));
      beCls = PJ.projNet >= BE.pe ? "" : "neg";
    }
  } else if(BE && BE.sinGx){ beSub = t("gx.nogx.be"); }
  const monthTag = `<span class="kpi-tag">${esc(finMonthLabel(finCurMonth()))}</span>`;
  const kpis = `
  <div class="kpis kpis4 rs-kpis">
    ${kpi(t("fin.s.sales"), bigMoney(A.net), plan?t("plan.kpi.plan",{v:moneyRound(plan.A.ventas)}):t("an.kpi.unitssold",{n:qty(A.units)}), dVentas, sparkSVG(Ms.map(m=>m.net), "var(--series-sales)"))}
    ${kpi(t("fin.kpi.gmpct"), A.net>0?fmtPct(A.gpPct):"—", (plan&&plan.A.margenPct!=null)?t("plan.kpi.plan",{v:fmtPct(plan.A.margenPct)}):t("fin.kpi.gmsub",{v:moneyRound(A.gp)}), dMargen, sparkSVG(Ms.map(m=>m.gpPct), "var(--pos)"))}
    ${kpi(t("an.kpi.contrib"), bigMoney(A.contrib), A.net>0?t("fin.kpi.ofnet",{p:fmtPct(A.contribPct)}):"—", dContrib, sparkSVG(Ms.map(m=>m.contrib), "var(--series-sales)"), A.contrib<0?"neg":"")}
    ${kpi(t((O && O.show && O.hasBajo) ? "pnl.neto" : "gx.pnl.ebit")+ebitTag, ebitVal, ebitSub, "", "", ebitCls)}
  </div>
  <div class="kpis kpis4 rs-kpis">
    ${kpi(t("gx.kpi.be")+monthTag, beVal, beSub, "", "", beCls)}
    ${kpi(t("fin.kpi.purch"), bigMoney(P.total), (plan&&plan.A.comprasAny)?t("plan.kpi.plan",{v:moneyRound(plan.A.compras)}):(A.cogs>0?t("fin.kpi.ratio",{r:nfDec(2).format(P.total/A.cogs)}):t("fin.kpi.purchdocs",{n:P.docs})), dCompras, sparkSVG(Ms.map(m=>m.purch), "var(--series-purch)"))}
    ${kpi(t("fin.kpi.stock")+`<span class="kpi-tag">${t("fin.today")}</span>`, bigMoney(S.valuation), (plan&&plan.A.stockAny)?t("plan.kpi.target",{v:moneyRound(plan.A.stockObj)}):t("fin.kpi.stocksub",{u:qty(S.units),n:S.skus}), dStock, "")}
    ${kpi(t("fin.kpi.dio")+`<span class="kpi-tag">${t("fin.today")}</span>`, dio!=null?t("fin.days",{n:qty(dio)}):"—", finDiasInventarioSub(dioI) + (cobertura!=null?" "+t("rs.kpi.cover2",{n:nfDec(1).format(cobertura)}):""), "", "", (dioI&&dioI.banda!=="ok")?"warn-ink":"")}
  </div>
  <p class="note-under finbar-note">${modeTxt}${modeTxtSoc}</p>`;

  /* --- Dónde venimos bien / mal --- */
  let div = [], divTitle, divSub, divFmt;
  if(plan){
    divTitle = t("rs.div.title"); divSub = t("rs.div.sub.plan"); divFmt = v=> (v>=0?"+":"−")+finCompact(Math.abs(v));
    const ls = new Set(Object.keys(plan.A.byLinea).concat(Object.keys(A.bySaga)));
    div = [...ls].map(k=>{ const pv=(plan.A.byLinea[k]||{}).ventas||0, rv=(A.bySaga[k]||{}).net||0; return { k, v:rv-pv, pct: pv>0?(rv-pv)/pv:null }; });
  } else if(Ap){
    divTitle = t("rs.div.title"); divSub = t("rs.div.sub.yoy"); divFmt = v=> (v>=0?"+":"−")+finCompact(Math.abs(v));
    const ls = new Set(Object.keys(Ap.bySaga).concat(Object.keys(A.bySaga)));
    div = [...ls].map(k=>{ const pv=(Ap.bySaga[k]||{}).net||0, rv=(A.bySaga[k]||{}).net||0; return { k, v:rv-pv, pct: pv>0?(rv-pv)/pv:null }; });
  } else {
    divTitle = t("rs.div.title.margin"); divSub = t("rs.div.sub.margin",{p:A.net>0?fmtPct(A.gpPct):"—"}); divFmt = v=> (v>=0?"+":"−")+nfDec(1).format(Math.abs(v)*100)+" pp";
    div = Object.entries(A.bySaga).filter(([k,s])=>s.net>0).map(([k,s])=>({ k, v:(s.net-s.cogs)/s.net - A.gpPct, pct:null, share:s.net }));
  }
  div = div.filter(x=> Math.abs(x.v)>0.0005).sort((a,b)=> b.v-a.v).slice(0,10);
  const maxAbs = Math.max(0.0001, ...div.map(x=>Math.abs(x.v)));
  const divRows = div.map(x=>{
    const w = (Math.abs(x.v)/maxAbs*100).toFixed(1), pos = x.v>=0;
    const pctTxt = x.pct==null ? "" : ` <span class="rs-pct">${(x.pct>=0?"▲ +":"▼ −")+nfDec(0).format(Math.abs(x.pct)*100)}%</span>`;
    return `<button type="button" class="rs-div ${finFiltros.linea===x.k?"on":""}" data-rs-linea="${esc(x.k)}" title="${t("fin.mix.tip")}">
      <span class="rs-dl">${esc(x.k)}</span>
      <span class="rs-neg">${!pos?`<span class="rs-bar neg" style="width:${w}%"></span>`:""}</span>
      <span class="rs-pos">${pos?`<span class="rs-bar pos" style="width:${w}%"></span>`:""}</span>
      <span class="rs-dv ${pos?"pos":"neg"}">${divFmt(x.v)}${pctTxt}</span>
    </button>`;
  }).join("");
  // Lectura rápida: quién suma y quién resta
  let insight = "";
  if(div.length && (plan || Ap)){
    const posList = div.filter(x=>x.v>0), negList = div.filter(x=>x.v<0).sort((a,b)=>a.v-b.v);
    const posTot = posList.reduce((s,x)=>s+x.v,0);
    const parts = [];
    if(posList.length) parts.push(t("rs.ins.pos",{line:posList[0].k, p:fmtPct(posTot>0?posList[0].v/posTot:0,0)}));
    if(negList.length) parts.push(t("rs.ins.neg",{line:negList[0].k, v:finCompact(Math.abs(negList[0].v))}));
    if(negList.length && plan){
      const k = negList[0].k, pe = plan.A.byLinea[k], pu = P.bySaga[k];
      if(pe && pe.comprasAny && pe.compras>0 && pu && pu.value > pe.compras*1.1) parts.push(t("rs.ins.buy",{p:fmtPct((pu.value-pe.compras)/pe.compras,0)}));
    }
    insight = parts.length ? `<p class="rs-insight">${parts.join(" ")}</p>` : "";
  }
  const divPanel = `
  <div class="panel chart rs-divpanel">
    <p class="ctitle">${divTitle}</p>
    <p class="csub">${divSub}</p>
    ${div.length ? `<div class="rs-divhead"><span></span><span>${t("rs.div.below")}</span><span>${t("rs.div.above")}</span><span></span></div>${divRows}${insight}` : `<div class="cempty">${t("an.nosales")}</div>`}
  </div>`;

  /* --- Riesgos --- */
  const risks = resumenRiesgos(q, { A, P, S, plan, series, negSales });
  const sevTxt = { high:t("rk.sev.high"), med:t("rk.sev.med"), low:t("rk.sev.low") };
  const riskPanel = `
  <div class="panel chart">
    <p class="ctitle">${t("rk.title")}</p>
    <p class="csub">${t("rk.sub")}</p>
    ${risks.length ? risks.map(k=>`<div class="rk rk-${k.sev}">
        <span class="rk-sev">${sevTxt[k.sev]}</span>
        <div class="rk-body"><b>${esc(k.title)}</b><span>${esc(k.desc)}</span></div>
        <button type="button" class="btn ghost sm" data-rgo="${esc(k.go)}">${esc(k.goLabel)}</button>
      </div>`).join("") : `<div class="cempty">${t("rk.none")}</div>`}
  </div>`;

  /* --- Decisiones pendientes --- */
  const d = { linea:q.linea, idioma:q.idioma };
  const prods = productosVendibles().filter(p=> finProdMatch(p, d));
  const reponer = prods.filter(necesitaPedido).length;
  const transit = (db.compras||[]).filter(c=> c.status===INVOICE_STATUS.IN_TRANSIT && (c.lineas||[]).some(l=> finProdMatch(prodById(l.productoId), d)));
  const blocked = prods.filter(p=> esBloqueado(p) && stockTotalP(p)>0);
  const blockedV = blocked.reduce((s,p)=> s + STORE_IDS.reduce((x,st)=> x + fifoLayers(p,st).reduce((y,L)=>y+L.cantidad*L.costoUnit,0),0), 0);
  const ver = fpaVigente(), curMonth = finIso(finAnchor()).slice(0,7);
  const planCovers = ver && (ver.filas||[]).some(x=> x.mes===curMonth);
  const decs = [];
  if(reponer) decs.push({ n:reponer, title:t("dc.reorder.t"), desc:t("dc.reorder.d"), go:"prod-sin", label:t("rk.go.reorder"), primary:true });
  if(transit.length) decs.push({ n:transit.length, title:t("dc.transit.t"), desc:t("dc.transit.d"), go:"compras", label:t("rk.go.purch") });
  if(negSales.n) decs.push({ n:negSales.n, title:t("dc.neg.t"), desc:t("dc.neg.d"), go:"ventas", label:t("rk.go.sales"), neg:true });
  if(blocked.length) decs.push({ n:blocked.length, title:t("dc.blocked.t"), desc:t("dc.blocked.d",{v:finCompact(blockedV)}), go:"prod-blocked", label:t("rk.go.prod") });
  if(!ver) decs.push({ n:1, title:t("dc.noplan.t"), desc:t("dc.noplan.d"), go:"plan", label:t("plan.btn.import") });
  else if(!planCovers) decs.push({ n:1, title:t("dc.oldplan.t"), desc:t("dc.oldplan.d",{m:finMonthLabel(curMonth)}), go:"plan", label:t("rk.go.plan") });
  const decPanel = `
  <div class="u-span-all panel chart">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <p class="ctitle">${t("dc.title")}</p>
      ${decs.length?`<span class="u-m0 kpi-tag">${t(decs.length===1?"dc.open1":"dc.open",{n:decs.length})}</span>`:""}
    </div>
    <p class="csub">${t("dc.sub")}</p>
    ${decs.length ? `<div class="dc-grid">${decs.map(x=>`<div class="dc">
        <div class="dc-n ${x.neg?"neg":""}">${qty(x.n)}</div>
        <b>${esc(x.title)}</b>
        <span>${esc(x.desc)}</span>
        <button type="button" class="btn ${x.primary?"primary":""} sm" data-rgo="${esc(x.go)}">${esc(x.label)}</button>
      </div>`).join("")}</div>` : `<div class="cempty">${t("dc.none")}</div>`}
  </div>`;

  return `
  <div class="head"><div class="title"><h2>${t("rs.title")}</h2><p>${t("rs.sub")}</p></div></div>
  ${finFilterBarHTML()}
  ${kpis}
  ${finProjectionPanelHTML(q)}
  <div class="rs-grid">${divPanel}${riskPanel}</div>
  <div class="chart-grid" style="margin-top:20px">${decPanel}</div>`;
}

/* Acciones de riesgos y decisiones: te llevan a la pantalla donde se resuelve. */
function resumenGo(code){
  const d = { q:"", saga:finFiltros.linea||"", idioma:finFiltros.idioma||"", xstate:"", cmin:"", cmax:"" };
  if(code==="prod-sin"){ Object.assign(prodFiltros, d, { estado:"pedir", sortKey:"stock", sortDir:"asc" }); setView("prod"); return; }
  if(code==="prod-blocked"){ Object.assign(prodFiltros, d, { estado:"blocked", sortKey:"", sortDir:"" }); setView("prod"); return; }
  if(code==="prod-aged"){ Object.assign(prodFiltros, d, { estado:"con", sortKey:"valor", sortDir:"desc" }); setView("prod"); return; }
  if(code==="compras"){ setView("compras"); return; }
  if(code==="ventas"){ setView("ventas"); return; }
  if(code==="plan"){ setView("plan"); return; }
  if(code==="analisis"){ setView("analisis"); return; }
  if(code.indexOf("linea:")===0){ finFiltros.linea = code.slice(6); setView("analisis"); return; }
}
function wireResumen(){
  const m = document.getElementById("main"); if(!m) return;
  wireFinFilterBar();
  wireDrills();
  m.querySelectorAll("[data-rgo]").forEach(b=> b.onclick=()=> resumenGo(b.dataset.rgo));
  m.querySelectorAll("[data-rs-linea]").forEach(b=> b.onclick=()=>{ const l=b.dataset.rsLinea; finFiltros.linea = (finFiltros.linea===l?"":l); render(); });
}

/* ============================================================
   PROYECCIÓN DE CIERRE DE MES (panel compartido: Resumen y Plan vs Real)
   ============================================================ */
function finProjectionPanelHTML(d){
  const P = finMonthProjection(d||{});
  const mLabel = finMonthLabel(P.mk);
  const plan = P.plan;
  const top = Math.max(1, P.projNet, plan?plan.ventas:0, P.linear) * 1.08;
  const wM = Math.min(100, P.mtdNet/top*100), wP = Math.max(0, Math.min(100-wM, (P.projNet-P.mtdNet)/top*100));
  const onPace = plan ? P.dailyNet >= (P.needDaily||0) - 0.005 : null;
  /* v87: el ritmo puede alcanzar y aun así no llegar, porque se acaba el stock.
     El veredicto de la celda sale del cierre proyectado (con tope), no sólo del ritmo. */
  const llega = plan ? P.projNet >= plan.ventas - 0.005 : null;
  const needTxt = !plan ? "" : (llega ? t("pj.c.needok") : (onPace ? t("pj.c.needstock") : t("pj.c.needko")));
  const cell = (lbl, val, sub, cls)=> `<div class="pj-cell"><span>${lbl}</span><b class="${cls||""}">${val}</b>${sub?`<em>${sub}</em>`:""}</div>`;
  return `
  <div class="panel chart pj">
    <div class="pj-head">
      <div>
        <p class="ctitle">${t("pj.title",{m:mLabel})}</p>
        <p class="csub">${t("pj.sub",{d:P.day, n:P.dim})}</p>
      </div>
      <div class="pj-big">
        <b>${bigMoney(P.projNet)}</b>
        ${plan ? finDelta(P.projNet, plan.ventas, { vs:t("pj.vsplan",{v:finCompact(plan.ventas)}) }) : `<div class="kdelta muted">${t(d&&(d.pais||d.vend)?"pj.noplan.dims":"pj.noplan")}</div>`}
      </div>
    </div>
    <div class="pj-bar" role="img" aria-label="${esc(t("pj.aria",{mtd:money(P.mtdNet), proj:money(P.projNet), plan:plan?money(plan.ventas):"—"}))}">
      <span class="pj-mtd" style="width:${wM.toFixed(1)}%"></span><span class="pj-rest" style="width:${wP.toFixed(1)}%"></span>
      ${plan?`<span class="pj-plan" style="left:${Math.min(100,plan.ventas/top*100).toFixed(1)}%" title="${esc(t("plan.lg.plan"))}: ${esc(money(plan.ventas))}"></span>`:""}
    </div>
    <div class="u-mt2 fin-legend"><span><i class="lg-sales"></i>${t("pj.lg.mtd")}</span><span><i class="pj-sw-rest"></i>${t("pj.lg.rest")}</span>${plan?`<span><i class="lg-plan"></i>${t("plan.lg.plan")}</span>`:""}</div>
    <div class="pj-cells">
      ${cell(t("pj.c.mtd"), bigMoney(P.mtdNet), t("pj.c.mtdsub",{d:P.day}))}
      ${cell(t("pj.c.pace"), bigMoney(P.dailyNet), t("pj.c.pacesub"))}
      ${plan ? cell(t("pj.c.need"), P.rem>0?bigMoney(P.needDaily):"—", P.rem>0?needTxt:t("pj.c.lastday"), llega?"pos":"neg") : cell(t("pj.c.linear"), bigMoney(P.linear), t("pj.c.linearsub"))}
      ${cell(t("pj.c.margin"), P.projGpPct!=null?fmtPct(P.projGpPct):"—", (plan&&plan.margenPct!=null)?t("plan.kpi.plan",{v:fmtPct(plan.margenPct)}):"", (plan&&plan.margenPct!=null&&P.projGpPct!=null)?(P.projGpPct>=plan.margenPct?"pos":"neg"):"")}
    </div>
    <p class="fin-help"><b>${t("rr.label")}</b> ${t("rr.val",{v:moneyRound(P.dailyNet*365)})} ${t("rr.how")}</p>
    <p class="fin-help">${t("pj.help",{l:money(P.linear)})}${P.topeStock?" "+t("pj.help.cap"):""}</p>
  </div>`;
}

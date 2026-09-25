/* ============================================================
   gestordestock — 11-view-analisis.js
   Parte de la app. Se carga como etiqueta script en el ORDEN del index.html.
   Todo vive en scope global (sin módulos), igual que antes.
   ============================================================ */
/* ============================================================
   VISTA: Análisis (gráficos, sin librerías)
   ============================================================ */
/* Barras horizontales: items=[{label, sku, value}], fmt=formateador, color=CSS var */
function hbars(items, fmt, color){
  const vals = items.filter(i=> i.value>0);
  if(!vals.length) return `<div class="cempty">${t("an.nodata")}</div>`;
  const max = Math.max(...vals.map(i=>i.value)) || 1;
  return vals.map(i=>{
    const pct = Math.max(2, (i.value/max)*100);
    const c = i.color || color;
    const chip = i.sku ? `<span class="sku">${esc(i.sku)}</span> ` : "";
    const full = (i.sku?("["+i.sku+"] "):"") + i.label;
    // data-pid: la barra abre la ficha del producto (antes filtraba toda su línea, lo cual sorprendía)
    // data-drill: tocar la barra abre las ventas que la componen (11e-drill.js)
    const attr = i.drill ? ` data-drill="${esc(i.drill)}" tabindex="0" role="button" aria-label="${esc(t("dr.aria",{x:full}))}"` : (i.saga ? ` data-saga="${esc(i.saga)}"` : "");
    return `<div class="crow"${attr}>
      <div class="cl" data-fullname="${esc(full)}">${chip}${esc(i.label)}</div>
      <div class="ct"><div class="cf" style="width:${pct.toFixed(1)}%;background:${c}"></div></div>
      <div class="cv">${fmt(i.value)}</div>
    </div>`;
  }).join("");
}

/* Donut interactivo (SVG puro, sin librerías). Click en un segmento o en la
   leyenda -> el centro muestra ese importe y su %. `cid` debe ser único por
   gráfico. Usa el truco de r=15.915 (circunferencia ≈ 100) para que el
   stroke-dasharray sea directamente el porcentaje. */
const DONUT_COLORS = ["#2563eb","#2dbd8f","#8a5cf6","#f0a935","#f16a68","#2b8fd9","#e069b6","#7c8b9a"];
function donut(cid, items, fmt){
  const data = items.filter(i=> i.value>0).sort((a,b)=> b.value-a.value);
  if(!data.length) return `<div class="cempty">${t("an.nodata")}</div>`;
  const total = data.reduce((a,i)=> a+i.value, 0);
  let cum = 0;
  const segs = data.map((i,idx)=>{
    const pct = total>0 ? (i.value/total*100) : 0;
    const off = 25 - cum;                 // recipe: arranca a las 12 en punto
    cum += pct;
    const col = DONUT_COLORS[idx % DONUT_COLORS.length];
    const seg = `<circle class="donut-seg" cx="21" cy="21" r="15.915" fill="none" stroke="${col}" stroke-width="6"
      stroke-dasharray="${pct.toFixed(3)} ${(100-pct).toFixed(3)}" stroke-dashoffset="${off.toFixed(3)}"
      data-idx="${idx}" data-lbl="${esc(i.label)}" data-vfmt="${esc(fmt(i.value))}" data-pct="${pct.toFixed(1)}"></circle>`;
    return { seg, col, pct, i, idx };
  });
  const totStr = fmt(total);
  const svg = `<svg class="donut-svg" viewBox="0 0 42 42" data-donut="${esc(cid)}" data-totfmt="${esc(totStr)}">
    <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" stroke-width="6"></circle>
    ${segs.map(s=>s.seg).join("")}
    <text x="21" y="20.6" text-anchor="middle" font-size="${donutFit(totStr)}" class="donut-ctr-val" data-ctrval="1">${esc(totStr)}</text>
    <text x="21" y="24.4" text-anchor="middle" font-size="2.1" class="donut-ctr-lbl" data-ctrlbl="1">${t("common.total")}</text>
  </svg>`;
  const legend = `<div class="donut-legend">${segs.map(s=>`
    <div class="donut-leg" data-donut="${esc(cid)}" data-idx="${s.idx}">
      <span class="sw" style="background:${s.col}"></span>
      <span class="lg-lbl" title="${esc(s.i.label)}">${esc(s.i.label)}</span>
      <span class="lg-val">${esc(fmt(s.i.value))}</span>
      <span class="lg-pct">${s.pct.toFixed(0)}%</span>
    </div>`).join("")}</div>`;
  return `<div class="donut-wrap">${svg}${legend}</div>`;
}
/* El texto del centro del donut vive en un viewBox de 42u y el agujero tiene ~22u
   de ancho útil. Un font-size fijo hace que valores largos ("USD 13.470,00") se
   desborden. Este helper calcula el tamaño para que SIEMPRE entre: estima el ancho
   del texto (~0.58u por caracter a font-size 1) y lo ajusta al ancho disponible. */
function donutFit(str){
  const s = String(str||"");
  const AVAIL = 21;            // ancho útil dentro del agujero (deja aire a los lados)
  const CHARW = 0.58;         // ancho aprox. de un caracter, relativo al font-size
  const ideal = AVAIL / (Math.max(1, s.length) * CHARW);
  return Math.max(1.7, Math.min(3.6, ideal)).toFixed(2);   // nunca más chico de 1.7 ni más grande de 3.6
}
/* Cada render rearma la lista de "limpiadores": funciones que devuelven un
   donut a su estado neutro (centro = total, sin segmento activo). El listener
   global de más abajo las usa para deseleccionar al tocar fuera del gráfico. */
let DONUT_CLEARERS = [];
function wireDonuts(){
  DONUT_CLEARERS = [];
  document.querySelectorAll('#main svg[data-donut]').forEach(svg=>{
    const ctrVal = svg.querySelector('[data-ctrval]');
    const ctrLbl = svg.querySelector('[data-ctrlbl]');
    const totFmt = svg.dataset.totfmt;
    const legend = svg.parentElement.querySelector('.donut-legend');
    let active = null;
    const setCtr = (txt)=>{ ctrVal.textContent = txt; ctrVal.setAttribute('font-size', donutFit(txt)); };
    const paint = ()=>{
      const hasActive = active!=null;
      svg.classList.toggle('has-active', hasActive);
      svg.querySelectorAll('.donut-seg').forEach(s=> s.classList.toggle('on', +s.dataset.idx===active));
      if(legend) legend.querySelectorAll('.donut-leg').forEach(l=> l.classList.toggle('on', +l.dataset.idx===active));
      if(hasActive){
        const seg = svg.querySelector('.donut-seg[data-idx="'+active+'"]');
        setCtr(seg.dataset.vfmt);
        ctrLbl.textContent = seg.dataset.pct + '% · ' + seg.dataset.lbl;
      } else {
        setCtr(totFmt);
        ctrLbl.textContent = t("common.total");
      }
    };
    const apply = (idx)=>{ active = (active===idx) ? null : idx; paint(); };
    const clear = ()=>{ if(active!=null){ active=null; paint(); } };
    // registramos el limpiador de este donut (para el click afuera / Escape)
    DONUT_CLEARERS.push(clear);
    svg.querySelectorAll('.donut-seg').forEach(s=> s.onclick=(e)=>{ e.stopPropagation(); apply(+s.dataset.idx); });
    if(legend) legend.querySelectorAll('.donut-leg').forEach(l=> l.onclick=(e)=>{ e.stopPropagation(); apply(+l.dataset.idx); });
  });
}
/* Limpia TODOS los donuts de la vista de una sola pasada. */
function clearAllDonuts(){ DONUT_CLEARERS.forEach(fn=>{ try{ fn(); }catch(e){} }); }
/* Listener global (se instala una única vez): un click en cualquier lado que NO
   caiga sobre un gráfico (ni su leyenda) devuelve todo a la normalidad. Idem Esc.
   Los clicks dentro de un segmento/leyenda ya frenan la propagación arriba, así
   que acá sólo llegan los clicks "de afuera". */
if(!window.__donutOutsideWired){
  window.__donutOutsideWired = true;
  document.addEventListener('click', (e)=>{
    if(e.target.closest && e.target.closest('.donut-wrap')) return; // click dentro: no tocar
    clearAllDonuts();
  });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') clearAllDonuts(); });
}

/* ============================================================
   FILTROS COMPARTIDOS DE FINANZAS (Análisis y P&L usan la misma barra)
   ------------------------------------------------------------
   Un solo estado (finFiltros, en 05-metrics.js): si filtrás Dragon Ball
   en Análisis y pasás al P&L, el P&L ya está filtrado igual. El período
   es un preset (MTD/QTD/YTD/12M/All); tocar las fechas pasa a "custom".
   ============================================================ */
let anMetric = "usd";   // "usd" | "units" (toggle de métrica en los rankings)
function paisesVentas(){
  const set=new Set();
  (db.ventas||[]).forEach(v=>{ const c=(v.cliente&&v.cliente.pais)||""; if(c) set.add(c); });
  // ordenados por cómo se LEEN en el idioma actual (el valor guardado es el canónico en inglés)
  return [...set].sort((a,b)=> paisLabel(a).localeCompare(paisLabel(b), lang()));
}
/* Período: UN solo control. Los presets (Mes, Trim., Año, 12 meses, Todo) muestran
   al lado el rango exacto que están filtrando, en texto. "Rango" habilita las dos
   fechas para elegir desde/hasta. Antes las fechas estaban siempre visibles junto a
   los presets y no se sabía si filtraba por "Año" o por las fechas. */
function finPeriodHTML(){
  const f = finFiltros, r = finRange(f), custom = f.periodo==="custom";
  const segBtn = p=> `<button type="button" class="seg-btn ${f.periodo===p?"on":""}" data-finp="${p}" aria-pressed="${f.periodo===p}">${t("fin.period."+p)}</button>`;
  const rangeTxt = (r.from||r.to) ? `${r.from?fmtDate(r.from):"…"} – ${r.to?fmtDate(r.to):t("fin.range.today")}` : t("fin.range.all");
  return `<div class="slicer fin-period-slicer"><span>${t("fin.period")}</span>
    <div class="fin-period">
      <div class="seg" role="group" aria-label="${t("fin.period")}">${FIN_PERIODS.map(segBtn).join("")}${segBtn("custom")}</div>
      ${custom
        ? `<div class="fin-range"><input type="date" id="fin_desde" value="${esc(f.desde||"")}" aria-label="${t("an.sl.from")}"><span class="fin-range-sep">–</span><input type="date" id="fin_hasta" value="${esc(f.hasta||"")}" aria-label="${t("an.sl.to")}"></div>`
        : `<span class="fin-range-txt" title="${t("fin.range.tip")}">${esc(rangeTxt)}</span>`}
    </div></div>`;
}
function finFilterBarHTML(){
  const f = finFiltros, r = finRange(f);
  const opt = (val, label, cur)=> `<option value="${esc(val)}" ${cur===val?"selected":""}>${esc(label)}</option>`;
  const note = finDimsActive(f) ? `<div class="finbar-note">${t("fin.showing",{sel:`<b>${esc(finDimsLabel(f))}</b>`})}</div>` : "";
  return `<div class="finbar">
    ${finPeriodHTML()}
    <div class="slicer"><span>${t("an.sl.line")}</span><select id="fin_linea">${opt("",t("an.sl.all"),f.linea)}${sagasUnicas().map(s=>opt(s,s,f.linea)).join("")}</select></div>
    <div class="slicer"><span>${t("an.sl.language")}</span><select id="fin_idioma">${opt("",t("an.sl.all"),f.idioma)}${langOpts().map(([v,l])=>opt(v,l,f.idioma)).join("")}</select></div>
    <div class="slicer"><span>${t("an.sl.country")}</span><select id="fin_pais">${opt("",t("an.sl.all"),f.pais)}${paisesVentas().map(c=>opt(c,paisLabel(c),f.pais)).join("")}</select></div>
    <div class="slicer"><span>${t("an.sl.seller")}</span><select id="fin_vend">${opt("",t("an.sl.all"),f.vend)}${vendedores().map(v=>opt(v.id,v.nombre,f.vend)).join("")}</select></div>
    <button type="button" class="slicer-reset" id="fin_clear">${t("an.sl.reset")}</button>
    ${note}
  </div>`;
}
function wireFinFilterBar(){
  const m = document.getElementById("main"); if(!m) return;
  m.querySelectorAll("[data-finp]").forEach(b=> b.onclick=()=>{
    const p = b.dataset.finp;
    if(p==="custom"){
      if(finFiltros.periodo==="custom") return;
      // "Rango" arranca con el rango que estabas mirando, así no salta nada
      const cur = finRange(); finFiltros.periodo="custom"; finFiltros.desde=cur.from||""; finFiltros.hasta=cur.to||"";
    } else { finFiltros.periodo=p; finFiltros.desde=""; finFiltros.hasta=""; }
    if(typeof pnlDrill!=="undefined") pnlDrill=null;
    render();
  });
  const dateChg = ()=>{
    let d0=document.getElementById("fin_desde").value, d1=document.getElementById("fin_hasta").value;
    if(d0 && d1 && d0>d1){ const x=d0; d0=d1; d1=x; }     // desde > hasta: se invierten
    finFiltros.periodo="custom"; finFiltros.desde=d0; finFiltros.hasta=d1; render();
  };
  const d0=document.getElementById("fin_desde"), d1=document.getElementById("fin_hasta");
  if(d0) d0.onchange=dateChg; if(d1) d1.onchange=dateChg;
  [["fin_linea","linea"],["fin_idioma","idioma"],["fin_pais","pais"],["fin_vend","vend"]].forEach(([id,k])=>{
    const el=document.getElementById(id); if(el) el.onchange=()=>{ finFiltros[k]=el.value; render(); };
  });
  const c=document.getElementById("fin_clear"); if(c) c.onclick=()=>{ finResetFiltros(); render(); };
}

/* ============================================================
   COMPATIBILIDAD: las funciones viejas ahora son vistas de la capa única.
   ============================================================ */
/* Ventas a nivel línea con los filtros compartidos (antes duplicaba el prorrateo). */
function ventasFiltradas(){ return finSaleLines(finQuery()); }

/* P&L CONSOLIDADO — la usan la pestaña P&L y el Excel.
   dims (opcional): línea/idioma/país/vendedor; por defecto, los filtros compartidos,
   así el Excel siempre cierra con lo que se ve en pantalla. */
let _pnlCache = { rev:-1, map:{} };   // vive dentro de un render (router.render lo limpia)
function pnlAggregate(desde, hasta, soc, dims){
  dims = dims || finDims(finFiltros);
  const key = [desde||"",hasta||"",reportCcy(),soc||"all",dims.linea,dims.idioma,dims.pais,dims.vend].join("|");
  if(_pnlCache.map[key]) return _pnlCache.map[key];
  const A = finAggregate(finSaleLines(Object.assign({ from:desde||"", to:hasta||"", soc:soc||null }, dims)));
  _pnlCache.map[key] = A;
  return A;
}
/* Se mantiene por compatibilidad con código viejo: mismo formato que finCompact. */
function _pnlCompact(n){ return finCompact(n); }

/* ============================================================
   GRÁFICOS (SVG puro)
   ============================================================ */
/* Escala "linda" para ejes: 0, 5k, 10k... en vez de 0, 4.37k, 8.74k */
function finNiceMax(v){
  if(!(v>0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v/p;
  const nice = n<=1?1 : n<=2?2 : n<=2.5?2.5 : n<=5?5 : 10;
  return nice*p;
}
/* Combo mensual: columnas de ventas vs compras + fila de margen % por mes.
   El margen va como fila de números (no como segunda escala en el mismo eje):
   dos ejes Y en un gráfico confunden más de lo que ayudan. */
function finComboSVG(months, units){
  if(!months.length) return `<div class="cempty">${t("an.nosales")}</div>`;
  const vS = m=> units ? m.units : m.net, vP = m=> units ? m.purchUnits : m.purch;
  const fmtV = units ? qty : money, fmtAx = units ? qty : finCompactAxis;
  const max = finNiceMax(Math.max(1, ...months.map(m=>Math.max(vS(m), vP(m)))));
  const W=1040, padR=8, padT=14, plotH=210, H=padT+plotH+58;
  const padL = finAxisPad([0,1,2,3,4].map(i=>fmtAx(max*i/4)).concat([t("fin.s.gm")]), 60);
  const y = v=> padT + plotH - (v/max)*plotH;
  const n = months.length, gw = (W-padL-padR)/n, bw = Math.max(4, Math.min(30, gw*0.34));
  let grid="", bars="", labs="";
  for(let i=0;i<=4;i++){ const v=max*i/4, gy=y(v);
    grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W-padR}" y2="${gy.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`
         +  `<text x="${padL-8}" y="${(gy+4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--mono)">${esc(fmtAx(v))}</text>`; }
  const every = n>18 ? 3 : n>12 ? 2 : 1;   // con muchos meses, rotulamos uno de cada N
  months.forEach((m,i)=>{
    const cx = padL + gw*i + gw/2;
    const hS = Math.max(vS(m)>0?1.5:0, plotH*vS(m)/max), hP = Math.max(vP(m)>0?1.5:0, plotH*vP(m)/max);
    bars += `<rect x="${(cx-bw-1).toFixed(1)}" y="${(padT+plotH-hS).toFixed(1)}" width="${bw.toFixed(1)}" height="${hS.toFixed(1)}" rx="2.5" fill="var(--series-sales)"></rect>`
          + `<rect x="${(cx+1).toFixed(1)}" y="${(padT+plotH-hP).toFixed(1)}" width="${bw.toFixed(1)}" height="${hP.toFixed(1)}" rx="2.5" fill="var(--series-purch)"></rect>`
          // Zona táctil de TODO el mes (no sólo la barra): en el celu una barra finita no se puede tocar
          + `<rect class="drill-hit" x="${(padL+gw*i).toFixed(1)}" y="${padT}" width="${gw.toFixed(1)}" height="${plotH+42}" data-drill="m:${m.mk}" tabindex="0" role="button" aria-label="${esc(t("dr.aria",{x:m.label}))}"><title>${esc(m.label)} · ${t("fin.s.sales")}: ${esc(fmtV(vS(m)))} · ${t("fin.s.purch")}: ${esc(fmtV(vP(m)))} — ${t("dr.tap")}</title></rect>`;
    if(i%every===0){
      labs += `<text x="${cx.toFixed(1)}" y="${padT+plotH+17}" text-anchor="middle" font-size="11.5" fill="var(--muted)">${esc(m.label)}</text>`;
      const mp = m.gpPct;
      labs += `<text x="${cx.toFixed(1)}" y="${padT+plotH+38}" text-anchor="middle" font-size="12" font-weight="700" font-family="var(--mono)" fill="${mp==null?"var(--muted)":(mp<0?"var(--neg)":"var(--pos)")}">${mp==null?"—":esc(fmtPct(mp,0))}</text>`;
    }
  });
  const axis = `<line x1="${padL}" y1="${padT+plotH}" x2="${W-padR}" y2="${padT+plotH}" stroke="var(--text)" stroke-width="1"/>`
             + `<text x="${padL-8}" y="${padT+plotH+38}" text-anchor="end" font-size="11" fill="var(--pos)" font-weight="700">${t("fin.s.gm")}</text>`;
  return `<div class="u-scroll-x"><svg viewBox="0 0 ${W} ${H}" style="display:block;min-width:620px;width:100%;height:auto" role="img" aria-label="${t("fin.combo.aria")}">${grid}${bars}${axis}${labs}</svg></div>`;
}

/* --- Waterfall del P&L ---
   Colores con semántica: suma = verde, resta = rojo, subtotal = gris oscuro,
   resultado final = azul. Antes suma y total eran el mismo azul (--up == --accent). */
function pnlWaterfallSVG(P){
  const steps=[
    {k:t("pnl.wf.sales"),       v:P.sales,       type:"start"},
    {k:t("pnl.wf.shipping"),    v:P.shipping,    type:"add"},
    {k:t("pnl.wf.cargos"),      v:P.cargos,      type:"add", star:true},
    {k:t("pnl.wf.net"),         v:P.net,         type:"sub"},
    {k:t("pnl.wf.cogs"),        v:-P.cogs,       type:"minus"},
    {k:t("pnl.wf.gross"),       v:P.gp,          type:"sub"},
    {k:t("pnl.wf.commissions"), v:-P.commission, type:"minus"},
    {k:t("pnl.wf.selling"),     v:-(P.costos.envio+P.costos.labor+P.costos.comision+P.costos.otro), type:"minus"},
    {k:t("pnl.wf.contrib"),     v:P.contrib,     type:(P.show?"sub":"total")},
    ...(P.show ? [ {k:t("gx.wf.opex"), v:-P.opex, type:"minus"}, {k:t("gx.wf.ebit"), v:P.ebit, type:"total"} ] : []),
  ].filter(s=> !((s.type==="add"||s.type==="minus") && Math.abs(s.v)<0.005));
  let run=0, maxV=0, minV=0;
  const geom=steps.map(s=>{ let lo,hi;
    if(s.type==="start"||s.type==="sub"||s.type==="total"){ lo=Math.min(0,s.v); hi=Math.max(0,s.v); run=s.v; }
    else { const prev=run; run=prev+s.v; lo=Math.min(prev,run); hi=Math.max(prev,run); }
    maxV=Math.max(maxV,hi); minV=Math.min(minV,lo); return {...s,lo,hi};
  });
  const dom=(maxV-minV)||1;
  const W=1040,H=300,padT=30,padB=46,padR=6,plot=H-padT-padB;
  const padL=finAxisPad([0,1,2,3,4].map(i=>finCompactAxis(maxV-dom*(i/4))), 60);
  const y=v=> padT+(maxV-v)/dom*plot;
  const n=steps.length,gap=12,bw=(W-padL-padR-gap*(n-1))/n;
  const col=s=> s.type==="add"?"var(--pos)":s.type==="minus"?"var(--neg)":s.type==="total"?(s.v<0?"var(--neg)":"var(--chart-1)"):"var(--bar-sub)";
  let grid="",bars="",conns="",labs="",vals="";
  for(let i=0;i<=4;i++){ const gv=maxV-dom*(i/4), gy=y(gv);
    grid+=`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W-padR}" y2="${gy.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`
        +`<text x="${padL-8}" y="${(gy+4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--mono)">${esc(finCompactAxis(gv))}</text>`;
  }
  geom.forEach((s,i)=>{
    const x=padL+i*(bw+gap), yTop=y(s.hi), yBot=y(s.lo), h=Math.max(2,yBot-yTop);
    bars+=`<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col(s)}"><title>${esc(s.k)}: ${esc(money(s.v))}</title></rect>`;
    if(i<geom.length-1 && s.type!=="total"){
      const yEnd = (s.type==="minus") ? y(s.lo) : (s.type==="add") ? y(s.hi) : y(s.v);
      conns+=`<line x1="${x.toFixed(1)}" y1="${yEnd.toFixed(1)}" x2="${(x+bw+gap).toFixed(1)}" y2="${yEnd.toFixed(1)}" stroke="var(--line-strong)" stroke-width="1.1" stroke-dasharray="2.5 2.5"/>`;
    }
    vals+=`<text x="${(x+bw/2).toFixed(1)}" y="${(yTop-6).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" font-family="var(--mono)" fill="var(--text)">${esc(finCompact(s.v))}</text>`;
    const key=(s.type==="sub"||s.type==="total"||s.type==="start");
    /* Si la etiqueta no entra en el ancho de la barra (pasa con 11 pasos, p.ej.
       "Resultado operativo"), se parte en dos renglones en vez de cortarse. */
    const cx=(x+bw/2).toFixed(1), fits=(String(s.k).length*6.4+(s.star?12:0)) <= bw+gap;
    let txt;
    if(fits || !/\s/.test(String(s.k).trim())) txt = `${s.star?'<tspan fill="var(--accent-ink)">\u2605 </tspan>':''}${esc(s.k)}`;
    else {
      const w=String(s.k).trim().split(/\s+/); let best=1, diff=Infinity;
      for(let j=1;j<w.length;j++){ const d=Math.abs(w.slice(0,j).join(" ").length - w.slice(j).join(" ").length); if(d<diff){ diff=d; best=j; } }
      txt = `<tspan x="${cx}">${s.star?'\u2605 ':''}${esc(w.slice(0,best).join(" "))}</tspan><tspan x="${cx}" dy="14">${esc(w.slice(best).join(" "))}</tspan>`;
    }
    labs+=`<text x="${cx}" y="${H-padB+18}" text-anchor="middle" font-size="11.5" font-weight="${key?700:500}" fill="${key?'var(--text)':'var(--muted)'}">${txt}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="display:block;min-width:620px;width:100%;height:auto;max-height:380px;margin:0 auto" role="img" aria-label="${t("an.aria.waterfall")}">${grid}${conns}${bars}${vals}${labs}</svg>`;
}

/* --- Columnas por mes (una serie). Negativos en rojo; eje Y con escala linda. --- */
function trendChartSVG(items, fmt, color){
  const data=items||[];
  const COL = color || "var(--chart-1)";
  if(!data.length) return `<div class="cempty">${t("an.nosales")}</div>`;
  const isMoney = fmt===money;
  const vs=data.map(d=>d.value);
  const maxV=finNiceMax(Math.max(...vs,0)), minV=Math.min(0,...vs)<0 ? -finNiceMax(-Math.min(...vs)) : 0;
  const axFmt = v=> isMoney ? finCompactAxis(v) : qty(v);
  const W=560,H=230,padT=20,padB=28,padR=6;
  const padL=finAxisPad([maxV,(maxV+minV)/2,minV].map(axFmt), 44)*0.9, plot=H-padT-padB;
  const dom=(maxV-minV)||1, y=v=> padT+(maxV-v)/dom*plot;
  const n=data.length,gap=10;
  const bw=Math.min(60,Math.max(5,(W-padL-padR-gap*(n-1))/n));
  const contentW=n*bw+gap*(n-1), startX=padL+Math.max(0,(W-padL-padR-contentW)/2);
  let grid="",cols="",labs="",vlab="";
  [maxV, (maxV+minV)/2, minV].forEach(gv=>{ const gy=y(gv);
    grid+=`<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W-padR}" y2="${gy.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`
        +`<text x="${padL-6}" y="${(gy+4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--mono)">${esc(axFmt(gv))}</text>`; });
  const every = n>12 ? 2 : 1;
  data.forEach((d,i)=>{
    const x=startX+i*(bw+gap), yy=y(Math.max(0,d.value)), y0=y(Math.min(0,d.value)), h=Math.max(d.value?1:0,Math.abs(y0-yy));
    const neg=d.value<0;
    // d.muted (v87): el valor no es comparable (p.ej. mes sin gastos de estructura cargados) → gris + rayado
    const fill = d.muted ? "var(--line-strong)" : (neg?'var(--neg)':COL);
    cols+=`<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}"${d.muted?' stroke="var(--muted)" stroke-dasharray="3 3"':''}>${d.drill?"":`<title>${esc(d.label)}: ${esc(fmt(d.value))}${d.muted&&d.note?" — "+esc(d.note):""}</title>`}</rect>`;
    // Con drill: zona táctil de toda la columna (alto completo), no sólo la barra
    if(d.drill) cols+=`<rect class="drill-hit" x="${(x-gap/2).toFixed(1)}" y="${padT}" width="${(bw+gap).toFixed(1)}" height="${(plot+20).toFixed(1)}" data-drill="${esc(d.drill)}" tabindex="0" role="button" aria-label="${esc(t("dr.aria",{x:d.label}))}"><title>${esc(d.label)}: ${esc(fmt(d.value))}${d.muted&&d.note?" — "+esc(d.note):""} — ${t("dr.tap")}</title></rect>`;
    const cx=x+bw/2;
    if(n<=12) vlab+=`<text x="${cx.toFixed(1)}" y="${(neg?y0+12:yy-5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" font-family="var(--mono)" fill="${d.muted?"var(--muted)":"var(--text)"}">${esc(d.muted?"? ":"")}${esc(isMoney?finCompact(d.value):qty(d.value))}</text>`;
    if(i%every===0) labs+=`<text x="${cx.toFixed(1)}" y="${H-padB+16}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(d.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;height:auto;max-height:280px;margin:0 auto" role="img" aria-label="${t("an.aria.trend")}">${grid}${cols}${vlab}${labs}</svg>`;
}

/* ============================================================
   VISTA: Análisis → "Ventas y margen"
   ============================================================ */
/* ============================================================
   DÍAS DE STOCK (v87)
   ------------------------------------------------------------
   Días = stock valuado / costo de lo vendido por día.
   Antes el costo diario era SIEMPRE cogs(90 días)/90: con menos de 90 días de
   historia, los días sin ventas (antes de arrancar) bajaban el ritmo y los días
   de stock salían inflados (84 en vez de ~50). Ahora el divisor es la ventana
   REAL: desde la primera venta (con los filtros activos) hasta hoy, con tope 90.
   Tampoco es "menos es mejor": poco stock = riesgo de quiebre (el Plan avisa
   "Falta stock"). Se evalúa contra una banda objetivo.
   ============================================================ */
const DIAS_STOCK_BANDA = { min:30, max:90 };   // objetivo de cobertura; ajustar acá si cambia la política
function finRitmoCostoDiario(q, maxDias){
  const a = finAnchor(), aIso = finIso(a);
  const lim = new Date(a); lim.setDate(lim.getDate()-(maxDias-1));
  let desde = finIso(lim);
  // primera venta con los mismos filtros (juego, idioma, país, vendedor, sociedad)
  const hist = finSaleLines(Object.assign({}, q, { from:"", to:aIso }));
  const primera = hist.reduce((m,r)=> (r.fecha && (!m || r.fecha<m)) ? r.fecha : m, "");
  if(!primera) return { perDay:0, dias:0 };
  if(primera > desde) desde = primera;
  const dias = Math.max(1, Math.round((new Date(aIso+"T12:00:00") - new Date(desde+"T12:00:00"))/864e5) + 1);
  const A = finAggregate(finSaleLines(Object.assign({}, q, { from:desde, to:aIso })));
  return { perDay: A.cogs/dias, dias };
}
/* {dias, ventana, banda:"low"|"ok"|"high"} o null si no hay ventas. */
function finDiasInventarioInfo(S, q){
  const R = finRitmoCostoDiario(q, 90);
  if(!(R.perDay>0)) return null;
  const dias = Math.round(S.valuation/R.perDay);
  const banda = dias < DIAS_STOCK_BANDA.min ? "low" : (dias > DIAS_STOCK_BANDA.max ? "high" : "ok");
  return { dias, ventana:R.dias, banda };
}
function finDiasInventario(S, q){ const I = finDiasInventarioInfo(S, q); return I ? I.dias : null; }
/* Subtítulo de la tarjeta: ventana usada + dónde cae contra la banda objetivo. */
function finDiasInventarioSub(I){
  if(!I) return t("fin.kpi.diosub");
  return t("fin.dio.win",{d:I.ventana}) + " " + t("fin.dio.band."+I.banda,{a:DIAS_STOCK_BANDA.min, b:DIAS_STOCK_BANDA.max});
}
function viewAnalisis(){
  const q = finQuery(), r = { from:q.from, to:q.to };
  const rows = finSaleLines(q), A = finAggregate(rows);
  const pr = finPriorRange(r);
  const Ap = pr ? finAggregate(finSaleLines(Object.assign({}, q, pr))) : null;
  const P  = finPurchases(q), Pp = pr ? finPurchases(Object.assign({}, q, pr)) : null;
  const S  = finStock(q);
  const dioI = finDiasInventarioInfo(S, q), dio = dioI ? dioI.dias : null;
  const months = finTrimMeses(finMonths(r, A, P), m=> m.net || m.purch || m.units || m.purchUnits);   // v88: sin meses vacíos al principio
  const units = anMetric==="units";
  const mfmt = units ? qty : money;
  // v87: compras (a costo) contra COSTO de lo vendido, no contra ventas (a precio).
  // Comparar costo con precio daba <1 casi siempre (por el margen) y escondía la sobrecompra.
  const ratio = A.cogs>0 ? P.total/A.cogs : null;
  /* Sin ventas el año anterior, el aviso va UNA vez debajo de los KPIs (antes se repetía en cada tarjeta). */
  const hasPrior = !!(Ap && (Ap.units>0 || (Pp && Pp.total>0)));
  const D = (cur, prev, o)=> hasPrior ? finDelta(cur, prev, o) : "";

  /* v88: los KPIs del período viven en el Resumen (antes esta pestaña repetía las 6
     tarjetas). Acá arranca directo en los gráficos, con un acceso de un toque. */
  const kpis = `<p class="finbar-note" style="margin:-6px 0 18px">${t("an.kpis.moved")} <button type="button" class="linkbtn" id="an_goresumen">${t("an.kpis.go")}</button></p>`;

  /* --- Serie mensual + tabla mes a mes --- */
  const combo = `
  <div class="u-mb5 panel chart">
    <p class="ctitle">${t("fin.combo.title")}</p>
    <p class="csub">${t("fin.combo.sub")} ${t("dr.hint.month")}</p>
    <div class="fin-legend"><span><i class="lg-sales"></i>${units?t("fin.s.unitssold"):t("fin.s.sales")}</span><span><i class="lg-purch"></i>${units?t("fin.s.unitsbought"):t("fin.s.purch")}</span><span><i class="dot"></i>${t("fin.s.gm")}</span></div>
    ${finComboSVG(months, units)}
  </div>`;
  let prevPct = null;
  const mRows = months.map(m=>{
    const rt = m.cogs>0 ? m.purch/m.cogs : null;   // v87: compras / costo vendido
    const d = (m.gpPct!=null && prevPct!=null) ? (m.gpPct-prevPct)*100 : null;
    if(m.gpPct!=null) prevPct = m.gpPct;
    const dTxt = d==null ? "—" : (Math.abs(d)<0.05 ? "= 0 pp" : (d>0?"▲ +":"▼ −")+nfDec(1).format(Math.abs(d))+" pp");
    const stk = finStockAt(m.mk, { linea:q.linea, idioma:q.idioma });
    return `<tr class="drillable" data-drill="m:${m.mk}" tabindex="0" title="${t("dr.tap")}"><td>${esc(m.label)}</td><td class="num">${m.net?moneyRound(m.net):"—"}</td><td class="num">${m.purch?moneyRound(m.purch):"—"}</td>
      <td class="num ${rt!=null&&rt>1.2?"warn":""}">${rt!=null?nfDec(2).format(rt):"—"}</td>
      <td class="num">${m.net?moneyRound(m.gp):"—"}</td><td class="num"><b>${m.gpPct!=null?fmtPct(m.gpPct):"—"}</b></td>
      <td class="num ${d==null||Math.abs(d)<0.05?"":(d>0?"pos":"neg")}">${dTxt}</td>
      <td class="num">${stk?moneyRound(stk.value):"—"}${stk&&stk.source==="live"?` <span class="kpi-tag">${t("fin.today")}</span>`:""}</td></tr>`;
  }).join("");
  const monthTable = months.length ? `
  <div class="u-mb5 panel chart">
    <p class="ctitle">${t("fin.mtbl.title")}</p>
    <p class="csub">${t("fin.mtbl.sub")} ${t("dr.hint.rows")}</p>
    <div class="table-scroll"><table class="fintbl">
      <thead><tr><th>${t("fin.th.month")}</th><th class="r">${t("an.kpi.netrev")}</th><th class="r">${t("fin.kpi.purch")}</th><th class="r">${t("fin.th.ratio")}</th><th class="r">${t("an.kpi.grossmargin")}</th><th class="r">${t("fin.kpi.gmpct")}</th><th class="r">${t("fin.th.dpp")}</th><th class="r">${t("stk.th.close")}</th></tr></thead>
      <tbody>${mRows}</tbody>
      <tfoot><tr><td>${t("common.total")}</td><td class="num">${moneyRound(A.net)}</td><td class="num">${moneyRound(P.total)}</td><td class="num">${ratio!=null?nfDec(2).format(ratio):"—"}</td><td class="num">${moneyRound(A.gp)}</td><td class="num">${A.net>0?fmtPct(A.gpPct):"—"}</td><td></td><td></td></tr></tfoot>
    </table></div>
  </div>` : "";

  /* --- Rankings y cortes --- */
  const detail = Object.values(A.detail);
  const topBy = (fn, n)=> detail.map(e=>({ label:e.nombre, sku:e.sku, drill:"pid:"+e.productoId, value:fn(e) })).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,n||10);
  const topRev = topBy(e=> units ? e.units : e.revenue);
  const topMargin = topBy(e=> round2(e.revenue-e.cogs));
  const byDim = (keyFn, labelFn, dk)=>{ const mm={}; rows.forEach(rw=>{ const k=keyFn(rw); if(!k) return; const e=mm[k]=mm[k]||{units:0,revenue:0}; e.units+=rw.cantidad; e.revenue+=rw.revenue; }); return Object.entries(mm).map(([k,v])=>({label:labelFn?labelFn(k):k, drill:dk+":"+k, value: units?v.units:round2(v.revenue)})).sort((a,b)=>b.value-a.value); };
  const byPais = byDim(rw=>rw.pais, k=>paisLabel(k), "pais").slice(0,8), byLang = byDim(rw=>rw.idioma, k=>langLabel(k), "idioma");

  const sagaTot = Object.values(A.bySaga).reduce((a,s)=>a+s.net,0);
  const sagaList = Object.entries(A.bySaga).map(([k,s])=>({ k, net:s.net, share: sagaTot>0?s.net/sagaTot:0, gpPct: s.net>0?(s.net-s.cogs)/s.net:null })).sort((a,b)=>b.net-a.net);
  const maxShare = Math.max(0.0001, ...sagaList.map(s=>s.share));
  const mixHTML = sagaList.length ? sagaList.map(s=>`
    <button type="button" class="mixrow ${finFiltros.linea===s.k?"on":""}" data-mixsaga="${esc(s.k)}" title="${t("fin.mix.tip")}">
      <span class="ml">${esc(s.k)}</span>
      <span class="mt"><span class="mf" style="display:block;width:${(s.share/maxShare*100).toFixed(1)}%"></span></span>
      <span class="ms">${fmtPct(s.share,0)}</span>
      <span class="mm" style="color:${s.gpPct==null?"var(--muted)":(A.gpPct && s.gpPct<A.gpPct?"var(--neg)":"var(--pos)")}">${fmtPct(s.gpPct)}</span>
    </button>`).join("") : `<div class="cempty">${t("an.nosales")}</div>`;

  const vendPerf = Object.entries(A.perVend).map(([vid,v])=>({ vid, nombre:v.nombre, units:v.units, revenue:round2(v.sales), margin:round2(v.sales-v.cogs),
      marginPct: v.sales>0 ? (v.sales-v.cogs)/v.sales : null, contrib: round2(v.sales-v.cogs+v.shipping+v.cargos-v.commission-v.costos) })).sort((a,b)=>b.revenue-a.revenue);

  /* Costo y margen por sociedad (procedencia del stock vendido), desde las mismas filas. */
  const bySoc = {};
  const addSoc = (soc, u, cg, rev, contr)=>{ const k=isStore(soc)?soc:"—"; const e=bySoc[k]=bySoc[k]||{units:0,cogs:0,revenue:0,contrib:0}; e.units+=u; e.cogs+=cg; e.revenue+=rev; e.contrib+=contr; };
  rows.forEach(rw=>{
    if(rw.consumed){
      const lu = rw.cantidad || rw.consumed.reduce((a,c)=>a+(c.cantidad||0),0);
      const ct = rw.consumed.reduce((a,c)=>a+(c.costoUnit||0)*(c.cantidad||0),0);
      rw.consumed.forEach(c=>{
        const cCogs = ct>0 ? rw.cogs*(((c.costoUnit||0)*(c.cantidad||0))/ct) : rw.cogs*((c.cantidad||0)/(lu||1));
        const uSh = lu>0 ? (c.cantidad||0)/lu : 0, cRev = rw.revenue*uSh;
        addSoc(c.sociedad, c.cantidad||0, cCogs, cRev, cRev - cCogs + (rw.ship + rw.cargos - rw.costos)*uSh - (cRev - cCogs)*(rw.rate||0));
      });
    } else addSoc(rw.store||"—", rw.cantidad, rw.cogs, rw.revenue, rw.contrib);
  });
  const socRows = STORE_IDS.concat(Object.keys(bySoc).filter(k=>!isStore(k))).filter(k=>bySoc[k]).map(k=>{ const e=bySoc[k], mg=e.revenue-e.cogs;
    return { k, nombre:k==="—"?t("an.soc.nobreakdown"):storeName(k), units:e.units, cogs:e.cogs, avg:e.units>0?e.cogs/e.units:0, revenue:e.revenue, margin:mg, marginPct:e.revenue>0?mg/e.revenue:null, contrib:e.contrib }; });

  const metricW = units ? t("an.w.units") : t("an.w.revenue");
  const charts = `
  <div class="chart-grid">
    <div class="panel chart">
      <p class="ctitle">${t("an.top.title",{metric:units?t("an.w.unitslow"):t("an.w.revenuelow")})}</p>
      <p class="csub">${t("fin.top.sub.drill")}</p>
      ${topRev.length ? hbars(topRev, mfmt, "var(--series-sales)") : `<div class="cempty">${t("an.nosales")}</div>`}
    </div>
    <div class="panel chart">
      <p class="ctitle">${t("an.topmargin.title")}</p>
      <p class="csub">${t("an.topmargin.sub")} ${t("dr.hint.bar")}</p>
      ${topMargin.length ? hbars(topMargin, money, "var(--pos)") : `<div class="cempty">${t("an.nosales")}</div>`}
    </div>
    <div class="panel chart">
      <p class="ctitle">${t("fin.mix.title")}</p>
      <p class="csub">${t("fin.mix.sub",{p:A.net>0?fmtPct(A.gpPct):"—"})}</p>
      ${mixHTML}
    </div>
    <div class="panel chart">
      <p class="ctitle">${t("fin.geo.title")}</p>
      <p class="csub">${t("fin.geo.sub")} ${t("dr.hint.bar")}</p>
      <p class="fin-subhead">${t("an.bycountry.title",{metric:metricW})}</p>
      ${byPais.length ? hbars(byPais, mfmt, "var(--series-sales)") : `<div class="cempty">${t("an.bycountry.empty")}</div>`}
      <p class="fin-subhead">${t("an.bylang.title",{metric:metricW})}</p>
      ${byLang.length ? hbars(byLang, mfmt, "var(--series-sales)") : `<div class="cempty">${t("an.bylang.empty")}</div>`}
    </div>
    <div class="u-span-all panel chart">
      <p class="ctitle">${t("an.perf.title")}</p>
      <p class="csub">${t("an.perf.sub")} ${t("dr.hint.rows")}</p>
      ${vendPerf.length ? `<div class="table-scroll"><table class="fintbl">
        <thead><tr><th>${t("an.th.seller")}</th><th class="r">${t("an.th.units")}</th><th class="r">${t("an.th.revenue")}</th><th class="r">${t("an.th.margin")}</th><th class="r">${t("an.th.marginpct")}</th><th class="r">${t("an.kpi.contrib")}</th></tr></thead>
        <tbody>${vendPerf.map(v=>`<tr class="drillable" data-drill="vend:${esc(v.vid)}" tabindex="0" title="${t("dr.tap")}"><td>${esc(v.nombre)}</td><td class="num">${qty(v.units)}</td><td class="num">${moneyRound(v.revenue)}</td><td class="num">${moneyRound(v.margin)}</td><td class="num">${fmtPct(v.marginPct)}</td><td class="num ${v.contrib<0?"neg":""}">${moneyRound(v.contrib)}</td></tr>`).join("")}</tbody>
      </table></div>` : `<div class="cempty">${t("an.nosales")}</div>`}
    </div>
    ${STORE_IDS.length>1 ? `<div class="u-span-all panel chart">
      <p class="ctitle">${t("an.soc.title")}</p>
      <p class="csub">${t("an.soc.sub")}</p>
      ${socRows.length ? `<div class="table-scroll"><table class="fintbl">
        <thead><tr><th>${t("an.soc.society")}</th><th class="r">${t("an.soc.unitssold")}</th><th class="r">${t("an.soc.cogs")}</th><th class="r">${t("an.soc.avgcost")}</th><th class="r">${t("an.soc.revenue")}</th><th class="r">${t("an.soc.margin")}</th><th class="r">${t("an.soc.marginpct")}</th><th class="r">${t("an.kpi.contrib")}</th></tr></thead>
        <tbody>${socRows.map(s=>`<tr ${isStore(s.k)?`class="drillable" data-drill="soc:${esc(s.k)}" tabindex="0" title="${t("dr.tap")}"`:""}><td>${esc(s.nombre)}</td><td class="num">${qty(s.units)}</td><td class="num">${moneyRound(s.cogs)}</td><td class="num">${moneyRound(s.avg)}</td><td class="num">${moneyRound(s.revenue)}</td><td class="num">${moneyRound(s.margin)}</td><td class="num">${fmtPct(s.marginPct)}</td><td class="num ${s.contrib<0?"neg":""}">${moneyRound(s.contrib)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>${t("an.soc.total")}</td><td class="num">${qty(A.units)}</td><td class="num">${moneyRound(A.cogs)}</td><td class="num">—</td><td class="num">${moneyRound(A.sales)}</td><td class="num">${moneyRound(A.sales-A.cogs)}</td><td class="num">${A.sales>0?fmtPct((A.sales-A.cogs)/A.sales):"—"}</td><td class="num">${moneyRound(A.contrib)}</td></tr></tfoot>
      </table></div><p class="u-mt2 csub">${t("an.soc.foot")}</p>` : `<div class="cempty">${t("an.nosales")}</div>`}
    </div>` : ""}
  </div>`;

  const soc = socFocoActual();
  return `
  <div class="head"><div class="title"><h2>${t("fin.an.title")}</h2><p>${t("fin.an.sub")}</p></div>
    <div class="u-gap2 actions">
      <div class="seg" role="group" aria-label="${t("fin.metric")}"><button type="button" class="seg-btn ${!units?"on":""}" data-metric="usd">${t("an.metric.usd")}</button><button type="button" class="seg-btn ${units?"on":""}" data-metric="units">${t("an.metric.units")}</button></div>
    </div>
  </div>
  ${finFilterBarHTML()}
  ${soc ? `<div class="u-mb3 banner">${t("an.socfocus",{soc:`<b>${esc(storeName(soc))}</b>`})}</div>` : ""}
  ${kpis}
  ${combo}
  ${semanasPanel(q)}
  ${monthTable}
  ${finStockHistoryPanel(q, r)}
  ${charts}`;
}
function wireAnalisis(){
  if(view!=="analisis") return;
  wireFinFilterBar();
  /* v86: el export a Excel vive sólo en P&L (antes también había un botón acá). */
  document.querySelectorAll("[data-metric]").forEach(b=> b.onclick=()=>{ anMetric=b.dataset.metric; render(); });
  // Barras, meses y filas -> detalle de ventas (11e-drill.js)
  wireDrills();
  const gr=document.getElementById("an_goresumen"); if(gr) gr.onclick=()=> setView("resumen");
  const rs=document.getElementById("stk_refreeze"); if(rs) rs.onclick=()=>{ if(confirm(t("stk.refreeze.confirm"))){ const n=finFreezeStockSnaps(true); toast(t("stk.refreeze.done",{n})); render(); } };
  // Mix por línea -> filtra (o desfiltra) esa línea en toda la sección
  document.querySelectorAll('#main [data-mixsaga]').forEach(b=> b.onclick=()=>{ const sg=b.dataset.mixsaga; finFiltros.linea = (finFiltros.linea===sg?"":sg); render(); });
  hideNameTip(); wireNameTips(document.getElementById("main"));
  wireDonuts();
}

/* ============================================================
   STOCK AL CIERRE DE CADA MES (fotos mensuales, 05-metrics.js)
   ============================================================ */
function finStockHistoryPanel(q, r){
  const d = { linea:q.linea, idioma:q.idioma };
  // Últimos 12 meses hasta el fin del período (o hasta hoy)
  const end = r.to ? r.to.slice(0,7) : finCurMonth();
  const [ey,em] = end.split("-").map(Number);
  const pts = [];
  for(let i=11;i>=0;i--){ const dt=new Date(ey, em-1-i, 1), mk=finIso(dt).slice(0,7); const st=finStockAt(mk, d); if(st) pts.push({ mk, label:finMonthLabel(mk), value:st.value, units:st.units, source:st.source, drill:"m:"+mk }); }
  if(!pts.length) return "";
  const snaps = pts.filter(p=>p.source==="snap").length;
  return `
  <div class="u-mb5 panel chart">
    <div class="u-flex u-between u-items-start u-gap3 u-wrap">
      <div><p class="ctitle">${t("stk.title")}</p><p class="csub">${t("stk.sub")}</p></div>
      ${isAdmin()?`<button type="button" class="btn ghost sm" id="stk_refreeze">${t("stk.refreeze")}</button>`:""}
    </div>
    ${trendChartSVG(pts.map(p=>({ label:p.label, value:p.value, drill:p.drill })), money, "var(--series-purch)")}
    <p class="fin-help">${t(snaps===1?"stk.legend1":"stk.legend",{n:snaps})}</p>
  </div>`;
}

/* ============================================================
   v89 — ÚLTIMAS 12 SEMANAS (lunes a domingo)
   Con pocos meses de historia, la semana muestra la tendencia que el mes
   todavía no deja ver. Respeta los filtros de juego/idioma/país/vendedor/
   sociedad; el período del filtro no aplica (siempre son las últimas 12).
   ============================================================ */
function finLunes(d){ const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = (x.getDay()+6)%7; x.setDate(x.getDate()-w); return x; }
function semanasPanel(q){
  const a = finAnchor(), l0 = finLunes(a); l0.setDate(l0.getDate()-7*11);
  const rows = finSaleLines(Object.assign({}, q, { from:finIso(l0), to:finIso(a) }));
  if(!rows.length) return "";
  const wk = [];
  for(let i=0;i<12;i++){ const d = new Date(l0); d.setDate(d.getDate()+7*i); wk.push({ k:finIso(d), d, net:0, gp:0, units:0 }); }
  const idx = {}; wk.forEach((w,i)=> idx[w.k]=i);
  rows.forEach(r=>{ const k = finIso(finLunes(new Date(r.fecha+"T12:00:00"))); const i = idx[k]; if(i==null) return;
    wk[i].net += r.net; wk[i].gp += r.net - r.cogs; wk[i].units += r.cantidad; });
  const W = finTrimMeses(wk, w=> w.net || w.units);   // sin semanas vacías al principio
  const lab = w=> w.d.toLocaleDateString(lang()==="es"?"es-AR":"en-US",{day:"numeric",month:"short"});
  const money_ = anMetric==="units";
  const items = W.map(w=>({ label:lab(w), value: money_ ? w.units : round2(w.net) }));
  const curW = W[W.length-1], prevW = W[W.length-2];
  const wow = (curW && prevW && prevW.net>0) ? (curW.net/prevW.net-1) : null;
  const cmp = (()=>{   // semana en curso: comparar a igual cantidad de días
    const dias = ((a.getDay()+6)%7)+1; return dias<7 ? t("wk.partial",{d:dias}) : "";
  })();
  const gpRow = W.map(w=> `<td class="num">${w.net>0?fmtPct(w.gp/w.net,0):"—"}</td>`).join("");
  return `<div class="u-mb5 panel chart">
    <p class="ctitle">${t("wk.title")}</p>
    <p class="csub">${t("wk.sub")} ${cmp}${wow!=null?" "+t("wk.wow",{p:(wow>=0?"+":"")+fmtPct(wow,0)}):""}</p>
    ${trendChartSVG(items, money_ ? qty : money)}
    <div class="table-scroll"><table class="u-mt2 fintbl"><tbody><tr><td style="color:var(--pos);font-weight:700">${t("fin.s.gm")}</td>${gpRow}</tr></tbody></table></div>
  </div>`;
}

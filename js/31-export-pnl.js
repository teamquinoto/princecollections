/* ============================================================
   P&L EXPORT (point 8) — preliminary income statement (Excel)
   ------------------------------------------------------------
   Se arma con pnlAggregate() — el MISMO rollup que la pestaña P&L —
   así el Excel siempre cierra con lo que ves en pantalla (moneda de
   reporte al TC del mes, comisiones y costos de venta incluidos).
   soc = null  -> consolidado + hoja "Por sociedad" (lado a lado).
   soc = "akira" -> sólo lo que salió del stock de esa sociedad (FIFO).
   ============================================================ */
function exportPnL(desde, hasta, soc){
  if(!window.XLSX){ toast(t("pnl.tt.noxlsx"),"warn"); return; }
  soc = (soc && STORE_IDS.includes(soc)) ? soc : null;
  /* v83: con gastos de estructura cargados (y sin filtros de juego/idioma/país/vendedor)
     el estado baja hasta el resultado operativo. gxPnL devuelve una copia aumentada. */
  const withGx = (P, s)=> (typeof gxPnL==="function") ? gxPnL(P, desde, hasta, s) : Object.assign({}, P, { show:false });
  const A = withGx(pnlAggregate(desde, hasta, soc), soc);

  // ---- Formatos de celda (símbolo de la moneda de reporte) ----
  const sym = String(monedaSym(A.rep)).replace(/"/g,"");
  const MFMT = `"${sym} "#,##0.00;("${sym} "#,##0.00)`;
  const PFMT = '0.0%';
  const setFmt = (ws, ref, z)=>{ const c=ws[ref]; if(c && typeof c.v==="number") c.z=z; };
  const fmtCols = (ws, fromRow, toRow, moneyCols, pctCols)=>{
    for(let r=fromRow;r<=toRow;r++){ moneyCols.forEach(c=> setFmt(ws, c+r, MFMT)); pctCols.forEach(c=> setFmt(ws, c+r, PFMT)); }
  };

  const period = t("xl.period",{from:desde?fmtDate(desde):t("xl.start"), to:hasta?fmtDate(hasta):t("xl.today")});
  // Con filtros de línea/idioma/país/vendedor activos, el Excel lo dice en el encabezado:
  // pnlAggregate() ya los aplica, así que el archivo cierra con lo que se ve en pantalla.
  const scope  = (soc ? t("xl.scope.soc",{soc:storeName(soc)}) : t("xl.scope.consol"))
               + (finDimsActive() ? " · "+t("fin.xl.filtered",{sel:finDimsLabel()}) : "");
  const wb = XLSX.utils.book_new();

  /* Líneas del estado (multi-step). Se reusan en la hoja "Por sociedad". */
  const selling = P=> round2(P.costos.envio+P.costos.labor+P.costos.comision+P.costos.otro);
  const IS_LINES = [
    [t("xl.is.sales"),    P=> P.sales],
    [t("xl.is.shipping"), P=> P.shipping],
    [t("xl.is.cargos"),   P=> P.cargos],
    [t("xl.is.net"),      P=> P.net, true],
    [t("xl.is.cogs"),     P=> -P.cogs],
    [t("xl.is.gp"),       P=> P.gp, true],
    [t("xl.is.comm"),     P=> -P.commission],
    [t("xl.is.selling"),  P=> -selling(P)],
    [t("xl.is.contrib"),  P=> P.contrib, true],
  ];
  if(A.show) IS_LINES.push(
    [t("gx.pnl.adm"),  P=> -(P.opexAdm||0)],
    [t("gx.pnl.com"),  P=> -(P.opexCom||0)],
    [t(A.hasBajo ? "pnl.ebitda" : "gx.pnl.ebit"), P=> P.ebit, true]
  );
  // v90: hasta el resultado neto, igual que la pantalla y el Excel con formato
  if(A.show && A.hasBajo) IS_LINES.push(
    [t("pnl.amort"), P=> -(P.amort||0)],
    [t("pnl.ebitop"), P=> P.ebitOp, true],
    [t("pnl.fin"), P=> -(P.fin||0)],
    [t("pnl.ebt"), P=> P.ebt, true],
    [t("pnl.tax"), P=> -(P.tax||0)],
    [t("pnl.neto"), P=> P.neto, true]
  );

  /* ---------- HOJA 1: Estado de resultados ---------- */
  const pct = n=> A.net>0 ? n/A.net : 0;
  const IS = [
    [t("xl.is.title")+" — "+scope],
    [period],
    [""],
    [t("xl.is.concept"), soc?storeName(soc):t("xl.is.consol"), t("xl.is.pctrev")],
    ...IS_LINES.map(([lbl,fn])=>[lbl, fn(A), pct(fn(A))]),
    [t("xl.is.gmpct"), A.gpPct, ""],
    [t("xl.is.contribpct"), A.contribPct, ""],
    [""],
    [A.show ? t("gx.xl.struct") : (A.blocked ? t("gx.pnl.blocked") : t("xl.is.struct"))],
    [""],
    [t("xl.is.notes")],
    [t("xl.is.n1")],
    [t("xl.is.n2")],
    [soc ? t("xl.is.n3soc") : t("xl.is.n3")],
    [t("xl.is.n4")],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(IS);
  ws1["!cols"]=[{wch:48},{wch:18},{wch:13}];
  ws1["!merges"]=[{s:{r:0,c:0},e:{r:0,c:2}},{s:{r:1,c:0},e:{r:1,c:2}}];
  const firstL = 5, lastL = 4+IS_LINES.length;
  fmtCols(ws1, firstL, lastL, ["B"], ["C"]);
  setFmt(ws1, "B"+(lastL+1), PFMT); setFmt(ws1, "B"+(lastL+2), PFMT);
  XLSX.utils.book_append_sheet(wb, ws1, t("xl.sh.is"));

  /* ---------- HOJA 2 (sólo consolidado): Por sociedad, lado a lado ---------- */
  if(!soc && STORE_IDS.length>1){
    const socs = STORE_IDS.map(s=>({ s, P:withGx(pnlAggregate(desde, hasta, s), s) }));
    const hdr = [t("xl.is.concept"), ...socs.map(x=>storeName(x.s)), t("xl.is.consol")];
    const body = IS_LINES.map(([lbl,fn])=>[lbl, ...socs.map(x=>fn(x.P)), fn(A)]);
    const pctRow = (lbl,key)=>[lbl, ...socs.map(x=>x.P[key]), A[key]];
    const sAoa = [[t("xl.sh.soc")],[period],[],hdr,...body,pctRow(t("xl.is.gmpct"),"gpPct"),pctRow(t("xl.is.contribpct"),"contribPct"),
                  [t("xl.h.units"), ...socs.map(x=>x.P.units), A.units],[],[t("xl.soc.note")]];
    const ws = XLSX.utils.aoa_to_sheet(sAoa);
    const nC = hdr.length;
    ws["!cols"]=[{wch:40}, ...Array(nC-1).fill({wch:16})];
    ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:nC-1}},{s:{r:1,c:0},e:{r:1,c:nC-1}}];
    const colL = i=> String.fromCharCode(66+i);   // B, C, D...
    const mCols = [...Array(nC-1).keys()].map(colL);
    fmtCols(ws, 5, 4+IS_LINES.length, mCols, []);
    fmtCols(ws, 5+IS_LINES.length, 6+IS_LINES.length, [], mCols);
    XLSX.utils.book_append_sheet(wb, ws, t("xl.sh.soc"));
  }

  /* ---------- Por vendedor ---------- */
  const vHeader = [t("xl.h.seller"),t("xl.h.revenue"),t("xl.h.cogs"),t("xl.h.gm"),t("xl.h.gmpct"),t("xl.h.comm")];
  let sV=0,sC=0,sK=0;
  const vBody = Object.values(A.perVend).sort((a,b)=>b.sales-a.sales).map(v=>{
    const gm=round2(v.sales-v.cogs), p=v.sales>0?(gm/v.sales):0;
    sV+=v.sales; sC+=v.cogs; sK+=v.commission;
    return [v.nombre, round2(v.sales), round2(v.cogs), gm, p, round2(v.commission)];
  });
  const tGM=round2(sV-sC), tP=sV>0?(tGM/sV):0;
  const vAoa=[[t("xl.sh.seller")+" — "+scope],[period],[],vHeader,...vBody,[],["TOTAL",round2(sV),round2(sC),tGM,tP,round2(sK)]];
  const ws2=XLSX.utils.aoa_to_sheet(vAoa);
  ws2["!cols"]=[{wch:22},{wch:14},{wch:14},{wch:14},{wch:10},{wch:14}];
  ws2["!merges"]=[{s:{r:0,c:0},e:{r:0,c:5}},{s:{r:1,c:0},e:{r:1,c:5}}];
  fmtCols(ws2, 5, vAoa.length, ["B","C","D","F"], ["E"]);
  XLSX.utils.book_append_sheet(wb, ws2, t("xl.sh.seller"));

  /* ---------- Detalle por producto ---------- */
  const header = ["SKU",t("common.product"),t("xl.h.units"),t("xl.h.revenue"),t("xl.h.cogs"),t("xl.h.gm"),t("xl.h.gmpct")];
  let tU=0,tR=0,tC=0; const body=[];
  Object.values(A.detail).sort((a,b)=>b.revenue-a.revenue).forEach(e=>{
    const gm=round2(e.revenue-e.cogs), p = e.revenue>0? (gm/e.revenue):0;
    body.push([e.sku, e.nombre, e.units, round2(e.revenue), round2(e.cogs), gm, p]);
    tU+=e.units; tR+=e.revenue; tC+=e.cogs;
  });
  const dGM=round2(tR-tC), dP=tR>0?(dGM/tR):0;
  const dAoa=[[t("xl.detail.title")+" — "+scope],[period],[],header,...body,[],["","TOTAL",tU,round2(tR),round2(tC),dGM,dP]];
  const ws3=XLSX.utils.aoa_to_sheet(dAoa);
  ws3["!cols"]=[{wch:14},{wch:42},{wch:8},{wch:13},{wch:13},{wch:13},{wch:10}];
  ws3["!merges"]=[{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}}];
  fmtCols(ws3, 5, dAoa.length, ["D","E","F"], ["G"]);
  XLSX.utils.book_append_sheet(wb, ws3, t("xl.sh.detail"));

  /* ---------- Gastos de estructura (detalle del período) ---------- */
  if(A.show && A.gx && A.gx.items.length){
    const gHdr = [t("gx.xl.month"), t("gx.th.concept"), t("gx.th.cat"), t("gx.cats.group"), t("gx.th.soc"), t("gx.th.type"), t("gx.th.amount")];
    const gBody = A.gx.items.slice().sort((a,b)=> a.mes<b.mes?-1: a.mes>b.mes?1 : String(a.cat).localeCompare(String(b.cat)))
      .map(x=>[x.mes, x.concepto, gxCatLabel(x.cat), t("gx.grp."+x.grupo), gxSocLabel(x.soc), t("gx.orig."+x.origen), x.asignado]);
    const gAoa = [[t("gx.xl.sheet")+" — "+scope],[period],[],gHdr,...gBody,[],["","","","","","TOTAL",A.gx.total]];
    if(soc) gAoa.push([], [t("gx.xl.socnote",{p:fmtPct(A.gx.share,1)})]);
    const wsG = XLSX.utils.aoa_to_sheet(gAoa);
    wsG["!cols"]=[{wch:10},{wch:34},{wch:26},{wch:18},{wch:14},{wch:12},{wch:14}];
    wsG["!merges"]=[{s:{r:0,c:0},e:{r:0,c:6}},{s:{r:1,c:0},e:{r:1,c:6}}];
    fmtCols(wsG, 5, 4+gBody.length+2, ["G"], []);
    XLSX.utils.book_append_sheet(wb, wsG, t("gx.xl.sheet").slice(0,31));
  }

  const slug = soc ? "-"+String(storeName(soc)).toLowerCase().replace(/[^a-z0-9]+/g,"-") : "";
  XLSX.writeFile(wb, `${t("xl.file")}${slug}-${isoLocal(new Date())}.xlsx`);
  toast(t("pnl.tt.exported"));
}
function openPnLExport(){
  // Arranca con el período que estás mirando en Finanzas (antes: siempre mes en curso).
  const fr = finRange();
  const today = fr.to || isoLocal(new Date());
  const first = fr.from || "";
  const cur = socFocoActual();
  const socSel = STORE_IDS.length>1 ? `<div class="field" style="grid-column:1/3"><label>${t("bar.society")}</label>
      <select class="inp" id="pnl_soc">
        <option value="" ${!cur?"selected":""}>${t("xl.opt.consol")}</option>
        ${STORE_IDS.map(s=>`<option value="${esc(s)}" ${cur===s?"selected":""}>${esc(storeName(s))}</option>`).join("")}
      </select></div>` : "";
  buildModal(t("pnl.md.title"), `
    <p class="hint" style="margin:0 0 12px">${t("pnl.hint")}</p>
    <div class="grid-form" style="grid-template-columns:1fr 1fr;padding:0">
      <div class="field"><label>${t("mov.from")}</label><input class="inp" type="date" id="pnl_d0" value="${first}"></div>
      <div class="field"><label>${t("mov.to")}</label><input class="inp" type="date" id="pnl_d1" value="${today}"></div>
      ${socSel}
    </div>
  `, [
    {label:t("common.cancel"),cls:"btn",act:closeModal},
    {label:t("io.exportxlsx"),cls:"btn primary",act:()=>{ const d0=document.getElementById("pnl_d0").value, d1=document.getElementById("pnl_d1").value;
       const sEl=document.getElementById("pnl_soc"); const s=sEl?sEl.value:""; closeModal(); exportPnL(d0,d1,s||null); }}
  ]);
}

/* ============================================================
   gestordestock — 31b-export-pnl-pro.js  (v85)
   EXPORT DEL P&L CON PRESENTACIÓN (para socios)
   ------------------------------------------------------------
   Reemplaza a exportPnL() de 31-export-pnl.js. Usa ExcelJS (la versión
   gratuita de SheetJS no escribe colores, bordes ni imágenes). ExcelJS
   se carga recién al exportar, desde cdnjs (con jsDelivr de respaldo),
   y el SW lo deja en caché para usarlo offline.
   Si ExcelJS no carga (sin internet la primera vez), se exporta el
   Excel plano de siempre: nunca te quedás sin archivo.

   Hojas:
     Resumen ............ tarjetas KPI, estado de resultados, 3 gráficos,
                          lectura rápida (1 hoja A4 apaisada)
     P&L mensual ........ mes a mes + total + % s/ ingreso (fórmulas)
     Por sociedad ....... sólo consolidado y con 2+ sociedades
     Por juego / Por vendedor / Gastos de estructura / Productos
   Todo sale de pnlAggregate() + gxPnL(): cierra con la pantalla.
   Los gráficos se dibujan en un <canvas> y van como imagen.
   ============================================================ */
const _exportPnLBasic = exportPnL;
const XP_EXCELJS = [
  "vendor/exceljs.min.js"   // v96: guardado dentro de la app (antes se bajaba de un CDN)
];
let _xpLoading = null;
function xpLoadExcelJS(){
  if(window.ExcelJS) return Promise.resolve();
  if(_xpLoading) return _xpLoading;
  _xpLoading = (async ()=>{
    for(const u of XP_EXCELJS){
      try{
        await new Promise((res, rej)=>{ const s = document.createElement("script"); s.src = u; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
        if(window.ExcelJS) return;
      }catch(e){ /* probar el siguiente */ }
    }
    throw new Error("ExcelJS");
  })();
  _xpLoading.catch(()=>{ _xpLoading = null; });
  return _xpLoading;
}

exportPnL = async function(desde, hasta, soc){
  soc = (soc && STORE_IDS.includes(soc)) ? soc : null;
  toast(t("xp.tt.building"));
  try{ await xpLoadExcelJS(); }
  catch(e){ toast(t("xp.tt.fallback"), "warn"); return _exportPnLBasic(desde, hasta, soc); }
  try{ await xpBuild(desde||"", hasta||"", soc); }
  catch(e){ console.error(e); toast(t("xp.tt.fallback"), "warn"); return _exportPnLBasic(desde, hasta, soc); }
};

/* ---------- Paleta y estilos ---------- */
const XC = { navy:"FF0F172A", slate:"FF334155", blue:"FF2563EB", lblue:"FFDBEAFE", gray:"FFF3F4F6", line:"FFE5E7EB",
             mut:"FF6B7280", ink:"FF111827", red:"FFDC2626", white:"FFFFFFFF", sub:"FFCBD5E1", bord:"FF9CA3AF" };
const xpFont = o=> Object.assign({ name:"Arial", size:10, color:{ argb:XC.ink } }, o||{});
const xpFill = c=> ({ type:"pattern", pattern:"solid", fgColor:{ argb:c } });
const xpThin = c=> ({ style:"thin", color:{ argb:c||XC.line } });

/* ============================================================
   Líneas del estado de resultados (claves → así el mensual mapea por clave)
   ============================================================ */
function xpVal(X, key){
  switch(key){
    case "sales":    return X.sales;
    case "shipping": return X.shipping;
    case "cargos":   return X.cargos;
    case "net":      return X.net;
    case "cogs":     return -X.cogs;
    case "gp":       return X.gp;
    case "comm":     return -X.commission;
    case "selling":  return -round2(X.sellingTotal - X.commission);
    case "contrib":  return X.contrib;
    case "adm":      return -(X.opexAdm||0);
    case "com":      return -(X.opexCom||0);
    case "ebit":     return X.ebit;
    // v90: debajo del EBITDA (mismos campos que gxPnL / pantalla)
    case "amort":    return -(X.amort||0);
    case "ebitop":   return X.ebitOp!=null ? X.ebitOp : X.ebit;
    case "fin":      return -(X.fin||0);
    case "ebt":      return X.ebt!=null ? X.ebt : X.ebit;
    case "tax":      return -(X.tax||0);
    case "neto":     return X.neto!=null ? X.neto : X.ebit;
  }
  if(key.startsWith("cat:")) return -((X.gx && X.gx.byCat[key.slice(4)]) || 0);
  if(key.startsWith("catb:")) return -((X.gx && X.gx.byCatBajo && X.gx.byCatBajo[key.slice(5)]) || 0);
  return 0;
}
function xpLines(A){
  const L = [];
  L.push({ key:"sales", lab:t("xl.is.sales"), kind:"normal" });
  if(Math.abs(A.shipping)>=0.005) L.push({ key:"shipping", lab:t("xl.is.shipping"), kind:"ind" });
  if(Math.abs(A.cargos)>=0.005)   L.push({ key:"cargos", lab:t("xl.is.cargos"), kind:"ind" });
  L.push({ key:"net", lab:t("xl.is.net"), kind:"sub" });
  L.push({ key:"cogs", lab:t("xl.is.cogs"), kind:"normal" });
  L.push({ key:"gp", lab:t("xl.is.gp"), kind:"sub" });
  L.push({ key:"comm", lab:t("xl.is.comm"), kind:"normal" });
  if(Math.abs(A.sellingTotal - A.commission)>=0.005) L.push({ key:"selling", lab:t("xl.is.selling"), kind:"normal" });
  L.push({ key:"contrib", lab:t("xl.is.contrib"), kind: A.show ? "sub" : "total" });
  if(A.show){
    ["adm","com"].forEach(grp=>{
      const cats = Object.keys(A.gx.byCat).filter(id=> (gxCat(id).grupo==="com"?"com":"adm")===grp).sort((a,b)=> A.gx.byCat[b]-A.gx.byCat[a]);
      if(!cats.length) return;
      L.push({ key:grp, lab:t("gx.pnl."+grp), kind:"normal" });
      cats.forEach(id=> L.push({ key:"cat:"+id, lab:gxCatLabel(id), kind:"ind" }));
    });
    L.push({ key:"ebit", lab:t(A.hasBajo ? "pnl.ebitda" : "gx.pnl.ebit"), kind:"total" });
    /* v90/v91: misma cascada que la pantalla hasta el resultado neto (el impuesto es el
       cargado como gasto en el grupo "imp", así que meses y total suman igual). */
    if(A.hasBajo){
      const bajo = grp=> Object.keys(A.gx.byCatBajo||{}).filter(id=> gxGrupo(id)===grp)
        .forEach(id=> L.push({ key:"catb:"+id, lab:gxCatLabel(id), kind:"ind" }));
      L.push({ key:"amort", lab:t("pnl.amort"), kind:"normal" }); bajo("amort");
      L.push({ key:"ebitop", lab:t("pnl.ebitop"), kind:"total" });
      L.push({ key:"fin", lab:t("pnl.fin"), kind:"normal" }); bajo("fin");
      L.push({ key:"ebt", lab:t("pnl.ebt"), kind:"total" });
      L.push({ key:"tax", lab:t("pnl.tax"), kind:"normal" }); bajo("imp");
      L.push({ key:"neto", lab:t("pnl.neto"), kind:"total" });
    }
  }
  return L;
}

/* ============================================================
   GRÁFICOS en canvas (2× para que se vean nítidos en Excel)
   ============================================================ */
const XPC = { ink:"#111827", mut:"#6B7280", grid:"#E5E7EB", sub:"#374151", blue:"#2563EB", lblue:"#93C5FD", green:"#16A34A", red:"#DC2626" };
function xpK(v){ const a = Math.abs(v), s = v<0 ? "-" : ""; return a>=1000 ? s+nfDec(1).format(a/1000)+"k" : s+nfDec(0).format(a); }
function xpCanvas(w, h){ const c = document.createElement("canvas"); c.width = w*2; c.height = h*2; const g = c.getContext("2d"); g.scale(2,2); g.fillStyle = "#fff"; g.fillRect(0,0,w,h); return { c, g }; }
function xpText(g, s, x, y, o){ o=o||{}; g.font = `${o.bold?"bold ":""}${o.size||11}px Arial, Helvetica, sans-serif`; g.fillStyle = o.color||XPC.ink; g.textAlign = o.align||"center"; g.textBaseline = o.base||"alphabetic"; g.fillText(s, x, y); }
function xpNice(v){ if(!(v>0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v/p; return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p; }
function xpAxis(g, x0, x1, y, maxV, minV, h, ticks){
  const dom = (maxV-minV)||1;
  for(let i=0;i<=ticks;i++){
    const v = minV + dom*i/ticks, yy = y + h - (v-minV)/dom*h;
    g.strokeStyle = XPC.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
    xpText(g, xpK(v), x0-6, yy+3.5, { size:9, color:XPC.mut, align:"right" });
  }
}
function xpWrap(s, maxW, g){
  g.font = "10px Arial"; if(g.measureText(s).width<=maxW || !/\s/.test(s)) return [s];
  const w = s.split(/\s+/); let best = 1, diff = Infinity;
  for(let j=1;j<w.length;j++){ const d = Math.abs(w.slice(0,j).join(" ").length - w.slice(j).join(" ").length); if(d<diff){ diff=d; best=j; } }
  return [w.slice(0,best).join(" "), w.slice(best).join(" ")];
}
function xpChartWaterfall(A){
  const W = 640, H = 220, { c, g } = xpCanvas(W, H);
  const steps = [
    { k:t("pnl.wf.sales"), v:A.sales, ty:"start" }, { k:t("xp.wf.ship"), v:A.shipping, ty:"add" }, { k:t("xp.wf.cargos"), v:A.cargos, ty:"add" },
    { k:t("pnl.wf.net"), v:A.net, ty:"sub" }, { k:t("xp.wf.cogs"), v:-A.cogs, ty:"minus" }, { k:t("pnl.wf.gross"), v:A.gp, ty:"sub" },
    { k:t("xp.wf.comm"), v:-A.commission, ty:"minus" }, { k:t("xp.wf.selling"), v:-(A.sellingTotal-A.commission), ty:"minus" },
    { k:t("pnl.wf.contrib"), v:A.contrib, ty: A.show ? "sub" : "total" }
  ];
  if(A.show) steps.push({ k:t("xp.wf.opex"), v:-A.opex, ty:"minus" }, { k:t(A.hasBajo?"pnl.ebitda.short":"gx.pnl.ebit"), v:A.ebit, ty: A.hasBajo ? "sub" : "total" });
  if(A.show && A.hasBajo) steps.push({ k:t("pnl.amort"), v:-A.amort, ty:"minus" }, { k:t("pnl.fin"), v:-A.fin, ty:"minus" }, { k:t("xp.wf.tax"), v:-A.tax, ty:"minus" }, { k:t("pnl.neto"), v:A.neto, ty:"total" });
  const S = steps.filter(s=> !((s.ty==="add"||s.ty==="minus") && Math.abs(s.v)<0.005));
  let run = 0, mx = 0, mn = 0;
  const geo = S.map(s=>{ let lo, hi; if(s.ty==="start"||s.ty==="sub"||s.ty==="total"){ lo=Math.min(0,s.v); hi=Math.max(0,s.v); run=s.v; } else { const p=run; run=p+s.v; lo=Math.min(p,run); hi=Math.max(p,run); } mx=Math.max(mx,hi); mn=Math.min(mn,lo); return Object.assign({}, s, { lo, hi }); });
  const maxV = xpNice(mx*1.08), minV = mn<0 ? -xpNice(-mn*1.08) : 0;
  const x0 = 46, x1 = W-6, y0 = 16, ph = H-y0-40, dom = maxV-minV, Y = v=> y0 + ph - (v-minV)/dom*ph;
  xpAxis(g, x0, x1, y0, maxV, minV, ph, 4);
  const n = geo.length, gap = 8, bw = (x1-x0-gap*(n-1))/n;
  geo.forEach((s,i)=>{
    const x = x0 + i*(bw+gap), yt = Y(s.hi), yb = Y(s.lo);
    g.fillStyle = s.ty==="add" ? XPC.green : s.ty==="minus" ? XPC.red : s.ty==="total" ? (s.v<0?XPC.red:XPC.blue) : XPC.sub;
    g.fillRect(x, yt, bw, Math.max(1.5, yb-yt));
    xpText(g, xpK(s.v), x+bw/2, yt-4, { size:9, bold:true });
    const key = s.ty==="start"||s.ty==="sub"||s.ty==="total";
    xpWrap(s.k, bw+gap, g).forEach((ln,j)=> xpText(g, ln, x+bw/2, H-26+j*11, { size:8.5, color:key?XPC.ink:XPC.mut, bold:key }));
  });
  return c.toDataURL("image/png");
}
function xpChartMonths(rows, resLabel){
  const W = 316, H = 195, { c, g } = xpCanvas(W, H);
  const vals = rows.flatMap(r=> [r.net, r.res]);
  const maxV = xpNice(Math.max(1, ...vals)*1.1), minV = Math.min(0, ...vals)<0 ? -xpNice(-Math.min(...vals)*1.1) : 0;
  const x0 = 40, x1 = W-6, y0 = 30, ph = H-y0-22, dom = maxV-minV, Y = v=> y0 + ph - (v-minV)/dom*ph;
  xpAxis(g, x0, x1, y0, maxV, minV, ph, 4);
  g.fillStyle = XPC.lblue; g.fillRect(x0, 8, 9, 9); xpText(g, t("xl.is.net"), x0+13, 16, { size:8.5, align:"left", color:XPC.sub });
  g.fillStyle = XPC.blue; g.fillRect(x0+100, 8, 9, 9); xpText(g, resLabel, x0+113, 16, { size:8.5, align:"left", color:XPC.sub });
  const n = rows.length, slot = (x1-x0)/n, bw = Math.min(26, slot*0.36);
  rows.forEach((r,i)=>{
    const cx = x0 + slot*i + slot/2;
    [[r.net, XPC.lblue, -1], [r.res, r.res<0?XPC.red:XPC.blue, 1]].forEach(([v,col,side])=>{
      const x = cx + (side<0 ? -bw-1 : 1), yt = Y(Math.max(0,v)), yb = Y(Math.min(0,v));
      g.fillStyle = col; g.fillRect(x, yt, bw, Math.max(1, yb-yt));
      if(n<=8) xpText(g, xpK(v), x+bw/2, (v>=0?yt-3:yb+10), { size:7.5, bold:side>0 });
    });
    xpText(g, r.label, cx, H-8, { size:8, color:XPC.mut });
  });
  return c.toDataURL("image/png");
}
function xpChartDonut(items){
  const W = 316, H = 195, { c, g } = xpCanvas(W, H);
  const cols = ["#1E3A8A","#2563EB","#60A5FA","#93C5FD","#CBD5E1","#94A3B8","#64748B"];
  let list = items.slice().sort((a,b)=> b.v-a.v);
  if(list.length>6){ const rest = list.slice(5).reduce((a,x)=>a+x.v,0); list = list.slice(0,5).concat([{ k:t("xp.other"), v:rest }]); }
  const tot = list.reduce((a,x)=>a+x.v,0) || 1, cx = 82, cy = H/2, R = 72, r = 44;
  let a0 = -Math.PI/2;
  list.forEach((x,i)=>{ const a1 = a0 + x.v/tot*Math.PI*2; g.beginPath(); g.moveTo(cx,cy); g.arc(cx,cy,R,a0,a1); g.closePath(); g.fillStyle = cols[i%cols.length]; g.fill(); a0 = a1; });
  g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.fillStyle = "#fff"; g.fill();
  xpText(g, xpK(tot), cx, cy+3, { size:14, bold:true }); xpText(g, t("xp.donut.sub"), cx, cy+17, { size:8, color:XPC.mut });
  list.forEach((x,i)=>{
    const y = 34 + i*20; g.fillStyle = cols[i%cols.length]; g.fillRect(172, y-8, 10, 10);
    let lab = x.k; g.font = "9px Arial"; while(g.measureText(lab).width>100 && lab.length>4) lab = lab.slice(0,-2);
    if(lab!==x.k) lab = lab.trim()+"…";
    xpText(g, lab, 188, y+1, { size:9, align:"left", color:XPC.sub });
    xpText(g, nfDec(0).format(x.v/tot*100)+"%", W-8, y+1, { size:9, align:"right", bold:true });
  });
  return c.toDataURL("image/png");
}

/* ============================================================
   CONSTRUCCIÓN DEL LIBRO
   ============================================================ */
async function xpBuild(desde, hasta, soc){
  const withGx = (P, s, f, to)=> (typeof gxPnL==="function") ? gxPnL(P, f, to, s) : Object.assign({}, P, { show:false });
  const A = withGx(pnlAggregate(desde, hasta, soc), soc, desde, hasta);
  const sym = String(monedaSym(A.rep)).replace(/"/g,"");
  const MON = `"${sym} "#,##0;[Red]("${sym} "#,##0);"–"`, PCT = '0.0%;[Red]-0.0%;"–"', NUM = '#,##0;[Red](#,##0);"–"';
  const EMP = (db.config.emisor && db.config.emisor.nombre) || t("xp.company");
  const period = t("xl.period",{ from:desde?fmtDate(desde):t("xl.start"), to:hasta?fmtDate(hasta):t("xl.today") });
  const scope = (soc ? t("xl.scope.soc",{ soc:storeName(soc) }) : t("xl.scope.consol")) + (finDimsActive() ? " · "+t("fin.xl.filtered",{ sel:finDimsLabel() }) : "");
  const today = fmtDate(finIso(new Date()));
  const L = xpLines(A);

  /* --- Meses con actividad dentro del rango (ventas o gastos) --- */
  const mFrom = desde ? desde.slice(0,7) : "", mTo = hasta ? hasta.slice(0,7) : finCurMonth();
  const act = new Set(Object.keys(A.byMonth).filter(k=> (A.byMonth[k].net||0)!==0 || (A.byMonth[k].units||0)>0));
  if(A.show) Object.keys(A.gx.byMonth).forEach(k=> act.add(k));
  const actList = [...act].filter(k=> (!mFrom || k>=mFrom) && k<=mTo).sort();
  const months = [];
  if(actList.length){ for(let m=actList[0], g=0; m<=actList[actList.length-1] && g<120; m=gxAddM(m,1), g++) months.push(m); }
  const MX = months.map(mk=>{
    const f = (mFrom && mk===mFrom) ? desde : mk+"-01";
    const to0 = gxMonthEnd(mk), to = (hasta && to0>hasta) ? hasta : to0;
    return { mk, X: withGx(pnlAggregate(f, to, soc), soc, f, to) };
  });
  const nM = Math.max(1, months.length);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Stock Manager"; wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  /* --- helpers de hoja --- */
  const newSheet = (name, widths, tab)=>{
    const ws = wb.addWorksheet(name.slice(0,31), { properties:{ tabColor:{ argb: tab||"FF94A3B8" } },
      pageSetup:{ orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, margins:{ left:0.4, right:0.4, top:0.5, bottom:0.5, header:0.2, footer:0.2 } } });
    ws.getColumn(1).width = 2;
    widths.forEach((w,i)=> ws.getColumn(i+2).width = w);
    return ws;
  };
  const banner = (ws, title, sub, lastCol)=>{
    ws.getRow(1).height = 8; ws.getRow(2).height = 30; ws.getRow(3).height = 22;
    for(let c=2;c<=lastCol;c++){ ws.getCell(2,c).fill = xpFill(XC.navy); ws.getCell(3,c).fill = xpFill(XC.navy); }
    ws.mergeCells(2,2,2,lastCol); ws.mergeCells(3,2,3,lastCol);
    const a = ws.getCell(2,2); a.value = title; a.font = xpFont({ size:16, bold:true, color:{ argb:XC.white } }); a.alignment = { indent:1, vertical:"bottom" };
    const b = ws.getCell(3,2); b.value = sub; b.font = xpFont({ size:9.5, color:{ argb:XC.sub } }); b.alignment = { indent:1, vertical:"top" };
    ws.views = [{ showGridLines:false, state:"frozen", ySplit:3 }];
  };
  const hdr = (ws, row, c0, labels, rightFrom)=>{
    rightFrom = rightFrom==null ? 1 : rightFrom;
    labels.forEach((l,i)=>{ const c = ws.getCell(row, c0+i); c.value = l; c.font = xpFont({ size:9, bold:true, color:{ argb:XC.white } }); c.fill = xpFill(XC.slate);
      c.alignment = { horizontal: i>=rightFrom ? "right" : "left", vertical:"middle", indent: i>=rightFrom ? 0 : 1 }; });
    ws.getRow(row).height = 22;
  };
  const line = (ws, row, c0, vals, kind, fmts)=>{
    vals.forEach((v,i)=>{
      const c = ws.getCell(row, c0+i); c.value = (v===undefined ? null : v);
      if(i>0){ c.numFmt = (fmts && fmts[i]) || MON; c.alignment = { horizontal:(fmts && fmts[i]==="@") ? "left" : "right", vertical:"middle" }; }
      else c.alignment = { indent: kind==="ind" ? 3 : 1, vertical:"middle" };
      if(kind==="ind") c.font = xpFont({ size:9.5, color:{ argb:XC.mut } });
      else if(kind==="sub"){ c.font = xpFont({ bold:true }); c.fill = xpFill(XC.gray); c.border = { top:xpThin(XC.bord) }; }
      else if(kind==="total"){ c.font = xpFont({ bold:true, size:11, color:{ argb:XC.white } }); c.fill = xpFill(XC.blue); }
      else { c.font = xpFont(); c.border = { bottom:xpThin() }; }
    });
    ws.getRow(row).height = kind==="total" ? 21 : 18;
  };
  const F = (formula, result)=> ({ formula, result });
  const pctOf = (v, base)=> base ? v/base : 0;
  const col = n=> { let s=""; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; };   // 0-based → letra
  const C = n=> col(n-1);   // 1-based → letra

  /* ================= RESUMEN ================= */
  {
    const ws = newSheet(t("xp.sh.summary"), [36,15,12,3,11,11,11,11,11,11,11,11], "FF2563EB");
    ws.pageSetup.fitToHeight = 1;
    banner(ws, `${t("xl.is.title").replace(/\s*\(.*\)$/,"")}  ·  ${EMP}`, `${period}   ·   ${scope}   ·   ${t("xp.generated",{d:today})}`, 13);
    const res = A.show ? A.ebit : A.contrib;
    const cards = A.show ? [
      [2,2,  t("xl.is.net"),     A.net,  t("xp.k.units",{n:qty(A.units)}), null],
      [3,4,  t("xl.is.gp"),      A.gp,   t("xp.k.ofnet",{p:fmtPct(pctOf(A.gp,A.net))}), null],
      [6,7,  t("xl.is.contrib"), A.contrib, t("xp.k.ofnet",{p:fmtPct(pctOf(A.contrib,A.net))}), null],
      [8,9,  t("xp.k.opex"),     -A.opex, t("xp.k.ofnet",{p:fmtPct(pctOf(A.opex,A.net))}), XC.red],
      ...(A.hasBajo ? [
      [10,11,t("pnl.ebitda.short"), A.ebit, t("xp.k.ofnet",{p:fmtPct(pctOf(A.ebit,A.net))}), null],
      [12,13,t("pnl.neto"),      A.neto, t("xp.k.ofnet",{p:fmtPct(pctOf(A.neto,A.net))}), XC.blue]
      ] : [
      [10,11,t("gx.pnl.ebit"),   A.ebit, t("xp.k.ofnet",{p:fmtPct(pctOf(A.ebit,A.net))}), XC.blue],
      [12,13,t("xp.k.avg"),      A.ebit/nM, t("xp.k.avgsub",{n:nM}), null]
      ])
    ] : [
      [2,2,  t("xl.is.net"),     A.net,  t("xp.k.units",{n:qty(A.units)}), null],
      [3,4,  t("xl.is.gp"),      A.gp,   t("xp.k.ofnet",{p:fmtPct(pctOf(A.gp,A.net))}), null],
      [6,7,  t("xp.wf.cogs"),    -A.cogs, t("xp.k.ofnet",{p:fmtPct(pctOf(A.cogs,A.net))}), null],
      [8,9,  t("xp.k.selling"),  -A.sellingTotal, t("xp.k.ofnet",{p:fmtPct(pctOf(A.sellingTotal,A.net))}), XC.red],
      [10,11,t("xl.is.contrib"), A.contrib, t("xp.k.ofnet",{p:fmtPct(pctOf(A.contrib,A.net))}), XC.blue],
      [12,13,t("xp.k.avg"),      A.contrib/nM, t("xp.k.avgsubc",{n:nM}), null]
    ];
    cards.forEach(([a,b,lab,v,sub,acc])=>{
      for(let r=5;r<=8;r++) for(let c=a;c<=b;c++){
        const cell = ws.getCell(r,c);
        cell.fill = xpFill(acc===XC.blue ? XC.lblue : XC.white);
        cell.border = { top: r===5 ? { style:"thick", color:{ argb: acc||XC.slate } } : undefined, left: c===a ? xpThin() : undefined, right: c===b ? xpThin() : undefined, bottom: r===8 ? xpThin() : undefined };
      }
      if(b>a){ ws.mergeCells(5,a,5,b); ws.mergeCells(8,a,8,b); }
      ws.mergeCells(6,a,7,b);
      const l = ws.getCell(5,a); l.value = lab.toUpperCase(); l.font = xpFont({ size:8, bold:true, color:{ argb:XC.mut } }); l.alignment = { indent:1, vertical:"bottom" };
      const vv = ws.getCell(6,a); vv.value = v; vv.numFmt = MON; vv.font = xpFont({ size:17, bold:true, color:{ argb: acc===XC.blue ? XC.blue : XC.ink } }); vv.alignment = { horizontal:"left", indent:1, vertical:"middle" };
      const s = ws.getCell(8,a); s.value = sub; s.font = xpFont({ size:8.5, color:{ argb:XC.mut } }); s.alignment = { indent:1, vertical:"top" };
    });
    [20,18,18,18].forEach((h,i)=> ws.getRow(5+i).height = h); ws.getRow(9).height = 14;
    // v88: mismo aviso que la pantalla si hay meses con ventas y sin gastos de estructura cargados
    if(A.show && A.sinGx && A.sinGx.length){
      ws.getRow(9).height = 18;
      const w9 = ws.getCell("B9"); w9.value = "⚠ " + t("gx.nogx.banner",{m:A.sinGx.map(finMonthLabel).join(", ")});
      w9.font = xpFont({ size:9, bold:true, color:{ argb:XC.red } }); w9.alignment = { vertical:"middle" };
    }
    const t10 = ws.getCell("B10"); t10.value = t("fin.is.title"); t10.font = xpFont({ size:12, bold:true });
    const f10 = ws.getCell("F10"); f10.value = t("pnl.wf.title"); f10.font = xpFont({ size:12, bold:true });
    hdr(ws, 11, 2, [t("xl.is.concept"), sym, t("xl.is.pctrev")]);
    let r = 12;
    L.forEach(x=>{ const v = xpVal(A, x.key); line(ws, r, 2, [x.lab, v, pctOf(v, A.net)], x.kind, [null, MON, PCT]); r++; });
    /* Lectura rápida */
    r++; const lr = ws.getCell(r,2); lr.value = t("xp.read.title"); lr.font = xpFont({ size:12, bold:true }); r++;
    const reads = [ t("xp.read.per100",{ gp:nfDec(0).format(pctOf(A.gp,A.net)*100), res:nfDec(0).format(pctOf(res,A.net)*100), what: A.show ? t("xp.read.afteropex") : t("xp.read.aftersell") }) ];
    if(A.show){
      /* v90: promedios SÓLO sobre los meses que tienen estructura cargada. Antes dividía por
         todos los meses del período: un mes con ventas y sin gastos bajaba el costo mensual
         de estructura y el punto de equilibrio (daba ~43k contra 79,9k de la pantalla). */
      const mG = Object.keys((A.gx && A.gx.byMonth) || {}).filter(mk=> A.gx.byMonth[mk] > 0.005);
      const nG = Math.max(1, mG.length);
      const netG = mG.reduce((a,mk)=> a + ((A.byMonth && A.byMonth[mk] && A.byMonth[mk].net) || 0), 0);
      const contribG = mG.reduce((a,mk)=> a + ((A.byMonth && A.byMonth[mk] && A.byMonth[mk].contrib) || 0), 0);
      const opexM = A.opex/nG, cp = netG>0 ? contribG/netG : pctOf(A.contrib, A.net);
      reads.push(t("xp.read.opex",{ v:moneyRound(opexM) }) + (A.sinGx && A.sinGx.length ? " " + t("xp.read.onlygx",{n:nG}) : ""));
      if(cp>0) reads.push(t("xp.read.be",{ v:moneyRound(opexM/cp), now:moneyRound(netG/nG) }));
    } else {
      reads.push(t("xp.read.noopex"));
    }
    reads.forEach(txt=>{ ws.mergeCells(r,2,r,4); const c = ws.getCell(r,2); c.value = "•  "+txt; c.font = xpFont({ size:9.5 }); c.alignment = { wrapText:true, vertical:"top", indent:1 }; ws.getRow(r).height = 30; r++; });
    const nt = ws.getCell(r+1, 2); nt.value = t("xp.notes"); nt.font = xpFont({ size:8, italic:true, color:{ argb:XC.mut } });
    /* Gráficos */
    const img = (dataUrl, c0, r0, w, h)=> ws.addImage(wb.addImage({ base64:dataUrl, extension:"png" }), { tl:{ col:c0, row:r0 }, ext:{ width:w, height:h } });
    img(xpChartWaterfall(A), 5, 10, 640, 220);
    const g1 = ws.getCell("F23"); g1.value = t("xp.ch.months"); g1.font = xpFont({ bold:true });
    const g2 = ws.getCell("J23"); g2.value = t("xp.ch.mix"); g2.font = xpFont({ bold:true });
    const resLbl = A.show ? t("gx.pnl.ebit") : t("xl.is.contrib");
    img(xpChartMonths(MX.map(m=>({ label:finMonthLabel(m.mk), net:m.X.net, res: A.show ? m.X.ebit : m.X.contrib })), resLbl), 5, 23, 316, 195);
    img(xpChartDonut(Object.entries(A.bySaga||{}).map(([k,v])=>({ k, v:v.net||0 })).filter(x=> x.v>0)), 9, 23, 316, 195);
  }

  /* ================= P&L MENSUAL ================= */
  if(MX.length){
    const n = MX.length, cT = 3+n, cP = 4+n;   // columnas: B concepto, C.. meses, total, %
    const ws = newSheet(t("xp.sh.monthly"), [38, ...Array(n).fill(14), 16, 12]);
    banner(ws, t("xp.sh.monthly.t"), `${EMP}   ·   ${scope}   ·   ${sym}`, cP);
    hdr(ws, 5, 2, [t("xl.is.concept"), ...MX.map(m=> finMonthLabel(m.mk)), t("common.total"), t("xl.is.pctrev")]);
    let r = 6, netRow = 6;
    L.forEach(x=>{ if(x.key==="net") netRow = r; r++; });
    r = 6;
    L.forEach(x=>{
      const vals = MX.map(m=> xpVal(m.X, x.key)), tot = round2(vals.reduce((a,v)=>a+v,0));
      const totNet = MX.reduce((a,m)=> a+m.X.net, 0);
      line(ws, r, 2, [x.lab, ...vals, F(`SUM(${C(3)}${r}:${C(2+n)}${r})`, tot), F(`IFERROR(${C(cT)}${r}/${C(cT)}$${netRow},0)`, pctOf(tot, totNet))], x.kind,
        [null, ...Array(n).fill(MON), MON, PCT]);
      r++;
    });
    ws.views = [{ showGridLines:false, state:"frozen", xSplit:2, ySplit:5 }];
  }

  /* ================= POR SOCIEDAD ================= */
  if(!soc && STORE_IDS.length>1){
    const S = STORE_IDS.map(s=>({ s, X: withGx(pnlAggregate(desde, hasta, s), s, desde, hasta) }));
    const nc = S.length+1;
    const ws = newSheet(t("xl.sh.soc"), [38, ...Array(nc).fill(16)]);
    banner(ws, t("xp.sh.soc.t"), `${EMP}   ·   ${period}   ·   ${sym}`, 2+nc);
    hdr(ws, 5, 2, [t("xl.is.concept"), ...S.map(x=> storeName(x.s)), t("xl.is.consol")]);
    const keys = [["net","sub",t("xl.is.net")],["cogs","normal",t("xl.is.cogs")],["gp","sub",t("xl.is.gp")],["sellall","normal",t("xp.l.sellall")],["contrib", A.show?"sub":"total", t("xl.is.contrib")]];
    if(A.show) keys.push(["adm","normal",t("gx.pnl.adm")],["com","normal",t("gx.pnl.com")],["ebit","total",t("gx.pnl.ebit")]);
    const v = (X,k)=> k==="sellall" ? -X.sellingTotal : xpVal(X,k);
    let r = 6;
    keys.forEach(([k,kind,lab])=>{ line(ws, r, 2, [lab, ...S.map(x=> v(x.X,k)), v(A,k)], kind); r++; });
    r++;
    const pk = [["gp", t("xl.is.gmpct")], [A.show?"ebit":"contrib", A.show ? (A.hasBajo ? t("xp.l.ebitdapct") : t("xp.l.ebitpct")) : t("xl.is.contribpct")]].concat((A.show && A.hasBajo) ? [["neto", t("xp.l.netopct")]] : []);
    pk.forEach(([k,lab])=>{ line(ws, r, 2, [lab, ...S.map(x=> pctOf(x.X[k], x.X.net)), pctOf(A[k], A.net)], "normal", [null, ...Array(nc).fill(PCT)]); r++; });
    if(A.show){ r++; const c = ws.getCell(r,2); c.value = t("xp.soc.note"); c.font = xpFont({ size:8, italic:true, color:{ argb:XC.mut } }); }
  }

  /* ================= POR JUEGO ================= */
  {
    const ws = newSheet(t("xp.sh.game"), [26,11,16,16,16,11,11]);
    banner(ws, t("xp.sh.game.t"), `${EMP}   ·   ${period}   ·   ${scope}`, 8);
    hdr(ws, 5, 2, [t("an.sl.line"), t("xl.h.units"), t("xl.is.net"), t("xl.h.cogs"), t("xl.h.gm"), t("xl.h.gmpct"), t("xp.h.share")]);
    const rows = Object.entries(A.bySaga||{}).filter(([,v])=> (v.net||0)!==0 || (v.units||0)>0).sort((a,b)=> b[1].net-a[1].net);
    const tr = 6 + rows.length, totNet = rows.reduce((a,[,v])=>a+v.net,0);
    rows.forEach(([k,v],i)=>{
      const r = 6+i, gm = round2(v.net-v.cogs);
      line(ws, r, 2, [k, v.units, round2(v.net), round2(v.cogs), F(`D${r}-E${r}`, gm), F(`IFERROR(F${r}/D${r},0)`, pctOf(gm,v.net)), F(`IFERROR(D${r}/D$${tr},0)`, pctOf(v.net,totNet))],
        "normal", [null, NUM, MON, MON, MON, PCT, PCT]);
    });
    if(rows.length){
      const tU = rows.reduce((a,[,v])=>a+(v.units||0),0), tN = round2(totNet), tC = round2(rows.reduce((a,[,v])=>a+v.cogs,0)), tG = round2(tN-tC);
      line(ws, tr, 2, [t("common.total"), F(`SUM(C6:C${tr-1})`,tU), F(`SUM(D6:D${tr-1})`,tN), F(`SUM(E6:E${tr-1})`,tC), F(`SUM(F6:F${tr-1})`,tG), F(`IFERROR(F${tr}/D${tr},0)`, pctOf(tG,tN)), 1], "sub", [null, NUM, MON, MON, MON, PCT, PCT]);
      ws.addConditionalFormatting({ ref:`D6:D${tr-1}`, rules:[{ type:"dataBar", minLength:0, maxLength:100, gradient:true, cfvo:[{ type:"num", value:0 },{ type:"max" }], color:{ argb:"FF60A5FA" } }] });
      ws.addConditionalFormatting({ ref:`G6:G${tr-1}`, rules:[{ type:"colorScale", cfvo:[{ type:"min" },{ type:"max" }], color:[{ argb:"FFFDE68A" },{ argb:"FF86EFAC" }] }] });
    }
  }

  /* ================= POR VENDEDOR ================= */
  {
    const ws = newSheet(t("xl.sh.seller"), [22,11,16,16,11,15,16]);
    banner(ws, t("xp.sh.seller.t"), `${EMP}   ·   ${period}   ·   ${scope}`, 8);
    hdr(ws, 5, 2, [t("xl.h.seller"), t("xl.h.units"), t("xl.h.revenue"), t("xl.h.gm"), t("xl.h.gmpct"), t("xl.h.comm"), t("pnl.th.contrib")]);
    const vs = Object.values(A.perVend||{}).sort((a,b)=> b.sales-a.sales);
    vs.forEach((v,i)=>{
      const r = 6+i, gm = round2(v.sales-v.cogs), contrib = round2(gm + v.cargos + v.shipping - v.commission - v.costos);
      line(ws, r, 2, [v.nombre, v.units, round2(v.sales), gm, F(`IFERROR(E${r}/D${r},0)`, pctOf(gm,v.sales)), round2(v.commission), contrib], "normal", [null, NUM, MON, MON, PCT, MON, MON]);
    });
    if(vs.length){
      const tr = 6+vs.length;
      const sU = vs.reduce((a,v)=>a+v.units,0), sS = round2(vs.reduce((a,v)=>a+v.sales,0)), sG = round2(vs.reduce((a,v)=>a+v.sales-v.cogs,0));
      const sK = round2(vs.reduce((a,v)=>a+v.commission,0)), sC = round2(vs.reduce((a,v)=>a+(v.sales-v.cogs+v.cargos+v.shipping-v.commission-v.costos),0));
      line(ws, tr, 2, [t("common.total"), F(`SUM(C6:C${tr-1})`,sU), F(`SUM(D6:D${tr-1})`,sS), F(`SUM(E6:E${tr-1})`,sG), F(`IFERROR(E${tr}/D${tr},0)`,pctOf(sG,sS)), F(`SUM(G6:G${tr-1})`,sK), F(`SUM(H6:H${tr-1})`,sC)],
        "sub", [null, NUM, MON, MON, PCT, MON, MON]);
      ws.addConditionalFormatting({ ref:`H6:H${tr-1}`, rules:[{ type:"dataBar", minLength:0, maxLength:100, gradient:true, cfvo:[{ type:"num", value:0 },{ type:"max" }], color:{ argb:"FF60A5FA" } }] });
    }
  }

  /* ================= GASTOS DE ESTRUCTURA ================= */
  if(A.show && A.gx.items.length){
    const gm = MX.filter(m=> m.X.show && m.X.gx);
    const n = gm.length, lastC = 3+n;
    const ws = newSheet(t("gx.xl.sheet"), [50, ...Array(n).fill(14), 16]);
    banner(ws, t("gx.xl.sheet"), `${EMP}   ·   ${t("xp.gx.sub")}   ·   ${sym}`, Math.max(lastC, 5));
    hdr(ws, 5, 2, [t("gx.th.cat"), ...gm.map(m=> finMonthLabel(m.mk)), t("common.total")]);
    let r = 6; const subRows = [], subVals = [];
    ["adm","com"].forEach(grp=>{
      const cats = [...new Set(A.gx.items.filter(x=> x.grupo===grp).map(x=> x.cat))].sort((a,b)=> gxCatLabel(a).localeCompare(gxCatLabel(b)));
      if(!cats.length) return;
      const g0 = r; r++; const acc = Array(n+1).fill(0);
      cats.forEach(id=>{
        const vals = gm.map(m=> round2(m.X.gx.byCat[id]||0));
        vals.forEach((v,i)=> acc[i]+=v); acc[n] += vals.reduce((a,v)=>a+v,0);
        line(ws, r, 2, [gxCatLabel(id), ...vals, F(`SUM(${C(3)}${r}:${C(2+n)}${r})`, round2(vals.reduce((a,v)=>a+v,0)))], "ind"); r++;
      });
      line(ws, g0, 2, [t("gx.grp."+grp), ...acc.map((v,i)=> F(`SUM(${C(3+i)}${g0+1}:${C(3+i)}${r-1})`, round2(v)))], "sub");
      subRows.push(g0); subVals.push(acc);
    });
    line(ws, r, 2, [t("xp.gx.total"), ...Array(n+1).fill(0).map((_,i)=> F(subRows.map(g=> C(3+i)+g).join("+"), round2(subVals.reduce((a,acc)=>a+acc[i],0))))], "total");
    r += 3;
    const dt = ws.getCell(r,2); dt.value = t("xp.gx.detail"); dt.font = xpFont({ size:12, bold:true }); r++;
    hdr(ws, r, 2, [t("gx.th.concept"), t("gx.xl.month"), t("gx.th.soc"), sym], 3); r++;
    A.gx.items.slice().sort((a,b)=> a.mes<b.mes?-1 : a.mes>b.mes?1 : gxCatLabel(a.cat).localeCompare(gxCatLabel(b.cat))).forEach(x=>{
      line(ws, r, 2, [`${x.concepto}  ·  ${gxCatLabel(x.cat)}`, finMonthLabel(x.mes), gxSocLabel(x.soc), x.asignado], "normal", [null, "@", "@", MON]); r++;
    });
    if(soc){ r++; const c = ws.getCell(r,2); c.value = t("gx.xl.socnote",{ p:fmtPct(A.gx.share,1) }); c.font = xpFont({ size:8, italic:true, color:{ argb:XC.mut } }); }
  }

  /* ================= PRODUCTOS ================= */
  {
    const ws = newSheet(t("xp.sh.products"), [16,44,10,15,15,15,11]);
    banner(ws, t("xl.detail.title"), `${EMP}   ·   ${period}   ·   ${scope}`, 8);
    hdr(ws, 5, 2, ["SKU", t("common.product"), t("xl.h.units"), t("xl.h.revenue"), t("xl.h.cogs"), t("xl.h.gm"), t("xl.h.gmpct")], 2);
    const ps = Object.values(A.detail||{}).sort((a,b)=> b.revenue-a.revenue);
    ps.forEach((e,i)=>{
      const r = 6+i, gm = round2(e.revenue-e.cogs);
      line(ws, r, 2, [e.sku||"", e.nombre||"", e.units, round2(e.revenue), round2(e.cogs), F(`E${r}-F${r}`, gm), F(`IFERROR(G${r}/E${r},0)`, pctOf(gm,e.revenue))], "normal", [null, "@", NUM, MON, MON, MON, PCT]);
    });
    if(ps.length){
      const last = 5+ps.length;
      ws.autoFilter = `B5:H${last}`;
      ws.addConditionalFormatting({ ref:`H6:H${last}`, rules:[{ type:"colorScale", cfvo:[{ type:"min" },{ type:"percentile", value:50 },{ type:"max" }], color:[{ argb:"FFFCA5A5" },{ argb:"FFFEF08A" },{ argb:"FF86EFAC" }] }] });
    }
    ws.views = [{ showGridLines:false, state:"frozen", ySplit:5 }];
  }

  /* --- Descarga --- */
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const slug = soc ? "-"+String(storeName(soc)).toLowerCase().replace(/[^a-z0-9]+/g,"-") : "";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${t("xl.file")}${slug}-${isoLocal(new Date())}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
  toast(t("pnl.tt.exported"));
}

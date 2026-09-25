/* ============================================================
   gestordestock — 11e-drill.js
   DRILL-DOWN: tocar un mes o una barra y ver las ventas que lo componen
   ------------------------------------------------------------
   Cualquier elemento con data-drill="<código>" abre el detalle:
     m:2026-03     un mes (ventas + compras de ese mes)
     pid:<id>      un producto
     pais:<país>   idioma:<JP|ESP|KOR|EN>   vend:<vendedorId>  ("vend:" = sin vendedor)
     soc:<sociedad>   linea:<línea>
   data-drill-ctx="plan" usa los filtros de Plan vs Real (sin país ni vendedor).
   El detalle SIEMPRE respeta los filtros activos de Finanzas y suma
   exactamente lo mismo que la barra que tocaste: sale de la misma
   tabla de hechos (finSaleLines).
   ============================================================ */
let _drillLast = null;
const DRILL_MAX_ROWS = 300;

function drillMonthRange(q, mk){
  const [y,m] = mk.split("-").map(Number);
  const a = `${mk}-01`, b = finIso(new Date(y, m, 0));
  return { from: (q.from && q.from>a) ? q.from : a, to: (q.to && q.to<b) ? q.to : b };
}
/* Traduce un código a { title, q, filter, mk, pid } */
function drillSpec(code, ctx){
  const i = code.indexOf(":"), kind = code.slice(0,i), val = code.slice(i+1);
  const q = (ctx==="plan" && typeof planQuery==="function") ? planQuery() : finQuery();
  const spec = { code, ctx, q, filter:null, title:"", mk:null, pid:null };
  if(kind==="m"){ Object.assign(q, drillMonthRange(q, val)); spec.mk = val; spec.title = t("dr.t.month",{m:finMonthLabel(val)}); }
  else if(kind==="pid"){ const p = prodById(val); spec.pid = val; spec.filter = r=> r.productoId===val; spec.title = p ? p.nombre : val; }
  else if(kind==="pais"){ spec.filter = r=> r.pais===val; spec.title = t("dr.t.country",{v:paisLabel(val)}); }
  else if(kind==="idioma"){ spec.filter = r=> r.idioma===val; spec.title = t("dr.t.lang",{v:langLabel(val)}); }
  else if(kind==="vend"){ spec.filter = r=> (r.vendedorId||"")===val; spec.title = val ? vendedorNombre(val) : t("fin.house"); }
  else if(kind==="soc"){ q.soc = val; spec.title = t("dr.t.soc",{v:storeName(val)}); }
  else if(kind==="linea"){ spec.filter = r=> r.saga===val; spec.title = val; }
  return spec;
}
function drillRows(spec){
  let rows = finSaleLines(spec.q);
  if(spec.filter) rows = rows.filter(spec.filter);
  return rows.sort((a,b)=> a.fecha<b.fecha?1 : a.fecha>b.fecha?-1 : String(b.numero).localeCompare(String(a.numero),undefined,{numeric:true}));
}
/* Compras de un mes que tocan la selección (sólo las líneas que entran en el filtro). */
function drillPurchases(spec){
  if(!spec.mk) return [];
  const r = { from:spec.q.from, to:spec.q.to }, d = { linea:spec.q.linea, idioma:spec.q.idioma };
  const out = [];
  (db.compras||[]).forEach(c=>{
    const f = normISO(c.fecha)||""; if(!finInRange(f, r)) return;
    if(spec.q.soc && (c.store||STORE_IDS[0])!==spec.q.soc) return;
    let u=0, v=0;
    (c.lineas||[]).forEach(l=>{ if(!finProdMatch(prodById(l.productoId), d)) return; u+=(l.cantidad||0); v+=(l.cantidad||0)*((l.costoTotal!=null)?l.costoTotal:(l.precio||0)); });
    if(u>0) out.push({ id:c.id, fecha:f, numero:c.numero||"", prov:c.contraparte||"", soc:storeName(c.store||STORE_IDS[0]), status:c.status, u, v:round2(v) });
  });
  return out.sort((a,b)=> a.fecha<b.fecha?1:-1);
}

function finDrillOpen(spec){
  _drillLast = spec;
  const rows = drillRows(spec);
  const ventas = new Set(rows.map(r=>r.ventaId)).size;
  const T = rows.reduce((a,r)=>({ u:a.u+r.cantidad, net:a.net+r.net, cogs:a.cogs+r.cogs }), { u:0, net:0, cogs:0 });
  const gm = T.net - T.cogs;
  const period = (spec.q.from||spec.q.to) ? `${spec.q.from?fmtDate(spec.q.from):"…"} – ${spec.q.to?fmtDate(spec.q.to):"…"}` : t("fin.period.all");
  const dims = finDimsLabel(spec.ctx==="plan" ? Object.assign({}, finFiltros, {pais:"",vend:""}) : finFiltros);
  const shown = rows.slice(0, DRILL_MAX_ROWS);
  const body = rows.length ? shown.map(r=>{
    const m = r.net - r.cogs;
    return `<tr class="drillable" data-drill-doc="${esc(r.ventaId)}" tabindex="0" title="${t("dr.opensale")}">
      <td class="num">${esc(fmtDate(r.fecha))}</td><td class="num">${esc(r.numero||"—")}</td><td>${esc(r.cliente||"—")}</td><td>${esc(r.vendedorId?r.vendedor:t("fin.house"))}</td>
      <td>${r.sku?`<span class="sku">${esc(r.sku)}</span> `:""}${esc(r.nombre||"")}</td>
      <td class="num">${qty(r.cantidad)}</td><td class="num">${money(r.net)}</td><td class="num">${money(r.cogs)}</td>
      <td class="num ${m<0?"neg":""}">${money(m)}</td><td class="num ${m<0?"neg":""}">${r.net>0?fmtPct(m/r.net):"—"}</td></tr>`;
  }).join("") : `<tr><td class="u-center u-muted u-p5" colspan="10">${t("dr.nosales")}</td></tr>`;
  const purch = drillPurchases(spec);
  const pT = purch.reduce((a,x)=>({u:a.u+x.u, v:a.v+x.v}),{u:0,v:0});
  const purchHTML = spec.mk ? `
    <h4 class="dr-h">${t("dr.purch.title")}</h4>
    ${purch.length ? `<div class="table-scroll"><table class="fintbl">
      <thead><tr><th>${t("pnl.drill.date")}</th><th>${t("dr.th.invoice")}</th><th>${t("dr.th.supplier")}</th><th>${t("bar.society")}</th><th>${t("dr.th.status")}</th><th class="r">${t("an.th.units")}</th><th class="r">${t("dr.th.amount")}</th></tr></thead>
      <tbody>${purch.map(x=>`<tr class="drillable" data-drill-pdoc="${esc(x.id)}" tabindex="0" title="${t("dr.openpurch")}"><td class="num">${esc(fmtDate(x.fecha))}</td><td class="num">${esc(x.numero||"—")}</td><td>${esc(x.prov||"—")}</td><td>${esc(x.soc)}</td><td>${esc(invoiceStatusLabel(x.status))}</td><td class="num">${qty(x.u)}</td><td class="num">${money(x.v)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="5">${t("common.total")}</td><td class="num">${qty(pT.u)}</td><td class="num">${money(pT.v)}</td></tr></tfoot>
    </table></div>` : `<p class="u-m0 hint">${t("dr.purch.none")}</p>`}` : "";
  const html = `
    <p class="u-m0 u-mb3 hint">${esc(period)}${dims?" · "+esc(dims):""}${spec.q.soc?" · "+esc(storeName(spec.q.soc)):""}</p>
    <div class="dr-sum">
      <div><span>${t("dr.s.sales")}</span><b>${qty(ventas)}</b></div>
      <div><span>${t("an.th.units")}</span><b>${qty(T.u)}</b></div>
      <div><span>${t("an.kpi.netrev")}</span><b>${money(T.net)}</b></div>
      <div><span>${t("pnl.kpi.cogs")}</span><b>${money(T.cogs)}</b></div>
      <div><span>${t("an.kpi.grossmargin")}</span><b class="${gm<0?"neg":""}">${money(gm)}</b></div>
      <div><span>${t("fin.kpi.gmpct")}</span><b>${T.net>0?fmtPct(gm/T.net):"—"}</b></div>
    </div>
    <h4 class="dr-h">${t("dr.sales.title")}</h4>
    <div class="table-scroll dr-scroll"><table class="fintbl">
      <thead><tr><th>${t("pnl.drill.date")}</th><th>${t("dr.th.sale")}</th><th>${t("dr.th.customer")}</th><th>${t("an.th.seller")}</th><th>${t("pnl.drill.product")}</th><th class="r">${t("pnl.drill.qty")}</th><th class="r">${t("an.kpi.netrev")}</th><th class="r">${t("pnl.kpi.cogs")}</th><th class="r">${t("an.th.margin")}</th><th class="r">${t("an.th.marginpct")}</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    ${rows.length>DRILL_MAX_ROWS ? `<p class="hint">${t("dr.more",{n:rows.length, m:DRILL_MAX_ROWS})}</p>` : ""}
    <p class="fin-help">${t("dr.help")}</p>
    ${purchHTML}`;
  const buttons = [{ label:t("common.close"), cls:"btn", act:closeModal }];
  if(spec.pid) buttons.push({ label:t("dr.openprod"), cls:"btn", act:()=>{ closeModal(); openFicha(spec.pid); } });
  if(rows.length) buttons.push({ label:t("dr.export"), cls:"btn primary", act:()=> drillExport(spec, rows) });
  buildModal(spec.title, html, buttons, "wide dr-modal");
  const root = document.getElementById("modalRoot");
  const onKey = (el, fn)=>{ el.onclick = fn; el.onkeydown = e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fn(); } }; };
  root.querySelectorAll("[data-drill-doc]").forEach(tr=> onKey(tr, ()=> drillOpenDoc("venta", tr.dataset.drillDoc)));
  root.querySelectorAll("[data-drill-pdoc]").forEach(tr=> onKey(tr, ()=> drillOpenDoc("compra", tr.dataset.drillPdoc)));
}
/* Abre la venta/compra y deja un botón para volver al detalle. */
function drillOpenDoc(tipo, id){
  verDoc(tipo, id);
  const foot = document.getElementById("mfoot");
  if(foot && _drillLast){
    const b = document.createElement("button");
    b.className = "btn"; b.type = "button"; b.textContent = t("dr.back");
    b.onclick = ()=> finDrillOpen(_drillLast);
    foot.insertBefore(b, foot.firstChild);
  }
}
function drillExport(spec, rows){
  if(!window.XLSX){ toast(t("pnl.tt.noxlsx"),"warn"); return; }
  const aoa = [[t("pnl.drill.date"), t("dr.th.sale"), t("dr.th.customer"), t("an.th.seller"), "SKU", t("pnl.drill.product"), t("an.sl.line"), t("an.sl.language"), t("an.sl.country"), t("pnl.drill.qty"), t("an.kpi.netrev"), t("pnl.kpi.cogs"), t("an.th.margin")]];
  rows.forEach(r=> aoa.push([r.fecha, r.numero, r.cliente, r.vendedorId?r.vendedor:t("fin.house"), r.sku||"", r.nombre||"", r.saga||"", langLabel(r.idioma), paisLabel(r.pais)||"", r.cantidad, round2(r.net), round2(r.cogs), round2(r.net-r.cogs)]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{wch:11},{wch:9},{wch:24},{wch:14},{wch:12},{wch:40},{wch:16},{wch:9},{wch:12},{wch:7},{wch:13},{wch:13},{wch:13}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, t("dr.sheet"));
  const slug = String(spec.title||"detalle").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"_").slice(0,40);
  XLSX.writeFile(wb, `detalle_${slug}.xlsx`);
}
/* Cablea todos los data-drill de la vista (click, Enter y Espacio). */
function wireDrills(root){
  root = root || document.getElementById("main"); if(!root) return;
  root.querySelectorAll("[data-drill]").forEach(el=>{
    const go = (e)=>{ if(e){ e.stopPropagation(); } if(typeof hideNameTip==="function") hideNameTip(); finDrillOpen(drillSpec(el.getAttribute("data-drill"), el.getAttribute("data-drill-ctx")||"")); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(e); } });
  });
}

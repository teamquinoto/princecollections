/* ============================================================
   VISTA: Panel
   ============================================================ */
/* ============================================================
   VISTA: Panel (dashboard)
   ============================================================ */
/* Feature flag: columnas de stock por sociedad (Akira / Silver) en la tabla del Panel.
   Por ahora no aportan, así que se ocultan SÓLO acá (Productos las sigue mostrando).
   Para volver a mostrarlas: poné esto en true. Nada más. */
const DASH_SHOW_SOC_COLS = false;
const dashSocCols = ()=> DASH_SHOW_SOC_COLS && showSociedadCols();
let selProd = new Set();                 // productos tildados en el maestro
let selMode = false;                     // modo selección activado (muestra los tildes)
let prodFiltros = { q:"", saga:"", idioma:"", estado:"", xstate:"", cmin:"", cmax:"", sortKey:"", sortDir:"" };
let dashFiltros = { q:"", saga:"", idioma:"", estado:"", xstate:"", cmin:"", cmax:"", sortKey:"", sortDir:"" };
let docFiltros = { compra:{q:"",desde:"",hasta:"",sortKey:"",sortDir:""}, venta:{q:"",desde:"",hasta:"",vend:"",sortKey:"",sortDir:""} };
let movFiltros = { q:"", desde:"", hasta:"", tipo:"", saga:"", vmin:"", vmax:"", sortKey:"", sortDir:"" };
/* "Saga" = línea/juego, derivada del nombre del producto.
   Se normaliza fuerte para que NO se dupliquen por basura de formato:
   - se saca un SKU al principio ("PKM-JP-151 · Pokémon Card Game" -> "Pokémon Card Game")
   - se corta en el primer separador real ( :  ·  —  |  " - " )
   - se limpian rayas/guiones/puntos sueltos al final (lo que hacía
     "Disney Lorcana", "Disney Lorcana -" y "Disney Lorcana —" tres sagas distintas)
   - y al final se mapea a un nombre canónico para los juegos conocidos
     (One Piece Card Game == One Piece TCG, Magic == MTG, etc.).            */

/* Alias -> nombre canónico. El primer patrón que matchea, gana. */
const SAGA_CANON = [
  { canon:"Pokémon TCG",       re:/pok[eé]?mon/i },
  { canon:"Magic",             re:/\bmagic\b|\bmtg\b|the\s+gathering/i },
  { canon:"One Piece TCG",     re:/one\s*piece|\bop-?op\d/i },
  { canon:"Disney Lorcana",    re:/lorcana/i },
  { canon:"Flesh and Blood",   re:/flesh\s*(and|&|\+)?\s*blood|\bfab\b/i },
  { canon:"Digimon",           re:/digimon/i },
  { canon:"Dragon Ball",       re:/dragon\s*ball|\bdbs\b/i },
  { canon:"Yu-Gi-Oh!",         re:/yu-?gi-?oh|\bygo\b/i },
];

function sagaDe(p){
  let n = (p.nombre||"").trim();
  if(!n) return "—";

  // 1) sacar SKU al inicio: TOKEN en mayúsculas/dígitos/guiones seguido de un separador
  //    ej "FAB-HVY-BST · Flesh and Blood" / "ACC-9P-SLEEVE · 9-pocket"
  n = n.replace(/^[A-Z0-9]{2,}(?:-[A-Z0-9]+)+\s*[·:\-—|]\s*/,"").trim();

  // 2) cortar en el primer separador "fuerte" para quedarnos con la familia
  const cut = n.split(/\s*[:·|]\s*|\s+[-—]\s+/)[0];
  let base = (cut || n).trim();

  // 3) limpiar puntuación/rayas/espacios sobrantes en las puntas
  base = base.replace(/^[\s\-—·:|]+|[\s\-—·:|]+$/g,"").replace(/\s{2,}/g," ").trim();

  // 4) si es un juego conocido, devolver el nombre canónico unificado
  for(const s of SAGA_CANON){ if(s.re.test(base) || s.re.test(n)) return s.canon; }

  // 5) fallback: si quedó muy largo, primeras 3 palabras (comportamiento previo, ya limpio)
  if(!base) return "—";
  const w = base.split(/\s+/);
  return w.length>3 ? w.slice(0,3).join(" ") : base;
}
function sagasUnicas(){
  return [...new Set(db.productos.map(sagaDe))].filter(s=>s&&s!=="—").sort((a,b)=>a.localeCompare(b,"es"));
}
/* Filtrado genérico de productos por {q,saga,estado,cmin,cmax,sortKey,sortDir} */
function filtrarProds(f){
  if(f.estado==="neg") f.estado="";   // filtro "Stock negativo" eliminado: el stock ya no puede quedar bajo cero (trabas en compras y ajustes)
  const q=(f.q||"").trim().toLowerCase();
  const cmin=f.cmin!==""&&f.cmin!=null?parseNum(f.cmin):null;
  const cmax=f.cmax!==""&&f.cmax!=null?parseNum(f.cmax):null;
  const xs=f.xstate||"";   // "" (all) | "avail" | "transit"
  const out = db.productos.filter(p=>{
    if(soloEnVault(p)) return false;             // vault lives in its own panel
    // Punto 9: en vista de UN local, sólo productos que pertenecen a ese local
    if(activeStore!=="all" && !perteneceAStore(p, activeStore)) return false;
    const sf = stockEnFoco(p);                   // stock under the active store focus
    if(q){ const hay=((p.nombre||"")+" "+(p.sku||"")).toLowerCase(); if(!hay.includes(q)) return false; }
    if(f.saga && sagaDe(p)!==f.saga) return false;
    if(f.idioma && (p.idioma||"")!==f.idioma) return false;
    // En modo "in transit" listamos sólo productos con mercadería en camino y NO
    // aplicamos los filtros de stock disponible (miran otra cosa).
    if(xs==="transit"){
      if(transitoEnFoco(p)<=0) return false;
    } else {
      if(f.estado==="pedir" && !necesitaPedido(p)) return false;
      if(f.estado==="con" && !(sf>0)) return false;
      if(f.estado==="sin" && sf!==0) return false;
      if(f.estado==="bajo" && !(sf>0 && p.puntoRepedido>0 && sf<=p.puntoRepedido)) return false;
      if(f.estado==="blocked" && !esBloqueado(p)) return false;
    }
    const c=p.ultimoCosto||0;
    if(cmin!==null && c<cmin) return false;
    if(cmax!==null && c>cmax) return false;
    return true;
  });
  // Sort by column; default = valued ↓
  const key=f.sortKey||"valor";
  const dir=f.sortKey ? (f.sortDir==="asc"?1:-1) : -1;
  const valOf = p => {
    const sf = stockEnFoco(p);
    // columnas de sociedad (dinámicas): key = "soc_<id>" -> stock de esa sociedad
    if(key.indexOf("soc_")===0){ const s=key.slice(4); return stockDe(p, s)||0; }
    switch(key){
      case "sku":    return String(p.sku||"");
      case "nombre": return String(p.nombre||"");
      case "unidad": return String(p.unidad||"u");
      case "lang":   return String(langLabel(p.idioma||"")||"");   // Lang (products)
      case "stock":  return sf;
      case "costo":  return p.ultimoCosto||0;
      case "pventa": return p.precioVenta||0;
      case "rep":    return p.puntoRepedido||0;
      case "valor":
      default:       return valorFifoEnFoco(p);   // mismo valor que muestra la celda (FIFO), antes stock × último costo
    }
  };
  out.sort((a,b)=>{
    const va=valOf(a), vb=valOf(b);
    if(typeof va==="number") return dir*(va-vb);
    return dir*va.localeCompare(vb,"es",{numeric:true});
  });
  return out;
}
/* cicla orden en una columna: desc -> asc -> sin flecha, y re-renderiza la vista */
function cycleSort(f, k){
  if(f.sortKey!==k){ f.sortKey=k; f.sortDir="desc"; }
  else if(f.sortDir==="desc"){ f.sortDir="asc"; }
  else { f.sortKey=""; f.sortDir=""; }
  render();
}
function wireSortHeaders(f){
  document.querySelectorAll("#main th[data-sortk]").forEach(th=> th.onclick=()=>cycleSort(f, th.dataset.sortk));
}
/* Barra de filtros de productos, reutilizable (prefix = prefijo de ids) */
function filterBarHTML(prefix, f){
  const sagas=sagasUnicas();
  return `<div class="filtros">
    <input class="inp" id="${prefix}q" placeholder="${t("dash.f.search")}" value="${esc(f.q)}" style="flex:2;min-width:180px">
    <select class="f-grow inp" id="${prefix}saga">
      <option value="">${t("dash.f.alllines")}</option>
      ${sagas.map(s=>`<option value="${esc(s)}" ${f.saga===s?"selected":""}>${esc(s)}</option>`).join("")}
    </select>
    <select class="inp" id="${prefix}idioma" style="flex:1;min-width:100px">
      <option value="">${t("dash.f.alllang")}</option>
      ${langOpts().map(([v,l])=>`<option value="${v}" ${f.idioma===v?"selected":""}>${esc(l)}</option>`).join("")}
    </select>
    <select class="f-grow inp" id="${prefix}estado">
      <option value="" ${f.estado===""?"selected":""}>${t("dash.f.allstock")}</option>
      <option value="pedir" ${f.estado==="pedir"?"selected":""}>${t("dash.f.reorder")}</option>
      <option value="con" ${f.estado==="con"?"selected":""}>${t("dash.f.instock")}</option>
      <option value="sin" ${f.estado==="sin"?"selected":""}>${t("dash.f.outstock")}</option>
      <option value="bajo" ${f.estado==="bajo"?"selected":""}>${t("dash.f.belowmin")}</option>
      <option value="blocked" ${f.estado==="blocked"?"selected":""}>${t("dash.f.blocked")}</option>
    </select>
    <select class="f-grow inp" id="${prefix}xstate" title="${t("dash.f.availtip")}">
      <option value="" ${(f.xstate||"")===""?"selected":""}>${t("dash.f.availtransit")}</option>
      <option value="avail" ${f.xstate==="avail"?"selected":""}>${t("dash.f.availonly")}</option>
      <option value="transit" ${f.xstate==="transit"?"selected":""}>${t("dash.f.transitonly")}</option>
    </select>
    <input class="inp-range inp num" id="${prefix}cmin" placeholder="${t("dash.f.mincost")}" value="${esc(f.cmin)}">
    <input class="inp-range inp num" id="${prefix}cmax" placeholder="${t("dash.f.maxcost")}" value="${esc(f.cmax)}">
    <button class="btn ghost sm" id="${prefix}clear" title="${t("dash.f.cleartip")}">${t("dash.f.clear")}</button>
  </div>`;
}
function wireFilterBar(prefix, f, onChange){
  const q=document.getElementById(prefix+"q"); if(!q) return;
  const upd=(k,el)=>{ f[k]=el.value; onChange(); };
  q.oninput=()=>upd("q",q);
  document.getElementById(prefix+"saga").onchange=e=>upd("saga",e.target);
  const idi=document.getElementById(prefix+"idioma"); if(idi) idi.onchange=e=>upd("idioma",e.target);
  document.getElementById(prefix+"estado").onchange=e=>upd("estado",e.target);
  const xst=document.getElementById(prefix+"xstate"); if(xst) xst.onchange=e=>upd("xstate",e.target);
  document.getElementById(prefix+"cmin").oninput=e=>upd("cmin",e.target);
  document.getElementById(prefix+"cmax").oninput=e=>upd("cmax",e.target);
  document.getElementById(prefix+"clear").onclick=()=>{
    f.q="";f.saga="";f.idioma="";f.estado="";f.xstate="";f.cmin="";f.cmax="";f.sortKey="";f.sortDir="";
    render();
  };
}
/* Salta desde la alerta del panel al maestro filtrado por "A reponer",
   ordenado por stock ascendente (primero lo más urgente: negativos y ceros). */
function irAPedidos(){
  descartarAlerta(firmaReposicion());
  // Si venías filtrado en el panel (p. ej. Dragon Ball · SP/ESP), el maestro conserva ese corte.
  const keep = (view==="dash") ? { q:dashFiltros.q||"", saga:dashFiltros.saga||"", idioma:dashFiltros.idioma||"" } : { q:"", saga:"", idioma:"" };
  Object.assign(prodFiltros, keep, { estado:"pedir", xstate:"", cmin:"", cmax:"", sortKey:"stock", sortDir:"asc" });
  setView("prod");
  toast(t("dash.toast.reorder"),"warn");
}

/* ============================================================
   KPIs del panel = SUBTOTALES de lo que estás viendo.
   Antes se calculaban siempre sobre todo el catálogo: filtrabas
   "Dragon Ball + SP/ESP" y la tabla cambiaba, pero unidades,
   valuación y alertas quedaban iguales. Ahora se recalculan con la
   misma lista filtrada que arma la tabla (renderDashRows).
   ============================================================ */
function dashFiltroLabel(){
  const f=dashFiltros, parts=[];
  if(f.q) parts.push("“"+f.q+"”");
  if(f.saga) parts.push(f.saga);
  if(f.idioma) parts.push(langLabel(f.idioma));
  if(f.estado) parts.push(t({pedir:"dash.f.reorder",con:"dash.f.instock",sin:"dash.f.outstock",bajo:"dash.f.belowmin",blocked:"dash.f.blocked"}[f.estado]||"dash.f.allstock"));
  if(f.xstate) parts.push(t(f.xstate==="transit"?"dash.f.transitonly":"dash.f.availonly"));
  if(f.cmin||f.cmax) parts.push((f.cmin||"0")+"–"+(f.cmax||"∞"));
  return parts.join(" · ");
}
function dashKpisHTML(list, filtered){
  const foco = (!viewUsesSociety() || activeStore==="all") ? t("dash.consolidated") : storeName(activeStore);
  const unidades = list.reduce((a,p)=> a + stockEnFoco(p), 0);
  const valor = list.reduce((a,p)=> a + valorFifoEnFoco(p), 0);
  const transU = list.reduce((a,p)=> a + transitoEnFoco(p), 0);
  const transV = list.reduce((a,p)=> a + transitoValorEnFoco(p), 0);
  const porPedir = list.filter(necesitaPedido);
  const total = productosVendibles().filter(enFocoActual).length;
  const lbl = filtered ? dashFiltroLabel() : "";
  return `<div class="kpis">
    <div class="kpi"><div class="lbl">${t("dash.kpi.products")}</div><div class="val">${list.length}</div><div class="sub">${filtered?t("fin.dash.ofskus",{n:total}):t("dash.kpi.sellableskus")}</div></div>
    <div class="kpi"><div class="lbl">${t("dash.kpi.unitsstock")}</div><div class="val">${qty(unidades)}</div><div class="sub">${esc(foco)}</div></div>
    <div class="kpi"><div class="lbl">${t("dash.kpi.valuation")}</div><div class="val">${bigMoney(valor)}</div><div class="sub">${t("dash.kpi.fifolayers")}</div></div>
    ${transU>0?`<div class="kpi"><div class="lbl">${t("dash.kpi.transit")}</div><div class="val">${qty(transU)}</div><div class="sub">${t("dash.kpi.incoming")} · ${money(transV)}</div></div>`:""}
    <div class="kpi ${porPedir.length?'warn kpi-click':''}" ${porPedir.length?`data-goto-pedir role="button" tabindex="0" title="${t("dash.kpi.reordertip")}"`:''}><div class="lbl">${t("dash.kpi.alerts")}</div><div class="val">${porPedir.length}</div><div class="sub">${porPedir.length?t("dash.kpi.reordertip"):t("dash.sub.allgood")}</div></div>
  </div>
  ${filtered?`<p class="note-under finbar-note">${t("fin.dash.subtotals",{sel:`<b>${esc(lbl)}</b>`})}</p>`:""}`;
}
function viewDash(){
  const vend = productosVendibles().filter(enFocoActual);
  const negs   = vend.filter(p=> stockEnFoco(p)<0);
  const enCero = vend.filter(p=> stockEnFoco(p)===0);
  const bajoM  = vend.filter(p=> stockEnFoco(p)>0 && bajoStock(p));
  const porPedir = vend.filter(necesitaPedido);
  const subAlerta = porPedir.length
    ? [ enCero.length?`${enCero.length} ${t("dash.sub.outofstock")}`:"", negs.length?`${negs.length} ${t("dash.sub.negative")}`:"", bajoM.length?`${bajoM.length} ${t("dash.sub.belowmin")}`:"" ].filter(Boolean).join(" · ")
    : t("dash.sub.allgood");
  const firma = firmaReposicion();
  if(!porPedir.length) limpiarMemoriaAlerta();
  const mostrarBanner = porPedir.length && !alertaDescartada(firma);
  const consolidado = !viewUsesSociety() || activeStore==="all";
  const foco = consolidado ? t("dash.consolidated") : storeName(activeStore);
  const multi = allowedStores().length>1;

  return `
  <div class="head">
    <div class="title"><h2>${t("dash.title")}</h2><p>${t("dash.subtitle")}${multi?` · <b>${esc(foco)}</b>`:""}.</p></div>
    <div class="actions">
      ${puedeComprar()?`<button class="btn" data-open="compra">${ICO.buy}${t("dash.newpurchase")}</button>`:""}
      <button class="btn primary" data-open="venta">${ICO.sale}${t("dash.newsale")}</button>
    </div>
  </div>

  ${mostrarBanner ? `<div class="banner warn alerta-pedido" data-goto-pedir role="button" tabindex="0" title="${t("dash.kpi.reordertip")}">
    <span aria-hidden="true">${ICO.warn}</span>
    <span><b>${porPedir.length}</b> ${t("dash.banner.prodreorder")}${subAlerta?` — ${subAlerta}`:""}. <u>${t("dash.banner.tap")}</u></span>
  </div>` : ""}

  <div id="dashKpis">${dashKpisHTML(vend, false)}</div>

  ${(isAdmin() && typeof planMesCardHTML==="function") ? planMesCardHTML({ compact:true }) : ""}

  <div class="panel">
    <div class="phead"><h3>${t("dash.stockonhand")}</h3><span class="hint" id="dashCount">${t("dash.taphistory")}</span>${stockViewSwitchHTML()}</div>
    ${vend.length ? `
    ${filterBarHTML("f", dashFiltros)}
    <div class="table-scroll"><table>
      <thead><tr>
        ${sortTh(dashFiltros,"sku","SKU","")}
        ${sortTh(dashFiltros,"nombre",t("common.product"),"")}
        ${dashSocCols() ? sociedadColsHead(dashFiltros) : ""}
        ${sortTh(dashFiltros,"stock",stockView==="cases"?t("pr.th.stockcases"):t("pr.th.stock"),"r")}
        ${sortTh(dashFiltros,"costo",t("pr.th.lastcost"),"r")}
        ${sortTh(dashFiltros,"valor",t("dash.th.valued"),"r")}
      </tr></thead>
      <tbody id="dashBody"></tbody>
    </table></div>` : emptyState(t("dash.empty.title"),t("dash.empty.sub"))}
  </div>`;
}

function filteredDashProds(){ return filtrarProds(dashFiltros); }
/* Punto 1: expande cada producto a una o dos filas de stock según el filtro:
   - "" (all): fila de disponible + fila de tránsito si hay mercadería en camino.
   - "avail": sólo disponible.  - "transit": sólo tránsito.
   Devuelve [{p, kind:"avail"|"transit"}]. */
function stockRowset(list, f){
  const xs = f.xstate || "";
  const rows = [];
  list.forEach(p=>{
    const trans = transitoEnFoco(p);
    if(xs==="transit"){ if(trans>0) rows.push({p, kind:"transit"}); }
    else if(xs==="avail"){ rows.push({p, kind:"avail"}); }
    else { rows.push({p, kind:"avail"}); if(trans>0) rows.push({p, kind:"transit"}); }
  });
  return rows;
}
function renderDashRows(){
  const body=document.getElementById("dashBody"); if(!body) return;
  const list=filteredDashProds();
  const showCols = dashSocCols();
  const colspan = 5 + (showCols ? STORE_IDS.length : 0);
  const rowset = stockRowset(list, dashFiltros);
  body.innerHTML = rowset.map(({p,kind})=>{
    const isT = kind==="transit";
    const units = isT ? transitoEnFoco(p) : stockEnFoco(p);
    const val   = isT ? transitoValorEnFoco(p) : valorFifoEnFoco(p);
    const costo = isT ? (transitoEnFoco(p)>0 ? round2(transitoValorEnFoco(p)/transitoEnFoco(p)) : (p.ultimoCosto||0)) : (p.ultimoCosto||0);
    let cls="stock-cell";
    if(isT) cls+=" transit";
    else { if(units<0) cls+=" neg"; else if(units===0) cls+=" zero"; else if(bajoStock(p)) cls+=" low"; }
    const flag = isT ? `<span class="inv-badge transit">${t("pr.badge.transit")}</span>`
               : esBloqueado(p) ? `<span class="pill blocked">${t("pr.badge.blocked")}</span>`
               : units<0 ? `<span class="pill low">${t("pr.badge.negative")}</span>`
               : bajoStock(p) ? `<span class="pill low">${t("pr.badge.reorder")}</span>` : "";
    const perStore = showCols ? sociedadColsCells(p, isT) : "";
    return `<tr data-ficha="${p.id}" class="u-pointer ${isT?'row-transit':''}">
      <td><span class="sku">${esc(p.sku||"—")}</span></td>
      <td>${esc(p.nombre)} ${flag}</td>
      ${perStore}
      <td class="r ${cls}">${stockDisplay(p,units)}</td>
      <td class="r num">${money(costo)}</td>
      <td class="r num">${money(val)}</td>
    </tr>`;
  }).join("") || `<tr><td class="u-center u-muted u-p5" colspan="${colspan}">${t("dash.nomatch")}</td></tr>`;
  // Subtotales: los KPIs se recalculan con la misma lista filtrada que la tabla.
  const kp=document.getElementById("dashKpis");
  if(kp){
    const hayFiltro = !!(dashFiltros.q||dashFiltros.saga||dashFiltros.idioma||dashFiltros.estado||dashFiltros.xstate||dashFiltros.cmin||dashFiltros.cmax);
    kp.innerHTML = dashKpisHTML(list, hayFiltro);
    if(typeof fitKpiValues==="function") fitKpiValues(kp);
    kp.querySelectorAll("[data-goto-pedir]").forEach(el=>{
      el.style.cursor="pointer"; el.onclick=irAPedidos;
      el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); irAPedidos(); } };
    });
  }
  const cnt=document.getElementById("dashCount");
  const total=productosVendibles().length;
  if(cnt) cnt.textContent = list.length===total ? t("dash.taphistory") : t("dash.showing",{n:list.length,total});
  body.querySelectorAll("[data-ficha]").forEach(tr=> tr.onclick=()=> openFicha(tr.dataset.ficha));
}
function wireDashFiltros(){
  wireFilterBar("f", dashFiltros, renderDashRows);
  if(document.getElementById("dashBody")){ wireSortHeaders(dashFiltros); renderDashRows(); }
}


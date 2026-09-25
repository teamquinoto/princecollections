/* ============================================================
   VISTA: Productos
   ============================================================ */
function viewProd(){
  const total = productosVendibles().length;
  return `
  <div class="head">
    <div class="title"><h2>${t("pr.title")}</h2><p>${t("pr.sub")}</p></div>
    <div class="actions">
      ${(total&&isAdmin())?`<button type="button" class="btn icon-only" id="btnCatalogo" style="padding:9px 11px" title="${esc(t("pr.btn.catalog.tt"))}" aria-label="${esc(t("pr.btn.catalog"))}">${ICO.copy}</button>`:""}
      ${total?`<button class="btn" id="btnExpPrecios">${ICO.price}${t("pr.btn.pricelist")}</button>`:""}
      ${(total&&isAdmin())?`<button class="btn" id="btnSel">${selMode?ICO.x+t("common.cancel"):ICO.select+t("pr.btn.select")}</button>`:""}
      ${puedeEditarProductos()?`<button class="btn primary" data-newp>${ICO.plus}${t("pr.btn.newprod")}</button>`:""}
    </div>
  </div>
  <div class="panel">
    <div class="phead"><h3>${t("pr.master")}</h3><span class="hint" id="prodCount">${t("pr.items",{n:total})}</span>${stockViewSwitchHTML()}</div>
    <div class="selbar" id="selbar" style="display:none">
      <span id="selcount" class="sel-hint">${t("pr.tickhint")}</span>
      <div class="u-flex1"></div>
      <div id="selactions" style="display:none">
        <button class="btn ghost sm" id="selexp">${ICO.select}${t("pr.btn.expsel")}</button>
        <button class="btn ghost sm" id="selnone">${t("pr.btn.deselect")}</button>
        ${isAdmin()?`<button class="btn danger sm" id="seldel">${ICO.trash}${t("pr.btn.delsel")}</button>`:""}
      </div>
    </div>
    ${total ? `
    ${filterBarHTML("p", prodFiltros)}
    <div class="table-scroll"><table>
      <thead><tr>${selMode?`<th class="c"><input type="checkbox" id="selall"></th>`:""}${sortTh(prodFiltros,"sku","SKU","")}${sortTh(prodFiltros,"nombre",t("prod.l.name"),"")}${sortTh(prodFiltros,"lang",t("pr.th.lang"),"c")}${sociedadColsHead(prodFiltros)}${sortTh(prodFiltros,"stock",stockView==="cases"?t("pr.th.stockcases"):t("pr.th.stock"),"r")}${sortTh(prodFiltros,"costo",t("pr.th.lastcost"),"r")}${sortTh(prodFiltros,"pventa",t("prod.l.listprice"),"r")}<th></th></tr></thead>
      <tbody id="prodBody"></tbody></table></div>`
      : emptyState(t("pr.empty.title"),t("pr.empty.sub"))}
  </div>`;
}
function renderProdRows(){
  const body=document.getElementById("prodBody"); if(!body) return;
  const list=filtrarProds(prodFiltros);
  const showCols = showSociedadCols();
  const cols = (selMode?1:0)+7+(showCols?STORE_IDS.length:0);
  body.innerHTML = stockRowset(list, prodFiltros).map(({p,kind})=>{
    const isT = kind==="transit";
    const units = isT ? transitoEnFoco(p) : stockEnFoco(p);
    let cls="stock-cell";
    if(isT) cls+=" transit";
    else { if(units<0) cls+=" neg"; else if(units===0) cls+=" zero"; else if(bajoStock(p)) cls+=" low"; }
    // en la fila de tránsito no tiene sentido el checkbox de selección
    const chk = selMode ? (isT ? `<td class="c"></td>` : `<td class="c" data-nofic><input type="checkbox" class="selchk" data-selp="${p.id}" ${selProd.has(p.id)?"checked":""}></td>`) : "";
    const flag = isT ? ` <span class="inv-badge transit">${t("pr.badge.transit")}</span>` : (esBloqueado(p) ? ` <span class="pill blocked">${t("pr.badge.blocked")}</span>` : "");
    const cost = isT ? (transitoEnFoco(p)>0 ? round2(transitoValorEnFoco(p)/transitoEnFoco(p)) : (p.ultimoCosto||0)) : (p.ultimoCosto||0);
    const perStore = sociedadColsCells(p, isT);
    return `<tr data-ficha="${p.id}" class="u-pointer ${isT?'row-transit':''}">
      ${chk}
      <td><span class="sku">${esc(p.sku||"—")}</span></td>
      <td>${esc(p.nombre)}${flag}</td>
      <td class="c">${esc(langLabel(p.idioma))}</td>
      ${perStore}
      <td class="r ${cls}">${stockDisplay(p,units)}</td>
      <td class="r num">${money(cost)}</td>
      <td class="r num">${isT?"—":moneyOpt(p.precioVenta)}</td>
      <td class="r">${puedeEditarProductos() ? iconBtn(`data-editp="${p.id}"`, ICO.edit, t("common.edit")) : ""}</td>
    </tr>`;
  }).join("") || `<tr><td class="u-center u-muted u-p5" colspan="${cols}">${t("pr.nomatch")}</td></tr>`;
  const cnt=document.getElementById("prodCount");
  const total=productosVendibles().length;
  if(cnt) cnt.textContent = list.length===total ? t("pr.items",{n:total}) : t("pr.showing",{n:list.length,total});
  body.querySelectorAll("[data-ficha]").forEach(tr=> tr.onclick=()=> openFicha(tr.dataset.ficha));
  body.querySelectorAll("[data-editp]").forEach(b=> b.onclick=(e)=>{ e.stopPropagation(); openProd(b.dataset.editp); });
  body.querySelectorAll("[data-nofic]").forEach(td=> td.onclick=e=>e.stopPropagation());
  body.querySelectorAll(".selchk").forEach(cb=>{
    cb.onclick=e=>e.stopPropagation();
    cb.onchange=()=>{ cb.checked?selProd.add(cb.dataset.selp):selProd.delete(cb.dataset.selp); refreshSelbar(); };
  });
  refreshSelbar();
}
function refreshSelbar(){
  const bar=document.getElementById("selbar"), count=document.getElementById("selcount"),
        all=document.getElementById("selall"), acts=document.getElementById("selactions");
  const n=selProd.size;
  if(bar) bar.style.display = selMode ? "flex" : "none";
  if(acts) acts.style.display = n===0 ? "none" : "flex";
  if(count) count.textContent = n===0 ? t("pr.tickhint")
                                       : t("pr.selected",{n});
  if(count) count.className = n===0 ? "sel-hint" : "";
  if(all){ const vis=filtrarProds(prodFiltros); all.checked = vis.length>0 && vis.every(p=>selProd.has(p.id)); }
}
function wireProd(){
  const exp=document.getElementById("btnExpPrecios");
  if(exp) exp.onclick=()=>{
    const base = (selMode && selProd.size) ? db.productos.filter(p=>selProd.has(p.id)) : filtrarProds(prodFiltros);
    exportListaPrecios(base);
  };
  const btn=document.getElementById("btnSel");
  if(btn) btn.onclick=()=>{ selMode=!selMode; if(!selMode) selProd.clear(); render(); };
  if(!document.getElementById("prodBody")) return;
  [...selProd].forEach(id=>{ if(!prodById(id)) selProd.delete(id); });
  wireFilterBar("p", prodFiltros, renderProdRows);
  const all=document.getElementById("selall");
  if(all) all.onchange=()=>{
    const vis=filtrarProds(prodFiltros);
    if(all.checked) vis.forEach(p=>selProd.add(p.id)); else vis.forEach(p=>selProd.delete(p.id));
    renderProdRows();
  };
  const selexp=document.getElementById("selexp"); if(selexp) selexp.onclick=()=> exportListaPrecios(db.productos.filter(p=>selProd.has(p.id)));
  const none=document.getElementById("selnone"); if(none) none.onclick=()=>{ selProd.clear(); renderProdRows(); };
  const del=document.getElementById("seldel"); if(del) del.onclick=deleteSelProd;
  wireSortHeaders(prodFiltros);
  renderProdRows();
}
function deleteSelProd(){
  const ids=[...selProd]; if(!ids.length) return;
  const prods=ids.map(prodById).filter(Boolean);
  const conStock=prods.filter(p=>stockTotalP(p)!==0).length;
  const conMovs=prods.filter(p=>db.movimientos.some(m=>m.productoId===p.id)).length;
  let msg=t("pr.cf.delete",{n:prods.length});
  if(conStock) msg+=`\n\n⚠ ${t("pr.del.warnstock",{n:conStock})}`;
  if(conMovs) msg+=`\n\n⚠ ${t("pr.del.warnmovs",{n:conMovs})}`;
  msg+=`\n\n${t("common.cantundo")}`;
  if(!confirm(msg)) return;
  db.productos = db.productos.filter(p=>!selProd.has(p.id));
  selProd.clear(); selMode=false;
  save(); toast(t("pr.toast.deleted",{n:prods.length}), "warn"); render();
}


/* ============================================================
   Catálogo público (catalogo.html)
   ------------------------------------------------------------
   Link libre, sin login, solo lectura. Vive en el mismo repo de
   Pages que la app; los datos salen de GET /public/catalog del
   Worker, que ya filtra costos/precios/SKU del lado del servidor.
   ============================================================ */
function catalogoUrl(){ return new URL("catalogo.html", location.href.split("#")[0]).href.split("?")[0]; }
async function copiarLinkCatalogo(){
  const url = catalogoUrl();
  let ok = false;
  try{ await navigator.clipboard.writeText(url); ok = true; }catch(e){}
  if(ok) toast(t("pr.tt.catalogcopied"));
  else window.prompt(t("pr.btn.catalog"), url);   // fallback: que lo copie a mano
}
document.addEventListener("click", e=>{ if(e.target.closest && e.target.closest("#btnCatalogo")) copiarLinkCatalogo(); });

/* v88: misma limpieza que hace el Worker para el catálogo (worker.js → limpiarNombrePublico).
   Acá sólo se usa para SUGERIR en la ficha qué va a ver el cliente si no cargás nada. */
function catLimpiarNombre(n){
  let s = String(n||""), limit = 0;
  s = s.replace(/\s*(?:[-–—]\s*)?\(?\s*\b(?:limit|l[ií]mite)\s*(?:x\s*)?(\d{1,3})\b\s*\)?/gi, (m,d)=>{ limit = +d; return ""; });
  s = s.replace(/\*[^*]{1,24}\*\s*[-–—:]?\s*/g, "");
  s = s.replace(/\(\s*\)/g,"").replace(/\s{2,}/g," ").replace(/\s+([,.)])/g,"$1").replace(/[\s\-–—:·|]+$/,"").replace(/^[\s\-–—:·|]+/,"").trim();
  return { name:s, limit };
}
function catNombreSugerido(n){ return catLimpiarNombre(n).name; }
function catLimiteSugerido(n){ return catLimpiarNombre(n).limit; }

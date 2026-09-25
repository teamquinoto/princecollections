/* ============================================================
   VISTA: Documentos (compras / ventas)
   ============================================================ */
function viewDocs(tipo){
  const isC = tipo==="compra";
  const list = docsVisibles(tipo);
  const f = docFiltros[tipo];
  const showSocCol  = isC && isAdmin() && STORE_IDS.length>1;   // qué sociedad compró
  const showVendCol = !isC && isAdmin();                        // quién vendió (punto 6)
  return `
  <div class="head">
    <div class="title">
      <h2>${isC?t("nav.compras"):t("nav.ventas")}</h2>
      <p>${isC?t("doc.sub.purch"):t("doc.sub.sales")}</p>
    </div>
    <div class="actions">
      ${(isC&&puedeComprar())?`<button class="btn" data-import>${ICO.importpdf}${t("doc.btn.import")}</button>`:""}
      <button class="btn primary" data-open="${tipo}">${isC?ICO.buy+t("doc.btn.manualbuy"):ICO.sale+t("doc.btn.newsale")}</button>
    </div>
  </div>
  ${list.length ? `<div class="kpis" id="docKpis">${docKpisHTML(tipo, filtrarDocs(tipo))}</div>` : ""}
  <div class="panel">
    <div class="phead"><h3>${isC?t("doc.h.purch"):t("doc.h.sales")}</h3><span class="hint" id="docCount">${t("doc.count",{n:list.length})}</span></div>
    ${list.length ? `
    <div class="filtros docfilt">
      <input class="inp" id="dq" placeholder="${isC?t('doc.ph.purch'):t('doc.ph.sales')}" value="${esc(f.q)}" style="flex:1 1 140px;min-width:110px">
      ${(!isC && isAdmin()) ? `<select class="inp" id="dvend" style="min-width:130px;max-width:160px" title="${t('doc.tip.filterseller')}">
        <option value="">${t("doc.o.allsellers")}</option>
        ${vendedores().map(v=>`<option value="${esc(v.id)}" ${f.vend===v.id?"selected":""}>${esc(v.nombre)}</option>`).join("")}
        <option value="__none" ${f.vend==="__none"?"selected":""}>${t("doc.o.house")}</option>
      </select>` : ""}
      <label class="u-fs-xs u-muted">${t("mov.from")} <input class="inp" id="ddesde" type="date" value="${esc(f.desde)}" style="width:128px"></label>
      <label class="u-fs-xs u-muted">${t("mov.to")} <input class="inp" id="dhasta" type="date" value="${esc(f.hasta)}" style="width:128px"></label>
      <button class="btn ghost sm" id="dclear">${t("dash.f.clear")}</button>
      <span class="u-fs-xs u-nowrap hint">${t("doc.sorthint")}</span>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        ${sortTh(f,"numero","#","")}
        ${sortTh(f,"fecha",t("common.date"),"")}
        ${showSocCol?sortTh(f,"store",t("bar.society"),""):""}
        ${showVendCol?sortTh(f,"vendedor",t("doc.th.soldby"),""):""}
        ${sortTh(f,"contraparte",isC?t("doc.th.supplier"):t("doc.th.customer"),"")}
        ${sortTh(f,"items",t("doc.th.items"),"c")}
        ${sortTh(f,"total",t("common.total"),"r")}
        ${isC?sortTh(f,"status",t("doc.th.status"),"c"):""}
        ${(!isC && isAdmin())?sortTh(f,"commission",t("doc.th.commission"),"r"):""}
        <th></th>
      </tr></thead>
      <tbody id="docBody"></tbody></table></div>`
      : emptyState(isC?t("doc.empty.purch.title"):t("doc.empty.sales.title"),
          isC?t("doc.empty.purch.sub"):t("doc.empty.sales.sub"))}
  </div>`;
}
/* Documentos visibles según rol/foco:
   - compras: se filtran por la sociedad en foco (el admin puede mirar una sola).
   - ventas: un vendedor ve SÓLO las suyas; el admin ve todas. */
function docsVisibles(tipo){
  if(tipo==="compra"){
    const stores = effectiveStores();
    return db.compras.filter(d=> stores.includes(d.store||STORE_IDS[0]));
  }
  if(isSeller()){
    const vid = currentVendedorId();
    return db.ventas.filter(v=> (v.vendedorId||"")===vid);
  }
  return db.ventas.slice();
}
/* Encabezado ordenable: muestra ↑ (asc), ↓ (desc) o ↕ (inactivo, "sin flecha") */
function sortTh(f, key, label, align){
  const active = f.sortKey===key && f.sortDir;
  let cls = "sortable";
  if(active) cls += f.sortDir==="asc" ? " sort-asc" : " sort-desc";
  if(align) cls += " "+align;
  const arr = active ? (f.sortDir==="asc" ? "↑" : "↓") : "↕";
  return `<th class="${cls}" data-sortk="${key}">${esc(label)}<span class="sarr">${arr}</span></th>`;
}

/* Panel de KPIs de la vista (se recalcula sobre lo FILTRADO, así respeta las fechas).
   Margen = precio de venta − costo. El costo lo tomamos del snapshot de la línea
   (l.costo, se guarda desde ahora) y si el documento es viejo y no lo tiene,
   caemos al último costo actual del producto (aproximación honesta). */
function docKpisHTML(tipo, list){
  const isC = tipo==="compra";
  let total=0, uds=0, cogs=0;
  list.forEach(d=>{
    // Punto 8: usar el TOTAL guardado del documento (incluye flete/handling y
    // el redondeo por renglón), así el KPI cuadra exacto con la columna Total
    // de la tabla de facturas. Fallback al cálculo por líneas para docs viejos.
    total += (d.total!=null) ? d.total : round2((d.lineas||[]).reduce((a,l)=>a+round2((l.cantidad||0)*(l.precio||0)),0) + (isC?((d.handling||0)+(d.flete||0)):0));
    (d.lineas||[]).forEach(l=>{
      uds   += (l.cantidad||0);
      if(!isC){
        const c = (l.cogs!=null) ? l.cogs : (l.cantidad||0)*((l.costo!=null)?l.costo:((prodById(l.productoId)||{}).ultimoCosto||0));
        cogs += (l.cogs!=null) ? l.cogs : c;
      }
    });
  });
  const n = list.length;
  if(isC){
    return `
    <div class="kpi"><div class="lbl">${t("doc.kpi.purch")}</div><div class="val">${n}</div><div class="sub">${t("doc.kpi.inrange")}</div></div>
    <div class="kpi"><div class="lbl">${t("doc.kpi.unitsb")}</div><div class="val">${qty(uds)}</div><div class="sub">${t("doc.kpi.itemsin")}</div></div>
    <div class="kpi"><div class="lbl">${t("doc.kpi.totalb")}</div><div class="val">${bigMoney(total)}</div><div class="sub">${t("doc.kpi.suminv")}</div></div>
    <div class="kpi"><div class="lbl">${t("doc.kpi.avgticket")}</div><div class="val">${n?money(total/n):"—"}</div><div class="sub">${t("doc.kpi.perpurch")}</div></div>`;
  }
  const margen = total - cogs;
  const margenPct = total>0 ? (margen/total*100) : 0;
  const commKpi = isAdmin() ? `
    <div class="kpi"><div class="lbl">${t("doc.kpi.comm")}</div><div class="val">${bigMoney(list.reduce((a,d)=>a+saleCommission(d),0))}</div><div class="sub">${t("doc.kpi.commsub")}</div></div>` : "";
  return `
    <div class="kpi"><div class="lbl">${t("doc.kpi.sales")}</div><div class="val">${n}</div><div class="sub">${t("doc.kpi.inrange")}</div></div>
    <div class="kpi"><div class="lbl">${t("doc.kpi.unitss")}</div><div class="val">${qty(uds)}</div><div class="sub">${t("doc.kpi.itemsout")}</div></div>
    <div class="kpi"><div class="lbl">${t("doc.kpi.totals")}</div><div class="val">${bigMoney(total)}</div><div class="sub">${n?t("doc.kpi.avgticketv",{m:money(total/n)}):"—"}</div></div>
    <div class="kpi"><div class="lbl">${t("doc.kpi.gross")}</div><div class="val">${bigMoney(margen)}</div><div class="sub">${total>0?t("doc.kpi.onrev",{p:nf0.format(margenPct)}):t("doc.kpi.loadsales")}</div></div>
    ${commKpi}`;
}

function filtrarDocs(tipo){
  const list = docsVisibles(tipo);
  const f = docFiltros[tipo];
  const q=(f.q||"").trim().toLowerCase();
  let out = list.filter(d=>{
    if(q){ const hay=((d.contraparte||"")+" "+(d.numero||"")+" "+(d.refPago||"")).toLowerCase(); if(!hay.includes(q)) return false; }
    if(f.desde && (d.fecha||"") < f.desde) return false;
    if(f.hasta && (d.fecha||"") > f.hasta) return false;
    // filtro por vendedor (sólo ventas): id puntual, o "__none" = ventas sin vendedor (house)
    if(tipo==="venta" && f.vend){
      if(f.vend==="__none"){ if(d.vendedorId) return false; }
      else if((d.vendedorId||"")!==f.vend) return false;
    }
    return true;
  });
  // Orden: si no hay columna activa, default = fecha ↓ (más reciente primero)
  const key = f.sortKey || "fecha";
  const dir = f.sortKey ? (f.sortDir==="asc" ? 1 : -1) : -1;
  const valOf = d => {
    switch(key){
      case "numero":      return String(d.numero||"");
      case "contraparte": return String(d.contraparte||"");
      case "items":       return (d.lineas||[]).reduce((a,l)=>a+(l.cantidad||0),0);
      case "total":       return d.total||0;
      case "store":       return String(storeName(d.store||"")||"");        // Society (compra)
      case "status":      return String(d.status||"");                        // Status (compra)
      case "vendedor":    return String(saleVendedorNombre(d)||"");           // Sold by (venta)
      case "commission":  return saleCommission(d);                           // Commission (venta)
      case "fecha":
      default:            return String(d.fecha||"");
    }
  };
  out.sort((a,b)=>{
    const va=valOf(a), vb=valOf(b);
    if(typeof va==="number") return dir*(va-vb);
    return dir*va.localeCompare(vb,"es",{numeric:true});
  });
  return out;
}
function renderDocRows(tipo){
  const body=document.getElementById("docBody"); if(!body) return;
  const isC = tipo==="compra";
  const all=docsVisibles(tipo);
  const list=filtrarDocs(tipo), total=all.length;
  const showSocCol  = isC && isAdmin() && STORE_IDS.length>1;
  const showVendCol = !isC && isAdmin();
  const showComm = !isC && isAdmin();
  const cols = 6 + (showSocCol?1:0) + (showVendCol?1:0) + (isC?1:0) + (showComm?1:0);
  body.innerHTML = list.map(d=>{
    const items=d.lineas.reduce((a,l)=>a+l.cantidad,0);
    const received = d.status===INVOICE_STATUS.RECEIVED;
    const statusCell = isC ? `<td class="c"><span class="inv-badge ${received?'received':'transit'}">${received?t('doc.badge.received'):t('doc.badge.transit')}</span></td>` : "";
    const commCell = showComm ? `<td class="r num">${money(saleCommission(d))}</td>` : "";
    return `<tr class="row-open" data-vrow="${tipo}:${d.id}" tabindex="0" aria-label="${t("doc.act.view")} ${esc(d.numero||"")}">
      <td class="num">${esc(d.numero||"—")}</td>
      <td>${esc(fmtDate(d.fecha))}</td>
      ${showSocCol?`<td>${esc(storeName(d.store))}</td>`:""}
      ${showVendCol?`<td>${esc(saleVendedorNombre(d))}</td>`:""}
      <td>${esc(nombreVis(d.contraparte)||"—")}</td>
      <td class="c num">${qty(items)}</td>
      <td class="r num">${money(d.total)}</td>
      ${statusCell}
      ${commCell}
      <td class="u-nowrap r">${(()=>{
        // Fila: tocar la fila = Ver. Acá sólo queda el menú "⋯" con el resto (patrón de stockselect).
        const bStatus = (isC&&puedeComprar()) ? menuBtn(`data-invstatus="${d.id}"`, received?ICO.plane:ICO.receive, received?t('doc.act.marktransit'):t('doc.act.markreceived')) : "";
        const bCopy   = tipo==="venta" ? menuBtn(`data-copydoc="${tipo}:${d.id}"`, ICO.copy, t("doc.act.copy")) : "";
        const bEdit   = menuBtn(`data-editdoc="${tipo}:${d.id}"`, ICO.edit, t("common.edit"));
        const bDel    = menuBtn(`data-deldoc="${tipo}:${d.id}"`, ICO.trash, t("common.delete"), true);
        return rowOverflow("", bStatus+bCopy+bEdit+bDel);
      })()}</td>
    </tr>`;
  }).join("") || `<tr><td class="u-center u-muted u-p5" colspan="${cols}">${t("doc.nomatch")}</td></tr>`;
  const cnt=document.getElementById("docCount");
  if(cnt) cnt.textContent = list.length===total ? t("doc.count",{n:total}) : t("doc.showing",{n:list.length,total});
  const kp=document.getElementById("docKpis");
  if(kp) kp.innerHTML = docKpisHTML(tipo, list);
  // Tocar la fila abre el documento. Se ignora el click si fue sobre el menú "⋯"/sus botones,
  // o si el usuario estaba seleccionando texto (p. ej. para copiar un número).
  body.querySelectorAll("tr[data-vrow]").forEach(tr=>{
    const open=()=>{ const[tp,id]=tr.dataset.vrow.split(":"); verDoc(tp,id); };
    tr.onclick=e=>{
      if(e.target.closest(".rowacts, button, a, input, select")) return;
      const sel=window.getSelection && String(window.getSelection()); if(sel && sel.trim()) return;
      open();
    };
    tr.onkeydown=e=>{ if((e.key==="Enter"||e.key===" ") && e.target===tr){ e.preventDefault(); open(); } };
  });
  body.querySelectorAll("[data-invstatus]").forEach(b=> b.onclick=()=> toggleInvoiceStatus(b.dataset.invstatus));
  body.querySelectorAll("[data-copydoc]").forEach(b=> b.onclick=()=>{ const[t,id]=b.dataset.copydoc.split(":"); copyDoc(t,id); });
  body.querySelectorAll("[data-editdoc]").forEach(b=> b.onclick=()=>{ const[t,id]=b.dataset.editdoc.split(":"); editDoc(t,id); });
  body.querySelectorAll("[data-deldoc]").forEach(b=> b.onclick=()=>{ const[t,id]=b.dataset.deldoc.split(":"); deleteDoc(t,id); });
}
/* Punto 1: alterna el estado de una compra Y aplica su efecto sobre el stock.
   - in_transit -> received: la mercadería entra al inventario (FIFO + stock).
   - received -> in_transit: se saca del inventario. Si ya se vendió parte, el
     stock quedaría negativo: pedimos confirmación antes de proceder. */
function toggleInvoiceStatus(id){
  const c = db.compras.find(x=>x.id===id); if(!c) return;
  if(c.status===INVOICE_STATUS.RECEIVED){
    // Antes sólo avisaba y dejaba seguir (el stock podía quedar negativo). Ahora traba.
    if(trabaCompraUsada(c)) return;
    unreceiveInvoice(c);
    c.status = INVOICE_STATUS.IN_TRANSIT;
    toast(t("doc.tt.backtransit"), "warn");
  } else {
    receiveInvoice(c);
    c.status = INVOICE_STATUS.RECEIVED;
    toast(t("doc.tt.received"), "up");
  }
  save();
  if(document.getElementById("docBody")) renderDocRows("compra");
  else render();
}
function wireDocFiltros(){
  if(!document.getElementById("docBody")) return;
  const tipo = view==="compras" ? "compra" : "venta";
  const f=docFiltros[tipo];
  const upd=(k,el)=>{ f[k]=el.value; renderDocRows(tipo); };
  document.getElementById("dq").oninput=e=>upd("q",e.target);
  document.getElementById("ddesde").onchange=e=>upd("desde",e.target);
  document.getElementById("dhasta").onchange=e=>upd("hasta",e.target);
  const dvend=document.getElementById("dvend"); if(dvend) dvend.onchange=e=>{ f.vend=e.target.value; render(); };   // render completo: actualiza filas + KPIs (comisión)
  document.getElementById("dclear").onclick=()=>{
    docFiltros[tipo]= tipo==="venta"
      ? {q:"",desde:"",hasta:"",vend:"",sortKey:"",sortDir:""}
      : {q:"",desde:"",hasta:"",sortKey:"",sortDir:""};
    ["dq","ddesde","dhasta","dvend"].forEach(id=>{const el=document.getElementById(id); if(el)el.value="";});
    render();   // re-render para resetear también las flechas de los headers
  };
  // Orden por columna: clic cicla desc -> asc -> sin orden (default fecha ↓)
  document.querySelectorAll("#main th[data-sortk]").forEach(th=>{
    th.onclick=()=>{
      const k=th.dataset.sortk;
      if(f.sortKey!==k){ f.sortKey=k; f.sortDir="desc"; }
      else if(f.sortDir==="desc"){ f.sortDir="asc"; }
      else { f.sortKey=""; f.sortDir=""; }   // tercer clic: sin flecha
      render();   // reconstruye headers (flechas) + filas + KPIs
    };
  });
  renderDocRows(tipo);
}


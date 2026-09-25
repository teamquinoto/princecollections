/* v96: textos para mostrar la bóveda con el mismo formato que el resto de los movimientos */
(function(){ try{
  Object.assign(I18N.en, { "mov.ref.vault":"Investment vault", "mov.ref.vault.to":"Moved to the vault", "mov.ref.vault.from":"Returned from the vault" });
  Object.assign(I18N.es, { "mov.ref.vault":"Bóveda de inversión", "mov.ref.vault.to":"Pasó a la bóveda", "mov.ref.vault.from":"Volvió de la bóveda" });
}catch(e){} })();
/* ============================================================
   VISTA: Movimientos
   ============================================================ */
function viewMov(){
  const sagas = sagasUnicas();
  const stores = effectiveStores();
  const movs = db.movimientos.filter(m=> !m.store || stores.includes(m.store));
  const showStore = allowedStores().length>1;
  return `
  <div class="head">
    <div class="title"><h2>${t("mov.title")}</h2><p>${t("mov.subtitle")}</p></div>
    <div class="actions">${puedeAjustar()?`<button class="btn" data-adjust>${ICO.adjust}${t("mov.adjustbtn")}</button>`:""}</div>
  </div>
  <div class="panel">
    <div class="phead"><h3>${t("mov.kardex")}</h3><span class="hint" id="movCount">${movs.length} ${t("mov.entries")}</span></div>
    ${movs.length ? `
    <div class="filtros compact">
      <input class="inp" id="mq" placeholder="${t("mov.search")}" value="${esc(movFiltros.q)}">
      <select class="inp" id="mtipo">
        <option value="" ${movFiltros.tipo===""?"selected":""}>${t("mov.anytype")}</option>
        <option value="entrada" ${movFiltros.tipo==="entrada"?"selected":""}>${t("mov.opt.entries")}</option>
        <option value="salida" ${movFiltros.tipo==="salida"?"selected":""}>${t("mov.opt.exits")}</option>
        <option value="ajuste" ${movFiltros.tipo==="ajuste"?"selected":""}>${t("mov.opt.adjustments")}</option>
        <option value="inv" ${movFiltros.tipo==="inv"?"selected":""}>${t("mov.opt.investments")}</option>
      </select>
      <select class="inp" id="msaga">
        <option value="">${t("dash.f.alllines")}</option>
        ${sagas.map(s=>`<option value="${esc(s)}" ${movFiltros.saga===s?"selected":""}>${esc(s)}</option>`).join("")}
      </select>
      <span class="fdate">${t("mov.from")}<input class="inp" id="mdesde" type="date" value="${esc(movFiltros.desde)}"></span>
      <span class="fdate">${t("mov.to")}<input class="inp" id="mhasta" type="date" value="${esc(movFiltros.hasta)}"></span>
      <input class="inp-range inp num" id="mvmin" placeholder="${t("mov.minval")}" value="${esc(movFiltros.vmin)}">
      <input class="inp-range inp num" id="mvmax" placeholder="${t("mov.maxval")}" value="${esc(movFiltros.vmax)}">
      <button class="btn ghost sm" id="mclear">${t("dash.f.clear")}</button>
    </div>
    <div class="table-scroll"><table class="mov-tbl">
      <thead><tr>
        ${sortTh(movFiltros,"fecha",t("common.date"),"")}
        ${sortTh(movFiltros,"tipo",t("md.lbl.type"),"")}
        ${showStore?sortTh(movFiltros,"store",t("bar.society"),""):""}
        ${sortTh(movFiltros,"nombre",t("common.product"),"")}
        ${sortTh(movFiltros,"cant",t("fi.th.qty"),"r")}
        ${sortTh(movFiltros,"valor",t("fi.th.unitvalue"),"r")}
        ${sortTh(movFiltros,"ref",t("fi.th.source"),"")}
        <th id="movActTh" hidden></th>
      </tr></thead>
      <tbody id="movBody"></tbody></table></div>`
      : emptyState(t("mov.empty.title"),t("mov.empty.sub"))}
  </div>`;
}
function filtrarMovs(){
  const f=movFiltros;
  const stores=effectiveStores();
  const q=(f.q||"").trim().toLowerCase();
  const vmin=f.vmin!==""?parseNum(f.vmin):null, vmax=f.vmax!==""?parseNum(f.vmax):null;
  const out = db.movimientos.filter(m=>{
    if(m.store && !stores.includes(m.store)) return false;
    if(f.tipo){
      const isInv = m.tipo==="inv-out" || m.tipo==="inv-return";
      if(f.tipo==="inv"){ if(!isInv) return false; }
      else if(f.tipo==="entrada"){ if(m.tipo!=="entrada" && m.tipo!=="inv-return") return false; }
      else if(f.tipo==="salida"){ if(m.tipo!=="salida" && m.tipo!=="inv-out") return false; }
      else if(m.tipo!==f.tipo) return false;
    }
    if(q){ const hay=((m.nombre||"")+" "+(m.sku||"")+" "+(m.ref||"")).toLowerCase(); if(!hay.includes(q)) return false; }
    if(f.saga && sagaDe({nombre:m.nombre})!==f.saga) return false;
    const fch=(m.fecha||"").slice(0,10);
    if(f.desde && fch < f.desde) return false;
    if(f.hasta && fch > f.hasta) return false;
    const v=m.valorUnit||0;
    if(vmin!==null && v<vmin) return false;
    if(vmax!==null && v>vmax) return false;
    return true;
  });
  const signed = m => (m.delta!=null)?m.delta:(m.tipo==="entrada"?(m.cantidad||0):-(m.cantidad||0));
  const key=f.sortKey||"fecha";
  const dir=f.sortKey ? (f.sortDir==="asc"?1:-1) : -1;
  const valOf = m => {
    switch(key){
      case "tipo":   return String(m.tipo||"");
      case "nombre": return String(m.nombre||"");
      case "cant":   return signed(m);
      case "valor":  return m.valorUnit||0;
      case "ref":    return String(m.ref||"");
      case "store":  return String(storeName(m.store||"")||"");   // Society
      case "fecha":
      default:       return String(m.fecha||"");
    }
  };
  out.sort((a,b)=>{
    const va=valOf(a), vb=valOf(b);
    if(typeof va==="number") return dir*(va-vb);
    return dir*va.localeCompare(vb,"en",{numeric:true});
  });
  return out;
}
/* Origen legible y en el idioma actual. El texto guardado en m.ref quedó en el
   idioma que tenía la app al registrarse ("Sale 121 · kevin reid", "Ajuste · rotura"),
   así que lo reconstruimos desde refTipo/tipo para que siempre salga traducido:
     venta/compra → "Venta #121" (abre la factura) + contraparte en gris
     bóveda       → "→ Bóveda de inversión" + observación
     ajuste       → "Ajuste" / "Saldo inicial" + motivo
   Lo que no reconoce se muestra tal cual. */
function movOrigenHTML(m){
  const raw = String(m.ref||"");
  const sub = x => x ? `<div class="mv-sub" title="${esc(x)}">${esc(x)}</div>` : "";
  const main = x => `<span class="mv-reftxt">${esc(x)}</span>`;
  if((m.refTipo==="venta"||m.refTipo==="compra") && m.refId){
    const mm = /^(?:Sale|Purchase|Venta|Compra)\s*([^·]*?)\s*(?:·\s*(.*))?$/.exec(raw) || [];
    // smartCase sólo para MOSTRAR: el texto guardado del kardex no se modifica
    const num = (mm[1]||"").trim(), quien = nombreVis(mm[2]);
    const kind = m.refTipo==="venta" ? t("mov.ref.sale") : t("mov.ref.purchase");
    return `<button type="button" class="mv-doc" data-verdoc="${m.refTipo}:${esc(m.refId)}">${esc(kind)}${num?` #${esc(num)}`:""}</button>` + sub(quien);
  }
  // v96: la bóveda se ve igual que una venta/compra: nombre en azul (abre Inversiones) + detalle en gris
  if(m.tipo==="inv-out" || m.tipo==="inv-return")
    return `<button type="button" class="mv-doc" data-goinv>${esc(t("mov.ref.vault"))}</button>` +
           sub(m.obs || t(m.tipo==="inv-out" ? "mov.ref.vault.to" : "mov.ref.vault.from"));
  if(m.refTipo==="ajuste"){
    const esApertura = [I18N.en["prod.obs.opening"], I18N.es["prod.obs.opening"]].includes(raw);
    return main(esApertura ? t("prod.obs.opening") : t("mov.ref.adjust")) + sub(esApertura ? "" : m.obs);
  }
  return raw ? main(raw) : `<span class="mv-sub">—</span>`;
}
function renderMovRows(){
  const body=document.getElementById("movBody"); if(!body) return;
  const all=filtrarMovs();
  const list=all.slice(0,400);
  const showStore = allowedStores().length>1;
  // la columna de acciones (borrar ajuste) sólo existe si hay algún ajuste en pantalla
  const hayAcciones = list.some(m=> m.tipo==="ajuste");
  const th = document.getElementById("movActTh"); if(th) th.hidden = !hayAcciones;
  const cols = (showStore?7:6) + (hayAcciones?1:0);
  body.innerHTML = list.map(m=>{
    const isAdj=m.tipo==="ajuste";
    const isInv=m.tipo==="inv-out"||m.tipo==="inv-return";
    const signed=(m.delta!=null)?m.delta:(m.tipo==="entrada"?m.cantidad:-m.cantidad);
    const up=signed>=0;
    const d=new Date(m.fecha);
    const fechaTxt=fmtDate(isoLocal(d)), horaTxt=fmtHora(d);
    const pill=isInv?`<span class="pill vault">${m.tipo==="inv-out"?ICO.vault+t("mov.tovault"):ICO.vault+t("mov.fromvault")}</span>`
               :isAdj?`<span class="pill adj">${ICO.adjust}${t("mov.adjust")}</span>`
               :`<span class="pill ${up?'in':'out'}">${up?ICO.arrowIn+t("mov.in"):ICO.arrowOut+t("mov.out")}</span>`;
    const deltaCls=isAdj?"flat":(up?'up':'down');
    const accion=isAdj?`<button class="u-alert btn ghost sm" data-delaj="${m.id}" title="${t("mov.deladjust")}">${ICO.trash}</button>`:"";
    return `<tr>
      <td class="mv-date">${fechaTxt}<span>${horaTxt}</span></td>
      <td>${pill}</td>
      ${showStore?`<td class="mv-soc">${esc(storeName(m.store))}</td>`:""}
      <td class="mv-prod"><div class="mv-name" title="${esc(m.nombre)}">${esc(m.nombre)}</div><div class="mv-sku">${esc(m.sku||"—")}</div></td>
      <td class="r delta ${deltaCls}">${up?'+':'−'}${qty(Math.abs(signed))}</td>
      <td class="r num">${money(m.valorUnit)}</td>
      <td class="mv-ref">${movOrigenHTML(m)}</td>
      ${hayAcciones?`<td class="r mv-act">${accion}</td>`:""}
    </tr>`;
  }).join("") || `<tr><td class="u-center u-muted u-p5" colspan="${cols}">${t("mov.nomatch")}</td></tr>`;
  const cnt=document.getElementById("movCount");
  const totalF=db.movimientos.filter(m=>!m.store||effectiveStores().includes(m.store)).length;
  if(cnt) cnt.textContent = (all.length===totalF?`${totalF} ${t("mov.entries")}`:t("mov.showing",{n:all.length,total:totalF}))+(list.length<all.length?t("mov.cap400"):"");
  body.querySelectorAll("[data-delaj]").forEach(b=> b.onclick=()=> deleteAjuste(b.dataset.delaj));
  body.querySelectorAll("[data-verdoc]").forEach(b=> b.onclick=()=>{ const [tp,id]=b.dataset.verdoc.split(":"); verDoc(tp,id); });
  body.querySelectorAll("[data-goinv]").forEach(b=> b.onclick=()=> setView("inv"));
}
function wireMovFiltros(){
  if(!document.getElementById("movBody")) return;
  const upd=(k,el)=>{ movFiltros[k]=el.value; renderMovRows(); };
  document.getElementById("mq").oninput=e=>upd("q",e.target);
  document.getElementById("mtipo").onchange=e=>upd("tipo",e.target);
  document.getElementById("msaga").onchange=e=>upd("saga",e.target);
  document.getElementById("mdesde").onchange=e=>upd("desde",e.target);
  document.getElementById("mhasta").onchange=e=>upd("hasta",e.target);
  document.getElementById("mvmin").oninput=e=>upd("vmin",e.target);
  document.getElementById("mvmax").oninput=e=>upd("vmax",e.target);
  document.getElementById("mclear").onclick=()=>{
    movFiltros={ q:"", desde:"", hasta:"", tipo:"", saga:"", vmin:"", vmax:"", sortKey:"", sortDir:"" };
    render();   // resetea inputs + flechas
  };
  // Orden por columna: desc -> asc -> sin flecha
  document.querySelectorAll("#main th[data-sortk]").forEach(th=>{
    th.onclick=()=>{
      const k=th.dataset.sortk;
      if(movFiltros.sortKey!==k){ movFiltros.sortKey=k; movFiltros.sortDir="desc"; }
      else if(movFiltros.sortDir==="desc"){ movFiltros.sortDir="asc"; }
      else { movFiltros.sortKey=""; movFiltros.sortDir=""; }
      render();
    };
  });
  renderMovRows();
}
/* Borrar un ajuste manual: revierte su efecto en el stock de SU sociedad y en las
   capas FIFO, y saca el asiento. Antes sólo tocaba el espejo p.stock (que se
   recalcula desde stockPorTienda), así que el borrado no revertía nada real.
   TRABA: si el ajuste sumó unidades que ya se usaron (vendidas / movidas), no se
   puede borrar — dejaría stock negativo. Mismo criterio que las compras. */
function deleteAjuste(id){
  const m=db.movimientos.find(x=>x.id===id && x.tipo==="ajuste"); if(!m) return;
  const p=prodById(m.productoId);
  const d=(m.delta!=null)?m.delta:0;
  const store = m.store || STORE_IDS[0];
  if(p){
    const cur = stockDe(p, store);
    let libres = cur;
    if(d>0 && m.refId){   // ajustes nuevos: su capa está marcada con el refId del movimiento
      const quedan = fifoLayers(p, store).filter(L=> L.refId===m.refId).reduce((a,L)=>a+(L.cantidad||0),0);
      libres = Math.min(quedan, cur);
    }
    if(d>0 && libres < d-0.0001){
      toast(t("mov.lock.tt"),"warn");
      alert(t("mov.lock.adj",{name:p.nombre, store:storeName(store), n:qty(d), used:qty(round4(d-libres))}));
      return;
    }
  }
  const msg = p
    ? t("mov.cf.deladj",{name:p.nombre, delta:(d>=0?'+':'−')+qty(Math.abs(d)), from:qty(stockDe(p,store)), to:qty(round4(stockDe(p,store)-d))})
    : t("mov.cf.deladj.gone");
  if(!confirm(msg)) return;
  if(p){
    if(d>0){
      if(m.refId && fifoLayers(p, store).some(L=> L.refId===m.refId)) fifoQuitarCompra(p, store, m.refId);   // saca exactamente su capa
      else fifoConsumir(p, store, d);                                                                     // ajuste viejo sin vínculo
    } else if(d<0){
      if(Array.isArray(m.consumed) && m.consumed.length) fifoDevolver(p, store, m.consumed);             // repone las capas exactas
      else fifoEntrada(p, store, -d, m.valorUnit||p.ultimoCosto||0, "revert", null);                    // ajuste viejo
    }
    p.stockPorTienda[store] = round4(stockDe(p, store) - d);
    recalcStockMirror(p);
  }
  db.movimientos = db.movimientos.filter(x=>x.id!==id);
  save(); toast(t("mov.toast.deleted"),"warn"); render();
}

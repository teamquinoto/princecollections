/* ============================================================
   PAPELERA (v96) — sólo admin
   ------------------------------------------------------------
   Todo lo que se borra queda guardado en el servidor (tabla
   `papelera`, que no se puede editar ni borrar). Acá se ve y se
   restaura. Restaurar una venta o una compra vuelve a mover el
   stock (lo calcula el servidor, con el mismo FIFO de siempre).
   Los ajustes y los borrados masivos son de sólo lectura.
   ============================================================ */
(function(){
  const EN = {
    "pap.title":"Trash", "pap.hint":"Admin only",
    "pap.sub":"Everything that gets deleted (sales, purchases, customers, products, adjustments) is kept here. You can see it and, in most cases, restore it.",
    "pap.open":"Open trash", "pap.loading":"Loading…", "pap.empty":"The trash is empty.",
    "pap.err":"Couldn't load the trash", "pap.note":"Showing the latest 200 items.",
    "pap.f.all":"All", "pap.th.date":"Date", "pap.th.what":"What", "pap.th.who":"Who", "pap.th.why":"Reason",
    "pap.t.ventas":"Sale", "pap.t.compras":"Purchase", "pap.t.clientes":"Customer", "pap.t.productos":"Product",
    "pap.t.movimientos":"Adjustment", "pap.t.varios":"Bulk delete",
    "pap.st.inapp":"Back in the app", "pap.st.readonly":"Read only",
    "pap.btn.view":"View", "pap.btn.hide":"Hide", "pap.btn.restore":"Restore",
    "pap.cf.restore":"Restore {what}?\n\nIf it's a sale or a purchase, stock will move again.",
    "pap.tt.ok":"Restored", "pap.tt.conflict":"First resolve the sync conflict (in Data).",
    "pap.tt.dirty":"There are unsynced changes: wait until it says Synced and try again.",
    "pap.big":"(too large to show)", "pap.nodet":"No details."
  };
  const ES = {
    "pap.title":"Papelera", "pap.hint":"Sólo admin",
    "pap.sub":"Todo lo que se borra (ventas, compras, clientes, productos, ajustes) queda guardado acá. Podés verlo y, en la mayoría de los casos, restaurarlo.",
    "pap.open":"Abrir papelera", "pap.loading":"Cargando…", "pap.empty":"La papelera está vacía.",
    "pap.err":"No se pudo cargar la papelera", "pap.note":"Se muestran los últimos 200 registros.",
    "pap.f.all":"Todo", "pap.th.date":"Fecha", "pap.th.what":"Qué", "pap.th.who":"Quién", "pap.th.why":"Motivo",
    "pap.t.ventas":"Venta", "pap.t.compras":"Compra", "pap.t.clientes":"Cliente", "pap.t.productos":"Producto",
    "pap.t.movimientos":"Ajuste", "pap.t.varios":"Borrado masivo",
    "pap.st.inapp":"Ya está en la app", "pap.st.readonly":"Sólo lectura",
    "pap.btn.view":"Ver", "pap.btn.hide":"Ocultar", "pap.btn.restore":"Restaurar",
    "pap.cf.restore":"¿Restaurar {what}?\n\nSi es una venta o una compra, el stock se vuelve a mover.",
    "pap.tt.ok":"Restaurado", "pap.tt.conflict":"Primero resolvé el conflicto de sincronización (en Datos).",
    "pap.tt.dirty":"Hay cambios sin sincronizar: esperá a que diga Sincronizado y probá de nuevo.",
    "pap.big":"(demasiado grande para mostrar)", "pap.nodet":"Sin detalle."
  };
  try{ Object.assign(I18N.en, EN); Object.assign(I18N.es, ES); }catch(e){ console.warn("papelera i18n", e); }
})();

let _papItems = [];
let _papFiltro = "all";
let _papAbierto = null;
const PAP_RESTAURABLE = ["ventas","compras","clientes","productos"];

function papDoc(it){ try{ return it.doc ? JSON.parse(it.doc) : null; }catch(e){ return null; } }
function papFecha(ts){
  try{ const d=new Date(ts); return d.toLocaleString(lang()==="es"?"es-AR":"en-US",{ day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
  catch(e){ return ts||""; }
}
function papTipo(col){ return t("pap.t."+col) || col; }
function papDesc(it){
  const d = papDoc(it);
  if(it.coleccion==="varios") return esc(it.motivo||"");
  if(!d) return `<span class="hint">${t("pap.big")}</span>`;
  if(it.coleccion==="ventas" || it.coleccion==="compras"){
    return `${esc(d.numero?("#"+d.numero):"")} ${esc(typeof nombreVis==="function" ? nombreVis(d.contraparte||"") : (d.contraparte||""))} · <b class="num">${money(d.total||0)}</b>`;
  }
  if(it.coleccion==="clientes") return esc(d.nombre||d.id);
  if(it.coleccion==="productos") return `<span class="sku">${esc(d.sku||"")}</span> ${esc(d.nombre||"")}`;
  if(it.coleccion==="movimientos") return `${esc(d.nombre||"")} · ${d.delta>0?"+":""}${esc(String(d.delta||0))}`;
  return esc(it.doc_id||"");
}
function papDetalle(it){
  const d = papDoc(it);
  if(!d) return `<p class="u-m0 hint">${t("pap.big")}</p>`;
  if(Array.isArray(d.lineas) && d.lineas.length){
    const rows = d.lineas.map(l=>`<tr><td><span class="sku">${esc(l.sku||"")}</span> ${esc(l.nombre||"")}</td><td class="r num">${qty(l.cantidad||0)}</td><td class="r num">${money(l.precio||0)}</td></tr>`).join("");
    return `<div class="table-scroll"><table><thead><tr><th>${t("common.product")}</th><th class="r">${t("cl.th.qty")}</th><th class="r">${t("cl.th.price")}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="u-m0 u-mt2 hint">${esc(fmtDate(d.fecha||""))}${d.vendedor?(" · "+esc(d.vendedor)):""}${d.medioPago?(" · "+esc(d.medioPago)):""}</p>`;
  }
  const campos = it.coleccion==="clientes" ? ["nombre","empresa","contacto","email","telefono","direccion","ciudad","estado","zip","pais"]
               : it.coleccion==="productos" ? ["sku","nombre","categoria","idioma","stock","ultimoCosto","precioVenta"]
               : it.coleccion==="movimientos" ? ["fecha","nombre","store","delta","valorUnit","ref","obs"] : [];
  const li = campos.filter(k=> d[k]!=null && d[k]!=="").map(k=>`<div><span class="hint">${esc(k)}:</span> ${esc(String(d[k]))}</div>`).join("");
  return li ? `<div style="display:grid;gap:3px;font-size:var(--fs-sm)">${li}</div>` : `<p class="u-m0 hint">${t("pap.nodet")}</p>`;
}

function papPintar(){
  const box = document.getElementById("papList"); if(!box) return;
  const items = _papFiltro==="all" ? _papItems : _papItems.filter(i=> i.coleccion===_papFiltro);
  if(!items.length){ box.innerHTML = `<p class="u-m0 u-mt3 u-mb3 hint">${t("pap.empty")}</p>`; return; }
  box.innerHTML = `<div class="table-scroll"><table>
    <thead><tr><th>${t("pap.th.date")}</th><th>${t("pap.th.what")}</th><th>${t("pap.th.who")}</th><th>${t("pap.th.why")}</th><th></th></tr></thead>
    <tbody>${items.map(it=>{
      const puede = PAP_RESTAURABLE.includes(it.coleccion) && !!it.doc;
      const estado = it.vigente ? `<span class="hint">${t("pap.st.inapp")}</span>`
                   : puede ? `<button class="btn sm" data-paprest="${it.id}">${ICO.reset||""}${t("pap.btn.restore")}</button>`
                   : `<span class="hint">${t("pap.st.readonly")}</span>`;
      const abierto = _papAbierto===it.id;
      return `<tr>
        <td class="u-nowrap num">${esc(papFecha(it.ts))}</td>
        <td><b>${esc(papTipo(it.coleccion))}</b> ${papDesc(it)}</td>
        <td>${esc(it.actor||"")}</td>
        <td class="hint">${esc(it.motivo||"")}</td>
        <td class="u-nowrap u-right">
          ${it.coleccion!=="varios" ? `<button class="btn ghost sm" data-papver="${it.id}">${abierto?t("pap.btn.hide"):t("pap.btn.view")}</button>` : ""}
          ${estado}
        </td></tr>
        ${abierto ? `<tr><td colspan="5" style="background:var(--bg2, transparent)">${papDetalle(it)}</td></tr>` : ""}`;
    }).join("")}</tbody></table></div>
    <p class="u-m0 u-mt2 hint">${t("pap.note")}</p>`;
  box.querySelectorAll("[data-papver]").forEach(b=> b.onclick=()=>{ const id=+b.dataset.papver; _papAbierto = (_papAbierto===id)?null:id; papPintar(); });
  box.querySelectorAll("[data-paprest]").forEach(b=> b.onclick=()=> papRestaurar(+b.dataset.paprest));
}

async function papCargar(){
  const box = document.getElementById("papList"); if(box) box.innerHTML = `<p class="u-m0 u-mt3 u-mb3 hint">${t("pap.loading")}</p>`;
  try{
    const res = await apiFetch(apiBase()+"/papelera?limit=200", { headers: authHeaders() });
    if(res.status===401){ toast(t("core.tt.expired"),"warn"); closeModal(); forceLogout(); return; }
    const j = await res.json().catch(()=>({}));
    if(!res.ok){ if(box) box.innerHTML = `<div class="banner warn">${esc(t("pap.err"))}: ${esc(srvErrText(j,res.status))}</div>`; return; }
    _papItems = Array.isArray(j.items) ? j.items : [];
    papPintar();
  }catch(e){
    if(box) box.innerHTML = `<div class="banner warn">${esc(t("pap.err"))}: ${esc(e.message||"error")}</div>`;
  }
}

function openPapelera(){
  if(!isAdmin() || !session) return;
  _papAbierto = null;
  const tipos = ["all","ventas","compras","clientes","productos","movimientos","varios"];
  buildModal(t("pap.title"), `
    <p class="hint" style="margin:0 0 10px">${t("pap.sub")}</p>
    <div class="u-flex u-gap2 u-wrap u-mb3" id="papFiltros">
      ${tipos.map(k=>`<button class="btn sm ${_papFiltro===k?"primary":"ghost"}" data-papf="${k}">${k==="all"?t("pap.f.all"):esc(papTipo(k))}</button>`).join("")}
    </div>
    <div id="papList"></div>`,
    [{ label:t("common.close"), cls:"btn", act:closeModal }], true);
  document.querySelectorAll("[data-papf]").forEach(b=> b.onclick=()=>{
    _papFiltro = b.dataset.papf;
    document.querySelectorAll("[data-papf]").forEach(x=> x.className = "btn sm " + (x.dataset.papf===_papFiltro ? "primary" : "ghost"));
    papPintar();
  });
  papCargar();
}

async function papRestaurar(id){
  const it = _papItems.find(x=> x.id===id); if(!it) return;
  const d = papDoc(it);
  const que = papTipo(it.coleccion) + (d && d.numero ? (" #"+d.numero) : (d && d.nombre ? (" "+d.nombre) : ""));
  if(!confirm(t("pap.cf.restore",{ what:que }))) return;
  if(syncState==="conflict"){ toast(t("pap.tt.conflict"),"warn"); return; }
  if(syncMeta.dirty){
    await pushNow();
    if(syncMeta.dirty || syncState==="conflict"){ toast(t("pap.tt.dirty"),"warn"); return; }
  }
  try{
    const res = await apiFetch(apiBase()+"/papelera/restaurar", { method:"POST", headers: authHeaders(), body: JSON.stringify({ id }) });
    if(res.status===401){ toast(t("core.tt.expired"),"warn"); closeModal(); forceLogout(); return; }
    const j = await res.json().catch(()=>({}));
    if(!res.ok){ toast(srvErrText(j,res.status),"warn"); return; }
    // El servidor devuelve la base ya con el documento restaurado: la tomamos como la verdad.
    db = migrate(j.data); persistLocal();
    syncMeta.syncedRev = j.rev; syncMeta.dirty = false; saveSyncMeta(); setSyncState("idle");
    mostrarAvisosSrv(j);
    toast(t("pap.tt.ok"));
    render();
    papCargar();
  }catch(e){ toast(t("pap.err")+": "+(e.message||"error"),"warn"); }
}

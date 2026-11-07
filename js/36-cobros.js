/* ============================================================
   36 · COBROS: medio de cobro + cuenta bancaria de destino
   ------------------------------------------------------------
   - Configuración → General (admin): lista de cuentas donde entran
     los cobros (db.config.cuentasCobro = [{id, nombre, activa}]).
   - Venta: medio de cobro (obligatorio), referencia y, si el medio no
     es efectivo y hay cuentas cargadas, la cuenta de destino
     (doc.cuentaCobro = id · doc.cuentaCobroNombre = nombre al momento
     de la venta, para que un cambio de nombre no altere el historial).
   - Detalle de la venta, factura PDF y filtro en el listado de ventas.
   - Excel de cobros (botón en Ventas, admin): las ventas que se ven con los
     filtros aplicados, con medio, cuenta y referencia, más un resumen por
     cuenta y por medio para conciliar contra el banco.
   v146 (como en la otra app del grupo): el cobro se puede completar DESPUÉS
   (mercadería en consignación). Una venta sin medio queda "cobro pendiente" y se
   completa desde el detalle con "Registrar cobro".
   Prince usa sus PAYMENT_METHODS; no trae cuentas precargadas.
   ============================================================ */
(function(){
  const EN = {
    "cob.h":"Collection accounts",
    "cob.hint":"Bank accounts or wallets where you receive payments. When a sale is not paid in cash, the seller picks the account it went into.",
    "cob.ph.name":"e.g. Mercury USD · Galicia checking",
    "cob.add":"Add", "cob.empty":"No accounts yet. Until you add one, sales only ask for the payment method.",
    "cob.inactive":"inactive", "cob.n.active":"{n} active", "cob.n.active1":"1 active", "cob.disable":"Disable", "cob.enable":"Enable", "cob.del":"Delete",
    "cob.tt.dup":"There is already an account with that name", "cob.tt.empty":"Enter the account name",
    "cob.tt.inuse":"It has sales: it was disabled instead of deleted (history keeps its name)",
    "cob.l.account":"Deposited to", "cob.req":"· required",
    "cob.o.pick":"— pick the account —",
    "cob.err.account":"Choose the account the payment went into",
    "cob.err.method":"Choose the payment method",
    "cob.f.all":"All payments", "cob.f.methods":"Method", "cob.f.accounts":"Account",
    "cob.l.method":"Payment method", "cob.l.ref":"Payment reference", "cob.l.optional":"optional",
    "cob.ph.ref":"Transfer ID, last 4 digits…", "cob.o.select":"— select —",
    "cob.m.Cash":"Cash", "cob.m.Transfer":"Bank transfer", "cob.m.Mercado Pago":"Mercado Pago", "cob.m.Card":"Card",
    "cob.m.Check":"Check", "cob.m.Zelle":"Zelle", "cob.m.Wire / ACH":"Wire / ACH", "cob.m.Other":"Other",
    "cob.x.btn":"Collections Excel", "cob.x.tip":"Sales shown with the current filters, with payment method, account and reference",
    "cob.x.sh.sales":"Sales", "cob.x.sh.acc":"By account", "cob.x.sh.met":"By method",
    "cob.x.date":"Date", "cob.x.num":"Invoice #", "cob.x.client":"Customer", "cob.x.seller":"Seller", "cob.x.dep":"Warehouse",
    "cob.x.total":"Total", "cob.x.n":"Sales", "cob.x.none":"(no account)", "cob.x.nomet":"(not set)",
    "cob.x.title":"Collections", "cob.x.filters":"Filters: {f}", "cob.x.nofilters":"no filters",
    "cob.x.empty":"No sales to export with these filters", "cob.x.done":"Collections Excel exported ({n} sales)",
    "cob.x.noxlsx":"Couldn't load the Excel library (no internet?)",
    "cob.later":"· can be completed later", "cob.m.Crypto":"Crypto", "cob.m.Transfer":"Bank transfer",
    "cob.pend":"Payment pending", "cob.pend.tip":"No payment method yet: complete it from the sale (Record payment)",
    "cob.f.pend":"Payment pending ({n})", "cob.reg":"Record payment", "cob.reg.title":"Record payment · invoice {n}",
    "cob.reg.done":"Payment recorded", "cob.reg.hint":"Complete it when the money comes in (e.g. goods on consignment).",
    "cob.x.pend":"Pending"
  };
  const ES = {
    "cob.h":"Cuentas de cobro",
    "cob.hint":"Cuentas bancarias o billeteras donde reciben los cobros. Cuando una venta no es en efectivo, se elige a qué cuenta entró.",
    "cob.ph.name":"Ej.: Mercury USD · Galicia cuenta corriente",
    "cob.add":"Agregar", "cob.empty":"Todavía no hay cuentas. Mientras no cargues ninguna, la venta solo pide el medio de cobro.",
    "cob.inactive":"inactiva", "cob.n.active":"{n} activas", "cob.n.active1":"1 activa", "cob.disable":"Desactivar", "cob.enable":"Activar", "cob.del":"Eliminar",
    "cob.tt.dup":"Ya hay una cuenta con ese nombre", "cob.tt.empty":"Escribí el nombre de la cuenta",
    "cob.tt.inuse":"Tiene ventas: se desactivó en vez de borrarla (el historial conserva el nombre)",
    "cob.l.account":"Cuenta de destino", "cob.req":"· obligatorio",
    "cob.o.pick":"— elegí la cuenta —",
    "cob.err.account":"Elegí la cuenta donde entró el cobro",
    "cob.err.method":"Elegí el medio de cobro",
    "cob.f.all":"Todos los cobros", "cob.f.methods":"Medio", "cob.f.accounts":"Cuenta",
    "cob.l.method":"Medio de cobro", "cob.l.ref":"Referencia de pago", "cob.l.optional":"opcional",
    "cob.ph.ref":"ID de transferencia, últimos 4 dígitos…", "cob.o.select":"— elegí —",
    "cob.m.Cash":"Efectivo", "cob.m.Transfer":"Transferencia", "cob.m.Mercado Pago":"Mercado Pago", "cob.m.Card":"Tarjeta",
    "cob.m.Check":"Cheque", "cob.m.Zelle":"Zelle", "cob.m.Wire / ACH":"Wire / ACH", "cob.m.Other":"Otro",
    "cob.x.btn":"Excel de cobros", "cob.x.tip":"Las ventas que se ven con los filtros actuales, con medio, cuenta y referencia de cobro",
    "cob.x.sh.sales":"Ventas", "cob.x.sh.acc":"Por cuenta", "cob.x.sh.met":"Por medio",
    "cob.x.date":"Fecha", "cob.x.num":"N° factura", "cob.x.client":"Cliente", "cob.x.seller":"Vendedor", "cob.x.dep":"Depósito",
    "cob.x.total":"Total", "cob.x.n":"Ventas", "cob.x.none":"(sin cuenta)", "cob.x.nomet":"(sin cargar)",
    "cob.x.title":"Cobros", "cob.x.filters":"Filtros: {f}", "cob.x.nofilters":"sin filtros",
    "cob.x.empty":"No hay ventas para exportar con estos filtros", "cob.x.done":"Excel de cobros exportado ({n} ventas)",
    "cob.x.noxlsx":"No se pudo cargar la librería de Excel (¿sin internet?)",
    "cob.later":"· se puede completar después", "cob.m.Crypto":"Crypto", "cob.m.Transfer":"Transferencia bancaria",
    "cob.pend":"Cobro pendiente", "cob.pend.tip":"Todavía sin medio de cobro: completalo desde la venta (Registrar cobro)",
    "cob.f.pend":"Cobro pendiente ({n})", "cob.reg":"Registrar cobro", "cob.reg.title":"Registrar cobro · factura {n}",
    "cob.reg.done":"Cobro registrado", "cob.reg.hint":"Completalo cuando entra la plata (por ejemplo, mercadería en consignación).",
    "cob.x.pend":"Pendiente"
  };
  try{ Object.assign(I18N.en, EN); Object.assign(I18N.es, ES); }catch(e){ console.warn("cobros i18n", e); }
})();

/* Medios de cobro. Prince usa su PAYMENT_METHODS; Select usa esta lista.
   El valor guardado queda en inglés (estable); sólo se traduce la etiqueta. */
const COB_METODOS_DEF = ["Cash", "Transfer", "Mercado Pago", "Card", "Check", "Zelle", "Wire / ACH", "Other"];
function cobroMetodos(){ return (typeof PAYMENT_METHODS!=="undefined") ? PAYMENT_METHODS : COB_METODOS_DEF; }
function cobroLabel(m){
  if(typeof payLabel==="function" && typeof PAYMENT_METHODS!=="undefined") return payLabel(m);
  return (m && I18N.en["cob.m."+m]!=null) ? t("cob.m."+m) : (m||"");   // también los medios viejos (Cash, Zelle…)
}
function cobroEsEfectivo(m){ return /^(cash|efectivo)$/i.test(String(m||"").trim()); }
/* v94 · venta sin medio de cobro = cobro pendiente */
function cobroPendiente(d){ return !!d && d.tipo!=="compra" && !String(d.medioPago||"").trim(); }
function cobroPendienteHTML(d){ return cobroPendiente(d) ? ` <span class="pill cob-pend" title="${esc(t("cob.pend.tip"))}">${t("cob.pend")}</span>` : ""; }

/* ---------- Cuentas ---------- */
function cuentasCobro(){ return (db.config && Array.isArray(db.config.cuentasCobro)) ? db.config.cuentasCobro : []; }
function cuentasCobroActivas(){ return cuentasCobro().filter(c=> c && c.activa!==false); }
function cuentaCobroById(id){ return cuentasCobro().find(c=> c && c.id===id) || null; }
function cuentaCobroNombre(d){
  if(!d) return "";
  const c = d.cuentaCobro ? cuentaCobroById(d.cuentaCobro) : null;
  return (d.cuentaCobroNombre || (c && c.nombre) || "").trim();
}
/* Cuentas con medio asignado: en la venta, al elegir el medio sólo se ofrecen sus cuentas
   (las que no tienen medio sirven para cualquiera). En Prince no se precarga ninguna. */
const COB_CUENTAS_CLIENTE = [];   // Prince: sin cuentas precargadas (se cargan en Configuración)
function cobroSembrarCuentas(d){
  if(!d || !d.config || d.config.cuentasCobroV94) return false;
  if(!Array.isArray(d.config.cuentasCobro)) d.config.cuentasCobro = [];
  const L = d.config.cuentasCobro, norm = x=> String(x||"").trim().toLowerCase();
  COB_CUENTAS_CLIENTE.forEach(c=>{
    const ya = L.find(x=> norm(x.nombre)===norm(c.nombre));
    if(ya){ if(!ya.medio) ya.medio = c.medio; }
    else L.push({ id:_cobId(), nombre:c.nombre, medio:c.medio, activa:true });
  });
  d.config.cuentasCobroV94 = true;
  return true;
}
/* Cuentas que corresponden a un medio (las que no tienen medio asignado sirven para cualquiera). */
function cuentasDelMedio(medio, lista){
  lista = lista || cuentasCobroActivas();
  if(!medio) return lista;
  const conMedio = lista.filter(c=> c.medio===medio);
  return conMedio.length ? conMedio.concat(lista.filter(c=> !c.medio)) : lista;
}
function _cobUsada(id){ return (db.ventas||[]).some(v=> v && v.cuentaCobro===id); }
function _cobId(){ return "cta_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/* Tarjeta de Configuración → General (sólo admin). v138/v85: lista prolija con estado,
   contador de activas y el alta abajo, separada. */
function cuentasCobroCardHTML(extraClass){
  if(typeof isAdmin==="function" && !isAdmin()) return "";
  const lista = cuentasCobro(), act = lista.filter(c=> c.activa!==false).length;
  const filas = lista.length ? `<ul class="cfg-acc">${lista.map(c=>{
    const off = c.activa===false;
    return `<li class="${off?"off":""}">
      <span class="cfg-dot" aria-hidden="true"></span>
      <span class="cfg-name" title="${esc(c.nombre)}">${esc(c.nombre)}</span>
      ${c.medio?`<span class="cfg-tag">${esc(cobroLabel(c.medio))}</span>`:""}
      ${off?`<span class="cfg-tag">${t("cob.inactive")}</span>`:""}
      <span class="cfg-acts">
        <button type="button" class="btn sm ghost" data-cob-toggle="${esc(c.id)}">${off?ICO.check+t("cob.enable"):ICO.x+t("cob.disable")}</button>
        <button type="button" class="btn sm ghost" data-cob-del="${esc(c.id)}" title="${t("cob.del")}" aria-label="${t("cob.del")}">${(typeof ICO!=="undefined" && ICO.trash) || "✕"}</button>
      </span>
    </li>`;
  }).join("")}</ul>` : `<p class="cfg-empty">${t("cob.empty")}</p>`;
  return `<section class="panel cfg-card${extraClass?(" "+extraClass):""}">
    <div class="cfg-head"><div><h3>${t("cob.h")}</h3><p>${t("cob.hint")}</p></div>
      ${lista.length?`<span class="cfg-badge">${t(act===1?"cob.n.active1":"cob.n.active",{n:act})}</span>`:""}</div>
    ${filas}
    <div class="cfg-add">
      <input class="inp" id="cob_new" placeholder="${t("cob.ph.name")}" maxlength="80" autocomplete="off" aria-label="${t("cob.ph.name")}">
      <button type="button" class="btn" data-cob-add>${(typeof ICO!=="undefined" && ICO.plus) || ""}${t("cob.add")}</button>
    </div>
  </section>`;
}
function _cobGuardarYRefrescar(){ save(); if(typeof render==="function") render(); }
/* Delegación: no hace falta tocar el wire() de cada vista. */
document.addEventListener("click", e=>{
  const add = e.target.closest && e.target.closest("[data-cob-add]");
  const tog = e.target.closest && e.target.closest("[data-cob-toggle]");
  const del = e.target.closest && e.target.closest("[data-cob-del]");
  if(!add && !tog && !del) return;
  if(typeof isAdmin==="function" && !isAdmin()) return;
  if(!Array.isArray(db.config.cuentasCobro)) db.config.cuentasCobro = [];
  const L = db.config.cuentasCobro;
  if(add){
    const inp = document.getElementById("cob_new");
    const nom = ((inp && inp.value) || "").trim().slice(0,80);
    if(!nom){ toast(t("cob.tt.empty"),"warn"); if(inp) inp.focus(); return; }
    if(L.some(c=> (c.nombre||"").trim().toLowerCase()===nom.toLowerCase())){ toast(t("cob.tt.dup"),"warn"); return; }
    L.push({ id:_cobId(), nombre:nom, activa:true });
    _cobGuardarYRefrescar(); return;
  }
  if(tog){ const c = L.find(x=>x.id===tog.dataset.cobToggle); if(c){ c.activa = (c.activa===false); _cobGuardarYRefrescar(); } return; }
  if(del){
    const id = del.dataset.cobDel, c = L.find(x=>x.id===id); if(!c) return;
    if(_cobUsada(id)){ c.activa=false; toast(t("cob.tt.inuse")); }
    else db.config.cuentasCobro = L.filter(x=>x.id!==id);
    _cobGuardarYRefrescar();
  }
});
document.addEventListener("keydown", e=>{
  if(e.key==="Enter" && e.target && e.target.id==="cob_new"){ e.preventDefault(); const b=document.querySelector("[data-cob-add]"); if(b) b.click(); }
});

/* ---------- Modal de venta ---------- */
/* Campos de cobro. conMedio=true (Select) agrega medio y referencia; en Prince ya existen. */
function cobroCamposVentaHTML(draft, conMedio, medioObligatorio){
  let h = "";
  if(conMedio){
    const ms = cobroMetodos();
    h += `<div class="field"><label>${t("cob.l.method")} <span class="hint" style="font-weight:400">${medioObligatorio?t("cob.req"):t("cob.later")}</span></label>
        <select class="inp" id="d_pago">
          <option value="" ${!draft.medioPago?"selected":""}>${t("cob.o.select")}</option>
          ${ms.map(m=>`<option value="${esc(m)}" ${m===draft.medioPago?"selected":""}>${esc(cobroLabel(m))}</option>`).join("")}
          ${(draft.medioPago && !ms.includes(draft.medioPago))?`<option value="${esc(draft.medioPago)}" selected>${esc(draft.medioPago)}</option>`:""}
        </select></div>
      <div class="field"><label>${t("cob.l.ref")} <span class="hint" style="font-weight:400">· ${t("cob.l.optional")}</span></label><input class="inp" id="d_ref" value="${esc(draft.refPago||"")}" placeholder="${t("cob.ph.ref")}" autocomplete="off" spellcheck="false"></div>`;
  }
  const act = cuentasCobroActivas();
  const actual = draft.cuentaCobro ? cuentaCobroById(draft.cuentaCobro) : null;
  if(act.length || actual){
    const base = (actual && actual.activa===false) ? [...act, actual] : act;
    const lista = cuentasDelMedio(draft.medioPago, base).concat((actual && !cuentasDelMedio(draft.medioPago, base).includes(actual)) ? [actual] : []);
    const oculto = cobroEsEfectivo(draft.medioPago) || !draft.medioPago;   // v94: sin medio (pendiente) no se pide cuenta
    h += `<div class="field" id="d_ctaWrap" style="${oculto?"display:none;":""}grid-column:1/-1"><label>${t("cob.l.account")} <span class="hint" style="font-weight:400">${t("cob.req")}</span></label>
        <select class="inp" id="d_cta">
          <option value="">${t("cob.o.pick")}</option>
          ${lista.map(c=>`<option value="${esc(c.id)}" ${c.id===draft.cuentaCobro?"selected":""}>${esc(c.nombre)}${c.activa===false?(" · "+t("cob.inactive")):""}</option>`).join("")}
        </select></div>`;
  }
  return h;
}
function cobroWireVenta(draft){
  const p=document.getElementById("d_pago"), r=document.getElementById("d_ref"), c=document.getElementById("d_cta"), w=document.getElementById("d_ctaWrap");
  if(p) p.addEventListener("change", ()=>{
    draft.medioPago=p.value; const sin = cobroEsEfectivo(p.value) || !p.value; if(w) w.style.display = sin ? "none" : "";
    if(sin){ draft.cuentaCobro=""; if(c) c.value=""; return; }
    if(c){   // v94: sólo las cuentas de ese medio; si hay una sola, queda elegida
      const ops = cuentasDelMedio(p.value);
      if(!ops.some(x=> x.id===draft.cuentaCobro)) draft.cuentaCobro = ops.length===1 ? ops[0].id : "";
      c.innerHTML = `<option value="">${t("cob.o.pick")}</option>` + ops.map(x=>`<option value="${esc(x.id)}" ${x.id===draft.cuentaCobro?"selected":""}>${esc(x.nombre)}</option>`).join("");
    }
  });
  if(r) r.addEventListener("input", ()=>{ draft.refPago=r.value; });
  if(c) c.addEventListener("change", ()=>{ draft.cuentaCobro=c.value; c.classList.remove("bad"); });
}
/* Validación al confirmar la venta. Devuelve true si se puede seguir. */
function cobroValidar(draft){
  if(!(draft.medioPago||"").trim()) return true;     // v94: sin medio = cobro pendiente (se completa después)
  if(!cobroEsEfectivo(draft.medioPago) && cuentasCobroActivas().length && !draft.cuentaCobro){
    toast(t("cob.err.account"),"warn");
    const e=document.getElementById("d_cta"); if(e){ e.classList.add("bad"); e.focus(); }
    return false;
  }
  return true;
}
/* Copia los datos del cobro del borrador al documento de venta. */
function cobroAplicarDoc(doc, draft){
  doc.medioPago = (draft.medioPago||"").trim();
  doc.refPago = (draft.refPago||"").trim();
  const c = (!cobroEsEfectivo(doc.medioPago) && draft.cuentaCobro) ? cuentaCobroById(draft.cuentaCobro) : null;
  doc.cuentaCobro = c ? c.id : "";
  doc.cuentaCobroNombre = c ? c.nombre : "";
}
/* Campos de cobro para editar/copiar una venta. */
function cobroDraftDesde(d){ return { medioPago:(d&&d.medioPago)||"", refPago:(d&&d.refPago)||"", cuentaCobro:(d&&d.cuentaCobro)||"" }; }

/* ---------- Detalle, PDF y filtros ---------- */
function cobroVerHTML(d, conMedio){
  const cta = cuentaCobroNombre(d);
  if(conMedio){
    if(!d.medioPago && !cta) return "";
    const txt = [d.medioPago?cobroLabel(d.medioPago):"", d.refPago||"", cta?("→ "+cta):""].filter(Boolean).join(" · ");
    return `<div class="totrow"><span style="color:var(--muted)">${t("cob.l.method")}</span><span>${esc(txt)}</span></div>`;
  }
  return cta ? `<div class="vd-f"><span class="vd-lbl">${t("cob.l.account")}</span><div>${esc(cta)}</div></div>` : "";
}
/* Texto en inglés para la factura (la factura va siempre en inglés). */
function cobroTextoPDF(d){
  const cta = cuentaCobroNombre(d);
  return [d.medioPago?cobroLabel(d.medioPago):"", d.refPago||"", cta?("Deposited to: "+cta):""].filter(Boolean).join(" · ");
}
function cobroFiltroHTML(f){
  const ventasVis = (typeof ventasVisibles==="function") ? ventasVisibles() : (db.ventas||[]);
  const ms=[...new Set(ventasVis.map(v=>v&&v.medioPago).filter(Boolean))].sort();
  const cs=cuentasCobro();
  const nPend = ventasVis.filter(cobroPendiente).length;
  if(!ms.length && !cs.length && !nPend) return "";
  return `<select class="inp" id="dcob" style="min-width:130px;max-width:190px">
    <option value="">${t("cob.f.all")}</option>
    ${nPend?`<option value="pend" ${f.cob==="pend"?"selected":""}>${t("cob.f.pend",{n:nPend})}</option>`:""}
    ${ms.length?`<optgroup label="${t("cob.f.methods")}">${ms.map(m=>`<option value="m:${esc(m)}" ${f.cob===("m:"+m)?"selected":""}>${esc(cobroLabel(m))}</option>`).join("")}</optgroup>`:""}
    ${cs.length?`<optgroup label="${t("cob.f.accounts")}">${cs.map(c=>`<option value="c:${esc(c.id)}" ${f.cob===("c:"+c.id)?"selected":""}>${esc(c.nombre)}</option>`).join("")}</optgroup>`:""}
  </select>`;
}
function cobroFiltroOk(d, f){
  if(!f || !f.cob) return true;
  if(f.cob==="pend") return cobroPendiente(d);
  if(f.cob.startsWith("m:")) return (d.medioPago||"")===f.cob.slice(2);
  if(f.cob.startsWith("c:")) return (d.cuentaCobro||"")===f.cob.slice(2);
  return true;
}

/* ============================================================
   EXCEL DE COBROS
   Hoja 1 "Ventas": una fila por venta (las mismas que muestra el listado con
   los filtros de búsqueda, fechas, vendedor y cobro), con medio, cuenta de
   destino y referencia. Hoja 2 "Por cuenta" y hoja 3 "Por medio": totales
   para conciliar contra el extracto. Mismo total que la tarjeta del listado.
   ============================================================ */
function cobroTotalVenta(d){
  if(d && d.total!=null) return round2(+d.total||0);
  return round2((d.lineas||[]).reduce((a,l)=> a + round2((l.cantidad||0)*(l.precio||0)), 0));
}
function cobrosExportExcel(){
  if(typeof libFalta==="function" && libFalta("xlsx", ()=> cobrosExportExcel(), ()=> toast(t("cob.x.noxlsx"),"warn"))) return;
  if(typeof XLSX==="undefined"){ toast(t("cob.x.noxlsx"),"warn"); return; }
  const list = (typeof filtrarDocs==="function") ? filtrarDocs("venta") : (db.ventas||[]);
  if(!list.length){ toast(t("cob.x.empty"),"warn"); return; }
  const conDep = (typeof storeDeVenta==="function") && STORE_IDS.length>1 && !STORES.some(s=> s.id==="akira");
  const sym = (typeof CCY_SYM!=="undefined") ? CCY_SYM : ((db.config && db.config.moneda) || "$");
  const MF = '"'+String(sym).replace(/"/g,"")+' "#,##0.00';
  // filtros activos (para el encabezado)
  const f = (typeof docFiltros!=="undefined" && docFiltros.venta) || {};
  const fx = [];
  if(f.q) fx.push('"'+f.q+'"');
  if(f.desde || f.hasta) fx.push((f.desde?fmtDate(f.desde):"…")+" → "+(f.hasta?fmtDate(f.hasta):"…"));
  if(f.vend) fx.push(f.vend==="__none" ? t("doc.o.house") : vendedorNombre(f.vend));
  if(f.cob) fx.push(f.cob==="pend" ? t("cob.pend") : f.cob.startsWith("m:") ? cobroLabel(f.cob.slice(2)) : ((cuentaCobroById(f.cob.slice(2))||{}).nombre||""));
  const head = [t("cob.x.date"), t("cob.x.num"), t("cob.x.client"), t("cob.x.seller")]
    .concat(conDep ? [t("cob.x.dep")] : [])
    .concat([t("cob.x.total"), t("cob.l.method"), t("cob.l.account"), t("cob.l.ref")]);
  const filas = list.slice().sort((a,b)=> String(a.fecha||"").localeCompare(String(b.fecha||""))).map(d=>{
    const r = [normISO(d.fecha)||d.fecha||"", d.numero||"", d.contraparte||((d.cliente&&d.cliente.nombre)||""), saleVendedorNombre(d)||""];
    if(conDep) r.push(storeName(storeDeVenta(d)));
    r.push(cobroTotalVenta(d), d.medioPago ? cobroLabel(d.medioPago) : t("cob.x.pend"), cuentaCobroNombre(d)||"", d.refPago||"");
    return r;
  });
  const iTot = conDep ? 5 : 4;
  const total = round2(filas.reduce((a,r)=> a + r[iTot], 0));
  const aoa = [[t("cob.x.title")+" — "+t("nav.ventas")], [t("cob.x.filters",{f: fx.length ? fx.join(" · ") : t("cob.x.nofilters")})], [], head]
    .concat(filas, [[], Object.assign(new Array(head.length).fill(""), { 0:t("common.total"), [iTot]:total })]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = head.map((h,i)=> ({ wch: i===2 ? 30 : (i===iTot ? 14 : (i>=iTot+1 ? 22 : 12)) }));
  for(let r=5; r<=aoa.length; r++){ const c = ws[XLSX.utils.encode_cell({ r:r-1, c:iTot })]; if(c && typeof c.v==="number") c.z = MF; }
  // resúmenes por cuenta y por medio
  const resumen = (keyFn, title)=>{
    const m = {};
    list.forEach(d=>{ const k = keyFn(d); const e = m[k] = m[k] || { n:0, v:0 }; e.n++; e.v = round2(e.v + cobroTotalVenta(d)); });
    const rows = Object.entries(m).sort((a,b)=> b[1].v - a[1].v).map(([k,e])=> [k, e.n, e.v]);
    const a = [[title], [], [title, t("cob.x.n"), t("cob.x.total")]].concat(rows, [[], [t("common.total"), list.length, total]]);
    const w = XLSX.utils.aoa_to_sheet(a);
    w["!cols"] = [{wch:30},{wch:10},{wch:16}];
    for(let r=4; r<=a.length; r++){ const c = w[XLSX.utils.encode_cell({ r:r-1, c:2 })]; if(c && typeof c.v==="number") c.z = MF; }
    return w;
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t("cob.x.sh.sales"));
  XLSX.utils.book_append_sheet(wb, resumen(d=> cuentaCobroNombre(d) || t("cob.x.none"), t("cob.l.account")), t("cob.x.sh.acc"));
  XLSX.utils.book_append_sheet(wb, resumen(d=> d.medioPago ? cobroLabel(d.medioPago) : t("cob.x.pend"), t("cob.l.method")), t("cob.x.sh.met"));
  const hoy = new Date(), iso = hoy.getFullYear()+"-"+String(hoy.getMonth()+1).padStart(2,"0")+"-"+String(hoy.getDate()).padStart(2,"0");
  XLSX.writeFile(wb, (lang()==="en" ? "collections-" : "cobros-")+iso+".xlsx");
  toast(t("cob.x.done",{n:list.length}));
}
/* Botón del listado de Ventas (delegación: no hace falta tocar el wire de la vista). */
function cobrosExcelBtnHTML(){
  return isAdmin() ? `<button type="button" class="btn" data-cob-xls title="${esc(t("cob.x.tip"))}">${ICO.xls}${t("cob.x.btn")}</button>` : "";
}
document.addEventListener("click", e=>{
  const b = e.target.closest && e.target.closest("[data-cob-xls]");
  if(b){ e.preventDefault(); cobrosExportExcel(); }
});

/* ============================================================
   v94 · REGISTRAR COBRO DESPUÉS
   Desde el detalle de una venta con cobro pendiente (o para corregirlo):
   medio, referencia y cuenta. No toca stock, montos ni comisiones.
   ============================================================ */
function cobroPuedeRegistrar(d){
  if(!d || d.tipo==="compra") return false;
  if(isAdmin()) return true;
  if(typeof isEditor==="function" && isEditor()) return (typeof storeDeVenta==="function" ? storeDeVenta(d) : d.store)==="select";
  if(typeof isSeller==="function" && isSeller()){
    const vid = (typeof currentVendedorId==="function" ? currentVendedorId() : "") || (session && session.vendedorId) || "";
    return !!vid && (d.vendedorId||"")===vid;
  }
  return false;
}
function openRegistrarCobro(id){
  const d = (db.ventas||[]).find(v=> v.id===id); if(!d || !cobroPuedeRegistrar(d)) return;
  const tmp = cobroDraftDesde(d);
  buildModal(t("cob.reg.title",{n:d.numero||"—"}), `
    <p class="hint" style="margin:0 0 14px">${t("cob.reg.hint")}</p>
    <div class="grid-form" style="grid-template-columns:1fr 1fr;padding:0">${cobroCamposVentaHTML(tmp, true, true)}</div>`, [
    {label:t("common.cancel"),cls:"btn",act:()=>{ closeModal(); if(typeof verDoc==="function") verDoc("venta", id); }},
    {label:t("cob.reg"),cls:"btn primary",act:()=>{
      if(!(tmp.medioPago||"").trim()){ toast(t("cob.err.method"),"warn"); const e=document.getElementById("d_pago"); if(e){ e.classList.add("bad"); e.focus(); } return; }
      if(!cobroValidar(tmp)) return;
      cobroAplicarDoc(d, tmp);
      save(); toast(t("cob.reg.done")); closeModal(); if(typeof render==="function") render(); if(typeof verDoc==="function") verDoc("venta", id);
    }}
  ]);
  cobroWireVenta(tmp);
  const p = document.getElementById("d_pago"); if(p) p.focus();
}
document.addEventListener("click", e=>{
  const b = e.target.closest && e.target.closest("[data-cob-reg]");
  if(b){ e.preventDefault(); openRegistrarCobro(b.getAttribute("data-cob-reg")); }
});

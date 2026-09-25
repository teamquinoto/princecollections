/* ============================================================
   MODAL: Documento (compra / venta) con editor de líneas
   ============================================================ */
let draft = null;  // { tipo, contraparte, fecha, numero, medioPago, lineas:[{key,productoId,sku,nombre,cantidad,precio}] }

/* Medios de cobro para la factura de venta (editable: agregá/quitá lo que uses).
   El valor guardado en la venta (doc.medioPago) es este mismo texto, así que
   si renombrás una opción las ventas viejas siguen mostrando el texto original. */
const PAYMENT_METHODS = ["Cash", "Card", "Zelle", "Wire / ACH", "Check", "PayPal", "Venmo", "Other"];
/* El valor guardado queda en inglés (estable); sólo se traduce la etiqueta. Valores libres/viejos se muestran tal cual. */
function payLabel(m){ return PAYMENT_METHODS.includes(m) ? t("pay.m."+m) : (m||""); }

function openDoc(tipo, pre){
  // Punto 3: un vendedor no puede cargar compras.
  if(tipo==="compra" && !puedeComprar()){ toast(t("md.err.admincompra"),"warn"); return; }
  draft = pre || {
    tipo, contraparte:"", fecha:isoLocal(new Date()),
    numero: tipo==="venta" ? nextFacturaVenta() : "",
    clienteId:"", envio:{ tipo:"free", monto:0 },
    handling:0, flete:0, medioPago:"", refPago:"",
    lineas:[ blankLine() ]
  };
  draft.tipo = tipo;
  if(draft.medioPago==null) draft.medioPago = "";
  if(draft.refPago==null) draft.refPago = "";
  if(!draft.envio) draft.envio = { tipo:"free", monto:0 };
  if(draft.handling==null) draft.handling = 0;
  if(draft.flete==null) draft.flete = 0;
  if(!Array.isArray(draft.costosExtra)) draft.costosExtra = [];
  if(!Array.isArray(draft.cargosCliente)) draft.cargosCliente = [];   // cargos on-top facturados al cliente, sólo ventas   // costos de venta (envío/horas/etc.), sólo ventas
  if(tipo==="compra"){
    // La compra elige SOCIEDAD (quién compra). Default: la sociedad en foco, o la primera.
    if(!draft.store || !STORE_IDS.includes(draft.store)){
      draft.store = (activeStore!=="all" && STORE_IDS.includes(activeStore)) ? activeStore : STORE_IDS[0];
    }
  } else {
    // La venta NO elige sociedad (pool unificado). Elige VENDEDOR (para la comisión).
    // Vendedor logueado => fijado a sí mismo. Admin => elige (o "— none —").
    if(isSeller()){
      draft.vendedorId = currentVendedorId() || "";
    } else if(draft.vendedorId===undefined){
      draft.vendedorId = "";   // admin arranca sin vendedor; lo elige en el combo
    }
  }
  renderDocModal();
}
function blankLine(){ return { key:uid(), productoId:"", sku:"", nombre:"", cantidad:1, precio:0, precioVentaSugerido:0, crear:false, margen:0, costoRef:0 }; }

function renderDocModal(){
  const isC = draft.tipo==="compra";
  const cli = clienteById(draft.clienteId);
  const clienteRow = isC ? "" : `
    <div class="u-span2 field">
      <label>${t("md.lbl.customer")} <span class="u-fw400 hint">${t("md.req")}</span></label>
      <button type="button" class="ppick-btn${cli?"":" placeholder"}" id="d_cli">
        <span class="ppick-label">${cli?esc(clienteLinea(cli)):t("md.pick.customer")}</span><span class="ppick-caret">▾</span>
      </button>
      ${cli?`<div class="u-fs-xs u-mt1 hint">${esc(clienteDireccion(cli)||cli.email||"")}</div>`:""}
      ${cli&&clienteIncompleto(cli)?`<div class="u-mt1 ferr fwarn">${ICO.warn} ${t("md.warn.cliinc.short")} <a href="#" id="d_clifix">${t("md.warn.cliinc.fix")}</a></div>`:""}
    </div>`;
  const allowSt = allowedStores();
  let topSel;
  if(isC){
    // COMPRA: elegir la sociedad que compra (procedencia del lote).
    topSel = (allowSt.length>1)
      ? `<div class="u-span2 field"><label>${t("md.lbl.society")} <span class="u-fw400 hint">${t("md.society.hint")}</span></label>
           <select class="inp" id="d_store">${allowSt.map(s=>`<option value="${s}" ${s===draft.store?"selected":""}>${esc(storeName(s))}</option>`).join("")}</select></div>`
      : `<div class="u-span2 field"><label>${t("md.lbl.society")}</label>
           <input class="inp" value="${esc(storeName(draft.store))}" disabled></div>`;
  } else {
    // VENTA: no se elige sociedad (pool unificado). Se elige VENDEDOR (para la comisión).
    if(isSeller()){
      topSel = `<div class="u-span2 field"><label>${t("md.lbl.seller")}</label>
           <input class="inp" value="${esc((session&&session.name)||vendedorNombre(draft.vendedorId))}" disabled></div>`;
    } else {
      const vends = vendedores();
      topSel = `<div class="u-span2 field"><label>${t("md.lbl.seller")} <span class="u-fw400 hint">${t("md.seller.hint")}</span></label>
           <select class="inp" id="d_vend">
             <option value="" ${!draft.vendedorId?"selected":""}>${t("md.none.house")}</option>
             ${vends.map(v=>`<option value="${esc(v.id)}" ${v.id===draft.vendedorId?"selected":""}>${esc(v.nombre)}</option>`).join("")}
           </select></div>`;
    }
  }
  const body = `
    <div class="u-cols2 u-p0 u-mb3 grid-form">${topSel}</div>
    ${isC?`<div class="u-between u-items-center banner ok">
      <span>${t("md.import.banner")}</span>
      <button class="u-nowrap btn sm" id="d_import">${ICO.importpdf}${t("doc.btn.import")}</button>
    </div>`:""}
    <div class="u-cols2 u-p0 u-mb3 grid-form">
      ${isC?`<div class="u-span2 field"><label>${t("md.lbl.supplier")}</label><input class="inp" id="d_cp" value="${esc(draft.contraparte)}"></div>`:clienteRow}
      <div class="field"><label>${t("common.date")}</label><input class="inp" type="date" id="d_fe" value="${esc(draft.fecha)}"></div>
      <div class="field"><label>${isC?t("md.lbl.docno"):t("md.lbl.invno")+' <span class="u-fw400 hint">'+t("md.invno.hint")+'</span>'}</label><input class="inp" id="d_nu" value="${esc(draft.numero)}"></div>
      ${isC?"":`<div class="field"><label>${t("md.pay.method")} <span class="u-fw400 hint">${t("md.req")}</span></label>
        <select class="inp" id="d_pago">
          <option value="" ${!draft.medioPago?"selected":""}>${t("md.pay.select")}</option>
          ${PAYMENT_METHODS.map(m=>`<option value="${esc(m)}" ${m===draft.medioPago?"selected":""}>${esc(payLabel(m))}</option>`).join("")}
          ${(draft.medioPago && !PAYMENT_METHODS.includes(draft.medioPago))?`<option value="${esc(draft.medioPago)}" selected>${esc(draft.medioPago)}</option>`:""}
        </select></div>
      <div class="field"><label>${t("md.pay.ref")} <span class="u-fw400 hint">${t("conj.l.optional")}</span></label><input class="inp" id="d_ref" value="${esc(draft.refPago||"")}" placeholder="${t("md.pay.ref.ph")}" autocomplete="off" spellcheck="false"></div>`}
    </div>
    <div id="lineHost"></div>
    <button class="u-mt3 btn sm" id="addLine">${ICO.plus}${t("md.btn.addline")}</button>
    ${isC?`
    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("md.h.addcosts")}</h3></div>
    <div class="u-cols2 u-p0 grid-form">
      <div class="field"><label>${t("md.lbl.handling")}</label><input class="inp num" id="d_hand" value="${draft.handling||0}"></div>
      <div class="field"><label>${t("md.lbl.flete")}</label><input class="inp num" id="d_flete" value="${draft.flete||0}"></div>
    </div>
    <p class="u-fs-xs u-m0 u-mt2 hint" id="d_proHint"></p>
    `:`
    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("md.h.custship")}</h3></div>
    <div class="grid-form" style="grid-template-columns:auto 1fr;padding:0;align-items:end">
      <div class="field"><label>${t("md.lbl.type")}</label>
        <select class="inp" id="d_envtipo">
          <option value="free" ${draft.envio.tipo==="free"?"selected":""}>${t("md.ship.free")}</option>
          <option value="monto" ${draft.envio.tipo==="monto"?"selected":""}>${t("md.ship.flat")}</option>
        </select>
      </div>
      <div class="field"><label>${t("md.lbl.shipcost")}</label><input class="inp num" id="d_envmonto" value="${draft.envio.monto||0}" ${draft.envio.tipo==="free"?"disabled":""}></div>
    </div>
    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("md.h.extra")} <span class="u-fw400 hint">${t("md.extra.hint")}</span></h3></div>
    <div id="cargoHost"></div>
    <button class="u-mt2 btn sm" id="addCargo">${ICO.plus}${t("md.btn.addcharge")}</button>
    ${isAdmin()?`
    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("md.h.selling")} <span class="u-fw400 hint">${t("md.selling.hint")}</span></h3></div>
    <div id="costHost"></div>
    <button class="u-mt2 btn sm" id="addCost">${ICO.plus}${t("md.btn.addcost")}</button>
    <div id="netBox"></div>`:""}`}
    <div id="docWarn"></div>
  `;
  const editing = !!draft.editingId;
  buildModal(
    isC?(editing?t("md.title.editpurchase"):t("md.title.newpurchase")):(editing?t("md.title.editsale"):t("md.title.newsale")), body,
    [
      {label:t("common.cancel"),cls:"btn",act:()=>{ draft.editingId=null; closeModal(); }},
      {label: editing?t("md.btn.savechanges") : (isC?t("md.btn.confirmpurchase"):t("md.btn.confirmsale")),cls:"btn primary",act:confirmDoc}
    ],
    "wide doc",
    `<div class="totrow"><span class="u-muted">${t("md.doctotal")}</span><span class="num" id="docTotal">${money(docTotal())}</span></div>`
  );
  renderLines();
  const dst=document.getElementById("d_store"); if(dst) dst.onchange=e=>{ draft.store=e.target.value; };
  const dvend=document.getElementById("d_vend"); if(dvend) dvend.onchange=e=>{ draft.vendedorId=e.target.value; refreshNet(); };
  const cp=document.getElementById("d_cp"); if(cp) cp.oninput=e=>draft.contraparte=e.target.value;
  document.getElementById("d_fe").oninput=e=>draft.fecha=e.target.value;
  document.getElementById("d_nu").oninput=e=>draft.numero=e.target.value;
  document.getElementById("addLine").onclick=()=>{ draft.lineas.push(blankLine()); renderLines(); refreshTotal(); };
  const imp=document.getElementById("d_import"); if(imp) imp.onclick=()=> openImport();
  if(isC){
    document.getElementById("d_hand").oninput=e=>{ draft.handling=parseNum(e.target.value); pintarProrateo(); };
    document.getElementById("d_flete").oninput=e=>{ draft.flete=parseNum(e.target.value); pintarProrateo(); };
    pintarProrateo();
  } else {
    document.getElementById("d_cli").onclick=(e)=> openClientePicker(e.currentTarget);
    const dfix=document.getElementById("d_clifix"); if(dfix) dfix.onclick=(e)=>{ e.preventDefault(); openClienteForm(draft.clienteId); };
    const dpago=document.getElementById("d_pago"); if(dpago) dpago.onchange=e=>{ draft.medioPago=e.target.value; };
    const dref=document.getElementById("d_ref"); if(dref) dref.oninput=e=>{ draft.refPago=e.target.value; };
    const et=document.getElementById("d_envtipo"), em=document.getElementById("d_envmonto");
    et.onchange=()=>{ draft.envio.tipo=et.value; em.disabled=(et.value==="free"); if(et.value==="free"){ draft.envio.monto=0; em.value=0; } refreshTotal(); };
    em.oninput=()=>{ draft.envio.monto=parseNum(em.value); refreshTotal(); };
    renderCargos();
    const acg=document.getElementById("addCargo"); if(acg) acg.onclick=()=>{ draft.cargosCliente.push(nuevaLineaCargo()); renderCargos(); refreshTotal(); };
    if(isAdmin()){
      renderCostos();
      const ac=document.getElementById("addCost"); if(ac) ac.onclick=()=>{ draft.costosExtra.push(nuevaLineaCosto()); renderCostos(); };
    }
  }
}
/* ============================================================
   COSTOS DE VENTA (portado de stockselect) — sólo admin
   Horas hombre se cargan como horas × valor hora y el sistema multiplica.
   El recuadro de neto es una ESTIMACIÓN en vivo (usa el último costo de cada
   línea como referencia); el número exacto (FIFO real) queda al confirmar.
   ============================================================ */
/* ---- Cargos on-top (portado de stockselect) ----
   Se cobran al cliente aparte del producto y el envío: suman al total y salen en la
   factura. Como la factura es SIEMPRE en inglés, el concepto se pide en inglés. */
function cargosClienteTotal(){ return round2(((draft&&draft.cargosCliente)||[]).reduce((a,c)=> a + (parseNum(c.monto)||0), 0)); }
function nuevaLineaCargo(){ return { key:uid(), nota:"", monto:0 }; }
function renderCargos(){
  const host=document.getElementById("cargoHost"); if(!host) return;
  draft.cargosCliente = draft.cargosCliente || [];
  host.innerHTML = draft.cargosCliente.length ? draft.cargosCliente.map((c,i)=>`
    <div class="grid-form" style="grid-template-columns:1fr auto auto;padding:0;gap:8px;align-items:end;margin-bottom:6px">
      <div class="field"><label>${t("md.lbl.concept")} <span class="u-fw400 hint">${t("md.charge.pdfhint")}</span></label><input class="inp" data-cgnota="${i}" value="${esc(c.nota||"")}" placeholder="${tEn("md.ph.charge")}"></div>
      <div class="field"><label>${t("md.lbl.amount",{cc:esc(monedaSym("USD"))})}</label><input class="inp num" data-cgmonto="${i}" value="${c.monto||0}" style="max-width:130px"></div>
      ${iconBtn(`data-cgdel="${i}"`, ICO.x, t("md.tt.remove"))}
    </div>`).join("") : `<p class="u-fs-xs u-m0 hint">${t("md.cargos.empty")}</p>`;
  host.querySelectorAll("[data-cgnota]").forEach(inp=>{
    inp.oninput=()=>{ draft.cargosCliente[+inp.dataset.cgnota].nota=inp.value; };
    // al salir del campo: primera letra en mayúscula (sale así en la factura)
    inp.onblur=()=>{ const v=capFirst(inp.value); if(v!==inp.value){ inp.value=v; draft.cargosCliente[+inp.dataset.cgnota].nota=v; } };
  });
  host.querySelectorAll("[data-cgmonto]").forEach(inp=> inp.oninput=()=>{ draft.cargosCliente[+inp.dataset.cgmonto].monto=parseNum(inp.value); refreshTotal(); });
  host.querySelectorAll("[data-cgdel]").forEach(b=> b.onclick=()=>{ draft.cargosCliente.splice(+b.dataset.cgdel,1); renderCargos(); refreshTotal(); });
}
function nuevaLineaCosto(){ return { key:uid(), tipo:"envio", nota:"", monto:0, horas:0, valorHora:0 }; }
function costosDraftTotal(){ return round2((draft.costosExtra||[]).reduce((a,c)=> a + (parseNum(c.monto)||0), 0)); }
/* Costo estimado de la línea: en una venta nueva, el FIFO real que consumiría hoy (peek, sin mutar);
   editando (sus unidades ya están consumidas) cae al costo de referencia de la línea. */
function draftCostoLinea(l){
  const q=parseNum(l.cantidad)||0, p=l.productoId?prodById(l.productoId):null;
  if(p && q>0 && !draft.editingId && typeof fifoCostoPeekGlobal==="function") return fifoCostoPeekGlobal(p, q).unit;
  return l.costoRef||0;
}
function draftGrossMargin(){ return (draft.lineas||[]).reduce((a,l)=> a + ((parseNum(l.precio)||0)-draftCostoLinea(l))*(parseNum(l.cantidad)||0), 0); }
function draftCommRate(){
  // Misma regla que al guardar: editando se respeta la tasa congelada; si no, la del vendedor (casa = 0%).
  if(draft.editingId){ const od=db.ventas.find(x=>x.id===draft.editingId); if(od && od.commissionRate!=null) return od.commissionRate; }
  const vid = isSeller() ? (currentVendedorId()||"") : (draft.vendedorId||"");
  return vid ? vendedorRate(vid) : 0;
}
/* Tarjeta "Rentabilidad estimada" (sólo admin, ventas).
   Una barra apilada muestra cómo se reparte lo que se cobra: costo de la
   mercadería, comisión, costos de venta y lo que queda (margen neto).
   Mismo criterio que el P&L: neto = margen de productos + envío cobrado
   + cargos on-top − comisión − costos de venta. */
function refreshNet(){
  const box=document.getElementById("netBox"); if(!box || !draft || draft.tipo!=="venta") return;
  const gm=round2(draftGrossMargin()), rate=draftCommRate(), comm=round2(gm*rate), cost=costosDraftTotal();
  const ship=(draft.envio && draft.envio.tipo==="monto") ? (parseNum(draft.envio.monto)||0) : 0, carg=cargosClienteTotal();
  const prodRev = round2((draft.lineas||[]).reduce((a,l)=> a + (parseNum(l.precio)||0)*(parseNum(l.cantidad)||0), 0));
  const cogs = round2(prodRev - gm);
  const ingresos = round2(prodRev + ship + carg);
  const net = round2(gm+ship+carg-comm-cost);
  if(!(ingresos>0) && !(cogs>0)){
    box.innerHTML = `<div class="netcard empty"><div class="nc-head"><span class="nc-title">${t("md.net.title")}</span></div>
      <div class="nc-bar"><span class="nc-seg" style="flex:1;background:var(--line)"></span></div>
      <p class="nc-empty">${t("md.net.empty")}</p></div>`;
    return;
  }
  // Segmentos de la barra. Si hay pérdida, la escala es el total de costos (no alcanza lo cobrado).
  const segs = [
    { k:"cogs", v:Math.max(0,cogs), lbl:t("md.net.cogs") },
    { k:"comm", v:Math.max(0,comm), lbl:t("md.net.comm2",{p:nf0.format(rate*100)}) },
    { k:"cost", v:Math.max(0,cost), lbl:t("md.net.costs2") },
    { k:"net",  v:Math.max(0,net),  lbl:t("md.net.net2") },
  ];
  const escala = Math.max(ingresos, segs.reduce((x,s)=>x+s.v,0)) || 1;
  const pct = ingresos>0 ? net/ingresos : null;
  const pctTxt = pct==null ? "—" : fmtPct(pct, 1);
  const bar = segs.filter(s=>s.v>0).map(s=>`<span class="nc-seg nc-${s.k}" style="flex:${s.v/escala}" title="${esc(s.lbl)}: ${money(s.v)}"></span>`).join("")
            + (net<0 ? `<span class="nc-seg nc-loss" style="flex:${Math.abs(net)/escala}" title="${t("md.net.loss")}: ${money(net)}"></span>` : "");
  const row = (k, lbl, v, neg)=> `<div class="nc-row"><span class="nc-dot nc-${k}"></span><span class="nc-lbl">${esc(lbl)}</span><span class="num">${neg&&v>0?"−":""}${money(v)}</span></div>`;
  const incDet = [ship>0?t("md.net.inc.ship",{v:money(ship)}):"", carg>0?t("md.net.inc.ontop",{v:money(carg)}):""].filter(Boolean).join(" · ");
  box.innerHTML = `<div class="netcard">
    <div class="nc-head">
      <span class="nc-title">${t("md.net.title")}</span>
      <span class="nc-pill ${net<0?"neg":(pct!=null&&pct<0.1?"low":"pos")}">${t("md.net.marginpct",{p:pctTxt})}</span>
    </div>
    <div class="nc-income"><span>${t("md.net.income")}${incDet?` <small>(${incDet})</small>`:""}</span><span class="num">${money(ingresos)}</span></div>
    <div class="nc-bar">${bar}</div>
    ${row("cogs", segs[0].lbl, cogs, true)}
    ${row("comm", segs[1].lbl, comm, true)}
    ${row("cost", segs[2].lbl, cost, true)}
    <div class="nc-total"><span class="nc-dot ${net<0?"nc-loss":"nc-net"}"></span><span class="nc-lbl">${net<0?t("md.net.loss"):t("md.net.net2")}</span><span class="num ${net<0?"neg":"pos"}">${money(net)}</span></div>
  </div>`;
}
function renderCostos(){
  const host=document.getElementById("costHost"); if(!host) return;
  draft.costosExtra = draft.costosExtra || [];
  const rows = draft.costosExtra.map((c,i)=>{
    const isLabor = c.tipo==="labor";
    const midCells = isLabor
      ? `<td><input class="inp num" data-ck="horas" data-ci="${i}" value="${c.horas||0}" placeholder="${t("md.ph.hs")}" title="${t("md.tt.hours")}" aria-label="${t("md.tt.hours")}"></td>
         <td><div class="u-flex u-items-center u-gap2"><span class="u-fs-xs hint">×</span><input class="inp num" style="width:110px" data-ck="valorHora" data-ci="${i}" value="${c.valorHora||0}" placeholder="${t("md.ph.rate")}" title="${t("md.tt.rate")}" aria-label="${t("md.tt.rate")}"><span class="u-fs-xs hint">${t("md.ph.rate")}</span></div></td>
         <td class="u-muted r num" data-csub="${i}">${money((parseNum(c.horas)||0)*(parseNum(c.valorHora)||0))}</td>`
      : `<td colspan="2"><input class="inp" data-ck="nota" data-ci="${i}" value="${esc(c.nota||"")}" placeholder="${t("md.ph.noteopt")}"></td>
         <td><input class="inp num" data-ck="monto" data-ci="${i}" value="${c.monto||0}"></td>`;
    return `<tr>
      <td><select class="inp" data-ck="tipo" data-ci="${i}">${COSTO_TIPOS.map(x=>`<option value="${x.id}" ${x.id===c.tipo?"selected":""}>${esc(costoTipoLabel(x.id))}</option>`).join("")}</select></td>
      ${midCells}
      <td>${iconBtn(`data-cdel="${i}"`, ICO.x, t("md.tt.remove"))}</td>
    </tr>`;
  }).join("");
  host.innerHTML = draft.costosExtra.length
    ? `<div class="table-scroll"><table class="line-tbl doc-tbl" style="table-layout:fixed;min-width:560px"><colgroup><col style="width:170px"><col style="width:84px"><col><col style="width:110px"><col style="width:40px"></colgroup><tbody>${rows}</tbody></table></div>`
    : `<p class="hint" style="margin:2px 0 0;font-size:var(--fs-xs)">${t("md.costos.empty")}</p>`;
  host.querySelectorAll("[data-ck]").forEach(inp=>{
    const i=+inp.dataset.ci, k=inp.dataset.ck;
    if(k==="nota") inp.addEventListener("blur", ()=>{ const v=capFirst(inp.value); if(v!==inp.value){ inp.value=v; if(draft.costosExtra[i]) draft.costosExtra[i].nota=v; } });
    const handler=()=>{
      const c=draft.costosExtra[i]; if(!c) return;
      if(k==="tipo"){ c.tipo=inp.value; if(c.tipo==="labor") c.monto=round2((parseNum(c.horas)||0)*(parseNum(c.valorHora)||0)); renderCostos(); return; }
      if(k==="nota"){ c.nota=inp.value; return; }
      c[k]=parseNum(inp.value);
      if(k==="horas"||k==="valorHora"){
        c.monto=round2((parseNum(c.horas)||0)*(parseNum(c.valorHora)||0));
        const sc=host.querySelector(`[data-csub="${i}"]`); if(sc) sc.textContent=money(c.monto);
      }
      refreshNet();
    };
    inp.oninput = handler;
    if(inp.tagName==="SELECT") inp.onchange = handler;
  });
  host.querySelectorAll("[data-cdel]").forEach(b=> b.onclick=()=>{ draft.costosExtra.splice(+b.dataset.cdel,1); renderCostos(); });
  refreshNet();
}
/* Unidades totales del documento (para prorratear costos adicionales). */
function unidadesDoc(){ return draft.lineas.reduce((a,l)=> a + (parseNum(l.cantidad)||0), 0); }
/* ---- Prorrateo de handling/flete (compras) ----
   Cada línea puede recibir o no su parte. Regla por defecto: una línea con costo
   $0 (playmat de regalo, merch) NO recibe; el resto sí. El usuario lo puede
   forzar con el botón del camión → queda guardado en l.sinProrrateo (true/false).
   Mientras no lo toque (undefined), manda la regla automática. */
function recibeProrrateo(l){
  if(l.sinProrrateo===true) return false;
  if(l.sinProrrateo===false) return true;
  return (parseNum(l.precio)||0) > 0;
}
function unidadesProrrateo(){ return draft.lineas.reduce((a,l)=> a + (recibeProrrateo(l) ? (parseNum(l.cantidad)||0) : 0), 0); }
function lineasExcluidas(){ return draft.lineas.filter(l=> (l.productoId||l.crear) && (parseNum(l.cantidad)||0)>0 && !recibeProrrateo(l)).length; }
function textoProrrateo(){
  const u=unidadesProrrateo(), extra=(draft.handling||0)+(draft.flete||0), x=lineasExcluidas();
  if(!(extra>0)) return t("md.pro.hint");
  if(!(u>0)) return t("md.pro.none");
  return t(x ? "md.pro.split.excl" : "md.pro.split", {total:money(extra), u:qty(u), per:money(extra/u), x});
}
/* Total del documento: líneas + envío (venta). En compra el handling/flete NO
   suma al total facturado por el proveedor si vino aparte, pero acá lo sumamos
   para reflejar el desembolso total. */
function docTotal(){
  const base = totalLineas(draft.lineas);
  if(draft.tipo==="compra") return round2(base + (draft.handling||0) + (draft.flete||0));
  return round2(base + (draft.envio && draft.envio.tipo==="monto" ? (draft.envio.monto||0) : 0) + cargosClienteTotal());
}
function pintarProrateo(){
  const h=document.getElementById("d_proHint"); if(!h) return;
  h.textContent = textoProrrateo();
  refreshTotal();
}

/* ============================================================
   AJUSTE DE INVENTARIO (movimiento tipo "ajuste")
   ============================================================ */
let adjDraft = null;
function openAjuste(prodId){
  if(!puedeAjustar()){ toast(t("md.err.adminajuste"),"warn"); return; }
  adjDraft = { productoId: prodId||"", store: effectiveStores()[0]||STORE_IDS[0], modo:"delta", cantidad:"", fecha:isoLocal(new Date()), obs:"" };
  renderAjuste();
}
function renderAjuste(){
  const p = prodById(adjDraft.productoId);
  const store = adjDraft.store;
  const opts = `<option value="">${t("md.aj.pickprod")}</option>` +
    db.productos.filter(x=>!soloEnVault(x)||isAdmin()).map(x=>`<option value="${x.id}" ${x.id===adjDraft.productoId?"selected":""}>${esc(x.sku?("["+x.sku+"] "):"")}${esc(x.nombre)}</option>`).join("");
  const stockActual = p ? qty(stockDe(p, store)) : "—";
  const allowSt = allowedStores();
  const storeSel = allowSt.length>1
    ? `<select class="inp" id="aj_store">${allowSt.map(s=>`<option value="${s}" ${s===store?"selected":""}>${esc(storeName(s))}</option>`).join("")}</select>`
    : `<input class="inp" value="${esc(storeName(store))}" disabled>`;
  let previewTxt = "";
  if(p && adjDraft.cantidad!=="" && !isNaN(+adjDraft.cantidad)){
    const cur = stockDe(p, store);
    const nuevo = adjDraft.modo==="recuento" ? +adjDraft.cantidad : cur+(+adjDraft.cantidad);
    const delta = nuevo-cur;
    const col = delta===0?"var(--muted)":(delta>0?"var(--up-ink)":"var(--down-ink)");
    previewTxt = `<div class="banner ${delta>=0?'ok':'warn'}" style="margin:2px 0 0">Stock: <b>${qty(cur)}</b> → <b>${qty(nuevo)}</b> <span style="color:${col}">(${delta>=0?'+':'−'}${qty(Math.abs(delta))})</span></div>`;
  }
  const body = `
    <div class="u-cols2 u-p0 u-mb2 grid-form">
      <div class="field"><label>${t("common.product")}</label>
        <select class="inp" id="aj_prod">${opts}</select>
      </div>
      <div class="field"><label>${t("md.lbl.society")}</label>${storeSel}
        ${p?`<div class="u-fs-xs u-muted u-mt1">${t("md.aj.stockline",{n:'<b class="num">'+stockActual+'</b>',cost:money(p.ultimoCosto)})}</div>`:""}
      </div>
      <div class="field"><label>${t("md.aj.type")}</label>
        <select class="inp" id="aj_modo">
          <option value="delta" ${adjDraft.modo==="delta"?"selected":""}>${t("md.aj.modo.delta")}</option>
          <option value="recuento" ${adjDraft.modo==="recuento"?"selected":""}>${t("md.aj.modo.count")}</option>
        </select>
      </div>
      <div class="field"><label>${adjDraft.modo==="recuento"?t("md.aj.countedstock"):t("md.aj.qty")}</label>
        <input class="inp num" id="aj_cant" type="number" step="any" value="${esc(adjDraft.cantidad)}" placeholder="0"></div>
      <div class="field"><label>${t("common.date")}</label><input class="inp" type="date" id="aj_fe" value="${esc(adjDraft.fecha)}"></div>
      <div class="field"><label>${t("md.aj.note")}</label><input class="inp" id="aj_obs" value="${esc(adjDraft.obs)}" placeholder="${t("md.aj.ph.note")}"></div>
    </div>
    <div id="aj_prev">${previewTxt}</div>
  `;
  buildModal(t("md.aj.title"), body, [
    {label:t("common.cancel"), cls:"btn", act:()=>{ adjDraft=null; closeModal(); }},
    {label:t("md.aj.record"), cls:"btn", act:confirmAjuste}
  ]);
  const sync=()=>{
    adjDraft.productoId=document.getElementById("aj_prod").value;
    const st=document.getElementById("aj_store"); if(st) adjDraft.store=st.value;
    adjDraft.modo=document.getElementById("aj_modo").value;
    adjDraft.cantidad=document.getElementById("aj_cant").value;
    adjDraft.fecha=document.getElementById("aj_fe").value;
    adjDraft.obs=document.getElementById("aj_obs").value;
  };
  document.getElementById("aj_prod").onchange=()=>{ sync(); renderAjuste(); };
  const st=document.getElementById("aj_store"); if(st) st.onchange=()=>{ sync(); renderAjuste(); };
  document.getElementById("aj_modo").onchange=()=>{ sync(); renderAjuste(); };
  document.getElementById("aj_cant").oninput=()=>{ sync(); renderAjuste(); document.getElementById("aj_cant").focus(); };
  document.getElementById("aj_obs").oninput=e=>adjDraft.obs=e.target.value;
  document.getElementById("aj_fe").oninput=e=>adjDraft.fecha=e.target.value;
}
function confirmAjuste(){
  const p = prodById(adjDraft.productoId);
  if(!p){ toast(t("md.err.pickprod"),"warn"); return; }
  const store = adjDraft.store || STORE_IDS[0];
  if(adjDraft.cantidad==="" || isNaN(+adjDraft.cantidad)){ toast(t("md.err.qtyvalid"),"warn"); return; }
  if(!adjDraft.obs.trim()){ toast(t("md.err.noterequired"),"warn"); return; }
  const cur = stockDe(p, store);
  const nuevo = adjDraft.modo==="recuento" ? +adjDraft.cantidad : cur+(+adjDraft.cantidad);
  const delta = +(nuevo-cur).toFixed(4);
  if(delta===0){ toast(t("md.err.nochange"),"warn"); return; }
  if(nuevo < 0){ toast(t("md.err.negative"),"warn"); alert(t("md.aj.alertneg",{n:qty(nuevo)})); return; }
  if(!confirm(t("md.aj.confirm",{prod:p.nombre,store:storeName(store),from:qty(cur),to:qty(nuevo),delta:(delta>=0?'+':'−')+qty(Math.abs(delta)),reason:adjDraft.obs.trim()}))) return;
  const ref = t("md.aj.ref",{obs:adjDraft.obs.trim()});
  const fechaISO = new Date(adjDraft.fecha+"T12:00:00").toISOString();
  // FIFO: positive adjustment adds a layer at last cost; negative consumes layers.
  // adjId une la capa (refId) con el movimiento, y el negativo guarda qué capas consumió:
  // así borrar el ajuste lo revierte exacto (ver deleteAjuste).
  const adjId = "adj_"+uid();
  let consumedAdj = null;
  if(delta>0) fifoEntrada(p, store, delta, p.ultimoCosto||0, ref, adjId);
  else consumedAdj = fifoConsumir(p, store, -delta).consumed || null;
  moverStock(p, delta, p.ultimoCosto||0, "ajuste", adjId, ref, { tipo:"ajuste", obs:adjDraft.obs.trim(), fecha:fechaISO, store });
  if(consumedAdj) db.movimientos[db.movimientos.length-1].consumed = consumedAdj;
  adjDraft=null; save(); closeModal();
  toast(t("md.aj.recorded",{delta:(delta>=0?'+':'−')+qty(Math.abs(delta))}), delta>=0?"up":"down");
  render();
}

function prodOptions(sel, soloConStock){
  const lista = soloConStock ? db.productos.filter(p=> (p.stock||0) > 0) : db.productos;
  const opts = lista.map(p=>{
    const disp = soloConStock ? t("md.opt.disp",{n:qty(p.stock)}) : "";
    return `<option value="${p.id}" ${p.id===sel?"selected":""}>${esc(p.sku?("["+p.sku+"] "):"")}${esc(p.nombre)}${disp}</option>`;
  }).join("");
  const nuevo = soloConStock ? "" : `<option value="__new">${ICO.plus}${t("md.pick.createprod")}</option>`;
  const vacio = soloConStock && !lista.length
    ? `<option value="">${t("md.opt.nostock")}</option>`
    : `<option value="">${t("md.opt.choose")}</option>`;
  return vacio + opts + nuevo;
}

const round2 = n => Math.round((n||0)*100)/100;
/* Total de un documento = suma de subtotales YA redondeados a 2 decimales.
   Redondear por renglón y después sumar hace que el total guardado coincida
   exactamente con lo que se ve línea por línea (money() muestra 2 decimales),
   y evita el ruido de punto flotante tipo 92.10000000000001 al reconciliar. */
function totalLineas(arr){ return round2((arr||[]).reduce((a,x)=> a + round2((x.cantidad||0)*(x.precio||0)), 0)); }

/* ============================================================
   TASK 1 — Disponible por línea considerando TODO el documento
   Si un producto aparece en varias líneas de la MISMA factura, el
   tope de cada línea es: stock − lo ya comprometido en las otras líneas.
   Así no se puede meter 20 + 20 cuando hay 20.
   ============================================================ */
function stockBaseVenta(prodId){
  const p = prodById(prodId); if(!p) return 0;
  // La venta descuenta del POOL UNIFICADO (todas las sociedades), no de un local
  let s = stockVendibleTotal(p) || 0;
  // si estamos EDITando una venta, el stock "vuelve" antes de re-validar
  if(draft && draft.editingId){
    const old = (draft.tipo==="compra"?db.compras:db.ventas).find(x=>x.id===draft.editingId);
    if(old) old.lineas.forEach(l=>{ if(l.productoId===prodId) s += (draft.tipo==="compra" ? -(l.cantidad||0) : (l.cantidad||0)); });
  }
  return s;
}
function comprometidoOtras(prodId, exceptIdx){
  if(!prodId) return 0;
  return draft.lineas.reduce((a,l,idx)=> a + ((idx!==exceptIdx && l.productoId===prodId) ? (parseNum(l.cantidad)||0) : 0), 0);
}
function dispRestante(prodId, exceptIdx){
  return stockBaseVenta(prodId) - comprometidoOtras(prodId, exceptIdx);
}
/* Refresca los textos "disp / quedan" de todas las líneas de venta sin re-render
   (así no se pierde el foco del input mientras se tipea la cantidad). */
function updateDispInfos(){
  if(!draft || draft.tipo==="compra") return;
  document.querySelectorAll("#lineHost .disp-info").forEach(div=>{
    const i=+div.dataset.di, l=draft.lineas[i]; if(!l) return;
    const p=prodById(l.productoId);
    if(!p){ div.innerHTML=""; return; }
    const rem=dispRestante(l.productoId,i), comprom=comprometidoOtras(l.productoId,i);
    const over=(parseNum(l.cantidad)||0)>rem;
    div.style.color = over?"var(--alert)":"var(--muted)";
    div.innerHTML = `${t("md.disp.avail",{n:qty(stockBaseVenta(l.productoId))})}${comprom>0?t("md.disp.left",{n:qty(rem)}):""}${over?t("md.disp.over"):""}`;
  });
}

/* ============================================================
   TASK 2 — Combobox de producto con buscador (orden alfabético)
   Reemplaza al <select> nativo: input de búsqueda + lista filtrable.
   El popup se posiciona con position:fixed sobre <body> para NO quedar
   recortado por el overflow del modal.
   ============================================================ */
let _pickerAnchor = null;
function pickerLabel(l){
  if(l.crear) return { kind:"plain", txt:t("md.pick.newprod"), ph:false };
  if(l.productoId){
    const p=prodById(l.productoId);
    if(!p) return { kind:"plain", txt:t("md.pick.product"), ph:true };
    return { kind:"prod", sku:p.sku||"", name:p.nombre||"", ph:false };
  }
  return { kind:"plain", txt:t("md.pick.product"), ph:true };
}
function pickerBtn(l, i){
  const info = pickerLabel(l);
  let inner;
  if(info.kind==="prod"){
    // Producto elegido: chip de SKU (si tiene) + nombre que se estira y trunca último
    const chip = info.sku ? `<span class="pb-sku">${esc(info.sku)}</span>` : "";
    inner = `${chip}<span class="pb-name" data-fullname="${esc(info.name)}">${esc(info.name)}</span>`;
  } else {
    // Placeholder o "＋ New product": texto plano como antes
    inner = `<span class="ppick-label">${esc(info.txt)}</span>`;
  }
  return `<button type="button" class="ppick-btn${info.ph?" placeholder":""}" data-ppick="${i}">
    ${inner}<span class="ppick-caret">▾</span></button>`;
}
function pickerItemsHTML(i, q){
  const isC = draft.tipo==="compra";
  const cur = draft.lineas[i].productoId;
  q = (q||"").trim().toLowerCase();
  const vstore = (draft && draft.store) || STORE_IDS[0];   // sólo relevante en COMPRA
  // COMPRA: todos los productos. VENTA: los que tengan stock en el POOL unificado.
  let lista = isC ? db.productos.slice()
                  : db.productos.filter(p=> stockVendibleTotal(p)>0 || p.id===cur);
  // orden alfabético SIEMPRE (task 2), por nombre
  lista.sort((a,b)=> String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{numeric:true}));
  if(q) lista = lista.filter(p=> ((p.nombre||"")+" "+(p.sku||"")).toLowerCase().includes(q));
  let html = lista.map(p=>{
    const sku = p.sku ? `<span class="sku">${esc(p.sku)}</span>` : "";
    let disp = "";
    if(!isC){ disp = `<span class="pi-disp">${t("md.pi.disp",{n:qty(dispRestante(p.id,i))})}</span>`; }
    const sel = p.id===cur ? " active" : "";
    return `<button type="button" class="ppick-item${sel}" data-pick="${p.id}">${sku}<span class="pi-name" data-fullname="${esc(p.nombre)}">${esc(p.nombre)}</span>${disp}</button>`;
  }).join("");
  if(!lista.length){
    const hayStock = db.productos.some(p=> isC ? true : stockVendibleTotal(p)>0);
    html = `<div class="ppick-empty">${isC ? t("md.pick.noprodmatch") : (hayStock?t("md.pick.nostockmatch"):t("md.pick.nostocksell"))}</div>`;
  }
  if(isC) html += `<button type="button" class="ppick-item new" data-pick="__new">${ICO.plus.replace("<svg",'<svg width="16" height="16" style="flex-shrink:0"')}${t("md.pick.createprod")}</button>`;
  return html;
}
function positionPicker(pop, anchor){
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth||360, h = pop.offsetHeight||300;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = r.left, top = r.bottom+6;
  if(left+w > vw-8) left = Math.max(8, vw-8-w);
  if(top+h > vh-8){ const above = r.top-6-h; top = above>8 ? above : Math.max(8, vh-8-h); }
  pop.style.left = left+"px"; pop.style.top = top+"px";
}
function repositionPicker(){ const pop=document.querySelector(".ppick-pop"); if(pop && _pickerAnchor) positionPicker(pop,_pickerAnchor); }
function onPickerOutside(e){ const pop=document.querySelector(".ppick-pop"); if(pop && !pop.contains(e.target) && (!_pickerAnchor || !_pickerAnchor.contains(e.target))) closeProductPicker(); }
function onPickerKey(e){ if(e.key==="Escape"){ e.stopPropagation(); e.preventDefault(); closeProductPicker(); } }
/* ---------- Tooltip de nombre completo (hover sobre producto) ----------
   Aparece SOLO si el texto está truncado (ellipsis). Así no molesta cuando
   el nombre ya se ve entero, y rescata los nombres largos que no entran. */
let _nameTip=null;
function showNameTip(el){
  if(!el || el.scrollWidth <= el.clientWidth + 1) return;   // no truncado => no molesta
  const txt = el.getAttribute("data-fullname"); if(!txt) return;
  if(!_nameTip){ _nameTip=document.createElement("div"); _nameTip.className="name-tip"; document.body.appendChild(_nameTip); }
  _nameTip.textContent = txt;
  _nameTip.style.display="block";
  const r=el.getBoundingClientRect(), tw=_nameTip.offsetWidth, th=_nameTip.offsetHeight;
  let left=r.left; if(left+tw>window.innerWidth-8) left=window.innerWidth-8-tw; left=Math.max(8,left);
  let top=r.top-th-8; if(top<8) top=r.bottom+8;   // arriba; si no entra, abajo
  _nameTip.style.left=left+"px"; _nameTip.style.top=top+"px";
  requestAnimationFrame(()=> _nameTip && _nameTip.classList.add("show"));
}
function hideNameTip(){ if(_nameTip){ _nameTip.classList.remove("show"); _nameTip.style.display="none"; } }
function wireNameTips(scope){
  (scope||document).querySelectorAll("[data-fullname]").forEach(el=>{
    el.onmouseenter=()=> showNameTip(el);
    el.onmouseleave=hideNameTip;
  });
}
function closeProductPicker(){
  hideNameTip();
  document.querySelectorAll(".ppick-pop").forEach(el=>el.remove());
  document.querySelectorAll(".ppick-btn.open").forEach(b=>b.classList.remove("open"));
  window.removeEventListener("scroll", repositionPicker, true);
  window.removeEventListener("resize", closeProductPicker);
  document.removeEventListener("mousedown", onPickerOutside, true);
  document.removeEventListener("keydown", onPickerKey, true);
  _pickerAnchor=null;
}
function openProductPicker(i, anchor){
  closeProductPicker();
  _pickerAnchor = anchor; anchor.classList.add("open");
  const pop = document.createElement("div"); pop.className="ppick-pop";
  pop.innerHTML = `<input class="inp ppick-search" placeholder="${t("md.ph.searchprod")}" autocomplete="off" spellcheck="false"><div class="ppick-list"></div>`;
  document.body.appendChild(pop);
  const search = pop.querySelector(".ppick-search");
  const listEl = pop.querySelector(".ppick-list");
  const paint = (q)=>{
    listEl.innerHTML = pickerItemsHTML(i, q);
    listEl.querySelectorAll("[data-pick]").forEach(it=> it.onclick=()=>{ const v=it.dataset.pick; closeProductPicker(); applyProdSelection(i, v); });
    wireNameTips(listEl);   // hover sobre un producto de la lista => nombre completo antes de elegirlo
  };
  paint("");
  search.oninput = ()=> paint(search.value);
  positionPicker(pop, anchor);
  window.addEventListener("scroll", repositionPicker, true);
  window.addEventListener("resize", closeProductPicker);
  setTimeout(()=>{ document.addEventListener("mousedown", onPickerOutside, true); document.addEventListener("keydown", onPickerKey, true); }, 0);
  search.focus();
}
/* Aplica la selección de producto en una línea (usado por el combobox). */
function applyProdSelection(i, value){
  const l = draft.lineas[i]; if(!l) return;
  const isC = draft.tipo==="compra";
  if(value==="__new"){ l.crear=true; l.productoId=""; l.sku=""; l.nombre=""; renderLines(); return; }
  l.crear=false; l.productoId=value;
  const p = prodById(value);
  if(p && isC && !l.precio){ l.precio = (p.costoNeto!=null?p.costoNeto:p.ultimoCosto); }
  if(p && !isC){
    l.costoRef = p.ultimoCosto||0;
    if(p.precioVenta>0){                          // trae el precio de lista y deriva el markup
      l.precio = p.precioVenta;
      l.margen = l.costoRef>0 ? round2((l.precio/l.costoRef-1)*100) : 0;
    } else {
      l.margen = l.margen||0;
      l.precio = round2(l.costoRef*(1+(l.margen||0)/100));
    }
    const rem = dispRestante(p.id, i);           // respetar stock restante al elegir
    if((parseNum(l.cantidad)||0) > rem) l.cantidad = Math.max(0, rem);
  }
  renderLines(); refreshTotal();
}

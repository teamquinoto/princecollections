/* ============================================================
   MODAL: Producto
   ============================================================ */
const CATEGORIAS = ["Pokémon TCG","Magic","One Piece TCG","Yu-Gi-Oh!","Disney Lorcana","Digimon","Dragon Ball","Flesh and Blood","Otros"];
const NIVELES = [["unidad","Unit / single"],["pack","Pack / booster (sealed)"],["box","Booster box"],["case","Case"]];

function openProd(id){
  // v86: sólo el admin crea/edita productos (los botones ya no se muestran a vendedores;
  // esta traba cubre cualquier otro camino que llegue acá).
  if(!puedeEditarProductos()){ toast(t("pr.tt.adminonly"),"warn"); return; }
  const p = id ? prodById(id) : null;
  const neto = p?(p.costoNeto||0):0, hand = p?(p.costoHandling||0):0, fle = p?(p.costoFlete||0):0;
  const total = p?(p.ultimoCosto||0):0;
  const desglosaInicial = (hand>0 || fle>0);
  let catActual = p?(p.categoria || sagaDe(p) || "Otros"):"Otros";
  const catList = CATEGORIAS.includes(catActual) ? CATEGORIAS : [catActual, ...CATEGORIAS];
  const catOpts = catList.map(c=>`<option value="${esc(c)}" ${c===catActual?"selected":""}>${esc(c)}</option>`).join("");
  const nivOpts = NIVELES.map(([v,l])=>`<option value="${v}" ${p&&p.nivel===v?"selected":""}>${esc(t("prod.niv."+v))}</option>`).join("");
  buildModal(p?t("prod.md.edit"):t("prod.md.new"), `
    <div class="u-cols2 u-p0 grid-form">
      <div class="field"><label>${t("prod.l.sku")}</label><input class="inp" id="p_sku" value="${p?esc(p.sku):""}"></div>
      <div class="field"><label>${t("prod.l.unit")}</label><input class="inp" id="p_uni" value="${p?esc(p.unidad):"u"}" placeholder="${t("prod.ph.unit")}"></div>
      <div class="u-span2 field"><label>${t("prod.l.name")}</label><input class="inp" id="p_nom" value="${p?esc(p.nombre):""}"></div>
      ${!p ? `<div class="field"><label>${t("prod.l.initstock")}</label><input class="inp num" id="p_stk" value="0"></div>
      <div class="field"><label>${t("bar.society")}</label><select class="inp" id="p_store">${(allowedStores()).map(s=>`<option value="${s}" ${s===(effectiveStores()[0]||STORE_IDS[0])?"selected":""}>${esc(storeName(s))}</option>`).join("")}</select></div>`
      : `<div class="field"><label>${t("prod.l.totalstock")}</label><input class="inp num" value="${p.stock}" disabled></div>
      <div class="field"><label>${t("prod.l.reorder")}</label><input class="inp num" id="p_rep" value="${p.puntoRepedido}"></div>`}
      ${!p ? `<div class="field"><label>${t("prod.l.reorder")}</label><input class="inp num" id="p_rep" value="0"></div>` : ""}
    </div>

    <div class="u-cols2 u-p0 u-mt2 grid-form">
      <div class="field"><label>${t("prod.l.language")}</label><select class="inp" id="p_idioma">
        <option value="" ${p&&!p.idioma?"selected":""}>—</option>
        ${langOpts().map(([v,l])=>`<option value="${v}" ${(p?p.idioma===v:v==="EN")?"selected":""}>${esc(l)}</option>`).join("")}
      </select></div>
      <div class="field"><label>${t("prod.l.invstatus")}</label><select class="inp" id="p_estado">
        <option value="sale" ${!p||p.estado==="sale"?"selected":""}>${t("prod.o.forsale")}</option>
        <option value="blocked" ${p&&p.estado==="blocked"?"selected":""}>${t("prod.o.blocked")}</option>
      </select></div>
    </div>
    ${p&&isAdmin()?`<p class="u-fs-xs u-m0 u-mt2 hint">${t("prod.hint.invest")}</p>`:""}

    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("prod.h.cost")}</h3>
      <label class="u-fs-xs u-muted u-flex u-gap2 u-items-center u-pointer">
        <input type="checkbox" id="p_desglosa" ${desglosaInicial?"checked":""}> ${t("prod.l.breakdown")}
      </label>
    </div>
    <div class="grid-form" style="grid-template-columns:1fr 1fr 1fr;padding:0">
      <div class="field" id="p_wrapNeto"><label>${t("prod.l.netcost")}</label><input class="inp num" id="p_neto" value="${neto}"></div>
      <div class="field" id="p_wrapHand"><label>${t("prod.l.handling")}</label><input class="inp num" id="p_hand" value="${hand}"></div>
      <div class="field" id="p_wrapFlete"><label>${t("prod.l.freight")}</label><input class="inp num" id="p_flete" value="${fle}"></div>
      <div class="field" style="grid-column:1/4"><label>${t("prod.l.totalcost",{ccy:db.config.moneda})}</label><input class="inp num" id="p_cos" value="${total}"></div>
    </div>

    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("prod.l.listprice")}</h3></div>
    <div class="u-cols2 u-p0 grid-form">
      <div class="field"><label>${t("prod.l.markup")}</label><input class="inp num" id="p_mk" value="${p&&p.ultimoCosto>0?round2((p.precioVenta/p.ultimoCosto-1)*100):0}"></div>
      <div class="field"><label>${t("prod.l.listprice")}</label><input class="inp num" id="p_pv" value="${p?p.precioVenta:0}"></div>
    </div>
    <p class="u-fs-xs u-m0 u-mt2 hint" id="p_mgReal"></p>

    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("prod.h.category")}</h3></div>
    <div class="u-cols2 u-p0 grid-form">
      <div class="field"><label>${t("prod.l.category")}</label><select class="inp" id="p_cat">${catOpts}</select></div>
      <div class="field"><label>${t("prod.l.level")}</label><select class="inp" id="p_niv">${nivOpts}</select></div>
      <div class="field"><label>${t("prod.l.packsperbox")}</label><input class="inp num" id="p_ppb" value="${p?p.packsPorBox:PACKS_POR_BOX_DEF}"></div>
      <div class="field"><label>${t("prod.l.unitspercase")}</label><input class="inp num" id="p_bpc" value="${p?p.boxesPorCase:boxesCaseDefault(catActual)}"></div>
    </div>
    <p class="u-fs-xs u-m0 u-mt2 hint">${t("prod.hint.percase")}</p>

    <div class="u-m0 u-mt4 u-mb2 u-p0 phead"><h3 class="u-fs-sm">${t("prod.h.image")}</h3></div>
    <div style="display:grid;grid-template-columns:1fr 64px;gap:10px;align-items:end">
      <div class="u-m0 field"><label>${t("prod.l.image")}</label><input class="inp" id="p_img" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://…" value="${p?esc(p.imagen||""):""}"></div>
      <div id="p_imgPrev" style="width:64px;height:64px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2) center/contain no-repeat"></div>
    </div>
    <p class="u-fs-xs u-m0 u-mt2 hint">${t("prod.hint.image")}</p>
    <div style="display:grid;grid-template-columns:1fr 150px;gap:10px;margin-top:10px">
      <div class="u-m0 field"><label>${t("prod.l.pubname")}</label><input class="inp" id="p_pubname" maxlength="160" placeholder="${p?esc(catNombreSugerido(p.nombre)):""}" value="${p?esc(p.nombrePublico||""):""}"></div>
      <div class="u-m0 field"><label>${t("prod.l.limit")}</label><input class="inp num" id="p_limit" inputmode="numeric" placeholder="${p&&catLimiteSugerido(p.nombre)?catLimiteSugerido(p.nombre):"—"}" value="${p&&p.limiteCliente?esc(String(p.limiteCliente)):""}"></div>
    </div>
    <p class="u-fs-xs u-m0 u-mt2 hint">${t("prod.hint.pubname")}</p>
    ${p?`<p style="font-size:var(--fs-sm);color:var(--muted);margin:14px 0 0">${t("prod.hint.stockchanges")}</p>`:''}
  `, [
    p && isAdmin() ? {label:t("common.delete"),cls:"btn danger",act:()=>{ delProd(p.id); }} : null,
    {label:t("common.cancel"),cls:"btn",act:closeModal},
    {label:t("common.save"),cls:"btn primary",act:()=>saveProd(id)}
  ].filter(Boolean), true);

  // --- Lógica de costo: total = neto+handling+flete cuando se desglosa ---
  const $=x=>document.getElementById(x);
  function syncDesglose(){
    const on = $("p_desglosa").checked;
    ["p_wrapHand","p_wrapFlete"].forEach(w=> $(w).style.display = on?"":"none");
    $("p_wrapNeto").querySelector("label").textContent = on?t("prod.l.netcost"):t("prod.l.netcosttotal");
    $("p_cos").disabled = on;                 // si desglosás, el total es calculado
    if(on) recalcTotal(); else { $("p_neto").value = $("p_cos").value; }
  }
  function recalcTotal(){
    if(!$("p_desglosa").checked) return;
    const t = round2(parseNum($("p_neto").value)+parseNum($("p_hand").value)+parseNum($("p_flete").value));
    $("p_cos").value = t; syncMarkup("cos");
  }
  function totalCosto(){ return parseNum($("p_cos").value); }
  function pintarMargen(){
    const pv=parseNum($("p_pv").value), c=totalCosto();
    const mg = pv>0 ? (pv-c)/pv*100 : 0;
    $("p_mgReal").textContent = pv>0 ? t("prod.mg.real",{p:nf0.format(mg),m:money(pv-c)}) : t("prod.mg.enter");
  }
  function syncMarkup(from){
    const c=totalCosto();
    if(from==="mk" || from==="cos"){ const mk=parseNum($("p_mk").value); $("p_pv").value = round2(c*(1+mk/100)); }
    else if(from==="pv"){ $("p_mk").value = c>0 ? round2((parseNum($("p_pv").value)/c-1)*100) : 0; }
    pintarMargen();
  }
  $("p_desglosa").onchange=syncDesglose;
  ["p_neto","p_hand","p_flete"].forEach(k=> $(k).oninput=()=>{ recalcTotal(); });
  $("p_cos").oninput=()=>{ if(!$("p_desglosa").checked) $("p_neto").value=$("p_cos").value; syncMarkup("cos"); };
  $("p_mk").oninput=()=>syncMarkup("mk");
  $("p_pv").oninput=()=>syncMarkup("pv");
  $("p_cat").onchange=()=>{ $("p_bpc").value = boxesCaseDefault($("p_cat").value); };
  // Preview de la imagen del catálogo público (solo http/https)
  function pintarImg(){
    const u = ($("p_img").value||"").trim();
    $("p_imgPrev").style.backgroundImage = /^https?:\/\/\S+$/i.test(u) ? `url("${u.replace(/"/g,"%22")}")` : "none";
  }
  $("p_img").oninput = pintarImg; pintarImg();
  syncDesglose(); pintarMargen();
  $("p_sku").focus();
}
function saveProd(id){
  const g=x=>document.getElementById(x).value;
  const nom=g("p_nom").trim();
  if(!nom){ toast(t("prod.tt.entername"),"warn"); return; }
  const sku=g("p_sku").trim();
  const dup=skuEnUso(sku, id);
  if(dup){ toast(t("prod.tt.dupsku",{sku:sku,name:dup.nombre}),"warn"); return; }
  const desglosa = document.getElementById("p_desglosa").checked;
  const neto = parseNum(g("p_neto"));
  const hand = desglosa ? parseNum(g("p_hand")) : 0;
  const flete = desglosa ? parseNum(g("p_flete")) : 0;
  const total = round2(neto + hand + flete);           // = p_cos cuando desglosa; = neto si no
  const estado = document.getElementById("p_estado") ? g("p_estado") : PRODUCT_STATES.SALE;
  const idioma = document.getElementById("p_idioma") ? g("p_idioma") : "";
  // Imagen para el catálogo público: solo URLs http(s); cualquier otra cosa se descarta
  const imgRaw = document.getElementById("p_img") ? g("p_img").trim() : "";
  if(imgRaw && !/^https?:\/\/\S+$/i.test(imgRaw)){ toast(t("prod.tt.badimg"),"warn"); return; }
  const campos = {
    sku, unidad:g("p_uni").trim()||"u", nombre:nom,
    costoNeto:neto, costoHandling:hand, costoFlete:flete, ultimoCosto:total,
    precioVenta:parseNum(g("p_pv")), puntoRepedido:parseNum(g("p_rep")),
    categoria:g("p_cat"), nivel:g("p_niv"), estado, idioma, imagen:imgRaw,
    nombrePublico: document.getElementById("p_pubname") ? g("p_pubname").trim().slice(0,160) : "",
    limiteCliente: document.getElementById("p_limit") ? (Math.max(0, Math.floor(parseNum(g("p_limit"))||0))) : 0,
    packsPorBox:parseNum(g("p_ppb"))||PACKS_POR_BOX_DEF, boxesPorCase:parseNum(g("p_bpc"))||boxesCaseDefault(g("p_cat"))
  };
  if(id){
    const p = prodById(id);
    Object.assign(p, campos);
    // keep per-store price in sync when admin edits the base price and there's a single store in focus
    if(!p.precioVentaPorTienda) p.precioVentaPorTienda={};
  } else {
    const stk=parseNum(g("p_stk"));
    const initStore = document.getElementById("p_store") ? g("p_store") : (effectiveStores()[0]||STORE_IDS[0]);
    const p=Object.assign(nuevoProductoBase(sku, nom, parseNum(g("p_pv"))), campos);
    STORE_IDS.forEach(s=> p.precioVentaPorTienda[s]=parseNum(g("p_pv")));
    db.productos.push(p);
    if(stk){
      fifoEntrada(p, initStore, stk, p.ultimoCosto, t("prod.obs.opening"), null);
      moverStock(p, stk, p.ultimoCosto, "ajuste", null, t("prod.obs.opening"), { store:initStore });
    }
  }
  save(); closeModal(); toast(t("prod.tt.saved")); render();
}
function delProd(id){
  const p=prodById(id);
  if(!confirm(t("prod.cf.delete",{name:p.nombre}))) return;
  db.productos = db.productos.filter(x=>x.id!==id);
  save(); closeModal(); toast(t("prod.tt.deleted"),"warn"); render();
}


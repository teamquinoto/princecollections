/* ============================================================
   PUNTO 7 — Clientes: autocompletar + alta de cliente nuevo
   ============================================================ */
function openClientePicker(anchor){
  closeProductPicker();
  _pickerAnchor = anchor; anchor.classList.add("open");
  const pop = document.createElement("div"); pop.className="ppick-pop";
  pop.innerHTML = `<input class="inp ppick-search" placeholder="${t("md.ph.searchcust")}" autocomplete="off" spellcheck="false"><div class="ppick-list"></div>`;
  document.body.appendChild(pop);
  const search = pop.querySelector(".ppick-search"), listEl = pop.querySelector(".ppick-list");
  const paint=(q)=>{
    q=(q||"").trim().toLowerCase();
    let lista = db.clientes.slice().sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es"));
    if(q) lista = lista.filter(c=> ((c.nombre||"")+" "+(c.empresa||"")+" "+(c.email||"")).toLowerCase().includes(q));
    let html = lista.map(c=>`<button type="button" class="ppick-item${c.id===draft.clienteId?" active":""}" data-pickcli="${c.id}">
      <span class="pi-name">${esc(c.nombre)}${c.empresa?` · ${esc(c.empresa)}`:""}</span>${clienteIncompleto(c)?`<span class="cli-inc-dot" title="${t("cl.inc.badge")}">${ICO.warn}</span>`:""}</button>`).join("");
    if(!lista.length) html = `<div class="ppick-empty">${t("md.pick.nocustmatch")}</div>`;
    html += `<button type="button" class="ppick-item new" data-pickcli="__new">${ICO.plus.replace("<svg",'<svg width="16" height="16" style="flex-shrink:0"')}${t("cl.pick.addcust")}</button>`;
    listEl.innerHTML = html;
    listEl.querySelectorAll("[data-pickcli]").forEach(it=> it.onclick=()=>{
      const v=it.dataset.pickcli; closeProductPicker();
      if(v==="__new") openClienteForm(null, search.value.trim());
      else { draft.clienteId=v; renderDocModal(); }
    });
  };
  paint("");
  search.oninput=()=>paint(search.value);
  positionPicker(pop, anchor);
  window.addEventListener("scroll", repositionPicker, true);
  window.addEventListener("resize", closeProductPicker);
  setTimeout(()=>{ document.addEventListener("mousedown", onPickerOutside, true); document.addEventListener("keydown", onPickerKey, true); }, 0);
  search.focus();
}
/* ============================================================
   VALIDACIÓN DE CLIENTES
   ------------------------------------------------------------
   Dos niveles, pensados para no frenar al vendedor y poder conciliar después:
     err  → BLOQUEA: dato basura evidente o sin él no se puede facturar/conciliar.
     warn → AVISA: raro pero puede ser real; se confirma y se sigue.
   La misma función sirve para el form (al tipear/guardar) y para marcar en la
   lista los clientes viejos que no cumplen ("Datos a completar").
   ============================================================ */
const US_STATES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",
  DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",
  LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
  NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
  OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",
  UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico",GU:"Guam",VI:"U.S. Virgin Islands"};
function esEstadoUS(v){
  const s = String(v||"").trim(); if(!s) return false;
  if(US_STATES[s.toUpperCase()]) return true;
  const n = paisNorm(s);
  return Object.values(US_STATES).some(x=> paisNorm(x)===n);
}
const CLI_NOMBRE_RELLENO = /^(venta|ventas|sale|cliente|client|customer|test|prueba|n\/?a|na|none|x+|-+|\.+|sin nombre|nombre|name|asd+f?|qwe+)$/i;
const CLI_NOMBRE_PREFIJO = /^(venta|sale|cliente|client|customer)\b/i;          // "venta Juan Cruz"
const CLI_EMAIL_RELLENO  = /^(complet[a-z]*|test|prueba|no-?e?mail|sin-?e?mail|none|na|x{2,}|asd+f?|e?mail|correo|cliente|client|customer|venta|sale)\d*$/i;
const letras = s => (String(s||"").match(/\p{L}/gu)||[]).length;

/* Valida UN campo (sufijo del form) sobre el objeto de datos completo.
   Devuelve { err: claveI18n|"" , warn: claveI18n|"", vars } */
function validarCampoCliente(sfx, c, selfId){
  const v = String((c[CLI_KEY[sfx]]||"")).trim();
  const R = (err, warn, vars)=> ({ err:err||"", warn:warn||"", vars:vars||{} });
  switch(sfx){
    case "nom":
      if(!v) return R("md.cli.err.req");
      if(CLI_NOMBRE_RELLENO.test(v) || CLI_NOMBRE_PREFIJO.test(v)) return R("md.cli.err.filler");
      if(letras(v) < 3) return R("md.cli.err.short");
      if(!/\s/.test(v) && !String(c.empresa||"").trim()) return R("", "md.cli.warn.oneword");
      return R();
    case "mail": {
      if(!v) return R("md.cli.err.req");
      const k = emailError(v); if(k) return R(k);
      const local = v.split("@")[0];
      if(local.length < 3) return R("md.cli.err.mailshort");
      if(CLI_EMAIL_RELLENO.test(local)) return R("md.cli.err.mailfiller");
      const otro = (db.clientes||[]).find(x=> x.id!==selfId && String(x.email||"").trim().toLowerCase()===v.toLowerCase());
      if(otro) return R("", "md.cli.warn.maildup", {name:otro.nombre});
      return R();
    }
    case "tel":
      if(v && (v.match(/\d/g)||[]).length < 7) return R("md.cli.err.phone");
      return R();
    case "dir":
      if(!v) return R("md.cli.err.req");
      if(v.length < 5 || !/\d/.test(v) || letras(v) < 2) return R("md.cli.err.address");
      return R();
    case "ciu":
      if(!v) return R("md.cli.err.req");
      if(letras(v) < 2) return R("md.cli.err.short");
      return R();
    case "pais":
      if(!v) return R("md.cli.err.country");
      return R();
    case "est":
      if(c.pais==="United States"){
        if(!v) return R("md.cli.err.statereq");
        if(!esEstadoUS(v)) return R("md.cli.err.state");
      }
      return R();
    case "zip": {
      if(!v) return R("md.cli.err.req");
      const z = v.toUpperCase();
      if(c.pais==="United States" && !/^\d{5}(-\d{4})?$/.test(z)) return R("md.cli.err.zipus");
      if(c.pais==="Argentina" && !/^(\d{4}|[A-Z]\d{4}[A-Z]{3})$/.test(z)) return R("md.cli.err.zipar");
      if(!/^[A-Z0-9][A-Z0-9 \-]{2,}$/.test(z)) return R("md.cli.err.zip");
      return R();
    }
    case "ein":
      if(v && !/^\d{2}-?\d{7}$/.test(v)) return R("md.cli.err.ein");
      return R();
  }
  return R();
}
/* Valida el cliente completo. { errs:[{sfx,key,vars}], warns:[...] } */
function validarCliente(c, selfId){
  const out = { errs:[], warns:[] };
  CLI_FIELDS.forEach(([sfx])=>{
    const r = validarCampoCliente(sfx, c, selfId);
    if(r.err) out.errs.push({ sfx, key:r.err, vars:r.vars });
    if(r.warn) out.warns.push({ sfx, key:r.warn, vars:r.vars });
  });
  return out;
}
/* Cliente viejo que no cumple las reglas (para el badge y el aviso en la venta). */
function clienteIncompleto(c){ return !!c && validarCliente(c, c.id).errs.length > 0; }
function paisMasUsado(){
  const cnt={}; (db.clientes||[]).forEach(c=>{ if(paisConocido(c.pais)) cnt[c.pais]=(cnt[c.pais]||0)+1; });
  return Object.keys(cnt).sort((a,b)=> cnt[b]-cnt[a])[0] || "";
}

/* ---------- Formulario de cliente COMPARTIDO ----------
   Lo usan el alta desde una venta (prefijo "c") y la vista Clientes
   (prefijo "cs"). Un solo lugar define campos, mayúsculas y validaciones,
   así los dos formularios nunca se desalinean.
   casing: ver smartCase() en 07-paises.js. */
const CLI_FIELDS = [
  // sufijo, campo,       casing
  ["nom",  "nombre",    "name"],
  ["con",  "contacto",  "name"],
  ["emp",  "empresa",   "name"],
  ["tel",  "telefono",  "plain"],
  ["mail", "email",     "email"],
  ["dir",  "direccion", "name"],
  ["ciu",  "ciudad",    "name"],
  ["est",  "estado",    "state"],
  ["zip",  "zip",       "upper"],
  ["pais", "pais",      "pais"],
  ["ein",  "ein",       "plain"]
];
const CLI_KEY = Object.fromEntries(CLI_FIELDS.map(([s,k])=>[s,k]));
function clienteFormHTML(px, c, nombrePre){
  const v = k => c ? esc(c[k]||"") : "";
  const R  = ` <span class="u-fw400 hint">${t("md.req")}</span>`;
  const RU = ` <span class="u-fw400 hint">${t("md.cli.req.us")}</span>`;
  const E = sfx => `<div class="ferr" id="${px}_${sfx}_err" hidden></div>`;
  const txt = 'autocomplete="off" autocapitalize="words"';
  const paisIni = c ? c.pais : paisMasUsado();
  return `
    <div class="u-cols2 u-p0 grid-form">
      <div class="u-span2 field"><label>${t("md.cli.name")}${R}</label><input class="inp" id="${px}_nom" ${txt} value="${c?v("nombre"):esc(nombrePre||"")}" placeholder="${t("md.cli.ph.name")}">${E("nom")}</div>
      <div class="field"><label>${t("md.cli.contact")}</label><input class="inp" id="${px}_con" ${txt} value="${v("contacto")}">${E("con")}</div>
      <div class="field"><label>${t("md.cli.company")}</label><input class="inp" id="${px}_emp" ${txt} value="${v("empresa")}">${E("emp")}</div>
      <div class="field"><label>${t("md.cli.phone")}</label><input class="inp" id="${px}_tel" type="tel" inputmode="tel" autocomplete="off" value="${v("telefono")}">${E("tel")}</div>
      <div class="field"><label>${t("md.cli.email")}${R}</label><input class="inp" id="${px}_mail" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t("md.cli.ph.email")}" value="${v("email")}">${E("mail")}</div>
      <div class="u-span2 field"><label>${t("md.cli.address")}${R}</label><input class="inp" id="${px}_dir" ${txt} value="${v("direccion")}" placeholder="${t("md.cli.ph.address")}">${E("dir")}</div>
      <div class="field"><label>${t("md.cli.city")}${R}</label><input class="inp" id="${px}_ciu" ${txt} value="${v("ciudad")}">${E("ciu")}</div>
      <div class="field"><label>${t("md.cli.state")}${RU}</label><input class="inp" id="${px}_est" ${txt} value="${v("estado")}" placeholder="${t("md.cli.ph.state")}">${E("est")}</div>
      <div class="field"><label>${t("md.cli.zip")}${R}</label><input class="inp" id="${px}_zip" autocomplete="off" autocapitalize="characters" value="${v("zip")}">${E("zip")}</div>
      <div class="field"><label>${t("md.cli.country")}${R}</label><select class="inp" id="${px}_pais" data-search>${paisOptionsHTML(paisIni)}</select>${E("pais")}</div>
      <div class="field"><label>${t("md.cli.ein")} <span class="u-fw400 hint">${t("md.cli.ein.hint")}</span></label><input class="inp" id="${px}_ein" value="${v("ein")}" placeholder="XX-XXXXXXX" autocomplete="off" autocapitalize="off" spellcheck="false">${E("ein")}</div>
    </div>`;
}
/* Lee los valores actuales del form (ya normalizados, sin tocar los inputs). */
function leerClienteForm(px){
  const campos = {};
  CLI_FIELDS.forEach(([sfx,key,kind])=>{
    const el = document.getElementById(px+"_"+sfx);
    const raw = el ? el.value : "";
    campos[key] = kind==="pais" ? paisCanon(raw) : smartCase(raw, kind);
  });
  return campos;
}
/* Pinta el estado de UN campo: rojo si bloquea, ámbar si sólo avisa. */
function pintarCampoCliente(px, sfx, selfId){
  const el = document.getElementById(px+"_"+sfx), box = document.getElementById(px+"_"+sfx+"_err");
  if(!el || !box) return { err:"", warn:"" };
  const r = validarCampoCliente(sfx, leerClienteForm(px), selfId);
  const k = r.err || r.warn;
  el.classList.toggle("bad", !!r.err); el.classList.toggle("warnf", !r.err && !!r.warn);
  el.setAttribute("aria-invalid", r.err ? "true" : "false");
  box.hidden = !k; box.textContent = k ? t(k, r.vars) : ""; box.classList.toggle("fwarn", !r.err && !!r.warn);
  return r;
}
/* Al salir de cada campo: lo dejamos prolijo (mayúsculas) y lo validamos en el
   momento. Si ya estaba marcado, se vuelve a validar mientras corrige. */
function wireClienteForm(px, selfId){
  CLI_FIELDS.forEach(([sfx,,kind])=>{
    const el = document.getElementById(px+"_"+sfx); if(!el) return;
    const onBlur = ()=>{
      if(kind!=="pais" && kind!=="plain"){ const nv=smartCase(el.value, kind); if(nv!==el.value) el.value=nv; }
      pintarCampoCliente(px, sfx, selfId);
    };
    el.addEventListener(kind==="pais" ? "change" : "blur", ()=>{
      onBlur();
      // cambiar el país cambia qué se exige en provincia y ZIP
      if(sfx==="pais") ["est","zip"].forEach(s=>{ const e=document.getElementById(px+"_"+s); if(e && e.value) pintarCampoCliente(px, s, selfId); });
    });
    el.addEventListener("input", ()=>{ if(el.classList.contains("bad")||el.classList.contains("warnf")) pintarCampoCliente(px, sfx, selfId); });
  });
}
/* Lee y valida el form completo. Errores → marca todo, avisa y enfoca el primero.
   Avisos → un solo confirm con la lista. Devuelve los campos o null. */
function readClienteForm(px, selfId){
  const campos = leerClienteForm(px);
  CLI_FIELDS.forEach(([sfx,key])=>{ const el=document.getElementById(px+"_"+sfx); if(el && el.tagName==="INPUT") el.value = campos[key]; });
  const val = validarCliente(campos, selfId);
  CLI_FIELDS.forEach(([sfx])=> pintarCampoCliente(px, sfx, selfId));
  if(val.errs.length){
    const e0 = val.errs[0];
    toast(t("md.cli.err.fix",{n:val.errs.length}),"warn");
    const el=document.getElementById(px+"_"+e0.sfx); if(el) el.focus();
    return null;
  }
  if(val.warns.length){
    const lista = val.warns.map(w=> "• "+t(w.key, w.vars)).join("\n");
    if(!confirm(t("md.cli.warn.confirm",{list:lista}))) return null;
  }
  return campos;
}

/* Alta de cliente. Reemplaza el modal de venta; al guardar, vuelve con
   renderDocModal() (el draft persiste en memoria). */
function openClienteForm(id, nombrePre){
  const c = id ? clienteById(id) : null;
  buildModal(c?t("md.cli.edit"):t("md.cli.new"), clienteFormHTML("c", c, nombrePre), [
    {label:t("common.cancel"),cls:"btn",act:()=>renderDocModal()},
    {label:t("md.cli.save"),cls:"btn primary",act:()=>saveCliente(id)}
  ], true);
  wireClienteForm("c", id);
  document.getElementById("c_nom").focus();
}
function saveCliente(id){
  const campos = readClienteForm("c", id);
  if(!campos) return;
  let cid=id;
  if(id){ Object.assign(clienteById(id), campos); }
  else { const nc=Object.assign({id:uid()}, campos); db.clientes.push(nc); cid=nc.id; }
  draft.clienteId=cid;
  save(); toast(t("md.cli.saved")); renderDocModal();
}


/* ============================================================
   VISTA: Clientes (punto 13) — listado, edición y borrado.
   Las facturas guardan un snapshot del cliente (doc.cliente), así que
   borrar el maestro NO altera las ventas históricas. Igual avisamos
   cuántas ventas tiene asociadas antes de borrar.
   ============================================================ */
let cliFiltro = "";
let cliSoloInc = false;   // filtro "Datos a completar"
let cliSort = { sortKey:"", sortDir:"" };   // ordenamiento de la tabla de clientes
function ventasDeCliente(id){ return (db.ventas||[]).filter(v=>v.clienteId===id); }
function viewClientes(){
  const q = cliFiltro.trim().toLowerCase();
  let list = (db.clientes||[]).slice();
  const nInc = list.filter(clienteIncompleto).length;
  if(cliSoloInc) list = list.filter(clienteIncompleto);
  if(q) list = list.filter(c=> ((c.nombre||"")+" "+(c.empresa||"")+" "+(c.email||"")+" "+(c.ciudad||"")+" "+(c.pais||"")+" "+paisLabel(c.pais)).toLowerCase().includes(q));
  // Orden por columna. Sin columna activa: nombre ascendente (A→Z).
  const key = cliSort.sortKey || "nombre";
  const dir = cliSort.sortKey ? (cliSort.sortDir==="asc"?1:-1) : 1;
  const valOf = c => {
    switch(key){
      case "email":   return String(c.email||"");
      case "ciudad":  return String([c.ciudad,c.estado].filter(Boolean).join(", "));
      case "pais":    return String(paisLabel(c.pais)||"");
      case "ventas":  return ventasDeCliente(c.id).length;
      case "nombre":
      default:        return String(c.nombre||"");
    }
  };
  list.sort((a,b)=>{ const va=valOf(a), vb=valOf(b); if(typeof va==="number") return dir*(va-vb); return dir*va.localeCompare(vb,"en",{numeric:true}); });
  const rows = list.map(c=>{
    const nv = ventasDeCliente(c.id).length;
    return `<tr>
      <td><b>${esc(c.nombre||"—")}</b>${clienteIncompleto(c)?` <span class="pill cli-inc" title="${esc(validarCliente(c,c.id).errs.map(e=>t(e.key,e.vars)).join(" · "))}">${t("cl.inc.badge")}</span>`:""}${c.empresa?`<div class="u-fs-xs hint">${esc(c.empresa)}</div>`:""}</td>
      <td>${esc(c.email||"—")}${c.telefono?`<div class="u-fs-xs hint">${esc(c.telefono)}</div>`:""}</td>
      <td>${esc([c.ciudad,c.estado].filter(Boolean).join(", ")||"—")}</td>
      <td>${esc(paisLabel(c.pais)||"—")}</td>
      <td class="r num">${nv}</td>
      <td class="r"><span class="rowacts">
        ${iconBtn(`data-cliedit="${c.id}"`, ICO.edit, t("common.edit"))}
        ${iconBtn(`data-clidel="${c.id}"`, ICO.trash, t("common.delete"), true)}
      </span></td>
    </tr>`;
  }).join("");
  const body = list.length
    ? `<div class="table-scroll"><table>
        <thead><tr>${sortTh(cliSort,"nombre",t("md.lbl.customer"),"")}${sortTh(cliSort,"email",t("md.cli.email"),"")}${sortTh(cliSort,"ciudad",t("md.cli.city"),"")}${sortTh(cliSort,"pais",t("md.cli.country"),"")}${sortTh(cliSort,"ventas",t("cl.th.sales"),"r")}<th class="r">${t("cl.th.actions")}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
    : emptyState(t("cl.empty.title"),t("cl.empty.sub"));
  return `
  <div class="head"><div class="title"><h2>${t("cl.title")}</h2><p>${t("cl.sub",{n:db.clientes.length})}</p></div>
    <div class="actions"><button class="btn primary" data-clinew>${ICO.plus}${t("cl.btn.new")}</button></div>
  </div>
  <div class="panel">
    <div class="u-gap3 phead"><input class="inp" id="cliSearch" placeholder="${t("cl.ph.search")}" value="${esc(cliFiltro)}" style="max-width:420px">
      ${cliFiltro?`<button class="btn sm" data-cliclear>${t("cl.btn.clear")}</button>`:""}
      ${(nInc||cliSoloInc)?`<button type="button" class="chip-inc${cliSoloInc?" on":""}" data-cliinc>${ICO.warn}${t("cl.inc.filter",{n:nInc})}</button>`:""}</div>
    ${body}
  </div>`;
}
function wireClientes(){
  const m=document.getElementById("main");
  // OJO: wireClientes() corre en CADA render (último en wire()). wireSortHeaders()
  // agarra TODOS los #main th[data-sortk], así que sin este guard pisaba los
  // handlers de orden de las demás pestañas con cliSort -> ninguna tabla ordenaba.
  if(!m.querySelector("#cliSearch")) return;   // sólo cablear en la vista de Clientes
  wireSortHeaders(cliSort);
  const s=m.querySelector("#cliSearch"); if(s){ s.oninput=()=>{ cliFiltro=s.value; const b=m.querySelector(".table-scroll"); render(); const s2=document.getElementById("cliSearch"); if(s2){ s2.focus(); s2.setSelectionRange(s2.value.length,s2.value.length); } }; }
  const cc=m.querySelector("[data-cliclear]"); if(cc) cc.onclick=()=>{ cliFiltro=""; render(); };
  const ci=m.querySelector("[data-cliinc]"); if(ci) ci.onclick=()=>{ cliSoloInc=!cliSoloInc; render(); };
  const nw=m.querySelector("[data-clinew]"); if(nw) nw.onclick=()=> openClienteStandalone(null);
  m.querySelectorAll("[data-cliedit]").forEach(a=> a.onclick=e=>{ e.preventDefault(); openClienteStandalone(a.dataset.cliedit); });
  m.querySelectorAll("[data-clidel]").forEach(a=> a.onclick=e=>{ e.preventDefault(); deleteCliente(a.dataset.clidel); });
}
/* Form de cliente independiente de la venta (no toca draft). */
function openClienteStandalone(id){
  const c = id ? clienteById(id) : null;
  buildModal(c?t("md.cli.edit"):t("md.cli.new"), clienteFormHTML("cs", c, ""), [
    {label:t("common.cancel"),cls:"btn",act:closeModal},
    {label:t("md.cli.save"),cls:"btn primary",act:()=>saveClienteStandalone(id)}
  ], true);
  wireClienteForm("cs", id);
  // al abrir un cliente viejo incompleto, marcamos de entrada qué le falta
  if(c && clienteIncompleto(c)) CLI_FIELDS.forEach(([sfx])=> pintarCampoCliente("cs", sfx, id));
  document.getElementById("cs_nom").focus();
}
function saveClienteStandalone(id){
  const campos = readClienteForm("cs", id);
  if(!campos) return;
  if(id){ Object.assign(clienteById(id), campos); }
  else { db.clientes.push(Object.assign({id:uid()}, campos)); }
  save(); toast(t("md.cli.saved")); closeModal(); render();
}
function deleteCliente(id){
  const c=clienteById(id); if(!c) return;
  const nv=ventasDeCliente(id).length;
  const msg = nv>0
    ? t("cl.del.confirm",{name:c.nombre,n:nv})
    : t("cl.del.simple",{name:c.nombre});
  if(!confirm(msg)) return;
  db.clientes = db.clientes.filter(x=>x.id!==id);
  save(); toast(t("cl.deleted"),"warn"); render();
}

function renderLines(){
  const isC = draft.tipo==="compra";
  const host = document.getElementById("lineHost");
  const rows = draft.lineas.map((l,i)=>{
    const p = prodById(l.productoId);
    if(isC){
      const newFields = l.crear ? `
        <div class="u-flex u-gap2 u-mt2">
          <input class="inp" placeholder="${t("cl.ph.sku")}" value="${esc(l.sku)}" data-k="sku" data-i="${i}" style="max-width:110px">
          <input class="inp" placeholder="${t("cl.ph.newprod")}" value="${esc(l.nombre)}" data-k="nombre" data-i="${i}">
        </div>` : "";
      return `<tr>
        <td class="lc-prod" style="min-width:220px">
          <div class="ppick">${pickerBtn(l,i)}</div>
          ${newFields}
        </td>
        <td class="lc-f" data-lbl="${t("cl.th.qty")}" style="width:90px"><input class="inp num" data-k="cantidad" data-i="${i}" value="${l.cantidad}"></td>
        <td class="lc-f" data-lbl="${t("cl.th.unitcost")}" style="width:120px"><input class="inp num" data-k="precio" data-i="${i}" value="${l.precio}"><div class="pro-landed" data-pl="${i}"></div></td>
        <td class="r num sub-cell lc-sub" data-lbl="${t("pdf.subtotal")}" style="width:120px">${money(l.cantidad*l.precio)}</td>
        <td class="c lc-pro" style="width:44px"><button type="button" class="btn ghost sm icon-only pro-tog" data-pro="${i}"></button></td>
        <td class="lc-del" style="width:34px"><button class="btn ghost sm" data-del="${i}" aria-label="${t("md.tt.remove")}" title="${t("md.tt.remove")}">${ICO.x}</button></td>
      </tr>`;
    }
    // ---- VENTA ----
    const rem = p ? dispRestante(l.productoId, i) : 0;
    const comprom = p ? comprometidoOtras(l.productoId, i) : 0;
    const over = p && (parseNum(l.cantidad)||0) > rem;
    const dispInfo = p
      ? `<div class="disp-info" data-di="${i}" style="font-size:var(--fs-xs);margin-top:4px;color:${over?'var(--alert)':'var(--muted)'}">${t("md.disp.avail",{n:qty(stockBaseVenta(l.productoId))})}${comprom>0?t("md.disp.left",{n:qty(rem)}):""}${over?t("md.disp.over"):""}</div>`
      : `<div class="u-fs-xs u-mt1 disp-info" data-di="${i}"></div>`;
    return `<tr>
      <td class="lc-prod" style="min-width:260px">
        <div class="ppick">${pickerBtn(l,i)}</div>
        ${dispInfo}
      </td>
      <td class="lc-f" data-lbl="${t("cl.th.qty")}" style="width:58px"><input class="inp num" data-k="cantidad" data-i="${i}" value="${l.cantidad}"></td>
      <td class="r num lc-f lc-ro" data-lbl="${t("cl.th.cost")}" style="width:74px;color:var(--muted)">${p?money(l.costoRef):"—"}</td>
      <td class="lc-f" data-lbl="${t("cl.th.mkpct")}" style="width:60px"><input class="inp num" data-k="margen" data-i="${i}" value="${l.margen||0}" placeholder="%"></td>
      <td class="lc-f" data-lbl="${t("cl.th.price")}" style="width:86px"><input class="inp num" data-k="precio" data-i="${i}" value="${l.precio}"></td>
      <td class="r num lc-f lc-ro" data-lbl="${t("cl.th.mrgpct")}" style="width:44px;color:var(--muted)" data-mg="${i}">${p&&l.precio>0?nf0.format((l.precio-l.costoRef)/l.precio*100)+"%":"—"}</td>
      <td class="r num sub-cell lc-sub" data-lbl="${t("pdf.subtotal")}" style="width:88px">${money(l.cantidad*l.precio)}</td>
      <td class="lc-del" style="width:30px"><button class="btn ghost sm" data-del="${i}" aria-label="${t("md.tt.remove")}" title="${t("md.tt.remove")}">${ICO.x}</button></td>
    </tr>`;
  }).join("");

  // colgroup: 1ª col (producto) sin ancho => absorbe el sobrante; el resto en px fijos.
  // Con table-layout:fixed esto define el ancho real de cada columna y evita el scroll horizontal.
  const colgroup = isC
    ? `<colgroup><col><col style="width:92px"><col style="width:134px"><col style="width:134px"><col style="width:48px"><col style="width:46px"></colgroup>`
    : `<colgroup><col><col style="width:78px"><col style="width:96px"><col style="width:86px"><col style="width:94px"><col style="width:80px"><col style="width:112px"><col style="width:46px"></colgroup>`;
  const thead = isC
    ? `<tr><th>${t("common.product")}</th><th class="r">${t("cl.th.qty")}</th><th class="r">${t("cl.th.unitcost")}</th><th class="r">${t("pdf.subtotal")}</th><th class="c" title="${t("md.pro.th.tip")}">${ICO.truck}</th><th></th></tr>`
    : `<tr><th>${t("common.product")}</th><th class="r">${t("cl.th.qty")}</th><th class="r">${t("cl.th.cost")}</th><th class="r" title="${t("cl.tt.markuppct")}">${t("cl.th.mkpct")}</th><th class="r" title="${t("cl.tt.unitprice")}">${t("cl.th.price")}</th><th class="r" title="${t("cl.tt.realmargin")}">${t("cl.th.mrgpct")}</th><th class="r">${t("pdf.subtotal")}</th><th></th></tr>`;
  host.innerHTML = `<div class="table-scroll"><table class="line-tbl doc-tbl">
    ${colgroup}
    <thead>${thead}</thead>
    <tbody>${rows}</tbody></table></div>`;

  // combobox de producto (task 2): abre el buscador flotante
  host.querySelectorAll("[data-ppick]").forEach(b=> b.onclick=()=> openProductPicker(+b.dataset.ppick, b));
  wireNameTips(host);   // hover => nombre completo si el nombre quedó truncado en la línea

  host.querySelectorAll("[data-k]").forEach(inp=>{
    const i=+inp.dataset.i, k=inp.dataset.k;
    inp.oninput = ()=>{
      const l=draft.lineas[i];
      if(k==="cantidad"){
        let v=parseNum(inp.value);
        if(!isC && l.productoId){
          // TASK 1: tope = stock − comprometido en OTRAS líneas del mismo documento
          const rem=dispRestante(l.productoId, i);
          if(v>rem){ v=Math.max(0,rem); inp.value=v; toast(t("cl.avail",{n:qty(rem)}),"warn"); }
        }
        l.cantidad=v;
        updateDispInfos();   // refresca "quedan" en todas las líneas del mismo producto
      }
      else if(k==="precio"){
        l.precio=parseNum(inp.value);
        if(!isC && l.costoRef>0){ l.margen = round2((l.precio/l.costoRef - 1)*100);
          const mi=host.querySelector(`[data-k="margen"][data-i="${i}"]`); if(mi) mi.value=l.margen; }
      }
      else if(k==="margen"){
        l.margen=parseNum(inp.value);
        l.precio = round2((l.costoRef||0)*(1+(l.margen||0)/100));
        const pi=host.querySelector(`[data-k="precio"][data-i="${i}"]`); if(pi) pi.value=l.precio;
      }
      else l[k]=inp.value;
      if(!isC && (k==="precio"||k==="margen")){
        const mg=host.querySelector(`[data-mg="${i}"]`);
        if(mg) mg.textContent = (l.precio>0) ? nf0.format((l.precio-l.costoRef)/l.precio*100)+"%" : "—";
      }
      if(k==="cantidad"||k==="precio"||k==="margen"){ updateSubtotals(); refreshTotal(); }
    };
  });
  // camión: incluir/excluir la línea del prorrateo de handling/flete
  host.querySelectorAll("[data-pro]").forEach(b=> b.onclick=()=>{
    const l=draft.lineas[+b.dataset.pro]; if(!l) return;
    l.sinProrrateo = recibeProrrateo(l);   // si recibía → pasa a excluida, y viceversa
    refreshTotal();
  });
  if(isC) updateProrrateoUI();
  host.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>{
    draft.lineas.splice(+b.dataset.del,1);
    if(!draft.lineas.length) draft.lineas.push(blankLine());
    renderLines(); refreshTotal();
  });
}
function updateSubtotals(){
  const host=document.getElementById("lineHost");
  host.querySelectorAll("tbody tr").forEach((tr,i)=>{
    const l=draft.lineas[i]; if(!l) return;
    const cell=tr.querySelector(".sub-cell");
    if(cell) cell.textContent = money(l.cantidad*l.precio);
  });
}
function refreshTotal(){
  const foot=document.getElementById("docTotal") || document.querySelector(".modal .mextra .num");
  if(foot) foot.textContent = money(docTotal());
  if(typeof refreshNet==="function") refreshNet();   // margen neto estimado de la venta (costos de venta)
  const h=document.getElementById("d_proHint");
  if(h && draft.tipo==="compra") h.textContent = textoProrrateo();
  if(draft.tipo==="compra") updateProrrateoUI();
}
/* Pinta en cada línea de compra el estado del camión y el costo final por unidad
   (neto + su parte de handling/flete). Se actualiza en vivo al tipear, sin re-render. */
function updateProrrateoUI(){
  const host=document.getElementById("lineHost"); if(!host) return;
  const u=unidadesProrrateo(), extra=(draft.handling||0)+(draft.flete||0);
  const per = u>0 ? extra/u : 0;
  draft.lineas.forEach((l,i)=>{
    const on = recibeProrrateo(l), auto = l.sinProrrateo==null;
    const b = host.querySelector(`[data-pro="${i}"]`);
    if(b){
      b.innerHTML = on ? ICO.truck : ICO.truckOff;
      b.classList.toggle("on", on); b.classList.toggle("off", !on);
      const tip = on ? t("md.pro.tog.on") : (auto && !(parseNum(l.precio)>0) ? t("md.pro.tog.free") : t("md.pro.tog.off"));
      b.title = tip; b.setAttribute("aria-label", tip); b.setAttribute("aria-pressed", on?"true":"false");
    }
    const pl = host.querySelector(`[data-pl="${i}"]`);
    if(pl){
      if(!(extra>0)){ pl.textContent=""; pl.className="pro-landed"; pl.title=""; }
      else if(on){ const v={per:money(per), tot:money((parseNum(l.precio)||0)+per)};
        pl.textContent = t("md.pro.landed",v); pl.title = t("md.pro.landed.tip",v); pl.className="pro-landed"; }
      else { pl.textContent = t("md.pro.excl"); pl.title=""; pl.className="pro-landed off"; }
    }
  });
}

function nuevoProductoBase(sku, nombre, precioVenta){
  const p = { id:uid(), sku:(sku||"").trim(), unidad:"u", nombre:(nombre||"").trim(),
        stock:0, costoNeto:0, costoHandling:0, costoFlete:0, ultimoCosto:0,
        precioVenta: precioVenta||0, puntoRepedido:0,
        categoria:"Otros", nivel:"unidad", packsPorBox:PACKS_POR_BOX_DEF, boxesPorCase:boxesCaseDefault("Otros"),
        estado:PRODUCT_STATES.SALE, idioma:idiomaSugerido((sku||"")+" "+(nombre||"")),
        stockPorTienda:{}, lotes:{}, precioVentaPorTienda:{} };
  STORE_IDS.forEach(s=>{ p.stockPorTienda[s]=0; p.lotes[s]=[]; p.precioVentaPorTienda[s]=precioVenta||0; });
  return p;
}
function confirmDoc(){
  const isC = draft.tipo==="compra";
  // Punto 3: sólo el admin carga compras.
  if(isC && !puedeComprar()){ toast(t("md.err.admincompra"),"warn"); return; }
  const store = draft.store || STORE_IDS[0];   // sólo relevante para COMPRA (sociedad que compra)
  // Sale: require a customer before generating the invoice
  if(!isC && !clienteById(draft.clienteId)){
    toast(t("cl.err.pickcust"),"warn"); return;
  }
  // ---- Validaciones duras (bloquean) ----
  const fechaIso = normISO(draft.fecha);
  const hoyIso = isoLocal(new Date());
  if(!fechaIso){ toast(t("md.err.date"),"warn"); const e=document.getElementById("d_fe"); if(e) e.focus(); return; }
  if(fechaIso > hoyIso){ toast(t("md.err.datefuture"),"warn"); const e=document.getElementById("d_fe"); if(e) e.focus(); return; }
  if(!isC && !(draft.medioPago||"").trim()){
    toast(t("md.err.paymethod"),"warn");
    const e=document.getElementById("d_pago"); if(e){ e.classList.add("bad"); e.focus(); e.addEventListener("change", ()=> e.classList.remove("bad"), { once:true }); }
    return;
  }
  if(draft.lineas.some(l=> (l.productoId||l.crear) && !((parseNum(l.cantidad)||0) > 0))){ toast(t("md.err.qty"),"warn"); return; }
  // ---- Avisos (se confirman y se sigue) ----
  if(!isC){
    const avisos = [];
    const cliV = clienteById(draft.clienteId);
    if(clienteIncompleto(cliV)) avisos.push(t("md.warn.cliinc",{name:cliV.nombre}));
    const dias = Math.round((new Date(hoyIso) - new Date(fechaIso)) / 86400000);
    if(dias > 60) avisos.push(t("md.warn.olddate",{d:dias}));
    draft.lineas.forEach(l=>{
      const p = prodById(l.productoId); if(!p || !((parseNum(l.cantidad)||0) > 0)) return;
      const pr = parseNum(l.precio)||0, co = l.costoRef||0;
      if(pr<=0) avisos.push(t("md.warn.free",{name:p.nombre}));
      else if(co>0 && pr<co) avisos.push(t("md.warn.belowcost",{name:p.nombre, price:money(pr), cost:money(co)}));
    });
    if(avisos.length && !confirm(t("md.warn.confirm",{list:avisos.map(x=>"• "+x).join("\n")}))) return;
  }
  // Punto 1: alerta de compra DUPLICADA (mismo proveedor + fecha + N° de factura).
  // Sólo en compras NUEVAS (al editar no aplica). Avisa y deja decidir (no bloquea).
  if(isC && !draft.editingId){
    const prov = (draft.contraparte||"").trim().toLowerCase();
    const fch  = normISO(draft.fecha) || "";
    const num  = (draft.numero||"").trim().toLowerCase();
    if(num){   // sin N° de factura no tiene sentido chequear duplicado
      const dupCompra = db.compras.find(c=>
        (c.contraparte||"").trim().toLowerCase()===prov &&
        (normISO(c.fecha)||"")===fch &&
        (c.numero||"").trim().toLowerCase()===num
      );
      if(dupCompra){
        const ok = confirm(t("cl.dup.confirm",{supplier:draft.contraparte||"—",date:fmtDate(draft.fecha),invoice:draft.numero||"—",u:dupCompra.lineas.reduce((a,l)=>a+l.cantidad,0),total:money(dupCompra.total)}));
        if(!ok) return;
      }
    }
  }
  // Resolve lines
  const resolved = [];
  for(const l of draft.lineas){
    if(!l.cantidad || l.cantidad<=0) continue;
    let p=null;
    if(l.crear){
      // Punto 5: si el SKU YA existe, lo adoptamos automáticamente en vez de crear
      // un duplicado (esto evitaba el error "already belongs" y los productos
      // fantasma en cero del punto 7).
      const dup = skuEnUso(l.sku, null);
      if(dup){
        p = dup;
      } else {
        if(!l.nombre.trim()){ toast(t("cl.err.newprodname"),"warn"); return; }
        p = nuevoProductoBase(l.sku, l.nombre, isC?(l.precioVentaSugerido||0):l.precio);
        db.productos.push(p);
      }
    } else {
      p = prodById(l.productoId);
      if(!p){ toast(t("cl.err.noprod"),"warn"); return; }
    }
    // --- SPECIAL STATE GUARDS on sale (point 5) ---
    if(!isC){
      if(soloEnVault(p)){ toast(t("cl.err.vault",{name:p.nombre}),"warn"); return; }
      if(esBloqueado(p)){ toast(t("cl.err.blocked",{name:p.nombre}),"warn"); return; }
    }
    const costoSnap = isC ? l.precio : fifoCostoPeekGlobal(p, l.cantidad).unit;   // FIFO unit cost across the unified pool
    resolved.push({ prod:p, cantidad:l.cantidad, precio:l.precio, costo:costoSnap, prorratea: isC ? recibeProrrateo(l) : false });
  }
  if(!resolved.length){ toast(t("cl.err.noline"),"warn"); return; }

  // PUNTO 1 — prorrateo de costos adicionales (compra), POR UNIDAD:
  // cada unidad QUE RECIBE PRORRATEO carga (handling+flete)/unidades_que_reciben.
  // Las líneas excluidas (regalos en $0, merch, o las que el usuario sacó con el
  // camión) quedan a su costo neto y no se llevan parte del flete.
  let handPU=0, fletePU=0;
  if(isC){
    const uds = resolved.reduce((a,r)=>a+(r.prorratea?r.cantidad:0),0);
    if(uds<=0 && ((draft.handling||0)+(draft.flete||0))>0){ toast(t("md.pro.none"),"warn"); return; }
    handPU  = uds>0 ? (draft.handling||0)/uds : 0;
    fletePU = uds>0 ? (draft.flete||0)/uds : 0;
  }

  // Si estamos editando, calculamos (sin mutar) el efecto de revertir el documento original
  const editing = !!draft.editingId;
  let oldDoc=null; const revertMap={};
  if(editing){
    const list0 = isC?db.compras:db.ventas;
    oldDoc = list0.find(x=>x.id===draft.editingId) || null;
    // Segunda barrera (por si la compra se usó mientras el editor estaba abierto).
    if(isC && oldDoc && trabaCompraUsada(oldDoc)) return;
    if(oldDoc){
      oldDoc.lineas.forEach(l=>{
        const d = isC ? -l.cantidad : +l.cantidad;   // deshacer el efecto original
        revertMap[l.productoId] = (revertMap[l.productoId]||0) + d;
      });
    }
  }

  // Validación de venta contra el POOL UNIFICADO (suma de todas las sociedades).
  // Nunca stock negativo. Si estoy editando, el stock del doc original "vuelve" al
  // pool (revertMap) y se puede revalidar contra ese total.
  if(!isC){
    const pedido={};
    resolved.forEach(r=>{ pedido[r.prod.id]=(pedido[r.prod.id]||0)+r.cantidad; });
    const faltantes=[];
    Object.keys(pedido).forEach(id=>{
      const p=prodById(id);
      const eff = stockVendibleTotal(p) + (editing ? (revertMap[id]||0) : 0);
      if(pedido[id]>eff) faltantes.push(t("cl.short.line",{name:p.nombre,avail:qty(eff),asked:qty(pedido[id])}));
    });
    if(faltantes.length){
      toast(t("cl.err.nostock"),"warn");
      alert(t("cl.alert.overstock",{list:faltantes.join("\n")}));
      return;
    }
  }

  const subtotalLineas = totalLineas(resolved);
  const cli = isC ? null : clienteById(draft.clienteId);
  const envioMonto = (!isC && draft.envio && draft.envio.tipo==="monto") ? (draft.envio.monto||0) : 0;
  // Cargos on-top facturados al cliente (suman al total de la venta).
  const cargosClienteArr = (!isC ? (draft.cargosCliente||[]) : [])
    .filter(c=> (parseNum(c.monto)||0) > 0)
    .map(c=>({ nota:capFirst(c.nota), monto:round2(parseNum(c.monto)||0) }));
  const cargosClienteMonto = round2(cargosClienteArr.reduce((a,c)=> a + c.monto, 0));
  const totalDoc = isC ? round2(subtotalLineas + (draft.handling||0) + (draft.flete||0))
                       : round2(subtotalLineas + envioMonto + cargosClienteMonto);
  const doc = {
    id: editing ? draft.editingId : uid(), tipo:draft.tipo, contraparte:draft.contraparte.trim(),
    fecha:normISO(draft.fecha) || isoLocal(new Date()), numero:draft.numero.trim(),
    lineas: resolved.map(r=>{
      const base = { productoId:r.prod.id, sku:r.prod.sku, nombre:r.prod.nombre, cantidad:r.cantidad, precio:r.precio, costo:r.costo };
      if(isC){
        const h = r.prorratea ? handPU : 0, f = r.prorratea ? fletePU : 0;
        base.neto = r.precio; base.handling = round2(h); base.flete = round2(f);
        base.costoTotal = round2(r.precio + h + f);   // landed unit cost
        base.sinProrrateo = !r.prorratea;            // se guarda para respetarlo al editar
      }
      return base;
    }),
    subtotal: subtotalLineas,
    total: totalDoc
  };
  if(isC){
    doc.store = store;   // sociedad que compra (procedencia del lote)
    doc.handling = draft.handling||0; doc.flete = draft.flete||0;
    // preservar el estado de envío al editar; una compra nueva arranca "in transit"
    doc.status = (editing && oldDoc && oldDoc.status) ? oldDoc.status : INVOICE_STATUS.IN_TRANSIT;
  }
  else {
    doc.clienteId = draft.clienteId;
    doc.cliente = cli ? { nombre:cli.nombre, contacto:cli.contacto, empresa:cli.empresa, telefono:cli.telefono, email:cli.email, direccion:cli.direccion, ciudad:cli.ciudad, estado:cli.estado, zip:cli.zip, pais:cli.pais||"", ein:cli.ein||"" } : null;  // snapshot for the invoice + country slicer
    doc.envio = { tipo:draft.envio.tipo, monto:envioMonto };
    doc.medioPago = (draft.medioPago||"").trim();   // medio de cobro (se muestra en la factura)
    doc.refPago = (draft.refPago||"").trim();       // ref. de la transferencia / Zelle (para conciliar)
    doc.cargosCliente = cargosClienteArr;
    // Costos de venta (sólo admin los edita). Si un vendedor edita, se conservan los que ya tenía.
    const srcCostos = isAdmin() ? (draft.costosExtra||[]) : ((oldDoc && oldDoc.costosExtra) || []);
    doc.costosExtra = srcCostos
      .filter(c=> (parseNum(c.monto)||0) > 0)
      .map(c=>({ tipo:c.tipo||"otro", nota:capFirst(c.nota), monto:round2(parseNum(c.monto)||0),
                 ...(c.tipo==="labor" ? { horas:parseNum(c.horas)||0, valorHora:parseNum(c.valorHora)||0 } : {}) }));
    doc.contraparte = cli ? clienteLinea(cli) : draft.contraparte.trim();
    // Vendedor: un seller queda fijado a sí mismo; el admin usa el que eligió (o ninguno).
    // El nombre se snapshotea para que sobreviva aunque después se renombre/borre el vendedor.
    let vid = isSeller() ? (currentVendedorId()||"") : (draft.vendedorId||"");
    doc.vendedorId = vid || null;
    doc.vendedor   = vid ? vendedorNombre(vid) : (isSeller() ? ((session&&session.name)||null) : null);
    if(!doc.vendedorId && isSeller() && session && session.name) doc.vendedor = session.name;
    // Congelar la tasa de comisión: la PROPIA del vendedor elegido (cada uno la suya).
    // Al editar, se respeta la que la venta ya tenía. Sin vendedor -> 0 (venta "house").
    doc.commissionRate = (editing && oldDoc && oldDoc.commissionRate!=null)
      ? oldDoc.commissionRate
      : (vid ? vendedorRate(vid) : 0);
  }
  const refTxt = (isC?"Purchase":"Sale") + (doc.numero?(" "+doc.numero):"") + (doc.contraparte?(" · "+doc.contraparte):"");

  // Recién ahora mutamos: primero revertimos el documento original (si estábamos editando)
  if(oldDoc) revertDoc(oldDoc);

  resolved.forEach((r, idx)=>{
    if(isC){
      // La compra sólo impacta stock/FIFO si queda RECEIVED. Si nace/queda
      // "in transit", el documento se guarda pero el inventario no se mueve:
      // la mercadería recién entra cuando se marca recibida.
      if(doc.status===INVOICE_STATUS.RECEIVED){
        const h = r.prorratea ? handPU : 0, f = r.prorratea ? fletePU : 0;
        const landed = round2(r.precio + h + f);
        fifoEntrada(r.prod, store, r.cantidad, landed, refTxt, doc.id);  // FIFO purchase layer
        moverStock(r.prod, +r.cantidad, landed, "compra", doc.id, refTxt, { store });
        r.prod.costoNeto = r.precio; r.prod.costoHandling = round2(h); r.prod.costoFlete = round2(f);
        r.prod.ultimoCosto = landed;        // last landed cost (reference only; COGS is FIFO)
      }
    } else {
      // Venta desde el POOL UNIFICADO: consumo FIFO global por fecha, cruzando sociedades.
      const res = fifoConsumirGlobal(r.prod, r.cantidad);
      doc.lineas[idx].costo = res.unit;                              // costo FIFO unitario (mezcla real)
      doc.lineas[idx].cogs = res.cogs;                               // COGS total
      doc.lineas[idx].consumed = res.consumed;                       // desglose por sociedad -> revert exacto
      // Kardex: una línea por sociedad tocada, con su costo, para que el saldo por
      // sociedad (procedencia) quede coherente. moverStock es quien decrementa el stock.
      Object.keys(res.porSociedad).forEach(soc=>{
        const t = res.porSociedad[soc];
        const unit = t.cantidad>0 ? round2(t.cogs/t.cantidad) : res.unit;
        moverStock(r.prod, -t.cantidad, unit, "venta", doc.id, refTxt, { store:soc });
      });
      r.prod.precioVenta = r.precio;                                 // último precio de venta (mirror)
    }
  });

  (isC?db.compras:db.ventas).push(doc);
  draft.editingId=null;
  save(); closeModal();
  const uds=qty(doc.lineas.reduce((a,l)=>a+l.cantidad,0));
  const compraMsg = doc.status===INVOICE_STATUS.IN_TRANSIT ? t("cl.purchase.transit",{u:uds}) : t("cl.purchase.saved",{u:uds});
  toast(editing ? t("cl.doc.updated")
       : (isC?compraMsg : t("cl.sale.recorded",{u:uds})), isC?"up":"down");
  render();
}

/* ---- Revertir / borrar / editar documentos ---- */
function recomputeUltimoCosto(prod){
  // último costo (landed) = de la compra más reciente que todavía contenga este producto.
  // Usamos el desglose guardado (neto+handling+flete). Compras viejas sin desglose caen a l.precio.
  for(let i=db.compras.length-1;i>=0;i--){
    const l = db.compras[i].lineas.find(x=>x.productoId===prod.id);
    if(l){
      prod.costoNeto = (l.neto!=null) ? l.neto : l.precio;
      prod.costoHandling = l.handling||0;
      prod.costoFlete = l.flete||0;
      prod.ultimoCosto = (l.costoTotal!=null) ? l.costoTotal : l.precio;
      return;
    }
  }
  // si no queda ninguna compra con ese producto, dejamos el último costo como está
}
/* Aplica el efecto de una compra sobre el inventario (capas FIFO + stock del
   local + último costo). Se llama al recibir la mercadería. Idempotencia: sólo
   debe invocarse cuando la compra pasa a "received", nunca dos veces. */
function receiveInvoice(doc){
  const store = doc.store || STORE_IDS[0];
  const refTxt = "Purchase" + (doc.numero?(" "+doc.numero):"") + (doc.contraparte?(" · "+doc.contraparte):"");
  doc.lineas.forEach(l=>{
    const p = prodById(l.productoId); if(!p) return;
    const landed = (l.costoTotal!=null) ? l.costoTotal : round2((l.neto!=null?l.neto:l.precio||0) + (l.handling||0) + (l.flete||0));
    fifoEntrada(p, store, l.cantidad, landed, refTxt, doc.id);
    moverStock(p, +l.cantidad, landed, "compra", doc.id, refTxt, { store });
    if(l.neto!=null){ p.costoNeto=l.neto; p.costoHandling=l.handling||0; p.costoFlete=l.flete||0; }
    p.ultimoCosto = landed;
  });
}
/* Revierte el efecto de stock de una compra recibida SIN borrar el documento
   (des-recibir). Misma mecánica que revertDoc, pero deja la compra viva para
   volver a marcarla "in transit". */
function unreceiveInvoice(doc){
  const store = doc.store || STORE_IDS[0];
  doc.lineas.forEach(l=>{
    const p = prodById(l.productoId); if(!p) return;
    fifoQuitarCompra(p, store, doc.id);
    p.stockPorTienda[store] = round4(stockDe(p,store) - l.cantidad);
    recalcStockMirror(p);
  });
  db.movimientos = db.movimientos.filter(m=> m.refId!==doc.id);
  [...new Set(doc.lineas.map(l=>l.productoId))].forEach(id=>{ const p=prodById(id); if(p) recomputeUltimoCosto(p); });
}
/* ---- Traba de integridad de compras ----
   Unidades de una compra RECIBIDA que ya salieron de su capa FIFO (vendidas,
   ajustadas, enviadas a bóveda). Si hay alguna, la compra no se puede borrar,
   editar ni volver a "en tránsito": revertirla dejaría stock negativo y capas FIFO
   descuadradas. Al deshacer lo que las consumió (p. ej. borrar la venta) las
   unidades vuelven con el refId de la compra y la traba se libera sola.
   Devuelve [{nombre, compradas, usadas}]. */
function compraUsada(doc){
  if(!doc || doc.status===INVOICE_STATUS.IN_TRANSIT) return [];
  const store = doc.store || STORE_IDS[0];
  const porProd = {};
  (doc.lineas||[]).forEach(l=>{ (porProd[l.productoId] = porProd[l.productoId] || { nombre:l.nombre, cant:0 }).cant += (l.cantidad||0); });
  const out = [];
  Object.keys(porProd).forEach(id=>{
    const p = prodById(id); if(!p) return;
    const quedan = fifoLayers(p, store).filter(L=> L.refId===doc.id).reduce((a,L)=>a+(L.cantidad||0),0);
    const libres = Math.min(quedan, stockDe(p, store));
    const usadas = round4(porProd[id].cant - libres);
    if(usadas > 0.0001) out.push({ nombre:porProd[id].nombre, compradas:porProd[id].cant, usadas });
  });
  return out;
}
/* true = bloqueado (y ya avisó al usuario). */
function trabaCompraUsada(doc){
  const u = compraUsada(doc); if(!u.length) return false;
  toast(t("doc.lock.tt"),"warn");
  alert(t("doc.lock.used",{list:u.map(x=>t("doc.lock.line",{name:x.nombre, used:qty(x.usadas), total:qty(x.compradas)})).join("\n")}));
  return true;
}
function revertDoc(doc){
  const isC = doc.tipo==="compra";
  const store = doc.store || STORE_IDS[0];
  const fallbackSoc = doc.storeVenta || doc.store || STORE_IDS[0];   // ventas viejas: sociedad única original
  // Una compra en tránsito nunca impactó stock/FIFO: al borrarla sólo se quita el
  // documento, sin revertir inventario (no hay nada que revertir).
  const compraSinImpacto = isC && doc.status===INVOICE_STATUS.IN_TRANSIT;
  if(!compraSinImpacto){
    doc.lineas.forEach(l=>{
      const p = prodById(l.productoId); if(!p) return;
      if(isC){
        fifoQuitarCompra(p, store, doc.id);                 // drop the FIFO layer this purchase created
        p.stockPorTienda[store] = round4((stockDe(p,store)) - l.cantidad);
        recalcStockMirror(p);
      } else {
        // Devolución al POOL: repone cada tramo en la capa de SU sociedad y reajusta
        // el stock por sociedad. Ventas viejas (consumed sin etiqueta) caen a fallbackSoc.
        if(l.consumed && l.consumed.length){
          const repuesto = fifoDevolverGlobal(p, l.consumed, fallbackSoc);
          Object.keys(repuesto).forEach(soc=>{ p.stockPorTienda[soc] = round4((stockDe(p,soc)) + repuesto[soc]); });
        } else {
          // Venta muy vieja sin desglose: reponer todo en la sociedad de fallback al costo de la línea.
          fifoLayers(p, fallbackSoc).unshift({ id:uid(), fecha:new Date().toISOString(), cantidad:l.cantidad, costoUnit:(l.costo||p.ultimoCosto||0), ref:"revert" });
          p.stockPorTienda[fallbackSoc] = round4((stockDe(p,fallbackSoc)) + l.cantidad);
        }
        recalcStockMirror(p);
      }
    });
  }
  db.movimientos = db.movimientos.filter(m=> m.refId!==doc.id);
  const list = isC?db.compras:db.ventas;
  const i = list.findIndex(x=>x.id===doc.id); if(i>=0) list.splice(i,1);
  if(isC && !compraSinImpacto){
    [...new Set(doc.lineas.map(l=>l.productoId))].forEach(id=>{ const p=prodById(id); if(p) recomputeUltimoCosto(p); });
  }
}
function deleteDoc(tipo,id){
  const list = tipo==="compra"?db.compras:db.ventas;
  const d=list.find(x=>x.id===id); if(!d) return;
  if(tipo==="compra" && trabaCompraUsada(d)) return;
  const items=d.lineas.reduce((a,l)=>a+l.cantidad,0);
  const msg = tipo==="compra"
    ? t("cl.del.purchase",{u:qty(items),store:storeName(d.store)})
    : t("cl.del.sale",{u:qty(items)});
  if(!confirm(msg)) return;
  revertDoc(d); save();
  if(document.getElementById("scrim")) closeModal();
  toast(t("cl.doc.deleted"),"warn"); render();
}
function editDoc(tipo,id){
  const list = tipo==="compra"?db.compras:db.ventas;
  const d=list.find(x=>x.id===id); if(!d) return;
  if(tipo==="compra" && trabaCompraUsada(d)) return;
  draft = {
    tipo, editingId:id, store:d.store||STORE_IDS[0], storeOrig:d.store||STORE_IDS[0],
    vendedorId: (tipo==="venta") ? (d.vendedorId||"") : "",
    contraparte:d.contraparte||"", fecha:normISO(d.fecha), numero:d.numero||"",
    clienteId:d.clienteId||"", envio: d.envio ? {tipo:d.envio.tipo, monto:d.envio.monto||0} : {tipo:"free",monto:0},
    handling:d.handling||0, flete:d.flete||0, medioPago: (tipo==="venta") ? (d.medioPago||"") : "", refPago: (tipo==="venta") ? (d.refPago||"") : "",
    costosExtra: (tipo==="venta") ? (d.costosExtra||[]).map(c=>({ key:uid(), tipo:c.tipo||"otro", nota:c.nota||"", monto:c.monto||0, horas:c.horas||0, valorHora:c.valorHora||0 })) : [],
    cargosCliente: (tipo==="venta") ? (d.cargosCliente||[]).map(c=>({ key:uid(), nota:c.nota||"", monto:c.monto||0 })) : [],
    lineas: d.lineas.map(l=>({ key:uid(), productoId:l.productoId, sku:l.sku, nombre:l.nombre, cantidad:l.cantidad, precio:l.precio,
      sinProrrateo: (tipo==="compra" && typeof l.sinProrrateo==="boolean") ? l.sinProrrateo : undefined,
      costoRef: prodById(l.productoId) ? (prodById(l.productoId).ultimoCosto||0) : (l.costo||0),
      margen: (l.costo>0)? round2((l.precio/l.costo-1)*100) : 0, precioVentaSugerido:0, crear:false }))
  };
  renderDocModal();
}
/* Copy a sale as a NEW document. Re-validates against the CURRENT unified pool. */
function copyDoc(tipo,id){
  const list = tipo==="compra"?db.compras:db.ventas;
  const d=list.find(x=>x.id===id); if(!d) return;
  if(document.getElementById("scrim")) closeModal();
  const store = d.store||STORE_IDS[0];
  draft = {
    tipo, editingId:null, store,
    vendedorId: (tipo==="venta") ? (isSeller() ? (currentVendedorId()||"") : (d.vendedorId||"")) : "",
    contraparte: tipo==="compra"?(d.contraparte||""):"",
    fecha:isoLocal(new Date()),
    numero: tipo==="venta" ? nextFacturaVenta() : "",
    clienteId: tipo==="venta"?(d.clienteId||""):"",
    envio: (tipo==="venta" && d.envio) ? {tipo:d.envio.tipo, monto:d.envio.monto||0} : {tipo:"free",monto:0},
    handling:0, flete:0, medioPago: (tipo==="venta") ? (d.medioPago||"") : "",
    costosExtra: (tipo==="venta") ? (d.costosExtra||[]).map(c=>({ key:uid(), tipo:c.tipo||"otro", nota:c.nota||"", monto:c.monto||0, horas:c.horas||0, valorHora:c.valorHora||0 })) : [],
    cargosCliente: (tipo==="venta") ? (d.cargosCliente||[]).map(c=>({ key:uid(), nota:c.nota||"", monto:c.monto||0 })) : [],
    lineas: d.lineas.map(l=>{
      const p=prodById(l.productoId);
      return { key:uid(), productoId:l.productoId, sku:l.sku, nombre:l.nombre, cantidad:l.cantidad, precio:l.precio,
        costoRef: p?(p.ultimoCosto||0):(l.costo||0), margen:(l.costo>0)?round2((l.precio/l.costo-1)*100):0, precioVentaSugerido:0, crear:false };
    })
  };
  const recortes=[];
  if(tipo==="venta"){
    const usado={};
    draft.lineas.forEach(l=>{
      const p=prodById(l.productoId); if(!p) return;
      const disp=Math.max(0, stockVendibleTotal(p)-(usado[l.productoId]||0));
      if(l.cantidad>disp){ recortes.push(t("cl.copytrim.line",{name:p.nombre,asked:qty(l.cantidad),avail:qty(disp)})); l.cantidad=disp; }
      usado[l.productoId]=(usado[l.productoId]||0)+l.cantidad;
    });
  }
  renderDocModal();
  if(recortes.length) alert(t("cl.alert.copytrim",{list:recortes.join("\n")}));
}

/* Ver documento existente (solo lectura)
   v96: rediseño. Arriba una ficha con los datos (cliente/proveedor, fecha, pago,
   vendedor, estado), después las líneas y abajo dos recuadros prolijos: Totales y
   (sólo admin, sólo ventas) Rentabilidad. Antes eran filas sueltas alineadas a la
   derecha con mucho aire y quedaba desprolijo. */
(function(){
  try{
    Object.assign(I18N.en, { "vd.customer":"Customer", "vd.supplier":"Supplier", "vd.totals":"Totals", "vd.profit":"Profitability", "vd.adminonly":"only visible to admin" });
    Object.assign(I18N.es, { "vd.customer":"Cliente", "vd.supplier":"Proveedor", "vd.totals":"Totales", "vd.profit":"Rentabilidad", "vd.adminonly":"sólo lo ve el admin" });
  }catch(e){}
})();
function verDoc(tipo,id){
  const list = tipo==="compra"?db.compras:db.ventas;
  const d=list.find(x=>x.id===id); if(!d) return;
  const isC=tipo==="compra";
  const fila = (lbl, val, cls="") => `<div class="vd-row ${cls}"><span>${lbl}</span><span class="num">${val}</span></div>`;

  // ---- Ficha de datos ----
  const cli = d.cliente || (d.clienteId?clienteById(d.clienteId):null);
  const einDet = (cli && cli.ein) || (d.clienteId && clienteById(d.clienteId) && clienteById(d.clienteId).ein) || "";
  let quien;
  if(!isC && cli){
    quien = `<b>${esc(nombreVis(cli.nombre)||cli.nombre||"—")}</b>${cli.empresa?` · ${esc(cli.empresa)}`:""}
      ${clienteDireccion(cli)?`<br>${esc(clienteDireccion(cli))}`:""}
      ${(cli.email||cli.telefono)?`<br>${esc(cli.email||"")}${cli.email&&cli.telefono?" · ":""}${esc(cli.telefono||"")}`:""}
      ${einDet?`<br>${t("md.cli.ein")}: ${esc(einDet)}`:""}`;
  } else {
    quien = `<b>${esc(nombreVis(d.contraparte)||d.contraparte||"—")}</b>`;
  }
  const datos = [
    `<div class="vd-f vd-f-wide"><span class="vd-lbl">${isC?t("vd.supplier"):t("vd.customer")}</span><div>${quien}</div></div>`,
    `<div class="vd-f"><span class="vd-lbl">${t("common.date")}</span><div>${esc(fmtDate(d.fecha))}</div></div>`
  ];
  if(!isC && d.medioPago) datos.push(`<div class="vd-f"><span class="vd-lbl">${t("md.pay.method")}</span><div>${esc(payLabel(d.medioPago))}${d.refPago?` · ${esc(d.refPago)}`:""}</div></div>`);
  if(!isC && isAdmin()) datos.push(`<div class="vd-f"><span class="vd-lbl">${t("cl.v.soldby")}</span><div>${esc(saleVendedorNombre(d))}</div></div>`);
  const received = d.status===INVOICE_STATUS.RECEIVED;
  if(isC) datos.push(`<div class="vd-f vd-f-wide"><span class="vd-lbl">${t("cl.v.shipstatus")}</span>
      <div class="u-flex u-gap3 u-items-center u-wrap">
        <span class="inv-badge ${received?'received':'transit'}">${received?t('cl.v.received'):t('cl.v.intransit')}</span>
        <button class="btn ghost sm" data-invstatus-modal="${d.id}">${received?t('cl.v.markintransit'):t('cl.v.markreceived')}</button>
      </div></div>`);

  // ---- Líneas ----
  const rows=d.lineas.map(l=>`<tr>
    <td><span class="sku">${esc(l.sku||"—")}</span> ${esc(l.nombre)}</td>
    <td class="r num">${qty(l.cantidad)}</td>
    <td class="r num">${money(l.precio)}</td>
    <td class="r num">${money(l.cantidad*l.precio)}</td></tr>`).join("");

  // ---- Totales ----
  const sub = (d.subtotal!=null) ? d.subtotal : totalLineas(d.lineas);
  let tot = fila(t("pdf.subtotal"), money(sub));
  if(isC){ if(d.handling||d.flete) tot += fila(t("cl.v.handfreight"), money((d.handling||0)+(d.flete||0))); }
  else tot += fila(t("cl.v.shipping"), d.envio&&d.envio.tipo==="monto"?money(d.envio.monto):t("md.ship.free"));
  if(!isC) (d.cargosCliente||[]).forEach(c=>{ tot += fila("+ "+esc(capFirst(c.nota)||tEn("pdf.charge")), money(c.monto)); });
  tot += fila(t("common.total"), money(d.total), "vd-total");

  // ---- Rentabilidad (sólo admin, sólo ventas) ----
  let rent = "";
  if(!isC && isAdmin()){
    rent += fila(t("cl.v.marginfifo"), money(saleMargin(d)));
    if(saleEnvioCobrado(d)>0) rent += fila(t("md.net.ship"), money(saleEnvioCobrado(d)));
    if(saleCargosCliente(d)>0) rent += fila(t("cl.v.chargesbilled"), money(saleCargosCliente(d)));
    rent += fila(t("cl.v.commission",{p:nf0.format(saleCommissionRate(d)*100)}), money(saleCommission(d)));
    (d.costosExtra||[]).forEach(c=>{
      const detalle = c.tipo==="labor" && c.horas ? ` (${nf0.format(c.horas)}h × ${money(c.valorHora||0)})` : (c.nota?` · ${c.nota}`:"");
      rent += fila("− "+esc(costoTipoLabel(c.tipo)+detalle), money(c.monto));
    });
    const nm = saleNetMargin(d);
    rent += fila(t("cl.v.netmargin"), `<span style="color:${nm<0?'var(--alert)':'var(--up-ink)'}">${money(nm)}</span>`, "vd-total");
  }

  buildModal(`${isC?t("cl.v.purchase"):t("cl.v.invoice")} ${d.numero||""}`.trim(), `
    <div class="vd-datos">${datos.join("")}</div>
    <div class="vd-lineas table-scroll"><table>
      <thead><tr><th>${t("common.product")}</th><th class="r">${t("cl.th.qty")}</th><th class="r">${isC?t("cl.th.cost"):t("cl.th.price")}</th><th class="r">${t("pdf.subtotal")}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="vd-cajas">
      <div class="vd-caja"><h4>${t("vd.totals")}</h4>${tot}</div>
      ${rent ? `<div class="vd-caja"><h4>${t("vd.profit")} <span class="hint">· ${t("vd.adminonly")}</span></h4>${rent}</div>` : ""}
    </div>
  `,[
    {label:t("common.delete"),cls:"btn danger",act:()=>deleteDoc(tipo,id)},
    ...(isC?[]:[{label:t("cl.btn.downloadpdf"),cls:"btn",act:()=>generarInvoicePDF(id)},
              {label:t("cl.btn.copy"),cls:"btn",act:()=>copyDoc(tipo,id)}]),
    {label:t("common.edit"),cls:"btn",act:()=>{ closeModal(); editDoc(tipo,id); }},
    {label:t("common.close"),cls:"btn",act:closeModal}
  ]);
  // Punto 1: el botón de estado dentro del detalle re-abre el modal ya actualizado.
  const sb=document.querySelector("[data-invstatus-modal]");
  if(sb) sb.onclick=()=>{ toggleInvoiceStatus(sb.dataset.invstatusModal); closeModal(); verDoc(tipo,id); };
}


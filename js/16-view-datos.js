/* ============================================================
   VISTA: Datos
   ============================================================ */
function viewDatos(){
  const conf = syncState==="conflict";
  const roleLbl = isAdmin() ? t("dat.acct.admin") : t("dat.acct.seller",{name:esc((session&&session.name)||"—")});
  /* v104 · General reacomodado: 2 columnas en pantallas anchas, formularios compactos,
     botón Guardar al pie de su tarjeta y "Datos y seguridad" como lista de ajustes. */
  const em = db.config.emisor||{};
  const row = (tit,sub,acts,danger)=>`<div class="set-row${danger?" is-danger":""}">
      <div class="set-txt"><b>${tit}</b><span class="hint">${sub}</span></div>
      <div class="set-acts">${acts}</div></div>`;
  return `
  <div class="head"><div class="title"><h2>${t("dat.title")}</h2><p>${t("dat.sub")}</p></div></div>

  <div class="dat-grid">
  <div class="panel dat-card dat-full">
    <div class="phead"><h3>${t("dat.grp.billing")}</h3><span class="hint">${t("dat.issuer.hint")}</span></div>
    <div class="grid-form bill-form">
      <div class="field bf-name"><label>${t("dat.issuer.name")}</label><input class="inp" id="cfgEmNom" value="${esc(em.nombre||"")}"></div>
      <div class="field bf-addr"><label>${t("dat.issuer.addr")}</label><input class="inp" id="cfgEmDir" value="${esc(em.direccion||"")}"></div>
      <div class="field"><label>${t("dat.issuer.email")}</label><input class="inp" id="cfgEmMail" value="${esc(em.email||"")}"></div>
      <div class="field"><label>${t("dat.issuer.phone")}</label><input class="inp" id="cfgEmTel" value="${esc(em.tel||"")}"></div>
      <div class="field"><label>${t("dat.set.startinv")}</label><input class="inp num" id="cfgFac" value="${esc(String(db.config.facturaInicio||101))}"></div>
    </div>
    <div class="pfoot"><button class="btn primary sm" data-savecfg>${ICO.save}${t("common.save")}</button></div>
  </div>

  <div class="panel dat-full">
    <div class="phead"><h3>${t("dat.grp.acctdata")}</h3><span class="hint" data-syncchip>●</span></div>
    ${conf ? `<div class="banner warn" style="margin:14px 18px 0"><div>${t("dat.conf.title")}
        <div class="u-mt2 u-flex u-gap2 u-wrap">
          <button class="btn sm" data-confserver>${t("dat.conf.takeserver")}</button>
          <button class="btn sm danger" data-conflocal>${t("dat.conf.overwrite")}</button>
        </div></div></div>`:""}
    <div class="set-list">
      ${row(t("dat.acct"), t("dat.acct.signedin",{u:`<b>${esc(session?session.user:"—")}</b>`,role:`<b>${esc(roleLbl)}</b>`})+" "+t("dat.inv.line",{sp:`<b>${esc(session?session.space:"main")}</b>`,rev:syncMeta.syncedRev,dirty:syncMeta.dirty?t("dat.inv.dirty"):""})+".",
        `<button class="btn sm" data-syncnow>${ICO.sync}${t("dat.syncnow")}</button><button class="btn sm" data-logout>${ICO.logout}${t("tb.logout")}</button>`)}
      ${row(t("dat.grp.backup"), t("dat.backup.sub"),
        `<button class="btn sm" data-export>${ICO.download}${t("dat.exportjson")}</button><button class="btn sm" data-import-json>${ICO.upload}${t("dat.importjson")}</button>`)}
      ${(isAdmin() && session) ? row(t("pap.title"), t("pap.sub"), `<button class="btn sm" data-papelera>${ICO.trash}${t("pap.open")}</button>`) : ""}
    </div>
  </div>

  ${isAdmin()?`<div class="panel dat-full danger-zone">
    <div class="phead"><h3>${t("dat.grp.danger")}</h3></div>
    <div class="grid-form">
      <p class="u-m0 hint">${t("dat.grp.danger.hint")}</p>
      <div><button class="btn danger" data-reset>${ICO.reset}${t("dat.deleteall")}</button></div>
    </div>
  </div>`:""}
  </div>`;
}
/* ---------- utilidades UI ---------- */
function esc(s){ return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function emptyState(t,h){ return `<div class="empty"><div class="big">∅</div><p class="u-fw600 u-text">${t}</p><p class="hint">${h}</p></div>`; }

/* ============================================================
   Eventos de la vista
   ============================================================ */
function wire(){
  const m = document.getElementById("main");
  m.querySelectorAll("[data-open]").forEach(b=> b.onclick=()=> openDoc(b.dataset.open));
  m.querySelectorAll("[data-newp]").forEach(b=> b.onclick=()=> openProd());
  m.querySelectorAll("[data-ficha]").forEach(tr=> tr.onclick=()=> openFicha(tr.dataset.ficha));
  wireDashFiltros();
  wireProd();
  wireAnalisis();
  wireDocFiltros();
  wireMovFiltros();
  wireClientes();
  // Alerta de reposición (banner + tarjeta): click / Enter / Espacio -> maestro filtrado
  m.querySelectorAll("[data-goto-pedir]").forEach(el=>{
    el.style.cursor="pointer";
    el.onclick=irAPedidos;
    el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); irAPedidos(); } };
  });
  m.querySelectorAll("[data-editp]").forEach(b=> b.onclick=(e)=>{ e.stopPropagation(); openProd(b.dataset.editp); });
  m.querySelectorAll("[data-invret]").forEach(b=> b.onclick=(e)=>{ e.stopPropagation(); openReturnFromInvestment(b.dataset.invret); });
  m.querySelectorAll("[data-import]").forEach(b=> b.onclick=()=> openImport());
  const adj=m.querySelector("[data-adjust]"); if(adj) adj.onclick=()=> openAjuste();
  m.querySelectorAll("[data-delaj]").forEach(b=> b.onclick=()=> deleteAjuste(b.dataset.delaj));
  m.querySelectorAll("[data-vdoc]").forEach(b=> b.onclick=()=>{
    const [t,id]=b.dataset.vdoc.split(":"); verDoc(t,id);
  });
  m.querySelectorAll("[data-editdoc]").forEach(b=> b.onclick=()=>{
    const [t,id]=b.dataset.editdoc.split(":"); editDoc(t,id);
  });
  m.querySelectorAll("[data-deldoc]").forEach(b=> b.onclick=()=>{
    const [t,id]=b.dataset.deldoc.split(":"); deleteDoc(t,id);
  });
  const exp=m.querySelector("[data-export]"); if(exp) exp.onclick=exportJSON;
  const imp=m.querySelector("[data-import-json]"); if(imp) imp.onclick=importJSON;
  const pap=m.querySelector("[data-papelera]"); if(pap) pap.onclick=()=> openPapelera();   // v96
  const rst=m.querySelector("[data-reset]"); if(rst) rst.onclick=resetAll;
  m.querySelectorAll("[data-savecfg]").forEach(cfg=> cfg.onclick=()=>{
    const monEl=document.getElementById("cfgMon"); if(monEl){ db.config.moneda=(monEl.value||"$").trim()||"$"; }
    const fi=parseInt(document.getElementById("cfgFac").value,10); if(!isNaN(fi)&&fi>0) db.config.facturaInicio=fi;
    const commEl=document.getElementById("cfgComm");   // sólo lo renderiza el admin
    if(commEl){ const pct=parseNum(commEl.value); if(!isNaN(pct)) db.config.commissionRate = Math.min(1, Math.max(0, round2(pct)/100)); }
    db.config.emisor = {
      nombre:(document.getElementById("cfgEmNom").value||"").trim(),
      direccion:(document.getElementById("cfgEmDir").value||"").trim(),
      email:(document.getElementById("cfgEmMail").value||"").trim(),
      tel:(document.getElementById("cfgEmTel").value||"").trim()
    };
    save(); toast(t("dat.tt.saved")); render();
  });

  // --- cuenta / sincronización ---
  const sNow=m.querySelector("[data-syncnow]"); if(sNow) sNow.onclick=()=> pullNow();
  const lo=m.querySelector("[data-logout]"); if(lo) lo.onclick=()=> logout();
  const cl=m.querySelector("[data-conflocal]"); if(cl) cl.onclick=()=>resolveConflict(true);
  const cs=m.querySelector("[data-confserver]"); if(cs) cs.onclick=()=>resolveConflict(false);

  // --- vendedores (ABM, admin) ---
  m.querySelectorAll("[data-vname]").forEach(inp=> inp.onchange=()=>{
    const v=vendedorById(inp.dataset.vname); if(v){ v.nombre=(inp.value||"").trim()||v.id; save(); toast(t("dat.tt.renamed")); }
  });
  m.querySelectorAll("[data-vrate]").forEach(inp=> inp.onchange=()=>{
    const v=vendedorById(inp.dataset.vrate); if(!v) return;
    const pct=parseNum(inp.value);
    if(isNaN(pct)){ inp.value=String(round2((v.rate||0)*100)); return; }
    v.rate = Math.min(1, Math.max(0, round2(pct)/100));
    save(); toast(t("dat.tt.commset",{name:v.nombre,p:round2(v.rate*100)}));
  });
  m.querySelectorAll("[data-vdel]").forEach(b=> b.onclick=()=>{
    const id=b.dataset.vdel;
    if(!confirm(t("dat.cf.delseller",{name:vendedorNombre(id)}))) return;
    db.config.vendedores = vendedores().filter(v=>v.id!==id);
    save(); toast(t("dat.tt.sellerremoved"),"warn"); render();
  });
  const vAdd=m.querySelector("#vAdd"); if(vAdd) vAdd.onclick=()=>{
    let id=(document.getElementById("vNewId").value||"").trim().toLowerCase().replace(/[^a-z0-9_-]/g,"");
    const nombre=(document.getElementById("vNewName").value||"").trim();
    const rpct=parseNum(document.getElementById("vNewRate").value);
    const rate = isNaN(rpct) ? (db.config.commissionRate||0) : Math.min(1, Math.max(0, round2(rpct)/100));
    if(!id){ toast(t("dat.tt.enterid"),"warn"); return; }
    if(vendedorById(id)){ toast(t("dat.tt.ididexists"),"warn"); return; }
    db.config.vendedores = vendedores().concat([{ id, nombre: nombre||id, rate }]);
    save(); toast(t("dat.tt.selleradded")); render();
  };

  if(document.getElementById("uAdd")) wireUsuariosView();
  paintSync();
}

/* ============================================================
   USUARIOS (traído de select, adaptado a admin + vendedores)
   ============================================================ */
let _usrCache = null;

async function apiUsers(method, body, qs){
  const res = await apiFetch(apiBase()+"/users"+(qs||""), {
    method, headers: authHeaders(), body: body?JSON.stringify(body):undefined
  });
  if(res.status===401){ forceLogout(); throw new Error("401"); }
  const j = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(srvErrText(j,res.status));
  return j;
}
function usrRoleLabel(r){ return r==="admin"?t("usr.role.admin"):(r==="store"?t("usr.role.store"):t("usr.role.seller")); }
function clienteNombre(id){ const c=(db.clientes||[]).find(x=>x.id===id); return c?(c.nombre||c.id):(id||"\u2014"); }

function viewUsuarios(){
  const cliOpts=(db.clientes||[]).slice().sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||"")))
    .map(c=>`<option value="${esc(c.id)}">${esc(c.nombre||c.id)}</option>`).join("");
  return `
  <div class="head"><div class="title"><h2>${t("usr.title")}</h2><p>${t("usr.hint")}</p></div></div>

  <div class="panel">
    <div class="phead"><h3>${t("usr.h.new")}</h3></div>
    <div class="grid-form">
      <p class="u-m0 hint">${t("usr.desc")}</p>
      <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
        <div class="field" style="flex:1 1 150px"><label>${t("usr.f.name")}</label><input class="inp" id="uNewName"></div>
        <div class="f-field field"><label>${t("usr.f.user")}</label><input class="inp" id="uNewUser" placeholder="${t("usr.f.user.ph")}"></div>
        <div class="f-field field"><label for="uNewPass">${t("usr.f.pass")}</label>${passFieldHTML("uNewPass")}</div>
        <div class="field" style="flex:0 0 130px"><label>${t("usr.f.role")}</label>
          <select class="inp" id="uNewRole">
            <option value="seller">${t("usr.role.seller")}</option>
            <option value="admin">${t("usr.role.admin")}</option>
          </select></div>
        <div class="field u-when-seller" style="flex:0 0 90px"><label>${t("usr.f.comm")}</label><input class="inp num" id="uComm" placeholder="${esc(String(round2((db.config.commissionRate||0)*100)))}"></div>
        <button class="btn primary" id="uAdd" style="flex:0 0 auto">${ICO.adduser}${t("usr.add")}</button>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="phead"><h3>${t("usr.h.active")}</h3></div>
    <div class="u-p5">
      <div id="usrCards"><p class="hint">${t("usr.loading")}</p></div>
      <div id="vendOrphans"></div>
    </div>
  </div>
  ${typeof seg2faPanelHTML==="function" ? seg2faPanelHTML() : ""}`;
}

function usrInitial(u){ const s=String(u.name||u.user||"?").trim(); return (s[0]||"?").toUpperCase(); }
function usrSubline(u){
  const role=usrRoleLabel(u.role);
  if(u.role==="seller"){ const v=vendedorById(u.vendedorId); const r=v?round2((v.rate!=null?v.rate:(db.config.commissionRate||0))*100):null; return "@"+u.user+" \u00b7 "+role+(r!=null?(" \u00b7 "+r+"% com."):""); }
  if(u.role==="store"){ return "@"+u.user+" \u00b7 "+role+" \u00b7 "+clienteNombre(u.clienteId); }
  return "@"+u.user+" \u00b7 "+role+(u.totp?" \u00b7 2FA":"");
}
/* v102 · Una sola lista: accesos (admins, vendedores, clientes) + vendedores que sólo existen
   para atribuir comisión (sin usuario en la app). Antes estos iban en una lista aparte. */
function usrCardHTML(o){
  return `<div class="usr-card" ${o.attr} role="button" tabindex="0">
      <span class="usr-av${o.muted?" muted":""}">${esc(o.ini)}</span>
      <span class="usr-txt">
        <b class="u-nowrap u-ovh u-ellipsis">${esc(o.name)}</b>
        <span class="u-nowrap u-ovh u-ellipsis hint">${esc(o.sub)}${o.tag?` <span class="pill usr-noacc">${esc(o.tag)}</span>`:""}</span>
      </span>
      <span class="usr-chev" aria-hidden="true">\u203a</span>
    </div>`;
}
function renderUsrCards(users){
  users=users||[];
  const used=new Set(users.filter(u=>u.role==="seller").map(u=>String(u.vendedorId||"").toLowerCase()));
  const orphans=vendedores().filter(v=> !used.has(String(v.id).toLowerCase()));
  const orden={admin:0,seller:1,store:2};
  const items=[
    ...users.map(u=>({ k:(orden[u.role]??3)+"|"+String(u.name||u.user).toLowerCase(),
      html:usrCardHTML({attr:`data-uedit="${esc(u.user)}"`, ini:usrInitial(u), name:u.name||u.user, sub:usrSubline(u)}) })),
    ...orphans.map(v=>{ const r=round2((v.rate!=null?v.rate:(db.config.commissionRate||0))*100);
      return { k:"1|"+String(v.nombre||v.id).toLowerCase(),
        html:usrCardHTML({attr:`data-vedit="${esc(v.id)}"`, ini:usrInitial({name:v.nombre||v.id}), name:v.nombre||v.id, muted:true,
          sub:v.id+" \u00b7 "+usrRoleLabel("seller")+" \u00b7 "+r+"% com.", tag:t("usr.noaccess")}) }; })
  ].sort((x,y)=> x.k<y.k?-1:x.k>y.k?1:0);
  if(!items.length) return `<p class="hint">${t("usr.none")}</p>`;
  return `<div class="usr-list">`+items.map(x=>x.html).join("")+`</div>`;
}
/* Vendedor sin acceso: editar nombre y comisión, quitarlo, o darle acceso a la app */
function openVendModal(id){
  const v=vendedorById(id); if(!v) return;
  const r=round2((v.rate!=null?v.rate:(db.config.commissionRate||0))*100);
  const body=`<p class="u-m0 u-mb3 hint">${t("usr.vmd.hint")}</p>
    <div class="grid-form u-cols2 u-p0">
      <div class="field"><label>${t("usr.f.name")}</label><input class="inp" id="vmName" value="${esc(v.nombre||v.id)}"></div>
      <div class="field"><label>${t("usr.f.comm")}</label><input class="inp num" id="vmRate" inputmode="decimal" value="${esc(String(r))}"></div>
    </div>`;
  buildModal(t("usr.vmd.title")+" \u00b7 "+(v.nombre||v.id), body, [
    { cls:"btn danger", label:t("dat.sellers.remove"), act:()=>{
        if(!confirm(t("dat.cf.delseller",{name:vendedorNombre(id)}))) return;
        db.config.vendedores=vendedores().filter(x=>x.id!==id); save(); toast(t("dat.tt.sellerremoved"),"warn"); closeModal(); loadUsuarios(); } },
    { cls:"btn", label:t("usr.vmd.grant"), act:()=>{
        // precarga el formulario "Nuevo acceso" con el mismo id: al crearlo queda vinculado a este vendedor
        closeModal();
        const set=(i,val)=>{ const el=document.getElementById(i); if(el) el.value=val; };
        set("uNewName", v.nombre||v.id); set("uNewUser", v.id); set("uComm", String(r));
        const uu=document.getElementById("uNewUser"); if(uu) uu.dataset.vid=v.id;   // v103: queda vinculado a ESTE vendedor aunque su login sea otro
        const role=document.getElementById("uNewRole"); if(role){ role.value="seller"; role.dispatchEvent(new Event("change")); }
        const pass=document.getElementById("uNewPass");
        if(pass){ pass.scrollIntoView({block:"center",behavior:"smooth"}); setTimeout(()=>pass.focus(),250); }
        toast(t("usr.tt.grant")); } },
    { cls:"btn primary", label:t("usr.save"), act:()=>{
        const nombre=(document.getElementById("vmName").value||"").trim()||v.id;
        const pct=parseNum(document.getElementById("vmRate").value);
        if(isNaN(pct)){ toast(t("usr.vmd.badrate"),"warn"); return; }
        v.nombre=nombre; v.rate=Math.min(1,Math.max(0,round2(pct)/100)); save();
        toast(t("dat.tt.commset",{name:v.nombre,p:round2(v.rate*100)})); closeModal(); loadUsuarios(); } }
  ]);
}

async function loadUsuarios(){
  const box=document.getElementById("usrCards");
  const orphanBox=document.getElementById("vendOrphans");
  if(!box) return;
  try{
    const j=await apiUsers("GET");
    _usrCache=j.users||[];
    box.innerHTML=renderUsrCards(_usrCache);
    if(orphanBox) orphanBox.innerHTML="";
    wireUsrCards();
  }catch(e){
    box.innerHTML=`<p class="u-alert hint">${t("usr.err")}: ${esc(String(e&&e.message||e))}</p>`;
  }
}

function wireUsrCards(){
  const m=document.getElementById("main");
  m.querySelectorAll("[data-uedit]").forEach(el=>{
    el.onclick=()=> openUsuarioModal((_usrCache||[]).find(u=>u.user===el.dataset.uedit));
    el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.click(); } };
  });
  m.querySelectorAll("[data-vedit]").forEach(el=>{
    el.onclick=()=> openVendModal(el.dataset.vedit);
    el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.click(); } };
  });
  m.querySelectorAll("[data-vname]").forEach(inp=> inp.onchange=()=>{ const v=vendedorById(inp.dataset.vname); if(v){ v.nombre=(inp.value||"").trim()||v.id; save(); toast(t("dat.tt.renamed")); } });
  m.querySelectorAll("[data-vrate]").forEach(inp=> inp.onchange=()=>{ const v=vendedorById(inp.dataset.vrate); if(!v) return; const pct=parseNum(inp.value); if(isNaN(pct)){ inp.value=String(round2((v.rate||0)*100)); return; } v.rate=Math.min(1,Math.max(0,round2(pct)/100)); save(); toast(t("dat.tt.commset",{name:v.nombre,p:round2(v.rate*100)})); });
  m.querySelectorAll("[data-vdel]").forEach(b=> b.onclick=()=>{ const id=b.dataset.vdel; if(!confirm(t("dat.cf.delseller",{name:vendedorNombre(id)}))) return; db.config.vendedores=vendedores().filter(v=>v.id!==id); save(); toast(t("dat.tt.sellerremoved"),"warn"); loadUsuarios(); });
}

/* v86: campo de contraseña con ojito (mismo estilo que el login).
   autocomplete="new-password" evita que el navegador autocomplete la contraseña
   guardada del admin y la termine grabando como la del usuario editado. */
const EYE_SVG = `<svg class="eye-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
function passFieldHTML(id, placeholder){
  return `<div class="pass-wrap"><input class="inp" id="${id}" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="${esc(placeholder||"")}">
    <button type="button" class="pass-toggle" data-pt="${id}" title="${esc(t("boot.pass.show"))}" aria-label="${esc(t("boot.pass.show"))}" tabindex="-1">${EYE_SVG}</button></div>`;
}
document.addEventListener("click", e=>{
  const b = e.target.closest && e.target.closest("[data-pt]"); if(!b) return;
  const inp = document.getElementById(b.dataset.pt); if(!inp) return;
  const show = inp.type==="password"; inp.type = show ? "text" : "password";
  b.classList.toggle("show", show);
  const lbl = show ? t("boot.pass.hide") : t("boot.pass.show"); b.title = lbl; b.setAttribute("aria-label", lbl);
});

function openUsuarioModal(u){
  if(!u) return;
  const v = u.role==="seller" ? vendedorById(u.vendedorId) : null;
  const rate = v ? round2((v.rate!=null?v.rate:(db.config.commissionRate||0))*100) : round2((db.config.commissionRate||0)*100);
  const cliOpts=(db.clientes||[]).slice().sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||"")))
    .map(c=>`<option value="${esc(c.id)}" ${c.id===u.clienteId?"selected":""}>${esc(c.nombre||c.id)}</option>`).join("");
  const body=`
    <div class="u-cols2 u-p0 grid-form">
      <div class="field"><label>${t("usr.f.name")}</label><input class="inp" id="eName" value="${esc(u.name||"")}"></div>
      <div class="field"><label>${t("usr.f.user")}</label><input class="inp" value="${esc(u.user)}" disabled></div>
      <div class="u-span2 field"><label for="ePass">${t("usr.md.pass")}</label>${passFieldHTML("ePass", t("usr.md.passph"))}
        <div class="pm-sub">${t("usr.md.passhint")}</div></div>
      <div class="field"><label>${t("usr.f.role")}</label>
        <select class="inp" id="eRole">
          <option value="seller" ${u.role==="seller"?"selected":""}>${t("usr.role.seller")}</option>
          <option value="admin" ${u.role==="admin"?"selected":""}>${t("usr.role.admin")}</option>
        </select></div>
      <div class="field um-when-seller" style="${u.role==="seller"?"":"display:none"}"><label>${t("usr.f.comm")}</label><input class="inp num" id="eComm" value="${esc(String(rate))}"></div>
    </div>`;
  buildModal(t("usr.md.title")+" \u00b7 "+(u.name||u.user), body, [
    { cls:"btn danger", label:t("usr.del"), act: async()=>{
        if(!confirm(t("usr.cf.del",{u:u.user}))) return;
        try{ await apiUsers("DELETE",null,"?user="+encodeURIComponent(u.user)); toast(t("usr.tt.removed"),"warn"); closeModal(); loadUsuarios(); }
        catch(e){ toast(String(e&&e.message||e),"warn"); }
      } },
    // v108: resetear el 2FA de otro usuario (perdió el celular)
    ...((u.totp && typeof seg2faReset==="function" && session && u.user!==session.user) ? [{ cls:"btn", label:msgLoc(SEG_TXT.reset), act: async()=>{
        if(await seg2faReset(u.user)){ closeModal(); loadUsuarios(); } } }] : []),
    { cls:"btn", label:t("usr.cancel"), act: closeModal },
    { cls:"btn primary", label:t("usr.save"), act: async()=>{
        const role=document.getElementById("eRole").value;
        const name=(document.getElementById("eName").value||"").trim();
        const pass=document.getElementById("ePass").value||"";
        const body2={ user:u.user, role, name };
        if(pass) body2.pass=pass;
        if(role==="seller"){
          const vid=(u.role==="seller" && u.vendedorId) ? u.vendedorId : u.user;
          const commPct=parseNum(document.getElementById("eComm").value);
          const rate2=isNaN(commPct)?(db.config.commissionRate||0):Math.min(1,Math.max(0,round2(commPct)/100));
          const vv=vendedorById(vid);
          if(!vv){ db.config.vendedores=vendedores().concat([{ id:vid, nombre:name||vid, rate:rate2 }]); }
          else { if(name) vv.nombre=name; if(!isNaN(commPct)) vv.rate=rate2; }
          save();
          body2.vendedorId=vid;
        } else if(role==="store"){
          const cid=document.getElementById("eCli").value;
          if(!cid){ toast(t("usr.tt.needcliente"),"warn"); return; }
          body2.clienteId=cid;
        }
        try{ await apiUsers("POST", body2); toast(pass ? t("usr.tt.passchanged",{u:u.user}) : t("usr.tt.added")); closeModal(); loadUsuarios(); }
        catch(e){ toast(String(e&&e.message||e),"warn"); }
      } }
  ]);
  const er=document.getElementById("eRole");
  if(er) er.onchange=()=>{
    const r=er.value;
    document.querySelectorAll(".um-when-seller").forEach(el=> el.style.display = r==="seller"?"":"none");
    document.querySelectorAll(".um-when-store").forEach(el=> el.style.display = r==="store"?"":"none");
  };
}

function wireUsuariosView(){
  loadUsuarios();
  if(typeof wireSeg2fa==="function") wireSeg2fa();
  const m=document.getElementById("main");
  const roleSel=document.getElementById("uNewRole");
  const applyAddRoleUI=()=>{
    const r=roleSel?roleSel.value:"seller";
    m.querySelectorAll(".u-when-seller").forEach(el=> el.style.display = r==="seller"?"":"none");
    m.querySelectorAll(".u-when-store").forEach(el=> el.style.display = r==="store"?"":"none");
  };
  if(roleSel) roleSel.onchange=applyAddRoleUI;
  applyAddRoleUI();
  const uAdd=document.getElementById("uAdd");
  if(uAdd) uAdd.onclick=async()=>{
    const user=(document.getElementById("uNewUser").value||"").trim().toLowerCase().replace(/[^a-z0-9_.-]/g,"");
    const pass=document.getElementById("uNewPass").value||"";
    const role=document.getElementById("uNewRole").value;
    const name=(document.getElementById("uNewName").value||"").trim();
    if(!user){ toast(t("usr.tt.needuser"),"warn"); return; }
    const existe=(_usrCache||[]).some(u=>u.user===user);
    if(!existe && !pass){ toast(t("usr.tt.needpass"),"warn"); return; }
    const body={ user, role, name };
    if(pass) body.pass=pass;
    if(role==="seller"){
      // v103: si viene de "Pasar a usuario de la app", el vendedor es el de la ficha (su login puede ser distinto)
      const uuEl=document.getElementById("uNewUser");
      const vid=(uuEl && uuEl.dataset.vid) || user;
      const commPct=parseNum(document.getElementById("uComm").value);
      const rate=isNaN(commPct)?(db.config.commissionRate||0):Math.min(1,Math.max(0,round2(commPct)/100));
      const vv=vendedorById(vid);
      if(!vv){ db.config.vendedores=vendedores().concat([{ id:vid, nombre:name||vid, rate }]); }
      else { if(name) vv.nombre=name; if(!isNaN(commPct)) vv.rate=rate; }
      save();
      body.vendedorId=vid;
    } else if(role==="store"){
      const cid=document.getElementById("uCli").value;
      if(!cid){ toast(t("usr.tt.needcliente"),"warn"); return; }
      body.clienteId=cid;
    }
    try{
      await apiUsers("POST", body);
      toast(t("usr.tt.added"));
      ["uNewUser","uNewPass","uNewName","uComm"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      { const uuEl=document.getElementById("uNewUser"); if(uuEl) delete uuEl.dataset.vid; }
      loadUsuarios();
    }catch(e){ toast(String(e&&e.message||e),"warn"); }
  };
}

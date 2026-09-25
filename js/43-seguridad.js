/* ============================================================
   43 · Seguridad (v108): 2FA con app autenticadora + sesión por cookie
   ------------------------------------------------------------
   - Login en 2 pasos: si el usuario tiene 2FA, /login devuelve un
     "ticket" y acá se pide el código de 6 dígitos (o uno de recuperación).
   - Panel "Verificación en dos pasos" en Usuarios: activar (contraseña →
     QR → código → códigos de recuperación) y desactivar.
   - Todo el texto va con textContent / esc(): nada del servidor entra
     como HTML.
   Requiere vendor/qrcode.js (qrcode-generator 1.4.4, MIT).
   ============================================================ */

const SEG_TXT = {
  titulo:   { es:"Verificación en dos pasos", en:"Two-step verification" },
  pide:     { es:"Abrí tu app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…) y escribí el código de 6 dígitos.",
              en:"Open your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and enter the 6-digit code." },
  codigo:   { es:"Código", en:"Code" },
  verificar:{ es:"Verificar", en:"Verify" },
  volver:   { es:"Volver", en:"Back" },
  recupHint:{ es:"¿Perdiste el celular? Escribí uno de tus códigos de recuperación (formato xxxx-xxxx).",
              en:"Lost your phone? Enter one of your recovery codes (xxxx-xxxx)." },
  on:       { es:"Activa", en:"On" },
  off:      { es:"Desactivada", en:"Off" },
  explica:  { es:"Además de la contraseña, se pide un código que cambia cada 30 segundos en tu celular. Si alguien consigue tu contraseña, igual no puede entrar.",
              en:"Besides your password, a code that changes every 30 seconds on your phone is required. Even with your password, nobody else can get in." },
  activar:  { es:"Activar", en:"Turn on" },
  desactivar:{ es:"Desactivar", en:"Turn off" },
  pass:     { es:"Tu contraseña actual", en:"Your current password" },
  paso1:    { es:"1. Escaneá este QR con tu app autenticadora (o cargá la clave a mano).", en:"1. Scan this QR with your authenticator app (or enter the key manually)." },
  paso2:    { es:"2. Escribí el código que te muestra la app.", en:"2. Enter the code the app shows." },
  clave:    { es:"Clave manual", en:"Manual key" },
  abrirApp: { es:"Abrir en la app del celular", en:"Open in phone app" },
  listo:    { es:"2FA activado. Las demás sesiones abiertas se cerraron.", en:"2FA is on. Other open sessions were signed out." },
  recupTit: { es:"Guardá estos códigos de recuperación", en:"Save these recovery codes" },
  recupTxt: { es:"Cada uno sirve UNA vez si perdés el celular. No se vuelven a mostrar: copialos a un lugar seguro (gestor de contraseñas, papel guardado).",
              en:"Each works ONCE if you lose your phone. They won't be shown again: store them somewhere safe (password manager, paper)." },
  copiar:   { es:"Copiar", en:"Copy" },
  copiado:  { es:"Copiado", en:"Copied" },
  quedan:   { es:"Códigos de recuperación restantes", en:"Recovery codes left" },
  desTxt:   { es:"Para desactivar, confirmá contraseña y un código actual (o de recuperación).", en:"To turn off, confirm your password and a current (or recovery) code." },
  desOk:    { es:"2FA desactivado.", en:"2FA turned off." },
  noApp:    { es:"Tu usuario viene del secret de respaldo: pasalo a usuario de la app para poder usar 2FA.", en:"Your login comes from the backup secret: move it to an app user to use 2FA." },
  reset:    { es:"Resetear 2FA", en:"Reset 2FA" },
  resetCf:  { es:"¿Resetear el 2FA de este usuario? Lo va a poder volver a activar él mismo. Se cierran sus sesiones.", en:"Reset this user's 2FA? They can turn it on again. Their sessions will be closed." },
  resetOk:  { es:"2FA reseteado.", en:"2FA reset." }
};
const segT = k => msgLoc(SEG_TXT[k]);

async function segPost(path, body){
  const res = await apiFetch(apiBase()+path, { method:"POST", headers:authHeaders(), body:JSON.stringify(body||{}) });
  const j = await res.json().catch(()=>({}));
  if(res.status===401 && !(j && (j.es||j.en))){ forceLogout(); throw new Error(t("core.tt.expired")); }
  if(!res.ok) throw new Error(srvErrText(j, res.status));
  return j;
}
/* Tras activar 2FA el servidor cierra las otras sesiones y nos da una nueva. */
function segAdoptarSesion(j){
  if(!session || !j) return;
  if(j.token){ session.token = j.token; }
  if(j.cookie){ session.cookie = true; delete session.token; }
  saveSession();
}

/* ---------- Paso 2 del login ---------- */
function pedirCodigo2FA(ticket){
  return new Promise(resolve=>{
    const card = document.querySelector("#login .login-card");
    if(!card){ resolve(null); return; }
    const ocultos = [...card.children].filter(el=> !el.classList.contains("login-logo-wrap") && !el.classList.contains("login-build"));
    ocultos.forEach(el=> el.hidden = true);
    const box = document.createElement("div");
    box.className = "seg-2fa-step";
    const h = document.createElement("h3"); h.textContent = segT("titulo"); h.className = "u-m0";
    const p = document.createElement("p"); p.className = "login-sub"; p.textContent = segT("pide");
    const f = document.createElement("div"); f.className = "field";
    const lb = document.createElement("label"); lb.htmlFor = "login2fa"; lb.textContent = segT("codigo");
    const inp = document.createElement("input");
    Object.assign(inp, { id:"login2fa", className:"inp", inputMode:"numeric", autocomplete:"one-time-code", maxLength:12, placeholder:"123456" });
    inp.setAttribute("autocapitalize","none"); inp.setAttribute("spellcheck","false");
    f.append(lb, inp);
    const errEl = document.createElement("div"); errEl.className = "login-err"; errEl.setAttribute("role","alert");
    const btn = document.createElement("button"); btn.className = "btn primary login-btn"; btn.textContent = segT("verificar");
    const back = document.createElement("button"); back.className = "btn"; back.type = "button"; back.textContent = segT("volver"); back.style.marginTop = "8px";
    const hint = document.createElement("p"); hint.className = "hint"; hint.style.fontSize = "var(--fs-xs)"; hint.textContent = segT("recupHint");
    box.append(h, p, f, errEl, btn, back, hint);
    card.insertBefore(box, card.querySelector(".login-build"));
    setTimeout(()=> inp.focus(), 50);

    const cerrar = val => { box.remove(); ocultos.forEach(el=> el.hidden = false); resolve(val); };
    back.onclick = ()=> cerrar(null);
    const enviar = async ()=>{
      const code = (inp.value||"").trim();
      if(!code) return;
      btn.disabled = true; errEl.textContent = "";
      try{
        const res = await apiFetch(apiBase()+"/login/2fa", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ ticket, code }) });
        const j = await res.json().catch(()=>({}));
        if(res.ok && j.ok){ cerrar(j); return; }
        errEl.textContent = srvErrText(j, res.status);
        if(j && j.error==="2fa ticket expired"){ setTimeout(()=> cerrar(null), 1800); }
        inp.select();
      }catch(e){ errEl.textContent = String(e && e.message || e); }
      finally{ btn.disabled = false; }
    };
    btn.onclick = enviar;
    inp.addEventListener("keydown", e=>{ if(e.key==="Enter") enviar(); });
    inp.addEventListener("input", ()=>{ if(/^\d{6}$/.test(inp.value.trim())) enviar(); });   // autoenvía al completar 6 dígitos
  });
}

/* ---------- Panel en Usuarios ---------- */
function seg2faPanelHTML(){
  return `<div class="panel" id="seg2faPanel">
    <div class="phead"><h3>${esc(segT("titulo"))}</h3><span class="pill" id="seg2faEstado">…</span></div>
    <div class="u-p5">
      <p class="u-m0 hint">${esc(segT("explica"))}</p>
      <div id="seg2faBody" style="margin-top:10px"></div>
    </div>
  </div>`;
}
async function wireSeg2fa(){
  const body = document.getElementById("seg2faBody"), pill = document.getElementById("seg2faEstado");
  if(!body) return;
  let st;
  try{
    const res = await apiFetch(apiBase()+"/2fa", { headers:authHeaders() });
    st = await res.json().catch(()=>({}));
    if(!res.ok){ pill.textContent = "—"; body.textContent = (st && st.error==="2fa needs app user") ? segT("noApp") : srvErrText(st, res.status); return; }
  }catch(e){ pill.textContent = "—"; body.textContent = String(e && e.message || e); return; }
  pill.textContent = st.on ? segT("on") : segT("off");
  pill.classList.toggle("ok", !!st.on);
  body.replaceChildren();
  const btn = document.createElement("button");
  btn.className = st.on ? "btn danger" : "btn primary";
  btn.textContent = st.on ? segT("desactivar") : segT("activar");
  btn.onclick = st.on ? seg2faDesactivar : seg2faActivar;
  body.append(btn);
  if(st.on){ const q = document.createElement("p"); q.className = "hint"; q.textContent = segT("quedan")+": "+(st.recuperacion||0); body.append(q); }
}
function segCampo(id, label, attrs){
  return `<div class="field"><label for="${id}">${esc(label)}</label><input class="inp" id="${id}" ${attrs||""}></div>`;
}
function seg2faActivar(){
  buildModal(segT("titulo"), `${segCampo("segPass", segT("pass"), 'type="password" autocomplete="current-password"')}<div id="segSetup"></div>`, [
    { cls:"btn", label:t("usr.cancel"), act: closeModal },
    { cls:"btn primary", label:segT("activar"), act: async()=>{
        const setup = document.getElementById("segSetup");
        const code = document.getElementById("segCode");
        try{
          if(!code){   // etapa 1: contraseña -> QR
            const j = await segPost("/2fa/setup", { pass: document.getElementById("segPass").value||"" });
            document.getElementById("segPass").closest(".field").hidden = true;
            seg2faPintarQR(setup, j);
            return;
          }
          // etapa 2: código -> activado + códigos de recuperación
          const j = await segPost("/2fa/activar", { code: (code.value||"").trim() });
          segAdoptarSesion(j);
          closeModal(); toast(segT("listo"));
          seg2faMostrarRecuperacion(j.recuperacion||[]);
          wireSeg2fa();
        }catch(e){ toast(String(e && e.message || e), "warn"); }
    } }
  ]);
  setTimeout(()=>{ const p=document.getElementById("segPass"); if(p) p.focus(); }, 50);
}
function seg2faPintarQR(host, j){
  host.replaceChildren();
  const p1 = document.createElement("p"); p1.className = "u-m0"; p1.textContent = segT("paso1");
  const qrBox = document.createElement("div"); qrBox.className = "seg-qr";
  qrBox.style.cssText = "background:#fff;padding:12px;border-radius:var(--r-md,10px);width:max-content;margin:10px auto";
  try{
    const qr = qrcode(0, "M"); qr.addData(j.otpauth); qr.make();
    // SVG generado por la librería a partir de NUESTRO texto otpauth (no hay datos de terceros en el markup)
    qrBox.innerHTML = qr.createSvgTag({ cellSize:5, margin:0, scalable:false });
  }catch(e){ qrBox.textContent = "QR no disponible"; }
  const clave = document.createElement("p"); clave.className = "hint"; clave.style.wordBreak = "break-all";
  clave.textContent = segT("clave")+": "+String(j.secret||"").replace(/(.{4})/g,"$1 ").trim();
  const link = document.createElement("a"); link.href = j.otpauth; link.textContent = segT("abrirApp"); link.className = "hint";
  const p2 = document.createElement("p"); p2.textContent = segT("paso2"); p2.style.marginTop = "10px";
  const f = document.createElement("div"); f.className = "field";
  const inp = document.createElement("input");
  Object.assign(inp, { id:"segCode", className:"inp", inputMode:"numeric", autocomplete:"one-time-code", maxLength:6, placeholder:"123456" });
  f.append(inp);
  host.append(p1, qrBox, clave, link, p2, f);
  setTimeout(()=> inp.focus(), 50);
}
function seg2faMostrarRecuperacion(codes){
  const lista = codes.map(c=>`<code style="font-size:var(--fs-md,15px);letter-spacing:.06em">${esc(c)}</code>`).join("<br>");
  buildModal(segT("recupTit"), `<p class="u-m0 hint">${esc(segT("recupTxt"))}</p><div style="margin:12px 0;line-height:1.9">${lista}</div>`, [
    { cls:"btn", label:segT("copiar"), act: async()=>{ try{ await navigator.clipboard.writeText(codes.join("\n")); toast(segT("copiado")); }catch(_){} } },
    { cls:"btn primary", label:"OK", act: closeModal }
  ]);
}
function seg2faDesactivar(){
  buildModal(segT("titulo"), `<p class="u-m0 u-mb3 hint">${esc(segT("desTxt"))}</p>
    ${segCampo("segPass", segT("pass"), 'type="password" autocomplete="current-password"')}
    ${segCampo("segCode", segT("codigo"), 'inputmode="numeric" autocomplete="one-time-code" maxlength="12"')}`, [
    { cls:"btn", label:t("usr.cancel"), act: closeModal },
    { cls:"btn danger", label:segT("desactivar"), act: async()=>{
        try{
          await segPost("/2fa/desactivar", { pass: document.getElementById("segPass").value||"", code: (document.getElementById("segCode").value||"").trim() });
          closeModal(); toast(segT("desOk"), "warn"); wireSeg2fa();
        }catch(e){ toast(String(e && e.message || e), "warn"); }
    } }
  ]);
}
/* Admin: resetear el 2FA de OTRO usuario (perdió el celular). */
async function seg2faReset(user){
  if(!confirm(segT("resetCf"))) return false;
  try{ await apiUsers("POST", { user, reset2fa:true }); toast(segT("resetOk")); return true; }
  catch(e){ toast(String(e && e.message || e), "warn"); return false; }
}

/* ============================================================
   Modal genérico
   ============================================================ */
/* v97 · Accesibilidad de modales: role="dialog" + aria-modal + título asociado,
   foco al abrir (al contenedor, para no levantar el teclado del celular),
   Tab no se escapa del modal, el fondo queda "inert" y el foco vuelve a donde estaba. */
let _modalReturnFocus = null;
function _modalBg(){ return document.querySelectorAll("body > .topbar, body > header, body > .app"); }
function buildModal(title, bodyHTML, buttons=[], wide=false, extraFoot=""){
  const root=document.getElementById("modalRoot");
  // si ya había un modal abierto (modal que abre otro), conservamos el foco de origen del primero
  if(!root.firstElementChild) _modalReturnFocus = document.activeElement;
  root.innerHTML=`
    <div class="scrim" id="scrim">
      <div class="modal ${wide===true?'wide':(typeof wide==='string'?wide:'')}" role="dialog" aria-modal="true" aria-labelledby="mTitle" tabindex="-1">
        <div class="mhead"><h3 id="mTitle">${esc(title)}</h3><button class="x" id="xClose" aria-label="${t("common.close")}" title="${t("common.close")}">×</button></div>
        <div class="mbody">${bodyHTML}</div>
        ${extraFoot?`<div class="mextra" style="padding:0 22px">${extraFoot}</div>`:""}
        <div class="mfoot" id="mfoot"></div>
      </div>
    </div>`;
  const foot=document.getElementById("mfoot");
  // separar botón de eliminar (izquierda) del resto (derecha)
  const left=buttons.filter(b=>b.cls.includes("danger"));
  const right=buttons.filter(b=>!b.cls.includes("danger"));
  const wrapL=document.createElement("div"); wrapL.style.display="flex"; wrapL.style.gap="8px";
  const wrapR=document.createElement("div"); wrapR.style.display="flex"; wrapR.style.gap="8px"; wrapR.style.marginLeft="auto";
  left.forEach(b=> wrapL.appendChild(mkBtn(b)));
  right.forEach(b=> wrapR.appendChild(mkBtn(b)));
  foot.appendChild(wrapL); foot.appendChild(wrapR);
  document.getElementById("xClose").onclick=closeModal;
  document.getElementById("scrim").addEventListener("mousedown",e=>{ if(e.target.id==="scrim") closeModal(); });
  document.addEventListener("keydown", escClose);
  _modalBg().forEach(el=> el.inert = true);
  const dlg=root.querySelector(".modal");
  setTimeout(()=>{ if(dlg && !dlg.contains(document.activeElement)) dlg.focus({preventScroll:true}); }, 0);
  return root;
}
function mkBtn(b){
  const el=document.createElement("button"); el.className=b.cls;
  // b.icon: SVG de la biblioteca ICO (constante propia, no dato del usuario); el texto va como texto
  if(b.icon){ el.innerHTML=b.icon; el.appendChild(document.createTextNode(b.label)); } else el.textContent=b.label;
  el.onclick=b.act; return el;
}
function escClose(e){
  if(e.key==="Escape"){ closeModal(); return; }
  if(e.key!=="Tab") return;
  const dlg=document.querySelector("#modalRoot .modal"); if(!dlg) return;
  // si el foco está en un popup flotante (buscador de productos, calendario) no lo tocamos
  if(!dlg.contains(document.activeElement) && document.activeElement!==document.body) return;
  const f=[...dlg.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(el=> !el.disabled && el.offsetParent!==null);
  if(!f.length) return;
  const a=f[0], z=f[f.length-1];
  if(e.shiftKey && (document.activeElement===a || document.activeElement===dlg)){ e.preventDefault(); z.focus(); }
  else if(!e.shiftKey && document.activeElement===z){ e.preventDefault(); a.focus(); }
}
function closeModal(){
  if(typeof closeProductPicker==="function") closeProductPicker();
  if(typeof hideNameTip==="function") hideNameTip();
  document.getElementById("modalRoot").innerHTML="";
  document.removeEventListener("keydown", escClose);
  _modalBg().forEach(el=> el.inert = false);
  const back=_modalReturnFocus; _modalReturnFocus=null;
  if(back && back.isConnected && back.focus) back.focus({preventScroll:true});
}

/* ---------- Arranque ---------- */
// Cableado del login (elementos estáticos)
document.getElementById("loginBtn").onclick = doLogin;
document.getElementById("loginUser").addEventListener("keydown", e=>{ if(e.key==="Enter") document.getElementById("loginPass").focus(); });
document.getElementById("loginPass").addEventListener("keydown", e=>{ if(e.key==="Enter") doLogin(); });
// Ojito: mostrar / ocultar contraseña
const _pt=document.getElementById("loginPassToggle");
/* Label del ojito según estado actual (se re-llama al cambiar idioma). */
function paintPassToggle(){
  const p=document.getElementById("loginPass"); if(!_pt||!p) return;
  const lbl = p.type==="text" ? t("boot.pass.hide") : t("boot.pass.show");
  _pt.setAttribute("aria-label", lbl); _pt.title=lbl;
}
if(_pt) _pt.onclick=()=>{
  const p=document.getElementById("loginPass"); if(!p) return;
  const mostrar = p.type==="password";
  p.type = mostrar ? "text" : "password";
  _pt.classList.toggle("show", mostrar);
  paintPassToggle();
  p.focus();
};
// Botones estáticos (tema / cerrar sesión / sincronizar) — hay uno en el sidebar y otro en el nav mobile
document.querySelectorAll("[data-logout-side]").forEach(b=> b.onclick=logout);
document.querySelectorAll("[data-syncside]").forEach(b=> b.onclick=()=> pullNow());
document.querySelectorAll("[data-theme-toggle]").forEach(b=> b.onclick=toggleTheme);
// Topbar glass: al scrollear aparece el fondo tenue + hairline inferior
const _tb=document.getElementById("topbar");
if(_tb){ const onScroll=()=>_tb.classList.toggle("scrolled", (window.scrollY||document.documentElement.scrollTop)>4);
  window.addEventListener("scroll", onScroll, {passive:true}); onScroll(); }

/* ---------- Tema claro / oscuro ---------- */
const MOON_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
function currentTheme(){ return document.documentElement.getAttribute("data-theme")==="dark" ? "dark" : "light"; }
function applyTheme(th){
  document.documentElement.setAttribute("data-theme", th);
  try{ localStorage.setItem("gstock_theme", th); }catch(e){}
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", th==="dark" ? "#0f141b" : "#1b2430");
  paintThemeBtn();
}
function toggleTheme(){ applyTheme(currentTheme()==="dark" ? "light" : "dark"); }
function paintThemeBtn(){
  const dark = currentTheme()==="dark";
  document.querySelectorAll("[data-themeicon]").forEach(el=>{
    el.innerHTML = dark ? MOON_SVG : SUN_SVG;         // ícono = modo actual; la posición indica el estado
  });
  document.querySelectorAll("[data-theme-toggle]").forEach(b=>{
    const lbl = dark ? t("boot.theme.light") : t("boot.theme.dark");
    b.title = lbl; b.setAttribute("aria-label", lbl);
  });
}
paintThemeBtn();

if(session){
  // El stock es un pool único: todos (admin y vendedores) arrancan consolidados.
  activeStore = "all";
  // si un vendedor tenía abierta una vista admin-only, lo mandamos al panel
  if(!isAdmin() && ADMIN_VIEWS.includes(view)) view="dash";
  hideLogin();
  render();
  paintSync();
  // Después de traer el estado del servidor, el admin congela los meses de stock ya cerrados
  // (si hay conflicto de sync, no: primero hay que resolverlo).
  pullNow().then(()=>{ if(typeof finFreezeStockSnaps==="function" && syncState!=="conflict" && finFreezeStockSnaps()) render(); });
} else {
  render();          // deja el DOM de la app armado por debajo
  showLogin();
}

/* Re-sincronizar al volver la conexión o el foco */
window.addEventListener("online", ()=>{ if(session){ syncMeta.dirty ? pushNow() : pullNow(); } });
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden && session) pullNow(); });


/* Overflow "⋯" de filas (item 8, portado de stockselect). Delegado y global.
   Diferencia: el menú se posiciona FIXED respecto del botón, porque las tablas van dentro de
   .table-scroll (overflow) y un menú absolute en las últimas filas quedaba recortado.
   Si no entra abajo, abre hacia arriba. Se cierra al elegir, click afuera o Escape. */
(function(){
  function closeAll(except){
    document.querySelectorAll(".ovf-menu:not([hidden])").forEach(function(mn){
      if(mn===except) return;
      mn.setAttribute("hidden","");
      var tg=mn.parentElement && mn.parentElement.querySelector("[data-ovf]");
      if(tg) tg.setAttribute("aria-expanded","false");
    });
  }
  function place(tog, menu){
    var r=tog.getBoundingClientRect();
    menu.style.position="fixed"; menu.style.right=Math.max(8, window.innerWidth-r.right)+"px"; menu.style.left="auto";
    var h=menu.offsetHeight||0;
    var below = r.bottom+6+h <= window.innerHeight-8;
    menu.style.top = (below ? r.bottom+6 : Math.max(8, r.top-6-h))+"px";
  }
  document.addEventListener("click", function(e){
    var tog = e.target.closest && e.target.closest("[data-ovf]");
    if(tog){
      e.preventDefault(); e.stopPropagation();
      var menu = tog.parentElement.querySelector(".ovf-menu");
      var willOpen = menu.hasAttribute("hidden");
      closeAll(willOpen?menu:null);
      if(willOpen){ menu.removeAttribute("hidden"); place(tog, menu); tog.setAttribute("aria-expanded","true"); }
      else { menu.setAttribute("hidden",""); tog.setAttribute("aria-expanded","false"); }
      return;
    }
    var item = e.target.closest && e.target.closest(".ovf-menu button");
    if(item){ closeAll(null); return; }   // el handler propio del botón ya corre; sólo cerramos
    closeAll(null);
  }, false);
  document.addEventListener("keydown", function(e){ if(e.key==="Escape") closeAll(null); });
  // Al scrollear, el menú abierto acompaña a su botón (y se cierra si el botón sale de pantalla).
  window.addEventListener("scroll", function(){
    document.querySelectorAll(".ovf-menu:not([hidden])").forEach(function(mn){
      var tg=mn.parentElement && mn.parentElement.querySelector("[data-ovf]"); if(!tg) return;
      var r=tg.getBoundingClientRect();
      if(r.bottom<0 || r.top>window.innerHeight) closeAll(null); else place(tg, mn);
    });
  }, true);
  window.addEventListener("resize", function(){ closeAll(null); });
})();

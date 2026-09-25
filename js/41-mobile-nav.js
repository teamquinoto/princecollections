/* ============================================================
   gestordestock — 41-mobile-nav.js   (v94)
   Navegación mobile pensada para el pulgar:
     · #tabbar     barra inferior con 4 destinos + "Más"
     · #fabVenta   botón flotante "Nueva venta" (la acción más frecuente)
     · #moreSheet  hoja que sube desde abajo con el resto de las vistas
                   + preferencias (idioma, tema, sync, cerrar sesión)
   Los botones con data-view los cablea el router (03-router.js);
   acá sólo se maneja abrir/cerrar la hoja, el foco y el FAB.
   ============================================================ */
(function(){
  const TABS = ["dash","ventas","prod","clientes"];   // vistas que tienen pestaña propia
  const sheet = document.getElementById("moreSheet");
  const scrim = document.getElementById("moreScrim");
  const btnMore = document.getElementById("tabMore");
  const fab = document.getElementById("fabVenta");
  if(!sheet || !scrim || !btnMore) return;

  let lastFocus = null;

  function openSheet(){
    lastFocus = document.activeElement;
    sheet.hidden = false; scrim.hidden = false;
    // doble rAF: primero se pinta visible, después arranca la transición
    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      sheet.classList.add("open"); scrim.classList.add("open");
    }));
    btnMore.setAttribute("aria-expanded","true");
    document.body.classList.add("sheet-open");
    const first = sheet.querySelector("button:not([hidden])");
    if(first) setTimeout(()=> first.focus({preventScroll:true}), 60);
    document.addEventListener("keydown", onKey);
  }
  function closeSheet(){
    sheet.classList.remove("open"); scrim.classList.remove("open");
    btnMore.setAttribute("aria-expanded","false");
    document.body.classList.remove("sheet-open");
    document.removeEventListener("keydown", onKey);
    const done = ()=>{ sheet.hidden = true; scrim.hidden = true; };
    // con reduced-motion no hay transición: cerramos directo
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) done(); else setTimeout(done, 220);
    if(lastFocus && lastFocus.focus) lastFocus.focus({preventScroll:true});
  }
  function onKey(e){
    if(e.key==="Escape"){ closeSheet(); return; }
    // trampa de foco simple: Tab no se escapa de la hoja mientras está abierta
    if(e.key==="Tab"){
      const f = [...sheet.querySelectorAll("button")].filter(b=> b.offsetParent!==null);
      if(!f.length) return;
      const a=f[0], z=f[f.length-1];
      if(e.shiftKey && document.activeElement===a){ e.preventDefault(); z.focus(); }
      else if(!e.shiftKey && document.activeElement===z){ e.preventDefault(); a.focus(); }
    }
  }

  btnMore.addEventListener("click", ()=> sheet.hidden ? openSheet() : closeSheet());
  scrim.addEventListener("click", closeSheet);
  // al elegir una vista dentro de la hoja, se cierra sola (el router ya hizo setView)
  sheet.querySelectorAll("button[data-view]").forEach(b=> b.addEventListener("click", closeSheet));
  // cerrar sesión pide confirmación: cerramos la hoja antes para que no quede tapando
  sheet.querySelectorAll("[data-logout-side]").forEach(b=> b.addEventListener("click", closeSheet));

  if(fab) fab.addEventListener("click", ()=>{ if(typeof openDoc==="function") openDoc("venta"); });

  // Pestaña "Más" activa cuando la vista actual no tiene pestaña propia
  window.syncTabMore = function(v){
    // marca también la pestaña propia (al arrancar, el router todavía no pasó por acá)
    document.querySelectorAll("#tabbar button[data-view]").forEach(b=>{
      const on = b.dataset.view===v;
      b.classList.toggle("on", on); b.setAttribute("aria-current", on ? "page" : "false");
    });
    const inSheet = !TABS.includes(v);
    btnMore.classList.toggle("on", inSheet);
    btnMore.setAttribute("aria-current", inSheet ? "page" : "false");
  };
  if(typeof view!=="undefined") syncTabMore(view);
})();

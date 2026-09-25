/* ============================================================
   Actualización controlada de la PWA (botón propio "Update").
   Cuando GitHub Pages publica una versión nueva, el navegador instala
   el SW nuevo pero lo deja en estado "waiting" (no lo activa solo).
   Detectamos ese estado y mostramos un botón flotante; al tocarlo, le
   mandamos SKIP_WAITING al SW y recargamos con la versión nueva.
   ============================================================ */
function mostrarBotonUpdate(sw){
  if(document.getElementById("pwaUpdate")) return;   // ya está en pantalla
  const bar = document.createElement("div");
  bar.id = "pwaUpdate";
  bar.innerHTML = `<span>${t("boot.pwa.newversion")}</span><button id="pwaUpdateBtn">${t("boot.pwa.update")}</button>`;
  document.body.appendChild(bar);
  document.getElementById("pwaUpdateBtn").onclick = ()=>{
    if(sw) sw.postMessage({ type:"SKIP_WAITING" });   // pedile al SW que se active
    // cuando el nuevo SW tome control, recargamos una sola vez
    bar.querySelector("button").textContent = t("boot.pwa.updating");
  };
}
if ("serviceWorker" in navigator) {
  let recargando = false;
  /* v100: sólo recargamos si YA había un SW controlando la página (= se aplicó una
     versión nueva con "Update"). En la PRIMERA visita no hay controlador: el SW se
     instala y toma control con clients.claim(), y antes eso recargaba la página
     sola (se perdía lo que el usuario estaba escribiendo en el login). */
  let habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{
    if(recargando) return;
    // primera visita: este es el SW inicial tomando control -> no recargamos,
    // pero desde ahora cualquier cambio (un "Update" en esta misma sesión) sí recarga
    if(!habiaControlador){ habiaControlador = true; return; }
    recargando = true; window.location.reload();
  });
  window.addEventListener("load", () => {
    // updateViaCache:'none' -> el chequeo de sw.js NUNCA sale del cache HTTP,
    // así reg.update() siempre ve la última versión publicada en GitHub.
    navigator.serviceWorker.register("sw.js", { updateViaCache:"none" }).then(reg=>{
      // si ya hay uno esperando al cargar (versión nueva lista), mostramos el botón
      if(reg.waiting && navigator.serviceWorker.controller) mostrarBotonUpdate(reg.waiting);
      // si aparece uno nuevo mientras la app está abierta, esperamos a que instale
      reg.addEventListener("updatefound", ()=>{
        const nuevo = reg.installing;
        if(!nuevo) return;
        nuevo.addEventListener("statechange", ()=>{
          if(nuevo.state==="installed" && navigator.serviceWorker.controller){
            mostrarBotonUpdate(reg.waiting || nuevo);
          }
        });
      });
      // --- Chequeo AUTOMÁTICO de versión nueva, sin salir/entrar ---
      // El navegador por su cuenta casi no chequea; lo forzamos nosotros:
      //  1) cada 60 s mientras la app está abierta
      //  2) cuando volvés a la pestaña (visibilitychange)
      //  3) cuando recuperás internet (online)
      // Cualquiera de estos, si encuentra un sw.js nuevo, dispara 'updatefound'
      // -> 'statechange' -> aparece el botón "Update" solo.
      const chequear = ()=>{ try{ reg.update(); }catch(e){} };
      setInterval(chequear, 60000);
      document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) chequear(); });
      window.addEventListener("online", chequear);
      chequear();   // un primer chequeo apenas carga
    }).catch(err => console.warn("SW no registrado:", err));
  });
}


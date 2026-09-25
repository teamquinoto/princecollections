/* Tema claro/oscuro ANTES de pintar (sin parpadeo). Antes estaba escrito dentro de
   index.html; se movió a un archivo porque el blindaje (CSP) no deja correr código suelto. */
try{var _t=localStorage.getItem("gstock_theme");if(_t==="dark"||(!_t&&window.matchMedia&&matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.setAttribute("data-theme","dark");}else if(_t==="light"){document.documentElement.setAttribute("data-theme","light");}}catch(e){}

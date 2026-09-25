/* ============================================================
   Router de vistas
   ============================================================ */
let view = "dash";
const SECTION_OF = { guia:"help", dash:"op", ventas:"op", compras:"op", mov:"op",
                     prod:"cat", clientes:"cat",
                     resumen:"fin", analisis:"fin", pnl:"fin", gastos:"fin", plan:"fin", inv:"fin", datos:"dat", usuarios:"dat" };
let activeSection = "op";
function syncSectionUI(){
  document.querySelectorAll('#navSections button[data-section]').forEach(b=>
    b.classList.toggle("on", b.dataset.section===activeSection));
}
function wireSections(){
  document.querySelectorAll('#navSections button[data-section]').forEach(b=> b.onclick=()=>{
    activeSection=b.dataset.section; syncSectionUI();
    const first=Array.prototype.slice.call(
      document.querySelectorAll('#nav button[data-section="'+activeSection+'"]')
    ).find(x=> x.style.display!=="none" && !x.classList.contains("hide-sec"));
    if(first) setView(first.dataset.view);
  });
}
document.querySelectorAll("#nav button, #navMob button, #tabbar button[data-view], #moreSheet button[data-view]").forEach(b=>{
  b.addEventListener("click", ()=> setView(b.dataset.view));
});
function setView(v){
  // gate: admin-only views (purchases, investment, analysis, data) fall back to dashboard for sellers
  if(!isAdmin() && ADMIN_VIEWS.includes(v)) v="dash";
  /* v91: las pestañas con barra de período (Resumen, Análisis, P&L, Plan) arrancan
     siempre en "Mes" al entrar desde otra pestaña. Los demás filtros (juego, idioma,
     país, vendedor) se mantienen; re-renderizar la misma pestaña no toca nada. */
  if(v!==view && ["resumen","analisis","pnl","plan"].includes(v) && typeof finFiltros!=="undefined"){
    finFiltros.periodo = "mtd"; finFiltros.desde = ""; finFiltros.hasta = "";
  }
  view = v;
  activeSection = SECTION_OF[v] || activeSection;
  syncSectionUI();
  document.querySelectorAll("#nav button, #navMob button, #tabbar button[data-view], #moreSheet button[data-view]").forEach(b=>{
    b.classList.toggle("on", b.dataset.view===v);
    if(b.closest("#tabbar")) b.setAttribute("aria-current", b.dataset.view===v ? "page" : "false");
  });
  // v94: la pestaña "Más" queda activa cuando la vista vive dentro de la hoja
  if(typeof syncTabMore==="function") syncTabMore(v);
  render();
  // Enter transition only on tab change (not on every re-render by sort/filter).
  const mm=document.getElementById("main");
  if(mm){ mm.classList.remove("view-anim"); void mm.offsetWidth; mm.classList.add("view-anim"); }
}
/* Store switcher: All (admin only) + one chip per allowed store. Point 1. */
function stockViewSwitchHTML(){
  // Punto 2: sólo en vistas de stock (dashboard / productos).
  if(view!=="dash" && view!=="prod") return "";
  return `<div class="sb-viewas"><span class="sb-label">${t("bar.viewas")}</span>
    <button class="chip-btn ${stockView==="units"?"on":""}" data-stockview="units">${t("bar.units")}</button>
    <button class="chip-btn ${stockView==="cases"?"on":""}" data-stockview="cases">${t("bar.cases")}</button></div>`;
}
function storeBarHTML(){
  const sw = "";   // v99: "Ver como" se muestra en la cabecera de la tabla de stock (Panel / Productos), no arriba del título
  // El desglose por sociedad (procedencia) es sólo para el admin, con 2+ sociedades,
  // y SÓLO en las vistas donde aporta (analisis, prod, compras). En dashboard, ventas
  // y movimientos el stock es un pool único -> sin chips. Sin chips ni toggle -> sin barra.
  const showChips = isAdmin() && STORE_IDS.length>1 && viewUsesSociety();
  if(!showChips && !sw) return "";
  const chips = [];
  if(showChips){
    chips.push(`<button class="chip-btn ${activeStore==="all"?"on":""}" data-store="all">${t("bar.all")}</button>`);
    STORE_IDS.forEach(s=> chips.push(`<button class="chip-btn ${activeStore===s?"on":""}" data-store="${s}">${esc(storeName(s))}</button>`));
  }
  const left = chips.length ? `<span class="sb-label" title="${t("bar.society.tip")}">${t("bar.society")}</span>${chips.join("")}` : "";
  return `<div class="storebar">${left}${sw}</div>`;
}
function wireStoreBar(){
  document.querySelectorAll("[data-store]").forEach(b=> b.onclick=()=>{ activeStore=b.dataset.store; render(); });
  document.querySelectorAll("[data-stockview]").forEach(b=> b.onclick=()=>{ stockView=b.dataset.stockview; render(); });
}
function applyRoleUI(){
  // hide admin-only nav entries for sellers
  document.querySelectorAll("[data-admin-only]").forEach(el=> el.style.display = isAdmin()?"":"none");
  // role badge (mobile top bar): shows who is logged in and their role
  const admin = isAdmin();
  const nombre = (session && session.name) || (session && session.user) || "";
  const txt = session ? (admin ? t("role.admin") : (t("role.seller")+" · "+(nombre||"—"))) : t("role.local");
  document.querySelectorAll("[data-rolebadge]").forEach(el=>{
    el.textContent = txt;
    el.style.background = admin ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "color-mix(in srgb, var(--up) 18%, transparent)";
    el.style.color = admin ? "var(--accent-ink)" : "var(--up-ink)";
  });
}
function render(){
  // El rollup del P&L se cachea sólo dentro de un mismo render (antes nunca se invalidaba:
  // _pnlRev no existía y el P&L quedaba viejo tras cargar/editar ventas hasta recargar).
  if(typeof _pnlCache!=="undefined") _pnlCache = { rev:-1, map:{} };
  if(typeof _stkCache!=="undefined") _stkCache = null;   // historia de stock: se recalcula por render
  const m = document.getElementById("main");
  // El foco de sociedad (activeStore) sólo vive en Productos/Compras. En cualquier
  // otra vista el stock es un pool único: forzamos consolidado para que ni la tabla
  // de stock, ni las columnas, ni los conteos arrastren un foco de tienda latente.
  if(!viewUsesSociety()) activeStore = "all";
  const bar = storeBarHTML();
  if(view==="guia" && typeof viewGuia==="function") m.innerHTML = viewGuia();   // v100: pestaña 0 "Cómo usar" (admin y vendedor)
  else if(view==="dash") m.innerHTML = bar+viewDash();
  else if(view==="analisis") m.innerHTML = bar+viewAnalisis();
  else if(view==="prod") m.innerHTML = bar+viewProd();
  else if(view==="compras") m.innerHTML = bar+viewDocs("compra");
  else if(view==="ventas") m.innerHTML = bar+viewDocs("venta");
  else if(view==="clientes") m.innerHTML = viewClientes();
  else if(view==="mov") m.innerHTML = isAdmin()? (bar+viewMov()) : viewDash();
  else if(view==="inv") m.innerHTML = isAdmin()? viewInversiones() : viewDash();
  else if(view==="pnl") m.innerHTML = isAdmin()? (bar+viewPnL()) : viewDash();
  else if(view==="datos") m.innerHTML = viewDatos();
  else if(view==="usuarios") m.innerHTML = isAdmin()? viewUsuarios() : viewDash();
  else if(view==="resumen") m.innerHTML = isAdmin()? (bar+viewResumen()) : viewDash();   // v93: con barra de sociedad
  else if(view==="plan") m.innerHTML = isAdmin()? viewPlan() : viewDash();
  else if(view==="gastos") m.innerHTML = isAdmin()? viewGastos() : viewDash();
  applyRoleUI();
  wireStoreBar();
  wire();
  if(view==="pnl" && typeof wirePnL==="function") wirePnL();
  if(view==="resumen" && isAdmin()) wireResumen();
  if(view==="plan" && isAdmin()) wirePlan();
  if(view==="gastos" && isAdmin()) wireGastos();
  if(view==="guia" && typeof wireGuia==="function") wireGuia();
  // v100: la guía no vive en el menú: el botón "?" (pie del menú y barra mobile) se marca activo
  document.querySelectorAll("[data-open-guide]").forEach(b=>{
    b.classList.toggle("on", view==="guia");
    b.setAttribute("aria-current", view==="guia" ? "page" : "false");
  });
  fitKpiValues();
  // v100: tour de bienvenida del primer uso (91-onboarding.js). Sólo abre si hay sesión,
  // el login está oculto y este usuario todavía no lo vio; si no, no hace nada.
  if(typeof maybeStartOnboarding==="function") maybeStartOnboarding();
}

wireSections();
syncSectionUI();

/* ============================================================
   Ajuste de tamaño de los números grandes de las tarjetas KPI
   ------------------------------------------------------------
   El tamaño base sale del CSS (según el ancho de pantalla). Si aun así
   un número no entra en su tarjeta (montos altos, 6 tarjetas por fila,
   ventana angosta), se achica de a 1px hasta que entre, con un mínimo
   de 16px. Corre en cada render y al cambiar el tamaño de la ventana.
   ============================================================ */
function fitKpiValues(root){
  (root||document).querySelectorAll(".kpi .val, .pj-big b").forEach(el=>{
    el.style.fontSize = "";
    if(!el.clientWidth) return;                          // oculto / sin layout
    let fs = parseFloat(getComputedStyle(el).fontSize) || 30, guard = 0;
    while(el.scrollWidth > el.clientWidth + 1 && fs > 16 && guard++ < 30){ fs -= 1; el.style.fontSize = fs+"px"; }
  });
}
let _fitTimer = null;
window.addEventListener("resize", ()=>{ clearTimeout(_fitTimer); _fitTimer = setTimeout(()=> fitKpiValues(), 120); });

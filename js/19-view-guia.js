/* ============================================================
   gestordestock — 19-view-guia.js   (v100)
   PESTAÑA 0 · "Cómo usar esta app" (pedido del cliente:
   "How to use this asset" + navegador de pestañas + glosario
   para usuarios no técnicos).
   ------------------------------------------------------------
   - Distinta para admin y vendedor: el vendedor sólo ve las
     pestañas, pasos, palabras y problemas que le tocan.
   - Se abre con el botón "?" del pie del menú (y de la barra mobile);
     no ocupa lugar en el menú, que queda sólo para las secciones del ERP.
   - La lista de pestañas y sus íconos se leen del menú lateral
     (#nav): si mañana se agrega o se oculta una pestaña, la guía
     la sigue sola. Sólo hay que sumar sus textos en 00e-i18n-guia.
   - Los botones de la guía usan data-gd-* (NO data-open / data-view)
     para no chocar con el cableado global de wire() y del router.
   - Se renderiza desde render() (03-router.js) como view==="guia".
   ============================================================ */

/* Lista de sociedades en lenguaje natural: "Akira y Silver" / "Akira and Silver".
   La usan la guía y el tour (91-onboarding.js). */
function gdSocList(){
  const names = (typeof STORES!=="undefined" ? STORES : []).map(s=> s.name);
  try{ return new Intl.ListFormat((typeof lang==="function"?lang():"es"), { type:"conjunction" }).format(names); }
  catch(e){ return names.join(" / "); }
}

(function(){
  /* Pestañas en el mismo orden que el menú lateral, agrupadas por sección. */
  const GD_GROUPS = [
    { sec:"op",  views:["dash","ventas","compras","mov"] },
    { sec:"cat", views:["prod","clientes"] },
    { sec:"fin", views:["resumen","analisis","pnl","gastos","plan","inv"] },
    { sec:"dat", views:["datos","usuarios"] }
  ];

  /* Primeros pasos: es una secuencia real (por eso van numerados).
     go = pestaña a la que lleva · act = acción directa. */
  const GD_START = {
    admin:  [ {k:"a1", go:"prod"}, {k:"a2", go:"compras"}, {k:"a3", act:"venta"}, {k:"a4", go:"resumen"} ],
    seller: [ {k:"s1", go:"dash"}, {k:"s2", act:"venta"}, {k:"s3", go:"ventas"}, {k:"s4", go:"clientes"} ]
  };

  /* Glosario. admin:true = sólo lo ve el admin. view = dónde aparece (se oculta
     solo si esa pestaña no es accesible para el perfil). */
  const GD_GLOSS = [
    {id:"stock", view:"dash"}, {id:"sku", view:"prod"}, {id:"pool", view:"dash"},
    {id:"soc", admin:true, view:"compras"}, {id:"transit", view:"dash"}, {id:"recv", admin:true, view:"compras"},
    {id:"fifo"}, {id:"cost", admin:true, view:"prod"}, {id:"cogs", admin:true, view:"pnl"},
    {id:"margin", admin:true, view:"analisis"}, {id:"comm", view:"datos"}, {id:"reorder", view:"prod"},
    {id:"blocked", view:"dash"}, {id:"cases", view:"dash"}, {id:"game", view:"dash"}, {id:"lang", view:"prod"},
    {id:"kardex", admin:true, view:"mov"}, {id:"adjust", admin:true, view:"mov"}, {id:"vault", admin:true, view:"inv"},
    {id:"valuation", view:"dash"}, {id:"ship", view:"ventas"}, {id:"charges", view:"ventas"},
    {id:"selling", admin:true, view:"ventas"}, {id:"pay", view:"ventas"}, {id:"incomplete", view:"clientes"},
    {id:"synced"}, {id:"offline"}, {id:"conflict", view:"datos"}, {id:"catalog", view:"prod"},
    {id:"pricelist", view:"prod"}, {id:"trash", admin:true, view:"datos"}, {id:"plan", admin:true, view:"plan"},
    {id:"opex", admin:true, view:"gastos"}, {id:"pnl", admin:true, view:"pnl"}, {id:"mtd", admin:true, view:"resumen"},
    {id:"drill", admin:true, view:"analisis"}, {id:"breakeven", admin:true, view:"gastos"}
  ];

  /* Si algo falla. */
  const GD_FAQ = [
    {id:"offline"}, {id:"cantsell"}, {id:"update"}, {id:"mistake", go:"ventas"},
    {id:"conflict", admin:true, go:"datos"}, {id:"deleted", admin:true, go:"datos"}
  ];

  let gdQuery = "";   // búsqueda del glosario (sobrevive a re-renders, p. ej. al cambiar idioma)

  const admin = ()=> (typeof isAdmin==="function") && isAdmin();
  function navBtn(v){ return document.querySelector('#nav button[data-view="'+v+'"]'); }
  function viewAllowed(v){
    if(!v) return false;
    const b = navBtn(v);
    if(!b) return false;
    return admin() || !b.hasAttribute("data-admin-only");
  }
  function tabIcon(v){
    const svg = navBtn(v) && navBtn(v).querySelector(".ico svg");
    return svg ? svg.outerHTML : "";
  }
  function tabName(v){ return t("nav."+v); }
  /* Texto con variante para vendedor (clave + ".s"), si existe. */
  function tr(key, vars){
    if(!admin()){ const ks = key+".s", s = t(ks, vars); if(s!==ks) return s; }
    return t(key, vars);
  }

  const ICO_REPLAY = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  const ICO_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  /* ---------- secciones ---------- */
  function startHTML(){
    const steps = GD_START[admin()?"admin":"seller"];
    const items = steps.map((s,i)=>{
      const btn = s.act
        ? `<button type="button" class="btn sm primary" data-gd-act="${s.act}">${(typeof ICO!=="undefined"&&ICO.sale)||""}${t("gd.go.sale")}</button>`
        : `<button type="button" class="btn sm" data-gd-go="${s.go}">${t("gd.go",{tab:esc(tabName(s.go))})}</button>`;
      return `<li class="gd-step">
        <span class="gd-num" aria-hidden="true">${i+1}</span>
        <div class="gd-stepbody"><h4>${t("gd."+s.k+".t")}</h4><p>${t("gd."+s.k+".b")}</p>${btn}</div>
      </li>`;
    }).join("");
    return `<section class="gd-sec" id="gd-start">
      <div class="gd-sech"><h3>${t("gd.start.h")}</h3><span class="hint">${t("gd.start.hint")}</span></div>
      <ol class="gd-steps">${items}</ol>
    </section>`;
  }

  function tabsHTML(){
    const groups = GD_GROUPS.map(g=>{
      const rows = g.views.filter(viewAllowed).map(v=>`
        <div class="gd-row">
          <span class="gd-ico" aria-hidden="true">${tabIcon(v)}</span>
          <div class="gd-name">${esc(tabName(v))}</div>
          <div class="gd-what"><span class="gd-lbl">${t("gd.col.what")}</span>${tr("gd.tab."+v+".what")}</div>
          <div class="gd-when"><span class="gd-lbl">${t("gd.col.when")}</span>${tr("gd.tab."+v+".when")}</div>
          <button type="button" class="btn sm gd-open" data-gd-go="${v}" aria-label="${esc(t("gd.go",{tab:tabName(v)}))}">${t("gd.open")}</button>
        </div>`).join("");
      if(!rows) return "";
      return `<div class="panel gd-group">
        <div class="phead"><h3>${t("sec."+g.sec)}</h3></div>
        <div class="gd-rows">${rows}</div>
      </div>`;
    }).join("");
    return `<section class="gd-sec" id="gd-tabs">
      <div class="gd-sech"><h3>${t("gd.tabs.h")}</h3><span class="hint">${t("gd.tabs.hint")}</span></div>
      ${groups}
    </section>`;
  }

  function glossItems(){
    const L = (typeof lang==="function") ? lang() : "es";
    return GD_GLOSS
      .filter(g=> admin() || !g.admin)
      .map(g=> ({ id:g.id, view:g.view, term:t("gd.g."+g.id+".t"), def:t("gd.g."+g.id+".d",{socs:gdSocList()}) }))
      .sort((a,b)=> a.term.localeCompare(b.term, L, {sensitivity:"base"}));
  }
  function glossHTML(){
    const items = glossItems();
    const list = items.map(g=>{
      const where = viewAllowed(g.view)
        ? `<button type="button" class="gd-where" data-gd-go="${g.view}">${t("gd.gloss.where")} <b>${esc(tabName(g.view))}</b></button>` : "";
      const hay = (g.term+" "+g.def).toLowerCase();
      return `<div class="gd-term" data-gd-hay="${esc(hay)}"><dt>${esc(g.term)}</dt><dd><p>${esc(g.def)}</p>${where}</dd></div>`;
    }).join("");
    return `<section class="gd-sec" id="gd-gloss">
      <div class="gd-sech"><h3>${t("gd.gloss.h")}</h3><span class="hint" id="gdGlossCount">${t("gd.gloss.hint")}</span></div>
      <label class="gd-search">${ICO_SEARCH}
        <input class="inp" id="gdGlossQ" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(t("gd.gloss.ph"))}" aria-label="${esc(t("gd.gloss.ph"))}" value="${esc(gdQuery)}">
      </label>
      <dl class="gd-gloss" id="gdGloss">${list}</dl>
      <p class="gd-none" id="gdGlossNone" hidden></p>
    </section>`;
  }

  function faqHTML(){
    const items = GD_FAQ.filter(f=> admin() || !f.admin).map(f=>{
      const go = viewAllowed(f.go) ? `<button type="button" class="btn sm" data-gd-go="${f.go}">${t("gd.go",{tab:esc(tabName(f.go))})}</button>` : "";
      return `<details class="gd-faq"><summary>${t("gd.f."+f.id+".q")}</summary><div class="gd-faqa"><p>${t("gd.f."+f.id+".a")}</p>${go}</div></details>`;
    }).join("");
    return `<section class="gd-sec" id="gd-help">
      <div class="gd-sech"><h3>${t("gd.help.h")}</h3><span class="hint">${t("gd.help.hint")}</span></div>
      <div class="panel gd-faqs">${items}</div>
    </section>`;
  }

  /* ---------- vista ---------- */
  window.viewGuia = function(){
    const jumps = [["gd-start","gd.jump.start"],["gd-tabs","gd.jump.tabs"],["gd-gloss","gd.jump.gloss"],["gd-help","gd.jump.help"]]
      .map(([id,k])=> `<button type="button" class="chip-btn" data-gd-jump="${id}">${t(k)}</button>`).join("");
    return `<div class="gd">
      <div class="head gd-head">
        <div class="title"><h2>${t("gd.title")}</h2><p>${t(admin()?"gd.sub.admin":"gd.sub.seller")}</p></div>
        <div class="actions">
          <button type="button" class="btn" data-gd-replay>${ICO_REPLAY}${t("gd.replay")}</button>
          ${typeof langToggleHTML==="function" ? langToggleHTML() : ""}
        </div>
      </div>
      <p class="gd-role">${t(admin()?"gd.role.admin":"gd.role.seller")}</p>
      <nav class="gd-jump" aria-label="${esc(t("gd.jump.aria"))}">${jumps}</nav>
      ${startHTML()}
      ${tabsHTML()}
      ${glossHTML()}
      ${faqHTML()}
    </div>`;
  };

  function filterGloss(){
    const inp = document.getElementById("gdGlossQ"); if(!inp) return;
    gdQuery = inp.value;
    const q = gdQuery.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll("#gdGloss .gd-term").forEach(el=>{
      const ok = !q || (el.getAttribute("data-gd-hay")||"").includes(q);
      el.hidden = !ok; if(ok) shown++;
    });
    const none = document.getElementById("gdGlossNone");
    if(none){ none.hidden = shown>0; if(!shown) none.textContent = t("gd.gloss.none",{q:gdQuery.trim()}); }
    const cnt = document.getElementById("gdGlossCount");
    if(cnt) cnt.textContent = q ? t("gd.gloss.count",{n:shown}) : t("gd.gloss.hint");
  }

  window.wireGuia = function(){
    const m = document.getElementById("main"); if(!m) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.querySelectorAll("[data-gd-go]").forEach(b=> b.onclick=()=>{
      setView(b.getAttribute("data-gd-go"));
      window.scrollTo({ top:0, behavior:"auto" });
    });
    m.querySelectorAll("[data-gd-act]").forEach(b=> b.onclick=()=>{
      if(b.getAttribute("data-gd-act")==="venta" && typeof openDoc==="function") openDoc("venta");
    });
    m.querySelectorAll("[data-gd-replay]").forEach(b=> b.onclick=()=>{ if(typeof startOnboarding==="function") startOnboarding(); });
    m.querySelectorAll("[data-gd-jump]").forEach(b=> b.onclick=()=>{
      const el = document.getElementById(b.getAttribute("data-gd-jump"));
      if(el) el.scrollIntoView({ behavior: reduce?"auto":"smooth", block:"start" });
    });
    const q = document.getElementById("gdGlossQ");
    if(q){ q.addEventListener("input", filterGloss); if(gdQuery) filterGloss(); }
    if(typeof syncLangToggle==="function") syncLangToggle();   // marca EN/ES en el switch recién pintado
    // La guía no vive en la hoja "Más" (se abre con el "?"): que "Más" no quede marcada.
    const more = document.getElementById("tabMore");
    if(more){ more.classList.remove("on"); more.setAttribute("aria-current","false"); }
  };
})();

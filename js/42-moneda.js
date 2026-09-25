/* ============================================================
   gestordestock — 42-moneda.js   (v102)
   Jerarquía visual de los montos: en "USD 15.800,00" el código de moneda
   se ve más chico y en gris, para que el ojo vaya al número.
   · Sólo toca textos que son UN monto entero ("USD 15.800,00", "USD -3,20",
     "USD 11,2k"); una frase como "Plan USD 94.800" no se toca.
   · v106: sólo en TABLAS y KPIs (td, th, .num, .kpi, .pj-big). En texto corrido
     (frases, listas, avisos) el "USD" queda como está: chiquito ahí quedaba raro.
   · v106: si el monto está en negrita, el "USD" también (clase cur-strong).
   · v106: respeta los espacios de alrededor (antes se comía el espacio antes de "hoy").
   · No cambia el texto: "USD" pasa a un <span class="cur"> y el resto queda
     igual, así copiar/pegar, exportar e imprimir siguen dando lo mismo.
   · Funciona sola sobre todo lo que se dibuje (vistas, filtros, modales)
     con un MutationObserver; es idempotente (no re-marca lo ya marcado).
   ============================================================ */
(function(){
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  let re = null, symCache = null;
  const ZONAS = "td, th, .num, .kpi, .pj-big";
  function rx(){
    const sym = (typeof db!=="undefined" && db.config && db.config.moneda) || "$";
    if(sym!==symCache){ symCache=sym; re=new RegExp("^(\\s*)("+esc(sym)+")(\\u00A0-?[\\d.,]+(?:\\s?[kKmM])?)(\\s*)$"); }
    return re;
  }
  function marcar(root){
    if(!root || !root.querySelectorAll) return;
    const r = rx();
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n){
        const p = n.parentElement;
        if(!p || p.closest(".cur, input, textarea, select, option, script, style, svg")) return NodeFilter.FILTER_REJECT;
        if(!p.closest(ZONAS)) return NodeFilter.FILTER_REJECT;          // sólo tablas y KPIs
        return r.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodos=[]; while(w.nextNode()) nodos.push(w.currentNode);
    nodos.forEach(n=>{
      const m = r.exec(n.nodeValue); if(!m) return;
      const par = n.parentNode;
      const span = document.createElement("span"); span.className="cur"; span.textContent=m[2];
      if((parseInt(getComputedStyle(par).fontWeight,10)||400) >= 600) span.classList.add("cur-strong");
      if(m[1]) par.insertBefore(document.createTextNode(m[1]), n);   // espacio de adelante, si había
      par.insertBefore(span, n);
      n.nodeValue = m[3] + m[4];                                      // número + espacio de atrás (ej. antes de "hoy")
    });
  }
  let pend = new Set(), raf = 0;
  function flush(){ raf=0; const l=[...pend]; pend.clear(); l.forEach(marcar); }
  const obs = new MutationObserver(muts=>{
    for(const m of muts){
      if(m.type==="characterData"){ if(m.target.parentElement) pend.add(m.target.parentElement); }
      else m.addedNodes.forEach(n=>{ if(n.nodeType===1) pend.add(n); else if(n.nodeType===3 && n.parentElement) pend.add(n.parentElement); });
    }
    if(pend.size && !raf) raf=requestAnimationFrame(flush);
  });
  function start(){
    ["main","modalRoot"].forEach(id=>{ const el=document.getElementById(id); if(el){ marcar(el); obs.observe(el,{childList:true,subtree:true,characterData:true}); } });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

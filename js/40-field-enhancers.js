/* ============================================================
   FIELD ENHANCERS: dropdowns y calendario custom
   ------------------------------------------------------------
   Reemplazan visualmente los popups NATIVOS (que el SO dibuja
   en blanco, ajenos al tema) por popups propios pintados con
   nuestros tokens. Regla de oro: nunca tocamos el <select> ni
   el <input type=date> reales — sólo interceptamos su apertura.
   Así value, id, listeners y onchange siguen intactos y toda la
   lógica de wireXXX() sigue andando sin enterarse.
   ============================================================ */
(function(){
  // Nombres traducidos en vivo (se leen al dibujar, así siguen el idioma actual).
  const MESES = ()=> [0,1,2,3,4,5,6,7,8,9,10,11].map(i=> t("cal.mon."+i));
  // Semana: en inglés arranca el domingo (EE.UU.); en español el lunes (Argentina).
  const WK0   = ()=> (typeof lang==="function" && lang()==="es") ? 1 : 0;
  const DOW   = ()=> [0,1,2,3,4,5,6].map(i=> t("cal.dow."+((i+WK0())%7)));
  const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

  let openPop = null;   // popup abierto actualmente (select o calendario)
  function closeOpen(){ if(openPop){ openPop.remove(); openPop=null; document.removeEventListener('scroll', onDocScroll, true); } }
  function onDocScroll(e){
    // La rueda/scroll DENTRO del propio popup (recorrer una lista larga, ej. medios
    // de cobro) NO debe cerrarlo. Sólo cerramos cuando scrollea el FONDO (página o
    // modal), porque el popup es position:fixed y se despegaría de su ancla.
    if(openPop && e && e.target && (openPop===e.target || (openPop.contains && openPop.contains(e.target)))) return;
    // Select con buscador: en el celu, al abrirse el teclado la página scrollea sola.
    // Si cerráramos, el popup se iría apenas tocás el buscador → lo re-ubicamos.
    if(openPop && openPop.__search){ place(openPop, openPop.__forSel); return; }
    closeOpen();
  }

  /* Posiciona un popup respecto de su "ancla" (el control), eligiendo abrir
     hacia abajo o hacia arriba según el espacio disponible en el viewport. */
  function place(pop, anchor){
    const r = anchor.getBoundingClientRect();
    document.body.appendChild(pop);
    const ph = pop.offsetHeight;
    const below = window.innerHeight - r.bottom;
    const openUp = below < ph + 8 && r.top > below;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
    // Hacia arriba anclamos por "bottom": si el contenido se achica (ej. al filtrar
    // en el buscador) el popup sigue pegado al control en vez de quedar flotando.
    if(openUp){ pop.style.top = "auto"; pop.style.bottom = Math.max(8, window.innerHeight - r.top + 6) + "px"; if(ph > r.top - 16) pop.style.maxHeight = Math.max(160, r.top - 16) + "px"; }
    else      { pop.style.bottom = "auto"; pop.style.top = (r.bottom + 6) + "px"; }
  }

  /* ---------------- SELECT ---------------- */
  // Texto sin tildes y en minúscula, para que "japon" encuentre "Japón".
  const fold = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  function openSelect(sel){
    closeOpen();
    const searchable = sel.hasAttribute('data-search');
    const pop = document.createElement('div');
    pop.className = 'csel-pop' + (searchable ? ' has-search' : '');
    pop.style.minWidth = sel.getBoundingClientRect().width + 'px';

    const pick = (opt)=>{
      if(opt.disabled) return;
      if(sel.value !== opt.value){
        sel.value = opt.value;
        // dispara los handlers de la app (soporta .onchange y addEventListener)
        sel.dispatchEvent(new Event('change', { bubbles:true }));
      }
      closeOpen();
      if(searchable) sel.focus();
    };
    const items = [];   // {div, opt, key}
    Array.from(sel.options).forEach((opt)=>{
      // <hr> dentro del select no existe como option; separadores manuales:
      const div = document.createElement('div');
      div.className = 'csel-opt' + (opt.selected ? ' sel' : '');
      if(opt.disabled) div.dataset.disabled = '1';
      div.textContent = opt.textContent;
      div.title = opt.textContent;
      div.onclick = ()=> pick(opt);
      pop.appendChild(div);
      // data-k: texto extra de búsqueda (ej. países: "usa eeuu united states")
      items.push({ div, opt, key: fold(opt.textContent + ' ' + (opt.dataset.k||'')) });
    });

    if(searchable){
      /* ---- Buscador arriba de la lista ----
         Filtra por texto visible + data-k. Flechas mueven el resaltado,
         Enter elige, Escape cierra (listener global). */
      const box = document.createElement('div');
      box.className = 'csel-search';
      box.innerHTML = '<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false">';
      const inp = box.firstChild;
      inp.placeholder = (typeof t==='function' ? t('common.search') : 'Search') + '…';
      const empty = document.createElement('div');
      empty.className = 'csel-empty'; empty.hidden = true;
      empty.textContent = (typeof t==='function' ? t('csel.noresults') : 'No results');
      pop.insertBefore(box, pop.firstChild);
      pop.appendChild(empty);

      let hi = -1;   // índice (en visibles) del resaltado
      const visibles = ()=> items.filter(it=> !it.div.hidden && !it.opt.disabled);
      const setHi = (i)=>{
        const v = visibles();
        items.forEach(it=> it.div.classList.remove('hi'));
        if(!v.length){ hi=-1; return; }
        hi = Math.max(0, Math.min(i, v.length-1));
        v[hi].div.classList.add('hi');
        v[hi].div.scrollIntoView({ block:'nearest' });
      };
      const filter = ()=>{
        const q = fold(inp.value.trim());
        const seen = new Set();
        items.forEach(it=>{
          let show;
          if(!q) show = true;
          else if(it.opt.disabled || it.opt.value==='') show = false;          // sin separadores ni "—" al buscar
          else show = q.split(/\s+/).every(w=> it.key.includes(w));
          // los "frecuentes" repiten valor con la lista completa: al buscar, uno solo
          if(show && q){ if(seen.has(it.opt.value)) show = false; else seen.add(it.opt.value); }
          it.div.hidden = !show;
        });
        empty.hidden = visibles().length > 0;
        setHi(q ? 0 : -1);
      };
      inp.addEventListener('input', filter);
      inp.addEventListener('keydown', (e)=>{
        if(e.key==='ArrowDown'){ e.preventDefault(); setHi(hi+1); }
        else if(e.key==='ArrowUp'){ e.preventDefault(); setHi(hi-1); }
        else if(e.key==='Enter'){ e.preventDefault(); const v=visibles(); if(v[hi<0?0:hi]) pick(v[hi<0?0:hi].opt); }
        else if(e.key==='Tab'){ closeOpen(); }
      });
      pop.__search = inp;
    }

    pop.__forSel = sel;
    openPop = pop;
    place(pop, sel);
    // scroll a la opción seleccionada
    const selEl = pop.querySelector('.csel-opt.sel');
    if(selEl) selEl.scrollIntoView({ block:'nearest' });
    if(pop.__search) pop.__search.focus({ preventScroll:true });
    document.addEventListener('scroll', onDocScroll, true);
  }

  function enhanceSelects(root){
    (root||document).querySelectorAll('select:not([data-csel])').forEach(sel=>{
      sel.dataset.csel = '1';
      // en mobile el picker nativo del select es cómodo (rueda a pantalla
      // completa); sólo reemplazamos en punteros finos (mouse/trackpad).
      // Excepción: los select con buscador (data-search, ej. países) SIEMPRE usan el
      // popup propio: con 250 opciones la rueda nativa del celu es inusable.
      const fino = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
      const searchable = sel.hasAttribute('data-search');
      if(!fino && !searchable) return;
      const toggle = (e)=>{ e.preventDefault(); (openPop && openPop.__forSel===sel) ? closeOpen() : openSelect(sel); };
      sel.addEventListener('mousedown', toggle);
      // En táctil, cortar el touchstart es lo único que evita que abra la rueda nativa.
      if(searchable) sel.addEventListener('touchstart', toggle, { passive:false });
      sel.addEventListener('keydown', (e)=>{
        if(e.key==='Enter' || e.key===' ' || e.key==='ArrowDown' || e.key==='ArrowUp'){ e.preventDefault(); openSelect(sel); }
      });
    });
  }

  /* ---------------- DATE ---------------- */
  const pad = n => String(n).padStart(2,'0');
  const toISO = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  const parseISO = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s||''); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; };

  function openCalendar(inp){
    closeOpen();
    const today = new Date(); today.setHours(0,0,0,0);
    const sel = parseISO(inp.value);
    let viewY = (sel||today).getFullYear();
    let viewM = (sel||today).getMonth();
    let mode = 'days';   // 'days' | 'months' | 'years'

    const pop = document.createElement('div');
    pop.className = 'cal-pop';
    pop.__forDate = inp;
    openPop = pop;

    function commit(d){
      inp.value = d ? toISO(d) : '';
      inp.dispatchEvent(new Event('change', { bubbles:true }));
      closeOpen();
    }
    function drawDays(){
      const first = new Date(viewY, viewM, 1);
      const startDow = (first.getDay() - WK0() + 7) % 7;   // columna del día 1 según el inicio de semana
      const daysInMonth = new Date(viewY, viewM+1, 0).getDate();
      const prevDays = new Date(viewY, viewM, 0).getDate();
      let cells = '';
      // días del mes anterior (relleno)
      for(let i=startDow-1;i>=0;i--) cells += `<div class="cal-cell out">${prevDays-i}</div>`;
      for(let d=1; d<=daysInMonth; d++){
        const cur = new Date(viewY, viewM, d);
        const isToday = cur.getTime()===today.getTime();
        const isSel = sel && cur.getTime()===sel.getTime();
        cells += `<div class="cal-cell${isToday?' today':''}${isSel?' sel':''}" data-d="${d}">${d}</div>`;
      }
      const totalShown = startDow + daysInMonth;
      const trailing = (7 - (totalShown % 7)) % 7;
      for(let i=1;i<=trailing;i++) cells += `<div class="cal-cell out">${i}</div>`;
      pop.innerHTML = `
        <div class="cal-head">
          <div class="cal-title" data-act="mode">${MESES()[viewM]} ${viewY}</div>
          <div class="cal-nav" data-act="prev">‹</div>
          <div class="cal-nav" data-act="next">›</div>
        </div>
        <div class="cal-grid">${DOW().map(d=>`<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
        <div class="cal-foot"><button data-act="clear">${t("cal.clear")}</button><button data-act="today">${t("cal.today")}</button></div>`;
      pop.querySelectorAll('.cal-cell[data-d]').forEach(c=> c.onclick=()=> commit(new Date(viewY, viewM, +c.dataset.d)));
      pop.querySelector('[data-act="prev"]').onclick = ()=>{ viewM--; if(viewM<0){viewM=11;viewY--;} drawDays(); };
      pop.querySelector('[data-act="next"]').onclick = ()=>{ viewM++; if(viewM>11){viewM=0;viewY++;} drawDays(); };
      pop.querySelector('[data-act="mode"]').onclick = ()=> drawMonths();
      pop.querySelector('[data-act="clear"]').onclick = ()=> commit(null);
      pop.querySelector('[data-act="today"]').onclick = ()=> commit(new Date(today));
    }
    function drawMonths(){
      pop.innerHTML = `
        <div class="cal-head">
          <div class="cal-title" data-act="years">${viewY}</div>
          <div class="cal-nav" data-act="prevy">‹</div>
          <div class="cal-nav" data-act="nexty">›</div>
        </div>
        <div class="cal-mgrid">${MESES().map((m,i)=>`<div class="cal-mcell${i===viewM?' sel':''}" data-m="${i}">${m.slice(0,3)}</div>`).join('')}</div>`;
      pop.querySelectorAll('.cal-mcell').forEach(c=> c.onclick=()=>{ viewM=+c.dataset.m; drawDays(); });
      pop.querySelector('[data-act="prevy"]').onclick = ()=>{ viewY--; drawMonths(); };
      pop.querySelector('[data-act="nexty"]').onclick = ()=>{ viewY++; drawMonths(); };
      pop.querySelector('[data-act="years"]').onclick = ()=> drawYears();
    }
    function drawYears(){
      const base = viewY - (viewY % 12);
      let cells = '';
      for(let y=base; y<base+12; y++) cells += `<div class="cal-mcell${y===viewY?' sel':''}" data-y="${y}">${y}</div>`;
      pop.innerHTML = `
        <div class="cal-head">
          <div class="cal-title">${base}–${base+11}</div>
          <div class="cal-nav" data-act="prevr">‹</div>
          <div class="cal-nav" data-act="nextr">›</div>
        </div>
        <div class="cal-mgrid">${cells}</div>`;
      pop.querySelectorAll('.cal-mcell').forEach(c=> c.onclick=()=>{ viewY=+c.dataset.y; drawMonths(); });
      pop.querySelector('[data-act="prevr"]').onclick = ()=>{ viewY-=12; drawYears(); };
      pop.querySelector('[data-act="nextr"]').onclick = ()=>{ viewY+=12; drawYears(); };
    }
    drawDays();
    place(pop, inp);
    document.addEventListener('scroll', onDocScroll, true);
  }

  // Texto visible del input según el idioma (DD/MM/YYYY en ES, MM/DD/YYYY en EN).
  function fmtUSDate(iso){
    if(!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    return fmtDate(iso);
  }
  const DATE_PH = ()=> (typeof lang==="function" && lang()==="es") ? "dd/mm/aaaa" : "mm/dd/yyyy";
  function enhanceDates(root){
    (root||document).querySelectorAll('input[type="date"]:not([data-cdate])').forEach(inp=>{
      inp.dataset.cdate = '1';
      // ícono de calendario propio (el nativo lo ocultamos por CSS). Medimos el
      // ancho REAL ya renderizado y se lo fijamos al wrapper, así el input pasa
      // a 100% sin que se desacomode ninguna columna del filtro/modal.
      let wrap;
      if(!inp.parentElement.classList.contains('cdate-wrap')){
        const w = inp.getBoundingClientRect().width;
        wrap = document.createElement('span');
        wrap.className = 'cdate-wrap';
        if(w) wrap.style.width = w + 'px';
        inp.parentNode.insertBefore(wrap, inp);
        wrap.appendChild(inp);
        // texto propio (formato según idioma) encima del input (el nativo va transparente)
        const txt = document.createElement('span');
        txt.className = 'cdate-text';
        wrap.appendChild(txt);
        const ico = document.createElement('span');
        ico.className = 'cdate-ico'; ico.innerHTML = CAL_ICON;
        wrap.appendChild(ico);
        inp.style.width = '100%';
        inp.style.paddingRight = '28px';
        // pinta/actualiza el texto visible según el valor ISO del input
        const paint = ()=>{
          const us = fmtUSDate(inp.value);
          txt.textContent = us || DATE_PH();
          txt.classList.toggle('ph', !us);
        };
        paint();
        inp.addEventListener('change', paint);
        inp.addEventListener('input', paint);
      }
      inp.addEventListener('mousedown', (e)=>{ e.preventDefault(); (openPop && openPop.__forDate===inp) ? closeOpen() : openCalendar(inp); });
      inp.addEventListener('keydown', (e)=>{ e.preventDefault(); if(e.key==='Enter'||e.key===' '||e.key==='ArrowDown') openCalendar(inp); });
      // por las dudas: si algún navegador expone showPicker, lo neutralizamos
      if(inp.showPicker){ const _sp = inp.showPicker.bind(inp); inp.showPicker = ()=>{ openCalendar(inp); }; }
    });
  }

  /* Corre ambos enhancers sobre un contenedor (o todo el doc). */
  function runFieldEnhancers(root){ enhanceSelects(root); enhanceDates(root); }
  window.runFieldEnhancers = runFieldEnhancers;

  // Cerrar popups al tocar afuera, con Escape o al cambiar el tamaño. Si el
  // mousedown cae sobre el MISMO control que abrió el popup, no cerramos acá:
  // dejamos que su propio handler (bubble) haga el toggle a cerrado.
  document.addEventListener('mousedown', (e)=>{
    if(!openPop) return;
    if(openPop.contains(e.target)) return;                                   // dentro del popup
    if(openPop.__forSel && openPop.__forSel===e.target) return;              // el mismo <select>
    if(openPop.__forDate){
      const wrap = openPop.__forDate.closest('.cdate-wrap');
      if(e.target===openPop.__forDate || (wrap && wrap.contains(e.target))) return; // el mismo input date o su ícono
    }
    closeOpen();
  }, true);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeOpen(); });
  // En el celu, abrir el teclado dispara un resize: si estás escribiendo en el
  // buscador del popup no lo cerramos, sólo lo re-ubicamos.
  window.addEventListener('resize', ()=>{
    if(openPop && openPop.__search && openPop.contains(document.activeElement)){ place(openPop, openPop.__forSel); return; }
    closeOpen();
  });

  /* ---- Cuándo enhancear: un MutationObserver ----
     La app repinta con innerHTML muy seguido (vistas, modales, sub-render del
     editor de líneas, filas de tablas, etc.). En vez de engancharnos a cada
     función de render por nombre, observamos el DOM: cualquier <select> o
     <input type=date> nuevo se enhancea solo. Los ya marcados (data-csel /
     data-cdate) se saltean, así no hay retrabajo ni recursión (nuestros popups
     no contienen controles nativos). Debounce por frame para no recalcular de
     más en repintados grandes. */
  let pending = false;
  const observer = new MutationObserver(()=>{
    if(pending) return;
    pending = true;
    requestAnimationFrame(()=>{ pending = false; runFieldEnhancers(); });
  });
  function startObserver(){
    if(document.body) observer.observe(document.body, { childList:true, subtree:true });
  }

  // Al cerrar un modal, cerramos cualquier popup que hubiera quedado abierto.
  if(typeof window.closeModal === 'function'){
    const _close = window.closeModal;
    window.closeModal = function(){ closeOpen(); return _close.apply(this, arguments); };
  }

  // Arranque: primera pasada + observer.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ runFieldEnhancers(); startObserver(); });
  } else { runFieldEnhancers(); startObserver(); }
})();

/* ---------- Service worker (PWA offline) ---------- */

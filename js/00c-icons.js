/* ============================================================
   stockselect — 00c-icons.js
   Biblioteca de iconos SVG compartida (global, sin modulos).
   Se carga JUSTO despues de i18n y ANTES de todas las vistas.
   Todas las vistas usan ICO.<clave> en sus botones. Cada SVG
   trae class="i" -> el CSS .btn svg.i lo dimensiona a 15px.
   Estilo Feather (trazo, stroke-width 2), coherente con los
   iconos que ya existian (select / x / trash) y con la topbar.
   ============================================================ */
(function(){
  const S = (p)=>`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

  const ICO = {
    /* ---- ya existentes (se conservan las mismas claves) ---- */
    select: S('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/>'),
    x:      S('<path d="M6 6l12 12M18 6L6 18"/>'),
    trash:  S('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/>'),

    /* ---- acciones de creacion / edicion ---- */
    plus:   S('<path d="M12 5v14M5 12h14"/>'),
    minus:  S('<path d="M5 12h14"/>'),
    edit:   S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    copy:   S('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    view:   S('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>'),
    save:   S('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
    check:  S('<path d="M20 6 9 17l-5-5"/>'),

    /* ---- compras / ventas ---- */
    buy:    S('<path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1.5 3.5h21v4.5h-21z"/><path d="M12 11v6.5M9 14.5l3 3 3-3"/>'),
    sale:   S('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2 12.4a1.6 1.6 0 0 0 1.6 1.3h9.1a1.6 1.6 0 0 0 1.6-1.2L21 8H6"/>'),

    /* ---- listados / export / import ---- */
    list:   S('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    price:  S('<path d="M20.6 13.4 13 21l-9-9V3h9l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/>'),
    landed: S('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 21h16"/>'),
    download:S('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 21h16"/>'),
    pdf:    S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6M15 15h-2v-3h2M13 15h1.5"/>'),
    importpdf:S('<path d="M12 3v10M12 13l-3.5-3.5M12 13l3.5-3.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    export: S('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
    upload: S('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),

    /* ---- sync / sesion / datos ---- */
    sync:   S('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
    logout: S('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
    reset:  S('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>'),
    adduser:S('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M18 8v6M15 11h6"/>'),
    /* bóveda de inversión (reemplaza al glifo ◈, que se veía distinto según la fuente) */
    // inversiones: gema (producto de valor que se retiene). Antes era una caja fuerte que a 16px parecía una cámara.
    vault:  S('<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6-4 12"/>'),
    adjust: S('<path d="M4 6h11M18 6h2M4 12h2M9 12h11M4 18h7M14 18h6"/><circle cx="16" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="12" cy="18" r="2"/>'),

    /* ---- flujo terceros / remitos ---- */
    receive: S('<path d="M4 13h4l1.5 2.5h5L16 13h4"/><path d="M5 13 7 5h10l2 8v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"/>'),
    deliver: S('<path d="M18 11V6a1.6 1.6 0 0 0-3.2 0M14.8 11V4.4a1.6 1.6 0 0 0-3.2 0V11M11.6 11V6a1.6 1.6 0 0 0-3.2 0v8"/><path d="M8.4 12.5 6.7 10.8a1.7 1.7 0 0 0-2.4 2.4L8 18a6 6 0 0 0 5 3h1a5 5 0 0 0 5-5v-5"/>'),
    resolve: S('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.4 13.4 7.2 4.2M15.6 6.4 8.4 10.6"/>'),
    // prorrateo de handling/flete en compras: camión (recibe) / camión tachado (excluido)
    truck:    S('<path d="M2 6h12v10H2z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
    truckOff: S('<path d="M2 6h12v10H2z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/><path d="M3 3l18 18"/>'),
    plane:   S('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>'),
    store:   S('<path d="M3 9 4.5 4.5A2 2 0 0 1 6.4 3h11.2a2 2 0 0 1 1.9 1.5L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9h18M9 20v-5h6v5"/>'),

    /* ---- misc ---- */
    /* v98 · compra = caja que recibe (antes era otro carrito, se confundía con venta) */
    arrowIn:  S('<path d="M17 7 7 17M7 8v9h9"/>'),
    arrowOut: S('<path d="M7 17 17 7M8 7h9v9"/>'),
    sparkle:  S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 .3.3 2 .7-2 .7-.3.3-.7 2-.7-2-.3-.3-2-.7 2-.7.3-.3z"/>'),
    info:     S('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    warn:    S('<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>')
  };

  window.ICO = ICO;
})();

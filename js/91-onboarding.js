/* ============================================================
   gestordestock — 91-onboarding.js   (v100)
   Tour de bienvenida del PRIMER USO (portado de stockselect y
   adaptado a este negocio). Aditivo y self-contained.
   ------------------------------------------------------------
   Flujo la primera vez que entra cada usuario:
     1) Pregunta el idioma (ES / EN). No se puede saltear.
     2) Tour distinto según el perfil:
          · Admin    → 7 pasos (sociedades, ciclo de compra, FIFO,
                        Panel, finanzas)
          · Vendedor → 6 pasos (buscar stock, cargar venta, sus
                        ventas y clientes, trabajar sin señal)
     3) Al final ofrece abrir la pestaña 0 "Cómo usar".
   - Flag POR USUARIO en localStorage (gstock_tour_v1:<user>): cada
     vendedor lo ve una vez en su dispositivo. Es una preferencia
     local: no se sincroniza ni toca el rev del servidor.
   - El overlay vive en <body> (fuera de #main): render() no lo pisa.
   - Arranque: render() (03-router.js) llama a maybeStartOnboarding()
     en cada pintada; esto sólo abre el tour si hay sesión, el login
     está oculto y el usuario todavía no lo vio.
   - startOnboarding(): relanza el tour a mano (botones data-open-help
     y "Repetir el tour" de la guía). Relanzado, no pregunta idioma.
   - La guía se abre con el botón "?" (data-open-guide) del pie del menú y
     de la barra mobile: el menú lateral queda sólo para las secciones del ERP.
   ============================================================ */
(function(){
  "use strict";
  var FLAG = "gstock_tour_v1:";

  function K(k,vars){ return (typeof t==="function") ? t(k,vars) : k; }
  function admin(){ return (typeof isAdmin==="function") && isAdmin(); }
  function sess(){ try{ return (typeof session!=="undefined" && session) ? session : null; }catch(e){ return null; } }
  function flagKey(){ var s=sess(); return FLAG+((s&&s.user)||"anon"); }
  function seen(){ try{ return localStorage.getItem(flagKey())==="1"; }catch(e){ return true; } }
  function markSeen(){ try{ localStorage.setItem(flagKey(),"1"); }catch(e){} }
  function socs(){ return (typeof gdSocList==="function") ? gdSocList() : "Akira / Silver"; }
  function e(s){ return (typeof esc==="function") ? esc(s) : String(s==null?"":s); }
  function firstName(){ var s=sess(); var n=(s&&(s.name||s.user))||""; return String(n).split(/\s+/)[0]; }

  /* ---------- íconos (trazo, mismo estilo Feather que el resto) ---------- */
  var S=function(p){ return '<svg class="ob-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'; };
  var P = {
    box:   '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    bld:   '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>',
    cart:  '<path d="M3 7h13l-1.2 8.2a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 4H2"/><path d="M18 3v6M15 6h6"/>',
    truck: '<path d="M1 7h13v9H1zM14 11h4l3 3v2h-7"/><circle cx="5.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sale:  '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2 12.4a1.6 1.6 0 0 0 1.6 1.3h9.1a1.6 1.6 0 0 0 1.6-1.2L21 8H6"/>',
    warn:  '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    user:  '<circle cx="12" cy="8" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>',
    card:  '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    doc:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    wifiOff:'<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    help:  '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 17.5h.01"/>',
    bars:  '<path d="M3 3v18h18"/><path d="M7 15l3-4 3 2 4-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  /* ---------- ilustraciones (leen i18n en vivo) ---------- */
  function ilWelcome(n){
    return '<div class="ob-hero"><div class="ob-hero-ic">'+S(P.box)+'</div><div class="ob-hero-t">'+K("tour.l.steps",{n:n})+'</div></div>';
  }
  function ilPool(){
    var st = (typeof STORES!=="undefined" ? STORES : [{name:"Akira"},{name:"Silver"}]).slice(0,3);
    var left = st.map(function(s){ return '<div class="ob-soc">'+S(P.bld)+'<span>'+e(s.name)+'</span></div>'; }).join("");
    return '<div class="ob-pool"><div class="ob-socs">'+left+'</div>'+
      '<div class="ob-arrow">'+S(P.arrow)+'</div>'+
      '<div class="ob-poolbox">'+S(P.box)+'<span>'+K("tour.l.pool")+'</span></div></div>';
  }
  function ilCycle(){
    function node(ic,l,cls){ return '<div class="ob-node'+(cls?" "+cls:"")+'"><div class="ob-d">'+S(ic)+'</div><div class="ob-l">'+l+'</div></div>'; }
    return '<div class="ob-rail">'+
      node(P.cart,K("tour.l.buy"))+'<div class="ob-conn hot"></div>'+
      node(P.truck,K("tour.l.transit"),"hot")+'<div class="ob-conn"></div>'+
      node(P.check,K("tour.l.recv"),"ok")+'<div class="ob-conn"></div>'+
      node(P.sale,K("tour.l.sale"))+'</div>';
  }
  function ilFifo(){
    return '<div class="ob-fifo">'+
      '<div class="ob-layers">'+
        '<div class="ob-layer new"><span>'+K("tour.l.new")+'</span><b>40 u</b></div>'+
        '<div class="ob-layer"><span>&nbsp;</span><b>25 u</b></div>'+
        '<div class="ob-layer old"><span>'+K("tour.l.old")+'</span><b>10 u</b></div>'+
      '</div>'+
      '<div class="ob-fifo-out">'+S(P.arrow)+'<span>'+K("tour.l.first")+'</span></div></div>';
  }
  function ilDash(){
    return '<div class="ob-mstrip">'+
      '<div class="ob-mchip a"><span class="ob-mi">'+S(P.warn)+'</span><span class="ob-ml">'+K("tour.l.alerts")+'</span><b class="ob-mn">3</b></div>'+
      '<div class="ob-mchip b"><span class="ob-mi">'+S(P.truck)+'</span><span class="ob-ml">'+K("tour.l.intransit")+'</span><b class="ob-mn">48</b></div>'+
      '<div class="ob-mchip c"><span class="ob-mi">'+S(P.target)+'</span><span class="ob-ml">'+K("tour.l.plan")+'</span><b class="ob-mn">92%</b></div></div>';
  }
  function ilFin(){
    var tabs=["nav.resumen","nav.analisis","nav.pnl","nav.plan","nav.gastos.short"];
    var h=[38,62,46,78,55,88];
    return '<div class="ob-fin"><div class="ob-bars">'+h.map(function(x){ return '<i style="height:'+x+'%"></i>'; }).join("")+'</div>'+
      '<div class="ob-tabs">'+tabs.map(function(k){ return '<span>'+e(K(k))+'</span>'; }).join("")+'</div></div>';
  }
  function ilStock(){
    return '<div class="ob-stock">'+
      '<div class="ob-sbox">'+S(P.search)+'<span>'+K("tour.l.search")+'</span></div>'+
      '<div class="ob-srow"><span class="ob-sku">OP-09</span><span class="ob-sn">One Piece · Booster Box</span><b>24</b></div>'+
      '<div class="ob-srow"><span class="ob-sku">PKM-151</span><span class="ob-sn">Pokémon 151 <em class="t">'+e(K("pr.badge.transit"))+'</em></span><b class="mut">12</b></div>'+
      '<div class="ob-srow"><span class="ob-sku">MTG-FIN</span><span class="ob-sn">Magic · Final Fantasy <em class="b">'+e(K("pr.badge.blocked"))+'</em></span><b class="mut">2</b></div></div>';
  }
  function ilSale(){
    function st(ic,l){ return '<div class="ob-sstep">'+S(ic)+'<span>'+l+'</span></div>'; }
    return '<div class="ob-sale"><div class="ob-fabx">+ '+e(K("dash.newsale"))+'</div>'+
      '<div class="ob-ssteps">'+st(P.user,K("tour.l.custpick"))+st(P.box,K("tour.l.prods"))+st(P.card,K("tour.l.pay"))+'</div></div>';
  }
  function ilMine(){
    return '<div class="ob-lanes">'+
      '<div class="ob-lane own"><span class="ob-ic">'+S(P.doc)+'</span><div><div class="ob-lt">'+K("tour.l.mine")+'</div><div class="ob-ls">'+K("tour.l.pdf")+'</div></div></div>'+
      '<div class="ob-lane warnl"><span class="ob-ic">'+S(P.user)+'</span><div><div class="ob-lt">'+K("tour.l.incomplete")+'</div><div class="ob-ls">'+e(K("nav.clientes"))+'</div></div></div></div>';
  }
  function ilSync(){
    return '<div class="ob-sync">'+
      '<div class="ob-chip off">'+S(P.wifiOff)+'<span>'+K("tour.l.offline")+'</span><small>'+K("tour.l.saved")+'</small></div>'+
      '<div class="ob-arrow">'+S(P.arrow)+'</div>'+
      '<div class="ob-chip on"><span class="ob-dotc"></span><span>'+K("tour.l.synced")+'</span></div></div>';
  }
  function ilDone(){
    return '<div class="ob-done"><div class="ob-ring">'+S(P.check)+'</div>'+
      '<div class="ob-qhint">'+S(P.help)+'<b>'+K("tour.l.help")+'</b><span>'+K("tour.l.helpsub")+'</span></div></div>';
  }

  function adminSteps(){
    var n=7, v={n:n, socs:e(socs())};
    return [
      {t:"tour.a1.t", b:"tour.a1.b", v:v, il:function(){ return ilWelcome(n); }},
      {t:"tour.a2.t", b:"tour.a2.b", v:v, il:ilPool},
      {t:"tour.a3.t", b:"tour.a3.b", v:v, il:ilCycle},
      {t:"tour.a4.t", b:"tour.a4.b", v:v, il:ilFifo},
      {t:"tour.a5.t", b:"tour.a5.b", v:v, il:ilDash},
      {t:"tour.a6.t", b:"tour.a6.b", v:v, il:ilFin},
      {t:"tour.a7.t", b:"tour.a7.b", v:v, il:ilDone, last:true}
    ];
  }
  function sellerSteps(){
    var n=6, v={n:n, name:e(firstName()||"")};
    return [
      {t:"tour.s1.t", b:"tour.s1.b", v:v, il:function(){ return ilWelcome(n); }},
      {t:"tour.s2.t", b:"tour.s2.b", v:v, il:ilStock},
      {t:"tour.s3.t", b:"tour.s3.b", v:v, il:ilSale},
      {t:"tour.s4.t", b:"tour.s4.b", v:v, il:ilMine},
      {t:"tour.s5.t", b:"tour.s5.b", v:v, il:ilSync},
      {t:"tour.s6.t", b:"tour.s6.b", v:v, il:ilDone, last:true}
    ];
  }

  var _open=false, _i=0, _steps=[], _mode="steps", _lastFocus=null, _timer=null, _inerted=[];

  /* Fondo inert mientras el tour está abierto (mismo criterio que los modales v97):
     el lector de pantalla y el teclado no pueden salir del diálogo. Sólo sacamos
     el inert de lo que pusimos nosotros (si un modal ya lo tenía, lo respetamos). */
  function setBackgroundInert(on){
    if(on){
      _inerted=[];
      [document.querySelector(".app"), document.getElementById("topbar"), document.getElementById("modalRoot")].forEach(function(el){
        if(el && !el.hasAttribute("inert")){ el.setAttribute("inert",""); _inerted.push(el); }
      });
    } else {
      _inerted.forEach(function(el){ el.removeAttribute("inert"); });
      _inerted=[];
    }
  }

  function ensureRoot(){
    var r=document.getElementById("obRoot");
    if(r) return r;
    r=document.createElement("div");
    r.id="obRoot"; r.className="ob-scrim";
    r.innerHTML='<div id="obCard" class="ob-card" role="dialog" aria-modal="true" aria-labelledby="obTitle"></div>';
    document.body.appendChild(r);
    r.addEventListener("click", function(ev){
      var el=ev.target.closest && ev.target.closest("[data-ob-next],[data-ob-back],[data-ob-skip],[data-ob-lang],[data-ob-dot],[data-ob-guide]");
      if(!el) return;
      if(el.hasAttribute("data-ob-lang")){
        if(typeof setLang==="function") setLang(el.getAttribute("data-ob-lang"));
        startSteps(); return;
      }
      if(el.hasAttribute("data-ob-next")){ nextStep(); return; }
      if(el.hasAttribute("data-ob-back")){ prevStep(); return; }
      if(el.hasAttribute("data-ob-skip")){ close(true); return; }
      if(el.hasAttribute("data-ob-guide")){ close(true); if(typeof setView==="function"){ setView("guia"); window.scrollTo(0,0); } return; }
      if(el.hasAttribute("data-ob-dot")){ _i=+el.getAttribute("data-ob-dot"); renderStep(); return; }
    });
    document.addEventListener("keydown", onKey);
    return r;
  }
  function onKey(ev){
    if(!_open) return;
    if(ev.key==="Tab"){   // el foco no se escapa del diálogo
      var card=document.getElementById("obCard"); if(!card) return;
      var f=[].slice.call(card.querySelectorAll("button:not([disabled])")).filter(function(b){ return b.offsetParent!==null; });
      if(!f.length) return;
      var a=f[0], z=f[f.length-1];
      if(ev.shiftKey && document.activeElement===a){ ev.preventDefault(); z.focus(); }
      else if(!ev.shiftKey && document.activeElement===z){ ev.preventDefault(); a.focus(); }
      return;
    }
    if(_mode==="lang") return;          // el idioma no se saltea
    if(ev.key==="Escape"){ close(true); }
    else if(ev.key==="ArrowRight"){ nextStep(); }
    else if(ev.key==="ArrowLeft"){ prevStep(); }
  }
  function close(finish){
    if(!_open) return;
    _open=false;
    var r=document.getElementById("obRoot"); if(r) r.remove();
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("ob-open");
    setBackgroundInert(false);
    if(finish) markSeen();
    if(_lastFocus && _lastFocus.focus && document.contains(_lastFocus)) _lastFocus.focus({preventScroll:true});
  }
  function focusPrimary(){
    var card=document.getElementById("obCard"); if(!card) return;
    var b=card.querySelector(".ob-primary") || card.querySelector("button");
    if(b) setTimeout(function(){ b.focus({preventScroll:true}); }, 30);
  }
  function dotsHTML(){
    var h=""; for(var j=0;j<_steps.length;j++) h+='<button type="button" class="ob-dot'+(j===_i?' on':'')+'" data-ob-dot="'+j+'" aria-label="'+e(K("tour.stepof",{n:j+1,total:_steps.length}))+'"'+(j===_i?' aria-current="step"':'')+'></button>';
    return h;
  }
  function renderStep(){
    _mode="steps";
    var s=_steps[_i], card=document.getElementById("obCard"); if(!card||!s) return;
    var last = !!s.last;
    card.innerHTML=
      '<div class="ob-head"><span class="ob-stepof">'+K("tour.stepof",{n:_i+1,total:_steps.length})+'</span>'+
        (last?'':'<button type="button" class="ob-skip" data-ob-skip>'+K("tour.skip")+'</button>')+'</div>'+
      '<div class="ob-pbar" aria-hidden="true"><div class="ob-pfill" style="width:'+Math.round((_i+1)/_steps.length*100)+'%"></div></div>'+
      '<div class="ob-illus" aria-hidden="true">'+s.il()+'</div>'+
      '<div class="ob-body ob-anim"><h2 id="obTitle">'+K(s.t,s.v)+'</h2><p>'+K(s.b,s.v)+'</p></div>'+
      '<div class="ob-foot'+(last?' is-last':'')+'"><div class="ob-dots">'+dotsHTML()+'</div>'+
        (last
          ? '<button type="button" class="ob-btn ob-ghost" data-ob-guide>'+K("tour.guide")+'</button>'+
            '<button type="button" class="ob-btn ob-primary" data-ob-next>'+K("tour.start")+'</button>'
          : '<button type="button" class="ob-btn ob-ghost" data-ob-back'+(_i===0?' disabled':'')+'>'+K("tour.back")+'</button>'+
            '<button type="button" class="ob-btn ob-primary" data-ob-next>'+K("tour.next")+'</button>')+
      '</div>';
    focusPrimary();
  }
  function openChooser(){
    _mode="lang";
    var card=document.getElementById("obCard"); if(!card) return;
    var cur=(typeof lang==="function")?lang():"es";
    card.innerHTML=
      '<div class="ob-illus" aria-hidden="true"><div class="ob-globe">'+S(P.globe)+'</div></div>'+
      '<div class="ob-body ob-center"><h2 id="obTitle">'+K("tour.lang.t")+'</h2><p>'+K("tour.lang.b")+'</p></div>'+
      '<div class="ob-langs">'+
        '<button type="button" class="ob-btn ob-lang'+(cur==="es"?' ob-primary':'')+'" data-ob-lang="es" lang="es"><span class="ob-lc">ES</span>Español</button>'+
        '<button type="button" class="ob-btn ob-lang'+(cur==="en"?' ob-primary':'')+'" data-ob-lang="en" lang="en"><span class="ob-lc">EN</span>English</button></div>'+
      '<p class="ob-langnote">'+K("tour.lang.note")+'</p>';
    focusPrimary();
  }
  function startSteps(){ _steps = admin()?adminSteps():sellerSteps(); _i=0; renderStep(); }
  function nextStep(){ if(_mode!=="steps") return; if(_steps[_i] && _steps[_i].last){ close(true); } else { _i=Math.min(_steps.length-1,_i+1); renderStep(); } }
  function prevStep(){ if(_mode!=="steps") return; if(_i>0){ _i--; renderStep(); } }

  function openTour(force){
    if(_open) return;
    _lastFocus=document.activeElement;
    ensureRoot(); _open=true;
    document.body.classList.add("ob-open");
    setBackgroundInert(true);
    var c=document.getElementById("obCard"); if(c) c.setAttribute("aria-label", K("tour.aria"));
    if(force) startSteps();     // relanzado a mano: ya eligió idioma, va directo al tour
    else openChooser();         // primera vez: elige idioma y arranca
  }

  function loginVisible(){ var l=document.getElementById("login"); return !!(l && !l.hidden); }
  function maybeAutoStart(){
    if(_open || _timer) return;
    if(!sess() || seen()) return;
    // esperamos a que termine la pintada (y a que el login se oculte)
    _timer=setTimeout(function(){
      _timer=null;
      if(_open || !sess() || seen() || loginVisible()) return;
      openTour(false);
    }, 450);
  }

  /* API global */
  window.startOnboarding = function(){ openTour(true); };
  window.maybeStartOnboarding = maybeAutoStart;
  window.closeOnboarding = function(){ close(false); };

  /* Si la sesión se corta (token vencido) con el tour abierto, lo cerramos SIN
     marcarlo visto: el login no puede quedar tapado por el overlay. */
  if(typeof window.showLogin==="function"){
    var _showLogin = window.showLogin;
    window.showLogin = function(){ close(false); return _showLogin.apply(this, arguments); };
  }

  /* Botón "?" (pie del menú y barra mobile) → abre la guía "Cómo usar". */
  document.addEventListener("click", function(ev){
    var b = ev.target.closest && ev.target.closest("[data-open-guide]");
    if(!b || typeof setView!=="function") return;
    ev.preventDefault();
    setView("guia"); window.scrollTo(0,0);
  });

  /* Botones "Repetir el tour" (data-open-help: hoy dentro de la guía). Delegado:
     sirve para los estáticos y para cualquiera que se pinte después. */
  document.addEventListener("click", function(ev){
    var b = ev.target.closest && ev.target.closest("[data-open-help]");
    if(!b) return;
    ev.preventDefault();
    if(b.closest("#moreSheet")){ var sc=document.getElementById("moreScrim"); if(sc) sc.click(); }   // cerrar la hoja antes
    setTimeout(function(){ window.startOnboarding(); }, b.closest("#moreSheet") ? 240 : 0);
  });

  /* Si la app ya arrancó con sesión antes de cargar este archivo, probamos una vez. */
  maybeAutoStart();
})();

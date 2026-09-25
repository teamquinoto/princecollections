/* ============================================================
   Datos: export / import / reset
   ============================================================ */
function exportJSON(){
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`mayor-stock-${isoLocal(new Date())}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  toast(t("io.tt.backup"));
}
function importJSON(){
  const inp=document.createElement("input"); inp.type="file"; inp.accept="application/json";
  inp.onchange=()=>{
    const f=inp.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const data=JSON.parse(r.result);
        if(!data.productos) throw new Error("estructura inválida");
        if(!confirm(t("io.cf.import"))) return;
        db=migrate(Object.assign({config:{moneda:"$"},productos:[],compras:[],ventas:[],movimientos:[],clientes:[]}, data));
        save(); toast(t("io.tt.imported")); render();
      }catch(e){ toast(t("io.tt.invalidjson"),"warn"); }
    };
    r.readAsText(f);
  };
  inp.click();
}
/* v105 · Borrar todo: hay que ESCRIBIR la palabra (BORRAR / DELETE) para habilitar el botón.
   Antes era un confirm() del navegador: un clic de más y se iba todo. */
function resetAll(){
  const palabra = t("dat.reset.word");
  const body = `<p class="u-m0 u-mb3 hint">${t("dat.grp.danger.hint")}</p>
    <div class="field"><label for="rstWord">${t("dat.reset.type",{w:`<b>${esc(palabra)}</b>`})}</label>
    <input class="inp" id="rstWord" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="${esc(palabra)}"></div>`;
  const ok = ()=> (document.getElementById("rstWord")||{}).value && document.getElementById("rstWord").value.trim().toUpperCase()===palabra.toUpperCase();
  buildModal(t("dat.deleteall"), body, [
    { cls:"btn danger", label:t("dat.deleteall"), act:()=>{
        if(!ok()) return;
        db=migrate({ config:db.config, productos:[], compras:[], ventas:[], movimientos:[], clientes:[] });
        save(); closeModal(); toast(t("io.tt.wiped"),"warn"); render(); } },
    { cls:"btn", label:t("common.cancel"), act: closeModal }
  ]);
  const inp=document.getElementById("rstWord");
  const btn=[...document.querySelectorAll("#modalRoot .mfoot button")].find(b=>b.classList.contains("danger"));
  const upd=()=>{ if(btn) btn.disabled=!ok(); };
  if(inp){ inp.addEventListener("input",upd); inp.addEventListener("keydown",e=>{ if(e.key==="Enter" && ok() && btn) btn.click(); }); setTimeout(()=>inp.focus(),50); }
  upd();
}


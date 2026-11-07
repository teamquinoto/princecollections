/* ============================================================
   37 · PERFIL EDITOR — textos y detalles visuales
   ------------------------------------------------------------
   El editor carga compras (también importando la factura) y mantiene
   productos y sus códigos de proveedor. No ve ventas, finanzas,
   configuración ni usuarios, y no puede borrar documentos.
   Los permisos reales los aplica el servidor; esto es la cara visible.
   Módulo idéntico en Prince y Select.
   ============================================================ */
(function(){
  const EN = { "role.editor":"Editor", "usr.role.editor":"Editor (purchases)",
    "ed.err.nodelete":"The Editor profile can't delete documents. Ask an admin.",
    "ed.err.notyours":"You can only edit what you entered. This one was entered by {who}. Ask an admin (or for permission to edit others').",
    "ed.err.notyours0":"You can only edit what you entered. This one predates that record: ask an admin (or for permission to edit others').",
    "usr.f.editothers":"Can edit purchases and sales entered by other users",
    "usr.f.editothers.h":"Off: only what this user entered. Deleting is never allowed for the Editor profile.",
    "usr.sub.editothers":"edits all",
    "doc.by":"Entered by {u}",
    "ed.err.nosale":"The Editor profile loads purchases, not sales." };
  const ES = { "role.editor":"Editor", "usr.role.editor":"Editor (compras)",
    "ed.err.nodelete":"El perfil Editor no puede borrar documentos. Pedíselo a un admin.",
    "ed.err.notyours":"Sólo podés editar lo que cargaste vos. Este lo cargó {who}. Pedíselo a un admin (o que te dé permiso para editar lo de otros).",
    "ed.err.notyours0":"Sólo podés editar lo que cargaste vos. Este es anterior a ese registro: pedíselo a un admin (o que te dé permiso para editar lo de otros).",
    "usr.f.editothers":"Puede editar compras y ventas que cargaron otros usuarios",
    "usr.f.editothers.h":"Apagado: sólo lo que cargó este usuario. Borrar no puede nunca con el perfil Editor.",
    "usr.sub.editothers":"edita todo",
    "doc.by":"Cargado por {u}",
    "ed.err.nosale":"El perfil Editor carga compras, no ventas." };
  try{ Object.assign(I18N.en, EN); Object.assign(I18N.es, ES); }catch(e){ console.warn("editor i18n", e); }
  // Sin botones de venta para el editor (panel, barra superior y botón flotante del celular)
  try{
    const st=document.createElement("style");
    st.textContent='body.role-editor [data-open="venta"], body.role-editor #fabVenta, body.role-editor [data-newsale]{display:none !important}';
    document.head.appendChild(st);
  }catch(e){}
})();

/* nov 2026 · El Editor sólo edita las compras/ventas que cargó él (doc.cargadoPor), salvo que el
   admin le haya dado el permiso "editar lo de otros" en Usuarios. El servidor lo controla igual. */
function puedeEditarDocDe(d){
  if(!isEditor()) return true;
  if(session && session.editaOtros) return true;
  return !!(d && session && d.cargadoPor && String(d.cargadoPor).toLowerCase()===String(session.user||"").toLowerCase());
}
function avisoDocAjeno(d){ toast(d && d.cargadoPor ? t("ed.err.notyours",{who:d.cargadoPor}) : t("ed.err.notyours0"), "warn"); }

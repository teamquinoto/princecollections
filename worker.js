/* ============================================================
   Stock Manager — API (Cloudflare Worker + D1)            v2 (seguridad)
   ------------------------------------------------------------
   Login firmado (HMAC), usuarios en D1 (/users), passwords con
   hash PBKDF2, /state con control de revisión, parse-invoice.

   NUEVO EN v2 (plan de seguridad):
   1) El servidor manda. Un VENDEDOR ya no puede reescribir la base:
      de lo que manda sólo se toman sus ventas (nuevas / editadas /
      borradas, siempre las SUYAS) y los clientes (altas y cambios).
      El costo FIFO, el stock, el kardex, el número de factura y el
      vendedor los calcula el Worker. Todo lo demás (compras, costos,
      productos, gastos, config, ventas de otros) se ignora.
      De yapa: dos vendedores vendiendo a la vez ya no chocan (el
      servidor "rebasa" la venta sobre la versión actual).
   3) Nada se borra de verdad: todo documento que desaparece va a la
      tabla `papelera` (con el documento completo). Si el admin borra
      de golpe más del 30% de algo, el servidor frena y pide confirmar.
   4) Backups: cada versión se guarda en R2 (si está el binding
      BACKUPS) + snapshot diario por cron. Auditoría encadenada
      (hash) en la tabla `auditoria`, que no admite UPDATE ni DELETE.
   5) Login: 5 intentos fallidos por usuario (20 por IP) = bloqueo de
      15 minutos.
   6) Sesiones revocables: cambiar contraseña, rol o borrar un usuario
      lo desloguea al instante en todos sus dispositivos.

   NUEVO EN v3:
   7) Límite de tamaño: cuando la base pasa de ~1,5 MB se guarda
      comprimida (columna data_gz). Así el techo de 2 MB de D1 pasa a
      equivaler a ~15 MB de datos. La app no nota nada.
   8) Papelera: GET /papelera (con "vigente": si ya volvió a la app) y
      POST /papelera/restaurar {id} (sólo admin).

   NUEVO EN v4 (todo APAGADO por defecto: subir este archivo no cambia
   nada para los usuarios hasta que se prenda cada cosa):
   9)  2FA con app autenticadora (TOTP, RFC 6238) por usuario, opcional.
       Login en 2 pasos: /login devuelve {need2fa, ticket} y /login/2fa
       canjea el ticket + código de 6 dígitos (o un código de recuperación).
       5 códigos mal = 15 min de bloqueo. El secreto se guarda cifrado.
   10) Vista filtrada para vendedores (env SELLER_VIEW = "filtrada"):
       GET /state ya no les manda costos, compras, gastos, plan, fotos de
       stock ni ventas de otros vendedores. Hoy la UI los esconde, pero
       viajaban igual al celular.
   11) Cookie HttpOnly (env COOKIE_MODE = "1"): la sesión viaja en una
       cookie que JavaScript no puede leer, en vez de localStorage.
       SÓLO sirve cuando app y API comparten dominio (ver README).
       Mientras tanto se sigue aceptando el header Bearer.
   12) Rate limit de login atómico (un solo UPSERT) y SECRET_LOGIN="off"
       para apagar el admin "de respaldo" del secret (no admite 2FA).

   NUEVO EN v5 (correcciones):
   13) SECRET_LOGIN="off" también corta las sesiones YA abiertas con
       cuentas del secret (antes sólo frenaba los logins nuevos).
   14) Venta de vendedor sin stock suficiente = rechazada (va a la
       papelera con el motivo). Antes se aplicaba igual y el stock
       quedaba negativo (dos vendedores con la última unidad a la vez).
       Restaurar una venta de la papelera sin stock también se frena.
   15) Admin con "conservar mi versión": además de rescatar ventas
       nuevas de vendedores, respeta las que un vendedor EDITÓ o BORRÓ
       mientras tanto (si el admin no tocó esa venta en su copia).
   16) Restaurar una compra: el lote FIFO vuelve con la fecha de la
       factura (antes "ahora": pasaba al final de la cola).
   17) Login sin distinguir mayúsculas en el usuario.

   NUEVO EN v6 (lectura de facturas con IA más rápida):
   18) Gemini con el pensamiento al mínimo que admite cada modelo (antes
       razonaba en nivel "medio" por defecto: la mayor parte de la demora).
   19) Respuesta con esquema fijo (responseSchema): ya no hay JSON roto
       que obligue a leer la factura de nuevo con otro modelo.
   20) Tope de 45 s por intento: si un modelo se cuelga, pasa al siguiente.
   21) La API key viaja en un header (antes en la URL).
   22) Modelos configurables sin tocar código: variable GEMINI_MODELS.
   23) Cada lectura deja en los logs el modelo, los ms y los tokens.

   NUEVO EN v7:
   24) /parse-invoice acepta { texto } además de { pdf }: la app manda el
       texto que ya sacó del PDF (mucho más liviano que el PDF entero). Si
       no hay texto (PDF escaneado) sigue mandando el PDF como antes.

   NUEVO EN v11 (nov 2026):
   - Cada compra y venta guarda quién la cargó (cargadoPor), lo pone el servidor.
   - Perfil Editor: sólo edita las compras/ventas que cargó él, salvo que el admin le
     dé el permiso "editar lo de otros" (columna usuarios.edita_otros, se crea sola).

   NUEVO EN v8:
   25) Cascada "rápido primero, verificado": arranca con Flash-Lite (el más
       rápido) y CUADRA lo que leyó (líneas + flete + cargos + impuestos =
       total de la factura). Si no cuadra, recién ahí prueba el modelo
       siguiente, más pesado. Si ninguno cuadra, devuelve la mejor lectura
       con cuadra:false para que la app avise.
   26) Los cargos que no son mercadería (Handling Fees, etc.) vienen aparte
       en "cargos" y la app los carga como handling de la compra.

   NUEVO EN v9 (dos admins a la vez, va con la app v131):
   27) Dos ADMINS pueden trabajar a la vez sin "Conflicto". Cada versión
       queda en la tabla `estado_hist` (se crea sola; guarda las últimas
       HIST_MAX). Cuando un admin guarda sobre una versión vieja, el
       servidor busca esa versión base y combina documento por documento
       (combinar3): lo que tocó sólo uno, queda; el stock se combina por
       diferencias. Sólo hay conflicto si los dos tocaron JUSTO lo mismo,
       y la respuesta dice qué fue.

   NUEVO EN v10 (va con la app v134):
   28) Cuenta de cobro en las ventas de vendedores: el servidor acepta
       cuentaCobro sólo si existe en config.cuentasCobro y guarda el
       nombre como foto (cuentaCobroNombre). Los vendedores reciben la
       lista de cuentas en su vista filtrada.
   29) Perfil EDITOR (role "editor"): carga compras (y lee facturas con
       IA) y mantiene productos. Guarda como el admin, pero el servidor
       devuelve a como estaban las ventas, la configuración, los gastos y
       el plan, y rechaza si intenta borrar compras, productos o clientes.
       Nunca puede forzar ("sobrescribir el servidor").
   30) Stock del grupo: /grupo/stock (entre servidores, con GRUPO_KEY) y
       /grupo/consolidado (admin/editor). Variables nuevas: GRUPO_KEY
       (secreto), GRUPO_PEER_URL (dirección del servidor de Select) y,
       opcional, GRUPO_NOMBRE. Sin costos ni precios.
   ============================================================ */

const APP_NAME = "stockmanager";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;   // 30 días
const PBKDF2_ITERS = 100000;                      // máximo que admite WebCrypto en Workers
const INV_STORE = "__inv";

const LOGIN_MAX_FALLOS_USER = 5;
const LOGIN_MAX_FALLOS_IP = 20;
const LOGIN_VENTANA_MS = 15 * 60 * 1000;          // 15 minutos

const MAX_FILA_BYTES = 1_900_000;                 // D1: una fila no puede pasar de 2 MB
const GZ_DESDE_DEF = 1_500_000;                   // v3: desde este tamaño el estado se guarda COMPRIMIDO (~8x menos)
const MAX_REQ_BYTES = 25_000_000;                 // tope de lo que aceptamos en un PUT
const LIMITE_CELULAR = 4_500_000;                 // los celulares guardan la base en localStorage (~5 MB)
const BORRADO_MASIVO_PCT = 0.30;                  // >30% de una colección = pedir confirmación
const BORRADO_MASIVO_MIN = 10;                    // sólo si la colección tiene 10+ elementos
const MIN_PASS = 8;
const MAX_BAJAS_VENDEDOR = 5;                     // más bajas juntas de un vendedor = sospechoso
const HIST_MAX = 300;                             // v9: versiones que se guardan para poder combinar (las más viejas se borran)

// v4
const COOKIE_NAME = "gs_sess";
const TICKET_2FA_MS = 5 * 60 * 1000;              // el paso 2 del login vence a los 5 minutos
const TOTP_PASO_S = 30, TOTP_DIGITOS = 6, TOTP_VENTANA = 1;   // acepta el código anterior/siguiente (relojes corridos)
const MAX_FALLOS_2FA = 5;
const N_RECUPERACION = 8;

/* ---------------- CORS ---------------- */
function cors(env, req) {
  const origin = (req && req.headers.get("Origin")) || "";
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  let allow = "*";
  if (list.length) allow = list.includes(origin) ? origin : list[0];
  const h = {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  // v4: las cookies sólo viajan si el servidor lo autoriza, y NUNCA con "*".
  if (allow !== "*" && list.includes(origin)) h["Access-Control-Allow-Credentials"] = "true";
  return h;
}
function origenPermitido(env, req) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") || "";
  return list.length > 0 && list.includes(origin);
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...(headers || {}) }
  });
}
/* Error con texto en español e inglés (la app muestra el del idioma elegido). */
function err(status, CORS, error, es, en, extra) {
  return json({ error, es, en, ...(extra || {}) }, status, CORS);
}
function errGrande(CORS) {
  return err(413, CORS, "state too large",
    "La base llegó a su límite de tamaño y no se guardó el cambio. Hay que reorganizar cómo se guardan los datos.",
    "The database reached its size limit and the change was not saved. The storage needs to be reorganized.");
}

/* ---------------- bytes / base64url ---------------- */
function b64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(h) {
  const m = String(h).match(/../g) || [];
  return new Uint8Array(m.map(x => parseInt(x, 16)));
}
async function sha256hex(str) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)));
}

/* ---------------- TOKEN FIRMADO (HMAC-SHA256) ---------------- */
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(env, payload) {
  const body = b64url(JSON.stringify(payload));
  const key = await hmacKey(env.AUTH_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return body + "." + b64url(sig);
}
async function verifyToken(env, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let ok = false;
  try {
    const key = await hmacKey(env.AUTH_SECRET);
    ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), new TextEncoder().encode(body));
  } catch (_) { return null; }
  if (!ok) return null;
  let p;
  try { p = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))); } catch (_) { return null; }
  if (!p || !p.exp || Date.now() > Number(p.exp)) return null;   // v2: sin vencimiento = inválido
  return p;
}

/* ---------------- Hash de contraseñas (PBKDF2) ---------------- */
function randSaltHex(n = 16) { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
async function pbkdf2(pass, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PBKDF2_ITERS, hash: "SHA-256" }, key, 256);
  return hex(bits);
}
function igualSeguro(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyPass(pass, saltHex, hashHex) {
  if (!saltHex || !hashHex) return false;
  return igualSeguro(await pbkdf2(String(pass), saltHex), hashHex);
}

function normRole(r) { r = String(r || "").toLowerCase(); return (r === "admin" || r === "editor") ? r : "seller"; }   // v10: + editor
/* Perfil EDITOR · carga compras y mantiene productos. Sobre la versión en la que
   trabajó (ref): lo que no le corresponde (ventas, configuración, gastos, plan…)
   vuelve a como estaba, y no puede borrar compras, productos ni clientes.
   Devuelve {es, en} si hay que rechazar, o null si se puede seguir. */
const EDITOR_RESTAURA = ["config", "ventas", "gastos", "fpa", "stockSnaps", "solicitudes", "presupuesto"];
const EDITOR_SIN_BAJAS = ["compras", "productos", "clientes"];
function protegerEditor(ref, mio) {
  if (!ref || !mio) return { es: "No hay una versión base para comparar.", en: "No base version to compare." };
  for (const k of EDITOR_RESTAURA) {
    if (ref[k] !== undefined) mio[k] = JSON.parse(JSON.stringify(ref[k]));
    else delete mio[k];
  }
  for (const col of EDITOR_SIN_BAJAS) {
    const tiene = new Set((Array.isArray(mio[col]) ? mio[col] : []).map(d => d && d.id));
    const faltan = (Array.isArray(ref[col]) ? ref[col] : []).filter(d => d && d.id && !tiene.has(d.id));
    if (faltan.length) return { es: `El perfil Editor no puede borrar ${col} (${faltan.length}).`, en: `The Editor profile can't delete ${col} (${faltan.length}).` };
  }
  return null;
}

/* v11 · QUIÉN CARGÓ CADA DOCUMENTO (compras y ventas): lo pone el servidor.
   Doc nuevo → el usuario que lo guardó. Doc que ya existía → conserva el autor
   que tenía (nadie lo puede cambiar desde la app). Los docs viejos quedan sin autor. */
function marcarAutor(prev, next, user) {
  for (const col of ["compras", "ventas"]) {
    const pm = new Map(((prev && prev[col]) || []).map(d => [d && d.id, d]));
    for (const d of (next[col] || [])) {
      if (!d || typeof d !== "object") continue;
      const p = pm.get(d.id);
      if (p) { if (p.cargadoPor) d.cargadoPor = p.cargadoPor; else delete d.cargadoPor; }
      else if (user) d.cargadoPor = String(user);
    }
  }
}
/* v11 · Perfil EDITOR: sólo edita los documentos que cargó él, salvo que el admin le
   haya dado el permiso "editar lo de otros" (usuarios.edita_otros). Marcar una compra
   como recibida no cuenta como edición. Devuelve el primer doc ajeno modificado o null. */
const ED_IGNORA = new Set(["srvRev", "status", "cargadoPor"]);
function edCanon(x) {
  if (x === undefined) return "u";
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(edCanon).join(",") + "]";
  // vacío = ausente: la app completa campos viejos al abrir (p. ej. vendedor "" → null) y eso no es una edición
  return "{" + Object.keys(x).filter(k => !ED_IGNORA.has(k) && x[k] !== undefined && x[k] !== null && x[k] !== "").sort()
    .map(k => JSON.stringify(k) + ":" + edCanon(x[k])).join(",") + "}";
}
function editorAjeno(ref, mio, user, cols) {
  const yo = String(user || "").toLowerCase();
  for (const col of cols) {
    const rm = new Map(((ref && ref[col]) || []).map(d => [d && d.id, d]));
    for (const d of (mio[col] || [])) {
      const r = d && rm.get(d.id);
      if (!r || String(r.cargadoPor || "").toLowerCase() === yo) continue;
      if (edCanon(r) !== edCanon(d)) return { col, numero: r.numero || r.id, quien: r.cargadoPor || "" };
    }
  }
  return null;
}
function msgAjeno(a) {
  const es = a.col === "ventas" ? "las ventas" : "las compras", en = a.col === "ventas" ? "sales" : "purchases";
  const esDoc = (a.col === "ventas" ? "La venta " : "La compra ") + a.numero, enDoc = (a.col === "ventas" ? "Sale " : "Purchase ") + a.numero;
  return { es: `Sólo podés editar ${es} que cargaste vos. ${esDoc} ${a.quien ? "la cargó " + a.quien : "es anterior a este control"}. Pedile a un administrador que la cambie o que te dé permiso.`,
           en: `You can only edit ${en} you entered. ${enDoc} ${a.quien ? "was entered by " + a.quien : "predates this control"}. Ask an administrator to change it or to grant you permission.` };
}

/* ============================================================
   ESQUEMA (se asegura una vez por instancia del Worker)
   ============================================================ */
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS estado (space TEXT PRIMARY KEY, data TEXT, rev INTEGER NOT NULL DEFAULT 0, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS usuarios (user TEXT PRIMARY KEY, pass_hash TEXT, salt TEXT, role TEXT NOT NULL DEFAULT 'seller', vendedor_id TEXT, cliente_id TEXT, name TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS login_intentos (clave TEXT PRIMARY KEY, fallos INTEGER NOT NULL DEFAULT 0, desde INTEGER NOT NULL DEFAULT 0, bloqueado_hasta INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS papelera (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, space TEXT, rev INTEGER, actor TEXT, role TEXT, coleccion TEXT, doc_id TEXT, motivo TEXT, doc TEXT)",
  "CREATE TABLE IF NOT EXISTS auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, space TEXT, rev INTEGER, actor TEXT, role TEXT, ip TEXT, pais TEXT, ray TEXT, accion TEXT, resumen TEXT, sha256 TEXT, hash_prev TEXT, hash TEXT)",
  // Candados a nivel base: aunque el código tuviera un bug, esto no se puede borrar ni editar.
  "CREATE TRIGGER IF NOT EXISTS auditoria_sin_update BEFORE UPDATE ON auditoria BEGIN SELECT RAISE(ABORT, 'auditoria: solo se puede agregar'); END",
  "CREATE TRIGGER IF NOT EXISTS auditoria_sin_delete BEFORE DELETE ON auditoria BEGIN SELECT RAISE(ABORT, 'auditoria: solo se puede agregar'); END",
  "CREATE TRIGGER IF NOT EXISTS papelera_sin_update BEFORE UPDATE ON papelera BEGIN SELECT RAISE(ABORT, 'papelera: solo se puede agregar'); END",
  "CREATE TRIGGER IF NOT EXISTS papelera_sin_delete BEFORE DELETE ON papelera BEGIN SELECT RAISE(ABORT, 'papelera: solo se puede agregar'); END",
  "CREATE TRIGGER IF NOT EXISTS estado_sin_delete BEFORE DELETE ON estado BEGIN SELECT RAISE(ABORT, 'estado: prohibido borrar'); END",
  // v9: versiones anteriores del estado (base para combinar cambios de dos admins)
  "CREATE TABLE IF NOT EXISTS estado_hist (space TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT, data_gz BLOB, ts TEXT, PRIMARY KEY (space, rev))"
];
let schemaListo = null;
function ensureSchema(env) {
  if (!schemaListo) {
    schemaListo = (async () => {
      for (const sql of SCHEMA) {
        try { await env.DB.prepare(sql).run(); } catch (e) { console.error("schema:", sql.slice(0, 60), e && e.message); }
      }
      // Columna nueva para revocar sesiones (falla si ya existe: es lo esperado).
      try { await env.DB.prepare("ALTER TABLE usuarios ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0").run(); } catch (_) {}
      try { await env.DB.prepare("ALTER TABLE estado ADD COLUMN data_gz BLOB").run(); } catch (_) {}
      // v11: permiso del editor para editar documentos que cargaron otros (0 = sólo los suyos)
      try { await env.DB.prepare("ALTER TABLE usuarios ADD COLUMN edita_otros INTEGER NOT NULL DEFAULT 0").run(); } catch (_) {}
      // v4: 2FA (TOTP). Columnas nuevas; si ya existen, el ALTER falla y se ignora.
      for (const col of ["totp_secret TEXT", "totp_pend TEXT", "totp_on INTEGER NOT NULL DEFAULT 0",
                         "totp_ult INTEGER NOT NULL DEFAULT 0", "totp_recup TEXT"]) {
        try { await env.DB.prepare("ALTER TABLE usuarios ADD COLUMN " + col).run(); } catch (_) {}
      }
    })().catch(e => { schemaListo = null; throw e; });
  }
  return schemaListo;
}

/* ============================================================
   IDENTIDAD / LOGIN
   ============================================================ */
function usuariosSecret(env) {
  if (!env.USERS) return [];
  try { const l = JSON.parse(env.USERS); return Array.isArray(l) ? l : []; } catch (_) { return []; }
}
function resolveUserSecret(env, user, pass) {
  const u = usuariosSecret(env).find(x => String(x.user) === user && igualSeguro(String(x.pass), pass));
  if (u) {
    const role = normRole(u.role);
    if (role === "seller") return { user, role, vendedorId: String(u.id || u.user || user).trim().toLowerCase(), name: u.name || user, tv: 0 };
    return { user, role, vendedorId: "", name: u.name || user, tv: 0 };
  }
  if (env.ADMIN_USER && env.ADMIN_PASS && user === env.ADMIN_USER && igualSeguro(pass, env.ADMIN_PASS)) {
    return { user, role: "admin", vendedorId: "", name: env.ADMIN_USER, tv: 0 };
  }
  return null;
}
/* Identidad de un usuario "de secret" SIN contraseña (para revalidar tokens). */
function identidadSecret(env, user) {
  const u = usuariosSecret(env).find(x => String(x.user) === user);
  if (u) {
    const role = normRole(u.role);
    return { role, vendedorId: role === "seller" ? String(u.id || u.user || user).trim().toLowerCase() : "", name: u.name || user };
  }
  if (env.ADMIN_USER && user === env.ADMIN_USER) return { role: "admin", vendedorId: "", name: env.ADMIN_USER };
  return null;
}
async function resolveUserDB(env, user, pass) {
  /* v5: los usuarios se crean en minúscula (POST /users), pero el login buscaba tal cual:
     "Juan" no encontraba a "juan", fallaba como contraseña incorrecta y sumaba al bloqueo. */
  const row = await env.DB.prepare("SELECT * FROM usuarios WHERE user = ? COLLATE NOCASE").bind(user).first();
  if (row) {
    const ok = await verifyPass(pass, row.salt, row.pass_hash);
    if (!ok) return null;
    const role = normRole(row.role);
    return {
      user: row.user, role,
      vendedorId: role === "seller" ? String(row.vendedor_id || row.user).trim().toLowerCase() : "",
      name: row.name || row.user, tv: Number(row.token_version || 0),
      fuente: "db", totp: !!row.totp_on, editaOtros: role === "editor" && !!Number(row.edita_otros || 0)
    };
  }
  // Usuario que no está en D1: igual gastamos el tiempo de un PBKDF2 para que no
  // se pueda adivinar por la demora qué usuarios existen.
  await pbkdf2(String(pass), "00000000000000000000000000000000");
  const s = resolveUserSecret(env, user, pass);
  return s ? { ...s, fuente: "secret", totp: false } : null;
}

async function bloqueoVigente(env, clave, ahora) {
  const r = await env.DB.prepare("SELECT bloqueado_hasta FROM login_intentos WHERE clave = ?").bind(clave).first();
  return r && Number(r.bloqueado_hasta) > ahora ? Number(r.bloqueado_hasta) : 0;
}
/* v4: UN solo UPSERT atómico. Antes era leer-y-después-escribir: con muchos
   pedidos en paralelo, varios leían el mismo contador y se colaban intentos
   de más. SQLite evalúa todo el SET con los valores VIEJOS de la fila. */
async function registrarFallo(env, clave, max, ahora) {
  const r = await env.DB.prepare(
    "INSERT INTO login_intentos (clave, fallos, desde, bloqueado_hasta) VALUES (?1, 1, ?2, 0) " +
    "ON CONFLICT(clave) DO UPDATE SET " +
    " fallos = CASE WHEN ?2 - desde < ?3 THEN fallos + 1 ELSE 1 END, " +
    " desde  = CASE WHEN ?2 - desde < ?3 THEN desde ELSE ?2 END, " +
    " bloqueado_hasta = CASE WHEN (CASE WHEN ?2 - desde < ?3 THEN fallos + 1 ELSE 1 END) >= ?4 THEN ?2 + ?3 ELSE 0 END " +
    "RETURNING bloqueado_hasta"
  ).bind(clave, ahora, LOGIN_VENTANA_MS, max).first();
  return r ? Number(r.bloqueado_hasta) || 0 : 0;
}

/* Revalida el token contra D1 en cada pedido: si el usuario fue borrado, o le
   cambiaron contraseña/rol (token_version distinto), la sesión deja de valer. */
async function identidadVigente(env, tok) {
  const user = String(tok.u || "");
  if (!user) return null;
  const row = await env.DB.prepare("SELECT * FROM usuarios WHERE user = ?").bind(user).first();
  if (row) {
    if (Number(row.token_version || 0) !== Number(tok.tv || 0)) return null;
    const role = normRole(row.role);
    return { u: row.user, role, vid: role === "seller" ? String(row.vendedor_id || row.user).trim().toLowerCase() : "", name: row.name || row.user, sp: tok.sp || "main",
             eo: role === "editor" && !!Number(row.edita_otros || 0) };
  }
  /* v5: con SECRET_LOGIN="off" tampoco valen las sesiones YA abiertas con esas cuentas.
     Antes sólo se frenaba el login nuevo: un token emitido antes seguía andando 30 días. */
  if (String(env.SECRET_LOGIN || "").toLowerCase() === "off") return null;
  const s = identidadSecret(env, user);
  if (!s) return null;
  return { u: user, role: s.role, vid: s.vendedorId, name: s.name, sp: tok.sp || "main" };
}

/* ============================================================
   v4 · 2FA (TOTP, RFC 6238) — sin librerías: WebCrypto alcanza.
   ------------------------------------------------------------
   El secreto es un número al azar de 160 bits que comparten el
   servidor y la app autenticadora del celular. Cada 30 segundos los
   dos calculan HMAC-SHA1(secreto, minuto_actual) y lo recortan a 6
   dígitos. Si coinciden, la persona tiene el celular en la mano.
   ============================================================ */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes) {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function base32Bytes(str) {
  const s = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0; const out = [];
  for (const ch of s) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function totpEn(secretB32, contador, digitos = TOTP_DIGITOS) {
  const key = await crypto.subtle.importKey("raw", base32Bytes(secretB32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  let c = contador;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digitos).padStart(digitos, "0");
}
/* Devuelve el contador que matcheó (para impedir reusar el mismo código) o 0. */
async function totpVerificar(secretB32, codigo, ultUsado, ahoraMs = Date.now()) {
  codigo = String(codigo || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(codigo)) return 0;
  const actual = Math.floor(ahoraMs / 1000 / TOTP_PASO_S);
  for (let d = -TOTP_VENTANA; d <= TOTP_VENTANA; d++) {
    const c = actual + d;
    if (c <= Number(ultUsado || 0)) continue;           // anti-replay: ese código ya se usó
    if (igualSeguro(await totpEn(secretB32, c), codigo)) return c;
  }
  return 0;
}
/* El secreto TOTP se guarda cifrado (AES-GCM). Si alguien se lleva una copia
   de la base, no puede generar códigos. Clave: secret TOTP_KEY (recomendado) o,
   si no está, AUTH_SECRET. OJO: si cambiás esa clave, hay que re-enrolar el 2FA. */
async function claveTotp(env) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("totp|" + (env.TOTP_KEY || env.AUTH_SECRET)));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function cifrar(env, texto) {
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await claveTotp(env), new TextEncoder().encode(texto));
  return b64url(iv) + "." + b64url(ct);
}
async function descifrar(env, blob) {
  try {
    const [iv, ct] = String(blob || "").split(".");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64urlToBytes(iv) }, await claveTotp(env), b64urlToBytes(ct));
    return new TextDecoder().decode(pt);
  } catch (_) { return ""; }
}
function codigosRecuperacion() {
  const out = [];
  for (let i = 0; i < N_RECUPERACION; i++) {
    const a = new Uint8Array(5); crypto.getRandomValues(a);
    const s = base32(a).toLowerCase().slice(0, 8);
    out.push(s.slice(0, 4) + "-" + s.slice(4));
  }
  return out;
}
function normRecup(c) { return String(c || "").toLowerCase().replace(/[^a-z2-7]/g, ""); }

/* ============================================================
   v4 · SESIÓN: token en el cuerpo (Bearer) o en cookie HttpOnly
   ============================================================ */
function modoCookie(env) { return String(env.COOKIE_MODE || "") === "1"; }
function leerCookie(req, nombre) {
  const c = req.headers.get("Cookie") || "";
  for (const parte of c.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return "";
}
/* HttpOnly = JavaScript no la puede leer (un XSS no se la puede llevar).
   Secure   = sólo viaja por HTTPS.
   SameSite=Strict = el navegador no la manda si el pedido lo origina otro sitio (anti-CSRF). */
function cookieSesion(token, maxAgeS) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeS}`;
}
async function emitirSesion(env, CORS, u, ahora) {
  const token = await signToken(env, {
    u: u.user, role: u.role, vid: u.vendedorId || "", tv: u.tv || 0, sp: "main",
    iat: ahora, exp: ahora + TOKEN_TTL_MS
  });
  const body = { ok: true, user: u.user, role: u.role, vendedorId: u.vendedorId || "", name: u.name || u.user, space: "main", editaOtros: !!u.editaOtros };
  if (!modoCookie(env)) return json({ ...body, token }, 200, CORS);
  // Modo cookie: el token NO va en el cuerpo, así nunca toca localStorage.
  return json({ ...body, cookie: true }, 200, { ...CORS, "Set-Cookie": cookieSesion(token, Math.floor(TOKEN_TTL_MS / 1000)) });
}

/* ============================================================
   v4 · VISTA DEL VENDEDOR (env SELLER_VIEW = "filtrada")
   ------------------------------------------------------------
   Antes GET /state le mandaba al vendedor la base ENTERA (costos,
   compras a proveedores, gastos, ventas y comisiones de los demás) y la
   app sólo "no se la mostraba": con las herramientas del navegador se
   veía todo. Ahora el servidor recorta ANTES de mandar.
   Es seguro para el guardado: de lo que manda un vendedor el servidor
   sólo toma SUS ventas y los clientes (rebaseVendedor), y las bajas sólo
   se detectan sobre SUS ventas, que en esta vista están todas.
   ============================================================ */
function vistaFiltrada(env) { return String(env.SELLER_VIEW || "").toLowerCase() === "filtrada"; }
function vistaVendedor(data, who, stores) {
  const d = data || {};
  const cfg = d.config || {};
  const vid = who.vid || "";
  const ventasPropias = (d.ventas || []).filter(v => v && v.vendedorId === vid);
  const idsPropias = new Set(ventasPropias.map(v => v.id));
  const sinCosto = L => ({ ...L, costoUnit: 0, ref: "", refId: null });
  const productos = (d.productos || []).map(p => {
    const q = { ...p, costoNeto: 0, costoHandling: 0, costoFlete: 0, ultimoCosto: 0 };
    const spt = {}, lotes = {};
    for (const s of stores) {
      if (p.stockPorTienda && p.stockPorTienda[s] != null) spt[s] = p.stockPorTienda[s];
      if (p.lotes && Array.isArray(p.lotes[s])) lotes[s] = p.lotes[s].map(sinCosto);
    }
    q.stockPorTienda = spt; q.lotes = lotes;                   // sin la bóveda de inversión
    return q;
  }).filter(p => stores.some(s => (p.stockPorTienda[s] || 0) !== 0) || p.estado !== "investment");
  return {
    _vista: "vendedor",                                        // marca: esto NO es la base completa
    config: {
      moneda: cfg.moneda, facturaInicio: cfg.facturaInicio, emisor: cfg.emisor,
      commissionRate: cfg.commissionRate,
      vendedores: (cfg.vendedores || []).map(v => v && v.id === vid ? v : { id: v.id, nombre: v.nombre, rate: 0 }),
      idiomaEnV1: cfg.idiomaEnV1, clientesCaseV1: cfg.clientesCaseV1,
      cuentasCobro: Array.isArray(cfg.cuentasCobro) ? cfg.cuentasCobro.map(c => ({ id: c.id, nombre: c.nombre, activa: c.activa })) : []   // v10
    },
    productos,
    // Compras: sólo lo que está en tránsito (la app lo muestra como "próximamente"), sin precios.
    compras: (d.compras || []).filter(c => c && c.status === "in_transit").map(c => ({
      id: c.id, tipo: c.tipo, fecha: c.fecha, status: c.status, store: c.store, numero: "", contraparte: "",
      subtotal: 0, total: 0, handling: 0, flete: 0,
      lineas: (c.lineas || []).map(l => ({ productoId: l.productoId, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio: 0, costo: 0 }))
    })),
    // Sus ventas completas (la comisión se calcula sobre el margen), sin el detalle de lotes por sociedad.
    ventas: ventasPropias.map(v => ({ ...v, lineas: (v.lineas || []).map(l => { const { consumed, ...r } = l; return r; }) })),
    movimientos: (d.movimientos || []).filter(m => m && m.refTipo === "venta" && idsPropias.has(m.refId)).map(m => ({ ...m, valorUnit: 0 })),
    clientes: d.clientes || [],                                // los vendedores crean y atienden clientes
    solicitudes: d.solicitudes || [],
    fpa: {}, stockSnaps: {}, gastos: {}
  };
}
function estadoParaCliente(env, who, dataStr) {
  if (who.role !== "seller" || !vistaFiltrada(env)) return dataStr;
  let d; try { d = JSON.parse(dataStr); } catch (_) { return "null"; }
  return JSON.stringify(vistaVendedor(d, who, storeIds(env)));
}

/* ============================================================
   CATÁLOGO PÚBLICO (sin login) — GET /public/catalog
   ------------------------------------------------------------
   El estado completo (costos, lotes FIFO, clientes, ventas) NUNCA
   sale de acá. Se arma una lista mínima del lado del servidor con
   una WHITELIST de campos. (Sin cambios de lógica respecto de v1.)
   ============================================================ */
const CATALOG_TTL_S = 60;

const SAGA_CANON = [
  { canon: "Pokémon TCG",     re: /pok[eé]?mon/i },
  { canon: "Magic",           re: /\bmagic\b|\bmtg\b|the\s+gathering/i },
  { canon: "One Piece TCG",   re: /one\s*piece|\bop-?op\d/i },
  { canon: "Disney Lorcana",  re: /lorcana/i },
  { canon: "Flesh and Blood", re: /flesh\s*(and|&|\+)?\s*blood|\bfab\b/i },
  { canon: "Digimon",         re: /digimon/i },
  { canon: "Dragon Ball",     re: /dragon\s*ball|\bdbs\b/i },
  { canon: "Yu-Gi-Oh!",       re: /yu-?gi-?oh|\bygo\b/i },
];
/* Copia de sagaDe() del front (10-view-dashboard.js). Si cambia allá, cambiar acá. */
function sagaDe(p) {
  let n = String(p.nombre || "").trim();
  if (!n) return "";
  n = n.replace(/^[A-Z0-9]{2,}(?:-[A-Z0-9]+)+\s*[·:\-—|]\s*/, "").trim();
  const cut = n.split(/\s*[:·|]\s*|\s+[-—]\s+/)[0];
  let base = (cut || n).trim().replace(/^[\s\-—·:|]+|[\s\-—·:|]+$/g, "").replace(/\s{2,}/g, " ").trim();
  for (const s of SAGA_CANON) { if (s.re.test(base) || s.re.test(n)) return s.canon; }
  if (!base) return "";
  const w = base.split(/\s+/);
  return w.length > 3 ? w.slice(0, 3).join(" ") : base;
}
function juegoDe(p) {
  const c = String(p.categoria || "").trim();
  if (c && c !== "Otros") return c;
  return sagaDe(p) || "Other";
}
function limpiarUrlImagen(u) {
  u = String(u || "").trim();
  return /^https?:\/\/\S+$/i.test(u) && u.length <= 1000 ? u : "";
}
function r4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function limpiarNombrePublico(n) {
  let s = String(n || ""), limit = 0;
  s = s.replace(/\s*(?:[-–—]\s*)?\(?\s*\b(?:limit|l[ií]mite)\s*(?:x\s*)?(\d{1,3})\b\s*\)?/gi, (m, d) => { limit = +d; return ""; });
  s = s.replace(/\*[^*]{1,24}\*\s*[-–—:]?\s*/g, "");
  s = s.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.)])/g, "$1")
       .replace(/[\s\-–—:·|]+$/, "").replace(/^[\s\-–—:·|]+/, "").trim();
  return { name: s, limit };
}

function armarCatalogo(data) {
  const productos = Array.isArray(data && data.productos) ? data.productos : [];
  const compras = Array.isArray(data && data.compras) ? data.compras : [];
  const transito = {};
  for (const c of compras) {
    if (!c || c.status !== "in_transit") continue;
    for (const l of (c.lineas || [])) {
      if (!l || !l.productoId) continue;
      transito[l.productoId] = (transito[l.productoId] || 0) + (Number(l.cantidad) || 0);
    }
  }
  const items = [];
  for (const p of productos) {
    if (!p || !p.id) continue;
    if (p.estado === "blocked") continue;
    const spt = p.stockPorTienda || {};
    let stock = 0;
    for (const k of Object.keys(spt)) { if (k !== INV_STORE) stock += Number(spt[k]) || 0; }
    stock = Math.max(0, r4(stock));
    const tr = Math.max(0, r4(transito[p.id] || 0));
    if (stock <= 0 && tr <= 0) continue;
    const soon = stock <= 0;
    const upc = Number(p.boxesPorCase) > 0 ? Number(p.boxesPorCase) : 1;
    const limpio = limpiarNombrePublico(p.nombre);
    const nombrePub = String(p.nombrePublico || "").trim();
    const limite = Number(p.limiteCliente) > 0 ? Math.floor(Number(p.limiteCliente)) : limpio.limit;
    items.push({
      id: String(p.id),
      name: nombrePub || limpio.name || String(p.nombre || "").trim(),
      game: juegoDe(p),
      lang: ["JP", "ESP", "KOR", "EN"].includes(p.idioma) ? p.idioma : "",
      stock: soon ? 0 : stock, soon, upc,
      limit: limite || 0,
      img: limpiarUrlImagen(p.imagen)
    });
  }
  items.sort((a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name));
  const emisor = (data && data.config && data.config.emisor) || {};
  return { brand: String(emisor.nombre || "").trim(), items };
}

/* ============================================================
   MOTOR DE STOCK (copia server-side de 02-engine.js / moverStock)
   ------------------------------------------------------------
   Mismas reglas que la app: FIFO GLOBAL por fecha de entrada del
   lote, cruzando sociedades; la bóveda (__inv) no participa.
   Si cambiás el motor en el front, revisá esta copia.
   ============================================================ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function storeIds(env) {
  const l = String(env.STORE_IDS || "akira,silver").split(",").map(s => s.trim()).filter(Boolean);
  return l.length ? l : ["akira", "silver"];
}
function motor(m, STORES) {
  const isStore = id => STORES.includes(id);
  const stockDe = (p, s) => (p.stockPorTienda && p.stockPorTienda[s]) || 0;
  const stockTotal = p => STORES.reduce((a, s) => a + stockDe(p, s), 0);
  const recalc = p => { p.stock = stockTotal(p); };
  function fifoLayers(p, s) {
    if (!p.lotes) p.lotes = {};
    if (!Array.isArray(p.lotes[s])) p.lotes[s] = [];
    return p.lotes[s];
  }
  function capasOrdenadas(p) {
    const out = [];
    STORES.forEach(s => { fifoLayers(p, s).forEach((L, i) => out.push({ sociedad: s, L, _ord: i })); });
    out.sort((a, b) => {
      const fa = a.L.fecha || "", fb = b.L.fecha || "";
      if (fa < fb) return -1; if (fa > fb) return 1;
      return a._ord - b._ord;
    });
    return out;
  }
  function consumir(p, cantidad) {
    let need = cantidad, cogs = 0; const consumed = []; const porSoc = {};
    for (const c of capasOrdenadas(p)) {
      if (need <= 0) break;
      const take = Math.min(c.L.cantidad, need);
      if (take <= 0) continue;
      cogs += take * c.L.costoUnit;
      consumed.push({ sociedad: c.sociedad, costoUnit: c.L.costoUnit, cantidad: take, refId: c.L.refId || null, fecha: c.L.fecha || null });
      (porSoc[c.sociedad] = porSoc[c.sociedad] || { cantidad: 0, cogs: 0 });
      porSoc[c.sociedad].cantidad += take;
      porSoc[c.sociedad].cogs = r2(porSoc[c.sociedad].cogs + take * c.L.costoUnit);
      c.L.cantidad = r4(c.L.cantidad - take);
      need -= take;
    }
    STORES.forEach(s => { p.lotes[s] = fifoLayers(p, s).filter(L => L.cantidad > 0.00001); });
    if (need > 0) {
      const cst = p.ultimoCosto || 0;
      cogs += need * cst;
      consumed.push({ sociedad: STORES[0], costoUnit: cst, cantidad: need, synthetic: true });
      (porSoc[STORES[0]] = porSoc[STORES[0]] || { cantidad: 0, cogs: 0 });
      porSoc[STORES[0]].cantidad += need;
      porSoc[STORES[0]].cogs = r2(porSoc[STORES[0]].cogs + need * cst);
      need = 0;
    }
    return { cogs: r2(cogs), unit: cantidad > 0 ? r2(cogs / cantidad) : 0, consumed, porSociedad: porSoc };
  }
  function devolver(p, consumed, fallbackSoc) {
    const repuesto = {};
    if (!consumed || !consumed.length) return repuesto;
    for (let i = consumed.length - 1; i >= 0; i--) {
      const c = consumed[i];
      if (c.synthetic) continue;
      const soc = isStore(c.sociedad) ? c.sociedad : (isStore(fallbackSoc) ? fallbackSoc : STORES[0]);
      fifoLayers(p, soc).unshift({ id: uid(), fecha: c.fecha || new Date().toISOString(), cantidad: c.cantidad, costoUnit: c.costoUnit, ref: "revert", refId: c.refId || null });
      repuesto[soc] = r4((repuesto[soc] || 0) + c.cantidad);
    }
    return repuesto;
  }
  function mover(p, delta, valorUnit, refTipo, refId, ref, store) {
    store = store || STORES[0];
    if (!p.stockPorTienda) p.stockPorTienda = {};
    p.stockPorTienda[store] = +(((p.stockPorTienda[store] || 0) + delta)).toFixed(4);
    recalc(p);
    if (!Array.isArray(m.movimientos)) m.movimientos = [];
    m.movimientos.push({
      id: uid(), fecha: new Date().toISOString(),
      tipo: delta >= 0 ? "entrada" : "salida",
      productoId: p.id, sku: p.sku, nombre: p.nombre, store,
      cantidad: Math.abs(delta), delta, valorUnit, refTipo, refId, ref, obs: ""
    });
  }
  return { isStore, stockDe, stockTotal, recalc, fifoLayers, consumir, devolver, mover, STORES };
}

/* ============================================================
   REGLAS DE NEGOCIO DEL SERVIDOR
   ============================================================ */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
function txt(v, max) { return v == null ? "" : String(v).slice(0, max); }
function num(v, min, max) { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
/* Firma de un documento ignorando la marca interna srvRev. */
function firmaDoc(d) { return JSON.stringify(d, (k, v) => k === "srvRev" ? undefined : v); }
/* Firma de NEGOCIO de una venta: sólo lo que el vendedor puede decidir. */
function firmaVenta(v) {
  return JSON.stringify({
    f: v.fecha || "", n: String(v.numero || "").trim(), c: v.clienteId || "",
    l: (v.lineas || []).map(l => [l.productoId, Number(l.cantidad) || 0, Number(l.precio) || 0]),
    e: v.envio ? [v.envio.tipo || "", Number(v.envio.monto) || 0] : null,
    cc: (v.cargosCliente || []).map(c => [c.nota || "", Number(c.monto) || 0]),
    mp: v.medioPago || "", rp: v.refPago || "", cb: v.cuentaCobro || ""
  });
}
/* v10 · Cuenta de cobro: se acepta sólo un id que exista en config.cuentasCobro;
   el nombre lo pone el servidor (snapshot), no el pedido. */
function cuentaCobroDe(m, nv) {
  const id = txt(nv && nv.cuentaCobro, 64).trim();
  const lista = (m && m.config && Array.isArray(m.config.cuentasCobro)) ? m.config.cuentasCobro : [];
  const c = id ? lista.find(x => x && x.id === id) : null;
  return c ? { cuentaCobro: c.id, cuentaCobroNombre: txt(c.nombre, 80) } : { cuentaCobro: "", cuentaCobroNombre: "" };
}
/* ============================================================
   STOCK DEL GRUPO (Prince + Select · nov 2026) — sólo lectura
   ------------------------------------------------------------
   - GET /grupo/stock (servidor ↔ servidor): devuelve el stock de esta
     app SIN costos ni precios. Exige el header X-Grupo-Key = GRUPO_KEY
     (secreto compartido entre los dos Workers, 16+ caracteres).
   - GET /grupo/consolidado (usuarios admin/editor logueados): junta el
     stock propio con el de la otra app (GRUPO_PEER_URL) y lo devuelve.
     El navegador nunca ve la clave ni habla con la otra app.
   Si GRUPO_KEY o GRUPO_PEER_URL no están configurados, la otra app
   figura "no conectada" y todo lo demás sigue igual.
   Cada producto lleva además upc = unidades por caja de su ficha (0 si no
   tiene), para que la app pueda mostrar el stock del grupo en cajas.
   ============================================================ */
function grupoCodigos(p) {
  const extra = Array.isArray(p && p.skusAsoc) ? p.skusAsoc.map(x => x && x.sku) : [];
  return [p && p.sku, ...extra].map(s => String(s || "").trim()).filter(Boolean).slice(0, 20);
}
function grupoClaveOk(env, req) {
  const k = String(env.GRUPO_KEY || ""), h = String(req.headers.get("X-Grupo-Key") || "");
  if (k.length < 16 || h.length !== k.length) return false;
  let d = 0; for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ h.charCodeAt(i);
  return d === 0;
}
async function grupoPeer(env) {
  const base = String(env.GRUPO_PEER_URL || "").replace(/\/+$/, "");
  if (!base || String(env.GRUPO_KEY || "").length < 16) return { app: "", error: "no-config" };
  const ac = new AbortController(); const corte = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(base + "/grupo/stock", { headers: { "X-Grupo-Key": env.GRUPO_KEY }, signal: ac.signal });
    if (!r.ok) return { app: "", error: "http " + r.status };
    const j = await r.json();
    return j && j.ok ? j.data : { app: "", error: "respuesta inválida" };
  } catch (e) { return { app: "", error: (e && e.name === "AbortError") ? "timeout" : "sin conexión" }; }
  finally { clearTimeout(corte); }
}

/* Prince: un solo depósito vendible (suma de las sociedades); en tránsito = compras "in_transit". */
async function grupoPropio(env) {
  const space = String(env.CATALOG_SPACE || "main").slice(0, 64);
  const row = await leerEstado(env, space);
  let d = null; try { d = row ? JSON.parse(row.dataStr) : null; } catch (_) { d = null; }
  const stores = storeIds(env);
  const transito = {};
  for (const c of ((d && d.compras) || [])) {
    if (!c || c.status !== "in_transit") continue;
    for (const l of (c.lineas || [])) if (l && l.productoId) transito[l.productoId] = (transito[l.productoId] || 0) + (Number(l.cantidad) || 0);
  }
  const nombre = String(env.GRUPO_NOMBRE || "Prince").slice(0, 40);
  const productos = [];
  for (const p of ((d && d.productos) || [])) {
    if (!p || !p.id) continue;
    const disp = stores.reduce((a, s) => a + (Number(p.stockPorTienda && p.stockPorTienda[s]) || 0), 0);
    const tr = transito[p.id] || 0;
    if (disp <= 0 && tr <= 0) continue;
    productos.push({ codigos: grupoCodigos(p), sku: String(p.sku || ""), nombre: String(p.nombre || ""), juego: String(p.categoria || ""),
                     idioma: String(p.idioma || ""), stock: { principal: Math.max(0, disp) }, transito: tr, upc: Number(p.boxesPorCase) > 0 ? Number(p.boxesPorCase) : 0 });
  }
  return { app: nombre, depositos: [{ id: "principal", nombre }], productos, updated_at: row ? row.updated_at : null };
}
function clienteLinea(c) { return c ? (c.empresa ? `${c.nombre} · ${c.empresa}` : c.nombre) : ""; }
function vendedorDe(m, vid) {
  const l = (m.config && Array.isArray(m.config.vendedores)) ? m.config.vendedores : [];
  return l.find(v => v.id === vid) || null;
}
function siguienteNumero(m, exceptId) {
  const inicio = parseInt(m.config && m.config.facturaInicio, 10) || 101;
  let max = inicio - 1;
  (m.ventas || []).forEach(v => {
    if (v.id === exceptId) return;
    const n = parseInt(String(v.numero || "").replace(/[^\d]/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return String(max + 1);
}
function numeroUsado(m, numero, exceptId) {
  const n = String(numero || "").trim().toLowerCase();
  if (!n) return true;
  return (m.ventas || []).some(v => v.id !== exceptId && String(v.numero || "").trim().toLowerCase() === n);
}
function limpiarCliente(c) {
  const out = { id: String(c.id) };
  let n = 0;
  for (const k of Object.keys(c)) {
    if (k === "id" || k === "srvRev") continue;
    const v = c[k];
    if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = typeof v === "string" ? v.slice(0, 500) : v;
      if (++n >= 40) break;
    }
  }
  if (!out.nombre) out.nombre = "";
  return out;
}

/* Arma (y valida) una venta a partir de lo que mandó el vendedor. Los números
   de negocio (costo, stock, vendedor, comisión, totales) NO se toman del pedido. */
function construirVenta(ctx, nv, pv) {
  const { m, eng, who } = ctx;
  const mal = (es, en) => ({ error: { es, en } });
  const lineas = Array.isArray(nv.lineas) ? nv.lineas : [];
  if (!lineas.length || lineas.length > 200) return mal("la venta no tiene líneas válidas", "the sale has no valid lines");
  const fecha = String(nv.fecha || "").slice(0, 10);
  const manana = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (!FECHA_RE.test(fecha) || fecha > manana || fecha < "2000-01-01") return mal("fecha inválida", "invalid date");
  const cli = (m.clientes || []).find(c => c.id === nv.clienteId);
  if (!cli) return mal("el cliente no existe", "customer not found");
  const prodsPrevios = new Set(pv ? (pv.lineas || []).map(l => l.productoId) : []);
  const out = [];
  for (const l of lineas) {
    const p = (m.productos || []).find(x => x.id === l.productoId);
    if (!p) return mal("producto inexistente en una línea", "unknown product in a line");
    const cantidad = num(l.cantidad, 0.0001, 1e6);
    const precio = num(l.precio, 0, 1e7);
    if (cantidad == null) return mal(`cantidad inválida en ${p.nombre}`, `invalid quantity for ${p.nombre}`);
    if (precio == null) return mal(`precio inválido en ${p.nombre}`, `invalid price for ${p.nombre}`);
    if (!prodsPrevios.has(p.id)) {
      if (p.estado === "blocked") return mal(`${p.nombre} está bloqueado (best offer)`, `${p.nombre} is blocked (best offer)`);
      const enBoveda = eng.stockDe(p, INV_STORE) > 0 && eng.stockTotal(p) === 0;
      if (enBoveda) return mal(`${p.nombre} está sólo en la bóveda de inversión`, `${p.nombre} is only in the investment vault`);
    }
    out.push({ productoId: p.id, sku: p.sku, nombre: p.nombre, cantidad, precio });
  }
  const envioIn = nv.envio || {};
  const envioTipo = txt(envioIn.tipo || "free", 20);
  const envioMonto = envioTipo === "monto" ? num(envioIn.monto, 0, 1e7) : 0;
  if (envioMonto == null) return mal("monto de envío inválido", "invalid shipping amount");
  const cargos = [];
  for (const c of (Array.isArray(nv.cargosCliente) ? nv.cargosCliente : []).slice(0, 20)) {
    const monto = num(c && c.monto, 0, 1e7);
    if (monto == null) return mal("cargo inválido", "invalid charge");
    if (monto > 0) cargos.push({ nota: txt(c.nota, 200), monto: r2(monto) });
  }
  const subtotal = r2(out.reduce((a, x) => a + r2(x.cantidad * x.precio), 0));
  const total = r2(subtotal + envioMonto + cargos.reduce((a, c) => a + c.monto, 0));
  const vend = vendedorDe(m, who.vid);
  const rate = (pv && pv.commissionRate != null) ? pv.commissionRate
             : (vend && vend.rate != null ? vend.rate : ((m.config && m.config.commissionRate) || 0));
  const doc = {
    ...(pv || {}),                                   // conserva campos que no tocamos (p. ej. storeVenta)
    id: String(nv.id), tipo: "venta",
    contraparte: clienteLinea(cli), fecha,
    numero: txt(nv.numero, 40).trim(),
    lineas: out, subtotal, total,
    clienteId: cli.id,
    cliente: { nombre: cli.nombre, contacto: cli.contacto, empresa: cli.empresa, telefono: cli.telefono, email: cli.email,
               direccion: cli.direccion, ciudad: cli.ciudad, estado: cli.estado, zip: cli.zip, pais: cli.pais || "", ein: cli.ein || "" },
    envio: { tipo: envioTipo, monto: envioMonto },
    medioPago: txt(nv.medioPago, 60).trim(),
    refPago: txt(nv.refPago, 120).trim(),
    ...cuentaCobroDe(m, nv),                         // v10: cuenta de destino (sólo si existe en la config)
    cargosCliente: cargos,
    costosExtra: pv ? (pv.costosExtra || []) : [],   // los costos de venta sólo los carga el admin
    vendedorId: who.vid || null,                     // SIEMPRE el del token, nunca el del pedido
    vendedor: vend ? vend.nombre : (who.name || null),
    commissionRate: rate
  };
  if (!pv) doc.storeVenta = null;
  return { doc };
}

function aplicarVenta(ctx, doc) {
  const { m, eng } = ctx;
  if (numeroUsado(m, doc.numero, doc.id)) {
    const antes = doc.numero;
    doc.numero = siguienteNumero(m, doc.id);
    if (antes) ctx.avisos.push({ es: `La factura ${antes} ya existía: quedó como ${doc.numero}`, en: `Invoice ${antes} already existed: renumbered to ${doc.numero}` });
  }
  const refTxt = "Sale" + (doc.numero ? (" " + doc.numero) : "") + (doc.contraparte ? (" · " + doc.contraparte) : "");
  doc.lineas.forEach(l => {
    const p = m.productos.find(x => x.id === l.productoId);
    if (eng.stockTotal(p) + 1e-9 < l.cantidad) {
      ctx.avisos.push({ es: `Stock insuficiente de ${p.nombre} (factura ${doc.numero}): revisá el inventario`, en: `Not enough stock of ${p.nombre} (invoice ${doc.numero}): check inventory` });
    }
    const res = eng.consumir(p, l.cantidad);
    l.costo = res.unit; l.cogs = res.cogs; l.consumed = res.consumed;
    Object.keys(res.porSociedad).forEach(soc => {
      const t = res.porSociedad[soc];
      const unit = t.cantidad > 0 ? r2(t.cogs / t.cantidad) : res.unit;
      eng.mover(p, -t.cantidad, unit, "venta", doc.id, refTxt, soc);
    });
    p.precioVenta = l.precio;
  });
  doc.srvRev = ctx.newRev;
  m.ventas.push(doc);
}

/* v5: ¿alcanza el stock para esta venta? Cuenta como disponible lo que devolvería la versión
   anterior de la misma venta (al editar). Devuelve el nombre del primer producto que no
   alcanza, o "" si está todo bien. La app nunca deja stock negativo; el servidor tampoco
   debe: antes sólo avisaba y aplicaba igual, así que dos vendedores vendiendo la última
   unidad a la vez (o restaurar una venta vieja) dejaban el stock en negativo. */
function faltanteStock(ctx, doc, pv) {
  const { m, eng } = ctx;
  const pedido = {}, previo = {};
  (doc.lineas || []).forEach(l => { pedido[l.productoId] = (pedido[l.productoId] || 0) + (Number(l.cantidad) || 0); });
  (pv ? (pv.lineas || []) : []).forEach(l => { previo[l.productoId] = (previo[l.productoId] || 0) + (Number(l.cantidad) || 0); });
  for (const id of Object.keys(pedido)) {
    const p = (m.productos || []).find(x => x.id === id); if (!p) continue;
    const disp = eng.stockTotal(p) + (previo[id] || 0);
    if (pedido[id] > disp + 1e-9) return { nombre: p.nombre, disp: r4(disp), pedido: r4(pedido[id]) };
  }
  return null;
}

function revertirVenta(ctx, v) {
  const { m, eng } = ctx;
  const fallback = v.storeVenta || v.store || eng.STORES[0];
  (v.lineas || []).forEach(l => {
    const p = (m.productos || []).find(x => x.id === l.productoId); if (!p) return;
    if (l.consumed && l.consumed.length) {
      const rep = eng.devolver(p, l.consumed, fallback);
      Object.keys(rep).forEach(soc => { p.stockPorTienda[soc] = r4(eng.stockDe(p, soc) + rep[soc]); });
    } else {
      eng.fifoLayers(p, fallback).unshift({ id: uid(), fecha: new Date().toISOString(), cantidad: l.cantidad, costoUnit: (l.costo || p.ultimoCosto || 0), ref: "revert" });
      p.stockPorTienda[fallback] = r4(eng.stockDe(p, fallback) + l.cantidad);
    }
    eng.recalc(p);
  });
  m.movimientos = (m.movimientos || []).filter(x => x.refId !== v.id);
  m.ventas = (m.ventas || []).filter(x => x.id !== v.id);
}

/* Lo que manda un VENDEDOR se aplica sobre la versión ACTUAL del servidor.
   Sólo se toman: clientes (altas/cambios) y SUS ventas (altas/cambios/bajas). */
function rebaseVendedor(env, prev, next, baseRev, curRev, who) {
  const m = structuredClone(prev);
  for (const k of ["productos", "ventas", "movimientos", "clientes"]) if (!Array.isArray(m[k])) m[k] = [];
  const ctx = { m, eng: motor(m, storeIds(env)), who, newRev: curRev + 1, avisos: [], papelera: [], cambios: [] };

  // 1) Clientes: altas y cambios (nunca bajas).
  for (const c of (Array.isArray(next.clientes) ? next.clientes : [])) {
    if (!c || !ID_RE.test(String(c.id || ""))) continue;
    const limpio = limpiarCliente(c);
    const i = m.clientes.findIndex(x => x.id === limpio.id);
    if (i < 0) { limpio.srvRev = ctx.newRev; m.clientes.push(limpio); ctx.cambios.push("+cliente " + (limpio.nombre || limpio.id)); continue; }
    if (firmaDoc(m.clientes[i]) === firmaDoc(limpio)) continue;
    if ((m.clientes[i].srvRev || 0) > baseRev) continue;   // otro lo cambió después: gana el servidor
    limpio.srvRev = ctx.newRev; m.clientes[i] = limpio; ctx.cambios.push("~cliente " + (limpio.nombre || limpio.id));
  }

  // 2) Ventas.
  const nextVentas = (Array.isArray(next.ventas) ? next.ventas : []).filter(v => v && v.tipo !== "compra" && ID_RE.test(String(v.id || "")));
  const nextIds = new Set(nextVentas.map(v => v.id));
  //  2a) bajas: ventas PROPIAS que el vendedor ya conocía y ahora no están.
  //      Frenos: un dispositivo recién logueado (baseRev 0) nunca borra, y más de
  //      MAX_BAJAS_VENDEDOR bajas juntas se ignoran (huele a celular vacío o manipulado).
  const candidatas = baseRev > 0 ? m.ventas.filter(v => who.vid && v.vendedorId === who.vid && !nextIds.has(v.id) && (v.srvRev || 0) <= baseRev) : [];
  if (candidatas.length > MAX_BAJAS_VENDEDOR) {
    ctx.avisos.push({ es: `Se ignoró el borrado de ${candidatas.length} ventas juntas. Si es a propósito, pedíselo al admin.`, en: `Ignored deleting ${candidatas.length} sales at once. Ask the admin if intended.` });
    candidatas.length = 0;
  }
  for (const v of candidatas) {
    revertirVenta(ctx, v);
    ctx.papelera.push({ coleccion: "ventas", doc: v, motivo: "borrada por vendedor" });
    ctx.cambios.push("-venta " + (v.numero || v.id));
  }
  //  2b) altas y cambios
  for (const nv of nextVentas) {
    const pv = m.ventas.find(x => x.id === nv.id);
    if (pv) {
      if (pv.vendedorId !== who.vid) continue;            // ajena: se ignora
      if (firmaVenta(pv) === firmaVenta(nv)) continue;    // sin cambios de negocio
      if ((pv.srvRev || 0) > baseRev) {                   // la cambiaron en el servidor después
        ctx.avisos.push({ es: `La venta ${pv.numero} fue modificada por otro usuario: se conservó esa versión`, en: `Sale ${pv.numero} was changed by another user: that version was kept` });
        continue;
      }
    }
    const r = construirVenta(ctx, nv, pv || null);
    if (r.error) {
      ctx.avisos.push({ es: `Venta ${nv.numero || ""} rechazada: ${r.error.es}`, en: `Sale ${nv.numero || ""} rejected: ${r.error.en}` });
      ctx.papelera.push({ coleccion: "ventas", doc: nv, motivo: "rechazada: " + r.error.es });
      continue;
    }
    const falta = faltanteStock(ctx, r.doc, pv || null);
    if (falta) {
      ctx.avisos.push({ es: `Venta ${nv.numero ? nv.numero + " " : ""}rechazada: no hay stock suficiente de ${falta.nombre} (hay ${falta.disp}, pediste ${falta.pedido}). Puede que otro la haya vendido recién.`,
                        en: `Sale ${nv.numero ? nv.numero + " " : ""}rejected: not enough stock of ${falta.nombre} (${falta.disp} available, ${falta.pedido} requested). Someone may have just sold it.` });
      ctx.papelera.push({ coleccion: "ventas", doc: nv, motivo: "rechazada: sin stock de " + falta.nombre });
      continue;
    }
    if (pv) revertirVenta(ctx, pv);
    aplicarVenta(ctx, r.doc);
    ctx.cambios.push((pv ? "~venta " : "+venta ") + r.doc.numero + " $" + r.doc.total);
  }
  return ctx;
}

/* ADMIN con "conservar mi versión": se re-aplican las ventas/clientes que cargaron
   los vendedores DESPUÉS de la versión que el admin tenía, para no perderlas. */
function rebaseAdmin(env, prev, next, baseRev, curRev, who) {
  const m = next;
  for (const k of ["productos", "ventas", "movimientos", "clientes"]) if (!Array.isArray(m[k])) m[k] = [];
  const ctx = { m, eng: motor(m, storeIds(env)), who, newRev: curRev + 1, avisos: [], papelera: [], cambios: [] };
  const clientesIds = new Set(m.clientes.map(c => c.id));
  for (const c of prev.clientes || []) {
    if ((c.srvRev || 0) > baseRev && !clientesIds.has(c.id)) { m.clientes.push(c); ctx.cambios.push("+cliente (rescatado) " + (c.nombre || c.id)); }
  }
  const ventasIds = new Set(m.ventas.map(v => v.id));
  for (const v of prev.ventas || []) {
    if ((v.srvRev || 0) <= baseRev || ventasIds.has(v.id)) continue;
    if (!v.lineas || v.lineas.some(l => !m.productos.find(p => p.id === l.productoId))) continue;
    const doc = structuredClone(v);
    doc.lineas = doc.lineas.map(l => ({ productoId: l.productoId, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio: l.precio }));
    aplicarVenta(ctx, doc);
    ctx.avisos.push({ es: `Se conservó la venta ${doc.numero} cargada por ${doc.vendedor || "un vendedor"} mientras tanto`, en: `Kept sale ${doc.numero} entered by ${doc.vendedor || "a seller"} in the meantime` });
    ctx.cambios.push("+venta (rescatada) " + doc.numero);
  }
  /* v5: antes sólo se rescataban las ventas NUEVAS. Si un vendedor EDITABA o BORRABA una
     venta mientras tanto, "conservar mi versión" lo pisaba sin avisar (y el stock volvía al
     estado viejo). Regla: una venta que el admin NO tocó en su copia conserva el srvRev que le
     mandó el servidor (≤ baseRev); si la editó, la app la rearma sin srvRev. Sólo las que el
     admin no tocó toman el cambio del servidor; si las tocaron los dos, gana el admin. */
  const prevMap = new Map((prev.ventas || []).map(v => [v.id, v]));
  const intacta = a => a && a.srvRev != null && Number(a.srvRev) <= baseRev;
  for (const v of prev.ventas || []) {
    if ((v.srvRev || 0) <= baseRev) continue;
    const a = m.ventas.find(x => x.id === v.id);
    if (!intacta(a) || firmaDoc(a) === firmaDoc(v)) continue;
    if (!v.lineas || v.lineas.some(l => !m.productos.find(p => p.id === l.productoId))) continue;
    revertirVenta(ctx, a);
    const doc = structuredClone(v);
    doc.lineas = doc.lineas.map(l => ({ productoId: l.productoId, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad, precio: l.precio }));
    aplicarVenta(ctx, doc);
    ctx.avisos.push({ es: `Se tomó la versión de la venta ${doc.numero} que cambió ${doc.vendedor || "otro usuario"} mientras tanto`, en: `Took the version of sale ${doc.numero} changed by ${doc.vendedor || "another user"} in the meantime` });
    ctx.cambios.push("~venta (rescatada) " + doc.numero);
  }
  for (const a of [...m.ventas]) {
    if (!intacta(a) || prevMap.has(a.id)) continue;
    // Existía cuando el admin bajó los datos y después se borró en el servidor (ya está en la papelera).
    revertirVenta(ctx, a);
    ctx.avisos.push({ es: `La venta ${a.numero || a.id} se había borrado mientras tanto: se respetó el borrado`, en: `Sale ${a.numero || a.id} had been deleted in the meantime: the deletion was kept` });
    ctx.cambios.push("-venta (borrada mientras tanto) " + (a.numero || a.id));
  }
  return ctx;
}

/* Marca srvRev en los documentos nuevos o cambiados (sirve para saber qué vio cada dispositivo). */
function marcarRevs(prev, next, newRev) {
  for (const col of ["ventas", "compras", "clientes"]) {
    const pm = new Map(((prev && prev[col]) || []).map(d => [d.id, d]));
    for (const d of (next[col] || [])) {
      if (!d || typeof d !== "object") continue;
      const p = pm.get(d.id);
      if (p && firmaDoc(p) === firmaDoc(d)) { if (p.srvRev != null) d.srvRev = p.srvRev; else delete d.srvRev; }
      else d.srvRev = newRev;
    }
  }
}

const COLS_PAPELERA = ["ventas", "compras", "clientes", "productos"];
function borrados(prev, next) {
  const out = [];
  for (const col of COLS_PAPELERA) {
    const ids = new Set((next[col] || []).map(d => d && d.id));
    for (const d of (prev[col] || [])) if (d && !ids.has(d.id)) out.push({ coleccion: col, doc: d, motivo: "borrado por admin" });
  }
  // Ajustes e inversiones a mano (los movimientos de compras/ventas se regeneran solos).
  const movIds = new Set((next.movimientos || []).map(x => x && x.id));
  for (const mv of (prev.movimientos || [])) {
    if (mv && !movIds.has(mv.id) && mv.refTipo !== "venta" && mv.refTipo !== "compra") out.push({ coleccion: "movimientos", doc: mv, motivo: "borrado por admin" });
  }
  return out;
}
function borradoMasivo(prev, next) {
  for (const col of COLS_PAPELERA) {
    const antes = (prev[col] || []).length;
    if (antes < BORRADO_MASIVO_MIN) continue;
    const ids = new Set((next[col] || []).map(d => d && d.id));
    const idos = (prev[col] || []).filter(d => d && !ids.has(d.id)).length;
    if (idos / antes > BORRADO_MASIVO_PCT) return { col, idos, antes };
  }
  return null;
}
function resumenCambios(prev, next) {
  const partes = [];
  for (const col of ["ventas", "compras", "clientes", "productos", "movimientos"]) {
    const pm = new Map(((prev && prev[col]) || []).map(d => [d && d.id, d]));
    const nm = new Map((next[col] || []).map(d => [d && d.id, d]));
    let a = 0, c = 0, b = 0;
    for (const [id, d] of nm) { const p = pm.get(id); if (!p) a++; else if (firmaDoc(p) !== firmaDoc(d)) c++; }
    for (const id of pm.keys()) if (!nm.has(id)) b++;
    if (a || c || b) partes.push(`${col} +${a} ~${c} -${b}`);
  }
  return partes.join(" | ") || "sin cambios de documentos";
}
function validarEstructura(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  for (const k of ["productos", "compras", "ventas", "movimientos", "clientes"]) if (!Array.isArray(d[k])) return false;
  return !!d.config && typeof d.config === "object";
}

/* Vuelve a meter en el estado un documento de la papelera, aplicando su efecto en el stock. */
function restaurarDoc(env, prev, curRev, who, coleccion, docIn) {
  const m = structuredClone(prev);
  for (const k of ["productos", "compras", "ventas", "movimientos", "clientes"]) if (!Array.isArray(m[k])) m[k] = [];
  const ctx = { m, eng: motor(m, storeIds(env)), who, newRev: curRev + 1, avisos: [], papelera: [], cambios: [] };
  const mal = (es, en, status) => ({ error: { es, en }, status });
  const doc = structuredClone(docIn);
  delete doc.srvRev;
  if (m[coleccion].some(d => d && d.id === doc.id)) return mal("Ese documento ya está en la app.", "That document is already in the app.", 409);
  const faltan = (doc.lineas || []).filter(l => !m.productos.find(p => p.id === l.productoId));
  if (faltan.length) return mal(
    `No se puede restaurar: el producto ${faltan[0].nombre || faltan[0].productoId} ya no existe. Restauralo primero.`,
    `Can't restore: product ${faltan[0].nombre || faltan[0].productoId} no longer exists. Restore it first.`);

  let desc = doc.id;
  if (coleccion === "clientes") {
    doc.srvRev = ctx.newRev; m.clientes.push(doc); desc = doc.nombre || doc.id;
  } else if (coleccion === "productos") {
    doc.srvRev = ctx.newRev; m.productos.push(doc); desc = ((doc.sku || "") + " " + (doc.nombre || "")).trim();
    if (ctx.eng.stockTotal(doc) > 0) ctx.avisos.push({ es: "El producto volvió con el stock que tenía al borrarse: revisalo.", en: "The product came back with the stock it had when deleted: check it." });
  } else if (coleccion === "ventas") {
    if (!doc.lineas || !doc.lineas.length) return mal("La venta no tiene líneas.", "The sale has no lines.");
    doc.tipo = "venta";
    doc.lineas = doc.lineas.map(l => ({ productoId: l.productoId, sku: l.sku, nombre: l.nombre, cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 }));
    if (!doc.subtotal && doc.subtotal !== 0) doc.subtotal = r2(doc.lineas.reduce((a, l) => a + r2(l.cantidad * l.precio), 0));
    if (doc.total == null) doc.total = doc.subtotal;
    const falta = faltanteStock(ctx, doc, null);   // v5: no restaurar una venta sin stock (dejaba negativo)
    if (falta) return mal(`No se puede restaurar: no hay stock suficiente de ${falta.nombre} (hay ${falta.disp}, la venta lleva ${falta.pedido}).`,
                          `Can't restore: not enough stock of ${falta.nombre} (${falta.disp} available, the sale needs ${falta.pedido}).`, 409);
    aplicarVenta(ctx, doc);                 // vuelve a descontar stock con FIFO
    desc = "venta " + (doc.numero || doc.id);
  } else if (coleccion === "compras") {
    const store = doc.store || ctx.eng.STORES[0];
    const refTxt = "Purchase" + (doc.numero ? (" " + doc.numero) : "") + (doc.contraparte ? (" · " + doc.contraparte) : "");
    if (doc.status === "received") {
      for (const l of doc.lineas || []) {
        const p = m.productos.find(x => x.id === l.productoId);
        const landed = r2(l.costoTotal != null ? l.costoTotal : l.precio);
        // v5: el lote vuelve con la fecha de la factura, no "ahora" (si no, una compra vieja
        // restaurada pasaba al final de la cola FIFO y las ventas siguientes tomaban otro costo).
        const fCapa = FECHA_RE.test(String(doc.fecha || "")) ? doc.fecha + "T12:00:00.000Z" : new Date().toISOString();
        ctx.eng.fifoLayers(p, store).push({ id: uid(), fecha: fCapa, cantidad: +l.cantidad, costoUnit: landed, ref: refTxt, refId: doc.id });
        ctx.eng.mover(p, +l.cantidad, landed, "compra", doc.id, refTxt, store);
      }
    }
    doc.srvRev = ctx.newRev; m.compras.push(doc);
    desc = "compra " + (doc.numero || doc.id);
  }
  return { m, avisos: ctx.avisos, desc };
}

/* ============================================================
   v6 · LECTURA DE FACTURAS CON IA (Gemini) — más rápida
   ------------------------------------------------------------
   Por qué tardaba: los Gemini Flash "piensan" antes de responder y
   por defecto lo hacen en nivel MEDIO. Para copiar la tabla de una
   factura no hace falta razonar: ese pensamiento era la mayor parte
   de la espera (y además se cobra como salida).
   · Pensamiento al mínimo que admite cada modelo (iaPensamiento).
   · Esquema fijo de respuesta (responseSchema): Gemini no puede
     devolver JSON roto. Antes, un JSON roto = leer TODO de nuevo
     con el modelo siguiente (doble espera).
   · Tope de tiempo por intento: si un modelo se cuelga, se pasa al
     siguiente en vez de esperar sin fin.
   · Si un modelo rechaza un parámetro (400), se reintenta UNA vez
     sin ese parámetro en vez de saltar de modelo.
   · Modelos configurables con la variable GEMINI_MODELS (lista
     separada por comas) sin tocar código.
   ============================================================ */
const IA_MODELOS_DEF = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"];   // v8: el más rápido primero
const IA_TIMEOUT_MS = 30000;          // v8: tope por intento (antes 45 s)
const IA_TOTAL_MS = 70000;            // v8: tope TOTAL de la lectura, sumando todos los modelos
const IA_TRANSITORIOS = [429, 500, 502, 503, 504];
const IA_PROMPT =
  "You are reading a purchase invoice. Extract its data. " +
  "'precio' = net unit price; 'cantidad' = qty; 'msrp' = suggested retail price if present, else 0; " +
  "'sku' = code before the colon; 'flete' = freight/shipping charge (not inside lineas); " +
  "'cargos' = sum of other non-product charges such as handling fees (not inside lineas); " +
  "'impuestos' = tax total; 'total' = invoice grand total; unknown = 0 or \"\". " +
  "'fecha' = the INVOICE date as YYYY-MM-DD. Numeric dates on these invoices are US format " +
  "MM/DD/YYYY (07/01/2026 is July 1, 2026, never January 7). " +
  "Copy every product line exactly as printed, in order. Do not invent lines.";
const IA_SCHEMA = {
  type: "OBJECT",
  properties: {
    numero: { type: "STRING" },
    fecha: { type: "STRING" },
    proveedor: { type: "STRING" },
    moneda: { type: "STRING" },
    flete: { type: "NUMBER" },
    cargos: { type: "NUMBER" },
    impuestos: { type: "NUMBER" },
    total: { type: "NUMBER" },
    lineas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sku: { type: "STRING" },
          nombre: { type: "STRING" },
          cantidad: { type: "NUMBER" },
          precio: { type: "NUMBER" },
          msrp: { type: "NUMBER" }
        },
        required: ["sku", "nombre", "cantidad", "precio"],
        propertyOrdering: ["sku", "nombre", "cantidad", "precio", "msrp"]
      }
    }
  },
  required: ["lineas"],
  propertyOrdering: ["numero", "fecha", "proveedor", "moneda", "lineas", "flete", "cargos", "impuestos", "total"]
};

function iaModelos(env) {
  const l = String(env.GEMINI_MODELS || "").split(",").map(s => s.trim()).filter(Boolean);
  return l.length ? l : IA_MODELOS_DEF;
}
/* Nivel de pensamiento más bajo que acepta cada familia (docs de Google, sep 2026):
   3.7 / 3.8 Flash y los Pro: "low" (no admiten "minimal") · 3 / 3.5 / 3.6 Flash y Flash-Lite:
   "minimal" · 2.5: presupuesto 0 (apagado). */
function iaPensamiento(model) {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/flash-lite|^gemini-3(\.[56])?-flash/.test(model)) return { thinkingLevel: "minimal" };
  return { thinkingLevel: "low" };
}
/* v8: ¿la lectura cierra contra el total de la factura? Sin total, no se puede verificar (se acepta). */
function iaCuadre(data) {
  const lineas = (Array.isArray(data && data.lineas) ? data.lineas : [])
    .reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);
  const suma = r2(lineas + (Number(data.flete) || 0) + (Number(data.cargos) || 0) + (Number(data.impuestos) || 0));
  const total = r2(Number(data && data.total) || 0);
  const tol = Math.max(0.05, total * 0.001);
  const ok = !total || Math.abs(total - suma) <= tol || Math.abs(total - r2(lineas)) <= tol;
  return { ok, suma, total, verificable: !!total };
}
async function iaLlamar(env, model, cuerpo, limiteMs) {
  const ac = new AbortController();
  const corte = setTimeout(() => ac.abort(), Math.max(1000, Math.min(IA_TIMEOUT_MS, limiteMs || IA_TIMEOUT_MS)));
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST", signal: ac.signal,
      // La key va en un header: en la URL queda escrita en logs de proxies y errores.
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
      body: JSON.stringify(cuerpo)
    });
    let j = null;
    try { j = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, j };
  } catch (e) {
    const timeout = e && e.name === "AbortError";
    return { ok: false, status: 0, j: null, red: timeout ? "timeout" : ("network: " + String((e && e.message) || e)) };
  } finally {
    clearTimeout(corte);
  }
}
async function leerFacturaIA(env, parteDoc) {
  const t0 = Date.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let lastErr = "sin respuesta del modelo";
  let respaldo = null;                              // mejor lectura que NO cuadró (por si ninguna cuadra)
  for (const model of iaModelos(env)) {
    if (Date.now() - t0 > IA_TOTAL_MS - 5000) { lastErr = "tiempo total agotado (" + Math.round((Date.now() - t0) / 1000) + " s)"; break; }
    let pensamiento = iaPensamiento(model);
    let esquema = true;
    let reintentoTransitorio = false;
    for (let intento = 1; intento <= 4; intento++) {
      const gen = { temperature: 0, responseMimeType: "application/json" };
      if (esquema) gen.responseSchema = IA_SCHEMA;
      if (pensamiento) gen.thinkingConfig = pensamiento;
      const tIntento = Date.now();
      const r = await iaLlamar(env, model, {
        contents: [{ parts: [{ text: IA_PROMPT }, parteDoc] }],
        generationConfig: gen
      }, IA_TOTAL_MS - (Date.now() - t0));
      if (!r.ok) console.log(`parse-invoice intento · ${model} · ${Date.now() - tIntento} ms · ${r.red || ("HTTP " + r.status + " " + ((r.j && r.j.error && r.j.error.message) || "")).slice(0, 200)}`);
      if (r.ok) {
        let text = "";
        try { text = r.j.candidates[0].content.parts.filter(p => !p.thought).map(p => p.text || "").join(""); } catch (_) { text = ""; }
        try {
          const data = JSON.parse(text.replace(/[`]{3}json|[`]{3}/g, "").trim());
          const u = (r.j && r.j.usageMetadata) || {};
          const ms = Date.now() - t0;
          const c = iaCuadre(data);
          console.log(`parse-invoice ${c.ok ? "ok" : "NO CUADRA"} · ${model} · ${parteDoc.text ? "texto" : "pdf"} · ${ms} ms · pensamiento ${u.thoughtsTokenCount || 0} tok · salida ${u.candidatesTokenCount || 0} tok · ${(data.lineas || []).length} líneas · ${c.suma} vs ${c.total}`);
          if (c.ok) return { ok: true, data, model, ms, cuadra: c.verificable ? true : null, suma: c.suma, total: c.total };
          // Si ninguno cuadra, se devuelve la lectura que quedó MÁS CERCA del total.
          if (!respaldo || Math.abs(c.total - c.suma) < Math.abs(respaldo.total - respaldo.suma)) {
            respaldo = { ok: true, data, model, ms, cuadra: false, suma: c.suma, total: c.total };
          }
          lastErr = "no cuadra (" + model + ")";
          break;                                     // probamos el modelo siguiente
        } catch (_) { lastErr = "could not parse model output (" + model + ")"; break; }
      }
      if (r.red) {                                   // timeout o corte de red
        lastErr = r.red + " (" + model + ")";
        if (r.red === "timeout" || reintentoTransitorio) break;
        reintentoTransitorio = true; await sleep(600); continue;
      }
      const msg = (r.j && r.j.error && r.j.error.message) || ("HTTP " + r.status);
      lastErr = msg + " (" + model + ")";
      // El modelo no admite un parámetro: se reintenta el MISMO modelo sin ese parámetro.
      if (r.status === 400 && pensamiento && /think/i.test(msg)) { pensamiento = null; continue; }
      if (r.status === 400 && esquema && /schema/i.test(msg)) { esquema = false; continue; }
      if (IA_TRANSITORIOS.includes(r.status) && !reintentoTransitorio) { reintentoTransitorio = true; await sleep(700); continue; }
      break;                                         // 404 (modelo inexistente) u otro: al siguiente
    }
  }
  if (respaldo) { respaldo.ms = Date.now() - t0; return respaldo; }
  console.log(`parse-invoice FALLÓ · ${Date.now() - t0} ms · ${lastErr}`);
  return { ok: false, error: lastErr };
}

/* ============================================================
   LECTURA DEL ESTADO (plano o comprimido)
   ============================================================ */
async function gzip(str) {
  return new Response(new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}
function aBytes(v) {
  if (v == null) return null;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (Array.isArray(v)) return Uint8Array.from(v);
  return null;
}
async function gunzipTexto(v) {
  const b = aBytes(v);
  if (!b) return null;
  return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
/* Devuelve { dataStr, rev, updated_at } o null. El resto del código siempre ve JSON plano. */
async function leerEstado(env, space) {
  const r = await env.DB.prepare("SELECT data, data_gz, rev, updated_at FROM estado WHERE space = ?").bind(space).first();
  if (!r) return null;
  let dataStr = r.data;
  if (dataStr == null && r.data_gz != null) dataStr = await gunzipTexto(r.data_gz);
  return { dataStr, rev: Number(r.rev), updated_at: r.updated_at };
}
/* v9: una versión anterior del estado (o null si ya no está en el historial). */
async function leerHist(env, space, rev) {
  try {
    const r = await env.DB.prepare("SELECT data, data_gz FROM estado_hist WHERE space = ? AND rev = ?").bind(space, rev).first();
    if (!r) return null;
    let str = r.data;
    if (str == null && r.data_gz != null) str = await gunzipTexto(r.data_gz);
    return str ? JSON.parse(str) : null;
  } catch (e) { console.error("leerHist:", e && e.message); return null; }
}
/* v9: si la versión actual todavía no está en el historial (p. ej. es de antes de esta
   versión del Worker), la agrega. Así el primer guardado "sobre versión vieja" ya combina. */
async function sembrarHist(env, space, row) {
  try {
    const ya = await env.DB.prepare("SELECT 1 AS x FROM estado_hist WHERE space = ? AND rev = ?").bind(space, row.rev).first();
    if (ya) return;
    let plano = row.dataStr, gz = null;
    if (row.dataStr.length >= gzDesde(env)) { gz = await gzip(row.dataStr); plano = null; }
    await env.DB.prepare("INSERT OR IGNORE INTO estado_hist (space, rev, data, data_gz, ts) VALUES (?, ?, ?, ?, ?)")
      .bind(space, row.rev, plano, gz, row.updated_at || new Date().toISOString()).run();
  } catch (e) { console.error("sembrarHist:", e && e.message); }
}
function gzDesde(env) { const n = Number(env.ESTADO_GZ_DESDE); return Number.isFinite(n) && n > 0 ? n : GZ_DESDE_DEF; }

/* ============================================================
   ESCRITURA ATÓMICA + AUDITORÍA + PAPELERA (en una sola transacción)
   ------------------------------------------------------------
   El UPDATE sólo pisa si la versión sigue siendo la que leímos.
   Auditoría y papelera se insertan SÓLO si ese UPDATE ganó.
   ============================================================ */
function reqMeta(req) {
  return {
    ip: req.headers.get("CF-Connecting-IP") || "",
    pais: (req.cf && req.cf.country) || "",
    ray: req.headers.get("cf-ray") || ""
  };
}
async function hashAnterior(env) {
  const r = await env.DB.prepare("SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1").first();
  return (r && r.hash) || "GENESIS";
}
async function stmtAuditoria(env, a, condicion) {
  const prevHash = await hashAnterior(env);
  const fila = { ts: new Date().toISOString(), space: a.space || "", rev: a.rev || 0, actor: a.actor || "", role: a.role || "",
                 ip: a.ip || "", pais: a.pais || "", ray: a.ray || "", accion: a.accion, resumen: String(a.resumen || "").slice(0, 4000), sha256: a.sha256 || "" };
  const hash = await sha256hex(prevHash + "|" + JSON.stringify(fila));
  const cols = "ts, space, rev, actor, role, ip, pais, ray, accion, resumen, sha256, hash_prev, hash";
  const vals = [fila.ts, fila.space, fila.rev, fila.actor, fila.role, fila.ip, fila.pais, fila.ray, fila.accion, fila.resumen, fila.sha256, prevHash, hash];
  if (condicion) {
    return env.DB.prepare(`INSERT INTO auditoria (${cols}) SELECT ${vals.map(() => "?").join(", ")} WHERE (SELECT rev FROM estado WHERE space = ?) = ?`)
      .bind(...vals, condicion.space, condicion.rev);
  }
  return env.DB.prepare(`INSERT INTO auditoria (${cols}) VALUES (${vals.map(() => "?").join(", ")})`).bind(...vals);
}
async function auditar(env, a) {
  try { await (await stmtAuditoria(env, a, null)).run(); } catch (e) { console.error("auditoria:", e && e.message); }
}
async function guardarEstado(env, { space, dataStr, curRev, existe, who, meta, accion, resumen, papelera }) {
  const newRev = curRev + 1;
  const now = new Date().toISOString();
  const sha = await sha256hex(dataStr);
  // Chico: se guarda plano (como siempre). Grande: comprimido, y "data" queda vacío.
  let plano = dataStr, gz = null, bytesFila = dataStr.length;
  if (dataStr.length >= gzDesde(env)) {
    gz = await gzip(dataStr); plano = null; bytesFila = gz.byteLength;
  }
  if (bytesFila > MAX_FILA_BYTES) return { ok: false, grande: true };
  const main = existe
    ? env.DB.prepare("UPDATE estado SET data = ?, data_gz = ?, rev = ?, updated_at = ? WHERE space = ? AND rev = ?").bind(plano, gz, newRev, now, space, curRev)
    : env.DB.prepare("INSERT INTO estado (space, data, data_gz, rev, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(space) DO NOTHING").bind(space, plano, gz, newRev, now);
  const cond = { space, rev: newRev };
  const stmts = [main];
  // Muchos borrados juntos van en UNA fila (límite de consultas por pedido en D1).
  let items = papelera || [];
  if (items.length > 40) {
    let doc = JSON.stringify(items.map(p => ({ coleccion: p.coleccion, motivo: p.motivo, doc: p.doc })));
    if (doc.length > 1_800_000) doc = JSON.stringify(items.map(p => ({ coleccion: p.coleccion, id: p.doc && p.doc.id })));
    items = [{ coleccion: "varios", doc: { id: "" }, motivo: `borrado masivo (${items.length} documentos)`, raw: doc }];
  }
  for (const p of items) {
    stmts.push(env.DB.prepare(
      "INSERT INTO papelera (ts, space, rev, actor, role, coleccion, doc_id, motivo, doc) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT rev FROM estado WHERE space = ?) = ?"
    ).bind(now, space, newRev, who.u, who.role, p.coleccion, String((p.doc && p.doc.id) || ""), String(p.motivo || "").slice(0, 300),
           p.raw || JSON.stringify(p.doc), space, newRev));
  }
  // v9: la versión nueva también queda en el historial (sólo si este UPDATE ganó)
  stmts.push(env.DB.prepare(
    "INSERT OR REPLACE INTO estado_hist (space, rev, data, data_gz, ts) SELECT ?, ?, ?, ?, ? WHERE (SELECT rev FROM estado WHERE space = ?) = ?"
  ).bind(space, newRev, plano, gz, now, space, newRev));
  stmts.push(env.DB.prepare("DELETE FROM estado_hist WHERE space = ? AND rev < ?").bind(space, newRev - HIST_MAX));
  stmts.push(await stmtAuditoria(env, { space, rev: newRev, actor: who.u, role: who.role, ...meta, accion, resumen, sha256: sha }, cond));
  const res = await env.DB.batch(stmts);
  const ok = !!(res[0] && res[0].meta && res[0].meta.changes === 1);
  // % usado del límite más cercano (fila de D1 o almacenamiento del celular)
  const pct = Math.round(Math.max(bytesFila / MAX_FILA_BYTES, dataStr.length / LIMITE_CELULAR) * 100);
  return { ok, newRev, now, sha, pct };
}

/* ---------------- Backups en R2 (opcional: binding BACKUPS) ---------------- */
async function backupVersion(env, space, rev, dataStr, sha) {
  if (!env.BACKUPS) return;
  try {
    const key = `hist/${space}/rev-${String(rev).padStart(8, "0")}.json.gz`;
    await env.BACKUPS.put(key, await gzip(dataStr), {
      httpMetadata: { contentType: "application/gzip" },
      customMetadata: { rev: String(rev), sha256: sha || "" }
    });
  } catch (e) { console.error("backup hist:", e && e.message); }
}
async function putSiNoExiste(env, key, str, meta) {
  if (await env.BACKUPS.head(key)) return false;   // con bucket lock no se puede pisar: ni lo intentamos
  await env.BACKUPS.put(key, await gzip(str), { httpMetadata: { contentType: "application/gzip" }, customMetadata: meta || {} });
  return true;
}
async function snapshotDiario(env) {
  if (!env.BACKUPS || !env.DB) return;
  await ensureSchema(env);
  const dia = new Date().toISOString().slice(0, 10);
  const { results: estados } = await env.DB.prepare("SELECT space FROM estado").all();
  for (const r of estados || []) {
    const e = await leerEstado(env, r.space); if (!e) continue;
    await putSiNoExiste(env, `snap/${dia}/estado-${r.space}.json.gz`, e.dataStr || "", { rev: String(e.rev), sha256: await sha256hex(e.dataStr || "") });
  }
  const { results: users } = await env.DB.prepare("SELECT * FROM usuarios").all();
  await putSiNoExiste(env, `snap/${dia}/usuarios.json.gz`, JSON.stringify(users || []));
  const { results: pap } = await env.DB.prepare("SELECT * FROM papelera ORDER BY id").all();
  await putSiNoExiste(env, `snap/${dia}/papelera.json.gz`, JSON.stringify(pap || []));
  // Ancla de la auditoría: si alguien tocara la tabla, el hash de hoy no coincidiría con éste.
  const ult = await env.DB.prepare("SELECT id, ts, hash FROM auditoria ORDER BY id DESC LIMIT 1").first();
  if (ult) await putSiNoExiste(env, `audit/ancla-${dia}.json.gz`, JSON.stringify(ult));
  await auditar(env, { accion: "backup-diario", resumen: `snapshot ${dia}: ${(estados || []).length} espacio(s)` });
}

/* ============================================================
   v131 · COMBINACIÓN DE 3 VÍAS ENTRE ADMINS (merge)
   ------------------------------------------------------------
   ESTE BLOQUE ESTÁ COPIADO IGUAL EN worker.js Y EN js/01-core.js.
   Si lo cambiás en uno, cambialo en el otro.

   base   = la versión del servidor sobre la que trabajó este admin
   mio    = lo que manda este admin (base + sus cambios)
   server = la versión actual del servidor (base + cambios de otros)

   Regla: lo que cambió sólo uno, queda. Si los dos cambiaron EXACTAMENTE
   lo mismo (la misma venta, la misma compra, el mismo campo), es un
   conflicto real y no se combina nada (el que llega después elige).

   El stock de un producto se combina por DIFERENCIAS: si los dos
   vendieron del mismo producto, se restan las dos ventas del mismo lote
   FIFO. Sólo es conflicto si entre los dos se pasan de ese lote.
   ============================================================ */
const MRG_DOC_ATOMICO = new Set(["ventas", "compras", "movimientos", "solicitudes"]);  // se comparan enteros
const MRG_PROD_STOCK = ["stockPorTienda", "lotes", "stock"];                            // se combinan por diferencias
const MRG_PROD_BLANDOS = new Set(["precioVenta", "precioVentaPorTienda", "ultimoCosto", "costoNeto", "costoHandling", "costoFlete"]); // último que se tocó gana
const MRG_EPS = 0.00001;

function mrgEsObj(x) { return x != null && typeof x === "object" && !Array.isArray(x); }
/* JSON canónico: claves ordenadas y sin srvRev (marca interna del servidor). */
function mrgCanon(x) {
  if (x === undefined) return "u";
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(mrgCanon).join(",") + "]";
  return "{" + Object.keys(x).filter(k => k !== "srvRev" && x[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ":" + mrgCanon(x[k])).join(",") + "}";
}
function mrgIgual(a, b) { return a === b || mrgCanon(a) === mrgCanon(b); }
function mrgR4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
function mrgConIds(a) { return Array.isArray(a) && a.every(d => mrgEsObj(d) && d.id != null && d.id !== ""); }
function mrgMapa(a) { const m = new Map(); (a || []).forEach(d => m.set(String(d.id), d)); return m; }

/* Nombre legible de un documento para los avisos. */
function mrgMay(o) { return { es: o.es.charAt(0).toUpperCase() + o.es.slice(1), en: o.en.charAt(0).toUpperCase() + o.en.slice(1) }; }
function mrgEtiqueta(col, d) {
  const x = d || {};
  if (col === "ventas") return { es: "la venta " + (x.numero || x.id), en: "sale " + (x.numero || x.id) };
  if (col === "compras") return { es: "la compra " + (x.numero || x.contraparte || x.id), en: "purchase " + (x.numero || x.contraparte || x.id) };
  if (col === "productos") return { es: "el producto " + (x.nombre || x.sku || x.id), en: "product " + (x.nombre || x.sku || x.id) };
  if (col === "clientes") return { es: "el cliente " + (x.nombre || x.id), en: "customer " + (x.nombre || x.id) };
  if (col === "movimientos") return { es: "un movimiento de " + (x.nombre || x.sku || "stock"), en: "a stock movement of " + (x.nombre || x.sku || "stock") };
  return { es: col + " " + (x.nombre || x.id || ""), en: col + " " + (x.nombre || x.id || "") };
}

function combinar3(base, mio, server, opts) {
  opts = opts || {};
  const STORES = opts.stores || ["akira", "silver"];
  const ctx = { conflictos: [], avisos: [], cambios: [] };
  const choca = (es, en) => { if (ctx.conflictos.length < 20) ctx.conflictos.push({ es, en }); };

  /* Movimientos de kardex que agregué / saqué yo, por producto. Cada operación de stock
     deja movimientos con id único: así se distingue "dos ventas iguales" (se suman) de
     "mi cambio ya está en el servidor" (p. ej. un reintento: no se vuelve a aplicar). */
  const idsMov = d => new Set(((d && d.movimientos) || []).map(x => String(x && x.id)));
  const IB = idsMov(base), IM = idsMov(mio), IT = idsMov(server);
  const movPorProd = {};
  const anotar = (pid, tipo, id) => { const k = String(pid); if (!movPorProd[k]) movPorProd[k] = { add: [], del: [] }; movPorProd[k][tipo].push(id); };
  ((mio && mio.movimientos) || []).forEach(x => { if (x && !IB.has(String(x.id))) anotar(x.productoId, "add", String(x.id)); });
  ((base && base.movimientos) || []).forEach(x => { if (x && !IM.has(String(x.id))) anotar(x.productoId, "del", String(x.id)); });

  /* --- genérico: objetos, arrays y valores --- */
  function m3(b, m, t, path, blando) {
    if (mrgIgual(m, b)) return t;            // yo no lo toqué
    if (mrgIgual(t, b)) return m;            // el otro no lo tocó
    // los dos hicimos lo mismo (salvo productos: dos ventas iguales del mismo producto
    // dejan el producto idéntico en los dos lados, pero son DOS ventas -> se decide en m3Producto)
    if (!(path.length === 1 && path[0] === "productos") && mrgIgual(m, t)) return t;
    if (mrgEsObj(m) && mrgEsObj(t) && (b === undefined || mrgEsObj(b))) return m3Obj(b || {}, m, t, path, blando);
    if (Array.isArray(m) && Array.isArray(t) && (b === undefined || Array.isArray(b))) {
      const bb = b || [];
      if (mrgConIds(m) && mrgConIds(t) && mrgConIds(bb)) return m3Ids(bb, m, t, path, path.join("."), blando);
      // listas sin ids (p. ej. registros): si las dos sólo AGREGARON al final, se suman
      if (bb.every((x, i) => mrgIgual(x, m[i]) && mrgIgual(x, t[i]))) return t.concat(m.slice(bb.length));
    }
    if (blando) return t;
    choca(`"${path.join(" › ")}" lo cambiaron los dos`, `"${path.join(" › ")}" was changed by both`);
    return t;
  }
  function m3Obj(b, m, t, path, blando) {
    const out = {};
    const claves = new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(b)]);
    for (const k of claves) {
      if (k === "srvRev") { if (t.srvRev !== undefined) out.srvRev = t.srvRev; continue; }
      const v = m3(b[k], m[k], t[k], path.concat(k), blando || (path.length === 0 && k === "stockSnaps"));
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  /* --- colecciones con id (ventas, compras, productos, clientes, vendedores…) --- */
  function m3Ids(b, m, t, path, col, blando) {
    const B = mrgMapa(b), M = mrgMapa(m), T = mrgMapa(t);
    const out = [];
    for (const td of t) {
      const id = String(td.id), bd = B.get(id), md = M.get(id);
      if (!bd) {                                         // nuevo del otro
        if (md && !mrgIgual(md, td) && !blando) choca(`${mrgMay(mrgEtiqueta(col, td)).es}: se creó dos veces distinto`, `${mrgMay(mrgEtiqueta(col, td)).en} was created twice`);
        out.push(td); continue;
      }
      if (!md) {                                         // yo lo borré
        if (mrgIgual(td, bd)) { ctx.cambios.push("-" + col + " " + id); continue; }
        if (!blando) choca(`Borraste ${mrgEtiqueta(col, td).es}, pero otro usuario la modificó al mismo tiempo`, `You deleted ${mrgEtiqueta(col, td).en}, but another user changed it`);
        out.push(td); continue;
      }
      out.push(m3Doc(col, bd, md, td, path.concat(id), blando));
    }
    for (const md of m) {                                // nuevos míos
      const id = String(md.id);
      if (B.has(id) || T.has(id)) continue;
      out.push(md); ctx.cambios.push("+" + col + " " + id);
    }
    for (const [id, bd] of B) {                          // el otro lo borró y yo lo edité
      if (T.has(id) || !M.has(id)) continue;
      if (!mrgIgual(M.get(id), bd) && !blando) choca(`Modificaste ${mrgEtiqueta(col, bd).es}, pero otro usuario la borró al mismo tiempo`, `You changed ${mrgEtiqueta(col, bd).en}, but another user deleted it`);
    }
    return out;
  }
  function m3Doc(col, b, m, t, path, blando) {
    if (mrgIgual(m, b)) return t;
    if (mrgIgual(t, b)) return m;
    if (col !== "productos" && mrgIgual(m, t)) return t;
    if (col === "productos") return m3Producto(b, m, t, path);
    if (MRG_DOC_ATOMICO.has(col)) {
      if (!blando) choca(`${mrgMay(mrgEtiqueta(col, t)).es}: la modificaron los dos al mismo tiempo`, `${mrgMay(mrgEtiqueta(col, t)).en} was changed by both at the same time`);
      return t;
    }
    return m3Obj(b, m, t, path, blando);                 // clientes, vendedores, etc.: campo por campo
  }

  /* --- productos: datos campo por campo + stock por diferencias --- */
  function m3Producto(b, m, t, path) {
    const out = {};
    const claves = new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(b)]);
    for (const k of claves) {
      if (MRG_PROD_STOCK.includes(k)) continue;
      if (k === "srvRev") { if (t.srvRev !== undefined) out.srvRev = t.srvRev; continue; }
      let v;
      if (MRG_PROD_BLANDOS.has(k)) v = mrgIgual(m[k], b[k]) ? t[k] : m[k];
      else {
        const antes = ctx.conflictos.length;
        v = m3(b[k], m[k], t[k], path.concat(k), false);
        if (ctx.conflictos.length > antes) {             // mensaje más claro que el genérico
          ctx.conflictos.length = antes;
          choca(`${mrgMay(mrgEtiqueta("productos", t)).es}: los dos cambiaron "${k}"`, `${mrgMay(mrgEtiqueta("productos", t)).en}: both changed "${k}"`);
        }
      }
      if (v !== undefined) out[k] = v;
    }
    const sb = { s: b.stockPorTienda || {}, l: b.lotes || {} };
    const sm = { s: m.stockPorTienda || {}, l: m.lotes || {} };
    const st = { s: t.stockPorTienda || {}, l: t.lotes || {} };
    let stock;
    if (mrgIgual(sm, sb)) stock = st;                    // yo no toqué el stock
    else if (mrgIgual(st, sb)) stock = sm;               // el otro no lo tocó
    else {
      const mv = movPorProd[String(t.id)] || { add: [], del: [] };
      if (!mv.add.length && !mv.del.length) stock = mrgIgual(sm, st) ? st : m3Stock(sb, sm, st, t);
      else if (mv.add.every(id => IT.has(id)) && mv.del.every(id => !IT.has(id))) stock = st;          // lo mío ya está en el servidor
      else if (mv.add.every(id => !IT.has(id)) && mv.del.every(id => IT.has(id))) stock = m3Stock(sb, sm, st, t);   // operaciones distintas: se suman
      else { choca(`${mrgMay(mrgEtiqueta("productos", t)).es}: los dos movieron el mismo stock al mismo tiempo`, `${mrgMay(mrgEtiqueta("productos", t)).en}: both moved the same stock at the same time`); stock = st; }
    }
    out.stockPorTienda = JSON.parse(JSON.stringify(stock.s));
    out.lotes = JSON.parse(JSON.stringify(stock.l));
    out.stock = mrgR4(STORES.reduce((a, s) => a + (Number(out.stockPorTienda[s]) || 0), 0));
    return out;
  }
  function m3Stock(b, m, t, prod) {
    const nombre = mrgMay(mrgEtiqueta("productos", prod));
    const falla = () => { choca(`${nombre.es}: entre los dos se vendió/movió más de lo que había`, `${nombre.en}: together you sold/moved more than was available`); return t; };
    // 1) unidades por sociedad: lo del otro + mi diferencia
    const s = {};
    for (const k of new Set([...Object.keys(t.s), ...Object.keys(m.s), ...Object.keys(b.s)])) {
      const tv = Number(t.s[k]) || 0, mv = Number(m.s[k]) || 0, bv = Number(b.s[k]) || 0;
      const v = mrgR4(tv + (mv - bv));
      if (v < -MRG_EPS && tv >= -MRG_EPS && mv >= -MRG_EPS) return falla();
      s[k] = v;
    }
    // 2) lotes FIFO, capa por capa (cada capa tiene su id)
    const l = {};
    for (const k of new Set([...Object.keys(t.l), ...Object.keys(m.l), ...Object.keys(b.l)])) {
      const bl = b.l[k] || [], ml = m.l[k] || [], tl = t.l[k] || [];
      if (!mrgConIds(bl) || !mrgConIds(ml) || !mrgConIds(tl)) return falla();
      if (mrgIgual(ml, bl)) { l[k] = tl; continue; }
      if (mrgIgual(tl, bl)) { l[k] = ml; continue; }
      const B = mrgMapa(bl), M = mrgMapa(ml), T = mrgMapa(tl);
      const res = [];
      for (const tc of tl) {
        const id = String(tc.id), bc = B.get(id);
        if (!bc) { res.push(tc); continue; }               // capa nueva del otro
        const mc = M.get(id);
        const dq = (mc ? Number(mc.cantidad) || 0 : 0) - (Number(bc.cantidad) || 0);
        if (mc) {                                          // fuera de la cantidad, las capas no se editan
          const { cantidad: _a, ...restoM } = mc, { cantidad: _b, ...restoB } = bc;
          if (!mrgIgual(restoM, restoB)) return falla();
        }
        const q = mrgR4((Number(tc.cantidad) || 0) + dq);
        if (q < -MRG_EPS) return falla();                  // los dos consumieron la misma capa y no alcanzaba
        if (q > MRG_EPS) res.push({ ...tc, cantidad: q });
      }
      for (const [id, bc] of B) {                          // capas que el otro ya agotó
        if (T.has(id)) continue;
        const mc = M.get(id);
        const dq = (mc ? Number(mc.cantidad) || 0 : 0) - (Number(bc.cantidad) || 0);
        if (dq < -MRG_EPS || dq > MRG_EPS) return falla();
      }
      // capas nuevas mías (compras, devoluciones): adelante si yo las puse adelante
      const nuevas = ml.filter(c => !B.has(String(c.id)) && !T.has(String(c.id)));
      const iPrimeraVieja = ml.findIndex(c => B.has(String(c.id)));
      const adelante = nuevas.filter(c => iPrimeraVieja >= 0 && ml.indexOf(c) < iPrimeraVieja);
      const atras = nuevas.filter(c => !adelante.includes(c));
      l[k] = adelante.concat(res, atras);
    }
    return { s, l };
  }

  const data = m3Obj(base || {}, mio || {}, server || {}, [], false);

  /* --- números de factura repetidos: renumera la venta nueva mía --- */
  if (!ctx.conflictos.length && Array.isArray(data.ventas)) {
    const Bv = new Set((base && base.ventas || []).map(v => String(v.id)));
    const Tv = new Set((server && server.ventas || []).map(v => String(v.id)));
    const inicio = parseInt(data.config && data.config.facturaInicio, 10) || 101;
    const num = v => parseInt(String(v.numero || "").replace(/[^\d]/g, ""), 10);
    const usado = (n, id) => data.ventas.some(x => String(x.id) !== id && String(x.numero || "").trim().toLowerCase() === String(n || "").trim().toLowerCase());
    for (const v of data.ventas) {
      const id = String(v.id);
      if (Bv.has(id) || Tv.has(id) || !v.numero || !usado(v.numero, id)) continue;
      let max = inicio - 1;
      data.ventas.forEach(x => { const n = num(x); if (!isNaN(n) && n > max) max = n; });
      const antes = String(v.numero), nuevo = String(max + 1);
      v.numero = nuevo;
      (data.movimientos || []).forEach(mv => {
        if (mv.refId === v.id && typeof mv.ref === "string") mv.ref = mv.ref.replace(antes, nuevo);
      });
      ctx.avisos.push({ es: `Otro usuario usó el número de factura ${antes} al mismo tiempo: tu venta quedó como ${nuevo}`,
                        en: `Another user took invoice number ${antes} at the same time: your sale is now ${nuevo}` });
    }
  }
  return { data, conflictos: ctx.conflictos, avisos: ctx.avisos, cambios: ctx.cambios };
}
/* ===================== fin bloque v131 ===================== */

/* ============================================================
   ROUTER
   ============================================================ */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(snapshotDiario(env).catch(e => console.error("snapshot:", e && e.message)));
  },

  async fetch(req, env, ctx) {
    const CORS = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, "");

      // ---------- HEALTH (sin token) ----------
      if (path === "" || path === "/health") {
        return json({ ok: true, app: APP_NAME, v: 10, ts: new Date().toISOString() }, 200, CORS);
      }

      if (!env.DB) return json({ error: "config: missing D1 binding 'DB'" }, 500, CORS);
      await ensureSchema(env);

      // ---------- STOCK DEL GRUPO · servidor ↔ servidor (clave compartida, sin costos) ----------
      if (path === "/grupo/stock") {
        if (req.method !== "GET") return json({ error: "use GET" }, 405, CORS);
        if (!grupoClaveOk(env, req)) return json({ error: "forbidden" }, 403, CORS);
        return json({ ok: true, data: await grupoPropio(env) }, 200, CORS);
      }

      // ---------- CATÁLOGO PÚBLICO (sin token, solo lectura, whitelist) ----------
      if (path === "/public/catalog") {
        if (req.method !== "GET") return json({ error: "use GET" }, 405, CORS);
        const space = String(env.CATALOG_SPACE || "main").slice(0, 64);
        const cache = (typeof caches !== "undefined" && caches.default) ? caches.default : null;
        const cacheKey = new Request(url.origin + "/public/catalog?space=" + encodeURIComponent(space));
        if (cache) {
          try {
            const hit = await cache.match(cacheKey);
            if (hit) {
              const body = await hit.text();
              return new Response(body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + CATALOG_TTL_S, ...CORS } });
            }
          } catch (_) {}
        }
        const row = await leerEstado(env, space);
        let data = null;
        try { data = row ? JSON.parse(row.dataStr) : null; } catch (_) { data = null; }
        const cat = armarCatalogo(data);
        const body = JSON.stringify({ ok: true, updated_at: row ? row.updated_at : null, brand: cat.brand, items: cat.items });
        if (cache) {
          try { await cache.put(cacheKey, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + CATALOG_TTL_S } })); } catch (_) {}
        }
        return new Response(body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + CATALOG_TTL_S, ...CORS } });
      }

      // ---------- LOGIN (sin Bearer) ----------
      if (path === "/login") {
        if (req.method !== "POST") return json({ error: "use POST" }, 405, CORS);
        if (!env.AUTH_SECRET) return json({ error: "config: missing AUTH_SECRET secret" }, 500, CORS);
        let b;
        try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400, CORS); }
        const user = String((b && b.user) || "").trim().slice(0, 100);
        const pass = String((b && b.pass) || "").slice(0, 200);
        const meta = reqMeta(req);
        const ahora = Date.now();
        const kUser = "u:" + user.toLowerCase(), kIp = "ip:" + (meta.ip || "?");

        const hasta = Math.max(await bloqueoVigente(env, kUser, ahora), await bloqueoVigente(env, kIp, ahora));
        if (hasta) {
          const min = Math.max(1, Math.ceil((hasta - ahora) / 60000));
          return err(429, CORS, "too many attempts",
            `Demasiados intentos fallidos. Probá de nuevo en ${min} minuto(s).`,
            `Too many failed attempts. Try again in ${min} minute(s).`, { retryAfterMin: min });
        }

        let u = user && pass ? await resolveUserDB(env, user, pass) : null;
        // v4: con SECRET_LOGIN="off" se apaga el login "de respaldo" (ADMIN_USER/USERS del secret):
        // esas cuentas no pueden tener 2FA ni se pueden revocar, así que son la puerta trasera.
        if (u && u.fuente === "secret" && String(env.SECRET_LOGIN || "").toLowerCase() === "off") u = null;
        if (!u) {
          const h1 = await registrarFallo(env, kUser, LOGIN_MAX_FALLOS_USER, ahora);
          const h2 = await registrarFallo(env, kIp, LOGIN_MAX_FALLOS_IP, ahora);
          if (h1 || h2) await auditar(env, { actor: user, role: "", ...meta, accion: "login-bloqueado", resumen: "demasiados intentos fallidos" });
          return json({ error: "wrong user or password" }, 401, CORS);
        }

        // v4: si el usuario tiene 2FA, la contraseña sola NO alcanza. Devolvemos un
        // "ticket" firmado que vence en 5 minutos y sólo sirve para /login/2fa.
        if (u.totp) {
          const ticket = await signToken(env, { t: "2fa", u: u.user, tv: u.tv || 0, exp: ahora + TICKET_2FA_MS });
          return json({ ok: true, need2fa: true, ticket }, 200, CORS);
        }
        try { await env.DB.prepare("DELETE FROM login_intentos WHERE clave = ?").bind(kUser).run(); } catch (_) {}
        await auditar(env, { actor: u.user, role: u.role, ...meta, accion: "login", resumen: "ok" });
        return emitirSesion(env, CORS, u, ahora);
      }

      // ---------- LOGIN PASO 2: código 2FA (sin Bearer, con ticket) ----------
      if (path === "/login/2fa") {
        if (req.method !== "POST") return json({ error: "use POST" }, 405, CORS);
        if (!env.AUTH_SECRET) return json({ error: "config: missing AUTH_SECRET secret" }, 500, CORS);
        let b;
        try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400, CORS); }
        const tk = await verifyToken(env, String((b && b.ticket) || ""));
        if (!tk || tk.t !== "2fa") {
          return err(401, CORS, "2fa ticket expired", "Pasaron más de 5 minutos: volvé a ingresar usuario y contraseña.",
            "More than 5 minutes passed: enter your username and password again.");
        }
        const meta = reqMeta(req);
        const ahora = Date.now();
        const k2 = "2fa:" + String(tk.u).toLowerCase(), kIp = "ip:" + (meta.ip || "?");
        const hasta = Math.max(await bloqueoVigente(env, k2, ahora), await bloqueoVigente(env, kIp, ahora));
        if (hasta) {
          const min = Math.max(1, Math.ceil((hasta - ahora) / 60000));
          return err(429, CORS, "too many attempts", `Demasiados códigos incorrectos. Probá de nuevo en ${min} minuto(s).`,
            `Too many wrong codes. Try again in ${min} minute(s).`, { retryAfterMin: min });
        }
        const row = await env.DB.prepare("SELECT * FROM usuarios WHERE user = ?").bind(tk.u).first();
        if (!row || !row.totp_on || Number(row.token_version || 0) !== Number(tk.tv || 0)) {
          return err(401, CORS, "2fa ticket expired", "La sesión cambió: volvé a ingresar.", "Session changed: sign in again.");
        }
        const codigo = String((b && b.code) || "").trim();
        let ok = false, via = "totp";
        const secreto = await descifrar(env, row.totp_secret);
        const c = secreto ? await totpVerificar(secreto, codigo, row.totp_ult, ahora) : 0;
        if (c) {
          // Guardamos el último contador usado: el mismo código no se puede usar dos veces.
          const upd = await env.DB.prepare("UPDATE usuarios SET totp_ult = ? WHERE user = ? AND totp_ult < ?").bind(c, row.user, c).run();
          ok = !!(upd && upd.meta && upd.meta.changes);
        } else if (normRecup(codigo).length === 8) {
          // Código de recuperación (se usa UNA vez y se tacha).
          let lista = []; try { lista = JSON.parse(row.totp_recup || "[]"); } catch (_) {}
          const h = await sha256hex(normRecup(codigo));
          const i = lista.indexOf(h);
          if (i >= 0) {
            lista.splice(i, 1);
            await env.DB.prepare("UPDATE usuarios SET totp_recup = ? WHERE user = ?").bind(JSON.stringify(lista), row.user).run();
            ok = true; via = "recuperacion (quedan " + lista.length + ")";
          }
        }
        if (!ok) {
          const h1 = await registrarFallo(env, k2, MAX_FALLOS_2FA, ahora);
          const h2 = await registrarFallo(env, kIp, LOGIN_MAX_FALLOS_IP, ahora);
          if (h1 || h2) await auditar(env, { actor: row.user, role: row.role, ...meta, accion: "2fa-bloqueado", resumen: "demasiados códigos incorrectos" });
          return err(401, CORS, "wrong 2fa code", "Código incorrecto.", "Wrong code.");
        }
        try { await env.DB.batch([
          env.DB.prepare("DELETE FROM login_intentos WHERE clave = ?").bind(k2),
          env.DB.prepare("DELETE FROM login_intentos WHERE clave = ?").bind("u:" + String(row.user).toLowerCase())
        ]); } catch (_) {}
        await auditar(env, { actor: row.user, role: row.role, ...meta, accion: "login", resumen: "ok con 2FA · " + via });
        const role = normRole(row.role);
        return emitirSesion(env, CORS, {
          user: row.user, role, name: row.name || row.user, tv: Number(row.token_version || 0),
          vendedorId: role === "seller" ? String(row.vendedor_id || row.user).trim().toLowerCase() : "",
          editaOtros: role === "editor" && !!Number(row.edita_otros || 0)
        }, ahora);
      }

      // ---------- LOGOUT: borra la cookie (en modo Bearer no hace nada) ----------
      if (path === "/logout") {
        if (req.method !== "POST") return json({ error: "use POST" }, 405, CORS);
        return json({ ok: true }, 200, { ...CORS, "Set-Cookie": cookieSesion("", 0) });
      }

      // ---------- De acá en más: token firmado obligatorio ----------
      if (!env.AUTH_SECRET) return json({ error: "config: missing AUTH_SECRET secret" }, 500, CORS);
      const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const deCookie = bearer ? "" : leerCookie(req, COOKIE_NAME);
      // v4 · anti-CSRF: si la sesión viene por COOKIE (el navegador la manda solo), en todo
      // pedido que modifica algo exigimos que el Origin sea uno de los nuestros.
      if (deCookie && req.method !== "GET" && !origenPermitido(env, req)) {
        return json({ error: "forbidden", detalle: "origin" }, 403, CORS);
      }
      const raw = bearer || deCookie;
      const tok = await verifyToken(env, raw);
      if (tok && tok.t) return json({ error: "not authorized" }, 401, CORS);   // un ticket de 2FA no es una sesión
      const who = tok ? await identidadVigente(env, tok) : null;
      if (!who) return json({ error: "not authorized" }, 401, CORS);
      const role = who.role;
      const meta = reqMeta(req);

      // ---------- STOCK DEL GRUPO · vista consolidada (admin / editor) ----------
      if (path === "/grupo/consolidado") {
        if (req.method !== "GET") return json({ error: "use GET" }, 405, CORS);
        if (role !== "admin" && role !== "editor") return json({ error: "forbidden" }, 403, CORS);
        const [propio, otro] = await Promise.all([grupoPropio(env), grupoPeer(env)]);
        return json({ ok: true, apps: [propio, otro] }, 200, CORS);
      }

      // ---------- v4 · 2FA DEL PROPIO USUARIO ----------
      if (path === "/2fa" || path.startsWith("/2fa/")) {
        const row = await env.DB.prepare("SELECT * FROM usuarios WHERE user = ?").bind(who.u).first();
        if (!row) {
          return err(400, CORS, "2fa needs app user",
            "El 2FA es para usuarios creados en la app (Usuarios). Este login viene del secret de respaldo.",
            "2FA is for users created in the app (Users). This login comes from the backup secret.");
        }
        if (path === "/2fa" && req.method === "GET") {
          let quedan = 0; try { quedan = JSON.parse(row.totp_recup || "[]").length; } catch (_) {}
          return json({ ok: true, on: !!row.totp_on, recuperacion: row.totp_on ? quedan : 0 }, 200, CORS);
        }
        if (req.method !== "POST") return json({ error: "method not supported" }, 405, CORS);
        let b;
        try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400, CORS); }
        const passOk = async () => verifyPass(String((b && b.pass) || ""), row.salt, row.pass_hash);

        // 1) Empezar: pide la contraseña (si te roban la sesión, no pueden enrolar SU celular).
        if (path === "/2fa/setup") {
          if (row.totp_on) return err(400, CORS, "2fa already on", "El 2FA ya está activo.", "2FA is already on.");
          if (!(await passOk())) return err(401, CORS, "wrong password", "Contraseña incorrecta.", "Wrong password.");
          const a = new Uint8Array(20); crypto.getRandomValues(a);
          const secreto = base32(a);
          await env.DB.prepare("UPDATE usuarios SET totp_pend = ? WHERE user = ?").bind(await cifrar(env, secreto), row.user).run();
          const emisor = String(env.TOTP_ISSUER || "Gestor de Stock");
          const otpauth = "otpauth://totp/" + encodeURIComponent(emisor + ":" + row.user) +
            "?secret=" + secreto + "&issuer=" + encodeURIComponent(emisor) + "&algorithm=SHA1&digits=6&period=30";
          return json({ ok: true, secret: secreto, otpauth }, 200, CORS);
        }
        // 2) Confirmar con un código: recién ahí se activa (prueba que el celular quedó bien).
        if (path === "/2fa/activar") {
          const pend = await descifrar(env, row.totp_pend);
          if (!pend) return err(400, CORS, "no pending 2fa", "Primero generá el código QR.", "Generate the QR code first.");
          const c = await totpVerificar(pend, b && b.code, 0);
          if (!c) return err(400, CORS, "wrong 2fa code", "Código incorrecto. Revisá que la hora del celular esté en automático.", "Wrong code. Check your phone's time is set automatically.");
          const recup = codigosRecuperacion();
          const hashes = [];
          for (const r of recup) hashes.push(await sha256hex(normRecup(r)));
          const tv = Number(row.token_version || 0) + 1;       // cierra las demás sesiones abiertas
          await env.DB.prepare("UPDATE usuarios SET totp_secret = ?, totp_pend = NULL, totp_on = 1, totp_ult = ?, totp_recup = ?, token_version = ? WHERE user = ?")
            .bind(row.totp_pend, c, JSON.stringify(hashes), tv, row.user).run();
          await auditar(env, { actor: who.u, role, ...meta, accion: "2fa-activado", resumen: row.user });
          // Nueva sesión para ESTE dispositivo (las otras quedaron cerradas).
          const r = await emitirSesion(env, CORS, { user: row.user, role: normRole(row.role), vendedorId: who.vid, name: row.name || row.user, tv }, Date.now());
          const cuerpo = await r.json();
          const sc = r.headers.get("Set-Cookie");
          return json({ ...cuerpo, recuperacion: recup }, 200, sc ? { ...CORS, "Set-Cookie": sc } : CORS);
        }
        // 3) Desactivar: contraseña + código (o código de recuperación).
        if (path === "/2fa/desactivar") {
          if (!row.totp_on) return json({ ok: true }, 200, CORS);
          if (!(await passOk())) return err(401, CORS, "wrong password", "Contraseña incorrecta.", "Wrong password.");
          const sec = await descifrar(env, row.totp_secret);
          let ok = !!(sec && await totpVerificar(sec, b && b.code, row.totp_ult));
          if (!ok) { let l = []; try { l = JSON.parse(row.totp_recup || "[]"); } catch (_) {} ok = l.includes(await sha256hex(normRecup(b && b.code))); }
          if (!ok) return err(401, CORS, "wrong 2fa code", "Código incorrecto.", "Wrong code.");
          await env.DB.prepare("UPDATE usuarios SET totp_secret = NULL, totp_pend = NULL, totp_on = 0, totp_ult = 0, totp_recup = NULL WHERE user = ?").bind(row.user).run();
          await auditar(env, { actor: who.u, role, ...meta, accion: "2fa-desactivado", resumen: row.user });
          return json({ ok: true }, 200, CORS);
        }
        return json({ error: "route not found" }, 404, CORS);
      }

      // ---------- USUARIOS (ABM, sólo admin) ----------
      if (path === "/users") {
        if (role !== "admin") return json({ error: "forbidden" }, 403, CORS);

        if (req.method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT user, role, vendedor_id, cliente_id, name, created_at, totp_on, edita_otros FROM usuarios ORDER BY user"
          ).all();
          const users = (results || []).map(r => ({
            user: r.user, role: r.role, vendedorId: r.vendedor_id || "",
            clienteId: r.cliente_id || "", name: r.name || "", createdAt: r.created_at || "",
            totp: !!r.totp_on, editaOtros: normRole(r.role) === "editor" && !!Number(r.edita_otros || 0)
          }));
          return json({ ok: true, users }, 200, CORS);
        }

        if (req.method === "POST") {
          let b;
          try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400, CORS); }
          const u = String((b && b.user) || "").trim().toLowerCase().slice(0, 64);
          const r = normRole(b && b.role);
          if (!u) return json({ error: "missing user" }, 400, CORS);
          // v4: admin resetea el 2FA de otro usuario (perdió el celular). También cierra sus sesiones.
          if (b && b.reset2fa) {
            if (u === String(who.u || "").toLowerCase()) return json({ error: "forbidden", detalle: "use /2fa/desactivar" }, 403, CORS);
            const r0 = await env.DB.prepare("UPDATE usuarios SET totp_secret = NULL, totp_pend = NULL, totp_on = 0, totp_ult = 0, totp_recup = NULL, token_version = token_version + 1 WHERE user = ?").bind(u).run();
            if (!(r0 && r0.meta && r0.meta.changes)) return json({ error: "missing user" }, 400, CORS);
            await auditar(env, { actor: who.u, role, ...meta, accion: "2fa-reseteado", resumen: u });
            return json({ ok: true, user: u }, 200, CORS);
          }
          const existing = await env.DB.prepare(
            "SELECT user, pass_hash, salt, role, vendedor_id, created_at, token_version, edita_otros FROM usuarios WHERE user = ?"
          ).bind(u).first();
          if (!existing && !(b && b.pass)) return json({ error: "new user needs a password" }, 400, CORS);
          if (b && b.pass && String(b.pass).length < MIN_PASS) {
            return err(400, CORS, "password too short",
              `La contraseña tiene que tener al menos ${MIN_PASS} caracteres.`, `Password must be at least ${MIN_PASS} characters.`);
          }

          let salt = existing ? existing.salt : "";
          let hash = existing ? existing.pass_hash : "";
          if (b && b.pass) { salt = randSaltHex(); hash = await pbkdf2(String(b.pass), salt); }

          const vendedorId = r === "seller" ? String((b && b.vendedorId) || u).trim().toLowerCase() : "";
          const name = String((b && b.name) || u).trim().slice(0, 100);
          const createdAt = existing ? (existing.created_at || new Date().toISOString()) : new Date().toISOString();
          // Cambió contraseña, rol o vendedor (o se pidió "cerrar sesiones") => se invalidan sus tokens.
          let tv = existing ? Number(existing.token_version || 0) : 0;
          // v11: permiso "editar lo de otros" (sólo perfil Editor). Si no viene en el pedido, se conserva.
          const eo = r !== "editor" ? 0 : ((b && b.editaOtros !== undefined) ? (b.editaOtros ? 1 : 0) : Number((existing && existing.edita_otros) || 0));
          const revocar = existing && ((b && b.pass) || existing.role !== r || (existing.vendedor_id || "") !== vendedorId || (b && b.revocar)
                          || Number(existing.edita_otros || 0) !== eo);
          if (revocar) tv += 1;

          await env.DB.prepare(
            "INSERT INTO usuarios (user, pass_hash, salt, role, vendedor_id, cliente_id, name, created_at, token_version, edita_otros) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(user) DO UPDATE SET pass_hash=excluded.pass_hash, salt=excluded.salt, role=excluded.role, " +
            "vendedor_id=excluded.vendedor_id, cliente_id=excluded.cliente_id, name=excluded.name, token_version=excluded.token_version, edita_otros=excluded.edita_otros"
          ).bind(u, hash, salt, r, vendedorId, "", name, createdAt, tv, eo).run();

          await auditar(env, { actor: who.u, role, ...meta, accion: existing ? "usuario-editado" : "usuario-creado",
            resumen: `${u} (${r})${eo ? " · edita lo de otros" : ""}${revocar ? " · sesiones cerradas" : ""}` });
          return json({ ok: true, user: u }, 200, CORS);
        }

        if (req.method === "DELETE") {
          const u = String(url.searchParams.get("user") || "").trim().toLowerCase();
          if (!u) return json({ error: "missing user" }, 400, CORS);
          if (u === String(who.u || "").toLowerCase()) {
            return json({ error: "can't delete the user you're logged in as" }, 400, CORS);
          }
          await env.DB.prepare("DELETE FROM usuarios WHERE user = ?").bind(u).run();
          await auditar(env, { actor: who.u, role, ...meta, accion: "usuario-borrado", resumen: u });
          return json({ ok: true }, 200, CORS);
        }
        return json({ error: "method not supported" }, 405, CORS);
      }

      // ---------- PAPELERA y AUDITORÍA (sólo admin) ----------
      if (path === "/auditoria") {
        if (role !== "admin") return json({ error: "forbidden" }, 403, CORS);
        if (req.method !== "GET") return json({ error: "method not supported" }, 405, CORS);
        const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
        const { results } = await env.DB.prepare(
          "SELECT id, ts, rev, actor, role, ip, pais, accion, resumen, hash FROM auditoria ORDER BY id DESC LIMIT ?").bind(lim).all();
        return json({ ok: true, items: results || [] }, 200, CORS);
      }
      if (path === "/papelera") {
        if (role !== "admin") return json({ error: "forbidden" }, 403, CORS);
        if (req.method !== "GET") return json({ error: "method not supported" }, 405, CORS);
        const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));
        const { results } = await env.DB.prepare(
          "SELECT id, ts, rev, actor, role, coleccion, doc_id, motivo, length(doc) AS largo, " +
          "CASE WHEN length(doc) <= 60000 THEN doc ELSE NULL END AS doc FROM papelera WHERE space = ? ORDER BY id DESC LIMIT ?"
        ).bind(String(who.sp || "main"), lim).all();
        // "vigente" = ese documento hoy está en la app (ya se restauró o nunca se borró del todo)
        const est = await leerEstado(env, String(who.sp || "main"));
        let actual = {};
        try { actual = est ? JSON.parse(est.dataStr) : {}; } catch (_) { actual = {}; }
        const ids = {};
        for (const col of ["ventas", "compras", "clientes", "productos", "movimientos"]) ids[col] = new Set((actual[col] || []).map(d => d && d.id));
        const items = (results || []).map(r => ({ ...r, vigente: !!(ids[r.coleccion] && r.doc_id && ids[r.coleccion].has(r.doc_id)) }));
        return json({ ok: true, items }, 200, CORS);
      }
      if (path === "/papelera/restaurar") {
        if (role !== "admin") return json({ error: "forbidden" }, 403, CORS);
        if (req.method !== "POST") return json({ error: "use POST" }, 405, CORS);
        let b;
        try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400, CORS); }
        const space = String(who.sp || "main");
        const fila = await env.DB.prepare("SELECT * FROM papelera WHERE id = ? AND space = ?").bind(Number(b && b.id) || 0, space).first();
        if (!fila) return err(404, CORS, "not found", "No encontré ese registro en la papelera.", "That item is not in the trash.");
        if (!["ventas", "compras", "clientes", "productos"].includes(fila.coleccion)) {
          return err(400, CORS, "not restorable",
            "Este registro no se puede restaurar automáticamente (es un ajuste o un borrado masivo). Si lo necesitás, restaurá la copia JSON o pedí ayuda.",
            "This item can't be restored automatically (it's an adjustment or a bulk delete). Restore the JSON backup or ask for help.");
        }
        let doc;
        try { doc = JSON.parse(fila.doc); } catch { doc = null; }
        if (!doc || !doc.id) return err(400, CORS, "bad item", "El registro está dañado y no se puede restaurar.", "The item is damaged and can't be restored.");

        for (let intento = 0; intento < 3; intento++) {
          const est = await leerEstado(env, space);
          if (!est) return json({ error: "forbidden" }, 403, CORS);
          const prev = JSON.parse(est.dataStr);
          const r = restaurarDoc(env, prev, est.rev, who, fila.coleccion, doc);
          if (r.error) return err(r.status || 400, CORS, "restore failed", r.error.es, r.error.en);
          const dataStr = JSON.stringify(r.m);
          const g = await guardarEstado(env, { space, dataStr, curRev: est.rev, existe: true, who, meta,
            accion: "papelera-restaurar", resumen: `${fila.coleccion} ${r.desc} (papelera #${fila.id})`, papelera: [] });
          if (g.grande) return errGrande(CORS);
          if (!g.ok) continue;
          if (ctx && ctx.waitUntil) ctx.waitUntil(backupVersion(env, space, g.newRev, dataStr, g.sha));
          return new Response(`{"ok":true,"rev":${g.newRev},"updated_at":${JSON.stringify(g.now)},"data":${dataStr},"avisos":${JSON.stringify(r.avisos)}}`,
            { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
        }
        return json({ error: "busy", es: "El servidor está ocupado, reintentá en unos segundos.", en: "Server busy, retry in a few seconds." }, 503, CORS);
      }

      // ---------- PARSE INVOICE (sólo admin) · v6: lógica en leerFacturaIA() ----------
      if (path === "/parse-invoice") {
        if (req.method !== "POST") return json({ error: "use POST" }, 405, CORS);
        if (role !== "admin" && role !== "editor") return json({ ok: false, error: "forbidden" }, 403, CORS);   // v10: el editor carga compras
        if (!env.GEMINI_KEY) return json({ ok: false, error: "config: missing GEMINI_KEY" }, 500, CORS);
        let b;
        try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400, CORS); }
        // v7: la app puede mandar el TEXTO ya extraído del PDF (más rápido) o el PDF entero.
        const texto = typeof (b && b.texto) === "string" ? b.texto.slice(0, 60000).trim() : "";
        const pdf = b && b.pdf;
        const mime = (b && b.mime) || "application/pdf";
        if (!texto && !pdf) return json({ ok: false, error: "missing 'pdf'" }, 400, CORS);
        if (!texto) {
          if (typeof pdf !== "string" || pdf.length > 14_000_000) {
            return err(413, CORS, "file too large", "El archivo es demasiado grande (máx. ~10 MB).", "File too large (max ~10 MB).");
          }
          if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mime)) {
            return err(400, CORS, "unsupported file", "Tipo de archivo no soportado.", "Unsupported file type.");
          }
        }
        const parteDoc = texto
          ? { text: "INVOICE TEXT (extracted from the PDF; each line is one printed row, columns separated by spaces):\n" + texto }
          : { inline_data: { mime_type: mime, data: pdf } };
        const r = await leerFacturaIA(env, parteDoc);
        if (r.ok) return json({ ok: true, data: r.data, model: r.model, ms: r.ms, cuadra: r.cuadra, suma: r.suma, total: r.total }, 200, CORS);
        return json({ ok: false, error: "gemini error", detalle: r.error }, 502, CORS);
      }

      if (path !== "/state") return json({ error: "route not found" }, 404, CORS);

      // El espacio sale del TOKEN, no de la URL (evita leer/escribir inventarios ajenos).
      const space = String(who.sp || "main").slice(0, 64);
      const qSpace = url.searchParams.get("space");
      if (qSpace && qSpace !== space) return json({ error: "forbidden" }, 403, CORS);

      // ---------- GET ----------
      if (req.method === "GET") {
        const row = await leerEstado(env, space);
        if (!row) return json({ data: null, rev: 0, updated_at: null }, 200, CORS);
        if ((role === "admin" || role === "editor") && ctx && ctx.waitUntil) ctx.waitUntil(sembrarHist(env, space, row));   // v9 · v10: + editor
        return new Response(`{"data":${estadoParaCliente(env, who, row.dataStr)},"rev":${row.rev},"updated_at":${JSON.stringify(row.updated_at)}}`,
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
      }

      // ---------- PUT ----------
      if (req.method === "PUT") {
        const bodyTxt = await req.text();
        if (bodyTxt.length > MAX_REQ_BYTES) return errGrande(CORS);
        let body;
        try { body = JSON.parse(bodyTxt); } catch { return json({ error: "invalid JSON" }, 400, CORS); }
        if (!body || !body.data || typeof body.data !== "object") return json({ error: "missing 'data'" }, 400, CORS);
        const next = body.data;
        const baseRev = Number(body.baseRev || 0);

        /* ===== VENDEDOR: el servidor aplica sólo lo permitido ===== */
        if (role === "seller") {
          for (let intento = 0; intento < 3; intento++) {
            const cur = await leerEstado(env, space);
            if (!cur) return json({ error: "forbidden" }, 403, CORS);   // un vendedor no inicializa la base
            const curRev = cur.rev;
            let prev;
            try { prev = JSON.parse(cur.dataStr); } catch { return json({ error: "server exception" }, 500, CORS); }
            const c = rebaseVendedor(env, prev, next, Math.min(baseRev, curRev), curRev, who);
            if (!c.cambios.length) {
              return new Response(`{"ok":true,"rev":${curRev},"data":${estadoParaCliente(env, who, cur.dataStr)},"avisos":${JSON.stringify(c.avisos)}}`,
                { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
            }
            marcarAutor(prev, c.m, who.u);   // v11
            const dataStr = JSON.stringify(c.m);
            const g = await guardarEstado(env, { space, dataStr, curRev, existe: true, who, meta,
              accion: "estado-vendedor", resumen: c.cambios.join(" | "), papelera: c.papelera });
            if (g.grande) return errGrande(CORS);
            if (!g.ok) continue;   // alguien escribió en el medio: reintentamos sobre la versión nueva
            if (ctx && ctx.waitUntil) ctx.waitUntil(backupVersion(env, space, g.newRev, dataStr, g.sha));
            return new Response(`{"ok":true,"rev":${g.newRev},"updated_at":${JSON.stringify(g.now)},"data":${estadoParaCliente(env, who, dataStr)},"avisos":${JSON.stringify(c.avisos)}}`,
              { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
          }
          return json({ error: "busy", es: "El servidor está ocupado, reintentá en unos segundos.", en: "Server busy, retry in a few seconds." }, 503, CORS);
        }

        /* ===== ADMIN: reemplazo completo, con controles ===== */
        // v4: un celular que tenía la vista recortada de vendedor (y después pasó a admin)
        // NO puede pisar la base completa con esa copia parcial.
        if (next._vista) {
          return err(400, CORS, "partial view", "Tu copia local es parcial (vista de vendedor). Recargá los datos del servidor antes de guardar.",
            "Your local copy is partial (seller view). Reload data from the server before saving.");
        }
        if (!validarEstructura(next)) {
          return err(400, CORS, "invalid state", "Los datos enviados están incompletos: no se guardó nada.", "The data sent is incomplete: nothing was saved.");
        }
        const force = role === "editor" ? false : !!body.force;   // v10: el editor nunca fuerza
        const conflicto409 = (curRev, curStr, updatedAt, conflictos) => {
          const extra = conflictos && conflictos.length ? `,"conflictos":${JSON.stringify(conflictos)}` : "";
          return new Response(`{"conflict":true,"rev":${curRev},"data":${curStr || "null"},"updated_at":${JSON.stringify(updatedAt || null)}${extra}}`,
            { status: 409, headers: { "Content-Type": "application/json", ...CORS } });
        };
        // v9: hasta 3 intentos (si otro guarda justo en el medio, se vuelve a leer y combinar)
        for (let intento = 0; intento < 3; intento++) {
          const cur = await leerEstado(env, space);
          const curRev = cur ? cur.rev : 0;
          let prev = null;
          if (cur) { try { prev = JSON.parse(cur.dataStr); } catch { prev = null; } }

          // cada intento arranca de una copia limpia de lo que mandó el admin (al guardar se modifica)
          const mio = intento === 0 ? next : JSON.parse(bodyTxt).data;
          // v10 · EDITOR: sólo compras, productos y su stock. Se compara contra la versión en la que trabajó.
          if (role === "editor") {
            if (!prev) return err(403, CORS, "forbidden", "El perfil Editor no puede inicializar la base.", "The Editor profile can't initialize the database.");
            const ref = baseRev === curRev ? prev : ((baseRev > 0 && baseRev < curRev) ? await leerHist(env, space, baseRev) : null);
            if (!ref) return conflicto409(curRev, cur && cur.dataStr, cur && cur.updated_at, null);
            const pe = protegerEditor(ref, mio);
            if (pe) return err(403, CORS, "editor", pe.es, pe.en);
            // v11: sólo sus propias compras, salvo permiso del admin
            if (!who.eo) { const aj = editorAjeno(ref, mio, who.u, ["compras", "ventas"]); if (aj) { const m = msgAjeno(aj); return err(403, CORS, "editor", m.es, m.en); } }
          }
          let data = mio, combinado = null;
          if (!force && baseRev !== curRev) {
            // v9: la versión sobre la que trabajó este admin -> combinar sus cambios con los de los demás
            const base = (prev && baseRev > 0 && baseRev < curRev) ? await leerHist(env, space, baseRev) : null;
            if (!base) return conflicto409(curRev, cur && cur.dataStr, cur && cur.updated_at, null);
            combinado = combinar3(base, mio, prev, { stores: storeIds(env) });
            if (combinado.conflictos.length) return conflicto409(curRev, cur.dataStr, cur.updated_at, combinado.conflictos);
            data = combinado.data;
            if (mrgCanon(data) === mrgCanon(prev)) {   // lo mío ya estaba en el servidor: nada que guardar
              return new Response(`{"ok":true,"rev":${curRev},"updated_at":${JSON.stringify(cur.updated_at)},"avisos":[],"data":${estadoParaCliente(env, who, cur.dataStr)}}`,
                { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
            }
          }

          let avisos = combinado ? combinado.avisos.slice() : [], cambiosRebase = [];
          if (prev) {
            if (!force) {
              const bm = borradoMasivo(prev, data);
              if (bm) {
                return new Response(JSON.stringify({
                  error: "mass delete", conflict: true, rev: curRev, updated_at: cur.updated_at,
                  es: `Frené el guardado: se estaban borrando ${bm.idos} de ${bm.antes} ${bm.col}. Si es a propósito, elegí "sobrescribir el servidor" en Datos.`,
                  en: `Save blocked: ${bm.idos} of ${bm.antes} ${bm.col} were being deleted. If intended, choose "overwrite server" in Data.`
                }).slice(0, -1) + `,"data":${cur.dataStr}}`, { status: 422, headers: { "Content-Type": "application/json", ...CORS } });
              }
            } else if (baseRev < curRev) {
              const c = rebaseAdmin(env, prev, data, baseRev, curRev, who);
              avisos = c.avisos; cambiosRebase = c.cambios;
            }
          }

          marcarAutor(prev, data, who.u);   // v11
          marcarRevs(prev, data, curRev + 1);
          const papelera = prev ? borrados(prev, data) : [];
          const dataStr = JSON.stringify(data);
          const resumen = resumenCambios(prev, data) + (force ? " | FORZADO" : "") + (combinado ? ` | COMBINADO (base ${baseRev} → ${curRev})` : "")
            + (cambiosRebase.length ? " | " + cambiosRebase.join(", ") : "");
          const g = await guardarEstado(env, { space, dataStr, curRev, existe: !!cur, who, meta,
            accion: force ? "estado-admin-forzado" : (combinado ? "estado-admin-combinado" : "estado-admin"), resumen, papelera });
          if (g.grande) return errGrande(CORS);
          if (!g.ok) continue;   // alguien guardó justo en el medio: volvemos a leer y combinar
          if (ctx && ctx.waitUntil) ctx.waitUntil(backupVersion(env, space, g.newRev, dataStr, g.sha));
          const out = { ok: true, rev: g.newRev, updated_at: g.now, avisos };
          if (g.pct >= 50) out.avisoTamano = g.pct;   // % de capacidad usada
          // Si hubo rebase o combinación, el admin tiene que recibir la versión final.
          if (cambiosRebase.length || combinado) {
            return new Response(JSON.stringify(out).slice(0, -1) + `,"data":${dataStr}}`, { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
          }
          return json(out, 200, CORS);
        }
        return json({ error: "busy", es: "El servidor está ocupado, reintentá en unos segundos.", en: "Server busy, retry in a few seconds." }, 503, CORS);
      }
      return json({ error: "method not supported" }, 405, CORS);

    } catch (e) {
      console.error("server exception:", e && (e.stack || e.message || e));
      return json({ error: "server exception" }, 500, CORS);
    }
  }
};

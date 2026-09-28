# Gestor de Stock

Gestor de inventario en **vanilla HTML/CSS/JS**, sin frameworks ni build. Todo vive en un único `index.html`. Las **compras suman** stock (por sociedad) y fijan el **último costo**; las **ventas restan** desde un **pool unificado** con costeo **FIFO global por fecha**; los **ajustes** corrigen a mano. Cada movimiento queda trazado en un **kardex**. Importa facturas en **PDF** (OCR con Gemini vía el Worker) y sincroniza entre dispositivos contra un backend en **Cloudflare Worker + D1**. Es una **PWA** instalable y usable offline.

---

## Cómo funciona

| Acción | Efecto en el stock |
|---|---|
| **Compra** | Suma unidades y actualiza el **último costo** del producto. Puede importarse desde PDF. |
| **Venta** | Resta unidades (valida que haya existencias) y registra el margen contra el costo del momento. |
| **Ajuste** | Corrección manual (mermas, recuentos, cargas iniciales). Reversible desde el kardex. |

- **Kardex:** cada entrada/salida/ajuste queda con fecha, cantidad, valor unitario, saldo y documento de origen. La ficha de cada producto muestra su kardex individual y una evolución del stock.
- **Sagas:** el sistema deriva la "línea/juego" desde el nombre del producto y la normaliza (unifica alias tipo *One Piece TCG* == *One Piece Card Game*) para filtrar sin duplicados.
- **Alertas:** un producto entra en la lista de reposición si está en **cero/negativo** o por debajo de su **punto de repedido**.

---

## Sociedades, stock unificado y FIFO global

El proveedor pone un **tope de compra por sociedad**, así que se compra con **varias sociedades** (Akira, Silver, y las que se sumen). Pero **el stock es uno solo para la venta**:

- Cada **compra** elige la **sociedad** que la hizo → eso define la **procedencia** de cada lote (podés ver cuánto vino por Akira y cuánto por Silver).
- La **venta NO elige sociedad**: sale del **pool unificado**. El costo se toma **FIFO global por fecha de entrada**, cruzando sociedades. Ejemplo: 10u compradas por Akira el día 1 + 40u por Silver el día 5; vendés 20 → toma 10 de Akira y 10 de Silver (COGS FIFO real). Akira queda en 0, Silver en 30.
- El **desglose por sociedad** (columnas en Dashboard/Productos) es sólo informativo y **admin-only**. El vendedor ve únicamente el stock total vendible.
- Escala solo a **más sociedades**: las columnas y el motor iteran la lista de sociedades, no están hardcodeadas.

## Perfiles y permisos

Dos roles, más el **modo Local** (sin login = acceso total):

| Capacidad | Admin | Vendedor (Teo, Tonio…) |
|---|---|---|
| Vender desde el pool unificado | ✓ | ✓ |
| Que la venta quede a su nombre (comisión) | ✓ (elige a quién) | ✓ (fijado a sí mismo) |
| Cargar compras / importar facturas | ✓ | — |
| Enviar/traer de Inversión | ✓ | — |
| Ajustes de inventario / ABM de productos | ✓ | — |
| Ver Análisis, P&L, Datos y comisiones de todos | ✓ | — |
| Ver sus propias ventas | ✓ (ve todas) | ✓ (sólo las suyas) |

- Los **vendedores son personas** (Teo, Tonio), **no sociedades** — se gestionan en **Data → Sellers**.
- En el listado de ventas (admin) la columna **"Sold by"** muestra quién vendió cada factura (punto 6).
- Los permisos los controla **el servidor**, no solo la pantalla: cada usuario tiene su propia sesión, el rol se revalida contra la base en cada pedido, y un vendedor no puede guardar nada que no sea suyo aunque toque el código de la app. Con `SELLER_VIEW=filtrada` el vendedor además **ni recibe** costos, compras, gastos ni ventas ajenas. Ver **[Seguridad](#seguridad-v108v114)**.

## Fechas

Todo el display de fechas usa **formato americano MM/DD/YYYY** (incluido el calendario y el kardex), y **toda fecha numérica se LEE como americana**: `07/01/2026` es 1 de julio, en facturas PDF, OCR, imports y datos viejos. También acepta `Jul 1, 2026`, `01-Jul-2026` e ISO. Una fecha imposible (`13/40/2026`) queda vacía en vez de inventarse.

---

## Finanzas (v55–v56)

Cinco pestañas admin-only que comparten **un único juego de filtros** (período MTD/QTD/YTD/12M/Todo o fechas libres, línea, idioma, país, vendedor): filtrás en una y las demás ya están filtradas igual.

| Pestaña | Qué muestra |
|---|---|
| **Resumen** | 6 KPIs con tendencia de 12 meses (contra plan FP&A o, si no hay, contra el mismo período del año anterior), desvío por línea, riesgos calculados y decisiones pendientes con acción directa. |
| **Análisis** (Ventas y margen) | Ventas vs compras por mes con margen %, tabla mes a mes, rankings, mix y margen por línea, vendedores, país/idioma y procedencia por sociedad. |
| **P&L** | Estado de resultados con % s/ ingreso neto y año anterior, waterfall, contribución por mes, vendedores con drill-down y real vs presupuesto. |
| **Plan de ventas** | Semáforo del mes en curso (también en el Panel) + histórico plan vs real por juego y por mes, con controles de conciliación. |
| **Gastos de estructura** | Alquiler, sueldos, servicios, software, honorarios, marketing… Fijos mensuales (se cargan una vez y se devengan solos) y puntuales (a un mes). Bajan al P&L y dan el resultado operativo. |

**Fuente única de números:** `js/05-metrics.js`. Análisis, P&L, Resumen, Plan vs Real y el Excel del P&L salen del mismo cálculo; los porcentajes son siempre razón de sumas.

**Plan de ventas (v82)** (`js/06-fpa.js`): la plantilla tiene **solo 3 columnas** — `Mes | Juego | Ventas plan`. Se descarga desde la pestaña, se completa y se importa (.xlsx/.xls/.csv) con vista previa de errores; cada importación queda como versión. El parser sigue aceptando las columnas viejas (margen, compras, stock objetivo, idioma) para no romper planes ya cargados, pero no se piden más.

**Semáforo "Plan del mes" (v82):** tarjeta admin-only arriba del Panel (y completa en la pestaña Plan de ventas). Por juego cruza plan, vendido en el mes y stock + tránsito **valuado a precio de venta** (precio de lista → promedio real 90 días → costo × markup del juego). Cierre estimado = vendido + mín(ritmo 30 días × días restantes, stock disponible): no se puede vender lo que no hay. Diagnóstico: *Cumplido*, *Llega*, *Falta stock* (dice cuánto comprar), *Venta lenta* (hay stock, falta ritmo: dice cuánto por día hace falta), *No llegó* y *Sin plan*.

**Drill-down (v57):** tocar un mes (gráfico o fila), una barra de producto/país/idioma o una fila de vendedor/sociedad abre las líneas de venta que la componen (y, si es un mes, sus compras), con totales, acceso a cada venta y exportación a Excel. Respeta los filtros activos.

**Proyección de cierre (v57):** en Resumen y Plan vs Real. Proyectado = vendido en el mes + días restantes × ritmo diario de los últimos 30 días; contra el plan del mes y con el ritmo diario necesario para llegar.

**Fotos mensuales de stock (v57):** stock a costo FIFO al cierre de cada mes, reconstruido desde el kardex (ventas por fecha de venta) y **congelado** en `db.stockSnaps` cuando el admin abre la app en un mes nuevo. Un mes congelado no cambia si después se edita un documento viejo; "Recalcular meses cerrados" (en Análisis) lo rearma. Alimenta la columna "Stock al cierre", el gráfico de stock, el minigráfico del Resumen y el stock vs objetivo por mes de Plan vs Real.

**Gastos de estructura (v83)** (`js/11f-view-gastos.js`, datos en `db.gastos`): categorías editables agrupadas en *Administración* y *Comercialización*; **gastos fijos** con mes desde / hasta (cambiar el monto "desde tal mes" parte el gasto en dos tramos y no reescribe la historia; "Dar de baja" cierra el tramo) y **gastos puntuales** imputados a un mes. Criterio de lo devengado: cada gasto pesa entero en su mes, aunque el filtro tome parte del mes; los fijos se devengan hasta el mes en curso. Sociedad: directo o *Compartido* (con foco en una sociedad, los compartidos se prorratean por su % de ingreso neto). En el **P&L**: KPI de resultado operativo, waterfall hasta el resultado operativo, gastos de administración y comercialización con sus categorías en el estado de resultados (con año anterior) y tendencia mensual del resultado operativo. El **Excel del P&L** suma esas filas y una hoja con el detalle. Con filtros de juego/idioma/país/vendedor los gastos no se asignan y se avisa. La pestaña muestra además el punto de equilibrio del mes (gastos ÷ margen de contribución %).

**Export del P&L con presentación (v85)** (`js/31b-export-pnl-pro.js`): reemplaza al Excel plano. Usa **ExcelJS** (cargado al exportar desde cdnjs, con jsDelivr de respaldo; el SW lo cachea). Hojas: *Resumen* (tarjetas KPI, estado de resultados con subtotales y colores, waterfall, ingreso/resultado por mes y donut por juego dibujados en canvas, lectura rápida con punto de equilibrio; entra en una hoja apaisada), *P&L mensual* (fórmulas de total y %), *Por sociedad* (sólo consolidado), *Por juego* y *Por vendedor* (barras de datos y escala de color), *Gastos de estructura* y *Productos* (filtros). Si ExcelJS no carga, se exporta el Excel plano de 31-export-pnl.js.

**Panel:** los KPIs son subtotales del filtro activo (línea, idioma, estado, etc.).

---


## Catálogo público (v86)

Link libre, **sin login y de solo lectura**, para que los clientes vean el stock: `https://<tu-pages>/catalogo.html` (en **Productos → Link del catálogo** se copia solo). Opcional: `?lang=es` lo abre en español.

- **Qué muestra:** juego, nombre, idioma, stock en unidades o cases, y lo que está **en tránsito** como "Próximamente". Nunca costos, precios, SKU, sociedades ni clientes. Los productos **bloqueados** (best offer) y la bóveda de inversión no se publican.
- **Seguridad:** la página no usa `/state`. Pega a `GET /public/catalog` del Worker, que arma la lista con una **whitelist de campos** del lado del servidor. El `space` lo fija el Worker (`CATALOG_SPACE`, default `main`), no quien llama.
- **Cache:** la respuesta se cachea 60 s en el edge (protege a D1). Un cambio en la app tarda hasta 1 minuto en verse.
- **Imágenes:** campo **URL de imagen** en la ficha del producto (solo `http/https`). Sin imagen, o si el link se rompe, se muestra un placeholder con el color del juego y el código del set.
- **Pedido:** el cliente arma cantidades por producto (unidades o cases por línea), agrega nombre y nota, y lo **copia** o lo manda por **WhatsApp** / **mail** a su vendedor. El pedido vive solo en el navegador del cliente, nunca llega al servidor.
- `sagaDe()` está duplicada en `worker.js` para derivar el juego del lado del servidor: si la cambiás en `10-view-dashboard.js`, cambiala también allá.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app entera (UI + lógica). Es lo único imprescindible para que corra. |
| `manifest.json` | Metadatos PWA para instalación. |
| `sw.js` | Service worker: cachea la app y pdf.js para uso offline. |
| `catalogo.html` | Catálogo público de stock (sin login, sin precios) con armado de pedido. |
| `worker.js` | Backend (Cloudflare Worker v4): login con 2FA, sesión por cookie, permisos por rol, vista recortada del vendedor y API de estado con control de `rev`. |
| `js/43-seguridad.js` | Paso 2 del login (código 2FA) y panel "Verificación en dos pasos" en Usuarios. |
| `vendor/` | Librerías de terceros (xlsx, jspdf, pdf.js, ExcelJS, qrcode). Se cargan **a demanda**, no al abrir. |
| `CNAME` | Le dice a GitHub Pages que la app vive en `app.princecollectionstcg.com`. No borrar. |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Íconos de la PWA. |
| `apple-touch-icon.png` | Ícono para "Agregar a inicio" en iOS. |
| `favicon.png`, `favicon-32.png` | Favicons. |

> Para probarla sola, con abrir `index.html` alcanza (modo Local, sin sincronización). Los demás archivos son para que sea **instalable, offline y multi-dispositivo**.

---

## Deploy de la app (GitHub Pages)

1. Subí todos los archivos a la raíz del repo (o a `/docs`).
2. **Settings → Pages → Branch `main`** (carpeta raíz o `/docs`).
3. Entrá a la URL publicada. En el celu: **Compartir → Agregar a inicio** y queda como app nativa.

---

## Versionado del service worker

Cada vez que tocás `index.html`, **subí el string de versión** en `sw.js` y pusheá los dos juntos:

```js
const CACHE = "mayor-stock-v56";  // -> "mayor-stock-v57", etc.
```

Si no, `index.html` es *network-first* (trae la última si hay internet), pero conviene bumpear igual por prolijidad y para invalidar el cache de estáticos. También está el `build vNN` en la pantalla de login como referencia visual rápida de qué versión estás corriendo.

---

## Import de PDF

- Reconoce el formato tipo **Coqui Hobby** (`SKU: descripción … QTY UOM MSRP NET EXT`): toma **NET PRICE** como costo y **MSRP** como precio de venta sugerido, y excluye el flete del stock.
- Si el layout no matchea, cae a una detección genérica línea por línea.
- **Siempre** muestra una tabla editable + el texto crudo extraído **antes** de impactar stock. Revisá antes de confirmar: los formatos varían.
- Se procesa 100% en el navegador; el PDF no se sube a ningún lado.

---

## Backend opcional (Cloudflare Worker + D1)

Por defecto todo vive en `localStorage` (modo **Local**, offline). Para tener **el mismo stock desde la PC y el celu**, el `worker.js` expone una API mínima con **login por usuario/contraseña** y control de versión optimista.

### Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/login` `{user, pass}` | Valida el usuario. Si tiene 2FA devuelve `{need2fa, ticket}`; si no, abre la sesión (cookie `gs_sess` con `COOKIE_MODE=1`, o `{token}` sin ella). |
| `POST` | `/login/2fa` `{ticket, code}` | Paso 2 del login: código de 6 dígitos de la app autenticadora o código de recuperación. |
| `POST` | `/logout` | Borra la cookie de sesión. |
| `GET/POST` | `/2fa`, `/2fa/setup`, `/2fa/activar`, `/2fa/desactivar` | Estado, alta (contraseña → QR → código) y baja del 2FA del propio usuario. |
| `POST` | `/parse-invoice` `{pdf, mime}` | OCR de una factura de compra con Gemini (requiere Bearer y `GEMINI_KEY`). |
| `GET` | `/state?space=…` | Lee el estado (requiere sesión: cookie o `Authorization: Bearer`). A un vendedor, con `SELLER_VIEW=filtrada`, le llega recortado. |
| `PUT` | `/state?space=…` | Guarda con control de `rev`; si cambió en el servidor, responde **409 Conflicto**. |

### Secrets y variables

**Secrets** (cifrados; se cargan en Cloudflare → Worker → Configuración → Variables y secretos, tipo *Secreto*):

| Secret | Para qué |
|---|---|
| `AUTH_SECRET` | Clave para firmar las sesiones (HMAC-SHA256, vencen a los 30 días). **Obligatorio.** Si se cambia, se cierran todas las sesiones. |
| `TOTP_KEY` | Clave con la que se guardan cifrados los secretos del 2FA. **Si se cambia, hay que reactivar el 2FA de todos.** |
| `ADMIN_USER` / `ADMIN_PASS` | Login de respaldo ("llave maestra"). **Hoy apagado** con `SECRET_LOGIN=off`. |
| `USERS` *(viejo, no usar)* | JSON de usuarios de respaldo. Reemplazado por los usuarios de la app (**Usuarios**, en D1 con contraseña hasheada PBKDF2). |
| `GEMINI_KEY` *(opcional)* | Key de Google AI para el OCR de facturas (`/parse-invoice`). |

**Variables** (texto visible; tipo *Texto*). Son interruptores: si una falla, se borra y todo vuelve a como estaba al instante.

| Variable | Valor en producción | Qué hace |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://app.princecollectionstcg.com` | Páginas autorizadas a hablar con el servidor. Con cookie, además es el control anti-CSRF. **Sin esta variable la app no conecta.** |
| `COOKIE_MODE` | `1` | La sesión viaja en cookie HttpOnly (el código de la página no la puede leer). |
| `SELLER_VIEW` | `filtrada` | Los vendedores no reciben costos, compras, gastos, plan ni ventas ajenas. |
| `SECRET_LOGIN` | `off` | Apaga el login de respaldo (`ADMIN_USER`/`ADMIN_PASS`/`USERS`), que no pide 2FA ni se puede revocar. |
| `TOTP_ISSUER` | `Prince Collections` | Nombre que se ve en la app autenticadora del celu. |

> ⚠️ **Actualizar el Worker siempre desde Cloudflare** (Worker → *Editar código* → pegar → *Deploy*). Si alguna vez se sube con `wrangler deploy` desde la compu, `wrangler` **borra las variables que no estén en el `wrangler.toml`**: hay que copiarlas antes a su sección `[vars]` (Cloudflare muestra el bloque listo en un cartel amarillo).

### Vendedores (perfiles Teo/Tonio)

> **Hoy los usuarios se crean desde la app (Usuarios).** El JSON de abajo es el método viejo; con `SECRET_LOGIN=off` ya no funciona. Si quedara algún usuario así, en **Usuarios** figura como "Sin usuario en la app" y se pasa con **"Pasar a usuario de la app"**.

Los **vendedores son personas, no sociedades**. Método viejo: definir el secret `USERS` como un JSON. Cada seller lleva un `id` que debe **coincidir** con el id del vendedor en **Data → Sellers** (ahí se le atribuye la comisión):

```json
[
  { "user": "tonio", "pass": "…", "role": "admin" },
  { "user": "teo",   "pass": "…", "role": "seller", "id": "teo",   "name": "Teo" },
  { "user": "tonio-v","pass": "…", "role": "seller", "id": "tonio", "name": "Tonio" }
]
```

- `role: "admin"` → acceso total (compras, inversión, análisis, ve comisiones de todos).
- `role: "seller"` → vende desde el pool unificado; cada venta queda a su nombre; **no** carga compras ni manda a inversión, y sólo ve **sus** ventas.
- Todos comparten el mismo inventario (`space: "main"`): **el stock es uno solo**. Cada uno tiene su propia sesión y el servidor aplica los permisos.

### `wrangler.toml` mínimo

El Worker **crea la tabla solo** (`CREATE TABLE IF NOT EXISTS estado …`), así que no hace falta correr un `schema.sql`. Solo necesitás el binding D1 llamado `DB`:

```toml
name = "mayor-stock-api"
main = "worker.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mayor-stock"
database_id = "PEGÁ-ACÁ-EL-ID"
```

### Deploy del backend (una vez)

```bash
npm i -g wrangler
wrangler login

# 1) Crear la base D1 y pegar el database_id en wrangler.toml
wrangler d1 create mayor-stock

# 2) Definir los secrets (uno por comando, te los pide interactivo)
wrangler secret put AUTH_SECRET   # obligatorio: firma de sesiones
wrangler secret put TOTP_KEY      # recomendado: cifrado del 2FA
wrangler secret put GEMINI_KEY    # opcional: OCR de facturas
# (ADMIN_USER / ADMIN_PASS / USERS ya no hacen falta: los usuarios se crean en la app)

# 3) Publicar (SOLO la primera vez; después, actualizar desde Cloudflare → Editar código,
#    o copiar antes las variables al [vars] del wrangler.toml — ver "Secrets y variables")
wrangler deploy
```

En producción el servidor vive en **`https://api.princecollectionstcg.com`** (dominio propio, ver [Seguridad](#seguridad-v108v114)). Esa URL va en la constante `API_URL` de `js/01-core.js` **y** de `js/catalogo.js`, y en el `connect-src` de la CSP de `index.html` y `catalogo.html`:

```js
const API_URL = "https://api.princecollectionstcg.com";
```

### Entrar

Abrís la app, cargás **usuario y contraseña** (un usuario creado en **Usuarios**) y, si tiene 2FA, el código del celu. La sesión queda en una **cookie HttpOnly** que la app no puede leer; en `localStorage` solo quedan datos no secretos (usuario, rol, `cookie: true`).

---

## Seguridad (v108–v114)

### Cómo está armado hoy

| Capa | Qué hace | Dónde |
|---|---|---|
| **Dominio propio** | App en `app.princecollectionstcg.com` (GitHub Pages) y servidor en `api.princecollectionstcg.com` (Worker). Al ser el mismo dominio, se puede usar cookie segura y firewall. La dirección vieja `*.workers.dev` está **apagada**. | Cloudflare (DNS) + GitHub Pages |
| **Sesión por cookie** | La "llave" de la sesión va en cookie `HttpOnly; Secure; SameSite=Strict`: un script malicioso no la puede robar, solo viaja por HTTPS y otra página no la puede usar. En pedidos que modifican algo, el servidor además exige que el `Origin` esté en `ALLOWED_ORIGINS` (anti-CSRF). | `COOKIE_MODE=1` + `API_COOKIE = true` en `js/01-core.js` |
| **2FA (TOTP)** | Opcional por usuario, con app autenticadora (Google Authenticator, 1Password…). Login en 2 pasos: contraseña → *ticket* de 5 minutos → código de 6 dígitos. 8 códigos de recuperación de un solo uso. El mismo código no se puede usar dos veces. El secreto se guarda cifrado (AES-GCM). Al activarlo se cierran las demás sesiones. | Usuarios → "Verificación en dos pasos" |
| **Rate limit en el servidor** | 5 errores por usuario o 20 por IP → 15 minutos de bloqueo. Lo mismo para códigos 2FA. Contador atómico (no se cuelan intentos en paralelo). | `worker.js` |
| **Firewall de Cloudflare** | Regla "Freno login": más de 5 pedidos a `/login` o `/login/2fa` en 10 s desde la misma IP → bloqueo. Corta ráfagas antes de que lleguen al servidor. | Cloudflare → dominio → Seguridad → Reglas de limitación de tasa |
| **Permisos en el servidor** | El rol sale de la base en cada pedido (no del celu). Un vendedor solo puede guardar **sus** ventas y altas/cambios de clientes; costos, stock, FIFO y número de factura los calcula el servidor. | `rebaseVendedor()` en `worker.js` |
| **Vista recortada del vendedor** | El servidor le manda al vendedor solo stock, productos **sin costos**, clientes, **sus** ventas y el tránsito sin precios. Un celu que tenía esa vista y pasa a admin no puede pisar la base completa (candado `_vista`). | `SELLER_VIEW=filtrada` |
| **Sin llave maestra** | El login de respaldo del secret (no pide 2FA, no se revoca) está apagado. | `SECRET_LOGIN=off` |
| **CSP estricta** | La app solo ejecuta scripts propios y solo se conecta a `api.princecollectionstcg.com`. | `<meta http-equiv="Content-Security-Policy">` en `index.html` y `catalogo.html` |

### Emergencias

- **Un usuario perdió el celu (2FA):** un admin abre su tarjeta en **Usuarios** → **Resetear 2FA** (también le cierra las sesiones). Lo vuelve a activar él.
- **El admin perdió el celu:** en el login, en vez del código, escribe un **código de recuperación** (`xxxx-xxxx`).
- **El admin perdió celu y códigos:** Cloudflare → D1 → base de producción → *Console*:
  ```sql
  UPDATE usuarios SET totp_on=0, totp_secret=NULL, totp_pend=NULL, totp_recup=NULL, totp_ult=0 WHERE user='USUARIO';
  ```
- **"Demasiados intentos":** esperar 15 minutos (se destraba solo).
- **El código 2FA nunca anda:** la hora del celu tiene que estar en automático.
- **Algo raro tras prender un interruptor:** borrar esa variable en Cloudflare → vuelve al instante.
- **Entra y enseguida te echa (con cookie):** casi siempre es otra pestaña o la app instalada corriendo una versión vieja que habla con otra dirección del servidor: cerrar todas, abrir una sola y actualizar.

### Dominio y DNS

- El dominio `princecollectionstcg.com` es del cliente y se **paga en Hostinger**, pero su DNS (la "agenda") lo maneja **Cloudflare** (nameservers `bob.ns.cloudflare.com` / `lorna.ns.cloudflare.com`). Los registros se editan en Cloudflare → dominio → DNS.
- `app` → CNAME a `teamquinoto.github.io` con **nube gris** (DNS only): GitHub necesita ver el tráfico directo para su certificado. `www` y el dominio raíz (página de Hostinger) también en gris.
- **Mail del cliente (Google):** registro MX `SMTP.GOOGLE.COM` + TXT de verificación de Google. No tocarlos.
- `api` lo administra el Worker (Worker → Dominios → dominio personalizado); no se edita a mano en DNS.
- Para volver el DNS a Hostinger (emergencia): en Hostinger poner de nuevo `atlas.dns-parking.com` y `hyperion.dns-parking.com` (el Worker en `api.` dejaría de responder).

### Pendiente (solo si se abre registro público)

Verificación de email al crear cuenta y recuperación de contraseña por mail. Hoy no aplica: los usuarios los crea el admin.

---

## Datos, sincronización y conflictos

- La app **siempre guarda en local** primero (seguís trabajando sin conexión) y, si hay sesión, empuja/trae el estado completo.
- Control de versión optimista con `rev`: si desde la última sync cambió **acá y en el servidor**, la app avisa **Conflicto** y elegís cuál conservar. Si solo cambió de un lado, sincroniza sola.
- Con `space` podés tener **inventarios separados** en el mismo servidor (`main`, `us`, `europa`, etc.).
- El indicador de estado (**Local / Sincronizado / Guardando / Sin conexión / Conflicto**) está en la barra superior y lateral.

> La sesión viaja en una cookie `HttpOnly; Secure; SameSite=Strict` (con `COOKIE_MODE=1`). El servidor todavía acepta `Authorization: Bearer` para sesiones viejas y para pruebas locales.

### Respaldo extra

Aun con servidor, **Datos → Exportar JSON** te da una copia puntual. **Importar JSON** reemplaza el estado actual (y se sincroniza si estás conectado).

---

## Stack y decisiones

- **Sin dependencias de build.** Un solo HTML, service worker y (opcional) un Worker. Fácil de auditar y de deployar en Pages.
- **`localStorage` como fuente local** + backend como espejo sincronizado, no al revés: la app nunca depende de estar online.
- **Librerías pesadas a demanda (v114):** Excel (`xlsx`), PDF (`jspdf`), lector de PDF (`pdf.js`) y QR (`qrcode`) — ~1,6 MB — **no** se cargan al abrir. `libCargar()` / `libFalta()` en `js/01-core.js` las bajan la primera vez que un botón las necesita, y el service worker las guarda para las siguientes (también offline). ExcelJS (P&L "pro") ya se cargaba así desde v96. **Si agregás un uso nuevo de estas librerías, empezá la función con `if(libFalta("xlsx", ()=> miFuncion(args))) return;`.**
- **Temas claro/oscuro** con `prefers-color-scheme` y override manual persistido.

/* ============================================================
   gestordestock — 07-paises.js
   Catálogo de países + normalización de texto de clientes.
   ------------------------------------------------------------
   PAÍS: se guarda SIEMPRE el nombre canónico en inglés de esta lista
   (ej. "United States"). Así "USA", "usa", "EEUU" o "Estados Unidos"
   dejan de ser 4 países distintos en el slicer de Análisis.
   En pantalla se muestra traducido al idioma actual (Intl.DisplayNames),
   pero el valor guardado no depende del navegador ni del idioma: está
   hardcodeado acá, así dos dispositivos nunca guardan cosas distintas.

   TEXTO: smartCase() corrige mayúsculas sólo cuando el texto vino
   "descuidado" (todo en minúscula). Si el usuario usó mayúsculas a
   propósito (DMT HOBBIES LLC, McAllen, iPhone) se respeta tal cual.
   ============================================================ */

/* ISO2 | ISO3 | nombre canónico (CLDR en inglés) */
const PAISES_RAW = "AD|AND|Andorra;AE|ARE|United Arab Emirates;AF|AFG|Afghanistan;AG|ATG|Antigua & Barbuda;AI|AIA|Anguilla;AL|ALB|Albania;AM|ARM|Armenia;AO|AGO|Angola;AQ|ATA|Antarctica;AR|ARG|Argentina;AS|ASM|American Samoa;AT|AUT|Austria;AU|AUS|Australia;AW|ABW|Aruba;AX|ALA|Åland Islands;AZ|AZE|Azerbaijan;BA|BIH|Bosnia & Herzegovina;BB|BRB|Barbados;BD|BGD|Bangladesh;BE|BEL|Belgium;BF|BFA|Burkina Faso;BG|BGR|Bulgaria;BH|BHR|Bahrain;BI|BDI|Burundi;BJ|BEN|Benin;BL|BLM|St. Barthélemy;BM|BMU|Bermuda;BN|BRN|Brunei;BO|BOL|Bolivia;BQ|BES|Caribbean Netherlands;BR|BRA|Brazil;BS|BHS|Bahamas;BT|BTN|Bhutan;BV|BVT|Bouvet Island;BW|BWA|Botswana;BY|BLR|Belarus;BZ|BLZ|Belize;CA|CAN|Canada;CC|CCK|Cocos (Keeling) Islands;CD|COD|DR Congo;CF|CAF|Central African Republic;CG|COG|Republic of the Congo;CH|CHE|Switzerland;CI|CIV|Ivory Coast;CK|COK|Cook Islands;CL|CHL|Chile;CM|CMR|Cameroon;CN|CHN|China;CO|COL|Colombia;CR|CRI|Costa Rica;CU|CUB|Cuba;CV|CPV|Cape Verde;CW|CUW|Curaçao;CX|CXR|Christmas Island;CY|CYP|Cyprus;CZ|CZE|Czechia;DE|DEU|Germany;DJ|DJI|Djibouti;DK|DNK|Denmark;DM|DMA|Dominica;DO|DOM|Dominican Republic;DZ|DZA|Algeria;EC|ECU|Ecuador;EE|EST|Estonia;EG|EGY|Egypt;EH|ESH|Western Sahara;ER|ERI|Eritrea;ES|ESP|Spain;ET|ETH|Ethiopia;FI|FIN|Finland;FJ|FJI|Fiji;FK|FLK|Falkland Islands;FM|FSM|Micronesia;FO|FRO|Faroe Islands;FR|FRA|France;GA|GAB|Gabon;GB|GBR|United Kingdom;GD|GRD|Grenada;GE|GEO|Georgia;GF|GUF|French Guiana;GG|GGY|Guernsey;GH|GHA|Ghana;GI|GIB|Gibraltar;GL|GRL|Greenland;GM|GMB|Gambia;GN|GIN|Guinea;GP|GLP|Guadeloupe;GQ|GNQ|Equatorial Guinea;GR|GRC|Greece;GS|SGS|South Georgia & South Sandwich Islands;GT|GTM|Guatemala;GU|GUM|Guam;GW|GNB|Guinea-Bissau;GY|GUY|Guyana;HK|HKG|Hong Kong;HM|HMD|Heard & McDonald Islands;HN|HND|Honduras;HR|HRV|Croatia;HT|HTI|Haiti;HU|HUN|Hungary;ID|IDN|Indonesia;IE|IRL|Ireland;IL|ISR|Israel;IM|IMN|Isle of Man;IN|IND|India;IO|IOT|British Indian Ocean Territory;IQ|IRQ|Iraq;IR|IRN|Iran;IS|ISL|Iceland;IT|ITA|Italy;JE|JEY|Jersey;JM|JAM|Jamaica;JO|JOR|Jordan;JP|JPN|Japan;KE|KEN|Kenya;KG|KGZ|Kyrgyzstan;KH|KHM|Cambodia;KI|KIR|Kiribati;KM|COM|Comoros;KN|KNA|St. Kitts & Nevis;KP|PRK|North Korea;KR|KOR|South Korea;KW|KWT|Kuwait;KY|CYM|Cayman Islands;KZ|KAZ|Kazakhstan;LA|LAO|Laos;LB|LBN|Lebanon;LC|LCA|St. Lucia;LI|LIE|Liechtenstein;LK|LKA|Sri Lanka;LR|LBR|Liberia;LS|LSO|Lesotho;LT|LTU|Lithuania;LU|LUX|Luxembourg;LV|LVA|Latvia;LY|LBY|Libya;MA|MAR|Morocco;MC|MCO|Monaco;MD|MDA|Moldova;ME|MNE|Montenegro;MF|MAF|St. Martin;MG|MDG|Madagascar;MH|MHL|Marshall Islands;MK|MKD|North Macedonia;ML|MLI|Mali;MM|MMR|Myanmar;MN|MNG|Mongolia;MO|MAC|Macao;MP|MNP|Northern Mariana Islands;MQ|MTQ|Martinique;MR|MRT|Mauritania;MS|MSR|Montserrat;MT|MLT|Malta;MU|MUS|Mauritius;MV|MDV|Maldives;MW|MWI|Malawi;MX|MEX|Mexico;MY|MYS|Malaysia;MZ|MOZ|Mozambique;NA|NAM|Namibia;NC|NCL|New Caledonia;NE|NER|Niger;NF|NFK|Norfolk Island;NG|NGA|Nigeria;NI|NIC|Nicaragua;NL|NLD|Netherlands;NO|NOR|Norway;NP|NPL|Nepal;NR|NRU|Nauru;NU|NIU|Niue;NZ|NZL|New Zealand;OM|OMN|Oman;PA|PAN|Panama;PE|PER|Peru;PF|PYF|French Polynesia;PG|PNG|Papua New Guinea;PH|PHL|Philippines;PK|PAK|Pakistan;PL|POL|Poland;PM|SPM|St. Pierre & Miquelon;PN|PCN|Pitcairn Islands;PR|PRI|Puerto Rico;PS|PSE|Palestine;PT|PRT|Portugal;PW|PLW|Palau;PY|PRY|Paraguay;QA|QAT|Qatar;RE|REU|Réunion;RO|ROU|Romania;RS|SRB|Serbia;RU|RUS|Russia;RW|RWA|Rwanda;SA|SAU|Saudi Arabia;SB|SLB|Solomon Islands;SC|SYC|Seychelles;SD|SDN|Sudan;SE|SWE|Sweden;SG|SGP|Singapore;SH|SHN|St. Helena;SI|SVN|Slovenia;SJ|SJM|Svalbard & Jan Mayen;SK|SVK|Slovakia;SL|SLE|Sierra Leone;SM|SMR|San Marino;SN|SEN|Senegal;SO|SOM|Somalia;SR|SUR|Suriname;SS|SSD|South Sudan;ST|STP|São Tomé & Príncipe;SV|SLV|El Salvador;SX|SXM|Sint Maarten;SY|SYR|Syria;SZ|SWZ|Eswatini;TC|TCA|Turks & Caicos Islands;TD|TCD|Chad;TF|ATF|French Southern Territories;TG|TGO|Togo;TH|THA|Thailand;TJ|TJK|Tajikistan;TK|TKL|Tokelau;TL|TLS|Timor-Leste;TM|TKM|Turkmenistan;TN|TUN|Tunisia;TO|TON|Tonga;TR|TUR|Türkiye;TT|TTO|Trinidad & Tobago;TV|TUV|Tuvalu;TW|TWN|Taiwan;TZ|TZA|Tanzania;UA|UKR|Ukraine;UG|UGA|Uganda;UM|UMI|U.S. Outlying Islands;US|USA|United States;UY|URY|Uruguay;UZ|UZB|Uzbekistan;VA|VAT|Vatican City;VC|VCT|St. Vincent & Grenadines;VE|VEN|Venezuela;VG|VGB|British Virgin Islands;VI|VIR|U.S. Virgin Islands;VN|VNM|Vietnam;VU|VUT|Vanuatu;WF|WLF|Wallis & Futuna;WS|WSM|Samoa;YE|YEM|Yemen;YT|MYT|Mayotte;ZA|ZAF|South Africa;ZM|ZMB|Zambia;ZW|ZWE|Zimbabwe;XK|XKX|Kosovo";
const PAISES = PAISES_RAW.split(";").map(s=>{ const [code,iso3,name]=s.split("|"); return {code,iso3,name}; });
const PAIS_BY_NAME = Object.fromEntries(PAISES.map(p=>[p.name,p]));

/* Alias escritos a mano que no salen de los nombres oficiales. */
const PAIS_ALIAS = {
  US:["usa","us","eeuu","ee uu","eua","estados unidos","united states of america","america","estados unidos de america"],
  GB:["uk","england","inglaterra","great britain","gran bretana","reino unido","scotland","escocia","wales","gales"],
  AE:["uae","emiratos","emiratos arabes"], KR:["korea","corea","corea del sur"], KP:["corea del norte"],
  NL:["holland","holanda","paises bajos"], CZ:["czech republic","republica checa","chequia"],
  TR:["turkey","turquia"], RU:["russian federation","rusia"], CI:["cote d ivoire","costa de marfil"],
  CD:["congo kinshasa","drc","rdc"], CG:["congo brazzaville","congo"], MM:["burma","birmania"],
  VA:["vatican","holy see","vaticano"], HK:["hong kong sar china"], MO:["macau","macao sar china"],
  BO:["bolivia plurinational state of"], VE:["venezuela bolivarian republic of"],
  DO:["rep dominicana","republica dominicana"], JP:["japon","nihon"], DE:["alemania"], ES:["espana"],
  IT:["italia"], FR:["francia"], BR:["brasil"], MX:["mejico"], CN:["prc"]
};

function paisNorm(s){
  return String(s==null?"":s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
}

/* Índice de búsqueda: nombre inglés, ISO2, ISO3, nombre en ES/EN del
   navegador (sólo para ENCONTRAR, nunca para guardar) y alias. */
let _paisIdx = null;
function paisIndex(){
  if(_paisIdx) return _paisIdx;
  _paisIdx = {};
  const add = (k,p)=>{ k=paisNorm(k); if(k && !_paisIdx[k]) _paisIdx[k]=p; };
  let dnEs=null, dnEn=null;
  try{ dnEs=new Intl.DisplayNames(["es"],{type:"region"}); dnEn=new Intl.DisplayNames(["en"],{type:"region"}); }catch(e){}
  PAISES.forEach(p=>{
    add(p.name,p); add(p.code,p); add(p.iso3,p);
    try{ if(dnEs) add(dnEs.of(p.code),p); if(dnEn) add(dnEn.of(p.code),p); }catch(e){}
  });
  Object.entries(PAIS_ALIAS).forEach(([code,list])=>{ const p=PAISES.find(x=>x.code===code); if(p) list.forEach(a=>add(a,p)); });
  return _paisIdx;
}

/* Texto libre → nombre canónico. Si no lo reconoce, devuelve el texto
   original (no perdemos datos viejos raros; el form los muestra aparte). */
function paisCanon(v){
  const raw = String(v==null?"":v).trim();
  if(!raw) return "";
  if(PAIS_BY_NAME[raw]) return raw;
  const p = paisIndex()[paisNorm(raw)];
  return p ? p.name : raw;
}
function paisConocido(v){ return !!PAIS_BY_NAME[v]; }

/* Nombre para MOSTRAR en el idioma actual. */
const _dnCache = {};
function paisLabel(v){
  if(!v) return "";
  const p = PAIS_BY_NAME[v]; if(!p) return v;
  const l = (typeof lang==="function" ? lang() : "en");
  if(l==="en") return p.name;
  try{
    _dnCache[l] = _dnCache[l] || new Intl.DisplayNames([l],{type:"region"});
    return _dnCache[l].of(p.code) || p.name;
  }catch(e){ return p.name; }
}
/* Texto extra para el buscador del desplegable (acepta "usa", "eeuu", "ARG"...). */
function paisSearchKey(p){
  const alias = PAIS_ALIAS[p.code] || [];
  return paisNorm([paisLabel(p.name), p.name, p.code, p.iso3].concat(alias).join(" "));
}

/* <option>s del select de país: primero los más usados en tus clientes,
   después todos ordenados por nombre en el idioma actual. */
function paisOptionsHTML(actual){
  const val = paisCanon(actual);
  const l = (typeof lang==="function" ? lang() : "en");
  const opt = (v,label,key)=> `<option value="${esc(v)}" data-k="${esc(key)}"${v===val?" selected":""}>${esc(label)}</option>`;
  let html = `<option value="">—</option>`;
  // valor viejo que no matchea con ningún país: lo mostramos para no perderlo
  if(val && !paisConocido(val)) html += `<option value="${esc(val)}" data-k="${esc(paisNorm(val))}" selected>${esc(val)} (?)</option>`;
  const cnt = {};
  ((typeof db!=="undefined" && db.clientes)||[]).forEach(c=>{ const n=paisCanon(c.pais); if(paisConocido(n)) cnt[n]=(cnt[n]||0)+1; });
  const top = Object.keys(cnt).sort((a,b)=> cnt[b]-cnt[a]).slice(0,5);
  const sorted = PAISES.slice().sort((a,b)=> paisLabel(a.name).localeCompare(paisLabel(b.name), l));
  if(top.length){
    // los frecuentes van con value real; el duplicado de abajo se oculta en la búsqueda
    html += top.map(n=> opt(n, paisLabel(n), paisSearchKey(PAIS_BY_NAME[n]))).join("");
    html += `<option disabled value="__sep">──────────</option>`;
  }
  html += sorted.map(p=> top.includes(p.name) ? "" : opt(p.name, paisLabel(p.name), paisSearchKey(p))).join("");
  return html;
}

/* ---------- Mayúsculas / minúsculas ---------- */
const SC_LOWER = new Set(["de","del","la","las","los","y","e","da","das","do","dos","di","van","von","der","den","of","and"]);
const SC_UPPER = new Set(["llc","llp","lp","dba","tcg","usa","uk","srl","sa","sl","sas","plc","nyc","dc","ltda","ceo","ii","iii","iv"]);
const SC_FIX   = { gmbh:"GmbH", inc:"Inc", ltd:"Ltd", corp:"Corp", co:"Co" };

function _capWord(w){
  if(!w) return w;
  if(/\d/.test(w)) return w;                                        // "14015", "4b", "1st": no se tocan
  return w.split(/([-'’])/).map(part=>{
    if(!part || /[-'’]/.test(part)) return part;
    if(/^mc[a-z]{2,}$/.test(part)) return "Mc"+part[2].toUpperCase()+part.slice(3);  // mcallen → McAllen
    return part[0].toUpperCase()+part.slice(1);
  }).join("");
}
/* kind: "name" (nombres, empresa, ciudad, dirección) · "state" · "upper" · "email" · "plain" */
function smartCase(v, kind){
  let s = String(v==null?"":v).replace(/\s+/g," ").trim();
  if(!s) return "";
  if(kind==="email") return s.replace(/\s/g,"").toLowerCase();
  if(kind==="upper") return s.toUpperCase();
  if(kind==="plain") return s;
  if(kind==="state" && /^[a-z]{2}$/i.test(s)) return s.toUpperCase();      // tx → TX
  // Regla de oro: si ya tiene alguna mayúscula, el usuario decidió → respetamos.
  if(s !== s.toLowerCase()) return s;
  return s.split(" ").map((w,i)=>{
    const bare = w.replace(/[.,]/g,"");
    if(SC_UPPER.has(bare) && kind!=="state") return w.toUpperCase();
    if(SC_FIX[bare]) return w.replace(bare, SC_FIX[bare]);
    if(i>0 && SC_LOWER.has(bare)) return w;
    return _capWord(w);
  }).join(" ");
}

/* Nombre para MOSTRAR (no se guarda): aplica smartCase a cada parte de
   "Cliente · Empresa". Sirve para facturas viejas cuya foto del cliente quedó
   en minúscula ("kevin reid") sin reescribir el documento emitido. */
function nombreVis(v){
  const s = String(v==null?"":v).trim();
  return s ? s.split(/\s*·\s*/).map(x=> smartCase(x,"name")).join(" · ") : "";
}

/* Primera letra en mayúscula (tipo oración), el resto como lo escribieron:
   "intl freight" → "Intl freight", "wire fee USD" → "Wire fee USD".
   Para conceptos libres que salen en la factura (cargos extra). */
function capFirst(v){
  const s = String(v==null?"":v).replace(/\s+/g," ").trim();
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : "";
}

/* Email: devuelve "" si está OK, o la clave i18n del error. */
function emailError(v){
  const s = String(v||"").trim();
  if(!s) return "";
  if(s.indexOf("@")<0) return "md.cli.err.at";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "md.cli.err.domain";
  return "";
}

// Genera el JSON de los 2 nodos de n8n (Code + HTTP Request) listo para pegar
// con Ctrl+V en el lienzo. Se escribe a scripts/n8n-nodes.json.
const fs = require("fs");
const path = require("path");

const jsCode = String.raw`// Extrae nombre / telefono / correo del mensaje entrante y arma el parche
// para actualizar el contacto en Chatwoot. Version BLINDADA:
//  - No sobrescribe datos buenos: solo rellena lo que el contacto tenga vacio.
//  - Si no hay nada nuevo que guardar, devuelve [] (el nodo HTTP no corre).
const body = $input.first().json.body || {};
const texto = (body.content || '').toString();
const sender = body.sender || {};

// id del contacto (rutas tipicas del webhook de Chatwoot)
const contactId =
  sender.id ??
  body?.conversation?.meta?.sender?.id ??
  body?.conversation?.contact_inbox?.contact_id;

// True si el nombre actual es autogenerado por Chatwoot (no es un nombre real).
function esNombreAuto(name) {
  if (!name) return true;
  const n = String(name).trim();
  return /^[a-z]+-[a-z]+-\d+$/.test(n) || /^visitante/i.test(n);
}

// --- Nombre ---
const NAME_LABEL_RE = /\b(?:me llamo|mi nombre es|mi nombre|nombre:?)\s+([a-záéíóúñ]{2,}(?:\s+[a-záéíóúñ]{2,})?)/i;
const NAME_SOY_RE   = /\bsoy\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,})?)/;
const capitalizar = (n) => n.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, s, c) => s + c.toUpperCase());
const mName = texto.match(NAME_LABEL_RE) || texto.match(NAME_SOY_RE);
const nombre = mName ? capitalizar(mName[1].trim()) : null;

// --- Telefono MX (10 digitos -> +52...) ---
const PHONE_RE = /(\+?52[\s-]?)?(\(?\d{2,3}\)?[\s-]?)?\d{3,4}[\s-]?\d{4}/g;
let telefono = null;
for (const c of (texto.match(PHONE_RE) || [])) {
  let d = c.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length === 10) { telefono = '+52' + d; break; }
}

// --- Correo ---
const mMail = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
const email = mMail ? mMail[0] : null;

// Solo guardamos lo que encontramos Y que el contacto aun no tenga.
// (asi no pisamos un nombre/telefono/correo que ya estaba bien)
const patch = {};
if (nombre   && esNombreAuto(sender.name)) patch.name = nombre;
if (telefono && !sender.phone_number)      patch.phone_number = telefono;
if (email    && !sender.email)             patch.email = email;

if (!contactId || Object.keys(patch).length === 0) return [];
return [{ json: { contactId, patch } }];`;

const clip = {
  meta: { instanceId: "findes" },
  nodes: [
    {
      parameters: { mode: "runOnceForAllItems", language: "javaScript", jsCode },
      id: "a1b2c3d4-0001-4a1a-9aaa-000000000001",
      name: "Extraer datos del lead",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [320, 480],
    },
    {
      parameters: {
        method: "PUT",
        url: "=https://findes-chatwoot.7yidoh.easypanel.host/api/v1/accounts/2/contacts/{{ $json.contactId }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "api_access_token", value: "PEGA_AQUI_TU_TOKEN_DE_CHATWOOT" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.patch) }}",
        options: {},
      },
      id: "a1b2c3d4-0002-4a1a-9aaa-000000000002",
      name: "Actualizar contacto en Chatwoot",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [560, 480],
      // Si Chatwoot rechaza (ej. telefono/correo repetido), no truena la ejecucion.
      onError: "continueRegularOutput",
    },
  ],
  connections: {
    "Extraer datos del lead": {
      main: [[{ node: "Actualizar contacto en Chatwoot", type: "main", index: 0 }]],
    },
  },
};

const out = path.join(__dirname, "n8n-nodes.json");
fs.writeFileSync(out, JSON.stringify(clip, null, 2), "utf8");

// Validacion: el jsCode debe tener las regex intactas (\s, \d, \b).
const ok =
  jsCode.includes("\\s+") && jsCode.includes("\\d{4}") && jsCode.includes("\\b(?:me llamo");
console.log("Escrito:", out);
console.log("Regex intactas:", ok);

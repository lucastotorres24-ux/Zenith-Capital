// Guarda los PDFs que los usuarios suben (perfil > Documentos) directamente
// en el disco del servidor — igual que data/db.js hace con data.json, pero
// para archivos binarios en vez de JSON. Solo se guarda la metadata (quién,
// nombre, cuándo) en data.json; el archivo real vive acá.
//
// Nota importante para Lucas: en Render, el disco de un servicio web normal
// (sin "disco persistente" contratado aparte) se borra en cada redeploy o
// reinicio — igual que ya pasa hoy con data.json. Así que los PDFs
// sobreviven mientras el servidor esté corriendo, pero pueden perderse si
// Render reinicia el servicio. Para un simulador de práctica es aceptable;
// si más adelante esto maneja documentos reales, hace falta un disco
// persistente de Render o un servicio externo (S3, etc.).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name) {
  const base = path.basename(String(name || 'documento.pdf'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'documento.pdf';
}

// Guarda un PDF recibido como base64. Devuelve { storedName, size } o
// { error } si algo no es válido (muy grande, no parece un PDF real, etc.).
function saveFile(userId, filename, base64Data) {
  if (!base64Data || typeof base64Data !== 'string') {
    return { error: 'Archivo inválido' };
  }

  // Acepta tanto un data URL completo ("data:application/pdf;base64,...")
  // como el base64 puro, por si el frontend manda cualquiera de los dos.
  const commaIndex = base64Data.indexOf(',');
  const rawBase64 = base64Data.startsWith('data:') && commaIndex !== -1
    ? base64Data.slice(commaIndex + 1)
    : base64Data;

  let buffer;
  try {
    buffer = Buffer.from(rawBase64, 'base64');
  } catch (err) {
    return { error: 'No se pudo leer el archivo' };
  }

  if (buffer.length === 0) return { error: 'El archivo está vacío' };
  if (buffer.length > MAX_FILE_BYTES) {
    return { error: 'El archivo supera el máximo de 10 MB' };
  }
  // Comprobación básica de que de verdad es un PDF (encabezado "%PDF").
  if (buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    return { error: 'Solo se permiten archivos PDF' };
  }

  const userDir = path.join(UPLOADS_DIR, String(userId));
  fs.mkdirSync(userDir, { recursive: true });

  const safeName = sanitizeFilename(filename);
  const storedName = `${userId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
  const fullPath = path.join(UPLOADS_DIR, storedName);

  fs.writeFileSync(fullPath, buffer);

  return { storedName, size: buffer.length };
}

function getFilePath(storedName) {
  // Evita que un storedName con ".." se escape del directorio de uploads.
  const resolved = path.resolve(UPLOADS_DIR, storedName);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) return null;
  return resolved;
}

module.exports = { saveFile, getFilePath, MAX_FILE_BYTES };

// Guarda los PDFs que los usuarios suben (perfil > Documentos) — desde
// agosto 2026, en MongoDB (misma base de datos que el resto de la app, ver
// data/db.js), cada archivo en su propio documento de la colección
// "uploaded_files". Antes se guardaban como archivos sueltos en el disco
// del servidor, lo cual tenía el mismo problema que el resto de los datos:
// en Render (plan gratis), ese disco se borra en cada redeploy o reinicio,
// así que un documento subido podía "desaparecer" sin que nadie lo haya
// borrado a propósito. Guardándolos en MongoDB, sobreviven igual que
// cuentas, usuarios y todo lo demás.
//
// Solo se guarda la metadata (quién, nombre, cuándo) en el documento
// principal de datos (ver data/store.js#addDocument); el contenido del
// archivo en sí vive acá, identificado por su `storedName`.

const crypto = require('crypto');
const { getMongoDb } = require('./db');

const COLLECTION_NAME = 'uploaded_files';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name) {
  const base = String(name || 'documento.pdf').split(/[\\/]/).pop();
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'documento.pdf';
}

// Guarda un PDF recibido como base64. Devuelve { storedName, size } o
// { error } si algo no es válido (muy grande, no parece un PDF real, etc.).
async function saveFile(userId, filename, base64Data) {
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

  const safeName = sanitizeFilename(filename);
  const storedName = `${userId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;

  await getMongoDb().collection(COLLECTION_NAME).insertOne({
    _id: storedName,
    userId,
    dataBase64: buffer.toString('base64'),
    size: buffer.length,
    createdAt: new Date().toISOString(),
  });

  return { storedName, size: buffer.length };
}

// Trae el contenido de un archivo ya guardado. Devuelve { buffer } o
// { error } si ya no existe (por ejemplo, se subió antes de esta
// actualización y el archivo viejo se quedó en el disco anterior, que ya
// no se usa).
async function getFileBuffer(storedName) {
  if (!storedName) return { error: 'Archivo no encontrado' };
  const doc = await getMongoDb().collection(COLLECTION_NAME).findOne({ _id: storedName });
  if (!doc) return { error: 'El archivo ya no está disponible en el servidor' };
  return { buffer: Buffer.from(doc.dataBase64, 'base64') };
}

module.exports = { saveFile, getFileBuffer, MAX_FILE_BYTES };

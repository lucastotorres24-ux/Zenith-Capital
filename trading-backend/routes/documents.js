// Documentos (PDFs) que el usuario adjunta desde su perfil — pensado para
// pedir/entregar documentos importantes (identificación, comprobantes,
// etc.). Lucas puede verlos desde el panel de administrador.

const express = require('express');
const { saveFile, getFileBuffer } = require('../data/files');
const { addDocument, getDocumentsByUser, getDocumentById } = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/documents -> documentos que el usuario logueado ha subido
router.get('/', (req, res) => {
  res.json(getDocumentsByUser(req.user.id));
});

// POST /api/documents -> subir un PDF nuevo
// body: { filename: "cedula.pdf", dataBase64: "data:application/pdf;base64,...." }
router.post('/', async (req, res) => {
  const { filename, dataBase64 } = req.body;

  if (!filename || !String(filename).toLowerCase().endsWith('.pdf')) {
    return res.status(400).json({ error: 'Solo se permiten archivos con extensión .pdf' });
  }

  const result = await saveFile(req.user.id, filename, dataBase64);
  if (result.error) return res.status(400).json({ error: result.error });

  const doc = addDocument({
    userId: req.user.id,
    filename: String(filename),
    storedName: result.storedName,
    size: result.size,
  });

  res.status(201).json(doc);
});

// GET /api/documents/:id/download -> descarga uno de tus propios documentos
router.get('/:id/download', async (req, res) => {
  const doc = getDocumentById(Number(req.params.id));
  if (!doc || doc.userId !== req.user.id) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }

  const { buffer, error } = await getFileBuffer(doc.storedName);
  if (error) return res.status(404).json({ error });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/"/g, '')}"`);
  res.send(buffer);
});

module.exports = router;

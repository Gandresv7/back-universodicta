/**
 * verify-server.js
 * Endpoint HTTP que recibe un PDF subido por el usuario, calcula su hash
 * y lo compara contra el registro guardado + la prueba anclada en blockchain.
 *
 * Uso: node verify-server.js
 * Luego: POST http://localhost:3000/verificar  (form-data, campo "pdf")
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const OpenTimestamps = require('javascript-opentimestamps');
const { generarCertificado } = require('./generate');

const OUTPUT_DIR = path.join(__dirname, 'output');
const upload = multer({ dest: path.join(__dirname, 'tmp') });
const app = express();

// Permite que el formulario HTML (abierto como archivo local o desde otro puerto)
// pueda llamar a este servidor sin ser bloqueado por CORS.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function leerRegistro(id) {
  if (!UUID_RE.test(id)) return null;
  const p = path.join(OUTPUT_DIR, `certificado-${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}

function calcularHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buscarRegistroPorHash(hash) {
  const archivos = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.json'));
  for (const archivo of archivos) {
    const registro = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, archivo), 'utf-8'));
    if (registro.hash === hash) return registro;
  }
  return null;
}

const verificarHandler = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo PDF' });

    const hashSubido = calcularHash(req.file.path);
    const registro = buscarRegistroPorHash(hashSubido);
    fs.unlinkSync(req.file.path); // limpiar archivo temporal

    if (!registro) {
      return res.json({ valido: false, motivo: 'El hash no coincide con ningún certificado emitido' });
    }

    let confirmadoEnBlockchain = false;
    let detalleBlockchain = null;

    if (registro.otsPath && fs.existsSync(registro.otsPath)) {
      try {
        const otsBytes = fs.readFileSync(registro.otsPath);
        const detachedOts = OpenTimestamps.DetachedTimestampFile.deserialize(otsBytes);
        const fileBuffer = fs.readFileSync(registro.filePath);
        const detachedFile = OpenTimestamps.DetachedTimestampFile.fromBytes(
          new OpenTimestamps.Ops.OpSHA256(),
          fileBuffer
        );
        detalleBlockchain = await OpenTimestamps.verify(detachedOts, detachedFile);
        confirmadoEnBlockchain = !!detalleBlockchain && Object.keys(detalleBlockchain).length > 0;
      } catch (e) {
        detalleBlockchain = { error: 'Aún no confirmado en blockchain o error de verificación', detalle: e.message };
      }
    }

    return res.json({
      valido: true,
      certificado: {
        id: registro.id,
        nombre: registro.nombre,
        curso: registro.curso,
        fecha: registro.fecha,
      },
      confirmadoEnBlockchain,
      detalleBlockchain,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno al verificar el certificado' });
  }
};
app.post('/verificar', upload.single('pdf'), verificarHandler);
app.post('/api/verificar', upload.single('pdf'), verificarHandler);

// --- API para el frontend Angular ---

// Emitir certificado. Protegido con x-api-key si defines API_KEY en el entorno.
app.post('/api/certificados', async (req, res) => {
  try {
    if (process.env.API_KEY && req.get('x-api-key') !== process.env.API_KEY) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const { nombre, curso, fecha, categoria } = req.body || {};
    if (!nombre || !curso) return res.status(400).json({ error: 'nombre y curso son obligatorios' });
    const r = await generarCertificado({
      nombre: String(nombre).slice(0, 80),
      curso: String(curso).slice(0, 120),
      fecha: fecha || new Date().toLocaleDateString('es-ES'),
      categoria,
    });
    const reg = leerRegistro(r.id);
    res.status(201).json({ id: r.id, codigo: reg.codigo, hash: r.hash, pdfUrl: `/api/certificados/${r.id}/pdf` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo generar el certificado' });
  }
});

// Descargar el PDF
app.get('/api/certificados/:id/pdf', (req, res) => {
  const reg = leerRegistro(req.params.id);
  if (!reg || !fs.existsSync(reg.filePath)) return res.status(404).json({ error: 'No encontrado' });
  res.download(reg.filePath, `certificado-${reg.codigo}.pdf`);
});

// Datos públicos (para el QR / página de verificación)
app.get('/api/certificados/:id', (req, res) => {
  const reg = leerRegistro(req.params.id);
  if (!reg) return res.status(404).json({ valido: false, motivo: 'Certificado no encontrado' });
  res.json({
    valido: true,
    certificado: { id: reg.id, codigo: reg.codigo, nombre: reg.nombre, curso: reg.curso, fecha: reg.fecha, categoria: reg.categoria },
    hash: reg.hash,
    anclado: !!(reg.otsPath && fs.existsSync(reg.otsPath)),
  });
});

const PUERTO = process.env.PORT || 3005;
app.listen(PUERTO, () => console.log(`Servidor de verificación escuchando en puerto ${PUERTO}`));

module.exports = app;

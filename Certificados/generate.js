/**
 * generate.js  (diseño espacial · Mundo Dictariano)
 * Genera certificados PDF en versión PADRES (planeta "Hogar"), NIÑO (planeta "Fruta") o JOVEN (planeta "Mors"),
 * con marca de agua, código QR real y sello blockchain.
 * Calcula el SHA-256 del PDF final (el que luego se ancla con anchor.js).
 *
 * Uso:  node generate.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// URL pública donde se verifica (cámbiala por la de tu web en producción)
const VERIFY_BASE = process.env.VERIFY_URL || 'http://localhost:4200/verificar-certificado';

const W = 841.89, H = 595.28; // A4 horizontal
const GOLD = '#E7C25C', SPACE = '#0B1226', TEAL = '#00A896', ACCENT = '#02C39A';

const CATEGORIAS = {
  nino: {
    etiqueta: 'NIÑO', planeta: 'Fruta',
    colorA: '#FFB347', colorB: '#E8590C', brillo: '#FF8A3D',
    descripcion: 'por completar con entusiasmo su aventura de aprendizaje en el universo Dictariano.',
  },
  joven: {
    etiqueta: 'JOVEN', planeta: 'Mors',
    colorA: '#5EEAD4', colorB: '#0F766E', brillo: '#14B8A6',
    descripcion: 'por completar con compromiso su travesía de aprendizaje en el universo Dictariano.',
  },
  padres: {
    etiqueta: 'PADRES', planeta: 'Hogar',
    colorA: '#F5D77A', colorB: '#8B5CF6', brillo: '#A78BFA',
    descripcion: 'por acompañar con dedicación el aprendizaje de su familia en el universo Dictariano.',
  },
};

function normalizarCategoria(c = 'joven') {
  const k = String(c).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (k.startsWith('nin')) return 'nino';
  if (k.startsWith('pad') || k.startsWith('acud') || k.startsWith('fam')) return 'padres';
  return 'joven';
}

// Generador pseudoaleatorio con semilla: mismas estrellas para el mismo ID
function rng(seed) {
  let s = parseInt(seed.slice(0, 8), 16) || 12345;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function glow(doc, x, y, r, color, alpha) {
  for (let i = 6; i >= 1; i--) {
    doc.save().fillColor(color).fillOpacity(alpha * (7 - i) / 6 * 0.6)
      .circle(x, y, (r * i) / 6).fill().restore();
  }
}

function estrellas(doc, rand) {
  for (let i = 0; i < 70; i++) {
    const x = rand() * W, y = rand() * H, r = 0.3 + rand() * 1.2;
    doc.save().fillColor('#FFFFFF').fillOpacity(0.25 + rand() * 0.6).circle(x, y, r).fill().restore();
  }
}

function marcaDeAgua(doc) {
  doc.save();
  doc.rotate(-18, { origin: [W / 2, H / 2] });
  doc.fillColor('#FFFFFF').fillOpacity(0.04).font('Helvetica-Bold').fontSize(64);
  for (let i = -1; i <= 1; i++) {
    doc.text('MUNDO DICTARIANO', W / 2 - 330, H / 2 - 30 + i * 150, { width: 660, align: 'center', lineBreak: false });
  }
  doc.restore();
}

function marco(doc) {
  doc.save().lineWidth(1.5).strokeColor(GOLD).rect(18, 18, W - 36, H - 36).stroke();
  doc.lineWidth(0.6).strokeOpacity(0.7).rect(25, 25, W - 50, H - 50).stroke().restore();
  // esquinas doradas
  const L = 22;
  doc.save().lineWidth(3).strokeColor(GOLD);
  [[18, 18, 1, 1], [W - 18, 18, -1, 1], [18, H - 18, 1, -1], [W - 18, H - 18, -1, -1]].forEach(([x, y, dx, dy]) => {
    doc.moveTo(x, y + dy * L).lineTo(x, y).lineTo(x + dx * L, y).stroke();
  });
  doc.restore();
}

function planeta(doc, cx, cy, r, cat) {
  glow(doc, cx, cy, r * 3.2, cat.brillo, 0.35);
  // anillo trasero
  doc.save().rotate(-12, { origin: [cx, cy] })
    .lineWidth(2.5).strokeColor(GOLD).strokeOpacity(0.8)
    .ellipse(cx, cy, r * 1.9, r * 0.55).stroke().restore();
  // cuerpo con degradado
  const g = doc.linearGradient(cx - r, cy - r, cx + r, cy + r);
  g.stop(0, cat.colorA).stop(1, cat.colorB);
  doc.save().circle(cx, cy, r).fill(g).restore();
  // brillo
  doc.save().fillColor('#FFFFFF').fillOpacity(0.25).circle(cx - r * 0.35, cy - r * 0.4, r * 0.3).fill().restore();
  // bandas
  doc.save().circle(cx, cy, r).clip();
  doc.fillColor('#000000').fillOpacity(0.12)
    .rect(cx - r, cy + r * 0.1, r * 2, r * 0.18).fill()
    .rect(cx - r, cy + r * 0.5, r * 2, r * 0.12).fill();
  doc.restore();
  // parte frontal del anillo
  doc.save().rotate(-12, { origin: [cx, cy] }).lineWidth(2.5).strokeColor(GOLD)
    .moveTo(cx - r * 1.9, cy).bezierCurveTo(cx - r * 1.9, cy + r * 0.75, cx + r * 1.9, cy + r * 0.75, cx + r * 1.9, cy)
    .stroke().restore();
}

function cadena(doc, x, y, huella) {
  // tres bloques unidos: PDF → SHA-256 → Bitcoin
  const bw = 34, bh = 20, gap = 12;
  const nombres = ['PDF', 'SHA', 'BTC'];
  nombres.forEach((n, i) => {
    const bx = x + i * (bw + gap);
    if (i > 0) doc.save().lineWidth(1.5).strokeColor(ACCENT).moveTo(bx - gap, y + bh / 2).lineTo(bx, y + bh / 2).stroke().restore();
    doc.save().roundedRect(bx, y, bw, bh, 4).fillOpacity(0.15).fill(ACCENT).restore();
    doc.save().roundedRect(bx, y, bw, bh, 4).lineWidth(1).strokeColor(ACCENT).stroke().restore();
    doc.save().fillColor(ACCENT).font('Helvetica-Bold').fontSize(8).text(n, bx, y + 6.5, { width: bw, align: 'center', lineBreak: false }).restore();
  });
  const total = 3 * bw + 2 * gap;
  doc.fillColor('#9FB3C8').font('Courier').fontSize(6.5)
    .text(huella, x - 12, y + bh + 6, { width: total + 24, align: 'center', lineBreak: false });
  doc.fillColor('#9FB3C8').font('Helvetica').fontSize(7)
    .text('Hash anclado en blockchain', x - 12, y + bh + 17, { width: total + 24, align: 'center', lineBreak: false });
}

/**
 * @param {Object} datos { nombre, curso, fecha, categoria: 'nino' | 'joven' }
 * @returns {Promise<{ id, filePath, hash }>}
 */
async function generarCertificado(datos) {
  const id = uuidv4();
  const catKey = normalizarCategoria(datos.categoria);
  const cat = CATEGORIAS[catKey];
  const codigo = `MD-${new Date().getFullYear()}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const huella = crypto.createHash('sha256').update(`${id}|${datos.nombre}|${datos.curso}|${datos.fecha}`).digest('hex');
  const huellaCorta = `${huella.slice(0, 10)}…${huella.slice(-8)}`;
  const urlVerificar = `${VERIFY_BASE}?id=${id}`;
  const qrBuffer = await QRCode.toBuffer(urlVerificar, { margin: 1, width: 300, errorCorrectionLevel: 'M', color: { dark: SPACE, light: '#FFFFFF' } });

  const filePath = path.join(OUTPUT_DIR, `certificado-${id}.pdf`);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margin: 0,
      info: { Title: `Certificado ${codigo}`, Author: 'Mundo Dictariano', Subject: datos.curso },
    });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    // Fondo
    doc.rect(0, 0, W, H).fill(SPACE);
    glow(doc, W * 0.15, H * 0.2, 220, TEAL, 0.25);
    glow(doc, W * 0.88, H * 0.85, 240, cat.brillo, 0.22);
    estrellas(doc, rng(id.replace(/-/g, '')));
    marcaDeAgua(doc);
    marco(doc);

    // Planeta + encabezado
    planeta(doc, W / 2, 92, 26, cat);
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10)
      .text('M U N D O   D I C T A R I A N O', 0, 142, { width: W, align: 'center' });

    doc.fillColor('#FFFFFF').font('Times-Bold').fontSize(30)
      .text('Certificado de Participación', 0, 162, { width: W, align: 'center' });
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10)
      .text(`CERTIFICACIÓN ${cat.etiqueta} · PLANETA "${cat.planeta.toUpperCase()}"`, 0, 202, { width: W, align: 'center', characterSpacing: 1.5 });

    // Nombre
    doc.fillColor('#B8C4D6').font('Helvetica-Oblique').fontSize(12)
      .text('Este certificado se otorga con orgullo a', 0, 236, { width: W, align: 'center' });
    doc.fillColor('#FFFFFF').font('Times-Bold').fontSize(32)
      .text(datos.nombre, 60, 258, { width: W - 120, align: 'center' });
    doc.save().lineWidth(1).strokeColor(GOLD).moveTo(W / 2 - 170, 302).lineTo(W / 2 + 170, 302).stroke().restore();

    // Descripción
    doc.fillColor('#D5DEEA').font('Helvetica').fontSize(12)
      .text(`${cat.descripcion}`, 140, 316, { width: W - 280, align: 'center' });
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(15)
      .text(datos.curso, 100, 352, { width: W - 200, align: 'center' });
    doc.fillColor('#9FB3C8').font('Helvetica').fontSize(10)
      .text(`Fecha de emisión: ${datos.fecha}`, 0, 382, { width: W, align: 'center' });

    // Pie: firma | QR | cadena | ID
    const fy = 430;
    // firma
    doc.save().lineWidth(0.8).strokeColor('#9FB3C8').moveTo(70, fy + 40).lineTo(220, fy + 40).stroke().restore();
    doc.fillColor('#B8C4D6').font('Helvetica').fontSize(9)
      .text('Dirección Académica', 70, fy + 46, { width: 150, align: 'center' });

    // QR
    const qs = 78, qx = W / 2 - 150 - qs / 2 + 40;
    doc.save().roundedRect(qx - 5, fy - 5, qs + 10, qs + 10, 6).fill('#FFFFFF').restore();
    doc.image(qrBuffer, qx, fy, { width: qs, height: qs });
    doc.fillColor('#B8C4D6').font('Helvetica').fontSize(8)
      .text('Escanea para verificar', qx - 20, fy + qs + 10, { width: qs + 40, align: 'center' });

    // Cadena
    cadena(doc, W / 2 + 40, fy + 8, huellaCorta);

    // ID
    doc.fillColor('#B8C4D6').font('Helvetica').fontSize(8)
      .text('ID del certificado', W - 230, fy + 22, { width: 160, align: 'center' });
    doc.fillColor(GOLD).font('Courier-Bold').fontSize(10)
      .text(codigo, W - 230, fy + 36, { width: 160, align: 'center' });

    doc.fillColor('#6B7C93').font('Helvetica').fontSize(7)
      .text(`Verificación: ${urlVerificar}`, 0, H - 44, { width: W, align: 'center', lineBreak: false });

    doc.end();
  });

  // Hash SHA-256 del PDF final (esto es lo que se ancla en blockchain)
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

  // Registro local (mismo formato que usan anchor.js y verify-server.js)
  const registro = {
    id, codigo, nombre: datos.nombre, curso: datos.curso, fecha: datos.fecha,
    categoria: catKey, hash, filePath,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, `certificado-${id}.json`), JSON.stringify(registro, null, 2));

  return { id, filePath, hash };
}

// Prueba directa: node generate.js  → crea un certificado Niño, uno Joven y uno Padres
if (require.main === module) {
  (async () => {
    const fecha = new Date().toLocaleDateString('es-ES');
    const pruebas = [
      { nombre: 'Sofía Ramírez', curso: 'Aventura Fruta · Nivel Explorador', fecha, categoria: 'nino' },
      { nombre: 'Juan Pérez', curso: 'Travesía Mors · Certificación Joven', fecha, categoria: 'joven' },
      { nombre: 'Carlos Ramírez', curso: 'Familia Dictariana · Acompañamiento Parental', fecha, categoria: 'padres' },
    ];
    for (const p of pruebas) {
      const r = await generarCertificado(p);
      console.log(`\n[${p.categoria}] ${r.filePath}\nHash SHA-256: ${r.hash}\nSiguiente paso: node anchor.js ${r.id}`);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { generarCertificado };

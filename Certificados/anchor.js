/**
 * anchor.js
 * Ancla el hash de un certificado en la blockchain de Bitcoin usando OpenTimestamps.
 * Es gratuito: no requiere wallet ni gas. El resultado es un archivo .ots
 * que sirve como prueba criptográfica de que el hash existía en cierta fecha.
 *
 * Uso: node anchor.js <id-del-certificado>
 */

const fs = require('fs');
const path = require('path');
const OpenTimestamps = require('javascript-opentimestamps');

const OUTPUT_DIR = path.join(__dirname, 'output');

async function anclarCertificado(id) {
  const registroPath = path.join(OUTPUT_DIR, `certificado-${id}.json`);
  if (!fs.existsSync(registroPath)) {
    throw new Error(`No existe el registro para el certificado ${id}`);
  }

  const registro = JSON.parse(fs.readFileSync(registroPath, 'utf-8'));
  const fileBuffer = fs.readFileSync(registro.filePath);

  // Crear el detached timestamp a partir del hash SHA-256 del archivo
  const detached = OpenTimestamps.DetachedTimestampFile.fromBytes(
    new OpenTimestamps.Ops.OpSHA256(),
    fileBuffer
  );

  // Enviar la solicitud a los calendarios públicos de OpenTimestamps
  // (esto tarda unos segundos; la confirmación en Bitcoin puede tardar horas)
  await OpenTimestamps.stamp(detached);

  const otsBytes = detached.serializeToBytes();
  const otsPath = path.join(OUTPUT_DIR, `certificado-${id}.pdf.ots`);
  fs.writeFileSync(otsPath, Buffer.from(otsBytes));

  // Actualizamos el registro con la ruta de la prueba
  registro.otsPath = otsPath;
  registro.ancladoEn = new Date().toISOString();
  fs.writeFileSync(registroPath, JSON.stringify(registro, null, 2));

  console.log('Prueba .ots generada en:', otsPath);
  console.log('Nota: la confirmación completa en Bitcoin puede tardar varias horas.');
  console.log('Puedes volver a "upgradear" la prueba más tarde con OpenTimestamps.upgrade(detached).');

  return otsPath;
}

if (require.main === module) {
  const id = process.argv[2];
  if (!id) {
    console.error('Uso: node anchor.js <id-del-certificado>');
    process.exit(1);
  }
  anclarCertificado(id).catch(console.error);
}

module.exports = { anclarCertificado };

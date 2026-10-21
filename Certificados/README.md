# Certificados PDF con anclaje en blockchain

Flujo para emitir certificados en PDF cuya autenticidad se puede verificar
mediante un hash anclado en la blockchain de Bitcoin (vía OpenTimestamps),
sin costo y sin necesidad de wallet.

## Instalación

```bash
npm install
```

## 1. Generar un certificado

```bash
node generate.js
```

Genera 3 certificados de prueba (Niño, Joven y Padres, diseño espacial). Esto crea:
- `output/certificado-<id>.pdf` → el PDF del certificado
- `output/certificado-<id>.json` → registro con nombre, curso, fecha y hash SHA-256

Para usarlo desde tu propio código (por ejemplo, un endpoint de tu web):

```js
const { generarCertificado } = require('./generate');

const { id, filePath, hash } = await generarCertificado({
  nombre: 'María López',
  curso: 'Certificación Niño - Mundo Dictariano',
  fecha: '08/09/2026',
  categoria: 'nino', // 'nino' | 'joven' | 'padres'
});
```

## 2. Anclar el hash en blockchain

```bash
node anchor.js <id-del-certificado>
```

Genera `output/certificado-<id>.pdf.ots`, la prueba criptográfica.
La confirmación completa en Bitcoin puede tardar algunas horas; mientras
tanto la prueba ya es válida como "pendiente de confirmación".

## 3. Verificar un certificado

```bash
node verify-server.js
```

Luego, desde tu frontend, envía el PDF con un `POST` a `/verificar`
(form-data, campo `pdf`). El servidor:
1. Calcula el hash del archivo recibido.
2. Lo compara contra los certificados emitidos.
3. Verifica la prueba `.ots` contra la blockchain.
4. Responde si es auténtico y si ya está confirmado on-chain.

## Notas para producción

- Reemplaza los archivos `.json` en `/output` por una base de datos real
  (Postgres, MongoDB, etc.).
- Sube los `.pdf` y `.ots` a almacenamiento persistente (S3, etc.), no al
  disco del servidor.
- Considera reintentar `OpenTimestamps.upgrade()` periódicamente (ej. un
  cron job) para completar la confirmación en Bitcoin de certificados
  recientes.
- Si más adelante necesitas más control (por ejemplo, mostrar el hash en
  tu propia página con un botón "ver en blockchain"), se puede migrar
  el anclaje a un contrato simple en Polygon con `ethers.js`.

## Integración con el frontend Angular (plataforma-universo-dictariano)

Este servidor corre en el puerto **3005** (el `environment.ts` del frontend ya apunta ahí):

```bash
node verify-server.js
```

Endpoints: `POST /api/certificados`, `GET /api/certificados/:id`, `GET /api/certificados/:id/pdf`, `POST /api/verificar`.
Define `API_KEY` en el entorno para exigir el header `x-api-key` al emitir certificados.

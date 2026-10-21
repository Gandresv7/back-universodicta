using System;
using System.Collections.Generic;
using System.Configuration;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using System.Web.Http;
using Back_UniversoDicta.Services.Certificados;

namespace Back_UniversoDicta.Controllers.Certificados
{
    /// <summary>
    /// Puente hacia el microservicio Node de certificados.
    /// Las rutas coinciden con las del microservicio, asi el frontend Angular
    /// solo necesita apuntar su URL_BACKEND_CERTIFICADOS a este backend.
    /// </summary>
    public class CertificadosController : ApiController
    {
        private readonly CertificadosService _servicio = new CertificadosService();

        // POST api/certificados  -> emitir (solo administracion: header x-admin-key)
        [HttpPost]
        [Route("api/certificados")]
        public async Task<HttpResponseMessage> Emitir()
        {
            string claveAdmin = ConfigurationManager.AppSettings["CertificadosAdminKey"];
            IEnumerable<string> valores;
            if (string.IsNullOrEmpty(claveAdmin)
                || !Request.Headers.TryGetValues("x-admin-key", out valores)
                || !System.Linq.Enumerable.Contains(valores, claveAdmin))
            {
                return Request.CreateResponse(HttpStatusCode.Unauthorized, new { error = "No autorizado" });
            }

            string json = await Request.Content.ReadAsStringAsync();
            return await Reenviar(await _servicio.EmitirAsync(json));
        }

        // GET api/certificados/{id}  -> datos publicos (pagina a la que lleva el QR)
        [HttpGet]
        [Route("api/certificados/{id}")]
        public async Task<HttpResponseMessage> Obtener(string id)
        {
            return await Reenviar(await _servicio.ObtenerPublicoAsync(id));
        }

        // GET api/certificados/{id}/pdf  -> descarga del PDF
        [HttpGet]
        [Route("api/certificados/{id}/pdf")]
        public async Task<HttpResponseMessage> Pdf(string id)
        {
            return await Reenviar(await _servicio.ObtenerPdfAsync(id));
        }

        // POST api/verificar  -> sube un PDF (multipart, campo "pdf") y lo verifica
        [HttpPost]
        [Route("api/verificar")]
        public async Task<HttpResponseMessage> Verificar()
        {
            if (!Request.Content.IsMimeMultipartContent())
            {
                return Request.CreateResponse(HttpStatusCode.UnsupportedMediaType, new { error = "Se espera multipart/form-data" });
            }

            var provider = await Request.Content.ReadAsMultipartAsync();
            var salida = new MultipartFormDataContent();
            foreach (var parte in provider.Contents)
            {
                var bytes = await parte.ReadAsByteArrayAsync();
                var copia = new ByteArrayContent(bytes);
                copia.Headers.ContentType = parte.Headers.ContentType;
                string nombre = parte.Headers.ContentDisposition.Name.Trim('"');
                string archivo = parte.Headers.ContentDisposition.FileName;
                if (archivo != null) salida.Add(copia, nombre, archivo.Trim('"'));
                else salida.Add(copia, nombre);
            }
            return await Reenviar(await _servicio.VerificarAsync(salida));
        }

        // Devuelve al cliente la misma respuesta (estado, tipo y cuerpo) que dio el microservicio.
        private async Task<HttpResponseMessage> Reenviar(HttpResponseMessage origen)
        {
            var resp = new HttpResponseMessage(origen.StatusCode);
            var bytes = await origen.Content.ReadAsByteArrayAsync();
            resp.Content = new ByteArrayContent(bytes);
            if (origen.Content.Headers.ContentType != null)
                resp.Content.Headers.ContentType = origen.Content.Headers.ContentType;
            if (origen.Content.Headers.ContentDisposition != null)
                resp.Content.Headers.ContentDisposition = origen.Content.Headers.ContentDisposition;
            origen.Dispose();
            return resp;
        }
    }
}

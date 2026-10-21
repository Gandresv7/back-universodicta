using System;
using System.Configuration;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace Back_UniversoDicta.Services.Certificados
{
    /// <summary>
    /// Cliente del microservicio Node de certificados (carpeta /Certificados).
    /// Usa la clave compartida (x-api-key) definida en Web.config.
    /// </summary>
    public class CertificadosService
    {
        // HttpClient estatico: se reutiliza para evitar agotar sockets.
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };

        private static string BaseUrl
        {
            get { return (ConfigurationManager.AppSettings["CertificadosUrl"] ?? "http://localhost:3005").TrimEnd('/'); }
        }

        private static string ApiKey
        {
            get { return ConfigurationManager.AppSettings["CertificadosApiKey"] ?? string.Empty; }
        }

        /// <summary>Emite un certificado. Llamalo desde tu logica de negocio (p. ej. al terminar un curso).</summary>
        public Task<HttpResponseMessage> EmitirAsync(string jsonBody)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "/api/certificados")
            {
                Content = new StringContent(jsonBody, Encoding.UTF8, "application/json")
            };
            req.Headers.Add("x-api-key", ApiKey);
            return Http.SendAsync(req);
        }

        public Task<HttpResponseMessage> ObtenerPublicoAsync(string id)
        {
            return Http.GetAsync(BaseUrl + "/api/certificados/" + Uri.EscapeDataString(id));
        }

        public Task<HttpResponseMessage> ObtenerPdfAsync(string id)
        {
            return Http.GetAsync(BaseUrl + "/api/certificados/" + Uri.EscapeDataString(id) + "/pdf",
                HttpCompletionOption.ResponseHeadersRead);
        }

        public Task<HttpResponseMessage> VerificarAsync(HttpContent multipart)
        {
            return Http.PostAsync(BaseUrl + "/api/verificar", multipart);
        }
    }
}

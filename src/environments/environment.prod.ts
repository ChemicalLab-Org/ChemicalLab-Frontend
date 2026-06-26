// Configuración de PRODUCCIÓN (build con `ng build`, configuración por defecto).
//
// Para despliegue institucional, ajustar apiUrl según el escenario:
//
//   Opción 1 — frontend y backend en el mismo servidor con reverse proxy (recomendado):
//     apiUrl: '/api'
//
//   Opción 2 — backend en servidor interno de la institución:
//     apiUrl: 'http://192.168.X.X:8080/api'
//     apiUrl: 'http://nombre-servidor-institucional:8080/api'
//
//   Opción 3 — backend en servicio en la nube (Render, Railway, etc.):
//     apiUrl: 'https://nombre-del-servicio.onrender.com/api'
//
// No se requiere dominio público. El sistema funciona en red local o institucional.
export const environment = {
  production: true,
  apiUrl: 'https://chemicallab-backend.onrender.com/api'
};

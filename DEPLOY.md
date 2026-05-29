# Despliegue del frontend — ChemicalLab

Frontend Angular del laboratorio químico digital. Se despliega como **sitio estático** en
**Vercel** (o Render Static Site). La guía de despliegue completa del sistema (backend +
base de datos) está en `ChemicalLab-Backend/DEPLOY.md`.

## Configuración de la URL del backend

La URL del backend se define por entorno:

- **Desarrollo** (`src/environments/environment.ts`): `apiUrl: '/api'`, que el
  `proxy.conf.json` redirige a `http://localhost:8080`.
- **Producción** (`src/environments/environment.prod.ts`): apunta al backend desplegado.

Antes de desplegar, edita `src/environments/environment.prod.ts` y reemplaza la URL por la
del backend real en Render:

```ts
export const environment = {
  production: true,
  apiUrl: 'https://chemicallab-backend.onrender.com/api'
};
```

El build de producción (`ng build`) reemplaza automáticamente `environment.ts` por
`environment.prod.ts` (ver `fileReplacements` en `angular.json`).

## Build

```bash
npm install
npm run build
```

- **Output directory:** `dist/chemical-lab-frontend/browser`
- El build por defecto usa la configuración de producción.

## Despliegue en Vercel

1. **New Project** e importa el repositorio `ChemicalLab-Frontend`.
2. Framework preset: **Angular** (o "Other").
3. **Build Command:** `npm run build`
4. **Output Directory:** `dist/chemical-lab-frontend/browser`
5. El archivo `vercel.json` ya incluye el rewrite para que el enrutado SPA de Angular
   funcione (todas las rutas sirven `index.html`):

   ```json
   {
     "rewrites": [
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```

## Alternativa: Render Static Site

- **Build Command:** `npm run build`
- **Publish Directory:** `dist/chemical-lab-frontend/browser`
- Regla de rewrite para el enrutado SPA:

  ```
  /*    /index.html   200
  ```

## Después de desplegar

Una vez conozcas la URL pública del frontend (ej: `https://chemicallab.vercel.app`),
configúrala en el backend (variable `APP_CORS_ALLOWED_ORIGINS` en Render) para evitar errores
de CORS.

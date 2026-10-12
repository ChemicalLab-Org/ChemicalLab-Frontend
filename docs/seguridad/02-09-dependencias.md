# T09 — Dependencias frontend / VER-01 — etapa 2

Análisis: **2026-10-12, America/Lima**. Base `b9d6b97877ef64c4cdc90c3e7f432dc0aeb457a5`, rama `security/t09-dependencias`, PR a `develop`. Backend coordinado desde `b31b637dd25bc48abe964ee5e1d92f3144463b69`; su nota de igual nombre documenta Maven/JAR/imagen/JDBC. **VER-01 no se declara cerrado:** faltan imagen/runtime reales y persisten avisos altos de Jetty en un plugin auxiliar backend. Ninguno se acepta por el usuario.

Se revisaron auditoría, notas T01–T08 y cierre T08. No cambia el código de aplicación, autorización, reconciliación STOMP, login/contraseñas, ventanas, archivos, cuotas, retención o auditoría. Sólo se actualizan manifests/lock de dependencias y evidencias. Sin merge, despliegue, datos escolares, instituciones nuevas, rotaciones ni T10. Original `feature/validaciones-datos-institucionales` permanece en `e88589635a8269c50ee0f53fccf157f0d0985034`, con 16 archivos e2e-selenium intactos; [preservation.json](t09/preservation.json) registra hashes.

## Inventario y compatibilidad

`package.json` declara selectores; `package-lock.json` v3 registra versiones e integridades por ubicación; `npm ls --all` confirma instalación local; los `stats.json` de Angular identifican fuentes con `bytesInOutput > 0`. **Nada de ello identifica versiones realmente desplegadas**. [Inventario antes](t09/npm-inventory-before.csv), [después](t09/npm-inventory-after.csv), [SBOMs](t09/).

| Componente | Declarado antes | Resuelto antes | Declarado/resuelto final |
|---|---|---|---|
| Angular common/compiler/core/forms/platform-browser/router | ^21.2.0 | 21.2.13 | Exacto 21.2.25 |
| compiler-cli | ^21.2.0 | 21.2.13 | Exacto 21.2.25 |
| Angular build / CLI | ^21.2.11 | 21.2.11 | Exacto 21.2.26 |
| Vitest | ^4.0.8 | 4.1.6 | Exacto 4.1.11 |
| STOMP / SockJS | ^7.3.0 / ^1.6.1 | 7.3.0 / 1.6.1 | Selectores iguales; lock 7.4.0 / 1.6.1 |
| TypeScript / RxJS | ~5.9.2 / ~7.8.0 | Ver inventario | 5.9.3 / 7.8.2, selectores iguales |

Se mantienen líneas mayores Angular 21 y Vitest 4. [Matriz oficial Angular](https://angular.dev/reference/versions): Node ^20.19/^22.12/^24, TypeScript >=5.9 <6, RxJS 7.4+. [Angular 21 tiene soporte LTS](https://angular.dev/reference/releases). Build/CLI y framework tienen patches distintos publicados; no se mezclan sus peerDependencies incompatibles. Sin `npm audit fix --force`, `overrides`, suppressions o `--legacy-peer-deps` en la instalación final.

El lock original tenía 586 entradas de paquetes; final 588, incluidas variantes opcionales para plataformas distintas. Son **567/566 pares únicos nombre+versión**, exactamente los reconocidos por OSV: la diferencia corresponde a ubicaciones repetidas, no a paquetes excluidos por plataforma. Se contrastó también el SBOM completo y se obtuvieron iguales resultados. CycloneDX por adaptador conserva las 586/588 entradas (incluidas opcionales). `npm sbom` sobre la instalación Windows produce 461 componentes deduplicados, una tercera superficie; paquetes opcionales no instalados/deduplicación explican que no coincida con todo el lock.

SBOMs del código emitido: **13 componentes** antes/después, separados de herramientas y del lock completo. Final: Angular common/core/forms/platform-browser/router 21.2.25, STOMP 7.4.0, SockJS 1.6.1, RxJS 7.8.2, tslib 2.8.1, inherits 2.0.4, querystringify 2.2.0, requires-port 1.0.0, url-parse 1.5.10. No Angular SSR/servidor Node observado. Compiler aporta código al build AOT y debe evaluarse aun si no se emite en navegador. El SBOM de bundle registra bytes emitidos; su hash de integridad pertenece al paquete de origen, **no** al bundle. [artifact-hashes.json](t09/artifact-hashes.json) registra los archivos compilados reales.

Al regenerar el lock se resolvieron versiones permitidas por los selectores existentes; no se afirma que sólo cambiaran los cuatro paquetes editados. La matriz/inventario explicitan transitivas y herramientas. STOMP 7.4.0 es un [release estable](https://github.com/stomp-js/stompjs/releases/tag/v7.4.0) de la misma línea; el [changelog](https://github.com/stomp-js/stompjs/blob/develop/Change-log.md) incluye corrección de estado activate/deactivate, pertinente a reconexión T03. Por ello se revalida la reconciliación integrada, no sólo el build. [STOMP](https://github.com/stomp-js/stompjs/security/advisories) y [SockJS](https://github.com/sockjs/sockjs-client/security/advisories) no publicaban avisos coincidentes; ausencia de avisos publicados no demuestra inocuidad del protocolo o transporte.

## Matriz de avisos y uso de herramientas de desarrollo

[npm-advisories.csv](t09/npm-advisories.csv) conserva **124 pares componente/aviso, 111 avisos distintos** de OSV inicial, con alias, severidad/CVSS, rangos/fixes, selectores/versiones, ruta de dependencia y aplicación o incertidumbre por superficie. Todos los GHSA reportados directamente por npm audit inicial están incluidos; las metavulnerabilidades transitivas de npm no se cuentan como nuevos CVE. No se omiten devDependencies.

| Familia / avisos representativos | Exposición observada y decisión |
|---|---|
| Angular core/compiler: [GHSA-hh8m-fm6v-7cvg / CVE-2026-88057](https://github.com/angular/angular/security/advisories/GHSA-hh8m-fm6v-7cvg), GHSA-f3m7-gqxr-g87x, GHSA-692r-grfm-v8x7, GHSA-58w9-8g37-x9v5, GHSA-jj27-h5hq-8x99 | XSS por sanitización/namespace/host bindings/i18n. Core se emite en navegador y compiler procesa plantillas durante build. No PoC por cada patrón; se actualiza la familia completa 21.2.25. Rangos/fixes individuales en matriz. |
| Angular common: GHSA-48r7-hpm6-gfxm / CVE-2026-54268, GHSA-p3vc-36g9-x9gr / CVE-2026-50171 | Formateo de fechas/números; datos de API pueden llegar a pipes. Precondición precisa no explotada; versión afectada 21.2.13 corregida. |
| Common HttpTransferCache: GHSA-39pv-4j6c-2g6v, GHSA-jhpw-976m-542j, GHSA-p297-fm68-3q8c, GHSA-q6f4-qqrg-jv6x; core GHSA-rgjc-h3x7-9mwg | Caché SSR/hidratación; SPA observada sin SSR ni caché transferida. No aplicabilidad demostrada al bundle actual, actualización preventiva sin suppression; revisar si se introduce SSR. |
| Router GHSA-ff3f-86qr-9cv3 / CVE-2026-101896 | DoS de SSR; no servidor Angular SSR presente. Parche 21.2.25 y navegación/ventanas revalidadas. |
| Piscina GHSA-x9g3-xrwr-cwfg, GHSA-67c8-pqhq-4rmx | RCE/prototype pollution de opciones del pool usado por build. No emitido; puede ejecutar con permisos de CI/desarrollador. Resolución actualizada por Angular build, no descartada por ser dev. |
| Tar GHSA-23hp-3jrh-7fpw, GHSA-8x88-c5mf-7j5w, GHSA-gvwx-54wh-qm9j, GHSA-r292-9mhp-454m, GHSA-vmf3-w455-68vh, GHSA-w8wr-v893-vjvp | Archivos instalados/manipulados, construcción y CLI; disponibilidad y parsing. Rango/fix por aviso, resueltos al regenerar lock. |
| Vite GHSA-fx2h-pf6j-xcff / CVE-2026-53571, GHSA-v6wh-96g9-6wx3 / CVE-2026-53632 | Devserver Windows: lectura de archivos y rutas UNC/NTLM. Usado por tooling; no se considera inofensivo por no estar en bundle. Lock corregido; no exponer devserver a red no confiable. |
| Vitest GHSA-82fw-gwwq-j7x9 / CVE-2026-84373 | Mock redirects/lectura de archivos durante tests; pasa 4.1.6→4.1.11, junto a paquetes de familia resueltos. No servidor de tests público. |
| MCP SDK GHSA-6qxp-vccf-f47h / CVE-2026-104850 | CLI herramienta auxiliar podría contactar un servidor MCP/OAuth externo. No se ejecutó tal servicio ni se conectaron cuentas; transitive corregida, no exención automática. |

Las fuentes por fila son OSV/GitHub Advisory Database y los avisos enlazados del proyecto cuando están disponibles. La fecha/modificación del feed está conservada. Reintentos de la página específica Angular GHSA-hh8m-fm6v-7cvg devolvieron timeout; npm/OSV aportan identificación/rangos, no se afirma que todo texto primario fuera accesible. La matriz distingue incertidumbre de exploit de la corrección por versión.

## Instalación, SBOM y comandos reproducibles

La primera instalación estándar del lock original falló: inconsistencia de `@emnapi/wasi-threads` 1.2.2/1.2.3. Un primer intento de actualizar juntos los paquetes falló por ERESOLVE; no se forzó. Se editaron las versiones directas coordinadas, se conservó el lock original como evidencia local y **npm regeneró** el nuevo lock mediante `npm install --package-lock-only --ignore-scripts`. Después `npm ci` normal, scripts habilitados, terminó correctamente: 483 paquetes añadidos y cero vulnerabilidades en su consulta de registry.

Para poder inspeccionar un bundle de la base se hizo una instalación **forense** con `npm ci --ignore-scripts --legacy-peer-deps` en el checkout base separado. No acredita reproducibilidad limpia de la base ni es el procedimiento final. `npm sbom --package-lock-only` sobre esa base también falló por nodos emnapi ausentes; se preservó el error y se generó el SBOM íntegro con el adaptador del lock. No se transforma ese fallo en un análisis «sin avisos».

```powershell
# Desde checkout limpio; evidencia fuera de dist para conservar builds.
npm ci
npm ls --all --json > evidence/npm-ls.json
npm audit --json > evidence/npm-audit.json
npm sbom --sbom-format cyclonedx > evidence/npm-installed.cdx.json
python docs/seguridad/t09/inventory.py npm-lock package-lock.json evidence/npm-lock.cdx.json
npm test -- --watch=false
npm run build -- --configuration production --stats-json
npm run build -- --configuration colegio --stats-json --output-path dist/colegio
python docs/seguridad/t09/inventory.py bundle dist/chemical-lab-frontend/stats.json evidence/npm-bundle.cdx.json
osv-scanner scan source -L package-lock.json --format json --all-packages --output-file evidence/osv-npm.json
osv-scanner scan source -L evidence/npm-lock.cdx.json --format json --all-packages --output-file evidence/osv-npm-complete.json
```

Crear `evidence/` previamente. El adaptador Python estándar no instala ni ejecuta paquetes: mantiene ubicaciones duplicadas, flags dev/optional, integridad SHA-512 y relaciones resueltas por la ubicación `node_modules`; bundle usa sólo entradas con bytes emitidos. Para before repetir sobre base exacta. CycloneDX 1.6 (adaptador) y 1.5 (`npm sbom`) se validan con sus JSON Schema oficiales y referencias internas. Se normalizó el nombre de raíz al del package manifest; npm emitió un `serialNumber` enmascarado inválido `urn:uuid:***`, eliminado por ser opcional, sin modificar componentes/aristas. Se omiten metadata descriptiva redundante y rutas personales.

OSV Scanner 2.6.0: SHA-256 `e0ed7644118b717b028c249ee9d3515024e55e8510747ca08906eb96765354d6`, contrastado con [release/checksums oficiales](https://github.com/google/osv-scanner/releases/tag/v2.6.0). npm 11.6.2 y Node 24.13.0 observados sólo localmente. `SHA256SUMS`, `artifact-hashes.json`, SBOMs y matriz son versionados; reportes OSV íntegros, npm ls/audit, stats y logs voluminosos quedan localmente en `.codex-work/t09-evidence/`. No se publican tokens, credenciales reales, JSON de fixture ni rutas del perfil. El probe contiene sólo la contraseña sintética del test como guardia para rechazar una fixture ajena.

## Resultados y SHA probado

| Análisis | Antes | Después | Lectura correcta |
|---|---:|---:|---|
| npm audit paquetes afectados | 37: 3 critical, 21 high, 10 moderate, 3 low | 0 | Incluye build/tests/CLI; no son 37 CVE únicos |
| OSV lock, avisos únicos | 111 | 0 | Paquetes reconocidos 567→566; no toda la imagen |
| OSV pares componente/aviso | 124 | 0 | Puede haber varias versiones/componentes por aviso |
| OSV componentes emitidos | No se usa como sustituto del lock base | 0 avisos / 13 componentes | Escaneo adicional del SBOM de bundle |
| Componentes lock / emitidos | 586 / 13 | 588 / 13 | No confundir tooling con navegador |

SHA de implementación probado: **`bde5597ff42117bbfc5a04f896cec15890173193`**. [validation.json](t09/validation.json) registra suite/builds, backend compañero probado y hashes. Los commits siguientes sólo agregan documentación/adaptador/evidencia, con manifests y aplicación idénticos.

Primera suite sin fixture live: 156 passed, 2 skipped, 158 definidos; no se presenta como 158 ejecutados. La suite final integrada usa el JSON ficticio de `WhiteboardBrowserFixture` del backend, limitado a `http://127.0.0.1:18087`, PostgreSQL dedicado y usuarios sintéticos; el frontend lee **el contenido JSON** desde `T03_LIVE_FIXTURE`, no una ruta. Así revalida los dos casos teacher/student de ACK, interleaving y estado persistido. El resultado exacto final se registra separado; no se suman parciales.

Resultado integrado: **158 passed, 0 skipped, 12 archivos passed**, backend compañero `39266dfa8a0e7b9d45a7c5f3d9c39ba11319b315` (POM/runtime final; cambio backend posterior sólo amplía el test JDBC). [stomp-probe.mjs](t09/stomp-probe.mjs) se ejecutó además con el cliente ESM **real** 7.4.0: dos ciclos de conexión, SUBSCRIBE, SEND/ACK y deactivate/estado INACTIVE. Se reproduce con `node docs/seguridad/t09/stomp-probe.mjs <JSON_DE_FIXTURE_LOCAL>` mientras la fixture está activa. Un intento inicial usó una ruta inexistente y falló; se corrigió al endpoint observado `/ws/websocket`, sin cambiar autorización del backend. No cuenta como prueba pasada el intento fallido ni se suman los dos ciclos a las 158 pruebas.

Para reproducir la integración, iniciar en un terminal del checkout backend la fixture opt-in sobre PostgreSQL desechable. Crear antes `evidence/`; los dos archivos de fixture/stop deben tener nombres nuevos, y nunca versionarse:

```powershell
./mvnw.cmd test '-Dtest=WhiteboardBrowserFixture' '-Dspring.profiles.active=test' '-Dspring.datasource.url=jdbc:postgresql://127.0.0.1:<PUERTO>/chemicallab_t01_test' '-Dspring.datasource.username=<USUARIO_FICTICIO>' '-Dspring.datasource.password=<CLAVE_FICTICIA>' '-Dt03.fixture-file=evidence/t03-fixture.json' '-Dt03.stop-file=evidence/t03-stop'
```

Una vez creado el JSON, ejecutar en otro terminal desde el frontend, reemplazando la ruta por la del checkout backend:

```powershell
$env:T03_LIVE_FIXTURE = Get-Content -LiteralPath '<CHECKOUT_BACKEND>/evidence/t03-fixture.json' -Raw
npm test -- --watch=false
node docs/seguridad/t09/stomp-probe.mjs '<CHECKOUT_BACKEND>/evidence/t03-fixture.json'
Remove-Item Env:T03_LIVE_FIXTURE
New-Item -ItemType File -Path '<CHECKOUT_BACKEND>/evidence/t03-stop'
```

La fixture restringe la DB a loopback y `chemicallab_t01_test`, sirve sólo en 127.0.0.1:18087 y borra su esquema al recibir el archivo stop o expirar. Esperar su `BUILD SUCCESS` antes de detener el clúster desechable.

Builds `production` y `colegio` correctos con Angular 21.2.25/CLI 21.2.26. Persisten warnings preexistentes de presupuesto de tamaño/SCSS, polyfills fuera del chequeo TS y compatibilidad futura de `vi.hoisted/mock`; no se ampliaron presupuestos ni se ocultaron warnings. Pruebas frontend cubren login/cambio de contraseña, servicios y componentes de pizarra/reconciliación, evaluaciones/ventanas y comportamiento del cliente. El backend ejecuta su suite completa PostgreSQL y validadores desde JAR, no se atribuyen esas pruebas a este repositorio.

## Pendientes y límites

**Cero npm/OSV no acredita ausencia de vulnerabilidades.** Feed npm y OSV respondieron; no análisis de cada exploit, navegador del despliegue, CDN remoto, imagen o sistema operativo. Variantes opcionales no instaladas se mantienen en el SBOM completo y se escanean aparte. `stats.json` muestra código emitido, no que cada API vulnerable sea alcanzable. No se ejecutó SAST ni pruebas Selenium completas; los 16 archivos originales se conservaron sin ejecutarse.

**Node local/CI:** 24.13.0 precede [fixes de junio de 2026](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases) y [julio](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases), que entrega 24.18.1. Avisos HIGH de HTTP/2 (CVE-2026-56846/56848) y permission model (CVE-2026-58043), además de TLS session (CVE-2026-58040), requieren evaluar el builder/servidores locales. La SPA no empaqueta Node; no se atribuye ese runtime al navegador ni a producción. Pendiente usar un Node 24 LTS parcheado vigente y repetir instalación/tests/builds en CI; no se actualizó software productivo ni se certificó inventario integral de npm CLI/globales.

**Backend/imágenes:** JDK 17.0.12 local antiguo; tags Docker Temurin mutables, daemon no disponible, digest/OS/JRE reales sin verificar. Jetty 9.4.58 del `maven-site-plugin` mantiene cuatro findings OSV y otro oficial HIGH ausente del feed; no está en el JAR. No habilitar `site:run` antes de una decisión y corrección compatible; esta PR no los acepta. PostgreSQL/TLS real no inspeccionado. Son pendientes del cierre global VER-01 aunque el lock frontend quede corregido.

Revisar avisos en cada cambio de lock, de runtime/imagen o al introducir SSR/MCP/devserver expuesto. Integrar ambas PRs sólo tras revisión coordinada; enlaces entregados en sus descripciones. No se mezcló trabajo T10 ni se modificaron notas previas: 5 frontend y 12 backend verificadas contra bases, y 22 hashes del snapshot anterior (16 e2e incluidos).

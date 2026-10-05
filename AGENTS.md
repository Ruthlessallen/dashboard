# AGENTS.md — guía para agentes de IA que trabajen en este repo

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Panel personal en local (Next.js 16 + SQLite nativo + un scraper de ofertas en Python). Este documento explica cómo funciona todo, qué no se puede romper y **qué hay que preguntarle a la persona usuaria antes de ejecutar el scraper**.

## 0. Reglas que no se negocian

1. **Antes de ejecutar el scraper, pregunta** (sección 5): ofertas clave, ubicación, nivel, empresas, titulación y cómo quiere puntuar. No lo lances con valores por defecto sin decirlo.
2. **La puntuación de las ofertas es subjetiva** para la persona usuaria. No la presentes como objetiva ni la "mejores" por tu cuenta: propón variantes, enséñalas con ofertas reales y deja que elija (sección 6).
3. **Abrir `/` en el navegador lanza el scraper** si existe `scraper/` (lo hace `components/Dashboard.jsx` al montar). Al probar la interfaz usa `JOBS_SCRAPER_DIR` apuntando a una ruta que no exista (sección 7).
4. **Nunca subas datos personales** (sección 8) ni metas el municipio de casa, nombres o rutas locales en el código. Todo eso va en variables de entorno o en `scraper/config.json`.
5. **El scraper no usa login, cookies ni claves, y así debe seguir.** No subas el volumen de peticiones ni quites las pausas (sección 4.1).
6. **Next 16 no es el Next que conoces**: lee la guía en `node_modules/next/dist/docs/` antes de tocar rutas, páginas o configuración.
7. **Al terminar, cierra tu servidor de desarrollo.** Ocupa el puerto 3111 y la persona usuaria arranca el suyo con `dashboard-start.bat` (o con el acceso directo del Escritorio que crea `scripts/crear-acceso-directo.ps1`).

## 1. Qué es

Un dashboard de una sola pantalla con: agenda (Google Calendar), checklists, noticias (RSS + Hacker News), correo (Gmail) y **Postulaciones**; más una página `/empleos` con las ofertas que recoge el scraper. Todo el estado vive en local: SQLite en `data/dashboard.db` y los CSV.

Stack: JavaScript/JSX (sin TypeScript, sin librerías de UI, CSS plano en `app/globals.css`), Node 24+ (`node:sqlite`), `googleapis`, `rss-parser`. Scraper: Python 3.10+ con `requests` y `beautifulsoup4`.

## 2. Puesta en marcha y variables

```bash
npm install
npm run setup   # crea .env.local, scraper/config.json y los CSV si faltan; instala dependencias de Python
npm run dev     # http://localhost:3111 (predev ejecuta setup en modo silencioso)
```

`scripts/setup.mjs` es idempotente: nunca pisa nada que ya exista.

Variables (`.env.local`, plantilla en `.env.local.example`; todas opcionales salvo las de Google si se quiere Gmail/Calendar):

| Variable | Para qué |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | OAuth de Gmail y Calendar (solo lectura) |
| `JOBS_HOME_TOWN` | Municipio de casa: puntúa la cercanía en `/empleos` y se suma a `zonas_aceptadas` del scraper |
| `JOBS_SCRAPER_DIR` | Carpeta del scraper (por defecto `./scraper`) |
| `JOBS_CSV_PATH` | CSV de ofertas (por defecto `<scraper>/ofertas_encontradas.csv`) |
| `JOBS_REFRESH_HOURS` | Horas mínimas entre ejecuciones automáticas (12) |
| `PYTHON_BIN` | Intérprete (`python` en Windows, `python3` en el resto) |
| `POSTULACIONES_CSV_PATH` | CSV de postulaciones (por defecto `data/postulaciones.csv`) |

## 3. Mapa del repo

```
app/page.jsx, app/empleos/page.jsx     páginas (/ y /empleos)
app/api/                                rutas: auth, gmail, calendar, news, checklists, items, events,
                                        empleos (+ /actualizar, /estado), postulaciones (+ /estado)
components/                             Dashboard (rejilla de 5 columnas redimensionables), Postulaciones,
                                        Empleos, Checklists, News, Google (Agenda y Correo), util.js
lib/db.js                               SQLite (esquema, migraciones sencillas, reinicio de la lista diaria)
lib/empleos.js                          CSV del scraper -> ofertas puntuadas y filtradas
lib/postulaciones.js                    CSV de postulaciones + marcadas en /empleos + mis decisiones
lib/scraper-runner.js                   lanza el scraper en segundo plano con límites
lib/google.js, feeds.js, news.js        Google, fuentes RSS, agregador
scraper/                                scraper de ofertas (Python) y su configuración
scripts/setup.mjs                       preparación del entorno
data/                                   dashboard.db y postulaciones.csv (local, no se sube)
```

## 4. Cómo funciona el sistema de ofertas y postulaciones

```
scraper (Python) --> scraper/ofertas_encontradas.csv --> lib/empleos.js --> /api/empleos --> /empleos
        ^                                                                       |  "Ya apliqué"
        | lib/scraper-runner.js  <-- POST /api/empleos/actualizar               v
        |    (al abrir "/" y botón)                                     tabla empleo_estado
                                                                                |
data/postulaciones.csv ---------------------------------> lib/postulaciones.js <+--> tabla postulacion_estado
                                                                |
                                                        /api/postulaciones --> tarjeta Postulaciones
```

### 4.1 Scraper (`scraper/`)

- Punto de entrada: `ejecutar_todos_colectores.py` (Tecnoempleo + LinkedIn). `ejecutar_busquedas.py` hace las búsquedas de LinkedIn y escribe el CSV; `colector_tecnoempleo.py` recorre las categorías; `linkedin_scraper_avanzado.py` tiene peticiones, filtros y su propia puntuación (`puntuacion_encaje`, que **el dashboard ignora a propósito**); `config.py` carga `config.json` (o `config.example.json`).
- **Sin login ni cookies:** LinkedIn por su API pública de invitados (`jobs-guest/.../seeMoreJobPostings/search` y `.../jobPosting/{id}`) y Tecnoempleo por páginas abiertas.
- **Ritmo deliberadamente lento:** pausas de 6-12 s entre ofertas, 8-15 s entre páginas, 12-25 s entre búsquedas, 3-6 s por oferta en Tecnoempleo; ante 429/403 espera `45 s × intento` y reintenta. Una pasada completa con muchas ofertas nuevas tarda **más de una hora de reloj**; si el PC se duerme, el proceso se queda parado y continúa al despertar. Las siguientes pasadas son más cortas porque deduplican por `job_id`.
- Escribe el CSV fila a fila (`job_id, fecha_escaneo, busqueda_origen, titulo, empresa, ubicacion, modalidad, experiencia_requerida, solicitantes, url, fecha_relativa, puntuacion_encaje, tecnologias, resumen_descripcion`). `inicializar_csv()` lo crea con cabecera si falta. La descripción se guarda completa.
- Configuración en `scraper/config.json` (no se sube; el ejemplo genérico es `config.example.json`): `ubicacion`, `zonas_aceptadas`, `busquedas`, `tecnoempleo_categorias`, `empresas_excluidas`, `palabras_descarte_titulo`, `stack_deseado`.
- Otras herramientas (p. ej. Antigravity) también editan `scraper/`: mira `git diff` antes de asumir cómo está el código.

### 4.2 Lanzador (`lib/scraper-runner.js`)

- `startScraper()` lanza `python ejecutar_todos_colectores.py` con `cwd = scraper/`, UTF-8 forzado, salida a `scraper/ultima_ejecucion.log` y estado en `scraper/estado.json` (`startedAt, pid, finishedAt, exitCode, rateLimited`).
- Límites: nunca dos a la vez (comprueba el `pid`); automático como mucho cada `JOBS_REFRESH_HOURS` (12 h); si el log contiene `RATE-LIMIT`, espera 24 h; tras un fallo, 3 h; el botón "Actualizar ahora" exige 30 min desde la última ejecución.
- Si lo ejecutas tú a mano, no queda en `estado.json` y el dashboard podría lanzar otra pasada al abrirse. Prefiere `POST /api/empleos/actualizar` con `{"force": true}`.

### 4.3 `/empleos` (`lib/empleos.js`, `components/Empleos.jsx`)

Lee el CSV (cacheado por fecha de modificación), procesa cada fila (`processRow`) y devuelve ofertas con `score`, `breakdown`, `checks` (semáforo por criterio: rol, nivel, zona, fecha, competencia), `flags` y `excludedReason`. Las descartadas automáticamente no se borran: se ven con el interruptor "Mostrar las filtradas automáticamente". Orden de descarte: senior/semi/responsable en el título → reservada a personas con discapacidad → pide ≥3 años (o "2+") → pide titulación no relacionada con informática/datos → rol que no es data/IA/backend/software → publicada hace más de 6 meses.

- Experiencia: en un rango cuenta el **tope** ("2 a 3 años" → 3); se ignoran cifras >10 y frases sobre la historia de la empresa.
- Titulación: `RE_UNREL` (matemáticas, física, ADE, economía, marketing…) frente a `RE_REL` (informática, datos, IA…) dentro de ventanas que empiezan por "grado/degree/licenciatura/máster…". Con descripciones completas puede haber falsos positivos: la página muestra el motivo para que se revisen.
- Cercanía: distancia en línea recta desde `JOBS_HOME_TOWN` usando las coordenadas aproximadas de `PLACES` (~50 municipios; si falta uno, se puntúa neutro: añádelo).
- Las filas antiguas de Tecnoempleo que solo traían el título se detectan por su contenido (`generic`) y no pasan de 70 puntos.
- "Ya apliqué" / "Borrar" guardan en `empleo_estado` (con copia de los datos de la oferta).

### 4.4 Postulaciones (`lib/postulaciones.js`, `components/Postulaciones.jsx`)

- Fuente 1: `data/postulaciones.csv` (o `POSTULACIONES_CSV_PATH`), columnas `Fecha,Empresa,Puesto,Link,Fase,Observaciones`. Las observaciones **no van entrecomilladas y llevan comas**, así que no sirve un lector CSV normal: se localiza la columna Fase por la primera observación que empieza por "Encaje", si no por una fase conocida, si no por el enlace `http`; las líneas sueltas se pegan a la anterior. Fases: `Descartado`, `No enviado`, `Pendiente`, `Enviada`.
- Fuente 2: ofertas marcadas "Ya apliqué" en `/empleos` (sin duplicar las que ya estén en el CSV por URL o id de LinkedIn).
- Mi decisión manda sobre la Fase: `postulacion_estado` guarda `active` ("Sigo adelante") o `rejected` ("Descartada") con la clave `url` o `fecha|empresa|puesto`. Las `active` se muestran aunque pasen de la ventana de días; las descartadas quedan tras un filtro. Ventana de 7/14/30 días y contador de días desde la fecha.
- Prácticas/empleo, lugar y horario se infieren del título y de las observaciones (y de `/empleos` si la oferta está allí); lo que no conste queda vacío, no se inventa.

### 4.5 SQLite (`data/dashboard.db`)

`checklists`, `items` (listas y tareas, con `position`), `kv` (tokens de Google), `dragged_events` (eventos arrastrados a la agenda), `empleo_estado` (`applied`/`dismissed` + copia JSON de la oferta), `postulacion_estado` (`active`/`rejected`). Las migraciones se hacen con `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE` condicional en `lib/db.js`.

## 5. Protocolo antes de ejecutar el scraper

**Cuándo:** la primera vez; cada vez que te pidan buscar o actualizar ofertas; antes de cambiar `scraper/config.json`; y siempre que `config.json` sea igual que `config.example.json` (valores genéricos, no los de la persona).

**Cómo:** lee primero `scraper/config.json` y `JOBS_HOME_TOWN` de `.env.local`, enséñaselos y pregunta solo lo que falte o quiera cambiar. Si no hay `config.json`, ejecuta `npm run setup` y pregunta igualmente. Usa `AskUserQuestion` si lo tienes (hasta 4 preguntas por llamada); si no, en el chat.

| Pregunta | Dónde se aplica |
|---|---|
| **Ofertas clave**: ¿qué puestos busca? ¿también prácticas o becas? ¿en español, en inglés? | `busquedas[].query` y `tecnoempleo_categorias` (cada búsqueda añade ~10-25 min de pausas: no pases de ~7) |
| **Ubicación**: ciudad de búsqueda, zonas válidas para presencial/híbrido, municipio de casa, ¿remoto, híbrido o presencial?, ¿distancia máxima razonable? | `ubicacion`, `zonas_aceptadas` (minúsculas), `JOBS_HOME_TOWN` (y `PLACES` si el municipio no está) |
| **Nivel**: máximo de años de experiencia, ¿prácticas sí o no?, palabras que descartan un título | `palabras_descarte_titulo`; umbral de años en `lib/empleos.js` (hoy ≥3, "2+") |
| **Titulación**: qué estudios tiene y cuáles no le sirven | `RE_UNREL` / `RE_REL` en `lib/empleos.js` |
| **Empresas y tecnologías**: ¿alguna que no quiera ver?, ¿qué stack le interesa? | `empresas_excluidas`, `stack_deseado` |
| **Puntuación** (ver sección 6): orden de preferencia entre roles, peso de la cercanía frente al rol, si penalizar muchos solicitantes, ¿número, semáforo o ambos?, qué le parece mal del ranking actual | constantes de `lib/empleos.js` |
| **Frecuencia y consentimiento**: ¿cada cuántas horas?, y avísale de que la primera pasada puede tardar más de una hora | `JOBS_REFRESH_HOURS` |

**Después:** escribe `scraper/config.json` (nunca `config.example.json`) y `.env.local`; resume lo que vas a lanzar y pide confirmación; entonces ejecútalo (4.2) y comunica la duración esperada y que no debe relanzarse seguido (riesgo de 429/403). Si responde "usa lo que hay", dilo explícitamente ("lanzo con la configuración actual: …").

## 6. Puntuación (subjetiva)

La persona usuaria no confía en una nota única y la considera totalmente subjetiva. Por eso cada oferta lleva además un **semáforo por criterio** (`checks`) y un desglose (`breakdown`) visible al pasar el ratón. Reglas actuales (`lib/empleos.js`), todas editables:

| Parte | Máx. | Regla |
|---|---|---|
| Rol (`ROLE_WEIGHT`) | 40 | data 40, IA 38, backend 34, software/fullstack 20, otros 5 |
| Zona (`zonePoints`) | 20 | remoto 16; modalidad sin confirmar 9; presencial: ≤6 km 20, ≤12 km 18, ≤20 km 12, ≤30 km 8, ≤50 km 4, más 0; sin distancia 6 |
| Nivel | 20 | junior/prácticas en el título 20; "associate" 12; sin indicar 8; pide hasta 2 años → tope 5 |
| Frescura (`freshnessPoints`) | 20 | ≤3 d 20, ≤7 d 17, ≤14 d 14, ≤30 d 10, ≤60 d 6, ≤120 d 3, más 0 |
| Competencia (`competitionPenalty`) | −15 | solicitantes ≤10: 0, ≤25: −3, ≤50: −7, ≤100: −11, más: −15 |

Tope de 70 para ofertas solo con título. Marca "Para graduados universitarios" en programas "graduate/new grad" (no cuentan como junior).

Si te piden cambiarla: pregunta qué no le convence, propón 2-3 variantes concretas, aplícalas y enséñale el top 10 real antes/después. No cambies pesos "porque sí".

## 7. Verificar cambios

- **Servidor sin lanzar el scraper** (Git Bash): `JOBS_SCRAPER_DIR=/ruta/inexistente npm run dev`. La primera petición a cada ruta compila y tarda unos segundos: espera antes de dar algo por roto.
- **Probar las librerías sin servidor:** `JOBS_HOME_TOWN="..." node --input-type=module -e "import { loadEmpleos } from './lib/empleos.js'; console.log(loadEmpleos().items.length)"`. Para casos concretos, escribe un CSV pequeño en una carpeta temporal y apunta `JOBS_CSV_PATH` a él (entrecomilla las descripciones con comas).
- **Interfaz:** comprueba en el navegador lo que toques (filtros, botones, persistencia tras recargar) y deja los datos como estaban: deshaz las marcas de prueba.
- **Desde cero:** copia a una carpeta temporal solo lo que se subiría (`git ls-files -co --exclude-standard`) y ejecuta `node scripts/setup.mjs`.
- Los avisos "LF will be replaced by CRLF" de git en Windows son normales.

## 8. Datos que nunca se suben

Están en `.gitignore`: `.env.local`, `scraper/config.json`, `scraper/ofertas_encontradas.*`, `scraper/estado.json`, `scraper/ultima_ejecucion.log`, `data/*.db*`, `data/postulaciones.csv`. Antes de cada commit comprueba con `git status` y busca rutas locales, el municipio de casa, correos o claves en lo que subes. El repo es público.

## 9. Limitaciones conocidas

- La descripción completa permite detectar años y titulación, pero la heurística puede fallar: revisa los motivos de descarte en `/empleos`.
- `experiencia_requerida` del scraper se queda con el mínimo de un rango ("2 a 3 años" → 2); el dashboard lo trata como dudoso.
- Google en modo "Testing" caduca el token a los 7 días (`invalid_grant`): hay que pulsar "Conectar con Google".
- Las coordenadas de `PLACES` son aproximadas y la distancia es en línea recta, no el tiempo de trayecto.
- Antes de dar por buena una fuente nueva, comprueba que el portal permite acceso público sin login.

## 10. Convenciones y flujo de trabajo

- Interfaz y mensajes de commit en español. Comentarios solo cuando el porqué no sea evidente.
- Sin dependencias nuevas ni TypeScript salvo que se pida; los estilos van en `app/globals.css`.
- Cada cambio verificado se commitea y se sube a `main` (el repo es de una sola persona). Los commits terminan con `Co-Authored-By: Claude …`.
- Si creas datos de prueba (marcas, filas, CSV), elimínalos al terminar.

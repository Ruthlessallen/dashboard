# Dashboard

Panel personal en local que unifica Gmail, Google Calendar, agregador de noticias de IA/data/web, ofertas de empleo y checklists en una sola pantalla.

![Vista del dashboard](dashboard.png)

## Motivación

Sustituye la rutina de abrir Gmail, Calendar, varias webs de noticias y una lista de tareas sueltas por un único panel local: una vista con todo lo relevante del día, sin depender de servicios de terceros para almacenar datos.

## Características

- **Gmail + Google Calendar**: lectura de correo y agenda vía OAuth2 (permisos de solo lectura, `gmail.readonly` / `calendar.readonly`).
- **Agregador de noticias**: fuentes RSS configurables por categoría (IA / data / web) + Hacker News vía la API de Algolia, filtrado por puntuación y palabras clave. Caché de 15 minutos y aviso si alguna fuente falla.
- **Ofertas de empleo**: API pública de [Manfred](https://www.getmanfred.com/) (sin configuración) + alertas de empleo de LinkedIn leídas automáticamente desde Gmail.
- **Checklists**: listas fijas (General, Diaria con reinicio automático) y listas personalizadas ilimitadas.
- **Datos 100% locales**: todo se persiste en SQLite en disco; los tokens OAuth nunca salen del equipo.

## Stack técnico

| Área | Tecnología |
|---|---|
| Framework | [Next.js](https://nextjs.org/) 16 (App Router) |
| UI | [React](https://react.dev/) 19 |
| Base de datos | SQLite vía el módulo nativo [`node:sqlite`](https://nodejs.org/api/sqlite.html) de Node 24 — sin drivers externos ni compilación nativa |
| Integraciones | [`googleapis`](https://www.npmjs.com/package/googleapis) (OAuth2, Gmail API, Calendar API), [`rss-parser`](https://www.npmjs.com/package/rss-parser), API pública de Manfred, API de Algolia (Hacker News) |
| Runtime | Node.js 24+ |

Proyecto 100% JavaScript (JSX), sin dependencias de UI de terceros: estilos con CSS plano y componentes React hechos a mano.

## Arquitectura

```
app/
  page.jsx, layout.jsx      punto de entrada (App Router)
  api/
    auth/                   flujo OAuth2 con Google
    gmail/, calendar/       lectura de Gmail y Calendar
    news/                   agregador RSS + Hacker News
    jobs/                   ofertas de InfoJobs
    checklists/, items/     CRUD de checklists

lib/
  db.js                     esquema SQLite y lógica de reinicio diario
  google.js                 OAuth2 + llamadas a Gmail y Calendar
  feeds.js                  fuentes de noticias (config declarativa)
  news.js                   agregador RSS + Hacker News, con caché
  jobs.js, linkedin-jobs.js integración de ofertas de empleo

components/                 UI en React (cliente)
```

Cada integración externa (Gmail, Calendar, noticias, empleo) vive detrás de su propia ruta de API en `app/api/`, que a su vez delega en un módulo de `lib/`. El estado de la app (checklists, tokens, caché de eventos) se guarda en una única base SQLite en `data/`.

## Arrancar en local

```bash
npm install
npm run dev
```

Se abre en <http://localhost:3111>. Sin configurar nada, ya funcionan las noticias y las checklists.

## Configurar integraciones (opcional)

Copia la plantilla de variables de entorno:

```bash
cp .env.local.example .env.local
```

### Gmail y Calendar (Google OAuth)

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto.
2. **APIs y servicios → Biblioteca**: habilita **Gmail API** y **Google Calendar API**.
3. **Pantalla de consentimiento OAuth**: tipo *Externo*, rellena nombre y correo. Añade tu correo en **Usuarios de prueba**.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → *Aplicación web*. En **URIs de redirección autorizados**:
   ```
   http://localhost:3111/api/auth/google/callback
   ```
5. Copia el *Client ID* y *Client secret* a `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3111/api/auth/google/callback
   ```
6. Reinicia `npm run dev` y pulsa **Conectar Google**.

Los permisos son solo de lectura: el dashboard no puede enviar correo ni modificar la agenda.

### Ofertas de empleo

Manfred funciona sin configurar nada (API pública). Para LinkedIn, crea alertas de empleo en LinkedIn (**Mis empleos → Alertas de empleo**) con frecuencia diaria o al momento: el dashboard lee esos correos directamente de tu Gmail ya conectado y extrae las ofertas.

### Fuentes de noticias

Se editan en [`lib/feeds.js`](lib/feeds.js): una entrada por fuente (`id`, `name`, `cat`: `ia` / `data` / `web`, URL del RSS). `enabled: false` la desactiva sin borrarla.

Hacker News no usa RSS: se consulta la API de Algolia filtrando por puntuación mínima y palabras clave, configurables al final del mismo fichero.

## Seguridad y privacidad

- Ninguna credencial está hardcodeada: todas se leen de variables de entorno (`.env.local`, excluido de git).
- Los tokens OAuth de Google se guardan en la base SQLite local (no sale del equipo, pero no está cifrada) y nunca se envían a ningún servidor externo.
- Los permisos solicitados a Google son de solo lectura.

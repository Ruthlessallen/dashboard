# Setup: Google y ofertas de empleo

## 1. Google OAuth (Gmail + Calendar)

Es el único paso manual. Una vez hecho, se autoguarda.

### Crear credenciales de Google

1. Entra en <https://console.cloud.google.com/> y crea un **proyecto nuevo**.
2. **APIs y servicios → Biblioteca**:
   - Habilita **Gmail API**
   - Habilita **Google Calendar API**
3. **Pantalla de consentimiento OAuth**:
   - Tipo: *Externo*
   - Nombre de la app: `Ruth Dashboard`
   - Email: `ruth.lopez.pellicer@gmail.com`
   - En **Usuarios de prueba** añade tu correo.
4. **Credenciales → Crear → ID de cliente OAuth → Aplicación web**
   - En **URIs de redirección** pon exactamente:
     ```
     http://localhost:3111/api/auth/google/callback
     ```
   - Copia el **Client ID** y **Client Secret** a `.env.local`:
     ```
     GOOGLE_CLIENT_ID=...
     GOOGLE_CLIENT_SECRET=...
     GOOGLE_REDIRECT_URI=http://localhost:3111/api/auth/google/callback
     ```
5. Reinicia `npm run dev` y pulsa **Conectar Google** en el dashboard.

**Los permisos**: Gmail solo lectura; Calendar puede leer, crear y borrar eventos (los que añades desde el dashboard). El token se guarda en tu SQLite local, no sale del ordenador.

---

## 2. Ofertas de empleo

Las gestiona el scraper de `scraper/` (sin login ni credenciales). Ver [scraper/README.md](scraper/README.md).

---

## Si algo falla

- `npm run dev` sin salida: error al compilar. Mira `stderr`.
- Gmail sin conectar: ejecuta `npm run setup` para crear `.env.local` y rellénalo.
- Gmail da `invalid_grant`: el token ha caducado; pulsa **Conectar con Google**.
- El scraper no arranca: comprueba que Python está instalado (`PYTHON_BIN` en `.env.local` si no se llama `python`) y ejecuta `npm run setup`.

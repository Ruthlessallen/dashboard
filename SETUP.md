# Setup: Google + Ofertas de empleo

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

**Los permisos**: solo lectura. El token se guarda en tu SQLite local, no sale del ordenador.

---

## 2. InfoJobs (Ofertas junior)

Los permisos te los dan instantáneamente.

1. Entra en <https://www.infojobs.net/api/dev>
2. **Registra una aplicación**:
   - Nombre: `Ruth Dashboard`
   - Sitio web: `http://localhost:3111`
3. Copia tu **API Key** a `.env.local`:
   ```
   INFOJOBS_API_KEY=...
   ```
4. Reinicia. El panel de ofertas cargará al instante.

---

## 3. LinkedIn → Gmail (Lo que tienes que leer)

Esta es la vía **sin riesgo** para no perder ofertas de LinkedIn:

1. En LinkedIn, abre **Mis empleos → Alertas de empleo**
2. Crea dos alertas:
   - "Desarrollador junior" en Barcelona
   - "Data junior" en Barcelona
   (O lo que se ajuste a tu búsqueda)
3. La frecuencia: **diaria** o **al momento** — LinkedIn te las envía por correo
4. **Gmail las recoge automáticamente** (ya estás conectado)
5. El dashboard leería esos correos y te sacaría un panel

Eso es future, ahora solo existe la infraestructura para conectar Gmail.

---

## Cronograma sugerido

**Hoy**: 
- Google OAuth (10 min)
- InfoJobs (2 min)

**En una semana** (cuando LinkedIn te haya mandado al menos 5 ofertas):
- Parsear el correo de alertas de LinkedIn y convertirlo en panel

---

## Si algo falla

- `npm run dev` sin salida: error al compilar. Mira `stderr`.
- Ofertas vacías: revisa que `.env.local` tenga la clave de InfoJobs.
- Gmail sin conectar: copia `.env.local.example` a `.env.local` si no lo has hecho.

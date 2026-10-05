# Scraper de ofertas

Recoge ofertas junior de **LinkedIn** y **Tecnoempleo**, las filtra con tus criterios y las guarda en `ofertas_encontradas.csv`, que el dashboard muestra en `/empleos`.

## Qué necesita

- Python 3.10+ y `pip install -r requirements.txt`
- **Ningún login, cookie, token ni API key.** Usa las páginas públicas de los portales (en LinkedIn, su API pública de invitados).

## Configurarlo

```bash
cp config.example.json config.json   # y edita config.json con lo tuyo
```

`config.json` (no se sube a git) define:

| Clave | Para qué |
|---|---|
| `ubicacion` | Lugar de las búsquedas en LinkedIn |
| `zonas_aceptadas` | Textos que dan por válida una oferta presencial/híbrida (en minúsculas) |
| `busquedas` | Lista de búsquedas de LinkedIn (`query`, `filtro_cand`) |
| `tecnoempleo_categorias` | Categorías de Tecnoempleo a recorrer (`python`, `data-analyst`…) |
| `empresas_excluidas` | Empresas que descartas |
| `palabras_descarte_titulo` | Palabras en el título que descartan la oferta (senior, lead…) |
| `stack_deseado` | Tecnologías que se buscan en la descripción |

Opcional: la variable de entorno `JOBS_HOME_TOWN` añade tu municipio a las zonas aceptadas.

## Ejecutarlo

```bash
python ejecutar_todos_colectores.py
```

Tarda entre 20 y 40 minutos: hace pausas largas a propósito entre peticiones. Si un portal responde 429/403 espera y reintenta con más margen; no insistas lanzándolo varias veces seguidas.

Si arrancas el dashboard (`npm run dev`), **lo lanza solo en segundo plano al abrirlo**: como mucho cada 12 h, nunca dos a la vez y con espera de 24 h si un portal limita las peticiones. Estado y log en `estado.json` y `ultima_ejecucion.log`.

## Ofertas que no deben volver

El dashboard escribe `ofertas_ignoradas.json` justo antes de lanzar el scraper con las ofertas que ya has aplicado o borrado y las de tu CSV de postulaciones. El scraper las salta antes de pedir su detalle (menos peticiones, menos riesgo de bloqueo). Se reconocen por un identificador sacado del enlace (`clave_oferta.py`), así que da igual que el enlace tenga otra forma. Si lo ejecutas a mano se usa la última lista escrita.

## Archivos

- `ejecutar_todos_colectores.py`: punto de entrada (Tecnoempleo + LinkedIn)
- `ejecutar_busquedas.py`: búsquedas de LinkedIn y escritura del CSV
- `colector_tecnoempleo.py`: recorrido de Tecnoempleo
- `linkedin_scraper_avanzado.py`: peticiones, filtros y puntuación del scraper
- `config.py`: carga `config.json` (o el ejemplo)
- `clave_oferta.py`, `ignoradas.py`: identificador de oferta y lista de ofertas ignoradas

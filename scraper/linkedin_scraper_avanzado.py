import requests
from bs4 import BeautifulSoup
import re
import urllib.parse
import time
import random
import json
import os
from config import CONFIG

# ROTACIÓN DE USER-AGENTS REALES Y CABECERAS DE NAVEGADOR COMPLETA
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
]

def obtener_headers_organicos():
    """
    Genera cabeceras HTTP completas simulando la navegación orgánica de un usuario real.
    
    Retorna:
    - dict: Cabeceras HTTP reales con User-Agent y huella Sec-Ch-Ua
    """
    ua = random.choice(USER_AGENTS)
    return {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.linkedin.com/jobs/search/',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    }

def pausa_organica_profunda(min_sec=6.0, max_sec=12.0):
    """
    Pausa ultra-segura de baja frecuencia que imita el ritmo de lectura de una persona real.
    
    Parámetros:
    - min_sec (float): Mínimo de segundos de espera (default 6.0s)
    - max_sec (float): Máximo de segundos de espera (default 12.0s)
    """
    espera = random.uniform(min_sec, max_sec) + random.uniform(0.5, 2.5)
    time.sleep(espera)

def solicitud_resiliente_linkedin(url, intentos_max=3):
    """
    Realiza peticiones HTTP con control de tasa y respaldo exponencial (Exponential Backoff).
    Si recibe un código 429 (Too Many Requests) o 403, descansa y reintenta de forma segura.
    
    Parámetros:
    - url (str): Enlace objetivo
    - intentos_max (int): Número máximo de intentos antes de desistir
    
    Retorna:
    - requests.Response o None
    """
    for intento in range(1, intentos_max + 1):
        headers = obtener_headers_organicos()
        try:
            res = requests.get(url, headers=headers, timeout=12)
            if res.status_code == 200:
                return res
            elif res.status_code in [429, 403]:
                espera_backoff = (intento * 45) + random.uniform(5, 15)
                print(f"   [ALERTA RATE-LIMIT {res.status_code}] Pausa de seguridad de {round(espera_backoff)}s para proteger IP...")
                time.sleep(espera_backoff)
            else:
                print(f"   [AVISO HTTP {res.status_code}] Petición a {url[:40]}...")
                time.sleep(3)
        except Exception as e:
            print(f"   [ERROR CONEXIÓN] Intento {intento}/{intentos_max}: {e}")
            time.sleep(5)
    return None

# EMPRESAS PROHIBIDAS / DESCONSEJADAS
EMPRESAS_PROHIBIDAS = [e.lower() for e in CONFIG['empresas_excluidas']]

# PALABRAS DE DESCARTE (SENIORITY & PUESTOS EXCLUIDOS)
PALABRAS_DESCARTE_TITULO = [p.lower() for p in CONFIG['palabras_descarte_titulo']]

# STACK CLAVE DETECTABLE
STACK_DESEADO = CONFIG['stack_deseado']

# Zonas aceptadas para ofertas presenciales/híbridas (+ JOBS_HOME_TOWN si está definida)
ZONAS_ACEPTADAS = [z.lower() for z in CONFIG['zonas_aceptadas']]
if os.environ.get('JOBS_HOME_TOWN', '').strip():
    ZONAS_ACEPTADAS.append(os.environ['JOBS_HOME_TOWN'].strip().lower())

def obtener_lista_ofertas_linkedin_paginado(busqueda, ubicacion=CONFIG['ubicacion'], paginas_max=6):
    """
    Obtiene ofertas públicas de LinkedIn recorriendo múltiples páginas de resultados (start=0, 10, 20...).
    El endpoint guest de LinkedIn entrega 10 ofertas por página, por lo que el incremento es de 10 en 10.
    
    Parámetros:
    - busqueda (str): Término de búsqueda
    - ubicacion (str): Ubicación geográfica
    - paginas_max (int): Número máximo de páginas de 10 resultados a consultar (default 6 = hasta 60 ofertas)
    
    Retorna:
    - list[dict]: Lista acumulada de vacantes públicas
    """
    ofertas_totales = []
    ids_vistos = set()
    
    for pag in range(paginas_max):
        start = pag * 10
        busqueda_encoded = urllib.parse.quote(busqueda)
        ubicacion_encoded = urllib.parse.quote(ubicacion)
        url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={busqueda_encoded}&location={ubicacion_encoded}&start={start}"
        
        response = solicitud_resiliente_linkedin(url)
        if not response or response.status_code != 200:
            break
        
        soup = BeautifulSoup(response.text, 'html.parser')
        job_cards = soup.find_all('li')
        if not job_cards:
            break
            
        nuevas_en_pagina = 0
        for card in job_cards:
            job_entity = card.find('div', class_=re.compile(r'base-card'))
            if not job_entity:
                continue
            
            urn = job_entity.get('data-entity-urn', '')
            job_id = urn.split(':')[-1] if urn else None
            
            if not job_id or job_id in ids_vistos:
                continue
                
            ids_vistos.add(job_id)
            
            title_tag = card.find('h3', class_=re.compile(r'base-search-card__title'))
            title = title_tag.get_text(strip=True) if title_tag else "Sin título"
            
            link_tag = card.find('a', class_=re.compile(r'base-card__full-link'))
            link = link_tag.get('href', '').split('?')[0] if link_tag else ""
            
            company_tag = card.find('h4', class_=re.compile(r'base-search-card__subtitle'))
            company = company_tag.get_text(strip=True) if company_tag else "Desconocida"
            
            location_tag = card.find('span', class_=re.compile(r'job-search-card__location'))
            location = location_tag.get_text(strip=True) if location_tag else ""
            
            time_tag = card.find('time')
            fecha_relativa = time_tag.get_text(strip=True) if time_tag else ""
            
            ofertas_totales.append({
                'job_id': job_id,
                'titulo': title,
                'empresa': company,
                'ubicacion': location,
                'fecha_relativa': fecha_relativa,
                'url': link or f"https://www.linkedin.com/jobs/view/{job_id}"
            })
            nuevas_en_pagina += 1
            
        if nuevas_en_pagina == 0:
            break
            
        pausa_organica_profunda(min_sec=8.0, max_sec=15.0)
        
    return ofertas_totales

def extraer_numero_solicitantes(soup, html_text):
    """
    Extrae el número de inscritos/solicitantes de una oferta a partir del árbol BeautifulSoup y del texto HTML.
    
    Retorna:
    - str: Conteos reales como 'Más de 100 solicitantes', 'Menos de 25 solicitantes', '158 inscritos', etc.
    """
    if not html_text and not soup:
        return "No especificado"
        
    # Patrón 1: Búsqueda directa por clase HTML de LinkedIn (num-applicants)
    if soup:
        num_app_elem = soup.find(class_=re.compile(r'num-applicants'))
        if num_app_elem:
            txt = num_app_elem.get_text(strip=True)
            if txt:
                if 'first' in txt.lower() or 'primeros' in txt.lower():
                    return "Menos de 25 solicitantes"
                elif 'over' in txt.lower() or 'más de' in txt.lower():
                    m = re.search(r'\d+', txt)
                    return f"Más de {m.group(0)} solicitantes" if m else txt
                return txt

    # Patrón 2: Tecnoempleo (CVs inscritos en el proceso: 158)
    if html_text:
        tec_match = re.search(r'CVs?\s*inscritos\s*en\s*el\s*proceso:\s*(\d+)', html_text, re.IGNORECASE)
        if tec_match:
            return f"{tec_match.group(1)} inscritos"
            
        # Patrón 3: LinkedIn Regex (Over 100 applicants / Be among the first 25 applicants)
        over_match = re.search(r'(?:Over|Más de)\s*(\d+)\s*(?:applicants|solicitantes|candidatos|inscritos)', html_text, re.IGNORECASE)
        if over_match:
            return f"Más de {over_match.group(1)} solicitantes"
            
        first_match = re.search(r'(?:first|primeros)\s*(\d+)\s*(?:applicants|solicitantes|candidatos)', html_text, re.IGNORECASE)
        if first_match:
            return f"Menos de {first_match.group(1)} solicitantes"
            
        num_match = re.search(r'(\d+)\s*(?:applicants|solicitantes|candidatos|inscritos|personas inscritas)', html_text, re.IGNORECASE)
        if num_match:
            return f"{num_match.group(1)} solicitantes"
            
    return "No especificado"

def obtener_detalle_oferta_linkedin(job_id):
    """
    Extrae la descripción completa y el número de solicitantes de una oferta de LinkedIn.
    
    Retorna:
    - (texto_limpio: str, solicitantes_str: str)
    """
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
    response = solicitud_resiliente_linkedin(url)
    if not response or response.status_code != 200:
        return "", "No especificado"
    
    soup = BeautifulSoup(response.text, 'html.parser')
    solicitantes = extraer_numero_solicitantes(soup, response.text)
    
    description_div = soup.find('div', class_=re.compile(r'show-more-less-html__markup|description__content'))
    
    if description_div:
        for tag in description_div.find_all(['br', 'p', 'li']):
            tag.append('\n')
        texto_limpio = description_div.get_text()
        lineas = [l.strip() for l in texto_limpio.splitlines() if l.strip()]
        return '\n'.join(lineas), solicitantes
    return "", solicitantes

def extraer_experiencia_requerida(titulo, descripcion):
    """
    Analiza el título y texto completo de la vacante para determinar los años/nivel de experiencia requeridos.
    
    Retorna:
    - str: 'Prácticas / Sin experiencia (0 años)', '1-2 años', '3 años', o 'No especificado / Junior'
    """
    texto = (titulo + " " + descripcion).lower()
    
    if any(k in texto for k in ['beca', 'prácticas', 'practicas', 'internship', 'intern', 'sin experiencia', 'entry level', '0 años', '0 years']):
        return "Prácticas / Sin experiencia (0 años)"
        
    exp_matches = re.findall(r'(?:experiencia|experience|mínimo|at least)\s*(?:de\s*)?(\d+)\+?\s*(?:años|years)', texto)
    exp_matches += re.findall(r'(\d+)\+?\s*(?:años|years)\s*(?:de\s*)?experiencia', texto)
    
    if exp_matches:
        anios = [int(m) for m in exp_matches if int(m) <= 10]
        if anios:
            min_exp = min(anios)
            if min_exp == 0:
                return "Prácticas / Sin experiencia (0 años)"
            elif min_exp in [1, 2]:
                return f"{min_exp} año(s)"
            else:
                return f"{min_exp} años"
                
    if 'junior' in texto or 'jr' in texto:
        return "Junior (0-2 años)"
        
    return "No especificado / Junior"

def evaluar_encaje_oferta(oferta, descripcion, exp_previa=None):
    """
    Evalúa la viabilidad de la oferta según los criterios de config.json y calcula la experiencia requerida.
    
    Parámetros:
    - oferta (dict): Diccionario con datos de la vacante (título, empresa, ubicación...)
    - descripcion (str): Texto completo de la vacante
    - exp_previa (str, opcional): Experiencia ya extraída de metadatos estructurados (ej: ficha técnica de Tecnoempleo)
    
    Retorna:
    - (es_apta: bool, motivo_descarte: str, puntuacion: int, tecnologias: list[str], exp_str: str)
    """
    titulo_lower = oferta['titulo'].lower()
    empresa_lower = oferta['empresa'].lower()
    ubicacion_lower = oferta['ubicacion'].lower()
    desc_lower = descripcion.lower()
    
    exp_str = exp_previa if (exp_previa and exp_previa != "No especificado / Junior") else extraer_experiencia_requerida(oferta['titulo'], descripcion)
    
    # 1. Filtro Empresas Prohibidas
    for emp in EMPRESAS_PROHIBIDAS:
        if emp in empresa_lower:
            return False, f"Empresa excluida ({oferta['empresa']})", 0, [], exp_str
            
    # 2. Filtro Seniority / Puestos desaconsejados
    for palabra in PALABRAS_DESCARTE_TITULO:
        if re.search(r'\b' + re.escape(palabra) + r'\b', titulo_lower):
            return False, f"Puesto no objetivo en título ({palabra})", 0, [], exp_str
            
    # 3. Filtro Experiencia Requerida (>3 años)
    if exp_str:
        exp_str_lower = exp_str.lower()
        if any(pat in exp_str_lower for pat in ['más de 5', 'mas de 5', '3-5', '4-5', '5+', '> 3', 'senior']):
            return False, f"Requiere experiencia senior en ficha ({exp_str})", 0, [], exp_str
        m_num = re.search(r'(\d+)', exp_str)
        if m_num and int(m_num.group(1)) > 3:
            return False, f"Requiere más de 3 años de experiencia ({exp_str})", 0, [], exp_str

    exp_matches = re.findall(r'(?:experiencia|experience|mínimo|at least)\s*(?:de\s*)?(\d+)\+?\s*(?:años|years)', desc_lower)
    exp_matches += re.findall(r'(\d+)\+?\s*(?:años|years)\s*(?:de\s*)?experiencia', desc_lower)
    for m in exp_matches:
        if int(m) > 3:
            return False, f"Requiere más de 3 años de experiencia ({m} años)", 0, [], exp_str
            
    # 4. Filtro Ubicación vs. Modalidad
    es_remoto = 'remoto' in desc_lower or 'remote' in desc_lower or 'teletrabajo' in desc_lower
    es_barcelona = any(z in ubicacion_lower for z in ZONAS_ACEPTADAS)
    
    if not es_remoto and not es_barcelona:
        return False, f"Ubicación presencial/híbrida fuera de la zona ({oferta['ubicacion']})", 0, [], exp_str
        
    # 5. Detección de tecnologías
    tecnologias_halladas = []
    for kw in STACK_DESEADO:
        if re.search(r'\b' + re.escape(kw.lower()) + r'\b', desc_lower):
            tecnologias_halladas.append(kw)
            
    # 6. Puntuación de encaje
    puntuacion = 50 + (len(tecnologias_halladas) * 10)
    if es_remoto:
        puntuacion += 10
    if 'junior' in titulo_lower or 'prácticas' in titulo_lower or 'intern' in titulo_lower or 'beca' in titulo_lower:
        puntuacion += 15
        
    puntuacion = min(100, puntuacion)
    
    return True, "Apta", puntuacion, tecnologias_halladas, exp_str

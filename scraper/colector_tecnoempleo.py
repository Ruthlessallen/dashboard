import requests
from config import CONFIG
from bs4 import BeautifulSoup
import re
import random
import time
from datetime import datetime
from linkedin_scraper_avanzado import evaluar_encaje_oferta, STACK_DESEADO, pausa_organica_profunda, extraer_numero_solicitantes

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Referer': 'https://www.tecnoempleo.com/'
}

URLS_CATEGORIAS_TECNOEMPLEO = [
    f"https://www.tecnoempleo.com/ofertas-trabajo/{c}/" for c in CONFIG['tecnoempleo_categorias']
]

def extraer_experiencia_tecnoempleo(soup):
    """
    Extrae la experiencia requerida directamente de la ficha técnica de la oferta en Tecnoempleo.
    Se ubica estructuralmente bajo el campo 'Jornada' y sobre 'Tipo contrato':
    <li class="list-item clearfix border-bottom py-2">
      <span class="float-end">3-5 años</span>
      ...
      <span class="d-inline-block px-2">Experiencia</span>
    </li>
    
    Retorna:
    - str: 'Sin experiencia', '1 año', '2 años', '3-5 años', etc.
    """
    if not soup:
        return "No especificado / Junior"
        
    # 1. Búsqueda específica por el span exacto con texto 'Experiencia'
    for span in soup.find_all('span'):
        txt_span = span.get_text(strip=True).lower()
        if txt_span == 'experiencia':
            li_parent = span.find_parent(['li', 'div', 'tr'])
            if li_parent:
                val = li_parent.find(class_=re.compile(r'float-end'))
                if val:
                    val_txt = val.get_text(strip=True)
                    if val_txt and val_txt.lower() != 'experiencia':
                        return val_txt
            if span.parent:
                val = span.parent.find(class_=re.compile(r'float-end'))
                if val:
                    val_txt = val.get_text(strip=True)
                    if val_txt and val_txt.lower() != 'experiencia':
                        return val_txt

    # 2. Búsqueda por contenedor li con clase list-item
    list_items = soup.find_all('li', class_=re.compile(r'list-item'))
    for li in list_items:
        txt = li.get_text().lower()
        if 'experiencia' in txt and not any(k in txt for k in ['ubicación', 'funciones']):
            val = li.find(class_=re.compile(r'float-end'))
            if val:
                val_txt = val.get_text(strip=True)
                if val_txt and val_txt.lower() != 'experiencia':
                    return val_txt

    return "No especificado / Junior"

def obtener_detalle_tecnoempleo(url_oferta, nombre_categoria="Tecnoempleo Directo"):
    """
    Visita el detalle completo de una oferta en Tecnoempleo y extrae la empresa, ubicación, modalidad, 
    fecha de publicación, tecnologías reales, número de solicitantes y la descripción completa.
    
    Parámetros:
    - url_oferta (str): URL de la vacante en Tecnoempleo
    - nombre_categoria (str): Nombre de la categoría o búsqueda de origen
    
    Retorna:
    - dict: Diccionario con la información real parseada o None si falla
    """
    try:
        res = requests.get(url_oferta, headers=HEADERS, timeout=10)
        if res.status_code != 200:
            return None
            
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Extraer número de solicitantes / CVs inscritos
        solicitantes = extraer_numero_solicitantes(soup, res.text)
        
        # Título
        h1 = soup.find('h1')
        titulo = h1.get_text(strip=True) if h1 else "Oferta Técnica"
        
        # Empresa Real (Tecnoempleo usa patrones href con /re- para el perfil de empresa)
        empresa = "Empresa Confidencial"
        empresa_tag = soup.find('a', href=re.compile(r'/re-'))
        if empresa_tag:
            txt = empresa_tag.get_text(strip=True)
            if txt and txt.lower() not in ['españa', 'espana', 'remoto', 'hibrido', 'presencial']:
                empresa = txt
        if empresa == "Empresa Confidencial":
            alt_tag = soup.find('a', href=re.compile(r'/empresa/|/empresas/'))
            if alt_tag:
                empresa = alt_tag.get_text(strip=True)
        
        # Texto completo
        desc_div = soup.find('div', class_=re.compile(r'description|descripcion|contenido'))
        if not desc_div:
            desc_text = soup.get_text()
        else:
            desc_text = desc_div.get_text(separator='\n', strip=True)
            
        # Ubicación real
        ubicacion = "Barcelona - España"
        ubicacion_match = re.search(r'([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+)\s*-\s*España', res.text)
        if ubicacion_match:
            ub_cand = ubicacion_match.group(1).strip()
            if len(ub_cand) < 40:
                ubicacion = ub_cand + " (Barcelona)"
                
        # Modalidad real
        desc_lower = desc_text.lower()
        if 'remoto' in desc_lower or 'teletrabajo' in desc_lower or '100% remoto' in desc_lower:
            modalidad = "Remoto"
        elif 'híbrido' in desc_lower or 'hibrido' in desc_lower:
            modalidad = "Híbrido"
        else:
            modalidad = "Presencial/Híbrido"
            
        # Fecha de publicación real
        fecha_match = re.search(r'(\d{2}/\d{2}/\d{4})', res.text)
        fecha_relativa = fecha_match.group(1) if fecha_match else "Reciente"
        
        # Tecnologías reales detectadas
        tecnologias_halladas = []
        for kw in STACK_DESEADO:
            if re.search(r'\b' + re.escape(kw.lower()) + r'\b', desc_lower):
                tecnologias_halladas.append(kw)
                
        # Extraer experiencia requerida desde la ficha técnica estructurada (bajo Jornada y sobre Contrato)
        exp_tecno = extraer_experiencia_tecnoempleo(soup)
        
        # ID único
        job_id = f"tecnoempleo_{url_oferta.split('/')[-1].replace('.html', '')}"
        
        # Evaluar encaje pasando la experiencia real de la ficha
        oferta_fake = {
            'job_id': job_id,
            'titulo': titulo,
            'empresa': empresa,
            'ubicacion': ubicacion,
            'fecha_relativa': fecha_relativa,
            'url': url_oferta
        }
        
        apta, motivo, score, tecs, exp_str = evaluar_encaje_oferta(oferta_fake, desc_text, exp_previa=exp_tecno)
        
        if not tecs and tecnologias_halladas:
            tecs = tecnologias_halladas
            
        return {
            'job_id': job_id,
            'fecha_escaneo': datetime.now().strftime("%Y-%m-%d %H:%M"),
            'busqueda_origen': nombre_categoria,
            'titulo': titulo,
            'empresa': empresa,
            'ubicacion': ubicacion,
            'modalidad': modalidad,
            'experiencia_requerida': exp_str,
            'solicitantes': solicitantes,
            'url': url_oferta,
            'fecha_relativa': fecha_relativa,
            'puntuacion_encaje': score if apta else 0,
            'tecnologias': tecs,
            'descripcion_texto': desc_text,
            'estado': 'APTA' if apta else 'DESCARTADA',
            'motivo_descarte': motivo if not apta else ''
        }
    except Exception as e:
        print(f"Error parseando detalle Tecnoempleo ({url_oferta}): {e}")
        return None

def extraer_ofertas_tecnoempleo():
    """
    Recorre las categorías de Tecnoempleo, extrae el detalle de cada vacante y filtra las ofertas aptas.
    """
    ofertas = []
    urls_vistas = set()
    
    for url_cat in URLS_CATEGORIAS_TECNOEMPLEO:
        try:
            cat_slug = url_cat.strip('/').split('/')[-1]
            cat_name = cat_slug.replace('-', ' ').title()
            print(f"[TECNOEMPLEO] Escaneando categoría: {cat_name} ({url_cat})")
            res = requests.get(url_cat, headers=HEADERS, timeout=10)
            if res.status_code != 200:
                continue
                
            soup = BeautifulSoup(res.text, 'html.parser')
            links = soup.find_all('a', href=re.compile(r'/rf-'))
            
            for link_tag in links:
                href = link_tag.get('href')
                if not href or href in urls_vistas:
                    continue
                    
                urls_vistas.add(href)
                url_completa = href if href.startswith('http') else f"https://www.tecnoempleo.com{href}"
                
                # Pausa humana respetuosa entre peticiones
                pausa_organica_profunda(min_sec=3.0, max_sec=6.0)
                
                detalle = obtener_detalle_tecnoempleo(url_completa, nombre_categoria=f"Tecnoempleo ({cat_name})")
                if detalle and detalle['estado'] == 'APTA':
                    ofertas.append(detalle)
                    print(f"   [APTA TECNOEMPLEO] {detalle['titulo']} @ {detalle['empresa']} ({detalle['ubicacion']}) -> Score: {detalle['puntuacion_encaje']}% | Stack: {detalle['tecnologias']}")
                elif detalle:
                    print(f"   [DESCARTADA TECNOEMPLEO] {detalle['titulo']} @ {detalle['empresa']} -> {detalle['motivo_descarte']}")
        except Exception as e:
            print(f"Error procesando categoría Tecnoempleo: {e}")
            
    return ofertas

if __name__ == "__main__":
    res = extraer_ofertas_tecnoempleo()
    print(f"\n--- PROCESO FINALIZADO. Total ofertas aptas en Tecnoempleo: {len(res)} ---")

import os
from config import CONFIG
from clave_oferta import clave_oferta
from ignoradas import cargar_claves_ignoradas
import csv
import json
import time
import random
from datetime import datetime
from linkedin_scraper_avanzado import (
    obtener_lista_ofertas_linkedin_paginado,
    obtener_detalle_oferta_linkedin,
    evaluar_encaje_oferta,
    pausa_organica_profunda
)

BUSQUEDAS_OBJETIVO = [{"id": i + 1, **b} for i, b in enumerate(CONFIG['busquedas'])]

CSV_FILE = os.path.join(os.path.dirname(__file__), "ofertas_encontradas.csv")
JSON_FILE = os.path.join(os.path.dirname(__file__), "ofertas_encontradas.json")

def cargar_ids_existentes():
    """
    Carga la lista de IDs de ofertas ya registradas en el CSV para evitar duplicados.
    """
    ids = set()
    if os.path.exists(CSV_FILE):
        try:
            with open(CSV_FILE, mode='r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if 'job_id' in row and row['job_id']:
                        ids.add(row['job_id'].strip())
        except Exception as e:
            print(f"Aviso al leer CSV existente: {e}")
    return ids

CAMPOS_CSV = [
    'job_id', 'fecha_escaneo', 'busqueda_origen', 'titulo', 'empresa',
    'ubicacion', 'modalidad', 'experiencia_requerida', 'solicitantes', 'url', 'fecha_relativa',
    'puntuacion_encaje', 'tecnologias', 'resumen_descripcion'
]

def inicializar_csv():
    """
    Crea el CSV con su cabecera si todavía no existe (primer uso).
    """
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, mode='w', newline='', encoding='utf-8-sig') as f:
            csv.DictWriter(f, fieldnames=CAMPOS_CSV).writeheader()

def cargar_claves_existentes():
    """
    Claves (clave_oferta) de las ofertas ya guardadas en el CSV, por su enlace.
    """
    claves = set()
    if os.path.exists(CSV_FILE):
        try:
            with open(CSV_FILE, mode='r', encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    clave = clave_oferta(row.get('url'))
                    if clave:
                        claves.add(clave)
        except Exception as e:
            print(f"Aviso al leer CSV existente: {e}")
    return claves

def guardar_ofertas_csv(nuevas_ofertas):
    """
    Guarda las nuevas ofertas deduplicadas en el archivo CSV unificado.
    """
    if not nuevas_ofertas:
        return

    file_exists = os.path.exists(CSV_FILE)
    fieldnames = CAMPOS_CSV

    with open(CSV_FILE, mode='a', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
            
        for of in nuevas_ofertas:
            writer.writerow({
                'job_id': of['job_id'],
                'fecha_escaneo': of['fecha_escaneo'],
                'busqueda_origen': of['busqueda_origen'],
                'titulo': of['titulo'],
                'empresa': of['empresa'],
                'ubicacion': of['ubicacion'],
                'modalidad': of['modalidad'],
                'experiencia_requerida': of.get('experiencia_requerida', 'No especificado / Junior'),
                'solicitantes': of.get('solicitantes', 'No especificado'),
                'url': of['url'],
                'fecha_relativa': of['fecha_relativa'],
                'puntuacion_encaje': of['puntuacion_encaje'],
                'tecnologias': ', '.join(of['tecnologias']) if isinstance(of['tecnologias'], list) else of['tecnologias'],
                'resumen_descripcion': of['descripcion_texto'].replace('\r\n', ' ').replace('\n', ' ')
            })

def ejecutar_escaneo_organico(limite_por_busqueda=25, paginas_max=6):
    """
    Ejecuta el escaneo con movimiento orgánico humano, deduplicación y pausas naturales.
    """
    print("=== INICIANDO ESCANEO ORGÁNICO SEGURO DE LAS BÚSQUEDAS CONFIGURADAS ===")
    inicializar_csv()
    
    ids_existentes = cargar_ids_existentes()
    print(f"IDs previamente registrados en CSV: {len(ids_existentes)}")
    claves_ignoradas = cargar_claves_ignoradas()
    print(f"Ofertas ya revisadas en el dashboard (se saltan): {len(claves_ignoradas)}")
    
    ofertas_capturadas = []
    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    for item in BUSQUEDAS_OBJETIVO:
        query = item['query']
        b_id = item['id']
        print(f"\n[BÚSQUEDA {b_id}/{len(BUSQUEDAS_OBJETIVO)}] -> '{query}' (Pausa orgánica de inicio)...")
        
        # Pausa orgánica natural entre bloques de búsqueda (12 a 25 seg)
        pausa_organica_profunda(min_sec=12.0, max_sec=25.0)
        
        # Realizar llamada a API pública de LinkedIn con paginación
        lote = obtener_lista_ofertas_linkedin_paginado(busqueda=query, ubicacion=CONFIG['ubicacion'], paginas_max=paginas_max)
        nuevas_en_lote = 0
        
        for oferta in lote:
            job_id = oferta['job_id']
            
            # DEDUPLICACIÓN
            if job_id in ids_existentes:
                print(f"   [DEDUPLICADA] {oferta['titulo']} @ {oferta['empresa']} ya estaba en BBDD.")
                continue
                
            # YA REVISADA EN EL DASHBOARD (aplicada, borrada o ya en postulaciones)
            if clave_oferta(oferta['url']) in claves_ignoradas:
                print(f"   [IGNORADA] {oferta['titulo']} @ {oferta['empresa']} ya la revisaste en el dashboard.")
                continue

            ids_existentes.add(job_id)
            
            # Pausa natural ultra-segura imitando lectura humana (6 a 12 seg)
            pausa_organica_profunda(min_sec=6.0, max_sec=12.0)
            
            desc, solicitantes = obtener_detalle_oferta_linkedin(job_id)
            if not desc:
                continue
                
            apta, motivo, score, tecs, exp_str = evaluar_encaje_oferta(oferta, desc)
            
            if apta:
                es_remoto = 'remoto' in desc.lower() or 'remote' in desc.lower() or 'teletrabajo' in desc.lower()
                modalidad = "Remoto" if es_remoto else "Presencial/Híbrido"
                
                registro = {
                    'job_id': job_id,
                    'fecha_escaneo': fecha_hoy,
                    'busqueda_origen': f"Búsqueda {b_id}: {query}",
                    'titulo': oferta['titulo'],
                    'empresa': oferta['empresa'],
                    'ubicacion': oferta['ubicacion'],
                    'modalidad': modalidad,
                    'experiencia_requerida': exp_str,
                    'solicitantes': solicitantes,
                    'url': oferta['url'],
                    'fecha_relativa': oferta['fecha_relativa'],
                    'puntuacion_encaje': score,
                    'tecnologias': tecs,
                    'descripcion_texto': desc
                }
                
                ofertas_capturadas.append(registro)
                guardar_ofertas_csv([registro]) # Guardado atómico inmediato
                nuevas_en_lote += 1
                print(f"   [APTA REGISTRADA EN CSV] {oferta['titulo']} @ {oferta['empresa']} (Score: {score}%)")
            else:
                print(f"   [DESCARTADA CON ÉXITO] {oferta['titulo']} @ {oferta['empresa']} -> {motivo}")
                
            if nuevas_en_lote >= limite_por_busqueda:
                break
                
    print(f"\n--- PROCESO ORGANICO FINALIZADO CON ÉXITO ---")
    print(f"Total ofertas aptas añadidas al CSV: {len(ofertas_capturadas)}")
    print(f"Archivo actualizado: '{CSV_FILE}'")
    return ofertas_capturadas

if __name__ == "__main__":
    ejecutar_escaneo_organico(limite_por_busqueda=25, paginas_max=6)

import os
import csv
import json
from datetime import datetime
from ejecutar_busquedas import ejecutar_escaneo_organico, cargar_ids_existentes, cargar_claves_existentes, guardar_ofertas_csv, inicializar_csv
from ignoradas import cargar_claves_ignoradas
from colector_tecnoempleo import extraer_ofertas_tecnoempleo

def ejecutar_colectores_unificados():
    """
    Ejecuta la extracción masiva deduplicada a través de LinkedIn, Tecnoempleo y portales complementarios.
    """
    print("=== INICIANDO EXTRACCION UNIFICADA MULTIPLATAFORMA ===")
    inicializar_csv()
    
    ids_existentes = cargar_ids_existentes()
    print(f"Base de datos actual contiene {len(ids_existentes)} ofertas previas.")
    
    # 1. Escanear Tecnoempleo
    print("\n[TECNOEMPLEO] Escaneando ofertas de Tecnoempleo...")
    ofertas_tecno = extraer_ofertas_tecnoempleo(claves_saltar=cargar_claves_ignoradas() | cargar_claves_existentes())
    nuevas_tecno = []
    for of in ofertas_tecno:
        if of['job_id'] not in ids_existentes:
            nuevas_tecno.append(of)
            ids_existentes.add(of['job_id'])
            
    print(f"-> Nuevas ofertas unicas encontradas en Tecnoempleo: {len(nuevas_tecno)}")
    guardar_ofertas_csv(nuevas_tecno)
    
    # 2. Escanear LinkedIn Paginado
    print("\n[LINKEDIN] Escaneando LinkedIn Paginado...")
    nuevas_linkedin = ejecutar_escaneo_organico(limite_por_busqueda=25, paginas_max=6)
    
    total_nuevas = len(nuevas_tecno) + len(nuevas_linkedin)
    print(f"\n==========================================")
    print(f"--- EXTRACCION MULTIPLATAFORMA COMPLETADA ---")
    print(f"Total vacantes unicas anadidas: {total_nuevas}")
    print(f"Archivo final actualizado: ofertas_encontradas.csv")
    print(f"==========================================")

if __name__ == "__main__":
    ejecutar_colectores_unificados()

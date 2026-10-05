"""
Ofertas que la persona usuaria ya ha revisado en el dashboard (aplicadas o borradas)
o que ya constan en su registro de postulaciones: el scraper no debe volver a traerlas.

El dashboard escribe ofertas_ignoradas.json justo antes de lanzar el scraper
(lib/ignoradas.js). Si lo ejecutas a mano, usa la ultima lista escrita.
"""
import json
import os

_ARCHIVO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ofertas_ignoradas.json')


def cargar_claves_ignoradas():
    try:
        with open(_ARCHIVO, encoding='utf-8') as f:
            return set(json.load(f).get('claves', []))
    except (OSError, ValueError):
        return set()

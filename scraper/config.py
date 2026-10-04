"""
Configuración del scraper.

Lee config.json si existe (tu configuración personal, no se sube a git) y, si no,
config.example.json. Copia el ejemplo a config.json y edítalo con tus búsquedas.
"""
import json
import os

_DIR = os.path.dirname(os.path.abspath(__file__))


def _cargar():
    for nombre in ("config.json", "config.example.json"):
        ruta = os.path.join(_DIR, nombre)
        if os.path.exists(ruta):
            with open(ruta, encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("No encuentro config.json ni config.example.json en " + _DIR)


CONFIG = _cargar()

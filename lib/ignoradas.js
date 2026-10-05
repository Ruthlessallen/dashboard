import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';
import { claveOferta } from './ofertas-clave.js';
import { clavesPostulaciones } from './postulaciones-csv.js';

/**
 * Escribe <carpeta del scraper>/ofertas_ignoradas.json con las ofertas que el
 * scraper no debe volver a traer: las que has aplicado o borrado en /empleos y
 * todas las que constan en tu CSV de postulaciones (la fase da igual: ya las
 * revisaste). scraper/ignoradas.py lo lee.
 */
export function escribirIgnoradas(dir) {
  const claves = new Set();
  for (const r of getDb().prepare('SELECT url FROM empleo_estado').all()) {
    const c = claveOferta(r.url);
    if (c) claves.add(c);
  }
  for (const c of clavesPostulaciones().keys()) claves.add(c);

  fs.writeFileSync(
    path.join(dir, 'ofertas_ignoradas.json'),
    JSON.stringify({ actualizado: new Date().toISOString(), claves: [...claves].sort() }, null, 1)
  );
  return claves.size;
}

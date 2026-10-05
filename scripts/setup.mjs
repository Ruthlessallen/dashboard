// Prepara lo que falte para arrancar el dashboard. Idempotente: nunca pisa nada que ya exista.
//   npm run setup   -> todo, instalando las dependencias de Python si faltan
//   --quiet         -> (lo usa npm run dev) solo crea archivos y avisa de lo que falte
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
const say = (msg) => console.log(`[setup] ${msg}`);

function createIfMissing(file, content, label) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) return;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  say(`creado ${file}${label ? ` (${label})` : ''}`);
}

const copyIfMissing = (from, to, label) => {
  if (fs.existsSync(path.join(root, from))) createIfMissing(to, fs.readFileSync(path.join(root, from)), label);
};

copyIfMissing('.env.local.example', '.env.local', 'rellénalo para conectar Google');
copyIfMissing('scraper/config.example.json', 'scraper/config.json', 'tus búsquedas y filtros');
createIfMissing('data/postulaciones.csv', '﻿Fecha,Empresa,Puesto,Link,Fase,Observaciones\n', 'tus postulaciones');

// Python (solo para el scraper)
const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
const run = (args, opts = {}) => spawnSync(python, args, { cwd: path.join(root, 'scraper'), encoding: 'utf8', ...opts });

if (run(['--version']).error) {
  say(`aviso: no encuentro Python (${python}). Sin él el scraper no funciona; el resto del dashboard sí. Puedes indicarlo con PYTHON_BIN.`);
} else {
  const hasDeps = () => run(['-c', 'import requests, bs4']).status === 0;
  if (!hasDeps()) {
    if (quiet) {
      say('aviso: faltan las dependencias de Python del scraper. Ejecuta: npm run setup');
    } else {
      say('instalando dependencias de Python (scraper/requirements.txt)…');
      const r = run(['-m', 'pip', 'install', '-r', 'requirements.txt'], { stdio: 'inherit' });
      if (r.status !== 0) say('aviso: no se pudieron instalar. Prueba a mano: pip install -r scraper/requirements.txt');
    }
  }
  if (hasDeps()) {
    const csv = path.join(root, 'scraper', 'ofertas_encontradas.csv');
    const existed = fs.existsSync(csv);
    run(['-c', 'import ejecutar_busquedas as e; e.inicializar_csv()']);
    if (!existed && fs.existsSync(csv)) say('creado scraper/ofertas_encontradas.csv (vacío, lo rellena el scraper)');
  }
}

if (!quiet) {
  say('listo. Arranca con: npm run dev   (http://localhost:3111)');
}

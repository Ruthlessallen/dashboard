"""
Identificador estable de una oferta a partir de su enlace, para reconocer la misma
oferta aunque el enlace cambie de forma (con o sin titulo en la ruta, con parametros
de seguimiento, http/https, www...).

Debe dar exactamente lo mismo que lib/ofertas-clave.js: si cambias uno, cambia el otro.
"""
import posixpath
import re
from urllib.parse import urlsplit, parse_qsl, unquote

_TRACKING = re.compile(
    r'^(utm_.*|source|ref|referrer|refid|trk|trkemail|trackingid|lipi|midtoken|midsig|eid|'
    r'otptoken|applicationorigin|page|sortby|hl|lang|from|src|domain)$', re.I)


def clave_oferta(url):
    u = (url or '').strip()
    if not re.match(r'https?://', u, re.I):
        return None

    if re.search(r'linkedin\.', u, re.I):
        m = re.search(r'(?:jobs/view/(?:[^/?#]*-)?|currentJobId=)(\d{6,})', u, re.I)
        if m:
            return f'li:{m.group(1)}'
    m = re.search(r'tecnoempleo\.com/[^?#]*/rf-([0-9a-f]+)', u, re.I)
    if m:
        return f'te:{m.group(1).lower()}'
    m = re.search(r'infojobs\.net/[^?#]*/of-(i[0-9a-f]+)', u, re.I)
    if m:
        return f'ij:{m.group(1).lower()}'
    if re.search(r'indeed\.', u, re.I):
        m = re.search(r'[?&]v?jk=([0-9a-f]+)', u, re.I)
        if m:
            return f'in:{m.group(1).lower()}'

    try:
        x = urlsplit(u)
        params = sorted(f'{k.lower()}={v}' for k, v in parse_qsl(x.query, keep_blank_values=True)
                        if not _TRACKING.match(k))
        path = unquote(x.path)
        if re.search(r'(^|/)\.{1,2}(/|$)', path):
            path = posixpath.normpath(path)  # igual que hace JS con los segmentos "." y ".."
        path = path.rstrip('/').lower()
        host = re.sub(r'^www\.', '', (x.hostname or '').lower())
        return f'url:{host}{path}' + ('?' + '&'.join(params) if params else '')
    except ValueError:
        return None

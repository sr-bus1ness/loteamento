"""Extrai o desenho das ruas (faixas cinza) das plantas e o contorno de cada quadra.

Uso: python ruas.py <pasta do projeto> [pasta de prévia]
Gera data/mapa.json com, por empreendimento:
  ruas:    caminhos SVG (fill-rule evenodd) das ruas, no mesmo sistema de coordenadas dos lotes
  quadras: {letra: {path, cx, cy, bbox}} contorno da quadra (união dos lotes), ponto da letra e retângulo de zoom
Dependências: numpy, opencv-python-headless, shapely.
"""
import json, os, sys
import numpy as np
import cv2
from shapely.geometry import Polygon
from shapely.ops import unary_union

root = sys.argv[1]
prev = sys.argv[2] if len(sys.argv) > 2 else None
geo = json.load(open(os.path.join(root, 'data', 'loteamentos.json'), encoding='utf-8'))


def fmt(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')


def ring_path(pts):
    return 'M' + 'L'.join(fmt(x) + ' ' + fmt(y) for x, y in pts) + 'Z'


def geom_path(g):
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    out = []
    for p in polys:
        out.append(ring_path(list(p.exterior.coords)[:-1]))
        for i in p.interiors:
            out.append(ring_path(list(i.coords)[:-1]))
    return ''.join(out)


res = {}
for emp in geo['empreendimentos']:
    img = cv2.imread(os.path.join(root, emp['mapa']['img']))
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    s, v = hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    # cinza claro das ruas: pouca saturação, brilho médio
    mask = ((s < 22) & (v > 165) & (v < 228)).astype(np.uint8) * 255

    # a área dos lotes nunca é rua
    lots = np.zeros((h, w), np.uint8)
    for l in emp['lotes']:
        cv2.fillPoly(lots, [np.array(l['poly'], np.int32)], 255)
    lots = cv2.dilate(lots, np.ones((3, 3), np.uint8))
    mask[lots > 0] = 0

    # fecha textos/árvores sobre a rua e remove ruído
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask)
    keep = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 20000:
            keep[lab == i] = 255
    mask = keep

    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for i, c in enumerate(cs):
        if hier[0][i][3] != -1:
            continue
        ext = cv2.approxPolyDP(c, 2.5, True).reshape(-1, 2)
        if len(ext) < 3:
            continue
        holes = []
        j = hier[0][i][2]
        while j != -1:
            hc = cv2.approxPolyDP(cs[j], 2.5, True).reshape(-1, 2)
            if len(hc) >= 3 and cv2.contourArea(cs[j]) > 4000:
                holes.append(hc.tolist())
            j = hier[0][j][0]
        p = Polygon(ext.tolist(), holes).buffer(0)
        if not p.is_empty:
            polys.append(p)
    # quadras
    by_q = {}
    for l in emp['lotes']:
        by_q.setdefault(l['q'], []).append(Polygon(l['poly']).buffer(0))

    # só o que está junto do loteamento (descarta rosa dos ventos, rodovia, legendas) e suaviza
    perto = unary_union([p for ps in by_q.values() for p in ps]).buffer(70)
    ruas = unary_union(polys).intersection(perto).buffer(3, join_style=2).buffer(-3, join_style=2).simplify(1.5)
    ruas = unary_union([g for g in (getattr(ruas, 'geoms', None) or [ruas]) if g.area > 8000])
    quadras = {}
    for q, ps in sorted(by_q.items()):
        u = unary_union([p.buffer(1.5, join_style=2) for p in ps]).buffer(-1.5, join_style=2)
        u = u.simplify(0.8)
        pt = u.representative_point() if u.geom_type != 'Polygon' else u.centroid
        if not u.contains(pt):
            pt = u.representative_point()
        x0, y0, x1, y1 = u.bounds
        quadras[q] = {'path': geom_path(u), 'cx': round(pt.x, 1), 'cy': round(pt.y, 1),
                      'bbox': [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)]}

    res[emp['id']] = {'w': w, 'h': h, 'ruas': geom_path(ruas), 'quadras': quadras}

    if prev:
        out = np.full((h, w, 3), 30, np.uint8)
        for g in (getattr(ruas, 'geoms', None) or [ruas]):
            cv2.fillPoly(out, [np.array(g.exterior.coords, np.int32)], (90, 90, 90))
            for i in g.interiors:
                cv2.fillPoly(out, [np.array(i.coords, np.int32)], (30, 30, 30))
        out[lots > 0] = (60, 120, 60)
        cv2.imwrite(os.path.join(prev, emp['id'] + '_ruas.png'), cv2.resize(out, (w // 3, h // 3)))

json.dump(res, open(os.path.join(root, 'data', 'mapa.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print({k: (len(v['ruas']), len(v['quadras'])) for k, v in res.items()})

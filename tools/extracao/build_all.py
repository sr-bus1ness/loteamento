import pymupdf as f, cv2, numpy as np, json, sys, re, collections
sd, pdf1, pdf2, outdir = sys.argv[1:5]
TABLE = {
  'E1': {'A': (12, 2035.98), 'B': (21, 3550.97), 'C': (24, 3840.00), 'D': (7, 1497.66), 'E': (36, 6073.09), 'F': (19, 4872.13), 'G': (36, 5945.87), 'H': (36, 5946.27), 'I': (36, 5990.06), 'J': (37, 6230.34), 'K': (40, 6587.28), 'L': (24, 4446.21), 'M': (46, 7928.17), 'N': (12, 3061.88), 'O': (12, 2053.79)},
  'E2': {'A': (23, 4039.79), 'B': (30, 4899.33), 'C': (43, 7462.11), 'D': (50, 8000.00), 'E': (50, 8000.00), 'F': (50, 8000.00), 'G': (25, 4164.31), 'H': (17, 2831.75), 'I': (27, 4428.19), 'J': (30, 4800.00), 'K': (16, 2693.02)},
}
def pix_to_np(pix):
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, pix.n)
    return cv2.cvtColor(a, cv2.COLOR_RGB2BGR)

# ---------------- Esperança I
L1 = json.load(open(sd + '/lots1.json'))
lab1 = np.load(sd + '/lab1.npy'); S1 = 400 / 72.0
W1 = [w for w in json.load(open(sd + '/words1.json')) if w[0] < 655]
ctr = lambda w: ((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
dist = lambda a, b: ((ctr(a)[0] - ctr(b)[0]) ** 2 + (ctr(a)[1] - ctr(b)[1]) ** 2) ** .5
lab1_ids = {}
for l in L1:
    ix, iy = int(l['cx'] * S1), int(l['cy'] * S1)
for idx, l in enumerate(L1):
    # palavras dentro do lote (amostra pela máscara do componente mais próximo do centróide)
    pass
def comp_of(w):
    x, y = ctr(w); ix, iy = int(x * S1), int(y * S1)
    win = lab1[max(0, iy - 6):iy + 7, max(0, ix - 6):ix + 7]
    v = [int(t) for t in np.unique(win) if t]
    return v
seg1 = json.load(open(sd + '/seg1.json'))
comp_by_center = {}
for s in seg1: comp_by_center[(round(s['cx'], 3), round(s['cy'], 3))] = s['comp']
fixed = 0
for l in L1:
    comp = comp_by_center[(round(l['cx'], 3), round(l['cy'], 3))]
    ws = [w for w in W1 if comp in comp_of(w)]
    area = None
    for w in ws:
        m1 = re.match(r'^(\d{3}),(\d{2})', w[4])
        if m1: area = float(m1.group(1) + '.' + m1.group(2)); break
    if area is None:
        for w in ws:
            if re.fullmatch(r'\d{3}', w[4]):
                commas = sorted([c for c in W1 if c[4] == ',' and dist(c, w) < 6], key=lambda c: dist(c, w))
                if commas:
                    fr = sorted([c for c in W1 if re.match(r'^\d{2}(m.*)?$', c[4]) and dist(c, commas[0]) < 4 and c is not w], key=lambda c: dist(c, commas[0]))
                    if fr: area = float(w[4] + '.' + fr[0][4][:2]); break
                area = float(w[4]); break
            m2 = re.match(r'^(\d{3}),', w[4])
            if m2:
                fr = sorted([c for c in W1 if re.match(r'^\d{2}m', c[4]) and dist(c, w) < 6], key=lambda c: dist(c, w))
                area = float(m2.group(1) + ('.' + fr[0][4][:2] if fr else '')); break
    if area is not None and area != l['area']: fixed += 1; l['area'] = area
print('E1 áreas corrigidas', fixed)
xs = [p[0] for l in L1 for p in l['poly']]; ys = [p[1] for l in L1 for p in l['poly']]
m = 40
x0, y0, x1, y1 = min(xs) - m, min(ys) - m, max(xs) + m, max(ys) + m
Z = 2600 / (x1 - x0)
page = f.open(pdf1)[0]
img = pix_to_np(page.get_pixmap(matrix=f.Matrix(Z, Z), clip=f.Rect(x0, y0, x1, y1)))
cv2.imwrite(outdir + '/img/esperanca1.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
lots1 = []
for l in sorted(L1, key=lambda l: (l['quadra'], l['num'])):
    poly = [[round((x - x0) * Z, 1), round((y - y0) * Z, 1)] for x, y in l['poly']]
    lots1.append(dict(id=f"E1-{l['quadra']}-{l['num']:02d}", q=l['quadra'], n=l['num'], area=l['area'], poly=poly))
emp1 = dict(id='E1', nome='Loteamento Esperança I', planta='Prancha 04/06 · Rev. 02 de 04/11/2013 · Escala 1:1000',
            mapa=dict(img='img/esperanca1.jpg', w=img.shape[1], h=img.shape[0]), lotes=lots1)

# ---------------- Esperança II (girado 90° anti-horário para norte acima)
S2 = 250 / 72.0
lab = np.load(sd + '/lab2.npy')
L2 = json.load(open(sd + '/lots2.json'))
for l in L2:
    mm = (lab == l['comp']).astype(np.uint8)
    cs, _ = cv2.findContours(mm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = cv2.approxPolyDP(max(cs, key=cv2.contourArea), 1.0, True)
    l['poly'] = [[float(p[0][0]) / S2, float(p[0][1]) / S2] for p in c]
xs = [p[0] for l in L2 for p in l['poly']]; ys = [p[1] for l in L2 for p in l['poly']]
m = 60
x0, y0, x1, y1 = min(xs) - m, min(ys) - m, max(xs) + m, max(ys) + m
Z = 2600 / (y1 - y0)
page = f.open(pdf2)[0]
img = pix_to_np(page.get_pixmap(matrix=f.Matrix(Z, Z), clip=f.Rect(x0, y0, x1, y1)))
img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
cv2.imwrite(outdir + '/img/esperanca2.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
lots2 = []
for l in sorted(L2, key=lambda l: (l['quadra'], l['num'])):
    poly = [[round((y - y0) * Z, 1), round((x1 - x) * Z, 1)] for x, y in l['poly']]
    lots2.append(dict(id=f"E2-{l['quadra']}-{l['num']:02d}", q=l['quadra'], n=l['num'], area=l['area'], poly=poly))
emp2 = dict(id='E2', nome='Loteamento Esperança II', planta='Prancha 03/05 · 21/05/2014 · Escala 1:1000',
            mapa=dict(img='img/esperanca2.jpg', w=img.shape[1], h=img.shape[0]), lotes=lots2)

# ---------------- conferência com as tabelas das plantas
for emp in (emp1, emp2):
    by = collections.defaultdict(list)
    for l in emp['lotes']: by[l['q']].append(l)
    for q, (n, a) in TABLE[emp['id']].items():
        s = round(sum(l['area'] for l in by[q]), 2)
        flag = '' if abs(s - a) < 1 else '  <-- DIFERENÇA'
        print(emp['id'], q, len(by[q]), n, s, a, flag)
    print(emp['id'], 'total lotes', len(emp['lotes']), 'area', round(sum(l['area'] for l in emp['lotes']), 2))
meta = dict(
    fonte='Extraído das plantas "Planta Esperança I.pdf" e "Planta Esperança II.pdf" (AG Topografia e Arquitetura).',
    proprietario='Futura Empreendimentos Imobiliários Ltda', municipio='Esperança - PB',
    empreendimentos=[emp1, emp2])
json.dump(meta, open(outdir + '/data/loteamentos.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

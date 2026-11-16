import cv2, numpy as np, json, sys, re
from rapidocr_onnxruntime import RapidOCR
sd = sys.argv[1]
ocr = RapidOCR()
lab = np.load(sd + '/lab2.npy')
lots = json.load(open(sd + '/ocr2_fixed.json'))
g = cv2.imread(sd + '/area2_full.png', cv2.IMREAD_GRAYSCALE)
for L in lots:
    m = (lab == L['comp']).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    filled = np.zeros_like(m); cv2.drawContours(filled, [c], -1, 1, -1)
    x, y, w, h = cv2.boundingRect(c); pad = 4
    crop = np.full((h + 2 * pad, w + 2 * pad), 255, np.uint8)
    sub = g[y:y + h, x:x + w]; fm = filled[y:y + h, x:x + w]
    crop[pad:pad + h, pad:pad + w] = np.where((fm > 0) & (sub < 160), 0, 255)
    (rx, ry), (rw, rh), ang = cv2.minAreaRect(c)
    if rw < rh: ang += 90
    L['area'] = None; L['area_cands'] = []
    for extra in (0, 180, 90, 270):
        H, W = crop.shape
        M = cv2.getRotationMatrix2D((W / 2, H / 2), ang + extra, 1.0)
        cos, sin = abs(M[0, 0]), abs(M[0, 1])
        nW, nH = int(H * sin + W * cos), int(H * cos + W * sin)
        M[0, 2] += nW / 2 - W / 2; M[1, 2] += nH / 2 - H / 2
        rot = cv2.warpAffine(crop, M, (nW, nH), borderValue=255)
        rot = cv2.copyMakeBorder(rot, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
        rot = cv2.resize(rot, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        res, _ = ocr(rot)
        for box, txt, conf in (res or []):
            mm = re.search(r'(\d{3})[,.](\d{2})', txt.replace(' ', ''))
            if mm and conf > 0.8:
                L['area_cands'].append((float(conf), mm.group(1) + '.' + mm.group(2)))
        if L['area_cands']: break
    if L['area_cands']:
        L['area'] = float(max(L['area_cands'])[1])
json.dump(lots, open(sd + '/lots2.json', 'w'))
print('with area', sum(1 for l in lots if l['area']), 'of', len(lots))

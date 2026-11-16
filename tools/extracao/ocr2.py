import cv2, numpy as np, json, sys, re, collections
from rapidocr_onnxruntime import RapidOCR
sd = sys.argv[1]
ocr = RapidOCR()
lab = np.load(sd + '/lab2.npy')
lots = json.load(open(sd + '/seg2.json'))
g = cv2.imread(sd + '/glyph2_full.png', cv2.IMREAD_GRAYSCALE)
BL = {1: 'B', 2: 'G', 3: 'F', 4: 'E', 5: 'A', 6: 'D', 7: 'K', 8: 'J', 9: 'C', 10: 'I', 11: 'H'}
CNT = {'A': 23, 'B': 30, 'C': 43, 'D': 50, 'E': 50, 'F': 50, 'G': 25, 'H': 17, 'I': 27, 'J': 30, 'K': 16}
out = []
for L in lots:
    q = BL[L['block']]
    m = (lab == L['comp']).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    filled = np.zeros_like(m); cv2.drawContours(filled, [c], -1, 1, -1)
    filled = cv2.erode(filled, np.ones((3, 3), np.uint8))
    x, y, w, h = cv2.boundingRect(c)
    pad = 4
    crop = np.full((h + 2 * pad, w + 2 * pad), 255, np.uint8)
    sub = g[y:y + h, x:x + w]; fm = filled[y:y + h, x:x + w]
    crop[pad:pad + h, pad:pad + w] = np.where((fm > 0) & (sub < 128), 0, 255)
    (rx, ry), (rw, rh), ang = cv2.minAreaRect(c)
    if rw < rh: ang += 90  # make long axis horizontal
    cands = []
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
            t = txt.strip().replace('O', '0').replace('o', '0')
            hgt = max(p[1] for p in box) - min(p[1] for p in box)
            if re.fullmatch(r'\d{1,2}', t) and 1 <= int(t) <= CNT[q]:
                cands.append((float(conf), int(t), extra, hgt))
    cands.sort(reverse=True)
    out.append(dict(L, quadra=q, num=cands[0][1] if cands else None, cands=cands[:4]))
json.dump(out, open(sd + '/ocr2.json', 'w'))
by = collections.defaultdict(list)
for o in out: by[o['quadra']].append(o['num'])
for q in sorted(by):
    nums = by[q]; c = collections.Counter(nums)
    missing = sorted(set(range(1, CNT[q] + 1)) - set(n for n in nums if n))
    dups = {k: v for k, v in c.items() if v > 1}
    print(q, len(nums), 'missing', missing, 'dups', dups)

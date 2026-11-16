import cv2, numpy as np, json, sys, re, collections
sd = sys.argv[1]
DPI = int(sys.argv[2]); S = DPI / 72.0
img = cv2.imread(sd + '/clean1.png')
# beige = (B,G,R) ~ (199,242,255)
b, g, r = img[..., 0].astype(int), img[..., 1].astype(int), img[..., 2].astype(int)
mask = ((r > 235) & (g > 220) & (b > 160) & (b < 225)).astype(np.uint8)
# restrict to map area (exclude legend at x>655pt)
mask[:, int(655 * S):] = 0
n, lab, stats, cent = cv2.connectedComponentsWithStats(mask, connectivity=4)
words = json.load(open(sd + '/words1.json'))
nums = [w for w in words if re.fullmatch(r'\d{2}', w[4]) and w[0] < 655]
letters = {w[4]: ((w[0] + w[2]) / 2, (w[1] + w[3]) / 2) for w in words if w[4] in list('ABCDEFGHIJKLMNO') and w[0] < 655 and w[3] - w[1] > 5}
# blocks: close small gaps (lot divider lines) to merge lots of same quadra
k = np.ones((7, 7), np.uint8)
blk = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
nb, blab, bst, _ = cv2.connectedComponentsWithStats(blk, connectivity=4)
minarea = (3 * S) ** 2 * 4
comps = []
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] < minarea: continue
    comps.append(i)
print('components', len(comps))
# map letter -> block
blk_letter = {}
for L, (x, y) in letters.items():
    bi = blab[int(y * S), int(x * S)]
    blk_letter[bi] = L
print('letters', letters.keys(), 'blocks for letters', blk_letter)
res = []
for i in comps:
    ys, xs = np.where(lab == i)
    inside = []
    for w in nums:
        cx, cy = (w[0] + w[2]) / 2 * S, (w[1] + w[3]) / 2 * S
        ix, iy = int(cx), int(cy)
        if 0 <= iy < lab.shape[0] and 0 <= ix < lab.shape[1]:
            # sample small neighborhood since text pixels aren't beige
            win = lab[max(0, iy - 6):iy + 7, max(0, ix - 6):ix + 7]
            if (win == i).any(): inside.append(w[4])
    bi = collections.Counter(blab[ys, xs]).most_common(1)[0][0]
    res.append(dict(comp=int(i), block=int(bi), quadra=blk_letter.get(bi), nums=inside, area_px=int(stats[i, 4]), cx=float(cent[i][0] / S), cy=float(cent[i][1] / S)))
cnt = collections.Counter(x['quadra'] for x in res)
print(cnt)
print('blocks without letter', collections.Counter(x['block'] for x in res if not x['quadra']))
bad = [x for x in res if len(x['nums']) != 1]
print('bad', len(bad))
for x in bad[:60]: print(x['quadra'], x['nums'], x['area_px'], round(x['cx']), round(x['cy']))
json.dump(res, open(sd + '/seg1.json', 'w'))
np.save(sd + '/lab1.npy', lab)

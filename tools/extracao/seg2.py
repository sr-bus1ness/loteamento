import cv2, numpy as np, json, sys, collections
sd = sys.argv[1]; DPI = int(sys.argv[2]); S = DPI / 72.0
img = cv2.imread(sd + '/clean2_full.png')
b, g, r = [img[..., i].astype(int) for i in range(3)]
mask = ((r > 235) & (g > 220) & (b > 160) & (b < 225)).astype(np.uint8)
mask[int(1400 * S):, :] = 0
n, lab, stats, cent = cv2.connectedComponentsWithStats(mask, connectivity=4)
k = np.ones((9, 9), np.uint8)
blk = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
nb, blab, bst, bcent = cv2.connectedComponentsWithStats(blk, connectivity=4)
areas = sorted(stats[1:, 4])
print('n comps', n - 1, 'area quantiles', areas[:15], areas[len(areas)//2], areas[-5:])
minarea = areas[len(areas)//2] * 0.3
res = []
for i in range(1, n):
    if stats[i, 4] < minarea: continue
    ys, xs = np.where(lab == i)
    bi = collections.Counter(blab[ys, xs]).most_common(1)[0][0]
    res.append(dict(comp=i, block=int(bi), area_px=int(stats[i, 4]), cx=float(cent[i][0] / S), cy=float(cent[i][1] / S)))
print('lots', len(res))
cnt = collections.Counter(x['block'] for x in res)
print(cnt)
vis = cv2.cvtColor(mask * 200, cv2.COLOR_GRAY2BGR)
small = cv2.resize(vis, None, fx=0.25, fy=0.25)
for bi in cnt:
    cx, cy = bcent[bi]
    cv2.putText(small, str(bi), (int(cx * 0.25) - 10, int(cy * 0.25) + 10), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
cv2.imwrite(sd + '/seg2_blocks.png', small)
json.dump(res, open(sd + '/seg2.json', 'w'))
np.save(sd + '/lab2.npy', lab)

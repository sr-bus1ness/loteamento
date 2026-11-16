import cv2, numpy as np, json, sys, collections
sd = sys.argv[1]; S = 250 / 72.0
out = json.load(open(sd + '/ocr2.json'))
CNT = {'A': 23, 'B': 30, 'C': 43, 'D': 50, 'E': 50, 'F': 50, 'G': 25, 'H': 17, 'I': 27, 'J': 30, 'K': 16}
g = cv2.imread(sd + '/glyph2_full.png')
by = collections.defaultdict(list)
for o in out: by[o['quadra']].append(o)
tiles = []
for q, ls in by.items():
    c = collections.Counter(o['num'] for o in ls)
    missing = sorted(set(range(1, CNT[q] + 1)) - set(c))
    for m in missing:
        dupl = [o for o in ls if c[o['num']] > 1]
        best = None
        for o in dupl:
            others = sorted((o2 for o2 in ls if o2 is not o and c[o2['num']] == 1), key=lambda o2: (o2['cx'] - o['cx']) ** 2 + (o2['cy'] - o['cy']) ** 2)[:2]
            score = min(abs(o2['num'] - m) for o2 in others)
            score_cur = min(abs(o2['num'] - o['num']) for o2 in others)
            gain = score_cur - score
            if best is None or gain > best[0]: best = (gain, o, [o2['num'] for o2 in others])
        o = best[1]
        print(q, 'lot read', o['num'], '->', m, 'neighbors', best[2], 'cands', o['cands'])
        c[o['num']] -= 1; o['num'] = m; c[m] += 1; o['ocr_corrigido'] = True
        x, y = int(o['cx'] * S), int(o['cy'] * S)
        t = g[max(0, y - 60):y + 60, max(0, x - 60):x + 60].copy()
        t = cv2.resize(t, (240, 240))
        cv2.putText(t, f'{q}{m}', (5, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        tiles.append(t)
for q, ls in by.items():
    c = collections.Counter(o['num'] for o in ls)
    assert sorted(c) == list(range(1, CNT[q] + 1)) and all(v == 1 for v in c.values()), q
cv2.imwrite(sd + '/fix2.png', np.hstack(tiles))
json.dump(out, open(sd + '/ocr2_fixed.json', 'w'))
print('ok all quadras complete')

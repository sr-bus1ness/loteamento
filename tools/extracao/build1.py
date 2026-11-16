import cv2, numpy as np, json, sys, re, collections
sd = sys.argv[1]; S = 400 / 72.0
lab = np.load(sd + '/lab1.npy')
seg = json.load(open(sd + '/seg1.json'))
words = [w for w in json.load(open(sd + '/words1.json')) if w[0] < 655]
CNT = dict(zip('ABCDEFGHIJKLMNO', [12, 21, 24, 7, 36, 19, 36, 36, 36, 37, 40, 24, 46, 12, 12]))
def in_comp(w, i, r=6):
    cx, cy = (w[0] + w[2]) / 2 * S, (w[1] + w[3]) / 2 * S
    ix, iy = int(cx), int(cy)
    win = lab[max(0, iy - r):iy + r + 1, max(0, ix - r):ix + r + 1]
    return (win == i).any()
lots = []
for s in seg:
    i, q = s['comp'], s['quadra']
    ws = [w for w in words if in_comp(w, i)]
    nums = [int(w[4]) for w in ws if re.fullmatch(r'\d{2}', w[4]) and 1 <= int(w[4]) <= CNT[q]]
    # area: words like 160,Pð / 175,87 / 160
    area = None
    for w in ws:
        m = re.match(r'^(\d{3})(,(\d{2}))?', w[4])
        if m:
            area = float(m.group(1) + ('.' + m.group(3) if m.group(3) else ''))
            break
    m = (lab == i).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, 1.5, True)
    poly = [[round(float(p[0][0]) / S, 2), round(float(p[0][1]) / S, 2)] for p in c]
    lots.append(dict(quadra=q, nums=nums, area=area, poly=poly, cx=s['cx'], cy=s['cy'], px=s['area_px']))
# resolve numbers
by = collections.defaultdict(list)
for l in lots: by[l['quadra']].append(l)
for q, ls in by.items():
    used = collections.Counter(n for l in ls if len(l['nums']) == 1 for n in l['nums'])
    for l in ls:
        if len(l['nums']) == 1: l['num'] = l['nums'][0]
        elif len(l['nums']) > 1:
            free = [n for n in l['nums'] if used[n] == 0]
            l['num'] = free[0] if len(free) == 1 else None
            if l['num']: used[l['num']] += 1
        else: l['num'] = None
    missing = sorted(set(range(1, CNT[q] + 1)) - set(l['num'] for l in ls if l['num']))
    nonum = [l for l in ls if not l['num']]
    if len(missing) == 1 and len(nonum) == 1: nonum[0]['num'] = missing[0]; nonum[0]['num_inferido'] = True
    c = collections.Counter(l['num'] for l in ls)
    print(q, len(ls), 'missing', sorted(set(range(1, CNT[q] + 1)) - set(c)), 'dups', {k: v for k, v in c.items() if v > 1})
# area calibration check
ratios = [l['area'] / l['px'] for l in lots if l['area']]
k = float(np.median(ratios))
print('no area text', sum(1 for l in lots if not l['area']))
off = [(l['quadra'], l['num'], l['area'], round(l['px'] * k, 1)) for l in lots if l['area'] and abs(l['area'] - l['px'] * k) / l['area'] > 0.06]
print('area mismatch >6%', len(off), off[:20])
json.dump(lots, open(sd + '/lots1.json', 'w'))

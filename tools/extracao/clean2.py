import pymupdf as f, sys
# usage: clean2.py pdf out.png dpi "strokecolors" "fillcolors" [clip x0,y0,x1,y1]
src = f.open(sys.argv[1]); p = src[0]
out = sys.argv[2]; dpi = int(sys.argv[3])
parse = lambda s: [tuple(map(float, c.split(','))) for c in s.split(';') if c]
SC = parse(sys.argv[4]); FC = parse(sys.argv[5])
dr = p.get_drawings()
doc = f.open(); np_ = doc.new_page(width=p.rect.width, height=p.rect.height)
def draw_items(sh, items):
    for it in items:
        if it[0] == 'l': sh.draw_line(it[1], it[2])
        elif it[0] == 'c': sh.draw_bezier(it[1], it[2], it[3], it[4])
        elif it[0] == 're': sh.draw_rect(it[1])
        elif it[0] == 'qu': sh.draw_quad(it[1])
rnd = lambda c: tuple(round(v, 2) for v in c)
BEIGE = (1.0, 0.95, 0.78)
sh = np_.new_shape()
for x in dr:
    fl = x.get('fill')
    if fl and rnd(fl) == BEIGE:
        draw_items(sh, x['items']); sh.finish(fill=BEIGE, color=None, closePath=True, even_odd=x.get('even_odd', False))
sh.commit()
sh = np_.new_shape()
for x in dr:
    fl = x.get('fill'); col = x.get('color')
    if fl and rnd(fl) in FC:
        draw_items(sh, x['items']); sh.finish(fill=(0, 0, 0), color=None, closePath=True, even_odd=x.get('even_odd', False))
    elif x['type'] == 's' and col and rnd(col) in SC:
        draw_items(sh, x['items']); sh.finish(color=(0, 0, 0), width=max(x.get('width') or 0.1, 0.1), closePath=False)
sh.commit()
clip = f.Rect(*map(float, sys.argv[6].split(','))) if len(sys.argv) > 6 else None
np_.get_pixmap(dpi=dpi, clip=clip).save(out)

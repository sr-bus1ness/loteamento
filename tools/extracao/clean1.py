import pymupdf as f, sys
src = f.open(sys.argv[1]); p = src[0]
out_dir = sys.argv[2]
dr = p.get_drawings()
doc = f.open(); np_ = doc.new_page(width=p.rect.width, height=p.rect.height)
sh = np_.new_shape()
def draw_items(sh, items):
    for it in items:
        if it[0] == 'l': sh.draw_line(it[1], it[2])
        elif it[0] == 'c': sh.draw_bezier(it[1], it[2], it[3], it[4])
        elif it[0] == 're': sh.draw_rect(it[1])
        elif it[0] == 'qu': sh.draw_quad(it[1])
BEIGE = (1.0, 0.95, 0.78)
for x in dr:
    fl = x.get('fill')
    if fl and tuple(round(v, 2) for v in fl) == BEIGE:
        draw_items(sh, x['items'])
        sh.finish(fill=BEIGE, color=None, closePath=True, even_odd=x.get('even_odd', False))
sh.commit()
mode = sys.argv[3]
sh = np_.new_shape()
for x in dr:
    col = x.get('color')
    if x['type'] != 's' or not col: continue
    c = tuple(round(v, 2) for v in col)
    if c in [tuple(map(float, s.split(','))) for s in mode.split(';')]:
        draw_items(sh, x['items'])
        sh.finish(color=(0, 0, 0), width=max(x.get('width') or 0.1, 0.1), closePath=False)
sh.commit()
np_.get_pixmap(dpi=int(sys.argv[4])).save(out_dir + '/clean1.png')

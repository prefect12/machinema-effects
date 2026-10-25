import os
"""Rebuild editable title contours; never copies reference image pixels."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import json
D=Path(__file__).resolve().parent;C=json.loads((D/'config.json').read_text());f=TTFont(os.environ.get('MACHINEMA_EFFECTS_FONT',str(Path(__file__).resolve().parent/'assets/edit-font.otf')));gs=f.getGlyphSet();cm=f.getBestCmap();u=f['head'].unitsPerEm;text=C['title'];parts=[];x=0
for ch in text:
 if ord(ch) not in cm:raise ValueError('Selected font has no glyph: '+ch)
 name=cm[ord(ch)];p=SVGPathPen(gs);gs[name].draw(p);parts.append(f'<g transform="translate({x},0)"><path d="{p.getCommands()}"/></g>');x+=gs[name].width
out={text:{'width':x/u,'svg':f'<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale({1/u})">'+''.join(parts)+'</g></svg>'}}
(D/'assets/glyphs.json').write_text(json.dumps(out,ensure_ascii=False));print('Title contours rebuilt:',text)

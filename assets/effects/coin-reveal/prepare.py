import os
"""Regenerate metal title geometry after editing config.json; keep existing coin glyphs."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
root=Path(__file__).resolve().parent
cfg=json.loads((root/'config.json').read_text())
p=root/'assets/glyphs.json';out=json.loads(p.read_text())
font=TTFont(os.environ.get('MACHINEMA_EFFECTS_FONT',str(Path(__file__).resolve().parent/'assets/edit-font.otf')))
glyphs=font.getGlyphSet();cmap=font.getBestCmap();units=font['head'].unitsPerEm
for text in cfg['titles']:
 x=0;parts=[]
 for ch in text:
  if ord(ch) not in cmap:raise ValueError(f'Font has no glyph for {ch!r}')
  name=cmap[ord(ch)];pen=SVGPathPen(glyphs);glyphs[name].draw(pen)
  parts.append(f'<g transform="translate({x},0)"><path d="{pen.getCommands()}"/></g>');x+=glyphs[name].width
 out[text]={'width':x/units,'svg':f'<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale({1/units})">'+''.join(parts)+'</g></svg>'}
p.write_text(json.dumps(out,ensure_ascii=False));print('Generated title geometry:',', '.join(cfg['titles']))

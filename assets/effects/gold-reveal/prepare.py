import os
"""Build the editable answer symbol as beveled mesh contours."""
from pathlib import Path
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
root=Path(__file__).resolve().parent;cfg=json.load(open(root/'config.json'));path=root/'assets/glyphs.json';out=json.load(open(path));font=TTFont(os.environ.get('MACHINEMA_EFFECTS_FONT',str(Path(__file__).resolve().parent/'assets/edit-font.otf')));glyphs=font.getGlyphSet();cmap=font.getBestCmap();units=font['head'].unitsPerEm
for text in ['?',cfg['symbol']]:
 if not 1<=len(text)<=6:raise ValueError('中心符号须为1–6字')
 x=0;parts=[]
 for ch in text:
  if ord(ch)not in cmap:raise ValueError('字体不支持此字符：'+ch)
  name=cmap[ord(ch)];pen=SVGPathPen(glyphs);glyphs[name].draw(pen);parts.append(f'<g transform="translate({x},0)"><path d="{pen.getCommands()}"/></g>');x+=glyphs[name].width
 out[text]={'width':x/units,'svg':f'<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale({1/units})">'+''.join(parts)+'</g></svg>'}
path.write_text(json.dumps(out,ensure_ascii=False));print('Prepared symbol',cfg['symbol'])

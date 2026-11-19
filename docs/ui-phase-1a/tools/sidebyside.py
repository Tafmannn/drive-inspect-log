#!/usr/bin/env python3
"""Build before|after composites. usage: python3 -I sidebyside.py <before-shots-dir> <after-shots-dir> <out-dir>"""
import sys,os
from PIL import Image,ImageDraw,ImageFont
B,A,O=sys.argv[1:4]; os.makedirs(O,exist_ok=True)
try: F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
except Exception: F=ImageFont.load_default()
PAIRS=[f for f in sorted(os.listdir(B)) if f.endswith('.png') and os.path.exists(os.path.join(A,f))]
only=set(sys.argv[4].split(',')) if len(sys.argv)>4 else None
n=0
for f in PAIRS:
    if only and f not in only: continue
    ib=Image.open(os.path.join(B,f)).convert('RGB'); ia=Image.open(os.path.join(A,f)).convert('RGB')
    h=max(ib.height,ia.height); W=ib.width+ia.width+36
    C=Image.new('RGB',(W,h+74),(255,255,255)); d=ImageDraw.Draw(C)
    d.text((12,6),'BEFORE (main)',fill=(160,0,0),font=F); d.text((ib.width+36,6),'AFTER (Phase 1a)',fill=(0,110,40),font=F)
    d.text((12,38),f[:-4],fill=(90,90,90),font=ImageFont.load_default())
    C.paste(ib,(12,70)); C.paste(ia,(ib.width+24,70))
    C=C.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    C.save(os.path.join(O,'compare-'+f),format='PNG',optimize=True); n+=1
print('composites',n)

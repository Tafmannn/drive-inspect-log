#!/usr/bin/env python3
"""Classify every text-[8|9|10|11px] use in src/ by context so typography changes are made per context, not globally.
Usage: python3 -I small-text-contexts.py <repo-root> <out.json>"""
import re,sys,json,os,collections
root=sys.argv[1]; out=sys.argv[2]
pat=re.compile(r'text-\[(8|9|10|11)px\]')
rules=[('uppercase/tracked micro-label',lambda l,p,f:'uppercase' in l or 'tracking-' in l),
('badge / status pill',lambda l,p,f:'Badge' in l or ('rounded-full' in l and 'px-' in l) or 'statusStyle' in l),
('button label',lambda l,p,f:'<Button' in l or 'Button' in p),
('table header / cell',lambda l,p,f:re.search(r'<(th|td)\b|TableHead|TableCell|CompactColumn',l) is not None or 'Columns' in f),
('nav / tab label',lambda l,p,f:'BottomNav' in f or 'Sidebar' in f or 'Tabs' in f),
('numeric / count / mono',lambda l,p,f:'tabular-nums' in l or 'font-mono' in l),
('form label / helper under input',lambda l,p,f:'<Label' in l or '<label' in l or 'FormDescription' in l),
('caption / helper paragraph',lambda l,p,f:re.search(r'<p\b|<span\b',l) is not None and ('muted-foreground' in l or 'text-foreground/' in l)),
]
res=[];byc=collections.Counter();bys=collections.Counter();byf=collections.Counter();matrix=collections.Counter();ex={}
for dp,dn,fn in os.walk(os.path.join(root,'src')):
    if '/test' in dp or '/node_modules' in dp: continue
    for f in fn:
        if not f.endswith(('.tsx','.ts')): continue
        p=os.path.join(dp,f); lines=open(p,errors='ignore').read().split('\n')
        for i,l in enumerate(lines):
            for m in pat.finditer(l):
                prev=' '.join(lines[max(0,i-3):i])
                cat='other / unclassified'
                for name,fn_ in rules:
                    if fn_(l,prev,p): cat=name;break
                size=m.group(1); byc[cat]+=1; bys[size]+=1; byf[os.path.relpath(p,root)]+=1; matrix[(cat,size)]+=1
                ex.setdefault(cat,[]).append(os.path.relpath(p,root)+':'+str(i+1)+'  '+l.strip()[:110])
tot=sum(byc.values())
data={'total':tot,'by_size':dict(bys),'by_category':dict(byc),'top_files':byf.most_common(15),'matrix':{f'{k[0]} | {k[1]}px':v for k,v in sorted(matrix.items())},'examples':{k:v[:3] for k,v in ex.items()}}
json.dump(data,open(out,'w'),indent=1); print(tot,dict(bys)); 
for k,v in byc.most_common(): print(f'{v:4} {k}')

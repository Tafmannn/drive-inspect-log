#!/usr/bin/env python3
"""Compare p1a-measure before/after JSON. usage: python3 -I compare-metrics.py <before.json> <after.json> <out.json>"""
import json,sys,collections,statistics
b=json.load(open(sys.argv[1]))['metrics']; a=json.load(open(sys.argv[2]))['metrics']
fb=json.load(open(sys.argv[1]))['focus']; fa=json.load(open(sys.argv[2]))['focus']
def key(m): return (m['kind'],m['theme'],m['slug'],m['w'])
def totals(ms,flt):
    sel=[m for m in ms if flt(m)]
    return {'items':len(sel),'text_nodes':sum(m['n'] for m in sel),'below_12px':sum(m['small'] for m in sel),'contrast_fail':sum(len(m['fail']) for m in sel),'doc_overflow':sum(1 for m in sel if m['docOverflow'])}
out={}
for name,flt in [('routes light 1440 (excl. login)',lambda m:m['kind']=='route' and m['theme']=='light' and m['w']==1440 and m['slug']!='login'),
                 ('routes light 390 (excl. login)',lambda m:m['kind']=='route' and m['theme']=='light' and m['w']==390 and m['slug']!='login'),
                 ('routes dark 1440 (excl. login)',lambda m:m['kind']=='route' and m['theme']=='dark' and m['w']==1440 and m['slug']!='login'),
                 ('routes dark 390 (excl. login)',lambda m:m['kind']=='route' and m['theme']=='dark' and m['w']==390 and m['slug']!='login'),
                 ('fixture (real components) light 1440',lambda m:m['kind']=='fixture' and m['theme']=='light' and m['w']==1440),
                 ('fixture (real components) light 390',lambda m:m['kind']=='fixture' and m['theme']=='light' and m['w']==390),
                 ('fixture (real components) dark 1440',lambda m:m['kind']=='fixture' and m['theme']=='dark' and m['w']==1440),
                 ('fixture (real components) dark 390',lambda m:m['kind']=='fixture' and m['theme']=='dark' and m['w']==390)]:
    out[name]={'before':totals(b,flt),'after':totals(a,flt)}
def topfails(ms,flt,n=10):
    c=collections.Counter();w={}
    for m in ms:
        if flt(m):
            for f in m['fail']: c[f['t']]+=1; w[f['t']]=min(w.get(f['t'],99),f['ratio'])
    return [[t,k,w[t]] for t,k in c.most_common(n)]
out['top_fail_after_light_1440']=topfails(a,lambda m:m['kind']=='route' and m['theme']=='light' and m['w']==1440 and m['slug']!='login')
out['top_fail_before_light_1440']=topfails(b,lambda m:m['kind']=='route' and m['theme']=='light' and m['w']==1440 and m['slug']!='login')
out['top_fail_after_fixture_light']=topfails(a,lambda m:m['kind']=='fixture' and m['theme']=='light' and m['w']==1440)
out['top_fail_before_fixture_light']=topfails(b,lambda m:m['kind']=='fixture' and m['theme']=='light' and m['w']==1440)
out['top_fail_after_fixture_dark']=topfails(a,lambda m:m['kind']=='fixture' and m['theme']=='dark' and m['w']==1440)
out['top_fail_after_dark_1440']=topfails(a,lambda m:m['kind']=='route' and m['theme']=='dark' and m['w']==1440 and m['slug']!='login')
def bound(ms,theme):
    d=collections.defaultdict(list)
    for m in ms:
        if m['theme']==theme:
            for x in m['nt']: d[x['k']].append(x['r'])
    return {k:{'n':len(v),'min':min(v),'median':round(statistics.median(v),2),'below3':sum(1 for r in v if r<3)} for k,v in d.items()}
for th in ('light','dark'): out['boundary_'+th]={'before':bound(b,th),'after':bound(a,th)}
def foc(f): 
    tot=len(f);vis=sum(1 for x in f if x['visible']);return {'stops':tot,'visible':vis,'not_visible':tot-vis,'not_visible_samples':[(x['kind'],x.get('slug',''),x['tag'],x['txt']) for x in f if not x['visible']][:6]}
out['focus']={'before':foc(fb),'after':foc(fa)}
# overflow by width
ov=collections.defaultdict(lambda:[0,0])
for m in a:
    if m['kind']=='route': ov[m['w']][0]+=1; ov[m['w']][1]+= 1 if m['docOverflow'] else 0
out['overflow_after_by_width']={str(w):{'checked':v[0],'overflowing':v[1]} for w,v in sorted(ov.items())}
ovb=collections.defaultdict(lambda:[0,0])
for m in b:
    if m['kind']=='route': ovb[m['w']][0]+=1; ovb[m['w']][1]+= 1 if m['docOverflow'] else 0
out['overflow_before_by_width']={str(w):{'checked':v[0],'overflowing':v[1]} for w,v in sorted(ovb.items())}
json.dump(out,open(sys.argv[3],'w'),indent=1)
for k,v in out.items():
    if isinstance(v,dict) and 'before' in v and 'text_nodes' in v['before']: print(f"{k:42} before {v['before']['text_nodes']:4} nodes {v['before']['below_12px']:4} <12px {v['before']['contrast_fail']:4} fail | after {v['after']['text_nodes']:4} nodes {v['after']['below_12px']:4} <12px {v['after']['contrast_fail']:4} fail")
print('focus',out['focus']['before']['stops'],out['focus']['before']['not_visible'],'->',out['focus']['after']['stops'],out['focus']['after']['not_visible'])

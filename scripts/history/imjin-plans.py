"""Generate bounded v4 ChangePlans; applying them requires live validation/readback."""
import json, runpy
from datetime import date, timedelta
from pathlib import Path
from korean_lunar_calendar import KoreanLunarCalendar

root=Path(__file__).resolve().parents[2]
d=runpy.run_path(str(Path(__file__).with_name('imjin-data.py')))
E,S,WORLD,TIME,CANON,uid=[d[k] for k in ['E','S','WORLD','TIME','CANON','uid']]
by={e['key']:e for e in E}
OUT=d['OUT']; OUT.mkdir(parents=True,exist_ok=True)

def lunar(y,m,day):
    c=KoreanLunarCalendar()
    assert c.setLunarDate(y,m,day,False),(y,m,day)
    return date.fromisoformat(c.SolarIsoFormat())
def bounds(t):
    if t[0]=='L':
        lo=lunar(*t[1:]); return lo,lo+timedelta(days=1)
    if t[0]=='LR': return lunar(*t[1:4]),lunar(*t[4:7])+timedelta(days=1)
    if t[0]=='G':
        lo=date.fromisoformat(t[1]);return lo,lo+timedelta(days=1)
    if t[0]=='GR': return date.fromisoformat(t[1]),date.fromisoformat(t[2])
    raise ValueError(t)
def origin(index=0): return [{'field':'*','origin_index':index}]
def create(typ,id,value,oi=0):return dict(kind='create',entity_type=typ,entity_id=id,origin_refs=origin(oi),value=value)
def member(typ,id,canon=CANON): return dict(kind='add',entity_type=typ+'_canon_membership',origin_refs=origin(1),value={typ+'_id':id,'canon_id':canon})
def eref(key):return {'kind':'event','event_id':by[key]['id']}
def tref(dt):return dict(kind='time_event',time_system_ref={'time_system_id':TIME},definition_version='1',coordinate=dt.isoformat()+'T00:00:00.000000000000Z')
counter=10000
def relation(typ,src,tgt,attrs=None):
    global counter
    counter+=1;id=uid(counter)
    return [create('relation',id,dict(world_id=WORLD,type=typ,source_ref=src,target_ref=tgt,direction='directed',attributes=attrs or {}),1),member('relation',id)]

BATCHES=[
 ('initial',['war','invasion','busan','dongnae','sangju','chungju']),
 ('government',['government','flight','hanyang','pyongyang-fall','uiju','bunjo']),
 ('naval',['naval','okpo','sacheon','dangpo','danghang','hansan','busanpo']),
 ('local',['local','gwak','jeongam','ichi','cheongju','geumsan','jinju1']),
 ('ming',['ming','ming-first','pyongyang-retaken','byeok','haengju']),
 ('diplomacy',['diplomacy','talks','hanyang-retaken','jinju2','training','breakdown']),
 ('jeongyu',['jeongyu','reinvasion','dismiss','chilcheon','restore']),
 ('jeongyu-fronts',['namwon','jiksan','myeongnyang','ulsan1']),
 ('late',['late','hideyoshi','saro','suncheon']),
 ('withdrawal',['withdrawal','noryang','yi-death','withdraw']),
 ('prewar',['prewar','envoys','mobilization'])
]
LINKS=[
 ('busan','dongnae','precedes'),('dongnae','sangju','precedes'),('sangju','chungju','precedes'),
 ('chungju','flight','influences'),('flight','hanyang','precedes'),('hanyang','pyongyang-fall','precedes'),('flight','uiju','precedes'),
 ('okpo','sacheon','precedes'),('sacheon','dangpo','precedes'),('dangpo','danghang','precedes'),('danghang','hansan','precedes'),('hansan','busanpo','precedes'),
 ('gwak','jeongam','enables'),('cheongju','geumsan','precedes'),('jeongam','jinju1','influences'),
 ('uiju','ming-first','influences'),('ming-first','pyongyang-retaken','precedes'),('pyongyang-retaken','byeok','precedes'),('byeok','talks','influences'),('haengju','hanyang-retaken','influences'),('talks','hanyang-retaken','influences'),
 ('jinju1','jinju2','precedes'),('talks','breakdown','precedes'),('breakdown','reinvasion','influences'),('dismiss','chilcheon','precedes'),('chilcheon','restore','influences'),('restore','myeongnyang','enables'),('reinvasion','namwon','precedes'),('namwon','jiksan','precedes'),('jiksan','ulsan1','precedes'),('myeongnyang','suncheon','enables'),('ulsan1','saro','precedes'),('hideyoshi','withdraw','influences'),('suncheon','noryang','influences'),('noryang','yi-death','causes'),('noryang','withdraw','precedes'),('mobilization','busan','precedes')
]
seen=set();linked=set();plans=[]
for bi,(name,keys) in enumerate(BATCHES):
    if not all(k in by for k in keys):continue
    ops=[]
    for key in keys:
        e=by[key]; refs=[S[s] for s in e['refs']]
        attrs={'front':e['group'] or 'overview','source_references':refs,'historical_identity_key':key}
        if e['dates']:
            lo,hi=bounds(e['dates'])
            attrs.update(date_precision='day' if (hi-lo).days==1 else 'range',date_original=e['dates'],gregorian_lower=lo.isoformat(),gregorian_upper_exclusive=hi.isoformat())
            if e['dates'][0].startswith('L'):attrs['calendar_conversion']={'implementation':'korean-lunar-calendar 0.3.1','calendar':'Korean lunisolar, non-intercalary month','output':'proleptic Gregorian; computational conversion, original date retained'}
        if e.get('note'):attrs['source_annotation']=e['note']
        ops.extend([create('event',e['id'],dict(world_id=WORLD,slug='imjin-'+key,kind=e['kind'],title=e['title'],summary=e['body'].split('。')[0].split('\n')[0][:240],roles=[],attributes=attrs)),member('event',e['id']),create('narrative',uid(2000+E.index(e)),dict(canon_id=CANON,scope_type='event',scope_id=e['id'],locale='ko',kind='primary',title=e['title'],body=e['body'],public_references=refs))])
        if e['dates']:
            ops+=relation('not_after',tref(lo),eref(key))
            ops+=relation('precedes',eref(key),tref(hi))
        if e['group']:ops+=relation('contains',eref(e['group']),eref(key),{'basis':'thematic inclusion'})
    seen.update(keys)
    for a,b,t in LINKS:
        if a in seen and b in seen and (a,b,t) not in linked:
            ops+=relation(t,eref(a),eref(b),{'basis':'documented sequence' if t=='precedes' else 'historical interpretation','source_references':[S[k] for k in by[b]['refs']]})
            linked.add((a,b,t))
    assert len(ops)<=100,(name,len(ops))
    p=dict(contract_version=4,change_set_id=uid(10+bi),world_id=WORLD,expected_revision=12+len(plans),intent=f'IP-009 {name}: 사료 대조 후 World identity 중복 없이 사건·서술·containment와 부분 선후관계를 추가한다.',origins=[{'kind':'source_explicit','summary':'각 Event attributes와 Narrative public_references에 연결된 공개 사료·연구 해설의 사건 사실. 실록 기사일과 사건일을 구분하며 원 음력 날짜를 보존한다.'},{'kind':'llm_inference','summary':'사용자 지시에 따른 주제별 Composite와 부분 관계 구성. 본문은 출처를 종합한 독자용 서술이며, 인과 관계는 해석적 관계로 명시했다. 날짜 충돌은 범위와 별도 메타데이터로 기록한다.'}],operations=ops)
    plans.append(p);(OUT/f'plan-{bi+1:02d}-{name}.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
(OUT/'events.json').write_text(json.dumps(E,ensure_ascii=False,indent=2)+'\n')
(OUT/'sources.json').write_text(json.dumps(S,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{'revision':p['expected_revision']+1,'operations':len(p['operations']),'id':p['change_set_id']} for p in plans]))

"""Build reviewable IP-010 plans from an exact r28 World export; never writes Live.

Usage: python scripts/history/japan-correction.py EXPORT_JSON OUTPUT_DIRECTORY
No Japanese lunisolar date is passed to a Korean calendar converter.
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

WORLD = '01995c2a-7b00-7000-8000-000000000101'
CANON = '01a0c8c3-544c-756a-968c-0a5bb38452ea'
TIME = '019f5b00-0000-7000-8000-000000000003'
S = {
 'aichi': ('愛知県図書館 — 郷土の三英傑年表', 'https://www.aichi-pref-library.jp/s005/about/area/010/050/20250316174437.html'),
 'kyoto': ('京都文化博物館 — 信長上洛', 'https://www.bunpaku.or.jp/exhi_sogo_post/nobunagazyouraku450/'),
 'firearms': ('鹿児島県 — 鉄砲伝来', 'http://www.pref.kagoshima.jp/aa02/pr/gaiyou/itiban/hatu/teppo.html'),
 'honnoji': ('大山崎町 — 本能寺の変、旧暦と新暦', 'http://www.town.oyamazaki.kyoto.jp/annai/kikakuzaisei/kannkou/kanko/machinokankosupotto/tenkawakemenotennozan/hideyosinomiti/930.html'),
 'yamazaki': ('大山崎町 — 山崎合戦、新暦1582年7月12日', 'http://www.town.oyamazaki.kyoto.jp/annai/kikakuzaisei/kannkou/kanko/machinokankosupotto/tenkawakemenotennozan/hideyosinomiti/962.html'),
 'osaka': ('大阪城天守閣 — 豊臣秀吉と大阪城', 'https://osakac.xsrv.jp/library/history/toyotomi/'),
 'kyushu': ('九州国立博物館 — 豊臣秀吉朱印状', 'https://collection.kyuhaku.jp/advanced/37106.html'),
 'sword': ('國學院雑誌122(11) — 天正十六年七月八日付秀吉朱印状二種の公布状況', 'https://k-rain.repo.nii.ac.jp/record/703/files/kokugakuinzasshi_122_11_021.pdf'),
 'odawara': ('文化庁 — 豊臣秀吉朱印状', 'https://online.bunka.go.jp/index.php/heritages/detail/238525'),
 'archives': ('国立公文書館 — 家康、天下人への道', 'https://www.archives.go.jp/exhibition/digital/ieyasu/contents3_01/'),
 'sekigahara': ('岐阜県 — 関ケ原合戦、西暦1600年10月21日', 'https://www.pref.gifu.lg.jp/uploaded/attachment/207585.pdf'),
 'edo': ('江戸東京博物館 — 大関ヶ原展', 'https://www.edo-tokyo-museum.or.jp/s-exhibition/daisekigahara/'),
}
# Original Japanese dates remain strings; only explicitly sourced new-calendar
# dates become Gregorian day assertions. Y/R bounds are knowledge buckets.
D = [
 ('onin-war', 'year-range', '1467', '1477', '応仁元年〜文明9年', ['kyoto'], '전쟁 전체의 연도 범위. 정확한 개시·종결일을 주장하지 않는다.'),
 ('firearms-portuguese', 'year', '1543', None, '天文12年', ['firearms'], '전래 연도만 채택. 월일 변환 미검증.'),
 ('okehazama', 'year', '1560', None, '永禄3年', ['aichi'], '월일 변환 미검증. 연도 정밀도.'),
 ('nobunaga-kyoto', 'year', '1568', None, '永禄11年9月26日', ['kyoto'], '일본 구력 원일은 보존하되 Gregorian 월일 변환 미검증.'),
 ('muromachi-fall', 'year', '1573', None, '天正元年', ['aichi','kyoto'], '막부 붕괴 연도. 월일 변환 미검증.'),
 ('nagashino', 'year', '1575', None, '天正3年', ['aichi'], '월일 변환 미검증. 연도 정밀도.'),
 ('honnoji', 'day', '1582-07-01', None, '天正10年6月2日', ['honnoji'], '대야마자키정의 명시적 신력 7월1일. Julian 6월21일과 혼동하지 않는다.'),
 ('yamazaki-hideyoshi', 'day', '1582-07-12', None, '天正10年6月13日', ['yamazaki'], '좌표는 야마자키 전투의 날짜. 이후 권력 장악 전체가 하루에 끝났다는 뜻이 아니다.'),
 ('osaka-castle', 'year', '1583', None, '天正11年', ['osaka'], '1583은 축성 착수 연도이며 정권 형성·성 완공 전체의 종결일이 아니다.'),
 ('kyushu-campaign', 'year', '1587', None, '天正15年5月（平定）', ['kyushu'], '규슈 평정 연도. 일본 구력 5월을 Gregorian 5월로 바꾸지 않는다.'),
 ('sword-hunt', 'year', '1588', None, '天正16年7月8日（刀狩令）', ['sword'], '명령 원일 보존. 시행·병농 분리는 과정이며 정확한 Gregorian 일자 변환은 미검증.'),
 ('odawara-unification', 'year', '1590', None, '天正18年', ['odawara'], '오다와라 정벌과 통일의 연도. 월일 변환 미검증.'),
 ('hideyoshi-succession-crisis', 'year-range', '1598', '1600', '慶長3年（秀吉死後）〜慶長5年（関ケ原）', ['archives','edo'], '사후 권력 재편의 해석적 기간. 1600년1월1일 종결이라는 기존 임의 경계를 제거한다.'),
 ('sekigahara', 'day', '1600-10-21', None, '慶長5年9月15日', ['sekigahara','archives'], '기후현이 신력과 구력을 함께 명시.'),
 ('tokugawa-shogunate', 'year', '1603', None, '慶長8年2月12日', ['archives'], '정이대장군 임명 원일 보존. Gregorian 월일 변환 미검증.'),
 ('osaka-siege', 'year-range', '1614', '1615', '慶長19年（冬の陣）〜慶長20年（夏の陣）', ['osaka','edo'], '동·하계 전역을 포함한 연도 범위. 종료일을 임의로 확정하지 않는다.'),
]

def build(snapshot):
    assert snapshot['world']['id'] == WORLD
    by = {e['slug']: e for e in snapshot['events']}
    relations = [r for r in snapshot['relations'] if CANON in r['canon_memberships']]
    assert len(relations) == 35
    assert not any(r['source_ref']['kind'] == 'time_event' or r['target_ref']['kind'] == 'time_event' for r in relations)
    uid = lambda n: f'01a10010-0000-7000-8000-{n:012d}'
    ref = lambda id: dict(kind='event', event_id=id)
    tref = lambda dt: dict(kind='time_event',time_system_ref={'time_system_id':TIME},definition_version='1',coordinate=dt+'T00:00:00.000000000000Z')
    member = lambda typ,id: dict(kind='add',entity_type=typ+'_canon_membership',value={typ+'_id':id,'canon_id':CANON})
    ops=[]; audit=[]; counter=1000
    def relation(typ,source,target,attrs):
        nonlocal counter
        counter+=1;id=uid(counter)
        return [dict(kind='create',entity_type='relation',entity_id=id,value=dict(world_id=WORLD,type=typ,source_ref=source,target_ref=target,direction='directed',attributes=attrs)),member('relation',id)]
    for slug,precision,lo,hi,original,sources,note in D:
        event=by['japan-'+slug]
        refs=[dict(label=S[k][0],url=S[k][1]) for k in sources]
        lower=lo if precision=='day' else lo+'-01-01'
        upper=(date.fromisoformat(lo)+timedelta(days=1)).isoformat() if precision=='day' else str(int(hi or lo)+1)+'-01-01'
        attrs={k:v for k,v in event['attributes'].items() if k not in ['gregorian_lower','gregorian_upper_exclusive','date_original','date_precision','source_references']}
        attrs.update(date_precision=precision,date_original={'calendar':'Japanese historical lunisolar','text':original},source_references=refs,source_annotation=note,calendar_conversion={'status':'source-explicit Gregorian' if precision=='day' else 'year-only; month/day conversion unverified','policy':'No Korean lunisolar converter used; January 1 bounds are year-bucket limits, not occurrence dates.'})
        if precision=='day': attrs.update(gregorian_date=lo)
        elif precision=='year': attrs.update(historical_year=int(lo))
        else: attrs.update(historical_year_range=[int(lo),int(hi)])
        ops.append(dict(kind='update',entity_type='event',value=dict(event_id=event['id'],attributes=attrs)))
        bounds_attrs={'basis':'historical knowledge bound; not an exact occurrence date','precision':precision,'source_references':refs}
        ops+=relation('not_after',tref(lower),ref(event['id']),bounds_attrs)
        ops+=relation('precedes',ref(event['id']),tref(upper),bounds_attrs)
        audit.append(dict(id=event['id'],slug=event['slug'],title=event['title'],before=event['attributes'],after=attrs,canonical_lower_inclusive=lower,canonical_upper_exclusive=upper))
    relation_audit=[]
    names={e['id']:e['slug'] for e in snapshot['events']}
    for r in relations:
        withdraw=r['type']=='precedes'
        if withdraw:
            assert r['canon_memberships']==[CANON], 'Never withdraw a shared relation globally'
            ops.append(dict(kind='remove',entity_type='relation_canon_membership',value={'relation_id':r['id'],'canon_id':CANON}))
            ops.append(dict(kind='withdraw',entity_type='relation',value={'relation_id':r['id']}))
        reason = '연표 나열을 위한 중복/과도한 선후 제약. 절대 시간 bounds로 대체.' if withdraw else ('주제별 실제 하위 사건 포함. starts/ends 또는 명시적 Duration을 새로 주장하지 않는다.' if r['type']=='contains' else '직접적인 역사적 연결의 해석. 원인/가능 조건/영향은 절대 시간 좌표를 대체하지 않는다.')
        relation_audit.append(dict(id=r['id'],type=r['type'],source=names[r['source_ref']['event_id']],target=names[r['target_ref']['event_id']],action='withdraw' if withdraw else 'retain',reason=reason))
    def share_time(slug):
        event=by[slug]
        anchors=[r for r in snapshot['relations'] if (r['source_ref'].get('event_id')==event['id'] and r['target_ref']['kind']=='time_event') or (r['target_ref'].get('event_id')==event['id'] and r['source_ref']['kind']=='time_event')]
        assert len(anchors)==2
        return [member('relation',r['id']) for r in anchors]
    for slug in ['imjin-hideyoshi','imjin-mobilization']: ops+=share_time(slug)
    for slug in ['japan-nobunaga-era','japan-hideyoshi-era','japan-tokugawa-era']:
        e=by[slug];attrs=dict(e['attributes']);attrs.update(temporal_scope='descendant span; no asserted Duration or boundary Event',source_references=[dict(label=S[k][0],url=S[k][1]) for k in ['aichi','archives','osaka']])
        ops.append(dict(kind='update',entity_type='event',value=dict(event_id=e['id'],attributes=attrs)))
    assert len(ops)==113
    second=[op for op in ops if op['kind']=='update']
    ops=[op for op in ops if op['kind']!='update']
    # Reuse existing first/last atomic witnesses, without copying the entire war
    # subtree into this overview Canon or changing existing Imjin assertions.
    for slug in ['imjin-busan','imjin-withdraw']:
        e=by[slug];second.append(member('event',e['id']));second+=share_time(slug)
        second+=relation('contains',ref(by['imjin-war']['id']),ref(e['id']),{'basis':'war overview boundary witnesses; existing World Events reused'})
    second.append(dict(kind='update',entity_type='world',value=dict(world_id=WORLD,slug=snapshot['world']['slug'],title='동아시아사 — 조선과 일본',description='황산대첩(1380)부터 오사카 전투(1615)까지, 조선과 일본의 정치·문화·전쟁을 여러 Canon에서 탐색한다. 임진왜란 사건은 양국의 Canon에서 같은 World identity로 공유한다. 동아시아 전체를 망라한 통사는 아니다.')))
    origins=[{'kind':'human_instruction','summary':'IP-010: 사용자가 승인한 일본사 chronology E2E 교정. r27~28 일본사 신규 데이터만 metadata 교정/관계 철회; 기존 임진왜란 사실과 identity 보존.'},{'kind':'source_explicit','summary':'각 교정 Event 및 Time Event 관계의 source_references에 일본 공공기관·박물관·학술자료 기록. 구력 원문과 Gregorian 변환 검증 상태를 분리.'}]
    plans=[dict(contract_version=4,change_set_id=uid(i+1),world_id=WORLD,expected_revision=28+i,intent=intent,origins=origins,operations=batch) for i,(batch,intent) in enumerate([(ops,'IP-010 일본사: 설명 날짜와 canonical Time Event 분리, 13개 연표 chain 철회, 공유 시간관계 복원.'),(second,'IP-010 임진왜란 overview의 기존 경계 사건 재사용 및 World 범위 명칭 정합화.')])]
    for plan in plans:
        for op in plan['operations']:
            op['origin_refs']=[{'field':'*','origin_index':0 if op['kind'] in ['remove','withdraw'] else 1}]
    return plans,audit,relation_audit

if __name__=='__main__':
    snapshot=json.loads(Path(sys.argv[1]).read_text());out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
    plans,events,relations=build(snapshot)
    for i,p in enumerate(plans): (out/f'plan-{i+1:02d}.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
    (out/'event-audit.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
    (out/'relation-audit.json').write_text(json.dumps(relations,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps([{'revision':p['expected_revision']+1,'operations':len(p['operations'])} for p in plans]))

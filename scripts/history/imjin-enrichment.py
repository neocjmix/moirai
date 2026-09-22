"""Reader enrichment and multi-Canon identity reuse, after revision 23."""
import json, runpy
from pathlib import Path
d=runpy.run_path(str(Path(__file__).with_name('imjin-data.py')))
E,S,WORLD,TIME,CANON,SEA,uid,OUT=[d[k] for k in ['E','S','WORLD','TIME','CANON','SEA','uid','OUT']]
by={e['key']:e for e in E}
o=[{'field':'*','origin_index':0}]
def create(t,i,v):return dict(kind='create',entity_type=t,entity_id=i,origin_refs=o,value=v)
def member(t,i,c):return dict(kind='add',entity_type=t+'_canon_membership',origin_refs=o,value={t+'_id':i,'canon_id':c})
def plan(n,rev,intent,ops):
    p=dict(contract_version=4,change_set_id=uid(n),world_id=WORLD,expected_revision=rev,intent=intent,origins=[dict(kind='llm_inference',summary='공개 사료 대조에 따른 서술과 주석 보강. 기존 Event identity를 공유하고 Canon 관점의 Narrative와 membership만 추가한다.')],operations=ops)
    assert len(ops)<=100
    return p
ops=[]
for key in ['sacheon','dangpo']:
    e=by[key]
    ops.append(dict(kind='update',entity_type='narrative',origin_refs=o,value=dict(narrative_id=uid(2000+E.index(e)),canon_id=CANON,scope_type='event',scope_id=e['id'],locale='ko',kind='primary',title=e['title'],body=e['body'],public_references=[S[k] for k in e['refs']]+[S['diary']])))
for i,e in enumerate(E):
    if e['note'] and e['key']!='yi-death':
        ops.append(create('narrative',uid(3000+i),dict(canon_id=CANON,scope_type='event',scope_id=e['id'],locale='ko',kind='annotation',title='날짜와 사료 읽기',body=e['note'],public_references=[S[k] for k in e['refs']])))
ops.append(create('narrative',uid(3100),dict(canon_id=CANON,scope_type='canon',scope_id=CANON,locale='ko',kind='primary',title='전쟁을 여러 전선에서 읽기',body='임진왜란은 부산에서 노량으로 곧장 이어지는 하나의 진군로가 아니었다. 국왕과 조정은 북쪽으로 이동했고, 일본 육군은 여러 길로 북상했다. 남해에서는 조선 수군이 싸웠으며 각지에서는 의병과 관군, 승군이 점령군의 길목을 위협했다. 명군의 참전 뒤에는 연합 작전과 강화교섭이 전쟁의 또 다른 축이 되었다.\n\n초기의 침공과 반격, 수년간의 교섭, 정유재란과 마지막 철수를 함께 살피면 한 전투의 승패가 다른 전선과 어떻게 맞물렸는지 이해할 수 있다. 성을 지킨 군민과 전선을 움직인 격군, 군량을 나른 주민, 전쟁으로 삶의 터전을 잃은 사람들도 이 역사의 일부였다.',public_references=[S['invasion'],S['talks'],S['jeongyu']])))
enrich=plan(30,23,'IP-009 J: 난중일기 직접 인용 자료를 보강하고 날짜·사료 주석을 본문과 분리한다.',ops)
(OUT/'plan-12-enrichment.json').write_text(json.dumps(enrich,ensure_ascii=False,indent=2)+'\n')

stories={
'okpo':'옥포의 승리는 전라좌수군과 경상우수군이 정보를 모으고 함대를 합쳐 첫 출전에 성공했다는 점에서 중요하다. 정박한 일본 선박을 찾아 공격한 뒤 다른 포구로 이동하는 작전은 넓은 바다에서 우연히 적을 만난 싸움과 달랐다. 정찰과 해안 정보, 함선의 정비가 전투의 전제였다.\n\n+이순신의 함대는 적선을 파괴하고 귀환하면서 다음 출전에 필요한 경험을 얻었다. 그러나 매번 출전하려면 격군과 병사에게 식량을 공급하고 손상된 배와 무기를 고쳐야 했다. 옥포는 이후 해상 반격의 출발점이자, 지방 수영의 조직과 군수 기반이 전쟁에 실제로 작동하기 시작한 사건이다.',
'sacheon':'사천에서는 적이 유리한 포구와 육상 진지에 의지하고 있었다. 조선 수군은 수심과 조수를 고려해 전투 위치를 바꾸려 했고 거북선과 화포를 활용했다. 이순신의 난중일기에는 자신과 군관 나대용이 총탄을 맞은 사실도 남아 있다. 승리는 적의 공격을 받지 않는 일방적인 전투에서 나온 것이 아니었다.\n\n+지휘관이 부상한 상황에서도 함대는 작전을 이어갔다. 사천은 군함의 성능뿐 아니라 지형 판단, 여러 배의 협동과 지휘 유지가 중요했음을 보여 준다. 이후 당포로 향한 연속 작전은 한 해전의 전과를 다음 항구에 대한 압박으로 연결했다.',
'dangpo':'당포에서 조선군은 적의 큰 지휘선을 집중 공격했다. 난중일기의 해당 날짜 기록은 일본군의 배 위 구조물과 지휘관의 모습, 화살과 총통을 이용한 공격을 전한다. 지휘선의 타격은 적의 전열을 흔드는 효과를 낳았다.\n\n+이 전투는 사천에서 시작한 출전 중에 벌어졌다. 함대가 여러 포구를 연속해서 공격하려면 항해 정보와 병력의 피로, 탄약과 식량을 관리해야 했다. 당포의 승리는 개별 전술의 성과이면서 여러 수영의 함선이 지속적으로 움직이는 작전 체계의 일부였다.',
'danghang':'당항포에 이르기 전 이억기의 전라우수군이 합류하면서 작전은 더 큰 연합함대의 활동으로 발전했다. 서로 다른 수영의 배들이 같은 목표를 향해 움직였고, 포구 안의 적을 공격하면서 퇴로와 상륙 가능성을 함께 고려했다.\n\n+전투의 성과는 적선을 파괴한 숫자만으로 설명되지 않는다. 여러 수영의 지휘와 이동을 조정하는 경험, 남해안의 항구를 안전한 일본군 집결지로 남겨 두지 않는 압박이 축적되었다. 이 전투는 1592년의 첫 당항포 작전이며 1594년의 같은 장소 전투와는 구별된다.',
'hansan':'한산도에서 조선 수군은 견내량의 좁은 수역을 피하고 넓은 해면으로 일본 함대를 유인했다. 학익진과 집중 포격이 효과를 내기 위해서는 적을 원하는 장소로 끌어내고 여러 함선의 움직임을 맞춰야 했다. 전장 선택 자체가 승리의 중요한 조건이었다.\n\n+이 승리는 일본 수군의 적극적인 진출을 제약하고 전라도 연해의 방어에 기여했다. 동시에 부산과 일본 사이의 해상 연결은 계속 남아 있었다. 따라서 한산도는 모든 보급의 완전 차단보다, 조선 수군이 서쪽 바닷길을 지키며 적의 작전 선택을 좁힌 전투로 이해할 수 있다.',
'busanpo':'부산포 공격은 수군의 활동 범위가 일본군의 핵심 항구까지 확대되었음을 보여 준다. 조선 함대는 정박한 선박에 큰 피해를 주었지만 해안의 일본군 진지까지 점령하려 하지는 않았다. 해상 전력으로 할 수 있는 일과 육군의 지원이 필요한 일을 구분한 작전이었다.\n\n+항구의 선박을 파괴해도 배후의 육상 거점이 유지되면 적은 다시 보급과 수송을 시도할 수 있었다. 정운의 전사와 병사들의 피로 역시 계속 출전할 수 있는 능력에 영향을 주었다. 부산포의 승리는 적을 위협한 성과와 장기 해상 작전의 한계를 함께 보여 준다.',
'chilcheon':'칠천량에서는 함선만 잃은 것이 아니었다. 숙련된 지휘관과 병사, 격군을 잃고 한산도에 모아 둔 물자와 정박 기반까지 버려야 했다. 여러 해 쌓아 온 수군 조직이 한꺼번에 무너진 패전이었다.\n\n+부산 방면 출전의 부담과 함대의 피로, 경계 실패가 겹친 뒤 일본군의 야간 공격이 들어왔다. 일부 전선이 탈출해 살아남은 것은 이후 재건의 최소 기반이 되었다. 이 사건을 이해해야 명량에서 싸운 작은 함대가 단순히 숫자만 적은 군대가 아니라 붕괴한 조직의 잔여 병력을 다시 모은 전력이었음을 알 수 있다.',
'restore':'통제사에 복귀한 이순신은 먼저 남아 있는 배와 사람을 찾아야 했다. 지휘권을 되찾았다고 해서 군량 창고와 전선이 돌아온 것은 아니었다. 지역을 이동하며 관리와 주민의 협력을 얻고 흩어진 군사를 모으는 일이 전투 준비의 핵심이었다.\n\n+수군을 유지할 것인지 자체가 논의되는 상황에서 그는 해상 방어를 계속하기로 했다. 남은 함선을 잃으면 서쪽 바닷길을 지킬 기반도 사라질 수 있었다. 명량의 전술적 승리에 앞서 조직을 포기하지 않고 재건한 이 과정은 이후 고금도에서의 전력 회복과 명 수군과의 협력으로 이어졌다.',
'myeongnyang':'명량에서 조선 수군의 목표는 압도적인 적 함대를 모두 없애는 것보다, 남은 전력으로 공격을 막고 해상 방어를 지속하는 데 있었다. 이순신의 난중일기는 기함의 고전과 뒤늦게 합류한 여러 전선의 싸움을 구체적으로 전한다. 전투는 조류만으로 저절로 결정된 것이 아니라 지휘와 병사들의 전투가 결합된 결과였다.\n\n+승리 뒤에도 함대는 군량과 안전한 정박지를 찾아 이동했다. 명량은 완성된 재건의 마지막 장면이 아니라 재건을 계속할 수 있게 한 전환점이었다. 살아남은 수군은 이듬해 더 큰 함대를 갖추고 진린의 명 수군과 함께 순천과 노량에서 싸웠다.',
'noryang':'노량해전은 순천의 일본군을 도우려는 구원 함대와 이를 저지하려는 조·명 연합수군이 충돌한 전투였다. 육지의 성을 둘러싼 공방이 해상 퇴로의 문제로 바뀐 것이다. 이순신과 진린의 협력, 주변 일본 부대들의 구원 움직임이 한 수역에 모였다.\n\n+연합군은 일본 함대에 큰 피해를 입혔지만 모든 철수를 막지는 못했다. 고니시의 병력은 순천에서 빠져나갔고 살아남은 일본군은 부산으로 향했다. 이순신과 등자룡의 전사는 승리의 대가가 컸음을 보여 준다. 해상 봉쇄와 철수 저지의 복잡성이 마지막 순간까지 드러난 전투였다.',
'yi-death':'이순신이 노량에서 전사했을 때 전투는 아직 끝나지 않았다. 지휘관의 부재가 함대의 동요로 번지지 않도록 지휘와 신호를 유지하는 일이 필요했다. 그가 죽은 뒤에도 조·명 수군의 공격은 계속되었다.\n\n+전쟁 중 수군의 성과는 이순신 개인의 이름으로 기억되는 경우가 많지만 여러 수영의 장수, 병사와 격군, 군량을 마련한 주민들의 노동이 함께 있었다. 그의 죽음은 이 조직의 활동이 끝났다는 뜻이 아니다. 이후 수군의 유지와 전후 방어를 위해 경험과 함선, 지휘 체계를 이어 가는 과제가 남았다.'
}
stories={k:v.replace('\n+','\n') for k,v in stories.items()}
cid=uid(1100)
ops=[create('canon',SEA,dict(world_id=WORLD,slug='imjin-naval-front',title='임진왜란 — 수군과 해상 보급로',description='옥포에서 노량까지, 전선의 운용·군수·연합 작전과 수군 재건을 중심으로 읽는다.')),
create('canon_time_system',uid(103),dict(canon_id=SEA,time_system_id=TIME)),
create('event',cid,dict(world_id=WORLD,slug='imjin-naval-war',kind='composite',title='수군의 존속과 해상 보급로',summary='1592년의 반격, 칠천량의 붕괴, 재건과 연합 작전으로 이어진 수군의 전쟁.',roles=[],attributes={'source_references':[S['yi'],S['diary'],S['myeong'],S['noryang']]})),member('event',cid,SEA),
create('narrative',uid(3200),dict(canon_id=SEA,scope_type='event',scope_id=cid,locale='ko',kind='primary',title='바다에서 전쟁을 지속한 힘',body='조선 수군의 전쟁은 승리한 해전만으로 이루어지지 않았다. 전선을 만들고 고치며 격군을 모으고 군량과 탄약을 조달해야 했다. 일본군의 항구와 보급선을 위협하는 작전도 이런 기반이 있어야 계속할 수 있었다.\n\n+칠천량에서 그 기반이 무너진 뒤 이순신은 남은 전력으로 다시 싸웠다. 명량의 승리는 수군이 살아남아 재건할 기회를 만들었고, 이듬해에는 진린의 명 수군과 함께 순천과 노량에서 작전했다. 육지와 바다, 전투와 군수, 서로 다른 지휘관들의 협력이 만나는 곳에서 전쟁의 마지막 국면이 형성되었다.'.replace('\n+','\n'),public_references=[S['yi'],S['diary'],S['myeong'],S['noryang']]))]
snapshot={'relations': [dict(id=op['entity_id'], canon_memberships=[CANON], **op['value']) for file in sorted(OUT.glob('plan-*.json')) if int(file.name.split('-')[1]) <= 11 for op in json.loads(file.read_text())['operations'] if op['kind']=='create' and op['entity_type']=='relation']}
shared={by[k]['id'] for k in stories}
for i,(key,body) in enumerate(stories.items()):
    e=by[key];refs=[S[k] for k in e['refs']]
    if key in ['sacheon','dangpo']:refs.append(S['diary'])
    ops+=[member('event',e['id'],SEA),create('narrative',uid(3210+i),dict(canon_id=SEA,scope_type='event',scope_id=e['id'],locale='ko',kind='primary',title=e['title']+' — 수군의 관점',body=body,public_references=refs))]
    rid=uid(12000+i)
    ops += [create('relation',rid,dict(world_id=WORLD,type='contains',source_ref={'kind':'event','event_id':cid},target_ref={'kind':'event','event_id':e['id']},direction='directed',attributes={'basis':'naval Canon thematic grouping'})),member('relation',rid,SEA)]
for r in snapshot['relations']:
    if CANON not in r.get('canon_memberships',[]):continue
    refs=[r['source_ref'],r['target_ref']]
    eventrefs=[x['event_id'] for x in refs if x['kind']=='event']
    if r['type']!='contains' and eventrefs and all(x in shared for x in eventrefs):
        ops.append(member('relation',r['id'],SEA))
sea=plan(31,24,'IP-009: 11개 기존 수군 Event와 해당 관계를 membership으로 재사용하고 Canon별 역사 서술을 추가한다. 새 atomic Event는 생성하지 않는다.',ops)
(OUT/'plan-13-naval-canon.json').write_text(json.dumps(sea,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'enrichment_operations':len(enrich['operations']),'naval_operations':len(ops),'shared_events':len(stories)}))

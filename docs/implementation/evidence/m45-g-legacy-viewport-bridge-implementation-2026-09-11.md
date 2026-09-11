# M4.5-G Legacy viewport bridge 결정 기록

날짜: 2026-09-11

## 결정

- `MoiraiGraphQueryResult` v3만 입력으로 받는 `moirai-to-urdr-viewport/1` 단방향 adapter를 URDR 격리 디렉터리에 둔다.
- shared Event는 `(world_id, event_id)`로 한 번만 cell을 만든다. legacy의 단일 Canon 표시 슬롯은 membership 축소가 아니라 `legacy_single_canon_display_slot` approximation으로 보고한다.
- Relation edge 좌표는 명시적으로 non-canonical presentation approximation이다. virtual Time Event endpoint와 지원하지 않는 derived/Narrative/evidence는 stable reason code와 source address를 가진 loss로 남긴다.
- viewport hard cap은 2,500 Event cell이다. overflow는 개별 97,500개 row를 browser에 싣지 않고 source World 집합·누락 수가 포함된 bounded scope diagnostic 한 건으로 반환한다.
- Moirai application/contracts가 URDR 타입을 import하지 못하도록 architecture boundary를 강화한다.

## 근거

legacy renderer의 geometry와 단일 Canon 슬롯을 canonical query에 역전파하면 R1 membership과 multi-World Revision vector가 손실된다. adapter가 모든 축소를 보고하고 절대로 query/result를 변경하지 않게 하면 H 전환까지 UI를 재사용하면서 의미 경계를 보존할 수 있다. 100k 입력은 query scope 단계에서 잘라야 하므로 browser 출력량을 adapter에서도 이중으로 제한한다.

## 검증

- shared Event 1회 렌더와 multi-Canon approximation source ID
- 100,000 Event 입력에서 2,500 cell, overflow diagnostic 1건, truncated=true
- strict typecheck와 architecture boundary

M5, tenant, ACL 또는 canonical write는 변경하지 않는다.

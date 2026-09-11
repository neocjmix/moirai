# M4.5-F Inspector와 stable navigation 결정 기록

날짜: 2026-09-11

## 결정

- persisted Event identity의 stable 주소는 World-level `/worlds/{world}/events/{event}`로 유지한다.
- Canon context 주소는 별도 Event를 만들지 않는 membership-validated alias로 유지한다.
- graph selection은 기존 mobile bottom-sheet 문법을 유지하고 World·Canon·served Revision을 함께 표시한다.
- Canon context detail에서 World canonical URL과 `view=graph&focus={event}` 복귀 URL을 모두 제공한다.
- Event renderer가 아직 전용 표현을 모르는 attributes도 key/value structured section에서 loss 없이 보존한다.
- Subject 같은 derived detail은 algorithm version과 completeness를 명시한다. 이름만으로 identity를 합치지 않는다.

## 근거

World Event가 canonical identity이고 Canon은 overlapping interpretive membership이므로 Canon 경로가 identity를 소유하면 IP-003 불변식을 깨뜨린다. 반대로 현재 graph context를 버리면 mobile selection에서 stable route로 이동한 뒤 같은 해석 scope로 돌아갈 수 없다. 두 책임을 별도 링크로 노출하는 것이 가장 작은 무손실 해법이다.

## 검증 범위

- mobile WebKit: graph selection → inspector sheet → Canon context route → World canonical link와 graph focus 복귀
- server route: Canon alias가 Publication membership을 검증하고 없는 membership은 `notFound`로 닫힘
- strict typecheck, unit, production build
- Event Narrative/public references와 temporal projection은 기존 same-Revision renderer를 재사용

M5 기능, ACL 또는 새로운 canonical entity는 추가하지 않는다.

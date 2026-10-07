# 최소 배율 안료 렌더링 비용 개선 — 2026-10-07

## 요청과 경계

사용자는 #335의 시각 결과를 거의 완벽하다고 수용했으나 최소 배율의 체감 성능 회귀를 보고했다. 최근 안료 혼색과 부드러운 경계의 경미한 품질 저하를 허용하며 적극적인 성능 개선을 요청했다. CON-003·BR-003·TS-006에 따라 World/Event identity, authored contains, 계층·표시 단계, 글자와 선택, camera/Publication 경계는 보존한다. IP-012의 포괄 성능 종료 결정은 이 새 요청의 paint 비용 범위에서만 다시 활성화된다.

## 기준선과 방법

기준선은 main/배포 `e8420f75eb10a940e20fc750140aab2a3eba0e6c`(#335)다. 실제 수용 자료는 새 세계사 World `01a107fb-4018-7fcb-8390-836a40fa91cc`, r51(518 Event/486 Relation/6 Collection), Render generation `edf71cde5940743f5104df4e36ca5ba8ec5036b89fb8a53cfa95959de8c3ac4f`를 고정한다. 정본 쓰기, Publication 재생성, backfill, 환경 변수 변경은 하지 않는다.

World bounds는 X `[-518.8790714653,519.4877216205]`, Y `[211453.7875521058,230300.6084998323]`다. 화면 크기/(World span×2)의 scale 하한을 사용하므로 최소 배율 camera는 center `(0.304325,220877.198026)`, span `(2076.733586,37693.641895)`이다. 이전 생애 개요 camera `0,220099,1500,9000`도 비교한다.

Cloud WebKit iPhone 14 emulation의 한 browser만 실행하고 화면 안의 rAF 루프에서 pan/pinch 입력을 발생시킨다. 이전 작업의 원격 명령 왕복시간을 프레임 시간으로 쓰지 않는다. 실제 rAF 간격, `gsProfile`의 React/renderer 단계, GL draw/state/upload 호출, mesh/target 예산과 읽기 요청을 따로 기록한다. 이 결과는 실제 iPhone 17 Safari/PWA GPU 측정이 아니다.

## 병목과 후보

#335는 borderless Hull 하나마다 4개의 면 전체를 RGBA16F attachment 2개에 누적하고, 화면 전체를 최대 1.5× raster에서 Spectral resolve한다. 같은 geometry에도 매 coat마다 attribute pointer/divisor를 설정한다. 기준선 최소 배율의 103개 후보/54개 mesh는 frame당 pigment draw 207회/feather coat 204개와 9.32MB의 누적 target을 사용했다. 줌 중에는 세 개의 inward offset과 triangulation을 새로 만드는 비용도 있다.

후보는 (1) 면의 누적·안료 resolve를 CSS 1px/최대 30만 픽셀로 제한한 뒤 값싼 선형 확대, (2) GPU feather를 네 겹에서 두 겹으로 축소하되 전체 광학 두께와 authored extent 유지, (3) mesh attribute 설정을 VAO에 저장, (4) 현재 tween 상태에서 칠할 면이 없으면 pigment pass 생략이다. 점과 테두리의 raster 및 SVG 글자는 기존 해상도를 유지한다. 전체 화면 글자 bitmap 캐시는 사용하지 않는다.

시각·성능 A/B, 회귀 검사 및 최종 commit/deployed SHA는 해당 변경 PR의 완료 기록과 이 evidence의 후속 측정 절을 따른다. GPU API 제출 시간, GPU 완료 시간과 실제 프레임을 혼동하지 않는다. 숫자 개선을 기존 A4 전체 gate 통과로 확대하지 않는다.

## 1차 측정과 추가 병목

각 행은 동일 camera에서 120회 rAF 입력 중 119개 간격이다. 공개 기준선과 로컬 후보는 같은 세계사 공개 bootstrap/읽기 응답을 사용한다. 로컬 진단 adapter는 후보 JS/CSS를 유지하고 공개 World props만 주입하며, 정본·발행·서버를 변경하지 않는다. 두 화면의 geometry·활성 ID·Render generation과 24회 Render 읽기가 일치하고 hydration/GL/page 오류는 없었다. 네트워크 배치 차이가 가능한 로컬 비교는 배포 후 공개 환경에서 다시 확인한다.

| 동작 | #335 중앙값 / p95 / 최대(ms) | 1차 후보 중앙값 / p95 / 최대(ms) |
| --- | --- | --- |
| 최소 배율 패닝 | 73 / 97 / 118 | 65 / 87 / 107 |
| 최소 배율 핀치 | 329 / 379 / 440 | 230 / 268 / 470 |
| 개요 패닝 | 79 / 123 / 151 | 75 / 114 / 149 |
| 개요 핀치 | 247 / 303 / 329 | 182 / 235 / 264 |

최소 배율의 pigment draw는 207→105, pixel은 582,660→258,960, target은 9.32→5.18MB, mesh는 1.97→1.28MB다. 핀치 painter CPU 합계는 21.04→11.92초로 줄었지만 여전히 약 6,800번 mesh를 만들었다. 패닝 painter CPU는 1.89→2.37초로 오히려 늘었으며, 이 pass 제출 비용과 프레임 개선을 구분한다. 핀치 최대 지연의 회귀도 숨기지 않는다.

점 표시 가지가 사용하지 않는 라벨 윤곽은 lazy getter로 준비하지 않으며, feather inset에는 쓰지 않는 stroke 정점을 만들지 않는다. 다음 후보는 배경 GPU mesh만 화면 오차 안에서 재사용한다. 현재 정확한 M/L/C/Z 경로와 캐시 원본의 모든 Bézier 제어점을 같은 화면 좌표계에서 비교하고, 각 점의 유클리드 오차가 0.75px 이하이며 원본 대비 양축 배율이 0.8–1.2일 때만 허용한다. 제어점 비교의 convex-hull 성질로 곡선 오차를 제한하며 매번 원본과 비교해 누적 drift를 막는다. 기존 0.35px 삼각화 근사의 배율 확대까지 포함하면 보수적인 경계 오차는 최대 약 1.17px다. 정확한 SVG hit 경로·글자·점·단계·색상은 변경하지 않는다.

같은 제한 안에서는 feather도 원본 mesh에 고정해 약 1.92–2.88px 폭의 경미한 변화를 허용한다. 범위 밖 retained frame은 기존 화면 폭 보정을 사용한다. GPU mesh 8MB와 별개로 제어점 비교 캐시는 1MB로 제한하며 초과하면 근사 재사용만 포기한다. fade가 종료될 때는 정확한 목표 alpha를 반환해 점만 남은 프레임에서 pigment pass가 계속 켜져 있지 않게 한다.

## 채택 후보 측정

| 동작 | 채택 후보 중앙값 / p95 / 최대(ms) | #335 대비 중앙값 |
| --- | --- | --- |
| 최소 배율 패닝 | 65 / 85 / 101 | 11% 감소 |
| 최소 배율 핀치 | 182 / 233 / 245 | 45% 감소 |
| 개요 패닝 | 76 / 102 / 122 | 4% 감소 |
| 개요 핀치 | 151 / 226 / 255 | 39% 감소 |

최소 배율 핀치에서 painter CPU는 21.04→6.30초(70% 감소), mesh rebuild는 6,708→1,726(74% 감소), GPU upload는 32,077→5,185(84% 감소)다. 개요 핀치에서는 14.67→5.73초, rebuild 5,878→1,279, upload 25,345→3,605다. geometry·활성 ID와 정본/Render generation은 기준선과 같고 오류는 없다. 캐시 제어점은 약 0.45MB로 1MB 제한 안이다. Spectral 혼색·흰 배경·선명한 점/글자는 유지하며 완화된 경계 표현을 적용한다.

패닝은 개선 폭이 작고 전체 프레임 gate는 여전히 미달이다. 이 작업의 결과는 최근 시각효과와 줌 재생성 비용 감소이며, 기존 deferred A4 전체 성능 문제의 해결이나 실제 iPhone 17/PWA 측정으로 표현하지 않는다.

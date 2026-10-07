# 세계사 화면 복원·계층 표현 개선 — 2026-10-07

## 작업 전 기준선

사용자가 요청한 열 가지 후속 개선의 기준선은 main/운영 `f85c800b83376189323722aabef30c5a18932a44`(#330)이다. 작업 시작 시 작업 트리는 clean이며 공개 `/health`와 `/__status`의 SHA가 일치했다. 기존 CI와 배포 후 smoke는 성공 상태다.

검증 대상은 새 **세계사** World `01a107fb-4018-7fcb-8390-836a40fa91cc`의 현재 source/served **51**이다. 이전 **실제 세계사** World를 사용자 수용 검증에 대신 사용하지 않는다. snapshot은 Event **518**, Relation **486**, Collection **6**, Time System `01a107fc-3994-7889-969f-7a210c19fa24`다.

- input digest: `0bb0870891e5ff93f70b9c7f91c67b327cea366d1da6f3d23af25a064c7bc604`
- root digest: `dc5136e0e95735ae60a99ba5aa3ec0349e9bc987f5257d70348f44aa947487e6`
- 패딩 대표 사례: **이순신의 생애**, Event `1f10a329-835d-79b1-a9c3-ae1835934b8b`

CON-003·BR-003·TS-006과 IP-013의 Event/contains·World identity 및 공개 읽기 계약을 따른다. 이번 사용자 지시는 월드/카메라 로컬 복원, 두 줄 HUD와 월드 선택 스타일, 위치별 깊이 패딩, Composite 색상·단계·부모/자식 연동 및 관성 패닝을 활성화한다. 새 패딩 메타데이터는 대상 World의 동일 revision Render generation을 재생성하여 발행하고, 원본 Publication과 역사 정본의 digest 불변을 확인한다.

## 확인 항목

URL 명시 상태가 저장 상태보다 우선하며 World별 카메라와 마지막 World가 재진입 때 복원된다. HUD는 Y축을 피하고 두 줄을 유지한다. 위치별 패딩과 authored Composite 색상, hull→투명한 무테 hull→큰 점→작은 점→숨김 및 부모/자식 전환을 확대·축소·발행본 재로드에서 확인한다. 터치 관성은 새 입력·화면 전환에 취소되고 최종 좌표가 저장된다.

합성 fixture는 회귀 검사로 유지하며 실제 탐색 수용은 위 세계사 r51로 수행한다. 최종 테스트, 배포 SHA, 대상 Render generation과 실제 화면 결과는 이 작업 PR의 완료 기록을 따른다. iPhone 14 WebKit emulation은 실제 iPhone 17 Safari/PWA 수동 검사와 구분한다.

## 배포와 실제 세계사 검증

[PR #331](https://github.com/neocjmix/moirai/pull/331)의 runtime commit `a390e69ab2b4e3902c976d9cc53149d993f26395`가 2026-10-07 Atropos·Clotho·Lachesis worker에 모두 SUCCESS로 배포됐다. 공개 `/__status`의 정확한 SHA와 readiness smoke를 확인했다. A5 운영 모바일 검사도 4개 모두 통과했으며 Post-deploy smoke에서 인증된 합성 입력부터 공개 Atropos 읽기까지 검증했다.

새 세계사 r51의 Render generation은 `9892c8bbaf37b59bb944c7bce40d4b48f21cdcae157e574c768f02aa27afac0b`에서 `fb65e8debf1fc7c7e042b6fec6de2c6a3a6360443a0e3627eddcb5b575a49b09`로 교체됐다. worker의 `render_backfill`은 07:14:41 UTC에 `served`를 보고했다. 공개 viewport 응답에서 위치별 `paddingProfile`, 12–20px Hull/점 전환, 16–40px 자식 전환 메타데이터를 확인했다. 일회성 작업 변수 두 개는 완료 후 비웠으며 다른 World와 정본에는 쓰기를 수행하지 않았다. 같은 revision과 위 input/root digest의 불변을 발행 후 snapshot으로 재확인했다.

실제 운영 화면 검사 **37개**가 통과했다. 월드·최종 관성 좌표 복원과 명시 URL 우선, World/사건/6개 Collection 탐색, Y축에서 72px 떨어진 두 줄 HUD(높이 68px), 관성 정지·새 접촉 취소·동작 줄이기를 확인했다. 이순신의 전체 생애·말년 화면에서 Hull이 유지되고 리프는 중립색이며 Composite 색상은 camera가 바뀌어도 동일했다. 6개 확대 단계에서 빈 구간 없이 무테 Hull과 색상 있는 점으로 이어졌다. 실제 도검 몰수령 Composite의 자식 opacity는 span 40/28/18/12px에서 각각 1/0.5/0.019676/0으로 순차 변화했다. 브라우저 JavaScript 오류와 정본 변경 요청은 모두 0건이다.

로컬 전체 단위 검사는 **737개 통과·기존 2개 생략**, compiler/4 연속성은 **11개 통과**, Clotho는 **38개 통과**했다. format·lint·strict typecheck·architecture boundaries·production build와 변경 commit의 secret scan도 통과했다. 감사에서 새로 발견한 의존성 취약점은 별도 최소 패치로 해소해 high/critical 0건이며 moderate 9건은 남아 있다.

#331의 전체 CI 모바일 검사에서는 변경 전 점 전환 크기·밀도별 Composite 크기·카드의 정확한 링크 이름을 전제로 한 4개 검사가 실패했다(63개 통과·1개 생략). 후속 검증 commit `1b4a84f`에서 실제 전환 범위를 통과하는 camera, authored Composite span 기준, 카드 제목으로 한정한 링크 선택자로 갱신했다. 관련 6개와 전체 모바일 **67개 통과·기존 1개 생략**을 확인했다. runtime 기능과 기존 identity·반전·접근성 검증은 유지했고, 밀도 등급만으로 Composite가 사라지지 않는 검사도 추가했다. 이 후속 PR의 최종 CI와 공개 배포 기록이 회귀 검사 완료 상태를 소유한다.

위 결과는 Cloud의 iPhone 14 WebKit 자동화다. 실제 iPhone 17 Safari/PWA의 수동 조작·GPU·장시간 메모리를 측정한 것으로 표현하지 않는다.

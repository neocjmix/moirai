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

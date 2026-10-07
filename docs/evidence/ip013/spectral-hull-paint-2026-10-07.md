# 흰 배경·부드러운 Hull·Spectral 혼색 — 2026-10-07

## 범위와 기준선

사용자는 배경을 완전히 흰색으로 바꾸고 Hull 테두리를 조금 약화하며, 테두리 없는 단계에 실제 blur보다 저렴한 부드러운 경계를 요청했다. 겹친 면의 안료 혼색에는 앞서 잘못 부른 Spectrum.js가 아닌 **Spectral.js**를 검토·적용한다. CON-003·TS-006·IP-013의 authored contains, Event/World identity, 화면 단계와 읽기 예산은 바꾸지 않는다.

main/공개 Atropos 기준선은 `05cef198aed3cfc63b8c3a6a7b804ef8a06f638f`(#334)다. 실제 수용 자료는 새 **세계사** World `01a107fb-4018-7fcb-8390-836a40fa91cc`, source/served **51**, Event **518**(Composite 103), Relation **486**, Collection **6**이다.

- input digest: `0bb0870891e5ff93f70b9c7f91c67b327cea366d1da6f3d23af25a064c7bc604`
- root digest: `dc5136e0e95735ae60a99ba5aa3ec0349e9bc987f5257d70348f44aa947487e6`
- Render generation: `edf71cde5940743f5104df4e36ca5ba8ec5036b89fb8a53cfa95959de8c3ac4f`

이 작업은 painter-only다. 정본 입력, Publication 재생성, backfill, worker 환경 변수 변경은 하지 않는다. 같은 실제 camera `0,220099,1500,9000`, `0,222920,1000,2000`, `358.11818247,222996.59815,2000,500`의 기준선 screenshot·GL 상태·idle·25px pan을 `.artifacts/spectral-hulls-2026-10-07/baseline`에 보존했다.

## 구현과 제한

배경은 `#fff`다. 제거된 paper texture는 유효한 서비스 자산이 아닌 과거 로컬 절대 경로였다. 점 테두리·이름표 halo·오른쪽 HUD 제목 바탕도 흰색 계열로 맞추며 조작부의 배치와 기능은 유지한다. Hull stroke opacity는 0.20→0.15, 굵기는 기존 1.15px을 유지한다.

테두리 소실 정도에 따라 최대 4개의 안쪽 contour에 광학 두께를 나눠 칠한다. 최대 폭은 화면상 2.4px이며 외곽·hit geometry는 확장하지 않는다. 오목한 영역이 나뉘면 조각을 따로 그리며 작은 도형이 침식으로 비어 버리면 마지막 유효 contour에 남은 두께를 보존한다. 캐시는 128개/100만 문자로 제한한다. 원래 geometry가 그대로인 패닝에서는 contour와 GPU mesh를 재사용한다. blur filter, CPU 픽셀 반복, Hull마다의 offscreen blur/ping-pong은 없다. SVG fade-out 도중에도 inset path를 유지해 기본 면으로 갑자기 복귀하지 않게 한다.

Spectral.js **3.0.0 / MIT / 추가 전이 의존성 없음**을 고정했다. 38대역 source reflectance를 색상별로 한 번 만들고, 기존 12색의 단색 RGB를 보존하도록 보정한 6대역 K/S 재료를 캐시한다. 기본 WebGL은 2개의 RGBA16F attachment에 K/S×질량과 광학 두께를 더한 뒤 fullscreen resolve 1회로 합성한다. 그리기 순서와 관계없이 같은 혼색이 나온다. 이는 **전체 38대역의 정확한 구현이 아니라 측정한 6대역 근사**다.

525개 혼합 비교에서 full Spectral.js 대비 OKLab 오차 최대 0.019 미만/RMS 0.007 미만을 회귀 검사한다. 공식 파랑/노랑 사례는 녹색을 만들며 기존 12색의 단독 RGB는 byte 기준 0.01 이내로 보존한다. 중립 리프와 Composite 점은 기존 색상을 그대로 사용한다.

누적 색상 버퍼는 최대 100만 픽셀/**16MB**, 전체 Hull mesh는 기존 **8MB** 한도다. float framebuffer/blend 미지원, context loss, 예산 초과 시 SVG로 돌아간다. Canvas·SVG·Lab은 Spectral-derived 단색과 multiply 합성을 사용하는 저비용 **RGB fallback**이며 GPU와 정확한 색/알파 동등성을 주장하지 않는다. `data-pigment-mode`로 `spectral-6band`와 `srgb-fallback`을 구분한다. 단색은 보존하지만 혼합색은 달라질 수 있다.

## 검증

전체 단위 **778 통과/기존 2 생략**, strict typecheck, format, lint, 서비스 경계와 production build를 통과했다. dependency audit은 기존 moderate 9개이며 high/critical은 없다. 신규 순수 검사 14개는 contour·cache·퇴화 도형·coverage, 팔레트·Spectral 비교·Float16 범위를 다룬다.

실제 WebGL 컴포넌트의 직접 Cloud WebKit 검사에서는 파랑/노랑 겹침 `[115,177,91]`이 CPU 모델과 일치했고 순서를 뒤집어도 동일했다. 빈 배경 `[255,255,255]`, feather의 연속적인 안쪽 진해짐, resize 제한(2560×1440에서 누적 999,750픽셀/15,996,000B), context loss fallback을 확인했다. 신규 모바일 회귀는 흰 배경·약한 테두리·경계 픽셀·혼색·pan mesh 재사용·float 미지원·cold reload의 identity/색상 보존을 검사한다.

모바일 전체 회귀, compiler/4 continuity, PostgreSQL integration, secret scan, PR/main CI 및 최종 배포 SHA·공개 smoke·새 세계사 수용 결과는 이 변경 PR의 완료 기록을 따른다. Cloud WebKit의 GPU 문자열이나 에뮬레이션을 실제 iPhone 17 Safari/PWA 성능 검증으로 확대하지 않는다. 추가 GPU resolve와 inset draw의 비용은 존재하며 실제 blur보다 싼 경로를 선택한 것이지 비용이 0이라는 주장은 아니다. 기존 종료된 광범위 성능 튜닝을 다시 시작하지 않는다.

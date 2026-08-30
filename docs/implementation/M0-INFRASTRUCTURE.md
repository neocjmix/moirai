# Milestone 0 infrastructure inventory

이 문서는 [IP-001 Milestone 0](IP-001-first-product-plan.md#ip-0014-milestone-0--전달관측보안-기반)의 Railway resource mapping과 rollback 경계를 기록한다. 값이나 credential은 기록하지 않는다.

## 2026-08-30 inventory

초기 inventory에서 인증된 Railway workspace는 `0 Projects`였고 URDR project, service, database, domain, bucket, volume 또는 variable relation이 없었다. 따라서 삭제·rename·credential 재사용 대상은 없었고 URDR GitHub repository는 수정하지 않았다. 사용자가 유료 plan과 새 project 생성을 승인한 뒤 아래 전용 자원을 만들었다.

| role | Railway 이름 | resource ID | 연결·노출 |
|---|---|---|---|
| project | `Moirai` | `67754889-5b80-4503-b368-95e7d0768d84` | production environment `990773c0-31d9-435c-8d36-21c15352fe51` |
| `atropos-web` | `moirai` | `dafb90ad-69bc-420f-b0d2-65a5f6bbc2cf` | public domain `moirai-production-8ed1.up.railway.app`; CDN caching; `/health` readiness |
| `lachesis-api` | `desirable-vitality` | `fe402236-354f-4088-8182-aaf5f7b34a99` | private; PostgreSQL reference; `/health/ready` readiness |
| `lachesis-worker` | `easygoing-recreation` | `ed61330b-87b2-40f2-a692-3453739f09a5` | domain 없음; PostgreSQL reference; `/health/ready` readiness |
| PostgreSQL | `Postgres` | `7c4e107f-e65d-4413-8994-db5763c8ee44` | API·worker·migration만 private reference로 연결 |
| PostgreSQL volume | `postgres-volume` | `4b4fd2ff-54e2-4353-850e-287d0ae4bde5` | PostgreSQL 전용 |
| Publication Bucket | `balanced-pouch` | `ce4878f1-85b5-4cf5-ad3d-23e74e12831b` | private S3-compatible origin; Atropos에 Railway reference variable로만 연결 |

임의 생성된 API, worker와 bucket의 Railway 표시 이름은 resource ID와 역할 매핑으로 고정했다. 다른 repository 또는 service와 공유하는 자원은 없으며 secret 값은 저장소, 문서, 로그와 공개 status에 기록하지 않았다.

## 배포 구성

| unit | build | start 또는 pre-deploy | exposure / readiness |
|---|---|---|---|
| `lachesis-api` | contracts, persistence, API production build | migration runner 후 API start | private network, `/health/ready` |
| `lachesis-worker` | persistence와 worker production build | worker start | domain 없음, `/health/ready` |
| `atropos-web` | contracts와 Next.js production build | web start | public domain, Railway CDN, `/health` |
| PostgreSQL | managed Railway PostgreSQL | API pre-deploy에서 versioned migration 실행 | API·worker·migration에만 private reference |

세 application service는 `neocjmix/moirai`의 `main`을 source로 사용하며 독립 deployment history를 가진다. Atropos에는 PostgreSQL 접속 정보가 없고 Publication Bucket credential은 Railway가 생성한 reference relation으로만 주입했다.

## Publication Store spike 결과

고정 synthetic World `world_m0_synthetic`로 실제 Railway Bucket에 다음 경로를 생성하고 공개 CDN proxy를 post-deploy smoke로 검증했다.

- revision-pinned snapshot: `worlds/world_m0_synthetic/revisions/0/snapshot.json`
- revision-pinned manifest: `worlds/world_m0_synthetic/revisions/0/manifest.json`
- served pointer: `worlds/world_m0_synthetic/current.json`
- immutable revision은 조건부 write 후 pointer보다 먼저 생성한다.
- `current.json`은 단일 object PUT으로 교체한다.
- revision 응답은 `Cache-Control: public, max-age=31536000, immutable`과 `ETag`를 제공한다.
- pointer 응답은 짧은 cache와 revalidation, `ETag`를 제공한다.
- Railway CDN 반복 요청에서 `x-cache: HIT|STALE`와 `age`를 확인한다.
- artifact 전체는 저장소의 synthetic 정본 fixture에서 다시 생성할 수 있다.

구현 commit `d76932bcbe09c9c04af8cc3c2591f180e4426057`의 CI run `33331725089`와 post-deploy smoke run `33331786122`가 build, synthetic Publication, revision-pinned URL, ETag와 실제 edge cache hit를 검증했다.

## Rollback

- application: Railway의 service별 deployment history에서 직전 healthcheck 성공 deployment를 redeploy한다. application rollback은 World Revision을 변경하지 않는다.
- migration: Milestone 0 migration은 운영 metadata table 하나를 추가하며 기존 table을 변경하지 않는다. 제품 데이터가 생기기 전 격리 환경에서만 `down`을 사용할 수 있고 이후에는 forward fix를 우선한다.
- Publication: 새 pointer 검증이 실패하면 이전 `current.json` body를 다시 PUT한다. immutable revision artifact는 보존한다.
- CDN: 문제 시 Atropos service의 CDN caching을 끄거나 cache를 purge한 뒤 origin proxy로 복귀한다.
- infrastructure: project의 resource ID와 reference relation을 위 표로 확인한 뒤 service 단위로 변경한다. project 또는 workspace 전체를 포괄 삭제하지 않는다.

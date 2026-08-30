# Milestone 0 infrastructure inventory

이 문서는 [IP-001 Milestone 0](IP-001-first-product-plan.md#ip-0014-milestone-0--전달관측보안-기반)의 Railway resource mapping과 rollback 경계를 기록한다. 값이나 credential은 기록하지 않는다.

## 2026-08-30 inventory

Railway의 인증된 workspace에서 확인한 현재 연결 관계는 다음과 같다.

| resource kind | 확인된 이름·관계 |
|---|---|
| project | 없음 — dashboard가 `0 Projects`를 표시함 |
| service | 없음 |
| PostgreSQL | 없음 |
| public/private domain | 없음 |
| bucket | 없음 |
| volume | 없음 |
| service variable relation | 없음 |

현재 workspace는 trial 종료 상태다. URDR project와 그 resource가 삭제된 것인지, 다른 Railway account 또는 workspace에 존재하는지는 이 inventory만으로 판정할 수 없다. 따라서 URDR 전용성이나 공유 여부도 확인할 수 없으며 live resource의 rename, delete, credential rotation과 Moirai deploy를 실행하지 않았다.

새 project 또는 유료 plan을 만들면 비용과 새로운 resource identity가 생기므로 사용자 결정 전에는 생성하지 않는다.

## 배포 목표 구성

URDR 전용 project가 확인되거나 새 project 사용이 승인되면 다음 구성을 적용한다.

| unit | source/build | start 또는 pre-deploy | exposure / readiness |
|---|---|---|---|
| `lachesis-api` | repo root, `pnpm --filter @moirai/lachesis-api... build` | `pnpm --filter @moirai/lachesis-api start` | private network, `/health/ready` |
| `lachesis-worker` | repo root, `pnpm --filter @moirai/lachesis-worker... build` | `pnpm --filter @moirai/lachesis-worker start` | domain 없음, `/health/ready` |
| `atropos-web` | repo root, `pnpm --filter @moirai/atropos-web... build` | `pnpm --filter @moirai/atropos-web start` | public domain, `/health` |
| PostgreSQL | managed Railway PostgreSQL | `pnpm --filter @moirai/persistence migrate`를 명시적 pre-deploy 단계에서 1회 실행 | API·worker·migration에만 private `DATABASE_URL` reference |

세 GitHub source는 `neocjmix/moirai`의 `main`을 사용하고 Wait for CI를 활성화한다. Atropos에는 PostgreSQL 또는 private service credential을 주입하지 않는다. API와 worker는 같은 저장소에서 build하지만 service별 deployment history를 유지해 독립 rollback한다.

Railway의 legacy Config as Code는 2026-12-01 폐기 예정이므로 `railway.toml`이나 `railway.json`을 추가하지 않는다. 실제 project가 확인된 뒤 현재 Infrastructure as Code를 pull해 resource ID를 보존하고 plan을 검토한 다음 적용한다.

## Publication Store spike 상태

Railway Bucket은 private S3-compatible origin이며 public bucket을 지원하지 않는다. TS-006을 만족하려면 worker-only write credential, immutable revision key, 원자적 `current.json` 교체, Atropos 또는 별도 artifact service의 공개 proxy/CDN 경로가 필요하다.

실제 bucket이 inventory되지 않아 다음 항목은 아직 live spike하지 못했다.

- 단일 object overwrite의 read-after-write와 원자성
- conditional write 또는 비교·교체로 오래된 pointer 역행 방지
- revision URL의 `Cache-Control: public, max-age=31536000, immutable`
- `current.json`의 짧은 cache와 revalidation
- JSON `ETag`, CDN hit·stale 동작과 revision-pinned URL
- 정본에서 전체 rebuild한 뒤 동일 digest 확인

명세를 약화하지 않는다. Railway resource 접근이 복구된 뒤 위 항목을 실제 요청과 응답 header로 검증하고, 하나라도 보장할 수 없을 때만 별도 S3-compatible provider의 필요성과 비용을 제시한다.

## Rollback

- application: 각 service에서 직전 healthcheck 성공 deployment를 redeploy한다. application rollback은 World Revision을 변경하지 않는다.
- migration: Milestone 0 migration은 운영 metadata table 하나를 추가하며 기존 table을 변경하지 않는다. 제품 데이터가 생기기 전 격리 환경에서만 `down`을 사용할 수 있다. 이후에는 forward fix를 우선한다.
- Publication: 새 pointer가 검증에 실패하면 이전 `current.json` 값을 복원하고 immutable revision artifact는 유지한다.
- 현재 live resource 변경은 없으므로 이번 inventory 자체에 필요한 infrastructure rollback은 없다.

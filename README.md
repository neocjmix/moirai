# Moirai

LLM이 세계를 작성하고, 시스템이 이를 보존·관리하며, 독자가 출판된 세계를 탐색할 수 있게 하는 사건 기반 세계 모델 시스템이다.

설계 문서는 [문서 인덱스](docs/INDEX.md)에서 시작한다.

## Milestone 0 개발 명령

Node.js 22 이상과 Corepack을 사용한다.

```bash
corepack pnpm install
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

PostgreSQL이 준비된 검증 환경에서는 `DATABASE_URL`을 비공개 secret store에서 주입한 뒤 `corepack pnpm migrate`와 `corepack pnpm test:integration`을 실행한다. 실제 connection string은 저장소, log와 공개 artifact에 남기지 않는다.

Atropos 개발 서버는 `corepack pnpm dev:web`으로 실행할 수 있지만, 사용자의 검수 경로는 `CURRENT.md`에 기록된 public integration URL이다.

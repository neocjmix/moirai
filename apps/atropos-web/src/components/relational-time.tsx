import type {
  PublicEvent,
  PublicRelationalTemporalProjection,
  PublicTemporalAmount
} from "@moirai/contracts";

function amountText(amount: PublicTemporalAmount | null): string {
  if (!amount) return "계산할 수 없음";
  if (amount.unit !== "picosecond" || !/^-?\d+$/.test(amount.value))
    return `${amount.value} ${amount.unit}`;
  const value = BigInt(amount.value),
    scale = 1000000000000n;
  const remainder = (value < 0n ? -value : value) % scale;
  const fraction = remainder
    ? `.${remainder.toString().padStart(12, "0").replace(/0+$/, "")}`
    : "";
  return `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / scale}${fraction} seconds`;
}

/** Accessible temporal meaning, using the existing Event sheet metadata layout. */
export function RelationalTime({
  projection,
  events,
  eventId
}: {
  readonly projection: PublicRelationalTemporalProjection;
  readonly events: readonly PublicEvent[];
  readonly eventId?: string;
}) {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const title = (id: string) => eventById.get(id)?.title ?? id;
  const link = (id: string) =>
    `/worlds/${projection.world_id}/canons/${projection.canon_id}/events/${id}`;
  const positions = eventId
    ? projection.positions.filter((p) => p.event_id === eventId)
    : projection.positions;
  return (
    <section className="temporal-reading" aria-label="Event 관계 기반 시간">
      <p className="eyebrow">시간 · REVISION {projection.source_revision}</p>
      {positions.map((position) => {
        const composite = projection.composites.find(
          (c) => c.event_id === position.event_id
        );
        const parents = projection.composites.filter((c) =>
          c.descendant_event_ids.includes(position.event_id)
        );
        const during = projection.composites.filter((c) =>
          c.during.some((d) => d.event_id === position.event_id)
        );
        const ordering = projection.relations.filter(
          (r) =>
            r.type === "precedes" &&
            r.source_ref?.kind === "event" &&
            r.target_ref?.kind === "event" &&
            (r.source_ref.event_id === position.event_id ||
              r.target_ref.event_id === position.event_id)
        );
        return (
          <article
            className="narrative-block temporal-event"
            key={position.event_id}
            data-event-id={position.event_id}
          >
            {!eventId ? (
              <h3>
                <a href={link(position.event_id)}>{title(position.event_id)}</a>
              </h3>
            ) : null}
            <p>
              {composite
                ? composite.start_ref && composite.end_ref
                  ? "시작과 종료가 있는 기간 사건"
                  : "Composite Event · 시작·종료 경계 미정"
                : position.display_label}
            </p>
            {position.kind === "exact" && position.time_event ? (
              <p>
                <code>{position.time_event.coordinate}</code> · coincides
              </p>
            ) : null}
            {position.kind === "bounded" ? (
              <details>
                <summary>알려진 범위의 원문 좌표</summary>
                <p>
                  시작{" "}
                  {position.lower ? (
                    <>
                      <code>{position.lower.time_event.coordinate}</code> ·{" "}
                      {position.lower.inclusive ? "포함" : "제외"}
                    </>
                  ) : (
                    "미상"
                  )}
                </p>
                <p>
                  끝{" "}
                  {position.upper ? (
                    <>
                      <code>{position.upper.time_event.coordinate}</code> ·{" "}
                      {position.upper.inclusive ? "포함" : "제외"}
                    </>
                  ) : (
                    "미상"
                  )}
                </p>
                {position.knowledge_span ? (
                  <p>알려진 범위의 폭: {amountText(position.knowledge_span)}</p>
                ) : null}
              </details>
            ) : null}
            {position.kind === "unresolved" && !composite ? (
              <p>{position.reason}</p>
            ) : null}
            {composite ? (
              <>
                <table className="temporal-metadata">
                  <tbody>
                    <tr>
                      <th scope="row">시작</th>
                      <td>
                        {composite.duration.start ? (
                          <code>{composite.duration.start.coordinate}</code>
                        ) : (
                          "좌표 미상"
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">종료</th>
                      <td>
                        {composite.duration.end ? (
                          <code>{composite.duration.end.coordinate}</code>
                        ) : (
                          "좌표 미상"
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Duration</th>
                      <td>
                        {amountText(composite.duration.amount)} · 명시적 경계
                        근거
                      </td>
                    </tr>
                  </tbody>
                </table>
                {composite.duration.reason ? (
                  <p>{composite.duration.reason}</p>
                ) : null}
                <details>
                  <summary>구성 사건들의 시간 범위 · descendant span</summary>
                  <p>{amountText(composite.descendant_span.amount)}</p>
                  <p>{composite.descendant_span.reason}</p>
                </details>
                <p>구성 사건 · component</p>
                <ul>
                  {composite.descendant_event_ids.map((id) => (
                    <li key={id}>
                      <a href={link(id)}>{title(id)}</a>
                    </li>
                  ))}
                </ul>
                {composite.during.length ? (
                  <>
                    <p>진행 중 발생 · occurred during · 비구성 사건</p>
                    <ul>
                      {composite.during.map((item) => (
                        <li key={item.event_id}>
                          <a href={link(item.event_id)}>
                            {title(item.event_id)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {composite.membership_state ? (
                  <p>
                    membership State: {composite.membership_state.status}{" "}
                    {composite.membership_state.reason}
                  </p>
                ) : null}
              </>
            ) : null}
            {parents.map((parent) => (
              <p className="temporal-component" key={parent.event_id}>
                component ·{" "}
                <a href={link(parent.event_id)}>{title(parent.event_id)}</a>의
                구성 사건
              </p>
            ))}
            {during.map((parent) => (
              <p className="temporal-during" key={parent.event_id}>
                occurred during ·{" "}
                <a href={link(parent.event_id)}>{title(parent.event_id)}</a>{" "}
                진행 중 발생 · 구성 사건 아님
              </p>
            ))}
            {ordering.map((relation) => {
              if (
                relation.source_ref?.kind !== "event" ||
                relation.target_ref?.kind !== "event"
              )
                return null;
              const before = relation.source_ref.event_id === position.event_id;
              const other = before
                ? relation.target_ref.event_id
                : relation.source_ref.event_id;
              return (
                <p key={relation.id}>
                  {before
                    ? "before · 다음 사건보다 앞섬"
                    : "after · 다음 사건보다 뒤에 발생"}
                  : <a href={link(other)}>{title(other)}</a>
                </p>
              );
            })}
            <details>
              <summary>계산 근거</summary>
              <p>
                {projection.algorithm_version} ·{" "}
                {projection.solver_algorithm_version}
              </p>
              <ul>
                {[
                  ...new Set([
                    ...position.source_constraint_ids,
                    ...(composite?.duration.evidence ?? [])
                  ])
                ].map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        );
      })}
      <p>
        <a
          href={`/worlds/${projection.world_id}/revisions/${projection.source_revision}/graph/canons/${projection.canon_id}/temporal.json`}
        >
          같은 Revision의 공개 시간 JSON
        </a>
      </p>
    </section>
  );
}

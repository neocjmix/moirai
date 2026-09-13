import type {
  PublicEvent,
  PublicRelationalTemporalProjection
} from "@moirai/contracts";
import { RelationalTime } from "./relational-time";

/** Keep each Canon's temporal interpretation separate, including unresolved knowledge. */
export function EventTimeContext({
  canonTitle,
  projection,
  events,
  eventId,
  graphSearch = ""
}: {
  readonly canonTitle: string;
  readonly projection: PublicRelationalTemporalProjection;
  readonly events: readonly PublicEvent[];
  readonly eventId: string;
  readonly graphSearch?: string;
}) {
  const position = projection.positions.find(
    (value) => value.event_id === eventId
  );
  return (
    <section className="context-block" data-testid="event-time-context">
      <h2>시간 · {canonTitle}</h2>
      <p>
        {position?.kind === "unresolved"
          ? "아직 하나의 시점으로 정해지지 않았습니다."
          : (position?.display_label ??
            "이 Canon에는 아직 시간 근거가 없습니다.")}
      </p>
      <details>
        <summary>시간 범위·구성 사건·계산 근거</summary>
        <RelationalTime
          projection={projection}
          events={events}
          eventId={eventId}
          graphSearch={graphSearch}
        />
      </details>
    </section>
  );
}

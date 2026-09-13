import type {
  PublicEvent,
  PublicRelationalTemporalProjection
} from "@moirai/contracts";
import { RelationalTime } from "./relational-time";
import { eventTimeSummary } from "../lib/event-time-summary";

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
  return (
    <section className="context-block" data-testid="event-time-context">
      <h2>시간 · {canonTitle}</h2>
      <p>{eventTimeSummary(projection, events, eventId)}</p>
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

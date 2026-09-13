import type {
  CanonicalEventReference,
  PublicEvent,
  PublicRelationalTemporalProjection
} from "@moirai/contracts";

/** Reader copy only: never turn layout or a knowledge interval into duration. */
export function eventTimeSummary(
  projection: Pick<
    PublicRelationalTemporalProjection,
    "positions" | "composites"
  >,
  events: readonly Pick<PublicEvent, "id" | "title">[],
  eventId: string
): string {
  const position = projection.positions.find((p) => p.event_id === eventId);
  const composite = projection.composites.find((c) => c.event_id === eventId);
  if (composite) {
    const label = (ref: CanonicalEventReference | null): string => {
      if (!ref) return "미정";
      if (ref.kind === "time_event") return ref.coordinate;
      return (
        events.find((e) => e.id === ref.event_id)?.title ?? "이름 미확인 사건"
      );
    };
    const boundary = `시작: ${label(composite.start_ref)} · 종료: ${label(composite.end_ref)}`;
    return composite.duration.kind === "unresolved"
      ? `${boundary} · 정확한 지속시간은 미정입니다.`
      : boundary;
  }
  return position?.display_label ?? "이 Canon에는 아직 시간 근거가 없습니다.";
}

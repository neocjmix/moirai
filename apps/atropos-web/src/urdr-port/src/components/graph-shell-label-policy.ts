// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
import type { GraphEntityEditorial } from "@urdr/contracts";

export type EditorialZoomBucket = "near" | "mid" | "far";

type PointLabelCandidate = {
  id: string;
  label: string;
  x: number;
  y: number;
  editorial?: GraphEntityEditorial;
};

export type PointLabelPolicyResult = {
  id: string;
  showLabel: boolean;
  renderedLabel: string;
  priorityScore: number;
};

export type PointElisionCandidate = {
  id: string;
  containedBy?: string;
  editorial?: GraphEntityEditorial;
  diagnostics?: string[];
  hasWarningRisk?: boolean;
  isSelected?: boolean;
};

export type CompositeLabelCandidate = {
  label: string;
};

type CompositeLabelAnchor = "start" | "middle" | "end";

export type CompositeViewportLabelCandidate = {
  id: string;
  label: string;
  depth: number;
  footprint: number;
  opacity: number;
  labelX: number;
  labelY: number;
  labelAnchor: CompositeLabelAnchor;
  labelAngle: number;
  editorial?: GraphEntityEditorial;
};

export type CompositeLabelPolicyResult = {
  id: string;
  showLabel: boolean;
  renderedLabel: string;
  priorityScore: number;
};

const ROLE_PRIORITY: Record<NonNullable<GraphEntityEditorial["role"]>, number> = {
  boundary: 400,
  composite: 300,
  ordinary: 200,
  declaration: 100,
  anchor: 50,
};

const IMPORTANCE_PRIORITY: Record<NonNullable<GraphEntityEditorial["importance"]>, number> = {
  critical: 40,
  major: 30,
  supporting: 20,
  incidental: 10,
};

const DENSITY_PRIORITY: Record<NonNullable<GraphEntityEditorial["contentDensity"]>, number> = {
  detail: 4,
  event: 3,
  process: 2,
  omit: 0,
};

function getPointLabelPriority(editorial?: GraphEntityEditorial) {
  if (!editorial) {
    return 150;
  }

  return (
    ROLE_PRIORITY[editorial.role] +
    IMPORTANCE_PRIORITY[editorial.importance] +
    DENSITY_PRIORITY[editorial.contentDensity]
  );
}

function getCompositeLabelPriority(editorial: GraphEntityEditorial | undefined, depth: number, footprint: number) {
  const editorialPriority = getPointLabelPriority(editorial);
  const footprintBonus = Math.min(60, Math.round(Math.sqrt(Math.max(footprint, 0)) / 3));
  const depthPenalty = Math.max(0, depth - 1) * 8;
  return editorialPriority + footprintBonus - depthPenalty;
}

export function getEditorialPointPriority(editorial?: GraphEntityEditorial) {
  return getPointLabelPriority(editorial);
}

export function getEditorialZoomBucket(scaleY: number): EditorialZoomBucket {
  const normalizedScale = Math.abs(scaleY);
  if (normalizedScale >= 0.6) {
    return "near";
  }
  if (normalizedScale >= 0.22) {
    return "mid";
  }
  return "far";
}

function getTextBudget(zoomBucket: EditorialZoomBucket, editorial?: GraphEntityEditorial) {
  if (editorial?.contentDensity === "omit") {
    return 0;
  }

  if (zoomBucket === "near") {
    return 999;
  }

  if (zoomBucket === "mid") {
    return editorial?.importance === "critical" ? 20 : 16;
  }

  if (editorial?.role === "boundary" || editorial?.importance === "critical") {
    return 14;
  }

  return 12;
}

function getCompositeTextBudget(zoomBucket: EditorialZoomBucket, editorial?: GraphEntityEditorial) {
  if (zoomBucket === "near") {
    return 999;
  }

  if (zoomBucket === "mid") {
    if (editorial?.role === "boundary" || editorial?.importance === "critical") {
      return 24;
    }
    if (editorial?.importance === "major") {
      return 20;
    }
    return 16;
  }

  if (editorial?.role === "boundary" || editorial?.importance === "critical") {
    return 16;
  }
  if (editorial?.importance === "major") {
    return 13;
  }
  return 11;
}

function getCompositeConflictBudget(zoomBucket: EditorialZoomBucket, editorial?: GraphEntityEditorial) {
  if (zoomBucket === "near") {
    return editorial?.importance === "critical" ? 24 : 18;
  }

  if (zoomBucket === "mid") {
    return editorial?.importance === "critical" ? 16 : 12;
  }

  return editorial?.role === "boundary" || editorial?.importance === "critical" ? 12 : 9;
}

function shortenLabel(label: string, textBudget: number) {
  if (textBudget <= 0) {
    return "";
  }
  if (label.length <= textBudget) {
    return label;
  }
  if (textBudget <= 1) {
    return label.slice(0, textBudget);
  }
  return `${label.slice(0, textBudget - 1)}...`;
}

function stripCompositeSuffix(label: string) {
  return label.replace(/\s+(episode|arc|saga|phase|campaign|process|narrative|에피소드|서사|단계|국면)$/i, "");
}

function getCompositeCandidateLabel(label: string, textBudget: number) {
  const stripped = stripCompositeSuffix(label).trim();
  const candidate = stripped.length >= 6 ? stripped : label;
  if (candidate.length <= textBudget) {
    return candidate;
  }

  return shortenLabel(candidate, textBudget);
}

function overlaps(a: { minX: number; maxX: number; minY: number; maxY: number }, b: { minX: number; maxX: number; minY: number; maxY: number }) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function getCompositeLabelBox(candidate: CompositeViewportLabelCandidate, renderedLabel: string) {
  const labelWidth = Math.max(renderedLabel.length * 7.5 + 20, 64);
  const labelHeight = 18;
  const radians = (candidate.labelAngle * Math.PI) / 180;
  const rotatedWidth = Math.abs(Math.cos(radians)) * labelWidth + Math.abs(Math.sin(radians)) * labelHeight;
  const rotatedHeight = Math.abs(Math.sin(radians)) * labelWidth + Math.abs(Math.cos(radians)) * labelHeight;

  return {
    minX: candidate.labelX - rotatedWidth / 2,
    maxX: candidate.labelX + rotatedWidth / 2,
    minY: candidate.labelY - rotatedHeight / 2,
    maxY: candidate.labelY + rotatedHeight / 2,
  };
}

export function applyEditorialPointLabelPolicy(
  points: PointLabelCandidate[],
  zoomBucket: EditorialZoomBucket,
): PointLabelPolicyResult[] {
  const placed: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
  const results = new Map<string, PointLabelPolicyResult>();

  const prioritized = [...points]
    .map((point) => {
      const priorityScore = getPointLabelPriority(point.editorial);
      const renderedLabel = shortenLabel(point.label, getTextBudget(zoomBucket, point.editorial));
      return { ...point, priorityScore, renderedLabel };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore || left.y - right.y || left.x - right.x);

  for (const point of prioritized) {
    if (!point.renderedLabel) {
      results.set(point.id, {
        id: point.id,
        showLabel: false,
        renderedLabel: "",
        priorityScore: point.priorityScore,
      });
      continue;
    }

    const labelWidth = Math.max(point.renderedLabel.length * 8 + 20, 64);
    const labelBox = {
      minX: point.x + 8,
      maxX: point.x + 8 + labelWidth,
      minY: point.y - 28,
      maxY: point.y - 4,
    };

    const showLabel = !placed.some((existing) => overlaps(labelBox, existing));
    if (showLabel) {
      placed.push(labelBox);
    }

    results.set(point.id, {
      id: point.id,
      showLabel,
      renderedLabel: point.renderedLabel,
      priorityScore: point.priorityScore,
    });
  }

  return points.map((point) => results.get(point.id) ?? {
    id: point.id,
    showLabel: true,
    renderedLabel: point.label,
    priorityScore: getPointLabelPriority(point.editorial),
  });
}

export function shouldElidePointForFarZoom(candidate: PointElisionCandidate) {
  if (!candidate.containedBy || candidate.isSelected || candidate.hasWarningRisk) {
    return false;
  }

  if ((candidate.diagnostics?.length ?? 0) > 0) {
    return false;
  }

  const editorial = candidate.editorial;
  if (!editorial) {
    return false;
  }

  if (editorial.role === "boundary" || editorial.role === "composite" || editorial.role === "anchor") {
    return false;
  }

  if (editorial.importance === "critical" || editorial.importance === "major") {
    return false;
  }

  if (editorial.contentDensity !== "process" && editorial.contentDensity !== "omit") {
    return false;
  }

  return editorial.role === "ordinary" || editorial.role === "declaration";
}

export function applyCompositeLabelVisibilityPolicy(
  candidates: CompositeViewportLabelCandidate[],
  zoomBucket: EditorialZoomBucket,
): CompositeLabelPolicyResult[] {
  const placed: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
  const results = new Map<string, CompositeLabelPolicyResult>();

  const prioritized = [...candidates]
    .map((candidate) => {
      const priorityScore = getCompositeLabelPriority(candidate.editorial, candidate.depth, candidate.footprint);
      const renderedLabel = formatCompositeDisplayLabel({ label: candidate.label }, zoomBucket, candidate.editorial);
      const shortenedLabel = getCompositeCandidateLabel(candidate.label, getCompositeConflictBudget(zoomBucket, candidate.editorial));
      return {
        ...candidate,
        priorityScore,
        renderedLabel,
        shortenedLabel,
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore || left.labelY - right.labelY || left.labelX - right.labelX || left.id.localeCompare(right.id));

  for (const candidate of prioritized) {
    if (candidate.opacity <= 0.001) {
      results.set(candidate.id, {
        id: candidate.id,
        showLabel: false,
        renderedLabel: "",
        priorityScore: candidate.priorityScore,
      });
      continue;
    }

    const attempts = [candidate.renderedLabel, candidate.shortenedLabel]
      .filter((label, index, labels) => label.length > 0 && labels.indexOf(label) === index);

    let acceptedLabel = "";
    for (const label of attempts) {
      const labelBox = getCompositeLabelBox(candidate, label);
      if (!placed.some((existing) => overlaps(labelBox, existing))) {
        placed.push(labelBox);
        acceptedLabel = label;
        break;
      }
    }

    results.set(candidate.id, {
      id: candidate.id,
      showLabel: acceptedLabel.length > 0,
      renderedLabel: acceptedLabel,
      priorityScore: candidate.priorityScore,
    });
  }

  return candidates.map((candidate) => results.get(candidate.id) ?? {
    id: candidate.id,
    showLabel: false,
    renderedLabel: "",
    priorityScore: getCompositeLabelPriority(candidate.editorial, candidate.depth, candidate.footprint),
  });
}

export function formatCompositeDisplayLabel(
  region: CompositeLabelCandidate,
  zoomBucket: EditorialZoomBucket,
  editorial?: GraphEntityEditorial,
) {
  if (zoomBucket === "near") {
    return region.label;
  }

  const textBudget = getCompositeTextBudget(zoomBucket, editorial);
  return getCompositeCandidateLabel(region.label, textBudget);
}

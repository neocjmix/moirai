import type { Metadata } from "next";
import { ForceLab } from "../../../labs/layout-v2/force-lab";

export const metadata: Metadata = {
  title: "Layout Lab v2 · Moirai",
  description: "고정 Y, 독립적인 Iteration으로 관찰하는 X Force Simulation"
};

export default function LayoutLabV2Page() {
  return <ForceLab />;
}

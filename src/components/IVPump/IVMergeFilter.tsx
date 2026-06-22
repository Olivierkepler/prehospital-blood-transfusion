import React from "react";
import {
  G,
  Ellipse,
  Rect,
  Path,
} from "react-native-svg";

import IVRollerClamp from "./IVRollerClamp";

type IVMergeFilterProps = {
  x?: number;
  y?: number;
  scale?: number;
  leftColor?: string;
  rightColor?: string;
  outColor?: string;
};

export default function IVMergeFilter({
  x = 150,
  y = 560,
  scale = 1,
  leftColor = "#b91c1c",
  rightColor = "#38bdf8",
  outColor = "#7dd3fc",
}: IVMergeFilterProps) {
  return (
    <G transform={`translate(${x - 150} ${y - 560}) scale(${scale})`}>
      {/* Inlet barb rings */}
      <Ellipse
        cx={132}
        cy={540}
        rx={5}
        ry={3}
        fill="#f1f5f9"
        stroke="#94a3b8"
        strokeWidth={1}
        opacity={0.95}
      />

      <Ellipse
        cx={168}
        cy={540}
        rx={5}
        ry={3}
        fill="#f1f5f9"
        stroke="#94a3b8"
        strokeWidth={1}
        opacity={0.95}
      />

      <Rect
        x={120}
        y={544}
        width={60}
        height={28}
        rx={10}
        fill="#0f172a"
        opacity={0.08}
        transform="translate(2 3)"
      />

      <Rect
        x={120}
        y={544}
        width={60}
        height={28}
        rx={10}
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth={2}
      />

      <Rect
        x={126}
        y={544}
        width={22}
        height={22}
        rx={5}
        fill="#fee2e2"
        stroke="#fca5a5"
        strokeWidth={1}
      />

      <Rect
        x={152}
        y={544}
        width={22}
        height={22}
        rx={5}
        fill="#e0f2fe"
        stroke="#7dd3fc"
        strokeWidth={1}
      />

      <Path d="M132 547 V563" stroke="#b91c1c" strokeWidth={1} opacity={0.35} />
      <Path d="M137 547 V563" stroke="#b91c1c" strokeWidth={1} opacity={0.35} />
      <Path d="M142 547 V563" stroke="#b91c1c" strokeWidth={1} opacity={0.35} />

      <Path d="M158 547 V563" stroke="#0ea5e9" strokeWidth={1} opacity={0.35} />
      <Path d="M163 547 V563" stroke="#0ea5e9" strokeWidth={1} opacity={0.35} />
      <Path d="M168 547 V563" stroke="#0ea5e9" strokeWidth={1} opacity={0.35} />

      <Path
        d="M132 540 L132 544"
        stroke={leftColor}
        strokeWidth={4}
        strokeLinecap="round"
      />

      <Path
        d="M168 540 L168 544"
        stroke={rightColor}
        strokeWidth={4}
        strokeLinecap="round"
      />

      <Rect x={145} y={572} width={10} height={12} rx={3} fill="#94a3b8" />

      <Path
        d="M150 584 C150 604, 150 626, 146 648 C142 676, 136 706, 132 736"
        fill="none"
        stroke="#dbeafe"
        strokeWidth={12}
        strokeLinecap="round"
        opacity={0.95}
      />

      <Path
        d="M150 584 C150 604, 150 626, 146 648 C142 676, 136 706, 132 736"
        fill="none"
        stroke={outColor}
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.95}
      />

      <Path
        d="M148 586 C148 605, 148 626, 144 648 C140 675, 135 704, 131 734"
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.45}
      />

      <IVRollerClamp cx={143} topY={652} />

      <Rect
        x={124}
        y={734}
        width={16}
        height={28}
        rx={5}
        fill="#cbd5e1"
        stroke="#94a3b8"
        strokeWidth={1.5}
      />

      <Rect x={127} y={740} width={10} height={12} rx={3} fill="#e2e8f0" />

      <Rect
        x={120}
        y={762}
        width={24}
        height={18}
        rx={4}
        fill="#dbeafe"
        stroke="#94a3b8"
        strokeWidth={1.5}
      />

      <Path
        d="M132 780 L132 792"
        stroke="#94a3b8"
        strokeWidth={3}
        strokeLinecap="round"
      />

      <Path
        d="M132 792 L128 820"
        stroke="#94a3b8"
        strokeWidth={2}
        strokeLinecap="round"
      />

      <Path
        d="M125 542 L125 568"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.5}
      />
    </G>
  );
}
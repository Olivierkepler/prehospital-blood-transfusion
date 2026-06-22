import React from "react";
import {
  G,
  Rect,
  Line,
  Circle,
} from "react-native-svg";

type IVRollerClampProps = {
  cx: number;
  topY?: number;
};

export default function IVRollerClamp({
  cx,
  topY = 620,
}: IVRollerClampProps) {
  const yMid = topY + 12;
  const yRidge = topY + 8;

  return (
    <G>
      <Rect
        x={cx - 14}
        y={topY}
        width={28}
        height={24}
        rx={6}
        fill="#e5e7eb"
        stroke="#94a3b8"
        strokeWidth={1.5}
      />

      <Line
        x1={cx - 8}
        y1={yRidge}
        x2={cx + 8}
        y2={yRidge}
        stroke="#cbd5e1"
        strokeWidth={1}
      />

      <Circle cx={cx} cy={yMid} r={6} fill="#94a3b8" />

      <Circle cx={cx} cy={yMid} r={2.5} fill="#e2e8f0" />
    </G>
  );
}
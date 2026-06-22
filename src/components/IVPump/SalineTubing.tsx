import React from "react";
import {
  G,
  Path,
  Rect,
  Circle,
} from "react-native-svg";

type SalineTubingProps = {
  portX?: number;
  portY?: number;
  scale?: number;
  showDrip?: boolean;
  mergeInlet?: { x: number; y: number };
};

const CX = 130;

export default function SalineTubing({
  portX = 170,
  portY = 464,
  scale = 1,
  showDrip = true,
  mergeInlet,
}: SalineTubingProps) {
  return (
    <G transform={`translate(${portX - 170} ${portY - 464}) scale(${scale})`}>
      <Path
        d={`M${CX} 464 L${CX} 530`}
        fill="none"
        stroke="#e0f2fe"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      />

      <Path
        d={`M${CX} 464 L${CX} 530`}
        fill="none"
        stroke="#7dd3fc"
        strokeWidth={3.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.96}
      />

      <Path
        d={`M${CX - 0.5} 465 L${CX - 0.5} 528`}
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.52}
      />

      <Rect
        x={CX - 11}
        y={530}
        width={22}
        height={10}
        rx={4}
        fill="#cbd5e1"
        stroke="#94a3b8"
        strokeWidth={0.5}
      />

      <Rect
        x={CX - 9}
        y={540}
        width={18}
        height={54}
        rx={9}
        fill="#f8fdff"
        stroke="#94a3b8"
        strokeWidth={2}
      />

      <Rect
        x={CX - 6.5}
        y={567}
        width={13}
        height={18}
        rx={6}
        fill="#bae6fd"
        opacity={0.82}
      />

      <Path
        d={`M${CX - 4} 545 L${CX - 4} 586`}
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.62}
      />

      {showDrip && (
        <Circle
          cx={CX}
          cy={556}
          r={3.5}
          fill="#38bdf8"
          opacity={0.88}
        />
      )}

      {mergeInlet && (
        <>
          <Path
            d={`M${CX} 594 C${CX} 628, 95 548, ${mergeInlet.x} ${mergeInlet.y}`}
            fill="none"
            stroke="#dbeafe"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />

          <Path
            d={`M${CX} 594 C${CX} 628, 95 548, ${mergeInlet.x} ${mergeInlet.y}`}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={3.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.96}
          />

          <Path
            d={`M${CX - 0.5} 595 C${CX - 0.5} 624, 98 546, ${
              mergeInlet.x - 0.5
            } ${mergeInlet.y - 0.5}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.5}
          />
        </>
      )}
    </G>
  );
}
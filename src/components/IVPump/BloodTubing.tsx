import React from "react";
import {
  G,
  Path,
  Rect,
  Circle,
} from "react-native-svg";

type BloodTubingProps = {
  startX?: number;
  startY?: number;
  scale?: number;
  showDrip?: boolean;
  mergeInlet?: { x: number; y: number };
};

const CX = 170;

export default function BloodTubing({
  startX = 170,
  startY = 464,
  scale = 1,
  showDrip = true,
  mergeInlet,
}: BloodTubingProps) {
  return (
    <G transform={`translate(${startX - 170} ${startY - 464}) scale(${scale})`}>
      <Path
        d={`M${CX} 464 L${CX} 530`}
        fill="none"
        stroke="#fecaca"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      />

      <Path
        d={`M${CX} 464 L${CX} 530`}
        fill="none"
        stroke="#b91c1c"
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
        fill="#fecaca"
        stroke="#94a3b8"
        strokeWidth={0.5}
      />

      <Rect
        x={CX - 9}
        y={540}
        width={18}
        height={54}
        rx={9}
        fill="#fff7f7"
        stroke="#b91c1c"
        strokeWidth={2}
      />

      <Rect
        x={CX - 6.5}
        y={567}
        width={13}
        height={18}
        rx={6}
        fill="#b91c1c"
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
          fill="#b91c1c"
          opacity={0.88}
        />
      )}

      {mergeInlet && (
        <>
          <Path
            d={`M${CX} 594 C${CX + 48} 628, ${mergeInlet.x - 40} 548, ${
              mergeInlet.x
            } ${mergeInlet.y}`}
            fill="none"
            stroke="#fecaca"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.95}
          />

          <Path
            d={`M${CX} 594 C${CX + 48} 628, ${mergeInlet.x - 40} 548, ${
              mergeInlet.x
            } ${mergeInlet.y}`}
            fill="none"
            stroke="#b91c1c"
            strokeWidth={3.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.96}
          />

          <Path
            d={`M${CX - 0.5} 595 C${CX + 44} 624, ${
              mergeInlet.x - 38
            } 546, ${mergeInlet.x - 0.5} ${mergeInlet.y - 0.5}`}
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
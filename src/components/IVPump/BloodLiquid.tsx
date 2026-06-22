import React from "react";
import {
  G,
  Rect,
  Ellipse,
  Path,
} from "react-native-svg";

type BloodLiquidProps = {
  clipId: string;
  bloodGradientId: string;
  liquidGlowId: string;
  fillY: number;
  fillHeight: number;
  percent: number;
  waveOpacity: number;
};

export default function BloodLiquid({
  clipId,
  bloodGradientId,
  liquidGlowId,
  fillY,
  fillHeight,
  percent,
  waveOpacity,
}: BloodLiquidProps) {
  const wavePathOne = `
    M76 ${fillY}
    C100 ${fillY - 7}, 118 ${fillY + 8}, 142 ${fillY}
    C166 ${fillY - 8}, 188 ${fillY + 7}, 224 ${fillY}
    L224 ${fillY + 24}
    C197 ${fillY + 20}, 174 ${fillY + 30}, 150 ${fillY + 25}
    C122 ${fillY + 19}, 100 ${fillY + 31}, 76 ${fillY + 24}
    Z
  `;

  const wavePathTwo = `
    M76 ${fillY + 3}
    C102 ${fillY + 11}, 124 ${fillY - 6}, 146 ${fillY + 3}
    C169 ${fillY + 10}, 190 ${fillY - 3}, 224 ${fillY + 4}
  `;

  return (
    <G clipPath={`url(#${clipId})`}>
      <Rect
        x={66}
        y={fillY}
        width={170}
        height={fillHeight}
        fill={`url(#${bloodGradientId})`}
      />

      <Ellipse
        cx={128}
        cy={fillY + 38}
        rx={44}
        ry={95}
        fill="#ffffff"
        opacity={0.08}
        filter={`url(#${liquidGlowId})`}
      />

      <G opacity={waveOpacity}>
        <Path
          d={wavePathOne}
          fill="#ffb4b4"
          opacity={0.32}
        />

        <Path
          d={wavePathTwo}
          fill="none"
          stroke="#ffe4e4"
          strokeWidth={2}
          opacity={0.45}
        />
      </G>

      <Ellipse
        cx={150}
        cy={fillY}
        rx={68}
        ry={9}
        fill="#ffc0c0"
        opacity={percent > 0 ? 0.35 : 0}
      />

      <Ellipse
        cx={150}
        cy={fillY + 2}
        rx={62}
        ry={5}
        fill="#7f1d1d"
        opacity={percent > 0 ? 0.22 : 0}
      />
    </G>
  );
}
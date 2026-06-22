import React from "react";
import {
  G,
  Rect,
  Ellipse,
  Path,
} from "react-native-svg";

type SalineLiquidProps = {
  clipId: string;
  liquidGradientId: string;
  liquidGlowId: string;
  fillY: number;
  fillHeight: number;
  percent: number;
  waveOpacity: number;
};

export default function SalineLiquid({
  clipId,
  liquidGradientId,
  liquidGlowId,
  fillY,
  fillHeight,
  percent,
  waveOpacity,
}: SalineLiquidProps) {
  const wavePath = `
    M76 ${fillY}
    C98 ${fillY - 5}, 120 ${fillY + 6}, 145 ${fillY}
    C170 ${fillY - 6}, 192 ${fillY + 5}, 224 ${fillY}
    L224 ${fillY + 22}
    C194 ${fillY + 18}, 172 ${fillY + 26}, 148 ${fillY + 22}
    C124 ${fillY + 17}, 100 ${fillY + 28}, 76 ${fillY + 22}
    Z
  `;

  return (
    <G clipPath={`url(#${clipId})`}>
      <Rect
        x={66}
        y={fillY}
        width={170}
        height={fillHeight}
        fill={`url(#${liquidGradientId})`}
        opacity={0.75}
      />

      <Ellipse
        cx={128}
        cy={fillY + 42}
        rx={48}
        ry={98}
        fill="#ffffff"
        opacity={0.12}
        filter={`url(#${liquidGlowId})`}
      />

      <G opacity={waveOpacity}>
        <Path d={wavePath} fill="#e0f2fe" opacity={0.45} />
      </G>

      <Ellipse
        cx={150}
        cy={fillY}
        rx={68}
        ry={9}
        fill="#f0f9ff"
        opacity={percent > 0 ? 0.45 : 0}
      />

      <Ellipse
        cx={150}
        cy={fillY + 2}
        rx={62}
        ry={5}
        fill="#7dd3fc"
        opacity={percent > 0 ? 0.18 : 0}
      />
    </G>
  );
}
import React from "react";
import {
  Path,
  Circle,
  Rect,
  G,
  Line,
  Text as SvgText,
} from "react-native-svg";

type SalineBagShellProps = {
  bagGradientId: string;
  glossGradientId: string;
  innerShadowId: string;
};

export default function SalineBagShell({
  bagGradientId,
  glossGradientId,
  innerShadowId,
}: SalineBagShellProps) {
  return (
    <>
      <Path
        d="M150 18 C150 18, 124 22, 124 50 C124 72, 138 82, 150 82 C162 82, 176 72, 176 50"
        fill="none"
        stroke="#64748b"
        strokeWidth={8}
        strokeLinecap="round"
      />

      <Circle cx={150} cy={50} r={8} fill="#cbd5e1" />

      <Path
        d="M150 82 L150 100"
        stroke="#64748b"
        strokeWidth={6}
        strokeLinecap="round"
      />

      <Path
        d="M150 100 L150 108"
        stroke="#94a3b8"
        strokeWidth={7}
        strokeLinecap="round"
      />

      <Path
        d="M92 110 Q76 110 76 128 L76 324 Q76 374 103 400 Q120 418 150 438 Q180 418 197 400 Q224 374 224 324 L224 128 Q224 110 208 110 Z"
        fill={`url(#${bagGradientId})`}
        stroke="#94a3b8"
        strokeWidth={3.5}
        filter={`url(#${innerShadowId})`}
      />

      <Path
        d="M90 126 L90 318"
        stroke="#dbeafe"
        strokeWidth={2}
        opacity={0.8}
      />

      <Path
        d="M210 126 L210 318"
        stroke="#dbeafe"
        strokeWidth={2}
        opacity={0.8}
      />

      <Path
        d="M98 128 Q86 176 88 280"
        stroke="#ffffff"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.62}
      />

      <Path
        d="M205 136 Q214 178 210 260"
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.22}
      />

      <Path
        d="M92 110 Q76 110 76 128 L76 324 Q76 374 103 400 Q120 418 150 438 Q180 418 197 400 Q224 374 224 324 L224 128 Q224 110 208 110 Z"
        fill={`url(#${glossGradientId})`}
        opacity={0.34}
      />

      <Rect x={122} y={415} width={16} height={44} rx={5} fill="#94a3b8" />
      <Rect x={162} y={415} width={16} height={44} rx={5} fill="#94a3b8" />

      <G opacity={0.7}>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 358 - i * 48;

          return (
            <G key={i}>
              <Line
                x1={226}
                y1={y}
                x2={242}
                y2={y}
                stroke="#475569"
                strokeWidth={2}
              />
              <SvgText
                x={247}
                y={y + 4}
                fontSize={10}
                fill="#475569"
                fontWeight="700"
              >
                {200 * (i + 1)}
              </SvgText>
            </G>
          );
        })}
      </G>
    </>
  );
}
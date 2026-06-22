import React from "react";
import {
  Path,
  Circle,
  Rect,
  G,
  Line,
  Text as SvgText,
} from "react-native-svg";

type BloodBagShellProps = {
  plasticGradientId: string;
  glossGradientId: string;
  innerShadowId: string;
};

export default function BloodBagShell({
  plasticGradientId,
  glossGradientId,
  innerShadowId,
}: BloodBagShellProps) {
  return (
    <>
      {/* hook */}
      <Path
        d="M150 18 C150 18, 123 20, 123 50 C123 72, 138 80, 150 80 C162 80, 177 72, 177 50"
        fill="none"
        stroke="#64748b"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <Circle cx={150} cy={50} r={8} fill="#94a3b8" />
      <Path
        d="M150 80 L150 102"
        stroke="#64748b"
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* top tubing + port */}
      <Path
        d="M150 102 L150 116"
        stroke="#991b1b"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <Rect x={134} y={114} width={32} height={22} rx={6} fill="#b91c1c" />
      <Rect x={139} y={136} width={22} height={16} rx={5} fill="#ef4444" />

      {/* outer bag */}
      <Path
        d="M92 120 Q76 120 76 137 L76 320 Q76 370 103 396 Q120 414 150 432 Q180 414 197 396 Q224 370 224 320 L224 137 Q224 120 208 120 Z"
        fill={`url(#${plasticGradientId})`}
        stroke="#b91c1c"
        strokeWidth={4}
        filter={`url(#${innerShadowId})`}
      />

      {/* seams */}
      <Path
        d="M89 134 L89 314"
        stroke="#fca5a5"
        strokeWidth={2}
        opacity={0.65}
      />
      <Path
        d="M211 134 L211 314"
        stroke="#fca5a5"
        strokeWidth={2}
        opacity={0.65}
      />

      {/* gloss */}
      <Path
        d="M97 138 Q84 180 86 270"
        stroke="#ffffff"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.52}
      />
      <Path
        d="M205 148 Q214 175 209 254"
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.18}
      />
      <Path
        d="M92 120 Q76 120 76 137 L76 320 Q76 370 103 396 Q120 414 150 432 Q180 414 197 396 Q224 370 224 320 L224 137 Q224 120 208 120 Z"
        fill={`url(#${glossGradientId})`}
        opacity={0.28}
      />

      {/* bottom ports */}
      <Rect x={122} y={415} width={16} height={44} rx={5} fill="#991b1b" />
      <Rect x={162} y={415} width={16} height={44} rx={5} fill="#991b1b" />

      {/* volume marks */}
      <G opacity={0.68}>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 352 - i * 46;

          return (
            <G key={i}>
              <Line
                x1={226}
                y1={y}
                x2={242}
                y2={y}
                stroke="#7f1d1d"
                strokeWidth={2}
              />
              <SvgText
                x={247}
                y={y + 4}
                fontSize={10}
                fill="#7f1d1d"
                fontWeight="700"
              >
                {90 * (i + 1)}
              </SvgText>
            </G>
          );
        })}
      </G>
    </>
  );
}
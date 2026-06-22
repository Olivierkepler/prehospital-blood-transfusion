import React from "react";
import {
  G,
  Rect,
  Text as SvgText,
} from "react-native-svg";

type SalineBagLabelProps = {
  labelGradientId: string;
  volumeMl: number;
  unitId?: string;
  productName?: string;
  concentration?: string;
};

export default function SalineBagLabel({
  labelGradientId,
  volumeMl,
  unitId = "NS-2048",
  productName = "Sodium Chloride",
  concentration = "0.9% NaCl",
}: SalineBagLabelProps) {
  return (
    <>
      <G>
        <Rect
          x={94}
          y={150}
          width={112}
          height={118}
          rx={14}
          fill={`url(#${labelGradientId})`}
          stroke="#dbeafe"
          strokeWidth={1.4}
          opacity={0.98}
        />

        <SvgText
          x={106}
          y={170}
          fontSize={10}
          fontWeight="800"
          fill="#64748b"
          letterSpacing={1.5}
        >
          IV SOLUTION
        </SvgText>

        <SvgText
          x={106}
          y={194}
          fontSize={18}
          fontWeight="800"
          fill="#0369a1"
        >
          0.9% NaCl
        </SvgText>

        <SvgText x={106} y={214} fontSize={10} fill="#334155">
          {productName}
        </SvgText>

        <SvgText
          x={106}
          y={230}
          fontSize={11}
          fontWeight="700"
          fill="#0f172a"
        >
          {concentration}
        </SvgText>

        <SvgText x={106} y={246} fontSize={11} fill="#334155">
          {`Vol: ${volumeMl} mL`}
        </SvgText>

        <SvgText x={106} y={262} fontSize={10} fill="#64748b">
          {`ID: ${unitId}`}
        </SvgText>
      </G>

      <G opacity={0.92}>
        <Rect
          x={102}
          y={280}
          width={96}
          height={26}
          rx={6}
          fill="#ffffff"
          opacity={0.9}
        />

        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Rect
            key={i}
            x={108 + i * 9}
            y={286}
            width={i % 2 === 0 ? 2 : 4}
            height={13 + (i % 3)}
            fill="#0f172a"
            opacity={0.75}
          />
        ))}
      </G>
    </>
  );
}
import React from 'react';
import { G, Rect, Text as SvgText } from 'react-native-svg';

type BloodBagLabelProps = {
  labelGradientId: string;
  volumeMl: number;
  bloodType?: string;
  unitId?: string;
  productName?: string;
};

export default function BloodBagLabel({
  labelGradientId,
  volumeMl,
  bloodType = 'O+',
  unitId = 'BB-2048',
  productName = 'Whole Blood',
}: BloodBagLabelProps) {
  return (
    <>
      <G>
        <Rect
          x={98}
          y={146}
          width={104}
          height={102}
          rx={13}
          fill={`url(#${labelGradientId})`}
          stroke="#e2e8f0"
          strokeWidth={1.4}
          opacity={0.97}
        />
        <SvgText
          x={110}
          y={166}
          fontSize={10}
          fontWeight="800"
          fill="#64748b"
          letterSpacing={1.8}
        >
          DONOR UNIT
        </SvgText>
        <SvgText x={110} y={194} fontSize={30} fontWeight="800" fill="#b91c1c">
          {bloodType}
        </SvgText>
        <SvgText x={110} y={212} fontSize={11} fill="#334155">
          {productName}
        </SvgText>
        <SvgText x={110} y={228} fontSize={11} fill="#334155">
          {`Vol: ${volumeMl} mL`}
        </SvgText>
        <SvgText x={110} y={244} fontSize={10} fill="#64748b">
          {`ID: ${unitId}`}
        </SvgText>
      </G>

      <G opacity={0.9}>
        <Rect x={104} y={260} width={92} height={28} rx={6} fill="#fff" opacity={0.85} />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
          <Rect
            key={i}
            x={110 + i * 8}
            y={266}
            width={i % 2 === 0 ? 2 : 4}
            height={14 + (i % 3) * 2}
            fill="#0f172a"
            opacity={0.8}
          />
        ))}
        <SvgText x={112} y={284} fontSize={8} fill="#475569">
          4 59021 88402
        </SvgText>
      </G>
    </>
  );
}

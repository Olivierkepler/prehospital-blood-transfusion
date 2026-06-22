import React from "react";
import {
  G,
  Path,
  Defs,
  Filter,
  FeDropShadow,
  Ellipse,
  Circle,
} from "react-native-svg";

type Point = { x: number; y: number };

export type IVSceneTubingProps = {
  bloodDrip: Point;
  salineDrip: Point;
  leftInlet: Point;
  rightInlet: Point;
  bloodActive: boolean;
  salineActive: boolean;
  leftColor?: string;
  rightColor?: string;
  leftGlow?: string;
  rightGlow?: string;
};

const TW = { outer: 10, inner: 3.8, gloss: 1.5 } as const;
const TO = { outer: 0.95, inner: 0.96, gloss: 0.52 } as const;

function yHub(
  blood: Point,
  saline: Point,
  leftIn: Point,
  rightIn: Point
): Point {
  const cx = (leftIn.x + rightIn.x) / 2;
  const dripMidY = (blood.y + saline.y) / 2;
  const y = leftIn.y + (dripMidY - leftIn.y) * 0.34;
  return { x: cx, y };
}

function tubeStack(
  d: string,
  key: string,
  outer: { stroke: string; w: number; o: number },
  inner: { stroke: string; w: number; o: number },
  gloss: { stroke: string; w: number; o: number }
) {
  return (
    <G key={key}>
      <Path
        d={d}
        fill="none"
        stroke={outer.stroke}
        strokeWidth={outer.w}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={outer.o}
      />
      <Path
        d={d}
        fill="none"
        stroke={inner.stroke}
        strokeWidth={inner.w}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={inner.o}
      />
      <Path
        d={d}
        fill="none"
        stroke={gloss.stroke}
        strokeWidth={gloss.w}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={gloss.o}
      />
    </G>
  );
}

export default function IVSceneTubing({
  bloodDrip,
  salineDrip,
  leftInlet,
  rightInlet,
  bloodActive,
  salineActive,
  leftColor = "#b91c1c",
  rightColor = "#38bdf8",
  leftGlow = "#fecaca",
  rightGlow = "#dbeafe",
}: IVSceneTubingProps) {
  const H = yHub(bloodDrip, salineDrip, leftInlet, rightInlet);

  const both = bloodActive && salineActive;

  const drop = 52;

  const bloodDropY = bloodDrip.y + drop;
  const bloodToHub = `M${bloodDrip.x} ${bloodDrip.y} L${bloodDrip.x} ${bloodDropY} C${bloodDrip.x + 48} ${
    bloodDropY + 34
  }, ${H.x - 48} ${H.y + 20}, ${H.x} ${H.y}`;

  const salineDrop = salineDrip.y + drop;
  const salineToHub = `M${salineDrip.x} ${salineDrip.y} L${salineDrip.x} ${salineDrop} C${salineDrip.x - 48} ${
    salineDrop + 34
  }, ${H.x + 48} ${H.y + 20}, ${H.x} ${H.y}`;

  const hubToLeft = `M${H.x} ${H.y} C${H.x - 16} ${H.y - 12}, ${leftInlet.x + 10} ${
    leftInlet.y + 8
  }, ${leftInlet.x} ${leftInlet.y}`;

  const hubToRight = `M${H.x} ${H.y} C${H.x + 16} ${H.y - 12}, ${rightInlet.x - 10} ${
    rightInlet.y + 8
  }, ${rightInlet.x} ${rightInlet.y}`;

  const bloodOnly = `M${bloodDrip.x} ${bloodDrip.y} L${bloodDrip.x} ${
    bloodDrip.y + drop
  } C${bloodDrip.x + 58} ${bloodDrip.y + drop + 42}, ${leftInlet.x + 22} ${
    leftInlet.y + 24
  }, ${leftInlet.x} ${leftInlet.y}`;

  const salineOnly = `M${salineDrip.x} ${salineDrip.y} L${salineDrip.x} ${
    salineDrip.y + drop
  } C${salineDrip.x - 58} ${salineDrip.y + drop + 42}, ${rightInlet.x - 22} ${
    rightInlet.y + 24
  }, ${rightInlet.x} ${rightInlet.y}`;

  return (
    <G pointerEvents="none">
      <Defs>
        <Filter id="tubingShadow" x="-20%" y="-20%" width="140%" height="140%">
          <FeDropShadow
            dx="0"
            dy="1.2"
            stdDeviation="1.2"
            floodColor="#0f172a"
            floodOpacity="0.18"
          />
        </Filter>
      </Defs>

      <G filter="url(#tubingShadow)">
        {both ? (
          <>
            {bloodActive &&
              tubeStack(
                bloodToHub,
                "b-arm",
                { stroke: leftGlow, w: TW.outer, o: TO.outer },
                { stroke: leftColor, w: TW.inner, o: TO.inner },
                { stroke: "#fff", w: TW.gloss, o: TO.gloss }
              )}

            {salineActive &&
              tubeStack(
                salineToHub,
                "s-arm",
                { stroke: rightGlow, w: TW.outer, o: TO.outer },
                { stroke: rightColor, w: TW.inner, o: TO.inner },
                { stroke: "#fff", w: TW.gloss, o: TO.gloss }
              )}

            {bloodActive &&
              tubeStack(
                hubToLeft,
                "b-fin",
                { stroke: leftGlow, w: TW.outer, o: TO.outer },
                { stroke: leftColor, w: TW.inner, o: TO.inner },
                { stroke: "#fff", w: TW.gloss, o: TO.gloss }
              )}

            {salineActive &&
              tubeStack(
                hubToRight,
                "s-fin",
                { stroke: rightGlow, w: TW.outer, o: TO.outer },
                { stroke: rightColor, w: TW.inner, o: TO.inner },
                { stroke: "#fff", w: TW.gloss, o: TO.gloss }
              )}

            <Ellipse
              cx={H.x}
              cy={H.y}
              rx={9}
              ry={7.5}
              fill="#e2e8f0"
              stroke="#64748b"
              strokeWidth={1.25}
            />
            <Ellipse
              cx={H.x}
              cy={H.y - 0.5}
              rx={5}
              ry={4}
              fill="#f8fafc"
              stroke="#94a3b8"
              strokeWidth={0.8}
              opacity={0.95}
            />
            <Circle cx={H.x} cy={H.y} r={2.2} fill="#cbd5e1" />
          </>
        ) : (
          <>
            {bloodActive &&
              tubeStack(
                bloodOnly,
                "b-only",
                { stroke: leftGlow, w: TW.outer, o: TO.outer },
                { stroke: leftColor, w: TW.inner, o: TO.inner },
                { stroke: "#fff", w: TW.gloss, o: TO.gloss }
              )}

            {salineActive &&
              tubeStack(
                salineOnly,
                "s-only",
                { stroke: rightGlow, w: TW.outer, o: TO.outer },
                { stroke: rightColor, w: TW.inner, o: TO.inner },
                { stroke: "#fff", w: TW.gloss, o: TO.gloss }
              )}
          </>
        )}
      </G>
    </G>
  );
}
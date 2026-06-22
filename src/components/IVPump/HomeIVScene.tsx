import React, { useMemo, useState, useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import Svg, { G } from "react-native-svg";

import BloodBag from "./BloodBag";
import SalineBag from "./SalineBag";
import IVMergeFilter from "./IVMergeFilter";
import IVRollerClamp from "./IVRollerClamp";
import IVSceneTubing from "./IVSceneTubing";

const BLOOD_GROUP_TX = 20;
const BLOOD_GROUP_TY = 16;
const SALINE_GROUP_TX = 360;
const SALINE_GROUP_TY = 16;

const FILTER_X = 370;
const FILTER_Y = 718;

const SVG_WIDTH = 760;
const SVG_HEIGHT = 1040;
// BloodBag becomes sticky after scrolling 20% of SVG height
const STICKY_THRESHOLD_PX = SVG_HEIGHT * 0.2; // 208px in SVG units

function filterPointWorld(localX: number, localY: number) {
  return { x: localX + FILTER_X - 150, y: localY + FILTER_Y - 560 };
}

function subtitleFromProduct(name: string, maxLen = 36) {
  const t = name.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

const leftInletWorld = filterPointWorld(132, 540);
const rightInletWorld = filterPointWorld(168, 540);
const bloodDripWorld = { x: BLOOD_GROUP_TX + 170, y: BLOOD_GROUP_TY + 594 };
const salineDripWorld = { x: SALINE_GROUP_TX + 130, y: SALINE_GROUP_TY + 594 };

type HomeIVSceneProps = {
  bloodType?: string;
  bloodVolume?: number;
  bloodMaxVolume?: number;
  /** Total mL infused from the blood bag so far (used to reduce visible level). */
  bloodInfusedMl?: number;
  bloodUnitId?: string;
  bloodProductName?: string;
  salineVolume?: number;
  salineMaxVolume?: number;
  /** Total mL infused from the saline bag so far (used to reduce visible level). */
  salineInfusedMl?: number;
  salineUnitId?: string;
  salineProductName?: string;
  salineConcentration?: string;
  /** How long to animate level changes (ms). */
  levelAnimationMs?: number;
  width?: number;
  height?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pctFromMl(currentMl: number, maxMl: number) {
  if (!Number.isFinite(currentMl) || !Number.isFinite(maxMl) || maxMl <= 0) return 0;
  return Math.round(clamp((currentMl / maxMl) * 100, 0, 100));
}

export default function HomeIVScene({
  bloodType = "A+",
  bloodVolume = 360,
  bloodMaxVolume = 450,
  bloodInfusedMl = 0,
  bloodUnitId = "BB-9031",
  bloodProductName = "Packed Red Cells",
  salineVolume = 750,
  salineMaxVolume = 1000,
  salineInfusedMl = 0,
  salineUnitId = "NS-7781",
  salineProductName = "Sodium Chloride Injection",
  salineConcentration = "0.9% NaCl",
  levelAnimationMs = 900,
  width = SVG_WIDTH,
  height = SVG_HEIGHT,
}: HomeIVSceneProps) {
  const remainingBloodMl = useMemo(
    () => clamp(bloodVolume - bloodInfusedMl, 0, bloodMaxVolume),
    [bloodVolume, bloodInfusedMl, bloodMaxVolume]
  );
  const remainingSalineMl = useMemo(
    () => clamp(salineVolume - salineInfusedMl, 0, salineMaxVolume),
    [salineVolume, salineInfusedMl, salineMaxVolume]
  );

  const targetBloodPct = useMemo(
    () => pctFromMl(remainingBloodMl, bloodMaxVolume),
    [remainingBloodMl, bloodMaxVolume]
  );
  const targetSalinePct = useMemo(
    () => pctFromMl(remainingSalineMl, salineMaxVolume),
    [remainingSalineMl, salineMaxVolume]
  );

  const [bloodPct, setBloodPct] = useState(targetBloodPct);
  const [salinePct, setSalinePct] = useState(targetSalinePct);
  const bloodPctRef = useRef(bloodPct);
  const salinePctRef = useRef(salinePct);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    bloodPctRef.current = bloodPct;
  }, [bloodPct]);

  useEffect(() => {
    salinePctRef.current = salinePct;
  }, [salinePct]);

  useEffect(() => {
    const fromBlood = bloodPctRef.current;
    const fromSaline = salinePctRef.current;
    const toBlood = targetBloodPct;
    const toSaline = targetSalinePct;

    if (fromBlood === toBlood && fromSaline === toSaline) return;

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const start = Date.now();
    const duration = clamp(levelAnimationMs, 0, 5000);

    const step = () => {
      const t = duration === 0 ? 1 : clamp((Date.now() - start) / duration, 0, 1);
      const nextBlood = Math.round(fromBlood + (toBlood - fromBlood) * t);
      const nextSaline = Math.round(fromSaline + (toSaline - fromSaline) * t);

      setBloodPct(nextBlood);
      setSalinePct(nextSaline);

      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [targetBloodPct, targetSalinePct, levelAnimationMs]);

  // Track scroll offset to compute BloodBag sticky translation
  const scrollY = useRef(new Animated.Value(0)).current;

  // Container width for scaling SVG
  const [containerWidth, setContainerWidth] = useState(width);
  const scale = containerWidth / SVG_WIDTH;
  const scaledHeight = SVG_HEIGHT * scale;

  // How far (in SVG units) the scroll has gone past the sticky threshold
  // scrollY is in screen px → convert to SVG units via scale
  const bloodBagTranslateY = scrollY.interpolate({
    inputRange: [0, STICKY_THRESHOLD_PX * scale],
    outputRange: [0, STICKY_THRESHOLD_PX], // SVG units
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Past the threshold, BloodBag moves with scroll to stay pinned
  // We need: translateY = scrollInSvgUnits - STICKY_THRESHOLD_PX (clamped to >= 0)
  const bloodBagStickyY = Animated.subtract(
    scrollY.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1 / scale], // screen px → SVG units
    }),
    bloodBagTranslateY
  );

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ height: scaledHeight }}
      >
        {/* Full scrolling SVG — everything EXCEPT BloodBag */}
        <Svg
          width={containerWidth}
          height={scaledHeight}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          style={StyleSheet.absoluteFill}
        >
          <SalineBag
            volume={salineVolume}
            maxVolume={salineMaxVolume}
            unitId={salineUnitId}
            productName={salineProductName}
            concentration={salineConcentration}
            showSlider={false}
            svgGroupTransform={`translate(${SALINE_GROUP_TX} ${SALINE_GROUP_TY})`}
            fluidPercent={salinePct}
          />

          <IVSceneTubing
            bloodDrip={bloodDripWorld}
            salineDrip={salineDripWorld}
            leftInlet={leftInletWorld}
            rightInlet={rightInletWorld}
            bloodActive={bloodPct > 0}
            salineActive={salinePct > 0}
          />

          <G transform={`translate(${BLOOD_GROUP_TX} ${BLOOD_GROUP_TY})`}>
            <IVRollerClamp cx={170} />
          </G>

          <G transform={`translate(${SALINE_GROUP_TX} ${SALINE_GROUP_TY})`}>
            <IVRollerClamp cx={130} />
          </G>

          <IVMergeFilter
            x={FILTER_X}
            y={FILTER_Y}
            leftColor="#b91c1c"
            rightColor="#38bdf8"
            outColor="#7dd3fc"
          />
        </Svg>

        {/*
          BloodBag sticky layer — separate Animated.View so we can apply
          a translateY that counteracts scrolling once past threshold.
          useNativeDriver:true requires transform, so we keep it on the wrapper.
        */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [0, STICKY_THRESHOLD_PX * scale, scaledHeight],
                    outputRange: [0, 0, scaledHeight - STICKY_THRESHOLD_PX * scale],
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Svg
            width={containerWidth}
            height={scaledHeight}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          >
            <BloodBag
              bloodType={bloodType}
              volume={bloodVolume}
              maxVolume={bloodMaxVolume}
              unitId={bloodUnitId}
              productName={bloodProductName}
              showSlider={false}
              svgGroupTransform={`translate(${BLOOD_GROUP_TX} ${BLOOD_GROUP_TY})`}
              fluidPercent={bloodPct}
            />
          </Svg>
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    flex: 1,
  },
});
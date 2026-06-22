import React from "react";
import {
  Defs,
  LinearGradient,
  Stop,
  ClipPath,
  Path,
  Filter,
  FeOffset,
  FeGaussianBlur,
  FeComposite,
  FeFlood,
} from "react-native-svg";

import IVBagBase from "./IVBagBase";
import BloodBagShell from "./BloodBagShell";
import BloodLiquid from "./BloodLiquid";
import BloodBagLabel from "./BloodBagLabel";
import BloodTubing from "./BloodTubing";

type BloodBagProps = {
  bloodType?: string;
  volume?: number;
  maxVolume?: number;
  unitId?: string;
  productName?: string;
  initialLevel?: number;
  showSlider?: boolean;
  fluidPercent?: number;
  onFluidPercentChange?: (percent: number) => void;
  svgGroupTransform?: string;
  mergeInletLocal?: { x: number; y: number };
};

export default function BloodBag({
  bloodType = "O+",
  volume = 325,
  maxVolume = 450,
  unitId = "BB-2048",
  productName = "Whole Blood",
  initialLevel,
  showSlider = true,
  fluidPercent,
  onFluidPercentChange,
  svgGroupTransform,
  mergeInletLocal,
}: BloodBagProps) {
  return (
    <IVBagBase
      title=""
      subtitle=""
      badge=""
      volume={volume}
      maxVolume={maxVolume}
      initialLevel={initialLevel}
      showSlider={showSlider}
      fluidPercent={fluidPercent}
      onFluidPercentChange={onFluidPercentChange}
      svgGroupTransform={svgGroupTransform}
      containerStyle={{
        borderColor: "rgba(254, 226, 226, 0.8)",
      }}
      sliderTrackColors={["#fecdd3", "#f87171", "#7f1d1d"]}
      sliderAccentColor="#b91c1c"
      pillStyle={{
        backgroundColor: "#fef2f2",
      }}
      pillTextStyle={{
        color: "#b91c1c",
      }}
      renderBag={(bag) => (
        <>
          <Defs>
            <LinearGradient
              id={bag.plasticGradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop offset="0%" stopColor="#ffffff" />
              <Stop offset="35%" stopColor="#fff8f8" />
              <Stop offset="70%" stopColor="#fff1f1" />
              <Stop offset="100%" stopColor="#ffe3e3" />
            </LinearGradient>

            <LinearGradient
              id={bag.liquidGradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop offset="0%" stopColor="#ff9a9a" />
              <Stop offset="18%" stopColor="#ef4444" />
              <Stop offset="45%" stopColor="#c81e1e" />
              <Stop offset="100%" stopColor="#5f0f0f" />
            </LinearGradient>

            <LinearGradient
              id={bag.labelGradientId}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop offset="0%" stopColor="#ffffff" />
              <Stop offset="100%" stopColor="#f8fafc" />
            </LinearGradient>

            <LinearGradient
              id={bag.glossGradientId}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.78} />
              <Stop offset="40%" stopColor="#ffffff" stopOpacity={0.18} />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>

            <ClipPath id={bag.clipId}>
              <Path d="M92 120 Q76 120 76 137 L76 320 Q76 370 103 396 Q120 414 150 432 Q180 414 197 396 Q224 370 224 320 L224 137 Q224 120 208 120 Z" />
            </ClipPath>

            <Filter
              id={bag.innerShadowId}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <FeOffset dx="0" dy="6" />
              <FeGaussianBlur stdDeviation="7" result="offset-blur" />
              <FeComposite
                operator="out"
                in="SourceGraphic"
                in2="offset-blur"
                result="inverse"
              />
              <FeFlood
                floodColor="#7f1d1d"
                floodOpacity="0.12"
                result="color"
              />
              <FeComposite
                operator="in"
                in="color"
                in2="inverse"
                result="shadow"
              />
              <FeComposite operator="over" in="shadow" in2="SourceGraphic" />
            </Filter>

            <Filter
              id={bag.liquidGlowId}
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <FeGaussianBlur stdDeviation="6" />
            </Filter>
          </Defs>

          <BloodBagShell
            plasticGradientId={bag.plasticGradientId}
            glossGradientId={bag.glossGradientId}
            innerShadowId={bag.innerShadowId}
          />

          <BloodLiquid
            clipId={bag.clipId}
            bloodGradientId={bag.liquidGradientId}
            liquidGlowId={bag.liquidGlowId}
            fillY={bag.fillY}
            fillHeight={bag.fillHeight}
            percent={bag.percent}
            waveOpacity={bag.waveOpacity}
          />

          <BloodBagLabel
            labelGradientId={bag.labelGradientId}
            volumeMl={bag.displayVolume}
            bloodType={bloodType}
            unitId={unitId}
            productName={productName}
          />

          <BloodTubing
            startX={170}
            startY={464}
            showDrip={bag.percent > 0}
            mergeInlet={mergeInletLocal}
          />
        </>
      )}
    />
  );
}
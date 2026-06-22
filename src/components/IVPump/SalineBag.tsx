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
import SalineBagShell from "./SalineBagShell";
import SalineLiquid from "./SalineLiquid";
import SalineBagLabel from "./SalineBagLabel";
import SalineTubing from "./SalineTubing";

type SalineBagProps = {
  volume?: number;
  maxVolume?: number;
  unitId?: string;
  productName?: string;
  concentration?: string;
  initialLevel?: number;
  showSlider?: boolean;
  fluidPercent?: number;
  onFluidPercentChange?: (percent: number) => void;
  svgGroupTransform?: string;
  mergeInletLocal?: { x: number; y: number };
};

export default function SalineBag({
  volume = 700,
  maxVolume = 1000,
  unitId = "NS-2048",
  productName = "Sodium Chloride ",
  concentration = "0.9% NaCl",
  initialLevel,
  showSlider = true,
  fluidPercent,
  onFluidPercentChange,
  svgGroupTransform,
  mergeInletLocal,
}: SalineBagProps) {
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
        borderColor: "rgba(224, 242, 254, 0.8)",
        backgroundColor: "transparent",
        shadowOpacity: 0,
        elevation: 0,
      }}
      sliderAccentColor="#0284c7"
      pillStyle={{
        backgroundColor: "#f0f9ff",
      }}
      pillTextStyle={{
        color: "#0369a1",
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
              <Stop offset="40%" stopColor="#f8fcff" />
              <Stop offset="100%" stopColor="#eef8ff" />
            </LinearGradient>

            <LinearGradient
              id={bag.liquidGradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop offset="0%" stopColor="#e0f2fe" />
              <Stop offset="35%" stopColor="#bae6fd" />
              <Stop offset="100%" stopColor="#7dd3fc" />
            </LinearGradient>

            <LinearGradient
              id={bag.labelGradientId}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop offset="0%" stopColor="#ffffff" />
              <Stop offset="100%" stopColor="#f0f9ff" />
            </LinearGradient>

            <LinearGradient
              id={bag.glossGradientId}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.82} />
              <Stop offset="45%" stopColor="#ffffff" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>

            <ClipPath id={bag.clipId}>
              <Path d="M92 110 Q76 110 76 128 L76 324 Q76 374 103 400 Q120 418 150 438 Q180 418 197 400 Q224 374 224 324 L224 128 Q224 110 208 110 Z" />
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
                floodColor="#0ea5e9"
                floodOpacity="0.08"
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

          <SalineBagShell
            bagGradientId={bag.plasticGradientId}
            glossGradientId={bag.glossGradientId}
            innerShadowId={bag.innerShadowId}
          />

          <SalineLiquid
            clipId={bag.clipId}
            liquidGradientId={bag.liquidGradientId}
            liquidGlowId={bag.liquidGlowId}
            fillY={bag.fillY}
            fillHeight={bag.fillHeight}
            percent={bag.percent}
            waveOpacity={bag.waveOpacity}
          />

          <SalineBagLabel
            labelGradientId={bag.labelGradientId}
            volumeMl={bag.displayVolume}
            unitId={unitId}
            productName={productName}
            concentration={concentration}
          />

          <SalineTubing
            portX={170}
            portY={464}
            showDrip={bag.percent > 0}
            mergeInlet={mergeInletLocal}
          />
        </>
      )}
    />
  );
}
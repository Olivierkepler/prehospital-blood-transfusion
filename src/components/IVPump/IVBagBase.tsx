import React, { ReactNode, useId, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { G } from "react-native-svg";
import Slider from "@react-native-community/slider";

type IVBagBaseRenderProps = {
  clipId: string;
  plasticGradientId: string;
  liquidGradientId: string;
  labelGradientId: string;
  glossGradientId: string;
  innerShadowId: string;
  liquidGlowId: string;
  fillY: number;
  fillHeight: number;
  percent: number;
  displayVolume: number;
  waveOpacity: number;
};

type IVBagBaseProps = {
  title: string;
  subtitle: string;
  badge: string;
  volume?: number;
  maxVolume?: number;
  initialLevel?: number;
  showSlider?: boolean;
  fluidPercent?: number;
  onFluidPercentChange?: (percent: number) => void;
  svgGroupTransform?: string;

  sliderAccentColor?: string;
  sliderTrackColors?: string[];
  pillStyle?: object;
  pillTextStyle?: object;
  containerStyle?: object;
  svgStyle?: object;

  renderBag: (props: IVBagBaseRenderProps) => ReactNode;
};

export default function IVBagBase({
  title,
  subtitle,
  badge,
  volume = 0,
  maxVolume = 1000,
  initialLevel,
  showSlider = true,
  fluidPercent: controlledFluidPercent,
  onFluidPercentChange,
  svgGroupTransform,
  sliderAccentColor = "#2563eb",
  pillStyle,
  pillTextStyle,
  containerStyle,
  svgStyle,
  renderBag,
}: IVBagBaseProps) {
  const id = useId();

  const derivedLevel = useMemo(() => {
    if (typeof initialLevel === "number") {
      return Math.max(0, Math.min(100, initialLevel));
    }

    if (maxVolume <= 0) return 0;

    return Math.max(0, Math.min(100, (volume / maxVolume) * 100));
  }, [initialLevel, volume, maxVolume]);

  const isControlled = typeof controlledFluidPercent === "number";
  const [internalLevel, setInternalLevel] = useState<number>(derivedLevel);

  const level = isControlled
    ? Math.max(0, Math.min(100, controlledFluidPercent!))
    : internalLevel;

  const setLevel = (next: number) => {
    const clamped = Math.max(0, Math.min(100, next));

    onFluidPercentChange?.(clamped);

    if (!isControlled) {
      setInternalLevel(clamped);
    }
  };

  const safeId = id.replace(/:/g, "");

  const clipId = `bagClip-${safeId}`;
  const plasticGradientId = `plasticGradient-${safeId}`;
  const liquidGradientId = `liquidGradient-${safeId}`;
  const labelGradientId = `labelGradient-${safeId}`;
  const glossGradientId = `glossGradient-${safeId}`;
  const innerShadowId = `innerShadow-${safeId}`;
  const liquidGlowId = `liquidGlow-${safeId}`;

  const { fillY, fillHeight, percent, displayVolume, waveOpacity } =
    useMemo(() => {
      const topY = 120;
      const bottomY = 402;
      const fullHeight = bottomY - topY;

      const clamped = Math.max(0, Math.min(100, level));
      const currentHeight = (clamped / 100) * fullHeight;
      const currentY = bottomY - currentHeight;

      return {
        fillY: currentY,
        fillHeight: currentHeight,
        percent: clamped,
        displayVolume: Math.round((clamped / 100) * maxVolume),
        waveOpacity: clamped > 0 ? 1 : 0,
      };
    }, [level, maxVolume]);

  const bagSvg = renderBag({
    clipId,
    plasticGradientId,
    liquidGradientId,
    labelGradientId,
    glossGradientId,
    innerShadowId,
    liquidGlowId,
    fillY,
    fillHeight,
    percent,
    displayVolume,
    waveOpacity,
  });

  if (svgGroupTransform) {
    return (
      <G transform={svgGroupTransform}>
        {bagSvg}
      </G>
    );
  }

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.header}>
        <Text style={styles.badge}>{badge}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.content}>
        <Svg
          width={300}
          height={760}
          viewBox="0 0 300 760"
          style={svgStyle}
        >
          {bagSvg}
        </Svg>

        {showSlider && (
          <View style={styles.sliderBlock}>
            <View style={styles.sliderHeader}>
              <View>
                <Text style={styles.sliderTitle}>Fluid level</Text>
                <Text style={styles.sliderSubtitle}>Live bag fill control</Text>
              </View>

              <View style={[styles.pill, pillStyle]}>
                <Text style={[styles.pillText, pillTextStyle]}>
                  {percent}% · {displayVolume} mL
                </Text>
              </View>
            </View>

            <Slider
              minimumValue={0}
              maximumValue={100}
              value={percent}
              onValueChange={setLevel}
              minimumTrackTintColor={sliderAccentColor}
              maximumTrackTintColor="#e5e7eb"
              thumbTintColor={sliderAccentColor}
            />

            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>Empty</Text>
              <Text style={styles.sliderLabel}>Mid</Text>
              <Text style={styles.sliderLabel}>Full</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 448,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 25 },
    elevation: 8,
  },
  header: {
    marginBottom: 20,
    alignItems: "center",
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 4,
  },
  title: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: "600",
    color: "#1e293b",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },
  content: {
    alignItems: "center",
  },
  sliderBlock: {
    marginTop: 24,
    width: "100%",
  },
  sliderHeader: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sliderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  sliderSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#eff6ff",
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },
  sliderLabels: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderLabel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#94a3b8",
  },
});
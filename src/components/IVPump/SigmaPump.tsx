import React from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Native dimensions at 1× scale — exported for layout math */
export const PUMP_BASE_WIDTH  = 340;
export const PUMP_BASE_HEIGHT = 490;



interface SigmaPumpProps {
  drug?: string;
  value?: number;
  unit?: string;
  mode?: string;
  /** Rate of infusion in mL/hr shown on status row */
  rate?: number;
  /** Whether the pump is actively running */
  running?: boolean;
  /**
   * Scale as a percentage of the native 340×490 size.
   * 100 = full size (default), 50 = half size, 150 = 1.5×, etc.
   */
  size?: number;
}

interface ButtonBoxProps {
  text: string;
  highlight?: boolean;
}

interface KeyProps {
  label: string;
  num: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ButtonBox({ text, highlight = false }: ButtonBoxProps) {
  return (
    <View style={[styles.buttonBox, highlight && styles.buttonBoxHighlight]}>
      <Text style={[styles.buttonText, highlight && styles.buttonTextHighlight]}>
        {text}
      </Text>
    </View>
  );
}

function Key({ label, num }: KeyProps) {
  return (
    <View style={styles.key}>
      <Text style={styles.keyLabel}>{label}</Text>
      {num ? <Text style={styles.keyNum}>{num}</Text> : null}
    </View>
  );
}

function BatteryIcon() {
  return (
    <View style={styles.batteryOuter}>
      <View style={styles.batteryFill} />
      <View style={styles.batteryNub} />
    </View>
  );
}

function SignalIcon({ active }: { active: boolean }) {
  return (
    <View style={[styles.signalBox, active && styles.signalBoxActive]}>
      {[3, 5, 7].map((h, i) => (
        <View
          key={i}
          style={[
            styles.signalBar,
            { height: h },
            active && styles.signalBarActive,
          ]}
        />
      ))}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SigmaPump({
  drug = "DOBUTamine",
  value = 20,
  unit = "mcg/kg/min",
  mode = "Adult ICU",
  rate = 42,
  running = true,
  size = 100,
}: SigmaPumpProps) {
  const scale = size / 100;
  const scaledW = PUMP_BASE_WIDTH  * scale;
  const scaledH = PUMP_BASE_HEIGHT * scale;

  return (
    // Outer shell shrinks to the scaled visual footprint so surrounding
    // layout doesn't see the raw 340×490 bounding box.
    <View
      style={{
        width:  scaledW,
        height: scaledH,
        alignItems: "flex-start",
        overflow: "hidden",
      }}
    >
      <View
        style={[
          styles.pump,
          {
            transform: [{ scale }],
            transformOrigin: "top left",
          } as ViewStyle,
        ]}
      >
      {/* ── Left panel ── */}
      <View style={styles.leftBody}>

        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logo}>
            IV<Text style={styles.logoAccent}>Pump</Text>
          </Text>
          <View style={styles.logoDot} />
        </View>

        {/* Screen */}
        <View style={styles.screen}>
          {/* Status bar */}
          <View style={styles.statusBar}>
            <BatteryIcon />
            <Text style={styles.modeText}>{mode}</Text>
            <SignalIcon active={running} />
          </View>

          {/* Drug name */}
          <View style={styles.drugRow}>
            <Text style={styles.drugName}>{drug}</Text>
            <View style={[styles.statusPill, running && styles.statusPillRun]}>
              <Text style={styles.statusPillText}>
                {running ? "RUN" : "STOP"}
              </Text>
            </View>
          </View>

          {/* Big number */}
          <Text style={styles.valueText}>{value}</Text>

          {/* Unit + bag icon */}
          <View style={styles.doseRow}>
            <Text style={styles.unitText}>{unit}</Text>
            <View style={styles.bagWrapper}>
              <View style={styles.bagNeck} />
              <View style={styles.bag}>
                <View style={styles.bagFluid} />
                <View style={styles.bagSheen} />
              </View>
            </View>
          </View>

          {/* Rate info */}
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>RATE</Text>
            <Text style={styles.rateValue}>{rate} mL/hr</Text>
          </View>

          {/* Soft-key labels */}
          <View style={styles.softLabelRow}>
            {["review", "options", "titrate"].map((label) => (
              <Text key={label} style={styles.softLabel}>{label}</Text>
            ))}
          </View>
        </View>

        {/* Soft-key buttons (circles aligned under screen) */}
        <View style={styles.softKeyRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.softKey} />
          ))}
        </View>

        {/* Control buttons */}
        <View style={styles.controlRow}>
          <ButtonBox text={"ON\nOFF"} />
          <ButtonBox text={"SETUP"} />
          <ButtonBox text={"OK"} highlight />
          <ButtonBox text={"RUN\nSTOP"} highlight={running} />
        </View>

        {/* Numeric keypad */}
        <View style={styles.keypad}>
          {/* Row 1 */}
          <Key label="BASIC" num="0" />
          <Key label="ABC"   num="1" />
          <Key label="DEF"   num="2" />
          <Key label="GHI"   num="3" />
          {/* Row 2 */}
          <Key label="•"     num=""  />
          <Key label="JKL"   num="4" />
          <Key label="MNO"   num="5" />
          <Key label="PQR"   num="6" />
          {/* Row 3 */}
          <View style={styles.blackKey} />
          <Key label="STU"   num="7" />
          <Key label="VWX"   num="8" />
          <Key label="YZ"    num="9" />
        </View>
      </View>

      {/* ── Divider ── */}
      <View style={styles.divider}>
        <View style={styles.dividerRidge} />
        <View style={styles.dividerRidge} />
        <View style={styles.dividerRidge} />
      </View>

      {/* ── Right panel (cartridge / door) ── */}
      <View style={styles.rightBody}>
        {/* Tube coming in from top */}
        <View style={styles.tubeAssembly}>
          <View style={styles.tubeOuter} />
          <View style={styles.tubeInner} />
        </View>

        {/* Blue door clamp */}
        <View style={styles.clampBar}>
          <View style={styles.clampScrewLeft} />
          <View style={styles.clampScrewRight} />
        </View>

        {/* Door panel texture */}
        <View style={styles.doorPanel}>
          <View style={styles.doorRail} />
          <View style={styles.doorRail} />
        </View>

        {/* Side slots */}
        <View style={[styles.sideSlot, { top: 210 }]} />
        <View style={[styles.sideSlot, { top: 340 }]} />
        <View style={[styles.sideSlot, { top: 455 }]} />

        {/* Baxter label strip */}
        <View style={styles.labelStrip}>
          <Text style={styles.labelStripText}>IV PUMP</Text>
        </View>
      </View>
    </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BLUE_DARK  = "#1a5fa8";
const BLUE_MID   = "#2272c3";
const BLUE_LIGHT = "#4d9fdc";
const BODY_BG    = "#d8e4ee";
const SCREEN_BG  = "#f4f5f0";
const TEXT_DARK  = "#111111";

const styles = StyleSheet.create({
  // ── Shell ──────────────────────────────────────────────────────────────────
  pump: {
    width: 340,
    height: 490,
    flexDirection: "row",
    backgroundColor: BODY_BG,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#8fa5b8",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    overflow: "hidden",
  } as ViewStyle,

  // ── Left body ──────────────────────────────────────────────────────────────
  leftBody: {
    width: 218,
    paddingTop: 14,
    paddingHorizontal: 10,
    alignItems: "center",
  } as ViewStyle,

  // Logo
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    alignSelf: "flex-start",
    paddingLeft: 4,
  } as ViewStyle,

  logo: {
    fontSize: 14,
    color: "#c8d8e4",
    fontWeight: "700",
    letterSpacing: 0.4,
  } as TextStyle,

  logoAccent: {
    color: BLUE_MID,
  } as TextStyle,

  logoDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: BLUE_LIGHT,
    marginLeft: 4,
  } as ViewStyle,

  // ── Screen ─────────────────────────────────────────────────────────────────
  screen: {
    width: 174,
    height: 228,
    backgroundColor: SCREEN_BG,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: "#6e8499",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  } as ViewStyle,

  statusBar: {
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BLUE_DARK,
    paddingHorizontal: 4,
  } as ViewStyle,

  modeText: {
    flex: 1,
    textAlign: "center",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  } as TextStyle,

  // Battery
  batteryOuter: {
    flexDirection: "row",
    alignItems: "center",
  } as ViewStyle,

  batteryFill: {
    width: 20,
    height: 11,
    backgroundColor: "#5ecb72",
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: "#c8d8e4",
  } as ViewStyle,

  batteryNub: {
    width: 3,
    height: 5,
    backgroundColor: "#c8d8e4",
    borderRadius: 1,
    marginLeft: 1,
  } as ViewStyle,

  // Signal bars
  signalBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    width: 18,
    height: 12,
    gap: 2,
  } as ViewStyle,

  signalBoxActive: {} as ViewStyle,

  signalBar: {
    width: 3,
    backgroundColor: "#4a6070",
    borderRadius: 1,
  } as ViewStyle,

  signalBarActive: {
    backgroundColor: "#5ecb72",
  } as ViewStyle,

  // Drug row
  drugRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingTop: 5,
  } as ViewStyle,

  drugName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    color: TEXT_DARK,
    letterSpacing: 0.2,
  } as TextStyle,

  statusPill: {
    backgroundColor: "#c0392b",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  } as ViewStyle,

  statusPillRun: {
    backgroundColor: "#27ae60",
  } as ViewStyle,

  statusPillText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  } as TextStyle,

  // Big value
  valueText: {
    fontSize: 82,
    fontWeight: "900",
    color: TEXT_DARK,
    lineHeight: 88,
    paddingHorizontal: 6,
    includeFontPadding: false,
  } as TextStyle,

  // Dose / bag row
  doseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  } as ViewStyle,

  unitText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#333",
  } as TextStyle,

  bagWrapper: {
    alignItems: "center",
    marginRight: 4,
  } as ViewStyle,

  bagNeck: {
    width: 8,
    height: 4,
    backgroundColor: "#9b96c4",
    borderRadius: 2,
    zIndex: 1,
  } as ViewStyle,

  bag: {
    width: 22,
    height: 36,
    backgroundColor: "#b8b4d3",
    borderWidth: 1,
    borderColor: "#4e4c67",
    borderRadius: 5,
    overflow: "hidden",
  } as ViewStyle,

  bagFluid: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: "#d0cdea",
  } as ViewStyle,

  bagSheen: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 4,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
  } as ViewStyle,

  // Rate row
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#d0d4c8",
    paddingTop: 3,
  } as ViewStyle,

  rateLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#666",
    letterSpacing: 0.8,
    marginRight: 4,
  } as TextStyle,

  rateValue: {
    fontSize: 11,
    fontWeight: "800",
    color: TEXT_DARK,
  } as TextStyle,

  // Soft key labels
  softLabelRow: {
    flexDirection: "row",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: "#c0c8b8",
  } as ViewStyle,

  softLabel: {
    flex: 1,
    textAlign: "center",
    backgroundColor: BLUE_DARK,
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    paddingVertical: 3,
    letterSpacing: 0.3,
  } as TextStyle,

  // ── Soft-key circles ───────────────────────────────────────────────────────
  softKeyRow: {
    flexDirection: "row",
    width: 174,
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 6,
  } as ViewStyle,

  softKey: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BLUE_MID,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,

  // ── Control buttons ────────────────────────────────────────────────────────
  controlRow: {
    flexDirection: "row",
    width: 182,
    justifyContent: "space-between",
    marginTop: 8,
  } as ViewStyle,

  buttonBox: {
    width: 42,
    height: 36,
    borderWidth: 1.5,
    borderColor: "#5a88aa",
    backgroundColor: "#eaf3fa",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  } as ViewStyle,

  buttonBoxHighlight: {
    backgroundColor: BLUE_DARK,
    borderColor: BLUE_LIGHT,
  } as ViewStyle,

  buttonText: {
    color: "#2a6080",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 13,
  } as TextStyle,

  buttonTextHighlight: {
    color: "#fff",
  } as TextStyle,

  // ── Numeric keypad ─────────────────────────────────────────────────────────
  keypad: {
    width: 182,
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 3,
  } as ViewStyle,

  key: {
    width: 40,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  } as ViewStyle,

  keyLabel: {
    color: "#3c789d",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
  } as TextStyle,

  keyNum: {
    color: "#c0392b",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 1,
    includeFontPadding: false,
  } as TextStyle,

  blackKey: {
    width: 40,
    height: 38,
    backgroundColor: "#1a1a1a",
    borderRadius: 5,
  } as ViewStyle,

  // ── Divider ────────────────────────────────────────────────────────────────
  divider: {
    width: 5,
    backgroundColor: "#4f5e69",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  } as ViewStyle,

  dividerRidge: {
    width: 3,
    height: 18,
    backgroundColor: "#3a4850",
    borderRadius: 2,
  } as ViewStyle,

  // ── Right body ─────────────────────────────────────────────────────────────
  rightBody: {
    flex: 1,
    backgroundColor: "#dce8f0",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    position: "relative",
    overflow: "hidden",
  } as ViewStyle,

  // Tube
  tubeAssembly: {
    position: "absolute",
    top: -10,
    left: 18,
    alignItems: "center",
  } as ViewStyle,

  tubeOuter: {
    width: 14,
    height: 60,
    backgroundColor: "transparent",
    borderWidth: 3,
    borderColor: "#c0cdd8",
    borderRadius: 7,
  } as ViewStyle,

  tubeInner: {
    position: "absolute",
    top: 4,
    width: 4,
    height: 52,
    backgroundColor: "rgba(180,220,255,0.5)",
    borderRadius: 2,
  } as ViewStyle,

  // Clamp bar
  clampBar: {
    position: "absolute",
    top: 38,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: BLUE_DARK,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BLUE_LIGHT,
  } as ViewStyle,

  clampScrewLeft: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#8ab4d0",
  } as ViewStyle,

  clampScrewRight: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#8ab4d0",
  } as ViewStyle,

  // Door panel
  doorPanel: {
    position: "absolute",
    top: 68,
    left: 6,
    right: 6,
    bottom: 50,
    backgroundColor: "#cdd9e4",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a8bac8",
    overflow: "hidden",
    gap: 14,
    paddingTop: 16,
    alignItems: "center",
  } as ViewStyle,

  doorRail: {
    width: "85%",
    height: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 1,
  } as ViewStyle,

  // Side slots
  sideSlot: {
    position: "absolute",
    right: 3,
    width: 13,
    height: 14,
    backgroundColor: "#1a1a1a",
    borderRadius: 2,
  } as ViewStyle,

  // Label strip
  labelStrip: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
  } as ViewStyle,

  labelStripText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#7a90a0",
    letterSpacing: 2.5,
  } as TextStyle,
});
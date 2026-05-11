/**
 * BloodBagScanner — modal QR scanner for adding blood units to inventory.
 *
 * Three internal modes, managed with the `mode` state:
 *   - scanning: camera live, waiting for a QR
 *   - preview:  parsed a unit, asking the user to confirm or rescan
 *   - manual:   form for entering a unit by hand (QR unreadable or missing)
 *
 * Payload formats accepted:
 *   - JSON: {"id":"...","bloodType":"...","expiryDate":"...","collectionDate"?:"..."}
 *   - Pipe: id|bloodType|expiryDate|collectionDate
 *   - Otherwise: a "DEMO" placeholder unit is synthesized so the scanner is
 *     usable without printed QR codes during development. The resulting
 *     BloodUnit's id is prefixed "DEMO-" so it's visually flagged in the list.
 */

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../theme/colors';
import { BloodType, BloodUnit } from '../types';
import { BLOOD_TEMP_MAX, BLOOD_TEMP_MIN } from '../constants/protocols';

// --- Constants ----------------------------------------------------------

const VALID_BLOOD_TYPES: BloodType[] = [
  'O+',
  'O-',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
];

/** Default temperature used when QR doesn't carry one. Mid-range of the safe band. */
const DEFAULT_SCAN_TEMP = 4;

// --- Pure parser --------------------------------------------------------

/**
 * Turn a raw scanned string into a BloodUnit.
 *
 * Returns `{ unit, isDemo }` — isDemo is true when we couldn't parse the
 * payload and had to synthesize one. Callers should surface that to the
 * user so a fallback unit can't be mistaken for a real bag.
 */
export function parseQrPayload(raw: string): {
  unit: BloodUnit;
  isDemo: boolean;
} {
  // Strip BOM, trim, unwrap URL-embedded payloads (e.g. scanning a label that
  // points to a vendor page with the data in a query param).
  let cleaned = raw.replace(/^\uFEFF/, '').trim();

  try {
    const url = new URL(cleaned);
    const param =
      url.searchParams.get('data') ||
      url.searchParams.get('unit') ||
      url.searchParams.get('q');
    if (param) cleaned = param;
    else if (url.hash) cleaned = url.hash.slice(1);
  } catch {
    // not a URL; use as-is
  }

  // Try JSON first.
  if (cleaned.startsWith('{')) {
    try {
      const json = JSON.parse(cleaned);
      if (
        typeof json.id === 'string' &&
        VALID_BLOOD_TYPES.includes(json.bloodType) &&
        typeof json.expiryDate === 'string'
      ) {
        return {
          unit: {
            id: json.id,
            bloodType: json.bloodType,
            expiryDate: json.expiryDate,
            temperatureCelsius:
              typeof json.temperatureCelsius === 'number'
                ? json.temperatureCelsius
                : DEFAULT_SCAN_TEMP,
            collectionDate:
              typeof json.collectionDate === 'string'
                ? json.collectionDate
                : undefined,
          },
          isDemo: false,
        };
      }
    } catch {
      // fall through to pipe parsing
    }
  }

  // Try pipe-delimited: id|bloodType|expiry|collection
  const parts = cleaned.split('|');
  if (
    parts.length >= 3 &&
    VALID_BLOOD_TYPES.includes(parts[1] as BloodType)
  ) {
    return {
      unit: {
        id: parts[0],
        bloodType: parts[1] as BloodType,
        expiryDate: parts[2],
        temperatureCelsius: DEFAULT_SCAN_TEMP,
        collectionDate: parts[3] || undefined,
      },
      isDemo: false,
    };
  }

  // Fallback: synthesize a clearly-marked demo unit.
  const shortId = cleaned.slice(0, 8).replace(/[^A-Z0-9]/gi, '') || 'BAG';
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 21);

  return {
    unit: {
      id: `DEMO-${shortId}-${Date.now().toString().slice(-4)}`,
      bloodType: 'O+',
      expiryDate: expiry.toISOString().slice(0, 10),
      temperatureCelsius: DEFAULT_SCAN_TEMP,
    },
    isDemo: true,
  };
}

// --- Component ----------------------------------------------------------

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (unit: BloodUnit) => void;
}

type Mode = 'scanning' | 'preview' | 'manual';

export default function BloodBagScanner({ visible, onClose, onAdd }: Props) {
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<Mode>('scanning');
  const [pendingUnit, setPendingUnit] = useState<BloodUnit | null>(null);
  const [pendingIsDemo, setPendingIsDemo] = useState(false);

  // Manual entry form state
  const [manualId, setManualId] = useState('');
  const [manualBloodType, setManualBloodType] = useState<BloodType>('O+');
  const [manualExpiry, setManualExpiry] = useState('');

  // Reset to scanning mode when the modal opens.
  const resetState = () => {
    setMode('scanning');
    setPendingUnit(null);
    setPendingIsDemo(false);
    setManualId('');
    setManualBloodType('O+');
    setManualExpiry('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (mode !== 'scanning') return; // already previewing — ignore further reads
    const { unit, isDemo } = parseQrPayload(data);
    setPendingUnit(unit);
    setPendingIsDemo(isDemo);
    setMode('preview');
  };

  const handleConfirmAdd = () => {
    if (!pendingUnit) return;
    onAdd(pendingUnit);
    handleClose();
  };

  const handleManualSubmit = () => {
    if (!manualId.trim()) {
      Alert.alert('Missing ID', 'Enter the unit ID printed on the bag.');
      return;
    }
    if (!manualExpiry.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Invalid expiry', 'Use the format YYYY-MM-DD.');
      return;
    }
    const unit: BloodUnit = {
      id: manualId.trim(),
      bloodType: manualBloodType,
      expiryDate: manualExpiry,
      temperatureCelsius: DEFAULT_SCAN_TEMP,
    };
    onAdd(unit);
    handleClose();
  };

  // --- Render branches --------------------------------------------------

  /** Camera permission not yet decided. */
  if (visible && permission === null) {
    return (
      <Modal visible animationType="slide" onRequestClose={handleClose}>
        <View style={styles.centeredScreen}>
          <Text style={styles.bodyText}>Loading camera…</Text>
        </View>
      </Modal>
    );
  }

  /** Camera permission denied. */
  if (visible && permission && !permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={handleClose}>
        <View style={styles.centeredScreen}>
          <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.heading}>Camera access needed</Text>
          <Text style={styles.bodyText}>
            BloodReady needs camera access to scan QR codes on blood bag
            labels. You can grant it once and use it whenever you add a unit.
          </Text>
          <View style={styles.buttonStack}>
            {permission.canAskAgain ? (
              <Pressable
                style={styles.primaryButton}
                onPress={requestPermission}
              >
                <Text style={styles.primaryButtonText}>Grant camera access</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.primaryButton}
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.primaryButtonText}>Open Settings</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setMode('manual')}
            >
              <Text style={styles.secondaryButtonText}>Enter manually</Text>
            </Pressable>
            <Pressable style={styles.tertiaryButton} onPress={handleClose}>
              <Text style={styles.tertiaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.iconButton}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {mode === 'manual' ? 'Add manually' : 'Scan blood bag'}
          </Text>
          <View style={styles.iconButton} />
        </View>

        {mode === 'scanning' && (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'pdf417'],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.scanOverlay} pointerEvents="none">
              <View style={styles.scanFrame} />
              <Text style={styles.scanHint}>
                Align the QR code inside the frame
              </Text>
            </View>
            <View style={styles.bottomBar}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setMode('manual')}
              >
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={Colors.primary}
                />
                <Text style={styles.secondaryButtonText}>Enter manually</Text>
              </Pressable>
            </View>
          </>
        )}

        {mode === 'preview' && pendingUnit && (
          <ScrollView contentContainerStyle={styles.previewContent}>
            <Text style={styles.heading}>Confirm unit</Text>
            <Text style={styles.bodyText}>
              Review the scanned details and add to inventory.
            </Text>

            {pendingIsDemo && (
              <View style={styles.demoNotice}>
                <Ionicons
                  name="information-circle"
                  size={18}
                  color={Colors.warning}
                />
                <Text style={styles.demoNoticeText}>
                  Demo unit — the QR code did not match a known format.
                  Verify before relying on this entry.
                </Text>
              </View>
            )}

            <View style={styles.detailCard}>
              <Detail label="Unit ID" value={pendingUnit.id} />
              <Detail label="Blood type" value={pendingUnit.bloodType} />
              <Detail label="Expires" value={pendingUnit.expiryDate} />
              <Detail
                label="Temperature"
                value={`${pendingUnit.temperatureCelsius} °C`}
                hint={`Safe range: ${BLOOD_TEMP_MIN}–${BLOOD_TEMP_MAX} °C`}
              />
              {pendingUnit.collectionDate && (
                <Detail
                  label="Collected"
                  value={pendingUnit.collectionDate}
                />
              )}
            </View>

            <View style={styles.buttonStack}>
              <Pressable
                style={styles.primaryButton}
                onPress={handleConfirmAdd}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Add to inventory</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setPendingUnit(null);
                  setPendingIsDemo(false);
                  setMode('scanning');
                }}
              >
                <Text style={styles.secondaryButtonText}>Scan another</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {mode === 'manual' && (
          <ScrollView contentContainerStyle={styles.previewContent}>
            <Text style={styles.heading}>Manual entry</Text>
            <Text style={styles.bodyText}>
              Use this when the QR code is missing or unreadable. Confirm
              every field against the bag label.
            </Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Unit ID</Text>
              <TextInput
                style={styles.input}
                value={manualId}
                onChangeText={setManualId}
                placeholder="e.g. UNIT-007"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Blood type</Text>
              <View style={styles.bloodTypeRow}>
                {VALID_BLOOD_TYPES.map((bt) => (
                  <Pressable
                    key={bt}
                    style={[
                      styles.bloodTypeChip,
                      manualBloodType === bt && styles.bloodTypeChipActive,
                    ]}
                    onPress={() => setManualBloodType(bt)}
                  >
                    <Text
                      style={[
                        styles.bloodTypeChipText,
                        manualBloodType === bt &&
                          styles.bloodTypeChipTextActive,
                      ]}
                    >
                      {bt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Expiry date</Text>
              <TextInput
                style={styles.input}
                value={manualExpiry}
                onChangeText={setManualExpiry}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.buttonStack}>
              <Pressable
                style={styles.primaryButton}
                onPress={handleManualSubmit}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Add to inventory</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setMode('scanning')}
              >
                <Ionicons
                  name="camera-outline"
                  size={18}
                  color={Colors.primary}
                />
                <Text style={styles.secondaryButtonText}>Back to scanner</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Subcomponents ------------------------------------------------------

function Detail({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueGroup}>
        <Text style={styles.detailValue}>{value}</Text>
        {hint && <Text style={styles.detailHint}>{hint}</Text>}
      </View>
    </View>
  );
}

// --- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  centeredScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  header: {
    paddingTop: 50,
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scanHint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  bottomBar: {
    padding: 16,
    backgroundColor: '#000',
  },

  previewContent: {
    backgroundColor: Colors.background,
    padding: 20,
    gap: 14,
    flexGrow: 1,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  demoNotice: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderColor: Colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  demoNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
    fontWeight: '600',
  },

  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 2,
  },
  detailValueGroup: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  detailHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },

  buttonStack: {
    gap: 8,
    marginTop: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  tertiaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },

  bloodTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bloodTypeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  bloodTypeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  bloodTypeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  bloodTypeChipTextActive: {
    color: '#fff',
  },
});
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
 Text,
  View,
} from 'react-native';

import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

type LocationPoint = {
  latitude: number;
  longitude: number;
};

type AppMapProps = {
  defaultExpanded?: boolean;
};

const DEFAULT_FROM_ADDRESS =
  'Verizon, 581 Broadway, New York, NY 10012';

function getDistanceMiles(
  from: LocationPoint,
  to: LocationPoint
): number {
  const earthRadiusMiles = 3958.8;

  const dLat =
    ((to.latitude - from.latitude) * Math.PI) / 180;

  const dLon =
    ((to.longitude - from.longitude) * Math.PI) / 180;

  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    earthRadiusMiles *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function getEstimatedDriveTime(
  distanceMiles: number
): string {
  const averageSpeedMph = 25;

  const totalMinutes = Math.ceil(
    (distanceMiles / averageSpeedMph) * 60
  );

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0
    ? `${hours} hr ${minutes} min`
    : `${hours} hr`;
}

export default function AppMap({
  defaultExpanded = false,
}: AppMapProps) {
  const [expanded, setExpanded] =
    useState(defaultExpanded);

  const [fromAddress] = useState(
    DEFAULT_FROM_ADDRESS
  );

  const [fromPoint, setFromPoint] =
    useState<LocationPoint | null>(null);

  const [toPoint, setToPoint] =
    useState<LocationPoint | null>(null);

  const distanceMiles = useMemo(() => {
    if (!fromPoint || !toPoint) return null;

    return getDistanceMiles(fromPoint, toPoint);
  }, [fromPoint, toPoint]);

  const estimatedDriveTime = useMemo(() => {
    if (distanceMiles === null) return null;

    return getEstimatedDriveTime(distanceMiles);
  }, [distanceMiles]);

  async function geocodeAddress(
    address: string
  ): Promise<LocationPoint | null> {
    const results =
      await Location.geocodeAsync(address);

    if (results.length === 0) {
      return null;
    }

    return {
      latitude: results[0].latitude,
      longitude: results[0].longitude,
    };
  }

  async function evaluateDistance() {
    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Location permission needed',
          'Please allow location access to calculate distance.'
        );

        return;
      }

      const currentPosition =
        await Location.getCurrentPositionAsync({});

      const from = await geocodeAddress(
        fromAddress
      );

      if (!from) {
        Alert.alert(
          'Address not found',
          'Unable to locate Verizon address.'
        );

        return;
      }

      const to = {
        latitude:
          currentPosition.coords.latitude,
        longitude:
          currentPosition.coords.longitude,
      };

      setFromPoint(from);
      setToPoint(to);
    } catch {
      Alert.alert(
        'Error',
        'Unable to evaluate distance right now.'
      );
    }
  }

  useEffect(() => {
    evaluateDistance();
  }, []);

  const mapCenter =
    fromPoint ??
    toPoint ?? {
      latitude: 40.7128,
      longitude: -74.006,
    };

  return (
    <View
      style={[
        styles.card,
        expanded && styles.cardExpanded,
      ]}
    >
      {expanded ? (
        <>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.backgroundMap}
            region={{
              latitude: mapCenter.latitude,
              longitude: mapCenter.longitude,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            }}
          >
            {fromPoint && (
              <Marker
                coordinate={fromPoint}
                title="Verizon"
              />
            )}

            {toPoint && (
              <Marker
                coordinate={toPoint}
                title="My current location"
              />
            )}

            {fromPoint && toPoint && (
              <Polyline
                coordinates={[
                  fromPoint,
                  toPoint,
                ]}
                strokeWidth={4}
                strokeColor="#DC2626"
              />
            )}
          </MapView>

          <View style={styles.mapOverlay} />
        </>
      ) : (
        <View
          style={styles.collapsedBackground}
        />
      )}

      <View style={styles.contentLayer}>
        <Pressable
          style={({ pressed }) => [
            styles.header,
            pressed && styles.pressed,
          ]}
          onPress={() =>
            setExpanded((value) => !value)
          }
        >
          <View style={styles.headerLeft}>
            <View style={styles.iconBubble}>
              <Image
                source={require('../../assets/images/mapicon.png')}
                style={{
                  width: 64,
                  height: 64,
                }}
                resizeMode="contain"
              />
            </View>

            <View
              style={
                styles.headerTextContainer
              }
            >
              <Text style={styles.headerTitle}>
                Distance Map
              </Text>

              <Text
                style={styles.headerSubtitle}
              >
                {estimatedDriveTime ??
                  'Calculating...'}{' '}
                from ER
              </Text>
            </View>
          </View>

          <View style={styles.chevronBubble}>
            <Ionicons
              name={
                expanded
                  ? 'chevron-up'
                  : 'chevron-down'
              }
              size={20}
              color="black"
            />
          </View>
        </Pressable>

        {expanded && (
          <View style={styles.body}>
            <View style={styles.distanceBox}>
              <View
                style={styles.metricBlock}
              >
                <Text
                  style={styles.distanceLabel}
                >
                  Distance
                </Text>

                <Text
                  style={styles.distanceValue}
                >
                  {distanceMiles !== null
                    ? `${distanceMiles.toFixed(
                        2
                      )} mi`
                    : 'Detecting'}
                </Text>
              </View>

              <View style={styles.divider} />

              <View
                style={styles.metricBlock}
              >
                <Text
                  style={styles.distanceLabel}
                >
                  Drive time
                </Text>

                <Text
                  style={
                    styles.driveTimeValue
                  }
                >
                  {estimatedDriveTime ??
                    'Calculating'}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 90,
    borderRadius: 26,
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: '#9CBAC2',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },

  cardExpanded: {
    height: 300,
  },

  collapsedBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },

  backgroundMap: {
    ...StyleSheet.absoluteFillObject,
  },

  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },

  contentLayer: {
    flex: 1,
    zIndex: 2,
  },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTextContainer: {
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: 'black',
  },

  headerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'black',
    marginTop: 2,
  },

  chevronBubble: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  pressed: {
    opacity: 0.78,
  },

  body: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },

  distanceBox: {
    backgroundColor:
      'rgba(255,255,255,0.88)',
    borderRadius: 22,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  metricBlock: {
    flex: 1,
    alignItems: 'center',
  },

  distanceLabel: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.58)',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  distanceValue: {
    fontSize: 21,
    color: '#111827',
    fontWeight: '900',
  },

  driveTimeValue: {
    fontSize: 21,
    color: '#111827',
    fontWeight: '900',
  },

  divider: {
    width: 1,
    height: 42,
    backgroundColor:
      'rgba(15,23,42,0.16)',
  },
});
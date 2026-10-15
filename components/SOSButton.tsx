// components/SOSButton.tsx
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SOSButtonProps {
  onSOSPress: () => void;
  buttonColor?: string;
}

export default function SOSButton({ 
  onSOSPress, 
  buttonColor = '#D00000'
}: SOSButtonProps) {
  const sosScale = useRef(new Animated.Value(1)).current;
  const sosPulse = useRef(new Animated.Value(1)).current;

  // Pulse animation for SOS button
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, {
          toValue: 1.08,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(sosPulse, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const animatePressIn = () => {
    Animated.spring(sosScale, {
      toValue: 0.95,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const animatePressOut = () => {
    Animated.spring(sosScale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: sosPulse }] }}>
      <TouchableOpacity 
        style={[styles.sosButton, { backgroundColor: buttonColor }]}
        activeOpacity={0.85}
        onPress={onSOSPress}
        onPressIn={animatePressIn}
        onPressOut={animatePressOut}
      >
        <Animated.View style={{ transform: [{ scale: sosScale }], alignItems: 'center' }}>
          <View style={styles.sosContent}>
            <View style={styles.sosIconWrapper}>
              <Ionicons name="warning" size={64} color="#FFFFFF" />
            </View>
            <Text style={styles.sosTitle}>SOS</Text>
            <Text style={styles.sosSubtext}>
              Emergency Report
            </Text>
            <View style={styles.sosBadge}>
              <Text style={styles.sosBadgeText}>IMMEDIATE</Text>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sosButton: {
    marginBottom: 20,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#FF4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  sosContent: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosIconWrapper: {
    marginBottom: 16,
  },
  sosTitle: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    marginBottom: 8,
  },
  sosSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    marginBottom: 12,
  },
  sosBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sosBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
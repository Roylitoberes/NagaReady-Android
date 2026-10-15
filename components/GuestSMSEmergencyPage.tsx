// components/GuestSMSEmergencyPage.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';

interface GuestSMSEmergencyPageProps {
  onClose: () => void;
  onSendSMS: (type: string, message: string) => void;
  onRegisterNow: () => void;
}

interface EmergencyType {
  id: string;
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  solidBg: string;
  smsCode: string;
}

interface LocationData {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string | null;
}

const { width } = Dimensions.get('window');

const responsiveSize = (baseSize: number, smallSize: number, largeSize: number) => {
  if (width < 375) return smallSize;
  if (width > 414) return largeSize;
  return baseSize;
};

const responsiveSpacing = (base: number, small: number, large: number) => {
  if (width < 375) return small;
  if (width > 414) return large;
  return base;
};

// ✅ FIXED EOC PHONE NUMBER - CANNOT BE CHANGED
const EOC_PHONE_NUMBER = '+639750998875';

const emergencyTypes: EmergencyType[] = [
  { id: 'medical',  icon: 'medical',       label: 'Medical',  color: '#FF4444', bgColor: 'rgba(255, 68, 68, 0.15)',  solidBg: 'rgba(255, 68, 68, 0.25)',  smsCode: 'MED' },
  { id: 'fire',     icon: 'flame',         label: 'Fire',     color: '#FF6B35', bgColor: 'rgba(255, 107, 53, 0.15)', solidBg: 'rgba(255, 107, 53, 0.25)', smsCode: 'FIRE' },
  { id: 'crime',    icon: 'shield',        label: 'Crime',    color: '#7B4FD8', bgColor: 'rgba(123, 79, 216, 0.15)', solidBg: 'rgba(123, 79, 216, 0.25)', smsCode: 'CRIME' },
  { id: 'accident', icon: 'car',           label: 'Accident', color: '#FFB800', bgColor: 'rgba(255, 184, 0, 0.15)',  solidBg: 'rgba(255, 184, 0, 0.25)',  smsCode: 'ACC' },
  { id: 'flood',    icon: 'water',         label: 'Flood',    color: '#4A9EFF', bgColor: 'rgba(74, 158, 255, 0.15)', solidBg: 'rgba(74, 158, 255, 0.25)', smsCode: 'FLOOD' },
  { id: 'other',    icon: 'alert-circle',  label: 'Other',    color: '#FF6B6B', bgColor: 'rgba(255, 107, 107, 0.15)', solidBg: 'rgba(255, 107, 107, 0.25)', smsCode: 'OTHER' },
];

// ============================================================
// ✅ OtherTypeModal — same design as IncidentReportPage
// ============================================================
interface OtherTypeModalProps {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => void;
}

function OtherTypeModal({
  visible,
  initialValue,
  onClose,
  onSave,
}: OtherTypeModalProps) {
  const [input, setInput] = useState(initialValue);

  useEffect(() => {
    if (visible) setInput(initialValue);
  }, [visible, initialValue]);

  const examples = [
    'Landslide',
    'Earthquake',
    'Road obstruction',
    'Missing person',
    'Structural collapse',
    'Other emergency',
  ];

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter the incident type.');
      return;
    }
    onSave(trimmed);
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.otherTypeModalContainer}>
          <View style={styles.otherTypeHeader}>
            <View style={styles.otherTypeIconCircle}>
              <Ionicons
                name="help-circle"
                size={responsiveSize(24, 20, 28)}
                color="#FF8C00"
              />
            </View>
            <Text style={styles.otherTypeTitle}>Other Incident Type</Text>
          </View>

          <Text style={styles.otherTypeSubtitle}>
            Please specify the type of emergency.
          </Text>

          <TextInput
            style={styles.otherTypeInput}
            placeholder="Enter incident type..."
            placeholderTextColor="#666"
            value={input}
            onChangeText={setInput}
            autoFocus
          />

          <Text style={styles.otherTypeExamplesLabel}>Examples:</Text>
          <View style={styles.otherTypeExamplesWrap}>
            {examples.map((ex) => (
              <TouchableOpacity
                key={ex}
                style={styles.otherTypeExampleChip}
                onPress={() => setInput(ex)}
              >
                <Text style={styles.otherTypeExampleChipText}>{ex}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.otherTypeActionsRow}>
            <TouchableOpacity
              style={[styles.otherTypeActionBtn, styles.otherTypeCancelBtn]}
              onPress={onClose}
            >
              <Text style={styles.otherTypeCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.otherTypeActionBtn, styles.otherTypeConfirmBtn]}
              onPress={handleSave}
            >
              <Ionicons
                name="checkmark"
                size={responsiveSize(18, 14, 22)}
                color="#FFFFFF"
              />
              <Text style={styles.otherTypeConfirmText}>Save Type</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function GuestSMSEmergencyPage({
  onClose,
  onSendSMS,
  onRegisterNow,
}: GuestSMSEmergencyPageProps) {
  const [selectedType, setSelectedType] = useState<string>('medical');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isGettingLocation, setIsGettingLocation] = useState<boolean>(false);
  const [locationData, setLocationData] = useState<LocationData>({
    latitude: null,
    longitude: null,
    accuracy: null,
    address: null,
  });
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [smsAvailable, setSmsAvailable] = useState<boolean>(false);

  // ✅ "Other" modal state
  const [showOtherTypeModal, setShowOtherTypeModal] = useState(false);
  const [otherSpecificType, setOtherSpecificType] = useState('');

  // ✅ Success modal for guests (prompts registration)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [sentTypeLabel, setSentTypeLabel] = useState('');

  useEffect(() => {
    checkSMSAvailability();
    getCurrentLocation();
  }, []);

  const checkSMSAvailability = async () => {
    const isAvailable = await SMS.isAvailableAsync();
    setSmsAvailable(isAvailable);
    if (!isAvailable) {
      Alert.alert(
        'SMS Not Available',
        'Your device does not support SMS. Please use the emergency call feature instead.',
        [{ text: 'OK' }]
      );
    }
  };

  const getCurrentLocation = async () => {
    try {
      setIsGettingLocation(true);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is needed for emergency services to find you.',
          [
            { text: 'OK', style: 'default' },
            { text: 'Open Settings', onPress: () => Location.requestForegroundPermissionsAsync() }
          ]
        );
        setLocationPermission(false);
        setIsGettingLocation(false);
        return;
      }

      setLocationPermission(true);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude, accuracy } = location.coords;

      setLocationData({
        latitude,
        longitude,
        accuracy,
        address: null,
      });

      try {
        const address = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });

        if (address && address.length > 0) {
          const addr = address[0];
          const formattedAddress = `${addr.street || ''} ${addr.district || ''}, ${addr.city || ''}, ${addr.region || ''}`.trim();
          setLocationData(prev => ({
            ...prev,
            address: formattedAddress || 'Address not available',
          }));
        }
      } catch (addressError) {
        console.log('Address lookup failed, using coordinates only');
      }

    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert(
        'Location Error',
        'Unable to get your location. Please make sure GPS is enabled.',
        [
          { text: 'Retry', onPress: getCurrentLocation },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } finally {
      setIsGettingLocation(false);
    }
  };

  const getLocationMessage = () => {
    if (locationData.latitude && locationData.longitude) {
      const coords = `Lat:${locationData.latitude.toFixed(6)},Long:${locationData.longitude.toFixed(6)}`;

      let locationInfo = `📍 Location: ${coords}`;

      if (locationData.address) {
        locationInfo += `\n📍 Address: ${locationData.address}`;
      }

      if (locationData.accuracy) {
        locationInfo += `\n📍 Accuracy: ±${Math.round(locationData.accuracy)}m`;
      }

      return locationInfo;
    }
    return '📍 Location: Unknown - Please enable GPS';
  };

  const getEmergencyTemplate = (type: string) => {
    const templates: Record<string, string> = {
      medical: '🚑 MEDICAL EMERGENCY: I need immediate medical assistance.',
      fire: '🔥 FIRE EMERGENCY: There is a fire at my location.',
      crime: '🚓 CRIME IN PROGRESS: I am witnessing/reporting a crime.',
      accident: '🚗 ACCIDENT: A vehicle accident has occurred.',
      flood: '🌊 FLOOD EMERGENCY: There is severe flooding in my area.',
      other: '⚠️ EMERGENCY: I need urgent assistance at my location.',
    };
    return templates[type] || templates.other;
  };

  // ✅ Build the message with the specific type when "Other" is chosen
  const buildMessageForType = (typeId: string, specific?: string) => {
    const selected = emergencyTypes.find(t => t.id === typeId);
    const template = getEmergencyTemplate(typeId);
    const locationText = getLocationMessage();

    if (typeId === 'other' && specific && specific.trim().length > 0) {
      return `[OTHER] ${specific.trim()}: ${template}\n\n${locationText}`;
    }

    return `[${selected?.smsCode}] ${template}\n\n${locationText}`;
  };

  const sendSMSOnly = async () => {
    try {
      setIsSending(true);

      const selected = emergencyTypes.find(t => t.id === selectedType);
      const formattedMessage = `[${selected?.smsCode}] ${message}`;

      console.log('📨 Sending SMS to EOC (Guest)...');
      console.log('📱 To:', EOC_PHONE_NUMBER);
      console.log('📝 Message:', formattedMessage);

      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'SMS Not Available',
          'Your device cannot send SMS. Please call the emergency number directly.',
          [{ text: 'OK' }]
        );
        setIsSending(false);
        return;
      }

      const { result } = await SMS.sendSMSAsync(
        [EOC_PHONE_NUMBER],
        formattedMessage
      );

      console.log('📨 SMS Result:', result);

      if (result === 'sent') {
        setSentTypeLabel(selected?.label || 'Emergency');
        setShowSuccessModal(true);
        setMessage('');
      } else if (result === 'cancelled') {
        Alert.alert(
          'SMS Cancelled',
          'You cancelled the SMS. Your alert was not sent.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'SMS Status',
          'If the SMS app opened and you sent the message, it was sent successfully.\n\nDid you send the SMS?',
          [
            {
              text: 'Yes, it was sent',
              onPress: () => {
                setSentTypeLabel(selected?.label || 'Emergency');
                setShowSuccessModal(true);
                setMessage('');
              }
            },
            { text: 'No, try again', onPress: sendSMSOnly },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
    } catch (error: any) {
      console.error('Error sending SMS:', error);

      Alert.alert(
        'Error Sending SMS',
        'Failed to send SMS. Please make sure you have:\n\n✅ Load/credit balance\n✅ Cellular signal\n✅ Correct phone number\n\nYou can try calling the emergency number instead.',
        [
          { text: 'Try Again', onPress: sendSMSOnly },
          { text: 'Call EOC', onPress: callEOC },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    // ✅ Require specific type if "Other" is selected
    if (selectedType === 'other' && !otherSpecificType.trim()) {
      Alert.alert(
        'Specific Type Required',
        'Please specify the incident type for "Other".',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enter Now', onPress: () => setShowOtherTypeModal(true) },
        ]
      );
      return;
    }

    if (!locationData.latitude || !locationData.longitude) {
      Alert.alert(
        'Location Not Available',
        'Your location is not available. Please enable GPS and try again, or send without location.',
        [
          { text: 'Retry', onPress: getCurrentLocation },
          { text: 'Send Anyway', onPress: sendSMSOnly }
        ]
      );
      return;
    }

    await sendSMSOnly();
  };

  // ✅ Tapping "Other" opens the modal
  const handleTypeSelect = (typeId: string, index: number) => {
    setSelectedType(typeId);
    setSelectedIndex(index);
    setMessage(buildMessageForType(typeId, otherSpecificType));

    if (typeId === 'other') {
      setShowOtherTypeModal(true);
    }
  };

  // ✅ Save the specific type from the modal
  const handleSaveOtherType = (value: string) => {
    setOtherSpecificType(value);
    setShowOtherTypeModal(false);
    setMessage(buildMessageForType('other', value));
    Alert.alert(
      'Specific Type Saved',
      `Incident Type: Others\nSpecific Type: ${value}`
    );
  };

  const refreshLocation = () => {
    getCurrentLocation();
  };

  const callEOC = () => {
    Linking.openURL(`tel:${EOC_PHONE_NUMBER}`);
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    onSendSMS(sentTypeLabel || 'Emergency', message);
    onClose();
  };

  const handleSuccessRegister = () => {
    setShowSuccessModal(false);
    onRegisterNow();
  };

  return (
    <View style={styles.container}>
      {/* ===== HEADER ===== */}
      <View style={styles.headerGradient}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="arrow-back" size={responsiveSize(24, 20, 28)} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.sosContainer}>
            <Ionicons name="chatbubbles" size={responsiveSize(24, 20, 28)} color="#FFFFFF" />
            <Text style={styles.headerTitle}>Emergency SMS</Text>
          </View>
          <View style={{ width: responsiveSize(40, 32, 48) }} />
        </View>
        <Text style={styles.headerSubtitle}>
          Send your emergency alert to the Emergency Operations Center.
        </Text>

        {/* Guest mode pill */}
        <View style={styles.guestPill}>
          <Ionicons name="person-outline" size={responsiveSize(14, 12, 16)} color="#FF8C00" />
          <Text style={styles.guestPillText}>Guest Mode — No registration required</Text>
        </View>

        {/* GPS status pill */}
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: locationData.latitude
                ? 'rgba(76, 175, 80, 0.2)'
                : 'rgba(255, 140, 0, 0.2)',
            },
          ]}
        >
          {isGettingLocation ? (
            <>
              <ActivityIndicator size="small" color="#4A9EFF" />
              <Text style={[styles.statusPillText, { color: '#4A9EFF' }]}>
                Getting location...
              </Text>
            </>
          ) : locationData.latitude ? (
            <>
              <Ionicons name="checkmark-circle" size={responsiveSize(16, 14, 20)} color="#4CAF50" />
              <Text style={[styles.statusPillText, { color: '#4CAF50' }]}>
                GPS Locked
              </Text>
              <TouchableOpacity onPress={refreshLocation} style={styles.refreshButton}>
                <Ionicons name="refresh" size={responsiveSize(16, 14, 20)} color="#4CAF50" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Ionicons name="warning" size={responsiveSize(16, 14, 20)} color="#FF8C00" />
              <Text style={[styles.statusPillText, { color: '#FF8C00' }]}>
                GPS Off
              </Text>
              <TouchableOpacity onPress={refreshLocation} style={styles.refreshButton}>
                <Ionicons name="refresh" size={responsiveSize(16, 14, 20)} color="#FF8C00" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* ===== SCROLLABLE CONTENT ===== */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Emergency type grid */}
        <Text style={styles.sectionTitle}>🚨 Select Emergency Type</Text>
        <View style={styles.typesGrid}>
          {emergencyTypes.map((type, index) => {
            const isSelected = selectedIndex === index;

            return (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.incidentButton,
                  isSelected && styles.incidentButtonSelected,
                  { backgroundColor: isSelected ? type.solidBg : '#1A1A1A' },
                ]}
                onPress={() => handleTypeSelect(type.id, index)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.incidentIconContainer,
                    { backgroundColor: isSelected ? type.color : '#333' },
                  ]}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={responsiveSize(30, 24, 36)}
                    color="#FFFFFF"
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.incidentButtonText,
                    isSelected && { color: '#FFFFFF', fontWeight: '700' },
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ✅ Specific type preview when "Other" is picked */}
        {selectedType === 'other' && otherSpecificType.trim().length > 0 && (
          <View style={styles.specificTypePreview}>
            <Ionicons name="pricetag" size={responsiveSize(14, 12, 16)} color="#4CAF50" />
            <Text style={styles.specificTypePreviewText}>
              Specific Type: {otherSpecificType}
            </Text>
            <TouchableOpacity onPress={() => setShowOtherTypeModal(true)}>
              <Text style={styles.specificTypeEditText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Location card */}
        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <Ionicons
              name={locationData.latitude ? "location" : "location-outline"}
              size={responsiveSize(20, 16, 24)}
              color={locationData.latitude ? "#4CAF50" : "#FF8C00"}
            />
            <Text style={styles.locationTitle}>
              {locationData.latitude ? 'GPS Location Found' : 'GPS Location Not Available'}
            </Text>
            {isGettingLocation && <ActivityIndicator size="small" color="#4A9EFF" />}
          </View>
          {locationData.latitude && locationData.longitude && (
            <View style={styles.locationDetails}>
              <Text style={styles.locationCoords}>
                Lat: {locationData.latitude.toFixed(6)}° | Long: {locationData.longitude.toFixed(6)}°
              </Text>
              {locationData.accuracy && (
                <Text style={styles.locationAccuracy}>
                  Accuracy: ±{Math.round(locationData.accuracy)}m
                </Text>
              )}
              {locationData.address && (
                <Text style={styles.locationAddress}>
                  📍 {locationData.address}
                </Text>
              )}
            </View>
          )}
          {!locationData.latitude && !isGettingLocation && (
            <TouchableOpacity
              style={styles.enableGPSButton}
              onPress={refreshLocation}
            >
              <Ionicons name="navigate" size={responsiveSize(16, 14, 20)} color="#FFFFFF" />
              <Text style={styles.enableGPSText}>Enable GPS</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Message */}
        <Text style={styles.sectionTitle}>✉️ Message</Text>
        <View style={styles.messageContainer}>
          <TextInput
            style={styles.messageInput}
            multiline
            numberOfLines={8}
            value={message}
            onChangeText={setMessage}
            placeholder="Type your emergency message here..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            textAlignVertical="top"
          />
          <View style={styles.charCountContainer}>
            <Text style={styles.charCount}>{message.length}/160</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.locationButton}
          onPress={() => {
            setMessage(buildMessageForType(selectedType, otherSpecificType));
            Alert.alert('✅ Updated', 'Location has been added to your message.');
          }}
        >
          <Ionicons name="location" size={responsiveSize(20, 16, 24)} color="#4A9EFF" />
          <Text style={styles.locationButtonText}>Update Location in Message</Text>
        </TouchableOpacity>

        {/* EOC number display */}
        <View style={styles.eocNumberContainer}>
          <Text style={styles.eocNumberLabel}>Emergency Operations Center</Text>
          <View style={styles.eocNumberDisplay}>
            <Ionicons name="call" size={responsiveSize(20, 16, 24)} color="#4A9EFF" />
            <Text style={styles.eocNumberDisplayText}>{EOC_PHONE_NUMBER}</Text>
            <View style={styles.fixedBadge}>
              <Text style={styles.fixedBadgeText}>FIXED</Text>
            </View>
          </View>
          <Text style={styles.eocNumberHint}>
            This number is fixed and cannot be changed
          </Text>
        </View>

        {/* Guest info note */}
        <View style={styles.guestInfo}>
          <Ionicons name="information-circle" size={responsiveSize(16, 14, 20)} color="#FF8C00" />
          <Text style={styles.guestInfoText}>
            You are sending this alert as a guest. Register to track your report and receive updates.
          </Text>
        </View>

        <View style={styles.gpsInfo}>
          <Ionicons name="information-circle" size={responsiveSize(16, 14, 20)} color="rgba(255, 255, 255, 0.3)" />
          <Text style={styles.gpsInfoText}>
            SMS uses your phone's cellular network. No internet required.
          </Text>
        </View>
      </ScrollView>

      {/* ===== STICKY FOOTER ===== */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.stickyFooter}>
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={isSending || !message.trim() || !locationData.latitude || !smsAvailable}
            activeOpacity={0.8}
          >
            {isSending ? (
              <View style={styles.sendingContainer}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.sendButtonText}>Sending...</Text>
              </View>
            ) : (
              <>
                <Ionicons name="send" size={responsiveSize(22, 18, 26)} color="#FFFFFF" />
                <Text style={styles.sendButtonText}>
                  {locationData.latitude ? 'Send Alert' : 'Enable GPS First'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ✅ "Other" specific type modal */}
      <OtherTypeModal
        visible={showOtherTypeModal}
        initialValue={otherSpecificType}
        onClose={() => setShowOtherTypeModal(false)}
        onSave={handleSaveOtherType}
      />

      {/* ✅ Guest success modal — prompts registration but SMS was sent */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={handleSuccessClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContainer}>
            <View style={styles.successIconContainer}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark" size={responsiveSize(50, 40, 60)} color="#FFFFFF" />
              </View>
            </View>

            <Text style={styles.successModalTitle}>Emergency Alert Sent!</Text>

            <Text style={styles.successModalMessage}>
              Your emergency alert has been sent to the Emergency Operations Center.
            </Text>

            <View style={styles.successDetailsBox}>
              <Text style={styles.successDetailText}>
                Incident Type: {sentTypeLabel}
              </Text>
              <Text style={styles.successDetailText}>
                Sent to: {EOC_PHONE_NUMBER}
              </Text>
            </View>

            <View style={styles.successBenefitsContainer}>
              <Text style={styles.successBenefitsTitle}>
                Register for a NAGA READY account to track your report, receive live status updates, and access other emergency features.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.successRegisterButton}
              onPress={handleSuccessRegister}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
              <Text style={styles.successRegisterText}>Register Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.successCloseButton}
              onPress={handleSuccessClose}
              activeOpacity={0.8}
            >
              <Text style={styles.successCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  // HEADER
  headerGradient: {
    backgroundColor: '#B00000',
    paddingTop: responsiveSpacing(20, 16, 26),
    paddingBottom: responsiveSpacing(20, 16, 26),
    borderBottomLeftRadius: responsiveSize(10, 8, 12),
    borderBottomRightRadius: responsiveSize(10, 8, 12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    position: 'relative',
  },
  closeButton: {
    width: responsiveSize(40, 32, 48),
    height: responsiveSize(40, 32, 48),
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: responsiveSpacing(20, 14, 26),
    top: '50%',
    transform: [{ translateY: -responsiveSize(20, 16, 24) }],
  },
  sosContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
  },
  headerTitle: {
    fontSize: responsiveSize(20, 16, 24),
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: responsiveSize(13, 11, 16),
    color: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    marginTop: responsiveSpacing(8, 6, 12),
  },

  // Guest pill
  guestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
    marginHorizontal: responsiveSpacing(20, 14, 26),
    marginTop: responsiveSpacing(10, 8, 14),
    paddingHorizontal: responsiveSpacing(12, 10, 16),
    paddingVertical: responsiveSpacing(6, 4, 8),
    borderRadius: responsiveSize(8, 6, 10),
    backgroundColor: 'rgba(255, 140, 0, 0.2)',
  },
  guestPillText: {
    flex: 1,
    fontSize: responsiveSize(13, 11, 16),
    fontWeight: '500',
    color: '#FF8C00',
  },

  // GPS status pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
    marginHorizontal: responsiveSpacing(20, 14, 26),
    marginTop: responsiveSpacing(8, 6, 10),
    paddingHorizontal: responsiveSpacing(12, 10, 16),
    paddingVertical: responsiveSpacing(6, 4, 8),
    borderRadius: responsiveSize(8, 6, 10),
  },
  statusPillText: {
    flex: 1,
    fontSize: responsiveSize(13, 11, 16),
    fontWeight: '500',
  },
  refreshButton: {
    padding: 4,
    marginLeft: 8,
  },

  // Scroll area
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    // ✅ matches the slightly taller footer
    paddingBottom: responsiveSpacing(200, 172, 232),
  },

  // Section titles
  sectionTitle: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: responsiveSpacing(24, 18, 32),
    marginBottom: responsiveSpacing(12, 8, 16),
  },

  // Emergency type grid
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: responsiveSpacing(12, 8, 16),
  },
  incidentButton: {
    width: '31%',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(14, 10, 18),
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  incidentButtonSelected: {
    borderWidth: 3,
    borderColor: '#000000',
  },
  incidentIconContainer: {
    width: responsiveSize(60, 48, 72),
    height: responsiveSize(60, 48, 72),
    borderRadius: responsiveSize(30, 24, 36),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  incidentButtonText: {
    fontSize: responsiveSize(16, 13, 19),
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },

  // Specific type preview
  specificTypePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
    marginTop: responsiveSpacing(12, 8, 16),
    paddingHorizontal: responsiveSpacing(12, 10, 16),
    paddingVertical: responsiveSpacing(8, 6, 10),
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderRadius: responsiveSize(10, 8, 12),
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.35)',
  },
  specificTypePreviewText: {
    flex: 1,
    fontSize: responsiveSize(13, 11, 16),
    color: '#4CAF50',
    fontWeight: '600',
  },
  specificTypeEditText: {
    fontSize: responsiveSize(13, 11, 16),
    color: '#FFFFFF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // Location card
  locationCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(14, 10, 18),
    padding: responsiveSpacing(16, 12, 20),
    marginTop: responsiveSpacing(16, 12, 20),
    borderWidth: 2,
    borderColor: '#000000',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  locationTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: responsiveSize(14, 12, 17),
    fontWeight: '600',
    marginLeft: responsiveSpacing(8, 6, 12),
  },
  locationDetails: {
    marginTop: 4,
  },
  locationCoords: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: responsiveSize(13, 11, 16),
    marginBottom: 4,
  },
  locationAccuracy: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: responsiveSize(12, 10, 14),
    marginBottom: 4,
  },
  locationAddress: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: responsiveSize(13, 11, 16),
    marginTop: 4,
  },
  enableGPSButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    marginTop: responsiveSpacing(8, 6, 12),
    paddingVertical: responsiveSpacing(8, 6, 10),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    backgroundColor: '#4A9EFF',
    borderRadius: responsiveSize(8, 6, 10),
  },
  enableGPSText: {
    color: '#FFFFFF',
    fontSize: responsiveSize(14, 12, 17),
    fontWeight: '600',
  },

  // Message container
  messageContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(14, 10, 18),
    borderWidth: 2,
    borderColor: '#000000',
    overflow: 'hidden',
  },
  messageInput: {
    color: '#FFFFFF',
    fontSize: responsiveSize(15, 13, 18),
    padding: responsiveSpacing(16, 12, 20),
    minHeight: responsiveSize(150, 120, 180),
    maxHeight: responsiveSize(200, 160, 240),
  },
  charCountContainer: {
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    paddingBottom: responsiveSpacing(8, 6, 12),
    alignItems: 'flex-end',
  },
  charCount: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: responsiveSize(12, 10, 14),
  },

  // Location update button
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    paddingVertical: responsiveSpacing(12, 10, 16),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
    borderRadius: responsiveSize(12, 8, 16),
    marginTop: responsiveSpacing(12, 10, 16),
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.2)',
  },
  locationButtonText: {
    color: '#4A9EFF',
    fontSize: responsiveSize(14, 12, 17),
    fontWeight: '600',
  },

  // EOC number display
  eocNumberContainer: {
    marginTop: responsiveSpacing(16, 12, 20),
    padding: responsiveSpacing(16, 12, 20),
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(12, 8, 16),
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.2)',
  },
  eocNumberLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: responsiveSize(12, 10, 14),
    marginBottom: responsiveSpacing(8, 6, 12),
    fontWeight: '600',
  },
  eocNumberDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(10, 8, 14),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: responsiveSize(10, 8, 12),
    paddingHorizontal: responsiveSpacing(12, 10, 16),
    paddingVertical: responsiveSpacing(10, 8, 14),
  },
  eocNumberDisplayText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '600',
  },
  fixedBadge: {
    backgroundColor: '#4A9EFF',
    paddingHorizontal: responsiveSpacing(8, 6, 12),
    paddingVertical: 2,
    borderRadius: 4,
  },
  fixedBadgeText: {
    color: '#FFFFFF',
    fontSize: responsiveSize(10, 9, 12),
    fontWeight: '700',
  },
  eocNumberHint: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: responsiveSize(11, 10, 14),
    marginTop: responsiveSpacing(6, 4, 8),
    textAlign: 'center',
  },

  // Guest info note
  guestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
    marginTop: responsiveSpacing(12, 10, 16),
    padding: responsiveSpacing(10, 8, 14),
    backgroundColor: 'rgba(255, 140, 0, 0.08)',
    borderRadius: responsiveSize(8, 6, 10),
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.2)',
  },
  guestInfoText: {
    flex: 1,
    color: 'rgba(255, 200, 100, 0.7)',
    fontSize: responsiveSize(12, 10, 14),
  },

  // GPS info note
  gpsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
    marginTop: responsiveSpacing(12, 10, 16),
    padding: responsiveSpacing(8, 6, 12),
    backgroundColor: 'rgba(255, 165, 0, 0.05)',
    borderRadius: responsiveSize(8, 6, 10),
  },
  gpsInfoText: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: responsiveSize(11, 10, 14),
  },

  // Sticky footer — ✅ A LITTLE TALLER
  stickyFooter: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    paddingTop: responsiveSpacing(26, 20, 32),                 // ✅ taller top
    paddingBottom: Platform.OS === 'ios'
      ? responsiveSpacing(62, 50, 74)                           // ✅ taller bottom (iOS)
      : responsiveSpacing(46, 38, 56),                          // ✅ taller bottom (Android)
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  sendButton: {
    backgroundColor: '#B00000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(10, 8, 14),
    paddingVertical: responsiveSpacing(14, 12, 16),          // unchanged
    height: responsiveSize(56, 48, 64),                      // unchanged
    borderRadius: responsiveSize(18, 14, 22),                // unchanged
    shadowColor: '#B00000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: responsiveSize(17, 15, 20),
    fontWeight: '700',
  },
  sendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(10, 8, 14),
  },

  // OtherTypeModal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherTypeModalContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: responsiveSize(20, 16, 24),
    width: '88%',
    padding: responsiveSpacing(20, 16, 26),
  },
  otherTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(10, 8, 14),
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  otherTypeIconCircle: {
    width: responsiveSize(42, 34, 50),
    height: responsiveSize(42, 34, 50),
    borderRadius: responsiveSize(21, 17, 25),
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherTypeTitle: {
    fontSize: responsiveSize(18, 15, 22),
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  otherTypeSubtitle: {
    fontSize: responsiveSize(13, 11, 16),
    color: '#94A3B8',
    marginBottom: responsiveSpacing(14, 10, 18),
  },
  otherTypeInput: {
    backgroundColor: '#0F0F0F',
    borderRadius: responsiveSize(12, 8, 16),
    paddingHorizontal: responsiveSpacing(14, 10, 18),
    height: responsiveSize(50, 42, 58),
    fontSize: responsiveSize(15, 13, 18),
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333',
  },
  otherTypeExamplesLabel: {
    fontSize: responsiveSize(12, 10, 14),
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: responsiveSpacing(14, 10, 18),
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  otherTypeExamplesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: responsiveSpacing(8, 6, 12),
    marginBottom: responsiveSpacing(18, 14, 22),
  },
  otherTypeExampleChip: {
    paddingHorizontal: responsiveSpacing(10, 8, 14),
    paddingVertical: responsiveSpacing(6, 4, 8),
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: responsiveSize(20, 16, 24),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  otherTypeExampleChipText: {
    fontSize: responsiveSize(12, 10, 14),
    color: '#E5E7EB',
    fontWeight: '500',
  },
  otherTypeActionsRow: {
    flexDirection: 'row',
    gap: responsiveSpacing(10, 8, 14),
  },
  otherTypeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(6, 4, 8),
    paddingVertical: responsiveSpacing(12, 10, 16),
    borderRadius: responsiveSize(12, 8, 16),
  },
  otherTypeCancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  otherTypeConfirmBtn: {
    backgroundColor: '#4CAF50',
  },
  otherTypeCancelText: {
    color: '#E5E7EB',
    fontSize: responsiveSize(14, 12, 17),
    fontWeight: '600',
  },
  otherTypeConfirmText: {
    color: '#FFFFFF',
    fontSize: responsiveSize(14, 12, 17),
    fontWeight: '700',
  },

  // ===== SUCCESS MODAL (Guest) =====
  successModalContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(24, 18, 30),
    width: '88%',
    maxWidth: 420,
    padding: responsiveSpacing(28, 22, 36),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  successIconContainer: {
    marginBottom: responsiveSpacing(20, 14, 26),
  },
  successIconCircle: {
    width: responsiveSize(90, 70, 110),
    height: responsiveSize(90, 70, 110),
    borderRadius: responsiveSize(45, 35, 55),
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalTitle: {
    fontSize: responsiveSize(22, 18, 26),
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: responsiveSpacing(12, 8, 16),
  },
  successModalMessage: {
    fontSize: responsiveSize(14, 12, 17),
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: responsiveSize(22, 18, 26),
    marginBottom: responsiveSpacing(16, 12, 20),
  },
  successDetailsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: responsiveSize(12, 8, 16),
    padding: responsiveSpacing(16, 12, 20),
    width: '100%',
    marginBottom: responsiveSpacing(16, 12, 20),
    gap: 4,
  },
  successDetailText: {
    fontSize: responsiveSize(13, 11, 16),
    color: '#94A3B8',
  },
  successBenefitsContainer: {
    backgroundColor: 'rgba(74, 158, 255, 0.08)',
    borderRadius: responsiveSize(16, 12, 20),
    padding: responsiveSpacing(18, 14, 22),
    width: '100%',
    marginBottom: responsiveSpacing(20, 14, 26),
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.15)',
  },
  successBenefitsTitle: {
    fontSize: responsiveSize(13, 11, 16),
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: responsiveSize(20, 16, 24),
  },
  successRegisterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(10, 8, 14),
    backgroundColor: '#B00000',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(16, 12, 20),
    width: '100%',
    marginBottom: responsiveSpacing(12, 8, 16),
  },
  successRegisterText: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  successCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: responsiveSpacing(14, 10, 18),
    paddingHorizontal: responsiveSpacing(24, 18, 30),
    borderRadius: responsiveSize(14, 10, 18),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
  },
  successCloseText: {
    fontSize: responsiveSize(15, 13, 18),
    fontWeight: '600',
    color: '#94A3B8',
  },
});
// components/GuestIncidentReportPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { incidentService, LocationData } from '../services/incidentService';

interface GuestIncidentReportPageProps {
  onClose: () => void;
  onSubmit: (reportData: any) => void;
  onRegisterNow: () => void;
}

const { width, height } = Dimensions.get('window');

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

// ============================================================
// ✅ OtherTypeModal — extracted OUTSIDE the parent so it does
//    not get re-created on every parent render.
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

export default function GuestIncidentReportPage({
  onClose,
  onSubmit,
  onRegisterNow,
}: GuestIncidentReportPageProps) {
  const [selectedIncident, setSelectedIncident] = useState<string>('');
  const [location, setLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState<LocationData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedReport, setSubmittedReport] = useState<any>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [tempLocation, setTempLocation] = useState<LocationData | null>(null);
  const mapRef = useRef<MapView>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // ✅ "Other" incident type modal state (input lives INSIDE the modal)
  const [showOtherTypeModal, setShowOtherTypeModal] = useState(false);
  const [otherSpecificType, setOtherSpecificType] = useState('');

  // Casualties state — stored as strings so users can type freely
  const [casualties, setCasualties] = useState({
    injured: '0',
    fatalities: '0',
    trapped: '0',
  });

  const incidentTypes = incidentService.getIncidentTypes();

  useEffect(() => {
    getCurrentLocation();
    initializePermissions();
  }, []);

  const initializePermissions = async () => {
    if (Platform.OS !== 'web') {
      await incidentService.requestGalleryPermissions();
    }
  };

  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const locationData = await incidentService.getCurrentLocation();
      if (locationData) {
        setLocation(locationData.address);
        setLocationDetails(locationData);
        setTempLocation(locationData);
      }
    } catch (error) {
      console.error('Location error:', error);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const openMapForConfirmation = () => {
    if (locationDetails || tempLocation) {
      setShowMapModal(true);
    } else {
      getCurrentLocation();
      setTimeout(() => {
        if (locationDetails || tempLocation) {
          setShowMapModal(true);
        }
      }, 1000);
    }
  };

  const confirmLocationFromMap = () => {
    if (tempLocation) {
      setLocationDetails(tempLocation);
      setLocation(tempLocation.address);
      setShowMapModal(false);
      Alert.alert('Location Confirmed', 'Your location has been confirmed successfully.');
    }
  };

  // ✅ + / − buttons — increment/decrement as string
  const handleCasualtyChange = (
    type: 'injured' | 'fatalities' | 'trapped',
    increment: boolean
  ) => {
    setCasualties((prev) => {
      const current = parseInt(prev[type], 10) || 0;
      const next = Math.max(0, current + (increment ? 1 : -1));
      return { ...prev, [type]: String(next) };
    });
  };

  // ✅ Direct typing — only digits allowed, no leading zeros (except "0")
  const handleCasualtyInput = (
    type: 'injured' | 'fatalities' | 'trapped',
    text: string
  ) => {
    const digitsOnly = text.replace(/[^0-9]/g, '');
    if (digitsOnly === '') {
      setCasualties((prev) => ({ ...prev, [type]: '' }));
      return;
    }
    // Remove leading zeros (e.g. "007" -> "7")
    const normalized = String(parseInt(digitsOnly, 10));
    setCasualties((prev) => ({ ...prev, [type]: normalized }));
  };

  // ✅ On blur — if empty, reset to "0"
  const handleCasualtyBlur = (type: 'injured' | 'fatalities' | 'trapped') => {
    setCasualties((prev) => {
      if (prev[type] === '' || prev[type] == null) {
        return { ...prev, [type]: '0' };
      }
      return prev;
    });
  };

  const handleSubmit = async () => {
    if (isSubmitted) return;

    // ✅ If "Other" is selected, require a specific type
    if (selectedIncident === 'Other' && !otherSpecificType.trim()) {
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

    if (!selectedIncident) {
      Alert.alert('Error', 'Please select the type of emergency.');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Please confirm your location.');
      return;
    }

    setIsSubmitted(true);
    setIsSubmitting(true);

    try {
      // ✅ Convert string casualties back to numbers for submission
      const casualtiesPayload = {
        injured: parseInt(casualties.injured, 10) || 0,
        fatalities: parseInt(casualties.fatalities, 10) || 0,
        trapped: parseInt(casualties.trapped, 10) || 0,
      };

      const incidentData = {
        incidentId: Date.now().toString(),
        timestamp: new Date().toISOString(),
        incidentType: selectedIncident,
        // ✅ Include the specific type when "Other" was selected
        specificType:
          selectedIncident === 'Other' ? otherSpecificType.trim() : null,
        reporter: {
          fullName: '',
          phoneNumber: '',
          isGuest: true,
        },
        location: locationDetails || {
          address: location,
          isManual: true,
        },
        description: '',
        casualties: casualtiesPayload,
        status: 'submitted' as const,
        submittedAt: new Date().toLocaleString(),
      };

      const result = await incidentService.submitGuestIncidentReport(incidentData, null);

      const reportData = {
        ...incidentData,
        photoUrl: result.photoUrl,
        hasPhoto: !!result.photoUrl,
        firebaseId: result.firebaseId,
      };

      setSubmittedReport(reportData);
      setShowSuccessModal(true);
      onSubmit(reportData);
    } catch (error: any) {
      console.error('Submit error:', error);
      setIsSubmitted(false);
      Alert.alert('Error', error.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    onClose();
  };

  const handleIncidentSelect = (typeName: string, index: number) => {
    setSelectedIncident(typeName);
    setSelectedIndex(index);

    // ✅ If user picks "Other", immediately pop the modal
    if (typeName === 'Other') {
      setShowOtherTypeModal(true);
    }
  };

  const LocationMapModal = () => (
    <Modal
      animationType="slide"
      transparent={false}
      visible={showMapModal}
      onRequestClose={() => setShowMapModal(false)}
    >
      <View style={styles.mapModalContainer}>
        <View style={styles.mapModalHeader}>
          <TouchableOpacity onPress={() => setShowMapModal(false)}>
            <Ionicons name="arrow-back" size={responsiveSize(28, 24, 32)} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.mapModalTitle}>Confirm Your Location</Text>
          <TouchableOpacity onPress={confirmLocationFromMap}>
            <Ionicons name="checkmark-circle" size={responsiveSize(28, 24, 32)} color="#4CAF50" />
          </TouchableOpacity>
        </View>

        <View style={styles.mapContainer}>
          {tempLocation?.coordinates && (
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={styles.map}
              initialRegion={{
                latitude: tempLocation.coordinates.latitude,
                longitude: tempLocation.coordinates.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              showsUserLocation={true}
              showsMyLocationButton={true}
            >
              <Marker
                coordinate={tempLocation.coordinates}
                draggable
                onDragEnd={(e) => {
                  const { latitude, longitude } = e.nativeEvent.coordinate;
                  setTempLocation({
                    ...tempLocation,
                    coordinates: { latitude, longitude },
                    latitude,
                    longitude,
                  });
                }}
              >
                <View style={styles.markerContainer}>
                  <Ionicons name="location" size={responsiveSize(40, 32, 48)} color="#FF4444" />
                  <View style={styles.markerPulse} />
                </View>
              </Marker>
            </MapView>
          )}
        </View>

        <View style={styles.mapInfoContainer}>
          <Ionicons name="location-outline" size={responsiveSize(20, 16, 24)} color="#FF4444" />
          <Text style={styles.mapAddressText}>
            {tempLocation?.address || 'Drag the pin to adjust your location'}
          </Text>
        </View>

        <View style={styles.mapInstructions}>
          <Ionicons name="information-circle-outline" size={responsiveSize(16, 14, 20)} color="#94A3B8" />
          <Text style={styles.mapInstructionText}>
            Drag the pin to adjust your exact location if needed
          </Text>
        </View>

        <TouchableOpacity style={styles.mapConfirmButton} onPress={confirmLocationFromMap}>
          <Text style={styles.mapConfirmButtonText}>Confirm Location</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );

  const SuccessModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={showSuccessModal}
      onRequestClose={handleCloseModal}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalIconContainer}>
            <Ionicons name="checkmark-circle" size={responsiveSize(80, 60, 100)} color="#4CAF50" />
          </View>
          <Text style={styles.modalTitle}>Report Submitted!</Text>
          <Text style={styles.modalMessage}>
            Your emergency report has been sent to CDRRMO.
          </Text>
          {submittedReport?.incidentType === 'Medical' && (
            <View style={styles.modalWarningContainer}>
              <Ionicons name="alert-circle" size={responsiveSize(20, 16, 24)} color="#FF4444" />
              <Text style={styles.modalWarning}>
                Medical team has been automatically dispatched
              </Text>
            </View>
          )}
          <View style={styles.modalDetails}>
            <Text style={styles.modalDetailText}>
              Reference: #{submittedReport?.incidentId?.slice(-8)}
            </Text>
            <Text style={styles.modalDetailText}>
              Incident Type: {submittedReport?.incidentType === 'Other' ? 'Others' : submittedReport?.incidentType}
            </Text>
            {submittedReport?.incidentType === 'Other' && submittedReport?.specificType && (
              <Text style={styles.modalDetailText}>
                Specific Type: {submittedReport.specificType}
              </Text>
            )}
            <Text style={styles.modalDetailText}>
              Location: {submittedReport?.location?.address}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={handleCloseModal}
          >
            <Text style={styles.modalButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerGradient}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="arrow-back" size={responsiveSize(24, 20, 28)} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.sosContainer}>
            <Ionicons name="alert-circle" size={responsiveSize(24, 20, 28)} color="#FFFFFF" />
            <Text style={styles.headerTitle}>SOS Emergency Report</Text>
          </View>
          <View style={{ width: responsiveSize(40, 32, 48) }} />
        </View>
        <Text style={styles.headerSubtitle}>
          Your safety is our priority. Report emergencies instantly.
        </Text>
        <View style={styles.guestWarning}>
          <Ionicons name="person-outline" size={responsiveSize(16, 14, 20)} color="#FF8C00" />
          <Text style={styles.guestWarningText}>Guest Mode — Register for full access</Text>
        </View>
      </View>

      {/* ✅ Scrollable content area */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚨 What type of emergency?</Text>
          <View style={styles.incidentGrid}>
            {incidentTypes.map((type, index) => {
              const isSelected = selectedIndex === index;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.incidentButton,
                    isSelected && styles.incidentButtonSelected,
                    {
                      backgroundColor: isSelected ? type.solidBg : '#1A1A1A',
                      // ✅ Single white outline — not a double/solid stacked look
                      borderColor: isSelected
                        ? '#FFFFFF'
                        : 'rgba(255, 255, 255, 0.35)',
                      borderWidth: responsiveSize(2, 1.5, 2.5),
                    },
                  ]}
                  onPress={() => handleIncidentSelect(type.name, index)}
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
                      size={responsiveSize(28, 24, 32)}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text
                    style={[
                      styles.incidentButtonText,
                      isSelected && { color: '#FFFFFF', fontWeight: '700' },
                    ]}
                  >
                    {type.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ✅ Show the chosen specific type right under the grid */}
          {selectedIncident === 'Other' && otherSpecificType.trim().length > 0 && (
            <View style={styles.specificTypePreview}>
              <Ionicons name="pricetag" size={responsiveSize(16, 14, 18)} color="#4CAF50" />
              <Text style={styles.specificTypePreviewText}>
                Specific Type: {otherSpecificType}
              </Text>
              <TouchableOpacity onPress={() => setShowOtherTypeModal(true)}>
                <Text style={styles.specificTypeEditText}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ✅ Casualties Section — directly below the emergency type section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Casualties</Text>
          <View style={styles.casualtiesContainer}>
            {/* Injured Card */}
            <View style={styles.casualtyCard}>
              <View style={[styles.casualtyIconContainer, { backgroundColor: '#FF4444' }]}>
                <Ionicons name="medical" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
              </View>
              <Text style={styles.casualtyLabel}>Injured</Text>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => handleCasualtyChange('injured', false)}
                >
                  <Ionicons name="remove" size={responsiveSize(14, 12, 16)} color="#94A3B8" />
                </TouchableOpacity>
                <TextInput
                  style={styles.counterNumberInput}
                  value={casualties.injured}
                  onChangeText={(text) => handleCasualtyInput('injured', text)}
                  onBlur={() => handleCasualtyBlur('injured')}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  textAlign="center"
                />
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => handleCasualtyChange('injured', true)}
                >
                  <Ionicons name="add" size={responsiveSize(14, 12, 16)} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Fatalities Card */}
            <View style={styles.casualtyCard}>
              <View style={[styles.casualtyIconContainer, { backgroundColor: '#8B0000' }]}>
                <Ionicons name="alert-circle" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
              </View>
              <Text style={styles.casualtyLabel}>Fatalities</Text>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => handleCasualtyChange('fatalities', false)}
                >
                  <Ionicons name="remove" size={responsiveSize(14, 12, 16)} color="#94A3B8" />
                </TouchableOpacity>
                <TextInput
                  style={styles.counterNumberInput}
                  value={casualties.fatalities}
                  onChangeText={(text) => handleCasualtyInput('fatalities', text)}
                  onBlur={() => handleCasualtyBlur('fatalities')}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  textAlign="center"
                />
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => handleCasualtyChange('fatalities', true)}
                >
                  <Ionicons name="add" size={responsiveSize(14, 12, 16)} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Trapped Card */}
            <View style={styles.casualtyCard}>
              <View style={[styles.casualtyIconContainer, { backgroundColor: '#6B7280' }]}>
                <Ionicons name="people" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
              </View>
              <Text style={styles.casualtyLabel}>Trapped</Text>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => handleCasualtyChange('trapped', false)}
                >
                  <Ionicons name="remove" size={responsiveSize(14, 12, 16)} color="#94A3B8" />
                </TouchableOpacity>
                <TextInput
                  style={styles.counterNumberInput}
                  value={casualties.trapped}
                  onChangeText={(text) => handleCasualtyInput('trapped', text)}
                  onBlur={() => handleCasualtyBlur('trapped')}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  textAlign="center"
                />
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => handleCasualtyChange('trapped', true)}
                >
                  <Ionicons name="add" size={responsiveSize(14, 12, 16)} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* ✅ Location Section — directly below Casualties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Your Location (Auto-detected)</Text>
          <TouchableOpacity
            style={styles.inputContainer}
            onPress={openMapForConfirmation}
            activeOpacity={0.8}
          >
            <Ionicons name="location-outline" size={responsiveSize(20, 16, 24)} color="#FF4444" style={styles.inputIcon} />
            <Text style={styles.locationText}>
              {isGettingLocation ? 'Detecting location...' : location || 'Tap to select location'}
            </Text>
            <Ionicons name="chevron-forward" size={responsiveSize(20, 16, 24)} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.emergencyNote}>
          <Ionicons name="shield-checkmark" size={responsiveSize(16, 14, 20)} color="#4CAF50" />
          <Text style={styles.emergencyNoteText}>
            For emergencies, responders will be dispatched immediately
          </Text>
        </View>
      </ScrollView>

      {/* ✅ STICKY FOOTER — always visible at the bottom */}
      <View style={styles.stickyFooter}>
        <TouchableOpacity
          style={[styles.submitButton, isSubmitted && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitted || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="send" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>
                {isSubmitted ? 'REPORT SENT ✓' : 'SUBMIT EMERGENCY REPORT'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.registerNowLink}
          onPress={onRegisterNow}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add" size={responsiveSize(16, 14, 20)} color="#4A9EFF" />
          <Text style={styles.registerNowLinkText}>
            Register for full access & tracking
          </Text>
        </TouchableOpacity>
      </View>

      <LocationMapModal />
      <SuccessModal />
      {/* ✅ Uses the top-level OtherTypeModal — typing works normally */}
      <OtherTypeModal
        visible={showOtherTypeModal}
        initialValue={otherSpecificType}
        onClose={() => setShowOtherTypeModal(false)}
        onSave={(value) => {
          setOtherSpecificType(value);
          setShowOtherTypeModal(false);
          Alert.alert(
            'Specific Type Saved',
            `Incident Type: Others\nSpecific Type: ${value}`
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  headerGradient: {
    backgroundColor: '#B00000',
    paddingTop: responsiveSpacing(25, 20, 32),
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
  sosContainer: { flexDirection: 'row', alignItems: 'center', gap: responsiveSpacing(8, 6, 12) },
  headerTitle: { fontSize: responsiveSize(20, 16, 24), fontWeight: 'bold', color: '#FFFFFF' },
  headerSubtitle: {
    fontSize: responsiveSize(13, 11, 16),
    color: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    marginTop: responsiveSpacing(8, 6, 12),
  },
  guestWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 140, 0, 0.2)',
    marginHorizontal: responsiveSpacing(20, 14, 26),
    marginTop: responsiveSpacing(10, 8, 14),
    paddingHorizontal: responsiveSpacing(12, 10, 16),
    paddingVertical: responsiveSpacing(6, 4, 8),
    borderRadius: responsiveSize(8, 6, 10),
    gap: responsiveSpacing(8, 6, 12),
  },
  guestWarningText: { color: '#FF8C00', fontSize: responsiveSize(13, 11, 16), fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    paddingBottom: responsiveSpacing(24, 18, 32),
  },
  section: { marginTop: responsiveSpacing(24, 18, 32) },
  sectionTitle: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: responsiveSpacing(12, 8, 16),
  },
  incidentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: responsiveSpacing(12, 8, 16),
  },
  incidentButton: {
    width: '31%',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(12, 8, 16),
    alignItems: 'center',
    // ✅ Single clean outline (not a heavy double/solid stack)
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  incidentButtonSelected: {
    // ✅ Slightly stronger single outline when selected
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  incidentIconContainer: {
    width: responsiveSize(48, 38, 58),
    height: responsiveSize(48, 38, 58),
    borderRadius: responsiveSize(24, 19, 29),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  incidentButtonText: {
    // ✅ Font size increased
    fontSize: responsiveSize(16, 14, 19),
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(14, 10, 18),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    height: responsiveSize(52, 44, 60),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputIcon: { marginRight: responsiveSpacing(12, 8, 16) },
  locationText: { flex: 1, fontSize: responsiveSize(14, 12, 17), color: '#94A3B8' },

  // ✅ Sticky footer styles
  stickyFooter: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    paddingTop: responsiveSpacing(12, 8, 16),
    paddingBottom: Platform.OS === 'ios' ? responsiveSpacing(28, 22, 34) : responsiveSpacing(16, 12, 20),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  submitButton: {
    backgroundColor: '#B00000',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(16, 12, 20),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: responsiveSpacing(8, 6, 12),
    shadowColor: '#B00000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  registerNowLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    paddingVertical: responsiveSpacing(12, 8, 16),
    marginTop: responsiveSpacing(4, 2, 6),
  },
  registerNowLinkText: {
    fontSize: responsiveSize(14, 12, 17),
    color: '#4A9EFF',
    fontWeight: '600',
  },
  emergencyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    paddingVertical: responsiveSpacing(20, 14, 26),
  },
  emergencyNoteText: { fontSize: responsiveSize(12, 10, 14), color: '#666' },
  mapModalContainer: { flex: 1, backgroundColor: '#0A0A0A' },
  mapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    paddingTop: responsiveSpacing(50, 40, 60),
    paddingBottom: responsiveSpacing(16, 12, 20),
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  mapModalTitle: { fontSize: responsiveSize(18, 15, 22), fontWeight: '600', color: '#FFFFFF' },
  mapContainer: { height: height * 0.5, width: width },
  map: { width: '100%', height: '100%' },
  markerContainer: { alignItems: 'center' },
  markerPulse: {
    position: 'absolute',
    width: responsiveSize(60, 48, 72),
    height: responsiveSize(60, 48, 72),
    borderRadius: responsiveSize(30, 24, 36),
    backgroundColor: 'rgba(255, 68, 68, 0.3)',
    top: -responsiveSize(10, 8, 12),
    left: -responsiveSize(10, 8, 12),
  },
  mapInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(12, 8, 16),
    padding: responsiveSpacing(20, 14, 26),
    backgroundColor: '#1A1A1A',
    margin: responsiveSpacing(20, 14, 26),
    borderRadius: responsiveSize(14, 10, 18),
  },
  mapAddressText: { flex: 1, fontSize: responsiveSize(14, 12, 17), color: '#FFFFFF' },
  mapInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    marginBottom: responsiveSpacing(20, 14, 26),
  },
  mapInstructionText: { fontSize: responsiveSize(12, 10, 14), color: '#94A3B8' },
  mapConfirmButton: {
    backgroundColor: '#4CAF50',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(16, 12, 20),
    marginHorizontal: responsiveSpacing(20, 14, 26),
    alignItems: 'center',
  },
  mapConfirmButtonText: { fontSize: responsiveSize(16, 14, 20), fontWeight: '600', color: '#FFFFFF' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: responsiveSize(24, 18, 30),
    width: '85%',
    padding: responsiveSpacing(24, 18, 32),
    alignItems: 'center',
  },
  modalIconContainer: { marginBottom: responsiveSpacing(16, 12, 20) },
  modalTitle: {
    fontSize: responsiveSize(24, 18, 30),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  modalMessage: {
    fontSize: responsiveSize(14, 12, 17),
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: responsiveSpacing(16, 12, 20),
  },
  modalWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    paddingHorizontal: responsiveSpacing(12, 10, 16),
    paddingVertical: responsiveSpacing(8, 6, 10),
    borderRadius: responsiveSize(8, 6, 10),
    marginBottom: responsiveSpacing(16, 12, 20),
  },
  modalWarning: { fontSize: responsiveSize(13, 11, 16), color: '#FF4444', fontWeight: '600' },
  modalDetails: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: responsiveSize(12, 8, 16),
    padding: responsiveSpacing(16, 12, 20),
    width: '100%',
    marginBottom: responsiveSpacing(20, 14, 26),
  },
  modalDetailText: {
    fontSize: responsiveSize(12, 10, 14),
    color: '#94A3B8',
    marginBottom: responsiveSpacing(4, 2, 6),
  },
  modalButton: {
    backgroundColor: '#B00000',
    borderRadius: responsiveSize(12, 8, 16),
    paddingVertical: responsiveSpacing(12, 8, 16),
    paddingHorizontal: responsiveSpacing(32, 24, 40),
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: { fontSize: responsiveSize(16, 14, 20), fontWeight: '600', color: '#FFFFFF' },
  casualtiesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: responsiveSpacing(8, 6, 10),
  },
  casualtyCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(12, 8, 16),
    paddingVertical: responsiveSpacing(14, 10, 18),
    paddingHorizontal: responsiveSpacing(6, 4, 8),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minHeight: responsiveSize(100, 80, 120),
    overflow: 'hidden',
  },
  casualtyIconContainer: {
    width: responsiveSize(32, 26, 38),
    height: responsiveSize(32, 26, 38),
    borderRadius: responsiveSize(16, 13, 19),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsiveSpacing(4, 2, 6),
  },
  casualtyLabel: {
    // ✅ Font size increased
    fontSize: responsiveSize(12, 10, 14),
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: responsiveSpacing(6, 4, 8),
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 0,
  },
  counterButton: {
    width: responsiveSize(22, 18, 26),
    height: responsiveSize(22, 18, 26),
    borderRadius: responsiveSize(11, 9, 13),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  counterNumber: {
    fontSize: responsiveSize(18, 15, 22),
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: responsiveSize(20, 16, 24),
    textAlign: 'center',
  },
  // ✅ Editable number input for casualties
  counterNumberInput: {
    flex: 1,
    fontSize: responsiveSize(18, 15, 22),
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },

  // ✅ "Other" specific type preview (under the grid)
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
    fontSize: responsiveSize(15, 13, 18),
    color: '#4CAF50',
    fontWeight: '600',
  },
  specificTypeEditText: {
    fontSize: responsiveSize(15, 13, 18),
    color: '#FFFFFF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // ✅ "Other" modal styles
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
    fontSize: responsiveSize(20, 17, 24),
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  otherTypeSubtitle: {
    fontSize: responsiveSize(15, 13, 18),
    color: '#94A3B8',
    marginBottom: responsiveSpacing(14, 10, 18),
  },
  otherTypeInput: {
    backgroundColor: '#0F0F0F',
    borderRadius: responsiveSize(12, 8, 16),
    paddingHorizontal: responsiveSpacing(14, 10, 18),
    height: responsiveSize(50, 42, 58),
    fontSize: responsiveSize(16, 14, 19),
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333',
  },
  otherTypeExamplesLabel: {
    fontSize: responsiveSize(14, 12, 16),
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
    fontSize: responsiveSize(14, 12, 16),
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
    fontSize: responsiveSize(16, 14, 19),
    fontWeight: '600',
  },
  otherTypeConfirmText: {
    color: '#FFFFFF',
    fontSize: responsiveSize(16, 14, 19),
    fontWeight: '700',
  },
});
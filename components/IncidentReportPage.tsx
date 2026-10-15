// components/IncidentReportPage.tsx
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
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { incidentService, LocationData } from '../services/incidentService';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location'; // ✅ ADDED

interface IncidentReportPageProps {
  onClose: () => void;
  onSubmit: (reportData: any) => void;
  onAuthRequired?: () => void;
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
// Leaflet map HTML builder
// ============================================================
const buildLocationMapHTML = (lat: number, lng: number, label: string) => {
  const safeLabel = (label || 'Selected Location').replace(/'/g, "\\'");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#1A1A2E; touch-action:none; overscroll-behavior:none; }
    .incident-marker { background:#FF4444; width:22px; height:22px; border-radius:50%; border:3px solid white; box-shadow:0 0 0 6px rgba(255,68,68,0.25); animation: pulse 1.6s infinite; }
    @keyframes pulse { 0% { box-shadow:0 0 0 0 rgba(255,68,68,0.7); } 70% { box-shadow:0 0 0 22px rgba(255,68,68,0); } 100% { box-shadow:0 0 0 0 rgba(255,68,68,0); } }
    .leaflet-popup-content-wrapper { background:#FFF; color:#1A1A1A; border-radius:10px; font-size:12px; }
    .leaflet-popup-tip { background:#FFF; }
    .leaflet-container { background:#1A1A2E; }
    .leaflet-control-zoom a { background:#1A1A1A; color:#FFF; border:1px solid rgba(255,255,255,0.15); }
    .leaflet-control-zoom a:hover { background:#333; color:#FFF; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    let LAT = ${lat};
    let LNG = ${lng};

    const map = L.map('map', {
      zoomControl:false,
      attributionControl:false,
      dragging:true, touchZoom:true, scrollWheelZoom:true, tap:true
    }).setView([LAT, LNG], 17);

    document.addEventListener('touchmove', function(e){ e.stopPropagation(); }, { passive: false });
    document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
    document.addEventListener('gesturechange', function(e){ e.preventDefault(); });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom:19 });
    const labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom:19, pane:'shadowPane' });
    satelliteLayer.addTo(map);
    labelsLayer.addTo(map);

    const markerIcon = L.divIcon({ className:'', html:'<div class="incident-marker"></div>', iconSize:[22,22], iconAnchor:[11,11] });
    const marker = L.marker([LAT, LNG], { icon: markerIcon, draggable: true })
      .addTo(map)
      .bindPopup('<b>📍 Selected Location</b><br/>${safeLabel}');

    let circle = L.circle([LAT, LNG], {
      color:'#FF4444', fillColor:'#FF4444', fillOpacity:0.15, radius:80, weight:2
    }).addTo(map);

    async function reverseGeocode(lat, lng) {
      try {
        const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='
          + lat + '&lon=' + lng + '&zoom=18&addressdetails=1';
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.display_name) return data.display_name;
      } catch (e) {}
      return null;
    }

    async function emitLocation(lat, lng) {
      const address = await reverseGeocode(lat, lng);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'LOCATION_CHANGED',
          latitude: lat,
          longitude: lng,
          address: address
        }));
      }
    }

    marker.on('dragend', function(e) {
      const pos = marker.getLatLng();
      LAT = pos.lat; LNG = pos.lng;
      circle.setLatLng([LAT, LNG]);
      emitLocation(LAT, LNG);
    });

    map.on('click', function(e) {
      LAT = e.latlng.lat; LNG = e.latlng.lng;
      marker.setLatLng([LAT, LNG]);
      circle.setLatLng([LAT, LNG]);
      emitLocation(LAT, LNG);
    });

    window.updateMarkerPosition = function(lat, lng) {
      LAT = lat; LNG = lng;
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      map.setView([lat, lng], map.getZoom());
    };

    L.control.zoom({ position:'bottomright' }).addTo(map);
  </script>
</body>
</html>
  `;
};

// ============================================================
// OtherTypeModal
// ============================================================
interface OtherTypeModalProps {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => void;
}

function OtherTypeModal({ visible, initialValue, onClose, onSave }: OtherTypeModalProps) {
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
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.otherTypeModalContainer}>
          <View style={styles.otherTypeHeader}>
            <View style={styles.otherTypeIconCircle}>
              <Ionicons name="help-circle" size={responsiveSize(24, 20, 28)} color="#FF8C00" />
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
              <Ionicons name="checkmark" size={responsiveSize(18, 14, 22)} color="#FFFFFF" />
              <Text style={styles.otherTypeConfirmText}>Save Type</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function IncidentReportPage({
  onClose,
  onSubmit,
  onAuthRequired
}: IncidentReportPageProps) {
  const [selectedIncident, setSelectedIncident] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState<LocationData | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedReport, setSubmittedReport] = useState<any>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [tempLocation, setTempLocation] = useState<LocationData | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [userData, setUserData] = useState<any>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [showOtherTypeModal, setShowOtherTypeModal] = useState(false);
  const [otherSpecificType, setOtherSpecificType] = useState('');

  const [casualties, setCasualties] = useState({
    injured: '0',
    fatalities: '0',
    trapped: '0',
  });

  const incidentTypes = incidentService.getIncidentTypes();
  const auth = getAuth();
  const locationRequestedRef = useRef(false); // ✅ Prevent duplicate requests

  useEffect(() => {
    let isMounted = true;
    let authUnsubscribe: (() => void) | null = null;

    const checkAuth = async () => {
      try {
        const cachedUserData = await AsyncStorage.getItem('userData');
        const sessionActive = await AsyncStorage.getItem('sessionActive');

        if (sessionActive === 'true' && cachedUserData) {
          try {
            const parsedData = JSON.parse(cachedUserData);
            setUserData(parsedData);
            setIsAuthenticated(true);
            setCheckingAuth(false);

            if (parsedData.firstName && parsedData.lastName) {
              setFullName(`${parsedData.firstName} ${parsedData.lastName}`);
            } else if (parsedData.firstName) {
              setFullName(parsedData.firstName);
            }
            if (parsedData.mobileNumber) {
              setPhoneNumber(parsedData.mobileNumber);
            }

            // ✅ AUTO-DETECT LOCATION
            requestAutoLocation();
            initializePermissions();
            console.log('✅ Session restored from cache in IncidentReportPage');
            return;
          } catch (e) {
            console.error('Error parsing cached user data:', e);
          }
        }

        const currentUser = auth.currentUser;
        if (currentUser) {
          setIsAuthenticated(true);
          setCheckingAuth(false);
          await fetchUserData(currentUser.uid);
          requestAutoLocation();
          initializePermissions();
          return;
        }

        authUnsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return;

          if (user) {
            setIsAuthenticated(true);
            setCheckingAuth(false);
            await fetchUserData(user.uid);
            requestAutoLocation();
            initializePermissions();
          } else {
            const cachedData = await AsyncStorage.getItem('userData');
            if (cachedData) {
              try {
                const parsedData = JSON.parse(cachedData);
                setUserData(parsedData);
                setIsAuthenticated(true);
                setCheckingAuth(false);

                if (parsedData.firstName && parsedData.lastName) {
                  setFullName(`${parsedData.firstName} ${parsedData.lastName}`);
                }
                if (parsedData.mobileNumber) {
                  setPhoneNumber(parsedData.mobileNumber);
                }
                requestAutoLocation();
                console.log('✅ Using cached session data as fallback');
              } catch (e) {
                setIsAuthenticated(false);
                setCheckingAuth(false);
              }
            } else {
              setIsAuthenticated(false);
              setCheckingAuth(false);
            }
          }
        });
      } catch (error) {
        console.error('Auth check error:', error);
        setIsAuthenticated(false);
        setCheckingAuth(false);
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
      if (authUnsubscribe) authUnsubscribe();
    };
  }, []);

  const fetchUserData = async (uid: string) => {
    try {
      const userDoc = await getDoc(doc(firestore, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);

        await AsyncStorage.setItem('userData', JSON.stringify(data));
        await AsyncStorage.setItem('sessionActive', 'true');

        if (data.firstName && data.lastName) {
          setFullName(`${data.firstName} ${data.lastName}`);
        } else if (data.firstName) {
          setFullName(data.firstName);
        } else if (data.lastName) {
          setFullName(data.lastName);
        }
        if (data.mobileNumber) {
          setPhoneNumber(data.mobileNumber);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const initializePermissions = async () => {
    if (Platform.OS !== 'web') {
      await incidentService.requestGalleryPermissions();
    }
  };

  // ============================================================
  // ✅ REQUEST LOCATION PERMISSIONS FIRST, THEN GET LOCATION
  // ============================================================
  const requestAutoLocation = async () => {
    if (locationRequestedRef.current) return;
    locationRequestedRef.current = true;

    setIsGettingLocation(true);

    try {
      // 1. Ask for location permission explicitly (Android/iOS)
      if (Platform.OS !== 'web') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        console.log('📍 Location permission status:', status);

        if (status !== 'granted') {
          setIsGettingLocation(false);
          Alert.alert(
            'Location Permission Needed',
            'Please allow location access so we can auto-detect where the emergency is.',
            [{ text: 'OK' }]
          );
          return;
        }
      }

      // 2. Small delay to let GPS warm up after permission grant
      await new Promise((r) => setTimeout(r, 600));

      // 3. Try to get location up to 3 times
      let locationData: LocationData | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`📍 Location attempt ${attempt}...`);
          locationData = await incidentService.getCurrentLocation();
          if (locationData && locationData.address) {
            console.log('✅ Location detected:', locationData.address);
            break;
          }
        } catch (err) {
          console.warn(`Location attempt ${attempt} failed:`, err);
        }
        await new Promise((r) => setTimeout(r, 800));
      }

      if (locationData) {
        setLocation(locationData.address);
        setLocationDetails(locationData);
        setTempLocation(locationData);
      } else {
        // Allow retry on next mount
        locationRequestedRef.current = false;
        console.warn('❌ Could not auto-detect location after 3 attempts');
      }
    } catch (error) {
      console.error('Auto-location error:', error);
      locationRequestedRef.current = false;
    } finally {
      setIsGettingLocation(false);
    }
  };

  const getCurrentLocation = async () => {
    // Manual trigger (used when user taps the location field after a failure)
    locationRequestedRef.current = false;
    await requestAutoLocation();
  };

  const openMapForConfirmation = () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to confirm your location.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => {
              if (onAuthRequired) onAuthRequired();
              onClose();
            },
          },
        ]
      );
      return;
    }

    if (locationDetails || tempLocation) {
      setShowMapModal(true);
    } else {
      // Try again, then open the map
      getCurrentLocation().then(() => {
        setTimeout(() => setShowMapModal(true), 300);
      });
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

  const handleCasualtyInput = (
    type: 'injured' | 'fatalities' | 'trapped',
    text: string
  ) => {
    const digitsOnly = text.replace(/[^0-9]/g, '');
    if (digitsOnly === '') {
      setCasualties((prev) => ({ ...prev, [type]: '' }));
      return;
    }
    const normalized = String(parseInt(digitsOnly, 10));
    setCasualties((prev) => ({ ...prev, [type]: normalized }));
  };

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

    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to submit your report.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => {
            if (onAuthRequired) onAuthRequired();
            onClose();
          },
        },
      ]);
      return;
    }

    if (selectedIncident === 'Other' && !otherSpecificType.trim()) {
      Alert.alert('Specific Type Required', 'Please specify the incident type for "Other".', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enter Now', onPress: () => setShowOtherTypeModal(true) },
      ]);
      return;
    }

    const validation = incidentService.validateReportData({
      incidentType: selectedIncident,
      fullName: fullName,
      phoneNumber: phoneNumber,
      location: location,
      description: description,
    });

    if (!validation.valid) {
      Alert.alert('Error', validation.errors.join('\n'));
      return;
    }

    setIsSubmitted(true);

    try {
      const casualtiesPayload = {
        injured: parseInt(casualties.injured, 10) || 0,
        fatalities: parseInt(casualties.fatalities, 10) || 0,
        trapped: parseInt(casualties.trapped, 10) || 0,
      };

      const incidentData = {
        incidentId: Date.now().toString(),
        timestamp: new Date().toISOString(),
        incidentType: selectedIncident,
        specificType: selectedIncident === 'Other' ? otherSpecificType.trim() : null,
        reporter: {
          fullName: fullName,
          phoneNumber: phoneNumber,
        },
        location: locationDetails || {
          address: location,
          isManual: true,
        },
        description: description.trim(),
        casualties: casualtiesPayload,
        status: 'submitted' as const,
        submittedAt: new Date().toLocaleString(),
      };

      const result = await incidentService.submitIncidentReport(incidentData, image);

      const reportData = {
        ...incidentData,
        photoUrl: result.photoUrl,
        hasPhoto: !!result.photoUrl,
        firebaseId: result.firebaseId,
      };

      setSubmittedReport(reportData);
      setShowSuccessModal(true);

      onSubmit(reportData);

      if (selectedIncident === 'Medical') {
        setTimeout(() => {
          Alert.alert(
            '🚨 Medical Emergency',
            'Emergency responders have been automatically dispatched to your location.',
            [{ text: 'OK' }]
          );
        }, 500);
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      setIsSubmitted(false);

      let errorMessage = 'Failed to submit report. Please try again.';

      if (error.message) {
        if (error.message.includes('sign in') || error.message.includes('authenticated')) {
          errorMessage = 'Please sign in to submit a report.';
          if (onAuthRequired) {
            setTimeout(() => {
              onAuthRequired();
              onClose();
            }, 1000);
          }
        } else if (
          error.message.includes('permission-denied') ||
          error.message.includes('permissions denied')
        ) {
          errorMessage = 'You do not have permission to submit a report.';
        } else if (error.message.includes('unavailable')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert('Error', errorMessage);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    onClose();
  };

  const handleIncidentSelect = (typeName: string, index: number) => {
    setSelectedIncident(typeName);
    setSelectedIndex(index);

    if (typeName === 'Other') {
      setShowOtherTypeModal(true);
    }
  };

  if (checkingAuth) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#B00000" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

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
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{
                html: buildLocationMapHTML(
                  tempLocation.coordinates.latitude,
                  tempLocation.coordinates.longitude,
                  tempLocation.address || 'Selected Location'
                ),
              }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scrollEnabled={false}
              nestedScrollEnabled
              onMessage={(event) => {
                try {
                  const msg = JSON.parse(event.nativeEvent.data);
                  if (msg.type === 'LOCATION_CHANGED') {
                    setTempLocation((prev) =>
                      prev
                        ? {
                            ...prev,
                            coordinates: {
                              latitude: msg.latitude,
                              longitude: msg.longitude,
                            },
                            latitude: msg.latitude,
                            longitude: msg.longitude,
                            address: msg.address || prev.address,
                          }
                        : ({
                            address: msg.address || 'Selected Location',
                            coordinates: {
                              latitude: msg.latitude,
                              longitude: msg.longitude,
                            },
                            latitude: msg.latitude,
                            longitude: msg.longitude,
                          } as any)
                    );
                  }
                } catch {}
              }}
              renderLoading={() => (
                <View style={styles.mapLoadingOverlay}>
                  <ActivityIndicator size="large" color="#FF4444" />
                  <Text style={styles.mapLoadingText}>Loading map...</Text>
                </View>
              )}
            />
          )}
        </View>

        <View style={styles.mapInfoContainer}>
          <Ionicons name="location-outline" size={responsiveSize(20, 16, 24)} color="#FF4444" />
          <Text style={styles.mapAddressText}>
            {tempLocation?.address || 'Drag the pin or tap the map to set your location'}
          </Text>
        </View>

        <View style={styles.mapInstructions}>
          <Ionicons name="information-circle-outline" size={responsiveSize(16, 14, 20)} color="#94A3B8" />
          <Text style={styles.mapInstructionText}>
            Drag the pin or tap anywhere on the map to change your location
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
              Incident Type:{' '}
              {submittedReport?.incidentType === 'Other'
                ? 'Others'
                : submittedReport?.incidentType}
            </Text>
            {submittedReport?.incidentType === 'Other' && submittedReport?.specificType && (
              <Text style={styles.modalDetailText}>
                Specific Type: {submittedReport.specificType}
              </Text>
            )}
            <Text style={styles.modalDetailText}>
              Location: {submittedReport?.location?.address}
            </Text>
            <Text style={styles.modalDetailText}>
              Reporter: {submittedReport?.reporter?.fullName}
            </Text>
            <Text style={styles.modalDetailText}>
              Phone: {submittedReport?.reporter?.phoneNumber}
            </Text>
          </View>
          <TouchableOpacity style={styles.modalButton} onPress={handleCloseModal}>
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
        {!isAuthenticated && (
          <View style={styles.authWarning}>
            <Ionicons name="warning" size={responsiveSize(16, 14, 20)} color="#FF8C00" />
            <Text style={styles.authWarningText}>Please sign in to submit a report</Text>
          </View>
        )}
        {isAuthenticated && userData && (
          <View style={styles.authSuccess}>
            <Ionicons name="checkmark-circle" size={responsiveSize(16, 14, 20)} color="#4CAF50" />
            <Text style={styles.authSuccessText}>
              Signed in as {userData.firstName || 'User'}
            </Text>
          </View>
        )}
      </View>

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
                    { backgroundColor: isSelected ? type.solidBg : '#1A1A1A' },
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
                      size={responsiveSize(28, 22, 33)}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text
                    style={[
                      styles.incidentButtonText,
                      isSelected && { color: '#FFFFFF', fontWeight: '600' },
                    ]}
                  >
                    {type.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedIncident === 'Other' && otherSpecificType.trim().length > 0 && (
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Casualties</Text>
          <View style={styles.casualtiesContainer}>
            <View style={styles.casualtyCard}>
              <View style={[styles.casualtyIconContainer, { backgroundColor: '#FF4444' }]}>
                <Ionicons name="medical" size={responsiveSize(18, 14, 22)} color="#FFFFFF" />
              </View>
              <Text style={styles.casualtyLabel}>Injured</Text>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={[styles.counterButton, !isAuthenticated && styles.counterButtonDisabled]}
                  onPress={() => handleCasualtyChange('injured', false)}
                  disabled={!isAuthenticated}
                >
                  <Ionicons
                    name="remove"
                    size={responsiveSize(14, 12, 16)}
                    color={isAuthenticated ? '#94A3B8' : '#444'}
                  />
                </TouchableOpacity>
                <TextInput
                  style={[styles.counterNumberInput, !isAuthenticated && styles.textDisabled]}
                  value={casualties.injured}
                  onChangeText={(text) => handleCasualtyInput('injured', text)}
                  onBlur={() => handleCasualtyBlur('injured')}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  textAlign="center"
                  editable={isAuthenticated}
                />
                <TouchableOpacity
                  style={[styles.counterButton, !isAuthenticated && styles.counterButtonDisabled]}
                  onPress={() => handleCasualtyChange('injured', true)}
                  disabled={!isAuthenticated}
                >
                  <Ionicons
                    name="add"
                    size={responsiveSize(14, 12, 16)}
                    color={isAuthenticated ? '#94A3B8' : '#444'}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.casualtyCard}>
              <View style={[styles.casualtyIconContainer, { backgroundColor: '#8B0000' }]}>
                <Ionicons name="alert-circle" size={responsiveSize(18, 14, 22)} color="#FFFFFF" />
              </View>
              <Text style={styles.casualtyLabel}>Fatalities</Text>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={[styles.counterButton, !isAuthenticated && styles.counterButtonDisabled]}
                  onPress={() => handleCasualtyChange('fatalities', false)}
                  disabled={!isAuthenticated}
                >
                  <Ionicons
                    name="remove"
                    size={responsiveSize(14, 12, 16)}
                    color={isAuthenticated ? '#94A3B8' : '#444'}
                  />
                </TouchableOpacity>
                <TextInput
                  style={[styles.counterNumberInput, !isAuthenticated && styles.textDisabled]}
                  value={casualties.fatalities}
                  onChangeText={(text) => handleCasualtyInput('fatalities', text)}
                  onBlur={() => handleCasualtyBlur('fatalities')}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  textAlign="center"
                  editable={isAuthenticated}
                />
                <TouchableOpacity
                  style={[styles.counterButton, !isAuthenticated && styles.counterButtonDisabled]}
                  onPress={() => handleCasualtyChange('fatalities', true)}
                  disabled={!isAuthenticated}
                >
                  <Ionicons
                    name="add"
                    size={responsiveSize(14, 12, 16)}
                    color={isAuthenticated ? '#94A3B8' : '#444'}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.casualtyCard}>
              <View style={[styles.casualtyIconContainer, { backgroundColor: '#6B7280' }]}>
                <Ionicons name="people" size={responsiveSize(18, 14, 22)} color="#FFFFFF" />
              </View>
              <Text style={styles.casualtyLabel}>Trapped</Text>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={[styles.counterButton, !isAuthenticated && styles.counterButtonDisabled]}
                  onPress={() => handleCasualtyChange('trapped', false)}
                  disabled={!isAuthenticated}
                >
                  <Ionicons
                    name="remove"
                    size={responsiveSize(14, 12, 16)}
                    color={isAuthenticated ? '#94A3B8' : '#444'}
                  />
                </TouchableOpacity>
                <TextInput
                  style={[styles.counterNumberInput, !isAuthenticated && styles.textDisabled]}
                  value={casualties.trapped}
                  onChangeText={(text) => handleCasualtyInput('trapped', text)}
                  onBlur={() => handleCasualtyBlur('trapped')}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectTextOnFocus
                  textAlign="center"
                  editable={isAuthenticated}
                />
                <TouchableOpacity
                  style={[styles.counterButton, !isAuthenticated && styles.counterButtonDisabled]}
                  onPress={() => handleCasualtyChange('trapped', true)}
                  disabled={!isAuthenticated}
                >
                  <Ionicons
                    name="add"
                    size={responsiveSize(14, 12, 16)}
                    color={isAuthenticated ? '#94A3B8' : '#444'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Your Location (Auto-detected)</Text>
          <TouchableOpacity
            style={[styles.inputContainer, !isAuthenticated && styles.inputContainerDisabled]}
            onPress={openMapForConfirmation}
            activeOpacity={0.8}
          >
            <Ionicons
              name="location-outline"
              size={responsiveSize(20, 16, 24)}
              color={isAuthenticated ? '#FF4444' : '#666'}
              style={styles.inputIcon}
            />
            <Text style={[styles.locationText, !isAuthenticated && styles.textDisabled]}>
              {isGettingLocation
                ? 'Auto-detecting your location...'
                : location
                ? location
                : isAuthenticated
                ? 'Auto-detecting your location...'
                : 'Sign in to access location'}
            </Text>
            {isAuthenticated && (
              <Ionicons name="chevron-forward" size={responsiveSize(20, 16, 24)} color="#666" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Your Full Name</Text>
          <View style={[styles.inputContainer, !isAuthenticated && styles.inputContainerDisabled]}>
            <Ionicons
              name="person-outline"
              size={responsiveSize(20, 16, 24)}
              color={isAuthenticated ? '#FF4444' : '#666'}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.phoneInput, !isAuthenticated && styles.textDisabled]}
              placeholder={
                isAuthenticated ? 'Enter your full name' : 'Sign in to fill automatically'
              }
              placeholderTextColor="#666"
              value={fullName}
              onChangeText={setFullName}
              editable={isAuthenticated}
            />
          </View>
          {isAuthenticated && userData && userData.firstName && (
            <Text style={styles.hintText}>✓ Auto-filled from your profile</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📱 Your Mobile Number</Text>
          <View style={[styles.inputContainer, !isAuthenticated && styles.inputContainerDisabled]}>
            <Ionicons
              name="call-outline"
              size={responsiveSize(20, 16, 24)}
              color={isAuthenticated ? '#FF4444' : '#666'}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.phoneInput, !isAuthenticated && styles.textDisabled]}
              placeholder={
                isAuthenticated ? 'Enter your mobile number' : 'Sign in to fill automatically'
              }
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              maxLength={10}
              editable={isAuthenticated}
            />
          </View>
          {isAuthenticated && userData && userData.mobileNumber && (
            <Text style={styles.hintText}>✓ Auto-filled from your profile</Text>
          )}
        </View>

        <View style={styles.emergencyNote}>
          <Ionicons name="shield-checkmark" size={responsiveSize(16, 14, 20)} color="#4CAF50" />
          <Text style={styles.emergencyNoteText}>
            For emergencies, responders will be dispatched immediately
          </Text>
        </View>
      </ScrollView>

      <View style={styles.stickyFooter}>
        {isAuthenticated ? (
          <TouchableOpacity
            style={[styles.submitButton, isSubmitted && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitted}
          >
            <Ionicons name="send" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
            <Text style={styles.submitButtonText}>
              {isSubmitted ? 'REPORT SENT ✓' : 'SUBMIT EMERGENCY REPORT'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => {
              if (onAuthRequired) onAuthRequired();
              onClose();
            }}
          >
            <Ionicons name="log-in" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
            <Text style={styles.signInButtonText}>SIGN IN TO SUBMIT REPORT</Text>
          </TouchableOpacity>
        )}
      </View>

      <LocationMapModal />
      <SuccessModal />
      <OtherTypeModal
        visible={showOtherTypeModal}
        initialValue={otherSpecificType}
        onClose={() => setShowOtherTypeModal(false)}
        onSave={(value) => {
          setOtherSpecificType(value);
          setShowOtherTypeModal(false);
          Alert.alert('Specific Type Saved', `Incident Type: Others\nSpecific Type: ${value}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  loadingText: {
    color: '#94A3B8',
    marginTop: responsiveSpacing(12, 8, 16),
    fontSize: responsiveSize(14, 12, 16),
  },
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
  authWarning: {
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
  authWarningText: {
    color: '#FF8C00',
    fontSize: responsiveSize(13, 11, 16),
    fontWeight: '500',
  },
  authSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    marginHorizontal: responsiveSpacing(20, 14, 26),
    marginTop: responsiveSpacing(10, 8, 14),
    paddingHorizontal: responsiveSpacing(12, 10, 16),
    paddingVertical: responsiveSpacing(6, 4, 8),
    borderRadius: responsiveSize(8, 6, 10),
    gap: responsiveSpacing(8, 6, 12),
  },
  authSuccessText: {
    color: '#4CAF50',
    fontSize: responsiveSize(13, 11, 16),
    fontWeight: '500',
  },
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  incidentButtonSelected: { borderWidth: 2, borderColor: 'black' },
  incidentIconContainer: {
    width: responsiveSize(56, 44, 66),
    height: responsiveSize(56, 44, 66),
    borderRadius: responsiveSize(28, 22, 33),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  incidentButtonText: {
    fontSize: responsiveSize(13, 11, 16),
    fontWeight: '500',
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
  inputContainerDisabled: { opacity: 0.5 },
  inputIcon: { marginRight: responsiveSpacing(12, 8, 16) },
  phoneInput: {
    flex: 1,
    fontSize: responsiveSize(15, 13, 18),
    color: '#FFFFFF',
  },
  locationText: {
    flex: 1,
    fontSize: responsiveSize(14, 12, 17),
    color: '#94A3B8',
  },
  hintText: {
    fontSize: responsiveSize(11, 10, 14),
    color: '#4CAF50',
    marginTop: responsiveSpacing(6, 4, 8),
    marginLeft: responsiveSpacing(4, 2, 6),
  },
  textDisabled: { color: '#444' },
  descriptionContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(14, 10, 18),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    paddingVertical: responsiveSpacing(12, 8, 16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  descriptionInput: {
    fontSize: responsiveSize(14, 12, 17),
    color: '#FFFFFF',
    minHeight: responsiveSize(120, 90, 150),
    textAlignVertical: 'top',
  },
  stickyFooter: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    paddingTop: responsiveSpacing(12, 8, 16),
    paddingBottom:
      Platform.OS === 'ios' ? responsiveSpacing(28, 22, 34) : responsiveSpacing(16, 12, 20),
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
  signInButton: {
    backgroundColor: '#2A2A2A',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(16, 12, 20),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: responsiveSpacing(8, 6, 12),
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  signInButtonText: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  emergencyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    paddingVertical: responsiveSpacing(20, 14, 26),
  },
  emergencyNoteText: {
    fontSize: responsiveSize(12, 10, 14),
    color: '#666',
  },
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
  mapModalTitle: {
    fontSize: responsiveSize(18, 15, 22),
    fontWeight: '600',
    color: '#FFFFFF',
  },
  mapContainer: { height: height * 0.5, width: width },
  map: { width: '100%', height: '100%' },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
  },
  mapLoadingText: {
    color: '#94A3B8',
    marginTop: responsiveSpacing(8, 6, 12),
    fontSize: responsiveSize(12, 10, 14),
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
  mapAddressText: {
    flex: 1,
    fontSize: responsiveSize(14, 12, 17),
    color: '#FFFFFF',
  },
  mapInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    marginBottom: responsiveSpacing(20, 14, 26),
  },
  mapInstructionText: {
    fontSize: responsiveSize(12, 10, 14),
    color: '#94A3B8',
  },
  mapConfirmButton: {
    backgroundColor: '#4CAF50',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(16, 12, 20),
    marginHorizontal: responsiveSpacing(20, 14, 26),
    alignItems: 'center',
  },
  mapConfirmButtonText: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '600',
    color: '#FFFFFF',
  },
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
  modalWarning: {
    fontSize: responsiveSize(13, 11, 16),
    color: '#FF4444',
    fontWeight: '600',
  },
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
  modalButtonText: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '600',
    color: '#FFFFFF',
  },
  uploadPlaceholder: {
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(14, 10, 18),
    padding: responsiveSpacing(24, 18, 32),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
    minHeight: responsiveSize(120, 90, 150),
  },
  uploadPlaceholderDisabled: {
    borderColor: '#2A2A2A',
    backgroundColor: '#111111',
  },
  uploadPlaceholderText: {
    color: '#94A3B8',
    fontSize: responsiveSize(14, 12, 17),
    marginTop: responsiveSpacing(8, 6, 12),
  },
  uploadPlaceholderSubtext: {
    color: '#666',
    fontSize: responsiveSize(12, 10, 14),
    marginTop: responsiveSpacing(4, 2, 6),
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: responsiveSize(14, 10, 18),
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  imagePreview: {
    width: '100%',
    height: responsiveSize(200, 150, 250),
    borderRadius: responsiveSize(14, 10, 18),
  },
  imageActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: responsiveSpacing(12, 8, 16),
    padding: responsiveSpacing(12, 8, 16),
    backgroundColor: '#1A1A1A',
  },
  imageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    paddingVertical: responsiveSpacing(8, 6, 10),
    borderRadius: responsiveSize(8, 6, 10),
  },
  replaceButton: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  removeButton: { backgroundColor: 'rgba(255, 68, 68, 0.1)' },
  imageActionText: {
    fontSize: responsiveSize(14, 12, 17),
    color: '#FFFFFF',
  },
  removeText: { color: '#FF4444' },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: responsiveSize(14, 10, 18),
  },
  uploadingText: {
    color: '#FFFFFF',
    marginTop: responsiveSpacing(8, 6, 12),
    fontSize: responsiveSize(14, 12, 17),
    fontWeight: '500',
  },
  imageOptionsContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(20, 16, 24),
    padding: responsiveSpacing(24, 18, 32),
    width: '85%',
  },
  imageOptionsTitle: {
    fontSize: responsiveSize(18, 15, 22),
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: responsiveSpacing(20, 14, 26),
  },
  imageOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(12, 8, 16),
    paddingVertical: responsiveSpacing(14, 10, 18),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    borderRadius: responsiveSize(12, 8, 16),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: responsiveSpacing(8, 6, 12),
  },
  imageOptionText: {
    fontSize: responsiveSize(16, 14, 20),
    color: '#FFFFFF',
  },
  imageOptionCancel: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    marginTop: responsiveSpacing(8, 6, 12),
  },
  imageOptionCancelText: {
    fontSize: responsiveSize(16, 14, 20),
    color: '#FF4444',
    textAlign: 'center',
    fontWeight: '600',
  },
  casualtiesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: responsiveSpacing(10, 6, 14),
  },
  casualtyCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(12, 8, 16),
    paddingVertical: responsiveSpacing(14, 10, 18),
    paddingHorizontal: responsiveSpacing(8, 6, 12),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minHeight: responsiveSize(100, 80, 120),
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
    fontSize: responsiveSize(10, 9, 12),
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
    justifyContent: 'center',
    gap: responsiveSpacing(8, 6, 12),
    width: '100%',
    paddingHorizontal: responsiveSpacing(2, 0, 4),
  },
  counterButton: {
    width: responsiveSize(24, 20, 28),
    height: responsiveSize(24, 20, 28),
    borderRadius: responsiveSize(12, 10, 14),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterButtonDisabled: {
    borderColor: '#333',
    opacity: 0.5,
  },
  counterNumber: {
    fontSize: responsiveSize(18, 15, 22),
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: responsiveSize(20, 16, 24),
    textAlign: 'center',
  },
  counterNumberInput: {
    fontSize: responsiveSize(18, 15, 22),
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: responsiveSize(36, 30, 42),
    maxWidth: responsiveSize(60, 50, 70),
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: responsiveSpacing(4, 2, 6),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
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
  otherTypeConfirmBtn: { backgroundColor: '#4CAF50' },
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
});
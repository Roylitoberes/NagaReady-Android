// components/TrackResponder.tsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { incidentService } from '../services/incidentService';
import { firestore } from '../services/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

const { width, height } = Dimensions.get('window');

// Design tokens (shared with NotificationsPage and TrackingPage)
const COLORS = {
  bg: '#140808',
  surface: '#1C0D0D',
  surfaceRaised: '#271212',
  textPrimary: '#F8F4F4',
  textSecondary: 'rgba(248, 244, 244, 0.68)',
  textMuted: 'rgba(248, 244, 244, 0.42)',
  accent: '#FF4444',
  success: '#4CAF50',
  info: '#2196F3',
};

interface IncidentData {
  id: string;
  reportNumber: string;
  incidentType: string;
  location: string;
  status: 'submitted' | 'dispatched' | 'enroute' | 'arrived' | 'resolved';
  reportedTime: string;
  validatedTime: string;
  enRouteTime: string;
  arrivedTime: string;
  resolvedTime: string;
  responder: string;
  responderPhoto?: string | null;
  eta: string;
  distance: string;
  description?: string;
  reporter?: any;
  photoUrl?: string | null;
  hasPhoto?: boolean;
  statusLabel?: string;
  queueStatus?: string;
  latitude?: number;
  longitude?: number;
  casualties?: { injured: number; fatalities: number; trapped: number };
}

interface ResponderTracking {
  responderId: string;
  responderName: string;
  responderPhoto?: string | null;
  lat: number;
  lng: number;
  status: string;
  updatedAt?: any;
  acceptedAt?: any;
  arrivedAt?: any;
  hasRealGps?: boolean;
}

interface PublishedRoute {
  points: [number, number][];
  distanceText: string;
  etaText: string;
  distanceKm: number;
  etaMinutes: number;
  isAssigned: boolean;
  cleared: boolean;
}

interface TrackResponderProps {
  incidentId?: string;
  onClose: () => void;
  onNavigateToTab?: (tab: string) => void;
  onInteractionStateChange?: (interacting: boolean) => void;
}

const DEFAULT_LAT = 10.2085;
const DEFAULT_LNG = 123.7584;

type MapStyle = 'satellite' | 'streets';

const STATUS_RANK: Record<string, number> = {
  submitted: 0,
  dispatched: 1,
  enroute: 2,
  arrived: 3,
  resolved: 4,
};

const rankOf = (s?: string) =>
  s && s in STATUS_RANK ? STATUS_RANK[s] : -1;

// =============================================================
// ✅ MODULE-LEVEL CACHE
// The route published by Flutter's MapPage is remembered here,
// so a re-mounted TrackResponder can show it IMMEDIATELY.
// Keyed by incidentId.
// =============================================================
const publishedRouteCache: Record<string, PublishedRoute> = {};

export default function TrackResponder({
  incidentId,
  onClose,
  onNavigateToTab,
  onInteractionStateChange,
}: TrackResponderProps) {
  const [loading, setLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<IncidentData | null>(null);
  const [responderTracking, setResponderTracking] =
    useState<ResponderTracking | null>(null);
  const [verifiedSteps, setVerifiedSteps] = useState<Set<string>>(new Set());
  const [verifyingStep, setVerifyingStep] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('satellite');
  const [routeInfo, setRouteInfo] = useState<{
    distance: string;
    eta: string;
  }>({ distance: '--', eta: '--' });

  // ✅ Seeded from the module cache so re-mounts never show a stale OSRM route
  const [publishedRoute, setPublishedRouteState] = useState<PublishedRoute | null>(
    incidentId ? publishedRouteCache[incidentId] ?? null : null
  );

  // ✅ Bump on every Firestore snapshot so the inject effect always fires
  const [routeNonce, setRouteNonce] = useState(0);

  // Track whether the WebView has finished loading (so we can safely inject)
  const webViewReadyRef = useRef(false);
  // Track what we last injected so we don't re-inject identical payloads
  const lastInjectedSigRef = useRef<string>('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const webViewRef = useRef<WebView>(null);

  const latestRef = useRef<IncidentData | null>(null);
  useEffect(() => {
    latestRef.current = trackingData;
  }, [trackingData]);

  // Wrapper so we also write to the module cache
  const setPublishedRoute = (
    route: PublishedRoute | null,
    key?: string
  ) => {
    const id = key ?? incidentId;
    if (id) {
      if (route) publishedRouteCache[id] = route;
      else delete publishedRouteCache[id];
    }
    setPublishedRouteState(route);
  };

  // ─────────────────────────────────────────────────────────────
  // PERSIST: write highest status to incident_progress
  // ─────────────────────────────────────────────────────────────
  const persistProgress = async (data: IncidentData | null) => {
    if (!incidentId || !data) return;
    try {
      const ref = doc(firestore, 'incident_progress', incidentId);
      const snap = await getDoc(ref);
      const existingRank = snap.exists()
        ? rankOf(snap.data()?.status)
        : -1;
      const newRank = rankOf(data.status);

      if (newRank <= existingRank) return;

      await setDoc(
        ref,
        {
          incidentId,
          status: data.status,
          statusLabel: data.statusLabel || data.status,
          reportedTime: data.reportedTime || '--:--',
          validatedTime: data.validatedTime || '--:--',
          enRouteTime: data.enRouteTime || '--:--',
          arrivedTime: data.arrivedTime || '--:--',
          resolvedTime: data.resolvedTime || '--:--',
          responder: data.responder || '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.log('persistProgress error:', e);
    }
  };

  const applyProgressSafely = (
    prev: IncidentData,
    patch: Partial<IncidentData>
  ): IncidentData => {
    const prevRank = rankOf(prev.status);
    const patchRank = patch.status ? rankOf(patch.status) : -1;

    if (patchRank < prevRank) {
      return {
        ...prev,
        ...patch,
        status: prev.status,
        statusLabel: prev.statusLabel,
        reportedTime: prev.reportedTime || patch.reportedTime || '--:--',
        validatedTime: prev.validatedTime || patch.validatedTime || '--:--',
        enRouteTime: prev.enRouteTime || patch.enRouteTime || '--:--',
        arrivedTime: prev.arrivedTime || patch.arrivedTime || '--:--',
        resolvedTime: prev.resolvedTime || patch.resolvedTime || '--:--',
      };
    }
    return { ...prev, ...patch };
  };

  // ─────────────────────────────────────────────────────────────
  // Build map HTML
  // ─────────────────────────────────────────────────────────────
  const buildMapHTML = (
    incidentLat: number,
    incidentLng: number,
    incidentLabel: string,
    responder: ResponderTracking | null
  ) => {
    const safeLabel = (incidentLabel || 'Incident Location').replace(
      /'/g,
      "\\'"
    );
    const responderLat = responder?.lat ?? incidentLat;
    const responderLng = responder?.lng ?? incidentLng;
    const hasResponder =
      !!responder && !!responder.hasRealGps && !!responder.lat && !!responder.lng;
    const responderName = (responder?.responderName || 'Responder').replace(
      /'/g,
      "\\'"
    );
    const responderPhoto = responder?.responderPhoto || '';

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
    .responder-marker {
      width:38px; height:38px; border-radius:50%;
      background:#1479FF; border:3px solid white;
      box-shadow:0 0 0 8px rgba(20,121,255,0.25), 0 3px 8px rgba(0,0,0,0.4);
      display:flex; align-items:center; justify-content:center;
      animation: respPulse 2s infinite;
    }
    .resp-dot { width:12px; height:12px; border-radius:50%; background:#FFFFFF; display:block; }
    @keyframes respPulse {
      0% { box-shadow:0 0 0 0 rgba(20,121,255,0.6), 0 3px 8px rgba(0,0,0,0.4); }
      70% { box-shadow:0 0 0 20px rgba(20,121,255,0), 0 3px 8px rgba(0,0,0,0.4); }
      100% { box-shadow:0 0 0 0 rgba(20,121,255,0), 0 3px 8px rgba(0,0,0,0.4); }
    }
    .leaflet-popup-content-wrapper { background:#FFF; color:#1A1A1A; border-radius:10px; font-size:12px; }
    .leaflet-popup-tip { background:#FFF; }
    .leaflet-container { background:#1A1A2E; }
    .resp-photo { width:34px; height:34px; border-radius:50%; object-fit:cover; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const INCIDENT_LAT = ${incidentLat};
    const INCIDENT_LNG = ${incidentLng};
    let RESPONDER_LAT = ${responderLat};
    let RESPONDER_LNG = ${responderLng};
    const HAS_RESPONDER = ${hasResponder};

    const map = L.map('map', {
      zoomControl:false,
      attributionControl:false,
      dragging:true, touchZoom:true, scrollWheelZoom:true, tap:true
    }).setView([INCIDENT_LAT, INCIDENT_LNG], 15);

    document.addEventListener('touchmove', function(e){ e.stopPropagation(); }, { passive: false });
    document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
    document.addEventListener('gesturechange', function(e){ e.preventDefault(); });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom:19 });
    const streetsLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, subdomains:'abc' });
    const labelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom:19, pane:'shadowPane' });

    let currentStyle = 'satellite';
    satelliteLayer.addTo(map);
    labelsLayer.addTo(map);

    window.setMapStyle = function(style) {
      if (style === currentStyle) return;
      if (style === 'satellite') {
        map.removeLayer(streetsLayer);
        satelliteLayer.addTo(map);
        labelsLayer.addTo(map);
      } else {
        map.removeLayer(satelliteLayer);
        map.removeLayer(labelsLayer);
        streetsLayer.addTo(map);
      }
      currentStyle = style;
    };

    const incidentIcon = L.divIcon({ className:'', html:'<div class="incident-marker"></div>', iconSize:[22,22], iconAnchor:[11,11] });
    L.marker([INCIDENT_LAT, INCIDENT_LNG], { icon: incidentIcon })
      .addTo(map)
      .bindPopup('<b>Incident location</b><br/>${safeLabel}');

    L.circle([INCIDENT_LAT, INCIDENT_LNG], {
      color:'#FF4444', fillColor:'#FF4444', fillOpacity:0.15, radius:80, weight:2
    }).addTo(map);

    let responderMarker = null;
    ${hasResponder ? `
      const responderPhotoUrl = '${responderPhoto}';
      const responderIconHtml = responderPhotoUrl
        ? '<div class="responder-marker"><img class="resp-photo" src="' + responderPhotoUrl + '" onerror="this.style.display=\\'none\\'; this.parentNode.innerHTML=\\'<span class=resp-dot></span>\\';" /></div>'
        : '<div class="responder-marker"><span class="resp-dot"></span></div>';

      const responderIcon = L.divIcon({
        className:'',
        html: responderIconHtml,
        iconSize:[38,38],
        iconAnchor:[19,19]
      });

      responderMarker = L.marker([RESPONDER_LAT, RESPONDER_LNG], { icon: responderIcon })
        .addTo(map)
        .bindPopup('<b>${responderName}</b><br/>En route to incident');
    ` : ''}

    let routeLayer = null;
    let routeOutlineLayer = null;
    let currentRouteSig = '';

    // ✅ Flag so we NEVER draw a fallback OSRM route once a published route
    //    has been injected during this WebView session.
    let hasPublishedRoute = false;

    // ─────────────────────────────────────────────────────────────
    // ✅ Receives the Flutter-published route (via injectJavaScript)
    // ─────────────────────────────────────────────────────────────
    window.setPublishedRoute = function(payload) {
      try {
        if (!payload) {
          // No published route yet — leave fallback enabled
          return;
        }

        if (payload.cleared === true || !payload.points || payload.points.length < 2) {
          if (routeOutlineLayer) { map.removeLayer(routeOutlineLayer); routeOutlineLayer = null; }
          if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
          currentRouteSig = '';
          hasPublishedRoute = false;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'ROUTE_INFO',
              distance: 0,
              eta: 0,
              cleared: true
            }));
          }
          return;
        }

        const coords = payload.points.map(function(p) { return [p[0], p[1]]; });
        const sig = 'published|' + coords.length + '|' +
          coords[0][0].toFixed(5) + ',' + coords[0][1].toFixed(5) + '|' +
          coords[coords.length - 1][0].toFixed(5) + ',' + coords[coords.length - 1][1].toFixed(5) + '|' +
          (payload.distanceText || '') + '|' + (payload.etaText || '');

        if (sig === currentRouteSig) return;
        currentRouteSig = sig;
        hasPublishedRoute = true;

        if (routeOutlineLayer) { map.removeLayer(routeOutlineLayer); routeOutlineLayer = null; }
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }

        routeOutlineLayer = L.polyline(coords, {
          color:'#FFFFFF', weight:9, opacity:0.95,
          lineCap:'round', lineJoin:'round'
        }).addTo(map);

        routeLayer = L.polyline(coords, {
          color: payload.isAssigned ? '#0B6B43' : '#1479FF',
          weight:6, opacity:1,
          lineCap:'round', lineJoin:'round'
        }).addTo(map);

        const bounds = L.latLngBounds(coords);
        map.fitBounds(bounds, { padding:[45, 45], maxZoom:16 });

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ROUTE_INFO',
            distance: payload.distanceKm || 0,
            eta: payload.etaMinutes || 0,
            cleared: false
          }));
        }
      } catch (e) {}
    };

    // ─────────────────────────────────────────────────────────────
    // Fallback: OSRM ONLY when no published route is present.
    // ─────────────────────────────────────────────────────────────
    async function drawFallbackRoute() {
      if (!HAS_RESPONDER) return;
      if (hasPublishedRoute) return;        // ✅ never override published route
      if (currentRouteSig && currentRouteSig.indexOf('published|') === 0) return;
      try {
        const url = 'https://router.project-osrm.org/route/v1/driving/'
          + RESPONDER_LNG + ',' + RESPONDER_LAT + ';'
          + INCIDENT_LNG + ',' + INCIDENT_LAT
          + '?overview=full&geometries=geojson&steps=false';

        const res = await fetch(url);
        const data = await res.json();
        if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) return;

        const route = data.routes[0];
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const distanceKm = route.distance / 1000;
        const etaMin = Math.max(1, Math.ceil(route.duration / 60));

        if (routeOutlineLayer) { map.removeLayer(routeOutlineLayer); routeOutlineLayer = null; }
        if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }

        routeOutlineLayer = L.polyline(coords, {
          color:'#FFFFFF', weight:9, opacity:0.95,
          lineCap:'round', lineJoin:'round'
        }).addTo(map);

        routeLayer = L.polyline(coords, {
          color:'#1479FF', weight:6, opacity:1,
          lineCap:'round', lineJoin:'round'
        }).addTo(map);

        const bounds = L.latLngBounds([
          [RESPONDER_LAT, RESPONDER_LNG],
          [INCIDENT_LAT, INCIDENT_LAT]
        ]);
        map.fitBounds(bounds, { padding:[45, 45], maxZoom:16 });

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ROUTE_INFO',
            distance: distanceKm,
            eta: etaMin
          }));
        }
      } catch (e) {}
    }

    // ✅ Delay fallback so React Native has time to inject a published route
    setTimeout(drawFallbackRoute, 1500);

    window.updateResponderPosition = function(lat, lng) {
      RESPONDER_LAT = lat;
      RESPONDER_LNG = lng;
      if (!responderMarker) {
        const icon = L.divIcon({
          className:'',
          html:'<div class="responder-marker"><span class="resp-dot"></span></div>',
          iconSize:[38,38], iconAnchor:[19,19]
        });
        responderMarker = L.marker([lat, lng], { icon }).addTo(map)
          .bindPopup('<b>Responder</b><br/>En route to incident');
      } else {
        responderMarker.setLatLng([lat, lng]);
      }
      // Only redraw fallback if no published route is present.
      if (!hasPublishedRoute) {
        drawFallbackRoute();
      }
    };

    L.control.zoom({ position:'bottomright' }).addTo(map);
  </script>
</body>
</html>
    `;
  };

  // ─────────────────────────────────────────────────────────────
  // ✅ Listen to responder_routes — source of truth
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!incidentId) return;

    // Seed from cache immediately so a re-mount shows the correct route at once
    const cached = publishedRouteCache[incidentId];
    if (cached) setPublishedRouteState(cached);

    const ref = doc(firestore, 'responder_routes', incidentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setPublishedRoute(null, incidentId);
        setRouteNonce((n) => n + 1);   // ✅ NEW
        return;
      }
      const data = snap.data() || {};
      const cleared = data.cleared === true;
      const rawPoints = Array.isArray(data.points) ? data.points : [];
      const points: [number, number][] = rawPoints
        .map((p: any) => [Number(p.lat), Number(p.lng)] as [number, number])
        .filter(
          ([a, b]) =>
            Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0)
        );

      const next: PublishedRoute = {
        points,
        distanceText: (data.distanceText || '--').toString(),
        etaText: (data.etaText || '--').toString(),
        distanceKm: Number(data.distanceKm) || 0,
        etaMinutes: Number(data.etaMinutes) || 0,
        isAssigned: data.isAssigned === true,
        cleared,
      };

      setPublishedRoute(next, incidentId);
      setRouteNonce((n) => n + 1);   // ✅ NEW — force re-inject every snapshot

      if (!cleared && next.points.length >= 2) {
        setRouteInfo({
          distance:
            next.distanceKm < 1
              ? `${Math.round(next.distanceKm * 1000)} m`
              : `${next.distanceKm.toFixed(1)} km`,
          eta: `${next.etaMinutes}`,
        });
      } else {
        setRouteInfo({ distance: '--', eta: '--' });
      }
    });

    return () => unsub();
  }, [incidentId]);

  // ─────────────────────────────────────────────────────────────
  // ✅ Injection helper — same logic used on mount AND on updates
  // ─────────────────────────────────────────────────────────────
  const injectRouteIntoWebView = (route: PublishedRoute | null) => {
    if (!webViewRef.current) return;
    if (!webViewReadyRef.current) return;

    if (!route) {
      const js = `window.setPublishedRoute && window.setPublishedRoute(null); true;`;
      webViewRef.current.injectJavaScript(js);
      lastInjectedSigRef.current = '';
      return;
    }

    const payload = {
      points: route.points,
      distanceText: route.distanceText,
      etaText: route.etaText,
      distanceKm: route.distanceKm,
      etaMinutes: route.etaMinutes,
      isAssigned: route.isAssigned,
      cleared: route.cleared,
    };

    const sig = JSON.stringify([
      payload.points.length,
      payload.points[0]?.[0],
      payload.points[0]?.[1],
      payload.points[payload.points.length - 1]?.[0],
      payload.points[payload.points.length - 1]?.[1],
      payload.distanceText,
      payload.etaText,
      payload.isAssigned,
      payload.cleared,
      Math.floor(Date.now() / 20000),   // ✅ NEW — changes every 20s so a repeated
                                        //   route with identical start/end still
                                        //   triggers a fresh WebView injection
    ]);

    if (sig === lastInjectedSigRef.current) return;
    lastInjectedSigRef.current = sig;

    const js = `
      window.setPublishedRoute &&
      window.setPublishedRoute(${JSON.stringify(payload)});
      true;
    `;
    webViewRef.current.injectJavaScript(js);
  };

  // ✅ On mount: wait until the WebView has loaded, then inject
  const handleWebViewLoadEnd = () => {
    webViewReadyRef.current = true;
    // Reset the sig so the first injection always happens
    lastInjectedSigRef.current = '';
    injectRouteIntoWebView(publishedRoute);
  };

  // ✅ Inject whenever the Firestore route snapshot changes (routeNonce)
  //    OR whenever any meaningful field of publishedRoute changes.
  useEffect(() => {
    injectRouteIntoWebView(publishedRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeNonce,
    publishedRoute?.cleared,
    publishedRoute?.isAssigned,
    publishedRoute?.distanceText,
    publishedRoute?.etaText,
    publishedRoute?.points?.length,
  ]);

  // ─────────────────────────────────────────────────────────────
  // watch final_reports
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!incidentId) return;
    const ref = doc(firestore, 'final_reports', incidentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      const submittedTime =
        (typeof data.resolvedTime === 'string' && data.resolvedTime) ||
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

      setVerifiedSteps((prev) => {
        const next = new Set(prev);
        next.add('submitted');
        next.add('dispatched');
        next.add('enroute');
        return next;
      });

      setTrackingData((prev) =>
        !prev
          ? prev
          : applyProgressSafely(prev, {
              status: 'resolved',
              statusLabel: 'Resolved',
              resolvedTime:
                prev.resolvedTime && prev.resolvedTime !== '--:--'
                  ? prev.resolvedTime
                  : submittedTime,
            })
      );
    });
    return () => unsub();
  }, [incidentId]);

  // ─────────────────────────────────────────────────────────────
  // Listen to incident_progress
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!incidentId) return;
    const ref = doc(firestore, 'incident_progress', incidentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setTrackingData((prev) => {
        if (!prev) return prev;
        return applyProgressSafely(prev, {
          status: data.status ?? prev.status,
          statusLabel: data.statusLabel ?? prev.statusLabel,
          reportedTime: data.reportedTime ?? prev.reportedTime,
          validatedTime: data.validatedTime ?? prev.validatedTime,
          enRouteTime: data.enRouteTime ?? prev.enRouteTime,
          arrivedTime: data.arrivedTime ?? prev.arrivedTime,
          resolvedTime: data.resolvedTime ?? prev.resolvedTime,
          responder: data.responder ?? prev.responder,
        });
      });
    });
    return () => unsub();
  }, [incidentId]);

  // Auto-write progress whenever status advances
  useEffect(() => {
    if (!trackingData || !incidentId) return;
    persistProgress(trackingData);
  }, [trackingData?.status, incidentId]);

  // ─────────────────────────────────────────────────────────────
  // responder_tracking listener
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!incidentId) return;

    const q = query(
      collection(firestore, 'responder_tracking'),
      where('incidentId', '==', incidentId)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setResponderTracking(null);
        return;
      }

      const candidates: ResponderTracking[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const lat = data.lat ?? data.responderLat ?? null;
        const lng = data.lng ?? data.responderLng ?? null;

        const fallbackLat = latestRef.current?.latitude ?? DEFAULT_LAT;
        const fallbackLng = latestRef.current?.longitude ?? DEFAULT_LNG;

        candidates.push({
          responderId: data.responderId || '',
          responderName: data.responderName || 'Responder',
          responderPhoto: data.responderPhoto || null,
          lat: lat ?? fallbackLat,
          lng: lng ?? fallbackLng,
          status: data.status || 'enroute',
          updatedAt: data.updatedAt,
          acceptedAt: data.acceptedAt,
          arrivedAt: data.arrivedAt,
          hasRealGps: lat != null && lng != null,
        });
      });

      if (candidates.length === 0) {
        setResponderTracking(null);
        return;
      }

      let best: ResponderTracking = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        const a = best.updatedAt?.toMillis?.() ?? 0;
        const b = c.updatedAt?.toMillis?.() ?? 0;
        if (b > a) best = c;
      }

      setResponderTracking(best);

      if (
        best.status === 'enroute' ||
        best.status === 'on_scene' ||
        best.status === 'resolved'
      ) {
        const activeResponder = best;
        setVerifiedSteps((prev) => {
          const next = new Set(prev);
          next.add('submitted');
          next.add('dispatched');
          return next;
        });
        setTrackingData((prev) =>
          !prev
            ? prev
            : applyProgressSafely(prev, {
                status:
                  activeResponder.status === 'on_scene'
                    ? 'arrived'
                    : activeResponder.status === 'resolved'
                    ? 'resolved'
                    : 'enroute',
                statusLabel:
                  activeResponder.status === 'on_scene'
                    ? 'Arrived'
                    : activeResponder.status === 'resolved'
                    ? 'Resolved'
                    : 'En Route',
                responder:
                  activeResponder.responderName || prev.responder,
                responderPhoto:
                  activeResponder.responderPhoto ?? prev.responderPhoto,
                enRouteTime:
                  prev.enRouteTime && prev.enRouteTime !== '--:--'
                    ? prev.enRouteTime
                    : new Date().toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                arrivedTime:
                  activeResponder.status === 'on_scene' ||
                  activeResponder.status === 'resolved'
                    ? prev.arrivedTime && prev.arrivedTime !== '--:--'
                      ? prev.arrivedTime
                      : new Date().toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                    : prev.arrivedTime,
                resolvedTime:
                  activeResponder.status === 'resolved'
                    ? prev.resolvedTime && prev.resolvedTime !== '--:--'
                      ? prev.resolvedTime
                      : new Date().toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                    : prev.resolvedTime,
              })
        );
      }
    });

    return () => unsub();
  }, [incidentId]);

  // Inject live responder position into WebView
  useEffect(() => {
    if (!responderTracking || !webViewRef.current) return;
    if (!responderTracking.hasRealGps) return;
    if (!responderTracking.lat || !responderTracking.lng) return;
    if (!webViewReadyRef.current) return;

    const js = `
      window.updateResponderPosition &&
      window.updateResponderPosition(${responderTracking.lat}, ${responderTracking.lng});
      true;
    `;
    webViewRef.current.injectJavaScript(js);
  }, [responderTracking?.lat, responderTracking?.lng, responderTracking?.hasRealGps]);

  const mapHTML = useMemo(() => {
    const incLat = trackingData?.latitude ?? DEFAULT_LAT;
    const incLng = trackingData?.longitude ?? DEFAULT_LNG;
    const label = trackingData?.location || 'Incident Location';
    return buildMapHTML(incLat, incLng, label, responderTracking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trackingData?.latitude,
    trackingData?.longitude,
    trackingData?.location,
    !!responderTracking,
    responderTracking?.hasRealGps,
  ]);

  useEffect(() => {
    if (!webViewRef.current) return;
    if (!webViewReadyRef.current) return;
    const js = `window.setMapStyle && window.setMapStyle('${mapStyle}'); true;`;
    webViewRef.current.injectJavaScript(js);
  }, [mapStyle]);

  // ─────────────────────────────────────────────────────────────
  // incident_queue listener
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let unsubscribeQueue: (() => void) | null = null;
    if (incidentId) {
      const q = query(
        collection(firestore, 'incident_queue'),
        where('incidentId', '==', incidentId)
      );
      unsubscribeQueue = onSnapshot(q, (snapshot) => {
        snapshot.forEach((doc) => {
          const status = doc.data().status || 'review';
          setTrackingData((prev) =>
            !prev ? prev : { ...prev, queueStatus: status }
          );
          if (status === 'verified') {
            setVerifiedSteps((prev) => new Set(prev).add('submitted'));
            setTrackingData((prev) =>
              !prev
                ? prev
                : applyProgressSafely(prev, {
                    status:
                      rankOf(prev.status) < rankOf('submitted')
                        ? 'submitted'
                        : prev.status,
                    statusLabel:
                      rankOf(prev.status) < rankOf('submitted')
                        ? 'Verified'
                        : prev.statusLabel,
                  })
            );
          }
        });
      });
    }
    return () => {
      if (unsubscribeQueue) unsubscribeQueue();
    };
  }, [incidentId]);

  // ─────────────────────────────────────────────────────────────
  // incident_reports listener
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let unsubscribeReports: (() => void) | null = null;
    if (incidentId) {
      const q = query(
        collection(firestore, 'incident_reports'),
        where('incidentId', '==', incidentId)
      );
      unsubscribeReports = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) return;
        snapshot.forEach((doc) => {
          const data = doc.data();
          const status = data.status || 'submitted';
          setTrackingData((prev) => {
            if (!prev) return prev;
            const coords = {
              latitude:
                data?.location?.coordinates?.latitude ??
                data?.location?.latitude ??
                prev.latitude,
              longitude:
                data?.location?.coordinates?.longitude ??
                data?.location?.longitude ??
                prev.longitude,
            };
            if (status === 'enroute') {
              setVerifiedSteps((p) => {
                const s = new Set(p);
                s.add('submitted');
                s.add('dispatched');
                return s;
              });
              const enRouteTime =
                prev.enRouteTime && prev.enRouteTime !== '--:--'
                  ? prev.enRouteTime
                  : new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
              return applyProgressSafely(prev, {
                status: 'enroute',
                statusLabel: 'En Route',
                enRouteTime,
                description: data.description || prev.description,
                ...coords,
              });
            }
            if (status === 'dispatched') {
              return applyProgressSafely(prev, {
                status: 'dispatched',
                statusLabel: 'Dispatched',
                description: data.description || prev.description,
                ...coords,
              });
            }
            const statusInfo = incidentService.getStatusInfo(status);
            return applyProgressSafely(prev, {
              status: status as any,
              statusLabel: statusInfo.label,
              description: data.description || prev.description,
              ...coords,
            });
          });
        });
      });
    }
    return () => {
      if (unsubscribeReports) unsubscribeReports();
    };
  }, [incidentId]);

  // ─────────────────────────────────────────────────────────────
  // forwarded_incidents listener
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let unsubscribeForwarded: (() => void) | null = null;
    if (incidentId) {
      const q = query(
        collection(firestore, 'forwarded_incidents'),
        where('id', '==', incidentId)
      );
      unsubscribeForwarded = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) return;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if ((data.status || 'Waiting') === 'Dispatched') {
            setVerifiedSteps((p) => {
              const s = new Set(p);
              s.add('submitted');
              s.add('dispatched');
              return s;
            });
            setTrackingData((prev) => {
              if (!prev) return prev;
              return applyProgressSafely(prev, {
                status:
                  rankOf(prev.status) < rankOf('dispatched')
                    ? 'dispatched'
                    : prev.status,
                statusLabel:
                  rankOf(prev.status) < rankOf('dispatched')
                    ? 'Dispatched'
                    : prev.statusLabel,
                validatedTime:
                  data.forwardedTime ||
                  prev.validatedTime ||
                  new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
              });
            });
          }
        });
      });
    }
    return () => {
      if (unsubscribeForwarded) unsubscribeForwarded();
    };
  }, [incidentId]);

  // ─────────────────────────────────────────────────────────────
  // Initial fetch
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (incidentId) fetchIncidentData(incidentId);
    else {
      setTrackingData({
        id: 'demo-001',
        reportNumber: '2024-001',
        incidentType: 'Medical Emergency',
        location: 'Subway Station - Platform 2',
        status: 'submitted',
        reportedTime: '9:30 AM',
        validatedTime: '--:--',
        enRouteTime: '--:--',
        arrivedTime: '--:--',
        resolvedTime: '--:--',
        responder: 'BFP Unit 1',
        eta: '~5 minutes',
        distance: '1.2 km',
        description: 'Medical emergency at subway station platform 2',
        statusLabel: 'Submitted',
        queueStatus: 'review',
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LNG,
      });
      setLoading(false);
    }
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [incidentId]);

  const fetchIncidentData = async (id: string) => {
    try {
      setLoading(true);

      let persistedProgress: any = null;
      try {
        const progressSnap = await getDoc(
          doc(firestore, 'incident_progress', id)
        );
        if (progressSnap.exists()) persistedProgress = progressSnap.data();
      } catch (e) {
        console.log('Could not load persisted progress:', e);
      }

      let finalReport: any = null;
      try {
        const finalSnap = await getDoc(doc(firestore, 'final_reports', id));
        if (finalSnap.exists()) finalReport = finalSnap.data();
      } catch (e) {
        console.log('Could not load final_reports:', e);
      }

      const queueSnapshot = await getDocs(
        query(
          collection(firestore, 'incident_queue'),
          where('incidentId', '==', id)
        )
      );
      let queueStatus = 'review';
      queueSnapshot.forEach((d) => {
        queueStatus = d.data().status || 'review';
      });

      const reportsSnapshot = await getDocs(
        query(
          collection(firestore, 'incident_reports'),
          where('incidentId', '==', id)
        )
      );
      let reportStatus = 'submitted';
      let reportData: any = null;
      reportsSnapshot.forEach((d) => {
        reportData = d.data();
        reportStatus = reportData.status || 'submitted';
      });

      const forwardedSnapshot = await getDocs(
        query(
          collection(firestore, 'forwarded_incidents'),
          where('id', '==', id)
        )
      );
      let forwardedStatus = 'Waiting';
      forwardedSnapshot.forEach((d) => {
        forwardedStatus = d.data().status || 'Waiting';
      });

      let displayStatus:
        | 'submitted'
        | 'dispatched'
        | 'enroute'
        | 'arrived'
        | 'resolved' = 'submitted';
      let displayLabel = 'Submitted';
      const initialVerified = new Set<string>();

      if (queueStatus === 'verified' || queueStatus === 'dispatched') {
        initialVerified.add('submitted');
        displayLabel = 'Verified';
      }
      if (forwardedStatus === 'Dispatched' && reportStatus !== 'enroute') {
        displayStatus = 'dispatched';
        displayLabel = 'Dispatched';
        initialVerified.add('submitted');
        initialVerified.add('dispatched');
      }
      if (reportStatus === 'enroute') {
        displayStatus = 'enroute';
        displayLabel = 'En Route';
        initialVerified.add('submitted');
        initialVerified.add('dispatched');
      }

      let reportedTime =
        reportData?.submittedAt ||
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      let validatedTime =
        queueStatus === 'verified' ||
        queueStatus === 'dispatched' ||
        forwardedStatus === 'Dispatched'
          ? new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '--:--';
      let enRouteTime =
        displayStatus === 'enroute'
          ? new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '--:--';
      let arrivedTime = '--:--';
      let resolvedTime = '--:--';
      let responderName = reportData?.responder || 'BFP Unit 1';

      if (persistedProgress) {
        const persistedRank = rankOf(persistedProgress.status);
        const liveRank = rankOf(displayStatus);

        if (persistedRank >= liveRank) {
          displayStatus = persistedProgress.status;
          displayLabel = persistedProgress.statusLabel || displayStatus;
        }

        reportedTime = persistedProgress.reportedTime || reportedTime;
        validatedTime = persistedProgress.validatedTime || validatedTime;
        enRouteTime = persistedProgress.enRouteTime || enRouteTime;
        arrivedTime = persistedProgress.arrivedTime || '--:--';
        resolvedTime = persistedProgress.resolvedTime || '--:--';
        responderName = persistedProgress.responder || responderName;

        const rankNow = rankOf(displayStatus);
        if (rankNow >= rankOf('submitted')) initialVerified.add('submitted');
        if (rankNow >= rankOf('dispatched')) initialVerified.add('dispatched');
        if (rankNow >= rankOf('enroute')) initialVerified.add('enroute');
      }

      if (finalReport) {
        const submittedTime =
          (typeof finalReport.resolvedTime === 'string' &&
            finalReport.resolvedTime) ||
          new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

        displayStatus = 'resolved';
        displayLabel = 'Resolved';
        if (!resolvedTime || resolvedTime === '--:--') {
          resolvedTime = submittedTime;
        }
        initialVerified.add('submitted');
        initialVerified.add('dispatched');
        initialVerified.add('enroute');
      }

      setVerifiedSteps(initialVerified);

      const lat =
        reportData?.location?.coordinates?.latitude ??
        reportData?.location?.latitude ??
        DEFAULT_LAT;
      const lng =
        reportData?.location?.coordinates?.longitude ??
        reportData?.location?.longitude ??
        DEFAULT_LNG;

      setTrackingData({
        id,
        reportNumber: `2024-${String(id).slice(0, 4)}`,
        incidentType: reportData?.incidentType || 'Emergency',
        location: reportData?.location?.address || 'Unknown Location',
        status: displayStatus,
        statusLabel: displayLabel,
        reportedTime,
        validatedTime,
        enRouteTime,
        arrivedTime,
        resolvedTime,
        responder: responderName,
        eta: reportData?.eta || '~5 minutes',
        distance: '1.2 km',
        description: reportData?.description || '',
        reporter: reportData?.reporter,
        photoUrl: reportData?.photoUrl,
        hasPhoto: reportData?.hasPhoto || false,
        queueStatus,
        latitude: lat,
        longitude: lng,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error fetching incident:', error);
      setLoading(false);
    }
  };

  const getStatusStep = (status: string) =>
    ['submitted', 'dispatched', 'enroute', 'arrived', 'resolved'].indexOf(
      status
    );

  const handleVerifyStep = async (stepKey: string, stepLabel: string) => {
    if (verifiedSteps.has(stepKey)) {
      Alert.alert(
        'Already Verified',
        `"${stepLabel}" has already been verified.`,
        [{ text: 'OK' }]
      );
      return;
    }
    setVerifyingStep(stepKey);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setVerifiedSteps((p) => new Set(p).add(stepKey));
      Alert.alert('Verification Successful', `"${stepLabel}" verified.`, [
        { text: 'OK' },
      ]);
    } catch {
      Alert.alert('Verification Failed', `Could not verify "${stepLabel}".`, [
        { text: 'OK' },
      ]);
    } finally {
      setVerifyingStep(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading tracking data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trackingData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={styles.errorContainer}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="alert-circle-outline" size={34} color={COLORS.accent} />
          </View>
          <Text style={styles.errorTitle}>No Data Available</Text>
          <Text style={styles.errorText}>
            Unable to load incident tracking data.
          </Text>
          <TouchableOpacity style={styles.errorButton} onPress={onClose}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const displayStatus = trackingData.status || 'submitted';
  const currentStep = getStatusStep(displayStatus);
  const statusInfo = incidentService.getStatusInfo(displayStatus);

  const timelineSteps = [
    {
      key: 'submitted',
      label: 'Report Verify',
      time: trackingData.reportedTime,
      completed: currentStep >= 0,
    },
    {
      key: 'dispatched',
      label: 'Dispatched',
      time: trackingData.validatedTime,
      completed: currentStep >= 1,
    },
    {
      key: 'enroute',
      label: 'En Route',
      time: trackingData.enRouteTime,
      completed: currentStep >= 2,
    },
    {
      key: 'arrived',
      label: 'Arrived',
      time: trackingData.arrivedTime,
      completed: currentStep >= 3,
    },
    {
      key: 'resolved',
      label: 'Resolved',
      time: trackingData.resolvedTime,
      completed: currentStep >= 4,
    },
  ];

  const renderTimelineStep = (step: any, index: number) => {
    const isCompleted = step.completed;
    const isCurrent = displayStatus === step.key;
    const isLast = index === timelineSteps.length - 1;
    const isVerified = verifiedSteps.has(step.key);
    const isVerifying = verifyingStep === step.key;

    return (
      <View key={step.key} style={styles.timelineStepContainer}>
        <View style={styles.timelineStepWrapper}>
          <View style={styles.timelineIconWrapper}>
            <View
              style={[
                styles.timelineCircle,
                isCompleted && styles.timelineCircleCompleted,
                isCurrent && styles.timelineCircleCurrent,
                !isCompleted && !isCurrent && styles.timelineCircleIncomplete,
                isVerified && styles.timelineCircleVerified,
              ]}
            >
              {isVerified ? (
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              ) : isCompleted && !isCurrent ? (
                <Ionicons name="checkmark" size={18} color="#FFF" />
              ) : isCurrent ? (
                <FontAwesome5 name="truck" size={16} color="#FFF" />
              ) : (
                <View style={styles.timelineDot} />
              )}
            </View>
            {!isLast && (
              <View
                style={[
                  styles.timelineLine,
                  isCompleted
                    ? styles.timelineLineCompleted
                    : styles.timelineLineIncomplete,
                ]}
              />
            )}
          </View>
          <View style={styles.timelineLabelContainer}>
            <Text
              style={[
                styles.timelineLabel,
                isCompleted && styles.timelineLabelCompleted,
                isCurrent && styles.timelineLabelCurrent,
                !isCompleted && !isCurrent && styles.timelineLabelIncomplete,
                isVerified && styles.timelineLabelVerified,
              ]}
            >
              {step.label}
            </Text>
            {step.time && step.time !== '--:--' && (
              <Text style={styles.timelineTime}>{step.time}</Text>
            )}
            {(isCompleted || isVerified) && (
              <TouchableOpacity
                style={[
                  styles.verifyStepButton,
                  isVerified && styles.verifyStepButtonVerified,
                  isVerifying && styles.verifyStepButtonLoading,
                ]}
                onPress={() => handleVerifyStep(step.key, step.label)}
                disabled={isVerifying || isVerified}
              >
                {isVerifying ? (
                  <ActivityIndicator
                    size="small"
                    color={isVerified ? COLORS.success : COLORS.accent}
                  />
                ) : isVerified ? (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color={COLORS.success}
                    />
                    <Text style={styles.verifyStepTextVerified}>Verified</Text>
                  </>
                ) : (
                  <>
                    <FontAwesome5
                      name="shield-alt"
                      size={10}
                      color={COLORS.accent}
                    />
                    <Text style={styles.verifyStepText}>Verify</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const displayEta =
    routeInfo.eta !== '--' ? `${routeInfo.eta} min` : trackingData.eta;
  const displayDistance =
    routeInfo.distance !== '--' ? routeInfo.distance : trackingData.distance;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Track Responder</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Report #{trackingData.reportNumber} —{' '}
              {trackingData.incidentType}
            </Text>
            {trackingData.location && (
              <View style={styles.headerLocationRow}>
                <Ionicons
                  name="location-outline"
                  size={13}
                  color={COLORS.textMuted}
                />
                <Text style={styles.headerLocation} numberOfLines={1}>
                  {trackingData.location}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={styles.mapFullWidth}
          onTouchStart={() => onInteractionStateChange?.(true)}
          onTouchEnd={() => onInteractionStateChange?.(false)}
          onTouchCancel={() => onInteractionStateChange?.(false)}
        >
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: mapHTML }}
            style={styles.mapWebView}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            scrollEnabled={false}
            nestedScrollEnabled
            onLoadEnd={handleWebViewLoadEnd}
            onTouchStart={() => onInteractionStateChange?.(true)}
            onTouchEnd={() => onInteractionStateChange?.(false)}
            onTouchCancel={() => onInteractionStateChange?.(false)}
            onMessage={(event) => {
              try {
                const msg = JSON.parse(event.nativeEvent.data);
                if (msg.type === 'ROUTE_INFO') {
                  if (msg.cleared === true) {
                    setRouteInfo({ distance: '--', eta: '--' });
                    return;
                  }
                  setRouteInfo({
                    distance:
                      msg.distance > 0
                        ? msg.distance < 1
                          ? `${Math.round(msg.distance * 1000)} m`
                          : `${msg.distance.toFixed(1)} km`
                        : '--',
                    eta: msg.eta > 0 ? `${msg.eta}` : '--',
                  });
                }
              } catch {}
            }}
            renderLoading={() => (
              <View style={styles.mapLoadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.mapLoadingText}>Loading map...</Text>
              </View>
            )}
          />

          <TouchableOpacity
            style={styles.mapToggleButton}
            onPress={() =>
              setMapStyle((p) => (p === 'satellite' ? 'streets' : 'satellite'))
            }
            activeOpacity={0.85}
          >
            <Ionicons
              name={mapStyle === 'satellite' ? 'map-outline' : 'earth-outline'}
              size={14}
              color="#FFF"
            />
            <Text style={styles.mapToggleText}>
              {mapStyle === 'satellite' ? 'Streets' : 'Satellite'}
            </Text>
          </TouchableOpacity>

          <View
            style={[
              styles.statusBadgeMap,
              { backgroundColor: statusInfo.color + 'CC' },
            ]}
          >
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>
              {trackingData.statusLabel || statusInfo.label}
            </Text>
          </View>

          <View style={styles.mapLocationLabel}>
            <Ionicons name="location" size={12} color="#FFF" />
            <Text style={styles.mapLocationText} numberOfLines={1}>
              {trackingData.location}
            </Text>
          </View>

          {responderTracking && (
            <View style={styles.responderChip}>
              <View style={styles.responderChipDot} />
              <Text style={styles.responderChipText} numberOfLines={1}>
                {responderTracking.responderName}
              </Text>
            </View>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
          onScrollBeginDrag={() => onInteractionStateChange?.(true)}
          onScrollEndDrag={() => onInteractionStateChange?.(false)}
          onMomentumScrollEnd={() => onInteractionStateChange?.(false)}
        >
          {trackingData.description && (
            <View style={styles.descriptionCard}>
              <View style={styles.descriptionHeaderRow}>
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.descriptionHeaderText}>
                  Incident Description
                </Text>
              </View>
              <Text style={styles.descriptionText}>
                {trackingData.description}
              </Text>
            </View>
          )}

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <FontAwesome5 name="user-alt" size={14} color={COLORS.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Responder</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>
                    {responderTracking?.responderName || trackingData.responder}
                  </Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="time-outline" size={17} color={COLORS.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>ETA</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>
                    {displayEta}
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.infoRow, styles.infoRowSpaced]}>
              <View style={styles.infoItem}>
                <View
                  style={[
                    styles.infoIconContainer,
                    { backgroundColor: statusInfo.color + '26' },
                  ]}
                >
                  <Ionicons name="radio-outline" size={17} color={statusInfo.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Status</Text>
                  <Text
                    style={[styles.infoValue, { color: statusInfo.color }]}
                    numberOfLines={2}
                  >
                    {trackingData.statusLabel || statusInfo.label}
                  </Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="navigate-outline" size={17} color={COLORS.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Distance</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>
                    {displayDistance}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.timelineCard}>
            <Text style={styles.timelineTitle}>Response Progress</Text>
            <View style={styles.timelineContainer}>
              {timelineSteps.map((step, index) =>
                renderTimelineStep(step, index)
              )}
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 32,
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 14,
  },
  errorButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextContainer: { flex: 1 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  headerLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  headerLocation: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMuted,
  },

  mapFullWidth: {
    height: 240,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    position: 'relative',
  },
  mapWebView: { flex: 1, backgroundColor: '#1A1A2E' },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
  },
  mapLoadingText: { color: COLORS.textMuted, marginTop: 8, fontSize: 12 },
  mapToggleButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(20, 8, 8, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  mapToggleText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  statusBadgeMap: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  statusDot: {
    width: 7,
    height: 7,
    backgroundColor: '#FFF',
    borderRadius: 4,
    marginRight: 5,
  },
  statusBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  mapLocationLabel: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 8, 8, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  mapLocationText: { color: '#FFF', fontSize: 11, marginLeft: 4, flex: 1 },

  responderChip: {
    position: 'absolute',
    top: 46,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 121, 255, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 6,
    maxWidth: '60%',
  },
  responderChipDot: {
    width: 7,
    height: 7,
    backgroundColor: '#FFF',
    borderRadius: 4,
  },
  responderChipText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },

  descriptionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  descriptionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  descriptionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  descriptionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoRowSpaced: {
    marginTop: 16,
  },
  infoItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  infoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginTop: 1,
  },

  timelineCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 18,
    marginBottom: 16,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 16,
    marginLeft: 4,
  },
  timelineContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  timelineStepContainer: { flex: 1, alignItems: 'center' },
  timelineStepWrapper: { alignItems: 'center', width: '100%' },
  timelineIconWrapper: {
    alignItems: 'center',
    position: 'relative',
    width: '100%',
  },

  timelineCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceRaised,
    zIndex: 2,
  },
  timelineCircleCompleted: { backgroundColor: COLORS.success },
  timelineCircleCurrent: { backgroundColor: COLORS.accent },
  timelineCircleIncomplete: { backgroundColor: COLORS.surfaceRaised },
  timelineCircleVerified: { backgroundColor: COLORS.info },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  timelineLine: {
    position: 'absolute',
    top: 16,
    left: '50%',
    right: '-50%',
    height: 2,
    zIndex: 1,
  },
  timelineLineCompleted: { backgroundColor: COLORS.success },
  timelineLineIncomplete: { backgroundColor: COLORS.surfaceRaised },

  timelineLabelContainer: {
    marginTop: 8,
    alignItems: 'center',
    minHeight: 68,
    width: '100%',
  },
  timelineLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
  timelineLabelCompleted: { color: COLORS.success },
  timelineLabelCurrent: { color: COLORS.accent },
  timelineLabelIncomplete: { color: COLORS.textMuted },
  timelineLabelVerified: { color: COLORS.info },
  timelineTime: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },

  verifyStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 6,
    gap: 3,
    minWidth: 52,
  },
  verifyStepButtonVerified: {
    backgroundColor: 'rgba(76, 175, 80, 0.14)',
  },
  verifyStepButtonLoading: { opacity: 0.6 },
  verifyStepText: { color: COLORS.accent, fontSize: 10, fontWeight: '700' },
  verifyStepTextVerified: { color: COLORS.success, fontSize: 10, fontWeight: '700' },

  bottomSpacer: { height: 60 },
});
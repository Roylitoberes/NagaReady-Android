// components/OnboardingScreen.tsx
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */
const COLORS = {
  background: '#FFFFFF',
  surface: '#F6F7F9',
  border: '#E6E8EC',
  text: '#0F172A',
  muted: '#64748B',
  brand: '#D92D20',
  brandDisabled: '#E5E7EB',
  onBrandDisabled: '#9CA3AF',
};

const HERO_HEIGHT = Math.min(height * 0.27, 230);

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Feature {
  name: string;
  detail?: string;
  icon: IconName;
}

interface OnboardingItem {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  accent: string;
  features: Feature[];
  isTerms?: boolean;
}

const onboardingData: OnboardingItem[] = [
  {
    id: '1',
    title: 'Welcome to NagaReady',
    subtitle: 'Your partner in emergency response.',
    icon: 'shield-checkmark',
    accent: '#D92D20',
    features: [
      { name: 'SOS', detail: 'Request help with one tap', icon: 'alert-circle' },
      { name: 'Report', detail: 'Send incident details to responders', icon: 'document-text' },
      { name: 'SMS Alert', detail: 'Receive emergency notifications', icon: 'notifications' },
      { name: 'SMS Fallback', detail: 'Keep reporting without internet', icon: 'chatbubble' },
    ],
  },
  {
    id: '2',
    title: 'Emergency SMS',
    subtitle: 'Send messages even when the internet is unavailable.',
    icon: 'chatbubble-ellipses',
    accent: '#2563EB',
    features: [
      { name: 'Notify Contacts', detail: 'Alert your emergency contacts', icon: 'people' },
      { name: 'Send Incident Details', detail: 'Include the type and description', icon: 'document-text' },
      { name: 'Share Location', detail: 'Help responders find you', icon: 'location' },
      { name: 'Low Signal Mode', detail: 'Works on weak connections', icon: 'cellular' },
    ],
  },
  {
    id: '3',
    title: 'One Tap Emergency',
    subtitle: 'Get help when it matters most.',
    icon: 'alert-circle',
    accent: '#D97706',
    features: [
      { name: 'Medical Emergency', detail: 'Injuries and urgent health needs', icon: 'medkit' },
      { name: 'Fire Incident', detail: 'Report fires quickly', icon: 'flame' },
      { name: 'Crime Incident', detail: 'Alert the police', icon: 'shield' },
      { name: 'Traffic Accident', detail: 'Report road incidents', icon: 'car' },
    ],
  },
  {
    id: '4',
    title: 'Works Without Internet',
    subtitle: 'Stay connected during emergencies and outages.',
    icon: 'wifi',
    accent: '#7C3AED',
    features: [
      { name: 'SMS Fallback', detail: 'Send reports by text message', icon: 'chatbubble' },
      { name: 'Disaster Ready', detail: 'Built for calamities and power outages', icon: 'warning' },
      { name: 'Low Signal Mode', detail: 'Reports go through on weak signal', icon: 'cellular' },
      { name: 'Offline Mode', detail: 'Open key information without data', icon: 'phone-portrait' },
    ],
  },
  {
    id: '5',
    title: 'Emergency Hotline',
    subtitle: 'Quick access to emergency services.',
    icon: 'call',
    accent: '#16A34A',
    features: [
      { name: 'PNP', detail: 'Philippine National Police', icon: 'shield' },
      { name: 'BFP', detail: 'Bureau of Fire Protection', icon: 'flame' },
      { name: 'EMS', detail: 'Emergency Medical Services', icon: 'medkit' },
      { name: 'DRRMO', detail: 'Disaster Risk Reduction and Management Office', icon: 'business' },
    ],
  },
  {
    id: '6',
    title: 'Terms & Conditions',
    subtitle: 'Please read and agree to continue.',
    icon: 'document-text',
    accent: '#D92D20',
    features: [],
    isTerms: true,
  },
];

const TERMS: { title: string; body: string }[] = [
  {
    title: '1. Use of the Emergency Reporting System',
    body: 'NagaReady is intended to help users report genuine emergencies and incidents to the appropriate emergency response personnel. The system should only be used for legitimate emergency and safety-related purposes.',
  },
  {
    title: '2. No False or Prank Reports',
    body: 'Users must not submit false, fake, misleading, or prank emergency reports. False reports may cause unnecessary deployment of emergency responders and may delay assistance to people who are actually in danger.',
  },
  {
    title: '3. Provide Accurate Information',
    body: 'Users should provide accurate and truthful information when submitting an emergency report, including the incident type, location, description, and other requested details.',
  },
  {
    title: '4. Do Not Misuse the System',
    body: 'Users must not intentionally misuse, abuse, manipulate, or interfere with the NagaReady emergency response system.',
  },
  {
    title: '5. Emergency Information',
    body: 'When submitting a report, provide as much relevant information as possible to help emergency personnel understand and respond to the incident.',
  },
  {
    title: '6. Location Information',
    body: "NagaReady may use the user's location information to help identify the reported incident location and assist emergency responders in reaching the appropriate location.",
  },
  {
    title: '7. Responsible Use',
    body: 'Users are expected to use NagaReady responsibly and only for its intended purpose. Repeated misuse or submission of false reports may result in appropriate action by the system administrators or authorized personnel.',
  },
  {
    title: '8. Privacy and Information',
    body: 'Information submitted through NagaReady may be accessed by authorized emergency response personnel for the purpose of receiving, verifying, dispatching, monitoring, and managing emergency incidents.',
  },
  {
    title: '9. User Responsibility',
    body: 'By using NagaReady, the user acknowledges that the information provided in an emergency report should be truthful and accurate to the best of their knowledge.',
  },
  {
    title: '10. Agreement',
    body: 'By continuing to use NagaReady, you confirm that you have read, understood, and agree to follow these Terms and Conditions and User Guidelines.',
  },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const flatListRef = useRef<FlatList<OnboardingItem>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const lastIndex = onboardingData.length - 1;
  const isLastScreen = currentIndex === lastIndex;
  const canContinue = !isLastScreen || agreed;

  const goTo = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (!isLastScreen) {
      goTo(currentIndex + 1);
    } else if (agreed) {
      onComplete();
    }
  };

  const handleSkip = () => goTo(lastIndex);

  /* ---------- Slide pieces ---------- */
  const renderHero = (item: OnboardingItem) => (
    <View style={[styles.hero, { backgroundColor: item.accent + '12' }]}>
      <View style={[styles.heroRingOuter, { backgroundColor: item.accent + '14' }]}>
        <View style={[styles.heroRingInner, { backgroundColor: item.accent + '24' }]}>
          <View style={[styles.heroIcon, { backgroundColor: item.accent }]}>
            <Ionicons name={item.icon} size={40} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </View>
  );

  const renderFeatures = (item: OnboardingItem) => (
    <View style={styles.featureList}>
      {item.features.map((feature, idx) => (
        <View
          key={feature.name}
          style={[styles.featureRow, idx < item.features.length - 1 && styles.featureRowDivider]}
        >
          <View style={[styles.featureIcon, { backgroundColor: item.accent + '14' }]}>
            <Ionicons name={feature.icon} size={20} color={item.accent} />
          </View>
          <View style={styles.featureText}>
            <Text style={styles.featureName}>{feature.name}</Text>
            {!!feature.detail && <Text style={styles.featureDetail}>{feature.detail}</Text>}
          </View>
        </View>
      ))}
    </View>
  );

  const renderTerms = () => (
    <>
      <View style={styles.termsCard}>
        <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.termsContent}>
          <Text style={styles.termsHeading}>
            NagaReady Terms and Conditions and User Guidelines
          </Text>
          <Text style={styles.termsIntro}>
            Before using NagaReady, please read and understand the following terms and guidelines.
          </Text>
          {TERMS.map((section) => (
            <View key={section.title} style={styles.termsSection}>
              <Text style={styles.termsTitle}>{section.title}</Text>
              <Text style={styles.termsBody}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setAgreed((prev) => !prev)}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
        <Text style={styles.checkboxLabel}>
          I have read and agree to the NagaReady Terms and Conditions and User Guidelines.
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderItem = ({ item }: { item: OnboardingItem }) => (
    <View style={styles.slide}>
      {!item.isTerms && renderHero(item)}

      <View style={styles.textBlock}>
        <Text style={[styles.title, item.isTerms && styles.titleTerms]}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>

      {item.isTerms ? renderTerms() : renderFeatures(item)}
    </View>
  );

  /* ---------- Pagination ---------- */
  const renderPagination = () => (
    <View style={styles.pagination}>
      {onboardingData.map((_, i) => {
        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });
        const dotOpacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
          />
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.stepText}>
          {currentIndex + 1} of {onboardingData.length}
        </Text>
        {!isLastScreen ? (
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        onMomentumScrollEnd={(e) => {
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        scrollEventThrottle={16}
      />

      {/* Footer */}
      <View style={styles.footer}>
        {renderPagination()}
        <TouchableOpacity
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={!canContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, !canContinue && styles.buttonTextDisabled]}>
            {isLastScreen ? 'Agree & Continue' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },

  /* Top bar */
  topBar: {
    height: 52,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.muted,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.muted,
  },

  /* Slide */
  slide: {
    width,
    flex: 1,
    paddingHorizontal: 24,
  },

  /* Hero */
  hero: {
    height: HERO_HEIGHT,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRingOuter: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRingInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Text */
  textBlock: {
    marginTop: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  titleTerms: {
    marginTop: 4,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 23,
    color: COLORS.muted,
  },

  /* Features */
  featureList: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  featureRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  featureDetail: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
  },

  /* Terms */
  termsCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  termsContent: {
    padding: 18,
  },
  termsHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  termsIntro: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.muted,
  },
  termsSection: {
    marginTop: 16,
  },
  termsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  termsBody: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.muted,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 16,
    paddingBottom: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text,
  },

  /* Footer */
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 8,
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 3,
    backgroundColor: COLORS.brand,
  },
  button: {
    height: 54,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: COLORS.brandDisabled,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonTextDisabled: {
    color: COLORS.onBrandDisabled,
  },
});
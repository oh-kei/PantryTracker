import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import type { InventoryItem, StorageLocation } from '../../../shared/types';
import { describeExpiry, URGENCY_COLOURS, urgencyOf } from '../domain/expiry';
import { STORAGE_LABELS, STORAGES } from '../domain/inventory';

/** Shared component library: presentational only, no business logic. */

export const colours = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#2563eb',
  primarySoft: '#dbeafe',
  success: '#16a34a',
  danger: '#dc2626',
  ai: '#7c3aed',
};

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'success' | 'ai';

interface ButtonProps {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BUTTON_COLOURS: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colours.primary, fg: '#fff' },
  outline: { bg: 'transparent', fg: colours.primary, border: colours.primary },
  ghost: { bg: '#f1f5f9', fg: '#334155' },
  danger: { bg: colours.danger, fg: '#fff' },
  success: { bg: colours.success, fg: '#fff' },
  ai: { bg: colours.ai, fg: '#fff' },
};

export const Button = ({ title, onPress, icon, variant = 'primary', disabled, loading, style, testID }: ButtonProps) => {
  const c = BUTTON_COLOURS[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.bg, borderColor: c.border || c.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={c.fg} /> : icon ? <Ionicons name={icon} size={18} color={c.fg} /> : null}
      <Text style={[styles.buttonText, { color: c.fg }]}>{title}</Text>
    </Pressable>
  );
};

export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.card, style]}>{children}</View>
);

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  colour?: string;
  background?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  textStyle?: StyleProp<TextStyle>;
}

export const Chip = ({ label, selected, onPress, colour, background, icon, textStyle }: ChipProps) => {
  const fg = selected ? '#fff' : colour || '#334155';
  const bg = selected ? colours.primary : background || '#f1f5f9';
  const content = (
    <>
      {icon && <Ionicons name={icon} size={12} color={fg} style={{ marginRight: 4 }} />}
      <Text style={[styles.chipText, { color: fg }, textStyle]}>{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { backgroundColor: bg }]}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.chip, { backgroundColor: bg }]}>{content}</View>
  );
};

/** Colour-coded urgency badge (red / amber / green) with time left. */
export const UrgencyBadge = ({ item, compact }: { item: Pick<InventoryItem, 'expiryDate' | 'expiryEarliest' | 'expirySource'>; compact?: boolean }) => {
  const tier = urgencyOf(item);
  const c = URGENCY_COLOURS[tier];
  return (
    <View testID={`urgency-${tier}`} style={[styles.badge, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <Text style={[styles.badgeText, { color: c.fg }]}>{compact ? c.label : describeExpiry(item)}</Text>
    </View>
  );
};

export const StorageSelector = ({ value, onChange }: { value: StorageLocation; onChange: (s: StorageLocation) => void }) => (
  <View style={styles.segment}>
    {STORAGES.map(storage => (
      <Pressable
        key={storage}
        accessibilityRole="button"
        accessibilityState={{ selected: value === storage }}
        onPress={() => onChange(storage)}
        style={[styles.segmentItem, value === storage && styles.segmentSelected]}
      >
        <Text style={[styles.segmentText, value === storage && styles.segmentTextSelected]}>{STORAGE_LABELS[storage]}</Text>
      </Pressable>
    ))}
  </View>
);

export const Stepper = ({ value, onChange, min = 0, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; step?: number; label?: string }) => (
  <View style={styles.stepper}>
    <Pressable accessibilityLabel="Decrease" onPress={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))} style={styles.stepperButton}>
      <Ionicons name="remove" size={16} color={colours.text} />
    </Pressable>
    <Text style={styles.stepperValue}>{value}{label ? ` ${label}` : ''}</Text>
    <Pressable accessibilityLabel="Increase" onPress={() => onChange(Math.round((value + step) * 100) / 100)} style={styles.stepperButton}>
      <Ionicons name="add" size={16} color={colours.text} />
    </Pressable>
  </View>
);

export const EmptyState = ({ icon, title, message, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; message?: string; action?: React.ReactNode }) => (
  <View style={styles.empty}>
    <Ionicons name={icon} size={48} color="#cbd5e1" />
    <Text style={styles.emptyTitle}>{title}</Text>
    {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    {action}
  </View>
);

export const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <View style={styles.sectionRow}>
    <Text style={styles.sectionTitle}>{children}</Text>
    {right}
  </View>
);

export const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, gap: 8 },
  buttonText: { fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: colours.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colours.border },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginRight: 6, marginBottom: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  segmentSelected: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  segmentText: { fontSize: 13, color: colours.muted, fontWeight: '600' },
  segmentTextSelected: { color: colours.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10 },
  stepperButton: { padding: 8 },
  stepperValue: { minWidth: 36, textAlign: 'center', fontWeight: '700', color: colours.text },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyMessage: { fontSize: 14, color: colours.muted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colours.text },
  input: { borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 15, color: colours.text, backgroundColor: '#fff' },
  label: { fontSize: 12, color: colours.muted, fontWeight: '700', marginBottom: 6, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  muted: { fontSize: 13, color: colours.muted, lineHeight: 19 },
});

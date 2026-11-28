import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { UNIT_OPTIONS } from '../domain/units';
import { Chip } from './ui';

/** One-tap unit choice. A unit from a scan that isn't in the list (e.g. "slice") is shown first. */
export const UnitPicker = ({ value, onChange }: { value: string; onChange: (unit: string) => void }) => {
  const known = UNIT_OPTIONS.some(o => o.value.toLowerCase() === value.toLowerCase());
  const options = known ? UNIT_OPTIONS : [{ value, label: value }, ...UNIT_OPTIONS];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={local.row}>
      {options.map(option => (
        <Chip
          key={option.value}
          label={option.label}
          selected={option.value.toLowerCase() === value.toLowerCase()}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
};

const local = StyleSheet.create({
  row: { gap: 6, paddingVertical: 2 },
});

import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  addDays, dateToString, formatLongDate, QUICK_DATE_OPTIONS, relativeDays, stringToLocalDate, todayString,
} from '../domain/expiry';
import { Chip, colours } from './ui';

interface Props {
  /** Printed date (YYYY-MM-DD), or undefined to use the estimate. */
  value?: string;
  onChange: (value: string | undefined) => void;
  /** The AI read this date off the packaging, so ask the user to check it. */
  fromPhoto?: boolean;
  testID?: string;
}

/**
 * Printed expiry date without typing: quick "+1 week" style buttons, a calendar,
 * and one tap to go back to the estimate.
 */
export const ExpiryDateField = ({ value, onChange, fromPhoto, testID }: Props) => {
  const [picking, setPicking] = useState(false);
  const today = todayString();

  const onPick = (event: DateTimePickerEvent, date?: Date) => {
    // Android shows a dialog that closes itself; iOS shows an inline calendar with a Done button.
    if (Platform.OS !== 'ios') setPicking(false);
    if (event.type === 'set' && date) onChange(dateToString(date));
  };

  return (
    <View testID={testID}>
      {value ? (
        <View style={local.selected}>
          <Ionicons name={fromPhoto ? 'scan-outline' : 'calendar'} size={18} color={colours.primary} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={local.selectedDate}>{formatLongDate(value)}</Text>
            <Text style={local.selectedHint}>
              {relativeDays(value, today)}{fromPhoto ? ' · read from the label, please check' : ''}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Use the estimate instead" onPress={() => onChange(undefined)} style={local.clear}>
            <Text style={local.clearText}>Use estimate</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={local.hint}>No printed date: the estimate below is used. Tap one to set it:</Text>
      )}

      <View style={local.chips}>
        {QUICK_DATE_OPTIONS.map(option => {
          const date = addDays(today, option.days);
          return (
            <Chip key={option.label} label={option.label} selected={value === date} onPress={() => onChange(date)} />
          );
        })}
        <Chip icon="calendar-outline" label="Pick date…" selected={picking} onPress={() => setPicking(p => !p)} />
      </View>

      {picking && (
        <View style={Platform.OS === 'ios' ? local.iosPicker : undefined}>
          <DateTimePicker
            testID="expiry-date-picker"
            value={stringToLocalDate(value || addDays(today, 7))}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={stringToLocalDate(addDays(today, -30))}
            onChange={onPick}
          />
          {Platform.OS === 'ios' && (
            <Pressable accessibilityRole="button" onPress={() => setPicking(false)} style={local.done}>
              <Text style={local.doneText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

const local = StyleSheet.create({
  hint: { fontSize: 13, color: colours.muted, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  selected: {
    flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10,
    backgroundColor: colours.primarySoft, borderWidth: 1, borderColor: '#bfdbfe',
  },
  selectedDate: { fontSize: 15, fontWeight: '700', color: colours.text },
  selectedHint: { fontSize: 12, color: colours.muted, marginTop: 2 },
  clear: { paddingVertical: 6, paddingHorizontal: 8 },
  clearText: { color: colours.primary, fontWeight: '600', fontSize: 13 },
  iosPicker: { marginTop: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: colours.border },
  done: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 10 },
  doneText: { color: colours.primary, fontWeight: '700' },
});

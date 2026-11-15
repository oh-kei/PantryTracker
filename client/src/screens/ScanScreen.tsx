import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, colours } from '../components/ui';
import { MAX_UPLOAD_BYTES } from '../config';
import { api } from '../data/api';
import type { RootStackParamList } from '../navigation/types';
import { useSessionStore } from '../store/sessionStore';

type Mode = 'item' | 'fridge';

/**
 * Compress a photo client-side to at most ~1 MB (proposal 4.1): resize, then
 * lower JPEG quality until it fits.
 */
export const compressPhoto = async (uri: string): Promise<string> => {
  const attempts = [
    { width: 1280, compress: 0.6 },
    { width: 1024, compress: 0.5 },
    { width: 800, compress: 0.4 },
  ];
  let base64 = '';
  for (const attempt of attempts) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: attempt.width } }],
      { compress: attempt.compress, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    base64 = result.base64 || '';
    if (base64.length * 0.75 <= MAX_UPLOAD_BYTES) break;
  }
  return base64;
};

export default function ScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [mode, setMode] = useState<Mode>('item');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const setScan = useSessionStore(s => s.setScan);

  const goManual = () => {
    setScan({ items: [], source: 'manual' });
    navigation.replace('Confirm', { manual: true });
  };

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    try {
      setBusy('Taking photo…');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('No photo captured');
      setBusy('Compressing…');
      const base64 = await compressPhoto(photo.uri);
      setBusy('Identifying food…');
      // The photo is sent once and only kept in memory; nothing is saved on the phone or server.
      const result = await api.scan(base64);
      setScan({ items: result.items, source: result.source });
      navigation.replace('Confirm');
    } catch (error) {
      Alert.alert(
        'Recognition failed',
        `${(error as Error).message}\n\nYou can retake the photo or add items manually.`,
        [{ text: 'Retake' }, { text: 'Add manually', onPress: goManual }],
      );
    } finally {
      setBusy(null);
    }
  };

  if (!permission) {
    return <View style={[styles.fill, styles.centre]}><ActivityIndicator /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.centre, styles.permission, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={64} color={colours.primary} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>
          Photos are used only to recognise food. They are processed in transit and never stored.
        </Text>
        <Button title="Allow camera" icon="camera" onPress={requestPermission} style={styles.wide} />
        <Button title="Add items manually instead" variant="outline" icon="create-outline" onPress={goManual} style={styles.wide} />
        <Button title="Cancel" variant="ghost" onPress={() => navigation.goBack()} style={styles.wide} />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      <CameraView ref={cameraRef} style={styles.fill} facing="back" onCameraReady={() => setReady(true)} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityLabel="Close" onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <View style={styles.modeSwitch}>
          {(['item', 'fridge'] as Mode[]).map(m => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeItem, mode === m && styles.modeSelected]}>
              <Text style={[styles.modeText, mode === m && styles.modeTextSelected]}>{m === 'item' ? 'Single item' : 'Whole fridge'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.guide} pointerEvents="none">
        <View style={[styles.frame, mode === 'fridge' && styles.frameWide]} />
        <Text style={styles.hint}>
          {mode === 'item'
            ? 'Centre one item, label facing you, in good light — best accuracy.'
            : 'Open the door fully and step back so every shelf is visible.'}
        </Text>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={goManual} style={styles.sideAction}>
          <Ionicons name="create-outline" size={24} color="#fff" />
          <Text style={styles.sideText}>Manual</Text>
        </Pressable>
        <Pressable
          testID="shutter"
          accessibilityLabel="Take photo"
          onPress={capture}
          disabled={!ready || Boolean(busy)}
          style={[styles.shutter, (!ready || busy) && { opacity: 0.5 }]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.sideAction} />
      </View>

      {busy && (
        <View style={[StyleSheet.absoluteFill, styles.centre, styles.overlay]}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.busyText}>{busy}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  permission: { backgroundColor: colours.bg, padding: 24, gap: 12 },
  permissionTitle: { fontSize: 20, fontWeight: '800', color: colours.text },
  permissionText: { fontSize: 14, color: colours.muted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  wide: { alignSelf: 'stretch' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modeSwitch: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, padding: 3 },
  modeItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  modeSelected: { backgroundColor: '#fff' },
  modeText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  modeTextSelected: { color: colours.text },
  guide: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 24 },
  frameWide: { width: '85%', height: '60%' },
  hint: { color: '#fff', marginTop: 16, textAlign: 'center', paddingHorizontal: 32, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.35)' },
  sideAction: { width: 64, alignItems: 'center' },
  sideText: { color: '#fff', fontSize: 12, marginTop: 2 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  overlay: { backgroundColor: 'rgba(0,0,0,0.6)' },
  busyText: { color: '#fff', marginTop: 12, fontSize: 16, fontWeight: '600' },
});

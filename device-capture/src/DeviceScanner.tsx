import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { cleanDraft, type Batch, type Project, type SaveAttempt } from './deviceWorkflow';
import { SavePreflightError } from './deviceService';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import CableMintOcr from '../modules/cablemint-ocr/src/CableMintOcrModule';
import { analyzeScan, normalizeMac, type ScanReview, type ValueCandidate, type BarcodeCandidate } from './recognition';
import { withTimeout } from './withTimeout';
import { isAppCachePhoto } from './photoPrivacy';

const BLUE = '#102B4B';
const GREEN = '#26B67A';
const BARCODE_TYPES = ['qr', 'code128', 'code39', 'code93', 'datamatrix', 'pdf417', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'aztec'] as const;

function Action({ label, onPress, outline = false, disabled = false }: { label: string; onPress: () => void; outline?: boolean; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.action, outline && styles.actionOutline, disabled && styles.disabled]}>
    <Text style={[styles.actionText, outline && styles.actionOutlineText]}>{label}</Text>
  </Pressable>;
}

function CandidateList({ title, candidates, onChoose }: { title: string; candidates: ValueCandidate[]; onChoose: (value: string) => void }) {
  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {candidates.length === 0 ? <Text style={styles.muted}>No value tied to a printed label. Check the barcode list and enter it manually if needed.</Text> :
      candidates.map((candidate) => <Pressable key={candidate.value} style={styles.candidate} onPress={() => onChoose(candidate.value)}>
        <Text style={styles.candidateValue}>{candidate.value}</Text>
        <Text style={styles.candidateMeta}>{candidate.source} · tap to use</Text>
      </Pressable>)}
  </View>;
}

export function DeviceScanner({ project, userId, batch, onSave, onExit, onDevices, savedMessage, batchStorageError }: {
  project: Project; userId: string; batch: Batch; onSave: (attempt: SaveAttempt) => Promise<string>;
  onExit: () => void; onDevices: () => void; savedMessage: string; batchStorageError: string;
}) {
  const camera = useRef<CameraView>(null);
  const liveBarcodes = useRef(new Map<string, BarcodeScanningResult>());
  const captureInProgress = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<'camera' | 'review'>('camera');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [barcodeCount, setBarcodeCount] = useState(0);
  const [liveCodes, setLiveCodes] = useState<BarcodeScanningResult[]>([]);
  const [captureStatus, setCaptureStatus] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [review, setReview] = useState<ScanReview | null>(null);
  const [mac, setMac] = useState('');
  const [serial, setSerial] = useState('');
  const [installationLocation, setInstallationLocation] = useState(batch.unit_location);
  const [verified, setVerified] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<SaveAttempt | null>(null);
  const saving = useRef(false);
  const [confirmationError, setConfirmationError] = useState('');
  const [error, setError] = useState('');
  const [cleanupWarning, setCleanupWarning] = useState('');

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (captureInProgress.current) return;
    const key = `${result.type}:${result.data.trim()}`;
    if (!result.data.trim() || liveBarcodes.current.has(key)) return;
    liveBarcodes.current.set(key, result);
    setBarcodeCount(liveBarcodes.current.size);
    setLiveCodes([...liveBarcodes.current.values()]);
  }

  function showReview(result: ScanReview) {
    setVerified(false);
    setPendingAttempt(null);
    setConfirmationError('');
    setReview(result);
    setMac(result.macs.length === 1 ? result.macs[0].value : '');
    setSerial(result.serials.length === 1 ? result.serials[0].value : '');
    setStage('review');
    setCameraReady(false);
  }

  function chooseMac(value: string) {
    if (pendingAttempt || busy) return;
    setMac(value);
    setVerified(false);
    setConfirmationError('');
  }

  function chooseSerial(value: string) {
    if (pendingAttempt || busy) return;
    setSerial(value);
    setVerified(false);
    setConfirmationError('');
  }

  async function saveAndNext() {
    if (saving.current || busy) return;
    if (!verified) { setConfirmationError('Confirm that you checked the MAC, serial, and location against this device.'); return; }
    saving.current = true;
    setBusy(true); setConfirmationError('');
    try {
      const draft = cleanDraft(batch, mac, serial, installationLocation);
      const attempt = pendingAttempt ?? { id: randomUUID(), user_id: userId, project_id: project.id, draft };
      setPendingAttempt(attempt);
      Keyboard.dismiss();
      const nextLocation = await onSave(attempt);
      scanAgain(nextLocation);
    } catch (failure) {
      if (!pendingAttempt && failure instanceof SavePreflightError) setPendingAttempt(null);
      setConfirmationError((failure as Error).message || 'Save failed. Keep this scan and retry when connected.');
    }
    finally { saving.current = false; setBusy(false); }
  }

  function leaveScan(next: () => void) {
    if (busy || saving.current) return;
    if (stage === 'review') Alert.alert(pendingAttempt ? 'Leave this save?' : 'Leave this scan?',
      pendingAttempt ? 'A save may already have reached the project. Check Current Project Devices before scanning this device again.' : 'Unsaved scan values will be discarded. Batch settings are retained.',
      [{ text: 'Stay', style: 'cancel' }, { text: 'Continue', onPress: next }]);
    else next();
  }

  function removePhoto(uri: string) {
    if (!isAppCachePhoto(uri, Paths.cache.uri)) return;
    try { const file = new File(uri); if (file.exists) file.delete(); }
    catch { setCleanupWarning('The temporary photo could not be removed. Clear this app’s cache before sharing the phone.'); }
  }

  function liveValues(): BarcodeCandidate[] {
    // Preview coordinates and image coordinates describe different frames.
    return [...liveBarcodes.current.values()].map(({ data, type, cornerPoints, bounds: boundingBox }) => ({
      data, type, source: 'live', coordinateSpace: 'preview', cornerPoints,
      boundingBox: boundingBox ? { left: boundingBox.origin.x, top: boundingBox.origin.y,
        right: boundingBox.origin.x + boundingBox.size.width, bottom: boundingBox.origin.y + boundingBox.size.height } : null,
    }));
  }

  async function scanPhoto(photoUri: string, fallbackCodes: BarcodeCandidate[] = []) {
    setCaptureStatus('Reading barcode and printed text…');
    const [barcodeResult, ocrResult] = await Promise.allSettled([
      withTimeout(CableMintOcr.scanBarcodesAsync(photoUri), 12000, 'Still-image barcode recognition timed out.'),
      withTimeout(CableMintOcr.recognizeAsync(photoUri), 12000, 'Text recognition timed out.'),
    ]);
    const stillBarcodes = barcodeResult.status === 'fulfilled' ? barcodeResult.value : [];
    const ocr = ocrResult.status === 'fulfilled' ? ocrResult.value : null;
    if (barcodeResult.status === 'rejected' && ocrResult.status === 'rejected' && !fallbackCodes.length) {
      throw new Error('Barcode and text recognition both failed. Choose another photo or try a sharply focused camera scan.');
    }
    showReview(analyzeScan(ocr, [...fallbackCodes, ...stillBarcodes]));
    if (barcodeResult.status === 'rejected' || ocrResult.status === 'rejected') {
      setError([barcodeResult, ocrResult].filter(item => item.status === 'rejected')
        .map(item => item.status === 'rejected' ? String(item.reason?.message ?? item.reason) : '').join(' ') + ' Review the available codes manually.');
    }
  }

  async function captureLabel() {
    if (captureInProgress.current || !camera.current || !cameraReady) return;
    captureInProgress.current = true;
    setBusy(true);
    setError('');
    setCleanupWarning('');
    let photoUri: string | undefined;
    try {
      setCaptureStatus('Taking photo…');
      const photo = await withTimeout(camera.current.takePictureAsync({ quality: 1, skipProcessing: false }),
        10000, 'Photo capture timed out. Review the live codes or try again.',
        latePhoto => { if (latePhoto?.uri) removePhoto(latePhoto.uri); });
      if (!photo?.uri) throw new Error('The camera did not return a photo.');
      photoUri = photo.uri;
      await scanPhoto(photoUri, liveValues());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed. Please try again.');
      if (liveBarcodes.current.size) showReview(analyzeScan(null, liveValues()));
    } finally {
      if (photoUri) {
        removePhoto(photoUri);
      }
      captureInProgress.current = false;
      setBusy(false);
      setCaptureStatus('');
    }
  }

  async function chooseExistingPhoto() {
    if (captureInProgress.current) return;
    captureInProgress.current = true;
    setBusy(true);
    setError('');
    setCleanupWarning('');
    setCaptureStatus('Choose a photo…');
    setTorch(false);
    let photoUri: string | undefined;
    try {
      // System picker grants access to only the selected image. No broad
      // gallery permission, image upload, base64 copy, or permanent save.
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false,
        quality: 1, exif: false, base64: false,
      });
      if (selected.canceled || !selected.assets[0]) return;
      const asset = selected.assets[0];
      if (isAppCachePhoto(asset.uri, Paths.cache.uri)) photoUri = asset.uri;
      else {
        const extension = asset.fileName?.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg';
        const temporary = new File(Paths.cache, `cablemint-scan-${Date.now()}${extension}`);
        photoUri = temporary.uri;
        await new File(asset.uri).copy(temporary);
      }
      // A selected photo never inherits barcodes from a previous live label.
      liveBarcodes.current.clear();
      setLiveCodes([]);
      setBarcodeCount(0);
      setReview(null);
      setConfirmationError('');
      setMac('');
      setSerial('');
      setVerified(false);
      setPendingAttempt(null);
      await scanPhoto(photoUri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cannot scan this photo. Choose another image.');
    } finally {
      if (photoUri) removePhoto(photoUri);
      captureInProgress.current = false;
      setBusy(false);
      setCaptureStatus('');
    }
  }

  function scanAgain(nextLocation = installationLocation) {
    setInstallationLocation(nextLocation);
    setVerified(false);
    setPendingAttempt(null);
    setConfirmationError('');
    liveBarcodes.current.clear();
    setBarcodeCount(0);
    setLiveCodes([]);
    setCameraReady(false);
    setReview(null);
    setMac('');
    setSerial('');
    setError('');
    setCleanupWarning('');
    setTorch(false);
    setStage('camera');
  }

  if (Platform.OS !== 'android') {
    return <SafeAreaView style={styles.center}><Text style={styles.darkTitle}>CableMint Device Capture</Text><Text style={styles.muted}>This first prototype targets Android only.</Text></SafeAreaView>;
  }
  if (!permission) return <SafeAreaView style={styles.center}><ActivityIndicator color={GREEN} /></SafeAreaView>;
  if (stage === 'camera' && !permission.granted) {
    return <SafeAreaView style={styles.center}>
      <Text style={styles.darkTitle}>Camera access</Text>
      <Text style={styles.body}>CableMint uses the camera to read equipment labels on this phone. Photos are processed locally and removed after each scan.</Text>
      <Action label="Scan with Camera" disabled={busy} onPress={() => { void requestPermission(); }} />
      <Action label="Choose Existing Photo" disabled={busy} outline onPress={() => { void chooseExistingPhoto(); }} />
      {busy && <><ActivityIndicator color={GREEN} /><Text style={styles.body}>{captureStatus}</Text></>}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
      <Action label="Batch Setup" disabled={busy} outline onPress={() => leaveScan(onExit)} />
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.container}>
    <StatusBar barStyle="light-content" backgroundColor={BLUE} />
    <View style={styles.header}>
      <Text style={styles.brand}>CABLEMINT TOOLS</Text>
      <Text style={styles.title}>Device Capture</Text>
      <Text style={styles.headerSub}>{project.name} · {batch.device_type} · {[batch.building, batch.floor_area, installationLocation].filter(Boolean).join(' / ')}</Text>
      <Action label="Batch Setup" disabled={busy} outline onPress={() => leaveScan(onExit)} />
      {!!batchStorageError && <Text style={{ color: '#FFDDCC' }}>{batchStorageError}</Text>}
    </View>
    {stage === 'camera' ? <View style={styles.cameraPage}>
      <View style={styles.cameraFrame}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }} onBarcodeScanned={onBarcodeScanned}
          onCameraReady={() => setCameraReady(true)} onMountError={event => setError(event.message)} />
        <View pointerEvents="none" style={styles.guide} />
      </View>
      <View style={styles.controls}>
        <Text style={styles.body}>Fill the guide with a sharp label. Native ML Kit has seen {barcodeCount} distinct barcode{barcodeCount === 1 ? '' : 's'}.</Text>
        {!!liveCodes.length && <ScrollView style={{ maxHeight: 100 }}>
          {liveCodes.map(code => <Text selectable key={`${code.type}:${code.data}`} style={styles.ocrText}>{code.type}: {code.data}</Text>)}
        </ScrollView>}
        <View style={styles.controlRow}>
          <View style={styles.flex}><Action label={torch ? 'Turn Off Flashlight' : 'Turn On Flashlight'} disabled={busy} onPress={() => setTorch(!torch)} outline /></View>
          <View style={styles.flex}><Action label="Clear codes" disabled={busy} onPress={() => { liveBarcodes.current.clear(); setBarcodeCount(0); setLiveCodes([]); }} outline /></View>
        </View>
        <Action label={busy ? captureStatus : 'Scan with Camera'} onPress={() => { void captureLabel(); }} disabled={busy || !cameraReady} />
        <Action label="Choose Existing Photo" disabled={busy} outline onPress={() => { void chooseExistingPhoto(); }} />
        {!!liveCodes.length && <Action label="Review read codes" disabled={busy} outline onPress={() => showReview(analyzeScan(null, liveValues()))} />}
        {busy && <ActivityIndicator color={GREEN} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
        {!!savedMessage && <Text accessibilityLiveRegion="polite" style={styles.body}>{savedMessage}</Text>}
      </View>
    </View> : <ScrollView key="review" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.reviewPage}>
      <Text style={styles.darkTitle}>Review scan</Text>
      <Text style={styles.muted}>Candidates are associated with nearby printed MAC or SN labels. Barcode values take priority over OCR in the same field. Confirm every value against the label.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
      <CandidateList title="Printed MAC candidates" candidates={review?.macs ?? []} onChoose={chooseMac} />
      <CandidateList title="Printed serial candidates" candidates={review?.serials ?? []} onChoose={chooseSerial} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All barcode values</Text>
        {review?.barcodes.length ? review.barcodes.map((code, index) => <View key={`${code.type}:${code.data}:${index}`} style={styles.codeRow}>
          <Text selectable style={styles.candidateValue}>{code.data}</Text><Text style={styles.candidateMeta}>{code.type} · {code.assignmentReason ?? 'unassigned — confirm manually'}</Text>
          <View style={styles.controlRow}>
            <View style={styles.flex}><Action label="Use as MAC" disabled={busy || !!pendingAttempt || !normalizeMac(code.data)} outline onPress={() => chooseMac(normalizeMac(code.data)!)} /></View>
            <View style={styles.flex}><Action label="Use as Serial" disabled={busy || !!pendingAttempt || code.data.length > 160} outline onPress={() => chooseSerial(code.data)} /></View>
          </View>
          {!normalizeMac(code.data) && <Text style={styles.muted}>This code is not a valid 12-hex MAC. It can still be selected as a serial.</Text>}
        </View>) : <Text style={styles.muted}>No barcode decoded.</Text>}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Technician check</Text>
        <Text style={styles.muted}>{[batch.building, batch.floor_area, batch.device_type, batch.manufacturer, batch.model].filter(Boolean).join(' / ')}</Text>
        <Text style={styles.label}>Unit / Room / Location</Text>
        <TextInput value={installationLocation} editable={!busy && !pendingAttempt} onChangeText={value => { setInstallationLocation(value); setVerified(false); setConfirmationError(''); }} maxLength={120}
          placeholder="Room 204" style={styles.input} />
        <Text style={styles.label}>MAC address (leave blank if none is printed)</Text>
        <TextInput value={mac} editable={!busy && !pendingAttempt} onChangeText={chooseMac} onBlur={() => { const normalized = normalizeMac(mac); if (normalized) setMac(normalized); }} autoCapitalize="characters" placeholder="AA:BB:CC:DD:EE:FF" style={styles.input} />
        <Text style={styles.label}>Serial number</Text>
        <TextInput value={serial} editable={!busy && !pendingAttempt} onChangeText={chooseSerial} autoCapitalize="characters" placeholder="Enter or choose a serial" style={styles.input} />
        {!!mac && !normalizeMac(mac) && <Text style={styles.error}>This does not look like a 12-digit MAC address.</Text>}
        <Text style={styles.muted}>I checked the MAC, serial, and location against this device.</Text>
        <Switch accessibilityLabel="Technician verified device fields" value={verified} disabled={busy || !!pendingAttempt} onValueChange={setVerified} />
        {!!pendingAttempt && <Text style={styles.muted}>These fields are held for a safe retry. Retry the same save or inspect Current Project Devices before leaving this scan.</Text>}
        {!!confirmationError && <Text accessibilityRole="alert" style={styles.error}>{confirmationError}</Text>}
        <Action label={busy ? 'Saving…' : pendingAttempt ? 'Retry Save & Next' : 'Save & Next'} disabled={busy || !verified} onPress={() => { void saveAndNext(); }} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Raw OCR text</Text>
        <Text selectable style={styles.ocrText}>{review?.ocrText || 'No printed text recognized.'}</Text>
      </View>
      <Action label="Rescan with Camera" disabled={busy || !!pendingAttempt} onPress={() => { setVerified(false); scanAgain(); }} />
      <Action label="Choose Existing Photo" disabled={busy || !!pendingAttempt} outline onPress={() => { void chooseExistingPhoto(); }} />
      <Action label="Current Project Devices" disabled={busy} outline onPress={() => leaveScan(onDevices)} />
      {busy && <><ActivityIndicator color={GREEN} /><Text style={styles.body}>{captureStatus}</Text></>}
    </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0, backgroundColor: BLUE },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 26, gap: 16, backgroundColor: '#F4F8FA' },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, backgroundColor: BLUE },
  brand: { color: GREEN, fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  title: { color: 'white', fontSize: 21, fontWeight: '700', marginTop: 5 },
  darkTitle: { color: BLUE, fontSize: 22, fontWeight: '800' },
  headerSub: { color: '#B7CEDB', fontSize: 12, marginTop: 4 },
  cameraPage: { flex: 1 }, cameraFrame: { flex: 1, overflow: 'hidden', backgroundColor: '#071726' },
  guide: { position: 'absolute', left: '8%', right: '8%', top: '27%', bottom: '27%', borderColor: GREEN, borderWidth: 2, borderRadius: 14 },
  controls: { padding: 18, gap: 10 }, controlRow: { flexDirection: 'row', gap: 8 }, flex: { flex: 1 },
  action: { backgroundColor: GREEN, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  actionOutline: { backgroundColor: 'white', borderWidth: 1, borderColor: '#B8CDD7' },
  actionText: { color: '#06231A', fontWeight: '700', textAlign: 'center' },
  actionOutlineText: { color: BLUE }, disabled: { opacity: 0.55 },
  body: { color: '#254354', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  muted: { color: '#587080', fontSize: 13, lineHeight: 19 }, error: { color: '#A32626', fontSize: 13, lineHeight: 19 },
  reviewPage: { padding: 18, paddingBottom: 40, gap: 14 }, section: { padding: 15, backgroundColor: 'white', borderRadius: 12, gap: 10 },
  sectionTitle: { color: BLUE, fontSize: 16, fontWeight: '700' },
  candidate: { borderWidth: 1, borderColor: '#C7EADA', borderRadius: 9, padding: 10, backgroundColor: '#F2FCF7' },
  candidateValue: { color: BLUE, fontWeight: '700', fontSize: 14 }, candidateMeta: { color: '#587080', fontSize: 12, marginTop: 3 },
  codeRow: { paddingVertical: 7, borderBottomColor: '#E5EEF2', borderBottomWidth: 1 },
  label: { color: '#254354', fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#B8CDD7', borderRadius: 8, padding: 10, color: BLUE, fontSize: 15 },
  ocrText: { color: '#254354', fontSize: 13, lineHeight: 20, fontFamily: 'monospace' },
});

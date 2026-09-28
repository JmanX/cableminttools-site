import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { File } from 'expo-file-system';
import CableMintOcr from './modules/cablemint-ocr/src/CableMintOcrModule';
import { analyzeScan, normalizeMac, type ScanReview, type ValueCandidate } from './src/recognition';

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
        <Text style={styles.candidateMeta}>{candidate.source}{candidate.corroboratedByBarcode ? ' · also found in barcode' : ''} · tap to use</Text>
      </Pressable>)}
  </View>;
}

export default function App() {
  const camera = useRef<CameraView>(null);
  const liveBarcodes = useRef(new Map<string, BarcodeScanningResult>());
  const captureInProgress = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<'camera' | 'review'>('camera');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [barcodeCount, setBarcodeCount] = useState(0);
  const [review, setReview] = useState<ScanReview | null>(null);
  const [mac, setMac] = useState('');
  const [serial, setSerial] = useState('');
  const [error, setError] = useState('');
  const [cleanupWarning, setCleanupWarning] = useState('');

  function onBarcodeScanned(result: BarcodeScanningResult) {
    const key = `${result.type}:${result.data.trim()}`;
    if (!result.data.trim() || liveBarcodes.current.has(key)) return;
    liveBarcodes.current.set(key, result);
    setBarcodeCount(liveBarcodes.current.size);
  }

  async function captureLabel() {
    if (captureInProgress.current || !camera.current) return;
    captureInProgress.current = true;
    setBusy(true);
    setError('');
    setCleanupWarning('');
    let photoUri: string | undefined;
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!photo?.uri) throw new Error('The camera did not return a photo.');
      photoUri = photo.uri;
      const [barcodeResult, ocrResult] = await Promise.allSettled([
        Camera.scanFromURLAsync(photoUri, [...BARCODE_TYPES]),
        CableMintOcr.recognizeAsync(photoUri),
      ]);
      const stillBarcodes = barcodeResult.status === 'fulfilled' ? barcodeResult.value : [];
      const ocr = ocrResult.status === 'fulfilled' ? ocrResult.value : null;
      if (barcodeResult.status === 'rejected' && ocrResult.status === 'rejected' && liveBarcodes.current.size === 0) {
        throw new Error('Barcode and text recognition both failed. Try a closer, sharply focused label.');
      }
      const result = analyzeScan(ocr, [...liveBarcodes.current.values(), ...stillBarcodes]);
      setReview(result);
      setMac(result.macs.length === 1 ? result.macs[0].value : '');
      setSerial(result.serials.length === 1 ? result.serials[0].value : '');
      setStage('review');
      if (barcodeResult.status === 'rejected' || ocrResult.status === 'rejected') {
        setError(`${barcodeResult.status === 'rejected' ? 'Still-image barcode pass failed. ' : ''}${ocrResult.status === 'rejected' ? 'OCR failed. ' : ''}Review the available candidates manually.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed. Please try again.');
    } finally {
      if (photoUri) {
        try { new File(photoUri).delete(); }
        catch { setCleanupWarning('The temporary photo could not be removed. Clear this app’s cache before sharing the phone.'); }
      }
      captureInProgress.current = false;
      setBusy(false);
    }
  }

  function scanAgain() {
    liveBarcodes.current.clear();
    setBarcodeCount(0);
    setReview(null);
    setMac('');
    setSerial('');
    setError('');
    setStage('camera');
  }

  if (Platform.OS !== 'android') {
    return <SafeAreaView style={styles.center}><Text style={styles.darkTitle}>CableMint Device Capture</Text><Text style={styles.muted}>This first prototype targets Android only.</Text></SafeAreaView>;
  }
  if (!permission) return <SafeAreaView style={styles.center}><ActivityIndicator color={GREEN} /></SafeAreaView>;
  if (!permission.granted) {
    return <SafeAreaView style={styles.center}>
      <Text style={styles.darkTitle}>Camera access</Text>
      <Text style={styles.body}>CableMint uses the camera to read equipment labels on this phone. Photos are processed locally and removed after each scan.</Text>
      <Action label="Allow camera" onPress={() => { void requestPermission(); }} />
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.container}>
    <StatusBar barStyle="light-content" backgroundColor={BLUE} />
    <View style={styles.header}>
      <Text style={styles.brand}>CABLEMINT TOOLS</Text>
      <Text style={styles.title}>Device Capture · Scanner Test</Text>
      <Text style={styles.headerSub}>Android milestone 1 · no account or cloud connection</Text>
    </View>
    {stage === 'camera' ? <View style={styles.cameraPage}>
      <View style={styles.cameraFrame}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }} onBarcodeScanned={onBarcodeScanned} />
        <View pointerEvents="none" style={styles.guide} />
      </View>
      <View style={styles.controls}>
        <Text style={styles.body}>Fill the guide with a sharp label. Native ML Kit has seen {barcodeCount} distinct barcode{barcodeCount === 1 ? '' : 's'}.</Text>
        <View style={styles.controlRow}>
          <View style={styles.flex}><Action label={torch ? 'Torch off' : 'Torch on'} onPress={() => setTorch(!torch)} outline /></View>
          <View style={styles.flex}><Action label="Clear codes" onPress={() => { liveBarcodes.current.clear(); setBarcodeCount(0); }} outline /></View>
        </View>
        <Action label={busy ? 'Reading label…' : 'Capture label'} onPress={() => { void captureLabel(); }} disabled={busy} />
        {busy && <ActivityIndicator color={GREEN} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
      </View>
    </View> : <ScrollView contentContainerStyle={styles.reviewPage}>
      <Text style={styles.darkTitle}>Review scan</Text>
      <Text style={styles.muted}>Only values beside a printed MAC or S/N label are suggested. Other barcodes remain unassigned until you identify them.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
      <CandidateList title="Printed MAC candidates" candidates={review?.macs ?? []} onChoose={setMac} />
      <CandidateList title="Printed serial candidates" candidates={review?.serials ?? []} onChoose={setSerial} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All barcode values</Text>
        {review?.barcodes.length ? review.barcodes.map((code) => <View key={`${code.type}:${code.data}`} style={styles.codeRow}>
          <Text style={styles.candidateValue}>{code.data}</Text><Text style={styles.candidateMeta}>{code.type} · unassigned</Text>
        </View>) : <Text style={styles.muted}>No barcode decoded.</Text>}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Technician check</Text>
        <Text style={styles.label}>MAC address (leave blank if none is printed)</Text>
        <TextInput value={mac} onChangeText={setMac} autoCapitalize="characters" placeholder="AA:BB:CC:DD:EE:FF" style={styles.input} />
        <Text style={styles.label}>Serial number</Text>
        <TextInput value={serial} onChangeText={setSerial} autoCapitalize="characters" placeholder="Enter or choose a serial" style={styles.input} />
        {!!mac && !normalizeMac(mac) && <Text style={styles.error}>This does not look like a 12-digit MAC address.</Text>}
        <Text style={styles.muted}>No record is saved in this milestone. Compare these fields with the physical label and note any wrong or missed value.</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Raw OCR text</Text>
        <Text selectable style={styles.ocrText}>{review?.ocrText || 'No printed text recognized.'}</Text>
      </View>
      <Action label="Scan another label" onPress={scanAgain} />
    </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8FA' },
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

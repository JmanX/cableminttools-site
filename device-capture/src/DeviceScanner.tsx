import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Keyboard, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, Image, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { cleanDraft, type Batch, type Device, type Project, type SaveAttempt } from './deviceWorkflow';
import { DuplicateDeviceError, SavePreflightError } from './deviceService';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import CableMintOcr from '../modules/cablemint-ocr/src/CableMintOcrModule';
import { analyzeScan, normalizeMac, unresolvedConflicts, resolveField, type ConflictResolution, type Field, type ScanReview, type ValueCandidate, type BarcodeCandidate } from './recognition';
import { CameraZoom, type NativeScannerState } from './cameraZoom';
import { NativeZoomCamera } from './NativeZoomCamera';
import { SmartZoom } from './smartZoom';
import { withTimeout } from './withTimeout';
import { isAppCachePhoto } from './photoPrivacy';

const BLUE = '#102B4B';
const GREEN = '#26B67A';
const BARCODE_TYPES = ['qr', 'code128', 'code39', 'code93', 'datamatrix', 'pdf417', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'aztec'] as const;
const BARCODE_SETTINGS = { barcodeTypes: [...BARCODE_TYPES] };

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

export function DeviceScanner({ project, userId, batch, onBatchChange, onSave, onExit, onDevices, savedMessage, batchStorageError }: {
  project: Project; userId: string; batch: Batch; onSave: (attempt: SaveAttempt) => Promise<string>;
  onExit: () => void; onDevices: () => void; savedMessage: string; batchStorageError: string;
  onBatchChange: (field: keyof Batch, value: string | boolean) => void;
}) {
  const zoomControl=useRef(new SmartZoom());
  const previewSize=useRef({width:0,height:0});
  const pinch=useRef({distance:0,ratio:1});
  const lastZoomLog=useRef(0);
  const zoomDriver=useRef<CameraZoom|null>(null);
  const [zoomRatio,setZoomRatio]=useState(1);
  const [zoomReady,setZoomReady]=useState(false);
  const [zoomError,setZoomError]=useState('');
  const [showDiagnostics,setShowDiagnostics]=useState(false);
  const [scannerStatus,setScannerStatus]=useState('Waiting for scanner frames');
  const [scannerDetails,setScannerDetails]=useState('');
  const [scannerNative,setScannerNative]=useState<NativeScannerState|null>(null);
  function applyZoom(ratio:number){zoomDriver.current?.request(ratio);}
  function resetZoom(){zoomControl.current.reset();setZoomReady(false);setZoomError('');setScannerStatus('Waiting for scanner frames');setScannerDetails('');setScannerNative(null);}
  function onScannerState(state:NativeScannerState){
    if(stage!=='camera'||captureInProgress.current)return;
    const automatic=state.autoZoom;
    if(!automatic){setScannerStatus('Native automatic-zoom diagnostics unavailable');return;}
    const now=Date.now();
    zoomControl.current.manual=automatic.manual;zoomControl.current.decoded=automatic.decoded;
    if(now-lastZoomLog.current<750)return;
    lastZoomLog.current=now;
    const status=state.frameAgeMs===-1 ? 'No scanner frame received yet' : (state.frameAgeMs ?? 0)>3000 ? 'Scanner frames stalled — no new detection' : automatic.status;
    setScannerStatus(status);setScannerNative(state);
    const {frame:unusedFrame,...nativeDetails}=state;
    const details={...nativeDetails,...automatic,currentZoom:state.zoom,frameSequence:state.sequence};
    setScannerDetails(JSON.stringify(details));
    console.info('[CableMint scanner] native automatic zoom',details);
    if(automatic.enabled && automatic.application==='not-applied')setZoomError(automatic.status);
  }
  const distance=(touches:readonly {pageX:number;pageY:number}[])=>touches.length>=2 ? Math.hypot(touches[0].pageX-touches[1].pageX,touches[0].pageY-touches[1].pageY) : 0;
  const camera = useRef<NativeZoomCamera>(null);
  const liveBarcodes = useRef(new Map<string, BarcodeScanningResult>());
  const captureInProgress = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<'camera' | 'review' | 'location' | 'installed'>('camera');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [barcodeCount, setBarcodeCount] = useState(0);
  const [liveCodes, setLiveCodes] = useState<BarcodeScanningResult[]>([]);
  const [captureStatus, setCaptureStatus] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  useEffect(()=>{
    if(!cameraReady || (stage!=='camera' && stage!=='installed') || !camera.current)return;
    let cancelled=false;
    const driver=new CameraZoom(camera.current,state=>{
      if(cancelled)return;
      zoomControl.current.min=state.minZoom;zoomControl.current.max=state.maxZoom;
      zoomControl.current.ratio=state.zoom;setZoomRatio(state.zoom);
    },failure=>{if(!cancelled)setZoomError(failure.message);},data=>{console.info('[CableMint scanner] camera zoom',data);});
    zoomDriver.current=driver;zoomControl.current.reset();setZoomReady(false);setZoomError('');
    let timer:ReturnType<typeof setTimeout>|undefined;
    async function poll(){
      try{
        const state=await driver.poll();
        if(cancelled)return;
        onScannerState(state);
      }catch(failure){if(!cancelled)setZoomError('Scanner feedback unavailable: '+(failure as Error).message);}
      if(!cancelled)timer=setTimeout(()=>{void poll();},200);
    }
    void driver.initialize(stage==='camera').then(()=>{if(!cancelled){setZoomReady(true);void poll();}}).catch(failure=>{if(!cancelled)setZoomError((failure as Error).message);});
    return()=>{cancelled=true;driver.dispose();if(timer)clearTimeout(timer);if(zoomDriver.current===driver)zoomDriver.current=null;};
  },[cameraReady,stage]);
  const [review, setReview] = useState<ScanReview | null>(null);
  const [resolution, setResolution] = useState<ConflictResolution>({});
  const [mac, setMac] = useState('');
  const [serial, setSerial] = useState('');
  const unresolved = unresolvedConflicts(review, resolution, mac, serial);
  function resolveConflict(field: Field, value: string) {
    if (busy || pendingAttempt) return;
    if (field === 'mac') chooseMac(value); else chooseSerial(value);
    setResolution(previous => resolveField(previous, field, value));
  }
  function identificationReady() {
    if (unresolvedConflicts(review, resolution, mac, serial).length) { setConfirmationError('Resolve the barcode / OCR conflict before continuing or saving.'); return false; }
    return true;
  }
  const [installationLocation, setInstallationLocation] = useState(batch.unit_location);
  const [verified, setVerified] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<SaveAttempt | null>(null);
  const saving = useRef(false);
  const [confirmationError, setConfirmationError] = useState('');
  const [error, setError] = useState('');
  const [cleanupWarning, setCleanupWarning] = useState('');
  const installedPhoto=useRef<string | null>(null);
  const [installedUri,setInstalledUri]=useState('');
  useEffect(()=>()=>{if(installedPhoto.current)removePhoto(installedPhoto.current);},[]);
  const [duplicates, setDuplicates] = useState<Device[]>([]);
  function back() {
    if (busy || saving.current) return;
    if(stage==='installed'){setStage('location');return;}
    if (stage === 'location' && !pendingAttempt) { setStage('review'); return; }
    if (stage === 'review') { leaveScan(() => scanAgain()); return; }
    leaveScan(onExit);
  }
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; }); return () => sub.remove(); }, [stage, busy, pendingAttempt]);

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (captureInProgress.current || !result.data.trim()) return;
    // Native geometry/relevance decides whether the target is decoded. Retail/QR reads
    // must not disable automatic zoom or assign identification fields here.
    console.info('[CableMint scanner] barcode decode success',{format:result.type,currentZoom:zoomDriver.current?.actual});
    const key = `${result.type}:${result.data.trim()}`;
    if (!result.data.trim() || liveBarcodes.current.has(key)) return;
    liveBarcodes.current.set(key, result);
    setBarcodeCount(liveBarcodes.current.size);
    setLiveCodes([...liveBarcodes.current.values()]);
  }

  function showReview(result: ScanReview) {
    if(installedPhoto.current)removePhoto(installedPhoto.current);installedPhoto.current=null;setInstalledUri('');
    setDuplicates([]);
    setVerified(false);
    setPendingAttempt(null);
    setConfirmationError('');
    setReview(result); setResolution({});
    setMac(!result.conflicts.some(c => c.field === 'mac') && result.macs.length === 1 ? result.macs[0].value : '');
    setSerial(!result.conflicts.some(c => c.field === 'serial') && result.serials.length === 1 ? result.serials[0].value : '');
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
    if (!identificationReady()) return;
    if(batch.requireInstalledPhoto && !installedPhoto.current){setConfirmationError('Take the temporary installed-device photo first.');return;}
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
      if (failure instanceof DuplicateDeviceError) setDuplicates(failure.records);
      if (!pendingAttempt && failure instanceof SavePreflightError) setPendingAttempt(null);
      setConfirmationError((failure as Error).message || 'Save failed. Keep this scan and retry when connected.');
    }
    finally { saving.current = false; setBusy(false); }
  }

  function leaveScan(next: () => void) {
    if (busy || saving.current) return;
    if (stage !== 'camera') Alert.alert(pendingAttempt ? 'Leave this save?' : 'Leave this scan?',
      pendingAttempt ? 'A save may already have reached the project. Check Current Project Devices before scanning this device again.' : 'Unsaved scan values will be discarded. Batch settings are retained.',
      [{ text: 'Stay', style: 'cancel' }, { text: 'Continue', onPress: next }]);
    else next();
  }

  function removePhoto(uri: string) {
    if (!isAppCachePhoto(uri, Paths.cache.uri)) return;
    try { const file = new File(uri); if (file.exists) file.delete(); }
    catch { setCleanupWarning('The temporary photo could not be removed. Clear this app’s cache before sharing the phone.'); }
  }

  async function captureInstalled(){
    if(captureInProgress.current || !camera.current || !cameraReady)return;
    captureInProgress.current=true;setBusy(true);setError('');
    try{
      const photo=await withTimeout(camera.current.takePictureAsync({quality:0.8,exif:false}),10000,'Installed photo capture timed out.',late=>{if(late?.uri)removePhoto(late.uri);});
      if(!photo?.uri)throw Error('Camera did not return an installed-device photo.');
      if(installedPhoto.current)removePhoto(installedPhoto.current);
      installedPhoto.current=photo.uri;setInstalledUri(photo.uri);setStage('location');setCameraReady(false);
    }catch(failure){setError((failure as Error).message);}
    finally{captureInProgress.current=false;setBusy(false);}
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
      await withTimeout(zoomDriver.current?.stopAutomatic().then(()=>{}) ?? Promise.resolve(),3000,'Camera zoom did not stop for photo capture.');
      const photo = await withTimeout(camera.current.takePictureAsync({ quality: 1, skipProcessing: false }),
        10000, 'Photo capture timed out. Review the live codes or try again.',
        latePhoto => { if (latePhoto?.uri) removePhoto(latePhoto.uri); });
      if (!photo?.uri) throw new Error('The camera did not return a photo.');
      photoUri = photo.uri;
      await scanPhoto(photoUri, liveValues());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed. Please try again.');
      if (liveBarcodes.current.size) showReview(analyzeScan(null, liveValues()));
      else if (!zoomControl.current.manual && !zoomControl.current.decoded) {
        void camera.current?.setCableMintAutoZoom(true).catch(failure=>setZoomError((failure as Error).message));
      }
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
    if(installedPhoto.current)removePhoto(installedPhoto.current);installedPhoto.current=null;setInstalledUri('');
    resetZoom();
    setDuplicates([]);
    setInstallationLocation(nextLocation);
    setVerified(false);
    setPendingAttempt(null);
    setConfirmationError('');
    liveBarcodes.current.clear();
    setBarcodeCount(0);
    setLiveCodes([]);
    setCameraReady(false);
    setReview(null); setResolution({});
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
  if ((stage === 'camera' || stage === 'installed') && !permission.granted) {
    return <SafeAreaView style={styles.center}>
      <Text style={styles.darkTitle}>Camera access</Text>
      <Text style={styles.body}>CableMint uses the camera to read equipment labels on this phone. Photos are processed locally and removed after each scan.</Text>
      <Action label="Scan with Camera" disabled={busy} onPress={() => { void requestPermission(); }} />
      {stage==='camera' && <><Action label="Choose Existing Photo" disabled={busy} outline onPress={() => { void chooseExistingPhoto(); }} /><Action label="Enter MAC / Serial Manually" disabled={busy} outline onPress={() => showReview(analyzeScan(null, []))} /></>}
      {busy && <><ActivityIndicator color={GREEN} /><Text style={styles.body}>{captureStatus}</Text></>}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
      <Action label="← Back" disabled={busy} outline onPress={back} />
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.container}>
    <StatusBar barStyle="light-content" backgroundColor={BLUE} />
    <View style={styles.header}>
      <Text style={styles.brand}>CABLEMINT TOOLS</Text>
      <Text style={styles.title}>Device Capture</Text>
      <Text style={styles.headerSub}>{project.name} · {batch.device_type} · {[batch.building, batch.floor_area, installationLocation].filter(Boolean).join(' / ')}</Text>
      <Action label="← Back" disabled={busy} outline onPress={back} />
      {!!batchStorageError && <Text style={{ color: '#FFDDCC' }}>{batchStorageError}</Text>}
    </View>
    {stage === 'camera' || stage==='installed' ? <View style={styles.cameraPage}>
      <View style={styles.cameraFrame} onLayout={e=>{previewSize.current=e.nativeEvent.layout;}}>
        <NativeZoomCamera ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" enableTorch={torch} autofocus="on"
          barcodeScannerSettings={BARCODE_SETTINGS} onBarcodeScanned={stage==='camera' ? onBarcodeScanned : undefined}
          onCameraReady={() => setCameraReady(true)} onMountError={event => setError(event.message)} />
        <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={e=>zoomReady && e.nativeEvent.touches.length>=2} onMoveShouldSetResponder={e=>zoomReady && e.nativeEvent.touches.length>=2}
          onResponderGrant={e=>{pinch.current={distance:distance(e.nativeEvent.touches),ratio:zoomDriver.current?.requested ?? zoomControl.current.ratio};zoomControl.current.manual=true;void zoomDriver.current?.pauseAutomatic().catch(failure=>setZoomError((failure as Error).message));}}
          onResponderMove={e=>{const d=distance(e.nativeEvent.touches);if(d>0&&pinch.current.distance>0)applyZoom(zoomControl.current.manualZoom(pinch.current.ratio*d/pinch.current.distance,Date.now()));}}
          onResponderRelease={()=>zoomControl.current.endManual(Date.now())} onResponderTerminate={()=>zoomControl.current.endManual(Date.now())}/>
        <View pointerEvents="none" style={styles.guide} />
      </View>
      <ScrollView style={{maxHeight:'48%',backgroundColor:'#F4F8FA'}} contentContainerStyle={styles.controls}>
        <View style={styles.controlRow}><View style={styles.flex}><Action label="Zoom Out" disabled={!zoomReady || busy || zoomRatio<=zoomControl.current.min} outline onPress={()=>{applyZoom(zoomControl.current.manualZoom((zoomDriver.current?.requested ?? zoomRatio)-.2,Date.now()));zoomControl.current.endManual(Date.now());}}/></View><Text style={styles.muted}>{zoomReady ? zoomRatio.toFixed(1)+'× · pinch to zoom' : 'Starting camera zoom…'}</Text><View style={styles.flex}><Action label="Zoom In" disabled={!zoomReady || busy || zoomRatio>=zoomControl.current.max} outline onPress={()=>{applyZoom(zoomControl.current.manualZoom((zoomDriver.current?.requested ?? zoomRatio)+.2,Date.now()));zoomControl.current.endManual(Date.now());}}/></View></View>
        {!!zoomError && <Text accessibilityRole="alert" style={styles.error}>{zoomError}</Text>}
        {stage==='camera' && <View style={styles.diagnostics}>
          <Text style={styles.label}>Live scanner diagnostics</Text>
          <Text selectable style={styles.muted}>Potential undecoded: {scannerNative?.autoZoom?.potentialCount ?? '—'} · decoded: {scannerNative?.autoZoom?.decodedCount ?? '—'}</Text>
          <Text selectable style={styles.muted}>Relevant candidates: {scannerNative?.autoZoom?.relevantCount ?? '—'} · irrelevant: {scannerNative?.autoZoom?.irrelevantCount ?? '—'} · unassigned: {scannerNative?.autoZoom?.unassignedCount ?? '—'}</Text>
          <Text selectable style={styles.muted}>Automatic zoom: {scannerNative?.autoZoom?.enabled ? 'enabled' : 'disabled'} · callbacks: {scannerNative?.zoomCallbackInvocationCount ?? 0}</Text>
          <Text selectable style={styles.muted}>Last suggestion: {scannerNative?.autoZoom?.suggestedZoom ? scannerNative.autoZoom.suggestedZoom.toFixed(2)+'×' : 'none'} · actual: {zoomRatio.toFixed(2)}×</Text>
          <Text selectable style={styles.muted}>Automatic requests: {scannerNative?.autoZoom?.requestCount ?? 0} · CameraControl: {scannerNative?.automaticCameraRequestCount ?? 0} · applied: {scannerNative?.autoZoom?.appliedCount ?? 0}</Text>
          <Text selectable style={styles.muted}>Last reason: {scannerStatus}</Text>
          <Pressable onPress={()=>setShowDiagnostics(!showDiagnostics)}><Text style={styles.muted}>{showDiagnostics ? 'Hide detailed diagnostics' : 'Show detailed diagnostics'}</Text></Pressable>
          {showDiagnostics && <><Text style={styles.muted}>Relevant means identifier-shaped, not confirmed MAC/SN ownership. All raw values remain available for review.</Text><Text selectable style={styles.ocrText}>{scannerDetails}</Text></>}
        </View>}
        <Text style={styles.body}>{stage==='installed' ? 'Photograph the installed device in place. This temporary photo will be removed after saving.' : 'Read the label, then confirm its identifiers.'}</Text>
        {stage==='camera' && <><Text style={styles.body}>Fill the guide with a sharp label. Native ML Kit has seen {barcodeCount} distinct barcode{barcodeCount === 1 ? '' : 's'}.</Text>
        {!!liveCodes.length && <ScrollView style={{ maxHeight: 100 }}>
          {liveCodes.map(code => <Text selectable key={`${code.type}:${code.data}`} style={styles.ocrText}>{code.type}: {code.data}</Text>)}
        </ScrollView>}
        <View style={styles.controlRow}>
          <View style={styles.flex}><Action label={torch ? 'Turn Off Flashlight' : 'Turn On Flashlight'} disabled={busy} onPress={() => setTorch(!torch)} outline /></View>
          <View style={styles.flex}><Action label="Clear codes" disabled={busy} onPress={() => { liveBarcodes.current.clear(); setBarcodeCount(0); setLiveCodes([]); }} outline /></View>
        </View>
        </>}<Action label={busy ? captureStatus : stage==='installed' ? 'Take Installed Photo' : 'Scan with Camera'} onPress={() => { void (stage==='installed' ? captureInstalled() : captureLabel()); }} disabled={busy || !cameraReady} />
        {stage==='camera' && <><Action label="Choose Existing Photo" disabled={busy} outline onPress={() => { void chooseExistingPhoto(); }} />
        <Action label="Enter MAC / Serial Manually" disabled={busy} outline onPress={()=>showReview(analyzeScan(null,[]))}/>
        {!!liveCodes.length && <Action label="Review read codes" disabled={busy} outline onPress={() => showReview(analyzeScan(null, liveValues()))} />}</>}
        {busy && <ActivityIndicator color={GREEN} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
        {!!savedMessage && <Text accessibilityLiveRegion="polite" style={styles.body}>{savedMessage}</Text>}
      </ScrollView>
    </View> : <ScrollView key="review" style={{backgroundColor:'#F4F8FA'}} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.reviewPage}>
      <Text style={styles.darkTitle}>{stage === 'location' ? 'Installation Location & Save' : 'Identify Device'}</Text>
      <Text style={styles.muted}>Candidates use printed MAC or SN labels and proximity. Conflicting readings require your explicit choice. Confirm every value against the device.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!cleanupWarning && <Text style={styles.error}>{cleanupWarning}</Text>}
      {!!review?.conflicts.length && <View style={[styles.section, {backgroundColor:'#FFF1EE',borderWidth:2,borderColor:'#B32626'}]}>
        <Text accessibilityRole="alert" style={styles.error}>{unresolved.length ? 'Identifier conflict — action required' : 'Conflict resolved — verify your selected value'}</Text>
        {unresolved.length>0 && <Text style={styles.body}>Saving is blocked until you explicitly choose a reading or confirm a manual correction.</Text>}
        {review.conflicts.map(conflict => <View key={conflict.id} style={styles.codeRow}>
          <Text style={styles.label}>{conflict.field.toUpperCase()} · {conflict.reason}</Text>
          <Text selectable style={styles.candidateValue}>{conflict.barcode.raw}</Text><Text style={styles.candidateMeta}>{conflict.barcode.source}</Text>
          <Action label="Choose decoded barcode" disabled={busy || !!pendingAttempt || !conflict.barcode.value} outline onPress={() => resolveConflict(conflict.field, conflict.barcode.value!)} />
          <Text selectable style={styles.candidateValue}>{conflict.ocr.raw}</Text><Text style={styles.candidateMeta}>{conflict.ocr.source}</Text>
          <Action label="Choose printed-text reading" disabled={busy || !!pendingAttempt || !conflict.ocr.value} outline onPress={() => resolveConflict(conflict.field, conflict.ocr.value!)} />
          {!conflict.ocr.value && <Text style={styles.error}>Printed-text reading is not valid. Correct it in Technician check.</Text>}
        </View>)}
        {(['mac','serial'] as const).filter(field => review.conflicts.some(c => c.field === field)).map(field => <View key={field}>
          <Text selectable style={styles.label}>Selected {field.toUpperCase()}: {(field === 'mac' ? mac : serial) || '(blank)'}</Text>
          <Action label={'Confirm my manually checked '+field.toUpperCase()} disabled={busy || !!pendingAttempt || (field === 'mac' ? !normalizeMac(mac) : !serial.trim())} outline onPress={() => resolveConflict(field, field === 'mac' ? normalizeMac(mac)! : serial.trim())} />
          {field === 'mac' && <Action label="Confirm this is serial-only; omit MAC" disabled={busy || !!pendingAttempt || !serial.trim()} outline onPress={() => resolveConflict('mac','')} />}
        </View>)}
      </View>}
      {stage === 'review' && <>
      <Text style={styles.muted}>Confidence: {review?.macs.some(c => c.corroboratedByBarcode) || review?.serials.some(c => c.corroboratedByBarcode) ? 'Barcode corroborates a printed label; verify before saving.' : 'Manual review required. Ambiguous values remain unassigned.'}</Text>
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
      </View></>}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Technician check</Text>
        <Text style={styles.muted}>{[batch.building, batch.floor_area, batch.device_type, batch.manufacturer, batch.model].filter(Boolean).join(' / ')}</Text>
        {stage === 'location' && <>
        {([['building','Building',100],['floor_area','Floor / Area',100]] as const).map(([field,label,limit]) => <View key={field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={batch[field]} maxLength={limit} editable={!busy && !pendingAttempt} onChangeText={value => { onBatchChange(field,value); setVerified(false); }} /></View>)}
        <Text style={styles.label}>Unit / Room / Location</Text>
        <TextInput value={installationLocation} editable={!busy && !pendingAttempt} onChangeText={value => { setInstallationLocation(value); setVerified(false); setConfirmationError(''); }} maxLength={120}
          placeholder="Room 204" style={styles.input} /></>}
        <Text style={styles.label}>Wrong? Edit MAC (blank for serial-only devices)</Text>
        <TextInput value={mac} editable={!busy && !pendingAttempt} onChangeText={chooseMac} onBlur={() => { const normalized = normalizeMac(mac); if (normalized) setMac(normalized); }} autoCapitalize="characters" placeholder="AA:BB:CC:DD:EE:FF" style={styles.input} />
        <Text style={styles.label}>Wrong? Edit Serial</Text>
        <TextInput value={serial} editable={!busy && !pendingAttempt} onChangeText={chooseSerial} autoCapitalize="characters" placeholder="Enter or choose a serial" style={styles.input} />
        {!!mac && !normalizeMac(mac) && <Text style={styles.error}>This does not look like a 12-digit MAC address.</Text>}
        {stage === 'location' ? <><Text style={styles.muted}>I checked the MAC, serial, and location against this device.</Text>
        <Switch accessibilityLabel="Technician verified device fields" value={verified} disabled={busy || !!pendingAttempt} onValueChange={setVerified} />
        {!!pendingAttempt && <Text style={styles.muted}>These fields are held for a safe retry. Retry the same save or inspect Current Project Devices before leaving this scan.</Text>}
        {!!confirmationError && <Text accessibilityRole="alert" style={styles.error}>{confirmationError}</Text>}
        {duplicates.map(d => <View key={d.id} style={styles.candidate}><Text style={styles.candidateValue}>Existing {d.device_type} · {d.unit_location}</Text><Text selectable style={styles.muted}>{d.mac_address}{'\n'}{d.serial_number}{'\n'}{d.building} / {d.floor_area}</Text></View>)}
        {!!installedUri && <><Image source={{uri:installedUri}} style={{height:180,borderRadius:10}} resizeMode="contain"/><Text style={styles.muted}>Temporary installed photo · not uploaded or retained.</Text><Action label="Retake Installed Photo" disabled={busy || !!pendingAttempt} outline onPress={()=>{setCameraReady(false);resetZoom();setStage('installed');}}/></>}
        <Action label={busy ? 'Saving capture…' : batch.requireInstalledPhoto && !installedUri ? 'Next: Installed Photo' : pendingAttempt ? 'Retry Save Device' : 'Save Device & Next'} disabled={busy || !verified || unresolved.length > 0} onPress={() => { if(!identificationReady())return; if(batch.requireInstalledPhoto && !installedUri){setCameraReady(false);resetZoom();setStage('installed');}else void saveAndNext(); }} /></>
        : <><Text style={styles.muted}>Confirm identification, then enter the installation location.</Text><Action label="Continue to Location" disabled={busy || unresolved.length > 0 || (!mac.trim() && !serial.trim()) || (!!mac && !normalizeMac(mac))} onPress={() => { if(!identificationReady())return; setStage('location'); setVerified(false); Keyboard.dismiss(); }} /></>}
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
  diagnostics: { padding: 10, gap: 3, backgroundColor: 'white', borderRadius: 8 },
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

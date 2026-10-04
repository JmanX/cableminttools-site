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

import type { ReactNode } from 'react';
import { AdvancedPanel, AppHeader, Button, CaptureStepHeader, Field as FieldInput, colors, ui } from './components';
import { IdentifierPanel, ConflictPanel } from './IdentifierPanel';
import { Icon } from './Icon';
import { readableError } from './presentation';
const BLUE=colors.blue, GREEN=colors.green;
const BARCODE_TYPES = ['qr', 'code128', 'code39', 'code93', 'datamatrix', 'pdf417', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'aztec'] as const;
const BARCODE_SETTINGS = { barcodeTypes: [...BARCODE_TYPES] };

function Action({label,onPress,outline=false,disabled=false}:{label:string;onPress:()=>void;outline?:boolean;disabled?:boolean}){return <Button title={label} onPress={onPress} secondary={outline} disabled={disabled}/>;}

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

export function DeviceScanner({ project, userId, batch, onBatchChange, onSave, onExit, onDevices, savedMessage, batchStorageError, active=true, onBusyChange, saveFeedback, onCaptureNext }: {
  project: Project; userId: string; batch: Batch; onSave: (attempt: SaveAttempt) => Promise<string>;
  onCaptureNext: () => void; onExit: () => void; onDevices: () => void; savedMessage: string; batchStorageError: string; active?:boolean; onBusyChange?:(busy:boolean)=>void; saveFeedback?:ReactNode;
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
  const [showDetails,setShowDetails]=useState(false);
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
    if(!active || !cameraReady || (stage!=='camera' && stage!=='installed') || !camera.current)return;
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
  },[cameraReady,stage,active]);
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
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>{if(!active){setCameraReady(false);setTorch(false);}},[active]);
  useEffect(() => { if(!active)return; const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; }); return () => sub.remove(); }, [stage, busy, pendingAttempt,active]);

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
      onCaptureNext();
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

  if(!active)return null;
  if(!permission)return <View style={styles.center}><ActivityIndicator color={GREEN}/><Text style={ui.body}>Preparing the camera…</Text></View>;
  const cameraStage=stage==='camera'||stage==='installed';
  const header=<CaptureStepHeader step={stage==='camera'?'Scan':stage==='review'?'Verify':stage==='installed'?'Photo':'Location'} project={project.name} type={batch.device_type} onBack={back} disabled={busy}/>;
  if(cameraStage&&!permission.granted)return <View style={ui.page}>{header}<ScrollView contentContainerStyle={ui.content}><Text style={ui.heading}>Read the equipment label</Text><Text style={ui.body}>Allow camera access to scan on this phone. Photos are processed locally and removed.</Text><Button title="Allow Camera" icon="capture" disabled={busy} onPress={()=>{void requestPermission();}}/>{!permission.canAskAgain&&<Text style={ui.muted}>Enable Camera in Android Settings → Apps → CableMint Device Capture → Permissions.</Text>}{stage==='camera'&&<><Button title="Choose Existing Photo" icon="gallery" secondary disabled={busy} onPress={()=>{void chooseExistingPhoto();}}/><Button title="Enter MAC / Serial Manually" secondary disabled={busy} onPress={()=>showReview(analyzeScan(null,[]))}/></>}{!!error&&<Text style={ui.error}>{readableError(error)}</Text>}{busy&&<ActivityIndicator color={GREEN}/>}</ScrollView></View>;
  return <View style={ui.page}>
    {header}
    {!!batchStorageError&&<Text style={[ui.error,{padding:8}]}>{readableError(batchStorageError)}</Text>}
    {stage==='camera'&&saveFeedback&&<View style={{paddingHorizontal:14,paddingVertical:6}}>{saveFeedback}</View>}
    {cameraStage?<View style={styles.cameraPage}>
      <View style={styles.cameraFrame} onLayout={e=>{previewSize.current=e.nativeEvent.layout;}}>
        <NativeZoomCamera ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" enableTorch={torch} autofocus="on"
          barcodeScannerSettings={BARCODE_SETTINGS} onBarcodeScanned={stage==='camera'?onBarcodeScanned:undefined}
          onCameraReady={()=>setCameraReady(true)} onMountError={event=>setError(event.message)}/>
        <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={e=>zoomReady&&e.nativeEvent.touches.length>=2} onMoveShouldSetResponder={e=>zoomReady&&e.nativeEvent.touches.length>=2}
          onResponderGrant={e=>{pinch.current={distance:distance(e.nativeEvent.touches),ratio:zoomDriver.current?.requested??zoomControl.current.ratio};zoomControl.current.manual=true;void zoomDriver.current?.pauseAutomatic().catch(failure=>setZoomError((failure as Error).message));}}
          onResponderMove={e=>{const d=distance(e.nativeEvent.touches);if(d>0&&pinch.current.distance>0)applyZoom(zoomControl.current.manualZoom(pinch.current.ratio*d/pinch.current.distance,Date.now()));}}
          onResponderRelease={()=>zoomControl.current.endManual(Date.now())} onResponderTerminate={()=>zoomControl.current.endManual(Date.now())}/>
        <View pointerEvents="none" style={styles.guide}/>
        <View pointerEvents="none" style={styles.cameraInstruction}><Text style={styles.cameraText}>{stage==='installed'?'Frame the installed device':'Center the MAC / serial label'}</Text><Text style={styles.cameraHint}>{stage==='installed'?'Include its installation context':'Hold steady · automatic zoom is available'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={torch?'Turn Off Flashlight':'Turn On Flashlight'} accessibilityState={{selected:torch,disabled:busy}} disabled={busy} onPress={()=>setTorch(!torch)} style={[styles.torch,{backgroundColor:torch?GREEN:'#20313BDD'}]}><Icon name="flash" color={torch?BLUE:'white'} size={23}/></Pressable>
      </View>
      <ScrollView style={{maxHeight:showDiagnostics?'55%':'45%'}} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.controls}>
        <View style={[ui.row,{justifyContent:'space-between'}]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom Out" disabled={!zoomReady||busy||zoomRatio<=zoomControl.current.min} style={styles.zoomButton} onPress={()=>{applyZoom(zoomControl.current.manualZoom((zoomDriver.current?.requested??zoomRatio)-.2,Date.now()));zoomControl.current.endManual(Date.now());}}><Text style={styles.zoomText}>−</Text></Pressable>
          <Text style={ui.label}>{zoomReady?zoomRatio.toFixed(1)+'×':'Starting camera…'}<Text style={ui.caption}>{zoomReady?' · pinch to zoom':''}</Text></Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom In" disabled={!zoomReady||busy||zoomRatio>=zoomControl.current.max} style={styles.zoomButton} onPress={()=>{applyZoom(zoomControl.current.manualZoom((zoomDriver.current?.requested??zoomRatio)+.2,Date.now()));zoomControl.current.endManual(Date.now());}}><Text style={styles.zoomText}>+</Text></Pressable>
        </View>
        <Button title={busy?captureStatus||'Reading label…':stage==='installed'?'Take Installed Photo':'Scan Label'} icon="capture" busy={busy} disabled={!cameraReady} onPress={()=>{void(stage==='installed'?captureInstalled():captureLabel());}}/>
        {stage==='camera'&&<View style={ui.row}><View style={ui.flex}><Button title="Gallery" icon="gallery" secondary disabled={busy} onPress={()=>{void chooseExistingPhoto();}}/></View><View style={ui.flex}><Button title="Enter Manually" secondary disabled={busy} onPress={()=>showReview(analyzeScan(null,[]))}/></View></View>}
        {!!error&&<Text accessibilityRole="alert" style={ui.error}>{readableError(error)}</Text>}{!!cleanupWarning&&<Text style={ui.error}>{cleanupWarning}</Text>}
        {stage==='camera'&&<AdvancedPanel title="Developer · scanner diagnostics" open={showDiagnostics} onToggle={()=>setShowDiagnostics(!showDiagnostics)}>
          {!!zoomError&&<Text style={ui.error}>{zoomError}</Text>}
          <Text selectable style={ui.muted}>Potential undecoded: {scannerNative?.autoZoom?.potentialCount??'—'} · decoded: {scannerNative?.autoZoom?.decodedCount??'—'}</Text>
          <Text selectable style={ui.muted}>Relevant: {scannerNative?.autoZoom?.relevantCount??'—'} · irrelevant: {scannerNative?.autoZoom?.irrelevantCount??'—'} · unassigned: {scannerNative?.autoZoom?.unassignedCount??'—'}</Text>
          <Text selectable style={ui.muted}>Auto zoom: {scannerNative?.autoZoom?.enabled?'enabled':'disabled'} · callbacks: {scannerNative?.zoomCallbackInvocationCount??0}</Text>
          <Text selectable style={ui.muted}>Last suggestion: {scannerNative?.autoZoom?.suggestedZoom?scannerNative.autoZoom.suggestedZoom.toFixed(2)+'×':'none'} · actual: {zoomRatio.toFixed(2)}×</Text>
          <Text selectable style={ui.muted}>Requests: {scannerNative?.autoZoom?.requestCount??0} · CameraControl: {scannerNative?.automaticCameraRequestCount??0} · applied: {scannerNative?.autoZoom?.appliedCount??0}</Text>
          <Text selectable style={ui.muted}>Last reason: {scannerStatus}</Text><Text selectable style={styles.ocrText}>{scannerDetails}</Text>
          <Text style={ui.muted}>{barcodeCount} distinct live barcode{barcodeCount===1?'':'s'}</Text>{liveCodes.map(code=><Text selectable key={`${code.type}:${code.data}`} style={styles.ocrText}>{code.type}: {code.data}</Text>)}
          {!!liveCodes.length&&<Button title="Review Live Codes" secondary disabled={busy} onPress={()=>showReview(analyzeScan(null,liveValues()))}/>}
          <Button title="Clear Codes" secondary disabled={busy} onPress={()=>{liveBarcodes.current.clear();setBarcodeCount(0);setLiveCodes([]);}}/>
        </AdvancedPanel>}
      </ScrollView>
    </View>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      <Text style={ui.heading}>{stage==='review'?'Verify identification':'Where is this device?'}</Text>
      <Text style={ui.muted}>{stage==='review'?'Check the selected values against the equipment label.':'Building and Floor / Area carry forward. Confirm this device’s location.'}</Text>
      {stage==='review'&&<IdentifierPanel mac={mac} serial={serial} onMac={chooseMac} onSerial={chooseSerial} disabled={busy||!!pendingAttempt}/>}
      <ConflictPanel conflicts={review?.conflicts??[]} unresolved={unresolved} mac={mac} serial={serial} onResolve={resolveConflict} disabled={busy||!!pendingAttempt}/>
      {!!error&&<Text accessibilityRole="alert" style={ui.error}>{readableError(error)}</Text>}{!!cleanupWarning&&<Text style={ui.error}>{cleanupWarning}</Text>}
      {stage==='location'?<>
        <View style={ui.card}><View style={ui.row}><Icon name="location"/><Text style={ui.sectionTitle}>Installation location</Text></View>
          <View style={[ui.row,{alignItems:'flex-start'}]}>{([['building','Building',100],['floor_area','Floor / Area',100]] as const).map(([field,label,limit])=><FieldInput key={field} label={label} value={batch[field]} maxLength={limit} disabled={busy||!!pendingAttempt} onChange={value=>{onBatchChange(field,value);setVerified(false);}}/>)}</View>
          <FieldInput label="Unit / Room / Location" value={installationLocation} maxLength={120} placeholder="e.g. Room 204" disabled={busy||!!pendingAttempt} onChange={value=>{setInstallationLocation(value);setVerified(false);setConfirmationError('');}}/>
          <Text style={ui.caption}>{batch.autoAdvance?'Numeric rooms advance; other locations clear after saving.':'Unit / Room clears after saving this device.'}</Text>
        </View>
        <View style={ui.card}><Text style={ui.eyebrow}>READY TO SAVE</Text><Text selectable style={ui.identifier}>{mac||'Serial-only device'}</Text><Text selectable style={ui.body}>{serial||'No serial supplied'}</Text><Text style={ui.muted}>{batch.device_type} · {[batch.building,batch.floor_area,installationLocation].filter(Boolean).join(' / ')||'No location set'}</Text>
          <View style={ui.row}><Text style={[ui.label,ui.flex]}>I checked identifiers and location</Text><Switch accessibilityLabel="Technician verified device fields" value={verified} disabled={busy||!!pendingAttempt} trackColor={{true:GREEN}} onValueChange={setVerified}/></View>
        </View>
        {!!pendingAttempt&&<Text style={ui.muted}>Values are held for a safe retry. Retry this save or check project History before leaving.</Text>}
        {!!confirmationError&&<Text accessibilityRole="alert" style={ui.error}>{readableError(confirmationError)}</Text>}
        {duplicates.map(d=><View key={d.id} style={[ui.card,{backgroundColor:colors.warningSoft}]}><Text style={ui.label}>Already captured · {d.device_type}</Text><Text style={ui.body}>{d.unit_location}</Text><Text selectable style={ui.identifier}>{d.mac_address||d.serial_number}</Text><Button title="View Project History" secondary onPress={()=>leaveScan(onDevices)}/></View>)}
        {!!installedUri&&<View style={ui.card}><Image source={{uri:installedUri}} style={{height:140,borderRadius:10}} resizeMode="contain"/><Text style={ui.caption}>Installed photo checked · temporary, not uploaded.</Text><Button title="Retake Installed Photo" secondary disabled={busy||!!pendingAttempt} onPress={()=>{setCameraReady(false);resetZoom();setStage('installed');}}/></View>}
        <Button title={busy?'Saving…':batch.requireInstalledPhoto&&!installedUri?'Next · Installed Photo':pendingAttempt?'Retry Save':'Save & Capture Next'} icon="check" busy={busy} disabled={!verified||unresolved.length>0} onPress={()=>{if(!identificationReady())return;if(batch.requireInstalledPhoto&&!installedUri){setCameraReady(false);resetZoom();setStage('installed');}else void saveAndNext();}}/>
        <Text style={ui.caption}>Saves on this phone first. Cloud sync is confirmed separately.</Text>
      </>:<>
        {!!confirmationError&&<Text accessibilityRole="alert" style={ui.error}>{readableError(confirmationError)}</Text>}
        <Button title="Continue to Location" icon="next" disabled={busy||unresolved.length>0||(!mac.trim()&&!serial.trim())||(!!mac&&!normalizeMac(mac))} onPress={()=>{if(!identificationReady())return;setStage('location');setVerified(false);Keyboard.dismiss();}}/>
        <AdvancedPanel title="Advanced scan details" open={showDetails} onToggle={()=>setShowDetails(!showDetails)}>
          <CandidateList title="Printed MAC candidates" candidates={review?.macs??[]} onChoose={chooseMac}/>
          <CandidateList title="Printed serial candidates" candidates={review?.serials??[]} onChoose={chooseSerial}/>
          <Text style={ui.label}>Barcode values</Text>
          {review?.barcodes.map((code,index)=><View key={`${code.type}:${code.data}:${index}`} style={ui.card}><Text selectable style={ui.identifier}>{code.data}</Text><Text style={ui.muted}>{code.type} · {code.assignmentReason??'Unassigned'}</Text><View style={ui.row}><View style={ui.flex}><Button title="Use as MAC" secondary disabled={busy||!!pendingAttempt||!normalizeMac(code.data)} onPress={()=>chooseMac(normalizeMac(code.data)!)}/></View><View style={ui.flex}><Button title="Use as Serial" secondary disabled={busy||!!pendingAttempt||code.data.length>160} onPress={()=>chooseSerial(code.data)}/></View></View></View>)}
          <Text style={ui.label}>Confidence</Text><Text style={ui.muted}>{review?.macs.some(c=>c.corroboratedByBarcode)||review?.serials.some(c=>c.corroboratedByBarcode)?'Barcode corroborates printed text; technician verification is required.':'Manual review required. Ambiguous values remain unassigned.'}</Text>
          <Text style={ui.label}>Raw OCR text</Text><Text selectable style={styles.ocrText}>{review?.ocrText||'No printed text recognized.'}</Text>
        </AdvancedPanel>
        <View style={ui.row}><View style={ui.flex}><Button title="Rescan" secondary icon="capture" disabled={busy||!!pendingAttempt} onPress={()=>{setVerified(false);scanAgain();}}/></View><View style={ui.flex}><Button title="Gallery" secondary icon="gallery" disabled={busy||!!pendingAttempt} onPress={()=>{void chooseExistingPhoto();}}/></View></View>
      </>}
    </ScrollView>}
  </View>;
}
const styles=StyleSheet.create({
 center:{flex:1,alignItems:'center',justifyContent:'center',padding:26,gap:16,backgroundColor:colors.paper},cameraPage:{flex:1},cameraFrame:{flex:1,minHeight:120,overflow:'hidden',backgroundColor:BLUE},
 // Keep the native policy's tested 8–92% / 27–73% scan-guide coordinates.
 guide:{position:'absolute',left:'8%',right:'8%',top:'27%',bottom:'27%',borderColor:GREEN,borderWidth:2,borderRadius:10},
 cameraInstruction:{position:'absolute',left:18,right:76,top:14,padding:10,borderRadius:8,backgroundColor:'#20313BE8'},cameraText:{color:'white',fontWeight:'700',fontSize:14},cameraHint:{color:'#D0E1DC',fontSize:12,marginTop:3},torch:{position:'absolute',right:14,top:14,width:48,height:48,borderRadius:12,alignItems:'center',justifyContent:'center'},
 controls:{padding:14,gap:10,backgroundColor:colors.paper},zoomButton:{height:48,width:60,backgroundColor:'white',borderWidth:1,borderColor:colors.line,borderRadius:10,alignItems:'center',justifyContent:'center'},zoomText:{color:BLUE,fontWeight:'600',fontSize:28},
 section:{gap:8},sectionTitle:{fontSize:15,fontWeight:'700',color:BLUE},muted:{fontSize:13,lineHeight:19,color:colors.muted},candidate:{borderWidth:1,borderColor:colors.line,borderRadius:8,padding:10},candidateValue:{color:BLUE,fontWeight:'600',fontFamily:'monospace',fontSize:14},candidateMeta:{color:colors.muted,fontSize:12},ocrText:{fontFamily:'monospace',fontSize:12,color:colors.muted,lineHeight:18},
});

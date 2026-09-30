import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors, ui } from './ui';
import { syncLabels, type SyncPhase } from './syncFeedback';
export function SyncStatus({phase,message,counts,disabled,onSync}:{phase:SyncPhase;message:string;counts:{pending:number;uploading:number;failed:number};disabled:boolean;onSync:()=>void}){
 const running=phase==='syncing';
 return <View style={ui.card}>
  <Text style={ui.muted}>{counts.pending} pending · {counts.uploading} uploading · {counts.failed} failed</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={syncLabels[phase]} accessibilityState={{disabled:disabled||running,busy:running}} disabled={disabled||running} onPress={onSync}
   style={[ui.button,{flexDirection:'row',justifyContent:'center',gap:10,backgroundColor:phase==='failure' ? '#B32626' : phase==='success' ? '#197448' : colors.blue,opacity:disabled ? .5 : 1}]}>
   {running && <ActivityIndicator color="white"/>}<Text style={[ui.buttonText,{color:'white'}]}>{syncLabels[phase]}</Text>
  </Pressable>
  {!!message && <Text accessibilityLiveRegion="polite" selectable style={phase==='failure' ? ui.error : ui.body}>{message}</Text>}
 </View>;
}

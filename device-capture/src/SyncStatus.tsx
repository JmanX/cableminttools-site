import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors, ui } from './ui';
import { syncLabels, type SyncPhase } from './syncFeedback';
import { readableError } from './presentation';
export function SyncStatus({phase,message,lastChecked,counts,disabled,onSync}:{phase:SyncPhase;message:string;lastChecked:string;counts:{pending:number;uploading:number;uploaded:number;failed:number};disabled:boolean;onSync:()=>void}){
 const running=phase==='syncing';
 return <View style={ui.card}>
  <View style={{flexDirection:'row',gap:6}}>{(['pending','uploading','uploaded','failed'] as const).map(state=><View key={state} style={{flex:1,paddingVertical:10,alignItems:'center',backgroundColor:state==='failed'&&counts.failed?'#FFF0EC':'#EDF3F5',borderRadius:8}}><Text style={[ui.stat,{fontSize:24,color:state==='failed'&&counts.failed?'#AA302A':colors.blue}]}>{counts[state]}</Text><Text style={[ui.caption,{fontSize:10,fontWeight:'700'}]}>{state.toUpperCase()}</Text></View>)}</View>
  <Pressable accessibilityRole="button" accessibilityLabel={syncLabels[phase]} accessibilityState={{disabled:disabled||running,busy:running}} disabled={disabled||running} onPress={onSync}
   style={[ui.button,{flexDirection:'row',justifyContent:'center',gap:10,backgroundColor:phase==='failure' ? '#AA302A' : phase==='success' ? '#146342' : colors.blue,opacity:disabled ? .5 : 1}]}>
   {running && <ActivityIndicator color="white"/>}<Text style={[ui.buttonText,{color:'white'}]}>{syncLabels[phase]}</Text>
  </Pressable>
  <Text style={ui.muted}>{lastChecked ? "Last successful server check: "+lastChecked : "Server has not been checked yet"}</Text>
  {!!message && <Text accessibilityLiveRegion="polite" selectable style={phase==='failure' ? ui.error : ui.body}>{phase==='failure'?readableError(message):message}</Text>}
 </View>;
}

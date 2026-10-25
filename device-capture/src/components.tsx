import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, design, type Status } from './theme';
import { Icon, deviceIcon, type IconName } from './Icon';
import type { Device, Project } from './deviceWorkflow';
export { colors } from './theme';
export type {Status} from './theme';
const statusTone:Record<Status,{color:string;background:string;icon:IconName}> = {
 Synced:{color:colors.success,background:colors.mint,icon:'check'}, Syncing:{color:colors.blue,background:'#E1EBF0',icon:'sync'},
 Pending:{color:colors.warning,background:colors.warningSoft,icon:'history'}, Failed:{color:colors.danger,background:colors.dangerSoft,icon:'warning'},
 Offline:{color:colors.offline,background:'#E5EBEF',icon:'offline'},
};
export function StatusBadge({status,onPress}:{status:Status;onPress?:()=>void}) {
 const t=statusTone[status];const content=<><Icon name={t.icon} size={13} color={t.color}/><Text style={{fontSize:12,fontWeight:'700',color:t.color}}>{status}</Text></>;
 return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${status}. Open sync and uploads`} onPress={onPress} style={{minHeight:48,justifyContent:'center'}}><View style={[ui.badge,{backgroundColor:t.background}]}>{content}</View></Pressable> : <View style={[ui.badge,{backgroundColor:t.background}]}>{content}</View>;
}
type ButtonProps={title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean;busy?:boolean;icon?:IconName;danger?:boolean};
export function Button({title,onPress,disabled=false,secondary=false,busy=false,icon,danger=false}:ButtonProps) {
 return <Pressable accessibilityRole="button" accessibilityState={{disabled:disabled||busy,busy}} disabled={disabled||busy} onPress={onPress}
  style={({pressed})=>[ui.button,secondary&&ui.secondary,danger&&{backgroundColor:colors.dangerSoft,borderColor:colors.danger},pressed&&{opacity:.8},(disabled||busy)&&{opacity:.5}]}>
  {busy ? <ActivityIndicator color={colors.blue}/> : icon&&<Icon name={icon} color={danger?colors.danger:colors.blue}/>}
  <Text style={[ui.buttonText,danger&&{color:colors.danger}]}>{title}</Text>
 </Pressable>;
}
export const PrimaryButton=Button;
export function SecondaryButton(props:ButtonProps){return <Button {...props} secondary/>;}
export function Field({label,value,onChange,maxLength,placeholder,secure=false,disabled=false,email=false}: {label:string;value:string;onChange:(s:string)=>void;maxLength?:number;placeholder?:string;secure?:boolean;disabled?:boolean;email?:boolean}) {
 return <View style={{gap:6,flex:1}}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} style={[ui.input,disabled&&{backgroundColor:colors.paper}]} value={value} onChangeText={onChange} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={colors.muted}
  editable={!disabled} secureTextEntry={secure} autoCapitalize={email||secure?'none':'sentences'} autoCorrect={false} keyboardType={email?'email-address':'default'} autoComplete={secure?'current-password':email?'email':'off'}/></View>;
}
export const FieldInput=Field;
export function AppHeader({title,subtitle,status,onSync,onBack,disabled=false}:{title:string;subtitle?:string;status?:Status;onSync?:()=>void;onBack?:()=>void;disabled?:boolean}) {
 return <View style={ui.header}><View style={ui.row}>
  {onBack&&<Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={disabled} onPress={onBack} style={ui.headerBack}><Icon name="back" color="white"/></Pressable>}
  <View style={ui.flex}><Text style={ui.brand}>CABLEMINT TOOLS</Text><Text style={ui.white}>{title}</Text></View>
  {status&&<StatusBadge status={status} onPress={onSync}/>}
 </View>{!!subtitle&&<Text numberOfLines={2} style={ui.headerSub}>{subtitle}</Text>}</View>;
}
export function CaptureStepHeader({step,project,type,onBack,disabled}:{step:'Type'|'Scan'|'Verify'|'Location'|'Photo';project:string;type?:string;onBack?:()=>void;disabled?:boolean}){
 const steps=['Type','Scan','Verify','Location']; const index=step==='Photo'?3:steps.indexOf(step);
 return <View style={ui.stepHeader}><View style={ui.row}>{onBack&&<Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={disabled} onPress={onBack} style={ui.iconButton}><Icon name="back"/></Pressable>}<View style={ui.flex}><Text numberOfLines={1} style={ui.label}>{project}</Text><Text style={ui.muted}>{type||'Choose a device type'}{step==='Photo'?' · Installed photo':''}</Text></View><Text style={ui.eyebrow}>{index+1} / 4</Text></View><View style={{flexDirection:'row',gap:4}}>{steps.map((s,i)=><View key={s} style={{flex:1,gap:4}}><View style={{height:3,backgroundColor:i<=index?colors.green:colors.line,borderRadius:2}}/><Text style={{fontSize:11,fontWeight:i===index?'800':'500',color:i===index?colors.ink:colors.muted}}>{s}</Text></View>)}</View></View>;
}
export function SectionHeading({title,action,onPress}:{title:string;action?:string;onPress?:()=>void}){return <View style={[ui.row,{justifyContent:'space-between'}]}><Text style={ui.sectionTitle}>{title}</Text>{action&&onPress&&<Pressable onPress={onPress} accessibilityRole="button" style={{minHeight:48,justifyContent:'center'}}><Text style={ui.link}>{action}</Text></Pressable>}</View>;}
export function ProjectCard({project,count,last,status,onPress,disabled}:{project:Project;count:number;last:string;status:Status;onPress:()=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${project.name}, ${count} devices`} disabled={disabled} onPress={onPress} style={({pressed})=>[ui.projectCard,pressed&&{opacity:.8}]}>
 <View style={ui.row}><View style={ui.tile}><Icon name="projects" size={26}/></View><View style={ui.flex}><Text style={ui.sectionTitle}>{project.name}</Text><Text style={ui.eyebrow}>FIELD PROJECT</Text></View><Icon name="next" size={18}/></View>
 <View style={[ui.row,{justifyContent:'space-between',borderTopWidth:1,borderColor:colors.line,paddingTop:12}]}><View><Text style={ui.stat}>{count}<Text style={ui.muted}> devices</Text></Text><Text style={ui.caption}>{last?`Last capture ${captureTime(last)}`:'Ready for first capture'}</Text></View><StatusBadge status={status}/></View>
 </Pressable>;
}
export function DeviceTypeCard({type,description,onPress,disabled}:{type:string;description:string;onPress:()=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} accessibilityLabel={`Capture ${type}`} onPress={onPress} style={({pressed})=>[ui.typeCard,pressed&&{backgroundColor:colors.mint}]}><View style={ui.tile}><Icon name={deviceIcon(type)} size={27}/></View><View style={ui.flex}><Text style={ui.sectionTitle}>{type}</Text><Text style={ui.caption}>{description}</Text></View><Icon name="next" size={18}/></Pressable>;
}
export function EmptyState({icon='projects',title,description,action,onPress}:{icon?:IconName;title:string;description:string;action?:string;onPress?:()=>void}){
 return <View style={ui.empty}><View style={[ui.tile,{width:64,height:64}]}><Icon name={icon} size={32}/></View><Text style={ui.heading}>{title}</Text><Text style={[ui.body,{textAlign:'center'}]}>{description}</Text>{action&&onPress&&<Button title={action} onPress={onPress}/>}</View>;
}
export function captureTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'Time unavailable':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
export function DeviceHistoryRow({device,project,status,onPress}:{device:Device;project:string;status:Status;onPress:()=>void}){
 return <Pressable accessibilityRole="button" onPress={onPress} accessibilityLabel={`${device.unit_location||device.device_type}, ${device.mac_address||device.serial_number}. Open record`} style={({pressed})=>[ui.historyRow,pressed&&{backgroundColor:colors.mint}]}>
 <View style={[ui.row,{alignItems:'flex-start'}]}><View style={[ui.tile,{width:38,height:38}]}><Icon name={deviceIcon(device.device_type)} size={20}/></View><View style={ui.flex}><View style={[ui.row,{justifyContent:'space-between'}]}><Text numberOfLines={1} style={[ui.label,{flex:1}]}>{device.unit_location||'Location not set'}</Text><StatusBadge status={status}/></View><Text selectable style={ui.identifier}>{device.mac_address||device.serial_number}</Text><Text numberOfLines={1} style={ui.caption}>{device.device_type} · {project}</Text><Text style={[ui.caption,{marginTop:3}]}>{[device.building,device.floor_area].filter(Boolean).join(' / ')}{device.building||device.floor_area?' · ':''}{captureTime(device.captured_at)}</Text></View></View>
 </Pressable>;
}
export type Tab='projects'|'history'|'capture'|'tasks'|'account';
export function BottomNavigation({active,onSelect,disabled=false,capturePending=false}:{active:Tab;onSelect:(tab:Tab)=>void;disabled?:boolean;capturePending?:boolean}){
 return <View style={ui.navigation}>{(['projects','history','capture','tasks','account'] as const).map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab==='capture'&&capturePending?'Resume capture':tab[0].toUpperCase()+tab.slice(1)} accessibilityState={{selected:active===tab,disabled}} disabled={disabled} onPress={()=>onSelect(tab)} style={({pressed})=>[ui.navItem,pressed&&{opacity:.7}]}>
 {tab==='capture'?<View style={ui.captureTab}><Icon name="capture" size={27} color={colors.blue}/>{capturePending&&<View style={{position:'absolute',right:6,top:6,width:7,height:7,borderRadius:4,backgroundColor:colors.blue}}/>}</View>:<Icon name={tab} size={23} color={active===tab?colors.green:'#C0CED8'}/>}
 <Text style={{fontSize:11,fontWeight:'700',color:active===tab||tab==='capture'?colors.green:'#C0CED8'}}>{tab[0].toUpperCase()+tab.slice(1)}</Text><View style={{height:2,width:18,backgroundColor:active===tab?colors.green:'transparent'}}/>
 </Pressable>)}</View>;
}
export function ConfirmationPanel({title,detail,status='Pending',children}:{title:string;detail?:string;status?:Status;children?:ReactNode}){
 return <View accessibilityLiveRegion="polite" style={[ui.card,{borderColor:status==='Failed'?colors.danger:colors.green,backgroundColor:status==='Failed'?colors.dangerSoft:colors.mint}]}><View style={ui.row}><Icon name={status==='Failed'?'warning':'check'} color={status==='Failed'?colors.danger:colors.success}/><Text style={[ui.sectionTitle,{flex:1}]}>{title}</Text><StatusBadge status={status}/></View>{detail&&<Text style={ui.body}>{detail}</Text>}{children}</View>;
}
export function AdvancedPanel({title,open,onToggle,children}:{title:string;open:boolean;onToggle:()=>void;children:ReactNode}){
 return <View style={ui.card}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={onToggle} style={[ui.row,{minHeight:48}]}><Icon name="settings" size={18}/><Text style={[ui.label,{flex:1}]}>{title}</Text><Icon name={open?'back':'next'} size={16}/></Pressable>{open&&children}</View>;
}
export const ui=StyleSheet.create({
 page:{flex:1,backgroundColor:colors.paper},flex:{flex:1},row:{flexDirection:'row',alignItems:'center',gap:10},
 content:{padding:design.space.xl,gap:14,paddingBottom:28},header:{backgroundColor:colors.blue,paddingHorizontal:20,paddingVertical:16,gap:8},
 brand:{color:colors.green,fontWeight:'800',letterSpacing:2,fontSize:10},white:{color:'white',fontSize:22,fontWeight:'800',marginTop:3},headerSub:{color:'#C4D6E3',fontSize:13},headerBack:{height:48,width:48,justifyContent:'center'},
 heading:{color:colors.ink,fontWeight:'800',fontSize:design.type.title},sectionTitle:{fontSize:17,fontWeight:'700',color:colors.ink},eyebrow:{color:colors.muted,fontWeight:'700',fontSize:11,letterSpacing:1},
 body:{color:colors.ink,fontSize:15,lineHeight:22},muted:{color:colors.muted,fontSize:13,lineHeight:19},caption:{color:colors.muted,fontSize:12,lineHeight:18},error:{color:colors.danger,fontSize:14,lineHeight:21},link:{color:colors.success,fontWeight:'700',fontSize:14},
 card:{padding:16,backgroundColor:colors.white,borderRadius:design.radius.card,gap:10,borderWidth:1,borderColor:colors.line},projectCard:{padding:16,gap:16,backgroundColor:colors.white,borderRadius:design.radius.card,borderLeftWidth:4,borderLeftColor:colors.green,...design.shadow},
 label:{color:colors.ink,fontWeight:'700',fontSize:14},stat:{color:colors.ink,fontWeight:'800',fontSize:26},
 input:{backgroundColor:colors.white,borderColor:'#AABFCB',borderWidth:1,borderRadius:design.radius.field,padding:13,minHeight:52,color:colors.ink,fontSize:16},
 button:{backgroundColor:colors.green,minHeight:design.button,paddingHorizontal:16,paddingVertical:12,borderRadius:design.radius.field,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},secondary:{backgroundColor:colors.white,borderWidth:1,borderColor:'#ACBFCA'},buttonText:{color:colors.blue,fontSize:15,fontWeight:'800',textAlign:'center',flexShrink:1},
 badge:{flexDirection:'row',gap:4,paddingVertical:5,paddingHorizontal:8,borderRadius:design.radius.pill,alignItems:'center',alignSelf:'flex-start'},
 tile:{height:48,width:48,backgroundColor:colors.mint,borderRadius:12,alignItems:'center',justifyContent:'center'},typeCard:{flexDirection:'row',alignItems:'center',gap:14,padding:14,backgroundColor:colors.white,borderRadius:14,borderWidth:1,borderColor:colors.line,minHeight:78},
 historyRow:{padding:12,backgroundColor:colors.white,borderRadius:12,borderWidth:1,borderColor:colors.line},identifier:{fontFamily:'monospace',fontWeight:'600',fontSize:14,color:colors.ink,marginTop:4,marginBottom:4},
 empty:{alignItems:'center',gap:14,paddingVertical:36,paddingHorizontal:18},stepHeader:{paddingHorizontal:18,paddingBottom:12,paddingTop:8,gap:8,backgroundColor:colors.white,borderBottomWidth:1,borderColor:colors.line},iconButton:{width:48,height:48,alignItems:'center',justifyContent:'center'},
 navigation:{flexDirection:'row',backgroundColor:colors.blue,paddingHorizontal:6,paddingTop:6,paddingBottom:6,borderTopWidth:1,borderColor:'#40515C'},navItem:{flex:1,minHeight:66,alignItems:'center',justifyContent:'center',gap:5},captureTab:{width:54,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.green},
});

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, colors, ui } from './components';
import { Icon } from './Icon';
import { normalizeMac, type ScanReview, type Field } from './recognition';

export function IdentifierPanel({mac,serial,onMac,onSerial,disabled=false}:{mac:string;serial:string;onMac:(v:string)=>void;onSerial:(v:string)=>void;disabled?:boolean}){
 const [editing,setEditing]=useState<Field|null>(null);
 return <View style={ui.card}>{(['mac','serial'] as const).map(field=>{
  const value=field==='mac'?mac:serial;const label=field==='mac'?'MAC Address':'Serial Number';
  return <View key={field} style={{gap:4,paddingBottom:field==='mac'?12:0,borderBottomWidth:field==='mac'?1:0,borderColor:colors.line}}>
   <View style={[ui.row,{justifyContent:'space-between'}]}><Text style={ui.eyebrow}>{label.toUpperCase()}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label}`} disabled={disabled} onPress={()=>setEditing(editing===field?null:field)} style={[ui.row,{minHeight:48}]}><Icon name="edit" size={16} color={colors.success}/><Text style={ui.link}>{editing===field?'Done':'Edit'}</Text></Pressable></View>
   {editing===field?<TextInput accessibilityLabel={label} style={ui.input} value={value} editable={!disabled} onChangeText={field==='mac'?onMac:onSerial} autoCorrect={false} autoCapitalize="characters" maxLength={field==='mac'?32:160} placeholder={field==='mac'?'AA:BB:CC:DD:EE:FF':'Equipment serial'} placeholderTextColor={colors.muted}/>:<Text selectable style={[ui.identifier,{fontSize:18,marginVertical:0}]}>{value||'Not selected'}</Text>}
   {field==='mac'&&<Text style={ui.caption}>{mac&&!normalizeMac(mac)?'Enter a valid 12-digit MAC.':!mac?'Leave blank for serial-only equipment.':'Check against the equipment label.'}</Text>}
  </View>;
 })}</View>;
}
export function ConflictPanel({conflicts,unresolved,mac,serial,onResolve,disabled=false}:{conflicts:ScanReview['conflicts'];unresolved:ScanReview['conflicts'];mac:string;serial:string;onResolve:(field:Field,value:string)=>void;disabled?:boolean}){
 if(!conflicts.length)return null;
 const open=unresolved.length>0;
 return <View style={[ui.card,{backgroundColor:open?colors.warningSoft:colors.mint,borderColor:open?'#C18A30':colors.green}]}>
  <View style={ui.row}><Icon name={open?'warning':'check'} color={open?colors.warning:colors.success}/><Text accessibilityRole={open?'alert':undefined} style={[ui.label,{color:open?colors.warning:colors.success}]}>{open?'Readings disagree · choose a value':'Resolved · selected values confirmed'}</Text></View>
  {open&&<Text style={ui.body}>Choose the correct reading from the device label before continuing.</Text>}
  {open&&conflicts.filter(c=>unresolved.some(u=>u.id===c.id)).map(c=><View key={c.id} style={{gap:8,paddingTop:8}}><Text style={ui.eyebrow}>{c.field==='mac'?'MAC ADDRESS':'SERIAL NUMBER'}</Text>
   <ConflictOption label="Decoded barcode" raw={c.barcode.raw} valid={!!c.barcode.value} disabled={disabled} onPress={()=>onResolve(c.field,c.barcode.value!)}/>
   <ConflictOption label="Printed text · OCR" raw={c.ocr.raw} valid={!!c.ocr.value} disabled={disabled} onPress={()=>onResolve(c.field,c.ocr.value!)}/>
  </View>)}
  {open&&(['mac','serial'] as const).filter(field=>unresolved.some(c=>c.field===field)).map(field=><View key={field} style={{gap:8}}>
   <Button title={`Use my edited ${field==='mac'?'MAC':'serial'}`} secondary disabled={disabled||(field==='mac'?!normalizeMac(mac):!serial.trim())} onPress={()=>onResolve(field,field==='mac'?normalizeMac(mac)!:serial.trim())}/>
   {field==='mac'&&<Button title="Serial-only · omit MAC" secondary disabled={disabled||!serial.trim()} onPress={()=>onResolve('mac','')}/>}
  </View>)}
 </View>;
}
function ConflictOption({label,raw,valid,disabled,onPress}:{label:string;raw:string;valid:boolean;disabled:boolean;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label}: ${raw}`} disabled={disabled||!valid} onPress={onPress} style={[ui.card,{borderRadius:10,minHeight:64,padding:12}]}><Text style={ui.caption}>{label}</Text><View style={ui.row}><Text selectable style={[ui.identifier,ui.flex]}>{raw}</Text>{valid&&<Icon name="next" size={18}/>}</View>{!valid&&<Text style={ui.error}>Invalid reading · edit the value above.</Text>}</Pressable>;
}

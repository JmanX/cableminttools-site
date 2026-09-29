import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
export const colors = { blue: '#102B4B', green: '#26B67A' };
export function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[ui.button, secondary && ui.secondary, disabled && { opacity: 0.5 }]}><Text style={ui.buttonText}>{title}</Text></Pressable>;
}
export function Field({ label, value, onChange, maxLength, placeholder, secure = false, disabled = false, email = false }: { label: string; value: string; onChange: (s: string) => void; maxLength?: number; placeholder?: string; secure?: boolean; disabled?: boolean; email?: boolean }) {
  return <View style={{ gap: 5 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} style={ui.input} value={value} onChangeText={onChange} maxLength={maxLength} placeholder={placeholder}
    editable={!disabled} secureTextEntry={secure} autoCapitalize={email || secure ? 'none' : 'sentences'} autoCorrect={false}
    keyboardType={email ? 'email-address' : 'default'} autoComplete={secure ? 'current-password' : email ? 'email' : 'off'} /></View>;
}
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F8FA' }, content: { padding: 20, gap: 14, paddingBottom: 45 },
  header: { backgroundColor: colors.blue, padding: 18, gap: 5 }, brand: { color: colors.green, fontWeight: '800', letterSpacing: 2 }, heading: { color: colors.blue, fontWeight: '800', fontSize: 23 },
  white: { color: 'white', fontSize: 20, fontWeight: '700' }, body: { color: '#254354', lineHeight: 21 }, muted: { color: '#587080', lineHeight: 19 }, error: { color: '#A32626', lineHeight: 20 },
  card: { padding: 16, backgroundColor: 'white', borderRadius: 12, gap: 10 }, label: { color: colors.blue, fontWeight: '600' },
  input: { backgroundColor: 'white', borderColor: '#B8CDD7', borderWidth: 1, borderRadius: 8, padding: 12, color: colors.blue },
  button: { backgroundColor: colors.green, padding: 14, borderRadius: 10, alignItems: 'center' }, secondary: { backgroundColor: 'white', borderWidth: 1, borderColor: '#B8CDD7' }, buttonText: { color: colors.blue, fontWeight: '700', textAlign: 'center' },
});

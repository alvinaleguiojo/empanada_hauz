import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../theme";

type Props = { busy: boolean; error: string | null; onSubmit: (email: string, password: string) => void; onBack: () => void };

export function LoginScreen({ busy, error, onSubmit, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.card}>
          <View style={styles.logo}><Image source={require("../../assets/icon.png")} style={styles.logoImage} resizeMode="cover" /></View>
          <Text style={styles.eyebrow}>EMPANADA HAUZ</Text>
          <Text style={styles.title}>Rider Login</Text>
          <Text style={styles.subtitle}>Sign in to access your deliveries, map, and rider profile.</Text>

          <View style={styles.form}>
            <View><Text style={styles.label}>EMAIL</Text><TextInput value={email} onChangeText={setEmail} style={styles.input} type="email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="username" /></View>
            <View><Text style={styles.label}>PASSWORD</Text><TextInput value={password} onChangeText={setPassword} style={styles.input} secureTextEntry autoComplete="password" /></View>
            {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}
            <Pressable disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => onSubmit(email, password)}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in as Rider</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  page: { flex: 1, justifyContent: "center", padding: spacing.lg },
  back: { position: "absolute", top: spacing.sm, left: spacing.lg, width: 40, height: 40, justifyContent: "center", zIndex: 2 },
  backText: { color: colors.ink, fontSize: 32 },
  card: { width: "100%", maxWidth: 430, alignSelf: "center", backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...{ shadowColor: "#3B1D0F", shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 9 }, elevation: 4 } },
  logo: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.orangeSoft, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  logoImage: { width: "100%", height: "100%", borderRadius: radius.md },
  eyebrow: { marginTop: spacing.md, fontSize: 10, fontWeight: "900", letterSpacing: 2.2, color: colors.muted, textAlign: "center" },
  title: { marginTop: 3, fontSize: 30, fontWeight: "900", color: colors.ink, textAlign: "center" },
  subtitle: { marginTop: 6, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center" },
  form: { marginTop: spacing.lg, gap: spacing.md },
  label: { marginBottom: 6, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, color: colors.muted },
  input: { height: 50, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.cream, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 13 },
  errorBox: { backgroundColor: "#FDE9E7", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11 },
  error: { color: colors.red, fontSize: 12, fontWeight: "700" },
  button: { height: 52, backgroundColor: colors.orange, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: 2 },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.6 }
});

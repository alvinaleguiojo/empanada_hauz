import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../theme";

type Props = {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => void;
  onBack: () => void;
};

export function LoginScreen({ busy, error, onSubmit, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>

      <View style={styles.body}>
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>🥟</Text>
        </View>
        <Text style={styles.title}>Rider Log In</Text>
        <Text style={styles.subtitle}>Sign in with the account your dispatcher set up for you.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#9b938a"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#9b938a"
          secureTextEntry
          style={styles.input}
        />

        <Pressable
          style={[styles.button, busy && { opacity: 0.7 }]}
          disabled={busy}
          onPress={() => onSubmit(email, password)}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>👤 Log In</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.maroon },
  back: { marginLeft: spacing.lg, marginTop: spacing.sm, width: 40, height: 40, justifyContent: "center" },
  backText: { color: "#fff", fontSize: 32, lineHeight: 32 },
  body: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "center", gap: spacing.sm },
  badge: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md
  },
  badgeEmoji: { fontSize: 28 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900" },
  subtitle: { color: "#C6B4A9", fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  error: { color: "#FF9E8C", fontSize: 13, fontWeight: "700", marginBottom: spacing.xs },
  input: {
    backgroundColor: "#33251E",
    borderWidth: 1,
    borderColor: "#4A362C",
    borderRadius: radius.md,
    height: 54,
    paddingHorizontal: spacing.md,
    color: "#fff",
    marginBottom: spacing.sm
  },
  button: {
    backgroundColor: colors.orange,
    borderRadius: radius.md,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 16 }
});

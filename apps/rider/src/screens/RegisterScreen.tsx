import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../theme";

type Props = {
  onBack: () => void;
};

export function RegisterScreen({ onBack }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>

      <View style={styles.body}>
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>🏍️</Text>
        </View>
        <Text style={styles.title}>Rider Registration</Text>
        <Text style={styles.subtitle}>
          Rider accounts are activated by the Empanada Hauz dispatcher. Send your details and they'll set up your
          login.
        </Text>

        {submitted ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmTitle}>Request sent 🎉</Text>
            <Text style={styles.confirmText}>
              Your dispatcher will reach out with your rider email and password once your account is ready.
            </Text>
            <Pressable style={styles.button} onPress={onBack}>
              <Text style={styles.buttonText}>Back to Log In</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor="#9b938a"
              style={styles.input}
            />
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
              value={phone}
              onChangeText={setPhone}
              placeholder="Mobile number"
              placeholderTextColor="#9b938a"
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Pressable
              style={[styles.button, !name || !email || !phone ? { opacity: 0.5 } : null]}
              disabled={!name || !email || !phone}
              onPress={() => setSubmitted(true)}
            >
              <Text style={styles.buttonText}>👤 Request Rider Account</Text>
            </Pressable>
          </>
        )}
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
  title: { color: "#fff", fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#C6B4A9", fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
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
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  confirm: { gap: spacing.md },
  confirmTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  confirmText: { color: "#C6B4A9", fontSize: 14, lineHeight: 20 }
});

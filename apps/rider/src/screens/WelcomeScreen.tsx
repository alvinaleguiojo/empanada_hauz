import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../theme";

type Props = {
  onLogIn: () => void;
  onRegister: () => void;
};

export function WelcomeScreen({ onLogIn, onRegister }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>🥟</Text>
        </View>
        <Text style={styles.brand}>Empanada</Text>
        <Text style={styles.brandAccent}>Hauz</Text>
        <Text style={styles.tagline}>Deliciously Handcrafted</Text>
      </View>

      <View style={styles.riderBadge}>
        <Text style={styles.riderBadgeIcon}>🏍️</Text>
        <Text style={styles.riderBadgeText}>Rider App</Text>
      </View>

      <View style={styles.copy}>
        <Text style={styles.headline}>
          Delivering{"\n"}
          <Text style={styles.headlineAccent}>Fresh Empanadas</Text>
          {"\n"}Happiness!
        </Text>
        <Text style={styles.subheadline}>Rider App</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={onLogIn}>
          <Text style={styles.primaryButtonText}>👤 Log In</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onRegister}>
          <Text style={styles.secondaryButtonText}>👤 Register</Text>
        </Pressable>
        <Text style={styles.terms}>
          By continuing, you agree to the{"\n"}
          <Text style={styles.link}>Terms & Conditions</Text> and <Text style={styles.link}>Privacy Policy</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.maroon, justifyContent: "space-between" },
  hero: { alignItems: "center", paddingTop: spacing.xl },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm
  },
  badgeEmoji: { fontSize: 34 },
  brand: { color: "#fff", fontSize: 26, fontWeight: "900", fontStyle: "italic" },
  brandAccent: { color: colors.orange, fontSize: 32, fontWeight: "900", fontStyle: "italic", marginTop: -6 },
  tagline: { color: "#D8C6BB", fontSize: 12, fontWeight: "700", marginTop: 4, letterSpacing: 0.5 },
  riderBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.orange,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6
  },
  riderBadgeIcon: { fontSize: 13 },
  riderBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  copy: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  headline: { color: "#fff", fontSize: 30, fontWeight: "900", lineHeight: 36 },
  headlineAccent: { color: colors.yellow },
  subheadline: { color: "#D8C6BB", fontSize: 14, fontWeight: "700", marginTop: spacing.sm },
  actions: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.sm },
  primaryButton: {
    backgroundColor: colors.orange,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center"
  },
  primaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: "#6B4A3B",
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center"
  },
  secondaryButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  terms: { color: "#B7A69C", fontSize: 11, textAlign: "center", marginTop: spacing.sm, lineHeight: 16 },
  link: { color: colors.orange, fontWeight: "700" }
});

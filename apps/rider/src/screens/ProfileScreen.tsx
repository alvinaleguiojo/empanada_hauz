import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "../components/Header";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";

export function ProfileScreen({ session }: { session: RiderSession }) {
  const { rider, logout } = session;
  if (!rider) return null;
  const vehicle = rider.vehicles[0];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header online={rider.status === "online"} />

        <View style={[styles.card, shadow.card]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{rider.user.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{rider.user.name}</Text>
          <Text style={styles.email}>{rider.user.email}</Text>

          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{rider.rating.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{rider.completedJobs}</Text>
              <Text style={styles.statLabel}>Deliveries</Text>
            </View>
          </View>

          <Line title="Vehicle" value={vehicle ? `${vehicle.model ?? vehicle.type} · ${vehicle.plateNumber ?? "No plate"}` : "Not assigned"} />
          <Line title="Service area" value={rider.serviceArea ?? "All areas"} />
          <Line title="Phone" value={rider.phoneNumber ?? "Not provided"} />

          <Pressable style={styles.logoutButton} onPress={() => logout()}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Line({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineTitle}>{title}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { paddingBottom: spacing.xl },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center"
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.orangeSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: { fontSize: 30, fontWeight: "900", color: colors.orange },
  name: { fontSize: 20, fontWeight: "900", color: colors.ink, marginTop: spacing.sm },
  email: { fontSize: 13, color: colors.muted, marginTop: 2 },
  statRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, width: "100%" },
  statBox: {
    flex: 1,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center"
  },
  statValue: { fontSize: 18, fontWeight: "900", color: colors.ink },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  line: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: spacing.sm
  },
  lineTitle: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  lineValue: { fontSize: 12, color: colors.ink, fontWeight: "800" },
  logoutButton: {
    marginTop: spacing.lg,
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.red,
    paddingVertical: spacing.sm + 4,
    alignItems: "center"
  },
  logoutText: { color: colors.red, fontWeight: "900", fontSize: 14 }
});

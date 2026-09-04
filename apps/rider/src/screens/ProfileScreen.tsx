import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";

export function ProfileScreen({ session }: { session: RiderSession }) {
  const { rider, logout } = session;
  if (!rider) return null;
  const vehicle = rider.vehicles?.[0];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>

        <View style={[styles.profileCard, shadow.card]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(rider.user.name ?? "R").slice(0, 1).toUpperCase()}</Text></View>
          <Text style={styles.name}>{rider.user.name ?? "Rider"}</Text>
          <Text style={styles.email}>{rider.user.email ?? ""}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statLabel}>Status</Text><Text style={styles.statValue}>{rider.status}</Text></View>
            <View style={styles.stat}><Text style={styles.statLabel}>Completed</Text><Text style={styles.statValue}>{rider.completedJobs ?? 0}</Text></View>
          </View>
        </View>

        <View style={styles.vehicleCard}>
          <Text style={styles.vehicleTitle}>Vehicle</Text>
          {vehicle ? <View style={styles.vehicleRow}><Text style={styles.vehicleValue}>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.type || "Motorcycle"}</Text><Text style={styles.vehiclePlate}>{vehicle.plateNumber ?? "No plate"}</Text></View> : <Text style={styles.empty}>No active vehicle registered.</Text>}
        </View>

        <Pressable style={styles.logoutButton} onPress={() => void logout()}><Text style={styles.logoutText}>Sign Out</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  profileCard: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: 28, padding: spacing.lg, borderWidth: 1, borderColor: colors.line },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#F7E6D3", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 26, fontWeight: "900", color: colors.ink },
  name: { marginTop: spacing.md, fontSize: 20, fontWeight: "900", color: colors.ink },
  email: { marginTop: 2, fontSize: 12, color: colors.muted },
  stats: { marginTop: spacing.lg, flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, backgroundColor: "#F7F2EC", borderRadius: radius.md, padding: spacing.md },
  statLabel: { fontSize: 10, fontWeight: "800", color: colors.muted },
  statValue: { marginTop: 4, fontSize: 14, fontWeight: "900", color: colors.ink, textTransform: "capitalize" },
  vehicleCard: { marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.line },
  vehicleTitle: { fontSize: 15, fontWeight: "900", color: colors.ink },
  vehicleRow: { marginTop: spacing.md, backgroundColor: "#F7F2EC", borderRadius: radius.md, padding: spacing.md },
  vehicleValue: { fontSize: 13, fontWeight: "800", color: colors.ink },
  vehiclePlate: { marginTop: 3, fontSize: 12, color: colors.muted },
  empty: { marginTop: 4, fontSize: 12, color: colors.muted },
  logoutButton: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.red, borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
  logoutText: { color: colors.red, fontWeight: "900", fontSize: 13 }
});

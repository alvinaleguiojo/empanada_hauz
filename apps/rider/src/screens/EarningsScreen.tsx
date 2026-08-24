import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "../components/Header";
import { RecentOrderRow } from "../components/RecentOrderRow";
import { SectionHeader } from "../components/SectionHeader";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";

export function EarningsScreen({ session }: { session: RiderSession }) {
  const { rider, deliveredJobs, todayEarnings } = session;
  if (!rider) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header online={rider.status === "online"} />

        <View style={[styles.totalCard, shadow.card]}>
          <Text style={styles.totalLabel}>Today's Earnings</Text>
          <Text style={styles.totalValue}>₱{todayEarnings.toFixed(2)}</Text>
          <Text style={styles.totalSub}>{deliveredJobs.length} completed deliveries</Text>
        </View>

        <SectionHeader title="Delivery History" />
        <View style={styles.card}>
          {deliveredJobs.length ? (
            deliveredJobs.map((job, index, arr) => (
              <RecentOrderRow key={job.id} job={job} isLast={index === arr.length - 1} />
            ))
          ) : (
            <Text style={styles.empty}>No deliveries completed yet today.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { paddingBottom: spacing.xl },
  totalCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: spacing.lg
  },
  totalLabel: { color: "#C9BEB6", fontSize: 12, fontWeight: "800" },
  totalValue: { color: "#fff", fontSize: 36, fontWeight: "900", marginTop: 6 },
  totalSub: { color: "#C9BEB6", fontSize: 12, marginTop: 4 },
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg },
  empty: { padding: spacing.lg, color: colors.muted, fontSize: 13, textAlign: "center" }
});

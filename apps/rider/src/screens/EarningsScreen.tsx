import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";

export function EarningsScreen({ session }: { session: RiderSession }) {
  const { deliveredJobs, todayEarnings } = session;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Earnings</Text>
        <Text style={styles.subtitle}>Your delivery earnings for today.</Text>

        <View style={[styles.totalCard, shadow.card]}>
          <Text style={styles.totalLabel}>TODAY'S EARNINGS</Text>
          <Text style={styles.totalValue}>₱{todayEarnings.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={styles.totalSub}>{deliveredJobs.length} completed {deliveredJobs.length === 1 ? "delivery" : "deliveries"}</Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Completed deliveries</Text><Text style={styles.summaryValue}>{deliveredJobs.length}</Text></View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Average per delivery</Text><Text style={styles.summaryValue}>₱{(deliveredJobs.length ? todayEarnings / deliveredJobs.length : 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 12, color: colors.muted },
  totalCard: { marginTop: spacing.lg, backgroundColor: "#111827", borderRadius: 28, padding: spacing.lg },
  totalLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4, color: "rgba(255,255,255,0.6)" },
  totalValue: { marginTop: 5, fontSize: 38, fontWeight: "900", color: "#fff" },
  totalSub: { marginTop: 5, fontSize: 12, color: "rgba(255,255,255,0.7)" },
  summaryCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: colors.line },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13, fontWeight: "700", color: colors.muted },
  summaryValue: { fontSize: 14, fontWeight: "900", color: colors.ink },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.md }
});

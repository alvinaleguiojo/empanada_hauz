import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderSession } from "../hooks/useRiderSession";
import { isCompletedDelivery } from "../types";
import { colors, radius, shadow, spacing } from "../theme";

export function DeliveriesScreen({ session, onOpenNavigation }: { session: RiderSession; onOpenNavigation: (jobId: string) => void }) {
  const { jobs, refresh, busy } = session;
  const active = jobs.filter((job) => !isCompletedDelivery(job));
  const completed = jobs.filter(isCompletedDelivery);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void refresh()} tintColor={colors.orange} />}>
        <Text style={styles.title}>Deliveries</Text>
        <Text style={styles.subtitle}>Your assigned deliveries for today.</Text>

        <Text style={styles.section}>Active</Text>
        {active.length ? active.map((job) => (
          <View key={job.id} style={styles.card}>
            <View style={styles.topRow}><View style={{ flex: 1 }}><Text style={styles.status}>{job.status.replaceAll("_", " ")}</Text><Text style={styles.customer}>{job.order?.customer?.name ?? "Customer"}</Text></View><Text style={styles.fare}>₱{Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(2)}</Text></View>
            <View style={styles.addressBlock}><Text style={styles.addressLabel}>Pickup</Text><Text style={styles.address}>{job.pickupAddress}</Text><Text style={[styles.addressLabel, { marginTop: 9 }]}>Drop-off</Text><Text style={styles.dropoff}>{job.dropoffAddress}</Text></View>
            <Pressable style={styles.button} onPress={() => onOpenNavigation(job.id)}><Text style={styles.buttonText}>Open navigation</Text></Pressable>
          </View>
        )) : <Empty text="No active deliveries." />}

        <Text style={styles.section}>History</Text>
        {completed.length ? completed.map((job) => (
          <View key={job.id} style={styles.historyCard}><View style={{ flex: 1 }}><Text style={styles.customer}>{job.order?.customer?.name ?? "Customer"}</Text><Text style={styles.historyMeta}>{job.order?.status === "completed" ? "completed" : job.status}</Text></View><Text style={styles.fare}>₱{Number(job.finalFare ?? job.estimatedFare ?? 0).toFixed(2)}</Text></View>
        )) : <Empty text="No completed deliveries yet." />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 12, color: colors.muted },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: 11, fontWeight: "900", color: colors.muted, textTransform: "uppercase", letterSpacing: 1.4 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card, borderWidth: 1, borderColor: colors.line },
  topRow: { flexDirection: "row", gap: spacing.sm },
  status: { fontSize: 10, fontWeight: "900", color: colors.muted, textTransform: "uppercase", letterSpacing: 1.2 },
  customer: { marginTop: 4, fontSize: 15, fontWeight: "900", color: colors.ink },
  fare: { fontSize: 15, fontWeight: "900", color: colors.ink },
  addressBlock: { marginTop: spacing.md },
  addressLabel: { fontSize: 10, fontWeight: "900", color: colors.muted },
  address: { marginTop: 2, fontSize: 13, fontWeight: "700", color: colors.ink },
  dropoff: { marginTop: 2, fontSize: 13, fontWeight: "700", color: colors.muted },
  button: { marginTop: spacing.md, backgroundColor: "#111827", borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  historyCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line },
  historyMeta: { marginTop: 3, fontSize: 11, color: colors.muted },
  empty: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  emptyText: { fontSize: 13, color: colors.muted }
});

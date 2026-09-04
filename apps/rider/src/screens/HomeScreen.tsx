import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, shadow, spacing } from "../theme";

type Props = {
  session: RiderSession;
  onOpenNavigation: (jobId: string) => void;
  onOpenDeliveries: () => void;
  onOpenEarnings: () => void;
};

export function HomeScreen({ session, onOpenNavigation, onOpenDeliveries, onOpenEarnings }: Props) {
  const { rider, currentJob, busy, refresh, setAvailability } = session;
  if (!rider) return null;
  const isOnline = rider.status === "online" || rider.status === "busy";
  const firstName = rider.user.name?.split(" ")[0] ?? "Rider";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void refresh()} tintColor={colors.orange} />}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View><Text style={styles.eyebrow}>EMPANADA HAUZ</Text><Text style={styles.title}>Hi, {firstName}</Text></View>
            <View style={styles.statusPill}><Text style={styles.statusPillText}>{rider.status}</Text></View>
          </View>
          <View style={styles.toggleRow}>
            <View style={[styles.dot, { backgroundColor: isOnline ? colors.green : colors.gray }]} />
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>{rider.status === "busy" ? "Online · Busy" : isOnline ? "Online" : "Offline"}</Text>
              <Text style={styles.toggleSubtitle}>{rider.status === "busy" ? "Currently handling a delivery" : isOnline ? "Ready to receive orders" : "Go online to start receiving orders"}</Text>
            </View>
            <Switch value={isOnline} onValueChange={() => void setAvailability(isOnline ? "offline" : "online")} disabled={busy || rider.status === "suspended"} trackColor={{ false: colors.line, true: colors.orangeSoft }} thumbColor={isOnline ? colors.orange : "#fff"} />
          </View>
          {currentJob ? (
            <View style={styles.activeCard}>
              <View style={styles.activeTop}><Text style={styles.activeLabel}>ACTIVE DELIVERY</Text><Text style={styles.jobStatus}>{currentJob.status.replaceAll("_", " ")}</Text></View>
              <Text style={styles.customer}>{currentJob.order?.customer?.name ?? "Customer"}</Text>
              <View style={styles.addressBlock}><Text style={styles.addressLabel}>Pickup</Text><Text style={styles.address}>{currentJob.pickupAddress}</Text><Text style={styles.addressLabel}>Drop-off</Text><Text style={styles.address}>{currentJob.dropoffAddress}</Text></View>
              <Pressable style={styles.button} onPress={() => onOpenNavigation(currentJob.id)}><Text style={styles.buttonText}>Open navigation map</Text></Pressable>
            </View>
          ) : (
            <View style={styles.empty}><Text style={styles.emptyEmoji}>🧭</Text><Text style={styles.emptyTitle}>Ready for your next delivery</Text><Text style={styles.emptyText}>Go online to become available for new delivery assignments.</Text></View>
          )}
        </View>
        <View style={styles.grid}>
          <Pressable style={styles.tile} onPress={onOpenDeliveries}><Text style={styles.tileLabel}>DELIVERIES</Text><Text style={styles.tileTitle}>View jobs</Text></Pressable>
          <Pressable style={styles.tile} onPress={onOpenEarnings}><Text style={styles.tileLabel}>EARNINGS</Text><Text style={styles.tileTitle}>View income</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.8, color: colors.muted },
  title: { marginTop: 4, fontSize: 24, fontWeight: "900", color: colors.ink },
  statusPill: { backgroundColor: colors.greenSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  statusPillText: { fontSize: 11, fontWeight: "900", color: "#217A3B", textTransform: "capitalize" },
  toggleRow: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg },
  dot: { width: 10, height: 10, borderRadius: 5 },
  toggleCopy: { flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: "900", color: colors.ink },
  toggleSubtitle: { marginTop: 2, fontSize: 12, color: colors.muted },
  activeCard: { marginTop: spacing.lg, backgroundColor: "#F7F2EC", borderRadius: 24, padding: spacing.md },
  activeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  activeLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4, color: colors.muted },
  jobStatus: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden", fontSize: 10, fontWeight: "900", color: colors.ink, textTransform: "capitalize" } as any,
  customer: { marginTop: spacing.sm, fontSize: 18, fontWeight: "900", color: colors.ink },
  addressBlock: { marginTop: spacing.md },
  addressLabel: { fontSize: 11, fontWeight: "800", color: colors.muted, marginTop: 8 },
  address: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.ink },
  button: { marginTop: spacing.lg, backgroundColor: "#111827", borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  empty: { marginTop: spacing.lg, backgroundColor: "#F7F2EC", borderRadius: 24, padding: spacing.lg, alignItems: "center" },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: "900", color: colors.ink },
  emptyText: { marginTop: 4, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center" },
  grid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.line },
  tileLabel: { fontSize: 10, fontWeight: "900", color: colors.muted, letterSpacing: 1 },
  tileTitle: { marginTop: 7, fontSize: 15, fontWeight: "900", color: colors.ink }
});

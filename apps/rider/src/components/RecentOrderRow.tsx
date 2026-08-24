import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";
import { DeliveryJob, shortJobCode } from "../types";

export function RecentOrderRow({ job, isLast }: { job: DeliveryJob; isLast?: boolean }) {
  const fare = Number(job.finalFare ?? job.estimatedFare ?? 0);
  return (
    <View style={[styles.row, !isLast && styles.divider]}>
      <View style={styles.check}>
        <Text style={styles.checkText}>✓</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.headerLine}>
          <Text style={styles.status}>Delivered</Text>
          <Text style={styles.orderNo}>#{job.order?.orderNumber ?? shortJobCode(job.id)}</Text>
        </View>
        <Text style={styles.customer}>👤 {job.order?.customer.name ?? "Customer"}</Text>
        <Text style={styles.address} numberOfLines={1}>
          📍 {job.dropoffAddress}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.fare}>₱{fare.toFixed(0)}</Text>
        {job.order?.quantity ? <Text style={styles.qty}>({job.order.quantity} pcs)</Text> : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  checkText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  headerLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  status: { color: colors.green, fontWeight: "800", fontSize: 12 },
  orderNo: { color: colors.muted, fontWeight: "700", fontSize: 11 },
  customer: { fontSize: 13, fontWeight: "800", color: colors.ink, marginTop: 3 },
  address: { fontSize: 12, color: colors.muted, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  fare: { fontWeight: "900", color: colors.ink, fontSize: 14 },
  qty: { fontSize: 10, color: colors.muted },
  chevron: { color: colors.gray, fontSize: 16, marginTop: 2 }
});

export const recentListStyles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg
  }
});

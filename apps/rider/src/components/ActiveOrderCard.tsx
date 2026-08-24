import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, spacing } from "../theme";
import { DeliveryJob, jobActionLabel, shortJobCode } from "../types";

type Props = {
  job: DeliveryJob;
  busy?: boolean;
  onPress: () => void;
};

export function ActiveOrderCard({ job, busy, onPress }: Props) {
  const isNew = job.status === "assigned";
  const fare = Number(job.finalFare ?? job.estimatedFare ?? 0);
  const address = job.status === "delivering" ? job.dropoffAddress : job.pickupAddress;

  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.top}>
        <View style={styles.statusPill}>
          <Text style={styles.statusIcon}>{isNew ? "🕐" : "🚴"}</Text>
          <Text style={styles.statusText}>{isNew ? "New Order" : "Current Order"}</Text>
        </View>
        <Text style={styles.orderNo}>#{job.order?.orderNumber ?? shortJobCode(job.id)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.foodBox}>
          <Text style={styles.foodEmoji}>🥟</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.customer}>👤 {job.order?.customer.name ?? "Customer"}</Text>
          <Text style={styles.address} numberOfLines={2}>
            📍 {address}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.fare}>₱{fare.toFixed(0)}</Text>
          {job.order?.quantity ? <Text style={styles.qty}>({job.order.quantity} pcs Empanada)</Text> : null}
        </View>
        <Pressable disabled={busy} onPress={onPress} style={[styles.button, busy && { opacity: 0.6 }]}>
          <Text style={styles.buttonText}>➤ {jobActionLabel(job.status)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.orange,
    padding: spacing.md
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.orangeSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm
  },
  statusIcon: { fontSize: 11 },
  statusText: { color: colors.orangeDark, fontWeight: "800", fontSize: 11 },
  orderNo: { color: colors.muted, fontWeight: "800", fontSize: 12 },
  body: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md, alignItems: "flex-start" },
  info: { flex: 1 },
  customer: { fontSize: 15, fontWeight: "800", color: colors.ink },
  address: { fontSize: 13, color: colors.body, marginTop: 4, lineHeight: 18 },
  foodBox: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.orangeSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  foodEmoji: { fontSize: 26 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md
  },
  fare: { fontSize: 19, fontWeight: "900", color: colors.ink },
  qty: { fontSize: 11, color: colors.muted, marginTop: 1 },
  button: {
    backgroundColor: colors.orange,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 13 }
});

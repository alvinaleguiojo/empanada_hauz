import { ActivityIndicator, StyleSheet, Switch, Text, View } from "react-native";
import { colors, radius, shadow, spacing } from "../theme";

type Props = { online: boolean; busy?: boolean; onToggle: () => void; status?: "offline" | "online" | "busy" | "suspended" };

export function OnlineToggle({ online, busy, onToggle, status }: Props) {
  const isSuspended = status === "suspended";
  const isBusy = status === "busy";
  return (
    <View style={[styles.wrap, shadow.card]}>
      <View style={[styles.dot, { backgroundColor: online || isBusy ? colors.green : colors.gray }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{isBusy ? "Online · Busy" : online ? "Online" : "Offline"}</Text>
        <Text style={styles.subtitle}>{isBusy ? "Currently handling a delivery" : online ? "Ready to receive orders" : "Go online to start receiving orders"}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.orange} /> : <Switch value={online || isBusy} onValueChange={onToggle} disabled={isSuspended} trackColor={{ false: colors.line, true: colors.orangeSoft }} thumbColor={online || isBusy ? colors.orange : "#fff"} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 15, fontWeight: "900", color: colors.ink },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 1 }
});

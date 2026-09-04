import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

export type Tab = "orders" | "map" | "deliveries" | "earnings" | "notifications" | "profile";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "orders", label: "Home", icon: "⌂" },
  { id: "deliveries", label: "Deliveries", icon: "▤" },
  { id: "earnings", label: "Earnings", icon: "₱" },
  { id: "notifications", label: "Alerts", icon: "♢" },
  { id: "profile", label: "Profile", icon: "●" }
];

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <View style={styles.wrap}>
      {TABS.map((item) => {
        const active = item.id === tab;
        return (
          <Pressable key={item.id} onPress={() => onChange(item.id)} style={styles.item}>
            <Text style={[styles.icon, active && styles.activeIcon]}>{item.icon}</Text>
            <Text style={[styles.label, active && styles.activeLabel]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm, paddingBottom: spacing.md },
  item: { flex: 1, alignItems: "center", gap: 3 },
  icon: { fontSize: 19, opacity: 0.5, color: colors.ink },
  activeIcon: { opacity: 1, color: colors.orange },
  label: { fontSize: 10, fontWeight: "700", color: colors.muted },
  activeLabel: { color: colors.orange, fontWeight: "900" }
});

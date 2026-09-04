import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

export type Tab = "orders" | "map" | "deliveries" | "earnings" | "notifications" | "profile";

type NavItem = { id: Exclude<Tab, "map">; label: string; icon: string };
const TABS: NavItem[] = [
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
  wrap: { flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 8, paddingTop: spacing.sm, paddingBottom: spacing.md },
  item: { flex: 1, alignItems: "center", gap: 3, borderRadius: 16, paddingVertical: spacing.sm },
  icon: { fontSize: 20, color: "#9A9088", opacity: 0.9 },
  activeIcon: { color: "#111827", opacity: 1 },
  label: { fontSize: 11, fontWeight: "900", color: "#9A9088" },
  activeLabel: { color: "#111827" }
});

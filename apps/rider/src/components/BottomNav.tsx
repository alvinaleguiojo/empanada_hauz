import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

export type Tab = "orders" | "map" | "earnings" | "profile";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "orders", label: "Orders", icon: "🧾" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "earnings", label: "Earnings", icon: "📊" },
  { id: "profile", label: "Profile", icon: "👤" }
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
  wrap: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  item: { flex: 1, alignItems: "center", gap: 3 },
  icon: { fontSize: 20, opacity: 0.55 },
  activeIcon: { opacity: 1 },
  label: { fontSize: 11, fontWeight: "700", color: colors.muted },
  activeLabel: { color: colors.orange, fontWeight: "900" }
});

import { StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, spacing } from "../theme";

export type Stat = { icon: string; value: string; label: string };

export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <View style={[styles.row, shadow.card]}>
      {stats.map((stat, index) => (
        <View
          key={stat.label}
          style={[styles.item, index < stats.length - 1 ? styles.divider : null]}
        >
          <View style={styles.iconBox}>
            <Text style={styles.icon}>{stat.icon}</Text>
          </View>
          <Text style={styles.value}>{stat.value}</Text>
          <Text style={styles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.md
  },
  item: { flex: 1, alignItems: "center", gap: 4 },
  divider: { borderRightWidth: 1, borderRightColor: colors.line },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2
  },
  icon: { fontSize: 14 },
  value: { fontSize: 18, fontWeight: "900", color: colors.ink },
  label: { fontSize: 10, color: colors.muted, textAlign: "center" }
});

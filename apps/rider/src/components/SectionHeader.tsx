import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

type Props = {
  title: string;
  count?: number;
  onViewAll?: () => void;
};

export function SectionHeader({ title, count, onViewAll }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {count != null && count > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        ) : null}
      </View>
      {onViewAll ? (
        <Pressable onPress={onViewAll} hitSlop={8}>
          <Text style={styles.viewAll}>View All</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm
  },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 17, fontWeight: "900", color: colors.ink },
  countPill: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  countText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  viewAll: { color: colors.orange, fontWeight: "800", fontSize: 12 }
});

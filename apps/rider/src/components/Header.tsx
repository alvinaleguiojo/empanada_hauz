import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

type Props = {
  online: boolean;
  notificationCount?: number;
  onMenuPress?: () => void;
  onBellPress?: () => void;
};

export function Header({ online, notificationCount = 0, onMenuPress, onBellPress }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onMenuPress} hitSlop={12} style={styles.iconButton}>
        <Text style={styles.iconGlyph}>≡</Text>
      </Pressable>

      <View style={styles.logoBlock}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoEmoji}>🥟</Text>
        </View>
        <View>
          <Text style={styles.brand}>Empanada</Text>
          <Text style={styles.brandAccent}>Hauz</Text>
        </View>
      </View>

      <Pressable onPress={onBellPress} hitSlop={12} style={styles.iconButton}>
        <Text style={styles.iconGlyph}>🔔</Text>
        {notificationCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notificationCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.orange,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  iconGlyph: { fontSize: 22, color: "#fff" },
  logoBlock: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center"
  },
  logoEmoji: { fontSize: 18 },
  brand: { color: "#fff", fontSize: 15, fontWeight: "800", fontStyle: "italic", lineHeight: 16 },
  brandAccent: { color: colors.maroon, fontSize: 17, fontWeight: "900", fontStyle: "italic", lineHeight: 18 },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" }
});

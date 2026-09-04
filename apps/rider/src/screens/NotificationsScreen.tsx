import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, spacing } from "../theme";

export function NotificationsScreen({ session }: { session: RiderSession }) {
  const { activeJobs, busy, refresh } = session;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void refresh()} tintColor={colors.orange} />}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Delivery and account updates.</Text>
        <View style={styles.list}>
          {activeJobs.length ? activeJobs.map((job) => (
            <View key={job.id} style={styles.card}>
              <View style={styles.icon}><Text style={styles.check}>✓</Text></View>
              <View style={styles.copy}>
                <Text style={styles.heading}>Delivery assigned</Text>
                <Text style={styles.body}>{job.order?.customer?.name ?? "Customer"} has an active delivery for you.</Text>
                <Text style={styles.meta}>{job.status.replaceAll("_", " ")}</Text>
              </View>
            </View>
          )) : (
            <View style={styles.empty}><Text style={styles.emptyText}>You're all caught up. New delivery assignments will appear here.</Text></View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 12, color: colors.muted },
  list: { marginTop: spacing.lg, gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, flexDirection: "row", gap: spacing.md, borderWidth: 1, borderColor: colors.line },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center", marginTop: 2 },
  check: { color: "#217A3B", fontSize: 18, fontWeight: "900" },
  copy: { flex: 1 },
  heading: { fontSize: 14, fontWeight: "900", color: colors.ink },
  body: { marginTop: 3, fontSize: 12, lineHeight: 18, color: colors.muted },
  meta: { marginTop: 7, fontSize: 10, fontWeight: "800", color: "#A0968E" },
  empty: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  emptyText: { fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center" }
});

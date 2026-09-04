import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, spacing } from "../theme";

export function NotificationsScreen({ session }: { session: RiderSession }) {
  const { activeJobs } = session;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={session.busy} onRefresh={() => void session.refresh()} tintColor={colors.orange} />}
      >
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Delivery and rider updates.</Text>
        {activeJobs.length ? activeJobs.map((job) => (
          <View key={job.id} style={styles.card}>
            <View style={styles.icon}><Text>🔔</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>Active delivery</Text>
              <Text style={styles.body}>Delivery for {job.order?.customer?.name ?? "Customer"} is currently {job.status.replaceAll("_", " ")}.</Text>
              <Text style={styles.meta}>{job.dropoffAddress}</Text>
            </View>
          </View>
        )) : (
          <View style={styles.empty}><Text style={styles.emptyIcon}>🔔</Text><Text style={styles.emptyTitle}>You're all caught up</Text><Text style={styles.emptyText}>New delivery assignments will appear here.</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: "900", color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 13, color: colors.muted },
  card: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", gap: spacing.md, borderWidth: 1, borderColor: colors.line },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.orangeSoft, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 14, fontWeight: "900", color: colors.ink },
  body: { marginTop: 3, fontSize: 12, lineHeight: 18, color: colors.body },
  meta: { marginTop: 5, fontSize: 11, color: colors.muted },
  empty: { marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  emptyIcon: { fontSize: 34 },
  emptyTitle: { marginTop: spacing.sm, fontSize: 16, fontWeight: "900", color: colors.ink },
  emptyText: { marginTop: 4, fontSize: 12, color: colors.muted, textAlign: "center" }
});

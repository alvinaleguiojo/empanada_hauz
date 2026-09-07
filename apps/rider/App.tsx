import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BottomNav, Tab } from "./src/components/BottomNav";
import { useRiderSession } from "./src/hooks/useRiderSession";
import { DeliveriesScreen } from "./src/screens/DeliveriesScreen";
import { EarningsScreen } from "./src/screens/EarningsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { colors } from "./src/theme";

function RiderApp() {
  const session = useRiderSession();
  const [tab, setTab] = useState<Tab>("orders");
  const [navigationJobId, setNavigationJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!navigationJobId) return;
    const navigationJob = session.jobs.find((job) => job.id === navigationJobId);
    if (navigationJob?.status === "delivered") {
      setNavigationJobId(null);
      setTab("deliveries");
    }
  }, [navigationJobId, session.jobs]);

  if (session.booting) return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.orange} size="large" /></SafeAreaView>;

  if (!session.token || !session.rider) {
    return <LoginScreen busy={session.busy} error={session.error} onBack={() => session.setError(null)} onSubmit={async (email, password) => { await session.login(email, password); }} />;
  }

  const openNavigation = (jobId: string) => { setNavigationJobId(jobId); setTab("map"); };

  return (
    <View style={styles.app}>
      <View style={styles.content}>
        {tab === "orders" ? <HomeScreen session={session} onOpenNavigation={openNavigation} onOpenDeliveries={() => setTab("deliveries")} onOpenEarnings={() => setTab("earnings")} /> : null}
        {tab === "deliveries" ? <DeliveriesScreen session={session} onOpenNavigation={openNavigation} /> : null}
        {tab === "map" ? <MapScreen session={session} jobId={navigationJobId} onBack={() => { setNavigationJobId(null); setTab("deliveries"); }} /> : null}
        {tab === "earnings" ? <EarningsScreen session={session} /> : null}
        {tab === "notifications" ? <NotificationsScreen session={session} /> : null}
        {tab === "profile" ? <ProfileScreen session={session} /> : null}
      </View>
      {tab !== "map" ? <SafeAreaView edges={["bottom"]} style={styles.navSafe}><BottomNav tab={tab} onChange={(next) => { setNavigationJobId(null); setTab(next); }} /></SafeAreaView> : null}
    </View>
  );
}

export default function App() { return <SafeAreaProvider><StatusBar style="dark" /><RiderApp /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.cream },
  content: { flex: 1 },
  navSafe: { backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream }
});

import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BottomNav, Tab } from "./src/components/BottomNav";
import { useRiderSession } from "./src/hooks/useRiderSession";
import { EarningsScreen } from "./src/screens/EarningsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { colors } from "./src/theme";

type AuthScreen = "welcome" | "login" | "register";

function RiderApp() {
  const session = useRiderSession();
  const [authScreen, setAuthScreen] = useState<AuthScreen>("welcome");
  const [tab, setTab] = useState<Tab>("orders");

  if (session.booting) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.orange} size="large" />
      </SafeAreaView>
    );
  }

  if (!session.token || !session.rider) {
    if (authScreen === "login") {
      return (
        <LoginScreen
          busy={session.busy}
          error={session.error}
          onBack={() => {
            session.setError(null);
            setAuthScreen("welcome");
          }}
          onSubmit={async (email, password) => {
            const ok = await session.login(email, password);
            if (ok) setAuthScreen("welcome");
          }}
        />
      );
    }
    if (authScreen === "register") {
      return <RegisterScreen onBack={() => setAuthScreen("welcome")} />;
    }
    return (
      <WelcomeScreen onLogIn={() => setAuthScreen("login")} onRegister={() => setAuthScreen("register")} />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {tab === "orders" ? <HomeScreen session={session} /> : null}
      {tab === "map" ? <MapScreen session={session} /> : null}
      {tab === "earnings" ? <EarningsScreen session={session} /> : null}
      {tab === "profile" ? <ProfileScreen session={session} /> : null}
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.surface }}>
        <BottomNav tab={tab} onChange={setTab} />
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RiderApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.cream }
});

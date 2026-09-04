import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActiveOrderCard } from "../components/ActiveOrderCard";
import { Header } from "../components/Header";
import { OnlineToggle } from "../components/OnlineToggle";
import { RecentOrderRow } from "../components/RecentOrderRow";
import { SectionHeader } from "../components/SectionHeader";
import { Stat, StatRow } from "../components/StatRow";
import { RiderSession } from "../hooks/useRiderSession";
import { colors, radius, spacing } from "../theme";
import { JOB_NEXT_STATUS } from "../types";

export function HomeScreen({ session }: { session: RiderSession }) {
  const { rider, activeJobs, deliveredJobs, currentJob, busy, refresh, setAvailability, advanceJob } = session;
  const [refreshing, setRefreshing] = useState(false);
  if (!rider) return null;
  const stats: Stat[] = [
    { icon: "📦", value: String(activeJobs.length), label: "Today's Orders" },
    { icon: "⏱️", value: `${rider.completedJobs}`, label: "Completed" },
    { icon: "⭐", value: rider.rating.toFixed(1), label: "Rider Rating" }
  ];
  const handleOrderPress = () => { if (!currentJob) return; const next = JOB_NEXT_STATUS[currentJob.status]; if (next) void advanceJob(currentJob, next); };
  const onRefresh = async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } };
  const isOnline = rider.status === "online" || rider.status === "busy";
  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.orange} />}>
      <Header online={isOnline} notificationCount={activeJobs.length} />
      <OnlineToggle online={rider.status === "online"} status={rider.status} busy={busy} onToggle={() => setAvailability(isOnline ? "offline" : "online")} />
      <StatRow stats={stats} />
      <SectionHeader title="Active Orders" count={activeJobs.length} />
      {currentJob ? <ActiveOrderCard job={currentJob} busy={busy} onPress={handleOrderPress} /> : <View style={styles.empty}><Text style={styles.emptyEmoji}>🥟</Text><Text style={styles.emptyTitle}>{isOnline ? "Waiting for an order" : "You're offline"}</Text><Text style={styles.emptyText}>{isOnline ? "Keep the app open — we'll notify you the moment dispatch sends your next delivery." : "Flip the switch above when you're ready to start receiving deliveries."}</Text></View>}
      <SectionHeader title="Recent Orders" /><View style={styles.recentCard}>{deliveredJobs.length ? deliveredJobs.slice(0,6).map((job,index,arr)=><RecentOrderRow key={job.id} job={job} isLast={index===arr.length-1}/>) : <Text style={styles.noRecent}>No deliveries completed yet today.</Text>}</View>
    </ScrollView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.cream},scroll:{paddingBottom:spacing.xl},empty:{marginHorizontal:spacing.lg,backgroundColor:colors.surface,borderRadius:radius.lg,padding:spacing.xl,alignItems:"center"},emptyEmoji:{fontSize:34,marginBottom:spacing.sm},emptyTitle:{fontSize:15,fontWeight:"900",color:colors.ink,marginBottom:4},emptyText:{fontSize:13,color:colors.muted,textAlign:"center",lineHeight:19},recentCard:{marginHorizontal:spacing.lg,backgroundColor:colors.surface,borderRadius:radius.lg},noRecent:{padding:spacing.lg,color:colors.muted,fontSize:13,textAlign:"center"}});

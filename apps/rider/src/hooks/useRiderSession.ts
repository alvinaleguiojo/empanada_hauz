import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  ApiError,
  SOCKET_URL,
  clearToken,
  getRiderJobs,
  getRiderProfile,
  login as loginRequest,
  readToken,
  saveToken,
  updateJobStatus as updateJobStatusRequest,
  updateRiderLocation,
  updateRiderStatus as updateRiderStatusRequest
} from "../api";
import { ACTIVE_JOB_STATUSES, Coordinate, DeliveryJob, RiderProfile, RiderStatus } from "../types";

export function useRiderSession() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [liveLocation, setLiveLocation] = useState<Coordinate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const activeJobs = useMemo(() => jobs.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status)), [jobs]);
  const deliveredJobs = useMemo(() => jobs.filter((job) => job.status === "delivered"), [jobs]);
  const currentJob = activeJobs[0] ?? null;
  const todayEarnings = useMemo(
    () => deliveredJobs.reduce((sum, job) => sum + Number(job.finalFare ?? job.estimatedFare ?? 0), 0),
    [deliveredJobs]
  );

  const refresh = useCallback(
    async (activeToken?: string) => {
      const t = activeToken ?? token;
      if (!t) return;
      const [profile, jobList] = await Promise.all([getRiderProfile(t), getRiderJobs(t)]);
      setRider(profile);
      setJobs(jobList);
    },
    [token]
  );

  useEffect(() => {
    (async () => {
      try {
        const stored = await readToken();
        if (stored) {
          setToken(stored);
          await refresh(stored);
        }
      } catch {
        await clearToken();
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token || !rider || rider.status === "offline") return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted" || cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 20 },
        (position) => {
          const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          setLiveLocation(coords);
          void updateRiderLocation(token, {
            ...coords,
            heading: position.coords.heading ?? undefined,
            speed: position.coords.speed ?? undefined,
            accuracy: position.coords.accuracy ?? undefined
          }).catch(() => undefined);
        }
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [token, rider?.status]);

  useEffect(() => {
    if (!token || !rider) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(`${SOCKET_URL}/ops`, {
      transports: ["websocket", "polling"],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1200
    });
    socketRef.current = socket;

    const hydrate = () => void refresh(token).catch(() => undefined);
    socket.on("connect", () => {
      socket.emit("rider.presence", { riderId: rider.id });
      hydrate();
    });
    socket.on("rider.delivery.assigned", hydrate);
    socket.on("rider.delivery.updated", hydrate);
    socket.on("rider.status.updated", hydrate);
    socket.on("delivery-network.jobs.updated", hydrate);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, rider?.id]);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const session = await loginRequest(email, password);
      if (session.user.role !== "rider") {
        throw new Error("This account is not registered as a rider.");
      }
      await saveToken(session.accessToken);
      setToken(session.accessToken);
      await refresh(session.accessToken);
      return true;
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Login failed");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    await clearToken();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setToken(null);
    setRider(null);
    setJobs([]);
  }, []);

  const setAvailability = useCallback(
    async (status: RiderStatus) => {
      if (!token) return;
      setBusy(true);
      try {
        setRider(await updateRiderStatusRequest(token, status));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update availability");
      } finally {
        setBusy(false);
      }
    },
    [token]
  );

  const advanceJob = useCallback(
    async (job: DeliveryJob, nextStatus: string) => {
      if (!token) return;
      setBusy(true);
      try {
        const updated = await updateJobStatusRequest(token, job.id, nextStatus);
        setJobs((prev) => prev.map((existing) => (existing.id === updated.id ? updated : existing)));
        await refresh(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update this order");
      } finally {
        setBusy(false);
      }
    },
    [token, refresh]
  );

  return {
    booting,
    token,
    rider,
    jobs,
    activeJobs,
    deliveredJobs,
    currentJob,
    todayEarnings,
    liveLocation,
    error,
    setError,
    busy,
    login,
    logout,
    refresh,
    setAvailability,
    advanceJob
  };
}

export type RiderSession = ReturnType<typeof useRiderSession>;

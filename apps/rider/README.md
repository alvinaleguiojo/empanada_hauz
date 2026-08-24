# Empanada Hauz — Rider App

A fresh Expo/React Native rider app for Empanada Hauz dispatch, rebuilt from the ground up to match the
provided rider app design (welcome/login, home dashboard, and live delivery map).

## Structure

```
apps/rider/
  App.tsx                 Root component: auth gate + tab navigation
  index.ts                Expo entry point
  src/
    theme.ts               Brand colors, spacing, radius, shadows
    types.ts                Shared types + status/label helpers
    api.ts                  Thin fetch client against the NestJS API
    hooks/useRiderSession.ts  Auth, jobs, GPS tracking, realtime socket
    components/            Header, OnlineToggle, StatRow, ActiveOrderCard,
                            RecentOrderRow, SectionHeader, BottomNav
    screens/                WelcomeScreen, LoginScreen, RegisterScreen,
                            HomeScreen, MapScreen, EarningsScreen, ProfileScreen
```

## Backend integration

Talks to the existing NestJS API — no backend changes were required:

- `POST /auth/login` — rider sign-in
- `GET /rider/me` — rider profile, rating, vehicle, last known location
- `GET /rider/jobs` — today's delivery jobs
- `PATCH /rider/status` — go online/offline
- `POST /rider/location` — live GPS ping (foreground tracking, 8s interval)
- `PATCH /rider/jobs/:id/status` — advance a job through its lifecycle
- Socket.IO `/ops` namespace — realtime job assignment/update events

**Note on the Register screen:** the API only exposes rider creation via the admin-gated
`POST /delivery-network/riders` endpoint (`apps/api/src/modules/delivery-network`), which requires an
authenticated dispatcher session — there's no public self-registration endpoint. The Register screen in
this build collects a rider's name/email/phone and shows a "we'll be in touch" confirmation rather than
calling a real endpoint. If you want true self-service registration, we can either open that endpoint up
(with appropriate validation/anti-abuse) or wire the form to email/notify the dispatcher.

## Running locally

```bash
npm run dev:rider     # from repo root — expo start
npm run android:rider # expo run:android
npm run ios:rider     # expo run:ios
```

Set `EXPO_PUBLIC_API_URL` (defaults to `https://empanadahauz.com/api`) and a Google Maps/Routes key
(`GOOGLE_MAPS_ANDROID_API_KEY` / `EXPO_PUBLIC_GOOGLE_ROUTES_API_KEY`) before running on-device for the map
screen.

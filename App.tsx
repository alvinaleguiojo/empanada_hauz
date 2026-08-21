// Expo compatibility entrypoint for the monorepo rider app.
// Some Expo/React Native launchers resolve node_modules/expo/AppEntry.js
// from the repository root and expect a root-level App module.
export { default } from "./apps/rider/RiderRealtimeApp";

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...(config.android || {}),
    config: {
      ...(config.android?.config || {}),
      googleMaps: {
        ...(config.android?.config?.googleMaps || {}),
        apiKey:
          process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
          process.env.GOOGLE_MAPS_API_KEY ||
          "",
      },
    },
  },
  ios: {
    ...(config.ios || {}),
    config: {
      ...(config.ios?.config || {}),
      googleMapsApiKey:
        process.env.GOOGLE_MAPS_IOS_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        "",
    },
  },
  extra: {
    ...(config.extra || {}),
    googleMapsDirectionsApiKey:
      process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "",
  },
});

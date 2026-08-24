module.exports = ({ config }) => {
  const googleMapsApiKey =
    process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    "";

  const plugins = (config.plugins || []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== "react-native-maps";
  });

  if (googleMapsApiKey) {
    plugins.push([
      "react-native-maps",
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY || googleMapsApiKey
      }
    ]);
  }

  return {
    ...config,
    plugins,
    android: {
      ...(config.android || {}),
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps || {}),
          apiKey: googleMapsApiKey
        }
      }
    },
    ios: {
      ...(config.ios || {}),
      config: {
        ...(config.ios?.config || {}),
        googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY || googleMapsApiKey
      }
    },
    extra: {
      ...(config.extra || {}),
      googleRoutesApiKey:
        process.env.EXPO_PUBLIC_GOOGLE_ROUTES_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        ""
    }
  };
};

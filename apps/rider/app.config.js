const appConfig = require('./app.json');

module.exports = ({ config }) => ({
  ...appConfig.expo,
  android: {
    ...appConfig.expo.android,
    config: {
      ...appConfig.expo.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
  },
});

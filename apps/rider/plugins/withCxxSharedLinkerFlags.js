const { withAppBuildGradle } = require("@expo/config-plugins");

const MARKER = "// @empanada-hauz cxx-shared-linker-flags";

module.exports = function withCxxSharedLinkerFlags(config) {
  return withAppBuildGradle(config, (configMod) => {
    if (configMod.modResults.language !== "groovy") return configMod;
    const contents = configMod.modResults.contents;
    if (contents.includes(MARKER)) return configMod;

    const markerBlock = `\n${MARKER}\nandroid {\n  defaultConfig {\n    externalNativeBuild {\n      cmake {\n        arguments "-DANDROID_STL=c++_shared", "-DCMAKE_SHARED_LINKER_FLAGS=-lc++_shared"\n      }\n    }\n  }\n}\n`;

    configMod.modResults.contents = `${contents}\n${markerBlock}`;
    return configMod;
  });
};

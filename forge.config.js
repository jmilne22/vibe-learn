const path = require("node:path");
module.exports = {
  packagerConfig: {
    asar: { unpack: "**/*.node" },
    appBundleId: "dev.vibelearn.desktop",
    executableName: "vibe-learn",
    extraResource: [path.join(__dirname, "build/learning")],
    ignore: [
      /^\/(?!(?:node_modules|build)(?:\/|$)|package\.json$).+/,
      /^\/build\/(?!app(?:\/|$))/,
    ],
    osxSign: process.env.APPLE_SIGNING_ENABLED === "1" ? {} : undefined,
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : undefined,
  },
  rebuildConfig: { onlyModules: ["better-sqlite3"] },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "vibe_learn",
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      },
    },
    { name: "@electron-forge/maker-zip", platforms: ["darwin", "linux"] },
    { name: "@electron-forge/maker-dmg", platforms: ["darwin"], config: {} },
  ],
};

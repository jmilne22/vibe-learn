const path = require('path');
const { spawnSync } = require('child_process');

const { MakerTarGz } = require('./scripts/maker-targz');

const desktopResources = path.join(__dirname, 'build', 'desktop-resources');

// deb/rpm makers hard-require distro packaging tools. Detect them so
// `make:desktop` still works on other distros (Void, Arch, NixOS, ...),
// which get the portable tar.gz instead.
function hasCommand(command) {
    return spawnSync('which', [command], { stdio: 'ignore' }).status === 0;
}

module.exports = {
    packagerConfig: {
        asar: true,
        appBundleId: 'dev.vibelearn.desktop',
        executableName: 'vibe-learn',
        extraResource: [desktopResources],
        ignore: [
            /^\/(?:\.git|\.github|courses|engine|dist|practice|build|scripts|out)(?:\/|$)/,
            /^\/(?:build|create-course|generate-practice)\.js$/,
            /^\/.*\.md$/,
        ],
        osxSign: process.env.APPLE_SIGNING_ENABLED === '1' ? {} : undefined,
        osxNotarize: process.env.APPLE_ID ? {
            tool: 'notarytool',
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
        } : undefined,
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            platforms: ['win32'],
            config: {
                name: 'vibe_learn',
                setupExe: 'Vibe-Learn-Setup.exe',
                certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
                certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
        new MakerTarGz(),
        {
            name: '@electron-forge/maker-dmg',
            platforms: ['darwin'],
            config: {
                name: 'Vibe Learn',
                format: 'ULFO',
            },
        },
        {
            name: '@electron-forge/maker-deb',
            platforms: ['linux'],
            enabled: hasCommand('dpkg') && hasCommand('fakeroot'),
            config: {
                options: {
                    // xz (the default) spends ~2 CI minutes on the bundled
                    // toolchain; zstd is a fraction of that at similar size.
                    compression: 'zstd',
                    name: 'vibe-learn',
                    productName: 'Vibe Learn',
                    genericName: 'Learning Environment',
                    categories: ['Education', 'Development'],
                    maintainer: 'Vibe Learn',
                    homepage: 'https://github.com/jmilne22/vibe-learn',
                },
            },
        },
        {
            name: '@electron-forge/maker-rpm',
            platforms: ['linux'],
            enabled: hasCommand('rpmbuild'),
            config: {
                options: {
                    // rpm payload define: xz level 1 on all cores
                    // (w1T0.xzdio) — single-threaded xz was the slowest
                    // maker at ~130s.
                    compressionLevel: '1T0',
                    name: 'vibe-learn',
                    productName: 'Vibe Learn',
                    genericName: 'Learning Environment',
                    categories: ['Education', 'Development'],
                    homepage: 'https://github.com/jmilne22/vibe-learn',
                },
            },
        },
    ],
};

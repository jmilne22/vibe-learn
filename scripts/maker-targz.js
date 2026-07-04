'use strict';

const { MakerBase } = require('@electron-forge/maker-base');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

// Parallel gzip when available (preinstalled on GitHub ubuntu runners) —
// compressing the ~500MB app is otherwise single-threaded tail time.
function hasPigz() {
    try {
        return spawnSync('pigz', ['--version'], { stdio: 'ignore' }).status === 0;
    } catch {
        return false;
    }
}

// Portable Linux artifact for distros without deb/rpm packaging tools
// (Void, Arch, NixOS, ...). Needs only system tar: unpack and run
// ./vibe-learn.
class MakerTarGz extends MakerBase {
    name = 'targz';
    defaultPlatforms = ['linux'];

    isSupportedOnCurrentPlatform() {
        return process.platform === 'linux';
    }

    async make({ dir, makeDir, packageJSON, targetArch, targetPlatform }) {
        const artifact = path.join(
            makeDir, 'targz', targetPlatform, targetArch,
            `${packageJSON.name}-${targetPlatform}-${targetArch}-${packageJSON.version}.tar.gz`
        );
        await this.ensureFile(artifact);
        const compress = hasPigz() ? ['-I', 'pigz'] : ['-z'];
        await new Promise((resolve, reject) => {
            const tar = spawn(
                'tar',
                [...compress, '-cf', artifact, '-C', path.dirname(dir), path.basename(dir)],
                { stdio: 'inherit' }
            );
            tar.on('error', reject);
            tar.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`tar exited with status ${code}`));
            });
        });
        return [artifact];
    }
}

module.exports = { default: MakerTarGz, MakerTarGz };

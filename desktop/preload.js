const { contextBridge, ipcRenderer } = require('electron');

function arg(name) {
    const prefix = `--${name}=`;
    const hit = process.argv.find(value => value.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : '';
}

// The site's titlebar becomes real window chrome when this is present —
// app-shell.js checks window.vibeApp and rewires – ▢ ✕ accordingly.
contextBridge.exposeInMainWorld('vibeApp', {
    profile: arg('vibe-profile'),
    port: parseInt(arg('vibe-port'), 10) || 4711,
    workspaceDir: decodeURIComponent(arg('vibe-workspace') || ''),
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    getWorkspacePath: () => ipcRenderer.invoke('workspace:path'),
    openWorkspace: relativeDir => ipcRenderer.invoke('workspace:open', relativeDir),
});

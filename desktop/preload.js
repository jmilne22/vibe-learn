const { contextBridge, ipcRenderer } = require('electron');

// The site's titlebar becomes real window chrome when this is present —
// app-shell.js checks window.vibeApp and rewires – ▢ ✕ accordingly.
contextBridge.exposeInMainWorld('vibeApp', {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
});

import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../shared/model";
const api: DesktopAPI = {
  invoke: (command) => ipcRenderer.invoke("learning:invoke", command),
  onChange: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("learning:changed", handler);
    return () => ipcRenderer.removeListener("learning:changed", handler);
  },
};
contextBridge.exposeInMainWorld("learning", api);

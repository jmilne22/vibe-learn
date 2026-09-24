import { app } from "electron";
import path from "node:path";

export const profileDir = () =>
  process.env.VIBE_USER_DATA_DIR ||
  path.join(
    app.getPath("appData"),
    app.isPackaged ? "Vibe Learn 2" : "Vibe Learn 2 Dev",
  );

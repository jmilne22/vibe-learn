import {
  CatalogSchema,
  StateSchema,
  emptyState,
  type DesktopAPI,
  type Command,
  type Catalog,
} from "../shared/model";
declare global {
  interface Window {
    learning?: DesktopAPI;
  }
}
export const desktop = !!window.learning;
export async function invoke(command: Command): Promise<unknown> {
  if (window.learning) return window.learning.invoke(command);
  if (command.type === "catalog") {
    const res = await fetch("./catalog.json");
    if (!res.ok) throw new Error("Could not load the library.");
    return res.json();
  }
  if (command.type === "state") return emptyState();
  throw new Error("Saving and running checks require the desktop app.");
}
export const getCatalog = async (): Promise<Catalog> =>
  CatalogSchema.parse(await invoke({ type: "catalog" }));
export const getState = async () =>
  StateSchema.parse(await invoke({ type: "state" }));

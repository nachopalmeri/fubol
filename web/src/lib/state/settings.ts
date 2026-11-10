import { mutateState, readState } from "./index";

/** Small key/value settings that survive restarts (ICS feed, admin toggles). */
export async function getSetting(key: string): Promise<string | undefined> {
  const doc = await readState();
  return doc.settings[key];
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  await mutateState((doc) => {
    if (value === null) delete doc.settings[key];
    else doc.settings[key] = value;
  });
}

export async function allSettings(): Promise<Record<string, string>> {
  const doc = await readState();
  return { ...doc.settings };
}

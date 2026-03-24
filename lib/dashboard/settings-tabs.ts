export type SettingsTab = "profile" | "business" | "payout" | "security";

export const SETTINGS_TABS: SettingsTab[] = ["profile", "business", "payout", "security"];

export function isSettingsTab(value: string | null): value is SettingsTab {
  return Boolean(value && SETTINGS_TABS.includes(value as SettingsTab));
}

export function getAccessibleSettingsTab(
  tab: SettingsTab,
  options: { canReadBusinessSettings: boolean; canReadPayoutSettings: boolean }
): SettingsTab {
  if (tab === "business" && !options.canReadBusinessSettings) {
    return "profile";
  }
  if (tab === "payout" && !options.canReadPayoutSettings) {
    return "profile";
  }
  return tab;
}

export function resolveRequestedSettingsTab(
  value: string | null,
  options: { canReadBusinessSettings: boolean; canReadPayoutSettings: boolean }
): SettingsTab {
  const requestedTab = isSettingsTab(value) ? value : "profile";
  return getAccessibleSettingsTab(requestedTab, options);
}

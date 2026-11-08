declare const __TINANAI_BUILD_ID__: string | null;
export const frontendBuildId = typeof __TINANAI_BUILD_ID__ === 'undefined' ? null : __TINANAI_BUILD_ID__;
export function currentWebsite() {
  return typeof window === 'undefined' ? null : window.location.origin;
}

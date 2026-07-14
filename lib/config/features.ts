import "server-only";

export function isLayoutAdminEnabled() {
  return process.env.LAYOUT_ADMIN_ENABLED === "true";
}

export type FirebaseTokenUser = { getIdToken(forceRefresh?: boolean): Promise<string> };

export type FirebaseAnalyticsClient = {
  analyze(activityId: string): Promise<Record<string, unknown>>;
  getAnalytics(activityId: string): Promise<Record<string, unknown>>;
  getSeries(activityId: string): Promise<Record<string, unknown>>;
  createInsight(activityId: string): Promise<Record<string, unknown>>;
};

export function createFirebaseAnalyticsClient(
  origin: string,
  currentUser: () => FirebaseTokenUser | null,
): FirebaseAnalyticsClient {
  const base = origin.replace(/\/$/, "");
  async function request(path: string, method = "GET") {
    const user = currentUser();
    if (!user) throw new Error("Sign in is required.");
    const token = await user.getIdToken();
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        typeof payload.detail === "string" ? payload.detail : "Analytics request failed.",
      );
    }
    return response.json() as Promise<Record<string, unknown>>;
  }
  const activityPath = (activityId: string) =>
    `/v1/activities/${encodeURIComponent(activityId)}`;
  return {
    analyze: (activityId) => request(`${activityPath(activityId)}/analyze`, "POST"),
    getAnalytics: (activityId) => request(`${activityPath(activityId)}/analytics`),
    getSeries: (activityId) => request(`${activityPath(activityId)}/series`),
    createInsight: (activityId) => request(`${activityPath(activityId)}/insights`, "POST"),
  };
}

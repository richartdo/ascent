const notificationColumns = `
  id, type, title, message, opportunity_id, application_id, scheduled_for,
  read_at, dismissed_at, created_at, updated_at
`;

const serviceError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const databaseError = () => serviceError("A notification database operation failed.", 500, "NOTIFICATION_DATABASE_ERROR");
const notFoundError = () => serviceError("The notification was not found.", 404, "NOTIFICATION_NOT_FOUND");

const mapNotification = (row) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  message: row.message,
  opportunityId: row.opportunity_id,
  applicationId: row.application_id,
  scheduledFor: row.scheduled_for,
  readAt: row.read_at,
  dismissedAt: row.dismissed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const syncDeadlineNotifications = async ({ supabase }) => {
  const { error } = await supabase.rpc("sync_my_deadline_notifications");
  if (error) throw databaseError();
};

export const listNotifications = async ({ supabase, userId, filters }) => {
  await syncDeadlineNotifications({ supabase });
  const { page, limit } = filters;
  let query = supabase
    .from("notifications")
    .select(notificationColumns, { count: "exact" })
    .eq("user_id", userId)
    .is("dismissed_at", null);
  if (filters.unreadOnly) query = query.is("read_at", null);
  if (filters.type) query = query.eq("type", filters.type);
  const { data, error, count } = await query
    .order("scheduled_for", { ascending: false })
    .order("id")
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw databaseError();

  const total = count ?? 0;
  return {
    notifications: (data ?? []).map(mapNotification),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

export const getUnreadCount = async ({ supabase, userId }) => {
  await syncDeadlineNotifications({ supabase });
  const { error, count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("dismissed_at", null);
  if (error) throw databaseError();
  return count ?? 0;
};

const getNotification = async ({ supabase, userId, notificationId }) => {
  const { data, error } = await supabase
    .from("notifications")
    .select(notificationColumns)
    .eq("user_id", userId)
    .eq("id", notificationId)
    .maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFoundError();
  return data;
};

export const markNotificationRead = async ({ supabase, userId, notificationId, now = new Date() }) => {
  const existing = await getNotification({ supabase, userId, notificationId });
  if (existing.read_at || existing.dismissed_at) return mapNotification(existing);

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: now.toISOString() })
    .eq("user_id", userId)
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFoundError();
  return mapNotification(data);
};

export const dismissNotification = async ({ supabase, userId, notificationId, now = new Date() }) => {
  const existing = await getNotification({ supabase, userId, notificationId });
  if (existing.dismissed_at) return mapNotification(existing);

  const { data, error } = await supabase
    .from("notifications")
    .update({ dismissed_at: now.toISOString() })
    .eq("user_id", userId)
    .eq("id", notificationId)
    .select(notificationColumns)
    .maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFoundError();
  return mapNotification(data);
};

export const markAllNotificationsRead = async ({ supabase, userId, now = new Date() }) => {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: now.toISOString() })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("dismissed_at", null)
    .select("id");
  if (error) throw databaseError();
  return data?.length ?? 0;
};

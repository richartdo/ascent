import * as notificationService from "../services/notification.service.js";

export const listNotifications = async (req, res) => {
  const { notifications, pagination } = await notificationService.listNotifications({
    supabase: req.supabase,
    userId: req.auth.user.id,
    filters: req.validatedQuery,
  });
  res.status(200).json({ data: notifications, meta: { ...pagination, requestId: req.id } });
};

export const getUnreadCount = async (req, res) => {
  const count = await notificationService.getUnreadCount({
    supabase: req.supabase,
    userId: req.auth.user.id,
  });
  res.status(200).json({ data: { count } });
};

export const markNotificationRead = async (req, res) => {
  const notification = await notificationService.markNotificationRead({
    supabase: req.supabase,
    userId: req.auth.user.id,
    notificationId: req.validatedParams.notificationId,
  });
  res.status(200).json({ data: { notification } });
};

export const dismissNotification = async (req, res) => {
  const notification = await notificationService.dismissNotification({
    supabase: req.supabase,
    userId: req.auth.user.id,
    notificationId: req.validatedParams.notificationId,
  });
  res.status(200).json({ data: { notification } });
};

export const markAllNotificationsRead = async (req, res) => {
  const updatedCount = await notificationService.markAllNotificationsRead({
    supabase: req.supabase,
    userId: req.auth.user.id,
  });
  res.status(200).json({ data: { updatedCount } });
};

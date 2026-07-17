export const getCurrentUser = (req, res) => {
  const { user } = req.auth;

  res.status(200).json({
    data: {
      user: {
        id: user.id,
        email: user.email ?? null,
        emailVerified: Boolean(user.email_confirmed_at),
        createdAt: user.created_at,
      },
    },
  });
};

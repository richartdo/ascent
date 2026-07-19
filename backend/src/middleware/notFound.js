export const notFound = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl.split("?")[0]} was not found.`,
      requestId: req.id,
    },
  });
};

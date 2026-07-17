export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const error = new Error("The request body contains invalid fields.");
    error.statusCode = 422;
    error.code = "VALIDATION_ERROR";
    error.details = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    next(error);
    return;
  }

  req.validatedBody = result.data;
  next();
};

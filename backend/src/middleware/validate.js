const validationError = (issues, message) => {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = "VALIDATION_ERROR";
  error.details = issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  return error;
};

const validate = (schema, source, target, message) => (req, _res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    next(validationError(result.error.issues, message));
    return;
  }

  req[target] = result.data;
  next();
};

export const validateBody = (schema) =>
  validate(schema, "body", "validatedBody", "The request body contains invalid fields.");

export const validateParams = (schema) =>
  validate(schema, "params", "validatedParams", "The route parameters are invalid.");

export const validateQuery = (schema) =>
  validate(schema, "query", "validatedQuery", "The query parameters are invalid.");

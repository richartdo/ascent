import { env } from "../config/env.js";

const getErrorDetails = (error) => {
  if (error.type === "entity.parse.failed") {
    return {
      status: 400,
      code: "INVALID_JSON",
      message: "The request body contains invalid JSON.",
    };
  }

  if (error.type === "entity.too.large") {
    return {
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "The request body exceeds the allowed size.",
    };
  }

  return {
    status: error.statusCode ?? error.status ?? 500,
    code: error.code ?? "INTERNAL_ERROR",
    message:
      (error.statusCode ?? error.status) && (error.statusCode ?? error.status) < 500
        ? error.message
        : "An unexpected error occurred.",
  };
};

export const errorHandler = (error, req, res, _next) => {
  const { status, code, message } = getErrorDetails(error);

  if (status >= 500 && env.NODE_ENV !== "test") {
    console.error(`request_id=${req.id} code=${code} message=${error.message}`);
  }

  res.status(status).json({
    error: {
      code,
      message,
      requestId: req.id,
    },
  });
};

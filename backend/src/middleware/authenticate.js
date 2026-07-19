import { createUserSupabaseClient } from "../config/supabase.js";

const bearerTokenPattern = /^Bearer ([^\s]+)$/i;

export const createAuthenticationMiddleware = ({
  createClient = createUserSupabaseClient,
} = {}) => {
  return async (req, _res, next) => {
    const authorization = req.get("authorization");
    const match = authorization?.match(bearerTokenPattern);

    if (!match) {
      const error = new Error("A valid bearer access token is required.");
      error.statusCode = 401;
      error.code = "AUTHENTICATION_REQUIRED";
      next(error);
      return;
    }

    try {
      const accessToken = match[1];
      const supabase = createClient(accessToken);
      const { data, error: authError } = await supabase.auth.getUser(accessToken);

      if (authError || !data.user) {
        const error = new Error("The access token is invalid or expired.");
        error.statusCode = 401;
        error.code = "INVALID_TOKEN";
        next(error);
        return;
      }

      req.auth = { user: data.user };
      req.supabase = supabase;
      next();
    } catch (_error) {
      const error = new Error("Unable to verify the access token.");
      error.statusCode = 503;
      error.code = "AUTH_SERVICE_UNAVAILABLE";
      next(error);
    }
  };
};

export const authenticate = createAuthenticationMiddleware();

import express, { type Express } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { isCorsOriginAllowed, parseCorsAllowedOrigins } from "./lib/cors-origin";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
const corsAllowedOrigins = parseCorsAllowedOrigins(process.env.TINANAI_CORS_ALLOWED_ORIGINS);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (isCorsOriginAllowed(origin, corsAllowedOrigins)) {
      callback(null, origin);
      return;
    }
    callback(null, false);
  },
}));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/tinanai/projects")) {
    next();
    return;
  }
  express.json({ limit: "256kb" })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;

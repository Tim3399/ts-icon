import { HttpException, type INestApplication } from "@nestjs/common";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import {
  json,
  urlencoded,
  type ErrorRequestHandler,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { requestIdMiddleware } from "../logging/request-id.middleware";
import { HttpMetricsMiddleware } from "../metrics/http-metrics.middleware";

/** Call before init/listen on an application created with bodyParser: false. */
export function configureHttp(app: INestApplication, cors?: CorsOptions): void {
  const metrics = app.get(HttpMetricsMiddleware);
  app.use(requestIdMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) => metrics.use(req, res, next));
  if (cors) app.enableCors(cors);
  app.use(json({ limit: "100kb" }));
  app.use(urlencoded({ extended: true, limit: "100kb" }));
  const parserErrors: ErrorRequestHandler = (error: unknown, _req, _res, next) => {
    const status = (error as { status?: unknown })?.status;
    next(
      new HttpException(
        status === 413 ? "Request body is too large" : "Invalid request body",
        status === 413 || status === 415 ? status : 400,
      ),
    );
  };
  app.use(parserErrors);
}

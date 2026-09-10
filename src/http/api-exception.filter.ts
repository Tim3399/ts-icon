import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { getRequestId } from "../logging/request-context";
import { InputValidationException } from "./input-validation";

const CODES: Record<number, string> = {
  400: "INVALID_INPUT",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "FILE_TOO_LARGE",
  415: "INVALID_IMAGE",
  422: "UNPROCESSABLE_INPUT",
  429: "RATE_LIMITED",
  502: "UPSTREAM_FAILURE",
  503: "SERVICE_UNAVAILABLE",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    let message: string | string[] = "Internal server error";
    if (error instanceof HttpException) {
      const payload = error.getResponse();
      if (typeof payload === "string") message = payload;
      else {
        const candidate = (payload as { message?: unknown }).message;
        if (typeof candidate === "string") message = candidate;
        else if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) {
          message = candidate;
        } else message = error.message;
      }
    } else {
      // Database and HTTP errors may embed credentials or binary arguments.
      this.logger.error({
        code: "INTERNAL_ERROR",
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
    if (response.headersSent) return;
    const requestId = getRequestId() ?? response.getHeader("X-Request-Id");
    response.status(statusCode).json({
      statusCode,
      code: CODES[statusCode] ?? "INTERNAL_ERROR",
      message,
      ...(error instanceof InputValidationException ? { fieldErrors: error.fieldErrors } : {}),
      ...(typeof requestId === "string" ? { requestId } : {}),
      path: request.path,
    });
  }
}

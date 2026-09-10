import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

/** Only validation constraints are exposed; submitted values and DTO targets stay private. */
export class InputValidationException extends BadRequestException {
  readonly fieldErrors: Record<string, string[]>;

  constructor(errors: ValidationError[]) {
    const fields = new Map<string, string[]>();
    const visit = (items: ValidationError[], parent = "") => {
      for (const item of items) {
        const path = parent ? `${parent}.${item.property}` : item.property;
        if (item.constraints) fields.set(path, Object.values(item.constraints));
        if (item.children?.length) visit(item.children, path);
      }
    };
    visit(errors);
    const fieldErrors = Object.fromEntries(fields);
    super({
      message: Object.values(fieldErrors).flat(),
      fieldErrors,
    });
    this.fieldErrors = fieldErrors;
  }
}

export function inputValidation(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => new InputValidationException(errors),
  });
}

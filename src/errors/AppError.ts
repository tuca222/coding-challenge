export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(400, "VALIDATION_ERROR", message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super(401, "UNAUTHORIZED", "Authentication required");
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super(404, "NOT_FOUND", "Resource not found");
  }
}

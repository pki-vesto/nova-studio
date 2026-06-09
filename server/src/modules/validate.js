// Centralized request validation + the standard API error envelope.
//
// Every error the API returns is shaped { error: string, details?: [...] } so
// clients get one predictable contract. ZodError is mapped to a flat, readable
// `details` array. Validation middleware replaces/merges the parsed body so
// route handlers can trust their input.
const { z } = require("zod");

// The single source of truth for the error response shape.
function errorBody(message, details) {
  return details && details.length ? { error: message, details } : { error: message };
}

// Flatten a ZodError into client-friendly { path, message } entries.
function zodDetails(err) {
  const issues = (err && err.issues) || [];
  return issues.map((i) => ({ path: (i.path || []).join(".") || "(root)", message: i.message }));
}

function isZodError(err) {
  return !!err && (err.name === "ZodError" || Array.isArray(err.issues));
}

// JSON-body validation. On success, the parsed (coerced) values are MERGED back
// onto req.body so the handler reads trusted, type-correct values while any
// fields outside the schema and PUT `field in req.body` diff-checks keep working.
// Use { partial: true } for PUT/PATCH routes that accept a subset of fields.
// Schemas should avoid .default() (let handlers keep their own fallbacks) so
// omitted optional keys stay absent from req.body.
function validateBody(schema, { partial = false } = {}) {
  const s = partial && typeof schema.partial === "function" ? schema.partial() : schema;
  return (req, res, next) => {
    const result = s.safeParse(req.body || {});
    if (!result.success) return res.status(400).json(errorBody("Validatiefout", zodDetails(result.error)));
    req.body = Object.assign(req.body || {}, result.data);
    next();
  };
}

// Multipart/form-data validation (multer routes). Body values arrive as
// strings; this validates/coerces them and MERGES the result back onto
// req.body so req.file and any extra fields survive.
function validateForm(schema, { partial = false } = {}) {
  const s = partial && typeof schema.partial === "function" ? schema.partial() : schema;
  return (req, res, next) => {
    const result = s.safeParse(req.body || {});
    if (!result.success) return res.status(400).json(errorBody("Validatiefout", zodDetails(result.error)));
    req.body = Object.assign(req.body || {}, result.data);
    next();
  };
}

module.exports = { z, validateBody, validateForm, errorBody, zodDetails, isZodError };

// The Convex runtime exposes `process.env` (the deployment's environment
// variables), but it is not Node: we therefore declare only
// `process.env` for typechecking, without including all of @types/node (which
// would let through Node APIs unavailable in the isolate).
declare const process: {
  readonly env: Record<string, string | undefined>;
};

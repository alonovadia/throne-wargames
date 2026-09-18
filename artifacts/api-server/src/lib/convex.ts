import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const convexUrl = process.env.CONVEX_URL;
const client = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export const isConvexConfigured = Boolean(client);

export async function convexQuery<T>(
  functionName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!client) {
    throw new Error("CONVEX_URL is not configured.");
  }
  const reference = makeFunctionReference<"query">(functionName);
  return client.query(reference, args) as Promise<T>;
}

export async function convexMutation<T>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!client) {
    throw new Error("CONVEX_URL is not configured.");
  }
  const reference = makeFunctionReference<"mutation">(functionName);
  return client.mutation(reference, args) as Promise<T>;
}
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { signup, login } from "../services/tenants.js";

export function authRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.post<{ Body: { tenantName: string; tenantType: "personal" | "business"; email: string; password: string } }>(
      "/auth/signup",
      async (request, reply) => {
        try {
          const { token, tenant, user } = await signup(ctx.db, request.body);
          return reply.code(201).send({ token, tenant, user: { id: user.id, email: user.email, role: user.role } });
        } catch (err) {
          return reply.code(400).send({ error: (err as Error).message });
        }
      },
    );

    app.post<{ Body: { email: string; password: string } }>("/auth/login", async (request, reply) => {
      try {
        const { token, user } = await login(ctx.db, request.body.email, request.body.password);
        return reply.send({ token, user: { id: user.id, email: user.email, role: user.role } });
      } catch (err) {
        return reply.code(401).send({ error: (err as Error).message });
      }
    });
  };
}

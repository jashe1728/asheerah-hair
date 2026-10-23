import worker from './stripe-worker.cjs';
import orderEmail from './order-email.cjs';
import managementAuth from './management-auth.cjs';
import businessDashboard from './business-dashboard.cjs';

export default {
  fetch(request, env, ctx) {
    return worker.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(orderEmail.retryPending(env));
    ctx.waitUntil(managementAuth.cleanup(env));
    ctx.waitUntil(businessDashboard.backfill(env));
  },
};

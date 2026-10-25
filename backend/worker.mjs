import worker from './stripe-worker.cjs';
import orderEmail from './order-email.cjs';
import managementAuth from './management-auth.cjs';
import businessDashboard from './business-dashboard.cjs';
import publicSecurity from './public-security.cjs';
import newsletter from './newsletter.cjs';
import checkoutMonitor from './checkout-monitor.cjs';

export default {
  fetch(request, env, ctx) {
    return worker.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(orderEmail.retryPending(env));
    ctx.waitUntil(managementAuth.cleanup(env));
    ctx.waitUntil(businessDashboard.backfill(env));
    ctx.waitUntil(publicSecurity.cleanup(env));
    ctx.waitUntil(newsletter.processQueue(env));
    ctx.waitUntil(checkoutMonitor.run(env));
  },
};

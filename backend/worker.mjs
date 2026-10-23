import worker from './stripe-worker.cjs';
import orderEmail from './order-email.cjs';

export default {
  fetch(request, env, ctx) {
    return worker.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(orderEmail.retryPending(env));
  },
};

import worker from './stripe-worker.cjs';

export default {
  fetch(request, env, ctx) {
    return worker.fetch(request, env, ctx);
  },
};

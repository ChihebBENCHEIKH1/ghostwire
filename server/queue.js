'use strict';

/**
 * server/queue.js — In-memory processing queue
 *
 * Serialises pipeline jobs so burst traffic doesn't spawn concurrent
 * SQLite writes or flood the WebSocket channel simultaneously.
 *
 * Design: single-concurrency FIFO (MAX_CONCURRENT = 1) keeps the
 * canvas animation sequential and the logs readable. Increase
 * MAX_CONCURRENT if you need parallel pipelines later.
 */

const MAX_CONCURRENT = 1;

let active = 0;
const pending = [];

/**
 * Push a job onto the queue and return a Promise that resolves when
 * the job has been processed (or rejects if it throws).
 *
 * @param {(job: T) => Promise<void>} processor
 * @param {T} job
 */
function enqueue(processor, job) {
  return new Promise((resolve, reject) => {
    pending.push({ processor, job, resolve, reject });
    drain();
  });
}

function drain() {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const item = pending.shift();
    active++;
    item.processor(item.job)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        active--;
        drain();
      });
  }
}

function getStats() {
  return { active, pending: pending.length };
}

module.exports = { enqueue, getStats };

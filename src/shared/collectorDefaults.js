'use strict';

const DEFAULT_TIMEOUT_MS = 300_000;

function withTimeout(collectorOptions, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return {
    ...collectorOptions,
    time: collectorOptions?.time ?? timeoutMs,
  };
}

module.exports = {
  withTimeout,
  DEFAULT_TIMEOUT_MS,
};

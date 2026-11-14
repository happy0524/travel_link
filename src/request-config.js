// Shared browser/server defaults. No credentials belong in this module.
export const requestConfig = Object.freeze({
  searchDebounceMs: 350,
  editDebounceMs: 250,
  minSearchLength: 2,
  routeCacheTtlMs: 5 * 60_000,
  timeZoneCacheTtlMs: 30 * 60_000,
  placeCacheTtlMs: 5 * 60_000,
  searchCacheTtlMs: 60_000,
  maxCacheEntries: 128,
  // One minute is exact for the minute-resolution UI. WALK ignores departure.
  // Increasing this permits approximation within a bucket; it is NOT billing advice.
  departureBucketMinutes: 1,
  instrumentation: false,
});

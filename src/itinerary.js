import {segmentKey} from './engine.js';

// Provider IDs identify destinations; visit IDs continue to identify directed segments.
export function findDestination(visits, place) {
  return visits.find(visit => {
    const p=visit.place;
    if(p.id===place.id&&p.source===place.source)return true;
    // Tile and Search Box IDs may differ for the same Mapbox POI.
    if(!p.source?.startsWith('mapbox')||!place.source?.startsWith('mapbox'))return false;
    const normalize=s=>(s||'').trim().toLocaleLowerCase();
    return p.id===place.id||(normalize(p.name)===normalize(place.name)&&Math.hypot((p.lat-place.lat)*111000,(p.lng-place.lng)*84000)<50);
  });
}

export function summarize(visits, result) {
  const rowsMatch = result.rows.length === visits.length &&
    result.rows.every((row, i) => row.id === visits[i].id);
  const routes = visits.slice(0, -1).map((visit, i) => result.routes[segmentKey(visit, visits[i + 1])]);
  const travelKnown = routes.every(route => route?.status === 'ok' && Number.isFinite(route.minutes));
  // A pending wait at an unknown arrival cannot be counted as zero.
  const waitingKnown = rowsMatch && result.rows.every((row, i) =>
    !visits[i].wait || (Number.isFinite(row.arrival) && Number.isFinite(row.wait)));
  return {
    travel: travelKnown ? routes.reduce((total, route) => total + route.minutes, 0) : null,
    stay: visits.reduce((total, visit) => total + visit.stay, 0),
    waiting: waitingKnown ? result.rows.reduce((total, row) => total + row.wait, 0) :
      visits.every(visit => !visit.wait) ? 0 : null,
    end: rowsMatch && Number.isFinite(result.rows.at(-1)?.departure) ? result.rows.at(-1).departure : null,
  };
}

export function totalDistance(visits,result) {
  if(visits.length<2)return null;
  const routes=visits.slice(1).map((visit,i)=>result.routes[segmentKey(visits[i],visit)]);
  return routes.every(route=>route?.status==='ok'&&Number.isFinite(route.distance))
    ?routes.reduce((total,route)=>total+route.distance,0):null;
}

export function compareMetrics(before, after) {
  if (!before || !Number.isFinite(before.travel) || !Number.isFinite(after.travel)) {
    return {status: 'unavailable'};
  }
  return {
    status: 'ready',
    travelDelta: after.travel - before.travel,
    endDelta: Number.isFinite(before.end) && Number.isFinite(after.end) ? after.end - before.end : null,
  };
}

// Only the current calculation may commit. Rapid reorders share the last completed baseline.
export class ReorderComparison {
  revision = 0;
  last = null;
  baseline = null;
  value = null;
  begin(reason) {
    this.revision += 1;
    this.baseline = reason === 'reorder' ? this.last : null;
    this.value = reason === 'reorder' ? {status: 'pending'} : null;
    // Edits to stays, waits, modes or dates invalidate the old comparison context.
    if (reason !== 'reorder') this.last = null;
    return this.revision;
  }
  complete(revision, metrics) {
    if (revision !== this.revision) return false;
    if (this.value?.status === 'pending') this.value = compareMetrics(this.baseline, metrics);
    // Keep an unavailable snapshot too: never skip a failed order to claim an older improvement.
    this.last = metrics;
    return true;
  }
  dismiss(revision) {
    if (revision === this.revision) this.value = null;
  }
}

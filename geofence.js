// ChitLan — Bantayan Island geofence check.
//
// MVP approach: a bounding box covering the three Bantayan municipalities
// (Bantayan, Santa Fe, Madridejos) plus their coastal waters. Good enough
// for a community app. If you later want to exclude open sea / nearby
// islands more precisely, swap isWithinBantayan() for a point-in-polygon
// check using the same lat/lng input — nothing else needs to change.
//
// Privacy: verifyBantayanLocation() only ever returns a boolean + reason.
// The raw coordinates never leave this function and are never written to
// Firestore or logged anywhere.

const BANTAYAN_BOUNDS = {
  north: 11.32,
  south: 11.08,
  west: 123.68,
  east: 123.92,
};

export function isWithinBantayan(lat, lng) {
  return (
    lat <= BANTAYAN_BOUNDS.north &&
    lat >= BANTAYAN_BOUNDS.south &&
    lng >= BANTAYAN_BOUNDS.west &&
    lng <= BANTAYAN_BOUNDS.east
  );
}

export function verifyBantayanLocation() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ verified: false, reason: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const inside = isWithinBantayan(pos.coords.latitude, pos.coords.longitude);
        resolve({ verified: inside, reason: inside ? null : 'outside' });
      },
      (err) => {
        const reason = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
        resolve({ verified: false, reason });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

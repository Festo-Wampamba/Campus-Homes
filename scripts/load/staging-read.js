// k6 read-path load test for STAGING only (staging shares the VPS with
// production, so keep runs short and off-peak).
// Run: docker run --rm -i -e LISTING_ID=<uuid> grafana/k6:0.54.0 run - < scripts/load/staging-read.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API_URL || 'https://api-staging.campushomes.co.ug/api/v1';
const WEB = __ENV.WEB_URL || 'https://staging.campushomes.co.ug';
const LISTING_ID = __ENV.LISTING_ID;

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: Number(__ENV.PEAK_VUS || 100) },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{page:search}': ['p(95)<1500'],
    'http_req_duration{page:detail}': ['p(95)<1500'],
    'http_req_duration{page:home}': ['p(95)<2500'],
  },
};

const SEARCH =
  `${API}/listings/search?university=MUK&minLat=-1.5&maxLat=4.3&minLon=29.5&maxLon=35.1`;

export default function () {
  check(http.get(SEARCH, { tags: { page: 'search' } }), { 'search 200': (r) => r.status === 200 });
  if (LISTING_ID) {
    check(http.get(`${API}/listings/${LISTING_ID}`, { tags: { page: 'detail' } }), {
      'detail 200': (r) => r.status === 200,
    });
  }
  check(http.get(`${WEB}/`, { tags: { page: 'home' } }), { 'home 200': (r) => r.status === 200 });
  sleep(1);
}

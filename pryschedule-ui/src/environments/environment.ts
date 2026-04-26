// Production build target — used by `ng build` for the IIS deployment.
//
// apiUrl is intentionally PATH-RELATIVE (no scheme, no host). The browser
// resolves it against whatever origin served the page, so the same build
// works under multiple hostnames without rebuilding:
//   http://localhost/Scheduler/ScheduleUI/                → calls /Scheduler/ScheduleAPI/api/...
//   http://gibbyvon.duckdns.org:9000/Scheduler/ScheduleUI/ → calls gibbyvon.duckdns.org:9000/Scheduler/ScheduleAPI/api/...
//   https://app.example.com/Scheduler/ScheduleUI/         → calls app.example.com/Scheduler/ScheduleAPI/api/...
//
// Bonus: same-origin requests don't go through CORS at all, so the API's
// CORS allow-list doesn't need each new public hostname added to it.
//
// `npm start` / `ng serve` uses environment.development.ts instead, which
// points at http://localhost:5126/api (the Kestrel dev port from
// launchSettings.json) because the Angular dev server is on a different
// origin from the API and a relative URL would target the dev server itself.
export const environment = {
  production: true,
  apiUrl: '/Scheduler/ScheduleAPI/api'
};

// Production build target — used by `ng build` for the IIS deployment at
//   http://localhost/Scheduler/ScheduleUI/   (UI)
//   http://localhost/Scheduler/ScheduleAPI/  (API, hosted by AspNetCoreModuleV2)
// Port 80 is implicit (default HTTP). Requires the .NET 9 Hosting Bundle on
// the IIS server.
//
// `npm start` / `ng serve` uses environment.development.ts instead, which
// points at http://localhost:5126/api (the Kestrel dev port from
// launchSettings.json).
export const environment = {
  production: true,
  apiUrl: 'http://localhost/Scheduler/ScheduleAPI/api'
};

const fs = require("fs");
const { listen } = require("./sarra-canada-amqp");
const { fetchCapFileAndParse } = require("./cap-file-parser");
const { compareAsc, parseISO } = require("date-fns");

const alertsFromCAP = [];
const ALERTS_FOLDER = "./alerts";
const ALERTS_FILE = "alerts.txt";

function startAlertMonitoring(latLong, app) {
  console.log("[ALERT MONITORING] Starting alert monitoring via AMQP...");

  const { emitter: listener } = listen({ amqp_subtopic: "alerts.cap.#" });
  listener
    .on("error", (err) => console.warn(err.message))
    .on("message", (date, url) => {
      console.log("[ALERT MONITORING] Cap file", url, "received at", date, "checking against lat/lon of", latLong);
      fetchCapFileAndParse(url, latLong, (alert) => {
        pushAlertToList(alert);
      });
    });

  // load anything we knew about before we rebooted the system
  loadCurrentAlerts(latLong);

  // setup the endpoint to fetch warnings from
  setupWarningsAPI(app);

  // cleanup potentially stale alerts every 15 seconds
  setInterval(periodicCleanup, 15 * 1000 * 60);
}

function pushAlertToList(alert) {
  const { identifier, references, expires } = alert;

  // this is a pretty wild guess, BUT, from what i understand, the references lists any
  // identifiers that this is updating or in relation too, so with that, if the references
  // includes an identifier, we should remove that alert because it's stale
  const ix = alertsFromCAP.findIndex((a) => references.includes(a.identifier));
  if (ix !== -1) alertsFromCAP.splice(ix, 1, alert);
  else alertsFromCAP.push(alert);

  console.log(
    `[ALERT MONITORING] Ingested CAP (${identifier}), expiry set for ${expires}`,
    `(total: ${alertsFromCAP.length})`
  );

  saveCurrentAlerts();
}

function periodicCleanup() {
  if (!alertsFromCAP || !alertsFromCAP.length) return;
  console.log("[ALERT MONITORING] Running periodic cleanup...");

  // loop backwards through the alerts and remove any that are expired
  alertsFromCAP.reverse().forEach((alert, ix) => {
    const { identifier, expires } = alert;
    const utcDate = parseISO(new Date().toISOString());
    const expiresDate = parseISO(expires);

    // utc date is past the expiry so it needs removing
    if (compareAsc(utcDate, expiresDate) === 1) {
      alertsFromCAP.splice(ix, 1);
      console.log(`[ALERT MONITORING] Removing expired CAP (${identifier}`);
    }
  });

  saveCurrentAlerts();

  console.log("[ALERT MONITORING] Periodic cleanup completed");
}

function saveCurrentAlerts() {
  const alertFile = `${ALERTS_FOLDER}/${ALERTS_FILE}`;
  fs.writeFile(alertFile, alertsFromCAP.map((a) => a.url).join("\n"), "utf8", () => {
    console.log("[ALERT MONITORING] CAP files stored locally incase of restart");
  });
}

function loadCurrentAlerts(latLong) {
  const alertFile = `${ALERTS_FOLDER}/${ALERTS_FILE}`;
  fs.stat(alertFile, (err, stat) => {
    if (err || stat.size < 1) console.log("[ALERT MONITORING] No stored alerts");
    else {
      fs.readFile(alertFile, "utf8", (err, data) => {
        if (err) console.log("[ALERT MONITORING] Unable to load stored alerts");
        else {
          const capFileURLArray = data.split(/\r?\n/g);

          console.log(`[ALERT MONITORING] Refetching ${capFileURLArray.length} CAP files...`);
          capFileURLArray.forEach((url) => {
            fetchCapFileAndParse(
              url,
              latLong,
              (alert) => {
                pushAlertToList(alert);
              },
              true
            );
          });
        }
      });
    }
  });
}

function setupWarningsAPI(app) {
  if (!app) return;

  app.get("/api/warnings", (req, res) => {
    // sort the cap files in priority order
    const sortedAlerts = sortAlertsInPriorityOrder(alertsFromCAP);
    res.send({ warnings: sortedAlerts || [] });
  });
}

function sortAlertsInPriorityOrder(alerts) {
  if (!alerts || !alerts.length) return;

  return (
    alerts.sort((a, b) => {
      // sort by severity
      const aSeverity = SEVERITY_VALUES[a.severity.toUpperCase()];
      const bSeverity = SEVERITY_VALUES[b.severity.toUpperCase()];
      if (aSeverity > bSeverity) return -1;
      if (bSeverity > aSeverity) return 1;

      // then by urgency
      const aUrgency = URGENCY_VALUES[a.urgency.toUpperCase()];
      const bUrgency = URGENCY_VALUES[b.urgency.toUpperCase()];
      if (aUrgency > bUrgency) return -1;
      if (bUrgency > aUrgency) return 1;

      // then by date
      if (a.sent > b.sent) return -1;
      if (b.sent > a.sent) return 1;

      // both the same
      return 0;
    }) || []
  );
}

const SEVERITY_VALUES = {
  UNKNOWN: 0,
  MINOR: 1,
  MODERATE: 2,
  SEVERE: 3,
  EXTREME: 4,
};

const URGENCY_VALUES = {
  UNKNOWN: 0,
  PAST: 1,
  FUTURE: 2,
  EXPECTED: 3,
  IMMEDIATE: 4,
};

module.exports = { startAlertMonitoring };

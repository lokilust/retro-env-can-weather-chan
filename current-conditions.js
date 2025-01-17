const axios = require("axios");
const Weather = require("ec-weather-js");
const { addMinutes } = require("date-fns");

const { convertECCDateStringToDateObject, isWindchillSeason, getDayOfYearAdjustedForLeapDay } = require("./date-utils");
const { getAQHIObservation } = require("./aqhi-observation");
const { getHotColdSpotsCanada } = require("./province-today-observation.js");
const { startCurrentConditionMonitoring } = require("./current-conditions-amqp");
const { getRecordDataForDayOfYear } = require("./alternate-record-data");

const CURRENT_CONDITIONS_FETCH_INTERVAL = 5 * 60 * 1000;
const CURRENT_CONDITIONS_EVENT_STREAM_INTERVAL = 5 * 1000;

let currentConditionsLocation = null;
let historicalData = null;
const conditions = {
  observed: {
    unixTimestamp: 0,
    localTime: null,
    stationTime: null,
  },
  city: null,
  conditions: null,
  riseSet: null,
  forecast: null,
  regionalNormals: null,
  conditionID: null,
};
let eventStreamInterval = null;
let amqpConnection = null;
let configRejectInHourConditonUpdates = false;
let stationLatLong = { lat: 0, long: 0 };

const initCurrentConditions = (primaryLocation, rejectInHourConditionUpdates, app, historicalDataAPI) => {
  // pass in the primary location from the config and make sure its valid
  if (!primaryLocation || !primaryLocation.province || !primaryLocation.location) return;

  // store this for later use
  currentConditionsLocation = { ...primaryLocation };
  historicalData = historicalDataAPI;
  configRejectInHourConditonUpdates = rejectInHourConditionUpdates;

  // start the amqp monitoring for the current conditions
  const { province, location } = currentConditionsLocation;
  amqpConnection = startCurrentConditionMonitoring(province, location, fetchCurrentConditions);

  // even though we've started amqp for conditions, we should do our own fetch since we might have missed an update
  fetchCurrentConditions();

  // setup the live event-stream for the client to keep up to date on the current conditions
  app &&
    app.get("/api/weather/live", (req, res) => {
      // tell the client this is an event stream
      res.writeHead(200, {
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });

      // clear old event stream
      eventStreamInterval && clearInterval(eventStreamInterval);

      // write the event stream periodically
      eventStreamInterval = setInterval(() => writeEventStream(res), CURRENT_CONDITIONS_EVENT_STREAM_INTERVAL);

      // and send an event stream right away too
      writeEventStream(res);
    });
};

const reloadCurrentConditions = (location, rejectInHourConditionUpdates) => {
  if (!location) return;

  configRejectInHourConditonUpdates = rejectInHourConditionUpdates;

  if (amqpConnection) amqpConnection.disconnect();

  currentConditionsLocation = { ...location };
  amqpConnection = startCurrentConditionMonitoring(
    currentConditionsLocation.province,
    currentConditionsLocation.location,
    fetchCurrentConditions
  );

  fetchCurrentConditions();
};

const getStationLastObservedDateTime = () => {
  // we'll use this in future methods when retrieving historical data to stop things being
  // weirdly timezoned and data being inaccurate to what was actually sent over last
  return conditions.observed.stationTime;
};

const fetchCurrentConditions = (url) => {
  if (!currentConditionsLocation) return;

  const previousConditionsID = conditions.conditionID;

  const { province, location } = currentConditionsLocation;
  url = url || `https://dd.weather.gc.ca/citypage_weather/xml/${province}/${location}_e.xml`;
  axios
    .get(url)
    .then((resp) => {
      const weather = new Weather(resp.data);
      if (!weather) return;

      // all: almanac, riseset, location, yesterday
      const allWeatherData = weather.all;
      if (!allWeatherData) return;

      // first step is figure out the condition id
      const conditionID = generateConditionsUniqueID(weather.current?.dateTime[1]);

      // if we got the same condition id, and we're rejecting in-hour, all we need to do is update the forecast
      if (configRejectInHourConditonUpdates && conditionID === previousConditionsID) {
        console.log("[CONDITIONS]", "Rejecting in-hour update for conditon ID", conditionID);
        return (conditions.forecast = weather.weekly);
      }

      // store the long/lat for later use
      const {
        name: { lat, lon },
      } = allWeatherData.location;
      parseStationLatLong(lat, lon);

      // generate some objects so the FE has less work to do once it receives the data
      const observedDateObject = generateConditionsObserved(weather.current?.dateTime[1]);
      const city = generateObservedCity(allWeatherData.location);
      const observedConditions = generateConditions(weather.current);
      const sunRiseSet = generateSunriseSet(allWeatherData.riseSet?.dateTime);
      const almanac = generateAlmanac(allWeatherData.almanac);
      const windchill = generateWindchill(observedConditions);

      // place these into the global conditions object we have that can be used elsewhere
      conditions.city = city;
      conditions.observed = observedDateObject;
      conditions.conditions = observedConditions;
      conditions.riseSet = sunRiseSet;
      conditions.regionalNormals = weather.all.regionalNormals;
      conditions.almanac = almanac;
      conditions.windchill = windchill;
      conditions.conditionID = conditionID;
      conditions.forecast = weather.weekly;

      // if the conditions ID has updated this means new info is available which means we should fetch more historical data
      if (conditions.conditionID !== previousConditionsID) historicalData && historicalData.fetchHistoricalData();
    })
    .catch(() => {
      console.error("[CONDITIONS]", "Failed to fetch in-hour update from AMQP push");
    });
};

const parseStationLatLong = (lat, long) => {
  // we get these in string format with compass directions so we need to convert slightly
  // N is positive, S is negative
  if (lat.includes("N")) stationLatLong.lat = parseFloat(lat);
  else stationLatLong.lat = -parseFloat(lat);

  // E is postive, W is negative
  if (long.includes("E")) stationLatLong.long = parseFloat(long);
  else stationLatLong.long = -parseFloat(long);
};

const generateConditionsObserved = (date) => {
  if (!date) return;

  // create a date object for when this was observed on the local machine
  const localTime = convertECCDateStringToDateObject(date.textSummary);

  // now we need to calculate the time at the station based off what it says the utc offset is
  // and what the utc offset is for the local time. the date object will show as the local timezone
  // because timezones aren't a thing we can change. it will just move the time (and date) back the correct amount
  // the offset in JS is given in minutes
  const localOffset = -localTime.getTimezoneOffset();

  // so we need to transfer the offset in hours to minutes
  // then mush them together and create an offset from local
  const stationUTCOffset = parseInt(date.UTCOffset) * 60;
  const offsetFromLocalTime = stationUTCOffset - localOffset;

  // create the station time (remember this will be in the local timezone, just with the hour adjusted)
  const stationTime = addMinutes(localTime, offsetFromLocalTime);
  return {
    localTime,
    localTimeInSeconds: localTime.getTime() / 1000,
    stationTime,
    stationTimeInSeconds: stationTime.getTime() / 1000,
    stationTimezone: date.zone,
    stationOffsetMinutesFromLocal: offsetFromLocalTime,
  };
};

const generateObservedCity = (location) => {
  const { name } = location;
  const { value } = name || {};
  return value;
};

const generateConditions = (conditions) => {
  const { condition, pressure, relativeHumidity, temperature, visibility, wind } = conditions || {};
  return { condition, pressure, relativeHumidity, temperature, visibility, wind };
};

const generateSunriseSet = (riseset) => {
  const riseSetData = { rise: null, set: null };

  // station sunrise time
  const stationRiseTimeObj = riseset.find((data) => data.name === "sunrise" && data.zone !== "UTC");
  if (stationRiseTimeObj) {
    let time = convertECCDateStringToDateObject(stationRiseTimeObj.textSummary);
    riseSetData.rise = { time, timeInSeconds: time.getTime() / 1000 };
  }

  // station sunset time
  const stationSetTimeObj = riseset.find((data) => data.name === "sunset" && data.zone !== "UTC");
  if (stationSetTimeObj) {
    let time = convertECCDateStringToDateObject(stationSetTimeObj.textSummary);
    riseSetData.set = { time, timeInSeconds: time.getTime() / 1000 };
  }

  // again remember that whilst the date object has a timezone of whatever the local machine is set to
  // the date object/unix seconds is pointing to a time that is at the station, JS doesn't do timezones well
  return riseSetData;
};

const generateAlmanac = (almanac) => {
  // we need to fetch the historical values from the historical data at this point, we will use the current observed date
  // to fetch the historical data, rather than the current time value so that data doesn't get muddled up
  // where it was showing normal/record from observed, and and the last year from the current date/time

  // if we have an alternative data source for records we can fetch it here
  const leapYearAdjustedDayOfYear = getDayOfYearAdjustedForLeapDay();
  const recordData = getRecordDataForDayOfYear(leapYearAdjustedDayOfYear);

  // if theres no record data, just return the usual data
  if (!recordData) return almanac;

  // first entry is the extreme max
  const temperature = almanac.temperature;
  const [extremeMax, extremeMin] = temperature;

  // check we got record data for hi, only need to check year because value could be 0
  if (recordData.hi?.year)
    temperature.splice(0, 1, {
      ...extremeMax,
      value: `${recordData.hi.value.toFixed(1)}`,
      year: `${recordData.hi.year}`,
      period: "Custom",
    });

  // check we got record data for lo, only need to check year because value could be 0
  if (recordData.lo?.year)
    temperature.splice(1, 1, {
      ...extremeMin,
      value: `${recordData.lo.value.toFixed(1)}`,
      year: `${recordData.lo.year}`,
      period: "Custom",
    });

  // otherwise return adjusted data
  return { ...almanac, temperature };
};

const generateWindchill = (conditions) => {
  const { temperature, wind } = conditions;

  // get temp val
  const tempVal = temperature && temperature.value;
  if (isNaN(tempVal)) return 0;

  // get wind speed val
  const windVal = wind && wind.speed?.value;
  if (isNaN(windVal)) return 0;

  // if the temperature is greather than 0, don't bother doing this
  if (tempVal > 0) return 0;

  // the old windchill system was a number based off temp and wind speed, rather than just a random temp
  // this is calculated as below, then rounded up to the nearest 50, if its >= 1350 then windchill should be shown
  const tempAsFloat = parseFloat(tempVal);
  const windSpeed = parseInt(windVal);
  const windSpeedMs = windSpeed / 3.6;

  const windchill = Math.floor(
    (12.1452 + 11.6222 * Math.sqrt(windSpeedMs) - 1.16222 * windSpeedMs) * (33 - tempAsFloat)
  );

  // round it to nearest 50 and if its >= 1200 with a windspeed >= 10 its relevant
  const roundedWindchill = Math.round(windchill / 50) * 50;
  return roundedWindchill >= 1200 && windSpeed >= 10 ? roundedWindchill : 0;
};

const generateConditionsUniqueID = (date) => {
  // this generates a unique id for the conditions update that we can refer back to
  // for now we'll just use the timestamp that the data returned for the stations time
  if (!date) return null;
  return date.timeStamp;
};

const generateWeatherResponse = () => {
  return {
    ...conditions,
    almanac: { ...conditions.almanac, lastYear: (historicalData && historicalData.lastYearObservation()) || {} },
    canadaHotColdSpots: getHotColdSpotsCanada(),
    airQuality: getAQHIObservation(),
    isWindchillSeason: isWindchillSeason(),
  };
};

const getStationLatLong = () => {
  return stationLatLong;
};

const writeEventStream = (res) => {
  res.write(`id: ${Date.now()}\n`);
  res.write(`event: condition_update\n`);
  res.write(`data: ${JSON.stringify(generateWeatherResponse())}\n\n`);
};

module.exports = {
  initCurrentConditions,
  fetchCurrentConditions,
  getStationLastObservedDateTime,
  reloadCurrentConditions,
  generateWindchill,
  generateAlmanac,
  getStationLatLong,
};

import { shallowMount, enableAutoUnmount } from "@vue/test-utils";
import { parseISO, format } from "date-fns";

import { EventBus } from "../src/js/EventBus";
import Surrounding from "../src/components/surrounding";

import { getFreshStore } from "./build";
import ecdata from "./data/ecdata";

const cityA = { name: "a", observation: { temp: 10, condition: "sunny" }, area: "mb/on" };
const cityB = { name: "b", observation: { temp: 15, condition: "mostly cloudy" }, area: "mb/on" };
const cityC = { name: "c", observation: { temp: 25, condition: "light rainshower" }, area: "mb/on" };
const cityD = { name: "d", observation: { temp: 30, condition: "sunny" }, area: "mb/on" };
const cityE = { name: "e", observation: { temp: 23, condition: "partly cloudy" }, area: "east" };
const cityF = { name: "f", observation: { temp: 12, condition: "thunderstorms" }, area: "east" };
const cityG = { name: "g", observation: { temp: 30, condition: "smoke" }, area: "east" };
const cityH = { name: "h", observation: { temp: 5, condition: "fog" }, area: "east" };
const cityI = { name: "i", observation: { temp: 17, condition: "drizzle" }, area: "west" };
const cityJ = { name: "j", observation: { temp: 22, condition: "mist" }, area: "west" };
const cityK = { name: "k", observation: { temp: 11, condition: "mist" }, area: "west" };
const cityL = { name: "l", observation: { temp: 12, condition: "mist" }, area: "west" };
const cityM = { name: "m", observation: { temp: 13, condition: "mist" }, area: "mb/on" };
const cityN = { name: "m", observation: { temp: 14, condition: "heavy snow" } };

enableAutoUnmount(afterEach);

let wrapper, vm;
const build = () =>
  shallowMount(Surrounding, {
    global: { plugins: [getFreshStore(ecdata)] },
    props: { observations: [cityB, cityA, cityC] },
  });

beforeEach(() => {
  wrapper = build();
  vm = wrapper.vm;
});

afterEach(() => {
  wrapper = null;
  vm = null;
});

test("observationsUnavailable: correctly computes based on observations", async (done) => {
  await wrapper.setProps({ observations: [] });
  expect(vm.observationsUnavailable).toBe(true);

  await wrapper.setProps({ observations: [cityB, cityA, cityC] });
  expect(vm.observationsUnavailable).toBe(false);
  done();
});

test("dateTime: correctly produces the date/time string with filled in timezone", async (done) => {
  const time = parseISO(ecdata.observed.stationTime);
  const expectedDate = format(time, "MMM dd/yy");
  expect(vm.dateTime).toContain(`${ecdata.observed.stationTimezone}`);
  expect(vm.dateTime).toContain(`&nbsp;&nbsp;${expectedDate}`);
  done();
});

test("paginatedObservations: correctly paginates observations", async (done) => {
  await wrapper.setProps({
    observations: [cityB, cityA, cityC, cityD, cityE, cityF, cityG, cityH, cityI, cityJ, cityK, cityL, cityM],
  });

  expect(vm.paginatedObservations).toStrictEqual([cityB, cityA, cityC, cityD, cityE, cityF, cityG]);

  vm.page += 1;
  expect(vm.paginatedObservations).toStrictEqual([cityH, cityI, cityJ, cityK, cityL, cityM]);
  done();
});

test("generateObservationsScreen: correctly generates the page count", async (done) => {
  await wrapper.setProps({ observations: [] });

  vm.generateObservationsScreen();
  expect(vm.pages).toBe(0);

  await wrapper.setProps({ observations: [cityB, cityA, cityC] });
  vm.generateObservationsScreen();
  expect(vm.pages).toBe(1);

  done();
});

test("generateObservationsScreen: changes page after 15s", async (done) => {
  await wrapper.setProps({
    observations: [cityB, cityA, cityC, cityD, cityE, cityF, cityG, cityH, cityI, cityJ, cityK, cityL, cityM],
  });

  jest.useFakeTimers();
  const spy = jest.spyOn(vm, "changePage");

  vm.generateObservationsScreen();
  jest.advanceTimersByTime(15 * 1000);
  expect(spy).toHaveBeenCalled();
  expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function), 15 * 1000);
  expect(vm.page).toBe(2);
  done();
});

test("changePage: changes page correctly", async (done) => {
  await wrapper.setProps({
    observations: [cityB, cityA, cityC, cityD, cityE, cityF, cityG, cityH, cityI, cityJ, cityK, cityL, cityM],
  });

  vm.generateObservationsScreen();
  vm.changePage();
  expect(vm.page).toBe(2);
  done();
});

test("changePage: navigates away if its the last page", (done) => {
  EventBus.off("observation-complete");
  EventBus.on("observation-complete", () => {
    expect(vm.page).toBe(0);
    done();
  });

  vm.changePage();
});

test("padTitle: makes sure a city name is always 13 characters", (done) => {
  const cityA = vm.padTitle("Winnipeg");
  expect(cityA).toBe("Winnipeg&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");

  const cityB = vm.padTitle("Banff");
  expect(cityB).toBe("Banff&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");

  const cityC = vm.padTitle("Niagra Falls");
  expect(cityC).toBe("Niagra Falls&nbsp;");
  done();
});

test("trimCondition: makes sure condition string is only 13 characters", (done) => {
  const conditionA = vm.trimCondition("sunny");
  expect(conditionA).toBe("sunny");

  const conditionB = vm.trimCondition("mostly cloudy");
  expect(conditionB).toBe("mostly cloudy");

  const conditionC = vm.trimCondition("thunderstorm with light rainshower");
  expect(conditionC).toBe("thunderstorm");

  done();
});

test("trimCondition: handles light/heavy and rain/snowshower better", (done) => {
  const conditionA = vm.trimCondition("sunny");
  expect(conditionA).toBe("sunny");

  const conditionB = vm.trimCondition("light rainshower");
  expect(conditionB).toBe("lgt rainshwr");

  expect(vm.trimCondition("")).toBe("");
  expect(vm.trimCondition("heavy thunderstorm")).toBe("heavy tstorm");
  expect(vm.trimCondition("heavy rainshower")).toBe("hvy rainshwr");
  expect(vm.trimCondition("mostly cloudy")).toBe("mostly cloudy");
  expect(vm.trimCondition("partly cloudy")).toBe("partly cloudy");
  expect(vm.trimCondition("mostly clear")).toBe("mostly clear");
  expect(vm.trimCondition("light rain")).toBe("light rain");
  expect(vm.trimCondition("rainshower")).toBe("rainshower");
  expect(vm.trimCondition("light rainshower")).toBe("lgt rainshwr");
  expect(vm.trimCondition("heavy rainshower")).toBe("hvy rainshwr");
  expect(vm.trimCondition("light snowshower")).toBe("lgt snowshwr");
  expect(vm.trimCondition("heavy snowshower")).toBe("hvy snowshwr");

  done();
});

test("trimCondition: handles light/heavy rain and snow", (done) => {
  expect(vm.trimCondition("light rain and snow")).toBe("rain/snow");
  expect(vm.trimCondition("heavy rain and snow")).toBe("rain/snow");
  expect(vm.trimCondition("light snow and rain")).toBe("rain/snow");
  expect(vm.trimCondition("heavy snow and rain")).toBe("rain/snow");
  done();
});

test("trimCondition: handles light/heavy freezing rain", (done) => {
  expect(vm.trimCondition("light freezing rain")).toBe("lgt frzg rain");
  expect(vm.trimCondition("heavy freezing rain")).toBe("hvy frzg rain");
  done();
});

test("trimCondition: handles light/heavy snow + blowing snow", (done) => {
  expect(vm.trimCondition("light snow and blowing snow")).toBe("snow/blw snow");
  expect(vm.trimCondition("heavy snow and blowing snow")).toBe("snow/blw snow");
  expect(vm.trimCondition("light snow shower and blowing snow")).toBe("snow/blw snow");
  expect(vm.trimCondition("heavy snow shower and blowing snow")).toBe("snow/blw snow");
  done();
});

test("trimCondition: handles light/heavy freezing drizzle", (done) => {
  expect(vm.trimCondition("light freezing drizzle")).toBe("lgt frzg drzl");
  expect(vm.trimCondition("heavy freezing drizzle")).toBe("hvy frzg drzl");
  done();
});

test("trimCondition: handles light/heavy rain + drizzle", (done) => {
  expect(vm.trimCondition("light rain and drizzle")).toBe("lgt rain/drzl");
  expect(vm.trimCondition("heavy rain and drizzle")).toBe("hvy rain/drzl");
  done();
});

test("trimCondition: handles light/heavy drizzle fog/mist", (done) => {
  expect(vm.trimCondition("light drizzle fog/mist")).toBe("light drizzle");
  expect(vm.trimCondition("heavy drizzle fog/mist")).toBe("heavy drizzle");
  done();
});

test("trimConditions: gets rid of fog/mist if theres a space before it", (done) => {
  expect(vm.trimCondition("Light Snow Fog/Mist")).toBe("light snow");
  expect(vm.trimCondition("Light Snow and Fog/Mist")).toBe("light snow");
  expect(vm.trimCondition("Rain Fog/Mist")).toBe("rain");
  expect(vm.trimCondition("Rain and Fog/Mist")).toBe("rain");
  expect(vm.trimCondition("Drizzle Fog/Mist")).toBe("drizzle");
  expect(vm.trimCondition("Drizzle and Fog/Mist")).toBe("drizzle");
  done();
});

test("trimConditions: handles [condition] and drizzle", (done) => {
  expect(vm.trimCondition("Light Drizzle and Fog")).toBe("light drizzle");
  done();
});

test("trimConditions: handles freezing fog correctly", (done) => {
  expect(vm.trimCondition("Freezing Fog")).toBe("freezing fog");
  done();
});

test("padString: pads strings correctly when a length is given", (done) => {
  const stringA = vm.padString("-15.5", 5);
  expect(stringA).toBe("-15.5");

  const stringB = vm.padString("15.5", 5);
  expect(stringB).toBe("15.5&nbsp;");

  const stringC = vm.padString("5.5", 5);
  expect(stringC).toBe("5.5&nbsp;&nbsp;");

  const stringD = vm.padString("15.5", 4);
  expect(stringD).toBe("15.5");

  const stringE = vm.padString("-15.5", 5, true);
  expect(stringE).toBe("-15.5");

  const stringF = vm.padString("15.5", 5, true);
  expect(stringF).toBe("&nbsp;15.5");

  const stringG = vm.padString("5.5", 5, true);
  expect(stringG).toBe("&nbsp;&nbsp;5.5");

  const stringH = vm.padString("15.5", 4, true);
  expect(stringH).toBe("15.5");

  done();
});

test("padString: doesn't error when no string is passed", (done) => {
  const stringA = vm.padString(null, 5);
  expect(stringA).toBe("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");

  const stringB = vm.padString("", 5);
  expect(stringB).toBe("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");

  done();
});

test("padString: handles a 0 value correctly", (done) => {
  const stringA = vm.padString(0, 5);
  expect(stringA).toBe("0&nbsp;&nbsp;&nbsp;&nbsp;");
  done();
});

test("roundTemp: handles a NaN correctly", (done) => {
  expect(vm.roundTemp()).toBe("");
  expect(vm.roundTemp(NaN)).toBe("");
  done();
});

test("roundTemp: handles a normal number correctly", (done) => {
  expect(vm.roundTemp(1.1)).toBe(1);
  expect(vm.roundTemp(3.5)).toBe(4);
  expect(vm.roundTemp(16.7)).toBe(17);
  expect(vm.roundTemp(-1.4)).toBe(-1);
  done();
});

test("destroyed: removes page change interval", (done) => {
  wrapper.unmount();
  expect(clearInterval).toHaveBeenCalled();
  done();
});

test("paginateStationsByCount: computes correctly", async (done) => {
  await wrapper.setProps({
    observations: [cityB, cityA, cityC, cityD, cityE, cityF, cityG, cityH, cityI],
  });

  vm.generateObservationsScreen();

  expect(vm.pages).toBe(2);
  expect(vm.page).toBe(1);
  expect(vm.paginateStationsByCount).toStrictEqual(vm.observations.slice(0, 7));
  done();
});

test("generateAreas: skips if not grouping by area", (done) => {
  vm.generateAreas();
  expect(vm.areaCodes.size).toBe(0);
  done();
});

test("generateAreas: generates area codes correctly", async (done) => {
  await wrapper.setProps({
    observations: [cityB, cityA, cityC, cityD, cityE, cityF, cityG, cityH, cityI, cityJ, cityK, cityL, cityM],
    groupByArea: true,
  });

  vm.generateAreas();

  const areas = ["mb/on", "east", "west"];
  expect(vm.areaCodes.size).toBe(3);
  areas.forEach((area) => expect(vm.areaCodes.has(area)).toBe(true));
  done();
});

test("generateAreas: groups the stations by area correctly", async (done) => {
  await wrapper.setProps({
    observations: [cityB, cityA, cityC, cityD, cityE, cityN, cityF, cityG, cityH, cityI, cityJ, cityK, cityL, cityM],
    groupByArea: true,
  });

  vm.generateAreas();

  const areas = ["mb/on", "east", "west"];
  areas.forEach((area) => {
    expect(vm.areas[area]).toBeTruthy();
    expect(vm.areas[area].stations.length).toBeGreaterThanOrEqual(4);
  });
  done();
});

test("paginateStationsByArea: paginates correctly", async (done) => {
  await wrapper.setProps({
    observations: [cityB, cityA, cityC, cityD, cityE, cityF, cityG, cityH, cityI, cityJ, cityK, cityL, cityM],
    groupByArea: true,
  });

  vm.generateAreas();
  vm.generateObservationsScreen();

  const areas = ["mb/on", "east", "west"];
  expect(vm.pages).toBe(areas.length);
  expect(vm.page).toBe(1);
  expect(vm.paginateStationsByArea).toStrictEqual(vm.observations.filter((s) => s.area === "mb/on"));
  done();
});

test("changePage: skips the page if less than 2 stations are present", async (done) => {
  await wrapper.setProps({
    observations: [cityB],
  });

  const spy = jest.spyOn(vm, "changePage");
  vm.generateObservationsScreen();
  expect(spy).toHaveBeenCalledTimes(2);
  done();
});

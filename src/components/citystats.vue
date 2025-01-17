<template>
  <div id="city_stats">
    <div v-if="cityStatsUnavailable">Stats temporarily unavailable</div>
    <div v-else>
      <div id="title" v-html="titleString"></div>
      <div id="rise_set">{{ sunriseset }}</div>
      <div id="precip_title">&nbsp;&nbsp;&nbsp;&nbsp;{{ precipTitle }}</div>
      <div id="precip_actual" v-html="precipActual"></div>
      <div id="precip_normal" v-html="precipNormal"></div>
      <div id="hot_cold_title" v-html="hotColdTitleString"></div>
      <div id="hot_spot" v-html="hotSpotString"></div>
      <div id="cold_spot" v-html="coldSpotString"></div>
    </div>
  </div>
</template>

<script>
const PRECIP_STRING_WITH_DATA_LENGTH = 28;

// max length the hot/cold spot info can be including dots and temp
const HOT_COLD_SPOT_CITY_PROV_PAD_TEMP_LENGTH = 30;

// max length for the province with comma, at least two dots, and temp
const HOT_COLD_SPOT_PROV_PAD_TEMP_LENGTH = 8;

// taking away room for the `, PV .. TMP` gives us how long the city name can be
const HOT_COLD_SPOT_CITY_MAX_LENGTH = HOT_COLD_SPOT_CITY_PROV_PAD_TEMP_LENGTH - HOT_COLD_SPOT_PROV_PAD_TEMP_LENGTH - 2;

import { mapGetters } from "vuex";
import { parseISO, format } from "date-fns";
import stringpadmixin from "../mixins/stringpad.mixin";
import observedmixin from "../mixins/observed.mixin";
// import { EventBus } from "../js/EventBus";

export default {
  name: "city-stats",
  mixins: [stringpadmixin, observedmixin],
  props: {
    seasonPrecip: {
      type: Object,
      default: () => {
        return { precip: {}, isWinter: false };
      },
    },
    isWinter: Boolean,
  },

  computed: {
    ...mapGetters(["ecCity", "ecObservedAtStation", "ecSunriseSet", "ecHotColdSpotsCanada"]),

    cityStatsUnavailable() {
      return !this.ecCity || !this.ecObservedAtStation;
    },

    currentDate() {
      return this.formatObservedMonthDate(this.ecObservedAtStation, true);
    },

    sunriseset() {
      const riseSet = this.ecSunriseSet;
      if (!riseSet) return "";

      const { rise } = riseSet;
      const { set } = riseSet;

      const riseTime = parseISO(rise.time);
      const setTime = parseISO(set.time);

      const riseTimeFormatted = format(riseTime, "h:mm 'AM'");
      const setTimeFormatted = format(setTime, "h:mm 'PM'");

      return `Sunrise..${riseTimeFormatted} Sunset..${setTimeFormatted}`;
    },

    titleString() {
      return `&nbsp;&nbsp;${this.ecCity} Statistics - ${this.currentDate}`;
    },

    hotColdTitleString() {
      return `Canadian Hot/Cold Spot - ${this.currentDate}`;
    },

    hotSpotCity() {
      return (this.ecHotColdSpotsCanada?.hot?.city || "N/A").slice(0, HOT_COLD_SPOT_CITY_MAX_LENGTH);
    },

    hotSpotProvince() {
      return this.ecHotColdSpotsCanada?.hot?.province || "N/A";
    },

    hotSpotTemp() {
      const temp = this.ecHotColdSpotsCanada?.hot?.temp;
      const tempString = !isNaN(temp) ? Math.round(temp) : "N/A";
      return this.padString(`${tempString}`, 3, true);
    },

    hotSpotEllipsis() {
      const usedSpace = this.hotSpotCity.length + HOT_COLD_SPOT_PROV_PAD_TEMP_LENGTH;
      return this.padString("..", HOT_COLD_SPOT_CITY_PROV_PAD_TEMP_LENGTH - usedSpace, false, ".");
    },

    hotSpotString() {
      return `&nbsp;${this.hotSpotCity},&nbsp;${this.hotSpotProvince}&nbsp;${this.hotSpotEllipsis}${this.hotSpotTemp}`;
    },

    coldSpotCity() {
      return (this.ecHotColdSpotsCanada?.cold?.city || "N/A").slice(0, HOT_COLD_SPOT_CITY_MAX_LENGTH);
    },

    coldSpotProvince() {
      return this.ecHotColdSpotsCanada?.cold?.province || "N/A";
    },

    coldSpotTemp() {
      const temp = this.ecHotColdSpotsCanada?.cold?.temp;
      const tempString = !isNaN(temp) ? Math.round(temp) : "N/A";
      return this.padString(`${tempString}`, 3, true);
    },

    coldSpotEllipsis() {
      const usedSpace = this.coldSpotCity.length + HOT_COLD_SPOT_PROV_PAD_TEMP_LENGTH;
      return this.padString("..", HOT_COLD_SPOT_CITY_PROV_PAD_TEMP_LENGTH - usedSpace, false, ".");
    },

    coldSpotString() {
      return `&nbsp;${this.coldSpotCity},&nbsp;${this.coldSpotProvince}&nbsp;${this.coldSpotEllipsis}${this.coldSpotTemp}`;
    },

    precipTitle() {
      // if its winter it should be "snowfall" but alas we don't get that info anymore
      return `Total ${this.isWinter ? "Precipitation" : "Precipitation"} Since`;
    },

    precipActual() {
      const totalPrecip = `${this.padString(this.seasonPrecip?.totalPrecip || 0, 5, true)} MM`;
      const dateString = `${this.isWinter ? `October` : `April`} 1st`;

      // how many dots we need here (8 is the total precip (which is always 5) + space + MM)
      const padLength = PRECIP_STRING_WITH_DATA_LENGTH - 8 - dateString.length;

      // actual string to return
      return `&nbsp;&nbsp;${dateString}&nbsp;${this.padString(".", padLength, false, ".")}${totalPrecip}`;
    },

    precipNormal() {
      const normalPrecip = `${this.padString(this.seasonPrecip?.normalPrecip || 0, 5, true)} MM`;
      const dateString = `Normal`;

      // how many dots we need here (8 is the total precip (which is always 5) + space + MM)
      const padLength = PRECIP_STRING_WITH_DATA_LENGTH - 8 - dateString.length;

      // actual string to return
      return `&nbsp;&nbsp;${dateString}&nbsp;${this.padString(".", padLength, false, ".")}${normalPrecip}`;
    },
  },

  methods: {
    pad(val) {
      return val < 10 ? `0${val}` : val;
    },
  },
};
</script>

<style lang="scss" scoped>
#city_stats {
  align-items: center;
  display: flex;
  flex-direction: column;
}
</style>
